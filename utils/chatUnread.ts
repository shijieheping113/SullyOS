import type { Message } from '../types';
import { openDB } from './db';
import { isChatPreviewMessage } from './chatMessageVisibility';
import { CHAT_READ_CHANGED } from './chatMessageEvents';
import { SESSION_SPACE_ID } from './userSpaces';
import { compareChatMessages } from './chatMessageOrder';

export const CHAT_READ_KEY_PREFIX = 'sully_chat_read_v1:';
const NOTIFICATION_TARGET_KEY = 'sully_chat_notification_target_v1:' + SESSION_SPACE_ID;

export function rememberChatNotificationTarget(charId: string): void {
    try { sessionStorage.setItem(NOTIFICATION_TARGET_KEY, charId); } catch { /* The live route still works when session storage is unavailable. */ }
}

export function readChatNotificationTarget(): string | null {
    try { return sessionStorage.getItem(NOTIFICATION_TARGET_KEY); } catch { return null; }
}

export function forgetChatNotificationTarget(charId: string): void {
    try {
        if (sessionStorage.getItem(NOTIFICATION_TARGET_KEY) === charId) sessionStorage.removeItem(NOTIFICATION_TARGET_KEY);
    } catch { /* Optional navigation recovery must not block reading. */ }
}

export function isUnreadChatMessage(message: Message): boolean {
    return !message.groupId && ((message.role === 'assistant' && isChatPreviewMessage(message))
        || (message.role === 'system' && (message.metadata?.source === 'peek-request'
            || message.metadata?.source === 'friend-request')));
}

function readPosition(charId: string): number | null {
    const raw = localStorage.getItem(CHAT_READ_KEY_PREFIX + charId);
    if (raw === null) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id >= 0 ? id : null;
}

export function markChatReadThrough(charId: string, messageId: number): void {
    if (!Number.isSafeInteger(messageId) || messageId < 0) return;
    const current = readPosition(charId);
    if (current !== null && current >= messageId) return;
    // The installed storage facade pins this key to the page's user space.
    localStorage.setItem(CHAT_READ_KEY_PREFIX + charId, String(messageId));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHAT_READ_CHANGED, { detail: { charId } }));
}

/** New installations establish a baseline before schedulers start. Existing history stays read. */
export async function initializeChatUnread(charIds: string[]): Promise<void> {
    const db = await openDB();
    await Promise.all(charIds.map(charId => {
        if (readPosition(charId) !== null) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction('messages', 'readonly');
            const request = tx.objectStore('messages').index('charId').openKeyCursor(IDBKeyRange.only(charId), 'prev');
            let last = 0;
            request.onsuccess = () => { last = Number(request.result?.primaryKey || 0); };
            tx.oncomplete = () => {
                try {
                    if (readPosition(charId) === null) markChatReadThrough(charId, last);
                    resolve();
                } catch (error) { reject(error); }
            };
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('未读状态初始化失败'));
        });
    }));
}

export async function readChatUnread(charId: string, previewLimit = 0): Promise<{ count: number; newest: Message | null; previews: Message[] }> {
    const position = readPosition(charId) ?? 0;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readonly');
        const request = tx.objectStore('messages').index('charId').openCursor(IDBKeyRange.only(charId), 'prev');
        let count = 0;
        let newest: Message | null = null;
        const previews: Message[] = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || Number(cursor.primaryKey) <= position) return;
            const message = cursor.value as Message;
            if (isUnreadChatMessage(message)) {
                count += 1;
                if (!newest || message.timestamp > newest.timestamp
                    || (message.timestamp === newest.timestamp && message.id > newest.id)) newest = message;
                if (previewLimit > 0) {
                    previews.push(message);
                    previews.sort(compareChatMessages);
                    if (previews.length > previewLimit) previews.shift();
                }
            }
            cursor.continue();
        };
        tx.oncomplete = () => resolve({ count, newest, previews });
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('未读消息读取失败'));
    });
}
