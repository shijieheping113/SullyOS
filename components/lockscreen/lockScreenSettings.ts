export const LOCK_SCREEN_SETTINGS_KEY = 'sully-lock-screen-v5';
export const LOCK_SCREEN_FOREGROUND = 'lock_screen_v5_foreground';
export const LAST_PRIVATE_CHAT_KEY = 'sully-last-private-chat';
export type LockImageKind = 'lock' | 'home' | 'front';
export type LockImageChanges = Partial<Record<LockImageKind, string | null>>;

export const CLOCK_GLASS_SLIDERS = [
  { key: 'blurRadius', label: '模糊度', min: 0, max: 48, step: .01, initial: 13.6 },
  { key: 'saturation', label: '颜色鲜艳度', min: 0, max: 300, step: 1, initial: 200 },
  { key: 'fill', label: '白色底雾', min: 0, max: .6, step: .005, initial: .25 },
  { key: 'edgeStrength', label: '玻璃边缘', min: 0, max: 1, step: .001, initial: .526 },
  { key: 'sheen', label: '表面亮度', min: 0, max: .7, step: .01, initial: .17 },
  { key: 'shadow', label: '阴影', min: 0, max: .8, step: .01, initial: .39 },
  { key: 'inkOpacity', label: '自选颜色浓度', min: 0, max: 1, step: .01, initial: .59 },
] as const;
export const LOCK_GLASS_BLUR = CLOCK_GLASS_SLIDERS[0];
export const LIGHT_WALLPAPER_BLUR_OFFSET = 8;

export const LOCK_GLASS_REGIONS = [
  { id: 'clock', label: '大钟' },
  { id: 'caption', label: '锁屏文字' },
  { id: 'companion', label: '圆环与电量' },
  { id: 'notice', label: '消息卡片' },
  { id: 'player', label: '音乐卡片' },
  { id: 'flashlight', label: '聊天与相机' },
] as const;

export function isCardGlassRegion(region: string) {
  return ['notice', 'player', 'flashlight'].includes(region);
}

export function isRingGlassRegion(region: string) {
  return region === 'companion';
}

const cardGlassDefaults: Record<string, number> = { blurRadius: 5.28, saturation: 116, fill: 0, edgeStrength: .344, sheen: .07, shadow: .30 };

function bounded(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : undefined;
}

export function glassSliderValue(glass: LockScreenSettings['glass'], region: string, slider: typeof CLOCK_GLASS_SLIDERS[number]) {
  const values = glass[region];
  // Read existing strength controls as the actual blur and edge opacity they produced.
  if (slider.key === 'blurRadius') {
    const legacy = bounded(values?.blurAmount, 0, 1);
    const fallback = cardGlassDefaults.blurRadius;
    const regular = bounded(values?.blurRadius, slider.min, slider.max) ??
      (legacy === undefined ? region === 'clock' ? slider.initial : fallback : 4 + legacy * 32);
    const radius = region === 'clock' && values?.overLight === true
      ? bounded(values.lightBlurRadius, slider.min, slider.max) ?? Math.min(slider.max, regular + LIGHT_WALLPAPER_BLUR_OFFSET)
      : regular;
    return Math.round(radius * 100) / 100;
  }
  const value = bounded(values?.[slider.key], slider.min, slider.max);
  if (value !== undefined) return value;
  if (slider.key === 'edgeStrength') {
    const legacy = bounded(values?.edge, 0, 1);
    if (legacy !== undefined) return Math.round((.12 + legacy * .7) * 1000) / 1000;
  }
  if (isRingGlassRegion(region) && slider.key === 'shadow') return .5;
  if (isCardGlassRegion(region) || isRingGlassRegion(region)) return cardGlassDefaults[slider.key] ?? slider.initial;
  return region === 'clock' ? slider.initial : .5;
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
  const glass = stored.glass && typeof stored.glass === 'object' ? { ...stored.glass } : {};
  for (const [primary, secondary] of [['companion', 'battery'], ['flashlight', 'camera']]) {
    if (!glass[primary] && glass[secondary]) glass[primary] = glass[secondary];
    delete glass[secondary];
  }
  return {
    enabled: stored.enabled !== false,
    color: typeof stored.color === 'string' && /^#[\da-f]{6}$/i.test(stored.color) ? stored.color : '#ffffff',
    glass,
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
