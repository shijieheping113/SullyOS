export const MIAOMIAO_FOLD_N_DEFAULT = 20;

export type MiaomiaoStarter =
  | 'box'
  | 'story'
  | 'claw'
  | 'walk'
  | 'dream'
  | 'random';

export type MiaomiaoSessionStatus = 'playing' | 'paused' | 'closed' | 'forgotten';

export type MiaomiaoArchiveMode = 'remember' | 'raw' | 'forget' | 'paused';

export type MiaomiaoMsgRole = 'user' | 'assistant' | 'summary';

export interface MiaomiaoWorldRule {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
}

export type MiaomiaoQuoteStyle = 'dq-ascii' | 'dq-curly' | 'corner' | 'corner-paren' | 'custom';

export interface MiaomiaoSettings {
  charId: string;
  foldN: number;
  ttsAutoPlay: boolean;
  ttsEnabled?: boolean;
  voiceQuoteStyle?: MiaomiaoQuoteStyle;
  voiceQuoteCustom?: string;
  worldRules: MiaomiaoWorldRule[];
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  thinking?: boolean;
}

/** 合盖时另存的一份原文。不压缩，不进模型上下文，只给历史页看。 */
export interface MiaomiaoArchiveLine {
  id: string;
  role: 'user' | 'assistant';
  kind?: 'text' | 'voice' | 'html';
  content: string;
  voiceSourceText?: string;
  htmlSource?: string;
  htmlTextPreview?: string;
  timestamp: number;
}

export interface MiaomiaoArchive {
  savedAt: number;
  mode: MiaomiaoArchiveMode;
  lines: MiaomiaoArchiveLine[];
}

export interface MiaomiaoSession {
  id: string;
  charId: string;
  title: string;
  starter: MiaomiaoStarter;
  status: MiaomiaoSessionStatus;
  foldN: number;
  foldCount: number;
  foldedRoundCount: number;
  ttsAutoPlay: boolean;
  continuesMessageId?: number;
  createdAt: number;
  updatedAt: number;
  worldRules: MiaomiaoWorldRule[];
  archive?: MiaomiaoArchive;
}

export interface MiaomiaoMessage {
  id: string;
  sessionId: string;
  charId: string;
  role: MiaomiaoMsgRole;
  content: string;
  timestamp: number;
  folded?: boolean;
  htmlSource?: string;
  htmlTextPreview?: string;
  summaryRange?: { fromRound: number; toRound: number };
  originalSummary?: string;
  kind?: 'text' | 'voice' | 'html';
  voiceSourceText?: string;
  voiceUrl?: string;
  voiceSynthText?: string;
  thinkingText?: string;
}

export const STARTER_LABEL: Record<MiaomiaoStarter, string> = {
  box: '钻箱子',
  story: '讲个故事',
  claw: '抓娃娃',
  walk: '出门逛逛',
  dream: '做小梦',
  random: '爪爪扒拉',
};

export const STARTER_HINT: Record<MiaomiaoStarter, string> = {
  box: '钻进来了…里面比外面大得多…',
  story: '唔…是什么故事呀…猫儿蹲好了…',
  claw: '好多条条…爪爪想扒拉…',
  walk: '外面好大…呜呜…想去又有点怕…',
  dream: '嘘…猫儿睡着了…梦里的都不算数…',
  random: '不知道会是什么…猫儿先探头看看…',
};
