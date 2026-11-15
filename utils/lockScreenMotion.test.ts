// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { launcherUnlockMotion, usesV5DesktopEntry } from '../components/lockscreen/launcherUnlockMotion';
import { mountLockScreen, unlockFrameSeconds, unlockIconProgress, unlockReleaseDuration, unlockReleaseFrame } from '../components/lockscreen/lockScreenMotion';
import { readLockScreenSettings } from '../components/lockscreen/lockScreenSettings';
import { bindLockScreenMedia } from '../components/lockscreen/lockScreenMedia';
import markup from '../components/lockscreen/lockScreen.html?raw';

describe('lock screen handoff', () => {
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
    expect(notice.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 300 }));
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

    desktop.draw(.5);
    expect(cell.style.transform).toContain('translate3d');
    expect(widget.style.transform).toContain('translate3d');
    expect(widget.style.opacity).toBe('');
    desktop.draw(1);
    desktop.finish();
    desktop.clear();
    expect(cell.style.transform).toBe('');
    expect(widget.style.transform).toBe('');
    expect(launcher.hasAttribute('data-unlock-animating')).toBe(false);
    expect(grid.hasAttribute('data-unlock-entered')).toBe(true);
  });
});
