import { beforeEach, describe, expect, it, vi } from 'vitest';

// node 环境里没有 Capacitor 的运行时，只测纯函数，插件整个挡掉。
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { toNotificationBody, consumePendingNotificationTap, describeNotifyFailure, takeUnseenAttempt, recordNotifyAttempt, describeAttempt, decideReplyDelivery, traceNotify, readNotifyTrace, describeNotifyTrace, drainStreamSegments, wasStreamNotified, resetStreamNotify } from './chatNotify';

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

describe('回复到达要不要弹', () => {
    it('页面在后台，无论开着哪个页面都发系统通知', () => {
        expect(decideReplyDelivery({ isChattingWithThisChar: true, pageVisible: false })).toBe('notify');
        expect(decideReplyDelivery({ isChattingWithThisChar: false, pageVisible: false })).toBe('notify');
    });

    it('页面在前台又正开着这个聊天，不打扰', () => {
        expect(decideReplyDelivery({ isChattingWithThisChar: true, pageVisible: true })).toBe('silent');
    });

    it('页面在前台但开着别处，用页内提示', () => {
        expect(decideReplyDelivery({ isChattingWithThisChar: false, pageVisible: true })).toBe('toast');
    });

    // 回归：第一版把「界面停在聊天页」当成「人看着聊天页」，从聊天页按 home 大退后
    // 一条通知都不发。这条钉住「后台优先系统通知」。
    it('从聊天页直接大退（停在那页但不可见）也要弹系统通知', () => {
        expect(decideReplyDelivery({ isChattingWithThisChar: true, pageVisible: false })).not.toBe('silent');
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

describe('离开期间的记录：读一次就清，过期的不要', () => {
    const KEY = 'sullyos.chatNotify.attempt.v1';

    // 用 test-setup.ts 提供的内存 localStorage，别自己造一个替换全局——
    // 那样会盖掉同目录其他测试依赖的桩。
    beforeEach(() => { localStorage.clear(); });

    it('没有记录时返回 null', () => {
        expect(takeUnseenAttempt()).toBeNull();
    });

    it('发成功也留记录——否则「没看到弹窗」永远查不下去', () => {
        recordNotifyAttempt({ charName: '阿糯', pageVisible: false, outcome: 'sent' });
        expect(takeUnseenAttempt()).toMatchObject({ charName: '阿糯', outcome: 'sent' });
    });

    it('读一次就清空，不会每次打开都翻旧账', () => {
        recordNotifyAttempt({ charName: '阿糯', pageVisible: false, outcome: 'failed', reason: 'web-denied' });
        expect(takeUnseenAttempt()).toMatchObject({ outcome: 'failed', reason: 'web-denied' });
        expect(takeUnseenAttempt()).toBeNull();
    });

    it('页面可见时产生的记录不复述：用户当时就在屏幕前', () => {
        recordNotifyAttempt({ charName: '阿糯', pageVisible: true, outcome: 'sent' });
        expect(takeUnseenAttempt()).toBeNull();
    });

    it('超过半天的旧记录不再弹出来', () => {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now() - 13 * 60 * 60 * 1000, charName: '阿糯', pageVisible: false, outcome: 'failed', reason: 'web-denied' }));
        expect(takeUnseenAttempt()).toBeNull();
    });

    it('存的是坏数据时不抛错，当没有记录处理', () => {
        localStorage.setItem(KEY, '{不是json');
        expect(takeUnseenAttempt()).toBeNull();
    });
});

describe('链路留痕：三步卡在哪一步', () => {
    beforeEach(() => { localStorage.clear(); });

    it('什么都没记时，三行都说明「没有记录」', () => {
        const lines = describeNotifyTrace();
        expect(lines).toHaveLength(3);
        expect(lines[0]).toContain('没有挂上');
        expect(lines[1]).toContain('没有记录');
        expect(lines[2]).toContain('没有记录');
    });

    it('监听挂上但回复没到，第②步空着', () => {
        traceNotify('wired');
        const lines = describeNotifyTrace();
        expect(lines[0]).toContain('已挂上');
        expect(lines[1]).toContain('没有记录');
    });

    it('回复到了但没发出去，第③步空着', () => {
        traceNotify('wired');
        traceNotify('reply', { lastReplyVisible: false });
        const lines = describeNotifyTrace();
        expect(lines[1]).toContain('已经黑了');
        expect(lines[2]).toContain('没有记录');
    });

    it('三步都走完，失败也把能照做的原因带出来', () => {
        traceNotify('wired');
        traceNotify('reply', { lastReplyVisible: false });
        traceNotify('send', { lastSendOk: false, lastReason: 'web-denied' });
        const lines = describeNotifyTrace();
        expect(lines[2]).toContain('失败');
        expect(lines[2]).toContain(describeNotifyFailure('web-denied'));
    });

    it('留痕读得到、不清空，可以反复看', () => {
        traceNotify('wired');
        expect(readNotifyTrace().wiredAt).toBeTypeOf('number');
        expect(readNotifyTrace().wiredAt).toBeTypeOf('number');
    });
});

describe('把一次尝试说成一句人话', () => {
    const at = new Date('2026-11-02T15:20:00+08:00').getTime();

    // 三种结局必须说得不一样：用户要能分清「发出去了但被系统拦」和「压根没发」。
    it('三种结局三句不同的话', () => {
        const sent = describeAttempt({ at, charName: '阿糯', pageVisible: false, outcome: 'sent' });
        const failed = describeAttempt({ at, charName: '阿糯', pageVisible: false, outcome: 'failed', reason: 'web-denied' });
        const suppressed = describeAttempt({ at, charName: '阿糯', pageVisible: false, outcome: 'suppressed' });
        expect(new Set([sent, failed, suppressed]).size).toBe(3);
    });

    it('带上是谁、几点，用户能对上号', () => {
        const text = describeAttempt({ at, charName: '阿糯', pageVisible: false, outcome: 'sent' });
        expect(text).toContain('阿糯');
        expect(text).toContain('15:20');
    });

    it('失败时把可照做的原因带上，不是只说一句没发出去', () => {
        const text = describeAttempt({ at, charName: '阿糯', pageVisible: false, outcome: 'failed', reason: 'web-denied' });
        expect(text).toContain(describeNotifyFailure('web-denied'));
    });
});

describe('说一段播一条', () => {
    // 每个用例用不同 charId，避免游标串台（游标是模块级、按角色存的）。
    beforeEach(() => {
        resetStreamNotify('c-a');
        resetStreamNotify('c-b');
    });

    it('最后一段还没收尾（后面没有换行）就先不发', () => {
        expect(drainStreamSegments('c-a', ['第一句', '第二句正在'], true)).toEqual(['第一句']);
    });

    it('收了尾就补上，一条不落', () => {
        drainStreamSegments('c-a', ['第一句', '第二句正在'], true);
        expect(drainStreamSegments('c-a', ['第一句', '第二句'], false)).toEqual(['第二句']);
    });

    it('已经播过的段不会重播', () => {
        drainStreamSegments('c-a', ['第一句'], false);
        expect(drainStreamSegments('c-a', ['第一句'], false)).toEqual([]);
        expect(drainStreamSegments('c-a', ['第一句', '第二句'], false)).toEqual(['第二句']);
    });

    it('流被重开、气泡变少时不吞掉后面新长出来的段', () => {
        drainStreamSegments('c-a', ['一', '二', '三'], false);
        // 重试后从头累计，气泡倒退
        expect(drainStreamSegments('c-a', ['一'], false)).toEqual([]);
        // 再长出来的时候必须还能播
        expect(drainStreamSegments('c-a', ['一', '二'], false)).toEqual(['二']);
    });

    it('播过之后才知道这一轮不用再补总结通知', () => {
        expect(wasStreamNotified('c-b')).toBe(false);
        drainStreamSegments('c-b', ['嗯'], false);
        expect(wasStreamNotified('c-b')).toBe(true);
        resetStreamNotify('c-b');
        expect(wasStreamNotified('c-b')).toBe(false);
    });

    it('只有一句、没有换行时不当成「已完成」，等整段结束那条兜底', () => {
        expect(drainStreamSegments('c-b', ['一句还没说完'], true)).toEqual([]);
        expect(wasStreamNotified('c-b')).toBe(false);
    });

    it('没有气泡时什么也不做', () => {
        expect(drainStreamSegments('c-a', [], false)).toEqual([]);
    });
});
