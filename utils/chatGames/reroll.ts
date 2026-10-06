import type { Message } from '../../types';
import { compareChatMessages } from '../chatMessageOrder';
import type { GameRollResult } from './commit';

/** 重 roll 只对着角色的消息，和普通重新生成一样。最后一条不是角色的，就不能重 roll。 */
export function canRerollGameTurn(messages: Message[]): boolean {
    if (!messages.length) return false;
    const ordered = [...messages].sort(compareChatMessages);
    return ordered[ordered.length - 1].role === 'assistant';
}

export interface RerollTrailingGamesResult {
    deleteIds: number[];
    rolls: GameRollResult[];
    updates: Array<{ id: number; content: string; metadata: any }>;
}

/**
 * 末尾这一串角色消息，游戏卡也算在里面，跟普通消息一样整段拿掉再生成。
 * 碰到用户的消息就停。不改用户那条，也不改已经存下的句子。
 */
export async function rerollTrailingAiGames(messages: Message[]): Promise<RerollTrailingGamesResult> {
    const ordered = [...messages].sort(compareChatMessages);
    const deleteIds: number[] = [];
    for (let index = ordered.length - 1; index >= 0; index--) {
        const current = ordered[index];
        if (current.role === 'user') break;
        if (current.role !== 'assistant') continue;
        deleteIds.push(current.id);
    }
    deleteIds.reverse();
    return { deleteIds, rolls: [], updates: [] };
}
