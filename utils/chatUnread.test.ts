// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB, openDB } from './db';
import { CHAT_READ_KEY_PREFIX, initializeChatUnread, markChatReadThrough, readChatUnread, rememberChatNotificationTarget, readChatNotificationTarget, forgetChatNotificationTarget } from './chatUnread';
import { CHAT_MESSAGES_COMMITTED } from './chatMessageEvents';
import { canConfirmChatRead, isChatDisplayed, registerDisplayedChat } from './chatReadSurface';

beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('messages', 'readwrite');
        tx.objectStore('messages').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
});

const save = (charId = 'a', extra: Record<string, unknown> = {}) => DB.saveMessage({
    charId, role: 'assistant', type: 'text', content: '新消息', ...extra,
} as Parameters<typeof DB.saveMessage>[0]);

describe('persistent private-chat unread', () => {
    it('retains the last notification target through reload until that character is viewed', () => {
        rememberChatNotificationTarget('a');
        expect(readChatNotificationTarget()).toBe('a');
        rememberChatNotificationTarget('b');
        forgetChatNotificationTarget('a');
        expect(readChatNotificationTarget()).toBe('b');
        forgetChatNotificationTarget('b');
        expect(readChatNotificationTarget()).toBeNull();
    });
    it('keeps pre-install history read and restores later committed messages without a delivery event', async () => {
        await save();
        await initializeChatUnread(['a']);
        expect((await readChatUnread('a')).count).toBe(0);
        const first = await save('a', { timestamp: 5000 });
        const second = await save('a', { timestamp: 1000, metadata: { awayMessage: true } });
        // Simulate starting a new page after the DB commit, before notification delivery.
        await initializeChatUnread(['a']);
        expect(await readChatUnread('a')).toMatchObject({ count: 2, newest: { id: first } });
        markChatReadThrough('a', first);
        expect(await readChatUnread('a')).toMatchObject({ count: 1, newest: { id: second } });
        await initializeChatUnread(['a']);
        expect((await readChatUnread('a')).count).toBe(1);
        markChatReadThrough('a', second);
        expect((await readChatUnread('a')).count).toBe(0);
    });

    it('does not mark a late arrival read with a stale displayed snapshot or move read positions backwards', async () => {
        await initializeChatUnread(['a', 'b']);
        const displayed = await save();
        const late = await save();
        await save('b');
        markChatReadThrough('a', displayed);
        expect((await readChatUnread('a')).count).toBe(1);
        expect((await readChatUnread('b')).count).toBe(1);
        markChatReadThrough('a', late);
        markChatReadThrough('a', displayed);
        expect(localStorage.getItem(CHAT_READ_KEY_PREFIX + 'a')).toBe(String(late));
        expect((await readChatUnread('a')).count).toBe(0);
    });

    it('counts visible incoming bubbles and request cards, excluding user messages and internal records', async () => {
        await initializeChatUnread(['a']);
        await save('a', { role: 'user' });
        await save('a', { role: 'system', content: '请求失败' });
        await save('a', { metadata: { source: 'call' } });
        await save('a', { metadata: { source: 'date' } });
        await save('a', { metadata: { proactiveHint: true } });
        await save('a', { groupId: 'group' });
        await save('a', { role: 'system', metadata: { source: 'peek-request', peekText: '看看嘛' } });
        await save('a', { role: 'system', metadata: { source: 'friend-request' } });
        await save('a', { type: 'image' });
        expect((await readChatUnread('a')).count).toBe(3);
    });

    it('announces committed inserts once and duplicate delivery IDs never increase unread', async () => {
        await initializeChatUnread(['a']);
        const listener = vi.fn();
        window.addEventListener(CHAT_MESSAGES_COMMITTED, listener);
        try {
            const message = { charId: 'a', role: 'assistant' as const, type: 'text' as const, content: '你好' };
            const id = await DB.saveMessageOnce('delivery-a', message);
            expect(await DB.saveMessageOnce('delivery-a', message)).toBe(id);
            expect(listener).toHaveBeenCalledTimes(1);
            expect((await readChatUnread('a')).count).toBe(1);
            markChatReadThrough('a', id);
            await DB.saveMessageOnce('delivery-a', message);
            expect((await readChatUnread('a')).count).toBe(0);
        } finally { window.removeEventListener(CHAT_MESSAGES_COMMITTED, listener); }
    });

    it('drops deleted unread messages and failed inserts never become unread', async () => {
        await initializeChatUnread(['a']);
        const id = await save();
        expect((await readChatUnread('a')).count).toBe(1);
        await DB.deleteMessage(id);
        expect((await readChatUnread('a')).count).toBe(0);
        await expect(save('a', { metadata: { invalid: () => {} } })).rejects.toBeDefined();
        expect((await readChatUnread('a')).count).toBe(0);
    });

    it('requires a displayed, active, unlocked foreground chat and handles overlapping read surfaces', () => {
        const ready = { visible: true, locked: false, displayed: true, active: true };
        expect(canConfirmChatRead(ready)).toBe(true);
        for (const blocked of [{ visible: false }, { locked: true }, { displayed: false }, { active: false }]) {
            expect(canConfirmChatRead({ ...ready, ...blocked })).toBe(false);
        }
        const first = registerDisplayedChat('a'), second = registerDisplayedChat('a');
        expect(isChatDisplayed('a')).toBe(true);
        first();
        expect(isChatDisplayed('a')).toBe(true);
        second();
        expect(isChatDisplayed('a')).toBe(false);
    });
});
