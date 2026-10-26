/**
 * 电波陪看（Watch Along）数据结构。
 *
 * 一场陪看 = 一条 WatchAlongSession，存在 live_npc_watches 表里。
 * 全局杂项（候选房间池、刷台规则、默认账号）存在 live_kv 表里。
 * 全程只在陪看自己这一份记录里读写，不进主聊天消息表。
 */

// ==================== 账号与房间 ====================

/**
 * 直播平台上的账号。
 *
 * 不分「本尊」和「马甲」——这就是一个普通观众号，两人各有一个，
 * 公屏发言、打赏、连麦都用它。主播和网友只认得这个号。
 */
export interface WatchAccount {
  nickname: string;
  number: string;
}

/** 路人主播的房间底细 */
export interface WatchRoom {
  streamerName: string;
  streamerHandle: string;
  category: string;
  title: string;
  bio: string;
  viewerCount: number;
  customRule: string;
  coverGradient: string;
}

/** 大厅刷出来的候选房间卡片 */
export interface WatchRoomCard extends WatchRoom {
  id: string;
  styleTag: string;
}

// ==================== 公屏与直播幕 ====================

/** 公屏上的一条动作：弹幕、打赏、连麦开关与麦上发言 */
export interface WatchPublicAction {
  id: string;
  kind: 'danmaku' | 'gift' | 'mic_on' | 'mic_line' | 'mic_off';
  text?: string;
  giftName?: string;
  giftAmount?: number;
}

/** 网友弹幕 */
export interface WatchDanmaku {
  id: string;
  author: string;
  text: string;
}

/**
 * 一段直播里的一条。
 *
 * 真直播里主播的「动作」和「说的话」是交替出来的：做一件事、说一句、再做事、再说。
 * 一格里存一串这样的条目，屏幕上一条一条往外放，观众点一下看下一条。
 * 2026-10-26 Ann 定的：不能是「一大块画面 + 一大段话」，那是剧本，不是直播。
 */
export interface WatchSeqItem {
  kind: 'scene' | 'line';
  text: string;
}

/** 主播与网友对「我和角色搞事」的即时接招，挂在同一幕后面 */
export interface WatchFollowUp {
  scene: string;
  speech: string;
  danmaku: WatchDanmaku[];
  /** 一段直播的条目（画面和话交替）；老记录没有 */
  seq?: WatchSeqItem[];
}

/** 一幕直播 */
export interface WatchBeat {
  id: string;
  index: number;
  /** 镜头画面描写（这一段里所有画面的合并，给摘要和材料用） */
  scene: string;
  /** 主播台词（这一段里所有话的合并，给摘要和材料用） */
  speech: string;
  /** 这一段直播的条目：画面和话交替，屏幕上按顺序一条一条放 */
  seq?: WatchSeqItem[];
  danmaku: WatchDanmaku[];
  /** 高能节点：点名、开盘、翻车、连麦提问 */
  hot: boolean;
  userActions: WatchPublicAction[];
  charActions: WatchPublicAction[];
  /** 角色麦上语音（连麦时才有） */
  charMicLine?: string;
  /** 角色麦上语音的录音缓存编号 */
  charMicVoiceId?: string;
  userMicLine?: string;
  /** 本幕里主播接招的后续，没有就是 undefined */
  followUp?: WatchFollowUp;
  at: number;
}

// ==================== 沙盒私聊 ====================

export type WatchChatSender = 'user' | 'char' | 'clip' | 'action';

/** 转发进私聊的直播片段 */
export interface WatchClip {
  beatIndex: number;
  streamerName: string;
  scene: string;
  speech: string;
  danmaku: string[];
}

/** 引用：发出去的时候把原话带一小段，跟主聊天一样只留快照 */
export interface WatchQuote {
  from: 'user' | 'char';
  text: string;
}

/** 转账（Sully Pay），跟主聊天一样有状态 */
export interface WatchTransfer {
  amount: number;
  note?: string;
  status: 'pending' | 'accepted' | 'returned';
}

export interface WatchChatMessage {
  id: string;
  from: WatchChatSender;
  text?: string;
  /** 表情包名称 */
  sticker?: string;
  /** 角色语音条的录音缓存编号（存的是录音本体，刷新还在） */
  voiceId?: string;
  /** 这条想用语音发，等期五接语音时合成 */
  wantVoice?: boolean;
  /** 引用快照 */
  quote?: WatchQuote;
  /** 译文：长按翻译出来的，或者角色自己就说双语 */
  translation?: string;
  /** 转账卡 */
  transfer?: WatchTransfer;
  clip?: WatchClip;
  /** 关联第几幕 */
  beatIndex?: number;
  at: number;
}

// ==================== 总结与会话 ====================

/** 已压缩的一段前情 */
export interface WatchDigest {
  id: string;
  fromBeat: number;
  toBeat: number;
  text: string;
  at: number;
  /** 这段被手动改过，自动重写时默认不覆盖 */
  edited?: boolean;
}

/** 双人本场状态 */
export interface WatchCast {
  userAccount: WatchAccount;
  charAccount: WatchAccount;
  /** 自己单看（角色不在）/ 同屏陪看 / 仅后台私聊 */
  presence: 'solo' | 'side' | 'backstage';
  autoReact: boolean;
  petVisible: boolean;
  mic: 'off' | 'on';
  /** 私聊里让角色用语音回（加号里那一个开关） */
  voiceReply?: boolean;
}

export interface WatchAlongSession {
  id: string;
  charId: string;
  status: 'watching' | 'ended';
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  room: WatchRoom;
  cast: WatchCast;
  beats: WatchBeat[];
  chat: WatchChatMessage[];
  digests: WatchDigest[];
  /** 旧版单句导演引导，只为兼容老记录；新记录只用下面两个分组 */
  director: string;
  /** 导演给台上主播的方向，下一轮兑现后清空 */
  stageCue?: string;
  /** 导演给角色的方向，下一轮兑现后清空 */
  charCue?: string;
  /** 退房汇总摘要，选了写进主聊天才有 */
  recap?: string;
  /** 回顾被手动改过 */
  recapEdited?: boolean;
  /** 旧版记录：只读展示，不参与新生成 */
  legacy?: boolean;
}

// ==================== 设置 ====================

/**
 * 一个模型槽。关掉就用主模型（走主聊天那套 API 配置），
 * 打开则这一路生成改用槽里填的地址与模型，互不影响。
 */
export interface WatchModelSlot {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

/** 陪看全局设置（跨场次共用，存在 live_kv） */
export interface WatchSettings {
  /** 这一场的功能开关 */
  autoReact: boolean;
  petVisible: boolean;
  /** 进房时角色在不在：true 同屏陪看，false 自己先单看（手册·默认进房方式） */
  enterWithChar: boolean;
  /** 角色的语音条自动合成并播放（不用一条条点） */
  voiceAuto: boolean;
  /** 每幕生成几条公屏弹幕 */
  danmakuPerBeat: number;
  /** 滚动总结 */
  summaryAuto: boolean;
  summaryBeatWaterline: number;
  summaryKeepRecent: number;
  /** 退房自动写回顾 */
  recapAuto: boolean;
  /** 模型：台上主播 / 台下角色，各自可单独指定 */
  stageModel: WatchModelSlot;
  charModel: WatchModelSlot;
}

/** 全局杂项（live_kv） */
export interface WatchGlobals {
  pool: WatchRoomCard[];
  customRule: string;
  userAccount: WatchAccount;
  charAccount: WatchAccount;
  settings: WatchSettings;
}

// ==================== 默认值与阈值 ====================

/** 未压缩的幕数 / 私聊条数到了就压一段摘要（设置里可改，这里是出厂值） */
export const WATCH_DIGEST_BEAT_WATERLINE = 6;
export const WATCH_DIGEST_CHAT_WATERLINE = 12;
/** 压缩后保留最近几幕原文 */
export const WATCH_KEEP_RECENT_BEATS = 3;

export const watchId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyModelSlot = (): WatchModelSlot => ({
  enabled: false,
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.9,
});

export const defaultWatchSettings = (): WatchSettings => ({
  autoReact: true,
  petVisible: true,
  // 进房默认自己先单看，角色要手动叫（Ann 2026-10-26 拍板）
  enterWithChar: false,
  // 语音默认不自动念：先问过一次再定，省得每句都花钱
  voiceAuto: false,
  danmakuPerBeat: 4,
  summaryAuto: true,
  summaryBeatWaterline: WATCH_DIGEST_BEAT_WATERLINE,
  summaryKeepRecent: WATCH_KEEP_RECENT_BEATS,
  recapAuto: true,
  stageModel: emptyModelSlot(),
  charModel: emptyModelSlot(),
});

export const defaultUserAccount = (): WatchAccount => ({
  nickname: '路过的人',
  number: 'N-0000',
});

export const defaultCharAccount = (charName: string): WatchAccount => ({
  nickname: charName || '看客',
  number: 'N-0001',
});

export const defaultCast = (charName: string): WatchCast => ({
  userAccount: defaultUserAccount(),
  charAccount: defaultCharAccount(charName),
  // 进房默认自己看；角色要手动叫进来（Ann 2026-10-26 拍板）
  presence: 'solo',
  autoReact: true,
  petVisible: true,
  mic: 'off',
});

export const defaultGlobals = (charName: string): WatchGlobals => ({
  pool: [],
  customRule: '',
  userAccount: defaultUserAccount(),
  charAccount: defaultCharAccount(charName),
  settings: defaultWatchSettings(),
});
