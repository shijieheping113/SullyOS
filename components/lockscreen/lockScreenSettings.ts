export const LOCK_SCREEN_SETTINGS_KEY = 'sully-lock-screen-v5';
export const LOCK_SCREEN_FOREGROUND = 'lock_screen_v5_foreground';

export interface LockScreenSettings {
  enabled: boolean;
  color: string;
  glass: Record<string, Record<string, number | boolean>>;
  pair: boolean;
  depth: boolean;
  position: number;
  clockPosition: number;
  clockSize: number;
  caption: string;
  weather: string;
  ring: 'day' | 'music' | 'moon';
}

export function readLockScreenSettings(): LockScreenSettings {
  let stored: Partial<LockScreenSettings> = {};
  try {
    const value = JSON.parse(localStorage.getItem(LOCK_SCREEN_SETTINGS_KEY) || '{}');
    if (value && typeof value === 'object') stored = value;
  } catch {}
  function number(value: unknown, fallback: number, min: number, max: number) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  }
  return {
    enabled: stored.enabled !== false,
    color: typeof stored.color === 'string' && /^#[\da-f]{6}$/i.test(stored.color) ? stored.color : '#ffffff',
    glass: stored.glass && typeof stored.glass === 'object' ? stored.glass : {},
    pair: stored.pair === true,
    depth: stored.depth === true,
    position: number(stored.position, 50, 0, 100),
    clockPosition: number(stored.clockPosition, 8.7, 6, 25),
    clockSize: number(stored.clockSize, 100, 75, 120),
    caption: typeof stored.caption === 'string' ? stored.caption.slice(0, 28) : '留一盏灯，等你回来。',
    weather: typeof stored.weather === 'string' ? stored.weather.slice(0, 24) : '☁ 22° · 多云',
    ring: stored.ring === 'music' || stored.ring === 'moon' ? stored.ring : 'day',
  };
}

export function saveLockScreenSettings(changes: Partial<LockScreenSettings>) {
  localStorage.setItem(LOCK_SCREEN_SETTINGS_KEY, JSON.stringify({ ...readLockScreenSettings(), ...changes }));
}
