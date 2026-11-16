import { describe, expect, it, beforeEach } from 'vitest';
import {
  FISH_DRAMA3_FIXED_CUES,
  FISH_DRAMA3_FIXED_GUIDE,
  FISH_DRAMA3_FREE_GUIDE,
  MAX_SPOKEN_BRACKET_CHARS,
  cleanTextForTtsFishDrama3,
  fishDrama3Guide,
  getDrama3Active,
  getDrama3Mode,
  isDrama3Model,
  normalizeDrama3Cue,
  normalizeDrama3Mode,
  resolveDrama3Mode,
  scrubVoiceBracketsForDisplay,
  setDrama3Mode,
  stripFishMarkupForDisplayDrama3,
} from './fishDrama3';
import { cleanTextForTtsFish, FISH_VOICE_ACTING_GUIDE } from './fishAudioTts';
import { buildLineTimings, buildMatchableStream } from './callSpeechTimeline';

beforeEach(() => {
  setDrama3Mode(null);
});

describe('模型名与两套写法的解析', () => {
  it('只认 drama-3，大小写和空格都容忍', () => {
    expect(isDrama3Model('drama-3')).toBe(true);
    expect(isDrama3Model('  Drama-3 ')).toBe(true);
    expect(isDrama3Model('s2.1-pro')).toBe(false);
    expect(isDrama3Model(undefined)).toBe(false);
    expect(isDrama3Model('')).toBe(false);
  });

  it('档位只认 free / fixed，其余一律回落到 free', () => {
    expect(normalizeDrama3Mode('free')).toBe('free');
    expect(normalizeDrama3Mode('fixed')).toBe('fixed');
    expect(normalizeDrama3Mode(undefined)).toBe('free');
    expect(normalizeDrama3Mode(null)).toBe('free');
    expect(normalizeDrama3Mode('随便什么')).toBe('free');
    expect(normalizeDrama3Mode(true)).toBe('free');
  });

  it('不在 drama-3 上时 resolveDrama3Mode 返回 null（旧模型连门都不进）', () => {
    expect(resolveDrama3Mode({ fishAudioModel: 's2.1-pro' })).toBeNull();
    expect(resolveDrama3Mode({ fishAudioModel: 's2-pro' })).toBeNull();
    expect(resolveDrama3Mode({ fishAudioModel: 's1' })).toBeNull();
    expect(resolveDrama3Mode({})).toBeNull();
    expect(resolveDrama3Mode(null)).toBeNull();
  });

  it('drama-3 上按配置取档位，没配就是 free', () => {
    expect(resolveDrama3Mode({ fishAudioModel: 'drama-3' })).toBe('free');
    expect(resolveDrama3Mode({ fishAudioModel: 'drama-3', fishDrama3CueMode: 'free' })).toBe('free');
    expect(resolveDrama3Mode({ fishAudioModel: 'drama-3', fishDrama3CueMode: 'fixed' })).toBe('fixed');
  });
});

describe('单例（提示词拼装 / 气泡剥标签拿不到 apiConfig 时读它）', () => {
  it('未初始化 → 不在 drama-3 轨道上', () => {
    setDrama3Mode(null);
    expect(getDrama3Active()).toBe(false);
    expect(getDrama3Mode()).toBeNull();
  });

  it('free / fixed 都算在轨道上，且能读出是哪一套', () => {
    setDrama3Mode('free');
    expect(getDrama3Active()).toBe(true);
    expect(getDrama3Mode()).toBe('free');
    setDrama3Mode('fixed');
    expect(getDrama3Active()).toBe(true);
    expect(getDrama3Mode()).toBe('fixed');
  });
});

describe('两版提示词（用户原文，一字不改）', () => {
  it('自由版原文关键句都在', () => {
    expect(FISH_DRAMA3_FREE_GUIDE).toContain('### 让它听起来像角色真的在说话');
    expect(FISH_DRAMA3_FREE_GUIDE).toContain('括号内最多 24 个英文字符');
    expect(FISH_DRAMA3_FREE_GUIDE).toContain('Drama3 会把换行当成停顿');
    expect(FISH_DRAMA3_FREE_GUIDE).toContain('[a little lonely]');
  });

  it('死标注版原文关键句都在', () => {
    expect(FISH_DRAMA3_FIXED_GUIDE).toContain('### Drama3 专用语音演绎规范');
    expect(FISH_DRAMA3_FIXED_GUIDE).toContain('只能从以下词表中选择，方括号内英文原样使用');
    expect(FISH_DRAMA3_FIXED_GUIDE).toContain('标签原样使用，不自行翻译、改写、添加程度词或拼接新标签');
    expect(FISH_DRAMA3_FIXED_GUIDE).toContain('尽量不要换行');
  });

  it('两版都是「不要频繁换行」，都不许出现旧提示词的「一句一行」', () => {
    expect(FISH_DRAMA3_FREE_GUIDE).toContain('不要频繁换行');
    expect(FISH_DRAMA3_FREE_GUIDE).not.toContain('一句一行');
    expect(FISH_DRAMA3_FIXED_GUIDE).not.toContain('一句一行');
  });

  it('死标注版词表与代码里的 56 个标签完全对得上', () => {
    expect(FISH_DRAMA3_FIXED_CUES.size).toBe(56);
    for (const cue of FISH_DRAMA3_FIXED_CUES) {
      expect(FISH_DRAMA3_FIXED_GUIDE).toContain(`[${cue}]`);
    }
  });

  it('两版是两份不同的原文，且都不是旧提示词', () => {
    expect(FISH_DRAMA3_FREE_GUIDE).not.toBe(FISH_DRAMA3_FIXED_GUIDE);
    expect(FISH_DRAMA3_FREE_GUIDE).not.toBe(FISH_VOICE_ACTING_GUIDE);
    expect(FISH_DRAMA3_FIXED_GUIDE).not.toBe(FISH_VOICE_ACTING_GUIDE);
    expect(fishDrama3Guide('free')).toBe(FISH_DRAMA3_FREE_GUIDE);
    expect(fishDrama3Guide('fixed')).toBe(FISH_DRAMA3_FIXED_GUIDE);
  });
});

describe('死标注版：56 个标签的归一', () => {
  it('逐字命中一律原样返回', () => {
    for (const cue of FISH_DRAMA3_FIXED_CUES) {
      expect(normalizeDrama3Cue(cue)).toBe(cue);
      expect(normalizeDrama3Cue(`  ${cue.toUpperCase()}  `)).toBe(cue);
    }
  });

  it('同义词归到最近的那个（模仿旧清洗的映射思路）', () => {
    expect(normalizeDrama3Cue('laughs')).toBe('brief laugh');
    expect(normalizeDrama3Cue('sighs')).toBe('soft sigh');
    expect(normalizeDrama3Cue('whispering')).toBe('quiet whisper');
    expect(normalizeDrama3Cue('clears throat')).toBe('clears throat softly');
    expect(normalizeDrama3Cue('coughs')).toBe('light cough');
  });

  it('包含匹配能兜住「标签外还写了别的字」的情况', () => {
    expect(normalizeDrama3Cue('some happy voice')).toBe('slightly happy');
    expect(normalizeDrama3Cue('she is slightly annoyed here')).toBe('slightly annoyed');
  });

  it('强度档位护栏：轻的不会被匹到重的，反之亦然', () => {
    expect(normalizeDrama3Cue('slightly sad')).toBe('slightly sad');
    expect(normalizeDrama3Cue('deeply sad but composed')).toBe('deeply sad but composed');
    expect(normalizeDrama3Cue('slightly surprised')).toBe('slightly surprised');
    expect(normalizeDrama3Cue('very surprised')).toBe('very surprised');
    // 旧逻辑会把 quietly 匹到 loudly（意思反了），这里必须匹到轻声那一档
    expect(normalizeDrama3Cue('crying quietly')).toBe('softly crying');
    expect(normalizeDrama3Cue('crying intensely')).toBe('crying intensely');
  });

  it('归不了的返回空串（调用方据此整段丢掉）', () => {
    expect(normalizeDrama3Cue('')).toBe('');
    expect(normalizeDrama3Cue('   ')).toBe('');
    expect(normalizeDrama3Cue('unknown gibberish')).toBe('');
    expect(normalizeDrama3Cue('思维链漏进来了')).toBe('');
  });
});

describe('清洗：自由版', () => {
  it('方括号原样保留（不查固定词表、不改写）', () => {
    expect(cleanTextForTtsFishDrama3('[slightly happy]你回来啦。', 'free'))
      .toBe('[slightly happy]你回来啦。');
    expect(cleanTextForTtsFishDrama3('[很轻，像怕吵到人]你终于回了', 'free'))
      .toBe('[很轻，像怕吵到人]你终于回了');
  });

  it('40 字以内的方括号保留，超过 40 字的整段丢掉（防思维链烧钱）', () => {
    const ok = `[${'a'.repeat(MAX_SPOKEN_BRACKET_CHARS)}]你好`;
    expect(cleanTextForTtsFishDrama3(ok, 'free')).toBe(ok);

    const tooLong = `[${'a'.repeat(MAX_SPOKEN_BRACKET_CHARS + 1)}]你好`;
    expect(cleanTextForTtsFishDrama3(tooLong, 'free')).toBe('你好');

    const chainOfThought = `[${'这是一段很长的思考过程，'.repeat(10)}]你好`;
    expect(cleanTextForTtsFishDrama3(chainOfThought, 'free')).toBe('你好');
  });

  it('系统标记、双语分隔、中文舞台指示、MiniMax 停顿照旧清掉', () => {
    expect(cleanTextForTtsFishDrama3('[[system]]你好', 'free')).toBe('你好');
    expect(cleanTextForTtsFishDrama3('你好%%BILINGUAL%%Hello', 'free')).toBe('你好');
    expect(cleanTextForTtsFishDrama3('你好（看向窗外）', 'free')).toBe('你好');
    expect(cleanTextForTtsFishDrama3('你好<#0.5#>', 'free')).toBe('你好');
  });

  it('西文圆括号按旧习惯转成方括号', () => {
    expect(cleanTextForTtsFishDrama3('你好 (laughs)', 'free')).toBe('你好 [laughs]');
  });
});

describe('清洗：死标注版', () => {
  it('词表内的标签原样留着', () => {
    expect(cleanTextForTtsFishDrama3('[slightly happy]你回来啦。', 'fixed'))
      .toBe('[slightly happy]你回来啦。');
  });

  it('词表外的方括号先归一再送，归不了的整段丢掉', () => {
    expect(cleanTextForTtsFishDrama3('[laughs]哈哈', 'fixed')).toBe('[brief laugh]哈哈');
    expect(cleanTextForTtsFishDrama3('[完全不知道是什么]你好', 'fixed')).toBe('你好');
  });

  it('用户原文里的几个连续标签例子都能过', () => {
    expect(cleanTextForTtsFishDrama3('[clears throat softly][calm and serious]有件事。', 'fixed'))
      .toBe('[clears throat softly][calm and serious]有件事。');
    expect(cleanTextForTtsFishDrama3('[deep breath][very angry but controlled]我现在很生气。', 'fixed'))
      .toBe('[deep breath][very angry but controlled]我现在很生气。');
  });
});

describe('显示清洗', () => {
  it('屏幕上把任意长度的方括号都藏起来（含超长的）', () => {
    expect(stripFishMarkupForDisplayDrama3('[slightly happy]你回来啦。')).toBe('你回来啦。');
    expect(stripFishMarkupForDisplayDrama3(`[${'a'.repeat(200)}]你好`)).toBe('你好');
    expect(stripFishMarkupForDisplayDrama3('你好<#0.5#>')).toBe('你好');
  });

  it('不在 drama-3 轨道上时，气泡补刀函数一个字符都不改', () => {
    setDrama3Mode(null);
    expect(scrubVoiceBracketsForDisplay('[whatever]你好')).toBe('[whatever]你好');
    setDrama3Mode('free');
    expect(scrubVoiceBracketsForDisplay('[whatever]你好')).toBe('你好');
    setDrama3Mode('fixed');
    expect(scrubVoiceBracketsForDisplay('[whatever]你好')).toBe('你好');
  });
});

describe('电话对号字表：drama-3 时不把批注当字', () => {
  it('自由版的长批注进不了字表（否则字表比音频多字 → 游标卡住）', () => {
    const longCue = `[${'x'.repeat(41)}]`;   // 41 字：旧正则 {1,40} 剥不掉
    const lines = [`${longCue}第一句`, '第二句'];
    setDrama3Mode(null);
    const legacy = buildMatchableStream(lines);
    setDrama3Mode('free');
    const drama3 = buildMatchableStream(lines);
    // 旧模型：41 字以上的批注剥不掉，内容会混进字表
    expect(legacy.chars.join('')).toContain('xxx');
    // drama-3：整段剥掉，字表只剩台词本身
    expect(drama3.chars.join('')).toBe('第一句第二句');
  });

  it('drama-3 时逐句时间仍能对上三行台词', () => {
    setDrama3Mode('fixed');
    const lines = ['[slightly happy]我没事。', '你先走吧。', '[soft sigh]我会等你。'];
    const chars = '我没事你先走吧我会等你';
    let t = 0;
    const timeline = Array.from(chars).map((ch) => {
      const seg = { text: ch, start: t, end: t + 0.5 };
      t += 0.5;
      return seg;
    });
    // 字表「我没事你先走吧我会等你」；每字 0.5 秒。
    // 第 1 行起于第 0 字、第 2 行起于第 3 字、第 3 行起于第 7 字 → 0 / 1.5 / 3.5
    expect(buildLineTimings(lines, { segments: timeline })).toEqual([0, 1.5, 3.5]);
  });
});

describe('旧模型行为未被改动（回归护栏）', () => {
  it('旧清洗仍然查 22 个固定标签，映射不到就丢', () => {
    expect(cleanTextForTtsFish('[shaky breath] 我没事')).toBe('我没事');
    expect(cleanTextForTtsFish('[small laugh]你好')).toBe('[laughing]你好');
    expect(cleanTextForTtsFish('[crying quietly]你好')).toBe('[crying loudly]你好');
    expect(cleanTextForTtsFish('[softly, almost inaudible]你好')).toBe('[soft]你好');
  });

  it('旧清洗仍把西文圆括号转方括号、删中文舞台指示', () => {
    expect(cleanTextForTtsFish('你好 (laughs)（看向窗外）')).toBe('你好 [laughing]');
  });

  it('旧清洗对 41 字以上的批注仍是原样留着', () => {
    const long = `[${'a'.repeat(41)}]你好`;
    expect(cleanTextForTtsFish(long)).toBe(long);
  });

  it('旧提示词一个字没动', () => {
    expect(FISH_VOICE_ACTING_GUIDE).toContain('一句一行');
    expect(FISH_VOICE_ACTING_GUIDE).toContain('尽量别用 `[breathy]`');
    expect(FISH_VOICE_ACTING_GUIDE).not.toBe(FISH_DRAMA3_FREE_GUIDE);
    expect(FISH_VOICE_ACTING_GUIDE).not.toBe(FISH_DRAMA3_FIXED_GUIDE);
  });

  it('旧清洗里「沿用旧写法」那套行为本身就是这里的第 1 条', () => {
    // drama-3 不再有「沿用旧写法」这个选项，但旧模型仍是这套清洗，测试保留作护栏。
    expect(typeof cleanTextForTtsFish).toBe('function');
  });
});
