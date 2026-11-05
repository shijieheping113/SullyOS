import { describe, it, expect, beforeEach } from 'vitest';
import { DB, openDB } from './db';
import type { Emoji, EmojiCategory } from '../types';

// 备份兼容（Ann 定案）：新权限字段挂在分组/表情对象上，作者原备份按整个对象
// 导出与写回，字段自然跟着走；这里钉住「整条记录存取不丢字段」这个基础。

async function clearStore(name: string): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

beforeEach(async () => {
    await clearStore('emojis');
    await clearStore('emoji_categories');
});

describe('表情权限字段的落库与备份形状', () => {
    it('分组的开关、只有我能用、折叠记录原样读回', async () => {
        const category: EmojiCategory = {
            id: 'cat-private',
            name: '私藏',
            userOnly: true,
            blockedCharacterIds: ['B', 'C'],
            foldedIn: ['char-A', 'group:g1'],
        };
        await DB.saveEmojiCategory(category);
        const stored = (await DB.getEmojiCategories()).find(c => c.id === category.id);
        expect(stored).toMatchObject({
            userOnly: true,
            blockedCharacterIds: ['B', 'C'],
            foldedIn: ['char-A', 'group:g1'],
        });
    });

    it('单表情屏蔽跟着表情记录一起存取', async () => {
        const emoji: Emoji = { name: '不给B', url: 'u1', categoryId: 'cat-1', blockedCharacterIds: ['B'] };
        await DB.saveEmojiRecord(emoji);
        const stored = (await DB.getEmojis()).find(e => e.name === emoji.name);
        expect(stored).toMatchObject({ categoryId: 'cat-1', blockedCharacterIds: ['B'] });
    });

    it('整对象重新写回（备份恢复的做法）不会丢新字段', async () => {
        const exported: EmojiCategory[] = [{
            id: 'cat-1', name: '日常', blockedCharacterIds: ['C'], foldedIn: ['char-A'],
        }];
        const exportedEmojis: Emoji[] = [
            { name: '笑', url: 'u1', categoryId: 'cat-1', blockedCharacterIds: ['A'] },
        ];
        // 模拟 FullBackupData 的 emojiCategories / savedEmojis 两段整体写回
        for (const category of exported) await DB.saveEmojiCategory(category);
        for (const emoji of exportedEmojis) await DB.saveEmojiRecord(emoji);

        const cats = await DB.getEmojiCategories();
        const emojis = await DB.getEmojis();
        expect(cats.find(c => c.id === 'cat-1')).toMatchObject({
            blockedCharacterIds: ['C'],
            foldedIn: ['char-A'],
        });
        expect(emojis.find(e => e.name === '笑')).toMatchObject({ blockedCharacterIds: ['A'] });
    });

    it('旧备份（没有任何新字段）读回后仍按旧名单换算，不报错', async () => {
        const legacy: EmojiCategory = { id: 'cat-legacy', name: '旧', allowedCharacterIds: ['A'] };
        await DB.saveEmojiCategory(legacy);
        const stored = (await DB.getEmojiCategories()).find(c => c.id === 'cat-legacy');
        expect(stored?.allowedCharacterIds).toEqual(['A']);
        expect(stored?.blockedCharacterIds).toBeUndefined();
    });
});
