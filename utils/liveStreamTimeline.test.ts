import { describe, expect, it } from 'vitest';
import {
  appendLiveDanmakuToBeat,
  getLiveChunksThroughTarget,
  getLatestChunkFirstBeatIndex,
  getLiveRoundDanmakuFeed,
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

  it('即时接话只把目标轮次之前的直播内容交给生成器', () => {
    const chunks = [{ id: 'round-1' }, { id: 'round-2' }, { id: 'round-3' }] as any;
    expect(getLiveChunksThroughTarget(chunks, 'round-2').map(chunk => chunk.id)).toEqual([
      'round-1',
      'round-2',
    ]);
  });
});
