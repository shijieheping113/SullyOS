import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
    DB: {
        getRecentMessagesByCharId: vi.fn(),
        getMessagesByCharId: vi.fn(),
        deleteMessages: vi.fn(),
    },
}));

import { DB } from './db';
import { ORPHAN_BATTERY_HINT_PURGE_LIMIT, purgeOrphanBatteryHints } from './batteryReminderRun';

describe('purgeOrphanBatteryHints 轻量清理', () => {
    beforeEach(() => {
        vi.mocked(DB.getRecentMessagesByCharId).mockReset();
        vi.mocked(DB.getMessagesByCharId).mockReset();
        vi.mocked(DB.deleteMessages).mockReset();
    });

    it('只读最近约 300 条，不走全量 getMessagesByCharId', async () => {
        vi.mocked(DB.getRecentMessagesByCharId).mockResolvedValue([
            { id: 1, charId: 'c', role: 'assistant', type: 'text', content: 'hint', timestamp: 1, metadata: { batteryHint: true } },
            { id: 2, charId: 'c', role: 'user', type: 'text', content: 'hi', timestamp: 2 },
        ] as any);
        vi.mocked(DB.deleteMessages).mockResolvedValue(undefined as any);

        const removed = await purgeOrphanBatteryHints('c');

        expect(DB.getRecentMessagesByCharId).toHaveBeenCalledWith('c', ORPHAN_BATTERY_HINT_PURGE_LIMIT, true);
        expect(DB.getMessagesByCharId).not.toHaveBeenCalled();
        expect(removed).toBe(1);
        expect(DB.deleteMessages).toHaveBeenCalledWith([1]);
    });

    it('Chat 进聊天立刻 reloadMessages，不再把 reload 挂在 purge.finally', () => {
        const source = readFileSync(path.resolve(__dirname, '../apps/Chat.tsx'), 'utf8');
        const enterBlock = source.slice(
            source.indexOf('// 首屏立刻拉最近 N 条'),
            source.indexOf('loadEmojiData();'),
        );
        expect(enterBlock).toContain('void reloadMessages(LOAD_BATCH_SIZE);');
        expect(enterBlock).toContain('requestIdleCallback');
        expect(enterBlock).toContain('purgeOrphanBatteryHints(charIdForPurge)');
        expect(enterBlock).not.toContain('purgeOrphanBatteryHints(activeCharacterId).finally');
    });
});
