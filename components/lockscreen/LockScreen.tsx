import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useOS } from '../../context/OSContext';
import { isBlobRef } from '../../utils/blobRef';
import { loadBlobRefUrl } from '../../utils/blobRefSessionCache';
import { launcherUnlockMotion } from './launcherUnlockMotion';
import { mountLockScreen } from './lockScreenMotion';
import type { LockScreenMotion, Wallpapers } from './lockScreenMotion';
import { readLockScreenSettings } from './lockScreenSettings';
import type { LockScreenSettings } from './lockScreenSettings';
import { LockScreenData, paintCachedLockWeather, useLockForeground } from './LockScreenData';
import type { LockPlayerControls } from './lockScreenMedia';
import markup from './lockScreen.html?raw';
import './lockScreen.css';

interface Props {
  desktopRef?: RefObject<HTMLDivElement | null>;
  onUnlock?: (charId?: string) => void;
  onOpenRecentChat?: () => void;
  holdReveal?: boolean;
  onPrepared?: () => void;
  desktopPaired?: boolean;
  preview?: { settings: LockScreenSettings; wallpapers: Wallpapers; glassRegion?: string };
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

async function isStillPhoto(url: string) {
  if (/^data:image\/jpeg[;,]/i.test(url)) return true;
  if (!url.startsWith('blob:')) return false;
  try {
    const response = await fetch(url);
    const type = response.headers.get('content-type');
    void response.body?.cancel().catch(() => {});
    return type === 'image/jpeg';
  } catch {
    return false;
  }
}

function wakeImageSource(wallpaper: string, width: number, height: number) {
  if (!width || !height || !/^(linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\(/i.test(wallpaper)) return '';
  const background = wallpaper.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background-image:${background}"></div></foreignObject></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export default function LockScreen({ desktopRef, onUnlock, onOpenRecentChat, holdReveal = false, onPrepared, desktopPaired = false, preview }: Props) {
  const { theme, realtimeConfig } = useOS();
  const [storedSettings] = useState(readLockScreenSettings);
  const editor = !!preview;
  const settings = preview?.settings || storedSettings;
  const pair = editor ? settings.pair : desktopPaired;
  const { url: front, ready: foregroundReady } = useLockForeground(!editor && settings.depth);
  const [openingReady, setOpeningReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef<LockScreenMotion | null>(null);
  const musicControls = useRef<LockPlayerControls | null>(null);
  const wallpapers = preview?.wallpapers || { lock: theme.lockWallpaper || theme.wallpaper || '', front };
  const latest = useRef({ wallpapers, settings, onUnlock, onOpenRecentChat, onPrepared, realtimeConfig });

  useLayoutEffect(() => {
    latest.current = { wallpapers, settings, onUnlock, onOpenRecentChat, onPrepared, realtimeConfig };
  });

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    container.innerHTML = markup;
    const desktop = desktopRef?.current;
    const controller = mountLockScreen(container, {
      settings: { ...latest.current.settings, pair },
      wallpapers: latest.current.wallpapers,
      editor,
      reveal: !editor,
      holdReveal: !editor,
      desktop: desktop ? launcherUnlockMotion(desktop) : undefined,
      player: {
        toggle: () => musicControls.current?.toggle(),
        prev: () => musicControls.current?.prev(),
        next: () => musicControls.current?.next(),
        seek: fraction => musicControls.current?.seek(fraction),
      },
      unlock: charId => latest.current.onUnlock?.(charId),
      openRecentChat: editor ? undefined : () => latest.current.onOpenRecentChat?.(),
      requestPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
          void Promise.resolve(Notification.requestPermission()).catch(() => {});
        }
      },
    });
    motion.current = controller;
    paintCachedLockWeather(controller, latest.current.realtimeConfig);
    return () => {
      controller.dispose();
      motion.current = null;
    };
  }, [desktopRef, editor]);

  useLayoutEffect(() => {
    motion.current?.setSettings({ ...latest.current.settings, pair });
  }, [settings, pair]);

  useLayoutEffect(() => {
    motion.current?.setWallpapers(latest.current.wallpapers);
  }, [wallpapers.lock, wallpapers.front]);

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
    const imageUrls = pair ? [wallpapers.lock, wallpapers.front] : [wallpapers.lock, theme.wallpaper, wallpapers.front];
    const viewport = root.current;
    const gradientSource = wakeImageSource(wallpapers.lock, viewport?.clientWidth || 0, viewport?.clientHeight || 0);
    if (gradientSource) imageUrls.push(gradientSource);
    const images = Array.from(new Set(imageUrls)).filter(url => /^(https?:|data:|blob:|\.?\/)/i.test(url)).map(async url => {
      const image = new Image();
      image.src = url;
      await boundedExternalImage(image);
      if (!live || (url !== wallpapers.lock && url !== gradientSource)) return;
      const largePhoto = image.naturalWidth * image.naturalHeight > 4_000_000 && await isStillPhoto(url);
      if (live) motion.current?.prepareWakeWallpaper(image, largePhoto);
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
  }, [desktopRef, editor, foregroundReady, openingReady, pair, wallpapers.lock, theme.wallpaper, wallpapers.front]);

  return (
    <>
      <div ref={root} className={`sully-v5 ${editor ? 'sully-v5-editor pointer-events-none' : 'sully-v5-live'} absolute inset-0`} />
      <LockScreenData motion={motion} controls={musicControls} preview={editor} glassRegion={preview?.glassRegion} />
    </>
  );
}
