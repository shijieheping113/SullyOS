// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import FateLibraryView from '../components/schedule/FateLibraryView';
import { defaultFateSettings, loadFateSettings, saveFateSettings } from './fateSettings';
import type { CharacterProfile } from '../types';

let host: HTMLDivElement;
let root: Root;
const char = { id: 'book', name: '小满' } as CharacterProfile;
const onChange = vi.fn();
async function render(isBusy = false) { await act(async () => root.render(React.createElement(FateLibraryView, { char, onChange, isBusy }))); }
async function click(label: string) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.getAttribute('aria-label') === label || item.textContent === label);
    expect(button, label).toBeTruthy(); await act(async () => button!.click());
}
async function input(label: string, value: string) {
    const field = (document.querySelector(`[aria-label="${label}"]`) || Array.from(document.querySelectorAll('label')).find(item => item.firstChild?.textContent === label || item.textContent === label)?.querySelector('input,textarea,select')) as HTMLInputElement;
    expect(field, label).toBeTruthy();
    const prototype = field.tagName === 'SELECT' ? HTMLSelectElement.prototype : field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
const names = () => Array.from(host.querySelectorAll('.fate-book-name')).map(item => item.textContent);
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); onChange.mockReset(); vi.spyOn(window, 'confirm').mockReturnValue(true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('命运六张翻页牌册', () => {
    it('每页六张，翻页内容真实不同，回页内容相同，倾向使用真实六项', async () => {
        await render(); const first = names();
        expect(first).toEqual(defaultFateSettings().factors.slice(0, 6).map(item => item.name));
        expect(host.querySelector('.fate-settings-summary')?.textContent).toBe('匹配 320 张添加因子');
        expect(host.textContent).not.toContain('启用 320');
        expect(host.textContent).toContain('第 1 / 54 页');
        await click('下一页'); expect(names()).toEqual(defaultFateSettings().factors.slice(6, 12).map(item => item.name));
        await click('上一页'); expect(names()).toEqual(first);
        await click('倾向 · 6'); expect(names()).toEqual(defaultFateSettings().tendencies.map(item => item.name));
        expect(Array.from(host.querySelectorAll('.fate-patron-art')).map(node => node.getAttribute('data-fate-patron'))).toEqual(defaultFateSettings().tendencies.map(item => item.id));
        expect(host.querySelector('.fate-book-card .fate-tarot-art')).toBeNull();
        expect(host.textContent).toContain('第 1 / 1 页');
        const firstGod = defaultFateSettings().tendencies[0];
        await click(`查看${firstGod.name}`);
        expect(document.body.querySelector('.fate-book-enlarged .fate-patron-art')?.getAttribute('data-fate-patron')).toBe(firstGod.id);
    });
    it('分类单一网格入口，全部20类可选，搜索和筛选返回第一页', async () => {
        await render(); expect(host.querySelector('select[aria-label="分类筛选"]')).toBeNull();
        await click('下一页'); await click('分类 · 全部分类');
        const nav = host.querySelector('.fate-book-categories')!;
        expect(nav.querySelectorAll('button')).toHaveLength(21);
        expect(Array.from(nav.querySelectorAll('button')).slice(1).map(item => item.textContent).sort()).toEqual(Array.from(new Set(defaultFateSettings().factors.map(item => item.category))).sort());
        await click('变化'); expect(host.textContent).toContain('第 1 / 3 页');
        await click('下一页'); await input('搜索因子', '转向'); expect(names()).toEqual(['转向']); expect(host.textContent).toContain('第 1 / 1 页');
        expect(host.querySelector('.fate-settings-summary')?.textContent).toBe('匹配 1 张添加因子');
        await input('搜索因子', ''); await click('下一页'); await input('启用状态', 'disabled');
        expect(names()).toEqual([]); expect(host.textContent).toContain('第 1 / 1 页');
    });
    it('牌面在portal打开，全含义可见，再点放回且保留页码和焦点', async () => {
        await render(); await click('下一页');
        const name = names()[0]!; const original = host.querySelector(`[aria-label="查看${name}"]`);
        await click(`查看${name}`);
        expect(host.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain(defaultFateSettings().factors[6].meaning);
        await click(`放回${name}`); expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(original); expect(host.textContent).toContain('第 2 / 54 页');
    });
    it('浮窗编辑原位替换、保存、停用和恢复启用，失败保留草稿', async () => {
        await render(); await click('查看转向'); await click('编辑因子');
        expect(document.querySelector('[aria-label="放回转向"]')).toBeNull();
        await input('含义', '新方向'); await click('保存条目'); expect(loadFateSettings(char.id).factors[0].meaning).toBe('新方向');
        await click('停用转向'); expect(loadFateSettings(char.id).disabledFactorIds).toContain('change-turn');
        await click('恢复启用转向'); expect(loadFateSettings(char.id).disabledFactorIds).not.toContain('change-turn');
        await click('编辑因子'); await input('含义', '内容保留');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
        await click('保存条目'); expect(document.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
        expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('内容保留');
    });
    it('关闭、取消、Escape与背景关闭遵守未保存确认，忙碌时保护草稿', async () => {
        await render(); await click('查看转向'); await click('编辑因子'); await input('名称', '草稿名称');
        vi.mocked(window.confirm).mockReturnValue(false);
        await click('取消编辑'); await click('关闭编辑因子');
        await act(async () => document.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        await act(async () => (document.querySelector('.fate-overlay') as HTMLElement).click());
        expect(Array.from(document.querySelectorAll('input')).some(item => item.value === '草稿名称')).toBe(true);
        vi.mocked(window.confirm).mockReturnValue(true); await render(true); await click('关闭编辑因子');
        expect(document.querySelector('[role="dialog"]')).toBeTruthy();
        await render(); await click('关闭编辑因子'); expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
    it('新增校验重复名称、恢复内置保留自定义及启停状态', async () => {
        await render(); await click('添加因子'); await input('名称', '转向'); await input('含义', '重复'); await click('保存条目');
        expect(document.querySelector('[role="alert"]')?.textContent).toContain('名称重复');
        await input('名称', '小风'); await click('保存条目'); expect(loadFateSettings(char.id).factors).toHaveLength(321);
        await click('停用小风'); await click('放回小风'); await click('恢复内置因子');
        const settings = loadFateSettings(char.id); const custom = settings.factors.find(item => item.name === '小风')!;
        expect(custom.id).toMatch(/^custom_/); expect(settings.disabledFactorIds).toContain(custom.id); expect(settings.factors).toHaveLength(321);
    });
    it('独立模型折叠、完整校验、保存失败保留表单，清空保存主模型', async () => {
        await render(); expect(host.querySelector('details')?.open).toBe(false);
        await input('URL', 'https://schedule.test'); await click('保存日程模型'); expect(onChange).not.toHaveBeenCalled();
        await input('Key', 'secret'); await input('模型名称', 'fate');
        expect(host.querySelector('input[type="password"]')).toBeTruthy();
        onChange.mockImplementationOnce(() => { throw new Error('save failed'); });
        await click('保存日程模型'); expect(host.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
        expect((host.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('secret');
        await click('保存日程模型'); expect(onChange).toHaveBeenLastCalledWith({ scheduleApi: { baseUrl: 'https://schedule.test', apiKey: 'secret', model: 'fate' } });
        await input('URL', ''); await input('Key', ''); await input('模型名称', ''); await click('保存日程模型'); expect(onChange).toHaveBeenLastCalledWith({ scheduleApi: undefined });
    });
    it('已停用筛选中停用牌消失后仍能在浮窗放回，页码合法', async () => {
        const settings = defaultFateSettings(); settings.disabledFactorIds = ['change-turn']; saveFateSettings(char.id, settings);
        await render(); await input('启用状态', 'disabled'); await click('查看转向'); await click('恢复启用转向');
        expect(host.querySelectorAll('.fate-book-card')).toHaveLength(0); await click('放回转向');
        expect(host.textContent).toContain('第 1 / 1 页');
    });
});
