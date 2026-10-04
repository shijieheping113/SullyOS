import type { Message } from '../types';
import { DB } from './db';
import type { RenderedBubble } from './reprocessChatMessage';

const TTL_MS = 24 * 60 * 60 * 1000;

export type SullyFormatUndoReplace = {
    kind: 'replace';
    charId: string;
    original: Message;
    newIds: number[];
    savedAt: number;
};

export type SullyFormatUndoInsert = {
    kind: 'insert';
    charId: string;
    insertedIds: number[];
    savedAt: number;
};

export type SullyFormatUndoMerge = {
    kind: 'merge';
    charId: string;
    keptOriginal: Message;
    deletedId: number;
    deletedSnapshot: Message;
    newIds: number[];
    savedAt: number;
};

/** 多选合并修格式：锚点 replace + 其余泡删除，撤销须全部还原 */
export type SullyFormatUndoMultiReplace = {
    kind: 'multi-replace';
    charId: string;
    anchorOriginal: Message;
    removedSnapshots: Message[];
    newIds: number[];
    savedAt: number;
};

/** AI 修格式：锚点 replace + 可选上下插泡，一次撤销 */
export type SullyFormatUndoAiRepair = {
    kind: 'ai-repair';
    charId: string;
    anchorOriginal: Message;
    removedSnapshots: Message[];
    replacedNewIds: number[];
    insertedAboveIds: number[];
    insertedBelowIds: number[];
    savedAt: number;
};

/** 每条写回自己原来的位置。撤销时删掉新加的，再把改过的整条放回去。 */
export type SullyFormatUndoInPlace = {
    kind: 'in-place';
    charId: string;
    originals: Message[];
    insertedIds: number[];
    savedAt: number;
};

export type SullyFormatUndoPayload =
    | SullyFormatUndoReplace
    | SullyFormatUndoInsert
    | SullyFormatUndoMerge
    | SullyFormatUndoMultiReplace
    | SullyFormatUndoAiRepair
    | SullyFormatUndoInPlace;

/** @deprecated 兼容旧读取 */
export type SullyFormatUndoPayloadLegacy = {
    charId: string;
    original: Message;
    newIds: number[];
    savedAt: number;
};

function undoKey(charId: string): string {
    return `sully_format_undo_${charId}`;
}

function normalizePayload(raw: unknown): SullyFormatUndoPayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (!o.charId || typeof o.charId !== 'string') return null;
    if (Date.now() - (Number(o.savedAt) || 0) > TTL_MS) return null;
    if (o.kind === 'insert' && Array.isArray(o.insertedIds)) {
        return o as SullyFormatUndoInsert;
    }
    if (o.kind === 'merge' && o.keptOriginal && o.deletedSnapshot) {
        return o as SullyFormatUndoMerge;
    }
    if (o.kind === 'multi-replace' && o.anchorOriginal && Array.isArray(o.removedSnapshots)) {
        return o as SullyFormatUndoMultiReplace;
    }
    if (o.kind === 'ai-repair' && o.anchorOriginal && Array.isArray(o.replacedNewIds)) {
        return o as SullyFormatUndoAiRepair;
    }
    if (o.kind === 'in-place' && Array.isArray(o.originals) && Array.isArray(o.insertedIds)) {
        return o as SullyFormatUndoInPlace;
    }
    if (o.original && Array.isArray(o.newIds)) {
        return {
            kind: 'replace',
            charId: o.charId as string,
            original: o.original as Message,
            newIds: o.newIds as number[],
            savedAt: Number(o.savedAt) || Date.now(),
        };
    }
    return null;
}

export type SullyFormatUndoSaveInput =
    | Omit<SullyFormatUndoReplace, 'savedAt'>
    | Omit<SullyFormatUndoInsert, 'savedAt'>
    | Omit<SullyFormatUndoMerge, 'savedAt'>
    | Omit<SullyFormatUndoMultiReplace, 'savedAt'>
    | Omit<SullyFormatUndoAiRepair, 'savedAt'>
    | Omit<SullyFormatUndoInPlace, 'savedAt'>;

export function saveSullyFormatUndo(payload: SullyFormatUndoSaveInput): void {
    try {
        localStorage.setItem(undoKey(payload.charId), JSON.stringify({
            ...payload,
            savedAt: Date.now(),
        }));
    } catch { /* quota */ }
}

export function loadSullyFormatUndo(charId: string): SullyFormatUndoPayload | null {
    try {
        const raw = localStorage.getItem(undoKey(charId));
        if (!raw) return null;
        const parsed = normalizePayload(JSON.parse(raw));
        if (!parsed) {
            localStorage.removeItem(undoKey(charId));
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function clearSullyFormatUndo(charId: string): void {
    try { localStorage.removeItem(undoKey(charId)); } catch { /* */ }
}

export async function applySullyFormatUndo(payload: SullyFormatUndoPayload): Promise<void> {
    if (payload.kind === 'insert') {
        if (payload.insertedIds.length) await DB.deleteMessages(payload.insertedIds);
    } else if (payload.kind === 'merge') {
        if (payload.newIds.length) await DB.deleteMessages(payload.newIds);
        await DB.putMessagePreserveId(payload.deletedSnapshot);
        await DB.putMessagePreserveId(payload.keptOriginal);
    } else if (payload.kind === 'multi-replace') {
        if (payload.newIds.length) await DB.deleteMessages(payload.newIds);
        await DB.putMessagePreserveId(payload.anchorOriginal);
        for (const snap of payload.removedSnapshots) {
            await DB.putMessagePreserveId(snap);
        }
    } else if (payload.kind === 'ai-repair') {
        const delIds = [
            ...payload.insertedAboveIds,
            ...payload.insertedBelowIds,
            ...payload.replacedNewIds,
        ];
        if (delIds.length) await DB.deleteMessages(delIds);
        await DB.putMessagePreserveId(payload.anchorOriginal);
        for (const snap of payload.removedSnapshots) {
            await DB.putMessagePreserveId(snap);
        }
    } else if (payload.kind === 'in-place') {
        if (payload.insertedIds.length) await DB.deleteMessages(payload.insertedIds);
        for (const snap of payload.originals) {
            await DB.putMessagePreserveId(snap);
        }
    } else {
        if (payload.newIds.length) await DB.deleteMessages(payload.newIds);
        await DB.putMessagePreserveId(payload.original);
    }
    clearSullyFormatUndo(payload.charId);
}

/** 锚点 replace + 删除其余选中泡，并写入可撤销快照 */
export async function saveMergedFormatReplace(
    charId: string,
    anchorId: number,
    bubbles: Array<Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }>,
    removed: Pick<Message, 'id'>[],
): Promise<{ newIds: number[] }> {
    const removedSnapshots: Message[] = [];
    for (const m of removed) {
        const snap = await DB.getMessageById(m.id);
        if (snap) removedSnapshots.push({ ...snap });
    }
    const { newIds, snapshot } = await DB.replaceMessageWithRendered(anchorId, bubbles);
    if (removed.length === 1 && removedSnapshots[0]) {
        await DB.deleteMessage(removed[0].id);
        saveSullyFormatUndo({
            kind: 'merge',
            charId,
            keptOriginal: snapshot,
            deletedId: removed[0].id,
            deletedSnapshot: removedSnapshots[0],
            newIds,
        });
    } else if (removed.length > 1) {
        for (const m of removed) {
            await DB.deleteMessage(m.id);
        }
        saveSullyFormatUndo({
            kind: 'multi-replace',
            charId,
            anchorOriginal: snapshot,
            removedSnapshots,
            newIds,
        });
    } else {
        saveSullyFormatUndo({ kind: 'replace', charId, original: snapshot, newIds });
    }
    return { newIds };
}

/** AI 修格式保存：锚点重渲染 + 可选上下插泡，合并为一条撤销 */
export async function saveAiRepairOutcome(opts: {
    charId: string;
    anchorId: number;
    anchorBubbles: RenderedBubble[];
    removed: Pick<Message, 'id'>[];
    insertAboveBubbles?: RenderedBubble[];
    insertBelowBubbles?: RenderedBubble[];
}): Promise<{ replacedNewIds: number[]; insertedAboveIds: number[]; insertedBelowIds: number[] }> {
    const anchorBefore = await DB.getMessageById(opts.anchorId);
    if (!anchorBefore) throw new Error('anchor missing');

    const removedSnapshots: Message[] = [];
    for (const m of opts.removed) {
        const snap = await DB.getMessageById(m.id);
        if (snap) removedSnapshots.push({ ...snap });
    }

    const { newIds: replacedNewIds } = await DB.replaceMessageWithRendered(opts.anchorId, opts.anchorBubbles);
    for (const m of opts.removed) {
        await DB.deleteMessage(m.id);
    }

    let insertedAboveIds: number[] = [];
    let insertedBelowIds: number[] = [];
    if (opts.insertAboveBubbles?.length) {
        insertedAboveIds = await DB.insertMessagesRelative(opts.anchorId, 'before', opts.insertAboveBubbles);
    }
    if (opts.insertBelowBubbles?.length) {
        insertedBelowIds = await DB.insertMessagesRelative(opts.anchorId, 'after', opts.insertBelowBubbles);
    }

    saveSullyFormatUndo({
        kind: 'ai-repair',
        charId: opts.charId,
        anchorOriginal: anchorBefore,
        removedSnapshots,
        replacedNewIds,
        insertedAboveIds,
        insertedBelowIds,
    });
    return { replacedNewIds, insertedAboveIds, insertedBelowIds };
}
