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

function safeWriteJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[LiveStreamStorage] Failed to write localStorage:', key, e);
  }
}

// ==================== 平台 UI 皮肤切换 (YouTube vs NicoNico) ====================

export function loadPlatformTheme(): LivePlatformTheme {
  const saved = localStorage.getItem(STORAGE_KEYS.PLATFORM_THEME);
  return saved === 'niconico' ? 'niconico' : 'youtube';
}

export function savePlatformTheme(theme: LivePlatformTheme): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLATFORM_THEME, theme);
  } catch {}
}

/** 合并新旧两个 localStorage 键中的数组记录（按 id 去重，新记录优先，旧记录无损保留） */
function readAndMergeDualKeys<T extends { id: string }>(
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

  const merged = Array.from(map.values());
  // 如果从旧键迁移出了主键没有的记录，自动同步写回主键，确保后续读写一致
  if (legacyList.length > 0 && merged.length !== primaryList.length) {
    safeWriteJson(primaryKey, merged);
  }
  return merged;
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

export function loadAllChannels(): StreamerChannelProfile[] {
  return readAndMergeDualKeys(
    STORAGE_KEYS.CHANNELS,
    LEGACY_STORAGE_KEYS.CHANNELS,
    normalizeChannelRecord,
  );
}

export function saveAllChannels(channels: StreamerChannelProfile[]): void {
  safeWriteJson(STORAGE_KEYS.CHANNELS, channels);
  safeWriteJson(LEGACY_STORAGE_KEYS.CHANNELS, channels);
}

/** 获取指定角色的所有频道；若还没有，则自动为其初始化一个默认公开主频道 */
export function ensureDefaultChannelForChar(char: CharacterProfile): StreamerChannelProfile[] {
  const all = loadAllChannels();
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

  const next = [...all, defaultChannel];
  saveAllChannels(next);
  return [defaultChannel];
}

export function upsertChannel(channel: StreamerChannelProfile): StreamerChannelProfile[] {
  const all = loadAllChannels();
  const idx = all.findIndex(c => c.id === channel.id);
  const next = idx >= 0
    ? all.map((c, i) => (i === idx ? { ...channel, updatedAt: Date.now() } : c))
    : [...all, { ...channel, updatedAt: Date.now() }];
  saveAllChannels(next);
  return next;
}

export function deleteChannelById(channelId: string): StreamerChannelProfile[] {
  const all = loadAllChannels();
  const next = all.filter(c => c.id !== channelId);
  saveAllChannels(next);
  return next;
}

// ==================== 用户大小号马甲管理（物理隔离防穿帮） ====================

export function loadViewerPersonas(userProfile?: UserProfile): ViewerPersona[] {
  const mainName = (userProfile?.name || '我').trim() || '我';
  const stored = readAndMergeDualKeys<ViewerPersona>(
    STORAGE_KEYS.VIEWER_PERSONAS,
    LEGACY_STORAGE_KEYS.VIEWER_PERSONAS,
    raw => ({
      id: String(raw.id),
      name: raw.name || '观众',
      isMain: Boolean(raw.isMain),
      avatar: raw.avatar,
      fanLevel: typeof raw.fanLevel === 'number' ? raw.fanLevel : 5,
      badgeText: raw.badgeText || 'Member',
      note: raw.note || '',
    }),
  );

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
  saveViewerPersonas(mergedDefaults);
  return mergedDefaults;
}

export function saveViewerPersonas(personas: ViewerPersona[]): void {
  safeWriteJson(STORAGE_KEYS.VIEWER_PERSONAS, personas);
  safeWriteJson(LEGACY_STORAGE_KEYS.VIEWER_PERSONAS, personas);
}

// ==================== 直播会话管理 ====================

export function loadLiveSessions(): LiveStreamSession[] {
  const merged = readAndMergeDualKeys(
    STORAGE_KEYS.SESSIONS,
    LEGACY_STORAGE_KEYS.SESSIONS,
    normalizeLiveSessionRecord,
  );
  return merged.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export function saveLiveSessions(sessions: LiveStreamSession[]): void {
  safeWriteJson(STORAGE_KEYS.SESSIONS, sessions);
  safeWriteJson(LEGACY_STORAGE_KEYS.SESSIONS, sessions);
}

export function upsertLiveSession(session: LiveStreamSession): LiveStreamSession[] {
  const all = loadLiveSessions();
  const idx = all.findIndex(s => s.id === session.id);
  const next = idx >= 0
    ? all.map((s, i) => (i === idx ? session : s))
    : [session, ...all];
  saveLiveSessions(next);
  return next;
}

export function deleteLiveSession(sessionId: string): LiveStreamSession[] {
  const next = loadLiveSessions().filter(s => s.id !== sessionId);
  saveLiveSessions(next);
  return next;
}

// ==================== VOD 视频投稿管理 ====================

export function loadVodPosts(): VodVideoPost[] {
  const merged = readAndMergeDualKeys(
    STORAGE_KEYS.VODS,
    LEGACY_STORAGE_KEYS.VODS,
    normalizeVodPostRecord,
  );
  return merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function saveVodPosts(posts: VodVideoPost[]): void {
  safeWriteJson(STORAGE_KEYS.VODS, posts);
  safeWriteJson(LEGACY_STORAGE_KEYS.VODS, posts);
}

export function upsertVodPost(post: VodVideoPost): VodVideoPost[] {
  const all = loadVodPosts();
  const idx = all.findIndex(p => p.id === post.id);
  const next = idx >= 0
    ? all.map((p, i) => (i === idx ? post : p))
    : [post, ...all];
  saveVodPosts(next);
  return next;
}

export function deleteVodPost(postId: string): VodVideoPost[] {
  const next = loadVodPosts().filter(p => p.id !== postId);
  saveVodPosts(next);
  return next;
}

// ==================== NPC 陪看会话与可自定义 NPC 频道池 ====================

export function loadNpcChannelPool(): NpcStreamerChannelCard[] {
  const saved = safeReadJson<NpcStreamerChannelCard[]>(STORAGE_KEYS.NPC_POOL, []);
  return saved.length > 0 ? saved : DEFAULT_NPC_CHANNELS;
}

export function saveNpcChannelPool(pool: NpcStreamerChannelCard[]): void {
  safeWriteJson(STORAGE_KEYS.NPC_POOL, pool);
}

export function loadNpcCustomRule(): string {
  return localStorage.getItem(STORAGE_KEYS.NPC_CUSTOM_RULE) || '';
}

export function saveNpcCustomRule(rule: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.NPC_CUSTOM_RULE, rule);
  } catch {}
}

export function loadNpcWatchSessions(): NpcWatchSession[] {
  const merged = readAndMergeDualKeys(
    STORAGE_KEYS.NPC_WATCHES,
    LEGACY_STORAGE_KEYS.NPC_WATCHES,
    normalizeNpcWatchSessionRecord,
  );
  return merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function saveNpcWatchSessions(sessions: NpcWatchSession[]): void {
  safeWriteJson(STORAGE_KEYS.NPC_WATCHES, sessions);
  safeWriteJson(LEGACY_STORAGE_KEYS.NPC_WATCHES, sessions);
}

export function upsertNpcWatchSession(session: NpcWatchSession): NpcWatchSession[] {
  const all = loadNpcWatchSessions();
  const idx = all.findIndex(s => s.id === session.id);
  const next = idx >= 0
    ? all.map((s, i) => (i === idx ? session : s))
    : [session, ...all];
  saveNpcWatchSessions(next);
  return next;
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
      } catch {}
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
    } catch {}
  }
}
