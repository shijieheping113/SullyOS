import { describe, expect, it } from 'vitest';
import { applyQuoteStyle, cleanShown, splitIntoBubbles } from './speakQuoted';

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

  it('没有 <语音> 只靠「」也能拆成叙述+语音', () => {
    const segs = splitIntoBubbles(NO_TAGS, 'corner-paren');
    expect(segs.length).toBe(2);
    expect(segs[0].kind).toBe('text');
    expect(segs[0].content).toContain('塑胶手套');
    expect(segs[0].content).not.toContain('夢遊');
    expect(segs[1].kind).toBe('voice');
    expect(segs[1].voiceSourceText).toContain('「');
    expect(segs[1].voiceSourceText).toContain('（是因为梦游');
    expect(segs[1].content).toContain('「');
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
