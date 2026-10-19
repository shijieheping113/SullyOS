/**
 * 电波 (OnAir) —— 核心直播切片提示词构建、严禁冒充用户/小号弹幕双保险过滤、重 Roll 防雷同引擎
 */
import { ContextBuilder } from './context';
import { buildLiveGenerationPayload } from './liveStreamContext';
import { clampManualContextLimit } from './chatContextRange';
import { getUserLocationContext } from './userLocation';
import { voiceLanguagePromptLabel } from './voiceLanguage';
import {
  StreamerChannelProfile,
  LiveStreamSession,
  LiveChunk,
  LiveBeat,
  LiveDanmakuItem,
  STREAM_PRESET_TEMPLATES,
} from './liveStreamTypes';
import type { CharacterProfile, Message, RealtimeConfig, UserProfile } from '../types';

export * from './liveStreamAiHelpers';

// ==================== 1. 活人感与国际化直播间提示词（去B站黑话） ====================

const REAL_STREAMER_VIBE_RULES = `
### 【核心演播铁律：真实 YouTube / NicoNico 主播本位（拒绝播音腔、拒绝围着单人转、去B站黑话）】
1. **主角是主播自己（75%~80% 精力推主线）**：
   - 你正在开自己的直播（打游戏、闲聊、工作陪伴、深夜电台或做饭），你的主要注意力在**手头正在做的事和今日直播话题**上，绝对不是只盯着某一个观众一问一答的客服！
   - 严禁使用任何中国B站特有词汇（如“舰长/提督/总督/UP主/一键三连/投币”），一律使用国际化 YouTube Live / NicoNico 生放送语境（Subscribers 订阅者 / Channel Members 会员 / Super Chat / Viewers / Chat）。
2. **去“端着”的真实口语细节（必须高频自然出现）**：
   - **半截话、口癖与思维跳跃**：真人在镜头前说话会有停顿、语气词、说到一半被手头操作打断（如“Wait—刚才说到哪了？”“草，等一下这波——”）。
   - **留白专注拍（允许不开口）**：每段切片里至少有 1 拍专注于手头动作、喝水、调麦克风、盯屏幕操作或憋笑，此时 \`speechOriginal\` 填空字符串 \`""\`，只在 \`screen\` 里写动作、神态与环境声。
   - **扫视聊天栏的半拍延迟**：主播是忙完手头这一小段动作后，才偏头扫一眼副屏/手机屏幕上的聊天栏，挑有意思的梗、Super Chat（SC）或送礼物的观众念一下回嘴。
3. **真实聊天栏生态（去“夸夸群”，做嘴碎损友与复读机）**：
   - 聊天栏观众有老会员（Member）、起哄损友（抓主播口误、刷问号 \`???\`、\`LMAO\`、\`草\`、\`www\`）、指令党、纯路人和外国观众。
`;

// ==================== 2. 多语种配信与同传双轨规则 ====================

function buildVoiceLanguageAndTranslationRule(channel: StreamerChannelProfile): string {
  const lang = (channel.voiceConfig?.language || '').trim();
  const isForeign = Boolean(lang && lang !== 'zh');
  const langLabel = voiceLanguagePromptLabel(lang);

  if (!isForeign) {
    return `### 【配信语种设定：母语/中文配信】
- 主播台词 \`speechOriginal\` 请使用自然口语中文（可根据人设夹杂习惯的英文/日文词汇），\`speechTranslated\` 保持空字符串 \`""\`。
- 聊天栏以主播受众语种为主，可随机混入 1 条外国观众的外语弹幕（外语弹幕需在 \`translation\` 字段附上中文翻译）。`;
  }

  return `### 【配信语种与实时野生同传设定：${langLabel} (${lang}) 配信】
1. **主播原声台词（\`speechOriginal\`）**：
   - 若该拍有开口说话，必须使用地道、口语化的 **${langLabel}** 撰写（直接供 TTS 语音合成朗读，严禁在 \`speechOriginal\` 里混入中文解释）。
2. **中文同传字幕（\`speechTranslated\`）**：
   - 必须在 \`speechTranslated\` 字段同步写出贴合角色语气的**中文野生同传译文**（不要加“译：”前缀，直接写译文内容）。
3. **多国聊天栏与翻译**：
   - 聊天栏 70% 为 **${langLabel}** 母语观众弹幕（如日语房间的 \`草\`、\`www\`、\`初見です\`、\`ナイス！\`；英语房间的 \`LMAO\`、\`W stream\`、\`Pog\`），其余可混入海外观众弹幕。
   - 所有非中文弹幕必须在 \`translation\` 字段提供简洁传神的中文翻译（不要加“译：”前缀）。`;
}

// ==================== 3. 频道身份模式与大小号物理隔离 ====================

function buildChannelPersonaBlock(
  char: CharacterProfile,
  channel: StreamerChannelProfile,
  userName: string,
  forbiddenViewerNames: string[],
): string {
  const modeDesc =
    channel.identityMode === 'secret_alt'
      ? `【匿名小号马甲频道】这是你背着熟人偷偷开的匿名频道「${channel.channelName}」（${channel.handle}）。你在镜头前不露正脸或完全匿名，展现出平时收起来的反差一面。如果观众用的是陌生网友 ID，你**绝对不知道**对方是谁，只把对方当普通观众或老板！`
      : channel.identityMode === 'vtuber'
      ? `【虚拟皮套人 VTuber 频道】你正顶着虚拟 Live2D 形象在频道「${channel.channelName}」（${channel.handle}）开播，会配合皮套做动作或玩虚拟主播梗。`
      : `【公开个人频道】这是你公开的主频道「${channel.channelName}」（${channel.handle}），熟人和公众都知道主播是你本人。`;

  return `
### 【当前直播频道档案】
- 频道名称：${channel.channelName} (${channel.handle})
- 频道模式：${modeDesc}
- 频道简介：${channel.bio}
- 镜头前人设补充：${channel.streamerPersonaPrompt || '保持角色真实性格，展现台上营业与台下本性的自然层次。'}
- 频道会员铭牌：「${channel.fanBadgeName || 'Member'}」

### 【⚠️ 严禁冒充用户或小号发言（最高优先级铁律）】
- **绝对禁止**在你生成的 \`danmaku\` 数组中，自行使用用户名字「${userName}」或以下任何观众/马甲名字（${forbiddenViewerNames.join('、')}）来捏造弹幕！
- 用户的弹幕只能由用户本人从输入框发出（见下方“待回应弹幕列表”）。你生成的 \`danmaku\` 数组只能是其他无关的路人水友（如随机日文/英文/中文网友昵称）！
- 如果下方待回应列表里某条弹幕标着 \`[普通观众/老板：「xxx」]\`，那TA在物理设定上就是一个你不认识的陌生网友/榜一老板，你只能针对TA发的字面内容和名字互动，**严禁猜出或暗示TA是 ${userName}**！`;
}

// ==================== 4. 直播/NPC 专用上下文组装 ====================

/** 本场前情：压缩过的轮次用逐轮摘要，最近 3 轮用原文；兼容旧的阶段摘要 */
export function buildSessionHistoryBlock(session: LiveStreamSession): string {
  const chunks = [...(session.chunks || [])].sort((a, b) => a.index - b.index);
  if (chunks.length === 0) return '';

  // 最近 3 轮（按时间顺序的最后三个）永远给原文
  const keepRawIds = new Set(chunks.slice(-3).map(c => c.id));

  const compressedLines: string[] = [];
  const rawLines: string[] = [];

  chunks.forEach(c => {
    if (c.roundSummary && !keepRawIds.has(c.id)) {
      compressedLines.push(`【第 ${c.index + 1} 轮 · 逐轮摘要】\n${c.roundSummary.trim()}`);
      return;
    }
    const beatLines = c.beats.map((b, bi) => {
      const sp = b.speechTranslated ? `${b.speechOriginal}（${b.speechTranslated}）` : b.speechOriginal;
      return `  [拍 ${bi + 1}] 画面：${b.screen} ｜ 台词：${sp || '（专注未开口）'}`;
    });
    rawLines.push(`【第 ${c.index + 1} 轮 · 原文】\n${beatLines.join('\n')}`);
  });

  // 旧场次只有 rollingSummaries（跨轮阶段摘要），只按兼容读，不再新写
  const legacySummaries = (session.rollingSummaries || [])
    .filter(s => !chunks.some(c => c.index >= s.fromChunkIndex && c.index <= s.toChunkIndex && c.roundSummary))
    .map(s => `【旧阶段摘要 · 第 ${s.fromChunkIndex + 1}~${s.toChunkIndex + 1} 轮】\n${s.content}`);

  const parts: string[] = [];
  if (legacySummaries.length > 0) {
    parts.push(`### 本场更早的阶段摘要（旧数据，仅作前情）\n${legacySummaries.join('\n\n')}`);
  }
  if (compressedLines.length > 0) {
    parts.push(`### 本场更早各轮（已压缩成逐轮摘要）\n${compressedLines.join('\n\n')}`);
  }
  if (rawLines.length > 0) {
    parts.push(
      `### 最近几轮的直播原文（请自然接着往下演，严禁重复已经说过的台词）\n${rawLines.join('\n\n')}`,
    );
  }
  return parts.join('\n\n');
}

// ==================== 5. 构建「生成下一段直播切片（Chunk）」请求 ====================

export async function buildLiveChunkGenerationMessages(opts: {
  char: CharacterProfile;
  userProfile: UserProfile;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  /** 正常聊天范围的原文；不再传整库，也不再自己截最近 6 条 */
  historyMessages?: Message[];
  realtimeConfig?: RealtimeConfig;
  /** 是否把当前真实定位交给主角自己（NPC 第三方主播永远 false） */
  includeUserLocation?: boolean;
  forbiddenViewerNames?: string[];
  /** 重 Roll 时排除刚刚写进去的那条轮次卡，防止 AI 看到旧答案照抄 */
  excludeDbMsgId?: number;
  /** 重 Roll 时把刚被否决的旧切片传进来，强制换新切入点 */
  rejectedDraftText?: string;
  /** 是否为用户刚刚发了弹幕/SC 触发的即时回应模式 */
  isImmediateUserTrigger?: boolean;
}): Promise<Array<{ role: string; content: string }>> {
  const {
    char,
    userProfile,
    channel,
    session,
    historyMessages = [],
    realtimeConfig,
    includeUserLocation,
    forbiddenViewerNames = [],
    excludeDbMsgId,
    rejectedDraftText,
    isImmediateUserTrigger,
  } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';
  const allForbidden = Array.from(new Set([userName, ...forbiddenViewerNames].filter(Boolean)));

  const preset = STREAM_PRESET_TEMPLATES.find(t => t.key === session.categoryKey);
  const categoryHint = preset ? preset.promptHint : '自由直播，展现真实自然的主播状态。';

  // 1. 本场前情（逐轮摘要 + 最近 3 轮原文）
  const sessionHistoryBlock = buildSessionHistoryBlock(session);
  const progressBlock =
    sessionHistoryBlock ||
    '### 当前进度\n这是本场直播的**第 1 轮**，请展现刚开播调设备、跟陆续进房的观众打招呼或直接进入今日主题的状态。';

  // 2. 待结算的观众互动队列（物理隔离小号真名！）
  const pendingQueue = session.pendingDanmakuQueue || [];
  let audienceInputBlock =
    '### 本轮期间新收到的观众弹幕与 Super Chat\n（本轮没有指定弹幕，请你按自己的直播节奏往前推进，并自然扫视路人弹幕互动。）';
  if (pendingQueue.length > 0) {
    const items = pendingQueue.map(d => {
      const scPrefix =
        d.scAmount && d.scAmount > 0
      ? `💎【Super Chat 付费醒目留言 ${d.scCurrency || '¥'}${d.scAmount}（高亮置顶卡片，必须在第 1 拍立刻看到并重点回应！）】`
          : d.giftName
          ? `🎁【频道礼物打赏：送出数字贴纸 ${d.giftEmoji || '🎁'}「${d.giftName}」（${d.giftCurrency || '¥'}${d.giftAmount || 0}；不是 Super Chat，也不是实物）（必须在第 1 拍看到并感谢/反应！）】`
          : '💬【实时公屏弹幕（刚刚发出）】';
      const identityLabel = d.isUserMain
        ? `[熟人本尊大号：${userName}（Member Lv.${d.fanLevel || 20}）]`
        : `[普通陌生观众/老板：「${d.senderName}」（Member Lv.${d.fanLevel || 5}，注意：你完全不知道这是谁的小号，只当陌生观众/老板回应！）]`;
      return `- ${scPrefix} ${identityLabel} 发送：「${d.text}」`;
    });
    audienceInputBlock = `### ⚡ 刚刚在公屏实时刷出的观众弹幕 / Super Chat / 礼物（${
      isImmediateUserTrigger ? '请在第 1 拍立刻看见并做出自然反应，随后继续推进直播！' : '请顺着你的直播主线自然反应'
    }）\n${items.join('\n')}`;
  }

  // 3. 来源边界：主聊天历史里的私聊不是公屏
  const boundaryBlock = `### 来源边界
上面聊天历史里的是你和 ${userName} 之间的私聊，不是公屏弹幕。你只能把它当成私下的记忆来理解，不得擅自公开念出来或复述给对方以外的人（除非你是故意隔空回嘴）。`;

  // 4. 重 Roll 强烈反雷同指令
  const rerollBlock = rejectedDraftText
    ? `### 🔄 【重 Roll 强制换新指令（极其重要！）】
刚才生成的下面这个版本已经被用户否决弃用：
"""
${rejectedDraftText.slice(0, 500)}
"""
👉 **本次重生成要求**：请**彻底推翻**上面被弃用版本的切入角度、动作细节、台词句式和反应方式！换一个意想不到的全新直播小插曲、全新的情绪反应与完全不同的台词，严禁与上一版雷同！（随机种子：${Math.floor(Math.random() * 99999)}）`
    : '';

  const beatCountRule = isImmediateUserTrigger ? '3 到 4 个' : '4 到 5 个';

  const liveRules = `你现在正在进行一场真实的直播配信。
${buildChannelPersonaBlock(char, channel, userName, allForbidden)}

### 本场直播主题
- 直播间标题：《${session.title}》
- 分区类型：${session.categoryLabel}
- 场景基调：${categoryHint}
${session.customTopic ? `- 今日附加设定/脚本走向：${session.customTopic}` : ''}

${REAL_STREAMER_VIBE_RULES}

${buildVoiceLanguageAndTranslationRule(channel)}

### 输出格式要求（严格输出 JSON 数组，包含 ${beatCountRule} 连续的直播节拍 Beat）
请直接输出一个 JSON 数组（不要包裹额外的解释文字），数组每一项代表 1 个直播小节（Beat），结构如下：
\`\`\`json
[
  {
    "screen": "镜头画面、主播肢体动作、表情、操作细节或突发小状况（40~85字，具象有画面感，禁止套话）",
    "speechOriginal": "主播这一拍开口说的原声台词（若是外语配信则写地道外语口语；若是留白专注拍可为空字符串）",
    "speechTranslated": "若开启外语配信，这里直接写中文同传译文（不要加'译：'前缀）；若本身是中文配信则填空字符串",
    "emotion": "calm | happy | sad | angry | surprised | fearful 之一",
    "viewerDelta": 85,
    "danmaku": [
      {
        "senderName": "路人网友昵称（严禁使用 ${allForbidden.join('/')}！）",
        "roleType": "old_fan | troll | coach | passerby | foreigner",
        "fanLevel": 12,
        "text": "弹幕原文",
        "translation": "若弹幕是外语，必填中文翻译（不加'译：'前缀）；若是中文弹幕填空字符串",
        "scAmount": 0,
        "giftName": "仅当这条是独立频道礼物时填写，否则空字符串",
        "giftEmoji": "礼物贴纸图标，否则空字符串",
        "giftAmount": 0
      }
    ]
  }
]
\`\`\`
注意：每一拍的 \`danmaku\` 数组请生成 4~6 条鲜活、有梗的路人实时弹幕（包含复读、吐槽、问号海等）。\`scAmount\` 只用于 Super Chat 付费醒目留言；普通频道礼物要填 \`giftName/giftEmoji/giftAmount\`，不能填进 \`scAmount\`。礼物是数字贴纸形式的打赏，不是实物。**绝对禁止在 danmaku 里出现 ${allForbidden.join('、')} 的名字**！`;

  const taskParts: string[] = [progressBlock, boundaryBlock, audienceInputBlock, rerollBlock];
  if (includeUserLocation) {
    const locationText = await getUserLocationContext(userName).catch(() => '');
    if (locationText && locationText.trim()) taskParts.splice(1, 0, locationText.trim());
  }
  taskParts.push(`请紧接上文，生成本场第 ${session.chunks.length + 1} 轮的直播切片（共 ${beatCountRule} 拍 JSON 数组）。`);

  const history = historyMessages.filter(m => {
    if (excludeDbMsgId && m.id === excludeDbMsgId) return false;
    if (m.metadata?.superseded || m.metadata?.archiveMode === 'forget') return false;
    return true;
  });

  return buildLiveGenerationPayload({
    char,
    userProfile,
    rules: liveRules,
    task: taskParts.filter(Boolean).join('\n\n'),
    historyMessages: history,
    realtimeConfig,
    contextLimit: clampManualContextLimit(char.contextLimit),
  });
}

export async function buildLiveStreamTurnPrompt(opts: {
  char: CharacterProfile;
  userProfile: UserProfile;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  pendingUserInputs?: Array<{
    text: string;
    persona: { id: string; name: string; isMain: boolean; fanLevel?: number; badgeText?: string };
    scAmount?: number;
    scColor?: 'blue' | 'cyan' | 'amber' | 'magenta' | 'red';
    gift?: { id: string; name: string; emoji: string; price: number; currencySymbol?: string };
  }>;
  /** 正常聊天范围的原文（loadCharacterContextMessages） */
  historyMessages?: Message[];
  realtimeConfig?: RealtimeConfig;
  includeUserLocation?: boolean;
  userName?: string;
  rejectedDraftText?: string;
  excludeDbMsgId?: number;
}): Promise<Array<{ role: string; content: string }>> {
  const queueItems: LiveDanmakuItem[] = (opts.pendingUserInputs || []).map((inp, idx) => ({
    id: `dm_usr_q_${Date.now()}_${idx}`,
    senderName: inp.persona.name,
    roleType: inp.persona.isMain ? 'user_main' : 'user_alt',
    isUserMain: inp.persona.isMain,
    isUserAlt: !inp.persona.isMain,
    viewerPersonaId: inp.persona.id,
    fanBadge: inp.persona.badgeText,
    fanLevel: inp.persona.fanLevel,
    text: inp.text,
    scAmount: inp.scAmount,
    scCurrency: inp.gift?.currencySymbol || '¥',
    scColor: inp.scColor,
    giftId: inp.gift?.id,
    giftName: inp.gift?.name,
    giftEmoji: inp.gift?.emoji,
    giftAmount: inp.gift?.price,
    giftCurrency: inp.gift?.currencySymbol || '¥',
    timestamp: Date.now() + idx,
  }));

  const sessionWithQueue: LiveStreamSession =
    queueItems.length > 0
      ? { ...opts.session, pendingDanmakuQueue: queueItems }
      : opts.session;

  return buildLiveChunkGenerationMessages({
    char: opts.char,
    userProfile: opts.userProfile,
    channel: opts.channel,
    session: sessionWithQueue,
    historyMessages: opts.historyMessages,
    realtimeConfig: opts.realtimeConfig,
    includeUserLocation: opts.includeUserLocation,
    excludeDbMsgId: opts.excludeDbMsgId,
    rejectedDraftText: opts.rejectedDraftText,
    isImmediateUserTrigger: queueItems.length > 0,
  });
}

// ==================== 6. 两层容错解析器 + 物理剔除冒充用户/小号的假弹幕 ====================

export function parseLiveBeatsResponse(
  rawText: string,
  chunkIdOrSessionId: string,
  arg3: any,
  arg4: any = [],
  arg5?: string[],
): LiveBeat[] {
  const isFiveArgs = typeof arg3 === 'number';
  const chunkId = isFiveArgs ? `chunk_${chunkIdOrSessionId}_${arg3}` : chunkIdOrSessionId;
  const rawPendingInputs: any[] = isFiveArgs ? arg4 || [] : arg3 || [];
  const forbiddenViewerNames: string[] = isFiveArgs ? arg5 || [] : arg4 || [];

  const pendingUserInputs: LiveDanmakuItem[] = rawPendingInputs
    .filter((item: any) => item?.alreadyDisplayedInTimeline !== true)
    .map((item: any, idx: number) => {
    if (item && typeof item === 'object' && 'senderName' in item) {
      return item as LiveDanmakuItem;
    }
    const persona = item?.persona || { id: 'viewer_main_self', name: '我', isMain: true };
    return {
      id: `dm_usr_${Date.now()}_${idx}`,
      senderName: persona.name,
      roleType: persona.isMain ? 'user_main' : 'user_alt',
      isUserMain: persona.isMain,
      isUserAlt: !persona.isMain,
      viewerPersonaId: persona.id,
      fanBadge: persona.badgeText,
      fanLevel: persona.fanLevel,
      text: item?.text || '',
      scAmount: item?.scAmount,
      scCurrency: item?.scAmount ? (item?.scCurrency || '¥') : undefined,
      scColor: item?.scColor,
      giftId: item?.gift?.id,
      giftName: item?.gift?.name,
      giftEmoji: item?.gift?.emoji,
      giftAmount: item?.gift?.price,
      giftCurrency: item?.gift?.currencySymbol || '¥',
      timestamp: Date.now() + idx,
    };
    });
  const cleaned = (rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const forbiddenLowerSet = new Set(
    forbiddenViewerNames.map(n => n.trim().toLowerCase()).filter(Boolean),
  );

  // 检查某条 AI 生成的弹幕是否违规冒充了用户大号或小号
  const isImpersonatingUser = (senderName: string): boolean => {
    const norm = (senderName || '').trim().toLowerCase();
    if (!norm) return false;
    if (forbiddenLowerSet.has(norm)) return true;
    for (const f of forbiddenLowerSet) {
      if (f.length >= 2 && (norm.includes(f) || f.includes(norm))) return true;
    }
    return false;
  };

  let parsedArray: any[] | null = null;

  try {
    const direct = JSON.parse(cleaned);
    if (Array.isArray(direct)) parsedArray = direct;
    else if (direct && typeof direct === 'object' && Array.isArray(direct.beats)) {
      parsedArray = direct.beats;
    }
  } catch {
    const start = cleaned.indexOf('[');
    if (start !== -1) {
      let end = cleaned.lastIndexOf('}');
      while (end > start) {
        try {
          const attempt = JSON.parse(cleaned.slice(start, end + 1) + ']');
          if (Array.isArray(attempt) && attempt.length > 0) {
            parsedArray = attempt;
            break;
          }
        } catch {}
        end = cleaned.lastIndexOf('}', end - 1);
      }
    }
  }

  const beats: LiveBeat[] = [];

  if (parsedArray && parsedArray.length > 0) {
    parsedArray.forEach((item, idx) => {
      const rawDanmaku = Array.isArray(item?.danmaku) ? item.danmaku : [];
      // 物理过滤掉任何 AI 试图冒充用户大号/小号名字生成的弹幕！
      const filteredRaw = rawDanmaku.filter(
        (d: any) => !isImpersonatingUser(String(d?.senderName || d?.author || d?.user || '')),
      );

      const danmakuList: LiveDanmakuItem[] = filteredRaw.map((d: any, di: number) => {
        const scAmt = Number(d?.scAmount) > 0 ? Number(d.scAmount) : undefined;
        return {
          id: `dm_${chunkId}_${idx}_${di}_${Date.now()}`,
          senderName: String(d?.senderName || d?.author || d?.user || `Viewer_${100 + di}`).trim(),
          roleType: d?.roleType || 'passerby',
          fanLevel: Number(d?.fanLevel) || Math.floor(Math.random() * 18) + 1,
          text: String(d?.text || d?.content || '???').trim(),
          translation: d?.translation
            ? String(d.translation).replace(/^译[:：]\s*/i, '').trim()
            : undefined,
          scAmount: scAmt,
          giftName: String(d?.giftName || '').trim() || undefined,
          giftEmoji: String(d?.giftEmoji || '').trim() || undefined,
          giftAmount: Number(d?.giftAmount) > 0 ? Number(d.giftAmount) : undefined,
          giftCurrency: d?.giftCurrency ? String(d.giftCurrency) : undefined,
          scColor:
            scAmt && scAmt >= 500
              ? 'red'
              : scAmt && scAmt >= 100
              ? 'amber'
              : scAmt && scAmt > 0
              ? 'blue'
              : undefined,
          timestamp: Date.now() + di * 200,
        };
      });

      beats.push({
        id: `beat_${chunkId}_${idx}_${Date.now()}`,
        chunkId,
        index: idx,
        screen: String(item?.screen || item?.action || '主播看着屏幕继续推进直播。').trim(),
        speechOriginal: String(item?.speechOriginal ?? item?.speech ?? '').trim(),
        speechTranslated: item?.speechTranslated
          ? String(item.speechTranslated).replace(/^译[:：]\s*/i, '').trim()
          : undefined,
        emotion: String(item?.emotion || 'calm').trim(),
        viewerDelta: Number(item?.viewerDelta) || Math.floor(Math.random() * 60) - 15,
        danmaku: danmakuList,
      });
    });
  } else {
    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 5);

    paragraphs.forEach((p, idx) => {
      const quoteMatch = p.match(/[「“"]([^」”"]+)[」”"]/);
      const speech = quoteMatch ? quoteMatch[1].trim() : '';
      const screen = p.replace(/[「“"][^」”"]+[」”"]/g, '').trim() || p;
      beats.push({
        id: `beat_${chunkId}_${idx}_${Date.now()}`,
        chunkId,
        index: idx,
        screen,
        speechOriginal: speech,
        emotion: 'calm',
        viewerDelta: 30,
        danmaku: [
          {
            id: `dm_fb_${idx}_1`,
            senderName: 'NightOwl_99',
            roleType: 'old_fan',
            fanLevel: 14,
            text: '？？？',
            timestamp: Date.now(),
          },
          {
            id: `dm_fb_${idx}_2`,
            senderName: 'kusa_www',
            roleType: 'troll',
            fanLevel: 6,
            text: '草 www',
            timestamp: Date.now() + 100,
          },
        ],
      });
    });
  }

  if (beats.length === 0) {
    beats.push({
      id: `beat_${chunkId}_0_${Date.now()}`,
      chunkId,
      index: 0,
      screen: '主播调整了一下麦克风支架，视线落回屏幕前。',
      speechOriginal: rawText.slice(0, 120) || 'Can everyone hear me clearly?',
      emotion: 'calm',
      viewerDelta: 20,
      danmaku: [],
    });
  }

  // 把用户真实发送的弹幕/SC/礼物挂载到第 1 拍最前面，绝不改动或捏造
  if (pendingUserInputs && pendingUserInputs.length > 0 && beats[0]) {
    beats[0].danmaku = [...pendingUserInputs, ...beats[0].danmaku];
  }

  return beats;
}
