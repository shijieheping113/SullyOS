/**
 * 直播与视频平台（OnAir / 电波）本地持久化管理
 * 独立存储于 localStorage（完全不触碰系统备份导入导出代码），并通过 DB.saveMessage / updateMessageMetadata
 * 与主聊天 (source: 'live') 和记忆宫殿实时同步。
 */
import type { CharacterProfile, UserProfile } from '../types';
import { DB } from './db';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  VodVideoPost,
  NpcWatchSession,
  STREAM_PRESET_TEMPLATES,
} from './liveStreamTypes';

const KEY_CHANNELS = 'sully_onair_channels_v1';
const KEY_PERSONAS = 'sully_onair_viewer_personas_v1';
const KEY_SESSIONS = 'sully_onair_live_sessions_v1';
const KEY_VODS = 'sully_onair_vod_posts_v1';
const KEY_NPC_WATCHES = 'sully_onair_npc_watches_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[OnAirStorage] write failed:', key, e);
  }
}

// ==================== 频道管理（支持同一 Char 多个频道） ====================

export function loadAllChannels(): StreamerChannelProfile[] {
  return readJson<StreamerChannelProfile[]>(KEY_CHANNELS, []);
}

export function saveAllChannels(channels: StreamerChannelProfile[]): void {
  writeJson(KEY_CHANNELS, channels);
}

export function ensureDefaultChannelForChar(char: CharacterProfile): StreamerChannelProfile {
  const all = loadAllChannels();
  const existing = all.filter(c => c.charId === char.id);
  if (existing.length > 0) return existing[0];

  const defaultChannel: StreamerChannelProfile = {
    id: `ch_${char.id}_main_${Date.now()}`,
    charId: char.id,
    channelName: `${char.name}的直播间`,
    handle: `@${char.name.toLowerCase().replace(/\s+/g, '_')}_live`,
    avatar: char.avatar,
    coverGradient: STREAM_PRESET_TEMPLATES[0].coverGradient,
    bio: `这里是 ${char.name} 的个人频道，随缘开播。`,
    identityMode: 'public_main',
    fanBadgeName: `${char.name.slice(0, 2)}粉`,
    followerCount: 12800,
    personaPrompt: '保持本人真实性格，在镜头前自然松弛，不端着，会挑感兴趣的弹幕搭话或回怼。',
    voiceConfig: {
      language: '',
      translationEnabled: false,
      autoPlayTts: true,
      overrideVoiceId: '',
    },
    createdAt: Date.now(),
  };

  const next = [defaultChannel, ...all];
  saveAllChannels(next);
  return defaultChannel;
}

export function upsertChannel(channel: StreamerChannelProfile): StreamerChannelProfile[] {
  const all = loadAllChannels();
  const idx = all.findIndex(c => c.id === channel.id);
  const next = idx >= 0
    ? all.map((c, i) => (i === idx ? channel : c))
    : [channel, ...all];
  saveAllChannels(next);
  return next;
}

export function deleteChannelById(channelId: string): StreamerChannelProfile[] {
  const all = loadAllChannels().filter(c => c.id !== channelId);
  saveAllChannels(all);
  return all;
}

// ==================== 大小号马甲管理（物理隔离小号真名） ====================

export function loadViewerPersonas(userProfile: UserProfile): ViewerPersona[] {
  const saved = readJson<ViewerPersona[]>(KEY_PERSONAS, []);
  const mainName = (userProfile?.name || '我').trim() || '我';
  const mainPersona: ViewerPersona = {
    id: 'viewer_main_self',
    isMain: true,
    name: mainName,
    avatar: userProfile?.avatar,
    fanLevel: 25,
    badgeText: '铁粉',
    note: '本尊大号（Char 能认出是你本人）',
  };

  const alts = saved.filter(p => !p.isMain && p.id !== 'viewer_main_self');
  if (alts.length === 0) {
    const defaultAlts: ViewerPersona[] = [
      {
        id: 'viewer_alt_rich',
        isMain: false,
        name: '路过的神秘富婆',
        fanLevel: 30,
        badgeText: '总督',
        note: '话少钱多的榜一老板马甲（物理隔离，Char 不知道是你）',
      },
      {
        id: 'viewer_alt_troll',
        isMain: false,
        name: '纯路人别夹了',
        fanLevel: 5,
        badgeText: '路人',
        note: '专门挑刺拆台的乐子人小号（物理隔离，Char 不知道是你）',
      },
    ];
    writeJson(KEY_PERSONAS, [mainPersona, ...defaultAlts]);
    return [mainPersona, ...defaultAlts];
  }
  return [mainPersona, ...alts];
}

export function saveViewerPersonas(personas: ViewerPersona[]): void {
  writeJson(KEY_PERSONAS, personas);
}

// ==================== 直播场次（Session）管理 ====================

export function loadLiveSessions(): LiveStreamSession[] {
  return readJson<LiveStreamSession[]>(KEY_SESSIONS, []);
}

export function saveLiveSessions(sessions: LiveStreamSession[]): void {
  // 限制最多保留最近 40 场以防 localStorage 膨胀
  writeJson(KEY_SESSIONS, sessions.slice(0, 40));
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

// ==================== 视频投稿（VOD）管理 ====================

export function loadVodPosts(): VodVideoPost[] {
  return readJson<VodVideoPost[]>(KEY_VODS, []);
}

export function saveVodPosts(posts: VodVideoPost[]): void {
  writeJson(KEY_VODS, posts.slice(0, 50));
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

// ==================== NPC 陪看房管理 ====================

export function loadNpcWatchSessions(): NpcWatchSession[] {
  return readJson<NpcWatchSession[]>(KEY_NPC_WATCHES, []);
}

export function upsertNpcWatchSession(session: NpcWatchSession): NpcWatchSession[] {
  const all = loadNpcWatchSessions();
  const idx = all.findIndex(s => s.id === session.id);
  const next = idx >= 0
    ? all.map((s, i) => (i === idx ? session : s))
    : [session, ...all].slice(0, 30);
  writeJson(KEY_NPC_WATCHES, next);
  return next;
}

// ==================== 与主聊天 DB（source: 'live'）实时互通及 Supersede 顶替 ====================

/**
 * 将一段直播切片（Chunk）格式化为可被主聊天和直播间读取的实时现场记录。
 * 铁律：小号（isUserAlt）互动只写 `[观众·{senderName}]`，严禁出现 userName 真名！
 */
export function formatChunkForLiveMemory(
  channel: StreamerChannelProfile,
  session: LiveStreamSession,
  chunkIndex: number,
  beats: LiveStreamSession['chunks'][number]['beats'],
): string {
  const modeNote =
    channel.identityMode === 'secret_alt'
      ? `（使用隐藏身份的匿名小号频道「${channel.channelName}」）`
      : channel.identityMode === 'vtuber'
        ? `（使用虚拟皮套频道「${channel.channelName}」）`
        : `（频道「${channel.channelName}」）`;

  const lines: string[] = [];
  lines.push(`[直播现场记录 · 《${session.title}》第 ${chunkIndex + 1} 段${modeNote}]`);

  for (const beat of beats) {
    const speechText = beat.speechTranslated
      ? `${beat.speechOriginal}（中文意：${beat.speechTranslated}）`
      : beat.speechOriginal;
    const screenPart = beat.screen ? `（画面：${beat.screen}）` : '';
    const speechPart = speechText ? `主播说：「${speechText}」` : '（本拍主播未开口，专注动作/留白）';

    // 挑选重要弹幕：SC、大号弹幕、小号马甲弹幕、以及前 2 条路人弹幕
    const importantDanmaku = (beat.danmaku || []).filter(
      d => d.scAmount || d.isUserMain || d.isUserAlt,
    );
    const samplePasserby = (beat.danmaku || [])
      .filter(d => !d.scAmount && !d.isUserMain && !d.isUserAlt)
      .slice(0, 2);

    const dmTexts = [...importantDanmaku, ...samplePasserby].map(d => {
      const scTag = d.scAmount ? `[¥${d.scAmount} SC${d.giftName ? '·' + d.giftName : ''}] ` : '';
      const who = d.isUserMain
        ? `${d.senderName}（熟人本尊大号）`
        : `观众「${d.senderName}」`;
      const body = d.translation ? `${d.text}（译：${d.translation}）` : d.text;
      return `${scTag}${who}：${body}`;
    });

    lines.push(
      `· ${screenPart} ${speechPart}${dmTexts.length > 0 ? ` ｜ 公屏弹幕：[${dmTexts.join('；')}]` : ''}`.trim(),
    );
  }

  return lines.join('\n');
}

/**
 * 写入或更新某一段直播切片对应的主聊天 DB 记录（source: 'live'）。
 * 当用户在直播间与微信私聊之间来回切换时，微信能够立刻读到刚播完的这一段！
 */
export async function syncLiveChunkToDb(opts: {
  charId: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  chunkIndex: number;
  beats: LiveStreamSession['chunks'][number]['beats'];
  existingDbMsgId?: number;
}): Promise<number> {
  const content = formatChunkForLiveMemory(opts.channel, opts.session, opts.chunkIndex, opts.beats);
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
      channelId: opts.channel.id,
      chunkIndex: opts.chunkIndex,
    },
  });
  return id;
}

/**
 * 当触发「阶段滚动总结」或「下播全貌总结」时，将旧的散碎切片记录在 DB 中标为 superseded: true，
 * 并写入新的精炼总结记录。这样主聊天拼上下文时只读精炼总结，绝不撑爆 Token！
 */
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
        }));
      } catch (e) {
        console.warn('[OnAirStorage] mark superseded failed for msgId:', oldId, e);
      }
    }
  }

  const prefix = opts.isFinal ? '【本场直播全貌纪要】' : '【直播阶段滚动摘要】';
  const fullContent = `${prefix}\n${opts.summaryText.trim()}`;

  if (opts.existingSummaryDbId && opts.existingSummaryDbId > 0) {
    await DB.updateMessage(opts.existingSummaryDbId, fullContent);
    return opts.existingSummaryDbId;
  }

  return DB.saveMessage({
    charId: opts.charId,
    role: 'assistant',
    type: 'text',
    content: fullContent,
    metadata: {
      source: 'live',
      liveSessionId: opts.sessionId,
      channelId: opts.channelId,
      liveSummary: true,
      liveFinalSummary: !!opts.isFinal,
    },
  });
}

/**
 * 若下播时选择「本场忘掉（不进记忆）」，将该场直播所有的临时记录标为 superseded + archiveMode: 'forget'
 */
export async function forgetLiveSessionInDb(session: LiveStreamSession): Promise<void> {
  const ids: number[] = [];
  for (const c of session.chunks) {
    if (c.dbMessageId) ids.push(c.dbMessageId);
  }
  for (const r of session.rollingSummaries) {
    if (r.dbMessageId) ids.push(r.dbMessageId);
  }
  if (session.finalDbMessageId) ids.push(session.finalDbMessageId);

  for (const id of ids) {
    try {
      await DB.updateMessageMetadata(id, prev => ({
        ...(prev || {}),
        superseded: true,
        archiveMode: 'forget',
      }));
    } catch {}
  }
}
