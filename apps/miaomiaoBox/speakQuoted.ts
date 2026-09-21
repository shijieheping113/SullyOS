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

/** 给人看：去掉 XML 语音标签和方括号 cue，保留「」和（文本2）。 */
export function cleanShown(text: string): string {
  return stripFishCuesForDisplay(cleanVoiceMarkupForDisplay(stripEmotionTags(text || '')))
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

function nextVoiceTag(raw: string, from: number): { start: number; end: number; inner: string; full: string } | null {
  const re = /<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/g;
  re.lastIndex = from;
  const m = re.exec(raw);
  if (!m || m.index < from) return null;
  return { start: m.index, end: m.index + m[0].length, inner: m[1] || '', full: m[0] };
}

function nextQuote(raw: string, from: number, delims: QuoteDelims): { start: number; end: number; full: string } | null {
  const start = raw.indexOf(delims.open, from);
  if (start < 0) return null;
  const closeAt = raw.indexOf(delims.close, start + delims.open.length);
  if (closeAt < 0) return { start, end: raw.length, full: raw.slice(start) };
  const end = closeAt + delims.close.length;
  return { start, end, full: raw.slice(start, end) };
}

/** 按原文顺序切成气泡：<语音> 或规范引号都在原位拆成语音条。 */
export function splitIntoBubbles(
  raw: string,
  style?: MiaomiaoQuoteStyle,
  custom?: string,
): BoxBubbleSeg[] {
  const segs: BoxBubbleSeg[] = [];
  const src = raw || '';
  const delims = quoteDelims(style, custom);
  const pushText = (chunk: string) => {
    const parts = chunk.split(/\n\s*\n/);
    for (const p of parts) {
      const t = p.replace(/^\n+|\n+$/g, '').trim();
      if (!t) continue;
      segs.push({ kind: 'text', content: cleanShown(t), raw: t });
    }
  };
  let i = 0;
  while (i < src.length) {
    const voice = nextVoiceTag(src, i);
    const quote = delims ? nextQuote(src, i, delims) : null;
    let pick: 'voice' | 'quote' | null = null;
    if (voice && quote) pick = voice.start <= quote.start ? 'voice' : 'quote';
    else if (voice) pick = 'voice';
    else if (quote) pick = 'quote';
    if (!pick) {
      pushText(src.slice(i));
      break;
    }
    if (pick === 'voice' && voice) {
      pushText(src.slice(i, voice.start));
      const shown = cleanShown(voice.inner) || cleanShown(voice.full);
      if (shown) {
        segs.push({
          kind: 'voice',
          content: shown,
          raw: voice.full,
          voiceSourceText: voice.inner || voice.full,
        });
      }
      i = voice.end;
      continue;
    }
    if (pick === 'quote' && quote) {
      pushText(src.slice(i, quote.start));
      const shown = cleanShown(quote.full);
      if (shown) {
        segs.push({
          kind: 'voice',
          content: shown,
          raw: quote.full,
          voiceSourceText: quote.full,
        });
      }
      i = quote.end;
      continue;
    }
    break;
  }
  return segs;
}

export function spokenTextForBoxReply(raw: string, style?: MiaomiaoQuoteStyle, custom?: string): { spoken: string; emotion?: string } {
  const segs = splitIntoBubbles(raw || '', style, custom);
  const spoken = segs.filter(s => s.kind === 'voice').map(s => applyQuoteStyle(s.voiceSourceText || s.raw, style || 'corner', custom)).filter(Boolean).join('\n');
  if (spoken) {
    const parsed = parseVoiceOutput(raw || '');
    return { spoken, emotion: parsed.emotion };
  }
  const quoted = extractQuotedDialogue(raw);
  return { spoken: quoted || cleanVoiceMarkupForDisplay(raw) };
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
