import { describe, it, expect } from 'vitest';
import { assertSupportedSullyBackup } from './backupImportPolicy';
import { writeV2Backup, assembleV2Backup } from './backupFormat';
import { DB, openDB } from './db';
import {
    FORK_BACKUP_VERSION,
    FORK_BACKUP_MIN_VERSION,
    FORK_CUSTOM_ID,
    FORK_FATE_SETTINGS_KEY_PREFIX,
    isForkBackupData,
    collectForkBackupLayer,
    restoreForkBackupLayer,
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
    it('isForkBackupData 识别 ann-lily 标记，并认旧版 v1', () => {
        expect(isForkBackupData({ customFork: FORK_CUSTOM_ID, forkBackupVersion: FORK_BACKUP_VERSION })).toBe(true);
        expect(isForkBackupData({ customFork: FORK_CUSTOM_ID, forkBackupVersion: FORK_BACKUP_MIN_VERSION })).toBe(true);
        expect(isForkBackupData({ customFork: 'other' })).toBe(false);
        expect(isForkBackupData({ customFork: FORK_CUSTOM_ID, forkBackupVersion: FORK_BACKUP_VERSION + 1 })).toBe(false);
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

    it('电波只带文字与设置：背景图 / 音频 / 时间轴被剥掉，本机开关进包', async () => {
        const db = await openDB();
        const put = (store: string, row: any) => new Promise<void>((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(row);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        await put('live_channels', {
            id: 'fork-ch1', charId: 'c1', channelName: '频道', handle: '@a',
            avatar: 'blobref:avatar', roomBackgroundUrl: 'blobref:bg',
            bannerGradient: 'g', identityMode: 'public_main', bio: '简介',
            streamerPersonaPrompt: '', followerCount: 1, fanBadgeName: 'M',
            defaultCategory: 'x', voiceConfig: { language: '', enableTranslation: false, autoPlayTts: true },
            createdAt: 1, updatedAt: 1,
        });
        await put('live_sessions', {
            id: 'fork-s1', channelId: 'fork-ch1', charId: 'c1', title: '标题', categoryKey: 'k', categoryLabel: 'L',
            customBackgroundUrl: 'blobref:sessionbg',
            status: 'ended', viewerCount: 1, likeCount: 2,
            chunks: [{
                id: 'k1', index: 0, createdAt: 1, userInputs: [], beats: [
                    {
                        id: 'b1', chunkId: 'k1', index: 0, screen: '画面', speechOriginal: '台词',
                        audioUrl: 'blobref:voice', speechTimeline: { segments: [] }, danmaku: [],
                    },
                ],
            }],
            rollingSummaries: [], pendingDanmakuQueue: [], foldEveryNChunks: 3, foldKeepRecentChunks: 1,
            startedAt: 1,
        });
        await put('live_vods', {
            id: 'fork-v1', channelId: 'fork-ch1', charId: 'c1', title: '投稿', categoryLabel: 'L',
            durationLabel: '10:00', coverGradient: 'g', coverImageUrl: 'blobref:cover',
            viewsCount: 1, likesCount: 2, streamerPinnedNote: 'note',
            chapters: [{
                id: 'vc1', timestampLabel: '00:00', chapterTitle: '章', screen: '画面',
                speechOriginal: '台词', audioUrl: 'blobref:vodvoice', danmaku: [],
            }],
            comments: [], createdAt: 1,
        });
        await put('live_npc_watches', {
            id: 'fork-w1', charId: 'c1', npcStreamerName: 'NPC', npcCategoryLabel: 'L', npcRoomTitle: '房间',
            npcBio: 'bio', coverGradient: 'g', viewerCount: 1,
            beats: [{
                id: 'nb1', index: 0, npcScreen: '画面', npcSpeech: '话', npcDanmaku: [],
                charReactionAction: '动作', charReactionSpeech: '反应', charAudioUrl: 'blobref:npcvoice',
            }],
            createdAt: 1,
        });
        localStorage.setItem('live_stage_avatar', '1');

        try {
            const layer = await collectForkBackupLayer();

            const channel = (layer.liveChannels as any[]).find((c) => c.id === 'fork-ch1');
            expect(channel.channelName).toBe('频道');
            expect(channel.bio).toBe('简介');
            expect(channel.avatar).toBeUndefined();
            expect(channel.roomBackgroundUrl).toBeUndefined();

            const session = (layer.liveSessions as any[]).find((s) => s.id === 'fork-s1');
            expect(session.customBackgroundUrl).toBeUndefined();
            expect(session.chunks[0].beats[0].speechOriginal).toBe('台词');
            expect(session.chunks[0].beats[0].audioUrl).toBeUndefined();
            expect(session.chunks[0].beats[0].speechTimeline).toBeUndefined();

            const vod = (layer.liveVods as any[]).find((v) => v.id === 'fork-v1');
            expect(vod.coverImageUrl).toBeUndefined();
            expect(vod.chapters[0].speechOriginal).toBe('台词');
            expect(vod.chapters[0].audioUrl).toBeUndefined();

            const watch = (layer.liveNpcWatches as any[]).find((w) => w.id === 'fork-w1');
            expect(watch.beats[0].charReactionSpeech).toBe('反应');
            expect(watch.beats[0].charAudioUrl).toBeUndefined();

            expect(layer.forkLiveLocal?.live_stage_avatar).toBe('1');
        } finally {
            localStorage.removeItem('live_stage_avatar');
        }
    });

    it('collect 带走命运牌库 / UI 偏好 / 括号翻译 / 静默预生成 / 小红书主页帖', async () => {
        const db = await openDB();
        const fateKey = `${FORK_FATE_SETTINGS_KEY_PREFIX}char-fate`;
        const parenEnabledKey = 'chat_paren_translation_enabled_char-p';
        const parenFormatKey = 'chat_paren_translation_format_char-p';
        const fateValue = JSON.stringify({
            factors: [{ id: 'f1', name: '自定义因子', meaning: '意思' }],
            tendencies: [],
            disabledFactorIds: ['f1'],
            disabledTendencyIds: [],
        });

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('xhs_owned_posts', 'readwrite');
            tx.objectStore('xhs_owned_posts').put({
                id: 'fork-xhs-1',
                charId: 'c1',
                title: '主页帖',
                createdAt: 1,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        localStorage.setItem(fateKey, fateValue);
        localStorage.setItem('sullyos.chatNotify.enabled.v1', '0');
        localStorage.setItem('sullyos.globalTranslate.enabled.v1', '0');
        localStorage.setItem('sully_navigation_ball_enabled_v1', '1');
        localStorage.setItem('sully_navigation_ball_position_v1', '{"x":8,"y":28}');
        localStorage.setItem('sully_navigation_ball_slots_v1', '[null,null,null,null]');
        localStorage.setItem('live_speech_perform_enabled', '0');
        localStorage.setItem(parenEnabledKey, 'true');
        localStorage.setItem(parenFormatKey, 'quoted');

        try {
            const layer = await collectForkBackupLayer();
            expect(layer.forkBackupVersion).toBe(2);
            expect(layer.forkFateSettingsLocal?.[fateKey]).toBe(fateValue);
            expect(layer.forkUiPrefsLocal?.['sullyos.chatNotify.enabled.v1']).toBe('0');
            expect(layer.forkUiPrefsLocal?.['sullyos.globalTranslate.enabled.v1']).toBe('0');
            expect(layer.forkUiPrefsLocal?.['sully_navigation_ball_enabled_v1']).toBe('1');
            expect(layer.forkLiveLocal?.live_speech_perform_enabled).toBe('0');
            expect(layer.forkParenTranslationLocal?.[parenEnabledKey]).toBe('true');
            expect(layer.forkParenTranslationLocal?.[parenFormatKey]).toBe('quoted');
            expect((layer.xhsOwnedPosts as any[]).some((p) => p.id === 'fork-xhs-1')).toBe(true);
        } finally {
            localStorage.removeItem(fateKey);
            localStorage.removeItem('sullyos.chatNotify.enabled.v1');
            localStorage.removeItem('sullyos.globalTranslate.enabled.v1');
            localStorage.removeItem('sully_navigation_ball_enabled_v1');
            localStorage.removeItem('sully_navigation_ball_position_v1');
            localStorage.removeItem('sully_navigation_ball_slots_v1');
            localStorage.removeItem('live_speech_perform_enabled');
            localStorage.removeItem(parenEnabledKey);
            localStorage.removeItem(parenFormatKey);
        }
    });

    it('restoreForkBackupLayer 写回命运 / UI / 括号翻译 / 静默预生成', async () => {
        const fateKey = `${FORK_FATE_SETTINGS_KEY_PREFIX}char-restore`;
        const parenEnabledKey = 'chat_paren_translation_enabled_char-r';
        localStorage.removeItem(fateKey);
        localStorage.removeItem('sullyos.chatNotify.enabled.v1');
        localStorage.removeItem('live_speech_perform_enabled');
        localStorage.removeItem(parenEnabledKey);

        try {
            const result = await restoreForkBackupLayer({
                customFork: FORK_CUSTOM_ID,
                forkBackupVersion: FORK_BACKUP_VERSION,
                forkFateSettingsLocal: { [fateKey]: '{"factors":[]}' },
                forkUiPrefsLocal: { 'sullyos.chatNotify.enabled.v1': '0' },
                forkLiveLocal: { live_speech_perform_enabled: '0' },
                forkParenTranslationLocal: { [parenEnabledKey]: 'true' },
            } as any);

            expect(result.restoredForkLayer).toBe(true);
            expect(localStorage.getItem(fateKey)).toBe('{"factors":[]}');
            expect(localStorage.getItem('sullyos.chatNotify.enabled.v1')).toBe('0');
            expect(localStorage.getItem('live_speech_perform_enabled')).toBe('0');
            expect(localStorage.getItem(parenEnabledKey)).toBe('true');
        } finally {
            localStorage.removeItem(fateKey);
            localStorage.removeItem('sullyos.chatNotify.enabled.v1');
            localStorage.removeItem('live_speech_perform_enabled');
            localStorage.removeItem(parenEnabledKey);
        }
    });
});
