/**
 * 电波 (OnAir) —— 直播间、视频投稿(VOD)、双人陪刷 NPC 配信的数据结构定义
 * 支持双套真实视频平台 UI 主题：YouTube 明亮现代风 ('youtube') / NicoNico 经典弹幕风 ('niconico')
 */

import type { SpeechTimeline } from './callSpeechTimeline';

export type LivePlatformTheme = 'youtube' | 'niconico';

/** 频道身份模式：公开本尊号 / 匿名小号马甲 / 虚拟皮套人(VTuber) */
export type ChannelIdentityMode = 'public_main' | 'secret_alt' | 'vtuber';

/** 弹幕与字幕翻译显示模式 */
export type DanmakuTranslateMode = 'bilingual' | 'zh_only' | 'orig_only';

/** 频道独立语音与翻译配置 */
export interface ChannelVoiceConfig {
  /** 直播/视频使用的原声语种（空字符串代表跟随角色默认或中文，'ja'|'en'|'yue'|'ko'|'fr'|'ru' 等） */
  language: string;
  /** 开启外语配信时，是否同时输出中文同传字幕与弹幕翻译 */
  enableTranslation: boolean;
  /** 切到新的一拍(Beat)时是否自动播放 TTS 语音 */
  autoPlayTts: boolean;
  /** 可选：该频道专属覆盖的音色 ID（用于皮套人/小号变声；留空则直接用角色主 voiceProfile） */
  overrideVoiceId?: string;
}

/** 直播间专属礼物项（随频道/直播间由 AI 根据人设动态生成，也可自定义） */
export interface StreamGiftOption {
  id: string;
  name: string;
  emoji: string;
  price: number;
  currencySymbol: string;
}

/** 角色旗下的单个主播/视频频道档案（一个 Char 可拥有多个独立频道） */
export interface StreamerChannelProfile {
  id: string;
  charId: string;
  /** 频道显示名称 */
  channelName: string;
  /** 频道 handle（如 @Sully_Official） */
  handle: string;
  /** 频道头像（支持图片 URL / DataURI；默认继承角色头像，可在主播设置中单独上传/更换） */
  avatar?: string;
  /** 直播间全屏/舞台自定义背景图 URL（留空则默认使用频道头像/角色头像的高斯柔和氛围背景） */
  roomBackgroundUrl?: string;
  /** 频道封面横幅渐变或色值 */
  bannerGradient: string;
  /** 身份模式：本尊公开 / 匿名小号（熟人不一定认出） / 虚拟皮套人 */
  identityMode: ChannelIdentityMode;
  /** 频道简介 / 签名 */
  bio: string;
  /** 镜头前人设补充 */
  streamerPersonaPrompt: string;
  /** 订阅数 / 关注数 (Subscribers / Followers) */
  followerCount: number;
  /** 频道会员铭牌名称（YouTube Membership / Nico 会员徽章，例如「Member」「常連」） */
  fanBadgeName: string;
  /** 常用配信分类标签 */
  defaultCategory: string;
  /** 频道独立语音与外语同传配置 */
  voiceConfig: ChannelVoiceConfig;
  /** 该频道的专属礼物列表（可由 AI 根据人设生成或手动编辑） */
  customGifts?: StreamGiftOption[];
  /**
   * 弹幕观众温度 0–100。0 最叛逆（吐槽、对抗、恶评），100 最友好溺爱。
   * 缺省按 50，有人抬杠也有人热场。
   */
  danmakuWarmth?: number;
  createdAt: number;
  updatedAt: number;
}

/** 用户在直播间/评论区切换的观众马甲（本尊大号 vs 多个匿名小号） */
export interface ViewerPersona {
  id: string;
  /** 观众显示昵称 */
  name: string;
  /** 是否为用户本尊大号 */
  isMain: boolean;
  /** 会员等级（Months / Level） */
  fanLevel: number;
  /** 会员徽章文案 */
  badgeText?: string;
  /** 马甲人设备注（仅供 UI 标识，小号发言时绝不把用户真名传给 AI，物理防穿帮） */
  note?: string;
}

/** Super Chat 颜色：便宜→贵 = 绿→黄→橙→紫→红 */
export type LiveScColor = 'green' | 'yellow' | 'orange' | 'purple' | 'red';

/** 单条弹幕 / Super Chat (SC) / 专属礼物投喂 */
export interface LiveDanmakuItem {
  id: string;
  senderName: string;
  /** 若是用户发的，记录当时使用的马甲 ID */
  viewerPersonaId?: string;
  /** 是否为用户本尊大号 */
  isUserMain?: boolean;
  /** 是否为用户匿名小号 */
  isUserAlt?: boolean;
  /** 会员徽章 */
  fanBadge?: string;
  fanLevel?: number;
  /** 弹幕角色类型：老粉会员 / 损友弹幕 / 考据党 / 路人 / 外国观众 */
  roleType?: 'old_fan' | 'troll' | 'coach' | 'passerby' | 'foreigner' | 'user_main' | 'user_alt';
  /** 弹幕原文 */
  text: string;
  /** 若原文为外语，附带中文翻译 */
  translation?: string;
  /** Super Chat 金额（>0 表示这是一条付费高亮 Super Chat） */
  scAmount?: number;
  /** Super Chat 货币符号（默认 ¥ 或 $） */
  scCurrency?: string;
  /** Super Chat 颜色档位（绿→黄→橙→紫→红；旧数据可能仍是 blue/cyan/amber/magenta） */
  scColor?: LiveScColor | 'blue' | 'cyan' | 'amber' | 'magenta';
  /** 投喂的专属礼物名称與图标（独立于纯文字 SC，也可附带） */
  giftName?: string;
  giftEmoji?: string;
  giftCount?: number;
  /** 礼物对应的打赏金额，和 Super Chat 金额完全分开 */
  giftAmount?: number;
  giftCurrency?: string;
  /**
   * Ann 在公屏上圈出来的「这一轮要让主播接住」的标记。
   * 只会落在最新一轮生成的路人弹幕上；真正回应它的是下一轮（或重 Roll 那一轮）。
   */
  replyRequested?: boolean;
  /** 该由第几轮来回应（0 开始的下标）。下一轮生成时才带上，之后失效。 */
  replyTargetChunkIndex?: number;
  timestamp: number;
}

/** 直播中的单拍（Beat） */
export interface LiveBeat {
  id: string;
  chunkId: string;
  index: number;
  /** 镜头画面、肢体小动作、环境音或突发小意外 */
  screen: string;
  /** 主播开口说的原声台词（允许为空字符串，代表专注做某事没说话的留白拍） */
  speechOriginal: string;
  /** 若开启外语配信与同传，这里存放中文同传翻译 */
  speechTranslated?: string;
  /** 主播当前情绪标签（供 TTS 情绪参数与画面微表情使用） */
  emotion?: string;
  /** 已经合成好的 TTS 语音 URL（支持直接点击播放与下载音频） */
  audioUrl?: string;
  /**
   * 带语音表演标注的念稿版（辅助模型按当前语音服务商的规范补的停顿/动作/情绪标注）。
   * 只给 TTS 合成用：画面显示、逐句配对、时间轴同步、摘要和聊天卡全部继续用
   * speechOriginal 干净原文，标注混进去会把时间轴搅乱。
   */
  speechPerform?: string;
  /** 鱼声带回的逐字秒数。没有时播放按句长估算。只属于这一拍的嘴里录音。 */
  speechTimeline?: SpeechTimeline | null;
  /**
   * 台词或念稿被改过、这一拍原来的录音当场作废的时间（Ann 2026-10-25 定：改了就不一样，点播放重新录）。
   * 存了新录音就擦掉。点播放看到这个记号，就不再去翻按文字存的老缓存，直接重新录。
   */
  voiceVoidedAt?: number;
  /** 本拍同步飘过的弹幕列表 */
  danmaku: LiveDanmakuItem[];
  /** 在线人数微调变化 */
  viewerDelta?: number;
}

/** 正在播的这一条录音走到了第几秒。只描述当前这一次播放，不写入别的拍。 */
export type LiveVoiceClock = {
  beatId: string;
  currentTime: number;
  duration: number;
};

/** 直播中的一段切片（Chunk，每次请求 LLM 生成 4~5 个连续 Beat） */
export interface LiveChunk {
  id: string;
  index: number;
  createdAt: number;
  beats: LiveBeat[];
  /** 生成该段时用户投递的弹幕 / SC / 礼物 */
  userInputs: LiveDanmakuItem[];
  /** 是否已被阶段滚动摘要折叠（旧字段，仅兼容读取） */
  folded?: boolean;
  foldedBySummaryId?: string;
  /**
   * 这一轮自己的逐轮摘要。压缩后聊天里的原卡正文就是它，续播前情也用它。
   * 与 rollingSummaries 的区别：这里只写这一轮，不跨轮合并。
   */
  roundSummary?: string;
  summaryUpdatedAt?: number;
  /** 这一轮同步写入主聊天的那条轮次卡消息 ID（source: 'live_round'） */
  dbMessageId?: number;
}

/** 直播过程中的阶段滚动摘要（防长直播爆 Token，由辅助模型提炼） */
export interface LiveRollingSummary {
  id: string;
  fromChunkIndex: number;
  toChunkIndex: number;
  content: string;
  createdAt: number;
  dbMessageId?: number;
  /** 这条摘要折叠掉了哪几段（旧数据从消息重建时也用它） */
  supersededChunkIds?: string[];
}

/** 下播后落入主聊天的方式 */
export type LiveArchiveDropMode = 'card_and_memory' | 'silent_memory' | 'forget';

/**
 * 导演引导：用户写给接下来直播走向的提示，不进公屏、不冒充观众发言，
 * 只在下一轮生成时交给模型，生效后从列表里移除。
 */
export interface LiveGuidance {
  id: string;
  text: string;
  createdAt: number;
}

/** 单场直播完整会话 */
export interface LiveStreamSession {
  id: string;
  channelId: string;
  charId: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  /** 自定义分区的一句话场景基调（进提示词；预设分区留空） */
  categoryHint?: string;
  /** 自定义分区的中文名（中途编辑回填用；显示统一读 categoryLabel） */
  categoryNameZh?: string;
  /** 自定义分区的英文尾巴（中途编辑回填用；显示统一读 categoryLabel） */
  categoryNameEn?: string;
  customTopic?: string;
  /** 本场自定义背景图（优先于频道背景图） */
  customBackgroundUrl?: string;
  /** 本场直播间专属礼物（开播时由 AI 结合主题生成或继承频道） */
  sessionGifts?: StreamGiftOption[];
  status: 'live' | 'ended';
  viewerCount: number;
  peakViewerCount?: number;
  likeCount: number;
  /** 累计 Super Chat 收入（旧数据可能包含旧版合计值） */
  totalScRevenue?: number;
  /** 累计频道礼物打赏（与 Super Chat 分开统计） */
  totalGiftRevenue?: number;
  /** 开播时填的附加设定（旧数据可能没有） */
  topicNote?: string;
  chunks: LiveChunk[];
  rollingSummaries: LiveRollingSummary[];
  /** 用户在当前拍已发出、等待下一段响应的弹幕/SC队列 */
  pendingDanmakuQueue: LiveDanmakuItem[];
  /** 导演引导：下一轮生成要体现的方向，生成后清空 */
  pendingGuidance?: LiveGuidance[];
  foldEveryNChunks: number;
  foldKeepRecentChunks: number;
  finalSummary?: string;
  finalArchiveMode?: LiveArchiveDropMode;
  archiveDropMode?: LiveArchiveDropMode;
  finalDbMessageId?: number;
  finalCardMessageId?: number;
  /** 主聊天中的开播状态标记；下播时原位更新，不另发结束卡 */
  startMarkerMessageId?: number;
  startedAt: number;
  endedAt?: number;
  /** 从旧聊天消息重建成场次的时间（只用于大厅角标提示，不影响任何操作） */
  rebuiltFromMessagesAt?: number;
}

// ==================== 视频博主投稿 (VOD) ====================

export interface VodChapterBeat {
  id: string;
  timestampLabel: string;
  chapterTitle: string;
  screen: string;
  speechOriginal: string;
  speechTranslated?: string;
  audioUrl?: string;
  danmaku: LiveDanmakuItem[];
}

export interface VodCommentReply {
  id: string;
  authorName: string;
  isStreamer?: boolean;
  isUserMain?: boolean;
  isUserAlt?: boolean;
  content: string;
  translation?: string;
  timestamp: number;
}

export interface VodCommentItem {
  id: string;
  authorName: string;
  viewerPersonaId?: string;
  isUserMain?: boolean;
  isUserAlt?: boolean;
  fanBadge?: string;
  fanLevel?: number;
  content: string;
  translation?: string;
  likes: number;
  isPinned?: boolean;
  likedByStreamer?: boolean;
  replies: VodCommentReply[];
  timestamp: number;
}

export interface VodVideoPost {
  id: string;
  channelId: string;
  charId: string;
  title: string;
  categoryLabel: string;
  durationLabel: string;
  coverGradient: string;
  coverImageUrl?: string;
  viewsCount: number;
  likesCount: number;
  streamerPinnedNote: string;
  streamerPinnedNoteTranslated?: string;
  chapters: VodChapterBeat[];
  comments: VodCommentItem[];
  dbMessageId?: number;
  createdAt: number;
}

// ==================== 主聊天卡片载荷 (type: 'livestream_card') ====================

export interface LivestreamChatCardPayload {
  type: 'livestream_card';
  /**
   * `npc_watch`：陪看退房时写进主聊天的那一张整场汇总卡；
   * `npc_watch_round`：旧版逐拍陪看卡，只留作历史消息的渲染兼容（新功能不再产生）。
   */
  cardKind: 'live_summary' | 'live_clip' | 'vod_share' | 'npc_watch' | 'live_round' | 'npc_watch_round' | 'live_session_marker';
  sessionId: string;
  channelId?: string;
  charId: string;
  charName: string;
  channelName: string;
  identityMode?: ChannelIdentityMode;
  title: string;
  categoryLabel: string;
  /**
   * 逐轮卡：这一轮在聊天里的正文。未压缩时是本轮原文，压缩后换成逐轮摘要。
   * 旧卡（下播总结等）不带这个字段，仍读 summary。
   */
  body?: string;
  /** 逐轮卡：收起状态下显示的一行预览 */
  preview?: string;
  /** 逐轮卡：轮次序号（从 1 开始，对应 chunk.index + 1 / beat.index + 1） */
  roundIndex?: number;
  /** 逐轮卡：轮次标签，如「第 3 轮」 */
  roundLabel?: string;
  /** 逐轮卡：这一轮是否已被压缩成逐轮摘要 */
  isCompressed?: boolean;
  /** 逐轮卡：最近一次原位更新的时间（压缩/编辑/重 Roll），不是消息时间 */
  updatedAt?: number;
  /** 陪看卡：第三方主播名与房间名（旧逐拍卡也带这两个字段） */
  npcStreamerName?: string;
  npcRoomTitle?: string;
  /** 开播状态标记；下播时原位更新 */
  sessionStatus?: 'live' | 'ended';
  viewerCount?: number;
  summary: string;
  clipBeat?: {
    screen: string;
    speechOriginal: string;
    speechTranslated?: string;
    highlightDanmaku?: string[];
  };
  createdAt: number;
}

/**
 * 电波总控里的实时背景开关。
 * 只作用于电波（直播 / VOD / 陪看）生成请求，不反向修改系统「实时感知」设置。
 */
export interface OnAirRealtimeSettings {
  /** 总开关：关掉时一个实时背景类别都不请求 */
  enabled: boolean;
  /** 天气 */
  weather: boolean;
  /** 国内新闻/热点 */
  news: boolean;
  /** 日本热点 */
  jpHot: boolean;
  /** 当前时间/日期/节日（仍受角色「时间感知」开关约束） */
  time: boolean;
  /** 真实定位（仍受系统定位授权约束，只给主角私密上下文） */
  location: boolean;
}

export const DEFAULT_ONAIR_REALTIME_SETTINGS: OnAirRealtimeSettings = {
  enabled: true,
  weather: true,
  news: true,
  jpHot: true,
  time: true,
  location: true,
};

// ==================== 预设直播分类模板 ====================

export interface StreamPresetTemplate {
  key: string;
  label: string;
  badge: string;
  defaultTitle: string;
  promptHint: string;
  bannerGradient: string;
}

export const STREAM_PRESET_TEMPLATES: StreamPresetTemplate[] = [
  {
    key: 'just_chatting',
    label: '杂谈 Just Chatting',
    badge: 'TALK',
    defaultTitle: 'Late Night Chat · 随便聊聊近况',
    promptHint: '主播在家或工作室一边喝东西或收拾手头杂事，一边跟观众漫无目的地闲聊近况、吐槽日常小事。75%精力在讲自己的事，偶尔瞥一眼聊天栏接梗。',
    bannerGradient: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 55%, #fce7f3 100%)',
  },
  {
    key: 'gaming_carry',
    label: '游戏实况 Gaming',
    badge: 'GAME',
    defaultTitle: 'Ranked Grind · 不上分不下播',
    promptHint: '主播正全神贯注打高难度游戏或排位，80%注意力在操作、报点、因为失误破防或打出高光操作上，只有在等复活或读条间隙才扫一眼弹幕回嘴。',
    bannerGradient: 'linear-gradient(135deg, #d1fae5 0%, #e0f2fe 60%, #dbeafe 100%)',
  },
  {
    key: 'study_work',
    label: '陪伴工坊 Study / Work',
    badge: 'FOCUS',
    defaultTitle: 'Pomodoro Session · 专注陪伴工作/写曲',
    promptHint: '主播正在做自己的专业事务（写代码、看书、画画、练琴或处理工作），话不多，经常有安静专注只传出翻页/键盘声的留白拍，休息间隙才抬头轻声跟聊天栏说话。',
    bannerGradient: 'linear-gradient(135deg, #e0e7ff 0%, #ccfbf1 60%, #f0fdf4 100%)',
  },
  {
    key: 'asmr_sleep',
    label: '深夜电台 Radio',
    badge: 'RADIO',
    defaultTitle: 'Midnight Radio · 助眠低语与读信',
    promptHint: '房间只开了一盏暖光台灯，离麦克风很近，声音放得极轻极缓，有调试麦克风、倒水、翻信纸的细微环境音，慢节奏读观众来信或分享睡前思绪。',
    bannerGradient: 'linear-gradient(135deg, #f3e8ff 0%, #fce7f3 60%, #ffe4e6 100%)',
  },
  {
    key: 'cooking_vlog',
    label: '料理下厨 Kitchen',
    badge: 'LIFE',
    defaultTitle: 'Kitchen Lab · 今日料理实验室',
    promptHint: '把手机架在厨房吧台旁做吃的或冲咖啡，镜头会因为拿食材偶尔晃动，伴随切菜、油锅滋滋声，忙得手忙脚乱时根本顾不上看屏幕。',
    bannerGradient: 'linear-gradient(135deg, #ffedd5 0%, #fef3c7 55%, #ffe4e6 100%)',
  },
  {
    key: 'singing_music',
    label: '歌回弹唱 Music',
    badge: 'MUSIC',
    defaultTitle: 'Unplugged Session · 随性歌回与点歌',
    promptHint: '抱着吉他或对着伴奏唱歌、试音、调混响，唱到一半可能会忘词笑场、喝口润喉茶，在两首歌之间跟观众聊这首歌的故事。',
    bannerGradient: 'linear-gradient(135deg, #fce7f3 0%, #e0e7ff 55%, #dbeafe 100%)',
  },
];

/** YouTube 风格 Super Chat 档位（金额 + 高亮色；不绑定礼物名） */
export const SC_TIER_OPTIONS: Array<{
  amount: number;
  label: string;
  color: LiveScColor;
  /** 给主播念的颜色名，必须和画面一致 */
  colorLabel: string;
  pinDurationLabel: string;
  headerBg: string;
  bodyBg: string;
  textColor: string;
  pillBg: string;
  /** ¥800 起的自定义金额：红底再加一圈金边 */
  goldBorder?: boolean;
}> = [
  {
    amount: 5,
    label: '¥5',
    color: 'green',
    colorLabel: '绿色',
    pinDurationLabel: '置顶 30 秒',
    headerBg: '#2e7d32',
    bodyBg: '#43a047',
    textColor: '#ffffff',
    pillBg: '#43a047',
  },
  {
    amount: 20,
    label: '¥20',
    color: 'yellow',
    colorLabel: '黄色',
    pinDurationLabel: '置顶 2 分钟',
    headerBg: '#ebb424',
    bodyBg: '#ffc928',
    textColor: '#3e2723',
    pillBg: '#ffc928',
  },
  {
    amount: 50,
    label: '¥50',
    color: 'orange',
    colorLabel: '橙色',
    pinDurationLabel: '置顶 5 分钟',
    headerBg: '#ef6c00',
    bodyBg: '#ff9800',
    textColor: '#ffffff',
    pillBg: '#ff9800',
  },
  {
    amount: 200,
    label: '¥200',
    color: 'purple',
    colorLabel: '紫色',
    pinDurationLabel: '置顶 15 分钟',
    headerBg: '#6a1b9a',
    bodyBg: '#8e24aa',
    textColor: '#ffffff',
    pillBg: '#8e24aa',
  },
  {
    amount: 500,
    label: '¥500',
    color: 'red',
    colorLabel: '红色',
    pinDurationLabel: '置顶 1 小时',
    headerBg: '#c62828',
    bodyBg: '#e53935',
    textColor: '#ffffff',
    pillBg: '#e53935',
  },
  {
    amount: 800,
    label: '¥800+',
    color: 'red',
    colorLabel: '红底金边',
    pinDurationLabel: '置顶 2 小时',
    headerBg: '#b71c1c',
    bodyBg: '#e53935',
    textColor: '#ffffff',
    pillBg: '#e53935',
    goldBorder: true,
  },
];

/** 自定义 Super Chat 最低金额。达到后走红底金边，不再另开颜色名。 */
export const SC_CUSTOM_MIN = 800;
export const SC_GOLD_BORDER = '#e6b422';

const LEGACY_SC_COLOR: Record<string, LiveScColor> = {
  blue: 'green',
  cyan: 'yellow',
  amber: 'orange',
  magenta: 'purple',
  green: 'green',
  yellow: 'yellow',
  orange: 'orange',
  purple: 'purple',
  red: 'red',
};

/** 按金额对齐档位；有金额时以金额为准（旧 blue 色名不再把 ¥20 错判成绿） */
export function resolveScTier(
  amount?: number,
  color?: string | null,
): (typeof SC_TIER_OPTIONS)[number] {
  const amt = Number(amount) || 0;
  if (amt > 0) {
    let best = SC_TIER_OPTIONS[0];
    for (const tier of SC_TIER_OPTIONS) {
      if (amt >= tier.amount) best = tier;
    }
    return best;
  }
  const mapped = color ? LEGACY_SC_COLOR[color] : undefined;
  if (mapped) {
    const byColor = SC_TIER_OPTIONS.find(t => t.color === mapped);
    if (byColor) return byColor;
  }
  return SC_TIER_OPTIONS[0];
}

/**
 * 下一轮在线人数。大部分直播是糊的：每轮最多小幅起伏，
 * 不回答 SC、不理弹幕、冷场或态度差会往下走，接得住会慢慢往上，但不会一下冲到粉丝量。
 */
/**
 * 结算在线人数：主播自己掌握热度，代码只记账。
 *
 * 每个 Beat 的 viewerDelta 是模型写好的「这一拍在线人数净变化」（进来减走掉的绝对人数）。
 * 旧版按「有没有回应SC、有没有沉默」自己算涨跌、还压着订阅数 18%/35% 的天花板——
 * 导演指令要涨人、直播整活爆点全都生效不了，整套死代码已拆。
 *
 * 现在代码只留两道宽护栏，拦的只是离谱，不拦真实：
 * 1. 人数不许小于 0；
 * 2. 在线不许超过「订阅数 × 10」（几百粉的频道在线上万，就是模型乱编）。
 * 小主播突然爆火、大主播摆烂掉粉，只要在护栏内都照单全收。
 */
export function settleLiveViewerCount(input: {
  current: number;
  followers: number;
  beats: Array<{ viewerDelta?: number }>;
}): number {
  const followers = Math.max(1, Math.round(input.followers) || 1000);
  // 只有「没给初始人数」（undefined/NaN/负数）才按订阅数的 4% 播种；
  // 真的掉到 0 人在线是合法状态，原样保留，不许偷偷回血
  const rawCurrent = Number(input.current);
  const current = Number.isFinite(rawCurrent) && rawCurrent >= 0
    ? Math.round(rawCurrent)
    : Math.max(1, Math.round(followers * 0.04));
  const delta = (input.beats || []).reduce((sum, beat) => {
    const d = Number(beat?.viewerDelta);
    if (!Number.isFinite(d)) return sum;
    return sum + Math.round(d);
  }, 0);

  const hardMax = Math.max(50, Math.round(followers * 10));
  return Math.min(hardMax, Math.max(0, current + delta));
}
