import { describe, expect, it } from 'vitest';
import {
  VIDEO_API_PRESETS,
  effectiveVideoFrames,
  estimateVideoCostHint,
  matchVideoPresetId,
  shouldRetryVideoApi50507,
  videoApiConfigFor50507Fallback,
  videoApiPresetLabel,
} from './videoApiPresets';

describe('videoApiPresets', () => {
  it('ships presets including half_minute', () => {
    expect(VIDEO_API_PRESETS).toHaveLength(6);
    expect(VIDEO_API_PRESETS.map(p => p.id)).toContain('minute_full');
    expect(VIDEO_API_PRESETS.find(p => p.id === 'minute_full')?.maxFrames).toBe(60);
  });

  it('effectiveVideoFrames caps by duration and maxFrames', () => {
    expect(effectiveVideoFrames(60, 1, 60)).toBe(60);
    expect(effectiveVideoFrames(60, 2, 16)).toBe(16);
    expect(effectiveVideoFrames(10, 2, 100)).toBe(20);
  });

  it('matches recommended default', () => {
    const cfg = { detail: 'low' as const, fps: 2, maxFrames: 16 };
    expect(matchVideoPresetId(cfg)).toBe('recommended');
    expect(videoApiPresetLabel(cfg)).toBe('推荐（默认）');
  });

  it('estimate uses preset hint when exact match', () => {
    const p = VIDEO_API_PRESETS.find(x => x.id === 'minute_dense')!;
    expect(estimateVideoCostHint(p, 60)).toBe('大约一毛上下');
  });

  it('50507 fallback for minute_dense', () => {
    const dense = { detail: 'low' as const, fps: 2, maxFrames: 100 };
    expect(shouldRetryVideoApi50507(dense)).toBe(true);
    expect(videoApiConfigFor50507Fallback(dense)).toEqual({ detail: 'low', fps: 1, maxFrames: 60 });
  });
});
