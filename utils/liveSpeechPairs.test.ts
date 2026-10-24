import { describe, expect, it } from 'vitest';
import {
  acceptRepairedTranslation,
  alignLiveSpeech,
  buildLiveTranslationRepairPrompt,
  buildPerformEstimateWeights,
  nextIndexAfterSilentBeat,
  pairCursorAfterClock,
  reapplyPerformanceMarkup,
  spokenLineIndexAt,
  spokenLineStartSec,
  splitLiveSpeech,
  stripPerformanceMarkup,
  stripPerformanceMarkupKeepSpacing,
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

  it('末尾的语气小尾巴并回上一句，不算独立一句', () => {
    expect(splitLiveSpeech('よし！終わり……っ！？')).toEqual(['よし！', '終わり……っ！？']);
    expect(splitLiveSpeech('ダメ。w！？')).toEqual(['ダメ。w！？']);
  });

  it('实字够多的尾巴照常成句；只有一句时不动', () => {
    expect(splitLiveSpeech('ダメ。ほんとに？')).toEqual(['ダメ。', 'ほんとに？']);
    expect(splitLiveSpeech('っ！？')).toEqual(['っ！？']);
  });

  it('Ann 抓到的样本：日文句数与中文对上，不再触发对照', () => {
    const jp = 'もー！みんなケチなんだから……ボク自分で傷舐めるもん。はい、次の質問！体重はもう禁止だからね！……えっと、『質問：ブラックリストに入れられるのが一番怖いと聞きましたが、中はどういう感じですか？』……っ！？';
    const zh = '真是的！大家都太小气了……猫儿自己舔伤口。好啦，下一个问题！体重已经禁止了哦！……那个，『提问：听说你最怕被拉黑，黑名单里面到底是什么感觉？』……！？';
    expect(splitLiveSpeech(jp).length).toBe(splitLiveSpeech(zh).length);
    expect(alignLiveSpeech(jp, zh).needsRepair).toBe(false);
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

  it('改原声台词后，旧标签按标点位置放回新字上（标签不丢）', () => {
    const oldPerform = '『老実回答……被電一下就知道疼了吧、[excited] 還有懲罰！這次就罰你学猪叫吧』って、momo_8921さん！ボク、[sad] もう白状したのに！？';
    const newPlain = '正直に答えて……ちょっと電気流れただけで痛いってわかっただろ、 それに罰もあるよ！今回は豚の鳴き声を覚える罰だ';
    // [excited] 原来在第 2 个标点（…… 算一个、顿号算一个）后面 → 放到新字第 2 个标点后面
    // [sad] 原来在第 6 个标点后面 → 新字标点不够 → 排到句尾
    expect(reapplyPerformanceMarkup(oldPerform, newPlain)).toBe(
      '正直に答えて……ちょっと電気流れただけで痛いってわかっただろ、[excited] それに罰もあるよ！今回は豚の鳴き声を覚える罰だ[sad]',
    );
  });

  it('新字的标点够放时，标签各回各位', () => {
    expect(reapplyPerformanceMarkup('等等、[sighs] 真的？', '好的， 明白！'))
      .toBe('好的，[sighs] 明白！');
  });

  it('旧念稿没有标签时，新字原样返回', () => {
    expect(reapplyPerformanceMarkup('老台词。', '新台词。')).toBe('新台词。');
    expect(reapplyPerformanceMarkup('', ' 新台词。 ')).toBe('新台词。');
  });

  it('从标注栏倒推原文：只抠标签，空格原样留着', () => {
    expect(
      stripPerformanceMarkupKeepSpacing('正直に答えて……わかっただろ、[excited] それに罰もあるよ！'),
    ).toBe('正直に答えて……わかっただろ、 それに罰もあるよ！');
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
