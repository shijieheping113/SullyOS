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
  STREAM_PRESET_TEMPLATES,
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

/** 去掉模型爱塞的代码块围栏与思考段，别让它们混进正文 */
function stripModelNoise(raw: string): string {
  return (raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/```/g, '')
    .trim();
}

/** 宽松拆行：空行、序号、项目符号都剥掉（模型掉格式时靠这个兜） */
function splitLooseLines(raw: string): string[] {
  return stripModelNoise(raw)
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*•·]|\d+[.、)]|（\d+）)\s*/, '').trim())
    .filter(Boolean);
}

/** 一行里用竖线 / 逗号 / 制表符隔开；认不出分隔符就整行当一格 */
function splitLooseCells(line: string): string[] {
  const cells = line
    .split(/\s*[|｜,，\t]\s*/)
    .map(cell => cell.trim())
    .filter(Boolean);
  return cells.length ? cells : [line.trim()].filter(Boolean);
}

/** 去掉「标题：」「今天播什么：」这类前缀和包着的引号 */
function stripLabelPrefix(text: string): string {
  return (text || '')
    .replace(/^(?:直播)?标题\s*[:：]\s*/i, '')
    .replace(/^(?:今天播什么|直播主题|主题|看点)\s*[:：]\s*/i, '')
    .replace(/^[「"'“”]+|[」"'“”]+$/g, '')
    .trim();
}

function tryParseJsonObject(clean: string): Record<string, unknown> | null {
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function generateAiFieldSuggestion(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile?: UserProfile;
  channel?: StreamerChannelProfile;
  fieldKind: AiFieldKind;
  categoryLabel?: string;
  identityMode?: string;
  recentMsgs?: Message[];
  /** 换一批时想往哪个方向写（可不填） */
  direction?: string;
}): Promise<Record<string, string>> {
  const {
    apiConfig,
    char,
    userProfile,
    channel,
    fieldKind,
    categoryLabel,
    identityMode,
    recentMsgs = [],
    direction,
  } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';
  const recentSnippet = recentMsgs
    .filter(m => !m.metadata?.superseded && (m.role === 'user' || m.role === 'assistant'))
    .slice(-8)
    .map(m => `${m.role === 'user' ? userName : char.name}: ${(m.content || '').slice(0, 90)}`)
    .join('\n');

  // 换一版只带方向，不带上一版生成的内容
  const steerBlock = (direction || '').trim()
    ? `这次想要的方向：${(direction || '').trim()}`
    : '';

  const baseContext = `角色名：${char.name}
角色核心人设：${(char.systemPrompt || char.description || '').slice(0, 700)}
${channel ? `当前频道：「${channel.channelName}」（模式：${channel.identityMode}，简介：${channel.bio}）` : ''}
${recentSnippet ? `最近与 ${userName} 的聊天记忆片段：\n${recentSnippet}` : ''}`;

  let taskPrompt = '';
  if (fieldKind === 'live_title') {
    taskPrompt = `现在你是「${char.name}」本人，正准备在【${categoryLabel || '杂谈'}】分区开播。请完全用你自己的说话习惯、自称、语气词和脾气，写下今天的直播标题和今日走向！

1. 标题写法：
   • 必须固定为「【前缀】+ 角色自己说的一句话」的样式。方括号里写 2~5 个字的时段、状态或分区主题（例如【深夜杂谈】【突击歌回】【做饭翻车中】）。
   • 方括号后面那句话，必须是你对观众随口说的话——可以是抱怨突发状况、嘴硬、碎碎念或搞怪提问，带上平时爱用的自称、省略号或感叹号，一眼就听得出是你在说话。
   • 默认用中文；可以夹一点符合人设的外语词或颜文字当点缀，但主体必须是中文。
2. 今天播什么（40~75字）：
   • 不要用第三人称写剧本大纲！要像主播本人在直播间简介栏里随手敲下的碎碎念和今日小状况。
   • 先用自己的口吻说说眼下正在发生什么事、为什么突然开播，或者今晚打算干嘛；
   • 可以自然露出一点角色的小心思、嘴硬或小算盘；
   • 结尾可以留个让人想进直播间逗你的话头。不要写整场直播的结局。

不要 JSON、不要 Markdown、不要解释。只写两行：
标题：（一行）
今天播什么：（一行）${steerBlock ? `\n\n${steerBlock}` : ''}`;
  } else if (fieldKind === 'live_topic') {
    taskPrompt = `现在你是「${char.name}」本人，正准备开播。请结合你的人设、说话习惯与近期记忆，完全用你自己的第一人称/日常自称口吻，写一段填在直播间简介里的「今天播什么」（45~80字）：
• 不要用旁白视角写故事大纲！要像主播本人开播前随手敲在简介框里的碎碎念。
• 开头用你平时的语气说说眼下发生了什么小状况、为什么开播，或者现在是什么状态（可以带颜文字、语气词或抱怨）。
• 中间自然带出一点你的小心思、嘴硬或小算盘。
• 末尾可以留个让人想进直播间互动的话头。不要把后面的经过和结局写死。
不要 JSON、不要解释。只写一行，以「今天播什么：」开头。${steerBlock ? `\n\n${steerBlock}` : ''}`;
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

  const roleSystem =
    fieldKind === 'live_title'
      ? '请直接代入主播本人的身份与口吻，写自己开播前亲手填进直播间后台的「直播标题」和「今日走向 / 直播间简介」。要充满活人感、网感和角色小性子，绝不要像旁观者写策划案或故事大纲。严格按要求的格式输出，不要解释，不要 Markdown，不要 JSON。'
      : fieldKind === 'live_topic'
      ? '请直接代入主播本人的身份与口吻，写自己开播前亲手填进直播间后台的「今日走向 / 直播间简介」。要充满活人感、网感和角色小性子，绝不要像旁观者写策划案或故事大纲。严格按要求的格式输出，不要解释，不要 Markdown，不要 JSON。'
      : '你是一个敏锐、懂现代视频平台（YouTube / NicoNico）文化的创意策划助手。只输出合法 JSON。';

  const isLiveTitleField = fieldKind === 'live_title' || fieldKind === 'live_topic';
  const taskWithDirection = steerBlock ? `${taskPrompt}\n\n${steerBlock}` : taskPrompt;
  const channelLine = channel
    ? `当前频道：「${channel.channelName}」；简介：${channel.bio}\n`
    : '';

  // 标题 / 今天播什么：人设、世界书、记忆和正常聊天范围全部走直播同一条管网；
  // 人设与聊天作为系统材料，最后的写作任务才是 user。
  let messages: Array<{ role: string; content: string }>;
  if (isLiveTitleField && userProfile) {
    messages = await buildLiveGenerationPayload({
      char,
      userProfile,
      rules: roleSystem,
      task: `${channelLine}${taskWithDirection}`,
      historyMessages: recentMsgs,
      contextLimit: clampManualContextLimit(char.contextLimit),
    });
  } else {
    messages = [
      { role: 'system', content: roleSystem },
      { role: 'user', content: `${baseContext}\n\n${taskWithDirection}` },
    ];
  }

  const raw = await callAuxOrMainLlm({
    apiConfig,
    char,
    messages,
    temperature: 0.9,
    purpose: `live_custom_field_${fieldKind}`,
  });

  const clean = stripModelNoise(raw);
  // 先按 JSON 捞；捞不出来再按行兜，别因为一个逗号把整段丢掉
  const parsed = tryParseJsonObject(clean);
  if (parsed) {
    const tidy: Record<string, string> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) tidy[key] = value.trim();
    });
    if (Object.keys(tidy).length) return tidy;
  }
  const lines = splitLooseLines(clean);
  if (fieldKind === 'live_title' || fieldKind === 'live_topic') {
    const titleLine = lines.find(line => /^(?:直播)?标题\s*[:：]/.test(line)) || '';
    const topicLine = lines.find(line => /^今天播什么\s*[:：]/.test(line)) || '';
    if (fieldKind === 'live_topic') {
      const topic = stripLabelPrefix(topicLine || lines[0] || clean);
      return { topic: topic.slice(0, 300) };
    }
    const title = stripLabelPrefix(titleLine || lines[0] || clean);
    const topic = stripLabelPrefix(
      topicLine || lines.filter(line => line !== (titleLine || lines[0])).join(' '),
    );
    return { title: title.slice(0, 60), topic: topic.slice(0, 300) };
  }
  return { title: clean.slice(0, 40), topic: clean.slice(0, 300), rule: clean };
}

// ==================== 直播分区推荐（一次给三个候选，中文名 + 英文尾巴 + 一句基调） ====================

export interface LiveCategorySuggestion {
  label: string;
  labelEn: string;
  hint: string;
}

/** 同一类的不同叫法算重复：绘画 / 数字绘画、编程 / 代码开发 这种只留一个 */
const CATEGORY_FAMILIES: Array<[string, string[]]> = [
  ['chat', ['杂谈', '闲聊', '聊天']],
  ['game', ['游戏实况', '打游戏', '游戏']],
  ['study', ['陪伴', '自习', '学习']],
  ['radio', ['电台', '助眠', '晚安']],
  ['cooking', ['料理', '做饭', '下厨', '厨房', '美食']],
  ['sing', ['歌回', '唱歌', '翻唱', '歌杂']],
  ['draw', ['绘画', '画画', '插画', '美术']],
  ['code', ['编程', '写代码', '代码', '开发']],
  ['musicprod', ['编曲', '音乐制作', '混音']],
  ['read', ['读书', '阅读']],
  ['vtuber', ['虚拟主播', 'vtuber', '管人']],
  ['board', ['桌游', '卡牌', '棋盘']],
  ['fit', ['健身', '运动', '锻炼']],
  ['pet', ['宠物', '猫咖', '狗咖']],
  ['outdoor', ['户外', '散步', '露营', '徒步']],
  ['craft', ['手工', '手作', '编织', '陶艺']],
];

export async function generateLiveCategorySuggestions(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile?: UserProfile;
  channel?: StreamerChannelProfile;
  recentMsgs?: Message[];
  direction?: string;
  previous?: string;
}): Promise<LiveCategorySuggestion[]> {
  const { apiConfig, char, userProfile, channel, recentMsgs = [], direction, previous } = opts;
  const userName = (userProfile?.name || '你').trim() || '你';
  const persona = (char.systemPrompt || char.description || '').slice(0, 300);
  const recentSnippet = recentMsgs
    .filter(m => !m.metadata?.superseded && (m.role === 'user' || m.role === 'assistant'))
    .slice(-6)
    .map(m => `${m.role === 'user' ? userName : char.name}: ${(m.content || '').slice(0, 70)}`)
    .join('\n');

  // 已经有预设的分区、以及和出现过的分区同类的，都不再推荐
  const presetZh = STREAM_PRESET_TEMPLATES.map(t => t.label.split(/\s+/)[0]).filter(Boolean);
  const familyOf = (label: string) => {
    const text = label.toLowerCase().replace(/\s+/g, '');
    const hit = CATEGORY_FAMILIES.find(([, words]) => words.some(word => text.includes(word)));
    return hit ? hit[0] : '';
  };
  const previousNames = (previous || '')
    .split(/[、,，\s|]+/)
    .map(name => name.trim())
    .filter(Boolean);
  const blockedFamilies = new Set(
    [...presetZh, ...previousNames].map(name => familyOf(name)).filter(Boolean),
  );
  const isExistingCategory = (label: string) =>
    presetZh.some(name => name === label || name.includes(label) || label.includes(name));
  const isPreviousCategory = (label: string) =>
    previousNames.some(name => name === label || name.includes(label) || label.includes(name));
  const isBlockedCategory = (label: string) => {
    const family = familyOf(label);
    return isExistingCategory(label) || isPreviousCategory(label) || (!!family && blockedFamilies.has(family));
  };

  const prompt = `你熟悉 YouTube / ニコニコ 的直播分区（Category）。
请给主播「${char.name}」挑 4 个今天适合开的【直播分区】—— 先定分区类型，再看合不合适。
${channel ? `频道：${channel.channelName}；简介：${channel.bio}` : ''}
${persona ? `主播背景（只用来判断适合哪类分区，不要写进分区名）：${persona}` : ''}
${recentSnippet ? `最近生活片段（只用来判断今天适合哪类分区）：\n${recentSnippet}` : ''}
什么算分区：杂谈、游戏实况、歌回、料理、手工绘画、读书、学习陪伴、助眠电台、户外散步、宠物、健身、桌游——平台上通用的直播类型。
什么不算分区：这一场的节目名、视频标题、具体菜名、具体游戏或作品名、日期、数量，以及「整晚 / 挑战 / 计划 / 企划」这类节目词。
不要推荐这些已经存在的预设分区：${presetZh.join('、')}。推荐要和它们不重复；也不要用同义词绕着说（不要用「闲聊」代替杂谈、用「游戏」代替游戏实况、用「唱歌」代替歌回），要换完全不同的类型。不够三个可以少给，绝不能拿预设凑数。
要求：
- 每个分区必须像平台分区一样简短通用，2~8 个汉字，类型互相拉开（不要三个都是吃的，也不要「绘画 / 数字绘画」这种同类重复）。
- 英文用常见的分区英文名，2~4 个词（Just Chatting / Cooking / Karaoke / Study With Me 这种），不要自己造词。
- 每个分区配一句 25~45 字的「分区介绍」：这一类直播一般是什么形式、画面和氛围，主播在里面通常做什么、观众来看什么。只介绍这一类，不要写这一场的具体事件，也不要写角色生平。
${(direction || '').trim() ? `方向：${(direction || '').trim()}` : ''}
${(previous || '').trim() ? `上一批是：${(previous || '').trim().slice(0, 200)}。这一批不许再出现这些名字，也不许只换一个字或换个同义词。` : ''}
格式：一行一个，用竖线隔开。不要 JSON、不要编号、不要解释：
中文分区名 | English | 分区介绍
例子（只示范格式和颗粒度，不要照抄）：
深夜厨房 | Late Night Cooking | 主播在厨房做夜宵边吃边聊，镜头偶尔晃，油锅声和说话声混在一起，看的是放松和烟火气。`;

  const raw = await callAuxOrMainLlm({
    apiConfig,
    char,
    messages: [
      {
        role: 'system',
        content: '你只输出最多四行直播分区，一行一个，用竖线隔开。分区是平台类型，不是节目名或视频标题，也不要抄已有的预设分区。',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
    purpose: 'live_category_suggest',
  });

  // 像不像平台分区：一句话、带标点、带数字、带节目词的一律不收
  const isCategoryLabel = (label: string) =>
    label.length >= 2 &&
    !/[，。！？、,.!?0-9]/.test(label) &&
    !/(挑战|企划|计划|整晚|通宵)/.test(label);

  const out: LiveCategorySuggestion[] = [];
  const clean = stripModelNoise(raw);

  // 模型偶尔还是塞 JSON 数组，照收
  const arrStart = clean.indexOf('[');
  const arrEnd = clean.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      const arr = JSON.parse(clean.slice(arrStart, arrEnd + 1));
      if (Array.isArray(arr)) {
        arr.slice(0, 6).forEach((item: any) => {
          const label = String(item?.label ?? item?.name ?? '').trim().slice(0, 8);
          if (!label || !isCategoryLabel(label)) return;
          if (out.some(existing => existing.label === label)) return;
          out.push({
            label,
            labelEn: String(item?.labelEn ?? item?.en ?? item?.english ?? '').trim(),
            hint: String(item?.hint ?? item?.description ?? item?.desc ?? '').trim(),
          });
        });
        if (out.length) {
          return out
            .filter(item => !isBlockedCategory(item.label))
            .slice(0, 3);
        }
      }
    } catch {
      /* 落回行解析 */
    }
  }

  for (const line of splitLooseLines(raw)) {
    const hasBar = /[|｜]/.test(line);
    const hasDash = /\s[—–]\s/.test(line);
    if (!hasBar && !hasDash) continue;
    const cells = hasBar
      ? splitLooseCells(line)
      : line.split(/\s+[—–]\s+/).map(cell => cell.trim()).filter(Boolean);
    const label = stripLabelPrefix(cells[0] || '').slice(0, 8);
    if (!label || !/[\u4e00-\u9fa5]/.test(label) || !isCategoryLabel(label)) continue;
    if (out.some(item => item.label === label)) continue;
    out.push({
      label,
      labelEn: stripLabelPrefix(cells[1] || ''),
      hint: cells.slice(2).join('，').trim(),
    });
    if (out.length >= 5) break;
  }
  return out
    .filter(item => !isBlockedCategory(item.label))
    .slice(0, 3);
}

// ==================== 动态生成直播间专属礼物（随直播间/人设生成，拒绝死板预设） ====================

export async function generateStreamCustomGifts(opts: {
  apiConfig: APIConfig;
  char: CharacterProfile;
  channel: StreamerChannelProfile;
  streamTitle?: string;
  /** 换一批时想加的方向（可不填） */
  direction?: string;
  /** 上一批的礼物名，用来提醒别重复 */
  previousNames?: string[];
}): Promise<StreamGiftOption[]> {
  const { apiConfig, char, channel, streamTitle, direction, previousNames = [] } = opts;
  const prompt = `请根据主播「${char.name}」（频道：${channel.channelName}，简介：${channel.bio}，人设：${(char.systemPrompt || '').slice(0, 400)}）${streamTitle ? `以及本场直播主题《${streamTitle}》` : ''}，专门为这个直播间设计 4 个极具人设梗和场景感的「频道专属数字礼物贴纸」！
这些是观众打赏用的数字贴纸/小动画，不是现实中的实物。它们与 Super Chat 完全分开：Super Chat 是付费留言，频道礼物是纯打赏，不附带留言高亮。
不要用俗套的“火箭/跑车/舰长”，要结合TA的国籍、喜好、职业或本场直播内容（例如：手冲冰美式、猫罐头、生锈的琴弦、深夜拉面、特定梗物品等）。
${(direction || '').trim() ? `这次想要的方向：${(direction || '').trim()}` : ''}
${previousNames.length ? `上一批是：${previousNames.join('、')}。这一批全部换掉，不许重复。` : ''}
格式：一行一个，用竖线隔开。不要 JSON，不要编号，不要解释：
emoji | 礼物名称(2~12字) | 价格(数字)`;

  const fallbackGifts: StreamGiftOption[] = channel.customGifts || [
    { id: 'g1', name: 'Coffee Boost', emoji: '☕', price: 20, currencySymbol: '¥' },
    { id: 'g2', name: 'Glow Stick', emoji: '🪄', price: 50, currencySymbol: '¥' },
    { id: 'g3', name: 'Midnight Snack', emoji: '🍰', price: 120, currencySymbol: '¥' },
    { id: 'g4', name: 'Special Encore', emoji: '🌟', price: 500, currencySymbol: '¥' },
  ];

  let raw = '';
  try {
    raw = await callAuxOrMainLlm({
      apiConfig,
      char,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      purpose: 'live_custom_gifts_gen',
    });
  } catch {
    return fallbackGifts;
  }

  const clean = stripModelNoise(raw);

  // 模型非要给 JSON 也照收
  const arrStart = clean.indexOf('[');
  const arrEnd = clean.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      const arr = JSON.parse(clean.slice(arrStart, arrEnd + 1));
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.slice(0, 4).map((g: any, i: number) => ({
          id: `gift_dyn_${Date.now()}_${i}`,
          name: String(g?.name || `专属投喂 #${i + 1}`).trim(),
          emoji: String(g?.emoji || '🎁').trim(),
          price: Number(g?.price) || (i + 1) * 50,
          currencySymbol: String(g?.currencySymbol || '¥').trim(),
        }));
      }
    } catch {
      /* 落回行解析 */
    }
  }

  // 行格式：emoji | 名字 | 价格。缺什么补什么，不许整段作废
  const parsed: StreamGiftOption[] = [];
  for (const line of splitLooseLines(clean)) {
    // 只认带竖线或破折号的行，客套话不参与
    if (!/[|｜]/.test(line) && !/\s[—–]\s/.test(line)) continue;
    const cells = /[|｜]/.test(line)
      ? splitLooseCells(line)
      : line.split(/\s+[—–]\s+/).map(cell => cell.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    let emoji = '🎁';
    if (
      !/\d/.test(cells[0]) &&
      !/[\u4e00-\u9fa5]/.test(cells[0]) &&
      Array.from(cells[0]).length <= 4
    ) {
      emoji = cells[0];
      cells.shift();
    }
    const priceIndex = cells.findIndex(cell => /^[¥$€]?\s*\d+(?:\.\d+)?$/.test(cell));
    const price = priceIndex >= 0 ? Number(cells[priceIndex].replace(/[^\d.]/g, '')) : 0;
    const name = cells
      .find((cell, idx) => idx !== priceIndex && /[\u4e00-\u9fa5A-Za-z]/.test(cell))
      ?.trim();
    if (!name) continue;
    parsed.push({
      id: `gift_dyn_${Date.now()}_${parsed.length}`,
      name: name.slice(0, 12),
      emoji,
      price: price > 0 ? price : (parsed.length + 1) * 50,
      currencySymbol: '¥',
    });
    if (parsed.length >= 4) break;
  }

  return parsed.length ? parsed : fallbackGifts;
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
            d.scAmount && d.scAmount > 0 ? `Super Chat 付费留言 ${d.scCurrency || '¥'}${d.scAmount}` : '',
            d.giftName ? `频道礼物打赏 ${d.giftEmoji || ''}${d.giftName}${d.giftAmount ? ` ${d.giftCurrency || '¥'}${d.giftAmount}` : ''}（数字贴纸，非实物）` : '',
            d.isUserMain ? '熟人本尊' : d.isUserAlt ? '熟人小号' : '',
          ]
            .filter(Boolean)
            .join('·');
          return `      ${d.senderName}${tag ? `（${tag}）` : ''}：${d.text}${d.translation ? `（译：${d.translation}）` : ''}`;
        })
        .join('\n');
      return `【第 ${bi + 1} 拍】\n画面与动作：${b.screen}\n主播台词：${sp}${dm ? `\n公屏互动：\n${dm}` : ''}`;
    })
    .join('\n');

  const prompt = `请把「${char.name}」在频道「${channel.channelName}」直播《${session.title}》的**第 ${chunk.index + 1} 轮**压缩成供私聊续接时阅读的「你的直播记录」摘要，约 150~260 字。

每次严格按下面四项、顺序和标题输出；标题不可改名、不可增删，不要写额外开头或结尾：
【直播内容】按发生顺序写本轮主要画面、动作和台词。
【关键细节】保留能区分本轮的场景变化和重要原话关键词。
【公屏互动】记录值得记的观众名与弹幕；用户/马甲留言、Super Chat 内容与金额、礼物名与金额不能漏。
【本轮收尾】写明停在何处、留下什么话头；没有则写“无”。

要求：
1. 用短句压缩，目标约 150~260 字；合并重复过程，不逐拍逐条复述。保留关键细节，删去重复表达和无信息铺陈；不要写“气氛热烈”“互动良好”等空话或升华抒情。
2. 公屏互动按重要性取舍：保留值得记的互动与观众名称，普通弹幕可选最有代表性的；重复弹幕可合并计数。外语弹幕有翻译时保留原文与翻译。
3. 只写这一轮真实发生的内容，不写整场总结，不提前写后面还没发生的事。
4. 不编造、不提及私聊、手机消息或场外对话。Super Chat 是付费醒目留言；频道礼物是独立的数字贴纸打赏，二者不能混为一类，礼物不是现实实物。

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
