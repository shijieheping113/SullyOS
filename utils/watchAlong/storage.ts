/**
 * 陪看存档的读写层。
 *
 * 只做两件事：把表里的行归一成 WatchAlongSession、把整场记录写回表里。
 * 生成逻辑、界面状态都不许塞进这一层。
 */
import { liveKvDb, liveNpcWatchDb } from '../liveStreamDb';
import type {
  WatchAccount,
  WatchAlongSession,
  WatchBeat,
  WatchCast,
  WatchChatMessage,
  WatchClip,
  WatchDanmaku,
  WatchFollowUp,
  WatchGlobals,
  WatchPublicAction,
  WatchRoom,
  WatchRoomCard,
  WatchSeqItem,
  WatchStreamerLanguage,
  WatchStreamerProfile,
  WatchStreamerScreenForm,
  WatchStreamerTier,
  WatchModelSlot,
  WatchSettings,
} from './types';
import {
  defaultCast,
  defaultCharAccount,
  defaultGlobals,
  defaultStreamerProfile,
  defaultWatchSettings,
  emptyModelSlot,
  watchId,
} from './types';
import { washCoverSvg } from './coverSvg';

const KV_GLOBALS = 'watch_along_globals_v1';
/**
 * 角色的陪看号按角色分开存：换角色就换成他自己那一份，不会顶着上一个角色的号。
 * 你自己的陪看号还是只有一份（你是同一个人，不用跟着角色换）。
 */
const KV_CHAR_ACCOUNT = (charId: string): string => `watch_along_char_account_v1::${charId}`;
/** 老存档里只有一份公共的角色号，第一个打开的角色认领它（免得把她手动改过的马甲丢了） */
const KV_CHAR_ACCOUNT_CLAIMED = 'watch_along_char_account_v1_claimed';

// ==================== 归一化 ====================

const text = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function normalizeAccount(raw: any, fallback: WatchAccount): WatchAccount {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  return {
    nickname: text(raw.nickname, fallback.nickname),
    number: text(raw.number, fallback.number),
  };
}

function normalizeCast(raw: any, charName: string): WatchCast {
  const base = defaultCast(charName);
  if (!raw || typeof raw !== 'object') return base;
  return {
    userAccount: normalizeAccount(raw.userAccount, base.userAccount),
    charAccount: normalizeAccount(raw.charAccount, base.charAccount),
    presence:
      raw.presence === 'backstage' || raw.presence === 'solo' || raw.presence === 'side'
        ? raw.presence
        : base.presence,
    autoReact: typeof raw.autoReact === 'boolean' ? raw.autoReact : true,
    petVisible: typeof raw.petVisible === 'boolean' ? raw.petVisible : true,
    mic: raw.mic === 'on' ? 'on' : 'off',
    voiceReply: raw.voiceReply === true ? true : undefined,
  };
}

// ==================== 设置归一化 ====================

function normalizeModelSlot(raw: any): WatchModelSlot {
  const base = emptyModelSlot();
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: raw.enabled === true,
    baseUrl: text(raw.baseUrl),
    apiKey: text(raw.apiKey),
    model: text(raw.model),
    temperature: num(raw.temperature, base.temperature),
  };
}

/** 设置项逐个兜底；旧版本没有 settings 的记录拿到的是出厂值 */
export function normalizeSettings(raw: any): WatchSettings {
  const base = defaultWatchSettings();
  if (!raw || typeof raw !== 'object') return base;
  const clamp = (v: unknown, fb: number, min: number, max: number): number => {
    const n = num(v, fb);
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    autoReact: typeof raw.autoReact === 'boolean' ? raw.autoReact : base.autoReact,
    petVisible: typeof raw.petVisible === 'boolean' ? raw.petVisible : base.petVisible,
    enterWithChar: typeof raw.enterWithChar === 'boolean' ? raw.enterWithChar : base.enterWithChar,
    voiceAuto: typeof raw.voiceAuto === 'boolean' ? raw.voiceAuto : base.voiceAuto,
    danmakuPerBeat: clamp(raw.danmakuPerBeat, base.danmakuPerBeat, 2, 6),
    summaryAuto: typeof raw.summaryAuto === 'boolean' ? raw.summaryAuto : base.summaryAuto,
    summaryBeatWaterline: clamp(raw.summaryBeatWaterline, base.summaryBeatWaterline, 3, 20),
    summaryKeepRecent: clamp(raw.summaryKeepRecent, base.summaryKeepRecent, 2, 10),
    recapAuto: typeof raw.recapAuto === 'boolean' ? raw.recapAuto : base.recapAuto,
    stageModel: normalizeModelSlot(raw.stageModel),
    charModel: normalizeModelSlot(raw.charModel),
  };
}

function normalizeRoom(raw: any, idx: number): WatchRoom {
  const bio = text(raw.bio) || text(raw.npcBio, '');
  const profile = normalizeProfile(raw.profile);
  const coverSvg = washCoverSvg(raw.coverSvg);
  // 旧记录里「本场正在推进的事」「观众能立刻参与的抓手」两个字段已经取消，
  // 原来把 bio 塞进 mainline 的那段兼容逻辑一并去掉：bio 自己照旧当简介显示，旧记录照样能打开。
  return {
    streamerName: text(raw.streamerName) || text(raw.npcStreamerName, '路人主播'),
    streamerHandle: text(raw.streamerHandle) || text(raw.npcHandle, '@live_stream'),
    category: text(raw.category) || text(raw.npcCategoryLabel, '直播间'),
    title: text(raw.title) || text(raw.npcRoomTitle, '直播间'),
    titleTranslated: text(raw.titleTranslated),
    bio,
    profile,
    viewerCount: num(raw.viewerCount, 1000),
    customRule: text(raw.customRule) || text(raw.customRulePrompt, ''),
    coverGradient: text(raw.coverGradient) || ['#243447', '#0e1621', '#3a2a44'][idx % 3],
    // 旧房间没有这段，洗不干净也当没有，界面继续用上面的渐变
    ...(coverSvg ? { coverSvg } : {}),
  };
}

const WATCH_SCREEN_FORMS: WatchStreamerScreenForm[] = [
  'game',
  'vtuber',
  'workbench',
  'live',
  'outdoor',
  'pet',
];

/** 结构化主播档案逐个兜底；旧记录没有 profile 时给一份空档案（真人小主播） */
function normalizeProfile(raw: any): WatchStreamerProfile {
  const base = defaultStreamerProfile();
  if (!raw || typeof raw !== 'object') return base;
  const language: WatchStreamerLanguage =
    raw.language === 'ja' || raw.language === 'en' || raw.language === 'other'
      ? raw.language
      : base.language;
  const screenForm: WatchStreamerScreenForm = WATCH_SCREEN_FORMS.includes(raw.screenForm)
    ? (raw.screenForm as WatchStreamerScreenForm)
    : base.screenForm;
  const tier: WatchStreamerTier = raw.tier === 'tiny' || raw.tier === 'big' ? raw.tier : base.tier;
  // 年龄：新记录是数字；旧记录里是「二十出头」这种文字，原样留着照旧显示，不许变成空白
  const rawAge = raw.ageBand;
  const ageBand: number | string =
    typeof rawAge === 'number' && Number.isFinite(rawAge)
      ? Math.round(rawAge)
      : typeof rawAge === 'string'
        ? rawAge.trim()
        : '';
  return {
    ageBand,
    identity: text(raw.identity),
    language,
    screenForm,
    category: text(raw.category),
    tier,
    speechStyle: text(raw.speechStyle),
    motive: text(raw.motive),
  };
}

function normalizeDanmaku(list: unknown, beatId: string): WatchDanmaku[] {
  return arr<any>(list).map((dm, i) => {
    if (typeof dm === 'string') {
      return { id: `${beatId}_dm${i}`, author: '观众', text: dm, translated: '' };
    }
    return {
      id: text(dm?.id, `${beatId}_dm${i}`),
      author: text(dm?.author) || text(dm?.senderName, '观众'),
      text: text(dm?.text),
      translated: text(dm?.translated),
    };
  });
}

/** 一幕里的条目（画面和话交替）；老记录没有就留空 */
function normalizeSeq(list: unknown): WatchSeqItem[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const items: WatchSeqItem[] = list.map(it => ({
    kind: it?.kind === 'scene' ? 'scene' : 'line',
    text: text(it?.text),
    translated: text(it?.translated),
  }));
  return items.length ? items : undefined;
}

function normalizeActions(list: unknown, beatId: string): WatchPublicAction[] {
  return arr<any>(list).map((a, i) => ({
    id: text(a?.id, `${beatId}_act${i}`),
    kind:
      a?.kind === 'gift' || a?.kind === 'mic_on' || a?.kind === 'mic_line' || a?.kind === 'mic_off'
        ? a.kind
        : 'danmaku',
    text: text(a?.text) || undefined,
    giftName: text(a?.giftName) || undefined,
    giftAmount: typeof a?.giftAmount === 'number' ? a.giftAmount : undefined,
  }));
}

function normalizeClip(raw: any): WatchClip | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    beatIndex: num(raw.beatIndex, 0),
    streamerName: text(raw.streamerName),
    scene: text(raw.scene),
    speech: text(raw.speech),
    danmaku: arr<string>(raw.danmaku).filter(d => typeof d === 'string'),
  };
}

/**
 * 一幕里主播接招的那一小段。
 *
 * 2026-10-26 批次二下半截修的一个真 bug：存盘时读了 beat.followUp，读回来时一个字都不读，
 * 接招那一段存进去再打开就没了。这里补上，旧记录没有就留空。
 */
function normalizeFollowUp(raw: any, beatId: string): WatchFollowUp | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const scene = text(raw.scene);
  const speech = text(raw.speech);
  const danmaku = normalizeDanmaku(raw.danmaku, `${beatId}_fu`);
  const seq = normalizeSeq(raw.seq);
  if (!scene && !speech && !danmaku.length && !seq) return undefined;
  return { scene, speech, danmaku, seq };
}

/**
 * 把一幕归一。旧记录的字段名（npcScreen / npcSpeech / npcDanmaku）在这里翻译，
 * 旧记录里角色的吐槽与你的动作转成私聊消息，所以老场次点开还有内容可看。
 */
function normalizeBeat(raw: any, idx: number, sessionId: string): {
  beat: WatchBeat;
  chat: WatchChatMessage[];
} {
  const id = text(raw?.id, `${sessionId}_beat${idx}`);
  const at = num(raw?.at, num(raw?.createdAt, Date.now()));
  const beat: WatchBeat = {
    id,
    index: num(raw?.index, idx),
    scene: text(raw?.scene) || text(raw?.npcScreen),
    speech: text(raw?.speech) || text(raw?.npcSpeech),
    seq: normalizeSeq(raw?.seq),
    danmaku: normalizeDanmaku(raw?.danmaku ?? raw?.npcDanmaku, id),
    hot: Boolean(raw?.hot),
    userActions: normalizeActions(raw?.userActions, id),
    charActions: normalizeActions(raw?.charActions, id),
    charMicLine: text(raw?.charMicLine) || undefined,
    charMicVoiceId: text(raw?.charMicVoiceId) || text(raw?.charAudioUrl) || undefined,
    userMicLine: text(raw?.userMicLine) || undefined,
    followUp: normalizeFollowUp(raw?.followUp, id),
    at,
  };

  const chat: WatchChatMessage[] = [];
  const legacyAction = text(raw?.charReactionAction);
  const legacySpeech = text(raw?.charReactionSpeech);
  const legacyUser = text(raw?.userActionNote);
  if (legacyAction) {
    chat.push({ id: `${id}_a`, from: 'action', text: legacyAction, beatIndex: idx, at });
  }
  if (legacySpeech) {
    chat.push({ id: `${id}_s`, from: 'char', text: legacySpeech, beatIndex: idx, at });
  }
  if (legacyUser) {
    chat.push({ id: `${id}_u`, from: 'user', text: legacyUser, beatIndex: idx, at });
  }
  return { beat, chat };
}

function normalizeChat(raw: any, idx: number, sessionId: string): WatchChatMessage {
  return {
    id: text(raw?.id, `${sessionId}_chat${idx}`),
    from:
      raw?.from === 'char' || raw?.from === 'clip' || raw?.from === 'action' ? raw.from : 'user',
    text: text(raw?.text) || undefined,
    sticker: text(raw?.sticker) || undefined,
    voiceId: text(raw?.voiceId) || text(raw?.audioUrl) || undefined,
    wantVoice: raw?.wantVoice === true ? true : undefined,
    quote:
      raw?.quote && typeof raw.quote === 'object'
        ? {
            from: raw.quote.from === 'char' ? 'char' : 'user',
            text: text(raw.quote.text).slice(0, 120),
          }
        : undefined,
    translation: text(raw?.translation) || undefined,
    transfer:
      raw?.transfer && typeof raw.transfer === 'object' && Number(raw.transfer.amount) > 0
        ? {
            amount: Math.round(Number(raw.transfer.amount)),
            note: text(raw.transfer.note) || undefined,
            status:
              raw.transfer.status === 'accepted' || raw.transfer.status === 'returned'
                ? raw.transfer.status
                : 'pending',
          }
        : undefined,
    clip: normalizeClip(raw?.clip),
    beatIndex: typeof raw?.beatIndex === 'number' ? raw.beatIndex : undefined,
    at: num(raw?.at, Date.now()),
  };
}

/**
 * 表里躺着的行一律走这里：新记录原样补齐，旧记录（没有 room / cast / chat 的那批）
 * 逐字段翻译过来，并把 legacy 打上，界面据此只读展示。
 */
export function normalizeSession(raw: any, charName = ''): WatchAlongSession {
  const id = text(raw?.id, watchId('watch'));
  const room = normalizeRoom(raw?.room || raw, 0);
  const beatPairs = arr<any>(raw?.beats).map((b, i) => normalizeBeat(b, i, id));
  const beats = beatPairs.map(p => p.beat);
  const legacyChatFromBeats = beatPairs.flatMap(p => p.chat);
  const chat = arr<any>(raw?.chat).length
    ? arr<any>(raw?.chat).map((c, i) => normalizeChat(c, i, id))
    : legacyChatFromBeats;
  const isLegacy = !raw?.room && !raw?.cast;

  return {
    id,
    charId: text(raw?.charId),
    status: raw?.status === 'ended' ? 'ended' : 'watching',
    createdAt: num(raw?.createdAt, Date.now()),
    updatedAt: num(raw?.updatedAt, num(raw?.createdAt, Date.now())),
    endedAt: typeof raw?.endedAt === 'number' ? raw.endedAt : undefined,
    room,
    cast: normalizeCast(raw?.cast, charName),
    beats,
    chat,
    digests: arr<any>(raw?.digests).map((d, i) => ({
      id: text(d?.id, `${id}_dg${i}`),
      fromBeat: num(d?.fromBeat, 0),
      toBeat: num(d?.toBeat, 0),
      text: text(d?.text),
      at: num(d?.at, Date.now()),
      edited: d?.edited === true ? true : undefined,
    })),
    director: text(raw?.director),
    stageCue: text(raw?.stageCue) || undefined,
    charCue: text(raw?.charCue) || undefined,
    recap: text(raw?.recap) || undefined,
    recapEdited: raw?.recapEdited === true ? true : undefined,
    legacy: isLegacy || Boolean(raw?.legacy),
  };
}

// ==================== 读写 ====================

export async function loadWatchSessions(charName = ''): Promise<WatchAlongSession[]> {
  const rows = await liveNpcWatchDb.getAll();
  return rows
    .map(row => normalizeSession(row, charName))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveWatchSession(session: WatchAlongSession): Promise<void> {
  const row: WatchAlongSession = { ...session, updatedAt: Date.now() };
  await liveNpcWatchDb.put(row);
}

/**
 * 删除一场陪看。返回被删掉的记录，调用方拿它去清该场的录音缓存。
 */
export async function deleteWatchSession(id: string): Promise<WatchAlongSession | null> {
  const rows = await liveNpcWatchDb.getAll();
  const row = rows.find(r => String(r?.id) === id);
  await liveNpcWatchDb.delete(id);
  return row ? normalizeSession(row) : null;
}

/** 一场陪看里所有角色语音的缓存编号 */
export function collectVoiceIds(session: WatchAlongSession): string[] {
  const ids: string[] = [];
  session.beats.forEach(b => {
    if (b.charMicVoiceId) ids.push(b.charMicVoiceId);
  });
  session.chat.forEach(c => {
    if (c.voiceId) ids.push(c.voiceId);
  });
  return ids;
}

// ==================== 新开一场 ====================

const cloneSession = (s: WatchAlongSession): WatchAlongSession =>
  JSON.parse(JSON.stringify(s)) as WatchAlongSession;

/**
 * 开一场新的陪看。进房默认自己看（presence 由 defaultCast 给 solo），
 * 角色要用户在房间里手动叫进来。
 */
export function createSession(opts: {
  charId: string;
  charName: string;
  room: WatchRoomCard | WatchRoom;
  settings: WatchSettings;
  userAccount?: WatchAccount;
  charAccount?: WatchAccount;
}): WatchAlongSession {
  const now = Date.now();
  const coverSvg = washCoverSvg(opts.room.coverSvg);
  const cast = defaultCast(opts.charName);
  if (opts.userAccount) cast.userAccount = { ...opts.userAccount };
  if (opts.charAccount) cast.charAccount = { ...opts.charAccount };
  cast.autoReact = opts.settings.autoReact;
  cast.petVisible = opts.settings.petVisible;
  // 手册·默认进房方式：开了就带角色同屏进房，没开就自己先单看
  cast.presence = opts.settings.enterWithChar ? 'side' : 'solo';

  return {
    id: watchId('watch'),
    charId: opts.charId,
    status: 'watching',
    createdAt: now,
    updatedAt: now,
    room: {
      streamerName: opts.room.streamerName,
      streamerHandle: opts.room.streamerHandle,
      category: opts.room.category,
      title: opts.room.title,
      titleTranslated: opts.room.titleTranslated,
      bio: opts.room.bio,
      profile: opts.room.profile,
      viewerCount: opts.room.viewerCount,
      customRule: opts.room.customRule,
      coverGradient: opts.room.coverGradient,
      ...(coverSvg ? { coverSvg } : {}),
    },
    cast,
    beats: [],
    chat: [],
    digests: [],
    director: '',
  };
}

// ==================== 摘要与回顾的编辑 ====================

/** 手动改一段阶段摘要（改过的打上 edited，自动重写默认不碰它） */
export function applyDigestEdit(
  session: WatchAlongSession,
  digestId: string,
  body: string,
): WatchAlongSession {
  const next = cloneSession(session);
  next.digests = next.digests.map(d =>
    d.id === digestId ? { ...d, text: body, edited: true, at: Date.now() } : d,
  );
  return next;
}

/** 删掉一段阶段摘要（下一轮滚动总结会把它覆盖的范围重新压一遍） */
export function removeDigest(session: WatchAlongSession, digestId: string): WatchAlongSession {
  const next = cloneSession(session);
  next.digests = next.digests.filter(d => d.id !== digestId);
  return next;
}

/** 手动改整场回顾 */
export function applyRecapEdit(session: WatchAlongSession, body: string): WatchAlongSession {
  const next = cloneSession(session);
  next.recap = body;
  next.recapEdited = true;
  return next;
}

// ==================== 全局杂项 ====================

export async function loadWatchGlobals(charName = ''): Promise<WatchGlobals> {
  const base = defaultGlobals(charName);
  const saved = await liveKvDb.get<any>(KV_GLOBALS);
  if (!saved) return base;
  return {
    pool: arr<any>(saved.pool).map((c, i): WatchRoomCard => {
      const room = normalizeRoom(c, i);
      return { ...room, id: text(c?.id, watchId('room')), styleTag: text(c?.styleTag, '') };
    }),
    customRule: text(saved.customRule),
    userAccount: normalizeAccount(saved.userAccount, base.userAccount),
    charAccount: normalizeAccount(saved.charAccount, base.charAccount),
    settings: normalizeSettings(saved.settings),
  };
}

export async function saveWatchGlobals(globals: WatchGlobals): Promise<void> {
  await liveKvDb.put(KV_GLOBALS, globals);
}

/**
 * 取这个角色的陪看号。
 *
 * 以前只有一个公共的角色号，谁最后改谁算，换角色照样顶着上一个角色的号；
 * 现在一个角色一份。老存档里那一份由第一个打开的角色认领——她手动改过的马甲不会丢，
 * 之后再开别的角色，各自拿自己的名字当默认。
 */
export async function loadCharWatchAccount(
  charId: string,
  charName: string,
  legacy?: WatchAccount,
): Promise<WatchAccount> {
  const base = defaultCharAccount(charName);
  if (!charId) return legacy ? normalizeAccount(legacy, base) : base;

  const saved = await liveKvDb.get<WatchAccount>(KV_CHAR_ACCOUNT(charId));
  if (saved) return normalizeAccount(saved, base);

  const claimed = await liveKvDb.get<boolean>(KV_CHAR_ACCOUNT_CLAIMED);
  // 老存档那份号如果名字就是这个角色，那本来就是他自己的，直接用
  const own = Boolean(legacy) && (legacy!.nickname || '').trim() === (charName || '').trim();
  if (legacy && (own || !claimed)) {
    const adopted = normalizeAccount(legacy, base);
    await saveCharWatchAccount(charId, adopted);
    if (!claimed) await liveKvDb.put(KV_CHAR_ACCOUNT_CLAIMED, true);
    return adopted;
  }
  return base;
}

/** 存这个角色的陪看号：只动他自己那一份，不碰别人的 */
export async function saveCharWatchAccount(charId: string, account: WatchAccount): Promise<void> {
  if (!charId) return;
  await liveKvDb.put(KV_CHAR_ACCOUNT(charId), account);
}
