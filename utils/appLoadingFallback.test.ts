// @vitest-environment jsdom
import React, { act, lazy } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AppLoadingFallback from '../components/os/AppLoadingFallback';
import AppWindowHost from '../components/os/AppWindowHost';
import { AppID } from '../types';
import { trackEvent } from './analytics';

vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
let container: HTMLDivElement;
let root: Root;
let visibility: DocumentVisibilityState;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const render = (onReturn = vi.fn()) => act(() => root.render(React.createElement(AppLoadingFallback, { onReturn })));
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

it('keeps short waits empty, including the removed forced-preview URL', () => {
  vi.stubEnv('DEV', true);
  window.history.replaceState(null, '', '/?previewAppLoading=1');
  render(); advance(14_999);
  expect(container.innerHTML).toBe('');
});

it('preserves the long-wait recovery routes', () => {
  const onReturn = vi.fn();
  render(onReturn); advance(14_999);
  expect(container.textContent).not.toContain('加载有点慢');
  advance(1);
  expect(container.textContent).toContain('加载有点慢');
  expect(container.textContent).toContain('刷新恢复');
  expect(container.querySelector('a')?.getAttribute('href')).toContain('recover.html');
  const back = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('返回桌面'))!;
  act(() => back.click());
  expect(onReturn).toHaveBeenCalledOnce();
  expect(trackEvent).toHaveBeenCalledWith('App 加载卡死超时');
});

it('continues counting only foreground time for long-wait recovery', () => {
  render(); advance(5000);
  visibility = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange')));
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

it('waits silently for the real lazy page and starts its entrance without an extra delay', async () => {
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => window.setTimeout(() => fn(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);
  let resolve!: (value: { default: React.FC }) => void;
  const Slow = lazy(() => new Promise<{ default: React.FC }>(done => { resolve = done; }));
  const app = (id: AppID) => act(() => root.render(React.createElement(AppWindowHost, {
    activeApp: id, locked: false, disabled: false,
    desktop: React.createElement('div', null, 'desktop'), renderBackdrop: () => null,
    renderApp: () => React.createElement(Slow), loading: React.createElement(AppLoadingFallback),
  })));
  app(AppID.Launcher); app(AppID.Settings);
  advance(1000);
  expect(container.querySelector('.sully-app-loading, svg')).toBeNull();
  await act(async () => { resolve({ default: () => React.createElement('div', null, 'ready') }); await Promise.resolve(); });
  expect(container.querySelector('.sully-app-loading')).toBeNull();
  const surface = container.querySelector<HTMLElement>('.sully-app-surface')!;
  expect(surface.style.opacity).toBe('0');
  advance(16);
  expect(surface.style.transition).toContain('560ms');
  expect(surface.style.opacity).toBe('1');
  advance(600);
  expect(surface.dataset.appMotion).toBe('settled');
});
