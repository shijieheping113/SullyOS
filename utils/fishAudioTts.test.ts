import { describe, expect, it } from 'vitest';
import { cleanTextForTtsFish, FISH_VOICE_ACTING_GUIDE } from './fishAudioTts';

describe('cleanTextForTtsFish', () => {
  it('keeps one sentence per line instead of turning newlines into [pause]', () => {
    expect(cleanTextForTtsFish('[excited] 你好\n[sad] 嗯嗯嗯'))
      .toBe('[excited] 你好\n[sad] 嗯嗯嗯');
    expect(cleanTextForTtsFish('第一句\n\n\n第二句')).toBe('第一句\n\n第二句');
    expect(cleanTextForTtsFish('[excited] 你好\n[sad] 嗯嗯嗯')).not.toMatch(/\[pause\]/);
  });

  it('does not shorten filler words in the original line', () => {
    expect(cleanTextForTtsFish('嗯嗯嗯……啊啊啊')).toBe('嗯嗯嗯……啊啊啊');
  });

  it('keeps a line-start emotion cue and a mid-sentence sound cue', () => {
    expect(cleanTextForTtsFish('[sad] 我知道你不是故意的……[sighing] 只是还是有点难过。'))
      .toBe('[sad] 我知道你不是故意的……[sighing] 只是还是有点难过。');
  });

  it('still collapses three adjacent cues on the same line', () => {
    expect(cleanTextForTtsFish('[excited][sighing][angry] 嗨')).toBe('[excited] [sighing] 嗨');
  });

  it('does not merge cues across lines', () => {
    expect(cleanTextForTtsFish('[excited] 第一句\n[sad] 第二句'))
      .toBe('[excited] 第一句\n[sad] 第二句');
  });

  it('keeps an explicit [breathy] if the model wrote one', () => {
    expect(cleanTextForTtsFish('[breathy] 等等')).toBe('[breathy] 等等');
  });

  it('converts known parenthesized sound cues and drops Chinese stage directions', () => {
    expect(cleanTextForTtsFish('你好 (laughs)（看向窗外）')).toBe('你好 [laughing]');
  });

  it('strips MiniMax break marks and system tags', () => {
    expect(cleanTextForTtsFish('你好<#0.5#>[[ACTION:x]]')).toBe('你好');
  });
});

describe('FISH_VOICE_ACTING_GUIDE', () => {
  it('recommends one sentence per line and does not say the system inserts pauses', () => {
    expect(FISH_VOICE_ACTING_GUIDE).toMatch(/一句一行/);
    expect(FISH_VOICE_ACTING_GUIDE).not.toMatch(/系统会自动插/);
    expect(FISH_VOICE_ACTING_GUIDE).toMatch(/尽量别用 `\[breathy\]`/);
  });
});
