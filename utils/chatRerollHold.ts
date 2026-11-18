import type { Message } from '../types';

/** 私聊「重新生成」进行中：旧回复先藏、库里先不删，成功后再真删。 */
export type ChatRerollHold = {
    charId: string;
    heldIds: number[];
    snapshots: Message[];
};

/** 从待删 id 抽出完整快照；顺序跟 deleteIds 一致。缺 id 的跳过。 */
export function buildHoldFromDeleteIds(
    messages: Message[],
    deleteIds: number[],
    charId: string,
): ChatRerollHold {
    const byId = new Map(messages.map(message => [message.id, message]));
    const snapshots: Message[] = [];
    const heldIds: number[] = [];
    for (const id of deleteIds) {
        const row = byId.get(id);
        if (!row) continue;
        snapshots.push(row);
        heldIds.push(id);
    }
    return { charId, heldIds, snapshots };
}

/** 列表展示与发给模型前共用：去掉暂藏的那些 id。 */
export function filterHeldMessages(
    messages: Message[],
    hold: ChatRerollHold | null | undefined,
    excludeMessageIds?: Iterable<number> | null,
): Message[] {
    const skip = new Set<number>();
    if (hold?.heldIds?.length) {
        for (const id of hold.heldIds) skip.add(id);
    }
    if (excludeMessageIds) {
        for (const id of excludeMessageIds) skip.add(id);
    }
    if (!skip.size) return messages;
    return messages.filter(message => !skip.has(message.id));
}
