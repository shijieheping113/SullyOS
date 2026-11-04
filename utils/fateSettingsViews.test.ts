// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import FateLibraryView from '../components/schedule/FateLibraryView';
import FateEmotionView from '../components/schedule/FateEmotionView';
import { loadFateSettings, saveFateSettings } from './fateSettings';
import type { CharacterProfile, ApiPreset } from '../types';

let host: HTMLDivElement;
let root: Root;
const char = { id: 'fate-view-test', name: '小满', scheduleFeatureEnabled: false, emotionFeatureEnabled: true, emotionConfig: { enabled: true } } as CharacterProfile;
const onChange = vi.fn();
const onSave = vi.fn();
const presets = [
    { id: 'one', name: '轻快模型', config: { baseUrl: 'https://one.test', apiKey: 'secret-one', model: 'fast-one' } },
    { id: 'two', name: '细腻模型', config: { baseUrl: 'https://two.test', apiKey: 'secret-two', model: 'soft-two' } },
] as ApiPreset[];
async function render(element: React.ReactElement) { await act(async () => { root.render(element); }); }
async function click(text: string) {
    const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent === text || item.getAttribute('aria-label') === text);
    expect(button, `找不到按钮 ${text}`).toBeTruthy();
    await act(async () => { button!.click(); });
}
async function input(label: string, value: string) {
    const element = (host.querySelector(`[aria-label="${label}"]`) || Array.from(host.querySelectorAll('label')).find(item => item.firstChild?.textContent === label || item.textContent === label)?.querySelector('input,textarea,select')) as HTMLInputElement;
    expect(element, `找不到输入框 ${label}`).toBeTruthy();
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function expand(name: string) {
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('.fate-settings-entry-head')).find(item => item.textContent?.startsWith(name));
    expect(button).toBeTruthy(); await act(async () => button!.click());
}
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('命运资料库粉色页面', () => {
    it('读取真实计数，分批载入，搜索、分类和启停筛选都生效', async () => {
        await render(React.createElement(FateLibraryView, { char, onChange }));
        expect(host.textContent).toContain('因子 · 320');
        expect(host.querySelectorAll('.fate-settings-entry')).toHaveLength(24);
        expect(host.querySelector('header')?.nextElementSibling?.tagName).toBe('DETAILS');
        expect(host.querySelector('details')?.open).toBe(false);
        await click('再看 24 项'); expect(host.querySelectorAll('.fate-settings-entry')).toHaveLength(48);
        await input('分类筛选', '变化'); expect(host.querySelectorAll('.fate-settings-entry')).toHaveLength(16);
        await input('搜索因子', '转向'); expect(host.querySelectorAll('.fate-settings-entry')).toHaveLength(1);
        await expand('转向'); await click('停用转向');
        expect(loadFateSettings(char.id).disabledFactorIds).toContain('change-turn');
        await input('启用状态', 'enabled'); expect(host.querySelectorAll('.fate-settings-entry')).toHaveLength(0);
        await input('启用状态', 'disabled'); expect(host.querySelectorAll('.fate-settings-entry')).toHaveLength(1);
    });
    it('原位编辑保存，拒绝重复名称，失败时保留填写内容', async () => {
        await render(React.createElement(FateLibraryView, { char, onChange }));
        await expand('转向'); await click('编辑因子'); await input('含义', '让日常多一个新的方向。'); await click('保存条目');
        expect(loadFateSettings(char.id).factors[0].meaning).toBe('让日常多一个新的方向。');
        await click('添加因子'); await input('名称', '转向'); await input('含义', '重复检查'); await click('保存条目');
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('名称重复');
        await input('名称', '自定义小晴天');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
        await click('保存条目'); expect(host.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
        expect(Array.from(host.querySelectorAll('input')).some(item => item.value === '自定义小晴天')).toBe(true);
    });
    it('恢复内置因子保留非内置条目和停用状态，取消确认不保存', async () => {
        const settings = loadFateSettings(char.id);
        settings.factors.push({ id: 'imported-entry', name: '自带条目', meaning: '从备份带入', category: '自定义' });
        settings.disabledFactorIds = ['imported-entry', 'change-turn']; saveFateSettings(char.id, settings);
        await render(React.createElement(FateLibraryView, { char, onChange })); await click('恢复内置因子');
        expect(loadFateSettings(char.id).factors).toHaveLength(321);
        expect(loadFateSettings(char.id).disabledFactorIds).toEqual(['imported-entry']);
        vi.mocked(window.confirm).mockReturnValue(false);
        await expand('转向'); await click('停用转向'); expect(loadFateSettings(char.id).disabledFactorIds).toEqual(['imported-entry']);
    });
    it('倾向可编辑，日程模型完整保存且密钥遮挡', async () => {
        await render(React.createElement(FateLibraryView, { char, onChange })); await click('倾向 · 6');
        await expand('事业与求索'); await click('编辑倾向'); await input('含义', '认真探索'); await click('保存条目');
        expect(loadFateSettings(char.id).tendencies[0].meaning).toBe('认真探索');
        await input('URL', 'https://schedule.test'); await click('保存日程模型'); expect(onChange).not.toHaveBeenCalled();
        await input('Key', 'secret'); await input('模型名称', 'schedule'); await click('保存日程模型');
        expect(host.querySelector('input[type="password"]')).toBeTruthy();
        expect(onChange).toHaveBeenCalledWith({ scheduleApi: { baseUrl: 'https://schedule.test', apiKey: 'secret', model: 'schedule' } });
    });
});
describe('情绪独立页面', () => {
    it('日程关闭也显示情绪开启，切换仅保存情绪配置', async () => {
        await render(React.createElement(FateEmotionView, { char, apiPresets: presets, onSave, onClearBuffs: vi.fn() }));
        expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
        await act(async () => (host.querySelector('[role="switch"]') as HTMLButtonElement).click());
        expect(onSave).toHaveBeenCalledWith({ enabled: false });
    });
    it('搜索预设并载入整套模型，保存前不覆盖角色，切角色重置未保存内容', async () => {
        const props = { char, apiPresets: presets, onSave, onClearBuffs: vi.fn() };
        await render(React.createElement(FateEmotionView, props));
        expect(host.querySelector('.fate-settings-preset-list')).toBeNull();
        expect(host.querySelector('.fate-settings-preset-trigger')?.textContent).toContain('主模型');
        await click('搜索 / 选择模型预设'); await input('搜索预设', 'soft-two');
        expect(host.querySelectorAll('.fate-settings-preset-list button')).toHaveLength(1);
        await click('细腻模型soft-two'); expect(onSave).not.toHaveBeenCalled();
        expect(host.querySelector('.fate-settings-preset-trigger')?.textContent).toContain('细腻模型');
        expect(host.textContent).toContain('模型尚未保存');
        expect((host.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('secret-two');
        await click('保存情绪模型'); expect(onSave).toHaveBeenCalledWith({ enabled: true, api: presets[1].config });
        await input('模型名称', '尚未保存');
        await render(React.createElement(FateEmotionView, { ...props, char: { ...char, id: 'another', emotionConfig: { enabled: false } } }));
        expect(Array.from(host.querySelectorAll('input')).some(item => item.value === '尚未保存')).toBe(false);
        expect(host.textContent).not.toContain('模型尚未保存');
    });
    it('保留当前值、留空主模型、预设保存和清除情绪确认均可用', async () => {
        const clear = vi.fn(); const add = vi.fn();
        const configured = { ...char, emotionConfig: { enabled: true, api: presets[0].config }, activeBuffs: [{ id: 'buff', name: 'joy', label: '心情亮亮的', intensity: 3 }] } as CharacterProfile;
        await render(React.createElement(FateEmotionView, { char: configured, apiPresets: presets, onSave, onClearBuffs: clear, onAddApiPreset: add }));
        expect(host.querySelector('.fate-settings-preset-trigger')?.textContent).toContain('轻快模型');
        expect(host.textContent).toContain('心情亮亮的'); expect(host.textContent).toContain('强度 3 / 3');
        await input('模型名称', 'other'); await click('保留当前值'); expect((host.querySelectorAll('input')[2] as HTMLInputElement).value).toBe('fast-one');
        await click('保存为预设'); await input('预设名称', '新预设'); await click('确认保存预设'); expect(add).toHaveBeenCalledWith('新预设', presets[0].config);
        await click('留空用主模型'); await click('保存情绪模型'); expect(onSave).toHaveBeenLastCalledWith({ enabled: true, api: undefined });
        vi.mocked(window.confirm).mockReturnValue(false); await click('清除情绪'); expect(clear).not.toHaveBeenCalled();
        vi.mocked(window.confirm).mockReturnValue(true); await click('清除情绪'); expect(clear).toHaveBeenCalledOnce();
    });
    it('保存失败仍保留草稿，忙碌时禁止保存和切换', async () => {
        onSave.mockImplementationOnce(() => { throw new Error('failed'); });
        const props = { char, apiPresets: presets, onSave, onClearBuffs: vi.fn() };
        await render(React.createElement(FateEmotionView, props));
        await input('URL', 'https://model.test'); await input('Key', 'secret'); await input('模型名称', 'soft'); await click('保存情绪模型');
        expect(host.querySelector('.fate-settings-preset-trigger')?.textContent).toContain('soft');
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('失败');
        expect(Array.from(host.querySelectorAll('input')).some(item => item.value === 'soft')).toBe(true);
        await render(React.createElement(FateEmotionView, { ...props, isBusy: true }));
        expect((host.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
    });
});
