import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { deleteBlobRefIfUnreferenced, getBlobForRef, isBlobRef, putImageBlob } from '../../utils/blobRef';
import { loadBlobRefUrl } from '../../utils/blobRefSessionCache';
import { useLocalBackHandler } from '../../hooks/useLocalBackHandler';
import Launcher from '../../apps/Launcher';
import { launcherUnlockMotion, usesV5DesktopEntry } from './launcherUnlockMotion';
import { mountLockScreen } from './lockScreenMotion';
import type { LockScreenMotion } from './lockScreenMotion';
import { LOCK_SCREEN_FOREGROUND, readLockScreenSettings, saveLockScreenSettings } from './lockScreenSettings';
import type { LockScreenSettings } from './lockScreenSettings';
import markup from './lockScreen.html?raw';
import './lockScreen.css';

interface Props {
  desktopRef?: RefObject<HTMLDivElement | null>;
  onUnlock?: () => void;
  onClose?: () => void;
  holdReveal?: boolean;
  onPrepared?: () => void;
  desktopPaired?: boolean;
}

function decodeImage(image: HTMLImageElement) {
  if (typeof image.decode === 'function') return image.decode().catch(() => {});
  if (image.complete) return Promise.resolve();
  return new Promise<void>(resolve => {
    const done = () => {
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      resolve();
    };
    image.addEventListener('load', done);
    image.addEventListener('error', done);
  });
}

function boundedExternalImage(image: HTMLImageElement) {
  if (!/^https?:/i.test(image.src)) return decodeImage(image);
  return new Promise<void>(resolve => {
    const timeout = window.setTimeout(resolve, 1500);
    void decodeImage(image).then(() => { window.clearTimeout(timeout); resolve(); });
  });
}

function wakeImageSource(wallpaper: string, width: number, height: number) {
  if (!width || !height || !/^(linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\(/i.test(wallpaper)) return '';
  const background = wallpaper.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background-image:${background}"></div></foreignObject></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export async function clearLockScreenForeground() {
  const previous = await DB.getAsset(LOCK_SCREEN_FOREGROUND);
  if (!previous) return;
  await DB.deleteAsset(LOCK_SCREEN_FOREGROUND);
  void deleteBlobRefIfUnreferenced(previous).catch(() => {});
}

export default function LockScreen({ desktopRef, onUnlock, onClose, holdReveal = false, onPrepared, desktopPaired = false }: Props) {
  const { theme, updateTheme, addToast } = useOS();
  const [settings] = useState(readLockScreenSettings);
  const [front, setFront] = useState('');
  const [foregroundReady, setForegroundReady] = useState(!settings.depth);
  const [openingReady, setOpeningReady] = useState(false);
  const [frontRevision, setFrontRevision] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const editorDesktop = useRef<HTMLDivElement>(null);
  const motion = useRef<LockScreenMotion | null>(null);
  const pendingSave = useRef<Partial<LockScreenSettings>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editor = Boolean(onClose);
  const pair = editor ? settings.pair : desktopPaired;
  const wallpapers = {
    lock: theme.lockWallpaper || theme.wallpaper || '',
    home: theme.wallpaper || '',
    front,
  };

  function flushSettings() {
    clearTimeout(saveTimer.current);
    const changes = pendingSave.current;
    pendingSave.current = {};
    if (!Object.keys(changes).length) return;
    try {
      saveLockScreenSettings(changes);
    } catch {
      addToast('锁屏设置未能保存', 'error');
    }
  }

  const latest = useRef({ wallpapers, onUnlock, updateTheme, addToast, flushSettings, onPrepared });
  useLayoutEffect(() => {
    latest.current = { wallpapers, onUnlock, updateTheme, addToast, flushSettings, onPrepared };
  });
  useLayoutEffect(() => {
    motion.current?.setWallpapers(latest.current.wallpapers);
  }, [wallpapers.lock, wallpapers.home, wallpapers.front]);

  useLayoutEffect(() => {
    if (!settings.depth && !editor) return;
    let live = true;
    let url = '';
    setFront('');
    void DB.getAsset(LOCK_SCREEN_FOREGROUND).then(ref => ref ? getBlobForRef(ref) : null).then(blob => {
      if (!live || !blob) return;
      url = URL.createObjectURL(blob);
      setFront(url);
    }).catch(() => {}).finally(() => {
      if (live) setForegroundReady(true);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [editor, settings.depth, frontRevision]);

  useLocalBackHandler(() => {
    if (motion.current?.closePanel()) return true;
    if (!onClose) return false;
    onClose();
    return true;
  }, 40, editor);

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    container.innerHTML = markup;
    const desktopElement = desktopRef?.current || (editor && usesV5DesktopEntry(theme.skin) ? editorDesktop.current : null);
    const controller = mountLockScreen(container, {
      settings: { ...settings, pair },
      wallpapers: latest.current.wallpapers,
      editor,
      reveal: !editor,
      holdReveal: !editor,
      desktop: desktopElement ? launcherUnlockMotion(desktopElement) : undefined,
      unlock: () => latest.current.onUnlock?.(),
      requestPermission() {
        if (!editor && 'Notification' in window && Notification.permission === 'default') {
          void Promise.resolve(Notification.requestPermission()).catch(() => {});
        }
      },
      save(changes) {
        Object.assign(pendingSave.current, changes);
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => latest.current.flushSettings(), 180);
      },
      async saveImage(kind, file) {
        const previous = kind === 'front' ? await DB.getAsset(LOCK_SCREEN_FOREGROUND) : null;
        const ref = await putImageBlob(file);
        try {
          if (kind === 'front') await DB.saveAsset(LOCK_SCREEN_FOREGROUND, ref);
          else await latest.current.updateTheme(kind === 'lock' ? { lockWallpaper: ref } : { wallpaper: ref });
        } catch (error) {
          await deleteBlobRefIfUnreferenced(ref).catch(() => {});
          throw error;
        }
        if (kind === 'front') {
          setFrontRevision(value => value + 1);
          void deleteBlobRefIfUnreferenced(previous).catch(() => {});
        } else if (kind === 'home') {
          pendingSave.current.pair = false;
          latest.current.flushSettings();
        } else {
          setFront('');
          await clearLockScreenForeground();
          setFrontRevision(value => value + 1);
        }
      },
    });
    motion.current = controller;
    const saveBeforeLeaving = () => latest.current.flushSettings();
    if (editor) window.addEventListener('pagehide', saveBeforeLeaving);
    return () => {
      if (editor) window.removeEventListener('pagehide', saveBeforeLeaving);
      controller.dispose();
      motion.current = null;
      saveBeforeLeaving();
    };
  }, [desktopRef, editor, pair, settings, theme.skin]);

  useLayoutEffect(() => {
    if (!editor && openingReady && !holdReveal) motion.current?.startReveal();
  }, [editor, openingReady, holdReveal]);

  useLayoutEffect(() => {
    if (editor || openingReady || !foregroundReady) return;
    let live = true;
    let frame = 0;
    const ready = () => {
      if (!live) return;
      motion.current?.prepareClock();
      setOpeningReady(true);
      latest.current.onPrepared?.();
    };
    const imageUrls = pair ? [wallpapers.lock, wallpapers.front] : [wallpapers.lock, wallpapers.home, wallpapers.front];
    const viewport = root.current;
    const gradientSource = wakeImageSource(wallpapers.lock, viewport?.clientWidth || 0, viewport?.clientHeight || 0);
    if (gradientSource) imageUrls.push(gradientSource);
    const images = Array.from(new Set(imageUrls)).filter(url => /^(https?:|data:|blob:|\.?\/)/i.test(url)).map(async url => {
      const image = new Image();
      image.src = url;
      await boundedExternalImage(image);
      if (live && (url === wallpapers.lock || url === gradientSource)) motion.current?.prepareWakeWallpaper(image);
    });
    const desktopAssets = desktopRef?.current?.querySelectorAll<HTMLElement>(
      '[data-unlock-page="active"] [data-unlock-asset], [data-unlock-dock] [data-unlock-asset]',
    );
    const refs = new Set(Array.from(desktopAssets || [], node => node.dataset.unlockAsset || ''));
    const desktopImages = Array.from(refs, async asset => {
      const url = isBlobRef(asset) ? await loadBlobRefUrl(asset) : asset;
      if (!live || !url || !/^(https?:|data:|blob:|\.?\/)/i.test(url)) return;
      const image = new Image();
      image.src = url;
      await boundedExternalImage(image);
    });
    const fonts = new Promise<void>(resolve => {
      const timeout = window.setTimeout(resolve, 350);
      void Promise.resolve(document.fonts?.ready).then(() => { window.clearTimeout(timeout); resolve(); });
    });
    void Promise.all([fonts, ...images.map(job => job.catch(() => {})), ...desktopImages]).then(() => {
      if (live) frame = requestAnimationFrame(ready);
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [desktopRef, editor, foregroundReady, openingReady, pair, wallpapers.lock, wallpapers.home, wallpapers.front]);

  if (!editor) return <div ref={root} className="sully-v5 sully-v5-live absolute inset-0" />;
  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-slate-50">
      <div ref={root} className="sully-v5 sully-v5-editor absolute inset-0" />
      {usesV5DesktopEntry(theme.skin) && <div ref={editorDesktop} {...{ inert: "" }} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]">
        <Launcher staticPreview />
      </div>}
      <button
        type="button"
        onClick={onClose}
        aria-label="返回外观"
        className="absolute left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm active:scale-95"
        style={{ top: 'calc(var(--safe-top) + 12px)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m15.75 19.5-7.5-7.5 7.5-7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
