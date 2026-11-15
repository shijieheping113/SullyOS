import type { LockScreenSettings } from './lockScreenSettings';

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
  home: string;
  front: string;
}

export interface DesktopMotion {
  draw(progress: number): void;
  finish(): void;
  clear(): void;
}

export interface LockScreenMotion {
  setWallpapers(wallpapers: Wallpapers): void;
  prepareClock(): void;
  prepareWakeWallpaper(image: HTMLImageElement): void;
  startReveal(): void;
  closePanel(): boolean;
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
  unlock(): void;
  requestPermission(): void;
  save(changes: Partial<LockScreenSettings>): void;
  saveImage(kind: 'lock' | 'home' | 'front', file: File): Promise<void>;
  fixture?: {
    now: Date;
    battery: number;
    seconds: number;
    icons: [string, string][];
    back: string;
    front: string;
    avatar: string;
    cover: string;
  };
}): LockScreenMotion;

export function unlockIconProgress(progress: number): number;
export function unlockFrameSeconds(previous: number, now: number): number;
export function unlockReleaseDuration(from: number, velocity: number): number;
export function unlockReleaseFrame(from: number, icons: number, unlocked: boolean, linear: number): { progress: number; icons?: number };
