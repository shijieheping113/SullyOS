/**
 * 直播与视频平台（OnAir / 电波）提示词构建器、主副模型双擎调度与两层容错解析器
 *
 * 核心设计：
 * 1. 主播本位（Streamer-Centric）：主角是 Char，70%-80% 推進自身直播主线，不围着用户转。
 * 2. 活人感去端着（Anti-Cringe）：半截话口语、留白拍（允许专注操作不说话）、设备小插曲、损友复读弹幕生态。
 * 3. 大小号物理级防穿帮：小号马甲发言绝不向模型暴露用户的真实名字 userName。
 * 4. 微信私聊实时互通：自动读取直播开始后用户在微信私聊发来的捣乱消息，触发镜头前微表情与掩饰反应。
 * 5. 主副模型双擎分流（apiConfig.secondaryLlm）：
 *    - 辅助模型负责：阶段滚动总结、下播全貌总结、NPC 陪看房的奇葩主播演出、以及网友弹幕池扩充/格式修复。
 */
import type { APIConfig, CharacterProfile, Message, UserProfile } from '../types';
import { ContextBuilder } from './context';
import { resolveDialogueApi } from './characterApi';
import { isSecondaryLlmReady } from './secondaryLlmApi';
import { secondaryLlmCall } from './secondaryLlmCall';
import { extractContent, safeFetchJson } from './safeApi';
import { voiceLanguagePromptLabel } from './voiceLanguage';
import {
  StreamerChannelProfile,
  LiveStreamSession,
  LiveBeat,
  LiveDanmakuItem,
  VodVideoPost,
  VodChapterBeat,
  VodCommentItem,
  NpcWatchSession,
  NpcBeatItem,
  STREAM_PRESET_TEMPLATES,
} from './liveStreamTypes';

// ==================== LLM 调用封装（主模型 & 辅助模型双擎） ====================

export async function callMainStreamerLlm(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  purpose: string;
}): Promise<string> {
  const effective = resolveDialogueApi(opts.apiConfig, opts.char);
  if (!effective.baseUrl || !effective.apiKey) {
    throw new Error('请先在设置中配置可用的 API Key 与地址');
  }
  const url = `${effective.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const data = await safeFetchJson(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effective.apiKey}`,
      },
      body: JSON.stringify({
        model: effective.model,
        messages: opts.messages,
        temperature: opts.temperature ?? effective.temperature ?? 0.85,
        stream: true,
      }),
    },
    1,
    90_000,
    { appId: 'live_stream', charId: opts.char.id, purpose: opts.purpose },
  );
  return (extractContent(data) || '').trim();
}

/**
 * 优先调用设置里的辅助模型（secondaryLlm）；若用户未开启辅助模型，则平滑回退到主模型。
 */
export async function callAuxOrMainLlm(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  purpose: string;
}): Promise<{ text: string; usedSecondary: boolean }> {
  if (isSecondaryLlmReady(opts.apiConfig.secondaryLlm)) {
    try {
      const text = await secondaryLlmCall({
        config: opts.apiConfig.secondaryLlm!,
        purpose: opts.purpose,
        messages: opts.messages,
        featureOpts: { temperature: opts.temperature ?? 0.75 },
        charId: opts.char.id,
      });
      if (text && text.trim()) {
        return { text: text.trim(), usedSecondary: true };
      }
    } catch (e) {
      console.warn('[OnAir] 辅助模型调用失败，回退主模型:', e);
    }
  }
  const text = await callMainStreamerLlm(opts);
  return { text, usedSecondary: false };
}

// ==================== 活人感与去端着核心准则 ====================

const REAL_STREAMER_VIBE_RULES = `### 真实直播「活人感」硬规矩（严禁播音腔与排练感）
1. **主播本位（70%~80% 精力在自己的事上）**：
   - 你是这场直播的号主，手里有正在做的正事（打游戏、念信、唱歌、吃东西、聊自己的日常）。不要像客服一样盯着公屏有问必答，更不要围着某一个观众转。
   - 观众不说话时，你依然自己在推进节奏、自言自语、操作翻车、喝水叹气。
2. **拆掉书面腔，写出真人开口的毛边感**：
   - 真人对着麦克风说话有口癖、半截话、停顿、语气词、甚至嘴瓢和卡壳（例如盯着屏幕操作时话说到一半断掉：“等下我先跳这……草，没勾上”，或者念弹幕念一半笑场、清嗓子、吸溜一口冰饮）。
   - 禁止输出长篇大论的演讲稿或小说心理独白。一句台词宜短、碎、自然。
3. **允许「留白拍（不说话的瞬间）」与突发小意外**：
   - 每段 5~6 拍里，**至少安排 1 拍是「纯操作/纯动作/突发小插曲」**：此时 \`speechOriginal\` 可以为空字符串 \`""\` 或只有极短的气音（如“嘶——”“啧”）。比如专心打 Boss 屏住呼吸猛敲键盘、低头偷看微信手机屏幕、起身去拿外卖只留一把空电竞椅、或者麦克风不小心碰响/切错窗口。
4. **拒绝全员捧哏夸夸群 —— 真实互联网弹幕生态**：
   - 严禁弹幕清一色刷“主播好帅/好厉害”。真实直播间里：
     - **损友老粉（占多数）**：专门拆台、记黑历史、刷问号海（\`？\`、\`6\`、\`经典嘴硬\`、\`省流：菜\`、\`急了急了\`、\`截屏当表情包了\`）。
     - **弹幕教练**：指点江山教做事（“左边有怪啊瞎子！”“这波不交闪？”）。
     - **复读机与乐子人**：一旦主播翻车或失态，满屏复读同一句话。
5. **扫视公屏与半拍延迟**：
   - 你看弹幕是扫视的：普通弹幕如果很多，你可能顺嘴带过或漏看；遇到损你的弹幕你会挂出来回怼，遇到害羞的弹幕你可能故意装瞎跳过（引发弹幕刷“装看不见是吧”）。
   - 只有收到 **SC（醒目留言/高额打赏）** 时，你才必须停下动作重点念出对方 ID 并回应。`;

// ==================== 多语种原声与野生同传指令 ====================

function buildVoiceLanguageAndTranslationRule(channel: StreamerChannelProfile): string {
  const lang = (channel.voiceConfig?.language || '').trim();
  const transOn = !!channel.voiceConfig?.translationEnabled;
  if (!lang) {
    return `### 语言要求
- 主播台词 \`speechOriginal\` 使用自然口语中文；\`speechTranslated\` 留空 \`""\`。
- 弹幕默认以中文为主，可极少量夹杂 1 条外语野人弹幕增添真实感。`;
  }

  const langLabel = voiceLanguagePromptLabel(lang);
  return `### 外语原声配信与「野生同传」双轨模式（重要！）
当前频道设定为 **${langLabel}（${lang}）** 母语/外语配信${transOn ? '，且用户开启了【中文同传翻译模式】' : ''}：
1. **主播原声台词（\`speechOriginal\`）**：
   - 必须使用地道、自然的 **${langLabel}口语** 书写（这段文字会直接送进 ${langLabel} TTS 语音合成器朗读，严禁夹杂中文阶段旁白！）。
2. **主播中文同传字幕（\`speechTranslated\`）**：
   - 必须提供与 \`speechOriginal\` 一一对应的地道中文翻译（模拟直播间野生同传组/烤肉字幕，保留语气与梗）。若该拍主播未开口，两者均为空字符串。
3. **多国真实弹幕生态（带 \`translation\` 中文译文）**：
   - 直播间观众以 **${langLabel}母语观众为主（约 70%，使用当地真实直播黑话，如日语直播刷 \`草\`、\`かわいい\`、\`初見です\`、\`ナイス\`、\`？？？\`）**，随机混入 **15%~20% 的其他国家外国人弹幕（如英语海外粉）** 以及少量中文观众。
   - 凡是非中文的弹幕，必须在弹幕对象的 \`translation\` 字段填写对应的中文翻译，方便只能看懂中文的用户无障碍看懂弹幕梗！`;
}

// ==================== 频道人设与大小号物理隔离说明 ====================

function buildChannelPersonaBlock(
  char: CharacterProfile,
  channel: StreamerChannelProfile,
  userName: string,
): string {
  const modeDesc =
    channel.identityMode === 'secret_alt'
      ? `【隐藏身份的匿名小号/马甲频道】你没有公开自己的真实姓名（对外只叫频道名「${channel.channelName}」），不露正脸或开了伪装。熟人如果直接用真名在公屏叫你，你会慌张掩饰防止掉马；但台下你的本性依然是 ${char.name}。`
      : channel.identityMode === 'vtuber'
        ? `【虚拟皮套人（VTuber）频道】你正顶着虚拟形象皮套「${channel.channelName}」营业，对外有皮套设定，但中之人是你本人（${char.name}），经常在营业声线和本性吐槽之间破功反差。`
        : `【公开本尊频道】这是你（${char.name}）公开的个人直播频道「${channel.channelName}」。`;

  return `### 你的主播频道档案
- 频道名称：${channel.channelName}（账号：${channel.handle}）
- 粉丝牌名称：「${channel.fanBadgeName}」｜ 当前粉丝数：${channel.followerCount}
- 频道性质：${modeDesc}
- 频道简介：${channel.bio}
- 镜头前营业风格与反差设定：${channel.personaPrompt}

### 观众身份识别硬规则（严禁未卜先知！）
- 直播间里进出成百上千名观众。
- **只有当弹幕/SC 明确标注为 \`[熟人本尊大号：${userName}]\` 时**，你才认出这是现实里认识的 ${userName} 来你直播间了（你可以根据你们的关系表现暗爽、耳红、故意损TA、或注意形象）。
- **凡是标注为 \`[普通观众/老板：XXX]\` 的弹幕或 SC**，哪怕语气再熟稔、出手再阔绰，在你眼里都**只是一个素不相识的网友/榜一老板**！严禁把陌生 ID 猜成 ${userName}，严禁对路人 ID 表现出只对 ${userName} 才有的私密记忆！`;
}

// ==================== 提取直播期间微信私聊「捣乱消息」 ====================

export function extractRecentWechatInterruptions(
  allMsgs: Message[],
  sessionStartedAt: number,
  charName: string,
  userName: string,
): string {
  // 找出直播开始后（或最近 15 分钟内）在普通私聊（非 date/call/live/home）里产生的消息
  const cutoff = Math.max(sessionStartedAt - 60_000, Date.now() - 20 * 60_000);
  const recentChat = allMsgs.filter(m => {
    const src = m.metadata?.source;
    if (src === 'date' || src === 'call' || src === 'live' || src === 'home' || src === 'story_theater_memory') {
      return false;
    }
    if (m.role !== 'user' && m.role !== 'assistant') return false;
    return m.timestamp >= cutoff;
  }).slice(-6);

  if (recentChat.length === 0) return '';

  const lines = recentChat.map(m => {
    const who = m.role === 'user' ? `${userName}（在微信私聊发来）` : `${charName}（在桌子底下偷偷回微信）`;
    return `- ${who}：「${(m.content || '').slice(0, 160)}」`;
  });

  return `### 【高能联动：你在直播时，桌上的手机微信刚收到了 ${userName} 的私聊消息！】
以下是刚刚在直播同时，你手机微信上与 ${userName} 的私下对话：
${lines.join('\n')}

👉 **演出要求**：如果 ${userName} 刚在微信里逗你、吐槽你、或者命令你做什么，你必须在这一段直播的镜头画面（\`screen\`）和台词里体现出**“台上开着直播 vs 台下收到微信”的微表情反差**！（例如：直播到一半听见手机震动，低头瞥了一眼微信突然卡壳、耳尖发红、呛水、或者欲盖弥彰地清嗓子，引得直播间路人弹幕纷纷刷问号猜主播在看谁的消息；但注意别在公开直播间直接把微信隐私念出来，除非你是故意隔空回怼！）`;
}

// ==================== 构建「生成下一段直播切片（Chunk）」请求 ====================

export async function buildLiveChunkGenerationMessages(opts: {
  char: CharacterProfile;
  userProfile: UserProfile;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  allMsgs: Message[];
  customDirection?: string;
}): Promise<Array<{ role: string; content: string }>> {
  const { char, userProfile, channel, session, allMsgs, customDirection } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';

  const preset = STREAM_PRESET_TEMPLATES.find(t => t.key === session.categoryKey);
  const categoryHint = preset ? preset.promptHint : '自由直播，展现真实自然的主播状态。';

  // 1. 阶段滚动摘要（已被折叠的前情）
  const rollingBlock = session.rollingSummaries.length > 0
    ? `### 本场直播前情阶段摘要（已折叠归档）\n${session.rollingSummaries.map((s, idx) => `【阶段 ${idx + 1}（第 ${s.fromChunkIndex + 1}~${s.toChunkIndex + 1} 段）】\n${s.content}`).join('\n\n')}`
    : '';

  // 2. 未折叠的最近切片原文
  const unfoldedChunks = session.chunks.filter(c => !c.folded).slice(-2);
  const recentChunksBlock = unfoldedChunks.length > 0
    ? `### 最近刚播完的直播画面与台词（请自然接着往下演，不要重复）\n${unfoldedChunks.map(c => {
        const beatLines = c.beats.map((b, bi) => {
          const sp = b.speechTranslated ? `${b.speechOriginal}（${b.speechTranslated}）` : b.speechOriginal;
          return `  [拍 ${bi + 1}] 画面：${b.screen} ｜ 台词：${sp || '（专注未开口）'}`;
        }).join('\n');
        return `【第 ${c.index + 1} 段】\n${beatLines}`;
      }).join('\n\n')}`
    : '### 当前进度\n这是本场直播的**开场第一段（第 1 段）**，请展现刚开播调设备、跟陆续进房的观众打招呼或直接进入今日主题的状态。';

  // 3. 待结算的观众互动队列（物理隔离小号真名！）
  const pendingQueue = session.pendingDanmakuQueue || [];
  let audienceInputBlock = '### 本段期间新收到的重点观众弹幕与 SC 打赏\n（本段期间没有特定指定弹幕，请你按自己的直播节奏往前推进，并自然扫视路人弹幕互动。）';
  if (pendingQueue.length > 0) {
    const items = pendingQueue.map(d => {
      const scPrefix = d.scAmount
        ? `🔥【¥${d.scAmount} 醒目留言 SC${d.giftName ? ' · 赠送 ' + d.giftName : ''}（必须重点念 ID 回应！）】`
        : '💬【公屏弹幕】';
      // 物理隔离：如果是小号 isUserAlt，绝不出现 userName！
      const identityLabel = d.isUserMain
        ? `[熟人本尊大号：${userName}（粉丝牌 Lv.${d.fanLevel || 20}）]`
        : `[普通观众/老板：「${d.senderName}」（粉丝牌 Lv.${d.fanLevel || 5}）]`;
      return `- ${scPrefix} ${identityLabel} 发送：「${d.text}」`;
    });
    audienceInputBlock = `### 本段期间公屏上新刷出的重点弹幕与 SC（请顺着你的直播主线自然反应）\n${items.join('\n')}`;
  }

  // 4. 微信私聊实时捣乱检测
  const wechatInterruptionBlock = extractRecentWechatInterruptions(
    allMsgs,
    session.startedAt,
    char.name,
    userName,
  );

  const systemInstruction = `你现在正在进行一场真实的直播配信。
${buildChannelPersonaBlock(char, channel, userName)}

### 本场直播主题
- 直播间标题：《${session.title}》
- 分区类型：${session.categoryLabel}
- 场景基调：${categoryHint}
${session.customTopic ? `- 今日附加设定/脚本走向：${session.customTopic}` : ''}

${REAL_STREAMER_VIBE_RULES}

${buildVoiceLanguageAndTranslationRule(channel)}

### 输出格式要求（严格输出 JSON 数组，包含 5 到 6 个连续的直播节拍 Beat）
请直接输出一个 JSON 数组（不要包裹额外的解释文字），数组每一项代表 1 个直播小节（Beat），结构如下：
\`\`\`json
[
  {
    "screen": "镜头画面、主播肢体动作、表情、操作细节或突发小状况（40~90字，具象有画面感，禁止套话）",
    "speechOriginal": "主播这一拍开口说的原声台词（若是外语配信则写地道外语口语；若是留白专注拍可为空字符串 \"\"）",
    "speechTranslated": "若开启外语配信，这里写对应的中文野生同传译文；若本身是中文配信则填 \"\"",
    "emotion": "calm | happy | sad | angry | surprised | fearful 之一",
    "viewerDelta": 120,
    "danmaku": [
      {
        "senderName": "网友昵称（符合对应语种与老粉/损友/乐子人身份）",
        "roleType": "old_fan | troll | coach | passerby | foreigner",
        "fanLevel": 12,
        "text": "弹幕原文",
        "translation": "若弹幕是外语，必填中文翻译；若是中文弹幕填 \"\"",
        "scAmount": 0
      }
    ]
  }
]
\`\`\`
注意：每一拍的 \`danmaku\` 数组请生成 4~6 条鲜活、嘴碎、有梗的实时弹幕（包含复读、吐槽、问号海等）。`;

  const userTask = [
    rollingBlock,
    recentChunksBlock,
    wechatInterruptionBlock,
    audienceInputBlock,
    customDirection ? `### 导演/本段特别走向提示\n${customDirection}` : '',
    `请紧接上文，生成第 ${session.chunks.length + 1} 段直播切片（共 5~6 拍 JSON 数组）。`,
  ]
    .filter(Boolean)
    .join('\n\n');

  // 使用统一 ContextBuilder.buildCharacterRequest 装载人设、印象、挂载世界书与近期主聊天历史
  const recentHistoryForContext = allMsgs
    .filter(m => !m.metadata?.superseded && m.metadata?.archiveMode !== 'forget')
    .slice(-18)
    .map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content || '',
    }));

  return ContextBuilder.buildCharacterRequest(
    { char, user: userProfile },
    [
      { role: 'system', content: systemInstruction },
      ...recentHistoryForContext,
      { role: 'user', content: userTask },
    ],
  );
}

// ==================== 两层容错解析器：解析直播切片 Beats ====================

export function parseLiveBeatsResponse(
  rawText: string,
  chunkId: string,
  pendingUserInputs: LiveDanmakuItem[],
): LiveBeat[] {
  const cleaned = (rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let parsedArray: any[] | null = null;

  // 第一层：标准 JSON / 截断修复解析
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
      const danmakuList: LiveDanmakuItem[] = rawDanmaku.map((d: any, di: number) => ({
        id: `dm_${chunkId}_${idx}_${di}_${Date.now()}`,
        senderName: String(d?.senderName || d?.author || d?.user || `水友_${100 + di}`).trim(),
        roleType: d?.roleType || 'passerby',
        fanLevel: Number(d?.fanLevel) || Math.floor(Math.random() * 18) + 1,
        text: String(d?.text || d?.content || '？？？').trim(),
        translation: d?.translation ? String(d.translation).trim() : undefined,
        scAmount: Number(d?.scAmount) > 0 ? Number(d.scAmount) : undefined,
        scColor: Number(d?.scAmount) >= 500 ? 'red' : Number(d?.scAmount) >= 100 ? 'orange' : Number(d?.scAmount) > 0 ? 'blue' : undefined,
        timestamp: Date.now() + di * 200,
      }));

      beats.push({
        id: `beat_${chunkId}_${idx}_${Date.now()}`,
        chunkId,
        index: idx,
        screen: String(item?.screen || item?.action || '主播看着屏幕继续推进直播。').trim(),
        speechOriginal: String(item?.speechOriginal ?? item?.speech ?? '').trim(),
        speechTranslated: item?.speechTranslated ? String(item.speechTranslated).trim() : undefined,
        emotion: String(item?.emotion || 'calm').trim(),
        viewerDelta: Number(item?.viewerDelta) || Math.floor(Math.random() * 80) - 20,
        danmaku: danmakuList,
      });
    });
  } else {
    // 第二层：掉格式纯文本按段落兜底拆拍（绝不白屏报错）
    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 6);

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
        viewerDelta: 35,
        danmaku: [
          {
            id: `dm_fb_${idx}_1`,
            senderName: '夜猫子水友',
            roleType: 'old_fan',
            fanLevel: 14,
            text: '？？？来了来了',
            timestamp: Date.now(),
          },
          {
            id: `dm_fb_${idx}_2`,
            senderName: '弹幕警察',
            roleType: 'troll',
            fanLevel: 8,
            text: '66666',
            timestamp: Date.now() + 100,
          },
        ],
      });
    });
  }

  // 确保用户在本段投递的弹幕/SC 出现在第一拍的公屏最显眼处
  if (beats.length > 0 && pendingUserInputs.length > 0) {
    const existingIds = new Set(beats[0].danmaku.map(d => d.id));
    const toPrepend = pendingUserInputs.filter(u => !existingIds.has(u.id));
    beats[0].danmaku = [...toPrepend, ...beats[0].danmaku];
  }

  return beats;
}

// ==================== 四栏高保真防爆 Token 总结提示词（走辅助模型 secondaryLlm） ====================

const FOUR_PILLAR_SUMMARY_PROMPT = `你是一位极其严谨、不漏细节的直播场记员。
请根据提供的直播原始切片与前情记录，整理出一份**高保真、去水留干、绝不丢关键细节**的纪要。

### 必须保留的四大核心细节（严禁写成笼统的空话套话！）
1. **【直播主线与具体名场面】**：
   - 主播具体播了什么、推进到了哪一步、发生了什么好笑的操作失误/嘴硬/炸麦/喝水呛到/离开座位等具体小动作。
2. **【重要互动与 SC 打赏台账（严守身份边界！）】**：
   - 滤掉毫无营养的路人水弹幕（如单纯的“哈哈哈/666”只需一笔带过公屏气氛）；
   - **必须一字不落地保留**：所有打赏 SC（金额、发送人 ID、留言内容）、所有重点互动弹幕、以及主播回应的原话或态度！
   - **铁律**：原文里标为 \`观众「XXX」\` 的互动，总结里一律写 \`观众「XXX」\`，严禁胡乱猜测他是谁！原文里标为熟人大号的，才写熟人名字。
3. **【台下微信捣乱与镜头前微表情反差】**：
   - 如果期间发生了台下微信私聊互动，必须写清：谁在微信发了什么 → 主播在镜头前出现了什么卡壳/耳红/偷看手机/掩饰反应 → 弹幕怎么起哄。
4. **【未兑现的 Flag 与未完钩子】**：
   - 主播在直播间答应观众的事、立下的赌约 Flag、或还没讲完的话题，必须明确记下，保证后续不断档。

### 写作禁令
- 严禁升华主题（不要写“大家度过了愉快的夜晚”“感情更深了”）。
- 不要使用 Markdown 标题符号（#），用紧凑的自然段或【】小标即可。`;

/**
 * 调用辅助模型（secondaryLlm 优先）生成「直播进行中的阶段滚动摘要」
 */
export async function generateLiveRollingSummary(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  chunksToFold: LiveStreamSession['chunks'];
}): Promise<string> {
  const rawMaterial = opts.chunksToFold
    .map(c => formatChunkTextForSummary(opts.channel, opts.session, c))
    .join('\n\n');

  const prevSummaries = opts.session.rollingSummaries
    .map((s, i) => `【更早阶段 ${i + 1}】${s.content}`)
    .join('\n');

  const userContent = [
    prevSummaries ? `已有的更早阶段摘要（供参考衔接，请勿重复抄写）：\n${prevSummaries}` : '',
    `本次需要折叠总结的直播切片原文（第 ${opts.chunksToFold[0]?.index + 1} ~ ${opts.chunksToFold[opts.chunksToFold.length - 1]?.index + 1} 段）：\n${rawMaterial}`,
    '请按四栏保真要求，输出这一阶段的滚动摘要（控制在 250~400 字左右，保留全部 SC、重点互动、微信反差与未完 Flag）：',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { text } = await callAuxOrMainLlm({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: '直播阶段滚动总结',
    temperature: 0.4,
    messages: [
      { role: 'system', content: FOUR_PILLAR_SUMMARY_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  return text;
}

/**
 * 调用辅助模型（secondaryLlm 优先）生成「下播全貌总结纪要」
 */
export async function generateLiveFinalSummary(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  allMsgs: Message[];
  userName: string;
}): Promise<string> {
  const { channel, session } = opts;
  const rollingPart = session.rollingSummaries
    .map((s, i) => `【阶段 ${i + 1}（第 ${s.fromChunkIndex + 1}~${s.toChunkIndex + 1} 段）】\n${s.content}`)
    .join('\n\n');

  const unfoldedChunks = session.chunks.filter(c => !c.folded);
  const remainderPart = unfoldedChunks
    .map(c => formatChunkTextForSummary(channel, session, c))
    .join('\n\n');

  const wechatPart = extractRecentWechatInterruptions(
    opts.allMsgs,
    session.startedAt,
    opts.char.name,
    opts.userName,
  );

  const userContent = [
    `主播角色：${opts.char.name} ｜ 频道：「${channel.channelName}」（${channel.identityMode === 'secret_alt' ? '隐藏身份匿名小号' : channel.identityMode === 'vtuber' ? '虚拟皮套号' : '公开本尊号'}）`,
    `本场直播标题：《${session.title}》（${session.categoryLabel}）｜ 峰值在线人数：${session.viewerCount}`,
    rollingPart ? `前面的阶段滚动摘要：\n${rollingPart}` : '',
    remainderPart ? `后续未折叠的直播切片原文：\n${remainderPart}` : '',
    wechatPart || '',
    `请将以上全部材料汇总为一份完整的《本场配信全貌纪要》（约 300~600 字）。这份纪要将存入角色的长期聊天历史与记忆宫殿，请务必保留所有具体名场面、SC 与重点弹幕台账（严守大小号边界，陌生观众 ID 绝不写成 ${opts.userName}）、期间微信私聊互动引起的镜头反差、以及立下的 Flag！`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const { text } = await callAuxOrMainLlm({
    apiConfig: opts.apiConfig,
    char: opts.char,
    purpose: '下播全貌总结',
    temperature: 0.35,
    messages: [
      { role: 'system', content: FOUR_PILLAR_SUMMARY_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  return text;
}

function formatChunkTextForSummary(
  channel: StreamerChannelProfile,
  session: LiveStreamSession,
  chunk: LiveStreamSession['chunks'][number],
): string {
  const lines: string[] = [`[第 ${chunk.index + 1} 段切片]`];
  for (const b of chunk.beats) {
    const sp = b.speechTranslated
      ? `${b.speechOriginal}（同传：${b.speechTranslated}）`
      : b.speechOriginal || '（未开口/纯动作）';
    const dm = (b.danmaku || [])
      .map(d => {
        const sc = d.scAmount ? `[¥${d.scAmount} SC] ` : '';
        const who = d.isUserMain ? `[熟人大号·${d.senderName}]` : `观众「${d.senderName}」`;
        const txt = d.translation ? `${d.text}（${d.translation}）` : d.text;
        return `${sc}${who}:${txt}`;
      })
      .join(' / ');
    lines.push(`- 画面：${b.screen} ｜ 主播说：「${sp}」 ｜ 弹幕：[${dm}]`);
  }
  return lines.join('\n');
}

// ==================== 模块 B：Char 视频博主投稿（VOD）生成与评论翻牌 ====================

export async function generateVodVideoPost(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  channel: StreamerChannelProfile;
  topicTitle: string;
  categoryLabel: string;
  allMsgs: Message[];
}): Promise<VodVideoPost> {
  const { char, userProfile, channel, topicTitle, categoryLabel, allMsgs } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';

  const systemPrompt = `你现在作为视频博主（UP主/YouTuber），刚刚剪辑发布了自己的一支新视频投稿。
${buildChannelPersonaBlock(char, channel, userName)}
${buildVoiceLanguageAndTranslationRule(channel)}

### 视频创作要求
- 视频标题：《${topicTitle}》（分区：${categoryLabel}）
- 请设计 4~5 个有起承转合的时间轴分镜章节（如 \`00:00 片头整活\` -> \`01:15 进入正题\` -> \`02:45 突发翻车/高能名场面\` -> \`04:20 结尾碎碎念\`）。
- 同时生成 UP 主置顶评论 \`streamerPinNote\`，以及评论区 5~6 条不同风格的网友热评（课代表总结、截图损友、玩梗老粉、外国网友等）。

请严格输出以下 JSON 对象格式：
\`\`\`json
{
  "title": "最终视频标题",
  "durationLabel": "05:12",
  "streamerPinNote": "UP主置顶在评论区的一句碎碎念或挽尊解释",
  "chapters": [
    {
      "timestampLabel": "00:00",
      "chapterTitle": "章节小标题",
      "screen": "该时间段的分镜画面、剪辑花字特效与博主动作描写",
      "speechOriginal": "博主在该段落说的原声台词",
      "speechTranslated": "若为外语视频，填写中文翻译字幕；否则填 \"\"",
      "emotion": "calm",
      "danmaku": [
        { "senderName": "网友A", "text": "飘屏弹幕原文", "translation": "外语弹幕的中文翻译" }
      ]
    }
  ],
  "comments": [
    {
      "authorName": "评论区网友昵称",
      "fanLevel": 15,
      "content": "评论内容原文",
      "translation": "若为外语评论填中文翻译，否则填 \"\"",
      "likes": 342,
      "likedByStreamer": true,
      "streamerReply": "（可选）UP主翻牌回复这条热评的话，没有则填 \"\""
    }
  ]
}
\`\`\``;

  const recentHistory = allMsgs
    .filter(m => !m.metadata?.superseded && m.metadata?.archiveMode !== 'forget')
    .slice(-12)
    .map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content || '',
    }));

  const messages = await ContextBuilder.buildCharacterRequest(
    { char, user: userProfile },
    [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: `请立即生成这支视频投稿《${topicTitle}》的完整分镜与评论区 JSON。` },
    ],
  );

  const raw = await callMainStreamerLlm({
    apiConfig: opts.apiConfig,
    char,
    messages,
    purpose: '生成视频博主投稿(VOD)',
  });

  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
  let parsed: any = {};
  try {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    parsed = JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
  } catch {}

  const postId = `vod_${Date.now()}`;
  const chapters: VodChapterBeat[] = (Array.isArray(parsed.chapters) && parsed.chapters.length > 0
    ? parsed.chapters
    : [
        {
          timestampLabel: '00:00',
          chapterTitle: '开场正片',
          screen: '镜头对准桌面，博主调整了一下麦克风角度开始录制。',
          speechOriginal: clean.slice(0, 180) || '今天录一期大家催了很久的视频。',
          danmaku: [{ senderName: '前排围观', text: '第一！！终于更新了' }],
        },
      ]
  ).map((ch: any, idx: number) => ({
    id: `vch_${postId}_${idx}`,
    timestampLabel: String(ch?.timestampLabel || `0${idx}:15`),
    chapterTitle: String(ch?.chapterTitle || `段落 ${idx + 1}`),
    screen: String(ch?.screen || '视频画面推进中。'),
    speechOriginal: String(ch?.speechOriginal ?? ch?.speech ?? ''),
    speechTranslated: ch?.speechTranslated ? String(ch.speechTranslated) : undefined,
    emotion: String(ch?.emotion || 'calm'),
    danmaku: (Array.isArray(ch?.danmaku) ? ch.danmaku : []).map((d: any, di: number) => ({
      id: `vdm_${postId}_${idx}_${di}`,
      senderName: String(d?.senderName || `弹幕网友_${di}`),
      roleType: 'old_fan',
      text: String(d?.text || '哈哈哈'),
      translation: d?.translation ? String(d.translation) : undefined,
      timestamp: Date.now(),
    })),
  }));

  const comments: VodCommentItem[] = (Array.isArray(parsed.comments) ? parsed.comments : []).map((c: any, ci: number) => ({
    id: `vcm_${postId}_${ci}`,
    authorName: String(c?.authorName || `热评网友_${ci + 1}`),
    fanBadge: channel.fanBadgeName,
    fanLevel: Number(c?.fanLevel) || 12,
    content: String(c?.content || '太真实了哈哈哈哈'),
    translation: c?.translation ? String(c.translation) : undefined,
    likes: Number(c?.likes) || Math.floor(Math.random() * 500) + 20,
    likedByStreamer: !!c?.likedByStreamer,
    replies: c?.streamerReply
      ? [
          {
            id: `vrp_${postId}_${ci}_0`,
            authorName: channel.channelName,
            isStreamer: true,
            content: String(c.streamerReply),
            timestamp: Date.now(),
          },
        ]
      : [],
    timestamp: Date.now() - (10 - ci) * 60_000,
  }));

  return {
    id: postId,
    channelId: channel.id,
    charId: char.id,
    title: String(parsed?.title || topicTitle),
    categoryLabel,
    coverGradient: channel.coverGradient,
    durationLabel: String(parsed?.durationLabel || '04:36'),
    viewsCount: Math.floor(Math.random() * 45000) + 8000,
    likesCount: Math.floor(Math.random() * 5000) + 900,
    coinsCount: Math.floor(Math.random() * 2000) + 300,
    favoritesCount: Math.floor(Math.random() * 1800) + 200,
    streamerPinNote: String(parsed?.streamerPinNote || '剪完这期天都亮了，三连交出来。'),
    chapters,
    comments,
    createdAt: Date.now(),
  };
}

/**
 * 视频评论区：UP 主（Char）翻牌回复用户（大号或小号马甲）的评论
 */
export async function generateStreamerVodReply(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  channel: StreamerChannelProfile;
  vod: VodVideoPost;
  targetComment: VodCommentItem;
}): Promise<{ replyOriginal: string; replyTranslated?: string }> {
  const { char, userProfile, channel, vod, targetComment } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';

  // 严格物理隔离：若评论是小号马甲发的，绝不告诉模型这是 userName
  const commenterIdentity = targetComment.isUserMain
    ? `熟人本尊大号「${userName}」`
    : `普通网友/粉丝「${targetComment.authorName}」（Lv.${targetComment.fanLevel || 6}）`;

  const lang = (channel.voiceConfig?.language || '').trim();
  const langRule = lang
    ? `请用 ${voiceLanguagePromptLabel(lang)} 写回复原文，并在 JSON 的 "replyTranslated" 附上中文翻译。`
    : `请直接用自然中文口语回复，"replyTranslated" 填 ""。`;

  const prompt = `你是视频《${vod.title}》的 UP 主（频道：「${channel.channelName}」）。
现在你在后台刷评论区，准备翻牌回复下面这条评论：
- 评论者身份：${commenterIdentity}（注意：如果对方只是普通网友 ID，你绝对不知道他是谁，按对普通粉丝/黑粉的营业或互怼态度回；如果是 ${userName} 本尊大号，才按熟人关系回！）
- 评论内容：「${targetComment.content}」

${langRule}
只输出 JSON：\`{"replyOriginal": "你的回复内容", "replyTranslated": "中文译文或空字符串"}\``;

  const messages = await ContextBuilder.buildCharacterRequest(
    { char, user: userProfile },
    [{ role: 'user', content: prompt }],
  );

  const raw = await callMainStreamerLlm({
    apiConfig: opts.apiConfig,
    char,
    messages,
    purpose: 'VOD评论区UP主翻牌',
  });

  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const obj = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    return {
      replyOriginal: String(obj.replyOriginal || obj.reply || clean).trim(),
      replyTranslated: obj.replyTranslated ? String(obj.replyTranslated).trim() : undefined,
    };
  } catch {
    return { replyOriginal: clean };
  }
}

// ==================== 模块 C：刷 NPC 直播/视频（双擎分流：辅助模型演 NPC，主模型演 Char 陪看） ====================

export async function generateNpcWatchBeatDualEngine(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  npcSession: NpcWatchSession;
  userInteractionText?: string;
  interactionType?: 'whisper_to_char' | 'send_npc_danmaku';
  allMsgs: Message[];
}): Promise<NpcBeatItem> {
  const { apiConfig, char, userProfile, npcSession, userInteractionText, interactionType, allMsgs } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';

  const prevBeatsText = npcSession.beats
    .slice(-3)
    .map((b, i) => `[前拍 ${i + 1}] NPC画面：${b.npcScreen} ｜ NPC台词：「${b.npcSpeech}」 ｜ ${char.name}反应：${b.charReactionAction}「${b.charReactionSpeech}」`)
    .join('\n');

  // 第一步：调用【辅助模型 secondaryLlm】独立扮演台上奇葩整活的 NPC 主播与沙雕网友！
  const npcPrompt = `你现在扮演一个正在直播的奇葩/整活路人主播（NPC），与主角角色完全无关。
- NPC 主播名：${npcSession.npcStreamerName}（分区：${npcSession.npcCategoryLabel}）
- 房间标题：《${npcSession.npcRoomTitle}》
- 人设与整活风格：${npcSession.npcBio}
${prevBeatsText ? `\n前情回顾：\n${prevBeatsText}` : ''}
${interactionType === 'send_npc_danmaku' && userInteractionText ? `\n刚刚直播间公屏上有观众发了一条搞事弹幕：「${userInteractionText}」，请让 NPC 主播当场看到并做出夸张/搞笑的反应！` : ''}

请推进下一拍 NPC 直播间的高能/离谱整活画面，输出 JSON：
\`\`\`json
{
  "npcScreen": "NPC 主播此刻夸张搞笑或翻车的画面动作描写（40~80字）",
  "npcSpeech": "NPC 主播充满活人感与江湖气的台词",
  "npcDanmaku": ["沙雕网友弹幕1", "沙雕网友弹幕2", "沙雕网友弹幕3", "沙雕网友弹幕4"]
}
\`\`\``;

  const { text: npcRaw } = await callAuxOrMainLlm({
    apiConfig,
    char,
    purpose: 'NPC陪看房-辅助模型演NPC主播',
    temperature: 0.85,
    messages: [{ role: 'user', content: npcPrompt }],
  });

  let npcScreen = `${npcSession.npcStreamerName}正在镜头前卖力整活。`;
  let npcSpeech = '家人们把公屏打在排面上！';
  let npcDanmaku = ['哈哈哈哈哈什么鬼', '？？？这也能播', '剧本痕迹太重了哥'];

  try {
    const cleanNpc = npcRaw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const obj = JSON.parse(cleanNpc.slice(cleanNpc.indexOf('{'), cleanNpc.lastIndexOf('}') + 1));
    if (obj.npcScreen) npcScreen = String(obj.npcScreen).trim();
    if (obj.npcSpeech) npcSpeech = String(obj.npcSpeech).trim();
    if (Array.isArray(obj.npcDanmaku) && obj.npcDanmaku.length > 0) {
      npcDanmaku = obj.npcDanmaku.map((s: any) => String(s));
    }
  } catch {}

  // 第二步：调用【主模型】纯粹扮演坐在用户身边的 Char，对着刚演出来的 NPC 画面实时吐槽/吃醋/咬耳朵！
  const charWatchPrompt = `你（${char.name}）现在正和 ${userName} 凑在一起刷手机，看一个路人 NPC 主播的直播间。
### 屏幕上正在播放的 NPC 直播画面
- 主播：${npcSession.npcStreamerName}（${npcSession.npcCategoryLabel} · 《${npcSession.npcRoomTitle}》）
- 此时画面：${npcScreen}
- NPC 主播正大声说：「${npcSpeech}」
- 屏幕上的网友弹幕：${npcDanmaku.join(' / ')}
${
  userInteractionText
    ? interactionType === 'send_npc_danmaku'
      ? `\n刚刚 ${userName} 在这个 NPC 直播间发了一条弹幕：「${userInteractionText}」`
      : `\n刚刚 ${userName} 转头凑近你小声对你说：「${userInteractionText}」`
    : ''
}

### 你的反应要求
请完全以你（${char.name}）的真实性格，写出你坐在 ${userName} 身边看到这一幕时的**肢体小动作/表情（\`charReactionAction\`）**以及**你对 ${userName} 说的吐槽/吃醋/调侃台词（\`charReactionSpeech\`）**。
只输出 JSON：
\`\`\`json
{
  "charReactionAction": "你在旁边看屏幕或对 ${userName} 的动作与神态描写（30~60字）",
  "charReactionSpeech": "你开口对 ${userName} 说的话（自然口语）",
  "charEmotion": "calm | happy | angry | surprised | sad"
}
\`\`\``;

  const recentHistory = allMsgs
    .filter(m => !m.metadata?.superseded && m.metadata?.archiveMode !== 'forget')
    .slice(-10)
    .map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content || '',
    }));

  const charMessages = await ContextBuilder.buildCharacterRequest(
    { char, user: userProfile },
    [
      ...recentHistory,
      { role: 'user', content: charWatchPrompt },
    ],
  );

  const charRaw = await callMainStreamerLlm({
    apiConfig,
    char,
    messages: charMessages,
    purpose: 'NPC陪看房-主模型演Char陪看反应',
  });

  let charReactionAction = `${char.name}瞥了一眼手机屏幕。`;
  let charReactionSpeech = '……你平时都在刷这种直播间？';
  let charEmotion = 'calm';

  try {
    const cleanChar = charRaw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const obj = JSON.parse(cleanChar.slice(cleanChar.indexOf('{'), cleanChar.lastIndexOf('}') + 1));
    if (obj.charReactionAction) charReactionAction = String(obj.charReactionAction).trim();
    if (obj.charReactionSpeech) charReactionSpeech = String(obj.charReactionSpeech).trim();
    if (obj.charEmotion) charEmotion = String(obj.charEmotion).trim();
  } catch {
    charReactionSpeech = charRaw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 140);
  }

  return {
    id: `npcb_${Date.now()}`,
    npcScreen,
    npcSpeech,
    npcDanmaku,
    charReactionAction,
    charReactionSpeech,
    charEmotion,
    userActionNote: userInteractionText
      ? `${interactionType === 'send_npc_danmaku' ? '[发弹幕]' : '[咬耳朵]'} ${userInteractionText}`
      : undefined,
  };
}

/**
 * 单独重 Roll 陪看房里 Char 对当前 NPC 拍的吐槽反应（不换 NPC 画面）
 */
export async function rerollCharNpcReactionOnly(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  npcSession: NpcWatchSession;
  beat: NpcBeatItem;
  allMsgs: Message[];
}): Promise<Pick<NpcBeatItem, 'charReactionAction' | 'charReactionSpeech' | 'charEmotion'>> {
  const { apiConfig, char, userProfile, npcSession, beat } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';

  const prompt = `你（${char.name}）正和 ${userName} 一起看 NPC 主播「${npcSession.npcStreamerName}」的直播《${npcSession.npcRoomTitle}》。
当前屏幕画面：${beat.npcScreen}
NPC 台词：「${beat.npcSpeech}」
${beat.userActionNote ? `刚刚 ${userName} 的互动：${beat.userActionNote}` : ''}
请换一个角度和说法，重新写出你（${char.name}）在旁边陪看时的动作神态与吐槽台词！
只输出 JSON：\`{"charReactionAction": "...", "charReactionSpeech": "...", "charEmotion": "calm"}\``;

  const messages = await ContextBuilder.buildCharacterRequest(
    { char, user: userProfile },
    [{ role: 'user', content: prompt }],
  );

  const raw = await callMainStreamerLlm({
    apiConfig,
    char,
    messages,
    temperature: 0.9,
    purpose: '重Roll陪看房Char反应',
  });

  try {
    const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const obj = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    return {
      charReactionAction: String(obj.charReactionAction || beat.charReactionAction).trim(),
      charReactionSpeech: String(obj.charReactionSpeech || beat.charReactionSpeech).trim(),
      charEmotion: String(obj.charEmotion || 'calm').trim(),
    };
  } catch {
    return {
      charReactionAction: beat.charReactionAction,
      charReactionSpeech: raw.trim().slice(0, 140) || beat.charReactionSpeech,
      charEmotion: 'calm',
    };
  }
}
