// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAwayAlarmTimers, requestAwayMessageReschedule, startAwayMessageScheduler, type AwayAlarm } from './awayMessageScheduler';

let scheduler: ReturnType<typeof startAwayMessageScheduler> | undefined;
let sw: EventTarget & { controller: { postMessage: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  sw = Object.assign(new EventTarget(), { controller: { postMessage: vi.fn() } });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
});
afterEach(() => {
  scheduler?.dispose(); scheduler = undefined;
  vi.useRealTimers(); vi.restoreAllMocks();
  delete (navigator as any).serviceWorker;
});

it('SW alarm is one-shot, repeated sync does not rearm it, and a new user message rearms it', async () => {
  const fire = vi.fn();
  const timers = createAwayAlarmTimers(fire);
  const alarm = { charId: 'a', lastUserAt: Date.now(), dueAt: Date.now() + 1000 };
  timers.sync([alarm]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fire).toHaveBeenCalledTimes(1);
  expect(timers.pending).toBe(false);
  timers.sync([alarm]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(fire).toHaveBeenCalledTimes(1);
  timers.sync([{ ...alarm, lastUserAt: Date.now(), dueAt: Date.now() + 2000 }]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(fire).toHaveBeenCalledTimes(2);
  timers.stop();
});

it('SW cancels the previous deadline after settings change or disabling', async () => {
  const fire = vi.fn();
  const timers = createAwayAlarmTimers(fire);
  const alarm = { charId: 'a', lastUserAt: Date.now(), dueAt: Date.now() + 1000 };
  timers.sync([alarm]); timers.sync([{ ...alarm, dueAt: Date.now() + 3000 }]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fire).not.toHaveBeenCalled();
  timers.sync([]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(fire).not.toHaveBeenCalled();
  expect(timers.pending).toBe(false);
});

it('web timer generates while hidden without opening a chat and stops after success', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  let alarms: AwayAlarm[] = [{ charId: 'a', lastUserAt: Date.now(), dueAt: Date.now() + 1000 }];
  const run = vi.fn(async () => { alarms = []; });
  scheduler = startAwayMessageScheduler({ readAlarms: async () => alarms, run });
  await scheduler.refresh();
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(run).toHaveBeenCalledTimes(1);
  expect(sw.controller.postMessage).toHaveBeenLastCalledWith({ type: 'away-sync', alarms: [] });
});

it('a user message immediately moves the deadline; a stale SW trigger cannot generate early', async () => {
  let alarms: AwayAlarm[] = [{ charId: 'a', lastUserAt: Date.now(), dueAt: Date.now() + 1000 }];
  const run = vi.fn(async () => { alarms = []; });
  scheduler = startAwayMessageScheduler({ readAlarms: async () => alarms, run });
  await scheduler.refresh();
  await vi.advanceTimersByTimeAsync(500);
  alarms = [{ charId: 'a', lastUserAt: Date.now(), dueAt: Date.now() + 40_000 }];
  requestAwayMessageReschedule(); await scheduler.refresh();
  sw.dispatchEvent(new MessageEvent('message', { data: { type: 'away-trigger', charId: 'a' } }));
  await vi.advanceTimersByTimeAsync(39_999);
  expect(run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(1);
});

it('SW and foreground catch-up share an in-flight check, and disposal cancels web timers', async () => {
  let finish!: () => void;
  let alarms: AwayAlarm[] = [{ charId: 'a', lastUserAt: 1, dueAt: Date.now() }];
  const run = vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); alarms = []; });
  scheduler = startAwayMessageScheduler({ readAlarms: async () => alarms, run });
  await vi.advanceTimersByTimeAsync(0);
  sw.dispatchEvent(new MessageEvent('message', { data: { type: 'away-trigger' } }));
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(40_000);
  expect(run).toHaveBeenCalledTimes(1);
  finish(); await scheduler.refresh();
  scheduler.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it('controller replacement resends alarms and shutdown during an async read never generates', async () => {
  const alarms = [{ charId: 'a', lastUserAt: 1, dueAt: Date.now() + 60_000 }];
  scheduler = startAwayMessageScheduler({ readAlarms: async () => alarms, run: vi.fn() });
  await scheduler.refresh(); sw.controller.postMessage.mockClear();
  sw.dispatchEvent(new Event('controllerchange')); await scheduler.refresh();
  expect(sw.controller.postMessage).toHaveBeenCalledWith({ type: 'away-sync', alarms });
  scheduler.dispose();
  let resolve!: (alarms: AwayAlarm[]) => void;
  const run = vi.fn();
  scheduler = startAwayMessageScheduler({ readAlarms: () => new Promise(r => { resolve = r; }), run });
  scheduler.dispose(); resolve([{ ...alarms[0], dueAt: Date.now() }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(run).not.toHaveBeenCalled();
});
