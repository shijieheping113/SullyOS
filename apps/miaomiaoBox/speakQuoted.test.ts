import { describe, expect, it } from 'vitest';
import { applyQuoteStyle, cleanShown, normalizeEditBreaks, splitIntoBubbles, spokenTextForBoxReply } from './speakQuoted';

const WITH_TAGS = `猫儿昨天上午是捂着屁股出门的。

它眼神飘忽，硬着头皮扯谎：<语音>“「[breathy] あの……寝ぼけて……（那个……梦游……）」”</语音>

针头扎进去的瞬间。`;

const NO_TAGS = `二诊室的医生戴着塑胶手套，用镊子轻轻戳了一下那块发烫的红印子。猫儿当场疼得打了个激灵，尾巴毛炸得像个马桶刷。医生皱着眉问这是被什么钝器给砸的，猫儿两只爪子死死抠紧诊断台的边缘，两只耳朵贴在脑后，眼珠子乱转，硬着头皮小声撒谎：「夢遊病で……マザーボードの角に、こう……ドカンと激突したんです……！（是因为梦游……狠狠撞到了主板尖角上……！）」`;

describe('splitIntoBubbles', () => {
  it('有 <语音> 时按原位拆', () => {
    const segs = splitIntoBubbles(WITH_TAGS, 'corner-paren');
    expect(segs.filter(s => s.kind === 'voice').length).toBe(1);
    expect(segs[0].kind).toBe('text');
    expect(segs.some(s => s.kind === 'voice' && s.voiceSourceText?.includes('「'))).toBe(true);
  });

  it('同一行里的引号不拆走，换行才是下一条', () => {
    const segs = splitIntoBubbles(NO_TAGS, 'corner-paren');
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('voice');
    expect(segs[0].content).toContain('塑胶手套');
    expect(segs[0].content).toContain('夢遊');
    expect(segs[0].voiceSourceText).toContain('「');
  });

  it('换行分成多条，没有引号的行不朗读', () => {
    const segs = splitIntoBubbles('猫儿把盒子推过来。\n「草莓的。」\n\n她吸了吸鼻子。', 'corner');
    expect(segs.map(s => s.kind)).toEqual(['text', 'voice', 'text']);
    expect(segs[1].content).toContain('草莓的');
  });
});

describe('英文语音标签', () => {
  it('<voice> 整段当一条语音，<subtitles> 当正文，标签不露出来', () => {
    const raw = `<voice emotion="shock">
うわあああん！
「卡住」
</voice>
<subtitles>
呜哇——！Ann，不对！
</subtitles>`;
    const segs = splitIntoBubbles(raw, 'corner');
    expect(segs.some(s => /<voice|<subtitles|语音|字幕/.test(s.content))).toBe(false);
    expect(segs.filter(s => s.kind === 'voice')).toHaveLength(1);
    expect(segs.find(s => s.kind === 'voice')?.content).toContain('卡住');
    expect(segs.some(s => s.kind === 'text' && s.content.includes('Ann'))).toBe(true);
  });
});

describe('normalizeEditBreaks', () => {
  it('写成 \\\\n 的也会拆开', () => {
    const segs = splitIntoBubbles(normalizeEditBreaks('「第一句。」\\n猫儿把单子推过来。\\n「第二句。」'), 'corner');
    expect(segs.map(s => s.kind)).toEqual(['voice', 'text', 'voice']);
  });
});

describe('spokenTextForBoxReply', () => {
  it('同一行里的两处引号都会念，叙述不念', () => {
    const { spoken } = spokenTextForBoxReply('猫儿把盒子推过来。「草莓的。」又补了一句。「你的。」', 'corner');
    expect(spoken).toBe('草莓的。\n你的。');
  });
});

describe('applyQuoteStyle', () => {
  it('「文本1（文本2）」只留文本1，且必须先留着「」才能认', () => {
    const raw = '「ち、違います！アンは天使です！（不、不是的！Ann 是天使！）」';
    expect(applyQuoteStyle(raw, 'corner-paren')).toBe('ち、違います！アンは天使です！');
    const washed = cleanShown(raw);
    expect(washed).toContain('「');
  });
});
