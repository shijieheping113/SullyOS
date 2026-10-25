/**
 * 陪看的三个引擎：台上主播、台下角色、后台总结。
 *
 * 这一层只做「组织材料 → 调模型 → 把回复切成干净的结构」。
 * 不碰界面、不碰存档、不往主聊天写任何东西。
 */

import { buildChatRequestPayload } from '../chatRequestPayload';
import { clampManualContextLimit } from '../chatContextRange';
import { resolveDialogueApi } from '../characterApi';
import { callMainStreamerLlm } from '../liveStreamAiHelpers';
import { isSecondaryLlmReady } from '../secondaryLlmApi';
import { secondaryLlmCall } from '../secondaryLlmCall';
import type {
  APIConfig,
  CharacterProfile,
  DialogueApiConfig,
  Emoji,
  EmojiCategory,
  Message,
  UserProfile,
} from '../../types';
import {
  ACCOUNT_NAME_RULES,
  CHAR_RULES,
  DIGEST_RULES,
  RECAP_RULES,
  ROOM_POOL_RULES,
  STAGE_RULES,
  TRANSLATE_RULES,
  buildAccountNameTask,
  buildCharStateBlock,
  buildDigestTask,
  buildRecapTask,
  buildRoomPoolTask,
  buildStageCounterTask,
  buildStageTask,
  buildTranslateTask,
} from './prompts';
import type {
  WatchAlongSession,
  WatchBeat,
  WatchClip,
  WatchDanmaku,
  WatchModelSlot,
  WatchPublicAction,
  WatchRoomCard,
} from './types';
import { watchId } from './types';

// ==================== 输出形状 ====================

/** 台上这一幕 */
export interface StageOutput {
  scene: string;
  speech: string;
  danmaku: WatchDanmaku[];
  hot: boolean;
}

/** 角色这一轮的决定 */
export interface CharChatLine {
  text: string;
  sticker: string;
  voice: boolean;
}

export interface CharOutput {
  chat: CharChatLine[];
  public: WatchPublicAction[];
  /** 对未处理的转账：收下 / 退回；没这回事就是 null */
  transfer: 'accept' | 'return' | null;
  why: string;
  /** 角色有没有真的去公屏搞事（决定画面跳不跳） */
  wentPublic: boolean;
}

// ==================== 解析 ====================

function parseJsonObject(raw: string): any {
  const clean = (raw || '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const from = clean.indexOf('{');
  const to = clean.lastIndexOf('}');
  if (from < 0 || to <= from) throw new Error('模型没按约好的格式回');
  return JSON.parse(clean.slice(from, to + 1));
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function toStageOutput(raw: any): StageOutput {
  const list = Array.isArray(raw?.danmaku) ? raw.danmaku : [];
  const danmaku: WatchDanmaku[] = list
    .slice(0, 6)
    .map((d: any) => {
      if (typeof d === 'string') return { id: watchId('dm'), author: '观众', text: d.trim() };
      return {
        id: watchId('dm'),
        author: str(d?.author) || str(d?.senderName) || '观众',
        text: str(d?.text),
      };
    })
    .filter((d: WatchDanmaku) => d.text);
  return {
    scene: str(raw?.scene) || '主播偏头看了眼镜头外的提示，手上动作没停。',
    speech: str(raw?.speech),
    danmaku,
    hot: raw?.hot === true,
  };
}

const PUBLIC_KINDS = ['danmaku', 'gift', 'mic_on', 'mic_line', 'mic_off'] as const;

function toCharOutput(raw: any): CharOutput {
  const chatList: any[] = Array.isArray(raw?.chat) ? raw.chat : [];
  const chat: CharChatLine[] = chatList
    .slice(0, 3)
    .map((c: any) => ({ text: str(c?.text), sticker: str(c?.sticker), voice: c?.voice === true }))
    .filter((c: CharChatLine) => Boolean(c.text || c.sticker));

  const publicList: any[] = Array.isArray(raw?.public) ? raw.public : [];
  const publicActions: WatchPublicAction[] = publicList
    .slice(0, 2)
    .map((a: any) => {
      const kind = PUBLIC_KINDS.includes(a?.kind) ? (a.kind as WatchPublicAction['kind']) : 'danmaku';
      return {
        id: watchId('act'),
        kind,
        text: str(a?.text) || undefined,
        giftName: str(a?.giftName) || undefined,
        giftAmount: typeof a?.giftAmount === 'number' ? a.giftAmount : undefined,
      };
    })
    .filter((a: WatchPublicAction) => a.kind !== 'danmaku' || Boolean(a.text));

  const transferRaw = str(raw?.transfer).toLowerCase();

  return {
    chat,
    public: publicActions,
    transfer: transferRaw === 'accept' ? 'accept' : transferRaw === 'return' ? 'return' : null,
    why: str(raw?.why),
    wentPublic: publicActions.length > 0,
  };
}

// ==================== 调用 ====================

/** 槽填全了才有资格接管这一路生成 */
function slotReady(slot?: WatchModelSlot): slot is WatchModelSlot {
  return Boolean(slot?.enabled && slot.baseUrl.trim() && slot.apiKey.trim() && slot.model.trim());
}

/**
 * 按模型槽决定这一路走谁的接口。
 * 槽没开（或没填全）就用主模型；槽开了则整路换过去，两边互不影响。
 */
function routeApi(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  slot?: WatchModelSlot;
}): { apiConfig: APIConfig; char: CharacterProfile } {
  if (!slotReady(opts.slot)) return { apiConfig: opts.apiConfig, char: opts.char };
  const override: DialogueApiConfig = {
    baseUrl: opts.slot.baseUrl.trim(),
    apiKey: opts.slot.apiKey.trim(),
    model: opts.slot.model.trim(),
    temperature: opts.slot.temperature,
  };
  const merged = resolveDialogueApi(opts.apiConfig, opts.char, override);
  // 传下去的 char 必须摘掉自己的对话覆盖，否则 callMainStreamerLlm 内部会再叠一层，
  // 把这里指定的模型顶回去。
  return { apiConfig: merged, char: { ...opts.char, dialogueApi: undefined } };
}

async function callChatModel(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  slot?: WatchModelSlot;
  messages: Array<{ role: string; content: string }>;
  purpose: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const routed = routeApi(opts);
  return callMainStreamerLlm({
    apiConfig: routed.apiConfig,
    char: routed.char,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.95,
    purpose: opts.purpose,
    maxTokens: opts.maxTokens ?? 1200,
  });
}

/** 后台总结走「设置里的辅助模型」；没配或抽了就退主模型，不让总结空着 */
async function callSummaryModel(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  messages: Array<{ role: string; content: string }>;
  purpose: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  if (isSecondaryLlmReady(opts.apiConfig.secondaryLlm)) {
    try {
      return await secondaryLlmCall({
        config: opts.apiConfig.secondaryLlm!,
        purpose: opts.purpose,
        messages: opts.messages,
        featureOpts: { temperature: opts.temperature ?? 0.95 },
        charId: opts.char.id,
      });
    } catch {
      /* 辅助模型这一下没回，下面退主模型 */
    }
  }
  return callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    messages: opts.messages,
    purpose: opts.purpose,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
}

/** 台上：写新的一幕 */
export async function generateStageBeat(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
  /** 本轮台下送进来的最新互动（我的公屏动作、连麦发言等） */
  latest: string;
  /** 主播这一路用哪个模型；不传就走主模型 */
  model?: WatchModelSlot;
  /** 这一幕要几条公屏弹幕 */
  danmakuPerBeat?: number;
}): Promise<StageOutput> {
  const task = buildStageTask({
    session: opts.session,
    latest: opts.latest,
    micOn: opts.session.cast.mic === 'on',
    danmakuPerBeat: opts.danmakuPerBeat,
  });
  const raw = await callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.model,
    purpose: 'watch_along_stage',
    messages: [
      { role: 'system', content: STAGE_RULES },
      { role: 'user', content: task },
    ],
  });
  return toStageOutput(parseJsonObject(raw));
}

/** 台上：对台下刚发生的动作当场接招（不换幕） */
export async function generateStageCounter(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
  actionText: string;
  micOn: boolean;
  model?: WatchModelSlot;
  danmakuPerBeat?: number;
}): Promise<StageOutput> {
  const raw = await callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.model,
    purpose: 'watch_along_counter',
    messages: [
      { role: 'system', content: STAGE_RULES },
      {
        role: 'user',
        content: buildStageCounterTask({
          session: opts.session,
          actionText: opts.actionText,
          micOn: opts.micOn,
          danmakuPerBeat: opts.danmakuPerBeat,
        }),
      },
    ],
  });
  return toStageOutput(parseJsonObject(raw));
}

/**
 * 台下：角色这一轮怎么反应。
 * 走主聊天同一套统一构造器，只替换行为规范那一段，所以人设、世界书、历史、记忆召回都在。
 */
export async function runCharTurn(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  session: WatchAlongSession;
  /** 主聊天可见范围里的原文，由调用方取 */
  historyMessages: Message[];
  emojis: Emoji[];
  categories: EmojiCategory[];
  trigger: 'stage' | 'chat' | 'assign';
  stageLine?: string;
  userLine?: string;
  clip?: WatchClip;
  assign?: string;
  /** 角色这一路用哪个模型；不传就走主模型 */
  model?: WatchModelSlot;
}): Promise<CharOutput> {
  const payload = await buildChatRequestPayload({
    char: opts.char,
    userProfile: opts.userProfile,
    groups: [],
    emojis: opts.emojis,
    categories: opts.categories,
    historyMsgs: opts.historyMessages,
    contextLimit: clampManualContextLimit(opts.char.contextLimit),
    // 'direct' 不带私聊专属引导与协同文件柜；也不传 realtimeConfig，所以没有天气/新闻/小红书。
    recallEntryPoint: 'direct',
    // 这一段会整段替掉聊天 App 规范（含小红书、日程、Notion、瑞幸等工具教学），
    // 换成陪看沙盒的说话方式与输出格式。
    appPrompt: { rules: CHAR_RULES, scene: '' },
    liveGenerator: true,
    stripImages: true,
  });

  const state = buildCharStateBlock({
    session: opts.session,
    trigger: opts.trigger,
    stageLine: opts.stageLine,
    userLine: opts.userLine,
    clip: opts.clip,
    assign: opts.assign,
    stickers: opts.emojis.map(e => e.name).slice(0, 60),
  });

  const messages = [
    ...payload.fullMessages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
    { role: 'user', content: state },
  ];

  const raw = await callChatModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    slot: opts.model,
    messages,
    temperature: 0.9,
    purpose: 'watch_along_char',
    maxTokens: 900,
  });

  return toCharOutput(parseJsonObject(raw));
}

/** 私聊长按「翻译」：把一条消息翻成另一种语言，存进这条的 translation */
export async function translateWatchText(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  text: string;
}): Promise<string> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_translate',
    temperature: 0.4,
    maxTokens: 400,
    messages: [
      { role: 'system', content: TRANSLATE_RULES },
      { role: 'user', content: buildTranslateTask(opts.text, opts.char.name) },
    ],
  });
  return raw.replace(/^["「『]|["」』]$/g, '').trim();
}

/** 后台：把攒够的那几幕压成一段摘要 */
export async function digestSessionBeats(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
  beats: WatchBeat[];
}): Promise<string> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_digest',
    temperature: 0.6,
    maxTokens: 600,
    messages: [
      { role: 'system', content: DIGEST_RULES },
      { role: 'user', content: buildDigestTask(opts.session, opts.beats) },
    ],
  });
  return raw.trim();
}

/** 退房：写进主聊天的那段回顾正文 */
export async function buildSessionRecap(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  session: WatchAlongSession;
}): Promise<string> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_recap',
    temperature: 0.7,
    maxTokens: 800,
    messages: [
      { role: 'system', content: RECAP_RULES },
      { role: 'user', content: buildRecapTask(opts.session) },
    ],
  });
  return raw.trim();
}

// ==================== 大厅：刷台 ====================

const GRADIENT_FALLBACK = [
  '#1b2430,#3a2a44',
  '#12232b,#20404a',
  '#2a1f2e,#3d2b3a',
  '#1d2420,#33301f',
  '#241d2c,#2c3346',
];

function toRoomCard(raw: any, idx: number): WatchRoomCard | null {
  const name = str(raw?.streamerName);
  const title = str(raw?.title);
  if (!name || !title) return null;
  const cover = Array.isArray(raw?.cover) ? raw.cover.filter((c: any) => typeof c === 'string') : [];
  return {
    id: watchId('room'),
    streamerName: name.slice(0, 20),
    streamerHandle: str(raw?.streamerHandle) || `@${name.slice(0, 12).toLowerCase()}`,
    category: str(raw?.category) || '闲聊',
    title: title.slice(0, 40),
    bio: str(raw?.bio).slice(0, 160),
    viewerCount:
      typeof raw?.viewerCount === 'number' && raw.viewerCount > 0
        ? Math.round(raw.viewerCount)
        : 320 + idx * 137,
    customRule: str(raw?.customRule),
    styleTag: str(raw?.styleTag).slice(0, 6),
    coverGradient:
      cover.length >= 2 ? `${cover[0]},${cover[1]}` : GRADIENT_FALLBACK[idx % GRADIENT_FALLBACK.length],
  };
}

/** 大厅「换一批」：刷一批正在直播的路人房间 */
export async function generateRoomPool(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userName: string;
  customRule: string;
  count?: number;
  exclude?: string[];
}): Promise<WatchRoomCard[]> {
  const count = opts.count ?? 6;
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_rooms',
    temperature: 1.0,
    maxTokens: 1400,
    messages: [
      { role: 'system', content: ROOM_POOL_RULES },
      {
        role: 'user',
        content: buildRoomPoolTask({
          charName: opts.char.name,
          userName: opts.userName,
          customRule: opts.customRule,
          count,
          exclude: opts.exclude ?? [],
        }),
      },
    ],
  });
  const parsed = parseJsonObject(raw);
  const list: any[] = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
  const seen = new Set<string>();
  return list
    .map((r, i) => toRoomCard(r, i))
    .filter((r): r is WatchRoomCard => Boolean(r))
    .filter(r => {
      if (seen.has(r.streamerName)) return false;
      seen.add(r.streamerName);
      return true;
    })
    .slice(0, count);
}

// ==================== 账号：起名 ====================

/** 给陪看小号起个昵称与编号 */
export async function suggestAccountName(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userName: string;
  target: 'user' | 'char';
  current: string;
}): Promise<{ nickname: string; number: string }> {
  const raw = await callSummaryModel({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: 'watch_along_account',
    temperature: 1.0,
    maxTokens: 300,
    messages: [
      { role: 'system', content: ACCOUNT_NAME_RULES },
      {
        role: 'user',
        content: buildAccountNameTask({
          charName: opts.char.name,
          userName: opts.userName,
          target: opts.target,
          current: opts.current,
        }),
      },
    ],
  });
  const parsed = parseJsonObject(raw);
  const nickname = str(parsed?.nickname).slice(0, 12);
  const digits = str(parsed?.number).replace(/\D/g, '').slice(0, 4);
  return {
    nickname: nickname || opts.current,
    number: digits.padStart(4, '0') || '0000',
  };
}

