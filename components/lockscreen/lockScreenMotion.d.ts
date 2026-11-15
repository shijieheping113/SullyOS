import type { LockScreenSettings } from './lockScreenSettings';
import type { LockNotice, LockPlayerControls, LockSong } from './lockScreenMedia';

interface IconCell {
  element: HTMLElement;
  x: number;
  y: number;
  delay: number;
  initialScale?: number;
  keepBackdrop?: boolean;
}

export function iconCell(element: HTMLElement, index: number, columns: number): IconCell;
export function drawDesktop(progress: number, cells: IconCell[], dock: HTMLElement | null, homebar?: HTMLElement | null, dockTravel?: number): void;

export interface Wallpapers {
  lock: string;
  front: string;
}

export interface DesktopMotion {
  draw(progress: number): void;
  finish(): void;
  clear(): void;
}

export interface LockScreenMotion {
  setWallpapers(wallpapers: Wallpapers): void;
  setSettings(settings: LockScreenSettings): void;
  setPlayer(song: LockSong | null): void;
  setNotice(notice: LockNotice | null): void;
  setWeather(value: string, iconCode?: string): void;
  prepareClock(): void;
  prepareWakeWallpaper(image: HTMLImageElement, largePhoto?: boolean): void;
  startReveal(): void;
  draw(progress: number): void;
  dispose(): void;
}

export function mountLockScreen(root: HTMLElement, options: {
  settings: LockScreenSettings;
  wallpapers: Wallpapers;
  editor: boolean;
  reveal: boolean;
  holdReveal?: boolean;
  desktop?: DesktopMotion;
  player?: LockPlayerControls;
  unlock(charId?: string): void;
  openRecentChat?(): void;
  requestPermission(): void;
}): LockScreenMotion;

export function unlockIconProgress(progress: number): number;
export function unlockFrameSeconds(previous: number, now: number): number;
export function unlockReleaseDuration(from: number, velocity: number): number;
export function unlockReleaseFrame(from: number, icons: number, unlocked: boolean, linear: number): { progress: number; icons?: number };
