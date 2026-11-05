import { describe, it, expect } from 'vitest';
import type { Emoji, EmojiCategory } from '../types';
import {
    DEFAULT_CATEGORY_ID,
    foldedCategoriesFor,
    groupFoldKey,
    isCategoryAllowedForCharacter,
    isEmojiAllowedForCharacter,
    normalizedBlockedCharacterIds,
    userVisibleCategories,
    userVisibleEmojis,
    visibleCategoriesForCharacter,
    visibleEmojisForCharacter,
    withCategoryFold,
    withCharacterSwitch,
    withEmojiBlock,
    withUserOnly,
} from './emojiPermissions';

// 2026-11-05 Ann 定案：表情包权限 = 每个分组 × 每个角色一个开关（默认全开）。
// 旧 allowedCharacterIds 名单自动换算成开关；单表情可以额外屏蔽某个角色；
// 「只有我能用」让所有角色都发不了；用户自己的面板只看折叠。

const ids = ['A', 'B', 'C'];

describe('分组开关与旧名单换算', () => {
    it('没有权限记录 = 全员可用', () => {
        const cat: EmojiCategory = { id: 'c1', name: '日常' };
        expect(ids.every(id => isCategoryAllowedForCharacter(cat, id))).toBe(true);
        expect(normalizedBlockedCharacterIds(cat, ids)).toEqual([]);
    });

    it('旧名单非空：名单里的角色亮，名单外的灰', () => {
        const cat: EmojiCategory = { id: 'c1', name: '旧名单', allowedCharacterIds: ['A'] };
        expect(isCategoryAllowedForCharacter(cat, 'A')).toBe(true);
        expect(isCategoryAllowedForCharacter(cat, 'B')).toBe(false);
        expect(normalizedBlockedCharacterIds(cat, ids).sort()).toEqual(['B', 'C']);
    });

    it('旧名单空数组 = 全员可用', () => {
        const cat: EmojiCategory = { id: 'c1', name: '空名单', allowedCharacterIds: [] };
        expect(isCategoryAllowedForCharacter(cat, 'B')).toBe(true);
    });

    it('新记录存在时以新记录为准（空数组 = 全开），旧名单作废', () => {
        const cat: EmojiCategory = {
            id: 'c1', name: '换算后', allowedCharacterIds: ['A'], blockedCharacterIds: [],
        };
        expect(isCategoryAllowedForCharacter(cat, 'B')).toBe(true);
    });

    it('关闭名单里的角色不能发', () => {
        const cat: EmojiCategory = { id: 'c1', name: '开关', blockedCharacterIds: ['B'] };
        expect(isCategoryAllowedForCharacter(cat, 'A')).toBe(true);
        expect(isCategoryAllowedForCharacter(cat, 'B')).toBe(false);
    });

    it('「只有我能用」：所有角色都不能发', () => {
        const cat: EmojiCategory = { id: 'c1', name: '私藏', userOnly: true };
        expect(ids.every(id => !isCategoryAllowedForCharacter(cat, id))).toBe(true);
    });
});

describe('AI 可见表情', () => {
    const categories: EmojiCategory[] = [
        { id: 'public', name: '全员' },
        { id: 'onlyA', name: '只给A', allowedCharacterIds: ['A'] },
        { id: 'mine', name: '只有我', userOnly: true },
    ];
    const emojis: Emoji[] = [
        { name: '通用', url: 'u1', categoryId: 'public' },
        { name: 'A专属', url: 'u2', categoryId: 'onlyA' },
        { name: '私藏', url: 'u3', categoryId: 'mine' },
        { name: '无分类', url: 'u4' },
        { name: '屏蔽A', url: 'u5', categoryId: 'public', blockedCharacterIds: ['A'] },
    ];

    it('分组关闭、单表情屏蔽、只有我能用都按角色生效', () => {
        expect(visibleEmojisForCharacter(emojis, categories, 'A').map(e => e.name).sort())
            .toEqual(['A专属', '无分类', '通用'].sort());
        expect(visibleEmojisForCharacter(emojis, categories, 'B').map(e => e.name).sort())
            .toEqual(['屏蔽A', '无分类', '通用'].sort());
    });

    it('可见分组列表不包含「只有我能用」', () => {
        expect(visibleCategoriesForCharacter(categories, 'A').map(c => c.id).sort())
            .toEqual(['onlyA', 'public'].sort());
    });

    it('单表情屏蔽只影响被屏蔽的角色', () => {
        const emoji = emojis.find(e => e.name === '屏蔽A')!;
        expect(isEmojiAllowedForCharacter(emoji, 'A')).toBe(false);
        expect(isEmojiAllowedForCharacter(emoji, 'B')).toBe(true);
    });
});

describe('用户自己的面板：折叠跟聊天窗口走', () => {
    const foldA = 'char-A';
    const foldGroup = groupFoldKey('g1');
    const categories: EmojiCategory[] = [
        { id: DEFAULT_CATEGORY_ID, name: '默认', isSystem: true },
        { id: '常用', name: '常用', foldedIn: [foldA] },
        { id: '另一个人不用', name: '另一个', foldedIn: [foldGroup] },
        { id: '都显示', name: '都显示' },
    ];

    it('折叠的分组只在自己的窗口消失', () => {
        expect(userVisibleCategories(categories, foldA).map(c => c.id).sort())
            .toEqual([DEFAULT_CATEGORY_ID, '另一个人不用', '都显示'].sort());
        expect(userVisibleCategories(categories, 'char-B').map(c => c.id).sort())
            .toEqual([DEFAULT_CATEGORY_ID, '常用', '另一个人不用', '都显示'].sort());
    });

    it('默认分组永远显示，不能被折叠', () => {
        const foldedDefault = withCategoryFold(categories[0], foldA, true);
        expect(userVisibleCategories([foldedDefault], foldA).map(c => c.id)).toEqual([DEFAULT_CATEGORY_ID]);
    });

    it('群聊折叠记在 group: 前缀下，跟私聊互不影响', () => {
        expect(foldedCategoriesFor(categories, foldGroup).map(c => c.id)).toEqual(['另一个人不用']);
        expect(foldedCategoriesFor(categories, foldA).map(c => c.id)).toEqual(['常用']);
    });

    it('折叠分组的表情不进快速发送（面板与联想共用这份列表）', () => {
        const emojis: Emoji[] = [
            { name: '常用表情', url: 'u1', categoryId: '常用' },
            { name: '另一个表情', url: 'u2', categoryId: '另一个人不用' },
            { name: '无分类', url: 'u3' },
        ];
        expect(userVisibleEmojis(emojis, categories, foldA).map(e => e.name).sort())
            .toEqual(['另一个表情', '无分类'].sort());
        expect(userVisibleEmojis(emojis, categories, foldGroup).map(e => e.name).sort())
            .toEqual(['常用表情', '无分类'].sort());
    });
});

describe('写入新记录', () => {
    it('拨角色开关会固化旧名单并清掉旧字段', () => {
        const legacy: EmojiCategory = { id: 'c1', name: '旧名单', allowedCharacterIds: ['A'] };
        const next = withCharacterSwitch(legacy, ids, 'B', true);
        expect(next.allowedCharacterIds).toBeUndefined();
        expect(next.blockedCharacterIds?.sort()).toEqual(['C']);
        expect(isCategoryAllowedForCharacter(next, 'B')).toBe(true);
        expect(isCategoryAllowedForCharacter(next, 'C')).toBe(false);
    });

    it('「只有我能用」开关', () => {
        const cat: EmojiCategory = { id: 'c1', name: '私藏' };
        expect(withUserOnly(cat, true).userOnly).toBe(true);
        expect(withUserOnly(cat, false).userOnly).toBe(false);
    });

    it('单表情屏蔽开关', () => {
        const emoji: Emoji = { name: 'e', url: 'u' };
        const blocked = withEmojiBlock(emoji, 'A', true);
        expect(blocked.blockedCharacterIds).toEqual(['A']);
        expect(withEmojiBlock(blocked, 'A', false).blockedCharacterIds).toEqual([]);
    });
});
