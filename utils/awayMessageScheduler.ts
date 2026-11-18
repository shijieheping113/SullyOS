/** 本地离开后闹钟。只传角色 ID 和到期时间，不保存聊天、API 或密钥。 */
export interface AwayAlarm {
  charId: string;
  lastUserAt: number;
  dueAt: number;
}

export const AWAY_SCHEDULE_CHANGED = 'away-message-schedule-changed';
const CHECK_INTERVAL_MS = 20_000;

export const requestAwayMessageReschedule = (): void => {
  window.dispatchEvent(new Event(AWAY_SCHEDULE_CHANGED));
};

/** SW 的单次闹钟；同一排期同步多次也只响一次，改期或取消会清除原计时器。 */
export function createAwayAlarmTimers(fire: (alarm: AwayAlarm) => void, changed: () => void = () => {}) {
  const entries = new Map<string, { alarm: AwayAlarm; timer: ReturnType<typeof setTimeout> | null }>();
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (entry?.timer != null) clearTimeout(entry.timer);
    entries.delete(id);
  };
  return {
    get pending() { return Array.from(entries.values()).some(entry => entry.timer != null); },
    sync(alarms: AwayAlarm[]) {
      const valid = alarms.filter(a => a && typeof a.charId === 'string'
        && Number.isFinite(a.lastUserAt) && Number.isFinite(a.dueAt));
      const ids = new Set(valid.map(a => a.charId));
      for (const id of entries.keys()) if (!ids.has(id)) remove(id);
      for (const alarm of valid) {
        const previous = entries.get(alarm.charId);
        if (previous?.alarm.dueAt === alarm.dueAt && previous.alarm.lastUserAt === alarm.lastUserAt) continue;
        remove(alarm.charId);
        const entry = { alarm, timer: null as ReturnType<typeof setTimeout> | null };
        const arm = () => {
          entry.timer = setTimeout(() => {
            if (Date.now() < alarm.dueAt) { arm(); return; }
            entry.timer = null;
            changed();
            fire(alarm);
          }, Math.min(Math.max(alarm.dueAt - Date.now(), 0), 2_147_000_000));
        };
        entries.set(alarm.charId, entry);
        arm();
      }
      changed();
    },
    stop() {
      for (const id of entries.keys()) remove(id);
      changed();
    },
  };
}

/** 所有触发先重新读消息，旧 SW 闹钟和网页兜底不能绕过开口改期/已发标记。 */
export function startAwayMessageScheduler(deps: {
  readAlarms: () => Promise<AwayAlarm[]>;
  run: () => Promise<void>;
}) {
  let stopped = false;
  let active: Promise<void> | null = null;
  let again = false;
  let precise: ReturnType<typeof setTimeout> | null = null;
  let lastAttempt = -Infinity;
  const worker = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  const post = (alarms: AwayAlarm[]) => {
    try { worker?.controller?.postMessage({ type: 'away-sync', alarms }); } catch { /* 网页计时继续兜底 */ }
  };
  const publish = (alarms: AwayAlarm[]) => {
    if (stopped) return;
    post(alarms);
    if (precise != null) clearTimeout(precise);
    precise = null;
    if (!alarms.length) return;
    const due = Math.min(...alarms.map(a => a.dueAt));
    // 忙碌/失败/未配置 API 时也不高频空转，周期检查会继续兜底。
    const delay = Math.max(500, due - Date.now(), lastAttempt + CHECK_INTERVAL_MS - Date.now());
    precise = setTimeout(wake, Math.min(delay, 2_147_000_000));
  };
  const refresh = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (active) { again = true; return active; }
    active = (async () => {
      do {
        again = false;
        let alarms = await deps.readAlarms();
        if (stopped) return;
        if (alarms.some(a => a.dueAt <= Date.now()) && Date.now() - lastAttempt >= CHECK_INTERVAL_MS) {
          lastAttempt = Date.now();
          await deps.run();
          if (stopped) return;
          alarms = await deps.readAlarms();
        }
        publish(alarms);
      } while (again && !stopped);
    })().catch(error => console.warn('[AwayMessage] 本地排期检查失败', error)).finally(() => { active = null; });
    return active;
  };
  function wake() { void refresh(); }
  const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
  const onWorker = (event: MessageEvent) => { if (event.data?.type === 'away-trigger') wake(); };
  worker?.addEventListener('message', onWorker);
  worker?.addEventListener('controllerchange', wake);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener(AWAY_SCHEDULE_CHANGED, wake);
  const periodic = setInterval(wake, CHECK_INTERVAL_MS);
  wake();
  return {
    refresh,
    dispose() {
      stopped = true;
      clearInterval(periodic);
      if (precise != null) clearTimeout(precise);
      post([]);
      worker?.removeEventListener('message', onWorker);
      worker?.removeEventListener('controllerchange', wake);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener(AWAY_SCHEDULE_CHANGED, wake);
    },
  };
}
