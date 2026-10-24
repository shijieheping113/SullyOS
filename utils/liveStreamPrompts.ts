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
  resolveScTier,
  SC_CUSTOM_MIN,
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
   - **留白专注拍（允许不开口）**：你这一轮直播里至少有 1 拍专注于手头动作、喝水、调麦克风、盯屏幕操作或憋笑，此时 \`speechOriginal\` 填空字符串 \`""\`，只在 \`screen\` 里写动作、神态与环境声。
   - **扫视聊天栏的半拍延迟**：主播是忙完手头这一小段动作后，才偏头扫一眼副屏/手机屏幕上的聊天栏。要回应的那一条，先把弹幕原文念出来，再接自己的话。一次扫到很多条时，不用把每条原文都念完，挑要接的那几条念原文，其余可以带过。念出来的必须是已经写在公屏上的那一句原文，不许现编一句观众没发过的话再假装看见了。
3. **真实聊天栏生态（去“夸夸群”，做嘴碎损友与复读机）**：
   - 聊天栏观众有老会员（Member）、起哄损友（抓主播口误、刷问号 \`???\`、\`LMAO\`、\`草\`、\`www\`）、指令党、纯路人和外国观众。
   - **随直播类型与当拍节奏变调**：弹幕重心紧贴本场题材与当拍画面——竞技/游戏局盯战况、操作与下饭失误；下厨/手作/日常盯具体步骤、物件与小插曲；电台/陪伴/歌回随节奏放缓，聊心事、听歌共鸣或安静打卡；杂谈顺着话头延伸或歪楼，不刷与当前场景脱节的万金油套话。
   - **多视角分流（拒绝纯夸夸群）**：不同观众关注点各异——有人聊主播手头的事，有人抓画面角落细节、环境音或口误，有人借题聊自己的经历，有人在公屏互相接话抬杠，也有刚进房状况外发问的路人；非高光时刻严禁排队刷无脑吹捧。
   - **拒绝机械排班与同质复刻**：五类 \`roleType\` 按当拍情境自然分布，严禁每拍各凑一条点名排班；同一拍可多人围着同一处细节复读或起哄，长短句与简短反应交错，前后拍不重复同类句式。
   - **观众是来作客的**：观众是客人，不是来当打分员的无条件粉丝，这一趟值不值由主播当下的表现决定——状态在线、营业到位，他们会合拍、会热场、会跟着玩；敷衍、卡壳、发呆或冷场时，他们会半开玩笑地施压、阴阳两句、催进度、点单点播。期待值随主播当拍状态起伏，不要写成固定夸或固定骂，也不要因为主播没营业就集体声讨。
`;

// ==================== 2. 多语种配信与同传双轨规则 ====================

/** 频道里的弹幕风格。0 最叛逆，100 最友好。中间（默认）不追加提示词。 */
export function buildDanmakuWarmthRule(warmth?: number): string {
  const n = Math.max(0, Math.min(100, Math.round(typeof warmth === 'number' ? warmth : 50)));
  // 中间档就是默认公屏，不再塞一段「中等温度」说明
  if (n > 40 && n < 60) return '';
  // 只给分档区间和味道，绝不给示范句——模型会照抄示范，档位就废了
  const tone =
    n <= 15
      ? `极低档（0–15，当前 ${n}）：公屏几乎不顺着主播。吐槽、抬杠、对抗、调戏、施压是常态，不满会直接写出来，可以出现难听的恶评，但整体仍要像真人公屏——阴阳怪气、看热闹、起哄多过单纯辱骂。夸奖类弹幕极其稀有：多数拍一条都没有，整轮至多一两条，且不带热烈语气。`
      : n <= 35
      ? `偏低档（16–35，当前 ${n}）：弹幕经常不买账。挑刺、调侃主播的私事和私联、泼冷水是常见味道，偶尔冲出更难听的恶评。友好弹幕是少数，往往还带着挑刺的尾巴。`
      : n <= 40
      ? `略低档（36–40，当前 ${n}）：弹幕整体平常，但毒舌和挑刺明显多过夸奖，客套话很少。`
      : n <= 80
      ? `偏高档（60–80，当前 ${n}）：弹幕整体护着主播。接话、心疼、捧场是主流，毒舌罕见且多半是玩笑。`
      : `溺爱档（86–100，当前 ${n}）：公屏整体溺爱、护短，几乎见不到刺。狂热粉只允许极其稀少地出现一条，不要刷屏。`;
  return `### 弹幕风格（频道设置，生成路人弹幕时必须严格遵守）

${tone}

生成每一条路人弹幕前先对照当前档位，拿不准往哪个味道写时，往档位方向靠。`;
}

export function buildVoiceLanguageAndTranslationRule(channel: StreamerChannelProfile): string {
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
   - \`speechOriginal\` 和 \`speechTranslated\` 是同一段话的两个版本，句数必须一样，顺序必须一样，每一句的结尾符号种类必须一样：问号对问号、句号对句号、感叹号对感叹号、省略号对省略号。英文句点按句号算。不许把两句并成一句，不许把一句拆成两句，不许把问号写成逗号。
   - 正确：\`Wait, really? That's insane.\` 对 \`你说真的？那也太离谱了吧。\`
   - 错误：\`Wait, really, that's insane.\` 对 \`你说真的？那也太离谱了吧。\`（英文用了逗号，中文用了问号，句数不一样）
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
export function buildSessionHistoryBlock(
  session: LiveStreamSession,
  /** 即将生成的那一轮下标；圈出来的弹幕只对这一轮（含重 Roll）生效 */
  replyTargetChunkIndex = session.chunks.length,
): string {
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
      const lines = [`  [拍 ${bi + 1}] 画面：${b.screen} ｜ 台词：${sp || '（专注未开口）'}`];
      (b.danmaku || []).forEach(d => {
        const body = (d.text || '').trim();
        if (!body && !d.giftName && !(d.scAmount && d.scAmount > 0)) return;
        const extra = d.translation && d.translation.trim() && d.translation.trim() !== body
          ? `（译：${d.translation.trim()}）`
          : '';
        const tag = d.scAmount && d.scAmount > 0
          ? `SC¥${d.scAmount}`
          : d.giftName
            ? `礼物${d.giftName}`
            : '弹幕';
        lines.push(`    已出现的${tag} ${d.senderName || '观众'}：「${body}」${extra}${
          d.replyRequested && d.replyTargetChunkIndex === replyTargetChunkIndex ? '  ← 待回应' : ''
        }`);
      });
      return lines.join('\n');
    });
    rawLines.push(`【第 ${c.index + 1} 轮 · 原文】\n${beatLines.join('\n')}`);
  });

  // 旧场次只有 rollingSummaries（跨轮阶段摘要），只按兼容读，不再新写
  const legacySummaries = (session.rollingSummaries || [])
    .filter(s => !chunks.some(c => c.index >= s.fromChunkIndex && c.index <= s.toChunkIndex && c.roundSummary))
    .map(s => `【旧阶段摘要 · 第 ${s.fromChunkIndex + 1}~${s.toChunkIndex + 1} 轮】\n${s.content}`);

  const parts: string[] = [];
  // 单条时间线按轮次从早到晚排开，并明说哪一条是刚发生的，避免模型分不清先后顺序。
  parts.push(
    `### 本场直播已经发生过的轮次（按时间从早到晚排列，共 ${chunks.length} 轮；最后一条就是刚刚发生的，请从这里自然接着往下演，严禁重复已经说过的台词）`,
  );
  if (legacySummaries.length > 0) {
    parts.push(`【更早的旧阶段摘要 · 仅作前情】\n${legacySummaries.join('\n\n')}`);
  }
  if (compressedLines.length > 0) {
    parts.push(compressedLines.join('\n\n'));
  }
  if (rawLines.length > 0) {
    parts.push(rawLines.join('\n\n'));
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
  // 自定义分区自己写的说明优先；预设分区还按原来的表；都没有才用中性兜底
  const categoryHint =
    (session.categoryHint || '').trim() ||
    (preset ? preset.promptHint : '') ||
    '自由直播，展现真实自然的主播状态。';

  // 1. 本场前情（逐轮摘要 + 最近 3 轮原文）
  // 即将生成的那一轮下标：新建一轮 = 现有轮数；重 Roll = 被替换那一轮的下标（传进来的 session 已经摘掉它）
  const replyTargetChunkIndex = session.chunks.length;
  const sessionHistoryBlock = buildSessionHistoryBlock(session, replyTargetChunkIndex);
  // Ann 在公屏上圈出来、这一轮必须接住的弹幕：标记已经贴在原文行尾，这里只算条数决定要不要写说明
  const replyRequestCount = session.chunks.reduce(
    (total, chunk) =>
      total +
      chunk.beats.reduce(
        (n, beat) =>
          n +
          (beat.danmaku || []).filter(
            d => d.replyRequested && d.replyTargetChunkIndex === replyTargetChunkIndex,
          ).length,
        0,
      ),
    0,
  );
  const progressBlock =
    sessionHistoryBlock ||
    '### 当前进度\n这是本场直播的**第 1 轮**，请展现刚开播调设备、跟陆续进房的观众打招呼或直接进入今日主题的状态。';
  const roomPulseBlock = `### 直播间热度（你手里的温度计，跟着你的表现走，不是装饰）
- 现在在线大约 ${session.viewerCount || 0} 人；频道订阅约 ${channel.followerCount} 人。多数时间是糊糊的日常直播，不是每一拍都是爆点。
- 在线人数随你的直播状态真实涨跌：整活成功、话题爆了、高光名场面，观众会涌进来；摆烂、冷场、得罪观众，人会慢慢走掉，只剩僵尸粉挂着。
- 你输出的每个 Beat 都有一个 \`viewerDelta\` 字段：这一拍在线人数的**净变化**（进来减走掉的绝对人数；正数涨、负数跌、没动静写 0）。按因果写，别乱猜大数字：平铺的日常 ±个位数到几十；真爆点可以上百；小频道突然破圈那种奇迹级场面才允许上千。
- 小频道也可能一夜爆火，大频道也可能今天没人掏钱——一切皆有可能，但必须由这一拍的实际内容说得出理由。`;

  // 2. 待结算的观众互动队列（物理隔离小号真名！）
  const pendingQueue = session.pendingDanmakuQueue || [];
  let audienceInputBlock =
    '### 本轮期间新收到的观众弹幕与 Super Chat\n（本轮没有指定弹幕。请按自己的直播节奏往前推进。若要和公屏互动，只能回应你写进本拍 danmaku 的原文，或前情里标着「已出现的弹幕」的原句。禁止在台词里编一条没出现过的观众发言。）';
  if (pendingQueue.length > 0) {
    const items = pendingQueue.map(d => {
      const scPrefix =
        d.scAmount && d.scAmount > 0
          ? (() => {
              // 颜色必须和画面档位一致：绿¥5 / 黄¥20 / 橙¥50 / 紫¥200 / 红¥500，禁止自己编成别的颜色
              const tier = resolveScTier(d.scAmount, d.scColor);
              return `💎【Super Chat 付费醒目留言 ${d.scCurrency || '¥'}${d.scAmount} · ${tier.colorLabel}卡片（档位：绿¥5／黄¥20／橙¥50／紫¥200／红¥500／¥800起红底金边；念颜色时必须说「${tier.colorLabel}」，禁止说成别的颜色！必须在第 1 拍先把这条原文念出来再回应！）】`;
            })()
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

  // 3.5 导演引导：不是弹幕，是接下来走向的要求
  const guidance = session.pendingGuidance || [];
  const guidanceBlock = guidance.length > 0
    ? `### 导演引导（重要：这不是观众弹幕，不要把它写成公屏发言，也不要让任何观众念出它）\n用户希望接下来的直播往这些方向走，请让画面、话题和主播反应自然体现出来：\n${guidance.map(g => `- ${g.text}`).join('\n')}\n- 引导里涉及在线人数、打赏热度的要求，直接照办：用 viewerDelta 和当拍内容把它落实，不要讨价还价，也不要解释。`
    : '';

  // 3.6 圈出来的弹幕：行尾已经标好「← 待回应」，不重复抄原文
  const replyRequestBlock = replyRequestCount > 0
    ? `### 我圈出来的弹幕（这一轮必须接住）
- 上面公屏里行尾标着「← 待回应」的那几条，是我这一轮想让你接的，不要整轮装作没看见。
- 最多用前三拍把它们全部接住，不要拖到后面。
- 用你自己的性格、当时手头的状态去接：可以顺着话头歪、可以吐槽、可以只接半句，不要生硬，不要客服腔，不要一条一条排队答问。
- 原话不用一字不差，念一部分、念关键词、或者只接意思都行，但那条弹幕必须被明确接住。
- 「← 待回应」是我给你的字，不是观众发的内容，绝对不要出现在公屏上，也不许让任何观众念出来。`
    : '';

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
${session.customTopic ? `- 今天播什么（主题）：${session.customTopic}` : ''}

${REAL_STREAMER_VIBE_RULES}

${buildDanmakuWarmthRule(channel.danmakuWarmth)}

${buildVoiceLanguageAndTranslationRule(channel)}

### 打赏与营收常识
- 公屏弹幕是大头，Super Chat 和频道礼物是稀罕事：一轮里大多数拍只有普通弹幕，付费零星出现，频率跟着直播状态走，不是每拍都有。
- 金额跟着现场热度走：糊糊直播大多是小额（¥5/¥20），¥50 算偶尔，¥200 已经是稀客，¥500/¥800+ 只有真高光时刻才可能出现；摆烂冷场时一分钱都没有也很正常，只剩僵尸粉挂着。
- 频道大小不决定今天收多少——小主播整出爆活也可能有人豪掷一把，大火主播摆烂也可能没人愿意花钱。乱发大额和常年大零蛋都不真实。

### 收到 Super Chat 和礼物（主播看得到，不是装饰）
- 你写进本拍 \`danmaku\` 的 SC、礼物，以及上方「刚刚刷出」、前情里「已出现」的 SC 和礼物，都是观众已经打过来的。主播看得到。
- 直播惯例上，SC **理应**念出原文和金额（¥800 及以上是红底金边，念颜色时说「红底金边」）；礼物 **理应**道谢并点出礼物名。这不是强制：可以按性格没看见、故意不念、或者过一会儿才补。
- 若要回应某一条：先念那条原文，再接自己的话。同时扫到很多条时，不用逐条把原文全念完。
- 不念、不谢，会员和观众可能不满、刷恶评、人走掉。怎么做由主播性格自由发挥，不要写成每条都必须营业的客服。

### 输出格式要求（严格输出 JSON 数组，包含 ${beatCountRule} 连续的直播节拍 Beat）
请直接输出一个 JSON 数组（不要包裹额外的解释文字），数组每一项代表 1 个直播小节（Beat），结构如下：
\`\`\`json
[
  {
    "screen": "镜头画面、主播肢体动作、表情、操作细节或突发小状况（40~85字，具象有画面感，禁止套话）",
    "speechOriginal": "主播这一拍开口说的原声台词（若是外语配信则写地道外语口语；若是留白专注拍可为空字符串）",
    "speechTranslated": "若开启外语配信，这里直接写中文同传译文（不要加'译：'前缀）；若本身是中文配信则填空字符串",
    "emotion": "calm | happy | sad | angry | surprised | fearful 之一",
    "viewerDelta": 12,
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
注意：每一拍的 \`danmaku\` 数组请生成 4~6 条鲜活、有梗的路人实时弹幕（包含复读、吐槽、问号海等；具体生态随本场直播类型与当拍画面切换，体现不同观众视角，拒绝纯夸夸与五类身份机械排班，观众按客人心态随主播当拍表现给出或热场或施压的反馈）。**弹幕的味道严格执行上面「弹幕风格」段的档位；SC 和礼物的出现频率与金额严格执行「打赏与营收常识」**。\`viewerDelta\` 按「直播间热度」段的因果规则写，没有明显动静就写 0。\`scAmount\` 只用于 Super Chat 付费醒目留言；普通频道礼物要填 \`giftName/giftEmoji/giftAmount\`，不能填进 \`scAmount\`。礼物是数字贴纸形式的打赏，不是实物。**绝对禁止在 danmaku 里出现 ${allForbidden.join('、')} 的名字**！
### 互动只能对着已经出现的弹幕（禁止幻觉）
- 台词里如果要点名、念出或回应某一条观众发言，那句话必须能在下面两处对上原文：本拍 \`danmaku[].text\`（或它的 \`translation\`），以及上方「刚刚刷出」列表 / 前情里「已出现的弹幕」。
- 先把要互动的那句写进本拍 \`danmaku\`，再在台词里用同一句原文回应。禁止先在台词里编「有人说／刚才刷了／弹幕问」一句观众没发过的话。
- 不想互动就继续做手头的事，不要为了热闹凭空念弹幕。导演引导不是弹幕，不能被观众念出来。
- 路人也可以偶尔发 Super Chat 或频道礼物，不要每拍都有。SC 金额只能是 5、20、50、200、500，或 800 及以上的自定义金额（800 及以上是红底金边，\`scAmount\` 写实际整数，不要写 501 到 799）。礼物填 \`giftName/giftEmoji/giftAmount\`，用这个频道已有的礼物名。写进 danmaku 的付费和礼物，主播这一拍或下一拍要能当作真的收到了。`;

  const taskParts: string[] = [roomPulseBlock, progressBlock, boundaryBlock, audienceInputBlock, replyRequestBlock, guidanceBlock, rerollBlock];
  if (includeUserLocation) {
    const locationText = await getUserLocationContext(userName).catch(() => '');
    if (locationText && locationText.trim()) taskParts.splice(1, 0, locationText.trim());
  }
  taskParts.push(`请紧接上文，生成本场你自己的直播里第 ${session.chunks.length + 1} 轮的新内容（共 ${beatCountRule} 拍 JSON 数组）。`);

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
    scColor?: import('./liveStreamTypes').LiveScColor | 'blue' | 'cyan' | 'amber' | 'magenta';
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

function normalizeDanmakuQuote(value?: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[「」"'“”『』。！？!?、，,.\u2026~～]/g, '');
}

const INVENTED_CHAT_CUE =
  /有人(?:说|刷|问|写|留言)|刚才(?:有人|那条|那句|弹幕|刷)|刚刚(?:有人|那条|弹幕|刷)|弹幕(?:说|里|上|写着)|公屏(?:上|里)|聊天栏|水友(?:说|刷)|这条弹幕|那条弹幕|コメントで|チャットで|って書いてある|って来てる/;

function quoteMatchesRealDanmaku(quote: string, allowed: string[]): boolean {
  const normalized = normalizeDanmakuQuote(quote);
  if (!normalized) return true;
  return allowed.some(item => {
    if (!item) return false;
    if (normalized.length < 2) return item === normalized;
    return item.includes(normalized) || normalized.includes(item);
  });
}

/** 台词里用引号念出的观众发言，对不上真正出现过的弹幕就删掉那一句 */
export function stripInventedDanmakuCitations(speech: string, allowed: string[]): string {
  if (!speech || !speech.trim()) return speech || '';
  const kept = speech.split(/(?<=[。！？!?…\n])/).filter(sentence => {
    if (!INVENTED_CHAT_CUE.test(sentence)) return true;
    const quotes = [...sentence.matchAll(/[「“"『]([^」”"』]{1,80})[」”"』]/g)].map(match => match[1]);
    if (quotes.length === 0) return true;
    return quotes.every(quote => quoteMatchesRealDanmaku(quote, allowed));
  });
  return kept.join('').replace(/[ \t]{2,}/g, ' ').trim();
}

function collectAllowedDanmakuTexts(beats: LiveBeat[], priorTexts: string[]): string[] {
  const bag: string[] = [];
  const push = (value?: string) => {
    const normalized = normalizeDanmakuQuote(value);
    if (normalized) bag.push(normalized);
  };
  priorTexts.forEach(push);
  beats.forEach(beat => {
    (beat.danmaku || []).forEach(item => {
      push(item.text);
      push(item.translation);
      push(item.giftName);
    });
  });
  return bag;
}

// ==================== 7. 一轮打赏总额的宽闸（只拦天文数字，不拦正常爆火） ====================

/**
 * Ann 2026-10-25 定的规矩：打赏多少该跟着直播状态走，提示词讲常识；
 * 代码只留一道宽闸防模型乱编——一轮（AI 生成的路人部分）SC+礼物总额
 * 不超过「在线人数 × ¥15」（糊糊直播保底 ¥150），超了就从最大那笔开始往下削，
 * 削到 0 就退回普通弹幕（文字保留，钱没了）。爆火时人数也涨，闸跟着人数走，自洽。
 * 用户自己发的 SC/礼物（isUserMain/isUserAlt）绝不碰。
 */
const LIVE_PAID_BUDGET_PER_VIEWER = 15;
const LIVE_PAID_BUDGET_FLOOR = 150;

function clampRoundPaidBudget(beats: LiveBeat[], viewerCount?: number): void {
  // 没给在线人数就算不出预算：这趟不设闸（真实生成路径永远带 viewerCount）
  if (typeof viewerCount !== 'number' || !Number.isFinite(viewerCount)) return;
  const viewers = Math.max(0, Math.round(viewerCount));
  const cap = Math.max(LIVE_PAID_BUDGET_FLOOR, viewers * LIVE_PAID_BUDGET_PER_VIEWER);
  const paidRows: Array<{ item: LiveDanmakuItem; amount: number }> = [];
  let total = 0;
  beats.forEach(beat => {
    (beat.danmaku || []).forEach(item => {
      if (item.isUserMain || item.isUserAlt) return;
      const amount =
        (item.scAmount && item.scAmount > 0 ? item.scAmount : 0) +
        (item.giftAmount && item.giftAmount > 0
          ? item.giftAmount * (item.giftCount && item.giftCount > 1 ? item.giftCount : 1)
          : 0);
      if (amount > 0) {
        paidRows.push({ item, amount });
        total += amount;
      }
    });
  });
  if (total <= cap) return;

  paidRows.sort((a, b) => b.amount - a.amount);
  for (const row of paidRows) {
    const excess = total - cap;
    if (excess <= 0) break;
    const item = row.item;
    const isSc = Boolean(item.scAmount && item.scAmount > 0);
    const keep = Math.max(0, row.amount - excess);
    if (keep <= 0) {
      // 削到 0：整笔退回普通弹幕，文字还在，钱没了
      if (isSc) {
        item.scAmount = undefined;
        item.scColor = undefined;
        item.scCurrency = undefined;
      } else {
        item.giftName = undefined;
        item.giftEmoji = undefined;
        item.giftAmount = undefined;
        item.giftCurrency = undefined;
        item.giftCount = undefined;
      }
      total -= row.amount;
    } else {
      if (isSc) {
        item.scAmount = Math.round(keep);
        item.scColor = resolveScTier(item.scAmount).color;
      } else {
        item.giftAmount = Math.round(keep);
        item.giftCount = undefined;
      }
      total -= row.amount - keep;
    }
  }
}

export function parseLiveBeatsResponse(
  rawText: string,
  chunkIdOrSessionId: string,
  arg3: any,
  arg4: any = [],
  arg5?: string[],
  priorDanmakuTexts: string[] = [],
  gate?: { viewerCount?: number },
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
        let scAmt = Number(d?.scAmount) > 0 ? Math.round(Number(d.scAmount)) : undefined;
        if (scAmt && scAmt > 500 && scAmt < SC_CUSTOM_MIN) scAmt = SC_CUSTOM_MIN;
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
          scColor: scAmt && scAmt > 0 ? resolveScTier(scAmt).color : undefined,
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
        // 模型没写人数变化就是这一拍没动静；旧版这里随机抽 -15~45，现在是死代码抽卡，改 0
        viewerDelta: Number.isFinite(Number(item?.viewerDelta)) ? Math.round(Number(item.viewerDelta)) : 0,
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
        viewerDelta: 0,
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
      viewerDelta: 0,
      danmaku: [],
    });
  }

  // 把用户真实发送的弹幕/SC/礼物挂载到第 1 拍最前面，绝不改动或捏造
  if (pendingUserInputs && pendingUserInputs.length > 0 && beats[0]) {
    beats[0].danmaku = [...pendingUserInputs, ...beats[0].danmaku];
  }

  // 打赏宽闸：只拦一轮总额离谱，用户自己发的钱不碰
  clampRoundPaidBudget(beats, gate?.viewerCount);

  const priorTexts = isFiveArgs && Array.isArray(priorDanmakuTexts) ? priorDanmakuTexts : [];
  const allowed = collectAllowedDanmakuTexts(beats, priorTexts);
  return beats.map(beat => ({
    ...beat,
    speechOriginal: stripInventedDanmakuCitations(beat.speechOriginal || '', allowed),
    speechTranslated: beat.speechTranslated
      ? stripInventedDanmakuCitations(beat.speechTranslated, allowed)
      : beat.speechTranslated,
  }));
}
