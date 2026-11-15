// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { launcherUnlockMotion, usesV5DesktopEntry } from '../components/lockscreen/launcherUnlockMotion';
import { mountLockScreen, unlockFrameSeconds, unlockIconProgress, unlockReleaseDuration, unlockReleaseFrame } from '../components/lockscreen/lockScreenMotion';
import { readLockScreenSettings } from '../components/lockscreen/lockScreenSettings';
import markup from '../components/lockscreen/lockScreen.html?raw';

describe('lock screen handoff', () => {
  it.each([false, true])('only shows the relock control inside the editor (%s)', editor => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const root = document.createElement('div');
    root.innerHTML = markup;
    const unlock = vi.fn();
    const motion = mountLockScreen(root, {
      editor, reveal: false, settings: readLockScreenSettings(),
      wallpapers: { lock: '', home: '', front: '' },
      unlock, requestPermission() {}, save() {}, async saveImage() {},
    });
    try {
      root.querySelector('#unlockZone')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(unlock).toHaveBeenCalledOnce();
      expect(root.querySelector<HTMLElement>('#homeTools')!.hidden).toBe(!editor);
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
    });
    const motion = mountLockScreen(root, {
      editor: false, reveal: true, holdReveal: true, settings: readLockScreenSettings(),
      wallpapers: { lock: '', home: '', front: '' },
      unlock, requestPermission() {}, save() {}, async saveImage() {},
    });
    try {
      expect(wallpaper.style.filter).toBe('blur(10px)');
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
    launcher.innerHTML = '<div class="animate-fade-in" data-unlock-page="active"><div data-unlock-cell="0"></div><div data-unlock-widget></div></div>';
    const grid = launcher.firstElementChild!;
    const cell = launcher.querySelector<HTMLElement>('[data-unlock-cell]')!;
    const widget = launcher.querySelector<HTMLElement>('[data-unlock-widget]')!;
    const desktop = launcherUnlockMotion(launcher);

    desktop.draw(.5);
    expect(cell.style.transform).toContain('translate3d');
    expect(widget.style.transform).toContain('translate3d');
    desktop.draw(1);
    desktop.finish();
    desktop.clear();
    expect(cell.style.transform).toBe('');
    expect(widget.style.transform).toBe('');
    expect(launcher.hasAttribute('data-unlock-animating')).toBe(false);
    expect(grid.hasAttribute('data-unlock-entered')).toBe(true);
  });
});
