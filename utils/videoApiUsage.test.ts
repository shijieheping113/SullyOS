import { describe, expect, it, beforeEach } from 'vitest';
import {
  estimateVideoCallYuan,
  getVideoApiUsage,
  recordVideoApiUsage,
  resetVideoApiUsage,
  videoApiUsageSummary,
} from './videoApiUsage';

describe('videoApiUsage', () => {
  beforeEach(() => {
    resetVideoApiUsage();
  });

  it('accumulates call count and yuan', () => {
    recordVideoApiUsage({ durationSec: 30, fps: 2, maxFrames: 16, detail: 'low' });
    const s = getVideoApiUsage();
    expect(s.callCount).toBe(1);
    expect(s.totalEstimatedYuan).toBeGreaterThan(0);
    expect(s.lastCallSummary).toContain('本次');
  });

  it('summary reflects multiple calls', () => {
    recordVideoApiUsage({ durationSec: 15, fps: 1, maxFrames: 8, detail: 'low' });
    recordVideoApiUsage({ durationSec: 60, fps: 1, maxFrames: 60, detail: 'low' });
    expect(getVideoApiUsage().callCount).toBe(2);
    expect(videoApiUsageSummary()).toContain('累计 2 次');
  });

  it('reset clears stats', () => {
    recordVideoApiUsage({ durationSec: 10, fps: 2, maxFrames: 16, detail: 'low' });
    resetVideoApiUsage();
    expect(getVideoApiUsage().callCount).toBe(0);
  });

  it('estimateVideoCallYuan scales with frames', () => {
    const low = estimateVideoCallYuan({ durationSec: 10, fps: 1, maxFrames: 8, detail: 'low' });
    const high = estimateVideoCallYuan({ durationSec: 60, fps: 2, maxFrames: 60, detail: 'high' });
    expect(high).toBeGreaterThan(low);
  });
});
