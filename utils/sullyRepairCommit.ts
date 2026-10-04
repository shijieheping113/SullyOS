import type { CharacterProfile, Emoji, EmojiCategory, Message } from '../types';
import { sortChatMessages } from './chatMessageOrder';
import { DB } from './db';
import { reprocessSourceToBubbles, type RenderedBubble } from './reprocessChatMessage';
import {
    planRepairPlacement,
    type MarkedBubblePart,
    type RepairPiece,
} from './sullyRepairPlace';
import { saveSullyFormatUndo } from './sullyFormatUndo';

/**
 * 这次要写回的原消息。
 * 多选第一次保存用选中的那几条。重新编辑时选中集合已经清掉，就按稿子里的编号，从当前聊天里把还在的几条找回来。
 */
export function messagesForRepairSave(
    picks: Message[],
    anchor: Message,
    parts: { id: number | 'new' }[],
    loaded: Message[],
): Message[] {
    const base = picks.length > 0 ? picks : [anchor];
    const wanted = new Set(parts.flatMap(part => (typeof part.id === 'number' ? [part.id] : [])));
    const have = new Set(base.map(msg => msg.id));
    const extra = loaded.filter(msg => wanted.has(msg.id) && !have.has(msg.id) && !msg.groupId);
    return sortChatMessages([...base, ...extra]);
}

function renderSource(opts: {
    char: CharacterProfile;
    emojis: Emoji[];
    categories: EmojiCategory[];
    source: string;
    base: Message | null;
    inherit: boolean;
}): RenderedBubble[] {
    const source = opts.source.trim();
    if (!source) return [];
    const role = opts.base?.role ?? 'assistant';
    const bubbles = reprocessSourceToBubbles({
        char: opts.char,
        emojis: opts.emojis,
        categories: opts.categories,
        source,
        role,
        replyTo: opts.inherit ? opts.base?.replyTo : undefined,
        inheritMetadata: opts.inherit ? opts.base?.metadata : undefined,
    });
    if (bubbles.length) return bubbles;
    return [{
        charId: opts.char.id,
        role,
        type: 'text',
        content: source,
        replyTo: opts.inherit ? opts.base?.replyTo : undefined,
        metadata: opts.inherit && opts.base?.metadata ? { ...opts.base.metadata } : undefined,
    }];
}

function snapshotMessage(msg: Message): Message {
    return {
        ...msg,
        metadata: msg.metadata ? { ...msg.metadata } : undefined,
    };
}

/** 按「每条回自己的位置」落库，并记下可以一次撤回的快照。 */
export async function commitRepairParts(opts: {
    char: CharacterProfile;
    emojis: Emoji[];
    categories: EmojiCategory[];
    originals: Message[];
    parts: MarkedBubblePart[];
    aboveSource?: string;
    belowSource?: string;
}): Promise<void> {
    const originals = opts.originals.filter(msg => !msg.groupId);
    if (!originals.length) return;
    const anchor = originals[0];
    const byId = new Map(originals.map(msg => [msg.id, msg]));
    const render = (source: string, base: Message | null, inherit: boolean) => renderSource({
        char: opts.char,
        emojis: opts.emojis,
        categories: opts.categories,
        source,
        base,
        inherit,
    });

    const pieces: RepairPiece[] = [];
    for (const part of opts.parts) {
        if (part.id === 'new') {
            const bubbles = render(part.source, anchor, false);
            if (bubbles.length) pieces.push({ kind: 'new', bubbles });
            continue;
        }
        const msg = byId.get(part.id) ?? null;
        if (!msg) continue;
        pieces.push({ kind: 'slot', id: part.id, bubbles: render(part.source, msg, true) });
    }

    const timeline = await DB.listChatTimeline(opts.char.id);
    const ops = planRepairPlacement({
        timeline,
        originals: originals.map(msg => ({ id: msg.id, timestamp: msg.timestamp })),
        pieces,
        above: opts.aboveSource ? render(opts.aboveSource, anchor, false) : [],
        below: opts.belowSource ? render(opts.belowSource, anchor, false) : [],
    });

    const touchIds = new Set<number>();
    for (const op of ops) {
        if (op.op === 'replace' || op.op === 'delete' || op.op === 'shift') touchIds.add(op.id);
    }
    const snapshots: Message[] = [];
    for (const id of touchIds) {
        const msg = await DB.getMessageById(id);
        if (msg) snapshots.push(snapshotMessage(msg));
    }
    const snapById = new Map(snapshots.map(msg => [msg.id, msg]));
    const shiftedTs = new Map<number, number>();
    for (const op of ops) {
        if (op.op === 'shift') shiftedTs.set(op.id, op.timestamp);
    }
    const replacedIds = new Set(ops.filter(op => op.op === 'replace').map(op => op.id));

    for (const op of ops) {
        if (op.op !== 'shift' || replacedIds.has(op.id)) continue;
        const msg = snapById.get(op.id);
        if (!msg) continue;
        await DB.putMessagePreserveId({ ...msg, timestamp: op.timestamp });
    }
    for (const op of ops) {
        if (op.op !== 'replace') continue;
        const msg = snapById.get(op.id);
        if (!msg) continue;
        await DB.putMessagePreserveId({
            ...msg,
            role: op.bubble.role ?? msg.role,
            type: op.bubble.type,
            content: op.bubble.content,
            metadata: op.bubble.metadata ?? msg.metadata,
            replyTo: op.bubble.replyTo ?? msg.replyTo,
            timestamp: shiftedTs.get(op.id) ?? msg.timestamp,
            id: msg.id,
        });
    }
    const deleteIds = ops.filter(op => op.op === 'delete').map(op => op.id);
    if (deleteIds.length) await DB.deleteMessages(deleteIds);

    const insertedIds: number[] = [];
    for (const op of ops) {
        if (op.op !== 'insert') continue;
        const id = await DB.saveMessage({
            charId: op.bubble.charId || opts.char.id,
            groupId: anchor.groupId,
            role: op.bubble.role ?? anchor.role,
            type: op.bubble.type,
            content: op.bubble.content,
            metadata: op.bubble.metadata,
            replyTo: op.bubble.replyTo,
            timestamp: op.timestamp,
        });
        insertedIds.push(id);
    }

    saveSullyFormatUndo({
        kind: 'in-place',
        charId: opts.char.id,
        originals: snapshots,
        insertedIds,
    });
}
