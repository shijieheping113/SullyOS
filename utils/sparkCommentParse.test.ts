import { describe, expect, it } from 'vitest';
import { canSparkPrivateChat, findSparkReplyTarget, mergeSparkMentionIds, splitSparkCommentItem, unusedPostMentionIds } from './sparkCommentParse';

describe('splitSparkCommentItem', () => {
    it('keeps public comment when the same object also has privateChat', () => {
        expect(splitSparkCommentItem({
            author: '小花园',
            charId: 'a-id',
            content: '这条发在评论区',
            privateChat: ['这条只给你看'],
        })).toEqual({
            publicContent: '这条发在评论区',
            privateLines: ['这条只给你看'],
        });
    });

    it('does not drop a public comment just because privateChat is an empty array', () => {
        expect(splitSparkCommentItem({
            author: '路人甲',
            charId: null,
            content: '路过',
            privateChat: [],
        })).toEqual({ publicContent: '路过', privateLines: [] });
    });

    it('still saves private-only items that have no public content', () => {
        expect(splitSparkCommentItem({
            author: '小花园',
            charId: 'a-id',
            privateChat: ['只私聊'],
        })).toEqual({ publicContent: null, privateLines: ['只私聊'] });
    });

    it('treats toPrivateChat:true as private-only (legacy)', () => {
        expect(splitSparkCommentItem({
            author: '小花园',
            content: '旧格式私聊',
            toPrivateChat: true,
        })).toEqual({ publicContent: null, privateLines: ['旧格式私聊'] });
    });
});

describe('mergeSparkMentionIds', () => {
    it('merges post @, comment @ and 楼中楼 reply, without duplicates', () => {
        expect(mergeSparkMentionIds(['a-id', 'b-id'], ['b-id', 'c-id'], ['a-id'])).toEqual(['a-id', 'b-id', 'c-id']);
    });

    it('ignores empty groups', () => {
        expect(mergeSparkMentionIds(undefined, [], ['x'])).toEqual(['x']);
    });
});

describe('canSparkPrivateChat', () => {
    it('only allows tracked characters whose private chat is not turned off', () => {
        expect(canSparkPrivateChat('a-id', ['a-id'], {})).toBe(true);
        expect(canSparkPrivateChat('a-id', ['b-id'], {})).toBe(false);
        expect(canSparkPrivateChat('a-id', ['a-id'], { 'a-id': true })).toBe(false);
        expect(canSparkPrivateChat(undefined, ['a-id'], {})).toBe(false);
    });
});

describe('unusedPostMentionIds', () => {
    it('returns post @ until the one forced round is used', () => {
        expect(unusedPostMentionIds({ mentions: ['a-id', 'b-id'] })).toEqual(['a-id', 'b-id']);
        expect(unusedPostMentionIds({ mentions: ['a-id'], mentionForceUsed: true })).toEqual([]);
        expect(unusedPostMentionIds({ mentionForceUsed: false })).toEqual([]);
    });
});

describe('findSparkReplyTarget', () => {
    const a = { id: 'a1', authorName: '小花园', authorCharId: 'a-id' };
    const userToA = { id: 'u1', authorName: '雨的账号', replyToId: 'a1' };
    const b = { id: 'b1', authorName: 'SullyDev', authorCharId: 'b-id' };
    const userToB = { id: 'u2', authorName: '雨的账号', replyToId: 'b1' };

    it('hangs a character reply to the user comment that was talking to that character, not the latest user comment', () => {
        const hit = findSparkReplyTarget('雨的账号', [a, userToA, b, userToB], {
            matchedCharId: 'a-id',
            userNames: ['雨的账号'],
        });
        expect(hit?.id).toBe('u1');
    });

    it('falls back to the latest same-name comment when not replying to the user', () => {
        const hit = findSparkReplyTarget('SullyDev', [a, userToA, b, userToB], {
            matchedCharId: 'a-id',
            userNames: ['雨的账号'],
        });
        expect(hit?.id).toBe('b1');
    });

    it('keeps a returning 路人 on their own thread when replying to the user', () => {
        const stranger = { id: 's1', authorName: '路过的甲' };
        const userToStranger = { id: 'u-s', authorName: '雨的账号', replyToId: 's1' };
        const hit = findSparkReplyTarget('雨的账号', [stranger, userToStranger, b, userToB], {
            speakerName: '路过的甲',
            userNames: ['雨的账号'],
        });
        expect(hit?.id).toBe('u-s');
    });

    it('hangs a returning 路人 under their last comment when replyTo is empty', () => {
        const stranger = { id: 's1', authorName: '路过的甲' };
        const userToStranger = { id: 'u-s', authorName: '雨的账号', replyToId: 's1' };
        const hit = findSparkReplyTarget('', [stranger, userToStranger, b, userToB], {
            speakerName: '路过的甲',
            userNames: ['雨的账号'],
        });
        expect(hit?.id).toBe('s1');
    });

    it('forces an @ round onto the @ comment itself', () => {
        const hit = findSparkReplyTarget('雨的账号', [a, userToA, b, userToB], {
            matchedCharId: 'a-id',
            userNames: ['雨的账号'],
            forceCommentId: 'u2',
        });
        expect(hit?.id).toBe('u2');
    });
});
