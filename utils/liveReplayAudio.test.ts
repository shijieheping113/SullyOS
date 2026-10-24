import { describe, expect, it } from 'vitest';
import { chooseLiveReplaySource, liveVoiceTapAction, mergeBeatAudio, nextAutoBeatIndex } from './liveReplayAudio';

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

describe('liveVoiceTapAction', () => {
  it('does not stop a beat that automatic advance just started', () => {
    expect(liveVoiceTapAction({
      fromAuto: true,
      sameBeatPlaying: true,
      sameBeatBusy: false,
    })).toBe('ignore');
    expect(liveVoiceTapAction({
      fromAuto: true,
      sameBeatPlaying: false,
      sameBeatBusy: true,
    })).toBe('ignore');
  });

  it('stops only when a person taps the beat that is already playing', () => {
    expect(liveVoiceTapAction({
      fromAuto: false,
      sameBeatPlaying: true,
      sameBeatBusy: false,
    })).toBe('stop');
  });

  it('starts when the beat is idle', () => {
    expect(liveVoiceTapAction({
      fromAuto: true,
      sameBeatPlaying: false,
      sameBeatBusy: false,
    })).toBe('start');
  });
});

describe('nextAutoBeatIndex', () => {
  it('moves from Wait, really? to the next beat when auto advance is on', () => {
    expect(nextAutoBeatIndex({
      autoPlayStep: true,
      endedId: 'wait',
      beatIds: ['wait', 'insane'],
    })).toBe(1);
  });

  it('stays put on the last beat and when the switch is off', () => {
    expect(nextAutoBeatIndex({
      autoPlayStep: true,
      endedId: 'insane',
      beatIds: ['wait', 'insane'],
    })).toBeNull();
    expect(nextAutoBeatIndex({
      autoPlayStep: false,
      endedId: 'wait',
      beatIds: ['wait', 'insane'],
    })).toBeNull();
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

  it('存了新录音就擦掉「旧录音作废」的记号（改过台词后第一次重录）', () => {
    const beat = { audioUrl: undefined as string | undefined, speechTimeline: null, voiceVoidedAt: 123 };
    const next = mergeBeatAudio(beat, 'blob:new', null);
    expect(next.audioUrl).toBe('blob:new');
    expect(next.voiceVoidedAt).toBeUndefined();
  });
});
