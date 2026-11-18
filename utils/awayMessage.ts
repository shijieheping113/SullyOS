/**
 * 离开后消息：对方多久没说话，角色就来找对方。两条路按角色二选一（见 docs/away-message.md）：
 *   - 云端：开着主动消息 2.0 且连着 Worker 的角色。每个角色挂一条到点必发的任务，
 *     对方每轮开口后往后推；推得不够及时的那点由 worker 到点推迟兜住。
 *   - 本地：其余角色。SW / 网页闹钟到点生成，切回前台补查。一次离开只生成一轮。
 */
import type { APIConfig, ActiveMsg2TaskRecord, CharacterProfile, GroupProfile, RealtimeConfig, UserProfile } from '../types';
import { DB } from './db';
import { ActiveMsgClient } from './activeMsgClient';
import { applyScheduledTask, isAmsg2EnabledForChar } from './amsg2Tasks';
import { isAmsg2GlobalReady } from './amsg2ToolBridge';
import {
  decideAwayTaskAction,
  findAwayGapStart,
  findPendingAwayUserAt,
  planAwaySlots,
  resolveAwayDelayMinutes,
  splitAwaySegments,
} from './awayMessageCore';
import { loadCharacterContextRange } from './chatContextRange';
import { ChatPrompts } from './chatPrompts';
import { ChatParser } from './chatParser';
import { buildChatRequestPayload } from './chatRequestPayload';
import { applyAssistantPostProcessing } from './applyAssistantPostProcessing';
import { resolveDialogueApi } from './characterApi';
import { extractContent, safeFetchJson } from './safeApi';
import { buildLocalAwayHint } from './awayMessagePrompt';
import { loadMusicPlaybackSnapshot } from '../context/MusicContext';
import { KeepAlive } from './keepAlive';
import { getBlockStateFromMessages } from './block';
import { decideReplyDelivery, notifyChatReply, previewTextOf, traceNotify } from './chatNotify';
import type { AwayAlarm } from './awayMessageScheduler';

/** 失败后这么久内不再试，免得每次切回前台都白调一次。 */
const FAILURE_COOLDOWN_MS = 10 * 60_000;

type UpdateCharacter = (
  id: string,
  updates: Partial<CharacterProfile> | ((prev: CharacterProfile) => Partial<CharacterProfile>),
) => void;

/** 这个角色走云端（开着 2.0 且配了 Worker）还是本地。 */
export const isAwayCloudRoute = async (char: CharacterProfile): Promise<boolean> =>
  isAmsg2EnabledForChar(char) && await isAmsg2GlobalReady();

// ─── 云端 ───

const cloudInFlight = new Set<string>();
const cloudCooldownUntil = new Map<string, number>();

const awaySendAtMs = (task: ActiveMsg2TaskRecord): number | null => {
  const ms = Date.parse(task.nextSendAt ?? task.firstSendTime);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * 每轮聊天开始时调用（不用 await）：把云端那条离开后消息排到「对方最后一次开口 + 等待时长」。
 * 已有任务排得够晚就什么都不发；排早了原地改期；远端已经没有（发过了 / 被取消）就新建。
 */
export const syncCloudAwayTask = async (deps: {
  char: CharacterProfile;
  lastUserAt: number;
  userProfile: UserProfile;
  groups: GroupProfile[];
  realtimeConfig: RealtimeConfig;
  apiConfig: APIConfig;
  updateCharacter: UpdateCharacter;
}): Promise<void> => {
  const { char } = deps;
  if (!char.awayMessage?.enabled || cloudInFlight.has(char.id)) return;
  if ((cloudCooldownUntil.get(char.id) ?? 0) > Date.now()) return;
  if (!await isAwayCloudRoute(char) || !char.activeMsg2Config) return;

  cloudInFlight.add(char.id);
  try {
    const delayMinutes = resolveAwayDelayMinutes(char);
    const now = Date.now();
    const targetMs = Math.max(deps.lastUserAt + delayMinutes * 60_000, now + 60_000);
    const sendAt = new Date(targetMs).toISOString();
    const record = (char.activeMsg2Config.tasks ?? []).filter(t => t.away).at(-1);
    const action = decideAwayTaskAction(record ? awaySendAtMs(record) : null, targetMs, now);
    if (action === 'keep') return;

    if (action === 'renew' && record) {
      const { updated, failed } = await ActiveMsgClient.updatePendingTasksRemote([record.taskUuid], { nextSendAt: sendAt });
      if (updated > 0) {
        deps.updateCharacter(char.id, prev => prev.activeMsg2Config ? {
          activeMsg2Config: {
            ...prev.activeMsg2Config,
            tasks: (prev.activeMsg2Config.tasks ?? []).map(t => t.taskUuid === record.taskUuid ? { ...t, nextSendAt: sendAt } : t),
          },
        } : {});
        return;
      }
      if (failed.length) throw new Error('离开后消息改期失败');
      // 远端已经没有这条了（发过了或被取消）：往下新建。
    }

    const result = await ActiveMsgClient.scheduleCharacterTask({
      char,
      config: char.activeMsg2Config,
      task: { mode: 'auto', firstSendTime: sendAt, recurrenceType: 'none', expirePolicy: 'force', away: { delayMinutes } },
      userProfile: deps.userProfile,
      groups: deps.groups,
      realtimeConfig: deps.realtimeConfig,
      apiConfig: deps.apiConfig,
    });
    const created: ActiveMsg2TaskRecord = {
      taskUuid: result.uuid,
      clientTaskId: result.clientTaskId,
      mode: 'auto',
      firstSendTime: result.firstSendAt,
      recurrenceType: 'none',
      expirePolicy: 'force',
      source: 'user',
      status: 'scheduled',
      createdAt: Date.now(),
      away: true,
    };
    deps.updateCharacter(char.id, prev => prev.activeMsg2Config ? {
      activeMsg2Config: {
        ...prev.activeMsg2Config,
        // 旧的那条已经发过或不在了，换成新的；每个角色只留一条。
        tasks: applyScheduledTask((prev.activeMsg2Config.tasks ?? []).filter(t => !t.away), created, {}, Date.now()),
      },
    } : {});
  } catch (error) {
    console.warn('[AwayMessage] 云端任务同步失败', error);
    cloudCooldownUntil.set(char.id, Date.now() + FAILURE_COOLDOWN_MS);
  } finally {
    cloudInFlight.delete(char.id);
  }
};

/** 关掉离开后消息或改了等待时长时调用：取消云端那条，下一轮对方开口时按新设置重建。 */
export const cancelCloudAwayTasks = async (char: CharacterProfile, updateCharacter: UpdateCharacter): Promise<void> => {
  const away = (char.activeMsg2Config?.tasks ?? []).filter(t => t.away);
  if (!away.length) return;
  const cancelled = new Set<string>();
  for (const task of away) {
    try {
      await ActiveMsgClient.cancelTask(task.taskUuid);
      cancelled.add(task.taskUuid);
    } catch (error) {
      console.warn('[AwayMessage] 取消云端任务失败', error);
    }
  }
  updateCharacter(char.id, prev => prev.activeMsg2Config ? {
    activeMsg2Config: {
      ...prev.activeMsg2Config,
      tasks: (prev.activeMsg2Config.tasks ?? []).filter(t => !cancelled.has(t.taskUuid)),
    },
  } : {});
};

// ─── 本地 ───

export interface LocalAwayDeps {
  getCharacters: () => CharacterProfile[];
  getApiConfig: () => APIConfig;
  getUserProfile: () => UserProfile | null | undefined;
  getGroups: () => GroupProfile[];
  getRealtimeConfig: () => RealtimeConfig;
  /** 用户正在和这个角色见面 / 通话：这时不补线上消息。 */
  isBusyWith: (charId: string) => boolean;
}

let localRunning = false;
const localCooldownUntil = new Map<string, number>();

/** 排期只读本地消息。不开 2.0 的角色不会建立或请求任何云端任务。 */
export const readLocalAwayAlarms = async (deps: LocalAwayDeps): Promise<AwayAlarm[]> => {
  const alarms: AwayAlarm[] = [];
  for (const char of deps.getCharacters()) {
    if (!char.awayMessage?.enabled || deps.isBusyWith(char.id) || await isAwayCloudRoute(char)) continue;
    const recent = await DB.getRecentMessagesByCharId(char.id, 100, true);
    const lastUserAt = findPendingAwayUserAt(recent);
    if (lastUserAt == null) continue;
    alarms.push({ charId: char.id, lastUserAt,
      dueAt: Math.max(lastUserAt + resolveAwayDelayMinutes(char) * 60_000, localCooldownUntil.get(char.id) || 0) });
  }
  return alarms;
};

/** 本地 away 专用送达；云端 push 已发的通知仍走原通道，不能在此重复发送。 */
export const deliverLocalAwayNotification = async (input: {
  charId: string; charName: string; avatarRef?: string; bodies: string[];
  pageVisible: boolean; isChattingWithThisChar: boolean;
  unread: () => void; toast: () => void;
}): Promise<void> => {
  traceNotify('reply', { lastReplyVisible: input.pageVisible });
  const delivery = decideReplyDelivery(input);
  if (delivery === 'silent') return;
  input.unread();
  if (delivery === 'toast') { input.toast(); return; }
  for (const body of input.bodies) {
    await notifyChatReply({ charId: input.charId, charName: input.charName, avatarRef: input.avatarRef, body });
  }
};

/** 打开页面 / 切回前台时调用：逐个给该补的角色补上离开期间的消息。 */
export const runLocalAwayMessages = async (deps: LocalAwayDeps): Promise<void> => {
  if (localRunning) return;
  localRunning = true;
  try {
    for (const char of deps.getCharacters().filter(c => c.awayMessage?.enabled)) {
      if ((localCooldownUntil.get(char.id) ?? 0) > Date.now() || deps.isBusyWith(char.id)) continue;
      try {
        if (await isAwayCloudRoute(char)) continue;
        const generate = async () => {
          await KeepAlive.start();
          try { await generateLocalAwayMessages(char, deps); }
          finally { KeepAlive.stop(); }
        };
        // 支持 Web Locks 时跨标签页也只生成一轮；老浏览器仍有本页互斥和保存前复查。
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
          await navigator.locks.request(`sully-away-${char.id}`, { ifAvailable: true }, async lock => {
            if (lock) await generate();
          });
        } else await generate();
      } catch (error) {
        console.warn(`[AwayMessage] ${char.name} 的离开后消息生成失败`, error);
        localCooldownUntil.set(char.id, Date.now() + FAILURE_COOLDOWN_MS);
      }
    }
  } finally {
    localRunning = false;
  }
};

const generateLocalAwayMessages = async (char: CharacterProfile, deps: LocalAwayDeps): Promise<void> => {
  const delayMs = resolveAwayDelayMinutes(char) * 60_000;
  const now = Date.now();
  const recent = await DB.getRecentMessagesByCharId(char.id, 100, true);
  const lastUserAt = findAwayGapStart(recent, delayMs, now);
  if (lastUserAt == null) return;
  const userProfile = deps.getUserProfile();
  const api = resolveDialogueApi(deps.getApiConfig(), char);
  if (!userProfile || !api.baseUrl) return;

  // 时刻不早于最后一条消息：显示顺序看 id，时间戳倒挂会让气泡上的钟跳回去。
  const lastMsgAt = recent[recent.length - 1]?.timestamp ?? lastUserAt;
  const slots = planAwaySlots(lastUserAt, delayMs, now).map(t => Math.max(t, lastMsgAt + 1));
  const userName = userProfile.name || '对方';

  const range = await loadCharacterContextRange(char);
  const allEmojis = await DB.getEmojis();
  const allCategories = await DB.getEmojiCategories();
  // 提示词清单只按权限；认图看全本（「只有我能用」的表情历史里也要认得出）。
  const { emojis, categories } = ChatPrompts.filterVisibleEmojis(allEmojis, allCategories, char.id);
  const groups = deps.getGroups();
  const realtimeConfig = deps.getRealtimeConfig();
  const payload = await buildChatRequestPayload({
    char, userProfile, groups, emojis, categories,
    historyEmojis: allEmojis,
    historyMsgs: range.messages,
    contextLimit: Math.max(1, range.messages.length),
    recallEntryPoint: 'proactive_chat',
    realtimeConfig,
    musicSnapshot: loadMusicPlaybackSnapshot(),
    htmlMode: { enabled: !!(char as any).htmlModeEnabled, customPrompt: (char as any).htmlModeCustomPrompt },
    visionApiConfig: deps.getApiConfig().visionApi,
  });

  // 在所有原文范围筛选之后注入本轮任务；负数假 ID 会被水位线、窗口或用户断点滤掉。
  // 只加到 API 请求，不落库、不占历史条数，也不让范围外原文混入。保留末尾的人格提示。
  payload.fullMessages.splice(payload.volatileTailIndex >= 0 ? payload.volatileTailIndex : payload.fullMessages.length, 0, {
    role: 'user', content: buildLocalAwayHint(char, userName, lastUserAt, slots, recent, now),
  });

  const baseUrl = api.baseUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey || 'sk-none'}` };
  const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: api.model, messages: payload.fullMessages, temperature: api.temperature ?? 0.85, max_tokens: 8000, stream: false }),
  }, 2, 0, { appName: '消息', charId: char.id, charName: char.name, purpose: '离开后消息' });
  const segments = splitAwaySegments(extractContent(data), slots.length);
  if (!segments.length) throw new Error('离开后消息返回空内容');

  // 生成期间对方回来说了话：这段离开已经结束，补的消息作废。
  const currentRecent = await DB.getRecentMessagesByCharId(char.id, 500, true);
  if (findAwayGapStart(currentRecent, delayMs, Date.now()) !== lastUserAt) return;
  const settingsUnchanged = () => {
    const current = deps.getCharacters().find(c => c.id === char.id);
    return !!current?.awayMessage?.enabled && resolveAwayDelayMinutes(current) * 60_000 === delayMs
      && !deps.isBusyWith(char.id);
  };
  if (!settingsUnchanged()) return;

  const notifyProgress = () => window.dispatchEvent(new CustomEvent('active-msg-progress'));
  try {
    for (let i = 0; i < segments.length; i++) {
      const latest = i === 0 ? currentRecent : await DB.getRecentMessagesByCharId(char.id, 500, true);
      const lastRealUser = [...latest].reverse().find(m => m.role === 'user' && !m.metadata?.proactiveHint);
      if (!settingsUnchanged() || lastRealUser?.timestamp !== lastUserAt) break;
      const blocked = getBlockStateFromMessages(latest).blocked;
      await applyAssistantPostProcessing(segments[i], {
        char, userProfile, emojis, categories, realtimeConfig, groups,
        spokenAt: slots[i],
        // 仅后处理使用近史判当前拉黑与引用；发给 API 的历史仍严格按 range.messages。
        contextMsgs: latest,
        fullMessages: [],
        initialData: null,
        historyMsgCount: range.messages.length,
        // 打标是「这段离开已经补过」的唯一依据，见 findAwayGapStart。
        mcdInheritMeta: { awayMessage: true, awayMessageGapStart: lastUserAt,
          ...(blocked ? { blockSendFailed: true } : {}) },
        xhsCaches: {
          xsecTokenCache: new Map(), noteTitleCache: new Map(), commentUserIdCache: new Map(),
          commentAuthorNameCache: new Map(), commentParentIdCache: new Map(),
        },
        api: { baseUrl, headers, effectiveApi: { baseUrl, apiKey: api.apiKey, model: api.model } },
        hooks: { setMessages: notifyProgress, addToast: () => {} },
        instantRender: true,
        skipSecondPassLLM: true,
        messageTimestamp: slots[i],
      });
    }
  } finally {
    // 中途某段失败时，已经保存的句子也必须送达通知，不能只在全部成功时才提醒。
    await announceLocalAwayDelivery(char, lastUserAt);
  }
};

const announceLocalAwayDelivery = async (char: CharacterProfile, lastUserAt: number): Promise<void> => {
  // 从真正保存的气泡取正文，不把模型指令、求看看标签或空响应直接弹到锁屏。
  const saved = (await DB.getRecentMessagesByCharId(char.id, 100, true))
    .filter(m => m.metadata?.awayMessageGapStart === lastUserAt);
  if (!saved.length) return;
  const bodies = saved.map(m => {
    if (m.metadata?.source === 'peek-request') return `求看看：${String(m.metadata.peekText || '')}`;
    if (m.metadata?.source === 'friend-request') return `好友申请：${String(m.metadata.requestText || '')}`;
    if (m.role !== 'assistant') return '';
    if (m.type === 'text') return previewTextOf(ChatParser.sanitize(m.content));
    if (m.type === 'html_card') return String(m.metadata?.htmlTextPreview || '');
    return '';
  }).map(text => text.trim()).filter(Boolean);
  window.dispatchEvent(new CustomEvent('active-msg-received', {
    detail: { charId: char.id, charName: char.name, source: 'local-away',
      bodies: bodies.length ? bodies : ['发来一条新消息'] },
  }));
};
