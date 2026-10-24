import { describe, expect, it } from 'vitest';
import { withHardTimeout } from './liveStreamAiHelpers';

describe('withHardTimeout（辅助模型的硬闸）', () => {
  it('按时返回结果', async () => {
    const value = await withHardTimeout(Promise.resolve('ok'), 1000);
    expect(value).toBe('ok');
  });

  it('底层卡住时到点必回（拒绝），绝不跟着流一起悬着', async () => {
    const hanging = new Promise<string>(() => undefined);
    const started = Date.now();
    await expect(withHardTimeout(hanging, 30)).rejects.toThrow('hard-timeout 30ms');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('底层先失败也原样透传', async () => {
    await expect(withHardTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });
});
