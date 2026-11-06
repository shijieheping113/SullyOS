import type { Emoji, EmojiCategory } from '../types';

/**
 * 表情包权限的唯一换算入口。
 *
 * 规则（2026-11-05 Ann 定案）：
 * - 分组对每个角色默认都是「能用」；关掉的记在 blockedCharacterIds。
 * - 旧数据里挂在 allowedCharacterIds 上的名单自动换算成开关：名单里的角色亮、名单外的灰。
 *   只要分组对象上出现 blockedCharacterIds（哪怕是空数组），就以新记录为准。
 * - userOnly = 只有用户自己能用，所有角色都不能发。
 * - 单个表情可以额外对某些角色关闭（Emoji.blockedCharacterIds），在分组开关亮着时生效。
 * - 用户自己的面板永远能看见所有分组（默认分组除外不受折叠影响），折叠只影响面板显示。
 */

export const DEFAULT_CATEGORY_ID = 'default';

const GROUP_FOLD_PREFIX = 'group:';

/** 群聊折叠记在 `group:<groupId>` 下，跟私聊的 characterId 分开。 */
export function groupFoldKey(groupId: string): string {
    return `${GROUP_FOLD_PREFIX}${groupId}`;
}

/**
 * 把旧名单换算成「被关掉的角色」。
 * 旧名单为空/不存在 = 全部打开；旧名单非空 = 名单外全部关掉。
 */
export function normalizedBlockedCharacterIds(
    category: EmojiCategory,
    allCharacterIds: readonly string[],
): string[] {
    if (Array.isArray(category.blockedCharacterIds)) return category.blockedCharacterIds;
    const legacy = category.allowedCharacterIds;
    if (!legacy || legacy.length === 0) return [];
    return allCharacterIds.filter(id => !legacy.includes(id));
}

/** 分组对某角色是否可用（AI 角度）。userOnly 分组对任何角色都不可用。 */
export function isCategoryAllowedForCharacter(category: EmojiCategory, characterId: string): boolean {
    if (category.userOnly) return false;
    if (Array.isArray(category.blockedCharacterIds)) {
        return !category.blockedCharacterIds.includes(characterId);
    }
    if (category.allowedCharacterIds && category.allowedCharacterIds.length > 0) {
        return category.allowedCharacterIds.includes(characterId);
    }
    return true;
}

/** 单个表情对某角色是否可用（AI 角度）。 */
export function isEmojiAllowedForCharacter(emoji: Emoji, characterId: string): boolean {
    return !(Array.isArray(emoji.blockedCharacterIds) && emoji.blockedCharacterIds.includes(characterId));
}

/** 某角色能用的分组（AI 提示词、云端清单都用这一份）。 */
export function visibleCategoriesForCharacter(
    categories: readonly EmojiCategory[],
    characterId: string,
): EmojiCategory[] {
    return categories.filter(category => isCategoryAllowedForCharacter(category, characterId));
}

/**
 * 某角色能用的表情（AI 提示词、云端清单、群聊分发都用这一份）。
 * 分类对角色关闭时整组不出现；无分类（或 default）的表情始终可见；再减去单表情屏蔽。
 * 只有「确实存在且被关掉」的分类才隐藏——跟旧实现一致，没传进来的分类不擅自处理。
 */
export function visibleEmojisForCharacter(
    emojis: readonly Emoji[],
    categories: readonly EmojiCategory[],
    characterId: string,
): Emoji[] {
    const hiddenCategoryIds = new Set(
        categories
            .filter(category => !isCategoryAllowedForCharacter(category, characterId))
            .map(category => category.id),
    );
    return emojis.filter(emoji => {
        const categoryId = emoji.categoryId;
        if (categoryId && categoryId !== DEFAULT_CATEGORY_ID && hiddenCategoryIds.has(categoryId)) {
            return false;
        }
        return isEmojiAllowedForCharacter(emoji, characterId);
    });
}

/**
 * 用户自己的面板能看到的分组：全部分组减去在当前聊天窗口折叠的那些。
 * 默认分组永远显示（保底入口）。
 */
export function userVisibleCategories(
    categories: readonly EmojiCategory[],
    foldKey: string,
): EmojiCategory[] {
    return categories.filter(category => {
        if (category.id === DEFAULT_CATEGORY_ID) return true;
        return !(category.foldedIn || []).includes(foldKey);
    });
}

/** 用户自己的面板里当前窗口被折叠的分组（不含默认分组）。 */
export function foldedCategoriesFor(
    categories: readonly EmojiCategory[],
    foldKey: string,
): EmojiCategory[] {
    return categories.filter(category => (
        category.id !== DEFAULT_CATEGORY_ID && (category.foldedIn || []).includes(foldKey)
    ));
}

/**
 * 给 AI 的「这一轮能用什么」：角色权限过滤之后，再减掉用户在当前窗口折叠的分组。
 *
 * 为什么要减折叠（Ann 2026-11-06）：折叠就是用户在说「这个窗口里我不看这些」，
 * 挂了也不会用；留着只会让提示词清单变长、把模型的注意力摊薄。折叠是窗口偏好、
 * 不是禁令——角色真要发某个折叠分组里的表情，落库那一步仍按权限反查 URL。
 *
 * foldKey 与 panel 一致：私聊/陪看/协同/主动消息用角色 id，群聊用 groupFoldKey(groupId)。
 */
export function promptEmojisForCharacter(
    emojis: readonly Emoji[],
    categories: readonly EmojiCategory[],
    characterId: string,
    foldKey: string,
): { emojis: Emoji[]; categories: EmojiCategory[] } {
    const foldedIds = new Set(
        foldedCategoriesFor(categories, foldKey)
            .map(category => category.id)
            .filter(id => id !== DEFAULT_CATEGORY_ID),
    );
    const promptCategories = foldedIds.size === 0
        ? visibleCategoriesForCharacter(categories, characterId)
        : visibleCategoriesForCharacter(categories, characterId)
            .filter(category => !foldedIds.has(category.id));
    const promptEmojis = visibleEmojisForCharacter(emojis, categories, characterId)
        .filter(emoji => !emoji.categoryId || !foldedIds.has(emoji.categoryId));
    return { emojis: promptEmojis, categories: promptCategories };
}

/** 用户自己的面板里能快速发送的表情：全部分组减去当前窗口折叠的分组。 */
export function userVisibleEmojis(
    emojis: readonly Emoji[],
    categories: readonly EmojiCategory[],
    foldKey: string,
): Emoji[] {
    const hiddenIds = new Set(
        foldedCategoriesFor(categories, foldKey).map(category => category.id),
    );
    if (hiddenIds.size === 0) return [...emojis];
    return emojis.filter(emoji => !emoji.categoryId || !hiddenIds.has(emoji.categoryId));
}

/** 切换某个分组的折叠状态（只影响当前聊天窗口）。 */
export function withCategoryFold(
    category: EmojiCategory,
    foldKey: string,
    folded: boolean,
): EmojiCategory {
    const current = new Set(category.foldedIn || []);
    if (folded) current.add(foldKey); else current.delete(foldKey);
    return { ...category, foldedIn: [...current] };
}

/** 切换某个角色对这个分组的开关（写新记录，顺手清掉旧名单）。 */
export function withCharacterSwitch(
    category: EmojiCategory,
    allCharacterIds: readonly string[],
    characterId: string,
    allowed: boolean,
): EmojiCategory {
    const blocked = new Set(normalizedBlockedCharacterIds(category, allCharacterIds));
    if (allowed) blocked.delete(characterId); else blocked.add(characterId);
    const next: EmojiCategory = { ...category, blockedCharacterIds: [...blocked] };
    delete next.allowedCharacterIds;
    return next;
}

/** 切换「只有我能用」。 */
export function withUserOnly(category: EmojiCategory, userOnly: boolean): EmojiCategory {
    return { ...category, userOnly };
}

/** 切换单个表情对某个角色的屏蔽。 */
export function withEmojiBlock(emoji: Emoji, characterId: string, blocked: boolean): Emoji {
    const current = new Set(emoji.blockedCharacterIds || []);
    if (blocked) current.add(characterId); else current.delete(characterId);
    return { ...emoji, blockedCharacterIds: [...current] };
}

/** 分组是否有任何权限设置（UI 上用来决定要不要显示小锁）。 */
export function categoryHasRestriction(category: EmojiCategory): boolean {
    return !!category.userOnly
        || (category.blockedCharacterIds?.length || 0) > 0
        || (category.allowedCharacterIds?.length || 0) > 0;
}
