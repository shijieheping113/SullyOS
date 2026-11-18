// @vitest-environment jsdom
import React, { act, lazy, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppWindowHost from '../components/os/AppWindowHost';
import { AppID } from '../types';

let root: Root;
let container: HTMLDivElement;
let reduced = false;
let changePreference: () => void;
let mounts: Record<string, number>;
function Page({ id }: { id: AppID }) {
  useEffect(() => { mounts[id] = (mounts[id] || 0) + 1; }, []);
  return React.createElement('button', { 'data-control': id }, id);
}
const page = (id: AppID) => React.createElement(Page, { id });
function render(id: AppID, options: { locked?: boolean; disabled?: boolean; app?: (id: AppID) => React.ReactNode } = {}) {
  act(() => root.render(React.createElement(AppWindowHost, {
    activeApp: id, locked: Boolean(options.locked), disabled: Boolean(options.disabled),
    desktop: React.createElement('button', { 'data-home': '' }, 'home'),
    renderApp: options.app || page,
    renderBackdrop: (app, settled) => React.createElement('div', { 'data-backing': app, 'data-settled': String(settled) }),
    renderLoading: ({ pending }: { pending: boolean }) => pending ? React.createElement('div', { 'data-loading': '' }, 'loading') : null,
  })));
}
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const windows = () => Array.from(container.querySelectorAll<HTMLElement>('[data-app-window]'));
const surface = () => container.querySelector<HTMLElement>('.sully-app-surface')!;
const backing = () => container.querySelector<HTMLElement>('[data-backing]')!;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  mounts = {};
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => window.setTimeout(() => fn(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; },
    addEventListener: (_: string, fn: () => void) => { changePreference = fn; }, removeEventListener: vi.fn() }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('App window navigation lifetime', () => {
  it('opens vertically, keeps its backdrop through the full entrance and reverses on home', () => {
    render(AppID.Launcher);
    render(AppID.Settings);
    expect(surface().style.transform).toContain('12px');
    expect(surface().style.opacity).toBe('0');
    advance(16);
    expect(surface().style.transition).toContain('560ms');
    expect(surface().style.transition).toContain('360ms');
    advance(300);
    expect(backing().dataset.settled).toBe('false');
    expect(windows()).toHaveLength(1);
    advance(300);
    expect(backing().dataset.settled).toBe('true');
    render(AppID.Launcher);
    expect(windows()).toHaveLength(1);
    expect(windows()[0].getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-control]')?.getAttribute('tabindex')).toBe('-1');
    advance(16);
    expect(surface().style.transition).toContain('440ms');
    expect(surface().style.transform).toContain('12px');
    advance(480);
    expect(windows()).toHaveLength(0);
    expect(surface().style.visibility).toBe('hidden');
    expect(container.querySelector('[data-app-desktop]')?.getAttribute('aria-hidden')).toBe('false');
  });

  it('only uses horizontal handoff between apps, retaining one shared backdrop', () => {
    render(AppID.Settings);
    render(AppID.Character);
    expect(windows()).toHaveLength(2);
    expect(windows()[1].style.transform).toContain('18px');
    advance(16);
    expect(windows()[0].style.transform).toContain('-18px');
    expect(windows()[0].style.transition).toContain('440ms');
    expect(windows()[1].style.transition).toContain('560ms');
    expect(container.querySelectorAll('[data-backing]')).toHaveLength(1);
    advance(480);
    expect(windows().map(node => node.dataset.appWindow)).toEqual([AppID.Character]);
    expect(backing().dataset.settled).toBe('false');
    advance(120);
    expect(backing().dataset.settled).toBe('true');
  });

  it('reuses a reversing page, restores its focus order and cancels stale removals', () => {
    render(AppID.Launcher);
    render(AppID.Settings);
    advance(100);
    const node = windows()[0];
    render(AppID.Launcher);
    advance(100);
    render(AppID.Settings);
    advance(16);
    expect(windows()[0]).toBe(node);
    expect(mounts[AppID.Settings]).toBe(1);
    expect(container.querySelector('[data-control]')?.hasAttribute('tabindex')).toBe(false);
    advance(650);
    expect(windows()).toHaveLength(1);
    expect(surface().style.opacity).toBe('1');
    expect(surface().style.visibility).toBe('visible');
  });

  it('last request wins through app/app/home interruptions without a third live page', () => {
    render(AppID.Settings);
    render(AppID.Character);
    advance(90);
    render(AppID.Chat);
    expect(windows()).toHaveLength(2);
    advance(60);
    render(AppID.Launcher);
    advance(20);
    render(AppID.MemoryPalace);
    expect(windows().length).toBeLessThanOrEqual(2);
    advance(700);
    expect(windows().map(node => node.dataset.appWindow)).toEqual([AppID.MemoryPalace]);
    expect(backing().dataset.settled).toBe('true');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reuses a still exiting app during an app-to-app reversal', () => {
    render(AppID.Settings);
    const original = windows()[0];
    render(AppID.Character);
    advance(100);
    render(AppID.Settings);
    advance(700);
    expect(windows()).toHaveLength(1);
    expect(windows()[0]).toBe(original);
    expect(mounts[AppID.Settings]).toBe(1);
    expect(surface().style.transform).toBe('none');
    expect(windows()[0].style.transform).toBe('none');
    expect(surface().style.willChange).toBe('');
  });

  it('does not replay the same active app or remount the desktop', () => {
    render(AppID.Launcher);
    const home = container.querySelector('[data-home]');
    render(AppID.Settings);
    advance(700);
    render(AppID.Settings);
    expect(surface().dataset.appMotion).toBe('settled');
    expect(vi.getTimerCount()).toBe(0);
    expect(mounts[AppID.Settings]).toBe(1);
    expect(container.querySelector('[data-home]')).toBe(home);
  });

  it('opens the loading window immediately, and a canceled download cannot reopen its route', async () => {
    let resolve!: (value: { default: React.FC }) => void;
    const Slow = lazy(() => new Promise<{ default: React.FC }>(done => { resolve = done; }));
    const slowPage = (id: AppID) => id === AppID.Character ? React.createElement(Slow) : page(id);
    render(AppID.Launcher);
    render(AppID.Character, { app: slowPage });
    advance(1000);
    expect(container.querySelector('[data-loading]')).not.toBeNull();
    expect(surface().style.visibility).toBe('visible');
    expect(surface().dataset.appMotion).toBe('settled');
    render(AppID.Settings, { app: slowPage });
    advance(700);
    await act(async () => { resolve({ default: () => page(AppID.Character) }); await Promise.resolve(); });
    advance(700);
    expect(windows().map(node => node.dataset.appWindow)).toEqual([AppID.Settings]);
    expect(container.querySelector('[data-loading]')).toBeNull();
  });

  it('finishes its entrance while loading and does not replay it when the lazy page becomes ready', async () => {
    let resolve!: (value: { default: React.FC }) => void;
    const Slow = lazy(() => new Promise<{ default: React.FC }>(done => { resolve = done; }));
    render(AppID.Launcher);
    render(AppID.Character, { app: () => React.createElement(Slow) });
    advance(16);
    expect(surface().style.transition).toContain('560ms');
    expect(surface().style.opacity).toBe('1');
    advance(1200);
    expect(surface().dataset.appMotion).toBe('settled');
    expect(backing().dataset.settled).toBe('false');
    await act(async () => { resolve({ default: () => page(AppID.Character) }); await Promise.resolve(); });
    expect(surface().style.transition).toBe('none');
    expect(backing().dataset.settled).toBe('true');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes a still-pending window along the normal return path', async () => {
    let resolve!: (value: { default: React.FC }) => void;
    const Slow = lazy(() => new Promise<{ default: React.FC }>(done => { resolve = done; }));
    render(AppID.Launcher);
    render(AppID.Character, { app: () => React.createElement(Slow) });
    advance(700);
    render(AppID.Launcher);
    expect(windows()).toHaveLength(1);
    expect(windows()[0].getAttribute('aria-hidden')).toBe('true');
    advance(16);
    expect(surface().style.transition).toContain('440ms');
    expect(surface().style.opacity).toBe('0');
    advance(480);
    await act(async () => { resolve({ default: () => page(AppID.Character) }); await Promise.resolve(); });
    expect(windows()).toHaveLength(0);
    expect(surface().style.visibility).toBe('hidden');
  });

  it('switches horizontally from a pending window and keeps only the newest request', async () => {
    const resolves: Array<(value: { default: React.FC }) => void> = [];
    const First = lazy(() => new Promise<{ default: React.FC }>(done => resolves.push(done)));
    const Second = lazy(() => new Promise<{ default: React.FC }>(done => resolves.push(done)));
    const app = (id: AppID) => id === AppID.Character ? React.createElement(First)
      : id === AppID.Chat ? React.createElement(Second) : page(id);
    render(AppID.Launcher);
    render(AppID.Character, { app }); advance(50);
    render(AppID.Chat, { app });
    expect(windows()).toHaveLength(2);
    expect(windows()[1].style.transform).toContain('18px');
    advance(16);
    expect(windows()[0].style.transform).toContain('-18px');
    expect(container.querySelectorAll('[data-loading]')).toHaveLength(2);
    render(AppID.Settings, { app });
    expect(windows()).toHaveLength(2);
    advance(700);
    await act(async () => { resolves.forEach(resolve => resolve({ default: () => page(AppID.Character) })); await Promise.resolve(); });
    expect(windows().map(node => node.dataset.appWindow)).toEqual([AppID.Settings]);
    expect(container.querySelector('[data-loading]')).toBeNull();
  });

  it('uses 130ms opacity only in reduced motion, including dynamic preference changes', () => {
    reduced = true;
    render(AppID.Launcher);
    render(AppID.Settings);
    advance(16);
    expect(surface().style.transition).toContain('130ms');
    expect(surface().style.transform).toBe('translate(0px, 0px) scale(1)');
    expect((container.querySelector('[data-app-desktop]') as HTMLElement).style.transform).toBe('none');
    advance(170);
    expect(backing().dataset.settled).toBe('true');
    reduced = false;
    act(changePreference);
    expect(surface().dataset.appMotion).toBe('settled');
    expect(windows()).toHaveLength(1);
  });

  it('restores the loading fallback for a later suspension without replaying the root entrance', async () => {
    let pending = false;
    let resolve!: () => void;
    const request = new Promise<void>(done => { resolve = done; });
    function Later() { if (pending) throw request; return page(AppID.Settings); }
    const later = () => React.createElement(Later);
    render(AppID.Settings, { app: later });
    expect(backing().dataset.settled).toBe('true');
    pending = true;
    render(AppID.Settings, { app: later });
    expect(container.querySelector('[data-loading]')).not.toBeNull();
    expect(backing().dataset.settled).toBe('false');
    pending = false;
    await act(async () => { resolve(); await request; });
    expect(container.querySelector('[data-loading]')).toBeNull();
    expect(surface().dataset.appMotion).toBe('settled');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps lock/unlock on its own path and cancels an in-flight app entrance on lock', () => {
    render(AppID.Launcher, { locked: true, disabled: true });
    render(AppID.Chat, { locked: false });
    expect(surface().style.transition).toBe('none');
    expect(surface().style.opacity).toBe('1');
    expect(vi.getTimerCount()).toBe(0);
    render(AppID.Settings);
    advance(90);
    render(AppID.Settings, { locked: true, disabled: true });
    advance(800);
    expect(windows()).toHaveLength(0);
    expect(surface().style.visibility).toBe('hidden');
    render(AppID.Settings);
    expect(surface().style.transition).toBe('none');
    expect(surface().style.opacity).toBe('1');
  });
});
