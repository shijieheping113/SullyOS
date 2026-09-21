import { parseVoiceOutput, cleanVoiceMarkupForDisplay } from '../../utils/minimaxTts';

export function extractQuotedDialogue(text: string): string {
  const clean = (text || '').replace(/<[^>]+>/g, ' ');
  const matches = clean.match(/["\u201C]([^"\u201D]*)["\u201D]/g)
    || clean.match(/[\u300C]([^\u300D]*)[\u300D]/g);
  if (matches) {
    return matches.map(m => m.replace(/["\u201C\u201D\u300C\u300D]/g, '')).join(' ').trim();
  }
  return '';
}

export function spokenTextForBoxReply(raw: string): { spoken: string; emotion?: string } {
  const parsed = parseVoiceOutput(raw || '');
  if (parsed.hasVoiceTag) {
    return { spoken: parsed.speech || parsed.rawSpeech || '', emotion: parsed.emotion };
  }
  const quoted = extractQuotedDialogue(raw);
  return { spoken: quoted || cleanVoiceMarkupForDisplay(raw) };
}

export function displayTextForBoxReply(raw: string): string {
  const parsed = parseVoiceOutput(raw || '');
  const base = parsed.hasVoiceTag
    ? `${parsed.display || ''}\n${parsed.speech || ''}`.trim()
    : (raw || '');
  return cleanVoiceMarkupForDisplay(base).replace(/<\/?语音[^>]*>/g, '').trim();
}
