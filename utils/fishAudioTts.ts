/**
 * 鱼声 Fish Audio TTS 工具 —— MiniMax 的平行实现，供聊天 / 约会 / 电话二选一复用。
 *
 * 与 MiniMax 的关键差异：
 *  1. 鱼声直接返回二进制音频（mp3），不是 JSON 里塞 hex；
 *  2. 选音色用 reference_id（voiceProfile.fishReferenceId），不是 MiniMax 的 voice_id；
 *  3. 模型走 `model` 请求头（s2.1-pro / s2-pro / s1）；
 *  4. 没有 MiniMax 的 <#秒#> 停顿标记 —— 那套标记鱼声不认、会被原样念出来，
 *     所以这里绝不 insertSpeechBreaks，还要把混进来的 <#x#> 清掉做兜底。
 *  5. 情绪用方括号 cue（[happy] 等），这里把上层传来的 emotion 前置成一个方括号标签。
 *
 * 文本清洗 / <语音> 标签解析仍复用 minimaxTts 的那套（与服务商无关）。
 */
import { CharacterProfile, APIConfig } from '../types';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { hashTtsParams, getCachedTts, saveCachedTts } from './ttsCache';
import { normalizeApiKey } from './minimaxApiKey';
import { getProxyWorkerUrl } from './proxyWorker';
import type { TtsResult } from './minimaxTts';
import { isStaticWebDeployment } from './staticWebDeployment';
import { emitAppToast } from './appToast';

const FISH_TTS_TIMEOUT_MS = 85_000;
const FISH_RETRY_TOAST = '鱼声第一次没成功，正在再试一次（会再扣一次费用）';

const FISH_PROXY_PATH = '/api/fishaudio/tts';
const FISH_UPSTREAM = 'https://api.fish.audio/v1/tts';
const DEFAULT_FISH_MODEL = 's2.1-pro';

/**
 * 鱼声语音演出规范 —— 与 MiniMax 版同源（呼吸、句长、情绪节奏的原理一致），
 * 但用鱼声**原生**的表达机制：直接在台词里写自然语言方括号 cue（[happy]、
 * [warm and happy]、[whispering]、[laughing]、[break] 等），鱼声会演绎、不会念出来。
 * 不再借用 MiniMax 的 <#秒#> 停顿标记 / emotion 属性那一套。
 */
export const FISH_VOICE_ACTING_GUIDE = `### 让它听起来像活人在说话（重要）

**你现在是在「说话」，不是在「打字」。** 这条会被转成真实语音念给对方听，所以内容必须口语化、像嘴里自然说出来的话，不能是书面语。别用书面/正式措辞、长定语从句、文绉绉的连接词（"然而""与此同时""综上所述"这类一律不要）；该用"嗯""欸""那个……""反正"这些日常口头语就用。一句话读出来要顺口、像聊天，不像念稿。

你写的字会被鱼声原样念出来。目标不是"写一段通顺的话"，而是"写一段读出来有呼吸、有情绪起伏的对白"。读稿感、客服腔、新闻播报腔一旦出现就重写。

**1. 鱼声用方括号 cue 控制情绪和声音——只能用下面这一小撮官方支持的标签，别自己造词。**
鱼声只认这些标签；写 \`[smug]\`\`[teasing]\`\`[curious]\` 这种自造词，它大多无效（等于没打、照样平读）。把你想表达的情绪**对到下面最接近的那个**：
- 情感语调：\`[excited]\`（开心/兴奋/得意/惊喜/调侃/俏皮——一切正面都用它）、\`[angry]\`（生气/烦躁/吐槽）、\`[sad]\`（难过/委屈/失落/撒娇示弱）、\`[embarrassed]\`（害羞/尴尬）、\`[soft]\`（温柔/疲惫/平静/安抚/紧张）、\`[whispering]\`（悄悄话）、\`[emphasis]\`（加重某个词）。**尽量别用 \`[breathy]\`**——气声不稳定，紧张/害怕用 \`[soft]\`、\`[whispering]\` 或标点。
- 声响（贴着发生处放，后面可补拟声字）：\`[laughing]\`（哈哈哈）、\`[chuckling]\`（轻笑/嘿嘿）、\`[sighing]\`（叹气）、\`[groaning]\`（哀嚎/受不了）、\`[panting]\`（喘）、\`[moaning]\`、\`[sobbing]\`（抽泣）、\`[crying loudly]\`（大哭）、\`[clear throat]\`（清嗓）。
- 停顿：需要明显沉默才用 \`[pause]\` / \`[long pause]\`。换行本身就会换气，不必每句再插停顿标签。
**⚠️ 硬性格式：半角英文方括号 \`[like this]\`，只写上面列出的英文词。** 别用圆括号 \`(sighs)\`、中文 \`[轻声]\`、全角【】、或 \`<语音 emotion>\` 属性。

**2. 推荐写法：一句一行，情绪标签打在每行第一个。**（经验之谈，不是死命令，但这样鱼声更稳。）
- **一句一行。** 每句话说完就换行，不要把好几句糊在同一段里。
- **每行开头先打一个情绪标签**：\`[excited] 你终于回消息了\`
- 句子中间再有笑、叹气、停顿也可以：\`[sad] 我知道你不是故意的……[sighing] 只是还是有点难过。\`
- 小短句（"好啦""嗯""喂？"三五个字）可以不打标签，靠标点。
- 不要为了换气专门在下一段开头再堆一个「嗯」或叹一口气。

**完整范例：**
原文（人机）：你终于回消息了。我还以为你今天不理我了呢。我今天上班差点迟到，地铁挤得像沙丁鱼罐头。你上次推荐的那家店我去了，真的好吃。下次有空一起去吧。

改好：
\`[excited] 你终于回消息了，我可等你半天了！
[sad] 我还以为你今天不理我了呢。
[sighing] 我今天上班差点迟到，地铁挤得跟沙丁鱼罐头似的。
[excited] 你上次推荐那家店我去了，是真的好吃！
[soft] 下次有空一起去好不好嘛？\`

**3. 换气靠换行和标点，别无缝把几句贴死。**
✅ 一句一行，行首有情绪标签。
❌ 好几句挤在同一行、中间也不换气。

**4. 句子长短交错。** 一连串等长的句子是棒读头号来源。短句砸下来，长句铺开。想强调就拆开念："我。没。拿。"

**5. 停顿也能靠标点和省略号。** 逗号轻顿、句号收住、破折号拉长、省略号"……"表欲言又止；需要明显沉默才用 \`[long pause]\`。

**6. 情绪不同，节奏不同（每句给它自己的行首 cue，别一个包到底；只用支持的标签）：**
- 温柔安抚：慢、稳、短句多。"[soft] 没事……先别急着吓自己。"
- 委屈撒娇：语气软、省略号多一点。"[sad] 嗯……你刚刚是不是又不理我。"
- 别扭傲娇：前半句嘴硬后半句放软。"[angry] 哈，你还真会折腾我。
[soft] 算了，我帮你就是了。"
- 害羞：被戳穿心事。"[embarrassed] 你你你别乱说啊……谁、谁脸红了。"
- 紧张犹豫：断裂感，短句多。别用 [breathy]。"[soft] 等等……我好像，有点不确定。" 或 "[whispering] 等等……我好像，有点不确定。"
- 得意吐槽：别太慢。"[excited] 行吧，人类又发明了新的折磨方式。"

（朗读语种不是中文时，上面示例里的中文语气词换成该语言里自然的叹词 / 填充词即可，方括号 cue 写法不变，一句一行、行首情绪的写法也不变。）`;

// 鱼声方括号 cue：单层 [..]（区别于系统标记 [[..]]），内容 1–40 字符。
const FISH_BRACKET_CUE_RE = /\[[^\[\]]{1,40}\]/g;

// ⚠️ Fish 实际可靠生效的标签就这一小撮（来自 app UI 调色板）。其它自然语言标签
// （[smug]/[teasing]/[curious]… 这种）S2.1 大多弱响应甚至忽略 → 听起来像没打标签、平。
// 所以一律把 cue 归一到这个支持集，映射不到的丢弃。
const FISH_SUPPORTED_CUES = new Set([
  // 情感语调
  'angry', 'sad', 'embarrassed', 'emphasis', 'whispering', 'soft', 'breathy', 'excited',
  // 音效
  'laughing', 'chuckling', 'moaning', 'clear throat', 'sobbing', 'crying loudly',
  'sighing', 'panting', 'groaning', 'crowd laughing', 'background laughter', 'audience laughing',
  // 停顿
  'pause', 'long pause',
]);

// 把模型可能写出的各种 cue（同义词 / MiniMax 习惯 / 自造词 / 圆括号声音标签）映射到支持集。
const FISH_CUE_SYNONYMS: Record<string, string> = {
  // 停顿（含 MiniMax/旧版写法）
  'break': 'pause', 'short pause': 'pause',
  'long-break': 'long pause', 'longbreak': 'long pause', 'long break': 'long pause',
  // 正面情绪 → 官方正面只有 excited
  happy: 'excited', joyful: 'excited', delighted: 'excited', cheerful: 'excited', glad: 'excited',
  smug: 'excited', proud: 'excited', gleeful: 'excited', playful: 'excited', teasing: 'excited',
  confident: 'excited', surprised: 'excited', amazed: 'excited', curious: 'excited', hopeful: 'excited',
  enthusiastic: 'excited', eager: 'excited',
  // 生气/烦躁
  annoyed: 'angry', irritated: 'angry', frustrated: 'angry', mad: 'angry', furious: 'angry', grumpy: 'angry',
  // 难过/失落/撒娇示弱
  unhappy: 'sad', disappointed: 'sad', hurt: 'sad', depressed: 'sad', pleading: 'sad', sulking: 'sad', lonely: 'sad', regretful: 'sad',
  // 害羞/尴尬
  shy: 'embarrassed', bashful: 'embarrassed', awkward: 'embarrassed', flustered: 'embarrassed',
  // 轻柔/温柔/疲惫/平静 → soft
  'soft tone': 'soft', gentle: 'soft', tender: 'soft', warm: 'soft', calm: 'soft', soothing: 'soft',
  tired: 'soft', sleepy: 'soft', relaxed: 'soft', sincere: 'soft',
  // 气声/紧张/害怕 → breathy
  nervous: 'breathy', anxious: 'breathy', scared: 'breathy', fearful: 'breathy', worried: 'breathy', timid: 'breathy',
  // 悄悄话
  whisper: 'whispering', hushed: 'whispering', murmuring: 'whispering',
  // 强调
  emphatic: 'emphasis', stressing: 'emphasis',
  // 音效
  laugh: 'laughing', laughs: 'laughing',
  giggle: 'chuckling', giggling: 'chuckling', giggles: 'chuckling', chuckle: 'chuckling', chuckles: 'chuckling',
  sigh: 'sighing', sighs: 'sighing',
  sob: 'sobbing', sobs: 'sobbing', crying: 'crying loudly', cry: 'crying loudly',
  groan: 'groaning', groans: 'groaning',
  pant: 'panting', pants: 'panting', gasp: 'panting', gasps: 'panting', gasping: 'panting', 'out of breath': 'panting',
  moan: 'moaning', moans: 'moaning',
  'clears throat': 'clear throat', ahem: 'clear throat', cough: 'clear throat', coughs: 'clear throat',
};

/**
 * 把任意 cue 文本归一到 Fish 支持的标签。映射不到返回 ''（应丢弃）。
 * 顺序：精确支持集 → 精确同义词 → 自然语言短语包含匹配（"very excited"→excited、
 * "gentle and warm"→soft、"laughing nervously"→laughing）。
 */
const normalizeFishCue = (inner: string): string => {
  const key = (inner || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return '';
  if (FISH_SUPPORTED_CUES.has(key)) return key;
  if (FISH_CUE_SYNONYMS[key]) return FISH_CUE_SYNONYMS[key];
  for (const [syn, canon] of Object.entries(FISH_CUE_SYNONYMS)) {
    if (key.includes(syn)) return canon;
  }
  for (const canon of FISH_SUPPORTED_CUES) {
    if (key.includes(canon)) return canon;
  }
  return '';
};

/** emotion 属性兜底映射（→ 支持集）。 */
const FISH_EMOTION_MAP: Record<string, string> = {
  happy: 'excited',
  sad: 'sad',
  angry: 'angry',
  fearful: 'breathy',
  disgusted: 'angry',
  surprised: 'excited',
  calm: 'soft',
};

const FISH_VOICE_TAG_RE = /<[语語]音[^>]*>([\s\S]*?)<\/[语語]音>/;

/**
 * 鱼声专用文本清洗（区别于 MiniMax 的 cleanTextForTts）：
 * 关键差异 —— **保留**英文方括号 cue（[happy]/[whispering]…）原样送进 API。
 * 但要清掉「会被鱼声念出来」的脏东西：
 *  - 系统标记 [[..]]、双语分隔、中文舞台指示（…）、MiniMax <#秒#>；
 *  - **把所有 cue 归一到 Fish 实际支持的标签**（圆括号声音标签转方括号、自造/同义词
 *    映射到支持集、映射不到的丢弃），避免写了无效标签等于没打、或被原样念出来。
 *  - **换行保留**（一句一行更稳），不要再把换行改成 [pause]。台词里的嗯啊原样留下。
 */
export const cleanTextForTtsFish = (raw: string): string => {
  if (!raw) return '';
  const tagMatch = raw.match(FISH_VOICE_TAG_RE);
  let text = tagMatch ? tagMatch[1] : raw;
  text = text
    .replace(/\[\[.*?\]\]/g, '')                 // [[系统标记]]（双层，先于单层 cue 处理）
    .replace(/%%BILINGUAL%%[\s\S]*/i, '')        // 双语分隔及之后
    .replace(/（[^）]{0,48}）/g, '')              // 中文圆括号舞台指示，一律删
    .replace(/<#\s*[\d.]+\s*#>/g, '')            // MiniMax 停顿标记，鱼声不认
    // 西文圆括号（模型按 MiniMax 习惯写的 (laughs)/(sighs) 等）→ 先转成方括号，交给下面归一
    .replace(/\(([^)]{1,40})\)/g, '[$1]')
    // 归一：每个方括号 cue → Fish 实际支持的标签；映射不到的（含中文、自造词、舞台指示）丢弃
    .replace(/\[([^\[\]]{1,40})\]/g, (_m, inner: string) => {
      const canon = normalizeFishCue(inner);
      return canon ? `[${canon}]` : '';
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // 只合并同一行里紧挨着的 cue；不跨行，免得把「一句一行、行首标签」糊掉。
  text = text.split('\n').map(line => collapseAdjacentCues(line)).join('\n');
  return text;
};

/**
 * 合并相邻 cue：连写的 [a][b][c]（中间只有空格）压到最多 2 个。
 * 规则：先去相邻重复；≤2 个原样保留（[sad][whispering] 这种合法叠加不动）；
 * 3+ 时——有停顿 cue 就留「停顿 + 最后一个情绪」，没有就留前两个情绪。
 */
const collapseAdjacentCues = (s: string): string =>
  s.replace(/\[[^\]]+\](?:[ \t]*\[[^\]]+\])+/g, (run) => {
    const cues = run.match(/\[[^\]]+\]/g) || [];
    const dedup = cues.filter((c, i) => i === 0 || c.toLowerCase() !== cues[i - 1].toLowerCase());
    if (dedup.length <= 2) return dedup.join(' ');
    const isPause = (c: string) => /^\[(pause|long pause)\]$/i.test(c);
    const pause = dedup.find(c => /^\[long pause\]$/i.test(c)) || dedup.find(isPause);
    const emotions = dedup.filter(c => !isPause(c));
    if (pause) return emotions.length ? `${pause} ${emotions[emotions.length - 1]}` : pause;
    return `${emotions[0]} ${emotions[1]}`;
  });

/**
 * 把鱼声演出标记从「要显示给用户」的文本里清掉：方括号 cue + 鱼声圆括号特效。
 * 用于聊天气泡 / 转文字面板，免得用户看到一堆 [whispering]、(break)。
 */
export const stripFishMarkupForDisplay = (text?: string | null): string => {
  if (!text) return '';
  return text
    .replace(FISH_BRACKET_CUE_RE, '')
    // 圆括号里若是声音标签（(laughs)/(sighs) 等映射得到支持 cue）→ 演出指令，删；否则是正常括注，保留
    .replace(/\(([^)]{1,40})\)/g, (m, inner: string) => (normalizeFishCue(inner) ? '' : m))
    .replace(/<#\s*[\d.]+\s*#>/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([，。！？、；：,.!?…])/g, '$1')
    .trim();
};

/**
 * 精准版显示清洗：只删「被识别为 cue 的」方括号/圆括号（[excited]/[pause]/[smug]/(laughs) 等
 * —— 凡 normalizeFishCue 认得的都算），普通括注（[重要]/[TODO]/(顺便) 等）原样保留。
 * 因为只删可识别的 cue 词，可**安全地无差别用于任意显示文本**（聊天气泡 / 转文字 / 翻译），
 * 不挑服务商，也不会误伤用户自己打的括号内容。
 */
export const stripFishCuesForDisplay = (text?: string | null): string => {
  if (!text) return '';
  return text
    .replace(/\[([^\[\]]{1,40})\]/g, (m, inner: string) => (normalizeFishCue(inner) ? '' : m))
    .replace(/\(([^)]{1,40})\)/g, (m, inner: string) => (normalizeFishCue(inner) ? '' : m))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([，。！？、；：,.!?…])/g, '$1')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
};

/** 解析 apiConfig 里的鱼声 Key（独立 Key，不复用通用 apiKey —— 那是 LLM 的）。 */
export const resolveFishAudioApiKey = (apiConfig: APIConfig): string =>
  normalizeApiKey(apiConfig.fishAudioApiKey || '');

/**
 * 归一化鱼声音色 id（reference_id）。容忍用户直接粘 fish.audio 网页链接：
 *   https://fish.audio/app/text-to-speech/?modelId=98655a12fa944e26b274c535e5e03842
 * 也容忍只粘 id 本身。reference_id 是 32 位十六进制（UUID 去横线）。
 */
export const normalizeFishReferenceId = (raw?: string | null): string => {
  const s = (raw || '').trim();
  if (!s) return '';
  // 1) URL 里的 ?modelId=... / &modelId=...
  const byQuery = s.match(/[?&]modelId=([a-z0-9]+)/i);
  if (byQuery) return byQuery[1];
  // 2) 任意位置的 32 位十六进制串（覆盖纯 id 和路径形式）
  const byHex = s.match(/[a-f0-9]{32}/i);
  if (byHex) return byHex[0];
  // 3) 兜底：去掉可能的查询串/空白
  return s.split(/[?#\s]/)[0];
};

/** 该角色能否用鱼声合成（必须有 Key + reference_id）。 */
export const canSynthesizeFish = (char: CharacterProfile, apiConfig: APIConfig): boolean =>
  !!resolveFishAudioApiKey(apiConfig) && !!normalizeFishReferenceId(char.voiceProfile?.fishReferenceId);

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const shouldBypassWebProxy = (): boolean => {
  if (typeof window === 'undefined') return false;
  return isStaticWebDeployment(window.location.protocol, window.location.hostname);
};

/** base64 → Blob（CapacitorHttp 二进制响应是 base64 字符串）。 */
const base64ToBlob = (b64: string, mime = 'audio/mpeg'): Blob => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

class FishHttpError extends Error {
  status: number;
  constructor(status: number, detail = '') {
    const unreachable = status === 502 || status === 504;
    super(
      unreachable
        ? '连不上鱼声服务器'
        : `鱼声 TTS 失败 (HTTP ${status})${detail ? `：${detail}` : ''}`,
    );
    this.name = 'FishHttpError';
    this.status = status;
  }
}

const shouldRetryFish = (err: unknown): boolean => {
  if (err instanceof FishHttpError) return err.status === 429 || err.status === 500 || err.status === 503;
  return false;
};

const isUnreachableFishError = (err: unknown): boolean => {
  if (err instanceof FishHttpError) return err.status === 502 || err.status === 504;
  const msg = String((err as { message?: string })?.message || err || '');
  return /ETIMEDOUT|ENOTFOUND|ECONNRESET|ECONNREFUSED|Failed to fetch|NetworkError|abort|AbortError|timeout/i.test(msg);
};

const toFishUserError = (err: unknown): Error => {
  if (isUnreachableFishError(err)) return new Error('连不上鱼声服务器');
  if (err instanceof Error) return err;
  return new Error(String(err || '鱼声 TTS 失败'));
};

/**
 * 调鱼声 /v1/tts，拿回音频 Blob。
 * web：默认走 /api/fishaudio/tts 代理；静态预览（github.io / file:）直连上游兜底。
 * native：CapacitorHttp 直连上游，responseType='blob' 绕过浏览器 CORS。
 * 429/500/503 只原样再试一次；试之前 toast 提醒会再扣一次钱。超时/连不上不重试。
 */
const fishFetchAudioOnce = async (
  payload: any,
  apiKey: string,
  model: string,
): Promise<Blob> => {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    model,
  };

  if (isNative()) {
    const response = await CapacitorHttp.request({
      url: FISH_UPSTREAM,
      method: 'POST',
      headers: jsonHeaders,
      data: payload,
      responseType: 'blob',
    });
    if (response.status < 200 || response.status >= 300) {
      throw new FishHttpError(response.status, String(response.data || '').slice(0, 200));
    }
    // CapacitorHttp blob 响应：data 是 base64 字符串
    const blob = base64ToBlob(String(response.data || ''));
    if (!blob.size) throw new Error('鱼声 TTS 返回空音频');
    return blob;
  }

  // 静态部署（github.io / file:）没有 /api serverless 代理，直连 api.fish.audio 会被浏览器
  // CORS 挡（Fish 不发 ACAO 头）。走项目通用 sfworker 代理 /fishaudio/tts（带 CORS 头）。
  // model 放 query，避免自定义 model 头触发预检失败；只留 Authorization（worker 已允许）。
  let url: string;
  let headers: Record<string, string>;
  if (shouldBypassWebProxy()) {
    url = `${getProxyWorkerUrl()}/fishaudio/tts?model=${encodeURIComponent(model)}`;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  } else {
    url = FISH_PROXY_PATH;
    headers = jsonHeaders;
  }
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FISH_TTS_TIMEOUT_MS);
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    throw toFishUserError(err);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new FishHttpError(res.status, detail);
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error('鱼声 TTS 返回空音频');
  return blob;
};

const fishFetchAudio = async (
  payload: any,
  apiKey: string,
  model: string,
): Promise<Blob> => {
  try {
    return await fishFetchAudioOnce(payload, apiKey, model);
  } catch (err) {
    if (!shouldRetryFish(err)) throw toFishUserError(err);
    emitAppToast(FISH_RETRY_TOAST, 'info');
    try {
      return await fishFetchAudioOnce(payload, apiKey, model);
    } catch (err2) {
      throw toFishUserError(err2);
    }
  }
};

/**
 * 调鱼声 TTS，返回可播放 URL + 原始 blob（可写 IndexedDB 持久化）。
 * 与 minimaxTts.synthesizeSpeechDetailed 同签名，方便 ttsRouter 透明切换。
 */
export async function synthesizeSpeechFishDetailed(
  text: string,
  char: CharacterProfile,
  apiConfig: APIConfig,
  options?: { languageBoost?: string; groupId?: string; emotion?: string },
): Promise<TtsResult> {
  const apiKey = resolveFishAudioApiKey(apiConfig);
  if (!apiKey) throw new Error('缺少鱼声 Fish Audio API Key');
  const vp = char.voiceProfile;
  const referenceId = normalizeFishReferenceId(vp?.fishReferenceId);
  if (!referenceId) throw new Error('角色未配置鱼声音色（reference_id）');

  const model = (vp?.fishModel || apiConfig.fishAudioModel || DEFAULT_FISH_MODEL).trim() || DEFAULT_FISH_MODEL;

  // Fish-aware 清洗：保留方括号 cue / 圆括号特效，只清系统标记和 MiniMax 残留。
  let spoken = cleanTextForTtsFish(text);
  // 兜底：上层传了整条 emotion 属性、且正文没有任何「情绪/语气」cue 时，前置一个 cue。
  // 注意只看情绪类 cue，[break]/[long-break] 这类停顿不算（否则换行插的停顿会顶掉兜底）。
  const emotionCues = (spoken.match(/\[([^\]]+)\]/g) || [])
    .filter(c => !/^\[(pause|long pause)\]$/i.test(c.trim()));
  const hasInlineCue = emotionCues.length > 0;
  const fishEmotion = options?.emotion ? FISH_EMOTION_MAP[options.emotion.toLowerCase()] : undefined;
  if (fishEmotion && !hasInlineCue) spoken = `[${fishEmotion}] ${spoken}`;
  if (!spoken) throw new Error('鱼声 TTS 文本为空');

  // F12 调试：打印 LLM 带标签原文 + 实际送鱼声的文本，方便排查「标签被念出来」之类问题。
  console.log('[fishaudio] TTS', {
    model,
    reference_id: referenceId,
    emotion_attr: options?.emotion || '',
    raw_llm_text: text,        // LLM 输出的带标签原文
    sent_to_fish: spoken,      // 清洗后真正发给鱼声的文本
  });

  const payload: any = {
    text: spoken,
    reference_id: referenceId,
    format: 'mp3',
    // 展开数字/日期为自然读法，长文本更稳。
    normalize: true,
    temperature: 0.7,
    top_p: 0.7,
    latency: 'normal',
    // 刹模型自己循环出来的音，不改原句里的嗯啊。
    repetition_penalty: 1.5,
  };
  // 语速：角色配了就用角色的；没配则默认 0.9（比 1.0 慢一档）——鱼声默认读得偏赶，
  // 尤其外语长段落容易"一口气念完"，稍微放慢更像真人说话、段落停顿也更听得出。
  const speed = (typeof vp?.speed === 'number' && vp.speed > 0) ? vp.speed : 0.9;
  payload.prosody = { speed: Math.max(0.5, Math.min(2, speed)) };

  const cacheKey = hashTtsParams({
    kind: 'fishaudio-tts',
    text: payload.text,
    model,
    reference_id: payload.reference_id,
    format: payload.format,
    prosody: payload.prosody,
    temperature: payload.temperature,
    top_p: payload.top_p,
    latency: payload.latency,
    repetition_penalty: payload.repetition_penalty,
  });
  const cached = await getCachedTts(cacheKey);
  if (cached) {
    return { url: URL.createObjectURL(cached), blob: cached };
  }

  const blob = await fishFetchAudio(payload, apiKey, model);
  saveCachedTts(cacheKey, blob).catch(() => { /* ignore */ });
  return { url: URL.createObjectURL(blob), blob };
}

/** 薄封装：只要可播放 URL 时用。 */
export async function synthesizeSpeechFish(
  text: string,
  char: CharacterProfile,
  apiConfig: APIConfig,
  options?: { languageBoost?: string; groupId?: string; emotion?: string },
): Promise<string> {
  const { url } = await synthesizeSpeechFishDetailed(text, char, apiConfig, options);
  return url;
}
