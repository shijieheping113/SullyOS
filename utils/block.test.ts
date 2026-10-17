import { describe, expect, it } from 'vitest';
import {
    blockNoticeText,
    buildBlockRecencyStamp,
    buildBlockStatusBlock,
    extractBlockFriendRequestAction,
    extractBlockPeekAction,
    formatBlockPeekRecord,
    formatBlockRecord,
    peekCardStatusText,
    peekNoticeKind,
    peekRecordStatus,
} from './block';

const blocked = { blocked: true, blockCallsToo: false, since: Date.UTC(2026, 8, 14, 8, 0), count: 1 };

describe('拉黑现状注入', () => {
    it('拒收说明按能力分开，并允许真诚的长信', () => {
        const text = buildBlockStatusBlock(blocked, true, '小陈', { canCall: true, canVoice: true });
        expect(text).toContain('现在仍在拒收');
        expect(text).toContain('【你现在有的能力】');
        expect(text).toContain('一、求看看');
        expect(text).toContain('二、好友申请');
        expect(text).toContain('三、打电话');
        expect(text).toContain('没有「最多一段」');
        expect(text).toContain('[[ACTION:PEEK|起头写在这里]]');
        expect(text).toContain('两个地方都要有字');
        expect(text).toContain('[[/PEEK]]');
        expect(text).toContain('[[ACTION:CALL]]');
        expect(text).toContain('被拒绝不是以后都不许再求');
        expect(text).toContain('**想，比套例子重要。**');
        expect(text).toContain('和语音');
        expect(text).not.toContain('只能发');
        expect(text).not.toContain('必须用');
        expect(text).not.toContain('门');
    });

    it('没开语音、电话也拒了时，不教语音和拨号', () => {
        const text = buildBlockStatusBlock(
            { ...blocked, blockCallsToo: true },
            true,
            '小陈',
            { canCall: true, canVoice: false },
        );
        expect(text).toContain('电话现在打不通');
        expect(text).not.toContain('[[ACTION:CALL]]');
        expect(text).not.toContain('语音');
        expect(text).toContain('你仍然可以发消息。');
    });

    it('钢印只提醒读空气，不列动作菜单', () => {
        const stamp = buildBlockRecencyStamp(blocked, '小陈', { canCall: true, canVoice: false });
        expect(stamp).toContain('【此刻仍被拒收】');
        expect(stamp).toContain('小陈看不见你的普通文字。');
        expect(stamp).toContain('你仍然可以发消息。');
        expect(stamp).toContain('**读空气。**');
        expect(stamp).not.toContain('只能发');
        expect(stamp).not.toContain('打电话');
        expect(stamp).not.toContain('用户气泡');
        expect(stamp).not.toContain('系统日志｜');
        expect(stamp).not.toContain('门');
    });

    it('开了语音时，钢印同时说文字和语音都没送到', () => {
        const stamp = buildBlockRecencyStamp(blocked, '小陈', { canVoice: true });
        expect(stamp).toContain('普通文字和语音');
        expect(stamp).toContain('你仍然可以发消息和语音。');
    });

    it('已经解除时不再钉拒收钢印', () => {
        expect(buildBlockRecencyStamp({ ...blocked, blocked: false }, '小陈')).toBe('');
        expect(buildBlockStatusBlock({ ...blocked, blocked: false }, true, '小陈')).toContain('现在收得到你的消息');
    });
});

describe('求看看记录', () => {
    it('三种状态，偷偷看不把真相写进去', () => {
        expect(peekRecordStatus({ peekOutcome: 'reveal' })).toBe('看过');
        expect(peekRecordStatus({ peekOutcome: 'discard' })).toBe('扔掉');
        expect(peekRecordStatus({ peekOutcome: 'secret', peekCharacterKnows: true })).toBe('看过');
        expect(peekRecordStatus({ peekOutcome: 'secret', peekCharacterKnows: false })).toBe('没看');
        expect(peekRecordStatus({})).toBe('没看');
        expect(peekRecordStatus({ peekViewed: true })).toBe('看过');
    });

    it('没看和扔掉也带着当初写下的全文', () => {
        const hidden = formatBlockPeekRecord({
            timestamp: Date.UTC(2026, 8, 14, 8, 0),
            metadata: {
                peekOutcome: 'secret',
                peekCharacterKnows: false,
                peekHeadline: '还在吗',
                peekText: '第一段\n\n第二段|留着',
            },
        });
        expect(hidden).toContain('对方：没看');
        expect(hidden).toContain('起头：还在吗');
        expect(hidden).toContain('你写下的：\n第一段\n\n第二段|留着');
        expect(hidden).not.toContain('偷偷');
        expect(hidden).not.toContain('扔掉');

        const tossed = formatBlockPeekRecord({
            timestamp: Date.UTC(2026, 8, 14, 8, 0),
            metadata: { peekOutcome: 'discard', peekText: '对不起' },
        });
        expect(tossed).toContain('对方：扔掉');
        expect(tossed).toContain('你写下的：\n对不起');
    });
});

describe('电话记录', () => {
    const at = Date.UTC(2026, 8, 14, 8, 0);

    it('没开主动来电、电话也被拒时，不写电话=是', () => {
        const text = formatBlockRecord({ at, status: '已拉黑', blockCallsToo: true, allowProactiveCall: false });
        expect(text).toContain('电话=打不通');
        expect(text).not.toContain('电话=是');
        expect(text).not.toContain('电话=否');
    });

    it('开了主动来电且没有拒电话时，写成可以打', () => {
        const text = formatBlockRecord({ at, status: '已拉黑', blockCallsToo: false, allowProactiveCall: true });
        expect(text).toContain('电话=可以打');
        expect(text).not.toContain('电话=否');
    });

    it('没开主动来电、电话没被拒，也是打不通', () => {
        const text = formatBlockRecord({ at, status: '已拉黑', blockCallsToo: false, allowProactiveCall: false });
        expect(text).toContain('电话=打不通');
        expect(text).not.toContain('电话=否');
        expect(text).not.toContain('电话=是');
    });

    it('开了主动来电但电话被拒，仍然是打不通', () => {
        const text = formatBlockRecord({ at, status: '已拉黑', blockCallsToo: true, allowProactiveCall: true });
        expect(text).toContain('电话=打不通');
        expect(text).not.toContain('电话=是');
    });
});

describe('求看看暗号', () => {
    it('起头在标签里，信在两个标签中间，竖线留在信里', () => {
        const got = extractBlockPeekAction('甲\n[[ACTION:PEEK|还在吗]]\n第一段\n\n第二段|留着\n[[/PEEK]]\n乙');
        expect(got.consumed).toBe(true);
        expect(got.headline).toBe('还在吗');
        expect(got.line).toBe('第一段\n\n第二段|留着');
        expect(got.text).toContain('甲');
        expect(got.text).toContain('乙');
        expect(got.text).not.toContain('ACTION');
    });

    it('旧的第一行起头仍然能拆开', () => {
        const got = extractBlockPeekAction('[[ACTION:PEEK]]\n还在吗\n\n第一段\n[[/PEEK]]');
        expect(got.headline).toBe('还在吗');
        expect(got.line).toBe('第一段');
    });

    it('块里只有一行时，整段仍是信，不另造起头', () => {
        const got = extractBlockPeekAction('[[ACTION:PEEK]]\n就这一句\n[[/PEEK]]');
        expect(got.headline).toBe('');
        expect(got.line).toBe('就这一句');
    });

    it('没写结束标签时，后面的信仍然收进来，下一张标签留着', () => {
        const got = extractBlockPeekAction('[[ACTION:PEEK|还在吗]]\n我错了。\n[[ACTION:FRIEND_REQUEST|回来]]');
        expect(got.headline).toBe('还在吗');
        expect(got.line).toBe('我错了。');
        expect(got.text).toContain('FRIEND_REQUEST');
        expect(got.text).not.toContain('我错了');
    });

    it('空标签不落卡，旁边的话留着', () => {
        const bare = extractBlockPeekAction('甲\n[[ACTION:PEEK]]\n乙');
        expect(bare.consumed).toBe(false);
        expect(bare.found).toBe(true);
        expect(bare.line).toBe('');
        expect(bare.text).toContain('甲');
        expect(bare.text).toContain('乙');
        expect(bare.text).not.toContain('ACTION');

        const closed = extractBlockPeekAction('[[ACTION:PEEK]]\n[[/PEEK]]');
        expect(closed.consumed).toBe(false);
        expect(closed.line).toBe('');
        expect(closed.text).not.toContain('PEEK');
    });

    it('只有标签里一句时，这句话就是信', () => {
        const got = extractBlockPeekAction('你好\n[[ACTION:PEEK|一句|后面]]');
        expect(got.consumed).toBe(true);
        expect(got.headline).toBe('');
        expect(got.line).toBe('一句|后面');
        expect(got.text).toContain('你好');
    });

    it('写错结束标签也能把信收住', () => {
        const got = extractBlockPeekAction('[[ACTION:PEEK|还在吗]]\n信在这\n[[/ACTION:PEEK]]');
        expect(got.headline).toBe('还在吗');
        expect(got.line).toBe('信在这');
        expect(got.text).not.toContain('ACTION');
    });

    it('好友申请附言仍是一行', () => {
        const got = extractBlockFriendRequestAction('[[ACTION:FRIEND_REQUEST|想你|多余]]');
        expect(got.consumed).toBe(true);
        expect(got.line).toBe('想你');
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
