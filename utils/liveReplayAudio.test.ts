import { describe, expect, it } from 'vitest';
import { chooseLiveReplaySource, mergeBeatAudio } from './liveReplayAudio';

const oldTimeline = {
  segments: [{ text: 'That', start: 2, end: 2.4 }],
  durationSec: 4,
};

describe('chooseLiveReplaySource', () => {
  it('plays the saved speech cache when the stored address is dead', () => {
    expect(chooseLiveReplaySource({
      skipCache: false,
      storedPlay: 'failed',
      timestampCacheHit: false,
      speechCacheHit: true,
    })).toBe('speech-cache');
  });

  it('does not synthesize when the stored address still plays', () => {
    expect(chooseLiveReplaySource({
      skipCache: false,
      storedPlay: 'played',
      timestampCacheHit: false,
      speechCacheHit: false,
    })).toBe('stored');
  });

  it('does not synthesize when the browser blocks autoplay', () => {
    expect(chooseLiveReplaySource({
      skipCache: false,
      storedPlay: 'blocked',
      timestampCacheHit: true,
      speechCacheHit: true,
    })).toBe('blocked');
  });

  it('does not synthesize when a newer play already took the speaker', () => {
    expect(chooseLiveReplaySource({
      skipCache: false,
      storedPlay: 'superseded',
      timestampCacheHit: false,
      speechCacheHit: true,
    })).toBe('blocked');
  });

  it('prefers the timestamp cache over the older speech cache', () => {
    expect(chooseLiveReplaySource({
      skipCache: false,
      storedPlay: 'failed',
      timestampCacheHit: true,
      speechCacheHit: true,
    })).toBe('timestamp-cache');
  });

  it('synthesizes only when nothing local can play', () => {
    expect(chooseLiveReplaySource({
      skipCache: false,
      storedPlay: 'none',
      timestampCacheHit: false,
      speechCacheHit: false,
    })).toBe('synthesize');
    expect(chooseLiveReplaySource({
      skipCache: false,
      storedPlay: 'failed',
      timestampCacheHit: false,
      speechCacheHit: false,
    })).toBe('synthesize');
  });

  it('still synthesizes when the user asks to remake the line', () => {
    expect(chooseLiveReplaySource({
      skipCache: true,
      storedPlay: 'played',
      timestampCacheHit: true,
      speechCacheHit: true,
    })).toBe('synthesize');
  });
});

describe('mergeBeatAudio', () => {
  it('keeps That at 2.0s when only the playable address changes', () => {
    const beat = {
      audioUrl: 'blob:old',
      speechTimeline: oldTimeline,
    };
    const next = mergeBeatAudio(beat, 'blob:fresh');
    expect(next.audioUrl).toBe('blob:fresh');
    expect(next.speechTimeline).toEqual(oldTimeline);
    expect(mergeBeatAudio(next, 'blob:fresh')).toBe(next);
  });

  it('clears the seconds when the replacement recording has none', () => {
    const beat = { audioUrl: 'blob:old', speechTimeline: oldTimeline };
    const next = mergeBeatAudio(beat, 'blob:other', null);
    expect(next.audioUrl).toBe('blob:other');
    expect(next.speechTimeline).toBeUndefined();
  });

  it('stores the new seconds with the new recording', () => {
    const timeline = {
      segments: [{ text: 'Wait', start: 0, end: 0.4 }],
      durationSec: 4,
    };
    const next = mergeBeatAudio(
      { audioUrl: 'blob:old', speechTimeline: null },
      'blob:new',
      timeline,
    );
    expect(next.speechTimeline).toEqual(timeline);
  });
});
