// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FateOverlay from '../components/schedule/FateOverlay';
let root: Root, host: HTMLDivElement, opener: HTMLButtonElement;
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    opener = document.createElement('button'); opener.textContent = '开牌'; document.body.append(opener); opener.focus();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); opener.remove(); });
describe('命运图文小窗', () => {
    it('使用独立小窗并在卸载后把焦点还给开牌按钮', async () => {
        await act(async () => root.render(React.createElement(FateOverlay, { title: '牌面', onClose: vi.fn(), children: React.createElement('p', null, '真实含义') })));
        const dialog = document.body.querySelector('[role="dialog"]')!;
        expect(host.contains(dialog)).toBe(false);
        expect(dialog.textContent).toContain('真实含义');
        expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭牌面');
        await act(async () => root.render(null));
        expect(document.activeElement).toBe(opener);
    });
    it('Esc与背景均能发出关闭操作，正文点击不关闭', async () => {
        const close = vi.fn();
        await act(async () => root.render(React.createElement(FateOverlay, { title: '牌面', onClose: close, children: React.createElement('p', null, '真实含义') })));
        const backdrop = document.body.querySelector('.fate-overlay')!;
        await act(async () => (backdrop.querySelector('p') as HTMLElement).click());
        expect(close).not.toHaveBeenCalled();
        await act(async () => backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        expect(close).toHaveBeenCalledTimes(1);
        await act(async () => (backdrop as HTMLElement).click());
        expect(close).toHaveBeenCalledTimes(2);
    });
    it('键盘Tab留在小窗的实际控件中', async () => {
        await act(async () => root.render(React.createElement(FateOverlay, { title: '牌面', onClose: vi.fn(), children: React.createElement('button', { 'data-last': true }, '放回牌面') })));
        const backdrop = document.body.querySelector('.fate-overlay')!;
        const first = backdrop.querySelector('button') as HTMLButtonElement;
        const last = backdrop.querySelector('[data-last]') as HTMLButtonElement;
        last.focus();
        await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
        expect(document.activeElement).toBe(first);
        await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
        expect(document.activeElement).toBe(last);
    });
});
