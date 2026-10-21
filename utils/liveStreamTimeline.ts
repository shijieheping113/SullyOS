import type { LiveChunk, LiveDanmakuItem } from './liveStreamTypes';

/** Return the first visible beat of the newest chunk, falling back to the timeline start. */
export function getLatestChunkFirstBeatIndex(
  chunks: readonly Pick<LiveChunk, 'id'>[],
  timeline: readonly { chunkId: string }[],
): number {
  const latestChunk = chunks[chunks.length - 1];
  if (!latestChunk) return 0;
  const index = timeline.findIndex(item => item.chunkId === latestChunk.id);
  return index >= 0 ? index : 0;
}

/** Show every comment from the selected round, without leaking older rounds or only showing one beat. */
export function getLiveRoundDanmakuFeed(
  chunks: readonly LiveChunk[],
  chunkId: string,
): LiveDanmakuItem[] {
  const chunk = chunks.find(item => item.id === chunkId);
  if (!chunk) return [];
  return chunk.beats.flatMap(beat => beat.danmaku || []);
}

/** Only include danmaku from beats that have actually reached the playback position. */
export function getVisibleLiveDanmakuFeed(
  timeline: readonly { beat: Pick<LiveChunk['beats'][number], 'danmaku'> }[],
  currentBeatIndex: number,
): LiveDanmakuItem[] {
  const visible: LiveDanmakuItem[] = [];
  const end = Math.min(currentBeatIndex, timeline.length - 1);
  for (let index = 0; index <= end; index += 1) {
    visible.push(...(timeline[index].beat.danmaku || []));
  }
  return visible;
}

/**
 * 舞台滚动弹幕：只取「当前这一轮」里、已经播到的拍。
 * 不提前刷出本轮后续拍，也不混入更早轮次。
 */
export function getVisibleLiveRoundDanmakuFeed(
  timeline: readonly {
    chunkId: string;
    beat: Pick<LiveChunk['beats'][number], 'danmaku'>;
  }[],
  currentBeatIndex: number,
  chunkId: string,
): LiveDanmakuItem[] {
  if (!chunkId) return [];
  const visible: LiveDanmakuItem[] = [];
  const end = Math.min(currentBeatIndex, timeline.length - 1);
  for (let index = 0; index <= end; index += 1) {
    const row = timeline[index];
    if (row.chunkId !== chunkId) continue;
    visible.push(...(row.beat.danmaku || []));
  }
  return visible;
}

/** 舞台滚动：只取当前这一拍的弹幕（切拍即换，本拍内循环飘） */
export function getCurrentBeatDanmakuFeed(
  timeline: readonly { beat: Pick<LiveChunk['beats'][number], 'danmaku'> }[],
  currentBeatIndex: number,
): LiveDanmakuItem[] {
  const row = timeline[currentBeatIndex];
  if (!row) return [];
  return [...(row.beat.danmaku || [])];
}

/** Gift announcements already have structured gift fields; keep only an optional accompanying comment. */
export function getLiveDanmakuComment(item: Pick<LiveDanmakuItem, 'text' | 'giftName' | 'giftEmoji'>): string {
  const text = (item.text || '').trim();
  if (!item.giftName || !text) return text;
  if (!/^(?:送出|送了|赠送|打赏|投喂)(?:了)?\s*/.test(text)) return text;

  let comment = text.replace(/^(?:送出|送了|赠送|打赏|投喂)(?:了)?\s*/, '');
  [item.giftEmoji, item.giftName].filter(Boolean).forEach(token => {
    comment = comment.split(token as string).join('');
  });
  return comment
    .replace(/^\s*(?:(?:频道)?礼物|礼品)?\s*[:：,，-]?\s*/, '')
    .replace(/^[\s!！。.,，、:：-]+|[\s!！。.,，、:：-]+$/g, '')
    .trim();
}

export function appendLiveDanmakuToBeat(
  chunks: readonly LiveChunk[],
  target: { chunkId: string; beatId: string } | undefined,
  danmaku: LiveDanmakuItem,
): { chunks: LiveChunk[]; chunkIndex: number; attached: boolean } {
  const chunkIndex = target
    ? chunks.findIndex(chunk => chunk.id === target.chunkId)
    : chunks.length - 1;
  if (chunkIndex < 0) return { chunks: [...chunks], chunkIndex, attached: false };
  const chunk = chunks[chunkIndex];
  const beatIndex = target
    ? chunk.beats.findIndex(beat => beat.id === target.beatId)
    : chunk.beats.length - 1;
  if (beatIndex < 0) return { chunks: [...chunks], chunkIndex, attached: false };
  const beats = chunk.beats.map((beat, index) =>
    index === beatIndex ? { ...beat, danmaku: [...(beat.danmaku || []), danmaku] } : beat,
  );
  return {
    chunks: chunks.map((item, index) => (index === chunkIndex ? { ...item, beats } : item)),
    chunkIndex,
    attached: true,
  };
}

/** Keep only the already-viewed part of a round before generating an immediate continuation. */
export function truncateLiveChunkAfterBeat(chunk: LiveChunk, beatId: string): LiveChunk | null {
  const beatIndex = chunk.beats.findIndex(beat => beat.id === beatId);
  if (beatIndex < 0) return null;
  return {
    ...chunk,
    beats: chunk.beats.slice(0, beatIndex + 1),
    roundSummary: undefined,
    summaryUpdatedAt: undefined,
  };
}
