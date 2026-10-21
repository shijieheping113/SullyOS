// 电波主播台词：把嘴里的话和中文切成一对一对。
// 不改电话的 splitBilingualLines。这里多认「后面是空格或结尾」的英文句点，
// 所以 Hello. How are you? 能切开，3.5 不会被切开。

import { estimateLineMs, resolveSpeakingLineProgress } from './callSpeechTiming';
import {
  buildLineTimings,
  resolveLineIndexByTimeline,
  type SpeechTimeline,
} from './callSpeechTimeline';
import { cleanTextForTtsFish } from './fishAudioTts';

const MARK_RE = /[。！？!?…]/;
const TAG_RE = /\[[^\[\]]{1,40}\]|\([^()]{1,40}\)|（[^（）]{1,80}）/g;
const REAL_RE = /[^。！？!?\s….]/;

const hasRealChar = (s: string): boolean => REAL_RE.test((s || '').replace(TAG_RE, ''));

const isPeriodCut = (src: string, i: number): boolean => {
  if (src.charAt(i) !== '.') return false;
  const prev = i > 0 ? src.charAt(i - 1) : '';
  const next = i + 1 < src.length ? src.charAt(i + 1) : '';
  if (/\d/.test(prev) && /\d/.test(next)) return false;
  return next === '' || /\s/.test(next);
};

const isCutAt = (src: string, i: number): boolean =>
  MARK_RE.test(src.charAt(i)) || isPeriodCut(src, i);

/** 把一段台词切成一句一句。逗号不断开。 */
export const splitLiveSpeech = (text: string): string[] => {
  const src = (text || '').replace(/[\r\n]+/g, '');
  const out: string[] = [];
  let buf = '';
  let pending = '';
  const flush = () => {
    const piece = buf.trim();
    buf = '';
    if (!piece) return;
    if (!hasRealChar(piece)) {
      pending += piece;
      return;
    }
    out.push((pending + piece).trim());
    pending = '';
  };
  for (let i = 0; i < src.length; i += 1) {
    buf += src.charAt(i);
    if (!isCutAt(src, i)) continue;
    while (i + 1 < src.length && isCutAt(src, i + 1)) {
      i += 1;
      buf += src.charAt(i);
    }
    flush();
  }
  flush();
  const leftover = pending.trim();
  if (leftover) {
    if (out.length) out[out.length - 1] += leftover;
    else out.push(leftover);
  }
  if (out.length) return out;
  const fallback = src.trim();
  return fallback ? [fallback] : [];
};

const endKind = (line: string): string => {
  const marks = (line || '').match(/[。！？!?….]/g);
  if (!marks || !marks.length) return '';
  const last = marks[marks.length - 1];
  if (last === '?' || last === '？') return 'q';
  if (last === '!' || last === '！') return 'e';
  if (last === '…') return 'd';
  return 'p';
};

export type LiveSpeechAlignment = {
  spokenLines: string[];
  translatedLines: string[];
  /** 句数和结尾符号都按顺序相同。没有中文时也算对齐，画面只显示嘴里的话。 */
  aligned: boolean;
  /** 外语两边都有字，但句数或结尾符号不一致，需要只重写中文。 */
  needsRepair: boolean;
};

export const alignLiveSpeech = (spoken: string, translated?: string | null): LiveSpeechAlignment => {
  const spokenLines = splitLiveSpeech(spoken || '');
  const translatedLines = splitLiveSpeech(translated || '');
  if (!translatedLines.length) {
    return { spokenLines, translatedLines, aligned: true, needsRepair: false };
  }
  if (!spokenLines.length) {
    return { spokenLines, translatedLines, aligned: false, needsRepair: false };
  }
  const sameCount = spokenLines.length === translatedLines.length;
  const sameMarks = sameCount && spokenLines.every((line, i) => endKind(line) === endKind(translatedLines[i]));
  return {
    spokenLines,
    translatedLines,
    aligned: sameMarks,
    needsRepair: !sameMarks,
  };
};

/** 播放到 currentSec 时，嘴里该显示 splitLiveSpeech 的哪一行。没有秒数表就按句长估算。 */
export const spokenLineIndexAt = (
  spokenLines: string[],
  timeline: SpeechTimeline | null | undefined,
  currentSec: number,
  durationSec?: number,
): number => {
  if (!spokenLines.length) return 0;
  const timings = buildLineTimings(spokenLines, timeline, cleanTextForTtsFish);
  const byTime = resolveLineIndexByTimeline(timings, currentSec);
  if (byTime >= 0) return Math.max(0, Math.min(spokenLines.length - 1, byTime));
  const duration = durationSec && durationSec > 0 ? durationSec : 0;
  const p = duration > 0 ? Math.max(0, Math.min(1, currentSec / duration)) : 0;
  const at = resolveSpeakingLineProgress(spokenLines, p, 0);
  if (at.index < 0) return 0;
  return Math.max(0, Math.min(spokenLines.length - 1, at.index));
};

/** 某一行嘴里的话从第几秒开始。有鱼声表用表，没有就按句长把总时长切开。总时长未知时返回 null。 */
export const spokenLineStartSec = (
  spokenLines: string[],
  index: number,
  timeline: SpeechTimeline | null | undefined,
  durationSec?: number,
): number | null => {
  if (!spokenLines.length) return 0;
  const i = Math.max(0, Math.min(spokenLines.length - 1, index));
  const timings = buildLineTimings(spokenLines, timeline, cleanTextForTtsFish);
  const marked = timings && timings[i];
  if (typeof marked === 'number' && Number.isFinite(marked)) return marked;
  const duration = durationSec && durationSec > 0 ? durationSec : 0;
  if (!duration) return null;
  let acc = 0;
  let total = 0;
  const weights = spokenLines.map(line => {
    const w = Math.max(1, estimateLineMs(line));
    total += w;
    return w;
  });
  for (let n = 0; n < i; n += 1) acc += weights[n];
  if (total <= 0) return 0;
  return (acc / total) * duration;
};

/**
 * 录音停了以后，画面留在刚才那一对，不跳回开头。
 * 换了一拍才从这一拍的第一对重新看。
 */
export const pairCursorAfterClock = (
  cursor: number,
  followedIndex: number | null,
  beatChanged: boolean,
): number => {
  if (beatChanged) return 0;
  if (followedIndex != null && followedIndex >= 0) return followedIndex;
  return Math.max(0, cursor || 0);
};

/** 没有台词的描写拍，两个开关都开着时，停完再进的下一拍。最后一拍不再往下。 */
export const LIVE_SILENT_BEAT_HOLD_MS = 8000;

export const nextIndexAfterSilentBeat = (opts: {
  autoNext: boolean;
  follow: boolean;
  index: number;
  count: number;
  hasSpeech: boolean;
}): number | null => {
  if (!opts.autoNext || !opts.follow) return null;
  if (opts.hasSpeech) return null;
  if (opts.count <= 0 || opts.index < 0 || opts.index >= opts.count - 1) return null;
  return opts.index + 1;
};

/** 画面上这一次要画出的一对。对不齐时中文始终是整段，嘴里的话仍按序号换。 */
export const visibleLivePair = (
  spoken: string,
  translated: string | null | undefined,
  index: number,
): { spokenLine: string; translatedLine: string; index: number; count: number; aligned: boolean } => {
  const aligned = alignLiveSpeech(spoken, translated);
  const count = aligned.spokenLines.length;
  const i = count ? Math.max(0, Math.min(count - 1, index)) : 0;
  const spokenLine = count ? aligned.spokenLines[i] : (spoken || '').trim();
  const translatedLine = !aligned.translatedLines.length
    ? ''
    : aligned.aligned
      ? (aligned.translatedLines[i] || '')
      : (translated || '').trim();
  return { spokenLine, translatedLine, index: i, count, aligned: aligned.aligned };
};

/** 重写回来的中文只有句数和结尾符号都对上才采用。对不上就留原来的中文。 */
export const acceptRepairedTranslation = (spoken: string, current: string, modelText: string): string => {
  const cleaned = (modelText || '').trim().replace(/^译[：:]\s*/, '').trim();
  if (!cleaned) return current;
  const check = alignLiveSpeech(spoken, cleaned);
  if (!check.aligned || !check.translatedLines.length) return current;
  return cleaned;
};

export const buildLiveTranslationRepairPrompt = (spoken: string, translated: string): string => {
  const spokenLines = splitLiveSpeech(spoken);
  const listed = spokenLines.map((line, i) => `${i + 1}. ${line}`).join('\n');
  return [
    '下面是主播嘴里已经写好的话，不要改任何一个词。',
    listed,
    '',
    '现在的中文是：',
    translated,
    '',
    '请只输出一段新的中文。句数必须和上面的编号一样多，顺序一样，每一句的结尾符号种类也一样：问号对问号，句号对句号，感叹号对感叹号，省略号对省略号。英文句点按句号算。',
    '不要输出解释，不要输出弹幕，不要输出编号。',
  ].join('\n');
};
