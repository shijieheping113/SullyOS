import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_FRAME_CLOSE,
  ARCHIVE_FRAME_OPEN,
  PAUSE_FRAME_CLOSE,
  packRawArchive,
  shouldInjectBoxRecord,
  stripHtmlFromBoxText,
  wrapArchiveBody,
} from './archiveRewrite';
import type { MiaomiaoMessage } from './types';

describe('miaomiao archive rewrite', () => {
  it('剥 html 只留字', () => {
    const text = stripHtmlFromBoxText('前面[html]<div>草莓冰激凌</div>[/html]后面');
    expect(text).toContain('草莓冰激凌');
    expect(text).not.toContain('<div>');
    expect(text).not.toContain('[html]');
  });

  it('正向框架句包住正文', () => {
    const packed = wrapArchiveBody('猫儿去打针。', 'remember');
    expect(packed.startsWith(ARCHIVE_FRAME_OPEN)).toBe(true);
    expect(packed.endsWith(ARCHIVE_FRAME_CLOSE)).toBe(true);
    expect(packed).not.toContain('不是线上');
    expect(packed).not.toContain('模拟');
  });

  it('暂停用还没完那句', () => {
    const packed = wrapArchiveBody('猫儿还在医院。', 'paused');
    expect(packed.endsWith(PAUSE_FRAME_CLOSE)).toBe(true);
  });

  it('忘掉和被接续的不注入上下文', () => {
    expect(shouldInjectBoxRecord({ archiveMode: 'forget' })).toBe(false);
    expect(shouldInjectBoxRecord({ archiveMode: 'paused', superseded: true })).toBe(false);
    expect(shouldInjectBoxRecord({ archiveMode: 'paused' })).toBe(true);
    expect(shouldInjectBoxRecord({ archiveMode: 'remember' })).toBe(true);
  });

  it('原样打包不含 html 源码', () => {
    const messages: MiaomiaoMessage[] = [
      {
        id: '1', sessionId: 's', charId: 'c', role: 'summary', timestamp: 1,
        content: '打完针。',
      },
      {
        id: '2', sessionId: 's', charId: 'c', role: 'assistant', timestamp: 2,
        content: '买了。',
        htmlSource: '<div>美化</div>',
        htmlTextPreview: '草莓冰激凌',
      },
    ];
    const packed = packRawArchive(messages, 'raw');
    expect(packed).toContain('打完针');
    expect(packed).toContain('草莓冰激凌');
    expect(packed).not.toContain('<div>');
  });
});
