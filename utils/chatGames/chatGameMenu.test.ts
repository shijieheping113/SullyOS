// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatGameMenu from '../../components/chat/ChatGameMenu';
import {
    CHAT_GAMES_STORAGE_KEY,
    readChatGameSettings,
    writeChatGameEnabled,
    writeChatGameMaster,
} from './settings';

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onPlay = vi.fn();

async function render(open = true) {
    await act(async () => {
        root.render(React.createElement(ChatGameMenu, { open, onClose, onPlay }));
    });
}

function button(label: string) {
    const node = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(node, `Missing button: ${label}`).not.toBeNull();
    return node!;
}

async function click(label: string) {
    await act(async () => { button(label).click(); });
}

function roll() {
    return document.querySelector<HTMLButtonElement>('.cgm-main-action')!;
}

beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    onClose.mockClear();
    onPlay.mockClear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    localStorage.clear();
});

describe('柔粉浅紫游戏盒', () => {
    it('只在打开时显示，默认选骰子；打开不发送也不改设置', async () => {
        await render(false);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        await render();
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('游戏盒');
        expect(button('选择掷骰子').getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelector('.cgm-root .sully-game-card')).toBeNull();
        expect(onPlay).not.toHaveBeenCalled();
        expect(localStorage.getItem(CHAT_GAMES_STORAGE_KEY)).toBeNull();
    });

    it('同页换卡，显示三个出拳按钮和角色自己出拳；没有二级返回页', async () => {
        await render();
        await click('选择猜拳');
        expect(button('选择猜拳').getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelectorAll('.cgm-hand')).toHaveLength(3);
        expect(button('角色自己出拳').disabled).toBe(false);
        expect(document.body.textContent).not.toContain('回到卡册');
        expect(onPlay).not.toHaveBeenCalled();
        await click('选择掷骰子');
        expect(document.querySelectorAll('.cgm-hand')).toHaveLength(0);
        expect(roll().disabled).toBe(false);
    });

    it('骰子只调用原有发送入口，不预先生成消息或角色回复', async () => {
        await render();
        await act(async () => { roll().click(); });
        expect(onPlay.mock.calls).toEqual([['dice', undefined]]);
        expect(onClose).not.toHaveBeenCalled();
    });

    it.each(['rock', 'scissors', 'paper'] as const)('选择 %s 直接发送原有手势，不增加确认步骤', async (hand) => {
        const labels = { rock: '石头', scissors: '剪刀', paper: '布' };
        await render();
        await click('选择猜拳');
        await click(`出${labels[hand]}`);
        expect(onPlay.mock.calls).toEqual([['rps', hand]]);
    });

    it('总开关关掉禁用所有游戏，但仍可换卡和恢复总开关', async () => {
        await render();
        await click('小游戏总开关');
        expect(readChatGameSettings().master).toBe(false);
        expect(roll().disabled).toBe(true);
        await act(async () => { roll().click(); });
        await click('选择猜拳');
        expect(button('出石头').disabled).toBe(true);
        expect(button('角色自己出拳').disabled).toBe(true);
        await click('出石头');
        expect(onPlay).not.toHaveBeenCalled();
        expect(document.querySelector('[role="status"]')?.textContent).toContain('总开关关着');
        await act(async () => { document.querySelector<HTMLButtonElement>('.cgm-status button')!.click(); });
        expect(button('出石头').disabled).toBe(false);
        expect(readChatGameSettings().master).toBe(true);
    });

    it('单款开关只停用当前游戏，保留卡带并支持就地启用', async () => {
        await render();
        await click('启用掷骰子');
        expect(readChatGameSettings().games.dice).toBe(false);
        expect(roll().disabled).toBe(true);
        expect(button('选择掷骰子').disabled).toBe(false);
        await click('选择猜拳');
        expect(button('出石头').disabled).toBe(false);
        await click('选择掷骰子');
        await act(async () => { document.querySelector<HTMLButtonElement>('.cgm-status button')!.click(); });
        expect(readChatGameSettings().games.dice).toBe(true);
        expect(roll().disabled).toBe(false);
    });

    it('角色自己出拳默认关闭，独立保存且停用猜拳时不丢选择', async () => {
        await render();
        await click('选择猜拳');
        expect(button('角色自己出拳').getAttribute('aria-checked')).toBe('false');
        await click('角色自己出拳');
        expect(readChatGameSettings().rpsFreeChoice).toBe(true);
        await click('启用猜拳');
        expect(button('角色自己出拳').disabled).toBe(true);
        expect(button('角色自己出拳').getAttribute('aria-checked')).toBe('true');
        await render(false);
        await render();
        expect(button('角色自己出拳').getAttribute('aria-checked')).toBe('true');
        await click('启用猜拳');
        expect(button('角色自己出拳').disabled).toBe(false);
        await click('角色自己出拳');
        expect(readChatGameSettings().rpsFreeChoice).toBe(false);
    });

    it('读取已存开关，并跟随其他入口的开关更新', async () => {
        writeChatGameMaster(false);
        writeChatGameEnabled('rps', false);
        await render();
        expect(button('小游戏总开关').getAttribute('aria-checked')).toBe('false');
        await act(async () => { writeChatGameMaster(true); });
        expect(roll().disabled).toBe(false);
        await click('选择猜拳');
        expect(button('启用猜拳').getAttribute('aria-checked')).toBe('false');
        await act(async () => { writeChatGameEnabled('rps', true); });
        expect(button('出石头').disabled).toBe(false);
    });

    it('规则沿用游戏原文，换卡折叠规则', async () => {
        await render();
        const rules = document.querySelector<HTMLDetailsElement>('.cgm-rule')!;
        rules.open = true;
        expect(rules.textContent).toContain('点数怎么用，角色自己决定');
        await click('选择猜拳');
        expect(document.querySelector<HTMLDetailsElement>('.cgm-rule')!.open).toBe(false);
        expect(document.querySelector('.cgm-rule')?.textContent).toContain('谁赢系统不判');
    });

    it('关闭按钮、遮罩和 Escape 只关闭游戏盒，不发送', async () => {
        await render();
        await click('关闭游戏盒');
        expect(onClose).toHaveBeenCalledTimes(1);
        await act(async () => { document.querySelector<HTMLElement>('.cgm-root')!.click(); });
        expect(onClose).toHaveBeenCalledTimes(1);
        await act(async () => { document.querySelector<HTMLElement>('.cgm-overlay')!.click(); });
        expect(onClose).toHaveBeenCalledTimes(2);
        await act(async () => {
            document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(onClose).toHaveBeenCalledTimes(3);
        expect(onPlay).not.toHaveBeenCalled();
    });

    it('键盘焦点保持在窗口中，关闭后回到打开游戏盒的按钮', async () => {
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();
        await render();
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(document.activeElement).toBe(dialog);
        const tab = (shiftKey = false) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
        await act(async () => { tab(); });
        expect(document.activeElement).toBe(button('小游戏总开关'));
        await act(async () => { tab(true); });
        expect(document.activeElement).toBe(document.querySelector('summary'));
        await act(async () => { tab(); });
        expect(document.activeElement).toBe(button('小游戏总开关'));
        await render(false);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });
});
