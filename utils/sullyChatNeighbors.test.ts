import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import {
    getChatNeighbors,
    mergeMessageSources,
    mergeMessagesToEditSource,
    mergeNeighborMessagesToBubbles,
    pickBatchRepairAnchor,
} from './sullyChatNeighbors';
import type { CharacterProfile } from '../types';

describe('sullyChatNeighbors', () => {
    const base: Message[] = [
        { id: 1, charId: 'c', role: 'assistant', type: 'text', content: 'a', timestamp: 100 },
        { id: 2, charId: 'c', role: 'assistant', type: 'text', content: 'b', timestamp: 200 },
        { id: 3, charId: 'c', role: 'assistant', type: 'text', content: 'c', timestamp: 300 },
    ];

    it('getChatNeighbors 返回前后邻居', () => {
        const n = getChatNeighbors(base, 2);
        expect(n.prev?.id).toBe(1);
        expect(n.next?.id).toBe(3);
    });

    it('mergeMessageSources 按时间序拼接', () => {
        const m1 = base[0];
        const m2 = base[1];
        expect(mergeMessageSources(m2, m1, [])).toBe('a\nb');
    });

    it('mergeMessagesToEditSource 多选按时间序拼接', () => {
        expect(mergeMessagesToEditSource([base[1], base[0]], [])).toBe('a\nb');
    });

    it('pickBatchRepairAnchor 取最早一条', () => {
        expect(pickBatchRepairAnchor([base[2], base[0]])?.id).toBe(1);
    });

    it('mergeNeighborMessagesToBubbles 两段文字并成一条', () => {
        const char = { id: 'c', name: 'x' } as CharacterProfile;
        const bubbles = mergeNeighborMessagesToBubbles(base[0], base[1], {
            char,
            emojis: [],
            categories: [],
            kept: base[0],
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content).toBe('a\nb');
    });
});
