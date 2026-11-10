import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import {
    buildDateResumeState,
    dateMessagesInContext,
    parseDateDialogueForResume,
    resolveDateContinueFromContext,
} from './dateContinue';

const msg = (partial: Partial<Message> & Pick<Message, 'id' | 'role' | 'content'>): Message => ({
    charId: 'c',
    type: 'text',
    timestamp: partial.timestamp ?? partial.id,
    ...partial,
});

describe('dateMessagesInContext', () => {
    it('只保留非群聊且 source=date 的消息', () => {
        const rows = [
            msg({ id: 1, role: 'user', content: '私聊', metadata: {} }),
            msg({ id: 2, role: 'assistant', content: '见面', metadata: { source: 'date', dateEncounterId: 'e1' } }),
            msg({ id: 3, role: 'assistant', content: '群', groupId: 'g', metadata: { source: 'date' } }),
            msg({ id: 4, role: 'assistant', content: '通话', metadata: { source: 'call' } }),
        ];
        expect(dateMessagesInContext(rows).map(m => m.id)).toEqual([2]);
    });
});

describe('parseDateDialogueForResume / buildDateResumeState', () => {
    it('停在末句并清空队列，带上末句情绪', () => {
        const state = buildDateResumeState(msg({
            id: 9,
            role: 'assistant',
            content: '[happy] 抬眼。\n[shy] "你来了。"',
            timestamp: 99,
            metadata: { source: 'date' },
        }));
        expect(state.dialogueBatch).toHaveLength(2);
        expect(state.dialogueQueue).toEqual([]);
        expect(state.currentText).toBe('"你来了。"');
        expect(state.currentSpriteKey).toBe('shy');
        expect(state.isNovelMode).toBe(false);
        expect(state.peekStatus).toBe('');
    });

    it('无标签散文也铺成末句', () => {
        const items = parseDateDialogueForResume('他坐在窗边。\n风很轻。');
        expect(items.map(i => i.text)).toEqual(['他坐在窗边。', '风很轻。']);
        const state = buildDateResumeState(msg({
            id: 1, role: 'assistant', content: '他坐在窗边。\n风很轻。', metadata: { source: 'date' },
        }));
        expect(state.currentText).toBe('风很轻。');
    });
});

describe('resolveDateContinueFromContext', () => {
    it('范围内没有见面记录时返回 null', () => {
        expect(resolveDateContinueFromContext([
            msg({ id: 1, role: 'user', content: 'hi' }),
        ])).toBeNull();
    });

    it('有场次号时沿用最近一场并铺末条助手回复', () => {
        const plan = resolveDateContinueFromContext([
            msg({ id: 1, role: 'assistant', content: '[normal] 旧场', metadata: { source: 'date', dateEncounterId: 'old' } }),
            msg({ id: 2, role: 'user', content: '嗨', metadata: { source: 'date', dateEncounterId: 'new' } }),
            msg({ id: 3, role: 'assistant', content: '[happy] "还在。"', metadata: { source: 'date', dateEncounterId: 'new' } }),
            msg({ id: 4, role: 'user', content: '私聊不参与' }),
        ]);
        expect(plan).not.toBeNull();
        expect(plan!.encounterId).toBe('new');
        expect(plan!.initialState.currentText).toBe('"还在。"');
        expect(plan!.initialState.currentSpriteKey).toBe('happy');
        expect(plan!.initialState.dialogueQueue).toEqual([]);
        expect(plan!.lastAssistant?.id).toBe(3);
    });

    it('旧数据没有场次号时仍可续，但不带 encounterId', () => {
        const plan = resolveDateContinueFromContext([
            msg({
                id: 1, role: 'assistant', content: '开场', timestamp: 10,
                metadata: { source: 'date', isOpening: true },
            }),
            msg({
                id: 2, role: 'assistant', content: '[normal] 末句', timestamp: 20,
                metadata: { source: 'date' },
            }),
        ]);
        expect(plan).not.toBeNull();
        expect(plan!.encounterId).toBeUndefined();
        expect(plan!.initialState.currentText).toBe('末句');
    });

    it('只看传入的上下文，范围外的见面不参与', () => {
        // 调用方若已裁掉旧见面，这里自然看不到
        const inRange = [
            msg({ id: 10, role: 'user', content: '最近私聊' }),
        ];
        expect(resolveDateContinueFromContext(inRange)).toBeNull();
        expect(resolveDateContinueFromContext([
            ...inRange,
            msg({ id: 11, role: 'assistant', content: '[normal] 还在范围内', metadata: { source: 'date', dateEncounterId: 'e' } }),
        ])?.encounterId).toBe('e');
    });
});
