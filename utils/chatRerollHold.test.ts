import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import { canRerollGameTurn, rerollTrailingAiGames } from './chatGames/reroll';
import { buildHoldFromDeleteIds, filterHeldMessages } from './chatRerollHold';

const message = (partial: Partial<Message> & Pick<Message, 'id' | 'role' | 'type' | 'content'>): Message => ({
    charId: 'c1',
    timestamp: partial.timestamp ?? partial.id,
    ...partial,
} as Message);

describe('chatRerollHold', () => {
    it('按 deleteIds 建 hold，并保留完整快照', () => {
        const user = message({ id: 1, role: 'user', type: 'text', content: '嗨', timestamp: 1 });
        const a = message({ id: 2, role: 'assistant', type: 'text', content: '你好', timestamp: 2 });
        const b = message({
            id: 3,
            role: 'assistant',
            type: 'score_card',
            content: '掷出了 4',
            timestamp: 3,
            metadata: { chatGame: { game: 'dice', by: 'ai', value: 4 } },
        });
        const hold = buildHoldFromDeleteIds([user, a, b], [2, 3], 'c1');
        expect(hold.charId).toBe('c1');
        expect(hold.heldIds).toEqual([2, 3]);
        expect(hold.snapshots.map(row => row.content)).toEqual(['你好', '掷出了 4']);
        expect(hold.snapshots[1].metadata?.chatGame?.value).toBe(4);
    });

    it('缺 id 时跳过，不硬塞空位', () => {
        const a = message({ id: 2, role: 'assistant', type: 'text', content: '在', timestamp: 2 });
        const hold = buildHoldFromDeleteIds([a], [2, 99], 'c1');
        expect(hold.heldIds).toEqual([2]);
        expect(hold.snapshots).toHaveLength(1);
    });

    it('filterHeldMessages 能按 hold 或额外 id 剔除', () => {
        const rows = [
            message({ id: 1, role: 'user', type: 'text', content: 'a', timestamp: 1 }),
            message({ id: 2, role: 'assistant', type: 'text', content: 'b', timestamp: 2 }),
            message({ id: 3, role: 'assistant', type: 'text', content: 'c', timestamp: 3 }),
        ];
        const hold = buildHoldFromDeleteIds(rows, [2, 3], 'c1');
        expect(filterHeldMessages(rows, hold).map(row => row.id)).toEqual([1]);
        expect(filterHeldMessages(rows, null, [2]).map(row => row.id)).toEqual([1, 3]);
        expect(filterHeldMessages(rows, null)).toEqual(rows);
        expect(filterHeldMessages([], hold)).toEqual([]);
    });

    it('接上 rerollTrailingAiGames：算出的 deleteIds 可建 hold，过滤后不含它们；直播卡不进 hold', async () => {
        const user = message({ id: 1, role: 'user', type: 'text', content: '在吗', timestamp: 1 });
        const reply = message({ id: 2, role: 'assistant', type: 'text', content: '在', timestamp: 2 });
        const liveRound = message({
            id: 3,
            role: 'assistant',
            type: 'score_card',
            content: '{"type":"livestream_card","cardKind":"live_round"}',
            timestamp: 3,
            metadata: { source: 'live_round', liveSessionId: 's1' },
        });
        const list = [user, reply, liveRound];
        expect(canRerollGameTurn(list)).toBe(true);
        const outcome = await rerollTrailingAiGames(list);
        expect(outcome.deleteIds).toEqual([2]);
        const hold = buildHoldFromDeleteIds(list, outcome.deleteIds, 'c1');
        expect(hold.heldIds).toEqual([2]);
        expect(hold.heldIds).not.toContain(3);
        expect(filterHeldMessages(list, hold).map(row => row.id)).toEqual([1, 3]);
    });
});
