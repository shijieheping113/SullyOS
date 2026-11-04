// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile } from '../types';
vi.mock('../components/schedule/FateLibraryView', () => ({ default: () => React.createElement('p', null, '牌库内容') }));
vi.mock('../components/schedule/FateEmotionView', () => ({ default: (props: any) => React.createElement('button', { onClick: () => props.onSave({ enabled: true }) }, '启用情绪') }));
import Suite, { type FateScheduleSuiteProps } from '../components/schedule/FateScheduleSuite';
import Modal from '../components/os/Modal';
let host: HTMLDivElement;
let root: Root;
let props: FateScheduleSuiteProps;
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    props = { character: { id: 'suite', name: '林屿', scheduleMode: 'fate' } as CharacterProfile, schedule: null, enabled: true, onChange: vi.fn(), apiPresets: [], onSaveEmotion: vi.fn(), onClearBuffs: vi.fn(), onToggle: vi.fn(), onReroll: vi.fn() };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = async () => { await act(async () => root.render(React.createElement(Suite, props))); };
const click = async (text: string) => { const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!; expect(button).toBeTruthy(); await act(async () => button.click()); };
describe('整套命运窗口', () => {
    it('日程关闭也能打开情绪和牌库，不改变独立日程开关', async () => {
        props.enabled = false;
        await render();
        expect(host.textContent).toContain('毛线球先睡一会儿');
        await click('情绪'); await click('启用情绪');
        expect(props.onSaveEmotion).toHaveBeenCalledWith({ enabled: true });
        expect(props.onToggle).not.toHaveBeenCalled();
        await click('牌库'); expect(host.textContent).toContain('牌库内容');
    });
    it('顶栏不放日程开关，开启时只在内容操作区，关闭时只留原开启入口', async () => {
        await render();
        expect(host.querySelector('.fate-suite__tabs [role="switch"]')).toBeNull();
        expect(host.querySelector('.fate-suite__switch-row')).toBeNull();
        expect(host.querySelectorAll('[aria-label="切换命运日程"]')).toHaveLength(1);
        props.enabled = false; await render();
        expect(host.querySelector('[role="switch"]')).toBeNull();
        await click('牵起生活线'); expect(props.onToggle).toHaveBeenCalledOnce();
    });
    it('命运日程内嵌，不重复标题或原版日程表', async () => {
        await render();
        expect(host.querySelectorAll('h1')).toHaveLength(0);
        expect(host.querySelector('.fate-panel--embedded')).toBeTruthy();
        expect(host.querySelector('.sully-schedule-item')).toBeNull();
    });
    it('切换页面会回到内容顶部，不沿用编辑时的向下滚动位置', async () => {
        host.classList.add('fate-dialog__body');
        await render();
        host.scrollTop = 300;
        await click('牌库');
        expect(host.scrollTop).toBe(0);
    });
    it('只有显式命运外观改变窗口，其他窗口保持原样', async () => {
        await act(async () => root.render(React.createElement(Modal, { isOpen: true, title: '原版', onClose: () => {}, children: React.createElement('p', null, '原内容') })));
        expect(host.querySelector('.fate-dialog')).toBeNull();
        expect(host.querySelector('.fate-dialog__corners')).toBeNull();
        await act(async () => root.render(React.createElement(Modal, { isOpen: true, appearance: 'fate', title: React.createElement('div', null, '原版 / 命运牌阵'), onClose: () => {}, children: React.createElement('p', null, '命运内容') })));
        expect(host.querySelector('.fate-dialog')).toBeTruthy();
        expect(host.querySelector('h3')).toBeNull();
    });
    it('只有整个命运窗口有四角花纹，切换三个页面都不在内容内另造外框', async () => {
        await act(async () => root.render(React.createElement(Modal, { isOpen: true, appearance: 'fate', title: '命运牌阵', onClose: () => {}, children: React.createElement(Suite, props) })));
        const frame = host.querySelector('.fate-dialog')!;
        const corners = host.querySelector('.fate-dialog__corners')!;
        expect(corners.parentElement).toBe(frame);
        expect(corners.querySelectorAll('svg')).toHaveLength(4);
        expect(host.querySelector('.fate-panel__corners')).toBeNull();
        expect(host.querySelector('.fate-dialog__body .fate-dialog__corners')).toBeNull();
        await click('牌库'); expect(host.querySelector('.fate-dialog__corners')).toBe(corners);
        await click('情绪'); expect(host.querySelector('.fate-dialog__corners')).toBe(corners);
        await click('日程'); expect(host.querySelectorAll('.fate-dialog__corners')).toHaveLength(1);
    });
});
