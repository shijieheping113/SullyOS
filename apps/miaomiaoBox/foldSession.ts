import type { MiaomiaoMessage } from './types';
import { splitBoxThinking } from './boxLlm';

/** 一轮 = 一条还没折起来的用户消息（后面通常跟一条角色回复） */
export function countUnfoldedRounds(messages: MiaomiaoMessage[]): number {
  return messages.filter(m => m.role === 'user' && !m.folded).length;
}

export function messagesForModel(messages: MiaomiaoMessage[]): MiaomiaoMessage[] {
  return messages.filter(m => !m.folded);
}

/** 已经攒够 every 条还没被大总结合并的滚动总结时，返回最前面的那 every 条。 */
export function planBigFold(messages: MiaomiaoMessage[], every: number): MiaomiaoMessage[] {
  const n = Math.floor(every);
  if (n < 1) return [];
  const smalls = messages
    .filter(m => m.role === 'summary' && !m.folded && m.summaryKind !== 'big')
    .sort((a, b) => a.timestamp - b.timestamp);
  if (smalls.length < n) return [];
  return smalls.slice(0, n);
}

/**
 * 未折轮次凑满「总结 N 轮 + 保留 K 轮」时，把最前面的 N 轮标成 folded。
 * 后 K 轮留着不总结，原文不删，只是不发给模型。
 * 例：N=8、K=3，要到 11 轮才折，折前 8 轮，留下后 3 轮。
 */
export function planFold(
  messages: MiaomiaoMessage[],
  foldN: number,
  foldKeep: number,
): { shouldFold: boolean; foldFromRound: number; foldToRound: number; toFold: MiaomiaoMessage[] } {
  const n = Math.max(1, Math.floor(foldN) || 1);
  const keep = Math.max(1, Math.floor(foldKeep) || 1);
  const unfoldedUsers = messages.filter(m => m.role === 'user' && !m.folded);
  if (unfoldedUsers.length < n + keep) {
    return { shouldFold: false, foldFromRound: 0, foldToRound: 0, toFold: [] };
  }
  const alreadyFoldedRounds = messages.filter(m => m.role === 'user' && m.folded).length;
  const foldFromRound = alreadyFoldedRounds + 1;
  const foldToRound = alreadyFoldedRounds + n;
  // 第 n+1 条还没折的用户消息是下一轮的开头。它自己和它后面的回复都留着。
  // 它前面的整轮（含同一轮里拆开的多条回复）都折进去。
  const boundary = unfoldedUsers[n];
  const boundaryTs = boundary?.timestamp ?? Number.POSITIVE_INFINITY;
  const toFold = messages.filter(m =>
    !m.folded && m.role !== 'summary' && m.timestamp < boundaryTs,
  );
  return { shouldFold: true, foldFromRound, foldToRound, toFold };
}

/** 旧数据里摘要的时间戳可能落在下一轮后面。按轮次把它挪回下一轮用户消息之前。 */
export function relocateSummaries(messages: MiaomiaoMessage[]): { messages: MiaomiaoMessage[]; moved: MiaomiaoMessage[] } {
  const users = messages.filter(m => m.role === 'user').sort((a, b) => a.timestamp - b.timestamp);
  const moved: MiaomiaoMessage[] = [];
  const next = messages.map(m => {
    if (m.role !== 'summary' || !m.summaryRange) return m;
    const boundary = users[m.summaryRange.toRound];
    if (!boundary || m.timestamp < boundary.timestamp) return m;
    const fixed = { ...m, timestamp: boundary.timestamp - 1 };
    moved.push(fixed);
    return fixed;
  });
  next.sort((a, b) => a.timestamp - b.timestamp || (a.role === 'summary' ? -1 : 1));
  return { messages: next, moved };
}

export function applyFold(
  messages: MiaomiaoMessage[],
  toFoldIds: Set<string>,
  summary: MiaomiaoMessage,
): MiaomiaoMessage[] {
  const next = messages.map(m => (toFoldIds.has(m.id) ? { ...m, folded: true } : m));
  const lastFoldedTs = Math.max(0, ...[...toFoldIds].map(id => messages.find(m => m.id === id)?.timestamp || 0));
  const insertAt = next.findIndex(m => m.timestamp > lastFoldedTs);
  const row = { ...summary, timestamp: lastFoldedTs + 1 };
  if (insertAt < 0) next.push(row);
  else next.splice(insertAt, 0, row);
  return next;
}

/** 把已经写好的几条滚动总结标成 folded，并插入一条大总结。原文摘要还在库里，只是不再发给模型。 */
export function applyBigFold(
  messages: MiaomiaoMessage[],
  compressedIds: Set<string>,
  summary: MiaomiaoMessage,
): MiaomiaoMessage[] {
  const next = messages.map(m => (compressedIds.has(m.id) ? { ...m, folded: true } : m));
  const lastTs = Math.max(0, ...[...compressedIds].map(id => messages.find(m => m.id === id)?.timestamp || 0));
  const row = { ...summary, timestamp: lastTs + 1 };
  const insertAt = next.findIndex(m => m.timestamp > row.timestamp);
  if (insertAt < 0) next.push(row);
  else next.splice(insertAt, 0, row);
  return next;
}

/**
 * 解散一张总结卡。
 * 滚动总结：删掉这张卡，把这段里折起的原文放回来，并退掉这一次折叠账。
 * 大总结：只删掉这张大卡，把范围内折起的滚动总结重新亮出来。原文继续折着。
 * 大总结不退折叠次数和卷起轮数，这批滚动总结继续算进下一次大总结。
 */
export function dissolveSummary(
  messages: MiaomiaoMessage[],
  summaryId: string,
): { messages: MiaomiaoMessage[]; restored: MiaomiaoMessage[]; removedId: string | null; restoredRounds: number; undoneFolds: number } {
  const summary = messages.find(m => m.id === summaryId && m.role === 'summary');
  if (!summary?.summaryRange) {
    return { messages, restored: [], removedId: null, restoredRounds: 0, undoneFolds: 0 };
  }
  if (summary.summaryKind === 'big') {
    const { fromRound, toRound } = summary.summaryRange;
    const rollIds = new Set(messages.filter(m =>
      m.id !== summary.id
      && m.role === 'summary'
      && m.summaryKind !== 'big'
      && m.folded
      && m.summaryRange
      && m.summaryRange.fromRound >= fromRound
      && m.summaryRange.toRound <= toRound,
    ).map(m => m.id));
    const next = messages
      .filter(m => m.id !== summaryId)
      .map(m => (rollIds.has(m.id) ? { ...m, folded: false } : m));
    return {
      messages: next,
      restored: next.filter(m => rollIds.has(m.id)),
      removedId: summaryId,
      restoredRounds: 0,
      undoneFolds: 0,
    };
  }
  const users = messages.filter(m => m.role === 'user').sort((a, b) => a.timestamp - b.timestamp);
  const start = users[summary.summaryRange.fromRound - 1];
  if (!start) {
    return { messages, restored: [], removedId: null, restoredRounds: 0, undoneFolds: 0 };
  }
  const end = users[summary.summaryRange.toRound];
  const covered = messages.filter(m =>
    m.role !== 'summary'
    && m.folded
    && m.timestamp >= start.timestamp
    && (end ? m.timestamp < end.timestamp : true),
  );
  const restoreIds = new Set(covered.map(m => m.id));
  const restoredRounds = covered.filter(m => m.role === 'user').length;
  const next = messages
    .filter(m => m.id !== summaryId)
    .map(m => (restoreIds.has(m.id) ? { ...m, folded: false } : m));
  return {
    messages: next,
    restored: next.filter(m => restoreIds.has(m.id)),
    removedId: summaryId,
    restoredRounds,
    undoneFolds: 1,
  };
}

export function formatBoxHistoryForModel(messages: MiaomiaoMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messagesForModel(messages)) {
    if (m.role === 'summary') {
      out.push({
        role: 'assistant',
        content: `（${m.summaryKind === 'big' ? '箱子里的大前情' : '箱子里的前情'}，第 ${m.summaryRange?.fromRound ?? '?'}–${m.summaryRange?.toRound ?? '?'} 轮：${m.content}）`,
      });
      continue;
    }
    const spoken = splitBoxThinking(m.content, '').content;
    const preview = m.htmlTextPreview
      ? `${spoken ? `${spoken}\n` : ''}（系统记录：先前发送过一张 HTML 卡片，已在界面渲染；卡片文字摘要——${m.htmlTextPreview}。这只是历史占位，请勿复述本行；要再发卡片必须用 [html]...[/html] 包裹真正的 HTML。）`
      : spoken;
    out.push({ role: m.role === 'user' ? 'user' : 'assistant', content: preview });
  }
  return out;
}
