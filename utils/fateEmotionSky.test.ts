// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import FateEmotionView, { type FateEmotionViewProps } from '../components/schedule/FateEmotionView';
import type { CharacterProfile, CharacterBuff, ApiPreset } from '../types';

const presets = [
    { id: 'gentle', name: '细腻模型', config: { baseUrl: 'https://gentle.test', apiKey: 'test-key', model: 'gentle-model' } },
    { id: 'quick', name: '轻快模型', config: { baseUrl: 'https://quick.test', apiKey: 'test-key-2', model: 'quick-model' } },
] as ApiPreset[];
const makeBuffs = (count: number): CharacterBuff[] => Array.from({ length: count }, (_, index) => ({
    id: `emotion-${index}`, name: `emotion-${index}`, label: `情绪${index + 1}的完整名称`, emoji: '🌸', description: `真实情绪描述${index + 1}`,
    intensity: (index % 3 + 1) as 1 | 2 | 3,
} as CharacterBuff));
const makeChar = (count: number) => ({ id: 'sky-character', name: '小满', scheduleFeatureEnabled: false, emotionConfig: { enabled: true }, activeBuffs: makeBuffs(count) } as CharacterProfile);
let host: HTMLDivElement;
let root: Root;
let props: FateEmotionViewProps;
async function render(changes: Partial<FateEmotionViewProps> = {}) {
    props = { ...props, ...changes };
    await act(async () => { root.render(React.createElement(FateEmotionView, props)); });
}
async function click(name: string) {
    const button = Array.from(document.body.querySelectorAll('button')).find(item => item.getAttribute('aria-label') === name || item.textContent === name);
    expect(button, `找不到按钮 ${name}`).toBeTruthy();
    await act(async () => { button!.click(); });
}
async function input(label: string, value: string) {
    const field = Array.from(host.querySelectorAll('label')).find(item => item.firstChild?.textContent === label)?.querySelector('input');
    expect(field, `找不到输入框 ${label}`).toBeTruthy();
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
        field!.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
const stars = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.fate-sky-star'));
async function selectStar(index: number) { await act(async () => { stars()[index].click(); }); }

beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    props = { char: makeChar(0), apiPresets: presets, onSave: vi.fn(), onClearBuffs: vi.fn(), onAddApiPreset: vi.fn() };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

describe('真实情绪成为可点击星星', () => {
    it.each([0, 1, 2, 6])('%i 种情绪只画对应真实星点，不再盘下堆列表', async count => {
        await render({ char: makeChar(count) });
        expect(stars()).toHaveLength(count);
        expect(host.querySelector('.fate-sky-identity')?.textContent).toBe(`小满${count} 种情绪`);
        expect(host.querySelector('.fate-sky-chart .fate-sky-identity')).toBeNull();
        expect(host.querySelector('.fate-sky-center')).toBeNull();
        expect(host.querySelector('.fate-astrolabe')).toBeTruthy();
        expect(host.querySelector('.fate-settings-buffs')).toBeNull();
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        expect(document.body.querySelector('.fate-sky-detail')).toBeNull();
        expect(stars().every(star => !star.hasAttribute('aria-controls'))).toBe(true);
        expect(host.querySelector('.fate-sky-pages')).toBeNull();
        expect(host.querySelector('.fate-emotion-model')?.compareDocumentPosition(host.querySelector('.fate-sky-region')!)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
        for (let index = 0; index < count; index++) expect(stars()[index].textContent).toBe(props.char.activeBuffs![index].label);
        if (!count) {
            expect(host.querySelector('.fate-sky-hint')?.textContent).toContain('还没有情绪，聊聊天再来看看。');
            expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === '清除情绪')).toBe(false);
        }
    });
    it('强度使用真实值，选择和收起详情不保存任何数据', async () => {
        await render({ char: makeChar(3) });
        expect(stars().map(star => star.dataset.intensity)).toEqual(['1', '2', '3']);
        expect(stars().map(star => star.getAttribute('aria-label'))).toEqual(props.char.activeBuffs!.map(buff => `${buff.label}，强度 ${buff.intensity} / 3`));
        stars()[2].focus(); expect(document.activeElement).toBe(stars()[2]);
        await selectStar(2);
        const detail = document.body.querySelector('[role="dialog"]')!;
        expect(host.querySelector('[role="dialog"]')).toBeNull();
        expect(document.getElementById(stars()[2].getAttribute('aria-controls')!)).toBe(detail.querySelector('.fate-sky-detail'));
        expect(detail.textContent).toContain('🌸');
        expect(detail.textContent).toContain('情绪3的完整名称');
        expect(detail.textContent).toContain('真实情绪描述3');
        expect(detail.textContent).toContain('强度 3 / 3');
        expect(detail.querySelectorAll('[data-lit="true"]')).toHaveLength(3);
        expect(stars()[2].getAttribute('aria-pressed')).toBe('true');
        await click('关闭情绪3的完整名称');
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(stars()[2]);
        expect(host.querySelector('.fate-sky-hint')?.textContent).toBe('点星星查看情绪');
        expect(stars().every(star => star.getAttribute('aria-pressed') === 'false')).toBe(true);
        expect(props.onSave).not.toHaveBeenCalled(); expect(props.onClearBuffs).not.toHaveBeenCalled();
    });
    it('再点同颗星或Escape关闭小窗，焦点回触发星', async () => {
        await render({ char: makeChar(2) }); await selectStar(1); await selectStar(1);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(stars()[1]);
        await selectStar(0);
        await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(stars()[0]);
        expect(props.onSave).not.toHaveBeenCalled();
    });
    it('15种情绪分为6、6、3颗，所有情绪都能读，换页不更改数据', async () => {
        await render({ char: makeChar(15) });
        const visited: string[] = [];
        for (let page = 0; page < 3; page++) {
            expect(host.querySelector('.fate-sky-pages')?.textContent).toContain(`第 ${page + 1} / 3 页`);
            expect(stars()).toHaveLength(page === 2 ? 3 : 6);
            for (let index = 0; index < stars().length; index++) {
                visited.push(stars()[index].textContent!); await selectStar(index);
                expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(`真实情绪描述${page * 6 + index + 1}`);
                await click(`关闭${props.char.activeBuffs![page * 6 + index].label}`);
            }
            if (page < 2) { await click('下一星页'); expect(document.body.querySelector('[role="dialog"]')).toBeNull(); }
        }
        expect(visited).toEqual(props.char.activeBuffs!.map(buff => buff.label));
        const last = stars().map(star => star.dataset.slot);
        await click('上一星页'); await click('下一星页');
        expect(stars().map(star => star.dataset.slot)).toEqual(last);
        expect(props.onSave).not.toHaveBeenCalled(); expect(props.onClearBuffs).not.toHaveBeenCalled();
    });
    it('删除选中情绪立即移除详情，缩短数据后页号安全，切角色回第一页', async () => {
        await render({ char: makeChar(15) }); await click('下一星页'); await click('下一星页'); await selectStar(2);
        await render({ char: { ...props.char, activeBuffs: makeBuffs(2) } });
        expect(stars()).toHaveLength(2); expect(host.querySelector('.fate-sky-pages')).toBeNull();
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        await selectStar(0);
        await render({ char: { ...makeChar(15), id: 'second-character', name: '小夏' } });
        expect(host.querySelector('.fate-sky-pages')?.textContent).toContain('第 1 / 3 页');
        expect(host.querySelector('.fate-sky-identity')?.textContent).toContain('小夏');
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
});

describe('情绪设置原有操作', () => {
    it('独立开关仅保存情绪配置，清除全部必须确认，取消不调用保存', async () => {
        await render({ char: makeChar(15) });
        await click('情绪独立开关'); expect(props.onSave).toHaveBeenCalledWith({ enabled: false });
        vi.mocked(window.confirm).mockReturnValue(false); await click('清除情绪');
        expect(props.onClearBuffs).not.toHaveBeenCalled();
        expect(window.confirm).toHaveBeenCalledWith('清除小满的全部 15 个当前情绪？清除后无法恢复。');
        vi.mocked(window.confirm).mockReturnValue(true); await click('清除情绪'); expect(props.onClearBuffs).toHaveBeenCalledOnce();
    });
    it('预设搜索载入整套URL、Key和模型，保存角色与保存预设分别有效', async () => {
        await render(); expect(host.querySelector('details')?.open).toBe(false);
        await click('搜索 / 选择模型预设'); await input('搜索预设', 'gentle-model');
        expect(host.querySelectorAll('.fate-settings-preset-list button')).toHaveLength(1);
        await click('细腻模型gentle-model'); expect(props.onSave).not.toHaveBeenCalled();
        expect(host.querySelector('summary')?.textContent).toContain('细腻模型');
        expect((host.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('test-key');
        await click('保存情绪模型'); expect(props.onSave).toHaveBeenCalledWith({ enabled: true, api: presets[0].config });
        await click('保存为预设'); await input('预设名称', '星盘专用'); await click('确认保存预设');
        expect(props.onAddApiPreset).toHaveBeenCalledWith('星盘专用', presets[0].config);
    });
    it('填写不完整不能保存，失败保留草稿，保留当前值与留空主模型可用', async () => {
        await render({ char: { ...makeChar(1), emotionConfig: { enabled: true, api: presets[0].config } } });
        await input('模型名称', 'draft'); await click('保留当前值');
        expect((host.querySelectorAll('input')[2] as HTMLInputElement).value).toBe('gentle-model');
        await click('留空用主模型'); await input('URL', 'https://draft.test'); await click('保存情绪模型');
        expect(props.onSave).not.toHaveBeenCalled();
        await input('Key', 'draft-key'); await input('模型名称', 'draft-model');
        vi.mocked(props.onSave).mockImplementationOnce(() => { throw new Error('failed'); });
        await click('保存情绪模型'); expect(host.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
        expect((host.querySelectorAll('input')[2] as HTMLInputElement).value).toBe('draft-model');
        await click('留空用主模型'); await click('保存情绪模型');
        expect(props.onSave).toHaveBeenLastCalledWith({ enabled: true, api: undefined });
        await input('模型名称', 'unsaved'); await render({ char: { ...makeChar(0), id: 'another' } });
        expect((host.querySelectorAll('input')[2] as HTMLInputElement).value).toBe('');
        await render({ isBusy: true }); expect((host.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
    });
});
