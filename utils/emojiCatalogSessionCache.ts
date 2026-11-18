/**
 * 表情目录（名单 + 分组）的同一次网页会话缓存。
 *
 * 点开表情要选发送时，不要每次都全表进库翻一遍。
 * 第一次（空闲预热或第一次打开面板）翻完记住；同会话再开直接用。
 * 加删改表情 / 改分组后用 force 再翻一次。
 * 图片仍走 blobRef 会话缓存，本文件只管目录。
 */
import type { Emoji, EmojiCategory } from '../types';
import { DB } from './db';

export type EmojiCatalog = {
    emojis: Emoji[];
    categories: EmojiCategory[];
};

let cache: EmojiCatalog | null = null;
let pending: Promise<EmojiCatalog> | null = null;

export function peekEmojiCatalog(): EmojiCatalog | null {
    return cache;
}

export function clearEmojiCatalogCache(): void {
    cache = null;
    pending = null;
}

/** 测试或外部写回：直接塞进会话缓存。 */
export function setEmojiCatalogCache(catalog: EmojiCatalog): void {
    cache = {
        emojis: catalog.emojis,
        categories: catalog.categories,
    };
}

async function fetchEmojiCatalog(): Promise<EmojiCatalog> {
    await DB.initializeEmojiData();
    const [emojis, categories] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
    const next = { emojis, categories };
    cache = next;
    return next;
}

/**
 * 读表情目录。默认命中会话缓存；force 时强制再进库。
 * 并发的非 force 请求共用同一趟 in-flight，避免连点面板打两次全表。
 */
export async function loadEmojiCatalog(options?: { force?: boolean }): Promise<EmojiCatalog> {
    const force = options?.force === true;
    if (!force && cache) return cache;
    if (!force && pending) return pending;

    const run = fetchEmojiCatalog().finally(() => {
        if (pending === run) pending = null;
    });
    pending = run;
    return run;
}
