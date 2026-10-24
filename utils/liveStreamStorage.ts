/**
 * 直播与视频平台 App（电波 / OnAir）本地持久化与主聊天 DB 同步工具
 */
import { DB } from './db';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  LiveChunk,
  VodVideoPost,
  NpcWatchSession,
  NpcWatchBeat,
  NpcStreamerChannelCard,
  LivePlatformTheme,
  LiveBeat,
  LivestreamChatCardPayload,
  OnAirRealtimeSettings,
  DEFAULT_ONAIR_REALTIME_SETTINGS,
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

// ==================== 「语音语气标注」开关（Ann 2026-10-25） ====================

/**
 * 关掉 = 不找辅助模型补语气标注、播放直接用原文；不影响中文整理（各管各的）。
 * 默认开。用 localStorage，跟房间里的其他开关同一套存法。
 */
export function loadLiveSpeechPerformEnabled(): boolean {
  try {
    return localStorage.getItem('live_speech_perform_enabled') !== '0';
  } catch {
    return true;
  }
}

export function saveLiveSpeechPerformEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('live_speech_perform_enabled', enabled ? '1' : '0');
  } catch {
    /* 忽略浏览器存储限制 */
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
    danmakuWarmth:
      typeof raw.danmakuWarmth === 'number'
        ? Math.max(0, Math.min(100, Math.round(raw.danmakuWarmth)))
        : 50,
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
              speechTimeline:
                b?.speechTimeline && Array.isArray(b.speechTimeline.segments) && b.speechTimeline.segments.length
                  ? b.speechTimeline
                  : undefined,
              danmaku: Array.isArray(b?.danmaku) ? b.danmaku : [],
            }))
          : [],
        userInputs: Array.isArray(c?.userInputs) ? c.userInputs : [],
        dbMessageId: c?.dbMessageId,
        // 逐轮摘要必须保留：丢掉后聊天卡已是摘要、直播间摘要页却仍显示「仍是原文」
        roundSummary:
          typeof c?.roundSummary === 'string' && c.roundSummary.trim()
            ? c.roundSummary
            : undefined,
        summaryUpdatedAt:
          typeof c?.summaryUpdatedAt === 'number' ? c.summaryUpdatedAt : undefined,
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
    categoryHint: raw?.categoryHint || '',
    categoryNameZh: raw?.categoryNameZh || '',
    categoryNameEn: raw?.categoryNameEn || '',
    customTopic: raw.customTopic || '',
    customBackgroundUrl: raw.customBackgroundUrl || '',
    status: raw.status === 'ended' ? 'ended' : 'live',
    viewerCount,
    peakViewerCount: typeof raw?.peakViewerCount === 'number' ? raw.peakViewerCount : viewerCount,
    likeCount: typeof raw?.likeCount === 'number' ? raw.likeCount : 0,
    totalScRevenue: typeof raw?.totalScRevenue === 'number' ? raw.totalScRevenue : 0,
    totalGiftRevenue: typeof raw?.totalGiftRevenue === 'number' ? raw.totalGiftRevenue : 0,
    chunks,
    rollingSummaries,
    pendingDanmakuQueue: Array.isArray(raw?.pendingDanmakuQueue) ? raw.pendingDanmakuQueue : [],
    pendingGuidance: Array.isArray(raw?.pendingGuidance)
      ? raw.pendingGuidance
          .filter((item: any) => typeof item?.text === 'string' && item.text.trim())
          .map((item: any, idx: number) => ({
            id: String(item.id || `guidance_${raw?.id || 'live'}_${idx}`),
            text: String(item.text).trim(),
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          }))
      : [],
    finalSummary: raw?.finalSummary || '',
    archiveDropMode: raw?.archiveDropMode || raw?.finalArchiveMode,
    finalDbMessageId: raw?.finalDbMessageId,
    finalCardMessageId: raw?.finalCardMessageId,
    startMarkerMessageId: typeof raw?.startMarkerMessageId === 'number' ? raw.startMarkerMessageId : undefined,
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
const KV_ACTIVE_VIEWER_PERSONA = 'active_viewer_persona';
const KV_NPC_POOL = 'npc_pool';
const KV_NPC_CUSTOM_RULE = 'npc_custom_rule';
const KV_ONAIR_REALTIME = 'onair_realtime';

/** live_kv 里的键名，迁移要按同样的名字写，所以对外公开一份 */
export const LIVE_KV_IDS = {
  VIEWER_PERSONAS: KV_VIEWER_PERSONAS,
  ACTIVE_VIEWER_PERSONA: KV_ACTIVE_VIEWER_PERSONA,
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

const defaultViewerPersonaId = (personas: ViewerPersona[]): string =>
  personas.find(persona => persona.isMain)?.id || personas[0]?.id || 'viewer_main_self';

/** 上次使用的观众身份是电波级偏好，保存在现有 live_kv；不能随组件卸载回到本尊。 */
export async function loadActiveViewerPersonaId(personas: ViewerPersona[]): Promise<string> {
  const fallback = defaultViewerPersonaId(personas);
  try {
    const saved = await liveKvDb.get<string>(KV_ACTIVE_VIEWER_PERSONA);
    if (saved && personas.some(persona => persona.id === saved)) return saved;
    await liveKvDb.put(KV_ACTIVE_VIEWER_PERSONA, fallback);
  } catch {
    // 偏好读取失败时仍可正常进入电波，使用身份列表中的本尊。
  }
  return fallback;
}

/** 已删除/不存在的马甲不能继续被选中；安全回退到本尊并保存新选择。 */
export async function saveActiveViewerPersonaId(id: string, personas: ViewerPersona[]): Promise<string> {
  const selected = personas.some(persona => persona.id === id) ? id : defaultViewerPersonaId(personas);
  await liveKvDb.put(KV_ACTIVE_VIEWER_PERSONA, selected);
  return selected;
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

// ---- 电波总控 · 实时背景开关（存现有 live_kv，不新增表、不动 DB 版本）----

export async function loadOnAirRealtimeSettings(): Promise<OnAirRealtimeSettings> {
  const saved = await liveKvDb.get<Partial<OnAirRealtimeSettings>>(KV_ONAIR_REALTIME);
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_ONAIR_REALTIME_SETTINGS };
  // 旧版本可能只存了部分分类：缺的按默认值补，不因为多加了分类就把用户原来的选择清掉
  return {
    enabled: saved.enabled !== false,
    weather: saved.weather !== false,
    news: saved.news !== false,
    jpHot: saved.jpHot !== false,
    time: saved.time !== false,
    location: saved.location !== false,
  };
}

export async function saveOnAirRealtimeSettings(settings: OnAirRealtimeSettings): Promise<void> {
  await liveKvDb.put(KV_ONAIR_REALTIME, settings);
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
            const scTag = d.scAmount ? `[Super Chat ¥${d.scAmount}]` : '';
            const giftTag = d.giftName
              ? `[频道礼物打赏 ${d.giftEmoji || ''}${d.giftName}${d.giftAmount ? ` ¥${d.giftAmount}` : ''}，数字贴纸非实物]`
              : '';
            return `${who}${scTag}${giftTag}: ${d.text}`;
          })
          .join('；')}`
      : '';
    lines.push(`${idx + 1}. 画面：${b.screen} ｜ 台词：${speechPart}${scText}`);
  });

  return lines.join('\n');
}

/**
 * 这一轮的指纹。压缩请求发出去之后，这轮可能又被重 Roll / 编辑，
 * 晚回来的旧摘要要拿它比对，指纹不一样就整份丢掉，不许覆盖新内容。
 */
export function liveRoundSignature(chunk: LiveChunk): string {
  return JSON.stringify({
    index: chunk.index,
    beats: chunk.beats.map(b => [b.screen, b.speechOriginal, (b.danmaku || []).length]),
  });
}

/**
 * 四轮一压，一次只压一轮：返回这一趟该压的那一轮，也就是**最早一条还没有摘要**的。
 * 未压缩的轮次没超过 keepRecent（默认 3）时返回 null——最新几轮永远留原文。
 * 不返回数组、不做批量：一段会话里绝不把两轮合并成一条摘要。
 */
export function pickRoundToFold(chunks: LiveChunk[], keepRecent = 3): LiveChunk | null {
  const uncompressed = [...chunks]
    .sort((a, b) => a.index - b.index)
    .filter(c => !(c.roundSummary && c.roundSummary.trim()));
  if (uncompressed.length <= keepRecent) return null;
  return uncompressed[0];
}

function readLiveRoundCard(message: { content?: string; metadata?: any } | null | undefined): LivestreamChatCardPayload | null {
  if (!message) return null;
  const fromMeta = message.metadata?.scoreCard;
  if (fromMeta?.type === 'livestream_card' && fromMeta?.cardKind === 'live_round') {
    return fromMeta as LivestreamChatCardPayload;
  }
  if (typeof message.content === 'string' && message.content.startsWith('{')) {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed?.type === 'livestream_card' && parsed?.cardKind === 'live_round') {
        return parsed as LivestreamChatCardPayload;
      }
    } catch {
      /* 正文不是卡片 */
    }
  }
  return null;
}

function compressedRoundText(card: LivestreamChatCardPayload | null): string {
  if (!card?.isCompressed) return '';
  return String(card.body || '').trim();
}

/**
 * 私聊轮次卡已经是摘要、直播场次却丢了 roundSummary 时，按消息把摘要补回这一轮。
 * 只认 isCompressed 的卡，原文卡不会被当成摘要。
 */
export async function restoreMissingRoundSummaries(
  session: LiveStreamSession,
  charId: string,
): Promise<LiveStreamSession> {
  const missing = session.chunks.filter(c => !(c.roundSummary && c.roundSummary.trim()));
  if (missing.length === 0 || !charId) return session;

  const found = new Map<string, string>();
  await Promise.all(
    missing.map(async chunk => {
      if (!chunk.dbMessageId) return;
      const msg = await DB.getMessageById(chunk.dbMessageId);
      const card = readLiveRoundCard(msg);
      if (card?.sessionId && card.sessionId !== session.id) return;
      const text = compressedRoundText(card);
      if (text) found.set(chunk.id, text);
    }),
  );

  const still = missing.filter(c => !found.has(c.id));
  if (still.length > 0) {
    const msgs = await DB.getMessagesByCharId(charId);
    const byIndex = new Map<number, string>();
    for (const msg of msgs) {
      const meta = msg.metadata;
      if (meta?.liveSessionId !== session.id) continue;
      const card = readLiveRoundCard(msg);
      const text = compressedRoundText(card);
      if (!text) continue;
      const idx =
        typeof meta?.liveChunkIndex === 'number'
          ? meta.liveChunkIndex
          : typeof card?.roundIndex === 'number'
            ? card.roundIndex - 1
            : -1;
      if (idx >= 0) byIndex.set(idx, text);
    }
    for (const chunk of still) {
      const text = byIndex.get(chunk.index);
      if (text) found.set(chunk.id, text);
    }
  }

  if (found.size === 0) return session;
  const now = Date.now();
  return {
    ...session,
    chunks: session.chunks.map(c => {
      const text = found.get(c.id);
      if (!text) return c;
      return { ...c, roundSummary: text, summaryUpdatedAt: c.summaryUpdatedAt || now };
    }),
  };
}

/** 把一轮的摘要写回它自己那条 chunk，其余轮次原样不动 */
export function applyRoundSummary(
  session: LiveStreamSession,
  chunkId: string,
  summary: string,
): LiveStreamSession {
  const now = Date.now();
  return {
    ...session,
    chunks: session.chunks.map(c =>
      c.id === chunkId ? { ...c, roundSummary: summary, summaryUpdatedAt: now } : c,
    ),
  };
}

/** 逐轮卡正文的一行预览：去掉换行，掐到一个卡片的宽度 */
function buildRoundPreview(body: string): string {
  const flat = (body || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('【'))
    .join(' ')
    .replace(/\s+/g, ' ');
  return flat.length > 70 ? `${flat.slice(0, 70)}…` : flat;
}

/**
 * 一轮直播的原文正文（给聊天卡显示，也给摘要模型当输入）。
 * 与旧 formatChunkForDbMemory 的差别：这里**不筛弹幕**，普通路人、礼物、SC、用户弹幕全在，
 * 因为施工单要求这一轮摘要必须覆盖整轮公屏，而不是只留付费和熟人。
 */
export function formatRoundBody(
  channel: StreamerChannelProfile,
  session: LiveStreamSession,
  chunk: LiveChunk,
): string {
  const modeTag =
    channel.identityMode === 'secret_alt'
      ? `匿名马甲频道「${channel.channelName}」`
      : channel.identityMode === 'vtuber'
      ? `VTuber皮套频道「${channel.channelName}」`
      : `直播频道「${channel.channelName}」`;
  const lines: string[] = [
    `【${modeTag}《${session.title}》· 第 ${chunk.index + 1} 轮】`,
  ];

  chunk.beats.forEach((b, idx) => {
    const speechPart = b.speechTranslated
      ? `「${b.speechOriginal}」（同传：${b.speechTranslated}）`
      : b.speechOriginal
      ? `「${b.speechOriginal}」`
      : '（专注动作未开口）';
    lines.push(`${idx + 1}. 画面：${b.screen} ｜ 台词：${speechPart}`);
    (b.danmaku || []).forEach(d => {
      const tags = [
        d.scAmount && d.scAmount > 0 ? `Super Chat 付费留言 ¥${d.scAmount}` : '',
        d.giftName ? `频道礼物打赏 ${d.giftEmoji || ''}${d.giftName}${d.giftAmount ? ` ¥${d.giftAmount}` : ''}（数字贴纸、非实物）` : '',
        d.isUserMain ? '熟人本尊' : d.isUserAlt ? '熟人小号' : '',
        d.translation ? `译：${d.translation}` : '',
      ].filter(Boolean);
      const who = tags.length > 0 ? `${d.senderName}（${tags.join('·')}）` : d.senderName;
      lines.push(`   弹幕 ${who}：${d.text}`);
    });
  });

  return lines.join('\n');
}

/** 一轮直播在聊天里那张卡要写什么 */
export function buildLiveRoundCard(opts: {
  charId: string;
  charName?: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  chunk: LiveChunk;
  /** 压缩后传进来：卡正文换成这一轮的逐轮摘要 */
  summary?: string;
  /** 这一轮是重 Roll / 编辑出来的，只影响 updatedAt */
  regenerated?: boolean;
}): LivestreamChatCardPayload {
  const { channel, session, chunk } = opts;
  const summaryText = (opts.summary || chunk.roundSummary || '').trim();
  const body = summaryText || formatRoundBody(channel, session, chunk);
  return {
    type: 'livestream_card',
    cardKind: 'live_round',
    sessionId: session.id,
    channelId: channel.id,
    charId: opts.charId,
    charName: opts.charName || '',
    channelName: channel.channelName,
    identityMode: channel.identityMode,
    title: session.title,
    categoryLabel: session.categoryLabel,
    body,
    preview: buildRoundPreview(body),
    roundIndex: chunk.index + 1,
    roundLabel: `第 ${chunk.index + 1} 轮`,
    isCompressed: Boolean(summaryText),
    updatedAt: Date.now(),
    viewerCount: session.viewerCount,
    summary: body,
    createdAt: chunk.createdAt || Date.now(),
  };
}

/** 开播时写入聊天时间线的单条状态标记，下播时更新同一条。 */
export function buildLiveSessionMarkerCard(opts: {
  charId: string;
  charName?: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  status?: 'live' | 'ended';
}): LivestreamChatCardPayload {
  const { channel, session } = opts;
  const status = opts.status || session.status;
  const title = `《${session.title}》`;
  const body = status === 'live'
    ? `你开始了直播${title}（频道：${channel.channelName}）。直播还没有结束，仍在进行中。`
    : `你结束了直播${title}（频道：${channel.channelName}）。这场直播已经下播。`;
  return {
    type: 'livestream_card',
    cardKind: 'live_session_marker',
    sessionId: session.id,
    channelId: channel.id,
    charId: opts.charId,
    charName: opts.charName || '',
    channelName: channel.channelName,
    identityMode: channel.identityMode,
    title: session.title,
    categoryLabel: session.categoryLabel,
    sessionStatus: status,
    body,
    preview: body,
    summary: body,
    createdAt: session.startedAt,
    updatedAt: status === 'ended' ? session.endedAt || Date.now() : session.startedAt,
  };
}

export async function createLiveSessionMarkerInDb(opts: {
  charId: string;
  charName?: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
}): Promise<number> {
  const card = buildLiveSessionMarkerCard({ ...opts, status: 'live' });
  return DB.saveMessage({
    charId: opts.charId,
    role: 'system',
    type: 'score_card',
    content: JSON.stringify(card),
    timestamp: opts.session.startedAt,
    metadata: {
      source: 'live_session_marker',
      scoreCard: card,
      liveSessionId: opts.session.id,
      liveChannelId: opts.channel.id,
    },
  });
}

/** 状态卡已被用户删除时只返回 false，不重建卡。 */
export async function updateLiveSessionMarkerInDb(opts: {
  messageId?: number;
  charId: string;
  charName?: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
}): Promise<boolean> {
  let messageId = opts.messageId || opts.session.startMarkerMessageId;
  if (!messageId) {
    const messages = await DB.getMessagesByCharId(opts.charId);
    messageId = messages.find(message =>
      message.metadata?.source === 'live_session_marker'
      && message.metadata?.liveSessionId === opts.session.id,
    )?.id;
  }
  if (!messageId) return false;
  const existingMarker = await DB.getMessageById(messageId);
  if (!existingMarker) return false;
  const card = buildLiveSessionMarkerCard({ ...opts, status: opts.session.status });
  let markerTimestamp: number | undefined;
  if (opts.session.status === 'ended') {
    markerTimestamp = opts.session.endedAt || Date.now();
    // 结束按钮可能很久以后才点；标记应贴着本场最后一张轮次卡，而不是跳到当时最新的私聊消息。
    const roundMessages = await DB.getMessagesByCharIdAndSources(opts.charId, ['live_round']);
    let lastRoundMessage: (typeof roundMessages)[number] | null = null;
    let lastRoundIndex = Number.NEGATIVE_INFINITY;
    for (const message of roundMessages) {
      const scoreCard = message.metadata?.scoreCard;
      if (message.metadata?.liveSessionId !== opts.session.id && scoreCard?.sessionId !== opts.session.id) continue;
      const metadataIndex = message.metadata?.liveChunkIndex;
      const cardIndex = scoreCard?.roundIndex;
      const chunkIndex = typeof metadataIndex === 'number'
        ? metadataIndex
        : typeof cardIndex === 'number'
        ? cardIndex - 1
        : -1;
      const isLaterSameRound = lastRoundMessage
        && chunkIndex === lastRoundIndex
        && (message.timestamp > lastRoundMessage.timestamp
          || (message.timestamp === lastRoundMessage.timestamp && message.id > lastRoundMessage.id));
      if (!lastRoundMessage || chunkIndex > lastRoundIndex || isLaterSameRound) {
        lastRoundMessage = message;
        lastRoundIndex = chunkIndex;
      }
    }
    if (lastRoundMessage) markerTimestamp = lastRoundMessage.timestamp + 1;
    else {
      // 旧记录没有可检索的私聊轮次卡时，按场次里最大的 chunk.index 找回对应卡。
      for (const chunk of [...(opts.session.chunks || [])].sort((a, b) => b.index - a.index)) {
        if (!chunk.dbMessageId) continue;
        const roundMessage = await DB.getMessageById(chunk.dbMessageId);
        if (roundMessage?.metadata?.liveSessionId === opts.session.id) {
          markerTimestamp = roundMessage.timestamp + 1;
          break;
        }
      }
    }
  }
  if (
    existingMarker.timestamp === markerTimestamp
    && existingMarker.metadata?.scoreCard?.sessionStatus === opts.session.status
  ) return true;
  return writeRoundCardInPlace(messageId, card, markerTimestamp);
}

/** 原位更新一张已有的轮次卡。返回 false = 这张卡已经被用户删了，不重建 */
async function writeRoundCardInPlace(
  messageId: number,
  card: LivestreamChatCardPayload,
  timestamp?: number,
): Promise<boolean> {
  try {
    await DB.updateMessage(messageId, JSON.stringify(card), timestamp);
  } catch (e: any) {
    if (String(e?.message || '').includes('not found')) return false;
    throw e;
  }
  await DB.updateMessageMetadata(messageId, prev => ({
    ...(prev || {}),
    scoreCard: card,
  }));
  return true;
}

/**
 * 把一轮直播写成聊天时间线上的一张可见轮次卡。
 * - 已有 dbMessageId：原位更新那一条（ID / 时间戳 / 位置都不动）
 * - 卡被用户删掉了：不重建，也不另发一张
 * - 没有：新建一条位置在当下
 */
export async function syncLiveChunkToDb(opts: {
  charId: string;
  charName?: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  chunkIndex: number;
  beats: LiveBeat[];
  existingDbMsgId?: number;
  /** 压缩完成时把逐轮摘要一起写进原卡 */
  summary?: string;
}): Promise<number> {
  const chunk: LiveChunk = {
    id: `chunk-db-${opts.session.id}-${opts.chunkIndex}`,
    index: opts.chunkIndex,
    createdAt: Date.now(),
    beats: opts.beats,
    userInputs: [],
    roundSummary: opts.summary,
  };
  const card = buildLiveRoundCard({
    charId: opts.charId,
    charName: opts.charName,
    channel: opts.channel,
    session: opts.session,
    chunk,
    summary: opts.summary,
  });

  if (opts.existingDbMsgId && opts.existingDbMsgId > 0) {
    await writeRoundCardInPlace(opts.existingDbMsgId, card);
    return opts.existingDbMsgId;
  }

  return DB.saveMessage({
    charId: opts.charId,
    role: 'assistant',
    type: 'score_card',
    content: JSON.stringify(card),
    metadata: {
      source: 'live_round',
      scoreCard: card,
      liveSessionId: opts.session.id,
      liveChannelId: opts.channel.id,
      liveChunkIndex: opts.chunkIndex,
    },
  });
}

/**
 * 这一轮压缩完成（或重算摘要）后，把摘要写回它自己的原卡。
 * 不新建消息、不改时间戳。卡若已被删，返回 false，调用方只需记住「这轮没有可见卡」。
 */
export async function updateLiveRoundCardSummary(opts: {
  messageId: number;
  charId: string;
  charName?: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  chunk: LiveChunk;
  summary: string;
}): Promise<boolean> {
  const card = buildLiveRoundCard({
    charId: opts.charId,
    charName: opts.charName,
    channel: opts.channel,
    session: opts.session,
    chunk: opts.chunk,
    summary: opts.summary,
  });
  return writeRoundCardInPlace(opts.messageId, card);
}

/** 一轮陪看在这一拍里的正文：NPC 画面/台词/弹幕 + 角色反应 + 本轮用户互动 */
export function formatNpcBeatBody(session: NpcWatchSession, beat: NpcWatchBeat, charName?: string): string {
  const lines = [
    `【陪看 · ${session.npcStreamerName}《${session.npcRoomTitle}》· 第 ${beat.index + 1} 拍】`,
    `1. 直播画面：${beat.npcScreen}`,
    `   主播说：「${beat.npcSpeech}」`,
  ];
  (beat.npcDanmaku || []).forEach(d => {
    lines.push(`   弹幕 ${d.senderName}：${d.text}`);
  });
  const who = charName || '角色';
  let no = 2;
  if (beat.userActionNote) {
    lines.push(`${no}. 这一拍你的互动：${beat.userActionNote}`);
    no += 1;
  }
  lines.push(`${no}. ${who}的反应：${beat.charReactionAction}「${beat.charReactionSpeech}」`);
  return lines.join('\n');
}

export function buildNpcRoundCard(opts: {
  charId: string;
  charName?: string;
  session: NpcWatchSession;
  beat: NpcWatchBeat;
}): LivestreamChatCardPayload {
  const { session, beat } = opts;
  const body = formatNpcBeatBody(session, beat, opts.charName);
  return {
    type: 'livestream_card',
    cardKind: 'npc_watch_round',
    sessionId: session.id,
    charId: opts.charId,
    charName: opts.charName || '',
    channelName: session.npcStreamerName,
    title: session.npcRoomTitle,
    categoryLabel: session.npcCategoryLabel,
    npcStreamerName: session.npcStreamerName,
    npcRoomTitle: session.npcRoomTitle,
    body,
    preview: buildRoundPreview(body),
    roundIndex: beat.index + 1,
    roundLabel: `第 ${beat.index + 1} 拍`,
    isCompressed: false,
    updatedAt: Date.now(),
    viewerCount: session.viewerCount,
    summary: body,
    createdAt: Date.now(),
  };
}

/** 一拍陪看写一张可见卡；已有 dbMessageId 时原位更新 */
export async function syncNpcBeatToDb(opts: {
  charId: string;
  charName?: string;
  session: NpcWatchSession;
  beat: NpcWatchBeat;
  existingDbMsgId?: number;
}): Promise<number> {
  const card = buildNpcRoundCard(opts);
  if (opts.existingDbMsgId && opts.existingDbMsgId > 0) {
    await writeRoundCardInPlace(opts.existingDbMsgId, card);
    return opts.existingDbMsgId;
  }
  return DB.saveMessage({
    charId: opts.charId,
    role: 'assistant',
    type: 'score_card',
    content: JSON.stringify(card),
    metadata: {
      source: 'live_npc_round',
      scoreCard: card,
      npcSessionId: opts.session.id,
      npcBeatIndex: opts.beat.index,
    },
  });
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
