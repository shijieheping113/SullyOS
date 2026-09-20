import type { CharacterProfile, Emoji, EmojiCategory, Message } from '../types';
import { sortChatMessages } from './chatMessageOrder';
import { messageToEditSource } from './sullyMessageSource';
import { reprocessSourceToBubbles, type RenderedBubble } from './reprocessChatMessage';

export function getChatNeighbors(
    messages: Message[],
    anchorId: number,
): { prev: Message | null; next: Message | null; anchor: Message | null } {
    const sorted = sortChatMessages(messages.filter(m => !m.groupId));
    const idx = sorted.findIndex(m => m.id === anchorId);
    if (idx < 0) return { prev: null, next: null, anchor: null };
    return {
        anchor: sorted[idx],
        prev: idx > 0 ? sorted[idx - 1] : null,
        next: idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
}

/** 时间序上较早的一条 id（合并时保留这条做 replace） */
export function mergeMessageSources(
    a: Message,
    b: Message,
    emojis: Emoji[],
): string {
    const [first, second] = a.timestamp <= b.timestamp ? [a, b] : [b, a];
    const s1 = messageToEditSource(first, emojis);
    const s2 = messageToEditSource(second, emojis);
    return [s1, s2].filter(Boolean).join('\n');
}

/** 多选泡按时间序拼成一条可编辑源（同一次修格式任务） */
export function mergeMessagesToEditSource(messages: Message[], emojis: Emoji[]): string {
    const sorted = sortChatMessages(messages.filter(m => !m.groupId));
    return sorted
        .map(m => messageToEditSource(m, emojis))
        .filter(Boolean)
        .join('\n');
}

/** 多选落库时保留最早一条 id 做 replace，其余删除 */
export function pickBatchRepairAnchor(messages: Message[]): Message | null {
    const sorted = sortChatMessages(messages.filter(m => !m.groupId));
    return sorted[0] ?? null;
}

export function earlierMessageId(a: Message, b: Message): number {
    return a.timestamp <= b.timestamp ? a.id : b.id;
}

export function laterMessageId(a: Message, b: Message): number {
    return a.timestamp <= b.timestamp ? b.id : a.id;
}

export type MergeMessagesOpts = {
    char: CharacterProfile;
    emojis: Emoji[];
    categories: EmojiCategory[];
    kept: Message;
};

/** 两条邻泡合并为一条落库用的 bubble 列表（通常 length === 1） */
export function mergeNeighborMessagesToBubbles(
    a: Message,
    b: Message,
    opts: MergeMessagesOpts,
): RenderedBubble[] {
    const [first, second] = a.timestamp <= b.timestamp ? [a, b] : [b, a];
    const { char, emojis, categories, kept } = opts;

    if (first.type === 'text' && second.type === 'text') {
        const joined = [first.content, second.content].map(s => (s || '').trim()).filter(Boolean).join('\n');
        if (!joined) return [];
        return [{
            charId: char.id,
            role: kept.role,
            type: 'text',
            content: joined,
            replyTo: kept.replyTo,
            metadata: kept.metadata ? { ...kept.metadata } : undefined,
        }];
    }

    const source = mergeMessageSources(a, b, emojis);
    return reprocessSourceToBubbles({
        char,
        emojis,
        categories,
        source,
        role: kept.role,
        replyTo: kept.replyTo,
        inheritMetadata: kept.metadata,
        mergeAsSingle: true,
    });
}
