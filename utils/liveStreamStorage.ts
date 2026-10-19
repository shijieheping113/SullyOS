/**
 * 直播与视频平台 App（电波 / OnAir）本地持久化与主聊天 DB 同步工具
 */
import { DB } from './db';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  VodVideoPost,
  NpcWatchSession,
  NpcStreamerChannelCard,
  LivePlatformTheme,
  LiveBeat,
  STREAM_PRESET_TEMPLATES,
  DEFAULT_NPC_CHANNELS,
} from './liveStreamTypes';
import type { CharacterProfile, UserProfile } from '../types';
import {
  liveChannelDb,
  liveSessionDb,
  liveVodDb,
  liveNpcWatchDb,
  liveKvDb,
} from './liveStreamDb';

const STORAGE_KEYS = {
  CHANNELS: 'sully_livestream_channels_v1',
  VIEWER_PERSONAS: 'sully_livestream_viewer_personas_v1',
  SESSIONS: 'sully_livestream_sessions_v1',
  VODS: 'sully_livestream_vod_posts_v1',
  NPC_WATCHES: 'sully_livestream_npc_watches_v1',
  NPC_POOL: 'sully_livestream_npc_pool_v2',
  NPC_CUSTOM_RULE: 'sully_livestream_npc_custom_rule_v1',
  PLATFORM_THEME: 'sully_livestream_platform_theme_v1',
};

/** 兼容初版 (f9eed926) 使用的旧 localStorage 键名，自动无损合并迁移，绝不丢记录 */
const LEGACY_STORAGE_KEYS = {
  CHANNELS: 'sully_onair_channels_v1',
  VIEWER_PERSONAS: 'sully_onair_viewer_personas_v1',
  SESSIONS: 'sully_onair_live_sessions_v1',
  VODS: 'sully_onair_vod_posts_v1',
  NPC_WATCHES: 'sully_onair_npc_watches_v1',
};

const BRIGHT_FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #dbeafe 0%, #ede9fe 55%, #fce7f3 100%)',
  'linear-gradient(135deg, #d1fae5 0%, #e0f2fe 60%, #dbeafe 100%)',
  'linear-gradient(135deg, #f3e8ff 0%, #fce7f3 60%, #ffe4e6 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fef3c7 55%, #ffe4e6 100%)',
];

export function normalizeBrightGradient(grad?: string, seed = 0): string {
  if (!grad) return BRIGHT_FALLBACK_GRADIENTS[seed % BRIGHT_FALLBACK_GRADIENTS.length];
  // 将旧版深色背景自动替换为明亮浅色渐变
  if (/#0f|#18|#1e|#2563eb|#059669|#4f46e5|#7e22ce|#ea580c|#db2777|#0ea5e9|#6366f1|#10b981/i.test(grad)) {
    return BRIGHT_FALLBACK_GRADIENTS[seed % BRIGHT_FALLBACK_GRADIENTS.length];
  }
  return grad;
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 写失败的通知器现在住在 IDB 读写层（utils/liveStreamDb.ts），这里只做转出口，
 * 免得调用方（LiveStreamApp）改 import 路径。
 */
export { setLiveStorageWriteErrorHandler } from './liveStreamDb';

// ==================== 平台 UI 皮肤切换 (YouTube vs NicoNico) ====================

export function loadPlatformTheme(): LivePlatformTheme {
  const saved = localStorage.getItem(STORAGE_KEYS.PLATFORM_THEME);
  return saved === 'niconico' ? 'niconico' : 'youtube';
}

export function savePlatformTheme(theme: LivePlatformTheme): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLATFORM_THEME, theme);
  } catch (e) {
    // 皮肤偏好很小，写不上只影响下次打开时的默认样子，本次切换照常生效
    console.warn('[LiveStream] 保存平台皮肤失败', e);
  }
}

/** 合并新旧两个 localStorage 键中的数组记录（按 id 去重，新记录优先，旧记录无损保留）。只读。 */
export function readAndMergeDualKeys<T extends { id: string }>(
  primaryKey: string,
  legacyKey: string,
  normalizer: (item: any, index: number) => T,
): T[] {
  const primaryList = safeReadJson<any[]>(primaryKey, []);
  const legacyList = safeReadJson<any[]>(legacyKey, []);
  const map = new Map<string, T>();

  // 先放旧键数据，再放主键数据（主键有更新时覆盖同 id，不同 id 的历史记录全部保留）
  legacyList.forEach((raw, idx) => {
    if (raw && typeof raw === 'object' && raw.id) {
      map.set(String(raw.id), normalizer(raw, idx));
    }
  });
  primaryList.forEach((raw, idx) => {
    if (raw && typeof raw === 'object' && raw.id) {
      map.set(String(raw.id), normalizer(raw, idx));
    }
  });

  return Array.from(map.values());
}

function normalizeChannelRecord(raw: any, idx = 0): StreamerChannelProfile {
  const vc = raw?.voiceConfig || {};
  return {
    id: String(raw.id),
    charId: String(raw.charId || ''),
    channelName: raw.channelName || 'Official Channel',
    handle: raw.handle || '@live_channel',
    avatar: raw.avatar,
    roomBackgroundUrl: raw.roomBackgroundUrl || '',
    bannerGradient: normalizeBrightGradient(raw.bannerGradient || raw.coverGradient, idx),
    identityMode: raw.identityMode || 'public_main',
    bio: raw.bio || '',
    streamerPersonaPrompt: raw.streamerPersonaPrompt ?? raw.personaPrompt ?? '',
    followerCount: typeof raw.followerCount === 'number' ? raw.followerCount : 12800,
    fanBadgeName: raw.fanBadgeName || 'Member',
    defaultCategory: raw.defaultCategory || 'just_chatting',
    voiceConfig: {
      language: vc.language || '',
      enableTranslation: Boolean(vc.enableTranslation ?? vc.translationEnabled),
      autoPlayTts: Boolean(vc.autoPlayTts),
      overrideVoiceId: vc.overrideVoiceId || '',
    },
    customGifts: Array.isArray(raw.customGifts) && raw.customGifts.length > 0
      ? raw.customGifts
      : [
          { id: 'gift_1', name: 'Iced Americano', emoji: '☕', price: 15, currencySymbol: '¥' },
          { id: 'gift_2', name: 'Glow Stick', emoji: '🪄', price: 30, currencySymbol: '¥' },
          { id: 'gift_3', name: 'Late Night Ramen', emoji: '🍜', price: 88, currencySymbol: '¥' },
          { id: 'gift_4', name: 'Champagne Tower', emoji: '🥂', price: 520, currencySymbol: '¥' },
        ],
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || raw.createdAt || Date.now(),
  };
}

function normalizeLiveSessionRecord(raw: any): LiveStreamSession {
  const chunks = Array.isArray(raw?.chunks)
    ? raw.chunks.map((c: any, cIdx: number) => ({
        id: String(c?.id || `chunk_${raw?.id || 's'}_${cIdx}`),
        index: typeof c?.index === 'number' ? c.index : cIdx,
        createdAt: c?.createdAt || raw?.startedAt || Date.now(),
        beats: Array.isArray(c?.beats)
          ? c.beats.map((b: any, bIdx: number) => ({
              ...b,
              id: String(b?.id || `beat_${c?.id || cIdx}_${bIdx}`),
              chunkId: String(b?.chunkId || c?.id || `chunk_${cIdx}`),
              index: typeof b?.index === 'number' ? b.index : bIdx,
              screen: b?.screen || '',
              speechOriginal: b?.speechOriginal || '',
              speechTranslated: b?.speechTranslated || '',
              audioUrl: b?.audioUrl || b?.ttsAudioUrl || undefined,
              danmaku: Array.isArray(b?.danmaku) ? b.danmaku : [],
            }))
          : [],
        userInputs: Array.isArray(c?.userInputs) ? c.userInputs : [],
        dbMessageId: c?.dbMessageId,
        folded: Boolean(c?.folded),
        foldedBySummaryId: c?.foldedBySummaryId,
      }))
    : [];

  const rollingSummaries = Array.isArray(raw?.rollingSummaries)
    ? raw.rollingSummaries.map((r: any, rIdx: number) => {
        const fromIdx = typeof r?.fromChunkIndex === 'number' ? r.fromChunkIndex : 0;
        const toIdx = typeof r?.toChunkIndex === 'number' ? r.toChunkIndex : fromIdx;
        const supersededChunkIds = Array.isArray(r?.supersededChunkIds)
          ? r.supersededChunkIds
          : chunks
              .filter((ck: any) => ck.index >= fromIdx && ck.index <= toIdx)
              .map((ck: any) => ck.id);
        return {
          id: String(r?.id || `rsum_${raw?.id || 's'}_${rIdx}`),
          fromChunkIndex: fromIdx,
          toChunkIndex: toIdx,
          content: r?.content || '',
          createdAt: r?.createdAt || Date.now(),
          dbMessageId: r?.dbMessageId,
          supersededChunkIds,
        };
      })
    : [];

  const viewerCount = typeof raw?.viewerCount === 'number' ? raw.viewerCount : 1200;

  return {
    ...raw,
    id: String(raw.id),
    channelId: String(raw.channelId || ''),
    charId: String(raw.charId || ''),
    title: raw.title || '无题直播',
    categoryKey: raw.categoryKey || 'just_chatting',
    categoryLabel: raw.categoryLabel || '杂谈 · Just Chatting',
    customTopic: raw.customTopic || '',
    customBackgroundUrl: raw.customBackgroundUrl || '',
    status: raw.status === 'ended' ? 'ended' : 'live',
    viewerCount,
    peakViewerCount: typeof raw?.peakViewerCount === 'number' ? raw.peakViewerCount : viewerCount,
    likeCount: typeof raw?.likeCount === 'number' ? raw.likeCount : 0,
    totalScRevenue: typeof raw?.totalScRevenue === 'number' ? raw.totalScRevenue : 0,
    chunks,
    rollingSummaries,
    pendingDanmakuQueue: Array.isArray(raw?.pendingDanmakuQueue) ? raw.pendingDanmakuQueue : [],
    finalSummary: raw?.finalSummary || '',
    archiveDropMode: raw?.archiveDropMode || raw?.finalArchiveMode,
    finalDbMessageId: raw?.finalDbMessageId,
    finalCardMessageId: raw?.finalCardMessageId,
    foldEveryNChunks: raw?.foldEveryNChunks || 4,
    foldKeepRecentChunks: raw?.foldKeepRecentChunks || 2,
    startedAt: raw?.startedAt || Date.now(),
    endedAt: raw?.endedAt,
  };
}

function normalizeVodPostRecord(raw: any, idx = 0): VodVideoPost {
  const chapters = Array.isArray(raw?.chapters)
    ? raw.chapters.map((ch: any, cIdx: number) => ({
        ...ch,
        id: String(ch?.id || `vch_${raw?.id || 'v'}_${cIdx}`),
        timestampLabel: ch?.timestampLabel || `0${cIdx}:00`,
        chapterTitle: ch?.chapterTitle || `Chapter ${cIdx + 1}`,
        screen: ch?.screen || '',
        speechOriginal: ch?.speechOriginal || '',
        speechTranslated: ch?.speechTranslated || '',
        audioUrl: ch?.audioUrl || ch?.ttsAudioUrl || undefined,
        danmaku: Array.isArray(ch?.danmaku) ? ch.danmaku : [],
      }))
    : [];

  return {
    ...raw,
    id: String(raw.id),
    channelId: String(raw.channelId || ''),
    charId: String(raw.charId || ''),
    title: raw.title || '未命名视频投稿',
    categoryLabel: raw.categoryLabel || 'Vlog · 日常',
    coverGradient: normalizeBrightGradient(raw.coverGradient, idx),
    durationLabel: raw.durationLabel || '08:24',
    viewsCount: typeof raw.viewsCount === 'number' ? raw.viewsCount : 1200,
    likesCount: typeof raw.likesCount === 'number' ? raw.likesCount : 180,
    coinsCount: typeof raw.coinsCount === 'number' ? raw.coinsCount : 0,
    favoritesCount: typeof raw.favoritesCount === 'number' ? raw.favoritesCount : 60,
    streamerPinnedNote: raw.streamerPinnedNote ?? raw.streamerPinNote ?? '',
    chapters,
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    createdAt: raw.createdAt || Date.now(),
  };
}

function normalizeNpcWatchSessionRecord(raw: any, idx = 0): NpcWatchSession {
  const beats = Array.isArray(raw?.beats)
    ? raw.beats.map((b: any, bIdx: number) => ({
        ...b,
        id: String(b?.id || `npcbeat_${raw?.id || 'n'}_${bIdx}`),
        npcScreen: b?.npcScreen || '',
        npcSpeech: b?.npcSpeech || '',
        npcDanmaku: Array.isArray(b?.npcDanmaku)
          ? b.npcDanmaku.map((dm: any, dIdx: number) =>
              typeof dm === 'string'
                ? { id: `npcdm_${bIdx}_${dIdx}`, senderName: '观众', text: dm }
                : {
                    id: String(dm?.id || `npcdm_${bIdx}_${dIdx}`),
                    senderName: dm?.senderName || '观众',
                    text: dm?.text || '',
                    translation: dm?.translation,
                  },
            )
          : [],
        charReactionAction: b?.charReactionAction || '',
        charReactionSpeech: b?.charReactionSpeech || '',
        charReactionTranslated: b?.charReactionTranslated || '',
        charEmotion: b?.charEmotion || 'calm',
        userActionNote: b?.userActionNote,
        audioUrl: b?.audioUrl || b?.ttsAudioUrl || undefined,
        dbMessageId: b?.dbMessageId,
      }))
    : [];

  return {
    ...raw,
    id: String(raw.id),
    charId: String(raw.charId || ''),
    npcStreamerName: raw.npcStreamerName || '路人主播',
    npcHandle: raw.npcHandle || '@live_stream',
    npcCategoryLabel: raw.npcCategoryLabel || '直播间',
    npcRoomTitle: raw.npcRoomTitle || '直播间',
    npcBio: raw.npcBio || '',
    customRulePrompt: raw.customRulePrompt,
    coverGradient: normalizeBrightGradient(raw.coverGradient, idx),
    viewerCount: typeof raw.viewerCount === 'number' ? raw.viewerCount : 1000,
    beats,
    createdAt: raw.createdAt || Date.now(),
  };
}

// ==================== 频道档案管理（支持一个 Char 多个频道） ====================

export async function loadAllChannels(): Promise<StreamerChannelProfile[]> {
  const rows = await liveChannelDb.getAll();
  return rows.map((row, idx) => normalizeChannelRecord(row, idx));
}

/** 获取指定角色的所有频道；若还没有，则自动为其初始化一个默认公开主频道 */
export async function ensureDefaultChannelForChar(char: CharacterProfile): Promise<StreamerChannelProfile[]> {
  const all = await loadAllChannels();
  const charChannels = all.filter(c => c.charId === char.id);
  if (charChannels.length > 0) return charChannels;

  const defaultLang = (char.voiceProfile?.languageBoost || '').trim();
  const defaultChannel: StreamerChannelProfile = {
    id: `ch_main_${char.id}`,
    charId: char.id,
    channelName: `${char.name} Official`,
    handle: `@${char.name.replace(/\s+/g, '_').toLowerCase()}_ch`,
    avatar: char.avatar,
    roomBackgroundUrl: '',
    bannerGradient: STREAM_PRESET_TEMPLATES[0].bannerGradient,
    identityMode: 'public_main',
    bio: `${char.name} 的个人频道 · 日常配信与视频投稿`,
    streamerPersonaPrompt: '保持本人真实性格，镜头前自然随性，75%精力推进自己的直播内容，偶尔看聊天栏接梗。',
    followerCount: 12800,
    fanBadgeName: 'Member',
    defaultCategory: 'just_chatting',
    voiceConfig: {
      language: defaultLang,
      enableTranslation: Boolean(defaultLang && defaultLang !== 'zh'),
      autoPlayTts: false,
      overrideVoiceId: '',
    },
    customGifts: [
      { id: 'gift_1', name: 'Iced Americano', emoji: '☕', price: 15, currencySymbol: '¥' },
      { id: 'gift_2', name: 'Glow Stick', emoji: '🪄', price: 30, currencySymbol: '¥' },
      { id: 'gift_3', name: 'Late Night Ramen', emoji: '🍜', price: 88, currencySymbol: '¥' },
      { id: 'gift_4', name: 'Champagne Tower', emoji: '🥂', price: 520, currencySymbol: '¥' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await liveChannelDb.put(defaultChannel);
  return [defaultChannel];
}

/** 只写这一条频道，不再「读出全部 → 改 → 整份写回」 */
export async function upsertChannel(channel: StreamerChannelProfile): Promise<void> {
  await liveChannelDb.put({ ...channel, updatedAt: Date.now() });
}

export async function deleteChannelById(channelId: string): Promise<void> {
  await liveChannelDb.delete(channelId);
}

// ==================== 用户大小号马甲管理（物理隔离防穿帮） ====================

const KV_VIEWER_PERSONAS = 'viewer_personas';
const KV_NPC_POOL = 'npc_pool';
const KV_NPC_CUSTOM_RULE = 'npc_custom_rule';

/** live_kv 里的键名，迁移要按同样的名字写，所以对外公开一份 */
export const LIVE_KV_IDS = {
  VIEWER_PERSONAS: KV_VIEWER_PERSONAS,
  NPC_POOL: KV_NPC_POOL,
  NPC_CUSTOM_RULE: KV_NPC_CUSTOM_RULE,
};

const normalizePersonaRecord = (raw: any): ViewerPersona => ({
  id: String(raw?.id || ''),
  name: raw?.name || '观众',
  isMain: Boolean(raw?.isMain),
  fanLevel: typeof raw?.fanLevel === 'number' ? raw.fanLevel : 5,
  badgeText: raw?.badgeText || 'Member',
  note: raw?.note || '',
});

export async function loadViewerPersonas(userProfile?: UserProfile): Promise<ViewerPersona[]> {
  const mainName = (userProfile?.name || '我').trim() || '我';
  const rawList = (await liveKvDb.get<any[]>(KV_VIEWER_PERSONAS)) || [];
  const stored = rawList
    .filter(raw => raw && typeof raw === 'object' && raw.id)
    .map(normalizePersonaRecord);

  const hasMain = stored.some(p => p.isMain);
  if (stored.length > 0 && hasMain) {
    return stored.map(p => (p.isMain ? { ...p, name: mainName } : p));
  }

  const defaults: ViewerPersona[] = [
    {
      id: 'viewer_main_self',
      name: mainName,
      isMain: true,
      fanLevel: 24,
      badgeText: 'Member ★',
      note: '我的本尊大号（主播认识我）',
    },
    {
      id: 'viewer_alt_passerby',
      name: 'momo_8921',
      isMain: false,
      fanLevel: 3,
      badgeText: 'New',
      note: '匿名路人小号（主播完全不知道这是我，只当普通观众）',
    },
    {
      id: 'viewer_alt_rich',
      name: 'SilentPatron_K',
      isMain: false,
      fanLevel: 18,
      badgeText: 'VIP',
      note: '匿名榜一老板马甲（高冷砸SC，主播不知道真实身份）',
    },
  ];
  // 保留旧库里用户自己建过的非默认小号
  const customAlts = stored.filter(
    p => !p.isMain && p.id !== 'viewer_alt_passerby' && p.id !== 'viewer_alt_rich',
  );
  const mergedDefaults = [...defaults, ...customAlts];
  await saveViewerPersonas(mergedDefaults);
  return mergedDefaults;
}

export async function saveViewerPersonas(personas: ViewerPersona[]): Promise<void> {
  await liveKvDb.put(KV_VIEWER_PERSONAS, personas);
}

// ==================== 直播会话管理 ====================

export async function loadLiveSessions(): Promise<LiveStreamSession[]> {
  const rows = await liveSessionDb.getAll();
  return rows
    .map(row => normalizeLiveSessionRecord(row))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

/** 只写这一场，别的场次不受影响（以前是整份数组重写，既慢又会被并发覆盖） */
export async function upsertLiveSession(session: LiveStreamSession): Promise<void> {
  await liveSessionDb.put(session);
}

export async function deleteLiveSession(sessionId: string): Promise<void> {
  await liveSessionDb.delete(sessionId);
}

// ==================== VOD 视频投稿管理 ====================

export async function loadVodPosts(): Promise<VodVideoPost[]> {
  const rows = await liveVodDb.getAll();
  return rows
    .map((row, idx) => normalizeVodPostRecord(row, idx))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function upsertVodPost(post: VodVideoPost): Promise<void> {
  await liveVodDb.put(post);
}

export async function deleteVodPost(postId: string): Promise<void> {
  await liveVodDb.delete(postId);
}

// ==================== NPC 陪看会话与可自定义 NPC 频道池 ====================

export async function loadNpcChannelPool(): Promise<NpcStreamerChannelCard[]> {
  const saved = (await liveKvDb.get<NpcStreamerChannelCard[]>(KV_NPC_POOL)) || [];
  return Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_NPC_CHANNELS;
}

export async function saveNpcChannelPool(pool: NpcStreamerChannelCard[]): Promise<void> {
  await liveKvDb.put(KV_NPC_POOL, pool);
}

export async function loadNpcCustomRule(): Promise<string> {
  const saved = await liveKvDb.get<string>(KV_NPC_CUSTOM_RULE);
  return typeof saved === 'string' ? saved : '';
}

export async function saveNpcCustomRule(rule: string): Promise<void> {
  await liveKvDb.put(KV_NPC_CUSTOM_RULE, rule);
}

export async function loadNpcWatchSessions(): Promise<NpcWatchSession[]> {
  const rows = await liveNpcWatchDb.getAll();
  return rows
    .map((row, idx) => normalizeNpcWatchSessionRecord(row, idx))
    .map(row => ({ ...row, status: (row.status === 'ended' ? 'ended' : 'watching') as 'watching' | 'ended' }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function upsertNpcWatchSession(session: NpcWatchSession): Promise<void> {
  await liveNpcWatchDb.put(session);
}

export async function deleteNpcWatchSession(sessionId: string): Promise<void> {
  await liveNpcWatchDb.delete(sessionId);
}

// ==================== 旧 localStorage 层（只给一次性迁移读）====================

export const LIVE_LOCAL_KEYS = STORAGE_KEYS;
export const LIVE_LEGACY_LOCAL_KEYS = LEGACY_STORAGE_KEYS;
export {
  normalizeChannelRecord,
  normalizeLiveSessionRecord,
  normalizeVodPostRecord,
  normalizeNpcWatchSessionRecord,
};

export interface LegacyLiveLayer {
  channels: StreamerChannelProfile[];
  sessions: LiveStreamSession[];
  vods: VodVideoPost[];
  npcWatches: NpcWatchSession[];
  personas: ViewerPersona[];
  npcPool: NpcStreamerChannelCard[] | null;
  npcCustomRule: string | null;
}

/** 把 localStorage 里新旧两套键按 id 合并读出来；只读，不改动任何东西 */
export function readLegacyLiveLayer(): LegacyLiveLayer {
  const rawPersonas = readAndMergeDualKeys<ViewerPersona>(
    STORAGE_KEYS.VIEWER_PERSONAS,
    LEGACY_STORAGE_KEYS.VIEWER_PERSONAS,
    normalizePersonaRecord,
  );
  return {
    channels: readAndMergeDualKeys(STORAGE_KEYS.CHANNELS, LEGACY_STORAGE_KEYS.CHANNELS, normalizeChannelRecord),
    sessions: readAndMergeDualKeys(STORAGE_KEYS.SESSIONS, LEGACY_STORAGE_KEYS.SESSIONS, normalizeLiveSessionRecord),
    vods: readAndMergeDualKeys(STORAGE_KEYS.VODS, LEGACY_STORAGE_KEYS.VODS, normalizeVodPostRecord),
    npcWatches: readAndMergeDualKeys(
      STORAGE_KEYS.NPC_WATCHES,
      LEGACY_STORAGE_KEYS.NPC_WATCHES,
      normalizeNpcWatchSessionRecord,
    ),
    personas: rawPersonas,
    npcPool: safeReadJson<NpcStreamerChannelCard[] | null>(STORAGE_KEYS.NPC_POOL, null),
    npcCustomRule: localStorage.getItem(STORAGE_KEYS.NPC_CUSTOM_RULE),
  };
}

// ==================== 语音音频下载辅助 ====================

export async function downloadVoiceAudioUrl(audioUrl: string, filenamePrefix = 'voice'): Promise<void> {
  if (!audioUrl) return;
  try {
    const res = await fetch(audioUrl);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : 'mp3';
    a.download = `${filenamePrefix}_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  } catch {
    const a = document.createElement('a');
    a.href = audioUrl;
    a.target = '_blank';
    a.download = `${filenamePrefix}_${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// ==================== 与主聊天 DB 的实时同步 & 顶替（Supersede） ====================

export function formatChunkForDbMemory(
  channel: StreamerChannelProfile,
  session: LiveStreamSession,
  chunkIndex: number,
  beats: LiveBeat[],
): string {
  const modeTag =
    channel.identityMode === 'secret_alt'
      ? `匿名马甲频道「${channel.channelName}」`
      : channel.identityMode === 'vtuber'
      ? `VTuber皮套频道「${channel.channelName}」`
      : `直播频道「${channel.channelName}」`;

  const lines: string[] = [
    `[直播实时切片 · ${modeTag}《${session.title}》第 ${chunkIndex + 1} 段]`,
  ];

  beats.forEach((b, idx) => {
    const speechPart = b.speechTranslated
      ? `「${b.speechOriginal}」（同传：${b.speechTranslated}）`
      : b.speechOriginal
      ? `「${b.speechOriginal}」`
      : '（专注动作未开口）';
    const scList = (b.danmaku || []).filter(d => (d.scAmount && d.scAmount > 0) || d.giftName || d.isUserMain || d.isUserAlt);
    const scText = scList.length
      ? ` ｜ 互动：${scList
          .map(d => {
            const who = d.isUserMain ? `${d.senderName}(熟人本尊)` : `观众「${d.senderName}」`;
            const scTag = d.scAmount ? `[SC ¥${d.scAmount}]` : d.giftName ? `[送出 ${d.giftEmoji || ''}${d.giftName}]` : '';
            return `${who}${scTag}: ${d.text}`;
          })
          .join('；')}`
      : '';
    lines.push(`${idx + 1}. 画面：${b.screen} ｜ 台词：${speechPart}${scText}`);
  });

  return lines.join('\n');
}

export async function syncLiveChunkToDb(opts: {
  charId: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  chunkIndex: number;
  beats: LiveBeat[];
  existingDbMsgId?: number;
}): Promise<number> {
  const content = formatChunkForDbMemory(opts.channel, opts.session, opts.chunkIndex, opts.beats);
  if (opts.existingDbMsgId && opts.existingDbMsgId > 0) {
    await DB.updateMessage(opts.existingDbMsgId, content);
    return opts.existingDbMsgId;
  }
  const id = await DB.saveMessage({
    charId: opts.charId,
    role: 'assistant',
    type: 'text',
    content,
    metadata: {
      source: 'live',
      liveSessionId: opts.session.id,
      liveChannelId: opts.channel.id,
      liveChunkIndex: opts.chunkIndex,
    },
  });
  return id;
}

export async function supersedeLiveMessagesWithSummary(opts: {
  charId: string;
  sessionId: string;
  channelId: string;
  summaryText: string;
  supersededMsgIds: number[];
  existingSummaryDbId?: number;
  isFinal?: boolean;
}): Promise<number> {
  for (const oldId of opts.supersededMsgIds) {
    if (typeof oldId === 'number' && oldId > 0) {
      try {
        await DB.updateMessageMetadata(oldId, prev => ({
          ...(prev || {}),
          superseded: true,
          supersededBySession: opts.sessionId,
        }));
      } catch (e) {
        // 只是给旧消息补一个「被摘要顶替」的记号，现在既不隐藏也不影响记忆，失败不必惊动用户
        console.warn('[LiveStream] 旧消息标记 superseded 失败', oldId, e);
      }
    }
  }

  const tag = opts.isFinal ? '[本场直播全貌总结]' : '[直播阶段滚动摘要]';
  const fullContent = `${tag}\n${opts.summaryText.trim()}`;

  if (opts.existingSummaryDbId && opts.existingSummaryDbId > 0) {
    await DB.updateMessage(opts.existingSummaryDbId, fullContent);
    return opts.existingSummaryDbId;
  }

  const newId = await DB.saveMessage({
    charId: opts.charId,
    role: 'system',
    type: 'text',
    content: fullContent,
    metadata: {
      source: 'live',
      liveSessionId: opts.sessionId,
      liveChannelId: opts.channelId,
      isLiveSummary: true,
      isFinalLiveSummary: Boolean(opts.isFinal),
    },
  });
  return newId;
}

export async function forgetLiveSessionInDb(session: LiveStreamSession): Promise<void> {
  const idsToForget: number[] = [];
  session.chunks.forEach(c => {
    if (c.dbMessageId) idsToForget.push(c.dbMessageId);
  });
  session.rollingSummaries.forEach(r => {
    if (r.dbMessageId) idsToForget.push(r.dbMessageId);
  });
  if (session.finalDbMessageId) idsToForget.push(session.finalDbMessageId);

  for (const id of idsToForget) {
    try {
      await DB.updateMessageMetadata(id, prev => ({
        ...(prev || {}),
        archiveMode: 'forget',
        superseded: true,
      }));
    } catch (e) {
      // 同上：兼容用的旧标记，写不上不影响本场数据和显示，只记一条日志
      console.warn('[LiveStream] 旧消息标记 forget 失败', id, e);
    }
  }
}
