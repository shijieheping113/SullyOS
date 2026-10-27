/**
 * 陪看的三个引擎：台上主播、台下角色、后台总结。
 *
 * 这一层只做「组织材料 → 调模型 → 把回复切成干净的结构」。
 * 不碰界面、不碰存档、不往主聊天写任何东西。
 */

import { buildChatRequestPayload } from '../chatRequestPayload';
import { clampManualContextLimit } from '../chatContextRange';
import { resolveDialogueApi } from '../characterApi';
import { callMainStreamerLlm } from '../liveStreamAiHelpers';
import { isSecondaryLlmReady } from '../secondaryLlmApi';
import { secondaryLlmCall } from '../secondaryLlmCall';
import type {
  APIConfig,
  CharacterProfile,
  DialogueApiConfig,
  Emoji,
  EmojiCategory,
  Message,
  UserProfile,
} from '../../types';
import {
  ACCOUNT_NAME_RULES,
  DIGEST_RULES,
  RECAP_RULES,
  ROOM_POOL_RULES,
  STAGE_RULES,
  TASTE_RULES,
  TRANSLATE_RULES,
  buildAccountNameTask,
  buildCharRules,
  buildCharStateBlock,
  buildDigestTask,
  buildRecapTask,
  buildRoomPoolTask,
  buildSessionTurns,
  buildStageCounterTask,
  buildStageTask,
  buildTasteTask,
  buildTranslateTask,
} from './prompts';
import type {
  WatchAlongSession,
  WatchBeat,
  WatchClip,
  WatchDanmaku,
  WatchModelSlot,
  WatchPublicAction,
  WatchRoomCard,
  WatchSeqItem,
  WatchStreamerLanguage,
  WatchStreamerProfile,
  WatchStreamerScreenForm,
  WatchStreamerTier,
} from './types';
import { watchId } from './types';
import { washCoverSvg } from './coverSvg';

// ==================== 输出形状 ====================

/** 台上这一幕 */
export interface StageOutput {
  scene: string;
  speech: string;
  /** 这一段直播的条目：画面和话交替，屏幕上一条一条放 */
  seq: WatchSeqItem[];
  danmaku: WatchDanmaku[];
  hot: boolean;
}

/** 角色这一轮的决定 */
export interface CharChatLine {
  text: string;
  sticker: string;
  voice: boolean;
}

export interface CharOutput {
  chat: CharChatLine[];
  public: WatchPublicAction[];
  /** 对未处理的转账：收下 / 退回；没这回事就是 null */
  transfer: 'accept' | 'return' | null;
  why: string;
  /** 角色有没有真的去公屏搞事（决定画面跳不跳） */
  wentPublic: boolean;
}

// ==================== 解析（宽松，不认格式也能接住）====================

/**
 * 以前要求模型回 JSON，结果它十次有八次写坏（多一个逗号、少一个引号、外面裹一段话）。
 * 现在改成「一行一条、用名字起头」：模型本来就这么说话，写不错；
 * 认不出来也不报错，剩下的行当正文兜底——宁可少两样，不能整幕丢掉。
 */

/** 去掉思考段、代码块、行首的项目符号 */
const stripNoise = (raw: string): string =>
  (raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[a-zA-Z]*\s?/g, '')
    .replace(/```/g, '')
    .trim();

/** 语音/情绪标注会被模型顺手写进正文（<语音>、[语音]、<v:开心>），显示前统一剥掉 */
const VOICE_MARKUP = /<\s*\/?\s*[^<>\s]{1,8}\s*>|\[(?:语音|voice)[^\]]*\]|【(?:语音|voice)】|（(?:语音|voice)）/gi;

export const stripVoiceMarkup = (raw: string): string =>
  (raw || '')
    .replace(VOICE_MARKUP, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * 模型会把整段话挤成一行：只有一个「画：」标签，后面「话」「弹幕」全部内联在同一行里。
 * 2026-10-26 Ann 实测：出现这种情况时整段被当成一条巨型画面，屏幕上显示不全，弹幕一条都没有。
 *
 * 这里在切行之前先把行内的结构标签顶到行首。左边的字符必须是空白或句读——
 * 这样「动画：」「他的话：」这种正文里的冒号不会被切坏。
 */
const STRUCT_LABELS = [
  '画面', '画', '镜头', '场景', '实况', '视觉', '表演', '动作',
  '台词', '话', '弹幕', '公屏', '网友', '观众', '评论', '点名', '高能', '高光', '热点',
];

const INLINE_LABEL_SPLIT = new RegExp(
  `([\\s\\u3000，,。.；;！!？?、｜|…~～」』】）)])(?=(?:【)?(?:${STRUCT_LABELS.join('|')})(?:】)?\\s*[：:])`,
  'g',
);

const explodeInlineLabels = (text: string): string =>
  (text || '')
    // 模型偶尔把换行写成字面量 \n，症状跟挤成一团一模一样
    .replace(/\\n/g, '\n')
    // markdown 加粗会把标签包起来：**画：**xxx
    .replace(/\*\*/g, '')
    .replace(INLINE_LABEL_SPLIT, '$1\n');

interface LabelLine {
  /** 认出来的标签（画面、台词…）；没认出来就是空串 */
  label: string;
  value: string;
}

function labelLines(raw: string): LabelLine[] {
  const out: LabelLine[] = [];
  stripNoise(explodeInlineLabels(raw))
    .split(/\r?\n/)
    .forEach(rawLine => {
      const line = rawLine
        .replace(/^[\s>*#\-•·]+/, '')
        .replace(/^\d+[.、)]\s*/, '')
        .trim();
      if (!line) return;
      const m = line.match(/^(?:【)?([^：:]{1,8}?)(?:】)?\s*[：:]\s*([\s\S]*)$/);
      if (m) out.push({ label: m[1].replace(/[【】\[\]\s*`]/g, ''), value: m[2].trim() });
      else out.push({ label: '', value: line });
    });
  return out;
}

/**
 * 「弹幕：」写在上一行、内容另起几行——模型很爱这么写。
 * 空值的标签要把它后面连续的行吸成自己的内容，否则那几行全被扔掉（且不报错）。
 * 注意「小明：哈哈哈」本身会被认成一个叫「小明」的标签，所以这里只认白名单里的标签才算真标签。
 */
const KNOWN_LABELS = [
  ...STRUCT_LABELS,
  '私聊', '说', '聊', '回', '表情', '打赏', '礼物', '投喂', '刷个',
  '上麦', '麦上', '下麦', '转账', '安静', '理由', '动作',
];

const isKnownLabel = (label: string): boolean =>
  Boolean(label) && KNOWN_LABELS.some(k => label === k || label.includes(k));

function absorbContinuation(lines: LabelLine[], max = 10): LabelLine[] {
  const out: LabelLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = { ...lines[i] };
    if (cur.label && !cur.value) {
      const buf: string[] = [];
      while (i + 1 < lines.length && !isKnownLabel(lines[i + 1].label) && buf.length < max) {
        const next = lines[++i];
        buf.push(next.label ? `${next.label}：${next.value}` : next.value);
      }
      cur.value = buf.join('\n');
    }
    out.push(cur);
  }
  return out;
}

/** 标签里含任意关键词就算，取全部命中的值 */
const valuesOf = (lines: LabelLine[], keys: string[]): string[] =>
  lines.filter(l => l.label && keys.some(k => l.label.includes(k))).map(l => l.value).filter(Boolean);

const firstOf = (lines: LabelLine[], keys: string[]): string => valuesOf(lines, keys)[0] || '';

/** 标签完全等于其中之一 */
const exactValues = (lines: LabelLine[], labels: string[]): string[] =>
  lines.filter(l => labels.includes(l.label)).map(l => l.value);

const exactHas = (lines: LabelLine[], labels: string[]): boolean =>
  lines.some(l => labels.includes(l.label));

const DANMAKU_KEYS = ['公屏', '弹幕', '网友', '观众', '评论'];

/**
 * 双语分隔符：主播说日语或英语时，「话」写成「原话 ▸ 中文同传」，弹幕写成「作者｜原话 ▸ 中文译文」。
 * STAGE_RULES 里写的就是这个记号。挑 ▸ 是因为模型自己几乎不会顺手打出来。
 */
const BILINGUAL_SEP = '▸';

/** 把「原话 ▸ 译文」拆成两半；没有分隔符就整条当原话 */
const splitBilingual = (raw: string): { text: string; translated?: string } => {
  const s = (raw || '').trim();
  const at = s.indexOf(BILINGUAL_SEP);
  if (at < 0) return { text: s };
  const left = s.slice(0, at).trim();
  const right = s.slice(at + 1).trim();
  if (!left) return { text: right || left };
  return right ? { text: left, translated: right } : { text: left };
};

/** 日语假名字符：平假名 U+3040–U+309F，片假名 U+30A0–U+30FF */
const KANA_CHAR = /[\u3040-\u309F\u30A0-\u30FF]/g;
/** 连续英文字母算一个英文词 */
const LATIN_WORD = /[A-Za-z]+/g;
const SCENE_KANA_MAX = 8;
const SCENE_LATIN_WORDS_MAX = 4;

/**
 * 画面旁白必须是中文，代码这里兜一层。
 * 2026-10-26 实测：日语直播间里画面飘成「ルーレットの盤が回り続けて…皮套の表情が固まる」，
 * 中英日混排，观众看不懂的画面等于没有画面。
 * 中文画面里偶尔夹一个 Live2D / FPS / C4 是正常的，所以只看密度，不按单个字符一刀切。
 */
const looksForeignScene = (text: string): boolean =>
  (text.match(KANA_CHAR) || []).length > SCENE_KANA_MAX ||
  (text.match(LATIN_WORD) || []).length > SCENE_LATIN_WORDS_MAX;

/**
 * 把「画 / 话」交替的行按出现顺序收成一串。
 *
 * 一段直播的节奏是「手上做一件事 → 说一句 → 再做事 → 再说」，所以这里**只看先后**、不分组。
 * 模型偶尔还是照老习惯写「一整块画面 + 一整块台词」，那出来就是两条（一条画、一条话），也不会坏。
 * 只有「话」没有「画」的一段照样收下：画面只在内容真有进展时才写，不逼它凑动作。
 */
function stageSeqOf(lines: LabelLine[]): WatchSeqItem[] {
  const out: WatchSeqItem[] = [];
  for (const l of lines) {
    if (!l.label) continue;
    if (DANMAKU_KEYS.some(k => l.label.includes(k))) continue;
    if (/点名|高能|高光|热点|hot/i.test(l.label)) continue;
    const text = l.value.trim();
    if (!text) continue;
    if (/画|镜头|场景|实况|视觉|动作|表演/.test(l.label)) {
      // 画面旁白一律中文，不做双语：这里不拆译文。
      // 模型不听话写成外语（假名或英文过多）时整条丢掉，宁可不显示，也不给观众看不懂的画面。
      if (looksForeignScene(text)) continue;
      out.push({ kind: 'scene', text });
    } else if (/话|台词|说|开口|喊|唱|聊/.test(l.label)) {
      const { text: line, translated } = splitBilingual(text);
      if (line) out.push({ kind: 'line', text: line, translated });
    }
  }
  return out;
}

/**
 * 一条「画/话」在屏幕上要看得全。
 * 2026-10-26 Ann 实测：一条塞两百字就被容器截掉，后半截根本看不到。
 * 所以按句切开，一条一条点着看——切完拼回去必须还是原来那段话。
 *
 * 2026-10-26 批次二下半截：原来画面 80 / 台词 60，日语长句会被腰斩，放宽到都 120。
 */
const SCENE_MAX = 120;
const LINE_MAX = 120;
const PIECE_MIN = 12;

function splitLong(text: string, max: number, seps: string[]): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  let guard = 0;
  while (rest.length > max && guard++ < 16) {
    const win = rest.slice(0, max);
    let idx = -1;
    for (const s of seps) idx = Math.max(idx, win.lastIndexOf(s));
    // 附近找不到句末标点就硬切，别为了凑整句把一条拖到屏幕上放不下
    const cut = idx >= PIECE_MIN ? idx + 1 : max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  if (out.length > 1 && out[out.length - 1].length < PIECE_MIN) {
    const tail = out.pop() as string;
    out[out.length - 1] = `${out[out.length - 1]}${tail}`;
  }
  return out.filter(Boolean);
}

/**
 * 把「原话 ▸ 译文」里的译文按原话被切开的位置一起切开，每一片都带得上。
 *
 * 2026-10-26 深夜修的真 bug：一条长台词被按句切成几片时，译文原来只挂在第一片
 * （`i === 0 ? item.translated : undefined`），日语房间点到第二片就只剩日语、没有中文。
 * 现在按每片在原话里的位置比例，把译文也切到对应的位置（尽量落在句末标点上）；
 * 切不动（译文太短、切出空片）时整段译文挂在每一片上，宁可重复，不许没有。
 */
const splitTranslation = (translated: string, text: string, pieces: string[]): string[] => {
  const t = (translated || '').trim();
  if (!t) return pieces.map(() => '');
  if (pieces.length <= 1 || t.length < pieces.length) return pieces.map(() => t);
  const seps = ['。', '！', '？', '…', '；', '，'];
  const total = Math.max(1, text.length);
  const out: string[] = [];
  let start = 0;
  let consumed = 0;
  for (let i = 0; i < pieces.length - 1; i++) {
    consumed += pieces[i].length;
    const room = pieces.length - 1 - i; // 后面还剩几片，每片至少留一个字
    let cut = Math.round((consumed / total) * t.length);
    cut = Math.max(start + 1, Math.min(t.length - room, cut));
    // 往前找最近的句读，切在句末更像人话；找不到就用比例位置硬切
    for (let k = cut; k > Math.max(start + 1, cut - 10); k--) {
      if (seps.includes(t[k - 1])) {
        cut = k;
        break;
      }
    }
    out.push(t.slice(start, cut).trim());
    start = cut;
  }
  out.push(t.slice(start).trim());
  // 有任何一片切空就退回「整段挂在每一片」
  if (out.some(p => !p)) return pieces.map(() => t);
  return out;
};

const splitSeqItem = (item: WatchSeqItem): WatchSeqItem[] => {
  const max = item.kind === 'scene' ? SCENE_MAX : LINE_MAX;
  // 台词只在句末切：在逗号上切会把一句完整的话切成两口，念出来就断气了
  const seps = item.kind === 'scene' ? ['。', '！', '？', '…', '；'] : ['。', '！', '？', '…'];
  const pieces = splitLong(item.text, max, seps);
  // 画面不做双语，只有台词要带译文；译文跟着原话一起切开，每一片都带得上
  const translated =
    item.kind === 'line' && item.translated
      ? splitTranslation(item.translated, item.text, pieces)
      : undefined;
  return pieces.map((text, i) => ({
    kind: item.kind,
    text,
    translated: translated ? translated[i] || undefined : undefined,
  }));
};

/** 一段话里带引号：引号内当台词，引号外当画面。比整段塞进台词里让主播念旁白强 */
const QUOTED = /[「『“]([^」』”]{1,200})[」』”]/g;

function splitByQuotes(text: string): WatchSeqItem[] {
  const out: WatchSeqItem[] = [];
  let last = 0;
  for (const m of text.matchAll(QUOTED)) {
    const before = text.slice(last, m.index ?? 0).trim();
    if (before) out.push({ kind: 'scene', text: before });
    if (m[1].trim()) out.push({ kind: 'line', text: m[1].trim() });
    last = (m.index ?? 0) + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) out.push({ kind: 'scene', text: tail });
  return out;
}

/** 模型偶尔还是照老习惯写 JSON：能读出来就读，读不出来当没这回事 */function tryJson(raw: string): any | null {
  const clean = stripNoise(raw);
  const from = clean.indexOf('{');
  const to = clean.lastIndexOf('}');
  if (from < 0 || to <= from) return null;
  try {
    return JSON.parse(clean.slice(from, to + 1));
  } catch {
    return null;
  }
}

/**
 * 昵称判据要偏严：认错一个昵称，前半句内容直接没了；认不出昵称的整行也不再收下。
 * 2026-10-26 实测过的坏样本：`他刚才那句真的绝了：哈哈哈哈哈` —— 原来会把前半句当昵称吃掉，
 * 剩下的整句再兜底成「路人」搬上公屏。现在这种整行直接丢掉。
 *
 * 前面那截是按字判（作者名里带这些字就不像人名）；后面 `^(?:作者|Names|name|作者名|昵称)$`
 * 是**整名精确匹配**，只有整个作者名恰好等于其中一个才算，别用包含判断，否则「作者阿明」这种真昵称会被误伤。
 */
const DM_AUTHOR = /^\s*([^\s：:，,。.！!？?、；;｜|「」『』"']{1,8})\s*[：:｜|]\s*([\s\S]+)$/;
const DM_BAD_NAME = /[的是了吗呢吧啊嘛哦呀哈]|^[我你他她这那]|^(?:作者|Names|name|作者名|昵称)$/i;

/** 真弹幕没那么长；超过这个长度就是模型把正文挤进了这一行 */
const DM_TEXT_MAX = 60;

/**
 * 模型把自己的思考、说明、条数统计当成弹幕吐出来（2026-10-26 实测事故：
 * 公屏上出现「Hmm 弹幕需要反映投票结果。Let me」这种行），命中任一个就整条丢。
 */
const DM_SELF_TALK = /Let me|Hmm|wait|弹幕需要|需要反映|前两条|后面是|投票结果|我这就写|先写|接下来写|这一条是|这里应该|根据上面|按照要求|Original in|no English|原话中文译文|中文译文|译文如下|Names|格式应该|should be|以下格式|输出格式/i;

/** 空格或标点后面紧跟「1~8 字 + 冒号」，认为是一条新弹幕 */
const DM_BOUNDARY = /([\s，,。.！!？?])(?=[^\s：:，,。.！!？?、；;｜|]{1,8}\s*[：:｜|])/g;

const splitDanmakuChunks = (v: string): string[] =>
  v
    .replace(DM_BOUNDARY, '$1\u0000')
    .split(/[；;\n\u0000]+/)
    .map(s => s.replace(/^[-–—\s]+/, '').trim())
    .filter(Boolean);

/**
 * 「昵称：内容」「昵称｜内容」都认；认不出昵称的整行默认丢掉（不能把模型的话搬上公屏）。
 *
 * fallbackAuthor 只有角色自己发公屏那一路才传：角色的提示词本来就写「公屏：一句话」，不带作者名，
 * 认不出作者就用它兜底收下，不然角色在公屏说的话全没了。兜底名只用来让内容过得去，
 * 所以**不拿 DM_BAD_NAME 去判它**。超长和自我说明这两道过滤对兜底收下的行照样生效。
 */
function parseDanmaku(values: string[], fallbackAuthor?: string): WatchDanmaku[] {
  const out: WatchDanmaku[] = [];
  values.forEach(v => {
    splitDanmakuChunks(v).forEach(c => {
      if (!c) return;
      const m = c.match(DM_AUTHOR);
      // 模型自己写的作者名：认不出（没匹配上，或匹配上但名字是坏名字）才谈得上兜底
      const authorOk = Boolean(m) && !DM_BAD_NAME.test(m![1]);
      if (!authorOk && !fallbackAuthor) return;
      const author = authorOk ? m![1].trim() : fallbackAuthor!;
      const body = authorOk ? m![2] : c;
      // 外语弹幕写成「原话 ▸ 中文译文」，这里拆成原文与译文
      const { text, translated } = splitBilingual(body.trim());
      if (!text) return;
      if (text.length > DM_TEXT_MAX) return;
      if (DM_SELF_TALK.test(text)) return;
      if (translated && DM_SELF_TALK.test(translated)) return;
      out.push({
        id: watchId('dm'),
        author,
        text,
        translated,
      });
    });
  });
  return out
    .filter(d => d.text)
    .filter((d, i, a) => a.findIndex(x => x.author === d.author && x.text === d.text) === i)
    .slice(0, 8);
}

function toStageOutput(raw: string): StageOutput {
  const asJson = tryJson(raw);
  if (asJson && (asJson.scene || asJson.speech || Array.isArray(asJson.seq))) {
    const list: any[] = Array.isArray(asJson.danmaku) ? asJson.danmaku : [];
    const seq: WatchSeqItem[] = Array.isArray(asJson.seq)
      ? asJson.seq
          .map((s: any) => ({
            kind: s?.kind === 'line' ? ('line' as const) : ('scene' as const),
            text: String(s?.text || '').trim(),
            translated: s?.translated ? String(s.translated).trim() : undefined,
          }))
          .filter((s: WatchSeqItem) => s.text)
      : [
          ...(asJson.scene ? [{ kind: 'scene' as const, text: String(asJson.scene) }] : []),
          ...(asJson.speech
            ? [{
                kind: 'line' as const,
                text: String(asJson.speech),
                translated: asJson.speechTranslated ? String(asJson.speechTranslated) : undefined,
              }]
            : []),
        ];
    return {
      scene: String(asJson.scene || ''),
      speech: String(asJson.speech || ''),
      seq,
      danmaku: parseDanmaku(
        list.map((d: any) =>
          typeof d === 'string'
            ? d
            : `${d?.author || '观众'}｜${d?.text || ''}${d?.translated ? ` ${BILINGUAL_SEP} ${d.translated}` : ''}`,
        ),
      ),
      hot: asJson.hot === true,
    };
  }

  const lines = absorbContinuation(labelLines(raw));
  const rawSeq = stageSeqOf(lines);
  if (rawSeq.length) {
    const danmaku = parseDanmaku(valuesOf(lines, DANMAKU_KEYS));

    // 3 到 10 段，切完最多十几条；再多就是模型写飞了。
    // 这里只是防止写飞的安全兜底，不按「十段」截断——多出来的照旧留着。
    // 注意：这里不抛错、不重问。模型的每一次调用都要花用户的钱，
    // 格式坏了只能就地切碎收拾，绝不能偷偷再问一遍。
    const seq = rawSeq.flatMap(splitSeqItem).slice(0, 16);
    const scene = seq.filter(s => s.kind === 'scene').map(s => s.text).join('\n');
    const speech = seq.filter(s => s.kind === 'line').map(s => s.text).join('\n');
    const hotRaw = firstOf(lines, ['点名', '高能', '高光', '热点', 'hot']);

    return { scene, speech, seq, danmaku, hot: /^(是|对|有|yes|true|1)/i.test(hotRaw || '') };
  }

  const danmaku = parseDanmaku(valuesOf(lines, DANMAKU_KEYS));

  // 一行标签都没认出来：先看引号把话说和画面分开，实在没有就整段当画面。
  // 不要整段塞进台词——观众会看到主播在念旁白。
  const plain = lines.map(l => l.value).join('\n').trim();
  if (!plain) throw new Error('模型这次一个字都没回');
  const byQuote = splitByQuotes(plain);
  const seq = (byQuote.length > 1
    ? byQuote
    : [{ kind: 'scene' as const, text: plain.slice(0, 150) }]
  ).flatMap(splitSeqItem);
  return {
    scene: seq.filter(s => s.kind === 'scene').map(s => s.text).join('\n'),
    speech: seq.filter(s => s.kind === 'line').map(s => s.text).join('\n'),
    seq,
    danmaku,
    hot: false,
  };
}

function toCharOutput(raw: string): CharOutput {
  const asJson = tryJson(raw);
  if (asJson && (Array.isArray(asJson.chat) || Array.isArray(asJson.public))) {
    const chat: CharChatLine[] = (Array.isArray(asJson.chat) ? asJson.chat : []).slice(0, 3).map((c: any) => ({
      text: stripVoiceMarkup(String(c?.text || '')),
      sticker: stripVoiceMarkup(String(c?.sticker || '')),
      voice: c?.voice === true,
    }));
    const publicActions: WatchPublicAction[] = (Array.isArray(asJson.public) ? asJson.public : [])
      .slice(0, 4)
      .map((a: any) => ({
        id: watchId('act'),
        kind: (['danmaku', 'gift', 'mic_on', 'mic_line', 'mic_off'].includes(a?.kind)
          ? a.kind
          : 'danmaku') as WatchPublicAction['kind'],
        text: a?.text ? String(a.text) : undefined,
        giftName: a?.giftName ? String(a.giftName) : undefined,
        giftAmount: typeof a?.giftAmount === 'number' ? a.giftAmount : undefined,
      }))
      .filter((a: WatchPublicAction) => a.kind !== 'danmaku' || Boolean(a.text));
    const t = String(asJson.transfer || '').toLowerCase();
    const transfer: CharOutput['transfer'] =
      t === 'accept' ? 'accept' : t === 'return' ? 'return' : null;
    if (chat.length || publicActions.length || transfer) {
      return {
        chat: chat.filter(c => c.text || c.sticker),
        public: publicActions,
        transfer,
        why: String(asJson.why || ''),
        wentPublic: publicActions.length > 0,
      };
    }
  }

  const lines = absorbContinuation(labelLines(raw));

  const chat: CharChatLine[] = valuesOf(lines, ['私聊', '说', '聊', '回'])
    .map(text => ({ text: stripVoiceMarkup(text), sticker: '', voice: false }))
    .filter(c => c.text)
    .slice(0, 3);

  // 表情单独成一条（只发表情不发字）
  valuesOf(lines, ['表情']).forEach(name => {
    const clean = stripVoiceMarkup(name.replace(/[「」【】"']/g, '')).trim();
    if (clean) chat.push({ text: '', sticker: clean, voice: false });
  });

  const publicActions: WatchPublicAction[] = [];
  // 角色这一路只传兜底作者名：角色的公屏本来就不带作者，这里收下内容，作者名后面不用
  parseDanmaku(valuesOf(lines, DANMAKU_KEYS), '我').forEach(d => {
    publicActions.push({ id: watchId('act'), kind: 'danmaku', text: d.text });
  });

  // 打赏：礼物名 + 数字
  valuesOf(lines, ['打赏', '礼物', '刷个', '投喂']).forEach(v => {
    const m = v.match(/^(.*?)[\s,，]*(\d+)?\s*(元|个|块)?$/);
    const name = (m?.[1] || v).replace(/[「」【】"']/g, '').trim();
    if (name) {
      publicActions.push({
        id: watchId('act'),
        kind: 'gift',
        giftName: name.slice(0, 10),
        giftAmount: m?.[2] ? Math.min(999, Number(m[2])) : 1,
      });
    }
  });

  if (exactHas(lines, ['上麦', '申请上麦'])) {
    publicActions.push({ id: watchId('act'), kind: 'mic_on' });
  }
  const micLine = stripVoiceMarkup(firstOf(lines, ['麦上', '连麦', '麦里']));
  if (micLine) {
    publicActions.push({ id: watchId('act'), kind: 'mic_line', text: micLine });
  }
  if (exactHas(lines, ['下麦', '挂麦'])) {
    publicActions.push({ id: watchId('act'), kind: 'mic_off' });
  }

  const transferRaw = firstOf(lines, ['转账', '收钱', '领钱']).toLowerCase();
  const transfer: CharOutput['transfer'] =
    /收|accept|接受/.test(transferRaw) ? 'accept' : /退|return|还/.test(transferRaw) ? 'return' : null;

  // 一个能认的标签都没有：说明它没照格式写，交给上层重问一遍
  if (!lines.some(l => l.label)) throw new Error('模型没按约好的格式回');

  const trimmed = publicActions.filter(a => a.kind !== 'danmaku' || Boolean(a.text)).slice(0, 4);

  return {
    chat: chat.slice(0, 4),
    public: trimmed,
    transfer,
    why: firstOf(lines, ['理由', '安静', '为什么']),
    wentPublic: trimmed.length > 0,
  };
}

// ==================== 调用 ====================

/** 槽填全了才有资格接管这一路生成 */
function slotReady(slot?: WatchModelSlot): slot is WatchModelSlot {
  return Boolean(slot?.enabled && slot.baseUrl.trim() && slot.apiKey.trim() && slot.model.trim());
}

/**
 * 按模型槽决定这一路走谁的接口。
 * 槽没开（或没填全）就用主模型；槽开了则整路换过去，两边互不影响。
 */
function routeApi(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  slot?: WatchModelSlot;
}): { apiConfig: APIConfig; char: CharacterProfile } {
  if (!slotReady(opts.slot)) return { apiConfig: opts.apiConfig, char: opts.char };
  const override: DialogueApiConfig = {
    baseUrl: opts.slot.baseUrl.trim(),
    apiKey: opts.slot.apiKey.trim(),
    model: opts.slot.model.trim(),
    temperature: opts.slot.temperature,
  };
  const merged = resolveDialogueApi(opts.apiConfig, opts.char, override);
  // 传下去的 char 必须摘掉自己的对话覆盖，否则 callMainStreamerLlm 内部会再叠一层，
  // 把这里指定的模型顶回去。
  return { apiConfig: merged, char: { ...opts.char, dialogueApi: undefined } };
}

async function callChatModel(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  slot?: WatchModelSlot;
  messages: Array<{ role: string; content: string }>;
  purpose: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const routed = routeApi(opts);
  return callMainStreamerLlm({
    apiConfig: routed.apiConfig,
    char: routed.char,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.95,
    purpose: opts.purpose,
    maxTokens: opts.maxTokens ?? 1200,
  });
}

/**
 * 要结构化结果的一次调用：解析不出来就把它自己写的那段端回去，硬要一遍格式。
 * 只重问一次，第二次还不行就把错抛给界面（界面会提示用户再点一次）。
 */
const EMPTY_REPLY = '模型这次一个字都没回（输出可能被截断了），再点一次试试';

async function callStructured<T>(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  slot?: WatchModelSlot;
  messages: Array<{ role: string; content: string }>;
  purpose: string;
  temperature?: number;
  maxTokens?: number;
  parse: (raw: string) => T;
  nudge: string;
}): Promise<T> {
  const first = await callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.slot,
    messages: opts.messages,
    purpose: opts.purpose,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  if (!first.trim()) throw new Error(EMPTY_REPLY);
  try {
    return opts.parse(first);
  } catch {
    /* 下面重问一遍 */
  }
  const second = await callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.slot,
    messages: [
      ...opts.messages,
      { role: 'assistant', content: first.slice(0, 1500) },
      { role: 'user', content: opts.nudge },
    ],
    purpose: `${opts.purpose}_retry`,
    temperature: 0.6,
    maxTokens: opts.maxTokens,
  });
  return opts.parse(second);
}

/** 后台总结走「设置里的辅助模型」；没配或抽了就退主模型，不让总结空着 */
async function callSummaryModel(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  messages: Array<{ role: string; content: string }>;
  purpose: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  if (isSecondaryLlmReady(opts.apiConfig.secondaryLlm)) {
    try {
      return await secondaryLlmCall({
        config: opts.apiConfig.secondaryLlm!,
        purpose: opts.purpose,
        messages: opts.messages,
        featureOpts: { temperature: opts.temperature ?? 0.95 },
        maxTokens: opts.maxTokens,
        charId: opts.char.id,
      });
    } catch {
      /* 辅助模型这一下没回，下面退主模型 */
    }
  }
  return callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    messages: opts.messages,
    purpose: opts.purpose,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
}

/** 台上：写新的一幕 */
export async function generateStageBeat(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
  /** 本轮台下送进来的最新互动（我的公屏动作、连麦发言等） */
  latest: string;
  /** 主播这一路用哪个模型；不传就走主模型 */
  model?: WatchModelSlot;
  /** 这一幕要几条公屏弹幕 */
  danmakuPerBeat?: number;
}): Promise<StageOutput> {
  const task = buildStageTask({
    session: opts.session,
    latest: opts.latest,
    micOn: opts.session.cast.mic === 'on',
    danmakuPerBeat: opts.danmakuPerBeat,
  });
  return callStructured({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.model,
    purpose: 'watch_along_stage',
    maxTokens: 8000,
    messages: [
      { role: 'system', content: STAGE_RULES },
      { role: 'user', content: task },
    ],
    parse: toStageOutput,
    nudge: `上一条挤成一段了，没照格式。这次一行只放一样，每行都以标签开头，行与行之间必须换行：
话：主播嘴里蹦出来的一句原话
话：再一句（可以连着两三句）
画：只在内容真有进展时写一条
弹幕：昵称｜他发的那条
弹幕：昵称｜他发的那条
点名：否`,
  });
}

/** 台上：对台下刚发生的动作当场接招（不换幕） */
export async function generateStageCounter(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
  actionText: string;
  micOn: boolean;
  model?: WatchModelSlot;
  danmakuPerBeat?: number;
}): Promise<StageOutput> {
  const raw = await callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.model,
    purpose: 'watch_along_counter',
    maxTokens: 8000,
    messages: [
      { role: 'system', content: STAGE_RULES },
      {
        role: 'user',
        content: buildStageCounterTask({
          session: opts.session,
          actionText: opts.actionText,
          micOn: opts.micOn,
          danmakuPerBeat: opts.danmakuPerBeat,
        }),
      },
    ],
  });
  try {
    return toStageOutput(raw);
  } catch {
    // 接招这一句不成功不值得再花一次钱，直接按「主播愣了下」收场
    return {
      scene: '主播愣了一下，画面停了停。',
      speech: '',
      seq: [{ kind: 'scene', text: '主播愣了一下，画面停了停。' }],
      danmaku: [],
      hot: false,
    };
  }
}

/**
 * 台下：角色这一轮怎么反应。
 * 走主聊天同一套统一构造器，只替换行为规范那一段，所以人设、世界书、历史、记忆召回都在。
 */
export async function runCharTurn(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  session: WatchAlongSession;
  /** 主聊天可见范围里的原文，由调用方取 */
  historyMessages: Message[];
  emojis: Emoji[];
  categories: EmojiCategory[];
  trigger: 'stage' | 'chat' | 'assign' | 'manual';
  stageLine?: string;
  userLine?: string;
  clip?: WatchClip;
  assign?: string;
  /** 角色这一路用哪个模型；不传就走主模型 */
  model?: WatchModelSlot;
}): Promise<CharOutput> {
  // 召回查询补一段当下的对话：不然它按「主聊天最近在聊什么」去翻记忆，
  // 翻出来全跟眼前这件事无关，听着就像记性坏了（Ann 2026-10-26）。
  const recallHint = [...opts.session.chat]
    .reverse()
    .filter(c => c.text && c.text.trim())
    .slice(0, 4)
    .map(c => c.text!.trim())
    .reverse()
    .join(' ');

  const payload = await buildChatRequestPayload({
    char: opts.char,
    userProfile: opts.userProfile,
    groups: [],
    emojis: opts.emojis,
    categories: opts.categories,
    historyMsgs: opts.historyMessages,
    contextLimit: clampManualContextLimit(opts.char.contextLimit),
    recallQueryHint: recallHint || undefined,
    // 'direct' 不带私聊专属引导与协同文件柜；也不传 realtimeConfig，所以没有天气/新闻/小红书。
    recallEntryPoint: 'direct',
    // 这里**不传 rules**。传 rules 会把「聊天 App 行为规范」整段拿掉——对话质量那一整块
    // （拒绝空话 / 让每句话只有你能说出来 / 情绪要有层次 / 像真正了解对方的人那样回应）跟着一起没了，
    // 角色当场变成谁都能说的客服腔。这是 2026-10-26 Ann 指出「说的话一点不像角色」的结构性原因。
    // 改成 appendRules：主聊天那套一个字不动，只在它后面补一段「你手上还开着个直播间」。
    appPrompt: {
      appendRules: buildCharRules({
        charName: opts.char.name,
        userName: opts.userProfile?.name || '对方',
      }),
      scene: '',
    },
    liveGenerator: true,
    stripImages: true,
  });

  const state = buildCharStateBlock({
    session: opts.session,
    trigger: opts.trigger,
    stageLine: opts.stageLine,
    userLine: opts.userLine,
    clip: opts.clip,
    assign: opts.assign,
    stickers: opts.emojis.map(e => e.name).slice(0, 60),
  });

  // 陪看私聊要作为真正的对话轮次出现，模型才记得住自己刚才是什么语气。
  // 只塞进状态块的一段文字里，它回着回着就漂成另一个人——Ann 说的「不像角色」。
  const turns = buildSessionTurns(opts.session);
  const messages: Array<{ role: string; content: string }> = payload.fullMessages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));
  if (turns.length) {
    const tail = turns[turns.length - 1];
    // 有些接口不接受连续两条 user：并进最后一条，别让请求被判非法
    if (tail.role === 'user') {
      messages.push(...turns.slice(0, -1));
      messages.push({ role: 'user', content: `${tail.content}\n\n${state}` });
    } else {
      messages.push(...turns);
      messages.push({ role: 'user', content: state });
    }
  } else {
    messages.push({ role: 'user', content: state });
  }

  return callStructured({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.model,
    messages,
    temperature: 0.9,
    purpose: 'watch_along_char',
    maxTokens: 8000,
    parse: toCharOutput,
    nudge: `上一条没照格式。这次一行只放一样，每行都以标签开头：
私聊：要说的话
公屏：想在直播间说的一句（不想就算了）
安静：什么都不想做的理由`,
  });
}

/**
 * 把一条消息从源语言译成目标语言，存进这条的 translation。
 * 源语言和目标语言用主聊天已经存的那一对；没传时仍走原来的翻译规则。
 */
export async function translateWatchText(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  text: string;
  sourceLang?: string;
  targetLang?: string;
}): Promise<string> {
  const sourceLang = (opts.sourceLang || '').trim();
  const targetLang = (opts.targetLang || '').trim();
  const directed = Boolean(sourceLang && targetLang);
  const system = directed
    ? `把给你的这句话从${sourceLang}译成${targetLang}。要求：\n1. 翻得像人话，保留原来的语气、口癖和骂人的劲儿，不要翻成书面语。\n2. 只输出译文本身，不要引号、不要解释、不要标注语言。`
    : TRANSLATE_RULES;
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_translate',
    temperature: 0.4,
    maxTokens: 8000,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: directed ? opts.text : buildTranslateTask(opts.text, opts.char.name),
      },
    ],
  });
  return raw.replace(/^["「『]|["」』]$/g, '').trim();
}

/** 后台：把攒够的那几幕压成一段摘要 */
export async function digestSessionBeats(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
  beats: WatchBeat[];
}): Promise<string> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_digest',
    temperature: 0.6,
    maxTokens: 8000,
    messages: [
      { role: 'system', content: DIGEST_RULES },
      { role: 'user', content: buildDigestTask(opts.session, opts.beats) },
    ],
  });
  return raw.trim();
}

/** 退房：写进主聊天的那段回顾正文 */
export async function buildSessionRecap(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
}): Promise<string> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_recap',
    temperature: 0.7,
    maxTokens: 8000,
    messages: [
      { role: 'system', content: RECAP_RULES },
      { role: 'user', content: buildRecapTask(opts.session) },
    ],
  });
  return raw.trim();
}

// ==================== 大厅：刷台 ====================

const GRADIENT_FALLBACK = [
  '#1b2430,#3a2a44',
  '#12232b,#20404a',
  '#2a1f2e,#3d2b3a',
  '#1d2420,#33301f',
  '#241d2c,#2c3346',
];

/** 一行一个房间：主播名 | handle | 分区 | 标题 | 玩法 | 人数 | 风格 | 两个色 */
function parseRoomLines(raw: string): WatchRoomCard[] {
  const lines = stripNoise(raw)
    .split(/\r?\n/)
    .map(l => l.replace(/^[\s>*#\-•·]+/, '').replace(/^\d+[.、)]\s*/, '').trim())
    .filter(l => l.includes('|') || l.includes('｜'));

  const rooms: WatchRoomCard[] = [];
  lines.forEach((line, idx) => {
    const cells = line
      .split(/[|｜]/)
      // 只清两端的空白和直双引号、单引号；方头括号【】是标题正文，原样保留
      .map(c => c.replace(/^[\s"']+|[\s"']+$/g, '').trim());
    if (cells.length < 3) return;
    const [name, handle, category, title, bio, viewers, tag, colors] = cells;
    if (!name) return;

    const colorText = (colors || '').match(/#[0-9a-fA-F]{6}/g) || [];
    const countMatch = (viewers || '').replace(/[,，\s]/g, '').match(/(\d+\.?\d*)(万|k|K)?/);
    const viewerCount = countMatch
      ? Math.round(Number(countMatch[1]) * (countMatch[2] === '万' ? 10000 : countMatch[2] ? 1000 : 1))
      : 320 + idx * 137;

    rooms.push({
      id: watchId('room'),
      streamerName: name.slice(0, 20),
      streamerHandle: handle || `@${name.slice(0, 12).toLowerCase()}`,
      category: category || '闲聊',
      title: (title || bio || '随便播点什么').slice(0, 100),
      bio: (bio || '').slice(0, 200),
      viewerCount: viewerCount > 0 ? viewerCount : 320 + idx * 137,
      customRule: '',
      styleTag: (tag || '').slice(0, 6),
      coverGradient:
        colorText.length >= 2
          ? `${colorText[0]},${colorText[1]}`
          : GRADIENT_FALLBACK[idx % GRADIENT_FALLBACK.length],
    });
  });
  return rooms;
}

const roomStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

const LANG_VALUES = ['zh', 'ja', 'en', 'other'];
const FORM_VALUES = ['game', 'vtuber', 'workbench', 'live', 'outdoor', 'pet'];
const TIER_VALUES = ['tiny', 'mid', 'big'];

/** 把模型给的 profile 收成固定八字段；缺的填空，取值不在白名单就归默认 */
function toRoomProfile(raw: any): WatchStreamerProfile {
  const p = raw && typeof raw === 'object' ? raw : {};
  const language = roomStr(p.language);
  const screenForm = roomStr(p.screenForm);
  const tier = roomStr(p.tier);
  // 年龄读成数字：模型按新提示词给的就是整数；给不出来（旧写法、写歪了）就原样留着显示
  const ageNum = Number(p.ageBand);
  const ageBand: number | string =
    Number.isFinite(ageNum) && ageNum > 0 ? Math.round(ageNum) : roomStr(p.ageBand);
  return {
    ageBand,
    identity: roomStr(p.identity),
    language: (LANG_VALUES.includes(language) ? language : 'zh') as WatchStreamerLanguage,
    screenForm: (FORM_VALUES.includes(screenForm) ? screenForm : 'live') as WatchStreamerScreenForm,
    category: roomStr(p.category),
    tier: (TIER_VALUES.includes(tier) ? tier : 'mid') as WatchStreamerTier,
    speechStyle: roomStr(p.speechStyle),
    motive: roomStr(p.motive),
  };
}

/** 一个房间对象收成卡片；名字或标题缺了就当这条读不出来 */
function toRoomCard(r: any, idx: number): WatchRoomCard {
  const name = roomStr(r?.streamerName);
  const title = roomStr(r?.title);
  const start = roomStr(r?.coverStart);
  const end = roomStr(r?.coverEnd);
  const hex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);
  const legacy = Array.isArray(r?.cover) ? r.cover.map((c: unknown) => roomStr(c)) : [];
  const gradient =
    hex(start) && hex(end)
      ? `${start},${end}`
      : legacy.length >= 2
        ? `${legacy[0]},${legacy[1]}`
        : GRADIENT_FALLBACK[idx % GRADIENT_FALLBACK.length];
  const viewers = Number(r?.viewerCount);
  const coverSvg = washCoverSvg(r?.coverSvg);
  return {
    id: watchId('room'),
    streamerName: name.slice(0, 20),
    streamerHandle: roomStr(r?.streamerHandle) || `@${name.slice(0, 12).toLowerCase()}`,
    category: roomStr(r?.category) || roomStr(r?.profile?.category) || '闲聊',
    title: title.slice(0, 100),
    titleTranslated: roomStr(r?.titleTranslated),
    bio: roomStr(r?.bio).slice(0, 200),
    profile: toRoomProfile(r?.profile),
    viewerCount: viewers > 0 ? Math.round(viewers) : 320 + idx * 137,
    customRule: '',
    styleTag: roomStr(r?.styleTag).slice(0, 6),
    coverGradient: gradient,
    ...(coverSvg ? { coverSvg } : {}),
  };
}

/** 从模型回复里抠出一个房间数组：整个数组、包在 rooms 里、单个对象、外面裹废话，都认 */
function pickRoomArray(clean: string): any[] {
  const tryJson = (text: string): any => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };
  const asList = (v: any): any[] | null => {
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.rooms)) return v.rooms;
    if (v && typeof v === 'object') return [v];
    return null;
  };

  const whole = asList(tryJson(clean));
  if (whole) return whole;

  const a = clean.indexOf('[');
  const b = clean.lastIndexOf(']');
  if (a >= 0 && b > a) {
    const arr = asList(tryJson(clean.slice(a, b + 1)));
    if (arr) return arr;
  }

  const c = clean.indexOf('{');
  const d = clean.lastIndexOf('}');
  if (c >= 0 && d > c) {
    const obj = asList(tryJson(clean.slice(c, d + 1)));
    if (obj) return obj;
  }
  return [];
}

/** 优先读 JSON 数组；字段缺失、外面裹废话、单条坏数据都不许整批崩 */
function parseRoomJson(raw: string): WatchRoomCard[] {
  const clean = stripNoise(raw);
  return pickRoomArray(clean)
    .map((r, idx) => toRoomCard(r, idx))
    .filter(r => r.streamerName && r.title);
}

function toRoomList(raw: string): WatchRoomCard[] {
  const jsonRooms = parseRoomJson(raw);
  const list = jsonRooms.length ? jsonRooms : parseRoomLines(raw);
  if (!list.length) throw new Error('这批房间没认出来');
  return list;
}

/** 大厅「换一批」：刷一批正在直播的路人房间 */
export async function generateRoomPool(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userName: string;
  customRule: string;
  count?: number;
  exclude?: string[];
}): Promise<WatchRoomCard[]> {
  const count = opts.count ?? 4;
  const messages = [
    { role: 'system', content: ROOM_POOL_RULES },
    {
      role: 'user',
      content: buildRoomPoolTask({
        charName: opts.char.name,
        userName: opts.userName,
        customRule: opts.customRule,
        count,
        exclude: opts.exclude ?? [],
      }),
    },
  ];
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_rooms',
    temperature: 1.0,
    maxTokens: 8000,
    messages,
  });

  if (!raw.trim()) throw new Error(EMPTY_REPLY);

  let list: WatchRoomCard[];
  try {
    list = toRoomList(raw);
  } catch {
    // 一条都没写对就硬再要一遍：还是 JSON，房间数和第一次一样，别再失手
    const retry = await callSummaryModel({
      apiConfig: opts.apiConfig,
      char: opts.char,
      purpose: 'watch_along_rooms_retry',
      temperature: 0.9,
      maxTokens: 8000,
      messages: [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 1500) },
        {
          role: 'user',
          content: `上一条没照格式。现在回 ${count} 个房间的 JSON 数组，照下面这个骨架把每个字段填上，别的字都不要：
[{"streamerName":"","streamerHandle":"","title":"","titleTranslated":"","bio":"","viewerCount":0,"styleTag":"","coverSvg":"","profile":{"ageBand":0,"identity":"","language":"","screenForm":"","category":"","tier":"","speechStyle":"","motive":""}}]`,
        },
      ],
    });
    list = toRoomList(retry);
  }

  const seen = new Set<string>();
  return list
    .filter(r => {
      if (seen.has(r.streamerName)) return false;
      seen.add(r.streamerName);
      return true;
    })
    .slice(0, count);
}

// ==================== 大厅：帮我想口味 ====================

/** 用户不想自己写口味时，让辅助模型代笔一句 */
export async function suggestTaste(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userName: string;
  current: string;
}): Promise<string> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_taste',
    temperature: 1.0,
    maxTokens: 8000,
    messages: [
      { role: 'system', content: TASTE_RULES },
      { role: 'user', content: buildTasteTask({ userName: opts.userName, current: opts.current }) },
    ],
  });
  return stripVoiceMarkup(raw)
    .split(/\r?\n/)
    .map(l => l.replace(/^[\s>*#\-•·\d.、)]+/, '').trim())
    .filter(Boolean)
    .join('')
    .replace(/^["「『]|["」』]$/g, '')
    .slice(0, 60);
}

// ==================== 账号：起名 ====================

/** 给陪看小号起个昵称与编号 */
export async function suggestAccountName(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userName: string;
  target: 'user' | 'char';
  current: string;
}): Promise<{ nickname: string; number: string }> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_account',
    temperature: 1.0,
    maxTokens: 8000,
    messages: [
      { role: 'system', content: ACCOUNT_NAME_RULES },
      {
        role: 'user',
        content: buildAccountNameTask({
          charName: opts.char.name,
          userName: opts.userName,
          target: opts.target,
          current: opts.current,
        }),
      },
    ],
  });

  const clean = stripNoise(raw);
  const nick =
    clean.match(/昵称\s*[：:]\s*(\S{1,12})/)?.[1] ||
    clean.match(/"nickname"\s*:\s*"([^"]{1,12})"/)?.[1] ||
    clean.split(/[|｜\n]/)[0]?.trim().slice(0, 12) ||
    '';
  const num =
    clean.match(/编号\s*[：:]\s*(\d{1,8})/)?.[1] ||
    clean.match(/"number"\s*:\s*"(\d{1,8})"/)?.[1] ||
    clean.replace(/\D/g, '').slice(-4) ||
    '';

  return {
    nickname: nick || opts.current,
    number: (num || '0000').slice(0, 4).padStart(4, '0'),
  };
}


// ==================== 给测试用的出口（解析不依赖网络，可以单独验）====================

export const __parseStage = toStageOutput;
export const __parseChar = toCharOutput;
export const __parseRooms = toRoomList;
