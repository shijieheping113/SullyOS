/**
 * 电波 OnAir（直播 / 录播 / 陪看）在 IndexedDB 里的读写层。
 *
 * 为什么不再用 localStorage：那边一个网址只有 5MB，而且是一整份 JSON 全量重写，
 * 一场带大背景图的直播就能把它写满，写失败还静默丢数据。
 * 这里是逐条 put，不会互相覆盖，也不会越写越大。
 *
 * 红线：不自己 indexedDB.open，一律走 openDB()（见 utils/blobStore.ts 的注释）。
 */
import { openDB } from './db';
import type {
  LiveStreamSession,
  StreamerChannelProfile,
  VodVideoPost,
} from './liveStreamTypes';

export const STORE_LIVE_CHANNELS = 'live_channels';
export const STORE_LIVE_SESSIONS = 'live_sessions';
export const STORE_LIVE_VODS = 'live_vods';
export const STORE_LIVE_NPC_WATCHES = 'live_npc_watches';
export const STORE_LIVE_KV = 'live_kv';

/** 图片清理（blobGc）要扫的表：直播这些表里也存着 blobref 令牌 */
export const LIVE_REF_SOURCE_STORES = [
  STORE_LIVE_CHANNELS,
  STORE_LIVE_SESSIONS,
  STORE_LIVE_VODS,
  STORE_LIVE_NPC_WATCHES,
  STORE_LIVE_KV,
] as const;

// ==================== 写失败要说出来 ====================

let writeErrorHandler: ((key: string, error: unknown) => void) | null = null;

/** 由 App 注册：写失败时弹提示，不允许只打 console */
export function setLiveStorageWriteErrorHandler(
  handler: ((key: string, error: unknown) => void) | null,
): void {
  writeErrorHandler = handler;
}

function notifyWriteFailed(key: string, error: unknown): void {
  try {
    writeErrorHandler?.(key, error);
  } catch {
    /* 处理器自己出错不能影响写入流程 */
  }
}

const waitTx = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('live stream tx aborted'));
  });

/** 所有写操作走这里：等到事务真正落盘，失败抛出去并通知界面 */
async function runWrite<T>(key: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    notifyWriteFailed(key, e);
    throw e;
  }
}

async function getAllFrom<T>(store: string): Promise<T[]> {
  const db = await openDB();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(((req.result as T[]) || []).slice());
    req.onerror = () => reject(req.error);
  });
}

async function putOne<T>(store: string, value: T): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value as unknown as Record<string, unknown>);
  return waitTx(tx);
}

async function deleteOne(store: string, id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return waitTx(tx);
}

async function getOne<T>(store: string, id: string): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ==================== 频道 ====================

export const liveChannelDb = {
  getAll: () => getAllFrom<StreamerChannelProfile>(STORE_LIVE_CHANNELS),
  put: (row: StreamerChannelProfile) =>
    runWrite(STORE_LIVE_CHANNELS, () => putOne(STORE_LIVE_CHANNELS, row)),
  delete: (id: string) => runWrite(STORE_LIVE_CHANNELS, () => deleteOne(STORE_LIVE_CHANNELS, id)),
};

// ==================== 直播场次 ====================

export const liveSessionDb = {
  getAll: () => getAllFrom<LiveStreamSession>(STORE_LIVE_SESSIONS),
  get: (id: string) => getOne<LiveStreamSession>(STORE_LIVE_SESSIONS, id),
  put: (row: LiveStreamSession) =>
    runWrite(STORE_LIVE_SESSIONS, () => putOne(STORE_LIVE_SESSIONS, row)),
  delete: (id: string) => runWrite(STORE_LIVE_SESSIONS, () => deleteOne(STORE_LIVE_SESSIONS, id)),
};

// ==================== 录播投稿 ====================

export const liveVodDb = {
  getAll: () => getAllFrom<VodVideoPost>(STORE_LIVE_VODS),
  put: (row: VodVideoPost) => runWrite(STORE_LIVE_VODS, () => putOne(STORE_LIVE_VODS, row)),
  delete: (id: string) => runWrite(STORE_LIVE_VODS, () => deleteOne(STORE_LIVE_VODS, id)),
};

// ==================== 陪看 ====================

/**
 * 表里存的是陪看自己的会话记录（也留着早年那些旧形状的记录）。
 * 形状由陪看模块负责归一，这一层只做整表读写，不认识里面的字段。
 */
export const liveNpcWatchDb = {
  getAll: () => getAllFrom<any>(STORE_LIVE_NPC_WATCHES),
  put: (row: { id: string }) =>
    runWrite(STORE_LIVE_NPC_WATCHES, () => putOne(STORE_LIVE_NPC_WATCHES, row)),
  delete: (id: string) =>
    runWrite(STORE_LIVE_NPC_WATCHES, () => deleteOne(STORE_LIVE_NPC_WATCHES, id)),
};

// ==================== 杂项（马甲 / NPC 池 / 规则 / 迁移标记）====================

export interface LiveKvRow {
  id: string;
  value: unknown;
}

export const liveKvDb = {
  get: async <T = unknown>(id: string): Promise<T | undefined> => {
    const row = await getOne<LiveKvRow>(STORE_LIVE_KV, id);
    return row ? (row.value as T) : undefined;
  },
  put: (id: string, value: unknown) =>
    runWrite(STORE_LIVE_KV, () => putOne<LiveKvRow>(STORE_LIVE_KV, { id, value })),
  delete: (id: string) => runWrite(STORE_LIVE_KV, () => deleteOne(STORE_LIVE_KV, id)),
};
