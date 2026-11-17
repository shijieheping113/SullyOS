// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Launcher from '../apps/Launcher';
import { INSTALLED_APPS, DOCK_APPS } from '../constants';
import type { OSTheme } from '../types';

const state = vi.hoisted(() => ({
  theme: {} as Partial<OSTheme>, customIcons: {} as Record<string, string>,
  unreadMessages: {} as Record<string, number>,
  openApp: vi.fn(), updateTheme: vi.fn(),
}));
vi.mock('../context/OSContext', () => ({
  isPaperWallpaper: () => false,
  useOS: () => ({ ...state, characters: [], virtualTime: { hours: 12, minutes: 0 }, isDataLoaded: false }),
}));
vi.mock('../constants', () => {
  const ids = ['character', 'memory_palace', 'call', 'room', 'check_phone', 'friend_feed', 'date', 'user',
    'bank', 'journal', 'study', 'game', 'novel', 'songwriting', 'vrworld', 'schedule',
    'worldbook', 'hot_news', 'faq', 'gallery', 'xhs_free_roam', 'xhs_stock', 'appearance', 'guidebook', 'chat', 'group_chat', 'social', 'settings'];
  return {
    INSTALLED_APPS: ids.map(id => ({ id, name: id, icon: 'Settings', color: 'blue' })),
    DOCK_APPS: ['chat', 'group_chat', 'social', 'settings'],
    Icons: { Settings: (props: object) => React.createElement('svg', props) },
  };
});
vi.mock('./blobRef', () => ({ useBlobRefUrl: (token: string) => token }));
vi.mock('./devDebug', () => ({ isDevDebugAvailable: () => false, subscribeDevDebugAvailability: () => () => {} }));
vi.mock('./db', () => ({ DB: {}, DESKTOP_PREVIEW_SCAN_CAP: 10 }));
vi.mock('./dailySchedule', () => ({ getDailyScheduleForChar: vi.fn() }));
vi.mock('../hooks/useLocalDateKey', () => ({ useLocalDateKey: () => 'test-date' }));
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../components/schedule/ScheduleHomeWidget', () => ({ ScheduleHomeWidget: () => null, ScheduleFullscreenViewer: () => null }));
vi.mock('../components/os/NowPlayingSquareWidget', () => ({ default: () => React.createElement('span', null, 'music') }));
vi.mock('../components/os/MobileGameHome', () => ({ default: () => null }));
vi.mock('../components/os/TamagotchiHome', () => ({ default: () => null }));

let host: HTMLDivElement;
let root: Root;
let hit: HTMLElement | null;
const gridOrder = () => Array.from(host.querySelectorAll<HTMLElement>('[data-launcher-kind="app"]')).map(el => el.dataset.launcherItem);
const dockOrder = () => Array.from(host.querySelectorAll<HTMLElement>('[data-launcher-kind="dock"]')).map(el => el.dataset.launcherItem);
const widgetOrder = () => Array.from(host.querySelectorAll<HTMLElement>('[data-launcher-kind="widget"]')).map(el => el.dataset.launcherItem);
const item = (id: string) => host.querySelector<HTMLElement>(`[data-launcher-item="${id}"]`)!;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
function pointer(target: HTMLElement, type: string, pointerId = 1, x = 150) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 150, button: 0 });
  Object.assign(event, { pointerId, pointerType: 'touch', isPrimary: pointerId === 1 });
  act(() => target.dispatchEvent(event));
}
function press(id: string) {
  pointer(item(id).querySelector('button') || item(id), 'pointerdown');
  advance(520);
}
function moveTo(id: string) {
  hit = item(id).querySelector('button') || item(id);
  pointer(host.querySelector('.launcher-desktop')!, 'pointermove');
}
function release(type = 'pointerup') { pointer(host.querySelector('.launcher-desktop')!, type); }
function remount() {
  act(() => root.unmount());
  root = createRoot(host);
  act(() => root.render(React.createElement(Launcher, { staticPreview: true })));
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON() {} });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
  state.theme = {};
  state.customIcons = {};
  state.unreadMessages = {};
  state.openApp.mockReset();
  state.updateTheme.mockReset().mockImplementation((updates: Partial<OSTheme>) => { state.theme = { ...state.theme, ...updates }; });
  hit = null;
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
  delete (document as any).elementFromPoint;
  for (const name of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture']) delete (HTMLElement.prototype as any)[name];
});
const mount = () => act(() => root.render(React.createElement(Launcher, { staticPreview: true })));

it('exchanges distant app positions without shifting intervening apps, and restores the saved order', () => {
  mount(); const before = gridOrder();
  press('character'); moveTo('call'); release();
  const expected = [...before]; [expected[0], expected[2]] = [expected[2], expected[0]];
  expect(gridOrder()).toEqual(expected);
  expect(state.updateTheme).toHaveBeenCalledOnce();
  remount(); expect(gridOrder()).toEqual(expected);
});

it('exchanges apps on different pages while preserving every other position', () => {
  mount(); const before = gridOrder();
  press('character'); moveTo('faq'); release();
  const expected = [...before]; const target = before.indexOf('faq');
  [expected[0], expected[target]] = [expected[target], expected[0]];
  expect(gridOrder()).toEqual(expected);
});

it('both cross-page exchanged apps can still open after leaving edit mode', () => {
  mount(); press('character'); moveTo('faq'); release();
  const done = Array.from(host.querySelectorAll('button')).find(el => el.textContent === '完成')!;
  act(() => done.click()); advance(800);
  act(() => item('character').querySelector('button')!.click());
  act(() => item('faq').querySelector('button')!.click());
  expect(state.openApp.mock.calls.map(call => call[0])).toEqual(['character', 'faq']);
});

it.each([false, true])('date and appearance open after repeated round trips in ONE edit session, custom outline=%s', custom => {
  if (custom) {
    state.theme = { preserveCustomIconOutlines: true };
    state.customIcons = { date: 'data:image/png;base64,date', appearance: 'data:image/png;base64,appearance' };
  }
  mount(); const before = gridOrder();
  for (let i = 0; i < 3; i++) {
    press('date'); moveTo('appearance'); release();
    press('date'); moveTo('appearance'); release();
    expect(gridOrder()).toEqual(before);
    expect(host.querySelector('.launcher-editing')).not.toBeNull();
    advance(800);
    act(() => item('date').querySelector('button')!.click());
    expect(state.openApp).not.toHaveBeenCalled();
  }
  const done = Array.from(host.querySelectorAll('button')).find(el => el.textContent === '完成')!;
  act(() => done.click()); advance(800);
  act(() => item('date').querySelector('button')!.click());
  act(() => item('appearance').querySelector('button')!.click());
  expect(state.openApp.mock.calls.map(call => call[0])).toEqual(['date', 'appearance']);
  expect(state.updateTheme).toHaveBeenCalledTimes(6);
});

it('opens an app once through its icon, label or keyboard, including the dock and nested second-page grids', () => {
  mount();
  for (const id of ['date', 'appearance', 'chat', 'bank']) {
    const button = item(id).querySelector('button')!;
    act(() => button.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => (button.querySelector('span') || button).dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => button.click());
    expect(state.openApp.mock.calls.slice(-3).map(call => call[0])).toEqual([id, id, id]);
  }
  expect(state.openApp).toHaveBeenCalledTimes(12);
});

it('does not launch on the click generated after mouse paging, but the next tap and keyboard click still work', () => {
  mount(); const button = item('date').querySelector('button')!;
  const mouse = (type: string, x: number, detail = 0) => act(() => button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, detail })));
  mouse('mousedown', 180); mouse('mousemove', 100); mouse('mouseup', 100); mouse('click', 100, 1);
  expect(state.openApp).not.toHaveBeenCalled();
  // 键盘生成的 click 不属于鼠标滑页的尾随点击。
  act(() => button.click()); expect(state.openApp).toHaveBeenCalledTimes(1);
  pointer(button, 'pointerdown'); release(); mouse('click', 100, 1);
  expect(state.openApp).toHaveBeenCalledTimes(2);
});

it('exchanges dock positions and keeps the chat badge attached to the chat app identity', () => {
  state.unreadMessages = { 'test-character': 3 };
  mount(); const before = dockOrder();
  press('chat'); moveTo('settings'); release();
  expect(dockOrder()).toEqual(['settings', before[1], before[2], 'chat']);
  expect(gridOrder()).not.toContain('chat');
  expect(item('chat').querySelector('.absolute')?.textContent).toBe('3');
  expect(item('settings').querySelector('.absolute')).toBeNull();
  remount(); expect(dockOrder()).toEqual(['settings', before[1], before[2], 'chat']);
});

it('exchanges widget cells without shifting the other two cells or reordering their apps', () => {
  mount(); const apps = gridOrder();
  press('music'); moveTo('image'); release();
  expect(widgetOrder()).toEqual(['image', 'appsA', 'appsB', 'music']);
  expect(gridOrder()).toEqual(apps);
});

it('does not allow a grid app to move into the dock or a widget cell', () => {
  mount(); const apps = gridOrder(); const dock = dockOrder();
  press('character'); moveTo('chat'); release();
  press('character'); moveTo('image'); release();
  expect(gridOrder()).toEqual(apps); expect(dockOrder()).toEqual(dock);
  expect(state.updateTheme).not.toHaveBeenCalled();
});

it.each([false, true])('custom icons keep the same drag and exchange behavior with preserve outline=%s', preserveCustomIconOutlines => {
  state.theme = { preserveCustomIconOutlines };
  state.customIcons = { character: 'data:image/png;base64,test' };
  mount(); const img = item('character').querySelector('img')!;
  expect(img.draggable).toBe(false);
  expect(img.classList.contains('pointer-events-none')).toBe(true);
  press('character'); moveTo('call'); release();
  expect(gridOrder().slice(0, 3)).toEqual(['call', 'memory_palace', 'character']);
});

it('intercepts native touch scrolling only after a long press succeeds and releases it after cancellation', () => {
  mount();
  const touchMove = () => { const event = new Event('touchmove', { bubbles: true, cancelable: true }); act(() => item('character').dispatchEvent(event)); return event.defaultPrevented; };
  pointer(item('character'), 'pointerdown'); advance(300);
  expect(touchMove()).toBe(false);
  advance(220); expect(touchMove()).toBe(true);
  moveTo('call'); release('pointercancel');
  expect(touchMove()).toBe(false);
  expect(gridOrder().slice(0, 3)).toEqual(['character', 'memory_palace', 'call']);
  expect(state.updateTheme).not.toHaveBeenCalled();
  expect(document.querySelector('.launcher-drag-ghost')).toBeNull();
});

it('cancels an early moving press, ignores a second finger, and does not accidentally launch an app while editing', () => {
  mount(); pointer(item('character'), 'pointerdown');
  pointer(host.querySelector('.launcher-desktop')!, 'pointermove', 1, 180); advance(600);
  expect(host.querySelector('.launcher-editing')).toBeNull();
  press('character'); pointer(item('call'), 'pointerdown', 2);
  moveTo('call'); release(); advance(800);
  act(() => item('character').querySelector('button')!.click());
  expect(state.openApp).not.toHaveBeenCalled();
  const done = Array.from(host.querySelectorAll('button')).find(el => el.textContent === '完成')!;
  act(() => done.click()); advance(800);
  act(() => item('character').querySelector('button')!.click());
  expect(state.openApp).toHaveBeenCalledWith('character');
});

it('ignores child capture transfer but cancels if the launcher itself loses pointer capture', () => {
  mount(); press('character'); moveTo('call');
  pointer(item('character'), 'lostpointercapture');
  expect(document.querySelector('.launcher-drag-ghost')).not.toBeNull();
  pointer(host.querySelector('.launcher-desktop')!, 'lostpointercapture');
  expect(document.querySelector('.launcher-drag-ghost')).toBeNull();
  expect(state.updateTheme).not.toHaveBeenCalled();
});

it('keeps custom order when an unseen app is added and filters obsolete or duplicate IDs', () => {
  const available = INSTALLED_APPS.filter(app => !DOCK_APPS.includes(app.id)).map(app => app.id);
  state.theme = { launcherAppOrder: ['obsolete', available[2], available[0], available[2], ...available.slice(3)] };
  mount();
  expect(gridOrder()).toEqual([available[2], available[0], ...available.slice(3), available[1]]);
});
