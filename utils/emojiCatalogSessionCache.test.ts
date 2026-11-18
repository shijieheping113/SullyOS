import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB } from './db';
import {
    clearEmojiCatalogCache,
    loadEmojiCatalog,
    peekEmojiCatalog,
    setEmojiCatalogCache,
} from './emojiCatalogSessionCache';

describe('emojiCatalogSessionCache', () => {
    beforeEach(() => {
        clearEmojiCatalogCache();
        vi.spyOn(DB, 'getEmojis').mockResolvedValue([{ name: '开心', url: 'blobref:a' }]);
        vi.spyOn(DB, 'getEmojiCategories').mockResolvedValue([{ id: 'default', name: '默认', isSystem: true }]);
        vi.spyOn(DB, 'initializeEmojiData').mockResolvedValue(undefined);
    });

    afterEach(() => {
        clearEmojiCatalogCache();
        vi.restoreAllMocks();
    });

    it('第一次进库，第二次直接用缓存', async () => {
        const first = await loadEmojiCatalog();
        expect(first.emojis).toHaveLength(1);
        expect(DB.initializeEmojiData).toHaveBeenCalledTimes(1);
        expect(DB.getEmojis).toHaveBeenCalledTimes(1);

        const second = await loadEmojiCatalog();
        expect(second).toBe(first);
        expect(DB.getEmojis).toHaveBeenCalledTimes(1);
        expect(peekEmojiCatalog()?.emojis[0]?.name).toBe('开心');
    });

    it('force 时再进库并更新缓存', async () => {
        await loadEmojiCatalog();
        vi.mocked(DB.getEmojis).mockResolvedValue([
            { name: '开心', url: 'blobref:a' },
            { name: '新表情', url: 'blobref:b' },
        ]);
        const next = await loadEmojiCatalog({ force: true });
        expect(DB.getEmojis).toHaveBeenCalledTimes(2);
        expect(next.emojis.map(e => e.name)).toEqual(['开心', '新表情']);
        expect(peekEmojiCatalog()?.emojis).toHaveLength(2);
    });

    it('并发非 force 只打一趟库', async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        vi.mocked(DB.getEmojis).mockImplementation(async () => {
            await gate;
            return [{ name: '开心', url: 'blobref:a' }];
        });

        const a = loadEmojiCatalog();
        const b = loadEmojiCatalog();
        release();
        const [ra, rb] = await Promise.all([a, b]);
        expect(ra).toBe(rb);
        expect(DB.getEmojis).toHaveBeenCalledTimes(1);
    });

    it('clear / set 可清空或预填', () => {
        setEmojiCatalogCache({
            emojis: [{ name: '预填', url: 'x' }],
            categories: [{ id: 'default', name: '默认' }],
        });
        expect(peekEmojiCatalog()?.emojis[0]?.name).toBe('预填');
        clearEmojiCatalogCache();
        expect(peekEmojiCatalog()).toBeNull();
    });
});
