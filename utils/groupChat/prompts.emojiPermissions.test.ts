import { describe, it, expect } from 'vitest';
import type { Emoji, EmojiCategory } from '../../types';
import { buildEmojiContextStr } from './prompts';

// 群聊表情清单（Ann 选法一）：所有成员都能用的列进公共清单；
// 只有个别成员能用的，名字后加「（仅角色名）」；谁都不能用的（只有我能用）不出现。

const categories: EmojiCategory[] = [
    { id: 'public', name: '全员' },
    { id: 'onlyA', name: '只给A', allowedCharacterIds: ['A'] },
    { id: 'mine', name: '只有我', userOnly: true },
];

const emojis: Emoji[] = [
    { name: '通用', url: 'u1', categoryId: 'public' },
    { name: 'A专属', url: 'u2', categoryId: 'onlyA' },
    { name: '私藏', url: 'u3', categoryId: 'mine' },
    { name: '屏蔽B', url: 'u4', categoryId: 'public', blockedCharacterIds: ['B'] },
];

const characters = [
    { id: 'A', name: '角色甲' },
    { id: 'B', name: '角色乙' },
];

describe('buildEmojiContextStr（群聊权限）', () => {
    it('公共表情直接列，专属表情标注仅谁能用', () => {
        const text = buildEmojiContextStr(emojis, categories, ['A', 'B'], characters);
        expect(text).toContain('通用');
        expect(text).toContain('A专属（仅角色甲）');
        expect(text).toContain('屏蔽B（仅角色甲）');
    });

    it('「只有我能用」的分组不进群聊清单', () => {
        const text = buildEmojiContextStr(emojis, categories, ['A', 'B'], characters);
        expect(text).not.toContain('私藏');
    });

    it('只有一个成员时，他自己的专属表情按公共表情列出（不加标注）', () => {
        const text = buildEmojiContextStr(emojis, categories, ['A'], characters);
        expect(text).toContain('A专属');
        expect(text).not.toContain('（仅角色甲）');
    });

    it('全部表情没人能用时返回「无」', () => {
        const onlyMine: Emoji[] = [{ name: '私藏', url: 'u3', categoryId: 'mine' }];
        expect(buildEmojiContextStr(onlyMine, categories, ['A', 'B'], characters)).toBe('无');
    });

    it('群窗口里折叠的分组不进清单（折叠 = 这个群不用，省 token）', () => {
        const folded = categories.map(c => (c.id === 'public' ? { ...c, foldedIn: ['group:g1'] } : c));
        const text = buildEmojiContextStr(emojis, folded, ['A', 'B'], characters, 'group:g1');
        expect(text).not.toContain('通用');
        expect(text).toContain('A专属（仅角色甲）');
    });

    it('别的群窗口的折叠不影响这个群', () => {
        const folded = categories.map(c => (c.id === 'public' ? { ...c, foldedIn: ['group:other'] } : c));
        expect(buildEmojiContextStr(emojis, folded, ['A', 'B'], characters, 'group:g1')).toContain('通用');
    });
});
