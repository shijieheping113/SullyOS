import { describe, expect, it } from 'vitest';
import {
    blockNoticeText,
    buildBlockRecencyStamp,
    buildBlockStatusBlock,
    peekCardStatusText,
    peekNoticeKind,
} from './block';

describe('拉黑现状注入', () => {
    it('拒收状态里同时写求看看和好友申请', () => {
        const text = buildBlockStatusBlock(
            { blocked: true, blockCallsToo: false, since: Date.UTC(2026, 8, 14, 8, 0), count: 1 },
            true,
            '小陈',
            { canCall: true },
        );
        expect(text).toContain('求看看卡');
        expect(text).toContain('好友申请');
        expect(text).toContain('现在仍在拒收');
    });

    it('钢印后的短句也点名好友申请，不写用户气泡', () => {
        const stamp = buildBlockRecencyStamp(
            { blocked: true, blockCallsToo: false, since: 1, count: 1 },
            '小陈',
            { canCall: true },
        );
        expect(stamp).toContain('【此刻仍被拒收】');
        expect(stamp).toContain('求看看卡、好友申请或打电话');
        expect(stamp).not.toContain('用户气泡');
        expect(stamp).not.toContain('系统日志｜');
    });

    it('电话也被拒时只提卡和好友申请', () => {
        const stamp = buildBlockRecencyStamp(
            { blocked: true, blockCallsToo: true, since: 1, count: 1 },
            '小陈',
            { canCall: true },
        );
        expect(stamp).toContain('求看看卡或好友申请');
        expect(stamp).not.toContain('打电话');
    });
});

describe('求看看 / 好友申请结果句', () => {
    it('四种求看看结果写明', () => {
        expect(blockNoticeText('peek-discard')).toBe('你扔掉了这条求看看');
        expect(blockNoticeText('peek-reveal')).toBe('你看了这条求看看');
        expect(blockNoticeText('peek-secret-hidden')).toBe('你偷偷看了一下，对方没察觉');
        expect(blockNoticeText('peek-secret-known')).toBe('你偷偷看了一下，对方察觉了');
        expect(peekNoticeKind('peek-secret', false)).toBe('peek-secret-hidden');
        expect(peekNoticeKind('peek-secret', true)).toBe('peek-secret-known');
    });

    it('好友申请通过和忽略也有句子', () => {
        expect(blockNoticeText('request-accept')).toBe('你通过了这条好友申请');
        expect(blockNoticeText('request-ignore')).toBe('你忽略了这条好友申请');
    });

    it('卡片状态和聊天浅灰句同一套', () => {
        expect(peekCardStatusText({ peekOutcome: 'secret', peekCharacterKnows: true })).toBe('你偷偷看了一下，对方察觉了');
        expect(peekCardStatusText({ peekOutcome: 'secret', peekCharacterKnows: false })).toBe('你偷偷看了一下，对方没察觉');
    });
});
