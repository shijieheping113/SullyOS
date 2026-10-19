import type { Message } from '../../types';
import { compareChatMessages } from '../chatMessageOrder';
import type { GameRollResult } from './commit';

/**
 * 直播/陪看逐轮事件卡。它们是 assistant 卡，但不是私聊回复——
 * 主聊天重 Roll 既不能把它们当成「最新一条回复」，也不能删掉重发。
 * 只认这两个来源，别的 score_card（骰子/猜拳/剧情卡）照旧参与重 Roll。
 */
const LIVE_EVENT_SOURCES = new Set(['live_round', 'live_npc_round']);

export const isLiveEventCardMessage = (message: Message): boolean =>
    LIVE_EVENT_SOURCES.has(String(message.metadata?.source || ''));

/** 重 roll 只对着角色的消息，和普通重新生成一样。末尾若是直播事件卡，要越过它继续往前找。 */
export function canRerollGameTurn(messages: Message[]): boolean {
    if (!messages.length) return false;
    const ordered = [...messages].sort(compareChatMessages);
    for (let index = ordered.length - 1; index >= 0; index--) {
        const current = ordered[index];
        if (isLiveEventCardMessage(current)) continue;
        return current.role === 'assistant';
    }
    return false;
}

export interface RerollTrailingGamesResult {
    deleteIds: number[];
    rolls: GameRollResult[];
    updates: Array<{ id: number; content: string; metadata: any }>;
}

/**
 * 末尾这一串角色消息，游戏卡也算在里面，跟普通消息一样整段拿掉再生成。
 * 碰到用户的消息就停。不改用户那条，也不改已经存下的句子。
 * 直播/陪看轮次卡原位保留：不删、不重建、不清空，位置也留在原处。
 */
export async function rerollTrailingAiGames(messages: Message[]): Promise<RerollTrailingGamesResult> {
    const ordered = [...messages].sort(compareChatMessages);
    const deleteIds: number[] = [];
    for (let index = ordered.length - 1; index >= 0; index--) {
        const current = ordered[index];
        if (current.role === 'user') break;
        if (current.role !== 'assistant') continue;
        if (isLiveEventCardMessage(current)) continue;
        deleteIds.push(current.id);
    }
    deleteIds.reverse();
    return { deleteIds, rolls: [], updates: [] };
}
