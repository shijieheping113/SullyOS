import { describe, expect, it } from 'vitest';
import { canSparkPrivateChat, mergeSparkMentionIds, splitSparkCommentItem } from './sparkCommentParse';

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
