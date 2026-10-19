/**
 * 二改（Ann fork）全量备份扩展：作者主线 exportSystem / importFullData 之外的登记层。
 * 字段名刻意避开 vectorMemories / extraLocalStorageConfig（第三方备份拦截名单）。
 */
import { DB, openDB } from './db';
import type { FullBackupData } from '../types';
import {
    STORE_MIAOMIAO_MESSAGES,
    STORE_MIAOMIAO_SESSIONS,
    STORE_MIAOMIAO_SETTINGS,
} from '../apps/miaomiaoBox/miaomiaoBoxDb';

export const FORK_CUSTOM_ID = 'ann-lily';
export const FORK_BACKUP_VERSION = 1;

/** Spark：仅存 localStorage、作者全量备份未单独登记的二改配置 */
export const FORK_SPARK_LOCAL_KEYS = [
    'spark_circles',
    'spark_active_circle',
    'spark_tracked_posts',
    'spark_private_chat_off',
    'spark_moments_post_on',
    'spark_reply_watermarks',
    'spark_api_preset_id',
] as const;

/** 喵喵盒：widget 位置 / 主题等本机偏好（不进 IDB） */
export const FORK_MIAOMIAO_LOCAL_KEYS = [
    'miaomiao-box-theme',
    'miaomiao-box-pos',
    'miaomiao-box-widget-pos',
    'miaomiao-voice-seq',
] as const;

export type ForkBackupLayer = Pick<
    FullBackupData,
    | 'customFork'
    | 'forkBackupVersion'
    | 'miaomiaoSessions'
    | 'miaomiaoMessages'
    | 'miaomiaoSettings'
    | 'forkSparkLocal'
    | 'forkMiaomiaoLocal'
    | 'forkSparkAssets'
    | 'liveChannels'
    | 'liveSessions'
    | 'liveVods'
    | 'liveNpcWatches'
    | 'liveKv'
>;

export function isForkBackupData(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const record = data as Record<string, unknown>;
    return record.customFork === FORK_CUSTOM_ID
        && record.forkBackupVersion === FORK_BACKUP_VERSION;
}

function readLocalStorageMap(keys: readonly string[]): Record<string, string> {
    const out: Record<string, string> = {};
    if (typeof localStorage === 'undefined') return out;
    for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value != null) out[key] = value;
    }
    return out;
}

function writeLocalStorageMap(map: Record<string, string> | undefined): void {
    if (!map || typeof localStorage === 'undefined') return;
    for (const [key, value] of Object.entries(map)) {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* ignore quota */
        }
    }
}

/** 收集二改层字段（在完整 backupData 上 Object.assign，再走 writeV2Backup） */
export async function collectForkBackupLayer(): Promise<ForkBackupLayer> {
    const [
        miaomiaoSessions,
        miaomiaoMessages,
        miaomiaoSettings,
        liveChannels,
        liveSessions,
        liveVods,
        liveNpcWatches,
        liveKv,
    ] = await Promise.all([
        DB.getRawStoreData(STORE_MIAOMIAO_SESSIONS),
        DB.getRawStoreData(STORE_MIAOMIAO_MESSAGES),
        DB.getRawStoreData(STORE_MIAOMIAO_SETTINGS),
        DB.getRawStoreData(STORE_LIVE_CHANNELS),
        DB.getRawStoreData(STORE_LIVE_SESSIONS),
        DB.getRawStoreData(STORE_LIVE_VODS),
        DB.getRawStoreData(STORE_LIVE_NPC_WATCHES),
        DB.getRawStoreData(STORE_LIVE_KV),
    ]);

    const forkSparkAssets: { id: string; data: string }[] = [];
    const allAssets = await DB.getAllAssets();
    if (Array.isArray(allAssets)) {
        for (const asset of allAssets) {
            if (!asset?.id || typeof asset.data !== 'string') continue;
            if (asset.id.startsWith('spark_img_')) {
                forkSparkAssets.push({ id: asset.id, data: asset.data });
            }
        }
    }

    return {
        customFork: FORK_CUSTOM_ID,
        forkBackupVersion: FORK_BACKUP_VERSION,
        miaomiaoSessions,
        miaomiaoMessages,
        miaomiaoSettings,
        forkSparkLocal: readLocalStorageMap(FORK_SPARK_LOCAL_KEYS),
        forkMiaomiaoLocal: readLocalStorageMap(FORK_MIAOMIAO_LOCAL_KEYS),
        forkSparkAssets,
        liveChannels,
        liveSessions,
        liveVods,
        liveNpcWatches,
        liveKv,
    };
}

export interface RestoreForkBackupOptions {
    /** 作者包进二改导入：默认 false，不清空已有二改库 */
    replaceForkStoresOnAuthorPackage?: boolean;
}

/**
 * 恢复二改层（在 importFullData 之后调用）。
 * 二改全量包：miaomiao 已在 importFullData 里 clear-and-add。
 * 作者包 + 二改导入口：仅当用户勾选覆盖时才清空并跳过（包内无二改字段）。
 */
export async function restoreForkBackupLayer(
    data: FullBackupData,
    options: RestoreForkBackupOptions = {},
): Promise<{ restoredForkLayer: boolean; skippedForkLayer: boolean }> {
    const isFork = isForkBackupData(data);
    const hasForkPayload = isFork
        || data.miaomiaoSessions !== undefined
        || data.miaomiaoMessages !== undefined
        || data.miaomiaoSettings !== undefined
        || data.forkSparkLocal !== undefined
        || data.forkMiaomiaoLocal !== undefined
        || (data.forkSparkAssets?.length ?? 0) > 0
        || data.liveChannels !== undefined
        || data.liveSessions !== undefined
        || data.liveVods !== undefined
        || data.liveNpcWatches !== undefined
        || data.liveKv !== undefined;

    if (!hasForkPayload) {
        return { restoredForkLayer: false, skippedForkLayer: false };
    }

    if (!isFork && !options.replaceForkStoresOnAuthorPackage) {
        return { restoredForkLayer: false, skippedForkLayer: true };
    }

    if (data.forkSparkLocal) writeLocalStorageMap(data.forkSparkLocal);
    if (data.forkMiaomiaoLocal) writeLocalStorageMap(data.forkMiaomiaoLocal);

    // 电波：整表替换（包里有这一层才动，没有就不碰本机现有直播数据）
    await replaceStoreIfPresent(STORE_LIVE_CHANNELS, data.liveChannels);
    await replaceStoreIfPresent(STORE_LIVE_SESSIONS, data.liveSessions);
    await replaceStoreIfPresent(STORE_LIVE_VODS, data.liveVods);
    await replaceStoreIfPresent(STORE_LIVE_NPC_WATCHES, data.liveNpcWatches);
    await replaceStoreIfPresent(STORE_LIVE_KV, data.liveKv);

    return { restoredForkLayer: true, skippedForkLayer: false };
}

const STORE_LIVE_CHANNELS = 'live_channels';
const STORE_LIVE_SESSIONS = 'live_sessions';
const STORE_LIVE_VODS = 'live_vods';
const STORE_LIVE_NPC_WATCHES = 'live_npc_watches';
const STORE_LIVE_KV = 'live_kv';

/** 包里带了这个 store 才整表替换，没带就不动本机现有数据 */
async function replaceStoreIfPresent(storeName: string, rows: unknown[] | undefined): Promise<void> {
    if (rows === undefined) return;
    const db = await openDB();
    if (!db.objectStoreNames.contains(storeName)) return;
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        for (const row of rows) {
            if (row && typeof row === 'object') store.put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('replace fork store aborted'));
    });
}

export const FORK_BACKUP_AUTHOR_IMPORT_HINT =
    '这是二改全量备份包，请使用设置里的「导入二改全量备份」，不要用上方的「导入备份」。';

/** 作者包 + 二改导入且勾选覆盖：先清空二改 IndexedDB / localStorage / spark 发帖图 */
async function clearIndexedDbStore(storeName: string): Promise<void> {
    const db = await openDB();
    if (!db.objectStoreNames.contains(storeName)) return;
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearForkBackupStores(): Promise<void> {
    for (const storeName of [
        STORE_MIAOMIAO_SESSIONS,
        STORE_MIAOMIAO_MESSAGES,
        STORE_MIAOMIAO_SETTINGS,
        STORE_LIVE_CHANNELS,
        STORE_LIVE_SESSIONS,
        STORE_LIVE_VODS,
        STORE_LIVE_NPC_WATCHES,
        STORE_LIVE_KV,
    ]) {
        await clearIndexedDbStore(storeName);
    }
    if (typeof localStorage !== 'undefined') {
        for (const key of [...FORK_SPARK_LOCAL_KEYS, ...FORK_MIAOMIAO_LOCAL_KEYS]) {
            localStorage.removeItem(key);
        }
    }
    const assets = await DB.getAllAssets();
    if (Array.isArray(assets)) {
        for (const asset of assets) {
            if (asset?.id?.startsWith('spark_img_')) {
                await DB.deleteAsset(asset.id);
            }
        }
    }
}
