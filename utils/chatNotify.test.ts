import { describe, expect, it, vi } from 'vitest';

// node 环境里没有 Capacitor 的运行时，只测纯函数，插件整个挡掉。
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { toNotificationBody, consumePendingNotificationTap } from './chatNotify';

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
