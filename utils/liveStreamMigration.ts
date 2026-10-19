/**
 * 直播（电波 OnAir）数据的一次性搬家：localStorage → IndexedDB。
 *
 * 为什么要有这一步：以前直播全塞在 localStorage 里，一个网址只有 5MB，场次还是整份 JSON
 * 重写；一场带大背景图的直播就能写满，写失败还静默丢数据。v77 起了 5 张 IDB 表，
 * 这个模块负责把旧键里的东西原样搬进去、把 base64 图片换成 Blob 令牌，然后才删旧键。
 *
 * 三条不可违反的规矩：
 * 1. 校验没通过就一个旧键都不删——宁可下次再迁，也不能让用户的内容凭空消失。
 * 2. 永远不自动删直播内容。这里只搬家和重建，删不删由用户自己决定。
 * 3. 不自己 indexedDB.open，一律走 openDB()。
 */
import { DB, openDB } from './db';
import { isBlobRef, migrateDataUrlToRef } from './blobRef';
import {
  currentMaintenanceHolder,
  releaseMaintenanceLock,
  tryAcquireMaintenanceLock,
} from './maintenanceLock';
import {
  LIVE_KV_IDS,
  LIVE_LEGACY_LOCAL_KEYS,
  LIVE_LOCAL_KEYS,
  ensureDefaultChannelForChar,
  readLegacyLiveLayer,
} from './liveStreamStorage';
import {
  STORE_LIVE_CHANNELS,
  STORE_LIVE_KV,
  STORE_LIVE_NPC_WATCHES,
  STORE_LIVE_SESSIONS,
  STORE_LIVE_VODS,
  liveSessionDb,
} from './liveStreamDb';
import {
  LiveBeat,
  LiveChunk,
  LiveDanmakuItem,
  LiveRollingSummary,
  LiveStreamSession,
  NpcStreamerChannelCard,
  NpcWatchSession,
  STREAM_PRESET_TEMPLATES,
  StreamerChannelProfile,
  ViewerPersona,
  VodVideoPost,
} from './liveStreamTypes';
import type { CharacterProfile, Message } from '../types';

/** live_kv 里的迁移标记。值是 { value:'done', at, counts } */
const KV_MIGRATION_ID = 'migration_v1';
const MIGRATION_LOCK_NAME = '直播数据迁移';

const LEGACY_NPC_POOL_KEY_ID = LIVE_KV_IDS.NPC_POOL;

export type LiveMigrationStatus = 'done' | 'skipped' | 'locked' | 'failed';

export interface LiveMigrationReport {
  status: LiveMigrationStatus;
  counts: {
    channels: number;
    sessions: number;
    vods: number;
    npcWatches: number;
    /** 从聊天消息里重建出来的场次数 */
    rebuilt: number;
  };
  warnings: string[];
  error?: string;
}

const emptyCounts = (): LiveMigrationReport['counts'] => ({
  channels: 0,
  sessions: 0,
  vods: 0,
  npcWatches: 0,
  rebuilt: 0,
});

const waitTx = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('直播数据迁移事务失败'));
    tx.onabort = () => reject(tx.error || new Error('直播数据迁移事务被中断'));
  });

// ==================== 图片：base64 → Blob 令牌 ====================

/**
 * data: 开头就换成令牌；换失败保留原值（宁可不省空间，也不能丢图），并记一条警告。
 */
async function toBlobRefOrKeep(
  value: string | undefined,
  label: string,
  warnings: string[],
): Promise<string | undefined> {
  if (!value || !value.startsWith('data:')) return value;
  const next = await migrateDataUrlToRef(value);
  if (isBlobRef(next)) return next;
  warnings.push(`${label}：图片转令牌失败，保留了原 base64`);
  return value;
}

// ==================== 写入与校验 ====================

interface MigrationPayload {
  channels: StreamerChannelProfile[];
  sessions: LiveStreamSession[];
  vods: VodVideoPost[];
  npcWatches: NpcWatchSession[];
  kv: Array<{ id: string; value: unknown }>;
}

/** 一个 readwrite 事务把所有东西写进去，等到 oncomplete 才算落盘 */
async function writePayloadInOneTx(payload: MigrationPayload): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(
    [
      STORE_LIVE_CHANNELS,
      STORE_LIVE_SESSIONS,
      STORE_LIVE_VODS,
      STORE_LIVE_NPC_WATCHES,
      STORE_LIVE_KV,
    ],
    'readwrite',
  );

  payload.channels.forEach(row => tx.objectStore(STORE_LIVE_CHANNELS).put(row));
  payload.sessions.forEach(row => tx.objectStore(STORE_LIVE_SESSIONS).put(row));
  payload.vods.forEach(row => tx.objectStore(STORE_LIVE_VODS).put(row));
  payload.npcWatches.forEach(row => tx.objectStore(STORE_LIVE_NPC_WATCHES).put(row));
  payload.kv.forEach(row => tx.objectStore(STORE_LIVE_KV).put(row));

  return waitTx(tx);
}

async function readExistingIds(store: string): Promise<Set<string>> {
  const db = await openDB();
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).getAllKeys();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(new Set((req.result || []).map(key => String(key))));
    req.onerror = () => reject(req.error);
  });
}

/**
 * 校验：合并前每个 id 都必须在新表里。少一个都不算迁移成功。
 * 返回缺失的 [表名, id] 清单，空数组代表通过。
 */
async function verifyMigrated(payload: MigrationPayload): Promise<string[]> {
  const missing: string[] = [];
  const checks: Array<[string, string[]]> = [
    [STORE_LIVE_CHANNELS, payload.channels.map(r => r.id)],
    [STORE_LIVE_SESSIONS, payload.sessions.map(r => r.id)],
    [STORE_LIVE_VODS, payload.vods.map(r => r.id)],
    [STORE_LIVE_NPC_WATCHES, payload.npcWatches.map(r => r.id)],
  ];
  for (const [store, ids] of checks) {
    if (ids.length === 0) continue;
    const present = await readExistingIds(store);
    ids.forEach(id => {
      if (!present.has(String(id))) missing.push(`${store}/${id}`);
    });
  }
  return missing;
}

// ==================== 从旧消息重建可续播的场次 ====================

/** 段落首行：[直播实时切片 · 直播频道「X」《标题》第 N 段] */
const CHUNK_HEADER_RE = /《(.+)》第 (\d+) 段\]$/;

/** 每拍：1. 画面：… ｜ 台词：… ｜ 互动：… */
const BEAT_LINE_RE = /^(\d+)\. 画面：(.*?) ｜ 台词：(.*?)(?: ｜ 互动：(.*))?$/;

/** 互动里的一条：观众「名字」[SC ¥n]: 文字 / 名字(熟人本尊)[送出 🎁礼物]: 文字 */
const INTERACTION_RE = /^(.*?)(?:\[SC ¥([\d.]+)\])?(?:\[送出 (.*?)\])?: ([\s\S]*)$/;

const SUMMARY_TAGS = ['[直播阶段滚动摘要]', '[本场直播全貌总结]'];

function stripSummaryTag(content: string): string {
  let text = (content || '').trim();
  SUMMARY_TAGS.forEach(tag => {
    if (text.startsWith(tag)) text = text.slice(tag.length).trim();
  });
  return text;
}

/** "「原文」（同传：翻译）" / "「原文」" / "（专注动作未开口）" 三种形态 */
function parseSpeech(raw: string): { original: string; translated?: string } {
  const text = raw.trim();
  if (!text || text === '（专注动作未开口）') return { original: '' };
  const dual = /^「([\s\S]*)」（同传：([\s\S]*)）$/.exec(text);
  if (dual) return { original: dual[1], translated: dual[2] || undefined };
  const single = /^「([\s\S]*)」$/.exec(text);
  if (single) return { original: single[1] };
  return { original: text };
}

/** "[送出 ☕Iced Americano]" 里的表情和名字分开；分不开就整段当名字，不丢东西 */
function splitGiftTag(raw: string): { giftEmoji?: string; giftName: string } {
  const text = raw.trim();
  if (!text) return { giftName: '' };
  const matched = /^([^A-Za-z0-9\u4e00-\u9fa5]+)([\s\S]+)$/.exec(text);
  if (matched) return { giftEmoji: matched[1], giftName: matched[2].trim() };
  return { giftName: text };
}

function parseInteractions(
  raw: string,
  chunkId: string,
  beatIndex: number,
  timestamp: number,
): LiveDanmakuItem[] {
  const items: LiveDanmakuItem[] = [];
  raw
    .split('；')
    .map(seg => seg.trim())
    .filter(Boolean)
    .forEach((seg, idx) => {
      const matched = INTERACTION_RE.exec(seg);
      const id = `dmb_${chunkId}_${beatIndex}_${idx}`;
      if (!matched) {
        // 解析失败也留着，整段当普通弹幕，绝不丢行
        items.push({ id, senderName: '观众', text: seg, timestamp });
        return;
      }
      const whoRaw = (matched[1] || '').trim();
      const isUserMain = /\(熟人本尊\)$/.test(whoRaw);
      const wrapped = /^观众「([\s\S]*)」$/.exec(whoRaw);
      const senderName = wrapped
        ? wrapped[1]
        : whoRaw.replace(/\(熟人本尊\)$/, '').trim() || '观众';
      const scAmount = matched[2] ? Number(matched[2]) : undefined;
      const gift = matched[3] ? splitGiftTag(matched[3]) : undefined;
      const item: LiveDanmakuItem = {
        id,
        senderName,
        text: matched[4] || '',
        timestamp,
      };
      if (isUserMain) item.isUserMain = true;
      if (scAmount && scAmount > 0) item.scAmount = scAmount;
      if (gift) {
        item.giftName = gift.giftName;
        if (gift.giftEmoji) item.giftEmoji = gift.giftEmoji;
      }
      items.push(item);
    });
  return items;
}

interface ParsedChunk {
  chunk: LiveChunk;
  title?: string;
}

/** 把一条 source:'live' 的分段消息还原成一段切片 */
function parseChunkMessage(msg: Message, sessionId: string): ParsedChunk {
  const lines = String(msg.content || '').split('\n');
  const header = (lines[0] || '').trim();
  const headerMatched = CHUNK_HEADER_RE.exec(header);
  const chunkIndexFromMeta = msg.metadata?.liveChunkIndex;
  const fallbackIndex = headerMatched ? Number(headerMatched[2]) - 1 : 0;
  const chunkIndex =
    typeof chunkIndexFromMeta === 'number' && chunkIndexFromMeta >= 0
      ? chunkIndexFromMeta
      : fallbackIndex;

  const chunkId = `chunk_${sessionId}_${chunkIndex}`;
  const timestamp = msg.timestamp || Date.now();
  const beats: LiveBeat[] = [];

  lines.slice(1).forEach(line => {
    const text = line.trim();
    if (!text) return;
    const beatIndex = beats.length;
    const matched = BEAT_LINE_RE.exec(text);
    if (!matched) {
      // 解析不了的行整行放进画面，台词留空——这条规矩就是为了「不丢行」
      beats.push({
        id: `beat_${chunkId}_${beatIndex}`,
        chunkId,
        index: beatIndex,
        screen: text,
        speechOriginal: '',
        danmaku: [],
      });
      return;
    }
    const speech = parseSpeech(matched[3] || '');
    const beat: LiveBeat = {
      id: `beat_${chunkId}_${beatIndex}`,
      chunkId,
      index: beatIndex,
      screen: (matched[2] || '').trim(),
      speechOriginal: speech.original,
      danmaku: parseInteractions(matched[4] || '', chunkId, beatIndex, timestamp),
    };
    if (speech.translated) beat.speechTranslated = speech.translated;
    beats.push(beat);
  });

  return {
    chunk: {
      id: chunkId,
      index: chunkIndex,
      createdAt: timestamp,
      beats,
      userInputs: [],
      folded: Boolean(msg.metadata?.superseded),
      dbMessageId: msg.id,
    },
    title: headerMatched ? headerMatched[1] : undefined,
  };
}

/** 标题对不上任何分区模板时，和新建直播一样落到「杂谈」 */
function resolvePreset(title: string) {
  const hit = STREAM_PRESET_TEMPLATES.find(t => title && t.defaultTitle === title);
  return hit || STREAM_PRESET_TEMPLATES[0];
}

function pickStartedAt(sessionId: string, timestamps: number[]): number {
  const fromId = /^live_(\d{13})$/.exec(sessionId);
  if (fromId) return Number(fromId[1]);
  const pool = timestamps.filter(t => typeof t === 'number' && t > 0);
  return pool.length > 0 ? Math.min(...pool) : Date.now();
}

/**
 * 把某个 id 的旧消息还原成一场能接着播的直播。
 * 缺字段的默认值见施工单 3.5-7 的表格——那些数据从来没写进消息里，只能给默认值。
 */
function buildSessionFromMessages(
  sessionId: string,
  messages: Message[],
  channel: StreamerChannelProfile,
  charId: string,
): LiveStreamSession | null {
  const chunkMessages = messages
    .filter(m => !m.metadata?.isLiveSummary && typeof m.metadata?.liveChunkIndex === 'number')
    .sort((a, b) => {
      const ai = Number(a.metadata?.liveChunkIndex ?? 0);
      const bi = Number(b.metadata?.liveChunkIndex ?? 0);
      return ai - bi || (a.timestamp || 0) - (b.timestamp || 0);
    });

  const summaryMessages = messages
    .filter(m => m.metadata?.isLiveSummary && !m.metadata?.isFinalLiveSummary)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const finalMessage = messages
    .filter(m => m.metadata?.isFinalLiveSummary)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];

  if (chunkMessages.length === 0 && !finalMessage && summaryMessages.length === 0) return null;

  const parsedChunks = chunkMessages.map(m => parseChunkMessage(m, sessionId));
  const chunks: LiveChunk[] = parsedChunks.map(p => p.chunk);
  const title =
    parsedChunks.map(p => p.title).find(t => Boolean(t)) ||
    '已重建的直播';
  const preset = resolvePreset(title);

  // 阶段摘要折叠了哪几段：靠被标 superseded 的段 + 时间先后推
  let cursor = 0;
  const rollingSummaries: LiveRollingSummary[] = summaryMessages.map((m, idx) => {
    const summaryAt = m.timestamp || 0;
    const claimed: number[] = [];
    for (let i = cursor; i < chunkMessages.length; i += 1) {
      const meta = chunkMessages[i].metadata || {};
      const foldedByThisSession = meta.superseded && meta.supersededBySession === sessionId;
      if (foldedByThisSession && (chunkMessages[i].timestamp || 0) <= summaryAt) {
        claimed.push(i);
      }
    }
    if (claimed.length > 0) cursor = claimed[claimed.length - 1] + 1;
    const claimedIds = new Set(claimed.map(i => chunks[i].id));
    claimed.forEach(i => {
      chunks[i] = { ...chunks[i], folded: true };
    });
    const indexes = claimed.map(i => chunks[i].index);
    return {
      id: `rsum_${sessionId}_${idx}`,
      fromChunkIndex: claimed.length > 0 ? Math.min(...indexes) : 0,
      toChunkIndex: claimed.length > 0 ? Math.max(...indexes) : 0,
      content: stripSummaryTag(m.content),
      createdAt: summaryAt,
      dbMessageId: m.id,
      supersededChunkIds: Array.from(claimedIds),
    };
  });

  // 摘要里折叠的段补上 foldedBySummaryId，界面才能「拆掉摘要还原」
  rollingSummaries.forEach(summary => {
    (summary.supersededChunkIds || []).forEach(chunkId => {
      const target = chunks.find(c => c.id === chunkId);
      if (target) target.foldedBySummaryId = summary.id;
    });
  });

  const viewerBase = Math.floor((channel.followerCount || 0) * 0.08) + 120;
  let scTotal = 0;
  chunks.forEach(c => {
    c.beats.forEach(b => {
      (b.danmaku || []).forEach(d => {
        if (d.scAmount && d.scAmount > 0) scTotal += d.scAmount;
      });
    });
  });

  const session: LiveStreamSession = {
    id: sessionId,
    channelId: channel.id,
    charId,
    title,
    categoryKey: preset.key,
    categoryLabel: preset.label,
    status: 'live',
    viewerCount: viewerBase,
    peakViewerCount: viewerBase,
    likeCount: 0,
    totalScRevenue: scTotal,
    sessionGifts: channel.customGifts || [],
    customBackgroundUrl: '',
    chunks,
    rollingSummaries,
    pendingDanmakuQueue: [],
    foldEveryNChunks: 4,
    foldKeepRecentChunks: 2,
    finalSummary: finalMessage ? stripSummaryTag(finalMessage.content) : undefined,
    finalDbMessageId: finalMessage ? finalMessage.id : undefined,
    startedAt: pickStartedAt(
      sessionId,
      chunkMessages.map(m => m.timestamp || 0),
    ),
    rebuiltFromMessagesAt: Date.now(),
  };
  return session;
}

/**
 * 从 messages 表里把直播场次重建出来。已经存在于 live_sessions 的 id 一律不覆盖；
 * 以前标过 archiveMode:'forget' 的场次也照样重建——要删由用户自己在直播 App 里删。
 */
async function rebuildSessionsFromMessages(
  channels: StreamerChannelProfile[],
  existingSessionIds: Set<string>,
  warnings: string[],
): Promise<LiveStreamSession[]> {
  const rebuilt: LiveStreamSession[] = [];
  const channelById = new Map(channels.map(c => [c.id, c]));

  let characters: CharacterProfile[] = [];
  try {
    characters = await DB.getAllCharacters();
  } catch {
    warnings.push('读取角色列表失败，跳过了从旧消息重建直播');
    return rebuilt;
  }

  for (const char of characters) {
    if (!char?.id) continue;
    let messages: Message[] = [];
    try {
      messages = await DB.getMessagesByCharIdAndSources(char.id, ['live']);
    } catch {
      warnings.push(`读取「${char.name || char.id}」的旧直播消息失败，这场没重建`);
      continue;
    }
    if (!Array.isArray(messages) || messages.length === 0) continue;

    const groups = new Map<string, Message[]>();
    messages.forEach(msg => {
      const sid = msg.metadata?.liveSessionId;
      if (!sid || typeof sid !== 'string') return;
      if (existingSessionIds.has(sid)) return;
      const list = groups.get(sid) || [];
      list.push(msg);
      groups.set(sid, list);
    });

    for (const [sessionId, list] of groups) {
      const metaChannelId = list.find(m => m.metadata?.liveChannelId)?.metadata?.liveChannelId;
      let channel = metaChannelId ? channelById.get(String(metaChannelId)) : undefined;
      if (!channel) {
        // 频道没了就退回这个角色的默认频道，并在提示里说明
        try {
          const defaults = await ensureDefaultChannelForChar(char);
          channel = defaults[0];
          if (channel) {
            channelById.set(channel.id, channel);
            warnings.push(`场次 ${sessionId} 原来的频道找不到了，已挂到默认频道「${channel.channelName}」`);
          }
        } catch {
          channel = undefined;
        }
      }
      if (!channel) {
        warnings.push(`场次 ${sessionId} 找不到可用频道，没重建`);
        continue;
      }
      const session = buildSessionFromMessages(sessionId, list, channel, String(char.id));
      if (!session) continue;
      rebuilt.push(session);
      existingSessionIds.add(session.id);
    }
  }

  return rebuilt;
}

// ==================== 主入口 ====================

async function readMigrationDone(): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LIVE_KV, 'readonly');
    const req = tx.objectStore(STORE_LIVE_KV).get(KV_MIGRATION_ID);
    const row = await new Promise<any>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return Boolean(row && row.value && row.value.value === 'done');
  } catch {
    // 表还没建起来（老库还没升到 v77）→ 当没迁过
    return false;
  }
}

/**
 * 启动时调一次。已经迁过就直接返回 skipped，不会重复干活。
 * 拿不到维护锁（正有人在跑图片清理）就跳过，下次启动再迁——绝不硬跑。
 *
 * 同一页面里并发调用会共用同一个 Promise：开发模式开着 StrictMode，启动 effect 会跑两遍，
 * 如果第二遍自己去拿锁会拿到「被占用」，然后读到还没迁完的空数据，界面就空白了。
 */
export async function migrateLiveStorageToIdbOnce(): Promise<LiveMigrationReport> {
  if (!migrationInFlight) {
    migrationInFlight = runMigrationOnce().then(report => {
      // 失败 / 被锁住都清掉缓存，下次调用可以再试一遍
      if (report.status !== 'done' && report.status !== 'skipped') migrationInFlight = null;
      return report;
    });
  }
  return migrationInFlight;
}

let migrationInFlight: Promise<LiveMigrationReport> | null = null;

/** 仅供测试：忘掉缓存的那一次迁移。同一模块实例里要连跑多次迁移时用 */
export function __resetLiveMigrationCache(): void {
  migrationInFlight = null;
}

async function runMigrationOnce(): Promise<LiveMigrationReport> {
  const warnings: string[] = [];
  const counts = emptyCounts();

  if (await readMigrationDone()) {
    return { status: 'skipped', counts, warnings };
  }

  if (!tryAcquireMaintenanceLock(MIGRATION_LOCK_NAME)) {
    return {
      status: 'locked',
      counts,
      warnings,
      error: `另一项存储维护（${currentMaintenanceHolder() || '未知'}）正在进行`,
    };
  }

  try {
    const legacy = readLegacyLiveLayer();

    // ---- 图片换成令牌（同内容只存一份）----
    const channels: StreamerChannelProfile[] = [];
    for (const raw of legacy.channels) {
      const next: StreamerChannelProfile = { ...raw };
      next.avatar = await toBlobRefOrKeep(next.avatar, `频道「${raw.channelName}」头像`, warnings);
      next.roomBackgroundUrl =
        (await toBlobRefOrKeep(next.roomBackgroundUrl, `频道「${raw.channelName}」背景`, warnings)) || '';
      channels.push(next);
    }
    const channelById = new Map(channels.map(c => [c.id, c]));
    const legacyChannelById = new Map(legacy.channels.map(c => [c.id, c]));

    const sessions: LiveStreamSession[] = [];
    for (const raw of legacy.sessions) {
      const next: LiveStreamSession = { ...raw };
      const rawChannel = legacyChannelById.get(raw.channelId);
      // 以前新建直播会把频道背景整张复制进这场，跟频道背景一模一样的就是那份副本，直接清空
      if (next.customBackgroundUrl && rawChannel && next.customBackgroundUrl === rawChannel.roomBackgroundUrl) {
        next.customBackgroundUrl = '';
      } else {
        next.customBackgroundUrl =
          (await toBlobRefOrKeep(next.customBackgroundUrl, `《${raw.title}》的背景`, warnings)) || '';
      }
      if (!channelById.has(next.channelId) && rawChannel) {
        next.channelId = rawChannel.id;
      }
      sessions.push(next);
    }

    const vods: VodVideoPost[] = [];
    for (const raw of legacy.vods) {
      const next: VodVideoPost = { ...raw };
      next.coverImageUrl = await toBlobRefOrKeep(
        next.coverImageUrl,
        `《${raw.title}》的封面`,
        warnings,
      );
      vods.push(next);
    }

    // 旧陪看一律算「还在看」（旧记录根本没有状态字段）
    const npcWatches: NpcWatchSession[] = legacy.npcWatches.map(raw => ({
      ...raw,
      status: 'watching' as const,
    }));

    const kv: Array<{ id: string; value: unknown }> = [];
    if (Array.isArray(legacy.personas) && legacy.personas.length > 0) {
      kv.push({ id: LIVE_KV_IDS.VIEWER_PERSONAS, value: legacy.personas as ViewerPersona[] });
    }
    if (Array.isArray(legacy.npcPool) && legacy.npcPool.length > 0) {
      const pool: NpcStreamerChannelCard[] = legacy.npcPool;
      kv.push({ id: LEGACY_NPC_POOL_KEY_ID, value: pool });
    }
    if (typeof legacy.npcCustomRule === 'string' && legacy.npcCustomRule.trim()) {
      kv.push({ id: LIVE_KV_IDS.NPC_CUSTOM_RULE, value: legacy.npcCustomRule });
    }

    const payload: MigrationPayload = { channels, sessions, vods, npcWatches, kv };

    // ---- 一次事务写完，再校验 ----
    if (channels.length || sessions.length || vods.length || npcWatches.length || kv.length) {
      await writePayloadInOneTx(payload);
    }
    const missing = await verifyMigrated(payload);
    if (missing.length > 0) {
      return {
        status: 'failed',
        counts,
        warnings,
        error: `迁移后校验少了 ${missing.length} 条记录（${missing.slice(0, 3).join('、')}），旧数据全部保留`,
      };
    }

    // ---- 从旧消息里重建能接着播的场次 ----
    const existingIds = await readExistingIds(STORE_LIVE_SESSIONS);
    const rebuilt = await rebuildSessionsFromMessages(channels, existingIds, warnings);
    for (const session of rebuilt) {
      await liveSessionDb.put(session);
    }

    counts.channels = channels.length;
    counts.sessions = sessions.length;
    counts.vods = vods.length;
    counts.npcWatches = npcWatches.length;
    counts.rebuilt = rebuilt.length;

    // ---- 校验通过才写 done、才删旧键 ----
    await openDB().then(db => {
      const tx = db.transaction(STORE_LIVE_KV, 'readwrite');
      tx.objectStore(STORE_LIVE_KV).put({
        id: KV_MIGRATION_ID,
        value: { value: 'done', at: Date.now(), counts },
      });
      return waitTx(tx);
    });

    const removable = [
      LIVE_LOCAL_KEYS.CHANNELS,
      LIVE_LOCAL_KEYS.SESSIONS,
      LIVE_LOCAL_KEYS.VODS,
      LIVE_LOCAL_KEYS.NPC_WATCHES,
      LIVE_LOCAL_KEYS.VIEWER_PERSONAS,
      LIVE_LOCAL_KEYS.NPC_POOL,
      LIVE_LOCAL_KEYS.NPC_CUSTOM_RULE,
      LIVE_LEGACY_LOCAL_KEYS.CHANNELS,
      LIVE_LEGACY_LOCAL_KEYS.SESSIONS,
      LIVE_LEGACY_LOCAL_KEYS.VODS,
      LIVE_LEGACY_LOCAL_KEYS.NPC_WATCHES,
      LIVE_LEGACY_LOCAL_KEYS.VIEWER_PERSONAS,
    ];
    removable.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* 删不掉不影响数据已在 IDB 里这件事 */
      }
    });

    return { status: 'done', counts, warnings };
  } catch (e: any) {
    return {
      status: 'failed',
      counts,
      warnings,
      error: e?.message || '迁移中断，旧数据全部保留',
    };
  } finally {
    releaseMaintenanceLock();
  }
}
