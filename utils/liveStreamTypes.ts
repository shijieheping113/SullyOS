/**
 * 直播与视频平台 App（电波 / OnAir）核心类型与预设模板定义
 * 注意：兼容永恒浏览器（ES2020 标准），不使用过新语法。
 */

export type ChannelIdentityMode = 'public_main' | 'secret_alt' | 'vtuber';

export type DanmakuTranslateMode = 'bilingual' | 'zh_only' | 'original_only';

export interface ChannelVoiceConfig {
  /** 配信语种：'' 默认中文，或 'ja' | 'en' | 'yue' | 'ko' | 'fr' | 'es' | 'de' | 'ru' */
  language: string;
  /** 是否开启外语原声 + 中文野生同传双轨字幕与多国弹幕翻译 */
  translationEnabled: boolean;
  /** 是否自动合成并朗读主播每一拍的台词 */
  autoPlayTts: boolean;
  /** 可选：该频道单独覆盖的音色 ID（留空则使用角色自身的 voiceProfile） */
  overrideVoiceId?: string;
}

export interface StreamerChannelProfile {
  id: string;
  charId: string;
  channelName: string;
  handle: string;
  avatar?: string;
  coverGradient: string;
  bio: string;
  identityMode: ChannelIdentityMode;
  fanBadgeName: string;
  followerCount: number;
  /** 镜头前的营业人设 / 台上台下反差描述 */
  personaPrompt: string;
  voiceConfig: ChannelVoiceConfig;
  createdAt: number;
}

export interface ViewerPersona {
  id: string;
  /** true 表示用户本尊大号（读取 userProfile），false 表示自定义小号马甲（物理隔离真名） */
  isMain: boolean;
  name: string;
  avatar?: string;
  fanLevel: number;
  badgeText?: string;
  /** 仅供用户在马甲列表分辨或作为马甲发言语气参考，绝不向模型泄露这是用户的马甲 */
  note: string;
}

export type DanmakuRoleType = 'passerby' | 'old_fan' | 'troll' | 'coach' | 'foreigner' | 'user_main' | 'user_alt';

export interface LiveDanmakuItem {
  id: string;
  senderName: string;
  /** 若是用户发出的，记录所用马甲 id，前端用来渲染「我的大号 / 我的马甲」高亮，但喂模型时若为小号绝不带 userName */
  viewerPersonaId?: string;
  isUserMain?: boolean;
  isUserAlt?: boolean;
  fanBadge?: string;
  fanLevel?: number;
  roleType: DanmakuRoleType;
  /** 弹幕原文（外语配信时可能是日语/英语等） */
  text: string;
  /** 中文翻译（外语弹幕时由模型或辅助模型附带） */
  translation?: string;
  /** 若为 SC 醒目留言，记录金额（如 30 / 100 / 500 / 1000） */
  scAmount?: number;
  scColor?: 'blue' | 'yellow' | 'orange' | 'red';
  giftName?: string;
  timestamp: number;
}

export interface LiveBeat {
  id: string;
  chunkId: string;
  index: number;
  /** 镜头画面、动作、生理细节或设备突发小插曲描写 */
  screen: string;
  /** 主播开口说的原声台词（留白拍允许为空字符串） */
  speechOriginal: string;
  /** 外语配信模式下的中文野生同传译文 */
  speechTranslated?: string;
  /** 情绪标记（供 TTS 使用：happy/sad/angry/surprised/calm 等） */
  emotion?: string;
  /** 这一拍伴随飘过的弹幕与 SC */
  danmaku: LiveDanmakuItem[];
  /** 在线人数变化量 */
  viewerDelta?: number;
  /** 缓存的 TTS 音频地址 */
  ttsAudioUrl?: string;
}

export interface LiveChunk {
  id: string;
  index: number;
  createdAt: number;
  beats: LiveBeat[];
  /** 用户在本段开始前积攒发送的弹幕/SC */
  userInputs: LiveDanmakuItem[];
  /** 写入主聊天 DB 的临时过程消息 ID（source: 'live'），重 Roll 或总结折叠时用它更新/顶替 */
  dbMessageId?: number;
  /** 是否已被阶段滚动总结折叠（true 时留在界面可翻看，但不再把原文发给主模型） */
  folded?: boolean;
  foldedBySummaryId?: string;
}

export interface LiveRollingSummary {
  id: string;
  fromChunkIndex: number;
  toChunkIndex: number;
  content: string;
  createdAt: number;
  /** 写入主聊天 DB 顶替散碎切片的阶段摘要消息 ID */
  dbMessageId?: number;
}

export type LiveArchiveDropMode = 'card_and_memory' | 'silent_memory' | 'forget';

export interface LiveStreamSession {
  id: string;
  channelId: string;
  charId: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  customTopic?: string;
  status: 'live' | 'ended';
  viewerCount: number;
  likeCount: number;
  chunks: LiveChunk[];
  rollingSummaries: LiveRollingSummary[];
  /** 攒着等下一段生成时一起结算的观众弹幕/SC 队列 */
  pendingDanmakuQueue: LiveDanmakuItem[];
  /** 下播后生成的全貌纪要正文（可随时二次编辑或重总结） */
  finalSummary?: string;
  finalArchiveMode?: LiveArchiveDropMode;
  /** 下播落入主聊天的总结消息 ID 或卡片消息 ID */
  finalDbMessageId?: number;
  finalCardMessageId?: number;
  /** 每满多少段自动触发一次阶段滚动总结（默认 4，保留最近 2 段） */
  foldEveryNChunks: number;
  foldKeepRecentChunks: number;
  startedAt: number;
  endedAt?: number;
}

// ==================== 视频博主投稿（VOD） ====================

export interface VodChapterBeat {
  id: string;
  timestampLabel: string; // 如 "00:00", "01:25"
  chapterTitle: string;
  screen: string;
  speechOriginal: string;
  speechTranslated?: string;
  emotion?: string;
  danmaku: LiveDanmakuItem[];
  ttsAudioUrl?: string;
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
  /** UP 主（Char）翻牌回复列表 */
  replies: Array<{
    id: string;
    authorName: string;
    isStreamer: boolean;
    content: string;
    translation?: string;
    timestamp: number;
  }>;
  timestamp: number;
}

export interface VodVideoPost {
  id: string;
  channelId: string;
  charId: string;
  title: string;
  categoryLabel: string;
  coverGradient: string;
  durationLabel: string;
  viewsCount: number;
  likesCount: number;
  coinsCount: number;
  favoritesCount: number;
  streamerPinNote: string;
  chapters: VodChapterBeat[];
  comments: VodCommentItem[];
  summaryText?: string;
  dbMessageId?: number;
  createdAt: number;
}

// ==================== 刷 NPC 配信/视频（Char 陪看） ====================

export interface NpcBeatItem {
  id: string;
  npcScreen: string;
  npcSpeech: string;
  npcDanmaku: string[];
  /** Char 在旁边陪看时的实时动作与吐槽反应 */
  charReactionAction: string;
  charReactionSpeech: string;
  charReactionTranslated?: string;
  charEmotion?: string;
  /** 用户与 Char 的私语或发出去的搞事弹幕 */
  userActionNote?: string;
  ttsAudioUrl?: string;
  dbMessageId?: number;
}

export interface NpcWatchSession {
  id: string;
  charId: string;
  npcStreamerName: string;
  npcCategoryLabel: string;
  npcRoomTitle: string;
  npcBio: string;
  coverGradient: string;
  viewerCount: number;
  beats: NpcBeatItem[];
  summaryText?: string;
  createdAt: number;
}

// ==================== 转发到主聊天的卡片结构 ====================

export interface LivestreamChatCardPayload {
  type: 'livestream_card';
  cardKind: 'live_summary' | 'live_clip' | 'vod_share' | 'npc_watch';
  sessionId: string;
  channelId?: string;
  charId: string;
  charName: string;
  channelName: string;
  identityMode?: ChannelIdentityMode;
  title: string;
  categoryLabel: string;
  viewerCount?: number;
  /** 核心展示摘录或整场纪要正文 */
  summary: string;
  /** 若为单拍高能切片，附上画面与台词 */
  clipBeat?: {
    screen: string;
    speechOriginal: string;
    speechTranslated?: string;
    highlightDanmaku: string[];
  };
  /** 严守大小号物理隔离：只记录已知的大号互动或匿名观众名，绝不将小号映射回真名 */
  notableInteractions?: string[];
  createdAt: number;
}

// ==================== 预设模板与常量 ====================

export interface StreamPresetTemplate {
  key: string;
  label: string;
  badge: string;
  defaultTitle: string;
  promptHint: string;
  coverGradient: string;
}

export const STREAM_PRESET_TEMPLATES: StreamPresetTemplate[] = [
  {
    key: 'gaming',
    label: '游戏实况',
    badge: 'GAME',
    defaultTitle: '今晚打不赢这关绝对不下播',
    promptHint: '正在打高难度动作/竞技游戏，操作专注时经常说半截话、手忙脚乱、翻车后嘴硬怪设备或怪延迟，和弹幕教练互怼。',
    coverGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
  },
  {
    key: 'radio',
    label: '深夜电台',
    badge: 'RADIO',
    defaultTitle: '深夜匿名树洞：读你们寄来的信',
    promptHint: '房间只开一盏暖黄台灯，离麦克风很近，一边喝水或转笔一边读观众的匿名烦恼投稿，语气松弛真实，偶尔跑题聊起自己的事。',
    coverGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)',
  },
  {
    key: 'asmr',
    label: '助眠哄睡',
    badge: 'ASMR',
    defaultTitle: '轻声耳语 · 睡前故事与助眠',
    promptHint: '使用双耳麦克风，压低声音轻声说话，夹杂翻书声、指尖轻敲或呼吸声，节奏极慢，偶尔因为弹幕刷太快小声警告大家快闭眼睡觉。',
    coverGradient: 'linear-gradient(135deg, #17153b 0%, #2e236c 55%, #433d8b 100%)',
  },
  {
    key: 'chatting',
    label: '日常杂谈',
    badge: 'TALK',
    defaultTitle: '刚忙完，开播随便聊两句吃个夜宵',
    promptHint: '毫无偶像包袱的日常唠嗑，可能正在拆外卖包装、吸溜饮料、整理桌面或者跟宠物搭话，看到哪条弹幕顺眼就拎出来聊。',
    coverGradient: 'linear-gradient(135deg, #1f2937 0%, #374151 50%, #4b5563 100%)',
  },
  {
    key: 'singing',
    label: '歌回弹唱',
    badge: 'MUSIC',
    defaultTitle: '随便唱唱 · 弹幕点歌（会的才唱）',
    promptHint: '抱着吉他或调着伴奏轨试音，唱几句歌词、停下来喝口水点评伴奏或忘词笑场，跟弹幕抢拍子互动。',
    coverGradient: 'linear-gradient(135deg, #3b0764 0%, #581c87 50%, #701a75 100%)',
  },
  {
    key: 'challenge',
    label: '惩罚整活局',
    badge: 'DARE',
    defaultTitle: '愿赌服输！兑现上次立下的 Flag',
    promptHint: '因为上次打赌输了被迫营业（如戴羞耻头饰、念羞耻台词或做黑暗料理），全程耳根发红、疯狂叹气想逃跑，弹幕全在截图狂欢。',
    coverGradient: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)',
  },
];

export interface NpcPresetRoomTemplate {
  key: string;
  npcName: string;
  categoryLabel: string;
  roomTitle: string;
  npcBio: string;
  promptHint: string;
  coverGradient: string;
}

export const NPC_PRESET_ROOMS: NpcPresetRoomTemplate[] = [
  {
    key: 'fortune',
    npcName: '赛博半仙·王铁嘴',
    categoryLabel: '玄学算命',
    roomTitle: '不准不要钱！在线连麦合八字算正缘桃花',
    npcBio: '戴着墨镜摇着折扇的江湖术士，说话一套一套的，最爱一惊一乍点破小情侣心思。',
    promptHint: 'NPC主播正在神神叨叨地摇铜钱算姻缘，满嘴“哎呀你身边这人命里带醋坛子啊”，弹幕全是算卦和看热闹的网友。',
    coverGradient: 'linear-gradient(135deg, #27272a 0%, #451a03 60%, #78350f 100%)',
  },
  {
    key: 'flirt_idol',
    npcName: '腹肌小野猫·Leo',
    categoryLabel: '颜值热舞',
    roomTitle: '姐姐点个关注，满10万赞现场掀衣擦汗~',
    npcBio: '油腻又卖力的擦边颜值男主播，疯狂对着镜头眨眼比心喊宝贝。',
    promptHint: 'NPC主播正在对着镜头疯狂抛媚眼、用气泡音喊“谢谢姐姐的小心心”，极易引发陪看 Char 的强烈吃醋、冷笑或想抢你手机划走。',
    coverGradient: 'linear-gradient(135deg, #4c0519 0%, #881337 55%, #be123c 100%)',
  },
  {
    key: 'crazy_shop',
    npcName: '咆哮严选·大强哥',
    categoryLabel: '离谱带货',
    roomTitle: '最后三单！会发光的纯金色的不锈钢大砍刀雨伞！',
    npcBio: '嗓门极大、卖的东西千奇百怪的搞笑带货主播，助播在旁边疯狂配合演双簧。',
    promptHint: 'NPC主播正在声嘶力竭地推销离谱沙雕发明（结果当场演示翻车坏掉），弹幕全在刷“哈哈哈哈退钱”。',
    coverGradient: 'linear-gradient(135deg, #431407 0%, #7c2d12 55%, #b45309 100%)',
  },
  {
    key: 'drama_mic',
    npcName: '情感调解员·翠花',
    categoryLabel: '抓马连麦',
    roomTitle: '【连麦调解】怀疑对象偷偷用小号看我直播怎么办？',
    npcBio: '午夜档狗血情感连麦主持人，连上来的观众一个比一个抓马。',
    promptHint: 'NPC直播间正在连麦讲一段离谱又搞笑的情侣捉迷藏八卦，弹幕全在吃瓜站队。',
    coverGradient: 'linear-gradient(135deg, #1e1b4b 0%, #4a044e 55%, #701a75 100%)',
  },
];

export const SC_TIER_OPTIONS: Array<{
  amount: number;
  color: 'blue' | 'yellow' | 'orange' | 'red';
  label: string;
  giftName: string;
  bgClass: string;
  borderClass: string;
}> = [
  { amount: 30, color: 'blue', label: '¥30 醒目留言', giftName: '荧光棒×10', bgClass: 'bg-sky-600/90', borderClass: 'border-sky-400' },
  { amount: 100, color: 'yellow', label: '¥100 进阶 SC', giftName: '告白气球', bgClass: 'bg-amber-500/90', borderClass: 'border-amber-300' },
  { amount: 500, color: 'orange', label: '¥500 高能 SC', giftName: '星际飞船', bgClass: 'bg-orange-600/90', borderClass: 'border-orange-300' },
  { amount: 1000, color: 'red', label: '¥1000 榜一置顶', giftName: '全服嘉年华', bgClass: 'bg-rose-600/95', borderClass: 'border-rose-300' },
];
