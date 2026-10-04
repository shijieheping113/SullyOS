/** 刷新或关掉浏览器留下的电话：句子在，挂断卡片不在。 */

export interface UnfinishedCallInput {
  id?: number;
  charId?: string;
  role: string;
  content: string;
  timestamp: number;
  metadata?: {
    source?: unknown;
    callSessionId?: unknown;
    callMode?: unknown;
    thinkingChain?: unknown;
    avatarPerformance?: unknown;
    avatarPerformanceCues?: unknown;
    cameraSnapshotRef?: unknown;
    cameraSnapshotExpired?: unknown;
  } | null;
}

export interface UnfinishedCallLine {
  id?: number;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  thinkingChain?: string;
  performance?: unknown;
  performanceCues?: unknown;
  cameraSnapshotRef?: string;
  cameraSnapshotExpired?: boolean;
}

export interface UnfinishedCallSession {
  sessionId: string;
  lines: UnfinishedCallLine[];
  /** 句子里没记下语音/视频时是 null，由拨号当下的模式补上。 */
  callMode: 'voice' | 'video' | null;
  /** 第一句到最后一句。中间关掉浏览器的空档不算。 */
  durationSec: number;
  turnCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
}

const sessionIdOf = (metadata: UnfinishedCallInput['metadata']): string | null => {
  const raw = metadata?.callSessionId;
  return typeof raw === 'string' && raw.trim() ? raw : null;
};

const callModeOf = (metadata: UnfinishedCallInput['metadata']): 'voice' | 'video' | null => {
  const raw = metadata?.callMode;
  return raw === 'voice' || raw === 'video' ? raw : null;
};

const toLine = (message: UnfinishedCallInput): UnfinishedCallLine | null => {
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  const snapshot = message.metadata?.cameraSnapshotRef;
  return {
    id: message.id,
    role: message.role,
    text: typeof message.content === 'string' ? message.content : '',
    timestamp: message.timestamp,
    ...(typeof message.metadata?.thinkingChain === 'string' && message.metadata.thinkingChain
      ? { thinkingChain: message.metadata.thinkingChain }
      : {}),
    ...(message.metadata?.avatarPerformance ? { performance: message.metadata.avatarPerformance } : {}),
    ...(message.metadata?.avatarPerformanceCues ? { performanceCues: message.metadata.avatarPerformanceCues } : {}),
    ...(typeof snapshot === 'string' && snapshot ? { cameraSnapshotRef: snapshot } : {}),
    ...(message.metadata?.cameraSnapshotExpired === true ? { cameraSnapshotExpired: true } : {}),
  };
};

/** 同一个角色、有通话句子、还没有挂断卡片的最近一通。没有句子就不算。 */
export const findLatestUnfinishedCall = (
  messages: UnfinishedCallInput[],
  charId: string,
): UnfinishedCallSession | null => {
  const ended = new Set<string>();
  const groups = new Map<string, UnfinishedCallInput[]>();
  messages.forEach(message => {
    if (message.charId && message.charId !== charId) return;
    const sessionId = sessionIdOf(message.metadata);
    if (!sessionId) return;
    const source = message.metadata?.source;
    if (source === 'call-end-popup') {
      ended.add(sessionId);
      return;
    }
    if (source !== 'call') return;
    if (message.role !== 'user' && message.role !== 'assistant') return;
    const bucket = groups.get(sessionId) || [];
    bucket.push(message);
    groups.set(sessionId, bucket);
  });

  let latest: UnfinishedCallSession | null = null;
  groups.forEach((bucket, sessionId) => {
    if (ended.has(sessionId) || !bucket.length) return;
    const sorted = [...bucket].sort((a, b) => a.timestamp - b.timestamp || (a.id || 0) - (b.id || 0));
    const lines = sorted.map(toLine).filter((line): line is UnfinishedCallLine => !!line);
    if (!lines.length) return;
    const first = lines[0];
    const last = lines[lines.length - 1];
    let callMode: 'voice' | 'video' | null = null;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const mode = callModeOf(sorted[index].metadata);
      if (mode) {
        callMode = mode;
        break;
      }
    }
    const session: UnfinishedCallSession = {
      sessionId,
      lines,
      callMode,
      durationSec: Math.max(1, Math.floor((last.timestamp - first.timestamp) / 1000)),
      turnCount: lines.filter(line => line.role === 'user').length,
      firstTimestamp: first.timestamp,
      lastTimestamp: last.timestamp,
    };
    if (!latest || session.lastTimestamp > latest.lastTimestamp
      || (session.lastTimestamp === latest.lastTimestamp && session.sessionId > latest.sessionId)) {
      latest = session;
    }
  });
  return latest;
};

export const formatCallClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

/** 跟通话页亲手挂断时那句留念同一套切法。 */
export const unfinishedKeepsakeLine = (
  lines: Array<{ role: string; text: string }>,
  charName: string,
): string => {
  const assistantLine = [...lines].reverse().find(item => item.role === 'assistant' && item.text.trim());
  if (!assistantLine) return `这通电话我会悄悄收藏，下次也记得来找我。 —— ${charName}`;
  const normalized = assistantLine.text.replace(/\s+/g, ' ').trim();
  const cutAt = normalized.search(/[。！？!?]/);
  const sentence = cutAt >= 0 ? normalized.slice(0, cutAt + 1) : normalized.slice(0, 42);
  const polished = sentence.length > 48 ? `${sentence.slice(0, 48)}…` : sentence;
  return `“${polished}” —— ${charName}`;
};

export const unfinishedCallEndCard = (input: {
  charId: string;
  charName: string;
  charAvatar?: string;
  session: UnfinishedCallSession;
  keepsakeLine: string;
  callMode: 'voice' | 'video';
  endedAt?: number;
}): { content: string; metadata: Record<string, unknown> } => {
  const turns = Math.max(1, input.session.turnCount);
  return {
    content: `通话结束 · ${input.charName}｜${formatCallClock(input.session.durationSec)}｜${turns}轮对话`,
    metadata: {
      source: 'call-end-popup',
      callSessionId: input.session.sessionId,
      incomingFromChat: false,
      characterId: input.charId,
      characterName: input.charName,
      characterAvatar: input.charAvatar,
      durationSec: input.session.durationSec,
      turnCount: input.session.turnCount,
      keepsakeLine: input.keepsakeLine,
      callMode: input.callMode,
      endedAt: input.endedAt ?? Date.now(),
    },
  };
};
