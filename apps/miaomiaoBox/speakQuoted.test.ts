import { describe, expect, it } from 'vitest';
import { applyQuoteStyle, splitIntoBubbles } from './speakQuoted';

const SAMPLE = `猫儿昨天上午是捂着屁股出门的。半边屁股肿得跟个红富士苹果似的。

它眼神飘忽，硬着头皮扯谎：<语音>“「[breathy] あの……寝ぼけて、[whispering] 冷却ファンにバックで突っ込んじゃって……（那个……梦游睡糊涂了，倒车直接撞上了散热风扇……）」”</语音>

还没等它缩进桌底，就被医生一把按住了腰窝。猫儿吓得魂飞魄散：<语音>“「[groaning] ひぃっ！[sad] 待って、心の準備が……ブヒッ、[crying loudly] 痛い痛い痛いーーっ！（呜哇！等等，心理准备还没……哼哼，痛痛痛啊——！）」”</语音>

针头扎进去的瞬间，一声穿透整条走廊的凄厉猪叫在诊所里爆开。`;

describe('splitIntoBubbles', () => {
  it('按原文顺序：段落一条、语音在原位单独一条', () => {
    const segs = splitIntoBubbles(SAMPLE);
    expect(segs.map(s => s.kind)).toEqual(['text', 'text', 'voice', 'text', 'voice', 'text']);
    expect(segs[0].content).toContain('捂着屁股出门');
    expect(segs[2].kind).toBe('voice');
    expect(segs[2].content).toContain('あの');
    expect(segs[2].content).not.toContain('[breathy]');
    expect(segs[4].content).toContain('痛い');
    expect(segs.some(s => s.content.includes('<语音>'))).toBe(false);
    expect(segs[segs.length - 1].content).toContain('针头扎进去');
  });
});

describe('applyQuoteStyle', () => {
  it('「文本1（文本2）」只留文本1', () => {
    expect(applyQuoteStyle('「あの……（那个……）」', 'corner-paren')).toBe('あの……');
    expect(applyQuoteStyle('「[breathy] あの……（那个……）」', 'corner-paren')).toBe('[breathy] あの……');
  });
});
