import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DB, openDB } from './db';
import {
  liveChannelDb,
  liveNpcWatchDb,
  liveSessionDb,
  STORE_LIVE_CHANNELS,
  STORE_LIVE_KV,
  STORE_LIVE_NPC_WATCHES,
  STORE_LIVE_SESSIONS,
  STORE_LIVE_VODS,
} from './liveStreamDb';
import { migrateLiveStorageToIdbOnce, __resetLiveMigrationCache } from './liveStreamMigration';
import { REF_SOURCE_STORES } from './blobGc';
import { getBlobForRef, isBlobRef } from './blobRef';
import {
  LIVE_KV_IDS,
  LIVE_LOCAL_KEYS,
  loadLiveSessions,
  loadNpcWatchSessions,
  upsertLiveSession,
} from './liveStreamStorage';
import { isVisibleChatMessage } from './chatMessageVisibility';
import { buildLiveStreamTurnPrompt } from './liveStreamPrompts';
import type { LiveStreamSession } from './liveStreamTypes';

// fake-indexeddb 已由 test-setup.ts 注入，localStorage 也是内存实现。
// 这组用例钉住「直播存储修复」的几条生死线：
//   1. 旧键合并去重不丢记录；
//   2. 大背景图从 base64 变成 blobref 令牌，图还取得到；
//   3. 写失败时旧 localStorage 键一个都不删；
//   4. 场次不设上限，100 场就得是 100 场；
//   5. 新建场次不再复制频道背景；
//   6. 旧消息能重建出可续播的场次；
//   7. 图片清理白名单认得直播这几张表；
//   8. 旧直播 / 陪看消息不再被藏起来、不再被跳过。

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const CHAR_ID = 'char_live_test';
const LEGACY_CHANNEL_ID = 'ch_main_' + CHAR_ID;

async function clearStores(names: string[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    names.forEach(n => tx.objectStore(n).clear());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function seedCharacter(): Promise<void> {
  await DB.saveCharacter({
    id: CHAR_ID,
    name: '苏栗',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    greeting: '',
    systemPrompt: '',
  } as any);
}

/** 造一段和 formatChunkForDbMemory 完全同格式的旧消息 */
function chunkMessageContent(opts: {
  title: string;
  index: number;
  lines: string[];
}): string {
  return [
    `[直播实时切片 · 直播频道「苏栗 Official」《${opts.title}》第 ${opts.index + 1} 段]`,
    ...opts.lines,
  ].join('\n');
}

beforeEach(async () => {
  // 迁移结果在模块里缓存着（真实场景一次就够），用例之间要手动忘掉
  __resetLiveMigrationCache();
  await clearStores([
    STORE_LIVE_CHANNELS,
    STORE_LIVE_SESSIONS,
    STORE_LIVE_VODS,
    STORE_LIVE_NPC_WATCHES,
    STORE_LIVE_KV,
    'blob_assets',
    'messages',
    'characters',
  ]);
  localStorage.clear();
});

describe('旧 localStorage 键合并', () => {
  it('新旧键独有的记录都留下，同一个 id 以新键为准', async () => {
    localStorage.setItem(
      LIVE_LOCAL_KEYS.CHANNELS,
      JSON.stringify([
        { id: 'ch_shared', charId: CHAR_ID, channelName: '新键的频道名' },
        { id: 'ch_new_only', charId: CHAR_ID, channelName: '只在新键里' },
      ]),
    );
    localStorage.setItem(
      'sully_onair_channels_v1',
      JSON.stringify([
        { id: 'ch_shared', charId: CHAR_ID, channelName: '旧键的频道名' },
        { id: 'ch_legacy_only', charId: CHAR_ID, channelName: '只在旧键里' },
      ]),
    );

    const report = await migrateLiveStorageToIdbOnce();
    expect(report.status).toBe('done');

    const rows = await liveChannelDb.getAll();
    const byId = new Map(rows.map(r => [r.id, r]));
    expect(Array.from(byId.keys()).sort()).toEqual(
      ['ch_legacy_only', 'ch_new_only', 'ch_shared'].sort(),
    );
    expect(byId.get('ch_shared')?.channelName).toBe('新键的频道名');
  });
});

describe('图片转令牌', () => {
  it('频道背景的 base64 迁完变成 blobref，图还取得到', async () => {
    localStorage.setItem(
      LIVE_LOCAL_KEYS.CHANNELS,
      JSON.stringify([{ id: LEGACY_CHANNEL_ID, charId: CHAR_ID, roomBackgroundUrl: TINY_PNG }]),
    );

    const report = await migrateLiveStorageToIdbOnce();
    expect(report.status).toBe('done');

    const [channel] = await liveChannelDb.getAll();
    expect(isBlobRef(channel.roomBackgroundUrl)).toBe(true);
    const blob = await getBlobForRef(String(channel.roomBackgroundUrl));
    expect(blob).not.toBeNull();
    expect(blob!.size).toBeGreaterThan(0);
  });

  it('场次背景和频道背景一模一样（以前复制进来的那份）时清空，不重复存', async () => {
    localStorage.setItem(
      LIVE_LOCAL_KEYS.CHANNELS,
      JSON.stringify([{ id: LEGACY_CHANNEL_ID, charId: CHAR_ID, roomBackgroundUrl: TINY_PNG }]),
    );
    localStorage.setItem(
      LIVE_LOCAL_KEYS.SESSIONS,
      JSON.stringify([
        {
          id: 'live_1792376163835',
          charId: CHAR_ID,
          channelId: LEGACY_CHANNEL_ID,
          title: '复制了背景的一场',
          customBackgroundUrl: TINY_PNG,
        },
      ]),
    );

    await migrateLiveStorageToIdbOnce();

    const [session] = await liveSessionDb.getAll();
    expect(session.customBackgroundUrl).toBe('');
  });
});

describe('写失败不能删旧数据', () => {
  it('put 抛错时旧 localStorage 键全部保留，迁移标记不写 done', async () => {
    localStorage.setItem(
      LIVE_LOCAL_KEYS.CHANNELS,
      JSON.stringify([{ id: LEGACY_CHANNEL_ID, charId: CHAR_ID, channelName: '不能被删的频道' }]),
    );
    localStorage.setItem(
      LIVE_LOCAL_KEYS.SESSIONS,
      JSON.stringify([{ id: 'live_1792376000000', charId: CHAR_ID, channelId: LEGACY_CHANNEL_ID }]),
    );

    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('模拟磁盘写满');
    });
    let report;
    try {
      report = await migrateLiveStorageToIdbOnce();
    } finally {
      spy.mockRestore();
    }

    expect(report.status).toBe('failed');
    // 旧键一条都不能少：校验没过就一个都不删
    expect(localStorage.getItem(LIVE_LOCAL_KEYS.CHANNELS)).not.toBeNull();
    expect(localStorage.getItem(LIVE_LOCAL_KEYS.SESSIONS)).not.toBeNull();
    // 迁移标记也必须是空的，下次启动还要再试
    const kv = await openDB().then(db => {
      const tx = db.transaction(STORE_LIVE_KV, 'readonly');
      const req = tx.objectStore(STORE_LIVE_KV).get('migration_v1');
      return new Promise<any>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    expect(kv).toBeUndefined();
  });
});

describe('场次不设上限', () => {
  it('upsert 100 场之后 getAll 就是 100 场，一条都不裁', async () => {
    for (let i = 0; i < 100; i += 1) {
      await upsertLiveSession({
        id: `live_${1792376000000 + i}`,
        charId: CHAR_ID,
        channelId: LEGACY_CHANNEL_ID,
        title: `第 ${i + 1} 场`,
        categoryKey: 'just_chatting',
        categoryLabel: '杂谈',
        status: 'live',
        viewerCount: 100,
        likeCount: 0,
        chunks: [],
        rollingSummaries: [],
        pendingDanmakuQueue: [],
        foldEveryNChunks: 4,
        foldKeepRecentChunks: 2,
        startedAt: 1792376000000 + i,
      } as LiveStreamSession);
    }
    const rows = await liveSessionDb.getAll();
    expect(rows.length).toBe(100);
    expect((await loadLiveSessions()).length).toBe(100);
  });
});

describe('新建直播不再复制频道背景', () => {
  it('新建场次字面量里 customBackgroundUrl 是空字符串', () => {
    const source = readFileSync(new URL('../apps/LiveStreamApp.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const newSession: LiveStreamSession');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, start + 1200);
    expect(block).toContain("customBackgroundUrl: ''");
    expect(block).not.toContain('customBackgroundUrl: activeChannel.roomBackgroundUrl');
  });
});

describe('礼物生成由频道设置控制', () => {
  it('开播只继承频道已保存礼物，不在每场启动时再调用 AI', () => {
    const source = readFileSync(new URL('../apps/LiveStreamApp.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const handleStartNewStream');
    const end = source.indexOf('const handleManualFoldChunks', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    expect(block).toContain('sessionGifts: activeChannel.customGifts || []');
    expect(block).not.toContain('generateStreamCustomGifts');
  });

  it('直播间礼物抽屉只跳到频道设置，不提供本场重新生成入口', () => {
    const source = readFileSync(new URL('../components/live/LiveWatchScreen.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('onRequestRefreshGifts');
    expect(source).not.toContain('AI 根据本场主题换一批礼物');
    expect(source).toContain('频道礼物设置');
  });
});

describe('从旧消息重建可续播的场次', () => {
  const SESSION_ID = 'live_1792376163835';

  async function seedLegacyChunk() {
    await seedCharacter();
    await DB.saveMessage({
      charId: CHAR_ID,
      role: 'assistant',
      type: 'text',
      content: chunkMessageContent({
        title: '【新咪首播】因为一个猫太孤单了所以开播了',
        index: 0,
        lines: [
          '1. 画面：猫耳耳机歪在一边，爪子扒拉着麦克风 ｜ 台词：「晚上好呀」（同传：Good evening） ｜ 互动：Ann(熟人本尊)[SC ¥30]: 加油；观众「momo」[送出 ☕Iced Americano]: 送你一杯',
          '2. 画面：低头整理桌上的小灯，一句话都没说 ｜ 台词：（专注动作未开口）',
          '这一行故意不合格式',
        ],
      }),
      metadata: {
        source: 'live',
        liveSessionId: SESSION_ID,
        liveChannelId: LEGACY_CHANNEL_ID,
        liveChunkIndex: 0,
        archiveMode: 'forget',
      },
    } as any);
  }

  it('同传、SC、礼物、熟人本尊、未开口、坏行都能还原，且 status 是 live', async () => {
    await seedLegacyChunk();

    const report = await migrateLiveStorageToIdbOnce();
    expect(report.status).toBe('done');
    expect(report.counts.rebuilt).toBe(1);

    const sessions = await loadLiveSessions();
    const rebuilt = sessions.find(s => s.id === SESSION_ID);
    expect(rebuilt).toBeTruthy();
    expect(rebuilt!.status).toBe('live');
    expect(rebuilt!.title).toBe('【新咪首播】因为一个猫太孤单了所以开播了');
    expect(rebuilt!.customBackgroundUrl).toBe('');
    expect(rebuilt!.rebuiltFromMessagesAt).toBeGreaterThan(0);

    const chunk = rebuilt!.chunks[0];
    expect(chunk.id).toBe(`chunk_${SESSION_ID}_0`);
    expect(chunk.beats.length).toBe(3);

    const [first, silent, broken] = chunk.beats;
    expect(first.speechOriginal).toBe('晚上好呀');
    expect(first.speechTranslated).toBe('Good evening');
    expect(first.danmaku[0]).toMatchObject({ senderName: 'Ann', isUserMain: true, scAmount: 30 });
    expect(first.danmaku[1].giftName).toBe('Iced Americano');
    expect(silent.speechOriginal).toBe('');
    // 解析不了的行整行进画面，绝不丢
    expect(broken.screen).toBe('这一行故意不合格式');
    expect(broken.speechOriginal).toBe('');
  });

  it('重建出来的场次叫下一段时，提示词里已有第 1 段，不再是开场白', async () => {
    await seedLegacyChunk();
    await migrateLiveStorageToIdbOnce();

    const rebuilt = (await loadLiveSessions()).find(s => s.id === SESSION_ID)!;
    const channel = (await liveChannelDb.getAll()).find(c => c.charId === CHAR_ID) || {
      id: LEGACY_CHANNEL_ID,
      charId: CHAR_ID,
      channelName: '苏栗 Official',
      handle: '@suli_ch',
      roomBackgroundUrl: '',
      bannerGradient: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)',
      identityMode: 'public_main',
      bio: '',
      streamerPersonaPrompt: '',
      followerCount: 12800,
      fanBadgeName: 'Member',
      defaultCategory: 'just_chatting',
      voiceConfig: { language: '', enableTranslation: false, autoPlayTts: false, overrideVoiceId: '' },
      customGifts: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const messages = await buildLiveStreamTurnPrompt({
      char: { id: CHAR_ID, name: '苏栗', avatar: '', description: '', personality: '', scenario: '', greeting: '' } as any,
      userProfile: { name: 'Ann' } as any,
      channel: channel as any,
      session: rebuilt,
      historyMessages: [],
      userName: 'Ann',
    });

    const joined = messages.map(m => m.content).join('\n');
    expect(joined).toContain('【第 1 轮 · 原文】');
    expect(joined).not.toContain('开场第一段');
  });
});

describe('图片清理白名单', () => {
  it('5 张直播表都在 REF_SOURCE_STORES 里', () => {
    const names = new Set<string>(REF_SOURCE_STORES);
    [
      STORE_LIVE_CHANNELS,
      STORE_LIVE_SESSIONS,
      STORE_LIVE_VODS,
      STORE_LIVE_NPC_WATCHES,
      STORE_LIVE_KV,
    ].forEach(name => expect(names.has(name)).toBe(true));
  });
});

describe('旧消息不再被藏起来、不再被跳过', () => {
  it('被标过 superseded / forget 的直播消息仍然可见', () => {
    const visible = isVisibleChatMessage({
      id: 1,
      charId: CHAR_ID,
      role: 'assistant',
      type: 'text',
      content: '[直播实时切片]',
      timestamp: Date.now(),
      metadata: { source: 'live', superseded: true, archiveMode: 'forget' },
    } as any);
    expect(visible).toBe(true);
  });

  it('旧陪看消息同样可见（由 Ann 自己删，不在这里藏）', () => {
    const visible = isVisibleChatMessage({
      id: 2,
      charId: CHAR_ID,
      role: 'assistant',
      type: 'text',
      content: '[与你一起刷 NPC 直播]',
      timestamp: Date.now(),
      metadata: { source: 'live_npc_watch' },
    } as any);
    expect(visible).toBe(true);
  });

  it('源码里已经没有按 live + superseded / forget 跳过消息的分支', () => {
    const prompts = readFileSync(new URL('./chatPrompts.ts', import.meta.url), 'utf8');
    expect(prompts).not.toContain("bMeta.source === 'live' &&");
    const visibility = readFileSync(new URL('./chatMessageVisibility.ts', import.meta.url), 'utf8');
    expect(visibility).not.toContain("source !== 'live'");
    expect(visibility).not.toContain("source !== 'live_npc_watch'");
  });
});

describe('旧陪看迁进 IDB 时算「还在看」', () => {
  it('旧记录没有 status，迁移后一律是 watching，而且场次记录保留', async () => {
    localStorage.setItem(
      LIVE_LOCAL_KEYS.NPC_WATCHES,
      JSON.stringify([
        { id: 'npcw_1792377315810', charId: CHAR_ID, npcStreamerName: '路人 A', beats: [], createdAt: 1792377315810 },
        { id: 'npcw_1792378820424', charId: CHAR_ID, npcStreamerName: '路人 B', beats: [], createdAt: 1792378820424 },
      ]),
    );

    const report = await migrateLiveStorageToIdbOnce();
    expect(report.status).toBe('done');

    const rows = await liveNpcWatchDb.getAll();
    expect(rows.length).toBe(2);
    rows.forEach(row => expect(row.status).toBe('watching'));

    const loaded = await loadNpcWatchSessions();
    expect(loaded.map(r => r.id).sort()).toEqual(['npcw_1792377315810', 'npcw_1792378820424']);
    loaded.forEach(row => expect(row.status).toBe('watching'));

    // 旧键删掉了，但数据已经在 IDB 里
    expect(localStorage.getItem(LIVE_LOCAL_KEYS.NPC_WATCHES)).toBeNull();
    void LIVE_KV_IDS;
  });
});
