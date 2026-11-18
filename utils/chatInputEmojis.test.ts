// @vitest-environment jsdom
/**
 * 表情面板：格子身份、翻页、换组后的复用。
 *
 * 图片令牌（blobref）在 jsdom 里读库会挂起，且产品已改为会话级 objectURL 缓存
 * （同会话不中途 revoke）。这几条断言改为看「看得见的格子 / 节点是否复用」，
 * 不再数 createObjectURL / revoke 次数。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ChatInputArea from '../components/chat/ChatInputArea';
import type { Emoji } from '../types';
import { DB } from './db';
import { EMOJI_THUMBNAIL_CACHE_LIMIT } from './useEmojiThumbnailCache';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let container: HTMLDivElement;
let root: Root;
const onPanelAction = vi.fn();
const categories = [{ id: 'a', name: '分组 A' }, { id: 'b', name: '分组 B' }];

function Panel({ emojis, showPanel = 'emojis', compactHome = false, compactHomeEmojiPicker = false }: {
    emojis: Emoji[];
    showPanel?: 'emojis' | 'none' | 'actions';
    compactHome?: boolean;
    compactHomeEmojiPicker?: boolean;
}) {
    const [activeCategory, setActiveCategory] = useState('a');
    return createElement(ChatInputArea, {
        input: '', setInput: () => {}, isTyping: false, selectionMode: false, compactHome, compactHomeEmojiPicker,
        showPanel, setShowPanel: () => {}, onSend: () => {},
        onDeleteSelected: () => {}, selectedCount: 0,
        emojis: emojis.filter(e => e.categoryId === activeCategory), suggestionEmojis: emojis, categories, activeCategory,
        onPanelAction: (action, payload) => {
            if (action === 'select-category') setActiveCategory(payload);
            onPanelAction(action, payload);
        },
        onImageSelect: () => {}, isSummarizing: false, onReroll: () => {}, canReroll: false,
    });
}
function CompactPhoneEmojiPanel({ allowEmojiPicker }: { allowEmojiPicker: boolean }) {
    const [showPanel, setShowPanel] = useState<'none' | 'actions' | 'emojis' | 'chars'>('none');
    return createElement(ChatInputArea, {
        input: '', setInput: () => {}, isTyping: false, selectionMode: false,
        compactHome: true, compactHomeEmojiPicker: allowEmojiPicker,
        showPanel, setShowPanel, onSend: () => {}, onDeleteSelected: () => {}, selectedCount: 0,
        emojis: [], categories, onPanelAction, onImageSelect: () => {},
        isSummarizing: false, onReroll: () => {}, canReroll: false,
    });
}
function thumbnails() {
    return Array.from(container.querySelectorAll<HTMLImageElement>('img.sully-emoji-thumb')).filter(img => !img.closest('button')!.hidden);
}
function names() {
    return thumbnails().map(img => img.closest('button')!.querySelector('span')!.textContent);
}
function clickGroup(name: string) {
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === name)!;
    act(() => button.click());
}
function clickLabel(label: string) {
    act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
}
async function render(emojis: Emoji[]) {
    await act(async () => { root.render(createElement(Panel, { emojis })); });
}

beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('表情面板的记录身份与图片复用', () => {
    it('家园小手机仍隐藏表情按钮，直播小手机可单独打开表情面板', async () => {
        await act(async () => { root.render(createElement(CompactPhoneEmojiPanel, { allowEmojiPicker: false })); });
        const button = () => container.querySelector<HTMLButtonElement>('button[aria-label="打开表情包"]')!;
        expect(button().hidden).toBe(true);

        await act(async () => { root.render(createElement(CompactPhoneEmojiPanel, { allowEmojiPicker: true })); });
        expect(button().hidden).toBe(false);
        await act(async () => { button().click(); });
        expect(container.querySelector<HTMLElement>('[data-testid="emoji-panel"]')?.style.display).toBe('flex');
    });

    it('首次打开才挂载格子，关闭再打开或切加号不重建图片节点', async () => {
        const emojis = [{ name: '缓存', url: 'https://example.com/cache.png', categoryId: 'a' }];
        const show = async (showPanel: 'none' | 'emojis' | 'actions') => {
            await act(async () => { root.render(createElement(Panel, { emojis, showPanel })); });
        };
        await show('none');
        expect(thumbnails()).toHaveLength(0);
        // 未打开过表情面板时，格子尚未挂载（懒挂载）
        expect(container.querySelectorAll('img.sully-emoji-thumb')).toHaveLength(0);

        await show('emojis');
        expect(thumbnails()).toHaveLength(1);
        const first = thumbnails()[0];
        const src = first.src;
        for (const state of ['none', 'actions', 'emojis', 'none', 'emojis'] as const) {
            await show(state);
            expect(thumbnails()[0]).toBe(first);
            expect(first.src).toBe(src);
            expect(container.querySelector<HTMLElement>('[data-testid="emoji-panel"]')!.style.display).toBe(state === 'emojis' ? 'flex' : 'none');
        }
    });

    it('共用图片地址的表情反复切分组、重新读取后，都不残留或复制旧格子', async () => {
        const shared = 'https://example.com/shared.png';
        const emojis: Emoji[] = [
            { name: '我吗', url: shared, categoryId: 'a' },
            { name: '疑问', url: shared, categoryId: 'a' },
            { name: '开心', url: 'https://example.com/happy.png', categoryId: 'a' },
            { name: '你好', url: 'https://example.com/hello.png', categoryId: 'b' },
            { name: '问号', url: shared, categoryId: 'b' },
        ];
        for (const e of emojis) await DB.saveEmoji(e.name, e.url, e.categoryId);
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            for (let reopen = 0; reopen < 2; reopen++) {
                // 只用本测写入的五条，避免本机库里其它表情串味
                await render(emojis);
                for (let i = 0; i < 5; i++) {
                    expect(names().sort()).toEqual(['我吗', '疑问', '开心'].sort());
                    clickGroup('分组 B');
                    expect(names().sort()).toEqual(['你好', '问号'].sort());
                    clickGroup('分组 A');
                }
                await act(async () => { root.render(null); });
            }
            expect(errors.mock.calls.filter(args => args.join(' ').includes('same key'))).toEqual([]);
            expect(await DB.getEmojis()).toEqual(expect.arrayContaining(emojis));
        } finally {
            errors.mockRestore();
        }
    });

    it('大量共用 URL 的表情仍每页最多显示 40 张，缓存有上限，翻页和换组数量准确', async () => {
        const emojis: Emoji[] = ['a', 'b'].flatMap(categoryId => Array.from({ length: 85 }, (_, i) => ({
            name: `${categoryId}-${i}`, categoryId, url: `https://example.com/shared-${i % 3}.png`,
        })));
        await render(emojis);
        const expectPage = (category: string, start: number, end: number) => {
            expect(names()).toEqual(emojis.filter(e => e.categoryId === category).slice(start, end).map(e => e.name));
            expect(thumbnails().length).toBeLessThanOrEqual(40);
            expect(container.querySelectorAll('img.sully-emoji-thumb').length).toBeLessThanOrEqual(EMOJI_THUMBNAIL_CACHE_LIMIT);
            for (const img of thumbnails()) {
                expect(img.getAttribute('loading')).toBe('lazy');
                expect(img.getAttribute('decoding')).toBe('async');
            }
        };
        expectPage('a', 0, 40);
        clickLabel('下一页表情');
        expectPage('a', 40, 80);
        clickLabel('下一页表情');
        expectPage('a', 80, 85);
        clickGroup('分组 B');
        expectPage('b', 0, 40);
        clickLabel('下一页表情');
        expectPage('b', 40, 80);
        clickLabel('上一页表情');
        expectPage('b', 0, 40);
        clickGroup('分组 A');
        expectPage('a', 0, 40);
    });

    it('切换分组和翻页后复用原 img，隐藏格保留在缓存上限内', async () => {
        const shared = 'https://example.com/page-shared.png';
        const emojis: Emoji[] = ['a', 'b'].flatMap(categoryId => Array.from({ length: 81 }, (_, i) => ({
            name: `${categoryId}-${i}`, categoryId, url: shared,
        })));
        await render(emojis);
        expect(thumbnails()).toHaveLength(40);
        const first = thumbnails()[0];
        const src = first.src;

        clickGroup('分组 B');
        expect(thumbnails()).toHaveLength(40);
        // 换组后 A 的格子仍可能留在缓存里（hidden），总数不超过上限
        expect(container.querySelectorAll('img.sully-emoji-thumb').length).toBeLessThanOrEqual(EMOJI_THUMBNAIL_CACHE_LIMIT);

        clickGroup('分组 A');
        expect(thumbnails()[0]).toBe(first);
        expect(first.src).toBe(src);

        clickLabel('下一页表情');
        expect(names()[0]).toBe('a-40');
        clickLabel('上一页表情');
        expect(thumbnails()[0]).toBe(first);
        expect(first.src).toBe(src);
    });

    it('隐藏分组里删除或换图后，返回时不会显示已删或过期的表情', async () => {
        const emojis: Emoji[] = [
            { name: '删除我', categoryId: 'a', url: 'https://example.com/a1.png' },
            { name: '替换我', categoryId: 'a', url: 'https://example.com/a2.png' },
            { name: 'B', categoryId: 'b', url: PNG },
        ];
        await render(emojis);
        expect(names()).toEqual(['删除我', '替换我']);
        const old = thumbnails()[1];
        clickGroup('分组 B');
        await render([{ ...emojis[1], url: PNG }, emojis[2]]);
        clickGroup('分组 A');
        expect(names()).toEqual(['替换我']);
        expect(thumbnails()[0]).not.toBe(old);
        expect(thumbnails()[0].src).toBe(PNG);
    });

    it('同一表情未换图时复用节点，换图时重建图片节点以免保留旧位图', async () => {
        const original: Emoji = { name: '你好', categoryId: 'a', url: 'https://example.com/old.png' };
        await render([original]);
        const oldImage = thumbnails()[0];
        await render([{ ...original }]);
        expect(thumbnails()[0]).toBe(oldImage);
        await render([{ ...original, url: 'https://example.com/new.png' }]);
        expect(thumbnails()[0]).not.toBe(oldImage);
        expect(thumbnails()[0].getAttribute('src')).toBe('https://example.com/new.png');
    });

    it('同图不同名的表情可分别选择，删除只提交实际选中的记录', async () => {
        const emojis: Emoji[] = ['我吗', '疑问'].map(name => ({
            name, categoryId: 'a', url: 'https://example.com/shared.png',
        }));
        await render(emojis);
        clickLabel('批量管理表情');
        const buttons = thumbnails().map(img => img.closest('button')!);
        act(() => buttons[0].click());
        expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
        act(() => buttons[1].click());
        expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
        act(() => buttons[0].click());
        expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
        clickLabel('删除选中的表情');
        expect(onPanelAction).toHaveBeenLastCalledWith('delete-emoji-req', [emojis[1]]);
    });
});
