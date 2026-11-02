import { beforeEach, describe, expect, it, vi } from 'vitest';

// node 环境里没有 Capacitor 的运行时，只测纯函数，插件整个挡掉。
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { toNotificationBody, previewTextOf, consumePendingNotificationTap, describeNotifyFailure, takeUnseenAttempt, recordNotifyAttempt, describeAttempt, decideReplyDelivery, traceNotify, readNotifyTrace, describeNotifyTrace, drainStreamSegments, resetStreamNotify, getStreamSpokenCount, describeStreamScan, noteStreamScan, noteStreamRequest, notifyRoundSegment, notifyPersistedBubble, wasRoundNotified } from './chatNotify';

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

    it('播过的条数记在游标上，整段结束时据此只补没播的', () => {
        expect(getStreamSpokenCount('c-b')).toBe(0);
        drainStreamSegments('c-b', ['嗯'], false);
        expect(getStreamSpokenCount('c-b')).toBe(1);
        resetStreamNotify('c-b');
        expect(getStreamSpokenCount('c-b')).toBe(0);
    });

    it('只有一句、没有换行时不当成「已完成」，等整段结束那条兜底', () => {
        expect(drainStreamSegments('c-b', ['一句还没说完'], true)).toEqual([]);
        expect(getStreamSpokenCount('c-b')).toBe(0);
    });

    it('没有气泡时什么也不做', () => {
        expect(drainStreamSegments('c-a', [], false)).toEqual([]);
    });
});

describe('只弹一条的病根：播了几条 + 为什么没播', () => {
    beforeEach(() => {
        resetStreamNotify('c-s');
    });

    it('没收到任何增量时，说清是流式没开、或者页面被冻住后一次到齐', () => {
        expect(describeStreamScan('c-s')).toContain('没收到任何流式增量');
    });

    it('播过就报「几次增量、切出几段、已播几条」', () => {
        // 两个计数器：drainStreamSegments 维护「真实播出的游标」，
        // noteStreamScan 维护「体检里的累计条数」——两条都要对得上。
        expect(drainStreamSegments('c-s', ['一', '二'], false)).toEqual(['一', '二']);
        noteStreamScan('c-s', { bubbles: 2, spokenNow: 2, hasUnfinishedTail: false, pageVisible: false });
        expect(getStreamSpokenCount('c-s')).toBe(2);
        expect(describeStreamScan('c-s')).toContain('切出 2 段');
        expect(describeStreamScan('c-s')).toContain('已播 2 条');
    });

    it('页面亮着所以一条没播，要说清楚这是设计如此，不是坏了', () => {
        noteStreamScan('c-s', { bubbles: 2, spokenNow: 0, hasUnfinishedTail: false, pageVisible: true });
        expect(describeStreamScan('c-s')).toContain('页面是亮的');
    });

    it('离开屏幕却一条没播、且最后一段一直没换行 —— 直接点名这个原因', () => {
        noteStreamScan('c-s', { bubbles: 1, spokenNow: 0, hasUnfinishedTail: true, pageVisible: false });
        const text = describeStreamScan('c-s');
        expect(text).toContain('只切出 1 段');
        expect(text).toContain('没换行');
    });

    it('游标数决定「还差哪几段没播」，播过的不会重播', () => {
        drainStreamSegments('c-s', ['一', '二'], false);
        expect(getStreamSpokenCount('c-s')).toBe(2);
        expect(drainStreamSegments('c-s', ['一', '二'], false)).toEqual([]);
    });

    // 回归：曾经用「这一轮离开过屏幕」这面旗子做判据，中断的一轮不会走到 reset，
    // 旗子留着，下一轮就在用户正盯着聊天的时候弹系统通知。现在只认「此刻可见与否」，
    // 每轮结束 reset 之前读到的条数也必须是干净的一轮的量。
    it('一轮结束 reset 之后，下一轮从零开始数（不继承上一轮的条数）', () => {
        drainStreamSegments('c-s', ['一', '二'], false);
        expect(getStreamSpokenCount('c-s')).toBe(2);
        resetStreamNotify('c-s');
        expect(getStreamSpokenCount('c-s')).toBe(0);
        expect(drainStreamSegments('c-s', ['一'], false)).toEqual(['一']);
    });
});

describe('一轮里同一句只弹一次（流式那条和落库那条不许打架）', () => {
    beforeEach(() => {
        resetStreamNotify('c-r');
    });

    it('认领过的正文不会再发，末尾兜底据此只补没发过的', () => {
        expect(wasRoundNotified('c-r', '在呢')).toBe(false);
        expect(notifyRoundSegment({ charId: 'c-r', charName: '阿糯', body: '在呢' })).not.toBeNull();
        expect(wasRoundNotified('c-r', '在呢')).toBe(true);
        // 空白差异不算另一句：预览气泡和落库气泡的空白处理不完全一致。
        expect(notifyRoundSegment({ charId: 'c-r', charName: '阿糯', body: ' 在呢 ' })).toBeNull();
        expect(notifyRoundSegment({ charId: 'c-r', charName: '阿糯', body: '刚到楼下' })).not.toBeNull();
    });

    it('发失败要把认领退回去，不然这一句就永远丢了', async () => {
        // node 里没有浏览器通知通道，这次发送必然失败 —— 正好用来验退回逻辑。
        const pending = notifyRoundSegment({ charId: 'c-r', charName: '阿糯', body: '电梯里信号差' });
        expect(pending).not.toBeNull();
        expect(wasRoundNotified('c-r', '电梯里信号差')).toBe(true);
        const result = await pending!;
        expect(result.ok).toBe(false);
        expect(wasRoundNotified('c-r', '电梯里信号差')).toBe(false);
    });

    it('换一轮就重新算 —— 上一轮说过的话这一轮还能弹', () => {
        notifyRoundSegment({ charId: 'c-r', charName: '阿糯', body: '晚安' });
        resetStreamNotify('c-r');
        expect(wasRoundNotified('c-r', '晚安')).toBe(false);
        expect(notifyRoundSegment({ charId: 'c-r', charName: '阿糯', body: '晚安' })).not.toBeNull();
    });

    it('人就在屏幕前（页面可见）时不弹系统通知', () => {
        vi.stubGlobal('document', { visibilityState: 'visible' });
        const before = wasRoundNotified('c-r', '在呢');
        notifyPersistedBubble({ charId: 'c-r', charName: '阿糯', body: '在呢' });
        expect(before).toBe(false);
        expect(wasRoundNotified('c-r', '在呢')).toBe(false);
        vi.unstubAllGlobals();
    });
});

describe('自检第④行：分段播报的结论要出现在留痕里', () => {
    it('有分段记录就多打一行', () => {
        const lines = describeNotifyTrace({
            wiredAt: Date.now(),
            lastReplyAt: Date.now(),
            lastStreamNote: '分段播报：共 5 次增量、切出 2 段，已播 2 条',
        });
        expect(lines.some(line => line.startsWith('④ 分段播报'))).toBe(true);
    });

    it('没有分段记录时不冒充一行空的', () => {
        const lines = describeNotifyTrace({ wiredAt: Date.now(), lastReplyAt: Date.now() });
        expect(lines.some(line => line.startsWith('④'))).toBe(false);
    });
});

describe('语音不该进通知正文', () => {
    it('整条是语音时抹成空串（调用方据此跳过）', () => {
        expect(previewTextOf('<语音>今天好累啊</语音>')).toBe('');
        expect(previewTextOf('<语音 开心>在楼下等你</语音>')).toBe('');
    });

    it('语音后面跟着字幕，两块一起抹掉', () => {
        expect(previewTextOf('<语音>おかえり</语音><字幕>你回来啦</字幕>')).toBe('');
    });

    it('一条里既有文字又有语音，只留文字', () => {
        expect(previewTextOf('等我一下<语音>马上就到</语音>')).toBe('等我一下');
        expect(previewTextOf('<语音 生气>哼</语音>不理你了')).toBe('不理你了');
    });

    it('流式说到一半、只有开标签的，从标签起到末尾都算语音', () => {
        expect(previewTextOf('先这样<语音>后面还没说完')).toBe('先这样');
    });

    it('普通文字原样保留', () => {
        expect(previewTextOf('刚到家，饭在锅里')).toBe('刚到家，饭在锅里');
        expect(previewTextOf('')).toBe('');
    });
});

describe('自检第④行要分清「没开流式」和「开了但冻住」', () => {
    it('请求没开流式：说清是设置，不是故障', () => {
        noteStreamRequest('c-v', false, false);
        expect(describeStreamScan('c-v')).toContain('没开流式');
        resetStreamNotify('c-v');
    });

    it('开了流式却一个增量都没到：指到「页面被冻住」', () => {
        noteStreamRequest('c-v', true, true);
        expect(describeStreamScan('c-v')).toContain('页面');
        expect(describeStreamScan('c-v')).toContain('冻住');
        resetStreamNotify('c-v');
    });

    it('换一轮就把上一轮的请求状态清掉', () => {
        noteStreamRequest('c-v', true, true);
        resetStreamNotify('c-v');
        expect(describeStreamScan('c-v')).not.toContain('冻住');
    });
});
