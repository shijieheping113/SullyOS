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
} from './types';
import { watchId } from './types';

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

interface LabelLine {
  /** 认出来的标签（画面、台词…）；没认出来就是空串 */
  label: string;
  value: string;
}

function labelLines(raw: string): LabelLine[] {
  const out: LabelLine[] = [];
  stripNoise(raw)
    .split(/\r?\n/)
    .forEach(rawLine => {
      const line = rawLine
        .replace(/^[\s>*#\-•·]+/, '')
        .replace(/^\d+[.、)]\s*/, '')
        .trim();
      if (!line) return;
      const m = line.match(/^(?:【)?([^：:]{1,8}?)(?:】)?\s*[：:]\s*([\s\S]*)$/);
      if (m) out.push({ label: m[1].replace(/[【】\[\]\s]/g, ''), value: m[2].trim() });
      else out.push({ label: '', value: line });
    });
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
 * 把「画 / 话」交替的行按出现顺序收成一串。
 *
 * 一段直播的节奏是「手上做一件事 → 说一句 → 再做事 → 再说」，所以这里**只看先后**、不分组。
 * 模型偶尔还是照老习惯写「一整块画面 + 一整块台词」，那出来就是两条（一条画、一条话），也不会坏。
 */
function stageSeqOf(lines: LabelLine[]): WatchSeqItem[] {
  const out: WatchSeqItem[] = [];
  for (const l of lines) {
    if (!l.label) continue;
    if (DANMAKU_KEYS.some(k => l.label.includes(k))) continue;
    if (/点名|高能|高光|热点|hot/i.test(l.label)) continue;
    const text = l.value.trim();
    if (!text) continue;
    if (/画|镜头|场景|实况|视觉|动作|表演/.test(l.label)) out.push({ kind: 'scene', text });
    else if (/话|台词|说|开口|喊|唱|聊/.test(l.label)) out.push({ kind: 'line', text });
  }
  return out;
}

/** 模型偶尔还是照老习惯写 JSON：能读出来就读，读不出来当没这回事 */
function tryJson(raw: string): any | null {
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

/** 「昵称：内容」「昵称｜内容」都认，认不出昵称就把整句当弹幕 */
function parseDanmaku(values: string[]): WatchDanmaku[] {
  const out: WatchDanmaku[] = [];
  values.forEach(v => {
    v.split(/[；;]/).forEach(chunk => {
      const c = chunk.replace(/^[-–—\s]+/, '').trim();
      if (!c) return;
      const m = c.match(/^(.{1,14}?)\s*[：:｜|]\s*(.+)$/);
      const authorOk = Boolean(m) && !/[，。！？、]/.test(m![1]);
      out.push({
        id: watchId('dm'),
        author: authorOk ? m![1].trim() : '观众',
        text: (authorOk ? m![2] : c).trim(),
      });
    });
  });
  return out.filter(d => d.text).slice(0, 6);
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
          }))
          .filter((s: WatchSeqItem) => s.text)
      : [
          ...(asJson.scene ? [{ kind: 'scene' as const, text: String(asJson.scene) }] : []),
          ...(asJson.speech ? [{ kind: 'line' as const, text: String(asJson.speech) }] : []),
        ];
    return {
      scene: String(asJson.scene || ''),
      speech: String(asJson.speech || ''),
      seq,
      danmaku: parseDanmaku(
        list.map((d: any) => (typeof d === 'string' ? d : `${d?.author || '观众'}：${d?.text || ''}`)),
      ),
      hot: asJson.hot === true,
    };
  }

  const lines = labelLines(raw);
  const seq = stageSeqOf(lines);
  const scene =
    seq.filter(s => s.kind === 'scene').map(s => s.text).join('\n') ||
    firstOf(lines, ['画面', '镜头', '场景', '实况', '视觉', '表演']);
  const speech =
    seq.filter(s => s.kind === 'line').map(s => s.text).join('\n') ||
    firstOf(lines, ['台词', '主播', '说话', '开口', '喊', '唱']);
  const danmaku = parseDanmaku(valuesOf(lines, DANMAKU_KEYS));
  const hotRaw = firstOf(lines, ['点名', '高能', '高光', '热点', 'hot']);

  // 一行标签都没认出来：整段当台词接住，不许把这一幕吞掉
  if (!scene && !speech) {
    const plain = lines.map(l => l.value).join('\n').trim();
    if (!plain) throw new Error('模型这次一个字都没回');
    return {
      scene: '',
      speech: plain.slice(0, 300),
      seq: [{ kind: 'line', text: plain.slice(0, 300) }],
      danmaku,
      hot: false,
    };
  }

  return {
    scene,
    speech,
    seq,
    danmaku,
    hot: /^(是|对|有|yes|true|1)/i.test(hotRaw || ''),
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

  const lines = labelLines(raw);

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
  parseDanmaku(valuesOf(lines, DANMAKU_KEYS)).forEach(d => {
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
    maxTokens: 1600,
    messages: [
      { role: 'system', content: STAGE_RULES },
      { role: 'user', content: task },
    ],
    parse: toStageOutput,
    nudge: `上一条没照格式。现在只写这四样，一行一条，别的字一个都不要：
画面：一句话的镜头
台词：主播这一句
公屏：网友昵称：他发的弹幕
高能：否`,
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
      scene: '主播愣了一下，镜头晃了晃。',
      speech: '',
      seq: [{ kind: 'scene', text: '主播愣了一下，镜头晃了晃。' }],
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
    maxTokens: 900,
    parse: toCharOutput,
    nudge: `上一条没照格式。现在只按下面这样一行一条重写，别的字一个都不要：
私聊：要说的话
公众地方想搞事就加一行 公屏：弹幕；什么都不想做就只写 安静：理由`,
  });
}

/** 私聊长按「翻译」：把一条消息翻成另一种语言，存进这条的 translation */
export async function translateWatchText(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  text: string;
}): Promise<string> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_translate',
    temperature: 0.4,
    maxTokens: 400,
    messages: [
      { role: 'system', content: TRANSLATE_RULES },
      { role: 'user', content: buildTranslateTask(opts.text, opts.char.name) },
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
    maxTokens: 600,
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
    maxTokens: 800,
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
      .map(c => c.replace(/^[\s"'「」【】]+|[\s"'「」【】]+$/g, '').trim());
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
      title: (title || bio || '随便播点什么').slice(0, 40),
      bio: (bio || '').slice(0, 160),
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

/** 万一模型还是回了 JSON（老提示词留下的习惯），照着捡一遍 */
function parseRoomJson(raw: string): WatchRoomCard[] {
  const clean = stripNoise(raw);
  const from = clean.indexOf('{');
  const to = clean.lastIndexOf('}');
  if (from < 0 || to <= from) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(clean.slice(from, to + 1));
  } catch {
    return [];
  }
  const list: any[] = Array.isArray(parsed?.rooms) ? parsed.rooms : Array.isArray(parsed) ? parsed : [];
  return list.map((r, idx) => ({
    id: watchId('room'),
    streamerName: String(r?.streamerName || '').slice(0, 20),
    streamerHandle: String(r?.streamerHandle || ''),
    category: String(r?.category || '闲聊'),
    title: String(r?.title || '').slice(0, 40),
    bio: String(r?.bio || '').slice(0, 160),
    viewerCount: Number(r?.viewerCount) > 0 ? Math.round(Number(r.viewerCount)) : 320 + idx * 137,
    customRule: '',
    styleTag: String(r?.styleTag || '').slice(0, 6),
    coverGradient:
      Array.isArray(r?.cover) && r.cover.length >= 2
        ? `${r.cover[0]},${r.cover[1]}`
        : GRADIENT_FALLBACK[idx % GRADIENT_FALLBACK.length],
  })).filter(r => r.streamerName && r.title);
}

function toRoomList(raw: string): WatchRoomCard[] {
  const rooms = parseRoomLines(raw);
  const list = rooms.length ? rooms : parseRoomJson(raw);
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
    maxTokens: 2000,
    messages,
  });

  if (!raw.trim()) throw new Error(EMPTY_REPLY);

  let list: WatchRoomCard[];
  try {
    list = toRoomList(raw);
  } catch {
    // 一行都没写对就硬再要一遍，只要 3 个，别再失手
    const retry = await callSummaryModel({
      apiConfig: opts.apiConfig,
      char: opts.char,
      purpose: 'watch_along_rooms_retry',
      temperature: 0.9,
      maxTokens: 1400,
      messages: [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 1500) },
        {
          role: 'user',
          content: `上一条没照格式。现在只写 3 行，一行一个房间，用竖线隔开，别的字都不要：
主播名 | @handle | 分区 | 房间标题 | 玩法与脾气 | 人数 | 风格 | #1b2430 #3a2a44`,
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
    maxTokens: 200,
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
    maxTokens: 300,
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
