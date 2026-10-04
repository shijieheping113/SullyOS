import { describe, expect, it } from 'vitest';
import type { CharacterProfile, Message } from '../types';
import { compareChatMessages } from './chatMessageOrder';
import { DB } from './db';
import { applySullyFormatUndo, loadSullyFormatUndo } from './sullyFormatUndo';
import { commitRepairParts, messagesForRepairSave } from './sullyRepairCommit';

function msg(partial: Pick<Message, 'id' | 'timestamp' | 'content'> & Partial<Message>): Message {
    return {
        charId: 'c',
        role: 'assistant',
        type: 'text',
        ...partial,
    };
}

describe('messagesForRepairSave', () => {
    it('重新编辑时选中集合空了，仍按稿子编号把还在的几条找回来', () => {
        const anchor = msg({ id: 2, timestamp: 200, content: '乙' });
        const loaded = [
            msg({ id: 4, timestamp: 400, content: '丁' }),
            msg({ id: 2, timestamp: 200, content: '乙' }),
            msg({ id: 9, timestamp: 900, content: '别的' }),
        ];
        const picked = messagesForRepairSave(
            [],
            anchor,
            [{ id: 4 }, { id: 2 }, { id: 'new' }],
            loaded,
        );
        expect(picked.map(item => item.id)).toEqual([2, 4]);
    });
});

describe('commitRepairParts', () => {
    const char = { id: 'repair-place-commit', name: '测' } as CharacterProfile;

    async function seed(charId: string, rows: { content: string; timestamp: number; metadata?: Message['metadata'] }[]) {
        const ids: number[] = [];
        for (const row of rows) {
            const id = await DB.saveMessage({
                charId,
                role: 'assistant',
                type: 'text',
                content: row.content,
                timestamp: row.timestamp,
                metadata: row.metadata,
            });
            ids.push(id);
        }
        return ids;
    }

    async function contents(charId: string) {
        const timeline = await DB.listChatTimeline(charId);
        const rows: Message[] = [];
        for (const item of timeline) {
            const row = await DB.getMessageById(item.id);
            if (row) rows.push(row);
        }
        return rows;
    }

    async function originalsOf(charId: string, ids: number[]) {
        const rows: Message[] = [];
        for (const id of ids) {
            const row = await DB.getMessageById(id);
            if (row) rows.push(row);
        }
        return rows.sort(compareChatMessages);
    }

    it('改两条时各自留在原位，中间没选的不动', async () => {
        const charId = `${char.id}-keep`;
        const [id1, id2, id3, id4, id5] = await seed(charId, [
            { content: '甲', timestamp: 1000 },
            { content: '乙', timestamp: 2000, metadata: { replyTo: undefined, note: 'keep' } as Message['metadata'] },
            { content: '丙', timestamp: 3000 },
            { content: '丁', timestamp: 4000 },
            { content: '戊', timestamp: 5000 },
        ]);
        const originals = await originalsOf(charId, [id2, id4]);
        await commitRepairParts({
            char: { ...char, id: charId },
            emojis: [],
            categories: [],
            originals,
            parts: [
                { id: id2, source: '乙修好' },
                { id: id4, source: '丁修好' },
            ],
        });
        const rows = await contents(charId);
        expect(rows.map(row => row.id)).toEqual([id1, id2, id3, id4, id5]);
        expect(rows.map(row => row.content)).toEqual(['甲', '乙修好', '丙', '丁修好', '戊']);
        expect(rows[1].metadata?.note).toBe('keep');
    });

    it('删掉后一条时，前面的和中间没选的还在原位', async () => {
        const charId = `${char.id}-del`;
        const [id1, id2, id3, id4, id5] = await seed(charId, [
            { content: '甲', timestamp: 1000 },
            { content: '乙', timestamp: 2000 },
            { content: '丙', timestamp: 3000 },
            { content: '丁', timestamp: 4000 },
            { content: '戊', timestamp: 5000 },
        ]);
        const originals = await originalsOf(charId, [id2, id4]);
        await commitRepairParts({
            char: { ...char, id: charId },
            emojis: [],
            categories: [],
            originals,
            parts: [
                { id: id2, source: '乙还在' },
                { id: id4, source: '' },
            ],
        });
        const rows = await contents(charId);
        expect(rows.map(row => row.id)).toEqual([id1, id2, id3, id5]);
        expect(rows.map(row => row.content)).toEqual(['甲', '乙还在', '丙', '戊']);
    });

    it('一条拆成两行时，多出来的夹在它和下一条中间', async () => {
        const charId = `${char.id}-split`;
        const [id1, id2, id3] = await seed(charId, [
            { content: '甲', timestamp: 1000 },
            { content: '乙', timestamp: 2000 },
            { content: '丙', timestamp: 3000 },
        ]);
        const originals = await originalsOf(charId, [id2]);
        await commitRepairParts({
            char: { ...char, id: charId },
            emojis: [],
            categories: [],
            originals,
            parts: [{ id: id2, source: '第一句\n第二句' }],
        });
        const rows = await contents(charId);
        expect(rows.map(row => row.content)).toEqual(['甲', '第一句', '第二句', '丙']);
        expect(rows[1].id).toBe(id2);
        expect(rows[3].id).toBe(id3);
        expect(rows[2].timestamp).toBeGreaterThan(rows[1].timestamp);
        expect(rows[2].timestamp).toBeLessThan(rows[3].timestamp);
    });

    it('下方新增贴在最后一条选中的后面，不插进选区中间', async () => {
        const charId = `${char.id}-below`;
        const ids = await seed(charId, [
            { content: '甲', timestamp: 1000 },
            { content: '乙', timestamp: 2000 },
            { content: '丙', timestamp: 3000 },
            { content: '丁', timestamp: 4000 },
            { content: '戊', timestamp: 5000 },
        ]);
        const originals = await originalsOf(charId, [ids[1], ids[3]]);
        await commitRepairParts({
            char: { ...char, id: charId },
            emojis: [],
            categories: [],
            originals,
            parts: [
                { id: ids[1], source: '乙' },
                { id: ids[3], source: '丁' },
            ],
            aboveSource: '补在头',
            belowSource: '补在尾',
        });
        const rows = await contents(charId);
        expect(rows.map(row => row.content)).toEqual(['甲', '补在头', '乙', '丙', '丁', '补在尾', '戊']);
    });

    it('时间挤在一起时，新泡仍排在下一条前面，撤销后回到原样', async () => {
        const charId = `${char.id}-tie`;
        const [id1, id2, id3] = await seed(charId, [
            { content: '甲', timestamp: 5000 },
            { content: '乙', timestamp: 5000 },
            { content: '丙', timestamp: 5000 },
        ]);
        const originals = await originalsOf(charId, [id1]);
        await commitRepairParts({
            char: { ...char, id: charId },
            emojis: [],
            categories: [],
            originals,
            parts: [{ id: id1, source: '甲一\n甲二' }],
        });
        const rows = await contents(charId);
        expect(rows.map(row => row.content)).toEqual(['甲一', '甲二', '乙', '丙']);
        expect(rows[0].id).toBe(id1);
        expect(rows[2].id).toBe(id2);
        expect(rows[1].timestamp).toBeLessThan(rows[2].timestamp);

        const undo = loadSullyFormatUndo(charId);
        expect(undo?.kind).toBe('in-place');
        if (!undo) return;
        await applySullyFormatUndo(undo);
        const restored = await contents(charId);
        expect(restored.map(row => row.id)).toEqual([id1, id2, id3]);
        expect(restored.map(row => row.content)).toEqual(['甲', '乙', '丙']);
        expect(restored.every(row => row.timestamp === 5000)).toBe(true);
    });
});
