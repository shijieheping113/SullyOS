import { ChatPrompts } from './chatPrompts';
import {
  AVATAR_TOUCH_PARTS,
  AVATAR_TOUCH_ZONES,
  buildPendingAvatarTouchContext,
  type AvatarTouchPart,
  type AvatarTouchRecord,
  type AvatarTouchZone,
} from './avatarTouch';

/** 沉默一会儿后角色主动接话的内部提示。开场白和这一句都不是用户说的，重说时要原样再追加一次。 */
export const CALL_IDLE_NUDGE_SEED = '（电话里安静了好一会儿，对方一直没说话。你不是客服，不用干等——像真实通话里那样自然地开口：可以随口说说你这边正在做的事、把刚才的话题往下接一点，或者问问ta是不是在忙。一两句就好，别重复上一句。）';

export type CallRerollBubble = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  dbId?: number;
  timestamp: number;
};

export type CallRerollPlan =
  | { ok: false; reason: 'missing' | 'not-assistant' | 'not-latest' }
  | {
      ok: true;
      kind: 'kept-user' | 'unsaved-user' | 'opening' | 'nudge';
      skipDbIds: number[];
      appendInput: boolean;
      appendText: string | null;
      keptUserDbId: number | null;
      keptUserText: string;
      dropCallAfter: number;
    };

export type CallRerollHistoryRequest = {
  skipDbIds: number[];
  appendInput: boolean;
  keptUserDbId: number | null;
  keptUserText: string;
  dropCallSessionId: string;
  dropCallAfter: number;
};

type HistoryMessage = {
  id: number;
  timestamp: number;
  content?: string;
  metadata?: {
    source?: string;
    callSessionId?: string | number;
    avatarTouches?: unknown;
  } | null;
};

const TIME_GAP_TAIL = /\n\n\[系统提示: 距离上一条消息:[\s\S]*?\]\s*$/;

export function planCallReroll(input: {
  bubbles: CallRerollBubble[];
  targetId: string;
  openingSeed: string;
  nudgeSeed: string;
}): CallRerollPlan {
  const index = input.bubbles.findIndex(bubble => bubble.id === input.targetId);
  if (index < 0) return { ok: false, reason: 'missing' };
  const target = input.bubbles[index];
  if (target.role !== 'assistant') return { ok: false, reason: 'not-assistant' };
  if (index !== input.bubbles.length - 1) return { ok: false, reason: 'not-latest' };

  const previous = index > 0 ? input.bubbles[index - 1] : undefined;
  const shared = {
    skipDbIds: target.dbId != null ? [target.dbId] : [],
    dropCallAfter: target.timestamp,
  };
  if (!previous) {
    return {
      ok: true,
      kind: 'opening',
      appendInput: true,
      appendText: input.openingSeed,
      keptUserDbId: null,
      keptUserText: '',
      ...shared,
    };
  }
  if (previous.role === 'assistant') {
    return {
      ok: true,
      kind: 'nudge',
      appendInput: true,
      appendText: input.nudgeSeed,
      keptUserDbId: null,
      keptUserText: '',
      ...shared,
    };
  }
  if (previous.dbId != null) {
    return {
      ok: true,
      kind: 'kept-user',
      appendInput: false,
      appendText: null,
      keptUserDbId: previous.dbId,
      keptUserText: previous.text,
      ...shared,
    };
  }
  return {
    ok: true,
    kind: 'unsaved-user',
    appendInput: true,
    appendText: previous.text,
    keptUserDbId: null,
    keptUserText: previous.text,
    ...shared,
  };
}

/** 去掉正在重说的角色句，以及这通里比它更晚的通话句。聊天和别的通话留下。 */
export function filterMessagesForCallReroll<T extends HistoryMessage>(
  messages: T[],
  request: Pick<CallRerollHistoryRequest, 'skipDbIds' | 'dropCallSessionId' | 'dropCallAfter'>,
): T[] {
  const skip = new Set(request.skipDbIds);
  return messages.filter(message => {
    if (skip.has(message.id)) return false;
    const meta = message.metadata;
    if (meta?.source !== 'call') return true;
    if (String(meta.callSessionId ?? '') !== request.dropCallSessionId) return true;
    return !(typeof message.timestamp === 'number' && message.timestamp > request.dropCallAfter);
  });
}

/**
 * 正常发送量的是「上一句 → 用户开口的时刻」。
 * 重说用同一个时刻，不用点击「换个说法」的现在，避免通话中途再点被说成离开。
 */
export function callTurnTimeGapHint(previousTimestamp: number | undefined, spokenAt: number): string {
  if (previousTimestamp == null || !Number.isFinite(previousTimestamp) || !Number.isFinite(spokenAt)) return '';
  return ChatPrompts.getTimeGapHint({ timestamp: previousTimestamp } as Parameters<typeof ChatPrompts.getTimeGapHint>[0], spokenAt);
}

export function previousMessageTimestamp(
  messages: { id: number; timestamp: number }[],
  keptUserDbId: number | null,
): number | undefined {
  if (keptUserDbId == null) return undefined;
  const ordered = [...messages].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  const index = ordered.findIndex(message => message.id === keptUserDbId);
  if (index <= 0) return undefined;
  return ordered[index - 1].timestamp;
}

export function storedCallTouchContext(
  metadata: { avatarTouches?: unknown } | null | undefined,
  characterName: string,
  userName: string,
): string {
  return buildPendingAvatarTouchContext(readStoredCallTouches(metadata?.avatarTouches), characterName, userName);
}

export function keptCallTurnExtras(
  messages: HistoryMessage[],
  keptUserDbId: number | null,
  characterName: string,
  userName: string,
): { touchContext: string; timeGapHint: string; userText: string } | null {
  if (keptUserDbId == null) return null;
  const kept = messages.find(message => message.id === keptUserDbId);
  if (!kept || typeof kept.content !== 'string') return null;
  return {
    touchContext: storedCallTouchContext(kept.metadata, characterName, userName),
    timeGapHint: callTurnTimeGapHint(previousMessageTimestamp(messages, keptUserDbId), kept.timestamp),
    userText: kept.content,
  };
}

export function applyKeptCallTurnExtras(
  content: string,
  extras: { touchContext: string; timeGapHint: string },
): string {
  let next = content.trimEnd();
  while (TIME_GAP_TAIL.test(next)) next = next.replace(TIME_GAP_TAIL, '').trimEnd();
  const touch = extras.touchContext.trim();
  if (touch && !next.includes(touch)) {
    const tag = '[通话]';
    const tagAt = next.indexOf(tag);
    if (tagAt >= 0) {
      const insertAt = tagAt + tag.length;
      const rest = next.slice(insertAt).replace(/^\s+/, '');
      next = `${next.slice(0, insertAt)} ${touch}\n\n[用户本轮说的话]\n${rest}`;
    } else {
      next = `${touch}\n\n[用户本轮说的话]\n${next}`;
    }
  }
  const hint = extras.timeGapHint.trim();
  if (hint && !next.endsWith(hint)) next = `${next}\n\n${hint}`;
  return next;
}

export function decorateKeptCallUserMessage<T extends { role: string; content: unknown }>(
  messages: T[],
  userText: string,
  extras: { touchContext: string; timeGapHint: string },
): T[] {
  const needle = userText.trim();
  if (!needle) return messages;
  let targetIndex = -1;
  messages.forEach((message, index) => {
    if (message.role !== 'user' || typeof message.content !== 'string') return;
    if (!message.content.includes('[通话]')) return;
    const stripped = message.content.replace(TIME_GAP_TAIL, '').trimEnd();
    if (stripped.endsWith(needle)) targetIndex = index;
  });
  if (targetIndex < 0) return messages;
  return messages.map((message, index) => {
    if (index !== targetIndex || typeof message.content !== 'string') return message;
    return { ...message, content: applyKeptCallTurnExtras(message.content, extras) };
  });
}

function readStoredCallTouches(raw: unknown): AvatarTouchRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: AvatarTouchRecord[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const zone = (item as { zone?: unknown }).zone;
    if (typeof zone !== 'string' || !AVATAR_TOUCH_ZONES.includes(zone as AvatarTouchZone)) return;
    const part = (item as { part?: unknown }).part;
    const rawAreas = (item as { rawAreas?: unknown }).rawAreas;
    const timestamp = (item as { timestamp?: unknown }).timestamp;
    records.push({
      id: `stored-call-touch-${index}`,
      zone: zone as AvatarTouchZone,
      ...(typeof part === 'string' && AVATAR_TOUCH_PARTS.includes(part as AvatarTouchPart)
        ? { part: part as AvatarTouchPart }
        : {}),
      rawAreas: Array.isArray(rawAreas) ? rawAreas.filter((area): area is string => typeof area === 'string') : [],
      timestamp: typeof timestamp === 'number' ? timestamp : 0,
    });
  });
  return records;
}
