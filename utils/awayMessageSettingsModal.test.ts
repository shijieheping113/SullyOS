// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CharacterProfile } from '../types';
vi.mock('./awayMessage', () => ({ isAwayCloudRoute: vi.fn().mockResolvedValue(false) }));
import AwayMessageSettingsModal from '../components/chat/AwayMessageSettingsModal';

let host: HTMLDivElement;
let root: Root;
const save = vi.fn();
const close = vi.fn();
const character = (delayMinutes = 90, delayMode?: 'custom' | 'preset') => ({ id: 'ann-test', name: '测试角色', awayMessage: { enabled: true, delayMinutes, delayMode } } as CharacterProfile);
async function render(char = character(), isOpen = true) {
    await act(async () => root.render(React.createElement(AwayMessageSettingsModal, { isOpen, char, onSave: save, onClose: close })));
}
async function click(text: string) {
    const button = Array.from(host.querySelectorAll('button')).find(node => node.textContent === text);
    expect(button).toBeTruthy();
    await act(async () => button!.click());
}
function wheel(label: string) { return host.querySelector(`[role="spinbutton"][aria-label="${label}"]`) as HTMLDivElement; }
async function key(label: string, key: string) {
    await act(async () => wheel(label).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host);
    root = createRoot(host); save.mockClear(); close.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('滚动即更新时长，立即保存，再打开保留自定义（即使时长等于预设）', async () => {
    await render(); await click('自定义');
    await act(async () => { wheel('小时').scrollTop = 88; wheel('小时').dispatchEvent(new Event('scroll')); });
    await act(async () => { wheel('分钟').scrollTop = 220; wheel('分钟').dispatchEvent(new Event('scroll')); });
    expect(host.textContent).toContain('2 小时 5 分钟后');
    await click('保存');
    expect(save).toHaveBeenLastCalledWith({ enabled: true, delayMinutes: 125, delayMode: 'custom' });
    await render(character(90, 'custom'));
    expect(wheel('小时').getAttribute('aria-valuenow')).toBe('1');
    expect(wheel('分钟').getAttribute('aria-valuenow')).toBe('30');
});

it('零小时最短一分钟，24 小时强制零分钟，返回其他小时分钟可选', async () => {
    await render(character(125));
    await key('小时', 'Home');
    await key('分钟', 'Home');
    expect(host.textContent).toContain('1 分钟后');
    await key('小时', 'End');
    expect(wheel('分钟').getAttribute('aria-valuemax')).toBe('0');
    await key('分钟', 'ArrowDown'); await click('保存');
    expect(save).toHaveBeenLastCalledWith({ enabled: true, delayMinutes: 1440, delayMode: 'custom' });
    await key('小时', 'ArrowUp'); await key('分钟', 'End');
    expect(host.textContent).toContain('23 小时 59 分钟后');
});

it('固定选项可切回；取消不保存；关开弹窗和换角色丢弃未保存修改', async () => {
    const char = character(125);
    await render(char); await key('分钟', 'ArrowDown');
    await click('30 分钟'); expect(wheel('小时')).toBeNull();
    await click('自定义'); expect(host.textContent).toContain('2 小时 6 分钟后');
    await click('取消'); expect(save).not.toHaveBeenCalled();
    await render(char, false); await render(char);
    expect(host.textContent).toContain('2 小时 5 分钟后');
    await click('30 分钟'); await click('保存');
    expect(save).toHaveBeenLastCalledWith({ enabled: true, delayMinutes: 30, delayMode: 'preset' });
    await render(character(60)); expect(wheel('小时')).toBeNull();
});
