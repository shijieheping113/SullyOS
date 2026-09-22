import { parseVoiceOutput, cleanVoiceMarkupForDisplay, stripEmotionTags } from '../../utils/minimaxTts';
import { stripFishCuesForDisplay } from '../../utils/fishAudioTts';
import type { MiaomiaoQuoteStyle } from './types';

export function extractQuotedDialogue(text: string): string {
  const clean = (text || '').replace(/<[^>]+>/g, ' ');
  const matches = clean.match(/["\u201C]([^"\u201D]*)["\u201D]/g)
    || clean.match(/[\u300C]([^\u300D]*)[\u300D]/g);
  if (matches) {
    return matches.map(m => m.replace(/["\u201C\u201D\u300C\u300D]/g, '')).join(' ').trim();
  }
  return '';
}

export type QuoteDelims = { open: string; close: string };

export function quoteDelims(style?: MiaomiaoQuoteStyle, custom?: string): QuoteDelims | null {
  if (style === 'dq-ascii') return { open: '"', close: '"' };
  if (style === 'dq-curly') return { open: '\u201C', close: '\u201D' };
  if (style === 'corner' || style === 'corner-paren' || !style) return { open: '「', close: '」' };
  if (style === 'custom') {
    const pair = (custom || '').trim();
    if (pair.length >= 2) return { open: pair[0], close: pair[pair.length - 1] };
    return null;
  }
  return { open: '「', close: '」' };
}

/** 模型有时把主聊天的标签写成英文。先折回盒子认得的 <语音> / <字幕>。 */
export function normalizeBoxVoiceMarkup(raw: string): string {
  return (raw || '')
    .replace(/<\s*voice\b([^>]*)>/gi, '<语音$1>')
    .replace(/<\s*\/\s*voice\s*>/gi, '</语音>')
    .replace(/<\s*subtitles?\b[^>]*>/gi, '<字幕>')
    .replace(/<\s*\/\s*subtitles?\s*>/gi, '</字幕>');
}

/** 给人看：去掉 XML 语音标签和方括号 cue，保留「」和（文本2）。 */
export function cleanShown(text: string): string {
  const src = normalizeBoxVoiceMarkup(text || '');
  return stripFishCuesForDisplay(cleanVoiceMarkupForDisplay(stripEmotionTags(src)))
    .replace(/<\/?[语語]音[^>]*>/g, '')
    .replace(/<\/?字幕>/g, '')
    .replace(/\[[^\]]{1,40}\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type BoxBubbleKind = 'text' | 'voice';

export interface BoxBubbleSeg {
  kind: BoxBubbleKind;
  content: string;
  raw: string;
  voiceSourceText?: string;
}

function unwrapVoiceTags(chunk: string): string {
  return chunk.replace(/<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/g, '$1');
}

/** 一行一个气泡。行里有规范引号才朗读，引号不从这行里拆走。字幕整行只显示。 */
function linesToSegs(chunk: string, delims: QuoteDelims | null, forceText: boolean): BoxBubbleSeg[] {
  const segs: BoxBubbleSeg[] = [];
  for (const line of unwrapVoiceTags(chunk).split(/\n/)) {
    const t = line.trim();
    if (!t) continue;
    const shown = cleanShown(t);
    if (!shown) continue;
    const spoken = !forceText && !!delims && t.includes(delims.open);
    if (spoken) {
      segs.push({ kind: 'voice', content: shown, raw: t, voiceSourceText: t });
    } else {
      segs.push({ kind: 'text', content: shown, raw: t });
    }
  }
  return segs;
}

/** 编辑框里打出的 \\n 也当成换行。 */
export function normalizeEditBreaks(text: string): string {
  return (text || '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

/** 按换行切气泡。空行跳过。`<语音>` 只剥标签，不单独成条。`<字幕>` 只显示。 */
export function splitIntoBubbles(
  raw: string,
  style?: MiaomiaoQuoteStyle,
  custom?: string,
): BoxBubbleSeg[] {
  const src = normalizeBoxVoiceMarkup(raw || '');
  const delims = quoteDelims(style, custom);
  const segs: BoxBubbleSeg[] = [];
  const re = /<字幕>([\s\S]*?)<\/字幕>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    segs.push(...linesToSegs(src.slice(last, m.index), delims, false));
    segs.push(...linesToSegs(m[1] || '', delims, true));
    last = m.index + m[0].length;
  }
  segs.push(...linesToSegs(src.slice(last), delims, false));
  return segs;
}

function spokenFromLine(src: string, style?: MiaomiaoQuoteStyle, custom?: string): string {
  const delims = quoteDelims(style, custom);
  if (!delims) return applyQuoteStyle(src, style || 'corner', custom);
  const parts: string[] = [];
  let i = 0;
  while (i < src.length) {
    const openAt = src.indexOf(delims.open, i);
    if (openAt < 0) break;
    const closeAt = src.indexOf(delims.close, openAt + delims.open.length);
    if (closeAt < 0) break;
    parts.push(src.slice(openAt, closeAt + delims.close.length));
    i = closeAt + delims.close.length;
  }
  if (!parts.length) return applyQuoteStyle(src, style || 'corner', custom);
  return parts.map(p => applyQuoteStyle(p, style || 'corner', custom)).filter(Boolean).join('\n');
}

export function spokenTextForBoxReply(raw: string, style?: MiaomiaoQuoteStyle, custom?: string): { spoken: string; emotion?: string } {
  const normalized = normalizeBoxVoiceMarkup(raw || '');
  const segs = splitIntoBubbles(normalized, style, custom);
  const spoken = segs.filter(s => s.kind === 'voice').map(s => spokenFromLine(s.voiceSourceText || s.raw, style, custom)).filter(Boolean).join('\n');
  if (spoken) {
    const parsed = parseVoiceOutput(normalized);
    return { spoken, emotion: parsed.emotion };
  }
  const quoted = extractQuotedDialogue(normalized);
  return { spoken: quoted || cleanVoiceMarkupForDisplay(normalized) };
}

export function displayTextForBoxReply(raw: string, style?: MiaomiaoQuoteStyle, custom?: string): string {
  return splitIntoBubbles(raw || '', style, custom).map(s => s.content).filter(Boolean).join('\n');
}

export function splitBoxDisplay(raw: string, style?: MiaomiaoQuoteStyle, custom?: string): { narrative: string; spokenLines: string[] } {
  const segs = splitIntoBubbles(raw || '', style, custom);
  return {
    narrative: segs.filter(s => s.kind === 'text').map(s => s.content).join('\n\n'),
    spokenLines: segs.filter(s => s.kind === 'voice').map(s => s.content),
  };
}

export function applyQuoteStyle(text: string, style: MiaomiaoQuoteStyle, custom?: string): string {
  const src = text || '';
  const pick = (open: string, close: string): string | null => {
    const i = src.indexOf(open);
    if (i < 0) return null;
    const j = src.indexOf(close, i + open.length);
    if (j < 0) return null;
    return src.slice(i + open.length, j);
  };
  if (style === 'dq-ascii') return pick('"', '"') ?? src;
  if (style === 'dq-curly') return pick('\u201C', '\u201D') ?? pick('"', '"') ?? src;
  if (style === 'corner') return pick('「', '」') ?? src;
  if (style === 'corner-paren') {
    const inner = pick('「', '」') ?? src;
    return inner.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
  }
  if (style === 'custom') {
    const pair = (custom || '').trim();
    if (pair.length >= 2) {
      const open = pair[0];
      const close = pair[pair.length - 1];
      return pick(open, close) ?? src;
    }
  }
  return src;
}
