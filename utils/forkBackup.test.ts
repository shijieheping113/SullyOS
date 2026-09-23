import { describe, it, expect } from 'vitest';
import { assertSupportedSullyBackup } from './backupImportPolicy';
import { writeV2Backup, assembleV2Backup } from './backupFormat';
import { DB, openDB } from './db';
import {
    FORK_BACKUP_VERSION,
    FORK_CUSTOM_ID,
    isForkBackupData,
    collectForkBackupLayer,
} from './forkBackup';

class FakeZip {
    files = new Map<string, string | Uint8Array>();
    file(name: string): { async(type: 'string'): Promise<string> } | null;
    file(name: string, data: string | Uint8Array): void;
    file(name: string, data?: string | Uint8Array) {
        if (data === undefined) {
            if (!this.files.has(name)) return null;
            return {
                async: async () => (typeof this.files.get(name) === 'string'
                    ? this.files.get(name) as string
                    : new TextDecoder().decode(this.files.get(name) as Uint8Array)),
            };
        }
        this.files.set(name, data);
    }
}

describe('forkBackup', () => {
    it('isForkBackupData 识别 ann-lily 标记', () => {
        expect(isForkBackupData({ customFork: FORK_CUSTOM_ID, forkBackupVersion: FORK_BACKUP_VERSION })).toBe(true);
        expect(isForkBackupData({ customFork: 'other' })).toBe(false);
    });

    it('含 vectorMemories 仍被 assertSupportedSullyBackup 拒绝', () => {
        expect(() => assertSupportedSullyBackup({
            customFork: FORK_CUSTOM_ID,
            forkBackupVersion: FORK_BACKUP_VERSION,
            vectorMemories: [],
        })).toThrow('不支持导入第三方系统备份');
    });

    it('未登记顶层字段组装后 importFullData 可忽略', async () => {
        const zip = new FakeZip();
        const manifest = await writeV2Backup(zip, {
            timestamp: Date.now(),
            version: 3,
            customFork: FORK_CUSTOM_ID,
            forkBackupVersion: FORK_BACKUP_VERSION,
            miaomiaoSessions: [{ id: 's1', charId: 'c1', status: 'playing', createdAt: 1, updatedAt: 1 }],
            forkUnregisteredFutureField: { hello: 'world' },
        }, {
            forkManifest: { customFork: FORK_CUSTOM_ID, forkBackupVersion: FORK_BACKUP_VERSION },
        });
        expect(manifest.customFork).toBe(FORK_CUSTOM_ID);

        const data = await assembleV2Backup(zip, manifest);
        expect((data as any).forkUnregisteredFutureField).toEqual({ hello: 'world' });

        await DB.importFullData(data as any);
        const sessions = await DB.getRawStoreData('miaomiao_sessions');
        expect(sessions.some((s: any) => s.id === 's1')).toBe(true);
        expect((data as any).forkUnregisteredFutureField).toEqual({ hello: 'world' });
    });

    it('角色嵌套字段随 characters put 保留', async () => {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('characters', 'readwrite');
            tx.objectStore('characters').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        const zip = new FakeZip();
        const manifest = await writeV2Backup(zip, {
            timestamp: Date.now(),
            version: 3,
            characters: [{ id: 'c1', name: 'A', forkNestedMarker: 'stay' }],
        });
        const data = await assembleV2Backup(zip, manifest);
        await DB.importFullData(data as any);
        const chars = await DB.getAllCharacters();
        expect(chars.find(c => c.id === 'c1')?.forkNestedMarker).toBe('stay');
    });

    it('collectForkBackupLayer 带上二改标记', async () => {
        const layer = await collectForkBackupLayer();
        expect(layer.customFork).toBe(FORK_CUSTOM_ID);
        expect(layer.forkBackupVersion).toBe(FORK_BACKUP_VERSION);
        expect(Array.isArray(layer.miaomiaoSessions)).toBe(true);
    });
});
