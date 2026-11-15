export const LOCK_SCREEN_SETTINGS_KEY = 'sully-lock-screen-v5';
export const LOCK_SCREEN_FOREGROUND = 'lock_screen_v5_foreground';
export type LockImageKind = 'lock' | 'home' | 'front';
export type LockImageChanges = Partial<Record<LockImageKind, string | null>>;

export const CLOCK_GLASS_SLIDERS = [
  { key: 'blurAmount', label: '模糊度', min: 0, max: 1, step: .01, initial: .3 },
  { key: 'saturation', label: '颜色鲜艳度', min: 100, max: 200, step: 1, initial: 200 },
  { key: 'fill', label: '白色底雾', min: 0, max: .25, step: .005, initial: .25 },
  { key: 'edge', label: '玻璃边缘', min: 0, max: 1, step: .01, initial: .58 },
  { key: 'sheen', label: '表面亮度', min: 0, max: .35, step: .01, initial: .17 },
  { key: 'shadow', label: '阴影', min: 0, max: .5, step: .01, initial: .39 },
  { key: 'inkOpacity', label: '自选颜色浓度', min: 0, max: 1, step: .01, initial: .59 },
] as const;

export const LOCK_GLASS_REGIONS = [
  { id: 'clock', label: '大钟' },
  { id: 'caption', label: '锁屏文字' },
  { id: 'companion', label: '中间圆环' },
  { id: 'battery', label: '电量图标' },
  { id: 'notice', label: '消息卡片' },
  { id: 'player', label: '音乐卡片' },
  { id: 'flashlight', label: '手电按钮' },
  { id: 'camera', label: '相机按钮' },
] as const;

export function isCardGlassRegion(region: string) {
  return ['notice', 'player', 'flashlight', 'camera'].includes(region);
}

const cardGlassDefaults: Record<string, number> = { blurAmount: .04, saturation: 116, fill: 0, edge: .32, sheen: .07, shadow: .30 };

export function glassSliderValue(glass: LockScreenSettings['glass'], region: string, slider: typeof CLOCK_GLASS_SLIDERS[number]) {
  const value = glass[region]?.[slider.key];
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(slider.min, Math.min(slider.max, value));
  if (isCardGlassRegion(region)) return cardGlassDefaults[slider.key] ?? slider.initial;
  return region === 'clock' ? slider.initial : slider.max;
}

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
    weather: typeof stored.weather === 'string' && stored.weather !== '☁ 22° · 多云' ? stored.weather.slice(0, 24) : '',
    ring: stored.ring === 'music' || stored.ring === 'moon' ? stored.ring : 'day',
  };
}

export function saveLockScreenSettings(changes: Partial<LockScreenSettings>) {
  localStorage.setItem(LOCK_SCREEN_SETTINGS_KEY, JSON.stringify({ ...readLockScreenSettings(), ...changes }));
}
