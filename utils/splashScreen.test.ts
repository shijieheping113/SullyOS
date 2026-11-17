// @vitest-environment jsdom
import React, { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SplashScreen, { type SplashScreenProps } from '../components/os/SplashScreen';
import BootSequence, { StartupOpening, useStartupOpening } from '../components/os/BootSequence';
import BootAnimationSettings from '../components/appearance/BootAnimationSettings';
import type { OSTheme } from '../types';

let root: Root;
let host: HTMLDivElement;
let reduced = false;
let props: SplashScreenProps;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  props = { dataReady: false, onDone: vi.fn() };
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.removeItem('os_theme');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(patch: Partial<SplashScreenProps> = {}) {
  props = { ...props, ...patch };
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(SplashScreen, props))));
}
async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }
async function click() { await act(async () => host.querySelector<HTMLElement>('.sully-splash')!.click()); }
function peekingCorner() { return host.querySelector<HTMLElement>('.spl-is-peeking')!.dataset.corner; }

it('waits indefinitely with one random cat at a time and no welcome or completion', async () => {
  await render();
  let previous = peekingCorner();
  const seen = new Set([previous]);
  const random = vi.spyOn(Math, 'random');
  for (const choice of [0, .99, .5, 0, .99, .5]) {
    random.mockReturnValue(choice);
    await advance(2200);
    expect(host.querySelectorAll('.spl-is-peeking')).toHaveLength(1);
    const current = peekingCorner();
    expect(current).not.toBe(previous);
    seen.add(current);
    previous = current;
  }
  expect(seen.size).toBeGreaterThan(2);
  expect(host.querySelector('.spl-waiting')).not.toBeNull();
  expect(host.querySelectorAll('.spl-confetti-piece')).toHaveLength(0);
  expect(props.onDone).not.toHaveBeenCalled();
});

it('welcomes immediately when ready at two seconds, carries the visible cat and finishes once', async () => {
  await render();
  await advance(2000);
  const corner = peekingCorner();
  await render({ dataReady: true });
  expect(host.querySelector('.spl-welcoming')).not.toBeNull();
  expect(host.querySelector<HTMLElement>('.spl-is-carried')!.dataset.corner).toBe(corner);
  expect(host.querySelectorAll('.spl-confetti-piece')).toHaveLength(88);
  await advance(2200);
  expect(host.querySelector('.spl-exiting')).not.toBeNull();
  expect(props.onDone).not.toHaveBeenCalled();
  await advance(730);
  expect(props.onDone).toHaveBeenCalledOnce();
  expect(host.querySelector('.sully-splash')).toBeNull();
  await advance(10000);
  expect(props.onDone).toHaveBeenCalledOnce();
});

it('does not impose a minimum hold even when already loaded on mount', async () => {
  await render({ dataReady: true });
  expect(host.querySelector('.spl-welcoming')).not.toBeNull();
  expect(host.querySelectorAll('.spl-confetti-piece')).toHaveLength(88);
});

it.each(['click', 'keyboard'])('queues a %s skip until loaded, then exits without welcoming', async method => {
  await render();
  await act(async () => {
    const splash = host.querySelector<HTMLElement>('.sully-splash')!;
    if (method === 'click') splash.click();
    else splash.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });
  await advance(10000);
  expect(host.querySelector('.spl-waiting')).not.toBeNull();
  expect(props.onDone).not.toHaveBeenCalled();
  await render({ dataReady: true });
  expect(host.querySelector('.spl-exiting')).not.toBeNull();
  expect(host.querySelectorAll('.spl-confetti-piece')).toHaveLength(0);
  await advance(730);
  expect(props.onDone).toHaveBeenCalledOnce();
});

it('keeps confetti mounted during a welcome skip and ignores repeated clicks', async () => {
  await render({ dataReady: true });
  const piece = host.querySelector('.spl-confetti-piece');
  await advance(500);
  await click();
  await click();
  expect(host.querySelector('.spl-exiting')).not.toBeNull();
  expect(host.querySelector('.spl-confetti-piece')).toBe(piece);
  expect(host.querySelectorAll('.spl-confetti-piece')).toHaveLength(88);
  await advance(730);
  expect(props.onDone).toHaveBeenCalledOnce();
});

it('returns to waiting if readiness is withdrawn during exit and never completes while unready', async () => {
  await render({ dataReady: true });
  await click();
  await render({ dataReady: false });
  await advance(10000);
  expect(host.querySelector('.spl-waiting')).not.toBeNull();
  expect(host.querySelectorAll('.spl-confetti-piece')).toHaveLength(0);
  expect(props.onDone).not.toHaveBeenCalled();
  await render({ dataReady: true });
  await advance(730);
  expect(props.onDone).toHaveBeenCalledOnce();
});

it('cancels completion when unmounted during welcome', async () => {
  await render({ dataReady: true });
  await act(async () => root.render(null));
  await advance(10000);
  expect(props.onDone).not.toHaveBeenCalled();
});

it('uses the latest completion callback and completes only once for animationend plus the fallback', async () => {
  const oldDone = vi.fn();
  const latestDone = vi.fn();
  await render({ dataReady: true, onDone: oldDone });
  await click();
  await render({ onDone: latestDone });
  await act(async () => {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'spl-exit' });
    host.querySelector('.sully-splash')!.dispatchEvent(event);
  });
  await advance(10000);
  expect(oldDone).not.toHaveBeenCalled();
  expect(latestDone).toHaveBeenCalledOnce();
});

it('respects reduced motion without bypassing actual loading', async () => {
  reduced = true;
  await render();
  await advance(10000);
  expect(host.querySelector('.spl-waiting')).not.toBeNull();
  expect(props.onDone).not.toHaveBeenCalled();
  await render({ dataReady: true });
  expect(host.querySelectorAll('.spl-confetti-piece')).toHaveLength(0);
  await advance(160);
  expect(host.querySelector('.spl-exiting')).not.toBeNull();
  await advance(240);
  expect(props.onDone).toHaveBeenCalledOnce();
});

function ReadyChild({ ready }: { ready: boolean }) {
  const { bootDone, setReady } = useStartupOpening();
  useLayoutEffect(() => setReady(ready, ''), [ready, setReady]);
  return React.createElement('p', null, bootDone ? '桌面已接手' : '桌面在准备');
}
async function renderStartup(ready: boolean, failed = false) {
  await act(async () => root.render(React.createElement(StartupOpening, {
    failed, children: React.createElement(ReadyChild, { ready }),
  })));
}

it('uses black-cat for a fresh startup without saved settings', async () => {
  localStorage.removeItem('os_theme');
  await renderStartup(false);
  expect(host.querySelector('.spl-waiting')).not.toBeNull();
  expect(host.textContent).toContain('桌面在准备');
});

it.each(['classic', 'jellyfish'] as const)('keeps an explicit %s opening instead of using the new default', async style => {
  await act(async () => root.render(React.createElement(BootSequence, { dataReady: false, style, onDone: vi.fn() })));
  expect(host.querySelector('.sully-splash')).toBeNull();
  expect(host.childElementCount).toBeGreaterThan(0);
});

it('selects black-cat in settings when no opening style has been saved', async () => {
  await act(async () => root.render(React.createElement(BootAnimationSettings, { theme: {} as OSTheme, updateTheme: vi.fn() })));
  const selected = host.querySelector('button[aria-pressed="true"]');
  expect(selected?.textContent).toContain('黑球猫猫');
});

it('routes the saved black-cat style through the real startup gate and hands back after exit', async () => {
  localStorage.setItem('os_theme', JSON.stringify({ bootAnimationStyle: 'black-cat' }));
  await renderStartup(false);
  expect(host.querySelector('.spl-waiting')).not.toBeNull();
  expect(host.textContent).toContain('桌面在准备');
  await renderStartup(true);
  expect(host.querySelector('.spl-welcoming')).not.toBeNull();
  await advance(2200);
  await advance(730);
  expect(host.querySelector('.sully-splash')).toBeNull();
  expect(host.textContent).toContain('桌面已接手');
});

it('honors the saved animation-off switch with black-cat selected', async () => {
  localStorage.setItem('os_theme', JSON.stringify({ bootAnimationStyle: 'black-cat', bootAnimationEnabled: false }));
  await renderStartup(false);
  expect(host.querySelector('.sully-splash')).toBeNull();
  expect(host.textContent).toContain('桌面已接手');
});

it('removes the splash when startup fails instead of covering the error screen', async () => {
  localStorage.setItem('os_theme', JSON.stringify({ bootAnimationStyle: 'black-cat' }));
  await renderStartup(false);
  expect(host.querySelector('.sully-splash')).not.toBeNull();
  await renderStartup(false, true);
  expect(host.querySelector('.sully-splash')).toBeNull();
  await advance(10000);
  expect(host.textContent).toContain('桌面在准备');
});

it('offers black-cat alongside both existing styles and saves the selected identifier', async () => {
  const updateTheme = vi.fn();
  await act(async () => root.render(React.createElement(BootAnimationSettings, {
    theme: { bootAnimationStyle: 'black-cat' } as OSTheme, updateTheme,
  })));
  const options = [...host.querySelectorAll('button')];
  expect(options.map(option => option.textContent)).toEqual([
    '原版壁纸柔光 · 文字浮现', '水母紫色星光 · 小水母', '黑球猫猫四角探头 · 礼花欢迎',
  ]);
  expect(options[2].getAttribute('aria-pressed')).toBe('true');
  await act(async () => options[2].click());
  expect(updateTheme).toHaveBeenCalledWith({ bootAnimationStyle: 'black-cat' });
});
