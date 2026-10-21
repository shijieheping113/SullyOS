import { describe, expect, it } from 'vitest';
import { parseLiveBeatsResponse } from './liveStreamPrompts';

const beatJson = JSON.stringify([{ screen: '镜头', speechOriginal: '继续', danmaku: [] }]);

describe('直播用户弹幕的轮次归属', () => {
  it('已经落在原轮次的用户弹幕不会被推进时复制到新轮次', () => {
    const beats = parseLiveBeatsResponse(
      beatJson,
      'session',
      1,
      [{ text: '我刚才发的', persona: { id: 'me', name: '我', isMain: true }, alreadyDisplayedInTimeline: true }],
      [],
    );
    expect(beats[0].danmaku).toEqual([]);
  });

  it('尚未有落点的开场弹幕仍会附到第一拍', () => {
    const beats = parseLiveBeatsResponse(
      beatJson,
      'session',
      0,
      [{ text: '开场时发的', persona: { id: 'me', name: '我', isMain: true } }],
      [],
    );
    expect(beats[0].danmaku.map(item => item.text)).toEqual(['开场时发的']);
  });

  it('礼物打赏保留独立礼物字段，不会被折算成 Super Chat', () => {
    const beats = parseLiveBeatsResponse(
      beatJson,
      'session',
      0,
      [{
        text: '送你一枚小星星',
        persona: { id: 'me', name: '我', isMain: true },
        gift: { id: 'star', name: '小星星', emoji: '⭐', price: 80, currencySymbol: '¥' },
      }],
      [],
    );
    expect(beats[0].danmaku[0]).toMatchObject({
      text: '送你一枚小星星',
      giftName: '小星星',
      giftAmount: 80,
    });
    expect(beats[0].danmaku[0].scAmount).toBeUndefined();
  });

  it('台词里念出的观众发言必须是已经出现的弹幕', () => {
    const invented = JSON.stringify([{
      screen: '看着屏幕',
      speechOriginal: '刚才有人说「手机里有WiFi吗」。我继续做饭。',
      speechTranslated: '刚才有人问「手机里有WiFi吗」。接着做饭。',
      danmaku: [{ senderName: '路人', text: '草', translation: '' }],
    }]);
    const dropped = parseLiveBeatsResponse(invented, 'session', 0, [], []);
    expect(dropped[0].speechOriginal).toBe('我继续做饭。');
    expect(dropped[0].speechTranslated).toBe('接着做饭。');
    expect(dropped[0].danmaku.map(item => item.text)).toEqual(['草']);

    const real = JSON.stringify([{
      screen: '看着屏幕',
      speechOriginal: '刚才有人说「草」。哈哈。',
      danmaku: [{ senderName: '路人', text: '草' }],
    }]);
    const kept = parseLiveBeatsResponse(real, 'session', 0, [], []);
    expect(kept[0].speechOriginal).toContain('草');

    const earlier = JSON.stringify([{
      screen: '看着屏幕',
      speechOriginal: '刚才有人说「手机里有WiFi吗」。',
      danmaku: [{ senderName: '路人', text: '草' }],
    }]);
    const fromPrior = parseLiveBeatsResponse(earlier, 'session', 1, [], [], ['手机里有WiFi吗']);
    expect(fromPrior[0].speechOriginal).toContain('WiFi');
  });
});
