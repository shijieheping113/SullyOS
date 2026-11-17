// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LockScreenEditor from '../components/lockscreen/LockScreenEditor';
import { LOCK_SCREEN_SETTINGS_KEY, readLockScreenSettings, saveLockScreenSettings } from '../components/lockscreen/lockScreenSettings';
import type { LockScreenSettings } from '../components/lockscreen/lockScreenSettings';

const state = vi.hoisted(() => ({ preview: null as LockScreenSettings | null, save: vi.fn(), close: vi.fn() }));
vi.mock('../context/OSContext', () => ({ useOS: () => ({ theme: {}, realtimeConfig: {}, saveLockScreenAppearance: state.save, addToast: vi.fn() }) }));
vi.mock('../hooks/useLocalBackHandler', () => ({ useLocalBackHandler() {} }));
vi.mock('../components/lockscreen/LockScreenData', () => ({ useLockForeground: () => ({ url: '' }) }));
vi.mock('../components/lockscreen/LockScreen', () => ({ default: ({ preview }: { preview: { settings: LockScreenSettings } }) => {
  state.preview = preview.settings;
  return null;
} }));
vi.mock('./blobRef', () => ({ putImageBlob: vi.fn(), deleteBlobRefIfUnreferenced: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
function button(text: string) {
  const target = [...host.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.trim() === text || el.getAttribute('aria-label') === text);
  if (!target) throw new Error('Missing button: ' + text);
  return target;
}
const click = (text: string) => act(() => button(text).click());

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.save.mockReset().mockImplementation(async (settings: LockScreenSettings) => saveLockScreenSettings(settings));
  state.close.mockReset();
  saveLockScreenSettings({ caption: '保留文字', glass: { clock: { shadow: .62 } } });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(React.createElement(LockScreenEditor, { onClose: state.close })));
  click('上下阴影');
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.removeItem(LOCK_SCREEN_SETTINGS_KEY);
});

it('keeps edits in the preview until completion, retaining disabled values and unrelated settings', async () => {
  click('顶部阴影');
  expect(host.querySelector<HTMLFieldSetElement>('[aria-label="顶部阴影参数"]')!.disabled).toBe(true);
  expect(state.preview!.shade!.top).toEqual({ enabled: false, strength: .09, range: 16 });
  expect(readLockScreenSettings().shade!.top.enabled).toBe(true);
  click('顶部阴影');
  expect(state.preview!.shade!.top).toEqual({ enabled: true, strength: .09, range: 16 });
  click('调底部');
  expect(host.querySelector('.lock-editor-sheet')!.hasAttribute('data-top-sheet')).toBe(true);
  click('收起设置');
  expect(host.querySelector('.lock-editor-sheet')!.hasAttribute('data-top-sheet')).toBe(true);
  click('展开设置');
  click('底部阴影');
  await act(async () => button('完成').click());
  expect(state.save).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
  expect(readLockScreenSettings().shade!.bottom).toEqual({ enabled: false, strength: .15, range: 24 });
  expect(readLockScreenSettings().caption).toBe('保留文字');
  expect(readLockScreenSettings().glass).toEqual({ clock: { shadow: .62 } });
});

it('restores only shading and discards unsaved edits through the existing back confirmation', () => {
  click('顶部阴影');
  click('调底部');
  click('底部阴影');
  click('恢复上下阴影默认');
  expect(state.preview!.shade).toEqual(readLockScreenSettings().shade);
  expect(state.preview!.glass).toEqual({ clock: { shadow: .62 } });
  expect(state.preview!.caption).toBe('保留文字');
  click('调顶部');
  expect(host.querySelector('.lock-editor-sheet')!.hasAttribute('data-top-sheet')).toBe(false);
  click('顶部阴影');
  click('返回外观');
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  click('放弃修改');
  expect(state.save).not.toHaveBeenCalled();
  expect(state.close).toHaveBeenCalledOnce();
  expect(readLockScreenSettings().shade!.top.enabled).toBe(true);
});
