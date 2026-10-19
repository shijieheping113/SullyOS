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

export function getLiveChunksThroughTarget(
  chunks: readonly LiveChunk[],
  targetChunkId?: string,
): LiveChunk[] {
  if (!targetChunkId) return [...chunks];
  const index = chunks.findIndex(chunk => chunk.id === targetChunkId);
  return index < 0 ? [...chunks] : chunks.slice(0, index + 1);
}
