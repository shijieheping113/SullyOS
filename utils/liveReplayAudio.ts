import type { SpeechTimeline } from './callSpeechTimeline';

export type StoredPlay = 'none' | 'played' | 'blocked' | 'failed' | 'superseded';

export type LiveReplaySource = 'stored' | 'blocked' | 'timestamp-cache' | 'speech-cache' | 'synthesize';

export type LiveVoiceTapAction = 'start' | 'ignore' | 'stop';

/** 自动接播不能把正在播的这一拍当成再点一次而停掉。只有人手点正在播的这一拍才停。 */
export function liveVoiceTapAction(opts: {
  fromAuto: boolean;
  sameBeatPlaying: boolean;
  sameBeatBusy: boolean;
}): LiveVoiceTapAction {
  if (opts.fromAuto && (opts.sameBeatPlaying || opts.sameBeatBusy)) return 'ignore';
  if (opts.sameBeatPlaying) return 'stop';
  if (opts.sameBeatBusy) return 'ignore';
  return 'start';
}

/** 一句录音放完后要进的下一拍。最后一拍不再往下。开关关着也不进。 */
export function nextAutoBeatIndex(opts: {
  autoPlayStep: boolean;
  endedId: string;
  beatIds: string[];
}): number | null {
  if (!opts.autoPlayStep) return null;
  const idx = opts.beatIds.indexOf(opts.endedId);
  if (idx < 0 || idx >= opts.beatIds.length - 1) return null;
  return idx + 1;
}

/**
 * 回放旧录音时先用已经有的声音。
 * 地址还能播就播地址。浏览器不许自动播就停，不要合成。
 * 地址坏了就播本机缓存。两处都没有，才新合成。
 * 点了「重新合成」才不管旧录音。
 */
export function chooseLiveReplaySource(opts: {
  skipCache: boolean;
  storedPlay: StoredPlay;
  timestampCacheHit: boolean;
  speechCacheHit: boolean;
}): LiveReplaySource {
  if (opts.skipCache) return 'synthesize';
  if (opts.storedPlay === 'played') return 'stored';
  if (opts.storedPlay === 'blocked' || opts.storedPlay === 'superseded') return 'blocked';
  if (opts.timestampCacheHit) return 'timestamp-cache';
  if (opts.speechCacheHit) return 'speech-cache';
  return 'synthesize';
}

type BeatAudioFields = {
  audioUrl?: string;
  speechTimeline?: SpeechTimeline | null;
};

/**
 * 写回这一拍的录音地址。
 * 不传秒数：原来的秒数留着，只换一个还能播的地址。
 * 传入 null：这是另一段录音，秒数清掉。
 * 传入带 segments 的秒数：改用这份。
 */
export function mergeBeatAudio<T extends BeatAudioFields>(
  beat: T,
  audioUrl: string,
  speechTimeline?: SpeechTimeline | null,
): T {
  const touchTimeline = speechTimeline !== undefined;
  if (!touchTimeline) {
    if (beat.audioUrl === audioUrl) return beat;
    return { ...beat, audioUrl };
  }
  const nextTimeline = speechTimeline && speechTimeline.segments?.length ? speechTimeline : undefined;
  const sameUrl = beat.audioUrl === audioUrl;
  const sameTimeline = JSON.stringify(beat.speechTimeline || null) === JSON.stringify(nextTimeline || null);
  if (sameUrl && sameTimeline) return beat;
  const updated: T = { ...beat, audioUrl };
  if (nextTimeline) updated.speechTimeline = nextTimeline;
  else delete updated.speechTimeline;
  return updated;
}
