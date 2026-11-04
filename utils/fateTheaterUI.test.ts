// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FateTheaterPlayer, { type FateTheaterPlayerProps } from '../components/schedule/FateTheaterPlayer';
import FateTheaterCard from '../components/schedule/FateTheaterCard';
import type { TheaterLine } from '../types';

let host: HTMLDivElement;
let root: Root;
const lines: TheaterLine[] = [
    { text: '他把茶杯放在窗边。', emotion: '平静' },
    { text: '「雨停以后，出去走走吧。」' },
    { text: '窗外的树叶滴着水。' },
    { text: '他翻开书，在空白处写下完整的一句话。' },
];
let props: FateTheaterPlayerProps;

async function renderPlayer(overrides: Partial<FateTheaterPlayerProps> = {}) {
    props = { ...props, ...overrides };
    await act(async () => root.render(React.createElement(FateTheaterPlayer, props)));
}

function button(label: string) {
    const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent === label);
    expect(result, `找不到按钮：${label}`).toBeTruthy();
    return result!;
}

async function click(label: string) {
    await act(async () => button(label).click());
}

beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    props = {
        character: null,
        slot: { activity: '读书', startTime: '14:20', endTime: '15:10', location: '窗边' },
        lines,
        isGenerating: false,
        onClose: vi.fn(),
        onReplay: vi.fn(),
        onSendCard: vi.fn(),
    };
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('命运小剧场播放器', () => {
    it('展示真实日程资料，逐字播放，点击正文补全，计时推进到结尾', async () => {
        await renderPlayer();
        expect(host.textContent).toContain('14:20 — 15:10');
        expect(host.textContent).toContain('窗边');
        expect(host.textContent).not.toContain('14:20:00');
        expect(host.textContent).not.toContain('LIVE');
        await act(async () => vi.advanceTimersByTime(38));
        expect(host.querySelector('.fate-theater-line')?.textContent).toBe('平静他');
        await act(async () => (host.querySelector('[aria-label="剧场正文"]') as HTMLElement).click());
        expect(host.textContent).toContain(lines[0].text);
        await act(async () => vi.advanceTimersByTime(15000));
        expect(host.textContent).toContain(lines[3].text);
        expect(host.textContent).toContain('这一刻，读完了。');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('可补全当前行和直接跳到结尾，保留两种发送含义与重演', async () => {
        await renderPlayer();
        await click('补全当前行');
        expect(host.textContent).toContain(lines[0].text);
        await click('跳到结尾');
        expect(host.textContent).toContain(lines[3].text);
        await click('TA 不知道你看了');
        expect(props.onSendCard).toHaveBeenLastCalledWith(false);
        await click('让 TA 发现你在看');
        expect(props.onSendCard).toHaveBeenLastCalledWith(true);
        await click('换一段重演');
        expect(props.onReplay).toHaveBeenCalledOnce();
        expect(host.textContent).not.toContain(lines[3].text);
        await renderPlayer({ lines: [{ text: '重新写下的内容' }] });
        await act(async () => vi.advanceTimersByTime(2000));
        expect(host.textContent).toContain('重新写下的内容');
    });

    it.each([
        { lines: [], isGenerating: false },
        { lines: null, isGenerating: false },
    ])('空数组与失败无内容都可关闭、重试：%j', async state => {
        await renderPlayer(state);
        await click('重新尝试');
        expect(props.onReplay).toHaveBeenCalledOnce();
        await click('关闭');
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(host.textContent).not.toContain('让 TA 发现你在看');
    });

    it('生成期间重演按钮不可点击，但仍可关闭', async () => {
        await renderPlayer({ lines: null, isGenerating: true });
        expect(button('正在生成……').disabled).toBe(true);
        await click('正在生成……');
        expect(props.onReplay).not.toHaveBeenCalled();
        await click('关闭');
        expect(props.onClose).toHaveBeenCalledOnce();
        await renderPlayer({ isGenerating: false });
        expect(button('重新尝试').disabled).toBe(false);
        await click('重新尝试');
        expect(props.onReplay).toHaveBeenCalledOnce();
    });

    it('保存期间锁住两种发送，失败提示后可以再试', async () => {
        let reject!: (error: Error) => void;
        const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; })).mockResolvedValue(undefined);
        await renderPlayer({ onSendCard: save });
        await click('跳到结尾');
        await act(async () => {
            button('TA 不知道你看了').click();
            button('让 TA 发现你在看').click();
            button('TA 不知道你看了').click();
        });
        expect(save).toHaveBeenCalledTimes(1);
        expect(button('让 TA 发现你在看').disabled).toBe(true);
        expect(host.textContent).toContain('正在保存到聊天');
        await act(async () => reject(new Error('disk full')));
        expect(host.textContent).toContain('保存失败，请再试一次。');
        await click('让 TA 发现你在看');
        expect(save).toHaveBeenLastCalledWith(true);
        expect(host.textContent).toContain('已保存到聊天');
    });

    it('减少动画时直接显示完整内容；关闭支持 Escape，焦点返回打开位置', async () => {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();
        await renderPlayer();
        expect(host.textContent).toContain(lines[3].text);
        await act(async () => vi.advanceTimersByTime(0));
        expect(vi.getTimerCount()).toBe(0);
        expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭小剧场');
        await act(async () => host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        expect(props.onClose).toHaveBeenCalledOnce();
        await act(async () => root.render(null));
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it('生成中不播放旧内容，卸载清除播放计时', async () => {
        await renderPlayer();
        await act(async () => vi.advanceTimersByTime(100));
        await renderPlayer({ isGenerating: true });
        expect(host.textContent).not.toContain(lines[0].text);
        expect(vi.getTimerCount()).toBe(0);
        await renderPlayer({ isGenerating: false, lines: [{ text: '新内容' }] });
        await act(async () => root.render(null));
        await act(async () => vi.advanceTimersByTime(0));
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('命运小剧场私聊卡片', () => {
    it('从保存的资料展示前几行，展开读取完整正文和因子含义，不修改原文', async () => {
        const metadata = {
            scheduleMode: 'fate',
            activity: '读书', slotTime: '14:20', endTime: '15:10', location: '窗边', lines,
            exposed: false,
            factors: [{ id: 'rain', name: '雨后', meaning: '让计划留一点呼吸的余地。' }],
            tendencyName: '停下来看看',
        };
        const original = JSON.stringify(metadata);
        await act(async () => root.render(React.createElement(FateTheaterCard, metadata)));
        expect(host.textContent).toContain('TA 不知情');
        expect(host.textContent).toContain('14:20 — 15:10');
        expect(host.textContent).not.toContain(lines[3].text);
        expect(button('展开全部').getAttribute('aria-expanded')).toBe('false');
        await click('展开全部');
        for (const line of lines) expect(host.textContent).toContain(line.text);
        expect(host.textContent).toContain(metadata.factors[0].meaning);
        expect(host.textContent).toContain(metadata.tendencyName);
        expect(host.querySelector('.fate-theater-dialogue')?.textContent).toBe(lines[1].text);
        await click('收起内容');
        expect(host.textContent).not.toContain(lines[3].text);
        expect(JSON.stringify(metadata)).toBe(original);
    });

    it('已察觉与无数据状态明确，不补造时间地点', async () => {
        await act(async () => root.render(React.createElement(FateTheaterCard, { activity: '', lines: [], exposed: true })));
        expect(host.textContent).toContain('TA 已察觉你在看');
        expect(host.textContent).toContain('活动未记录');
        expect(host.textContent).toContain('没有可阅读的剧场内容');
        expect(host.textContent).not.toContain('00:00');
        expect(host.querySelector('.fate-theater-context')).toBeNull();
    });
});
