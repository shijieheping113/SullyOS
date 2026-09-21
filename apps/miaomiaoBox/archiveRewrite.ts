import { htmlToText } from '../../utils/htmlPrompt';
import type { MiaomiaoArchiveMode, MiaomiaoMessage } from './types';

export const ARCHIVE_FRAME_OPEN = '【刚刚发生的事】';
export const ARCHIVE_FRAME_CLOSE = '——以上是真实发生的事情，之后聊天时记得。';
export const PAUSE_FRAME_CLOSE = '——以上是真实发生的事情，这件事还没完，之后聊天时记得，接着往下走。';

export function stripHtmlFromBoxText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[html\]([\s\S]*?)\[\/html\]/gi, (_full, inner: string) => {
      const plain = htmlToText(inner || '').trim();
      return plain ? plain : '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function materialsForArchive(messages: MiaomiaoMessage[]): { summaries: string; remainder: string } {
  const summaries = messages
    .filter(m => m.role === 'summary')
    .map(m => stripHtmlFromBoxText(m.content))
    .filter(Boolean)
    .join('\n');
  const remainder = messages
    .filter(m => m.role !== 'summary' && !m.folded)
    .map(m => {
      const body = stripHtmlFromBoxText(m.htmlTextPreview || m.content);
      if (!body) return '';
      if (m.role === 'user') return body;
      return body;
    })
    .filter(Boolean)
    .join('\n');
  return { summaries, remainder };
}

export function wrapArchiveBody(body: string, mode: MiaomiaoArchiveMode): string {
  const inner = (body || '').trim();
  const close = mode === 'paused' ? PAUSE_FRAME_CLOSE : ARCHIVE_FRAME_CLOSE;
  return `${ARCHIVE_FRAME_OPEN}\n\n${inner}\n\n${close}`;
}

export function packRawArchive(messages: MiaomiaoMessage[], mode: MiaomiaoArchiveMode): string {
  const { summaries, remainder } = materialsForArchive(messages);
  const parts = [summaries, remainder].filter(Boolean);
  return wrapArchiveBody(parts.join('\n\n'), mode);
}

export function shouldInjectBoxRecord(meta: {
  archiveMode?: MiaomiaoArchiveMode;
  superseded?: boolean;
} | undefined): boolean {
  if (!meta) return false;
  if (meta.archiveMode === 'forget') return false;
  if (meta.superseded) return false;
  return true;
}
