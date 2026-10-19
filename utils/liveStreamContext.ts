/**
 * 电波（直播 / VOD / 陪看）生成请求的共用上下文入口。
 *
 * 为什么单独一个文件：直播提示词组块和 AI 调用层都要用这份组装，
 * 放在 liveStreamPrompts 里会跟 liveStreamAiHelpers 的再导出绕成循环引用。
 *
 * 这里只做「怎么组装」，不写任何场景说明：
 * - 角色核心设定 / 世界书 / 正常聊天范围 / 记忆宫殿召回 / 实时背景，全走共用管网；
 * - 情绪 buff、innerState、当日日程与日程导出的音乐氛围不注入（liveGenerator）；
 * - 直播专属的截断（最近 6 条 / 30 分钟 / 160 字）一律不用。
 */
import { buildChatRequestPayload } from './chatRequestPayload';
import { clampManualContextLimit } from './chatContextRange';
import type { CharacterProfile, Message, RealtimeConfig, UserProfile } from '../types';

export async function buildLiveGenerationPayload(opts: {
  char: CharacterProfile;
  userProfile: UserProfile;
  /** 直播/NPC 自己的输出规则（替换聊天 App 行为规范，不替换人设与世界书） */
  rules: string;
  /** 这一轮的现场材料（本场前情、公屏弹幕、重 Roll 要求、输出任务） */
  task: string;
  /** 正常聊天范围里的原文，由调用方用 loadCharacterContextMessages 取 */
  historyMessages: Message[];
  /** 已按电波总控过滤过的实时配置；不传 = 这一轮不要任何实时背景 */
  realtimeConfig?: RealtimeConfig;
  contextLimit?: number;
}): Promise<Array<{ role: string; content: string }>> {
  const payload = await buildChatRequestPayload({
    char: opts.char,
    userProfile: opts.userProfile,
    groups: [],
    emojis: [],
    categories: [],
    historyMsgs: opts.historyMessages,
    contextLimit: opts.contextLimit ?? clampManualContextLimit(opts.char.contextLimit),
    realtimeConfig: opts.realtimeConfig,
    // 'direct' 不是私聊入口：记忆召回照常，但不带私聊专属的对话引导、拉黑钢印、协同文件柜与 SAR。
    recallEntryPoint: 'direct',
    // appPrompt.rules 会整段替换「聊天 App 行为规范」，但保留人设、世界书、记忆与实时状态。
    appPrompt: { rules: opts.rules, scene: '' },
    liveGenerator: true,
  });

  return [...payload.fullMessages, { role: 'user', content: opts.task }];
}
