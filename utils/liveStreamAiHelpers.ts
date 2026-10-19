/**
 * 电波 (OnAir) —— AI 辅助代写、动态专属礼物生成、NPC 频道池重 Roll、VOD 与总结生成器
 */
import { ContextBuilder } from './context';
import { buildLiveGenerationPayload } from './liveStreamContext';
import { clampManualContextLimit } from './chatContextRange';
import { resolveDialogueApi } from './characterApi';
import { isSecondaryLlmReady } from './secondaryLlmApi';
import { secondaryLlmCall } from './secondaryLlmCall';
import { extractContent, safeFetchJson } from './safeApi';
import { voiceLanguagePromptLabel } from './voiceLanguage';
import {
  StreamerChannelProfile,
  LiveStreamSession,
  LiveChunk,
  StreamGiftOption,
  VodVideoPost,
  VodCommentItem,
  NpcWatchSession,
  NpcWatchBeat,
  NpcStreamerChannelCard,
  DEFAULT_NPC_CHANNELS,
} from './liveStreamTypes';
import type { APIConfig, CharacterProfile, Message, RealtimeConfig, UserProfile } from '../types';

// ==================== 主模型 & 辅助模型（Secondary LLM）双擎调用 ====================

export async function callMainStreamerLlm(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  purpose?: string;
}): Promise<string> {
  const { apiConfig, char, messages, temperature, purpose = 'live_stream' } = opts;
  const effective = resolveDialogueApi(apiConfig, char);
  if (!effective.baseUrl || !effective.apiKey) {
    throw new Error('请先在设置中配置有效的对话 API');
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
        messages,
        temperature: temperature ?? effective.temperature ?? 0.88,
        stream: true,
      }),
    },
    1,
    90_000,
    { appId: 'live_stream', charId: char.id, purpose },
  );
  return (extractContent(data) || '').trim();
}

export async function callAuxOrMainLlm(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  purpose?: string;
}): Promise<string> {
  const { apiConfig, char, messages, temperature = 0.8, purpose = 'live_aux' } = opts;
  if (isSecondaryLlmReady(apiConfig.secondaryLlm)) {
    try {
      const text = await secondaryLlmCall({
        config: apiConfig.secondaryLlm!,
        purpose,
        messages,
        featureOpts: { temperature },
        charId: char.id,
      });
      if (text && text.trim()) return text.trim();
    } catch (e) {
      console.warn('[LiveStream] 辅助模型调用失败，自动回退主模型:', e);
    }
  }
  return callMainStreamerLlm({ apiConfig, char, messages, temperature, purpose });
}

// ==================== 全场景「✨ 交给 AI 代写」助手（根据人设与记忆自动构思） ====================

export type AiFieldKind =
  | 'live_title'
  | 'live_topic'
  | 'channel_profile'
  | 'viewer_alt_persona'
  | 'vod_topic'
  | 'npc_custom_rule';

export async function generateAiFieldSuggestion(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile?: UserProfile;
  channel?: StreamerChannelProfile;
  fieldKind: AiFieldKind;
  categoryLabel?: string;
  identityMode?: string;
  recentMsgs?: Message[];
}): Promise<Record<string, string>> {
  const { apiConfig, char, userProfile, channel, fieldKind, categoryLabel, identityMode, recentMsgs = [] } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';
  const recentSnippet = recentMsgs
    .filter(m => !m.metadata?.superseded && (m.role === 'user' || m.role === 'assistant'))
    .slice(-8)
    .map(m => `${m.role === 'user' ? userName : char.name}: ${(m.content || '').slice(0, 90)}`)
    .join('\n');

  const baseContext = `角色名：${char.name}
角色核心人设：${(char.systemPrompt || char.description || '').slice(0, 700)}
${channel ? `当前频道：「${channel.channelName}」（模式：${channel.identityMode}，简介：${channel.bio}）` : ''}
${recentSnippet ? `最近与 ${userName} 的聊天记忆片段：\n${recentSnippet}` : ''}`;

  let taskPrompt = '';
  if (fieldKind === 'live_title') {
    taskPrompt = `请结合 ${char.name} 的人设、说话风格与近期生活状态，为TA在【${categoryLabel || '杂谈'}】分区设计一个极具真实感、像真人在 YouTube / NicoNico 开播会取的直播标题和今日看点脚本！
只输出 JSON：\`{"title": "直播间标题（自然不死板，可带符合人设的外语/日文/英文点缀）", "topic": "今日直播具体内容与小插曲走向（40~70字）"}\``;
  } else if (fieldKind === 'live_topic') {
    taskPrompt = `请结合 ${char.name} 的人设与近期记忆，为今日直播构思一段具体的「直播脚本走向 / 意外小插曲 / 互动看点」（45~80字，自然生活化，不要套话）。
只输出 JSON：\`{"topic": "..."}\``;
  } else if (fieldKind === 'channel_profile') {
    const modeDesc =
      identityMode === 'secret_alt'
        ? '匿名小号马甲频道（不露真名，深夜树洞或硬核爱好，展现与平时反差的一面）'
        : identityMode === 'vtuber'
        ? '虚拟皮套人 VTuber 频道（有专属虚拟形象设定与口癖）'
        : '公开个人主频道（符合本人职业、国籍与性格）';
    taskPrompt = `请根据 ${char.name} 的人设（注意如果TA是外国人或特定文化背景，请使用地道对应的英文/日文/双语风格），为TA设计一个【${modeDesc}】的 YouTube / NicoNico 频道档案。
禁止使用B站特有的“舰长/UP主”词汇，改用国际化会员铭牌（如 Member / Club / 常連 等）。
只输出 JSON：
\`{"channelName": "频道名", "handle": "@handle_id", "fanBadgeName": "会员徽章名(2~8字)", "bio": "频道签名简介(25~50字)", "streamerPersonaPrompt": "镜头前的直播状态、口癖与反差细节(50~90字)"}\``;
  } else if (fieldKind === 'viewer_alt_persona') {
    taskPrompt = `用户（${userName}）想建一个在 ${char.name} 直播间里发言的【匿名小号马甲】（${char.name} 不知道这个号是 ${userName}）。请构思一个有趣的观众小号昵称、会员铭牌和人设备注（例如：毒舌技术粉、人傻钱多神秘榜一、装作路人的柠檬精等）。
只输出 JSON：\`{"name": "小号昵称", "badgeText": "铭牌(如 VIP / Member)", "note": "小号人设与玩梗方式备注"}\``;
  } else if (fieldKind === 'vod_topic') {
    taskPrompt = `请结合 ${char.name} 的人设与近期记忆，为TA构思一期极具吸引力的 YouTube / NicoNico 视频投稿主题（Vlog、实况剪辑、深夜电台或开箱企划）。
只输出 JSON：\`{"title": "视频投稿标题", "categoryLabel": "分类标签(如 Vlog / Gaming / Music)"}\``;
  } else {
    taskPrompt = `请构思一段用于生成其他路人主播（NPC）的自定义规则描述，让刷到的直播间自然、有趣、贴合 ${char.name} 和 ${userName} 一起闲逛吐槽的口味（拒绝无脑夸张刻板）。
只输出 JSON：\`{"rule": "50字以内的NPC频道生成偏好描述"}\``;
  }

  const raw = await callAuxOrMainLlm({
    apiConfig,
    char,
    messages: [
      { role: 'system', content: '你是一个敏锐、懂现代视频平台（YouTube / NicoNico）文化的创意策划助手。只输出合法 JSON。' },
      { role: 'user', content: `${baseContext}\n\n${taskPrompt}` },
    ],
    temperature: 0.9,
    purpose: `live_custom_field_${fieldKind}`,
  });

  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    return JSON.parse(s >= 0 && e > s ? clean.slice(s, e + 1) : clean);
  } catch {
    return { title: clean.slice(0, 40), topic: clean, rule: clean };
  }
}

// ==================== 动态生成直播间专属礼物（随直播间/人设生成，拒绝死板预设） ====================

export async function generateStreamCustomGifts(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  channel: StreamerChannelProfile;
  streamTitle?: string;
}): Promise<StreamGiftOption[]> {
  const { apiConfig, char, channel, streamTitle } = opts;
  const prompt = `请根据主播「${char.name}」（频道：${channel.channelName}，简介：${channel.bio}，人设：${(char.systemPrompt || '').slice(0, 400)}）${streamTitle ? `以及本场直播主题《${streamTitle}》` : ''}，专门为这个直播间设计 4 个极具人设梗和场景感的「直播间专属礼物（Super Stickers / 投喂礼物）」！
不要用俗套的“火箭/跑车/舰长”，要结合TA的国籍、喜好、职业或本场直播内容（例如：手冲冰美式、猫罐头、生锈的琴弦、深夜拉面、特定梗物品等）。
只输出 JSON 数组：
\`\`\`json
[
  {"name": "礼物名称(2~12字)", "emoji": "单个贴切emoji", "price": 20, "currencySymbol": "¥"},
  {"name": "...", "emoji": "...", "price": 80, "currencySymbol": "¥"},
  {"name": "...", "emoji": "...", "price": 200, "currencySymbol": "¥"},
  {"name": "...", "emoji": "...", "price": 520, "currencySymbol": "¥"}
]
\`\`\``;

  try {
    const raw = await callAuxOrMainLlm({
      apiConfig,
      char,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      purpose: 'live_custom_gifts_gen',
    });
    const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const arr = JSON.parse(clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1));
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.slice(0, 4).map((g: any, i: number) => ({
        id: `gift_dyn_${Date.now()}_${i}`,
        name: String(g?.name || `专属投喂 #${i + 1}`).trim(),
        emoji: String(g?.emoji || '🎁').trim(),
        price: Number(g?.price) || (i + 1) * 50,
        currencySymbol: String(g?.currencySymbol || '¥').trim(),
      }));
    }
  } catch {}
  return channel.customGifts || [
    { id: 'g1', name: 'Coffee Boost', emoji: '☕', price: 20, currencySymbol: '¥' },
    { id: 'g2', name: 'Glow Stick', emoji: '🪄', price: 50, currencySymbol: '¥' },
    { id: 'g3', name: 'Midnight Snack', emoji: '🍰', price: 120, currencySymbol: '¥' },
    { id: 'g4', name: 'Special Encore', emoji: '🌟', price: 500, currencySymbol: '¥' },
  ];
}

// ==================== NPC 频道池重 Roll 与自定义规则生成（去刻板化） ====================

const GRADIENTS = [
  'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)',
  'linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%)',
  'linear-gradient(135deg, #fef3c7 0%, #ffedd5 100%)',
  'linear-gradient(135deg, #d1fae5 0%, #ccfbf1 100%)',
];

export async function generateNpcChannelPoolWithAi(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  customRule?: string;
}): Promise<NpcStreamerChannelCard[]> {
  const { apiConfig, char, customRule } = opts;
  const prompt = `请你为视频/直播平台（YouTube Live / NicoNico 风格）生成 4 个正在开播的第三方路人主播（NPC）频道卡片，供角色「${char.name}」和用户一起闲逛陪看。
【重要原则】：
1. **拒绝刻板夸张与土味脸谱化**：不要全是咆哮带货或低俗套路！要有真实世界里多元、鲜活、有细节的生活感或小众冷幽默（如：深夜街头雨夜漫步摄影、独立音乐人调合成器、硬核怀旧游戏挑战、手作陶艺翻车现场、天台天文望远镜看月亮、外国博主的蹩脚料理实验等）。
2. ${customRule?.trim() ? `**必须严格遵循用户的自定义生成规则**：${customRule.trim()}` : '风格多元国际化，贴合现代年轻人的观看习惯。'}

只输出包含 4 个对象的 JSON 数组：
\`\`\`json
[
  {
    "npcName": "主播频道名",
    "handle": "@handle",
    "categoryLabel": "分区标签",
    "roomTitle": "当前直播间标题（自然真实，不要夸张营销号感）",
    "npcBio": "直播间画面与主播状态简述（30~55字）",
    "styleTag": "风格短标签",
    "viewerCount": 1200
  }
]
\`\`\``;

  const raw = await callAuxOrMainLlm({
    apiConfig,
    char,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.92,
    purpose: 'live_npc_channel_pool_gen',
  });

  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const arr = JSON.parse(clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1));
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.slice(0, 4).map((item: any, idx: number) => ({
        id: `npc_ai_${Date.now()}_${idx}`,
        npcName: String(item?.npcName || `Channel_${idx + 1}`).trim(),
        handle: String(item?.handle || `@creator_${idx + 1}`).trim(),
        categoryLabel: String(item?.categoryLabel || 'Live').trim(),
        roomTitle: String(item?.roomTitle || 'Live Stream').trim(),
        npcBio: String(item?.npcBio || '').trim(),
        styleTag: String(item?.styleTag || 'Live').trim(),
        coverGradient: GRADIENTS[idx % GRADIENTS.length],
        viewerCount: Number(item?.viewerCount) || Math.floor(Math.random() * 3500) + 200,
      }));
    }
  } catch {}
  return DEFAULT_NPC_CHANNELS;
}

// ==================== 阶段滚动总结 & 下播全貌总结（四栏保真） ====================

/**
 * 只压缩**这一轮**（一个 LiveChunk）。
 * 不跨轮合并、不做整场总结、不带任何私聊内容或「场外私聊互动」栏。
 * 公屏弹幕不筛：普通路人、礼物、SC、用户弹幕按顺序全部进摘要。
 */
export async function generateLiveRoundSummary(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  chunk: LiveChunk;
}): Promise<string> {
  const { apiConfig, char, channel, session, chunk } = opts;
  const rawTranscript = chunk.beats
    .map((b, bi) => {
      const sp = b.speechTranslated ? `「${b.speechOriginal}」（同传：${b.speechTranslated}）` : b.speechOriginal ? `「${b.speechOriginal}」` : '（专注动作未开口）';
      const dm = (b.danmaku || [])
        .map(d => {
          const tag = [
            d.scAmount && d.scAmount > 0 ? `SC ¥${d.scAmount}` : '',
            d.giftName ? `送出 ${d.giftEmoji || ''}${d.giftName}` : '',
            d.isUserMain ? '熟人本尊' : d.isUserAlt ? '熟人小号' : '',
          ]
            .filter(Boolean)
            .join('·');
          return `      ${d.senderName}${tag ? `（${tag}）` : ''}：${d.text}${d.translation ? `（译：${d.translation}）` : ''}`;
        })
        .join('\n');
      return `  (${bi + 1}) 画面：${b.screen} ｜ 台词：${sp}${dm ? `\n    公屏：\n${dm}` : ''}`;
    })
    .join('\n');

  const prompt = `请把「${char.name}」的直播《${session.title}》（频道：${channel.channelName}）的**第 ${chunk.index + 1} 轮**压成一段逐轮摘要（约 150~260 字，纯文字，可分两三段，不要小标题清单）。

要求：
1. 只写这一轮：按发生顺序保留关键画面、台词要点、公屏里值得记的互动（含礼物、SC、普通路人弹幕），以及结尾停在哪、留了什么钩子。
2. 具体一点：留着人名、金额、原话里的关键词；不要「气氛热烈」「互动良好」这类空话，也不要升华抒情。
3. 不写整场总结，不提前写后面还没发生的事。
4. **只写直播里真实发生的内容**：不要编造或提及任何私聊、手机消息、场外对话。

这一轮的直播记录：
${rawTranscript}`;

  const raw = await callAuxOrMainLlm({
    apiConfig,
    char,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.45,
    purpose: 'live_rolling_summary',
  });
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export async function generateLiveFinalSummary(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  allMsgs: Message[];
  userName: string;
}): Promise<string> {
  const { apiConfig, char, channel, session } = opts;
  const rollingPart = session.rollingSummaries.map((s, i) => `【阶段 ${i + 1}】\n${s.content}`).join('\n\n');
  const unfoldedPart = session.chunks
    .filter(c => !c.folded)
    .map(c =>
      c.beats
        .map(b => `画面：${b.screen} ｜ 台词：「${b.speechOriginal}」${b.speechTranslated ? `（${b.speechTranslated}）` : ''}`)
        .join('\n'),
    )
    .join('\n\n');

  const prompt = `「${char.name}」刚刚结束了在频道「${channel.channelName}」的直播《${session.title}》。
请生成一份供主聊天留存与角色长期记忆使用的**《本场配信全貌纪要》**（250~400 字），按以下四栏输出，保留具体细节：
1. 📌 **本场主线与高能名场面**
2. 💎 **Super Chat / 礼物与重点弹幕台账**（注意：匿名小号只记其马甲昵称，严禁剧透其背后是谁）
3. 💬 **直播期间私聊互动与台上台下反差**
4. 🔖 **下播余韵与留给私聊的话头**

前情摘要：
${rollingPart || '（无折叠段）'}

最近直播片段：
${unfoldedPart || '（无）'}`;

  const raw = await callAuxOrMainLlm({
    apiConfig,
    char,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.55,
    purpose: 'live_final_summary',
  });
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// ==================== 视频投稿 (VOD) & 评论翻牌 & NPC 陪看 ====================

export async function generateVodVideoPost(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  channel: StreamerChannelProfile;
  topicTitle: string;
  categoryLabel: string;
  allMsgs: Message[];
}): Promise<VodVideoPost> {
  const { char, userProfile, channel, topicTitle, categoryLabel } = opts;
  const lang = (channel.voiceConfig?.language || '').trim();
  const isForeign = Boolean(lang && lang !== 'zh');
  const langLabel = voiceLanguagePromptLabel(lang);

  const prompt = `你是「${char.name}」，在视频频道「${channel.channelName}」（${channel.handle}）发布了一支新视频投稿《${topicTitle}》（分类：${categoryLabel}）。
${isForeign ? `视频台词请使用地道的【${langLabel}】，并在 speechTranslated 填中文翻译。` : '视频台词使用自然口语中文，speechTranslated 填空字符串。'}
不要使用任何B站黑话（如UP主/一键三连/舰长），使用国际化 YouTube / NicoNico 创作者语境！
只输出 JSON：
\`\`\`json
{
  "title": "${topicTitle}",
  "durationLabel": "08:42",
  "streamerPinnedNote": "创作者置顶留言原文",
  "streamerPinnedNoteTranslated": "若为外语则写中文翻译，否则空字符串",
  "chapters": [
    {
      "timestampLabel": "00:00",
      "chapterTitle": "章节小标题",
      "screen": "分镜画面与动作细节（40~80字）",
      "speechOriginal": "台词原声",
      "speechTranslated": "中文翻译或空字符串",
      "danmaku": [
        {"senderName": "网友昵称", "text": "飘屏弹幕原文", "translation": "外语弹幕的中文翻译或空字符串"}
      ]
    }
  ],
  "comments": [
    {"authorName": "评论网友ID", "fanLevel": 10, "content": "楼层评论原文", "translation": "中文译文或空字符串", "likes": 128}
  ]
}
\`\`\`
请生成 4 个时间轴分镜章节（chapters），每个章节带 3~4 条飘屏弹幕，以及 4 条热评（comments）。`;

  const messages = await ContextBuilder.buildCharacterRequest(
    { char, user: userProfile },
    [{ role: 'user', content: prompt }],
  );

  const raw = await callMainStreamerLlm({ apiConfig: opts.apiConfig, char, messages });
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
  let parsed: any = {};
  try {
    parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  } catch {}

  const vodId = `vod_${Date.now()}`;
  const chapters = (Array.isArray(parsed.chapters) ? parsed.chapters : []).map((ch: any, idx: number) => ({
    id: `vch_${vodId}_${idx}`,
    timestampLabel: String(ch?.timestampLabel || `0${idx * 2}:15`),
    chapterTitle: String(ch?.chapterTitle || `Part ${idx + 1}`),
    screen: String(ch?.screen || '视频画面推进中。'),
    speechOriginal: String(ch?.speechOriginal || ''),
    speechTranslated: ch?.speechTranslated ? String(ch.speechTranslated) : undefined,
    danmaku: (Array.isArray(ch?.danmaku) ? ch.danmaku : []).map((d: any, di: number) => ({
      id: `vdm_${vodId}_${idx}_${di}`,
      senderName: String(d?.senderName || `Viewer_${di}`),
      text: String(d?.text || 'www'),
      translation: d?.translation ? String(d.translation) : undefined,
      timestamp: Date.now() + di * 100,
    })),
  }));

  const comments: VodCommentItem[] = (Array.isArray(parsed.comments) ? parsed.comments : []).map((c: any, ci: number) => ({
    id: `vcm_${vodId}_${ci}`,
    authorName: String(c?.authorName || `User_${ci}`),
    fanLevel: Number(c?.fanLevel) || 6,
    content: String(c?.content || 'Great video!'),
    translation: c?.translation ? String(c.translation) : undefined,
    likes: Number(c?.likes) || 25,
    isPinned: ci === 0,
    replies: [],
    timestamp: Date.now() - (10 - ci) * 60000,
  }));

  return {
    id: vodId,
    channelId: channel.id,
    charId: char.id,
    title: String(parsed.title || topicTitle),
    categoryLabel,
    durationLabel: String(parsed.durationLabel || '08:24'),
    coverGradient: channel.bannerGradient,
    viewsCount: Math.floor(Math.random() * 40000) + 3000,
    likesCount: Math.floor(Math.random() * 4000) + 500,
    streamerPinnedNote: String(parsed.streamerPinnedNote || 'Thanks for watching!'),
    streamerPinnedNoteTranslated: parsed.streamerPinnedNoteTranslated ? String(parsed.streamerPinnedNoteTranslated) : undefined,
    chapters: chapters.length > 0 ? chapters : [{
      id: `vch_${vodId}_0`,
      timestampLabel: '00:00',
      chapterTitle: 'Intro',
      screen: `${char.name} 调试好镜头开始录制视频。`,
      speechOriginal: clean.slice(0, 120),
      danmaku: [],
    }],
    comments,
    createdAt: Date.now(),
  };
}

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
  const commenterIdentity = targetComment.isUserMain
    ? `[熟人本尊大号：${userName}]`
    : `[普通观众网友：「${targetComment.authorName}」（你不知道TA背后是谁）]`;
  const lang = (channel.voiceConfig?.language || '').trim();
  const isForeign = Boolean(lang && lang !== 'zh');

  const prompt = `你是视频《${vod.title}》的创作者（频道：「${channel.channelName}」）。
请回复评论区里的这条留言：
- 评论者：${commenterIdentity}
- 内容：「${targetComment.content}」
${isForeign ? `请用【${voiceLanguagePromptLabel(lang)}】写 replyOriginal，在 replyTranslated 写中文翻译。` : 'replyTranslated 填空字符串。'}
只输出 JSON：\`{"replyOriginal": "...", "replyTranslated": ""}\``;

  const messages = await ContextBuilder.buildCharacterRequest(
    { char, user: userProfile },
    [{ role: 'user', content: prompt }],
  );
  const raw = await callMainStreamerLlm({ apiConfig: opts.apiConfig, char, messages, temperature: 0.92 });
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const obj = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    return {
      replyOriginal: String(obj.replyOriginal || clean).trim(),
      replyTranslated: obj.replyTranslated ? String(obj.replyTranslated).trim() : undefined,
    };
  } catch {
    return { replyOriginal: clean };
  }
}

export async function generateNpcWatchBeatDualEngine(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  npcSession: NpcWatchSession;
  userInteractionText?: string;
  interactionType?: 'whisper_char' | 'send_npc_danmaku';
  /** 兼容旧调用；这条路径不再用整库消息，改为下面两份 */
  allMsgs?: Message[];
  /** 角色反应阶段用的正常聊天范围原文 */
  charHistoryMessages?: Message[];
  /** 角色反应阶段的实时背景配置（已按电波总控过滤） */
  realtimeConfig?: RealtimeConfig;
  /** 第三方主播阶段可见的公开实时背景文本：不含定位、不含角色私聊与记忆 */
  publicRealtimeText?: string;
}): Promise<NpcWatchBeat> {
  const {
    apiConfig,
    char,
    userProfile,
    npcSession,
    userInteractionText,
    interactionType,
    charHistoryMessages = [],
    realtimeConfig,
    publicRealtimeText,
  } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';
  const prevBeat = npcSession.beats[npcSession.beats.length - 1];

  // 第三方主播只拿到自己的频道资料、这一场的公开进度和用户明确投递的弹幕；
  // 拿不到 Ann 与角色的私聊、记忆宫殿召回，也拿不到用户位置。
  const npcPrompt = `你正在扮演直播平台上的第三方主播「${npcSession.npcStreamerName}」（分区：${npcSession.npcCategoryLabel}，标题：《${npcSession.npcRoomTitle}》，风格简介：${npcSession.npcBio}）。
${npcSession.customRulePrompt ? `补充设定规则：${npcSession.customRulePrompt}\n` : ''}${prevBeat ? `上一拍画面：${prevBeat.npcScreen}\n上一拍台词：「${prevBeat.npcSpeech}」\n` : ''}${interactionType === 'send_npc_danmaku' && userInteractionText ? `观众刚发来弹幕：「${userInteractionText}」，请顺着做出反应！` : '请自然往下演新的一拍画面与台词（真实自然，拒绝浮夸套路）！'}${publicRealtimeText ? `\n（以下是此刻的现实背景，只在自然相关时顺口带一句，不要刻意播报：\n${publicRealtimeText}\n）\n` : ''}
只输出 JSON：\`{"npcScreen": "镜头画面描写(40~80字)", "npcSpeech": "NPC主播台词", "danmaku": [{"senderName": "网友A", "text": "弹幕"}, {"senderName": "网友B", "text": "弹幕"}]}\``;

  const npcRaw = await callAuxOrMainLlm({
    apiConfig,
    char,
    messages: [{ role: 'user', content: npcPrompt }],
    temperature: 0.9,
  });

  let npcScreen = '镜头前的直播继续进行着。';
  let npcSpeech = 'Welcome to the stream!';
  let npcDanmaku: any[] = [];
  try {
    const clean = npcRaw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const obj = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    if (obj.npcScreen) npcScreen = String(obj.npcScreen).trim();
    if (obj.npcSpeech) npcSpeech = String(obj.npcSpeech).trim();
    if (Array.isArray(obj.danmaku)) npcDanmaku = obj.danmaku;
  } catch {}

  const charPrompt = `此刻直播画面：${npcScreen}
主播正说：「${npcSpeech}」
${userInteractionText ? (interactionType === 'whisper_char' ? `${userName} 凑过来跟你说：「${userInteractionText}」` : `${userName} 刚在直播间发了条弹幕：「${userInteractionText}」`) : ''}
请写出你（${char.name}）在旁边陪看时的真实反应动作与对 ${userName} 说的话！
只输出 JSON：\`{"charReactionAction": "动作神态(25~50字)", "charReactionSpeech": "你对${userName}说的话", "charEmotion": "calm"}\``;

  // 角色这一侧才用正常聊天范围 + 记忆召回 + 实时背景；情绪/日程不注入。
  const charRules = `你现在和 ${userName} 坐在一起，用手机看第三方主播「${npcSession.npcStreamerName}」的直播《${npcSession.npcRoomTitle}》。
直播画面和主播的话由对方提供，你只负责写自己陪看时的反应。不要替对方主播说话，也不要复述 ${userName} 的私聊原文。`;
  const charMessages = await buildLiveGenerationPayload({
    char,
    userProfile,
    rules: charRules,
    task: charPrompt,
    historyMessages: charHistoryMessages,
    realtimeConfig,
    contextLimit: clampManualContextLimit(char.contextLimit),
  });
  const charRaw = await callMainStreamerLlm({ apiConfig, char, messages: charMessages, temperature: 0.88 });

  let charReactionAction = `${char.name}看向屏幕。`;
  let charReactionSpeech = '这直播间还挺有意思。';
  let charEmotion = 'calm';
  try {
    const clean = charRaw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const obj = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    if (obj.charReactionAction) charReactionAction = String(obj.charReactionAction).trim();
    if (obj.charReactionSpeech) charReactionSpeech = String(obj.charReactionSpeech).trim();
    if (obj.charEmotion) charEmotion = String(obj.charEmotion).trim();
  } catch {}

  const beatIdx = npcSession.beats.length;
  return {
    id: `npcb_${npcSession.id}_${beatIdx}_${Date.now()}`,
    index: beatIdx,
    npcScreen,
    npcSpeech,
    npcDanmaku: npcDanmaku.map((d: any, i: number) => ({
      id: `npcdm_${Date.now()}_${i}`,
      senderName: String(d?.senderName || `Viewer_${i}`),
      text: String(d?.text || 'lol'),
      timestamp: Date.now() + i * 100,
    })),
    charReactionAction,
    charReactionSpeech,
    charEmotion,
    userActionNote: userInteractionText
      ? interactionType === 'whisper_char'
        ? `对${char.name}说：「${userInteractionText}」`
        : `发弹幕：「${userInteractionText}」`
      : undefined,
  };
}

export async function rerollCharNpcReactionOnly(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  npcSession: NpcWatchSession;
  beat: NpcWatchBeat;
  /** 兼容旧调用 */
  allMsgs?: Message[];
  charHistoryMessages?: Message[];
  realtimeConfig?: RealtimeConfig;
}): Promise<{ charReactionAction: string; charReactionSpeech: string; charEmotion: string }> {
  const { apiConfig, char, userProfile, npcSession, beat, charHistoryMessages = [], realtimeConfig } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';
  const prompt = `当前画面：${beat.npcScreen} ｜ 台词：「${beat.npcSpeech}」
【重Roll要求】：上一版你的反应（「${beat.charReactionSpeech}」）已被弃用，请彻底换一个角度、动作和吐槽台词，严禁雷同！
只输出 JSON：\`{"charReactionAction": "...", "charReactionSpeech": "...", "charEmotion": "calm"}\``;

  const rules = `你现在和 ${userName} 坐在一起，用手机看第三方主播「${npcSession.npcStreamerName}」的直播《${npcSession.npcRoomTitle}》。直播画面和主播的话由对方提供，你只写自己陪看时的反应；不要替对方主播说话，也不复述私聊原文。`;
  const messages = await buildLiveGenerationPayload({
    char,
    userProfile,
    rules,
    task: prompt,
    historyMessages: charHistoryMessages,
    realtimeConfig,
    contextLimit: clampManualContextLimit(char.contextLimit),
  });
  const raw = await callMainStreamerLlm({ apiConfig, char, messages, temperature: 0.96 });
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
      charReactionSpeech: raw.trim() || beat.charReactionSpeech,
      charEmotion: 'calm',
    };
  }
}
