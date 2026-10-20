import { describe, expect, it } from 'vitest';
import {
  appendLiveDanmakuToBeat,
  getLiveDanmakuComment,
  getLatestChunkFirstBeatIndex,
  getLiveRoundDanmakuFeed,
  getVisibleLiveDanmakuFeed,
  truncateLiveChunkAfterBeat,
} from './liveStreamTimeline';

describe('直播间进入与推进时的时间线落点', () => {
  it('进入已有多轮的直播时定位到最新一轮第一拍', () => {
    const chunks = [{ id: 'round-1' }, { id: 'round-2' }];
    const timeline = [
      { chunkId: 'round-1' },
      { chunkId: 'round-1' },
      { chunkId: 'round-2' },
      { chunkId: 'round-2' },
    ];
    expect(getLatestChunkFirstBeatIndex(chunks, timeline)).toBe(2);
  });

  it('新一轮还没有拍子时安全回到时间线起点', () => {
    expect(getLatestChunkFirstBeatIndex([{ id: 'round-1' }], [])).toBe(0);
  });

  it('弹幕列表包含当前整轮所有拍子的新弹幕，不混入前一轮', () => {
    const chunks = [
      {
        id: 'round-1',
        beats: [{ danmaku: [{ id: 'old', text: '旧轮', timestamp: 1, senderName: '观众' }] }],
      },
      {
        id: 'round-2',
        beats: [
          { danmaku: [{ id: 'new-1', text: '新轮第一拍', timestamp: 2, senderName: '观众' }] },
          { danmaku: [{ id: 'new-2', text: '新轮第二拍', timestamp: 3, senderName: '观众' }] },
          { danmaku: [{ id: 'new-3', text: '新轮第三拍', timestamp: 4, senderName: '观众' }] },
        ],
      },
    ] as any;
    expect(getLiveRoundDanmakuFeed(chunks, 'round-2').map(item => item.id)).toEqual([
      'new-1',
      'new-2',
      'new-3',
    ]);
  });

  it('动画只接收已播放到的拍子弹幕，不提前播出后续礼物', () => {
    const timeline = [
      { beat: { danmaku: [{ id: 'gift-1', text: '送出了 🐟 小鱼干！', giftName: '小鱼干' }] } },
      { beat: { danmaku: [{ id: 'gift-2', text: '送出了 🌟 星星！', giftName: '星星' }] } },
    ] as any;
    expect(getVisibleLiveDanmakuFeed(timeline, 0).map(item => item.id)).toEqual(['gift-1']);
    expect(getVisibleLiveDanmakuFeed(timeline, 1).map(item => item.id)).toEqual(['gift-1', 'gift-2']);
  });

  it('礼物卡片和飘屏不重复显示结构化礼物播报，但保留附带留言', () => {
    expect(getLiveDanmakuComment({ text: '送出了 🐟 小鱼干！', giftEmoji: '🐟', giftName: '小鱼干' })).toBe('');
    expect(getLiveDanmakuComment({ text: '送出了 🐟 小鱼干！猫猫加油', giftEmoji: '🐟', giftName: '小鱼干' })).toBe('猫猫加油');
    expect(getLiveDanmakuComment({ text: '主播加油', giftName: '小鱼干' })).toBe('主播加油');
  });

  it('用户弹幕留在用户当前选中的旧轮次和拍子上', () => {
    const chunks = [
      { id: 'old-round', beats: [{ id: 'old-beat', danmaku: [] }] },
      { id: 'latest-round', beats: [{ id: 'latest-beat', danmaku: [] }] },
    ] as any;
    const comment = { id: 'mine', senderName: '我', text: '我看到前面了', timestamp: 5 };
    const result = appendLiveDanmakuToBeat(
      chunks,
      { chunkId: 'old-round', beatId: 'old-beat' },
      comment,
    );
    expect(result.attached).toBe(true);
    expect(result.chunks[0].beats[0].danmaku).toEqual([comment]);
    expect(result.chunks[1].beats[0].danmaku).toEqual([]);
  });

  it('即时接话按实际选中的拍截断后续预制拍，不写死轮次数量', () => {
    const chunk = {
      id: 'selected-round',
      index: 8,
      createdAt: 12,
      dbMessageId: 99,
      roundSummary: '旧摘要',
      summaryUpdatedAt: 20,
      userInputs: [],
      beats: [
        { id: 'opening', chunkId: 'selected-round', index: 0, screen: '开场', speechOriginal: '开场', danmaku: [] },
        { id: 'selected-moment', chunkId: 'selected-round', index: 1, screen: '当前画面', speechOriginal: '当前台词', danmaku: [] },
        { id: 'future-action', chunkId: 'selected-round', index: 2, screen: '未来动作', speechOriginal: '未来台词', danmaku: [] },
      ],
    } as any;
    const kept = truncateLiveChunkAfterBeat(chunk, 'selected-moment')!;
    expect(kept.id).toBe('selected-round');
    expect(kept.dbMessageId).toBe(99);
    expect(kept.beats.map(beat => beat.id)).toEqual(['opening', 'selected-moment']);
    expect(kept.roundSummary).toBeUndefined();
  });

});
