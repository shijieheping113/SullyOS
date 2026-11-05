// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, DailySchedule, ScheduleSlot } from '../types';
import FateSchedulePanel, { type FateSchedulePanelProps } from '../components/schedule/FateSchedulePanel';
import { resolveFateSlotTimes } from './fateSchedule';

const NOW = 1_800_000_000_000;
const current: ScheduleSlot = {
    startTime: '10:00', endTime: '12:00', startsAt: NOW - 3_600_000, endsAt: NOW + 3_600_000,
    activity: '沿海堤寻找旧灯塔', description: '走过海堤旁的旧书摊。摊主递来一幅手绘路线，灯塔藏在图纸折痕后。', location: '北岸旧书摊', homePosition: { kind: 'away' },
    fate: {
        tendency: { id: 'discovery', name: '经历与发现', meaning: '关注新见闻，让生活打开不同的可能。' },
        factors: [{ id: 'map', name: '地图', meaning: '寻找方向，也重新审视走过的路。' }, { id: 'fold', name: '折痕', meaning: '不起眼的细节隐藏意外线索。' }, { id: 'tide', name: '潮汐', meaning: '时机与变化推着事情向前。' }],
        peopleDirection: 'new', rationale: '地图带出路线，折痕藏住地点，潮汐决定出发时机。', activityKind: '探索', sceneKind: '海岸', development: '发现', usageDate: '2027-01-15',
    },
    theater: { lines: [], generatedAt: NOW - 30_000 },
};
const previous: ScheduleSlot = { ...current, activity: '窗边读信', startsAt: NOW - 10_800_000, endsAt: NOW - 7_200_000, startTime: '08:00', endTime: '09:00', theater: { lines: [], generatedAt: NOW - 7_000_000 } };
const character = { id: 'c1', name: '林屿', home3D: { rooms: [{ id: 'study', name: '书房' }] } } as CharacterProfile;
const makeSchedule = (slots = [previous, current]): DailySchedule => ({ id: 'fate:c1_day', charId: 'c1', date: '2027-01-15', slots, generatedAt: NOW - 50_000, mode: 'fate' });
let host: HTMLDivElement;
let root: Root;
let props: FateSchedulePanelProps;
async function render(patch: Partial<FateSchedulePanelProps> = {}) {
    props = { ...props, ...patch };
    await act(async () => root.render(React.createElement(FateSchedulePanel, props)));
}
function button(label: string, scope: ParentNode = host): HTMLButtonElement {
    const found = Array.from(scope.querySelectorAll('button')).find(item => item.textContent === label || item.getAttribute('aria-label') === label);
    expect(found, `找不到按钮 ${label}`).toBeTruthy();
    return found!;
}
async function click(label: string, scope: ParentNode = host) { await act(async () => button(label, scope).click()); }
function form(): HTMLFormElement { return document.body.querySelector('form')!; }
function fieldValue(label: string): string {
    const field = Array.from(form().querySelectorAll('label')).find(item => item.firstChild?.textContent === label)!.querySelector('input,textarea,select') as HTMLInputElement;
    return field.value;
}
async function fill(label: string, value: string) {
    const field = Array.from(form().querySelectorAll('label')).find(item => item.firstChild?.textContent === label)!.querySelector('input,textarea,select') as HTMLInputElement;
    await act(async () => { field.value = value; Simulate.change(field); });
}
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    props = { schedule: makeSchedule(), character, onEdit: vi.fn(), onDelete: vi.fn(), onReroll: vi.fn(), onPlayTheater: vi.fn() };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

describe('命运牌阵独立活动面板', () => {
    it('顶部只有居中神像，小猫重Roll和操作在正文下方，因子位于末尾', async () => {
        await render();
        expect(host.textContent).not.toContain('换一副牌，重写本轮');
        expect(host.textContent).not.toContain('下一段，顺着线来');
        expect(host.querySelector('.fate-panel__spread')).toBeNull();
        const activity = host.querySelector('[aria-label="本轮活动"]')!;
        const companion = activity.querySelector('.fate-panel__companion')!;
        const copy = activity.querySelector('.fate-panel__copy')!;
        const figures = activity.querySelector('.fate-panel__figures')!;
        const controls = activity.querySelector('.fate-panel__controls')!;
        expect(companion.parentElement).toBe(controls);
        expect(copy.parentElement).toBe(activity);
        expect(companion.nextElementSibling?.className).toBe('fate-panel__actions');
        expect(figures.querySelector('.fate-panel__patron')).toBeTruthy();
        expect(figures.querySelector('.fate-panel__cat')).toBeNull();
        expect(figures.parentElement).toBe(activity);
        expect(activity.querySelector('.fate-panel__orbit-map')).toBeNull();
        expect(companion.querySelector('.fate-panel__cat')).toBeTruthy();
        const reading = activity.nextElementSibling!;
        expect(reading.classList.contains('fate-panel__reading')).toBe(true);
        expect(reading.querySelectorAll('.fate-panel__card')).toHaveLength(3);
        expect(activity.querySelector('h3')?.nextElementSibling?.className).toBe('fate-panel__timing');
    });
    it('神像位于顶部，正文从活动标题开始，时间和状态同排', async () => {
        await render();
        const copy = host.querySelector('[aria-label="本轮活动"] .fate-panel__copy')!;
        const patron = host.querySelector('.fate-panel__figures .fate-panel__patron')!;
        expect(patron.textContent).toContain(current.fate!.tendency.name);
        expect(patron.querySelector('.fate-patron-art')?.getAttribute('data-fate-art')).toBe('认知');
        const title = copy.firstElementChild!;
        expect(title.tagName).toBe('H3');
        expect(title.textContent).toBe(current.activity);
        expect(title.nextElementSibling?.className).toBe('fate-panel__timing');
        expect(copy.querySelector('.fate-panel__timing .fate-panel__state')?.textContent).toBe('正在进行');
        expect(copy.querySelector('.fate-panel__description')?.textContent).toBe(current.description);
    });
    it('根据真实时间展示当前活动、三张真实因子牌、倾向和人物方向', async () => {
        await render();
        expect(host.querySelector('h1')?.textContent).toBe('命运牌阵');
        const activity = host.querySelector('[aria-label="本轮活动"]')!;
        expect(activity.textContent).toContain(current.activity);
        expect(activity.textContent).toContain('正在进行');
        expect(activity.textContent).toContain('10:00 — 12:00');
        expect(activity.textContent).toContain(current.description);
        expect(host.querySelectorAll('.fate-panel__deck')[0].querySelectorAll('button')).toHaveLength(3);
        expect(host.textContent).toContain('经历与发现');
        expect(host.querySelector('.fate-panel__patron')?.getAttribute('aria-expanded')).toBe('false');
    });
    it('重 Roll 成功后立刻显示新一轮，不先闪回更早的活动', async () => {
        await render();
        const title = () => host.querySelector('[aria-label="本轮活动"] h3')?.textContent;
        expect(title()).toBe(current.activity);
        // 新结果在页面上记的时间之后才到达：新日程的开始时间落在页面记住的时刻之后。
        const later = NOW + 60_000;
        vi.setSystemTime(later);
        const rerolled: ScheduleSlot = {
            ...current, activity: '新的活动', startTime: '10:01', endTime: '12:01',
            startsAt: later, endsAt: later + 7_200_000, theater: undefined,
        };
        await render({ schedule: makeSchedule([previous, rerolled]) });
        expect(title()).toBe('新的活动');
        expect(host.querySelector('[aria-label="本轮活动"]')?.textContent).toContain('正在进行');
    });
    it('三个行为和重Roll同排在正文下方，点顶部神像看小算盘并返回原神像', async () => {
        await render();
        const actions = host.querySelector('.fate-panel__copy [aria-label="活动操作"]')!;
        expect(actions.querySelectorAll('button')).toHaveLength(3);
        expect(actions.parentElement?.className).toBe('fate-panel__controls');
        expect(actions.parentElement?.previousElementSibling?.className).toBe('fate-panel__description');
        const trigger = button('查看经历与发现的小算盘');
        const parent = trigger.parentElement;
        await click('查看经历与发现的小算盘');
        const dialog = document.body.querySelector('.fate-calculation')!;
        expect(dialog.textContent).toContain(current.fate!.rationale);
        expect(dialog.textContent).toContain('新接触');
        expect(dialog.querySelector('.fate-patron-art')).toBeTruthy();
        expect(dialog.querySelectorAll('.fate-calculation__factors>div')).toHaveLength(3);
        expect(trigger.parentElement).toBe(parent);
        await act(async () => (dialog.querySelector('[aria-label="关闭命运之神的小算盘"]') as HTMLButtonElement).click());
        expect(document.body.querySelector('.fate-calculation')).toBeNull();
        expect(trigger.parentElement).toBe(parent);
        expect(document.activeElement).toBe(trigger);
    });
    it('点击实际因子牌展开和收起含义', async () => {
        await render();
        expect(host.querySelector('[aria-label="地图的含义"]')).toBeNull();
        await click('主因子：地图，查看含义');
        expect(host.querySelector('[aria-label="地图的含义"]')?.textContent).toContain(current.fate!.factors[0].meaning);
        expect(button('主因子：地图，查看含义').getAttribute('aria-expanded')).toBe('true');
        await click('副因子1：折痕，查看含义');
        expect(host.querySelector('[aria-label="地图的含义"]')).toBeNull();
        expect(host.querySelector('[aria-label="折痕的含义"]')?.textContent).toContain(current.fate!.factors[1].meaning);
        await click('副因子1：折痕，查看含义');
        expect(host.querySelector('.fate-panel__meaning')).toBeNull();
    });
    it('编辑可改时间；钟点未改时保留原时间戳，清除小剧场并保留牌阵', async () => {
        await render(); await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        expect(form().textContent).toContain('结束时间到了才会续写下一段');
        expect(form().querySelectorAll('input[type="time"]')).toHaveLength(2);
        await fill('活动名称', '向灯塔出发'); await fill('活动描述', '离开书摊，沿地图找路。');
        await click('保存活动', form());
        expect(props.onEdit).toHaveBeenCalledWith(1, { ...current, activity: '向灯塔出发', description: '离开书摊，沿地图找路。', theater: undefined });
        expect(host.querySelector('form')).toBeNull();
    });
    it('修改结束时间后写入新 endsAt，过短时长与重叠会拦住保存', async () => {
        const date = '2027-01-15';
        const previousTimes = resolveFateSlotTimes(undefined, date, '08:00', '09:00');
        const currentTimes = resolveFateSlotTimes(undefined, date, '10:00', '12:00');
        expect(previousTimes.ok && currentTimes.ok).toBe(true);
        if (!previousTimes.ok || !currentTimes.ok) return;
        const now = Math.floor((currentTimes.startsAt + currentTimes.endsAt) / 2);
        vi.setSystemTime(now);
        const previousSlot: ScheduleSlot = { ...previous, ...previousTimes, theater: previous.theater };
        const currentSlot: ScheduleSlot = { ...current, ...currentTimes, theater: current.theater };
        await render({ schedule: makeSchedule([previousSlot, currentSlot]) });
        await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await fill('结束时间', '10:20'); await click('保存活动', form());
        expect(props.onEdit).not.toHaveBeenCalled();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('30—180');
        await fill('开始时间', '08:30'); await fill('结束时间', '09:30'); await click('保存活动', form());
        expect(props.onEdit).not.toHaveBeenCalled();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('重叠');
        await fill('开始时间', '11:00'); await fill('结束时间', '11:30'); await click('保存活动', form());
        expect(props.onEdit).toHaveBeenCalled();
        const saved = vi.mocked(props.onEdit!).mock.calls.at(-1)?.[1] as ScheduleSlot;
        expect(saved.startTime).toBe('11:00');
        expect(saved.endTime).toBe('11:30');
        expect(saved.startsAt).not.toBe(currentTimes.startsAt);
        expect(saved.endsAt).not.toBe(currentTimes.endsAt);
        expect((saved.endsAt || 0) - (saved.startsAt || 0)).toBe(1_800_000);
        expect(saved.fate).toEqual(current.fate);
        expect(saved.theater).toBeUndefined();
    });
    it('可以编辑家园房间，并为外出保留具体地点', async () => {
        await render(); await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await fill('家园位置', 'study'); await fill('具体地点', '书房窗边'); await click('保存活动', form());
        expect(props.onEdit).toHaveBeenLastCalledWith(1, expect.objectContaining({ homePosition: { kind: 'home', roomId: 'study' }, location: '书房窗边', startsAt: current.startsAt, endsAt: current.endsAt }));
        await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await fill('家园位置', '__away'); await fill('具体地点', '北岸灯塔入口'); await click('保存活动', form());
        expect(props.onEdit).toHaveBeenLastCalledWith(1, expect.objectContaining({ homePosition: { kind: 'away' }, location: '北岸灯塔入口' }));
    });
    it('新一轮到来后编辑不能误写进新活动，错误可见且保留填写内容', async () => {
        await render(); await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await fill('活动名称', '待保存的修改');
        const next = { ...current, startsAt: NOW - 10_000, endsAt: NOW + 7_200_000, activity: '新轮次' };
        await render({ schedule: makeSchedule([previous, next]) }); await click('保存活动', form());
        expect(props.onEdit).not.toHaveBeenCalled();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('日程轮次或活动内容已经变化');
        expect(fieldValue('活动名称')).toBe('待保存的修改');
    });
    it('生成中保留内容和牌面，禁止重Roll、编辑、删除和所有小剧场按钮', async () => {
        await render(); await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await render({ isGenerating: true });
        expect(fieldValue('活动名称')).toBe(current.activity); expect(host.textContent).toContain('地图');
        expect(host.querySelector('[role="status"]')?.textContent).toBe('生成中，完成后才换牌。');
        expect(host.querySelector('.fate-panel--waiting')).not.toBeNull();
        const controls = Array.from(host.querySelectorAll('button')).filter(item => !item.classList.contains('fate-panel__card') && !item.classList.contains('fate-panel__rationale') && !item.classList.contains('fate-panel__patron'));
        expect(controls.every(item => item.disabled || item.closest('fieldset')?.disabled || item.classList.contains('fate-panel__history-trigger'))).toBe(true);
        await act(async () => controls.forEach(item => item.click()));
        expect(props.onEdit).not.toHaveBeenCalled(); expect(props.onReroll).not.toHaveBeenCalled(); expect(props.onPlayTheater).not.toHaveBeenCalled(); expect(props.onDelete).not.toHaveBeenCalled();
        expect(form().querySelector('fieldset')?.disabled).toBe(true);
    });
    it('失败后只恢复可点击状态，不自行换牌；成功传入新活动后才换牌', async () => {
        await render(); await click('拨拨毛线 · 重 Roll');
        expect(props.onReroll).toHaveBeenCalledOnce();
        await render({ isGenerating: true }); await render({ isGenerating: false });
        expect(host.querySelector('.fate-panel__deck')?.textContent).toContain('地图');
        await click('主因子：地图，查看含义');
        expect(host.querySelector('.fate-panel__meaning')).not.toBeNull();
        const updated = { ...current, fate: { ...current.fate!, factors: [{ id: 'door', name: '门扉', meaning: '新的入口' }, ...current.fate!.factors.slice(1)] } };
        await render({ schedule: makeSchedule([previous, updated]) });
        expect(host.querySelector('.fate-panel__deck')?.textContent).toContain('门扉'); expect(host.querySelector('.fate-panel__deck')?.textContent).not.toContain('地图');
        expect(host.querySelector('.fate-panel__meaning')).toBeNull();
    });
    it('小剧场生成中禁用写入和查看，但不播放抽牌动画、不改变抽牌数据', async () => {
        await render(); await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await render({ isViewing: true });
        expect(host.querySelector('.fate-panel')?.getAttribute('aria-busy')).toBe('true');
        expect(host.querySelector('.fate-panel--waiting')).toBeNull();
        expect(host.querySelector('[role="status"]')?.textContent).toBe('小剧场正在生成。'); expect(host.textContent).not.toContain('猫爪正在牵线');
        expect(fieldValue('活动名称')).toBe(current.activity); expect(host.querySelector('.fate-panel__deck')?.textContent).toContain('地图');
        const controls = Array.from(host.querySelectorAll('button')).filter(item => !item.classList.contains('fate-panel__card') && !item.classList.contains('fate-panel__rationale') && !item.classList.contains('fate-panel__patron'));
        expect(controls.every(item => item.disabled || item.closest('fieldset')?.disabled || item.classList.contains('fate-panel__history-trigger'))).toBe(true);
        await act(async () => controls.forEach(item => item.click()));
        expect(props.onEdit).not.toHaveBeenCalled(); expect(props.onReroll).not.toHaveBeenCalled(); expect(props.onDelete).not.toHaveBeenCalled(); expect(props.onPlayTheater).not.toHaveBeenCalled();
        await render({ isViewing: false }); expect(form().querySelector('fieldset')?.disabled).toBe(false);
    });
    it('超过结束时间时展示最近一轮并明确已结束，定时更新状态', async () => {
        await render();
        await act(async () => { vi.advanceTimersByTime(3_600_001); });
        expect(host.querySelector('[aria-label="本轮活动"]')?.textContent).toContain('已结束 · 待续写');
        expect(host.querySelector('[aria-label="本轮活动"]')?.textContent).toContain(current.activity);
        expect(host.querySelector('.fate-panel__continuation')).toBeNull();
    });
    it('书本入口打开今日历史并翻页，历史小剧场使用真实下标，删除必须确认', async () => {
        await render();
        expect(host.querySelector('.fate-panel__history-page')).toBeNull();
        await click('打开今日历史，共1项');
        const history = document.body.querySelector('.fate-panel__history-page')!;
        expect(history.textContent).toContain('窗边读信');
        expect(button('上一页', history).disabled).toBe(true);
        expect(button('下一页', history).disabled).toBe(true);
        await click('重看小剧场', history); expect(props.onPlayTheater).toHaveBeenCalledWith(0);
        await click('删除活动', history); expect(props.onDelete).not.toHaveBeenCalled();
        expect(host.querySelector('[aria-label="删除活动确认"]')?.textContent).toContain('窗边读信');
        let reject!: (error: Error) => void;
        vi.mocked(props.onDelete!).mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
        await click('确认删除'); expect(props.onDelete).toHaveBeenCalledWith(0);
        expect(button('正在删除…').disabled).toBe(true);
        expect(button('取消删除').disabled).toBe(true);
        expect(host.querySelector('.fate-panel')?.getAttribute('aria-busy')).toBe('true');
        await act(async () => reject(new Error('删除写入失败')));
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('删除失败');
        expect(host.querySelector('[aria-label="删除活动确认"]')?.textContent).toContain('窗边读信');
        expect(button('确认删除').disabled).toBe(false);
        await click('确认删除');
        expect(props.onDelete).toHaveBeenCalledTimes(2);
        expect(host.querySelector('[aria-label="删除活动确认"]')).toBeNull();
    });
    it('右上书本按保存时间翻阅多项历史，查看仍使用原记录下标', async () => {
        const oldest = { ...previous, activity: '最早活动', startsAt: NOW - 20_000_000 };
        await render({ schedule: makeSchedule([oldest, previous, current]) });
        expect(host.querySelector('.fate-panel__toolbar .fate-panel__history-trigger')).toBeTruthy();
        await click('打开今日历史，共2项');
        expect(document.body.querySelector('.fate-panel__history-page h3')?.textContent).toBe(previous.activity);
        await click('下一页', document.body);
        expect(document.body.querySelector('.fate-panel__history-page h3')?.textContent).toBe('最早活动');
        await click('重看小剧场', document.body.querySelector('.fate-panel__history-page')!);
        expect(props.onPlayTheater).toHaveBeenCalledWith(0);
        await click('上一页', document.body);
        expect(document.body.querySelector('.fate-panel__history-page h3')?.textContent).toBe(previous.activity);
    });
    it('没有历史时书本入口明确说明没有更早记录', async () => {
        await render({ schedule: makeSchedule([current]) });
        await click('打开今日历史，共0项');
        expect(document.body.querySelector('.fate-panel__history-overlay')?.textContent).toContain('今天还没有更早的活动记录。');
    });
    it('今日历史同时纳入有小剧场和没有小剧场的已保存活动', async () => {
        const unseen = { ...previous, activity: '没查看过的备考活动', theater: undefined, startsAt: NOW - 20_000_000 };
        await render({ schedule: makeSchedule([unseen, previous, current]) });
        await click('打开今日历史，共2项');
        expect(document.body.querySelector('.fate-panel__history-page h3')?.textContent).toBe(previous.activity);
        await click('下一页', document.body);
        expect(document.body.querySelector('.fate-panel__history-page h3')?.textContent).toBe(unseen.activity);
        await click('进一步查看', document.body.querySelector('.fate-panel__history-page')!);
        expect(props.onPlayTheater).toHaveBeenCalledWith(0);
    });
    it('功能开关只在正文下方操作行，生成中禁止切换', async () => {
        const onToggle = vi.fn();
        await render({ onToggle });
        const toggle = host.querySelector('[aria-label="切换命运日程"]') as HTMLButtonElement;
        expect(toggle.closest('.fate-panel__controls')).toBeTruthy();
        expect(host.querySelector('.fate-panel__toolbar [role="switch"]')).toBeNull();
        await click('切换命运日程'); expect(onToggle).toHaveBeenCalledOnce();
        await render({ isGenerating: true });
        expect(toggle.disabled).toBe(true);
        await click('切换命运日程'); expect(onToggle).toHaveBeenCalledOnce();
    });
    it('空态只发出生成请求，不伪造因子或活动', async () => {
        await render({ schedule: makeSchedule([{ ...current, theater: undefined }]) });
        await click('进一步查看'); expect(props.onPlayTheater).toHaveBeenCalledWith(0);
        await render({ schedule: null }); expect(host.querySelector('.fate-panel__card')).toBeNull();
        expect(host.textContent).toContain('还没有展开的生活片段');
        await click('拨拨毛线 · 生成本轮'); expect(props.onReroll).toHaveBeenCalledOnce();
        await render({ isGenerating: true }); expect(host.querySelector('.fate-panel__card')).toBeNull();
    });
    it('空白活动和保存错误通过alert提示，不丢失编辑内容', async () => {
        await render(); await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await fill('活动名称', ' '); await click('保存活动', form()); expect(host.querySelector('[role="alert"]')?.textContent).toContain('请填写活动名称');
        await fill('活动名称', '海边读图'); vi.mocked(props.onEdit!).mockImplementation(() => { throw new Error('写入失败'); });
        await click('保存活动', form()); expect(host.querySelector('[role="alert"]')?.textContent).toContain('活动保存失败'); expect(form()).not.toBeNull();
    });
    it('保存等待后台完成，失败后保留表单并允许重试', async () => {
        let reject!: (error: Error) => void;
        const saving = new Promise<void>((_resolve, fail) => { reject = fail; });
        await render({ onEdit: vi.fn(() => saving) }); await click('编辑活动', host.querySelector('[aria-label="本轮活动"]')!);
        await fill('活动名称', '尚未保存的灯塔行程'); await click('保存活动', form());
        expect(form().querySelector('fieldset')?.disabled).toBe(true);
        expect(form().textContent).toContain('正在保存');
        await act(async () => reject(new Error('写入失败')));
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('活动保存失败');
        expect(form().querySelector('fieldset')?.disabled).toBe(false);
        expect(fieldValue('活动名称')).toBe('尚未保存的灯塔行程');
    });
    it('轮次变动后删除确认也不会删除新活动', async () => {
        await render(); await click('删除活动', host.querySelector('[aria-label="本轮活动"]')!);
        await render({ schedule: makeSchedule([previous, { ...current, startsAt: NOW - 1_000, activity: '替换后的活动' }]) });
        await click('确认删除'); expect(props.onDelete).not.toHaveBeenCalled();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('活动已经变化');
    });
    it('嵌入外壳时没有重复标题，独立使用仍保留标题', async () => {
        await render({ embedded: true });
        expect(host.querySelector('h1')).toBeNull();
        expect(host.querySelector('.fate-panel--embedded')).not.toBeNull();
        expect(host.querySelector('.fate-panel__header')).toBeNull();
        await render({ embedded: false }); expect(host.querySelector('h1')?.textContent).toBe('命运牌阵');
    });
    it('编辑在本轮活动原位替换正文，没有下方重复表单', async () => {
        await render();
        const article = host.querySelector('[aria-label="本轮活动"]')!;
        await click('编辑活动', article);
        expect(form().closest('article')).toBe(article);
        expect(host.querySelectorAll('form')).toHaveLength(1);
        expect(article.querySelector('.fate-panel__description')).toBeNull();
        expect(article.querySelector('h3')?.textContent).toBe('编辑活动');
        await click('取消编辑', article);
        expect(article.querySelector('h3')?.textContent).toBe(current.activity);
    });
    it('历史编辑留在历史活动原位置，保存使用历史下标', async () => {
        await render();
        await click('打开今日历史，共1项');
        const history = document.body.querySelector('.fate-panel__history-page')!;
        const article = history;
        await click('编辑活动', article);
        expect(form().closest('.fate-panel__history-page')).toBe(article);
        expect(host.querySelectorAll('form')).toHaveLength(0);
        expect(article.querySelector('.fate-panel__description')).toBeNull();
        expect(history.isConnected).toBe(true);
        await fill('活动名称', '把信读完'); await click('保存活动', form());
        expect(props.onEdit).toHaveBeenCalledWith(0, expect.objectContaining({ activity: '把信读完', startsAt: previous.startsAt, endsAt: previous.endsAt, theater: undefined }));
    });
});
