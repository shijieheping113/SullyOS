import { describe, expect, it } from 'vitest';
import {
  acceptRepairedTranslation,
  alignLiveSpeech,
  buildLiveTranslationRepairPrompt,
  buildPerformEstimateWeights,
  nextIndexAfterSilentBeat,
  pairCursorAfterClock,
  spokenLineIndexAt,
  spokenLineStartSec,
  splitLiveSpeech,
  stripPerformanceMarkup,
  visibleLivePair,
} from './liveSpeechPairs';

describe('splitLiveSpeech', () => {
  it('cuts Wait, really? That\'s insane. into two lines', () => {
    expect(splitLiveSpeech('Wait, really? That\'s insane.')).toEqual([
      'Wait, really?',
      'That\'s insane.',
    ]);
  });

  it('cuts the Chinese the same way', () => {
    expect(splitLiveSpeech('你说真的？那也太离谱了吧。')).toEqual([
      '你说真的？',
      '那也太离谱了吧。',
    ]);
  });

  it('cuts Hello. How are you? on the period', () => {
    expect(splitLiveSpeech('Hello. How are you?')).toEqual(['Hello.', 'How are you?']);
  });

  it('does not cut 3.5', () => {
    expect(splitLiveSpeech('It costs 3.5 dollars.')).toEqual(['It costs 3.5 dollars.']);
  });

  it('does not cut on a comma', () => {
    expect(splitLiveSpeech('Wait, really, that\'s insane.')).toEqual([
      'Wait, really, that\'s insane.',
    ]);
  });
});

describe('alignLiveSpeech', () => {
  it('pairs question with question and period with period', () => {
    const aligned = alignLiveSpeech(
      'Wait, really? That\'s insane.',
      '你说真的？那也太离谱了吧。',
    );
    expect(aligned.aligned).toBe(true);
    expect(aligned.needsRepair).toBe(false);
    expect(aligned.spokenLines).toEqual(['Wait, really?', 'That\'s insane.']);
    expect(aligned.translatedLines).toEqual(['你说真的？', '那也太离谱了吧。']);
  });

  it('asks for a Chinese rewrite when the English side has only a comma', () => {
    const aligned = alignLiveSpeech(
      'Wait, really, that\'s insane.',
      '你说真的？那也太离谱了吧。',
    );
    expect(aligned.aligned).toBe(false);
    expect(aligned.needsRepair).toBe(true);
  });
});

describe('spokenLineIndexAt', () => {
  const lines = ['Wait, really?', 'That\'s insane.'];
  const timeline = {
    segments: [
      { text: 'Wait', start: 0, end: 0.4 },
      { text: 'really', start: 0.5, end: 1.2 },
      { text: 'That', start: 2, end: 2.3 },
      { text: 's', start: 2.3, end: 2.4 },
      { text: 'insane', start: 2.5, end: 3.2 },
    ],
    durationSec: 4,
  };

  it('picks Wait, really? at 1 second and That\'s insane. at 2 seconds', () => {
    expect(spokenLineIndexAt(lines, timeline, 1, 4)).toBe(0);
    expect(spokenLineIndexAt(lines, timeline, 2, 4)).toBe(1);
  });

  it('uses line weight when there is no timeline', () => {
    const atStart = spokenLineIndexAt(lines, null, 0.2, 4);
    const atLate = spokenLineIndexAt(lines, null, 3.5, 4);
    expect(atStart).toBe(0);
    expect(atLate).toBe(1);
  });

  it('returns the fish start second for That\'s', () => {
    expect(spokenLineStartSec(lines, 1, timeline, 4)).toBe(2);
  });

  it('estimates a start second when the old recording has no timeline', () => {
    const start = spokenLineStartSec(lines, 1, null, 4);
    expect(start).not.toBeNull();
    expect(start as number).toBeGreaterThan(0);
    expect(start as number).toBeLessThan(4);
    expect(spokenLineStartSec(lines, 1, null, 0)).toBeNull();
    expect(spokenLineIndexAt(lines, null, start as number, 4)).toBe(1);
  });
});

describe('visibleLivePair', () => {
  it('shows one bilingual pair at a time', () => {
    const first = visibleLivePair(
      'Wait, really? That\'s insane.',
      '你说真的？那也太离谱了吧。',
      0,
    );
    const second = visibleLivePair(
      'Wait, really? That\'s insane.',
      '你说真的？那也太离谱了吧。',
      1,
    );
    expect(first.spokenLine).toBe('Wait, really?');
    expect(first.translatedLine).toBe('你说真的？');
    expect(second.spokenLine).toBe('That\'s insane.');
    expect(second.translatedLine).toBe('那也太离谱了吧。');
  });

  it('keeps the whole Chinese line when the two sides do not match', () => {
    const spoken = 'Wait, really? That\'s insane.';
    const translated = '你说真的，那也太离谱了吧。';
    const first = visibleLivePair(spoken, translated, 0);
    const second = visibleLivePair(spoken, translated, 1);
    expect(first.spokenLine).toBe('Wait, really?');
    expect(second.spokenLine).toBe('That\'s insane.');
    expect(first.translatedLine).toBe(translated);
    expect(second.translatedLine).toBe(translated);
  });
});

describe('acceptRepairedTranslation', () => {
  it('keeps a rewrite only when the Chinese lines match', () => {
    const spoken = 'Wait, really? That\'s insane.';
    const current = '你说真的，那也太离谱了吧。';
    expect(acceptRepairedTranslation(spoken, current, '译：你说真的？那也太离谱了吧。'))
      .toBe('你说真的？那也太离谱了吧。');
    expect(acceptRepairedTranslation(spoken, current, '还是一整句对不上')).toBe(current);
  });
});

describe('pairCursorAfterClock', () => {
  it('stays on That\'s insane. after the recording ends', () => {
    expect(pairCursorAfterClock(0, 1, false)).toBe(1);
    expect(pairCursorAfterClock(1, null, false)).toBe(1);
  });

  it('starts at Wait, really? when the beat changes', () => {
    expect(pairCursorAfterClock(1, null, true)).toBe(0);
  });
});

describe('nextIndexAfterSilentBeat', () => {
  it('moves on after a silent beat only when both switches are on and a later beat exists', () => {
    expect(nextIndexAfterSilentBeat({
      autoNext: true,
      follow: true,
      index: 1,
      count: 3,
      hasSpeech: false,
    })).toBe(2);
    expect(nextIndexAfterSilentBeat({
      autoNext: true,
      follow: false,
      index: 1,
      count: 3,
      hasSpeech: false,
    })).toBeNull();
    expect(nextIndexAfterSilentBeat({
      autoNext: true,
      follow: true,
      index: 2,
      count: 3,
      hasSpeech: false,
    })).toBeNull();
    expect(nextIndexAfterSilentBeat({
      autoNext: true,
      follow: true,
      index: 0,
      count: 2,
      hasSpeech: true,
    })).toBeNull();
  });
});

describe('buildLiveTranslationRepairPrompt', () => {
  it('lists the spoken lines and does not ask for danmaku', () => {
    const prompt = buildLiveTranslationRepairPrompt(
      'Wait, really? That\'s insane.',
      '你说真的，那也太离谱了吧。',
    );
    expect(prompt).toContain('1. Wait, really?');
    expect(prompt).toContain('2. That\'s insane.');
    expect(prompt).toContain('不要输出弹幕');
  });
});

describe('念稿版：标注剥离与估算权重', () => {
  it('剥掉所有标注后剩下纯文字', () => {
    expect(stripPerformanceMarkup('[sighs] 等等。<#0.5#>真的假的？（笑）(laughs)')).toBe(
      '等等。真的假的？',
    );
  });

  it('句数对不上时退回原文估算（返回 null）', () => {
    const lines = splitLiveSpeech('等等。真的假的？');
    expect(buildPerformEstimateWeights(lines, null)).toBeNull();
    expect(buildPerformEstimateWeights(lines, '[sighs] 等等。真的假的？多出来的一句。')).toBeNull();
  });

  it('有标注的句权重更大；句首的停顿记到上一句头上', () => {
    const lines = splitLiveSpeech('等等。真的假的？');
    const plain = buildPerformEstimateWeights(lines, '等等。真的假的？')!;
    // <#1#> 写在上一句句号后面 → 时间归上一句，下一句自己的权重不变
    const withPause = buildPerformEstimateWeights(lines, '等等。<#1#>真的假的？')!;
    expect(withPause[0]).toBeGreaterThan(plain[0]);
    expect(withPause[1]).toBe(plain[1]);
    // 句首音效同理
    const withCue = buildPerformEstimateWeights(lines, '等等。[sighs]真的假的？')!;
    expect(withCue[0]).toBeGreaterThan(plain[0]);
    expect(withCue[1]).toBe(plain[1]);
  });

  it('没有时间轴时，带停顿的念稿把后面句的估算起点往后推', () => {
    const lines = splitLiveSpeech('等等。真的假的？');
    const plainStart = spokenLineStartSec(lines, 1, null, 4)!;
    const paused = buildPerformEstimateWeights(lines, '等等。<#1.5#>真的假的？');
    const pausedStart = spokenLineStartSec(lines, 1, null, 4, paused)!;
    expect(pausedStart).toBeGreaterThan(plainStart);
  });
});
