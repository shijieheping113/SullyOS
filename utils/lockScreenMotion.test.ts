// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { launcherUnlockMotion, usesV5DesktopEntry } from '../components/lockscreen/launcherUnlockMotion';
import { mountLockScreen, unlockFrameSeconds, unlockIconProgress, unlockReleaseDuration, unlockReleaseFrame } from '../components/lockscreen/lockScreenMotion';
import { CLOCK_GLASS_SLIDERS, LOCK_GLASS_BLUR, LOCK_SCREEN_SETTINGS_KEY, glassSliderValue, normalizeLockScreenShade, readLockScreenSettings, saveLockScreenSettings } from '../components/lockscreen/lockScreenSettings';
import { bindLockScreenMedia } from '../components/lockscreen/lockScreenMedia';
import markup from '../components/lockscreen/lockScreen.html?raw';

describe('lock screen handoff', () => {
  it('uses current shade defaults for missing settings and saves the two ends independently', () => {
    localStorage.setItem(LOCK_SCREEN_SETTINGS_KEY, JSON.stringify({ glass: { clock: { shadow: .62 } }, caption: '保留文字' }));
    try {
      const defaults = { top: { enabled: true, strength: .09, range: 16 }, bottom: { enabled: true, strength: .15, range: 24 } };
      expect(readLockScreenSettings().shade).toEqual(defaults);
      saveLockScreenSettings({ shade: { ...defaults, top: { enabled: false, strength: .57, range: 70 } } });
      const saved = readLockScreenSettings();
      expect(saved.shade).toEqual({ ...defaults, top: { enabled: false, strength: .57, range: 70 } });
      expect(saved.glass).toEqual({ clock: { shadow: .62 } });
      expect(saved.caption).toBe('保留文字');
      expect(normalizeLockScreenShade({ top: { strength: NaN, range: -1 }, bottom: { strength: 2, range: 101 } })).toEqual(defaults);
      expect(normalizeLockScreenShade({ top: null }).top).toEqual(defaults.top);
      expect(normalizeLockScreenShade({ top: { strength: 0, range: 0 }, bottom: { strength: 1, range: 100 } })).toEqual({
        top: { enabled: true, strength: 0, range: 0 }, bottom: { enabled: true, strength: 1, range: 100 },
      });
    } finally {
      localStorage.removeItem(LOCK_SCREEN_SETTINGS_KEY);
    }
  });

  it('previews independent wallpaper shades without changing glass or interrupting the unlock fade', () => {
    const root = document.createElement('div');
    root.innerHTML = markup;
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const initial = readLockScreenSettings();
    const motion = mountLockScreen(root, {
      editor: false, reveal: false, settings: initial,
      wallpapers: { lock: '', front: '' }, unlock() {}, requestPermission() {},
    });
    try {
      const phone = root.querySelector<HTMLElement>('#phone')!;
      const shade = root.querySelector<HTMLElement>('.shade')!;
      const glass = root.querySelector<HTMLElement>('.clock-glass-face')!;
      const glassBefore = glass.style.cssText;
      const next = { ...initial, shade: { top: { enabled: false, strength: .7, range: 60 }, bottom: { enabled: true, strength: .5, range: 80 } } };
      motion.setSettings(next);
      expect(phone.style.getPropertyValue('--shade-top-strength')).toBe('0');
      expect(phone.style.getPropertyValue('--shade-bottom-strength')).toBe('0.5');
      expect(phone.style.getPropertyValue('--shade-bottom-range')).toBe('80%');
      motion.setSettings({ ...next, shade: { ...next.shade, top: { ...next.shade.top, enabled: true } } });
      expect(phone.style.getPropertyValue('--shade-top-strength')).toBe('0.7');
      motion.setSettings({ ...next, shade: { ...next.shade, bottom: { ...next.shade.bottom, range: 0 } } });
      expect(phone.style.getPropertyValue('--shade-bottom-strength')).toBe('0');
      expect(glass.style.cssText).toBe(glassBefore);
      root.querySelector('#unlockZone')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(shade.style.opacity).toBe('0');
      motion.setSettings(initial);
      expect(shade.style.opacity).toBe('0');
      expect(phone.style.getPropertyValue('--shade-top-strength')).toBe('0.09');
      expect(phone.style.getPropertyValue('--shade-bottom-strength')).toBe('0.15');
      expect(glass.style.cssText).toBe(glassBefore);
    } finally {
      motion.dispose();
      canvas.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('adds the current weather glyph and leaves custom fallback text as written', () => {
    const root = document.createElement('div');
    root.innerHTML = markup;
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const motion = mountLockScreen(root, {
      editor: true, reveal: false, settings: { ...readLockScreenSettings(), weather: '自己的天气文字' },
      wallpapers: { lock: '', front: '' }, unlock() {}, requestPermission() {},
    });
    try {
      const weather = root.querySelector('#lockWeather')!;
      const glyph = root.querySelector<HTMLElement>('#lockWeatherIcon')!;
      const text = root.querySelector('#lockWeatherText')!;
      expect(weather.textContent).toBe('自己的天气文字');
      motion.setWeather('22° · 多云', '03d');
      expect(glyph.textContent).toBe('☁︎');
      expect(glyph.hidden).toBe(false);
      expect(text.textContent).toBe('22° · 多云');
      expect(text.nextElementSibling).toBe(glyph);
      motion.setWeather('17° · 晴', '01n');
      expect(glyph.textContent).toBe('☾');
      expect(text.textContent).toBe('17° · 晴');
      motion.setWeather('19°', '99d');
      expect(weather.textContent).toBe('19°');
      expect(glyph.hidden).toBe(true);
      motion.setWeather('');
      expect(weather.textContent).toBe('自己的天气文字');
    } finally {
      motion.dispose();
      canvas.mockRestore();
    }
  });

  it('keeps the old effective glass settings and permits separate zero blur on light wallpaper', () => {
    const edge = CLOCK_GLASS_SLIDERS.find(slider => slider.key === 'edgeStrength')!;
    const shadow = CLOCK_GLASS_SLIDERS.find(slider => slider.key === 'shadow')!;
    const legacy = { clock: { blurAmount: .3, blurPx: 99, overLight: true, edge: .58 }, player: { blurAmount: .04, edge: 0 } };
    expect(glassSliderValue(legacy, 'clock', LOCK_GLASS_BLUR)).toBe(21.6);
    expect(glassSliderValue(legacy, 'player', LOCK_GLASS_BLUR)).toBe(5.28);
    expect(glassSliderValue(legacy, 'clock', edge)).toBe(.526);
    expect(glassSliderValue(legacy, 'player', edge)).toBe(.12);
    expect(glassSliderValue(legacy, 'caption', shadow)).toBe(.5);
    const updated = { ...legacy, clock: { ...legacy.clock, blurRadius: 24, lightBlurRadius: 0 } };
    expect(glassSliderValue(updated, 'clock', LOCK_GLASS_BLUR)).toBe(0);
    updated.clock.overLight = false;
    expect(glassSliderValue(updated, 'clock', LOCK_GLASS_BLUR)).toBe(24);
  });

  it('paints zero blur and edge independently from the expanded maxima', () => {
    const root = document.createElement('div');
    root.innerHTML = markup;
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const motion = mountLockScreen(root, {
      editor: true, reveal: false, settings: readLockScreenSettings(),
      wallpapers: { lock: '', front: '' }, unlock() {}, requestPermission() {},
    });
    try {
      const clock = root.querySelector<HTMLElement>('.clock-glass-face')!.style;
      const player = root.querySelector<HTMLElement>('#player')!.style;
      expect(clock.getPropertyValue('--blur-px')).toBe('13.6px');
      expect(player.getPropertyValue('--blur-px')).toBe('5.28px');
      motion.setSettings({
        ...readLockScreenSettings(),
        glass: { clock: { overLight: true, lightBlurRadius: 0, edgeStrength: 0, inkOpacity: 0 },
          player: { blurRadius: 48, saturation: 300, sheen: .7, shadow: .8, fill: .6, edgeStrength: 1 },
          companion: { blurRadius: 22, fill: .26 }, flashlight: { blurRadius: 0 } },
      });
      for (const key of ['--rim', '--rim-soft', '--edge-ring', '--clock-ink-opacity']) {
        expect(clock.getPropertyValue(key)).toBe('0');
      }
      expect(clock.getPropertyValue('--blur-px')).toBe('0px');
      expect(player.getPropertyValue('--blur-px')).toBe('48px');
      expect(player.getPropertyValue('--sat')).toBe('300%');
      expect(player.getPropertyValue('--edge-ring')).toBe('1');
      expect(player.getPropertyValue('--fill')).toBe('0.6');
      expect(player.getPropertyValue('--sheen')).toBe('0.7');
      expect(player.getPropertyValue('--shadow')).toBe('0.8');
      const battery = root.querySelector<HTMLElement>('#batteryDetails .ring-glass-face')!.style;
      const companion = root.querySelector<HTMLElement>('#companionRing .ring-glass-face')!.style;
      expect(battery.getPropertyValue('--blur-px')).toBe('22px');
      expect(battery.getPropertyValue('--fill')).toBe('0.26');
      expect(companion.getPropertyValue('--blur-px')).toBe('22px');
      expect(root.querySelector<HTMLElement>('#lockCamera')!.style.getPropertyValue('--blur-px')).toBe('0px');
      expect(root.querySelector<HTMLElement>('#lockChat')!.style.getPropertyValue('--blur-px')).toBe('0px');
    } finally {
      motion.dispose();
      canvas.mockRestore();
    }
  });

  it('merges separate older glass settings into the shared controls', () => {
    localStorage.setItem(LOCK_SCREEN_SETTINGS_KEY, JSON.stringify({
      glass: { companion: { blurRadius: 10 }, battery: { blurRadius: 22 }, camera: { fill: .26 } },
    }));
    try {
      expect(readLockScreenSettings().glass).toEqual({ companion: { blurRadius: 10 }, flashlight: { fill: .26 } });
    } finally {
      localStorage.removeItem(LOCK_SCREEN_SETTINGS_KEY);
    }
  });

  it('requires a separate unlock gesture after the shortcut is selected', () => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const root = document.createElement('div');
    root.innerHTML = markup;
    const phone = root.querySelector<HTMLElement>('#phone')!;
    phone.setPointerCapture = vi.fn();
    Object.defineProperty(phone, 'clientHeight', { value: 844 });
    const chat = root.querySelector('#lockChat')!;
    const hint = root.querySelector<HTMLElement>('#lockChatHint')!;
    const zone = root.querySelector('#unlockZone')!;
    const openRecentChat = vi.fn();
    const unlock = vi.fn();
    const desktop = { draw: vi.fn(), finish: vi.fn(), clear: vi.fn() };
    const motion = mountLockScreen(root, {
      editor: false, reveal: false, settings: readLockScreenSettings(),
      wallpapers: { lock: '', front: '' }, unlock, openRecentChat, desktop, requestPermission() {},
    });
    const pointer = (name: string, target = chat, y = 700) => {
      const event = new PointerEvent(name, { bubbles: true, clientX: 50, clientY: y });
      Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: 1 } });
      target.dispatchEvent(event);
    };
    try {
      pointer('pointerdown');
      expect(chat.hasAttribute('data-pressed')).toBe(true);
      pointer('pointerup');
      vi.advanceTimersByTime(500);
      expect(openRecentChat).not.toHaveBeenCalled();
      pointer('pointerdown');
      vi.advanceTimersByTime(450);
      expect(openRecentChat).not.toHaveBeenCalled();
      expect(hint.hidden).toBe(false);
      pointer('pointerup');
      expect(openRecentChat).not.toHaveBeenCalled();
      expect(phone.hidden).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(hint.hidden).toBe(true);
      pointer('pointerdown');
      vi.advanceTimersByTime(450);
      pointer('pointerup');
      pointer('pointerdown', zone, 780);
      pointer('pointermove', zone, 430);
      expect(openRecentChat).not.toHaveBeenCalled();
      pointer('pointerup', zone, 430);
      expect(openRecentChat).toHaveBeenCalledOnce();
      expect(unlock).not.toHaveBeenCalled();
      expect(desktop.draw.mock.calls.every(([progress]) => progress === 0)).toBe(true);
      expect(desktop.finish).not.toHaveBeenCalled();
      expect(phone.hidden).toBe(true);
    } finally {
      motion.dispose();
      canvas.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('prepares responsive wallpaper layers using the saved crop, without the removed prototype control', () => {
    const root = document.createElement('div');
    root.innerHTML = markup;
    const drawings = vi.fn();
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      filter: 'none', fillRect: vi.fn(), drawImage: drawings,
    } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    const phone = root.querySelector('#phone')!;
    Object.defineProperties(phone, { clientWidth: { value: 390 }, clientHeight: { value: 844 } });
    const source = new Image();
    Object.defineProperties(source, { naturalWidth: { value: 3000 }, naturalHeight: { value: 5000 } });
    const motion = mountLockScreen(root, {
      editor: false, reveal: true, holdReveal: true, settings: { ...readLockScreenSettings(), position: 72 },
      wallpapers: { lock: '/photo.jpg', front: '' }, unlock() {}, requestPermission() {},
    });
    try {
      motion.prepareWakeWallpaper(source, true);
      const sharp = root.querySelector<HTMLCanvasElement>('#lockWallpaper canvas')!;
      expect(sharp).toBeTruthy();
      expect(sharp.height).toBeLessThanOrEqual(1600);
      expect(root.querySelectorAll('#wakeWallpaper canvas')).toHaveLength(2);
      expect(drawings.mock.calls.filter(([image]) => image === source)).toHaveLength(1);
    } finally {
      motion.dispose();
      canvas.mockRestore();
    }
  });

  it('keeps the visible notification during a gesture and animates each new message once', () => {
    const root = document.createElement('div');
    root.innerHTML = markup;
    const notice = root.querySelector<HTMLButtonElement>('#notice')!;
    const animation = { cancel: vi.fn(), onfinish: () => {} };
    notice.animate = vi.fn(() => animation as unknown as Animation);
    const openNotice = vi.fn();
    let atRest = true;
    const media = bindLockScreenMedia(root, {
      atRest: () => atRest, reducedMotion: () => false, openNotice, updateMusicRing() {},
    });
    const message = { key: 'a:1', charId: 'a', name: '角色甲', text: '新消息', count: 1, avatar: '', timestamp: 123456789 };
    media.setNotice(message);
    expect(notice.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 580 }));
    media.setNotice({ ...message, count: 2 });
    expect(notice.animate).toHaveBeenCalledTimes(1);
    expect(root.querySelector<HTMLElement>('#noticeStack')?.dataset.layers).toBe('1');
    media.setNotice({ ...message, count: 5 });
    expect(root.querySelector<HTMLElement>('#noticeStack')?.dataset.layers).toBe('2');
    atRest = false;
    media.setNotice({ ...message, key: 'b:2', charId: 'b' });
    expect(media.noticeTarget()).toBe('a');
    expect(notice.animate).toHaveBeenCalledTimes(1);
    atRest = true;
    media.flushNotice();
    notice.click();
    expect(openNotice).toHaveBeenCalledWith('b');
    expect(notice.animate).toHaveBeenCalledTimes(2);
    media.setNotice(null);
    expect(notice.tabIndex).toBe(-1);
    animation.onfinish();
    expect(notice.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#noticeStack')?.hidden).toBe(true);
  });

  it('paints the shared paused track, lyric and progress, and seeks only after the range commits', () => {
    const root = document.createElement('div');
    root.innerHTML = markup;
    const player = { toggle: vi.fn(), prev: vi.fn(), next: vi.fn(), seek: vi.fn() };
    const media = bindLockScreenMedia(root, {
      player, atRest: () => true, reducedMotion: () => false, openNotice() {}, updateMusicRing() {},
    });
    const song = {
      id: 1, title: '正在听', artist: '演唱者', art: '', lyric: '当前一句',
      playing: false, progress: 19, duration: 95, seekable: true,
    };
    media.setPlayer(song);
    const seek = root.querySelector<HTMLInputElement>('#playerSeek')!;
    expect(root.querySelector<HTMLElement>('#player')!.hidden).toBe(false);
    expect(root.querySelector('#trackTitle')!.textContent).toBe('正在听 — 演唱者');
    expect(root.querySelector('#playerLyric')!.parentElement).toBe(root.querySelector('#trackTitle')!.parentElement);
    expect(root.querySelector('#playerLyric')!.textContent).toBe('当前一句');
    expect(media.musicFraction()).toBe(.2);
    seek.value = '500';
    seek.dispatchEvent(new Event('input'));
    expect(player.seek).not.toHaveBeenCalled();
    seek.dispatchEvent(new Event('change'));
    expect(player.seek).toHaveBeenCalledWith(.5);
    expect(media.musicFraction()).toBe(.5);
    root.querySelector<HTMLButtonElement>('#playerToggle')!.click();
    root.querySelector<HTMLButtonElement>('#playerNext')!.click();
    expect(player.toggle).toHaveBeenCalledOnce();
    expect(player.next).toHaveBeenCalledOnce();
    media.setMoving(true);
    media.setPlayer({ ...song, lyric: '过渡中的歌词', progress: 57 });
    expect(root.querySelector('#playerLyric')!.textContent).toBe('当前一句');
    media.setMoving(false);
    expect(root.querySelector('#playerLyric')!.textContent).toBe('过渡中的歌词');
    expect(media.musicFraction()).toBe(.6);
    media.setPlayer(null);
    expect(root.querySelector<HTMLElement>('#player')!.hidden).toBe(true);
    media.dispose();
  });

  it('does not let a second swipe take over once an unlock is committed', () => {
    const root = document.createElement('div');
    root.innerHTML = markup;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('PointerEvent', MouseEvent);
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const phone = root.querySelector<HTMLElement>('#phone')!;
    phone.setPointerCapture = vi.fn();
    const unlock = vi.fn();
    const motion = mountLockScreen(root, {
      editor: false, reveal: false, settings: readLockScreenSettings(),
      wallpapers: { lock: '', front: '' }, unlock, requestPermission() {},
    });
    try {
      motion.draw(.4);
      root.querySelector('#unlockZone')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      const down = new PointerEvent('pointerdown', { clientX: 150, clientY: 300 });
      Object.defineProperty(down, 'isPrimary', { value: true });
      phone.dispatchEvent(down);
      expect(unlock).not.toHaveBeenCalled();
      expect(phone.setPointerCapture).not.toHaveBeenCalled();
    } finally {
      motion.dispose();
      canvas.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it.each([false, true])('keeps preview isolated from unlock (%s)', editor => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const root = document.createElement('div');
    root.innerHTML = markup;
    const unlock = vi.fn();
    const motion = mountLockScreen(root, {
      editor, reveal: false, settings: readLockScreenSettings(),
      wallpapers: { lock: '', front: '' },
      unlock, requestPermission() {},
    });
    try {
      root.querySelector('#unlockZone')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(unlock).toHaveBeenCalledTimes(editor ? 0 : 1);
      expect(root.querySelector('#homeTools')).toBeNull();
    } finally {
      motion.dispose();
      vi.unstubAllGlobals();
      canvas.mockRestore();
    }
  });

  it('clears wake blur and removes the lock painter before handing off to the desktop', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const root = document.createElement('div');
    root.innerHTML = markup;
    const wallpaper = root.querySelector<HTMLElement>('#lockWallpaper')!;
    const phone = root.querySelector<HTMLElement>('#phone')!;
    const unlock = vi.fn(() => {
      expect(phone.hidden).toBe(true);
      expect(wallpaper.style.filter).toBe('none');
      expect(wallpaper.style.transform).toBe('scale(1)');
      expect(wallpaper.style.opacity).toBe('0');
    });
    const motion = mountLockScreen(root, {
      editor: false, reveal: true, holdReveal: true, settings: readLockScreenSettings(),
      wallpapers: { lock: '', front: '' },
      unlock, requestPermission() {},
    });
    try {
      expect(wallpaper.style.filter).toBe('blur(10px)');
      expect(root.querySelector('#homeWallpaperLayer')).toBeNull();
      root.querySelector('#unlockZone')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(unlock).toHaveBeenCalledOnce();
    } finally {
      motion.dispose();
      vi.unstubAllGlobals();
      canvas.mockRestore();
    }
  });

  it('uses the custom entrance only on the three supported desktop styles', () => {
    expect([undefined, 'default', 'animalcrossing'].every(skin => usesV5DesktopEntry(skin as Parameters<typeof usesV5DesktopEntry>[0]))).toBe(true);
    expect((['homely', 'companion', 'tamagotchi', 'mobilegame'] as const).some(usesV5DesktopEntry)).toBe(false);
  });
  it('keeps the frozen v5 release timing and distinct icon entrance', () => {
    const from = .4;
    const icons = unlockIconProgress(from);
    expect(unlockReleaseDuration(from, .4)).toBe(639);
    expect(unlockReleaseDuration(from, 1.6)).toBe(621);
    expect(unlockReleaseFrame(from, icons, true, 0)).toEqual({ progress: from, icons });
    expect(unlockReleaseFrame(from, icons, true, .12).icons).toBe(icons);
    expect(unlockReleaseFrame(from, icons, true, .56).icons).toBeCloseTo((1 + icons) / 2);
    expect(unlockReleaseFrame(from, icons, true, 1)).toEqual({ progress: 1, icons: 1 });
    expect(unlockReleaseFrame(from, icons, false, .5).progress).toBeCloseTo(.05);
    expect(unlockIconProgress(1)).toBe(.73);
  });

  it('keeps a visible desktop entrance after a frame stalls', () => {
    const elapsed = unlockFrameSeconds(20, 820);
    expect(elapsed).toBe(.032);
    const { icons } = unlockReleaseFrame(1, unlockIconProgress(1), true, elapsed / .58);
    expect(icons).toBe(.73);
  });

  it('keeps the entered grid from restarting its original fade on cleanup', () => {
    const launcher = document.createElement('div');
    launcher.innerHTML = '<div class="animate-fade-in" data-unlock-page="active"><div data-unlock-cell="0"></div><div data-unlock-widget data-unlock-backdrop></div></div>';
    const grid = launcher.firstElementChild!;
    const cell = launcher.querySelector<HTMLElement>('[data-unlock-cell]')!;
    const widget = launcher.querySelector<HTMLElement>('[data-unlock-widget]')!;
    const desktop = launcherUnlockMotion(launcher);

    desktop.draw(.05);
    const earlyAlpha = Number(widget.style.getPropertyValue('--unlock-preview-alpha'));
    expect(earlyAlpha).toBeGreaterThan(0);
    expect(earlyAlpha).toBeLessThan(.1);
    expect(widget.style.getPropertyValue('--unlock-preview-softness')).toContain('blur(');
    desktop.draw(.5);
    expect(cell.style.transform).toContain('translate3d');
    expect(widget.style.transform).toContain('translate3d');
    expect(widget.style.opacity).toBe('');
    expect(Number(widget.style.getPropertyValue('--unlock-preview-alpha'))).toBeGreaterThan(earlyAlpha);
    desktop.draw(1);
    expect(widget.style.getPropertyValue('--unlock-preview-alpha')).toBe('1');
    expect(widget.style.getPropertyValue('--unlock-preview-softness')).toBe('none');
    desktop.finish();
    desktop.clear();
    expect(cell.style.transform).toBe('');
    expect(widget.style.transform).toBe('');
    expect(widget.style.getPropertyValue('--unlock-preview-alpha')).toBe('');
    expect(widget.style.getPropertyValue('--unlock-preview-softness')).toBe('');
    expect(launcher.hasAttribute('data-unlock-animating')).toBe(false);
    expect(grid.hasAttribute('data-unlock-entered')).toBe(true);
  });
});
