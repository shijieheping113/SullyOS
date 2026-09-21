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

const VOICE_BLOCK_RE = /<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/g;

export function cleanShown(text: string): string {
  return stripFishCuesForDisplay(cleanVoiceMarkupForDisplay(stripEmotionTags(text || '')))
    .replace(/<\/?[语語]音[^>]*>/g, '')
    .replace(/<\/?字幕>/g, '')
    .replace(/\[[^\]]{1,40}\]/g, '')
    .replace(/^[「」""\u201C\u201D]+|[「」""\u201C\u201D]+$/g, '')
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

/** 按原文顺序切成气泡：一段一条；<语音>在原位拆成单独一条。 */
export function splitIntoBubbles(raw: string): BoxBubbleSeg[] {
  const segs: BoxBubbleSeg[] = [];
  const re = /<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (chunk: string) => {
    const parts = chunk.split(/\n\s*\n/);
    for (const p of parts) {
      const t = p.replace(/^\n+|\n+$/g, '').trim();
      if (!t) continue;
      segs.push({ kind: 'text', content: cleanShown(t), raw: t });
    }
  };
  while ((m = re.exec(raw || ''))) {
    pushText((raw || '').slice(last, m.index));
    const inner = m[1] || '';
    const shown = cleanShown(inner);
    if (shown) {
      segs.push({ kind: 'voice', content: shown, raw: m[0], voiceSourceText: inner });
    }
    last = m.index + m[0].length;
  }
  pushText((raw || '').slice(last));
  return segs;
}

export function spokenTextForBoxReply(raw: string): { spoken: string; emotion?: string } {
  const segs = splitIntoBubbles(raw || '');
  const spoken = segs.filter(s => s.kind === 'voice').map(s => s.content).join('\n');
  if (spoken) {
    const parsed = parseVoiceOutput(raw || '');
    return { spoken, emotion: parsed.emotion };
  }
  const quoted = extractQuotedDialogue(raw);
  return { spoken: quoted || cleanVoiceMarkupForDisplay(raw) };
}

export function displayTextForBoxReply(raw: string): string {
  return splitIntoBubbles(raw || '').map(s => s.content).filter(Boolean).join('\n');
}

export function splitBoxDisplay(raw: string): { narrative: string; spokenLines: string[] } {
  const segs = splitIntoBubbles(raw || '');
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
