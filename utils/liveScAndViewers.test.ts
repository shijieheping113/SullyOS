import { describe, expect, it } from 'vitest';
import {
  resolveScTier,
  settleLiveViewerCount,
  type LiveDanmakuItem,
} from './liveStreamTypes';
import { buildDanmakuWarmthRule, parseLiveBeatsResponse } from './liveStreamPrompts';

function dm(text: string, extra: Partial<LiveDanmakuItem> = {}): LiveDanmakuItem {
  return { id: text, senderName: '观众', text, timestamp: 1, ...extra };
}

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

  it('不谢 SC、不理弹幕会掉人，接住了也只是慢慢涨，冲不到粉丝量', () => {
    const ignored = settleLiveViewerCount({
      current: 400,
      followers: 10000,
      beats: [{
        speechOriginal: '我继续做饭，谁也别理。',
        emotion: 'angry',
        danmaku: [
          dm('看看我', { scAmount: 20 }),
          dm('主播呢'),
          dm('人呢'),
          dm('说话啊'),
        ],
      }, {
        speechOriginal: '',
        emotion: 'angry',
        danmaku: [],
      }],
    });
    expect(ignored).toBeLessThan(400);

    const answered = settleLiveViewerCount({
      current: 400,
      followers: 10000,
      beats: [{
        speechOriginal: '看看我这条我念到了，谢谢。主播呢也看到了。',
        emotion: 'happy',
        danmaku: [dm('看看我', { scAmount: 20 }), dm('主播呢')],
      }],
    });
    expect(answered).toBeGreaterThan(400);
    expect(answered).toBeLessThan(10000 * 0.35);
  });

  it('叛逆度越低越对抗，越高越友好；中间默认不加提示词', () => {
    expect(buildDanmakuWarmthRule(0)).toContain('越低越叛逆');
    expect(buildDanmakuWarmthRule(0)).toContain('恶评');
    expect(buildDanmakuWarmthRule(50)).toBe('');
    expect(buildDanmakuWarmthRule(undefined)).toBe('');
    expect(buildDanmakuWarmthRule(100)).toContain('溺爱');
    expect(buildDanmakuWarmthRule(100)).toContain('狂热');
  });
});
