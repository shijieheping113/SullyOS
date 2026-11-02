import { describe, expect, it, vi } from 'vitest';

// node 环境里没有 Capacitor 的运行时，只测纯函数，插件整个挡掉。
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { toNotificationBody, consumePendingNotificationTap, describeNotifyFailure, takeNotifyFailure } from './chatNotify';

describe('私聊通知正文整理', () => {
    it('没有内容时用兜底文案', () => {
        expect(toNotificationBody('', '阿糯 回复了消息')).toBe('阿糯 回复了消息');
        expect(toNotificationBody(undefined, '兜底')).toBe('兜底');
        expect(toNotificationBody('   \n  ', '兜底')).toBe('兜底');
    });

    it('把换行和多余空白压成一行', () => {
        expect(toNotificationBody('第一行\n\n第二行   第三行', '兜底')).toBe('第一行 第二行 第三行');
    });

    it('短内容原样保留', () => {
        expect(toNotificationBody('在呢，刚洗完澡', '兜底')).toBe('在呢，刚洗完澡');
    });

    it('超长内容截断并加省略号', () => {
        const body = toNotificationBody('啊'.repeat(200), '兜底');
        expect(body.length).toBe(81);
        expect(body.endsWith('…')).toBe(true);
    });

    it('刚好到上限不截断', () => {
        const raw = '啊'.repeat(80);
        expect(toNotificationBody(raw, '兜底')).toBe(raw);
    });
});

describe('冷启动通知点击兜底', () => {
    it('没有攒下点击时返回 null，且取一次就清空', () => {
        expect(consumePendingNotificationTap()).toBeNull();
        expect(consumePendingNotificationTap()).toBeNull();
    });
});

describe('通知失败原因的人话', () => {
    it('每种原因都给得出一句能照着做的提示', () => {
        for (const reason of ['native-denied', 'web-insecure', 'web-unsupported', 'web-denied', 'sw-unavailable', 'native-error', 'web-error'] as const) {
            const text = describeNotifyFailure(reason);
            expect(text.length).toBeGreaterThan(4);
            expect(text).not.toBe('原因不明');
        }
    });

    it('权限被关掉和浏览器没有这个功能，说的不是同一句话', () => {
        expect(describeNotifyFailure('web-denied')).not.toBe(describeNotifyFailure('web-unsupported'));
    });
});

describe('失败记录：读一次就清，过期的不要', () => {
    const KEY = 'sullyos.chatNotify.failure.v1';

    function stubStorage() {
        const map = new Map<string, string>();
        (globalThis as unknown as { localStorage: Storage }).localStorage = {
            getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
            setItem: (k: string, v: string) => { map.set(k, v); },
            removeItem: (k: string) => { map.delete(k); },
            clear: () => map.clear(),
            key: () => null,
            length: 0,
        } as unknown as Storage;
        return map;
    }

    it('没有记录时返回 null', () => {
        stubStorage();
        expect(takeNotifyFailure()).toBeNull();
    });

    it('读一次就清空，不会每次打开都翻旧账', () => {
        const map = stubStorage();
        map.set(KEY, JSON.stringify({ at: Date.now(), reason: 'web-denied', charName: '阿糯' }));
        expect(takeNotifyFailure()).toMatchObject({ reason: 'web-denied', charName: '阿糯' });
        expect(takeNotifyFailure()).toBeNull();
    });

    it('超过一天的旧记录不再弹出来', () => {
        const map = stubStorage();
        map.set(KEY, JSON.stringify({ at: Date.now() - 25 * 60 * 60 * 1000, reason: 'web-denied', charName: '阿糯' }));
        expect(takeNotifyFailure()).toBeNull();
    });

    it('存的是坏数据时不抛错，当没有记录处理', () => {
        const map = stubStorage();
        map.set(KEY, '{不是json');
        expect(takeNotifyFailure()).toBeNull();
    });
});
