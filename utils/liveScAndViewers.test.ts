import { describe, expect, it } from 'vitest';
import {
  resolveScTier,
  settleLiveViewerCount,
} from './liveStreamTypes';
import { buildDanmakuWarmthRule, parseLiveBeatsResponse } from './liveStreamPrompts';

describe('Super Chat 档位与在线人数', () => {
  it('¥800 起是红底金边，¥500 仍是普通红', () => {
    expect(resolveScTier(20).colorLabel).toBe('黄色');
    expect(resolveScTier(500).goldBorder).toBeUndefined();
    expect(resolveScTier(800).goldBorder).toBe(true);
    expect(resolveScTier(800).colorLabel).toBe('红底金边');
    expect(resolveScTier(2400).goldBorder).toBe(true);
  });

  it('模型写出的 501 到 799 会抬到 800，走进红底金边', () => {
    const raw = JSON.stringify([{
      screen: '看屏幕',
      speechOriginal: '先念一下。',
      danmaku: [{ senderName: '老板', text: '看看我', scAmount: 650 }],
    }]);
    const beats = parseLiveBeatsResponse(raw, 'session', 0, [], []);
    expect(beats[0].danmaku[0].scAmount).toBe(800);
    expect(resolveScTier(beats[0].danmaku[0].scAmount).goldBorder).toBe(true);
  });

  it('在线人数由主播写的 viewerDelta 结算，代码只拦离谱', () => {
    // 整活/导演指令想涨就涨：120 人 +380 = 500，订阅 1000 的频道不再被 35% 天花板压死
    const grown = settleLiveViewerCount({
      current: 120,
      followers: 1000,
      beats: [{ viewerDelta: 380 }],
    });
    expect(grown).toBe(500);

    // 摆烂掉人：400 - 60 - 20 = 320
    const shrunk = settleLiveViewerCount({
      current: 400,
      followers: 10000,
      beats: [{ viewerDelta: -60 }, { viewerDelta: -20 }],
    });
    expect(shrunk).toBe(320);

    // 冷场掉到 0 是合法状态，不许偷偷回血
    const zeroed = settleLiveViewerCount({
      current: 30,
      followers: 1000,
      beats: [{ viewerDelta: -80 }],
    });
    expect(zeroed).toBe(0);

    // 宽护栏只拦天文数字：几百粉的频道在线上万 = 模型乱编
    const absurd = settleLiveViewerCount({
      current: 800,
      followers: 300,
      beats: [{ viewerDelta: 100000 }],
    });
    expect(absurd).toBe(3000);
  });

  it('一轮打赏宽闸：总额超预算削最大那笔，用户自己的钱不碰', () => {
    // 30 人在线 → 预算 = max(150, 30×15) = 450；AI 500 + 300 = 800 超 350
    const raw = JSON.stringify([{
      screen: '看屏幕',
      speechOriginal: '',
      danmaku: [
        { senderName: '路人A', text: '冲一波', scAmount: 500 },
        { senderName: '路人B', text: '收下吧', giftName: '小蛋糕', giftAmount: 300 },
      ],
    }]);
    const beats = parseLiveBeatsResponse(raw, 'session', 0, [], [], [], { viewerCount: 30 });
    const sc = beats[0].danmaku.find(d => d.senderName === '路人A')!;
    const gift = beats[0].danmaku.find(d => d.senderName === '路人B')!;
    expect(sc.scAmount).toBe(150); // 最大那笔削到刚好不超
    expect(sc.text).toBe('冲一波'); // 文字还在
    expect(gift.giftAmount).toBe(300); // 第二笔不动
    const total = (sc.scAmount || 0) + (gift.giftAmount || 0);
    expect(total).toBe(450);
  });

  it('用户自己发的 SC 不受宽闸影响，也不挤占 AI 的预算', () => {
    const raw = JSON.stringify([{
      screen: '看屏幕',
      speechOriginal: '',
      danmaku: [{ senderName: '路人A', text: '小小心意', scAmount: 400 }],
    }]);
    const beats = parseLiveBeatsResponse(
      raw,
      'session',
      0,
      [{ text: '老板豪掷', persona: { id: 'me', name: '我', isMain: true }, scAmount: 2000 }],
      [],
      [],
      { viewerCount: 30 },
    );
    const mine = beats[0].danmaku.find(d => d.isUserMain)!;
    expect(mine.scAmount).toBe(2000); // 用户的钱一分不动
    const ai = beats[0].danmaku.find(d => !d.isUserMain)!;
    // AI 自己的 400 没超预算（30 人 → 450）；若把用户的 2000 也算进总额，这条早被削没了
    expect(ai.scAmount).toBe(400);
    expect(ai.text).toBe('小小心意');
  });

  it('叛逆度分档区间生效；中间默认不加提示词', () => {
    expect(buildDanmakuWarmthRule(0)).toContain('极低档');
    expect(buildDanmakuWarmthRule(14)).toContain('极低档');
    expect(buildDanmakuWarmthRule(14)).toContain('恶评');
    expect(buildDanmakuWarmthRule(20)).toContain('偏低档');
    expect(buildDanmakuWarmthRule(70)).toContain('偏高档');
    expect(buildDanmakuWarmthRule(50)).toBe('');
    expect(buildDanmakuWarmthRule(undefined)).toBe('');
    expect(buildDanmakuWarmthRule(100)).toContain('溺爱');
    expect(buildDanmakuWarmthRule(100)).toContain('狂热');
  });
});
