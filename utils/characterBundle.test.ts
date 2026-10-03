import { describe, expect, it } from 'vitest';
import { DB, openDB } from './db';
import {
    buildReplacementProfile,
    exportCharacterBundle,
    importCharacterBundle,
    readCharacterBundle,
    remapMemoryMessageIds,
} from './characterBundle';
import type { CharacterProfile } from '../types';

function character(id: string, name: string, groupId?: string): CharacterProfile {
    return {
        id,
        name,
        avatar: '🙂',
        description: `${name} 的人设`,
        systemPrompt: `${name} 的设定`,
        memories: [],
        groupId,
        mountedWorldbooks: [],
    };
}

describe('单角色搬家', () => {
    it('换人时留下本机编号和分组，内容用包里的', () => {
        const next = buildReplacementProfile(
            character('test-id', '测试Sully', '测试分组'),
            character('live-id', '正式Sully', '正式分组'),
        );
        expect(next.id).toBe('live-id');
        expect(next.groupId).toBe('正式分组');
        expect(next.name).toBe('测试Sully');
        expect(next.systemPrompt).toBe('测试Sully 的设定');
    });

    it('记忆里指向旧聊天编号的地方改到新编号', () => {
        const rows = remapMemoryMessageIds([
            { id: 'n1', relativeTimeAnchor: { dateKey: '2026-10-03', source: 'message', messageId: 4 } },
            { id: 'n2', content: '没有锚点' },
        ], new Map([[4, 40]]));
        expect((rows[0] as any).relativeTimeAnchor.messageId).toBe(40);
        expect(rows[1]).toEqual({ id: 'n2', content: '没有锚点' });
    });

    it('私聊换掉，群聊和用户名不动', async () => {
        const source = character('bundle-source', '测试Sully');
        const target = character('bundle-target', '正式Sully', 'folder-live');
        const other = character('bundle-other', '别人');
        await DB.saveCharacter(source);
        await DB.saveCharacter(target);
        await DB.saveCharacter(other);
        await DB.saveMessage({ charId: source.id, role: 'user', type: 'text', content: '测试档私聊' });
        await DB.saveMessage({ charId: source.id, role: 'assistant', type: 'text', content: '群里的话', groupId: 'group-1' });
        await DB.saveMessage({ charId: target.id, role: 'user', type: 'text', content: '正式档旧私聊' });
        await DB.saveMessage({ charId: target.id, role: 'assistant', type: 'text', content: '正式档群聊', groupId: 'group-1' });
        await DB.saveMessage({ charId: other.id, role: 'user', type: 'text', content: '别人的私聊' });

        const exported = await exportCharacterBundle(source.id);
        const bundle = await readCharacterBundle(exported.blob);
        expect(bundle.privateMessages.map(message => message.content)).toEqual(['测试档私聊']);
        expect(JSON.stringify(bundle)).not.toContain('用户名');

        await importCharacterBundle(bundle, target.id);
        const replaced = await DB.getCharacter(target.id);
        expect(replaced?.name).toBe('测试Sully');
        expect(replaced?.id).toBe(target.id);
        expect(replaced?.groupId).toBe('folder-live');
        expect(replaced?.description).toBe('测试Sully 的人设');

        const readRaw = async (charId: string) => {
            const db = await openDB();
            const rows = await new Promise<any[]>((resolve, reject) => {
                const request = db.transaction('messages').objectStore('messages').index('charId').getAll(charId);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
            return rows.map(message => message.content).sort();
        };
        const db = await openDB();
        const every = await new Promise<any[]>((resolve, reject) => {
            const request = db.transaction('messages').objectStore('messages').getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        expect(every.map(message => `${message.charId}:${message.groupId || ''}:${message.content}`).sort()).toEqual([
            'bundle-other::别人的私聊',
            'bundle-source::测试档私聊',
            'bundle-source:group-1:群里的话',
            'bundle-target::测试档私聊',
            'bundle-target:group-1:正式档群聊',
        ]);
        expect(await readRaw(target.id)).toEqual(['正式档群聊', '测试档私聊']);
        expect(await readRaw(other.id)).toEqual(['别人的私聊']);
        const plateDb = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = plateDb.transaction('room_plates', 'readwrite');
            tx.objectStore('room_plates').put({ id: `${source.id}:日常`, charId: source.id, room: '日常', entries: [] });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        const again = await exportCharacterBundle(source.id);
        await importCharacterBundle(await readCharacterBundle(again.blob), target.id);
        const plate = await new Promise<any>((resolve, reject) => {
            const request = plateDb.transaction('room_plates').objectStore('room_plates').get(`${target.id}:日常`);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        expect(plate?.charId).toBe(target.id);
        expect(plate?.id).toBe(`${target.id}:日常`);
        expect(await DB.getCharacter(other.id)).toMatchObject({ name: '别人' });
    });

    it('普通备份文件读不进来', async () => {
        const file = new Blob([JSON.stringify({ type: 'full_backup' })], { type: 'application/json' });
        await expect(readCharacterBundle(file)).rejects.toThrow('这不是单角色包');
    });
});
