import { describe, expect, it } from 'vitest';
import {
    collectRelatedCallMessageIds,
    DEFAULT_INCOMING_CALL_PROMPT,
    extractIncomingCallAction,
    formatIncomingCallRecord,
    incomingCallGreetingPrompt,
    sanitizeIncomingCallLine,
    shouldOfferIncomingCall,
} from './incomingCall';

describe('extractIncomingCallAction', () => {
    it('剥掉标签并取出附言第一段', () => {
        const r = extractIncomingCallAction('想你了\n[[ACTION:CALL|宝宝想你啦，可以接电话吗？]]');
        expect(r.consumed).toBe(true);
        expect(r.line).toBe('宝宝想你啦，可以接电话吗？');
        expect(r.text).toBe('想你了');
    });

    it('没有附言也能打', () => {
        const r = extractIncomingCallAction('[[ACTION:CALL]]');
        expect(r.consumed).toBe(true);
        expect(r.line).toBe('');
        expect(r.text).toBe('');
    });

    it('附言里的 | 只取第一段，方括号丢掉', () => {
        expect(sanitizeIncomingCallLine('第一句|第二句')).toBe('第一句');
        expect(sanitizeIncomingCallLine('看]这段[话|x')).toBe('看这段话');
        const r = extractIncomingCallAction('[[ACTION:CALL|你好|多余]]]]');
        expect(r.line).toBe('你好');
    });

    it('多条只认第一次', () => {
        const r = extractIncomingCallAction('[[ACTION:CALL|一]]\n[[ACTION:CALL|二]]');
        expect(r.line).toBe('一');
        expect(r.text).toBe('');
    });
});

describe('shouldOfferIncomingCall', () => {
    const char = { allowProactiveCall: true };
    const base = {
        char,
        hasPending: false,
        inCall: false,
        suspended: false,
        hidden: false,
        amsgReplay: false,
        messages: [] as any[],
        now: Date.UTC(2026, 8, 13, 12, 0, 0),
    };

    it('开关关 / 已有待处理 / 通话中 / 后台 / 主动消息重放 都不弹', () => {
        expect(shouldOfferIncomingCall({ ...base, char: {} })).toBe(false);
        expect(shouldOfferIncomingCall({ ...base, hasPending: true })).toBe(false);
        expect(shouldOfferIncomingCall({ ...base, inCall: true })).toBe(false);
        expect(shouldOfferIncomingCall({ ...base, suspended: true })).toBe(false);
        expect(shouldOfferIncomingCall({ ...base, hidden: true })).toBe(false);
        expect(shouldOfferIncomingCall({ ...base, amsgReplay: true })).toBe(false);
    });

    it('间隔和每天上限空着不卡；填了才卡', () => {
        expect(shouldOfferIncomingCall(base)).toBe(true);
        const rejected = [{
            timestamp: base.now - 5 * 60_000,
            metadata: { source: 'incoming-call', callOutcome: 'rejected', resolvedAt: base.now - 5 * 60_000 },
        }];
        expect(shouldOfferIncomingCall({
            ...base,
            char: { allowProactiveCall: true, incomingCallCooldownMin: 10 },
            messages: rejected,
        })).toBe(false);
        expect(shouldOfferIncomingCall({
            ...base,
            char: { allowProactiveCall: true },
            messages: rejected,
        })).toBe(true);
        expect(shouldOfferIncomingCall({
            ...base,
            char: { allowProactiveCall: true, incomingCallDailyMax: 1 },
            messages: [{ timestamp: base.now - 1000, metadata: { source: 'incoming-call' } }],
        })).toBe(false);
    });
});

describe('formatIncomingCallRecord', () => {
    it('写成记录形态，附言干净', () => {
        const text = formatIncomingCallRecord({
            timestamp: Date.parse('2026-09-13T13:04:00'),
            metadata: { callOutcome: 'rejected', durationSec: 0, callLine: '宝宝想你啦', calledAt: Date.parse('2026-09-13T13:04:00') },
        });
        expect(text).toContain('[[记录:CALL|');
        expect(text).toContain('status=已拒');
        expect(text).toContain('duration=00:00');
        expect(text).toContain('line=宝宝想你啦');
        expect(text.startsWith('[[记录:CALL|')).toBe(true);
        expect(text.endsWith(']]')).toBe(true);
    });

    it('电话被拒收写成打不通，不是已拒', () => {
        const text = formatIncomingCallRecord({
            timestamp: Date.parse('2026-09-13T13:04:00'),
            metadata: { callOutcome: 'blocked', callBlocked: true, calledAt: Date.parse('2026-09-13T13:04:00') },
        });
        expect(text).toContain('status=打不通');
        expect(text).not.toContain('status=已拒');
    });
});

describe('DEFAULT_INCOMING_CALL_PROMPT', () => {
    it('不禁深夜，刚拒刚挂才劝停', () => {
        expect(DEFAULT_INCOMING_CALL_PROMPT).not.toContain('深夜不要打');
        expect(DEFAULT_INCOMING_CALL_PROMPT).toContain('深夜也可以打');
        expect(DEFAULT_INCOMING_CALL_PROMPT).toContain('刚拒接或刚挂断');
    });
});

describe('collectRelatedCallMessageIds', () => {
    it('删来电卡时带上同一通的通话正文和结束卡', () => {
        const incoming = { id: 1, metadata: { source: 'incoming-call', callSessionId: 'call-9' } };
        const talk = { id: 2, metadata: { source: 'call', callSessionId: 'call-9' } };
        const end = { id: 3, metadata: { source: 'call-end-popup', callSessionId: 'call-9', incomingFromChat: true, incomingCallMessageId: 1 } };
        const other = { id: 4, metadata: { source: 'call', callSessionId: 'call-other' } };
        expect(collectRelatedCallMessageIds([incoming, talk, end, other], incoming).sort()).toEqual([1, 2, 3]);
    });
});

describe('incomingCallGreetingPrompt', () => {
    it('带上附言，不让角色念规则', () => {
        const p = incomingCallGreetingPrompt('用户', '宝宝想你啦');
        expect(p).toContain('宝宝想你啦');
        expect(p).toContain('对方接了');
        expect(p).toContain('不要解释规则');
    });
});
