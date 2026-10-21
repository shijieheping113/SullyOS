import { describe, expect, it } from 'vitest';
import { buildVoiceLanguageAndTranslationRule } from './liveStreamPrompts';
import type { StreamerChannelProfile } from './liveStreamTypes';

const channel = (language: string) => ({ voiceConfig: { language } }) as StreamerChannelProfile;

const DANMAKU_LINE = '所有非中文弹幕必须在 `translation` 字段提供简洁传神的中文翻译（不要加“译：”前缀）。';

describe('buildVoiceLanguageAndTranslationRule', () => {
  it('keeps the foreign voice rules and adds the punctuation pair', () => {
    const text = buildVoiceLanguageAndTranslationRule(channel('en'));
    expect(text).toContain('严禁在 `speechOriginal` 里混入中文解释');
    expect(text).toContain('不要加“译：”前缀，直接写译文内容');
    expect(text).toContain(DANMAKU_LINE);
    expect(text).toContain('Wait, really? That\'s insane.');
    expect(text).toContain('你说真的？那也太离谱了吧。');
    expect(text).toContain('Wait, really, that\'s insane.');
  });

  it('does not add the punctuation pair to a Chinese channel', () => {
    const text = buildVoiceLanguageAndTranslationRule(channel('zh'));
    expect(text).toContain('speechTranslated');
    expect(text).not.toContain('Wait, really? That\'s insane.');
    expect(text).not.toContain('Wait, really, that\'s insane.');
  });
});
