import { DB } from '../db';
import { getChatGamePlugin } from './registry';
import { isChatGameEnabled } from './settings';
import { findAiGameInOpenTurn, plainChatGameClause, readChatGame } from './text';
import type { ChatGameRecord } from './types';

export async function saveUserChatGame(args: {
    charId: string;
    charName: string;
    gameId: string;
    picked?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
    const plugin = getChatGamePlugin(args.gameId);
    if (!plugin || !isChatGameEnabled(plugin.id)) {
        return { ok: false, reason: '这款小游戏关着' };
    }
    let value: number | string;
    if (plugin.choices) {
        const picked = String(args.picked || '');
        if (!plugin.choices.some(choice => choice.value === picked)) {
            return { ok: false, reason: '先选一手' };
        }
        value = picked;
    } else {
        try {
            value = plugin.roll();
        } catch (error) {
            console.warn('[chat-game] 用户这一手摇不了', error);
            return { ok: false, reason: '这一下没摇出来' };
        }
    }
    const recent = await DB.getRecentMessagesByCharId(args.charId, 60, true);
    const pair = findAiGameInOpenTurn(recent, plugin.id);
    const pairRecord = pair ? readChatGame(pair.metadata) : null;
    const record: ChatGameRecord = {
        game: plugin.id,
        by: 'user',
        value,
        ...(pairRecord ? { withAi: pairRecord.value } : {}),
    };
    const clause = plainChatGameClause(record, args.charName);
    if (!clause) return { ok: false, reason: '这一手记不下来' };
    await DB.saveMessage({
        charId: args.charId,
        role: 'user',
        type: 'interaction',
        content: clause,
        metadata: { chatGame: record },
    });
    if (pair && plugin.needUser && pairRecord) {
        const openedClause = plugin.clause(args.charName, pairRecord.value);
        if (openedClause) await DB.updateMessage(pair.id, openedClause);
        await DB.updateMessageMetadata(pair.id, (prev: any) => ({
            ...(prev || {}),
            chatGame: { ...(prev?.chatGame || pairRecord), opened: true },
        }));
    }
    return { ok: true };
}
