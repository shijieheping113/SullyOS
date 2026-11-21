// @vitest-environment jsdom
import React, { act, lazy } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AppLoadingFallback, { APP_LOADING_TIMING } from '../components/os/AppLoadingFallback';
import AppWindowHost from '../components/os/AppWindowHost';
import { AppID } from '../types';
import { trackEvent } from './analytics';

vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
let container: HTMLDivElement;
let root: Root;
let visibility: DocumentVisibilityState;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const render = (options: { pending?: boolean; active?: boolean; onReturn?: () => void; style?: 'pigcat' | 'text' } = {}) => act(() => root.render(React.createElement(AppLoadingFallback, { pending: true, active: true, ...options })));
const overlay = () => container.querySelector<HTMLElement>('.sully-app-loading');
const cat = () => container.querySelector('.sully-pigcat-loading');
const textWait = () => container.querySelector('.sully-text-loading');
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(trackEvent).mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

it('paints the waiting background immediately and reveals pigcat only after 250 foreground milliseconds', () => {
  render();
  expect(overlay()).not.toBeNull();
  expect(cat()).toBeNull();
  advance(249);
  expect(cat()).toBeNull();
  advance(1);
  expect(cat()).not.toBeNull();
  expect(textWait()).toBeNull();
  expect(container.textContent).toContain('せっせと準備中…');
});

it('uses pure text waiting art when style is text, and keeps pigcat as the default', () => {
  act(() => root.render(React.createElement(AppLoadingFallback, { pending: true, active: true, style: 'text' })));
  advance(250);
  expect(textWait()).not.toBeNull();
  expect(cat()).toBeNull();
  expect(overlay()?.classList.contains('sully-app-loading-text')).toBe(true);
  expect(container.textContent).toContain('準備しています');
  act(() => root.render(React.createElement(AppLoadingFallback, { pending: true, active: true })));
  advance(250);
  expect(cat()).not.toBeNull();
  expect(textWait()).toBeNull();
});

it('skips pigcat and its exit delay when the page is already ready or finishes quickly', () => {
  render({ pending: false }); advance(500);
  expect(overlay()).toBeNull();
  render(); advance(100);
  render({ pending: false });
  expect(overlay()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(trackEvent).not.toHaveBeenCalled();
});

it('keeps the same overlay for its 160ms exit and immediately releases pointer interaction', () => {
  render(); advance(250);
  const node = overlay();
  render({ pending: false });
  expect(overlay()).toBe(node);
  expect(node?.classList.contains('sully-app-loading-exiting')).toBe(true);
  expect(node?.style.pointerEvents).toBe('none');
  expect(node?.getAttribute('aria-hidden')).toBe('true');
  advance(APP_LOADING_TIMING.exit - 1);
  expect(overlay()).toBe(node);
  advance(1);
  expect(overlay()).toBeNull();
  advance(20_000);
  expect(trackEvent).not.toHaveBeenCalled();
});

it('resets the wait on a second suspension, including one that interrupts the exit', () => {
  render(); advance(500);
  render({ pending: false }); advance(80);
  render();
  expect(cat()).toBeNull();
  expect(overlay()?.classList.contains('sully-app-loading-exiting')).toBe(false);
  advance(249); expect(cat()).toBeNull();
  advance(1); expect(cat()).not.toBeNull();
  advance(14_749); expect(container.textContent).not.toContain('加载有点慢');
  advance(1); expect(container.textContent).toContain('加载有点慢');
});

it('does not run recovery for an exiting page, and pauses its illustration', () => {
  render(); advance(500);
  render({ active: false });
  expect(overlay()?.classList.contains('sully-app-loading-paused')).toBe(true);
  advance(20_000);
  expect(trackEvent).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('加载有点慢');
});

it('preserves the long-wait recovery routes', () => {
  const onReturn = vi.fn();
  render({ onReturn }); advance(14_999);
  expect(container.textContent).not.toContain('加载有点慢');
  advance(1);
  expect(container.textContent).toContain('加载有点慢');
  expect(container.textContent).toContain('刷新恢复');
  expect(cat()).toBeNull();
  expect(container.querySelector('a')?.getAttribute('href')).toContain('recover.html');
  const back = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('返回桌面'))!;
  act(() => back.click());
  expect(onReturn).toHaveBeenCalledOnce();
  expect(trackEvent).toHaveBeenCalledWith('App 加载卡死超时');
});

it('continues counting only foreground time for long-wait recovery', () => {
  render(); advance(5000);
  visibility = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(overlay()?.classList.contains('sully-app-loading-paused')).toBe(true);
  advance(60_000);
  expect(container.textContent).not.toContain('加载有点慢');
  visibility = 'visible'; act(() => document.dispatchEvent(new Event('visibilitychange')));
  advance(9999);
  expect(container.textContent).not.toContain('加载有点慢');
  advance(1);
  expect(container.textContent).toContain('加载有点慢');
});

it('cancels recovery on a quick completion', () => {
  render(); advance(200);
  act(() => root.render(null));
  advance(20_000);
  expect(container.innerHTML).toBe('');
  expect(trackEvent).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('reveals content during the existing entrance and fades pigcat without restarting the window', async () => {
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => window.setTimeout(() => fn(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);
  let resolve!: (value: { default: React.FC }) => void;
  const Slow = lazy(() => new Promise<{ default: React.FC }>(done => { resolve = done; }));
  const app = (id: AppID) => act(() => root.render(React.createElement(AppWindowHost, {
    activeApp: id, locked: false, disabled: false,
    desktop: React.createElement('div', null, 'desktop'), renderBackdrop: () => null,
    renderApp: () => React.createElement(Slow),
    renderLoading: (state: { pending: boolean; active: boolean }) => React.createElement(AppLoadingFallback, state),
  })));
  app(AppID.Launcher); app(AppID.Settings);
  advance(16);
  const surface = container.querySelector<HTMLElement>('.sully-app-surface')!;
  expect(surface.style.opacity).toBe('1');
  advance(250);
  expect(cat()).not.toBeNull();
  expect(overlay()?.closest('[data-app-window]')).not.toBeNull();
  await act(async () => { resolve({ default: () => React.createElement('button', { 'data-ready': '' }, 'ready') }); await Promise.resolve(); });
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(overlay()?.style.pointerEvents).toBe('none');
  expect(surface.style.opacity).toBe('1');
  expect(surface.dataset.appMotion).toBe('moving');
  advance(160);
  expect(overlay()).toBeNull();
  advance(200);
  expect(surface.dataset.appMotion).toBe('settled');
  expect(vi.getTimerCount()).toBe(0);
});
