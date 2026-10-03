// 单角色搬家。不走整机备份，也不改那两条导入导出。
// 导出一只角色，导入时整只换到本机已有的另一只身上：编号留在本机，内容换成包里的。
import JSZip from 'jszip';
import { DB, openDB } from './db';
import { getBlobForRef, restoreBlobRef } from './blobRef';
import type { CharacterProfile, Message, Worldbook } from '../types';

export const CHARACTER_BUNDLE_TYPE = 'sully_character_bundle';
export const CHARACTER_BUNDLE_VERSION = 1;

const CHAR_SCOPED_STORES = [
    'scheduled_messages',
    'gallery',
    'diaries',
    'room_notes',
    'memory_nodes',
    'memory_vectors',
    'memory_batches',
    'topic_boxes',
    'anticipations',
    'event_boxes',
    'room_plates',
    'digest_reports',
    'pixel_home_layouts',
    'miaomiao_sessions',
    'miaomiao_messages',
    'miaomiao_settings',
] as const;

export interface CharacterBundle {
    type: typeof CHARACTER_BUNDLE_TYPE;
    version: typeof CHARACTER_BUNDLE_VERSION;
    exportedAt: number;
    sourceCharacterId: string;
    character: CharacterProfile;
    privateMessages: Message[];
    stores: Record<string, unknown[]>;
    memoryLinks: unknown[];
    worldbooks: Worldbook[];
}

const idbReq = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

const isPrivateMessage = (message: Message): boolean => !message.groupId;

export function buildReplacementProfile(source: CharacterProfile, target: CharacterProfile): CharacterProfile {
    return {
        ...source,
        id: target.id,
        groupId: target.groupId,
    };
}

export function remapMemoryMessageIds(records: unknown[], idMap: Map<number, number>): unknown[] {
    return records.map(record => {
        if (!record || typeof record !== 'object') return record;
        const node = record as { relativeTimeAnchor?: { messageId?: number } };
        const messageId = node.relativeTimeAnchor?.messageId;
        if (typeof messageId !== 'number' || !idMap.has(messageId)) return record;
        return {
            ...node,
            relativeTimeAnchor: { ...node.relativeTimeAnchor, messageId: idMap.get(messageId) },
        };
    });
}

function collectBlobRefs(value: unknown, out: Set<string>): void {
    if (typeof value === 'string') {
        if (value.startsWith('blobref:')) out.add(value);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectBlobRefs(item, out));
        return;
    }
    if (value && typeof value === 'object') {
        Object.values(value).forEach(item => collectBlobRefs(item, out));
    }
}

async function rowsByChar(db: IDBDatabase, storeName: string, charId: string): Promise<unknown[]> {
    if (!db.objectStoreNames.contains(storeName)) return [];
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    if (!store.indexNames.contains('charId')) return [];
    const rows = await idbReq(store.index('charId').getAll(charId));
    return rows || [];
}

function rewriteCharId<T>(rows: T[], charId: string): T[] {
    return rows.map(row => {
        if (!row || typeof row !== 'object') return row;
        return { ...(row as object), charId } as T;
    });
}

async function deleteByChar(store: IDBObjectStore, charId: string, keep?: (row: any) => boolean): Promise<void> {
    if (!store.indexNames.contains('charId')) return;
    await new Promise<void>((resolve, reject) => {
        const cursorReq = store.index('charId').openCursor(IDBKeyRange.only(charId));
        cursorReq.onerror = () => reject(cursorReq.error);
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) { resolve(); return; }
            if (!keep || !keep(cursor.value)) cursor.delete();
            cursor.continue();
        };
    });
}

export async function exportCharacterBundle(charId: string): Promise<{ blob: Blob; fileName: string }> {
    const character = await DB.getCharacter(charId);
    if (!character) throw new Error('找不到这只角色');
    const db = await openDB();
    const messages = (await rowsByChar(db, 'messages', charId) as Message[]).filter(isPrivateMessage);
    const stores: Record<string, unknown[]> = {};
    for (const name of CHAR_SCOPED_STORES) {
        stores[name] = await rowsByChar(db, name, charId);
    }
    const nodeIds = new Set((stores.memory_nodes as { id?: string }[]).map(node => node.id).filter((id): id is string => !!id));
    const memoryLinks = await linksAmong(db, nodeIds);
    const mountedIds = new Set((character.mountedWorldbooks || []).map(book => book.id));
    const worldbooks: Worldbook[] = [];
    if (mountedIds.size > 0 && db.objectStoreNames.contains('worldbooks')) {
        const library = await idbReq(db.transaction('worldbooks', 'readonly').objectStore('worldbooks').getAll()) as Worldbook[];
        worldbooks.push(...library.filter(book => mountedIds.has(book.id)));
    }
    const bundle: CharacterBundle = {
        type: CHARACTER_BUNDLE_TYPE,
        version: CHARACTER_BUNDLE_VERSION,
        exportedAt: Date.now(),
        sourceCharacterId: character.id,
        character,
        privateMessages: messages,
        stores,
        memoryLinks,
        worldbooks,
    };
    const zip = new JSZip();
    zip.file('bundle.json', JSON.stringify(bundle));
    const refs = new Set<string>();
    collectBlobRefs(bundle, refs);
    for (const ref of refs) {
        const blob = await getBlobForRef(ref);
        if (!blob) continue;
        zip.file(`blobs/${ref.slice('blobref:'.length)}`, blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const safeName = (character.name || '角色').replace(/[\\/:*?"<>|]/g, ' ').trim() || '角色';
    return { blob, fileName: `${safeName}-单角色.zip` };
}

async function linksAmong(db: IDBDatabase, nodeIds: Set<string>): Promise<unknown[]> {
    if (!db.objectStoreNames.contains('memory_links') || nodeIds.size === 0) return [];
    const rows = await idbReq(db.transaction('memory_links', 'readonly').objectStore('memory_links').getAll()) as { id: string; sourceId?: string; targetId?: string }[];
    return rows.filter(row => !!row.sourceId && !!row.targetId && nodeIds.has(row.sourceId) && nodeIds.has(row.targetId));
}

export async function readCharacterBundle(file: Blob): Promise<CharacterBundle> {
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
        throw new Error('这不是单角色包');
    }
    const entry = zip.file('bundle.json');
    if (!entry) throw new Error('这不是单角色包');
    const bundle = JSON.parse(await entry.async('string')) as CharacterBundle;
    if (bundle?.type !== CHARACTER_BUNDLE_TYPE || bundle.version !== CHARACTER_BUNDLE_VERSION || !bundle.character?.id) {
        throw new Error('这不是单角色包');
    }
    (bundle as CharacterBundle & { __zip?: JSZip }).__zip = zip;
    return bundle;
}

export async function importCharacterBundle(bundle: CharacterBundle, targetId: string): Promise<{ name: string }> {
    const target = await DB.getCharacter(targetId);
    if (!target) throw new Error('本机没有要换上的那只角色');
    const next = buildReplacementProfile(bundle.character, target);
    const db = await openDB();
    const zip = (bundle as CharacterBundle & { __zip?: JSZip }).__zip;
    const oldNodeIds = new Set((await rowsByChar(db, 'memory_nodes', targetId) as { id?: string }[]).map(node => node.id).filter((id): id is string => !!id));

    const storeNames = ['messages', 'memory_links', 'worldbooks', ...CHAR_SCOPED_STORES].filter(name => db.objectStoreNames.contains(name));
    const tx = db.transaction(storeNames, 'readwrite');
    const idMap = new Map<number, number>();

    if (tx.objectStoreNames.contains('messages')) {
        await deleteByChar(tx.objectStore('messages'), targetId, row => !!row.groupId);
        for (const message of bundle.privateMessages || []) {
            if (message.groupId) continue;
            const { id: oldId, ...rest } = message;
            const added = tx.objectStore('messages').add({ ...rest, charId: targetId });
            const newId = await idbReq(added) as number;
            if (typeof oldId === 'number') idMap.set(oldId, newId);
        }
    }

    for (const name of CHAR_SCOPED_STORES) {
        if (!tx.objectStoreNames.contains(name)) continue;
        const store = tx.objectStore(name);
        await deleteByChar(store, targetId);
        let rows = name === 'memory_nodes'
            ? remapMemoryMessageIds(bundle.stores?.[name] || [], idMap)
            : (bundle.stores?.[name] || []);
        if (name === 'room_plates') {
            rows = rows.map(row => {
                if (!row || typeof row !== 'object') return row;
                const plate = row as { room?: string };
                if (!plate.room) return row;
                return { ...plate, id: `${targetId}:${plate.room}` };
            });
        }
        for (const row of rewriteCharId(rows, targetId)) store.put(row);
    }

    if (tx.objectStoreNames.contains('memory_links')) {
        const linkStore = tx.objectStore('memory_links');
        if (oldNodeIds.size > 0) {
            const existing = await idbReq(linkStore.getAll()) as { id: string; sourceId?: string; targetId?: string }[];
            for (const link of existing) {
                if ((link.sourceId && oldNodeIds.has(link.sourceId)) || (link.targetId && oldNodeIds.has(link.targetId))) {
                    linkStore.delete(link.id);
                }
            }
        }
        for (const link of bundle.memoryLinks || []) linkStore.put(link);
    }

    if (tx.objectStoreNames.contains('worldbooks')) {
        const library = tx.objectStore('worldbooks');
        for (const book of bundle.worldbooks || []) {
            const existing = await idbReq(library.get(book.id));
            if (!existing) library.put(book);
        }
    }

    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('替换没有写完'));
    });

    await DB.saveCharacter(next);
    const maxId = [...idMap.values()].reduce((max, id) => Math.max(max, id), 0);
    try {
        if (maxId > 0) localStorage.setItem(`mp_lastMsgId_${targetId}`, String(maxId));
        else localStorage.removeItem(`mp_lastMsgId_${targetId}`);
    } catch { /* 水位写不进也不挡替换 */ }

    if (zip) {
        const folder = zip.folder('blobs');
        const files = folder ? folder.filter((_path, file) => !file.dir) : [];
        for (const file of files) {
            const token = `blobref:${file.name.split('/').pop()}`;
            try {
                await restoreBlobRef(token, await file.async('blob'));
            } catch { /* 本机已经有同一张图就留着 */ }
        }
    }
    return { name: next.name };
}
