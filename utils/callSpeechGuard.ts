// 电话「送 TTS」的唯一闸门：只决定**念不念**，从不改一个字、从不影响显示与入库。
//
// 背景（Ann 2026-09-30 报的"一大堆思考和乱七八糟的被念出来"）：
//  1. 少写结尾标签时，`normalizeVoiceTags`（sanitize.ts）会**自动补上闭合** —— 于是"标签里那半"
//     变成从 `<语音>` 一直到文末的全部内容，整段思考被当成台词念出来。判据必须在**自愈之前的原文**上看。
//  2. `utils/callReplyFormat.ts:42` 有 `content || reasoning` 的兜底：模型只写思考、正文为空时，
//     会把整段思考当作台词 —— 打电话时这属于格式不对，不念（文字仍照常显示/保存）。
//
// ⚠️ 只判断"格式坏没坏"，**不设字数上限**（Ann 明确不要上限）。唯一跟长度有关的是"长得离谱"时
//    第一遍失败就**不再自动换路重试**（同一段别付两次钱），见 CALL_TTS_NO_RETRY_CHARS。

/** 超过这个字数算"长得离谱"：第一遍合成失败后不再自动重试（仍可手动重试）。 */
export const CALL_TTS_NO_RETRY_CHARS = 1000;

export type CallSpeechBlockReason = 'unclosed-voice-tag' | 'thinking-only' | 'too-long-no-retry' | 'stopped';

/** 拦下之后给用户看的话（也是抛出去的 Error 文案）。 */
export const CALL_SPEECH_BLOCK_MESSAGE: Record<CallSpeechBlockReason, string> = {
  'unclosed-voice-tag': '本次回复格式不对，已经拦截',
  'thinking-only': '这次只有思考内容、没有台词，已经拦截',
  'too-long-no-retry': '这段太长，第一遍没成就不自动重试了 —— 可以检查后再手动重试',
  'stopped': '已经停了，这段没接着念',
};

/** 语音开标签（不含 `</语音>`；支持繁体 `語音`、带属性、`<语音=calm>` 简写）。 */
const VOICE_OPEN_RE = /<[语語]音[^>]*>/g;
/** 语音闭标签（允许 `</ 语音 >` 这种带空格的写法）。 */
const VOICE_CLOSE_RE = /<\/\s*[语語]音\s*>/g;

/**
 * 原文里写了语音标签，但**开闭不成对** ⇒ 格式坏了。
 * 完全没写标签（正常单语）返回 false —— 那种情况按原文照念，不拦。
 */
export function hasUnclosedVoiceTag(raw: string): boolean {
  const text = raw || '';
  const opens = (text.match(VOICE_OPEN_RE) || []).length;
  const closes = (text.match(VOICE_CLOSE_RE) || []).length;
  if (!opens && !closes) return false;   // 单语回复：没有标签可言，不归这条管
  return opens !== closes;               // 多写/少写/孤儿闭标签，都算坏
}

export type CallSpeechGuardInput = {
  /** 这一轮气泡的**原文**（没经过 callSpeechSource 的那份）。 */
  source?: string;
  /** 解析时发现"正文是空的、只有思考被顶上来了"。 */
  thinkingOnly?: boolean;
  /**
   * 用户**主动**点播放 / 编辑后重读（不是自动回合）。
   * 手动一律放行：判据只拦"自动念"，拦不住人自己按下去要听这一条。
   */
  manual?: boolean;
};

/** 送 TTS 之前的总闸门。返回 null = 放行；返回原因 = 拦下（只拦"念"，不动文字）。 */
export function callSpeechBlockReason(input?: CallSpeechGuardInput): CallSpeechBlockReason | null {
  if (!input) return null;
  if (input.manual) return null;   // 人自己点的：放行（想听就给）
  if (input.thinkingOnly) return 'thinking-only';
  if (hasUnclosedVoiceTag(input.source || '')) return 'unclosed-voice-tag';
  return null;
}

/** 拦下时抛的东西：带名字和原因，调用方 catch 到就显示对应文案、不发任何合成请求。 */
export function makeCallSpeechBlockedError(reason: CallSpeechBlockReason): Error {
  const error = new Error(CALL_SPEECH_BLOCK_MESSAGE[reason]) as Error & { reason?: CallSpeechBlockReason };
  error.name = 'CallSpeechBlocked';
  error.reason = reason;
  return error;
}

/** 判断一个异常是不是"被闸门拦下"（而不是真的合成失败）。 */
export function isCallSpeechBlocked(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'CallSpeechBlocked';
}
