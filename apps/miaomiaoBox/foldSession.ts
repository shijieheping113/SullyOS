import type { MiaomiaoMessage } from './types';

/** 一轮 = 一条还没折起来的用户消息（后面通常跟一条角色回复） */
export function countUnfoldedRounds(messages: MiaomiaoMessage[]): number {
  return messages.filter(m => m.role === 'user' && !m.folded).length;
}

export function messagesForModel(messages: MiaomiaoMessage[]): MiaomiaoMessage[] {
  return messages.filter(m => m.role === 'summary' || !m.folded);
}

/**
 * 未折轮次超过 N 时，把最前面的 N 轮标成 folded，并指出该收成摘要的原文。
 * 原文不删，只是不发给模型。
 */
export function planFold(
  messages: MiaomiaoMessage[],
  foldN: number,
): { shouldFold: boolean; foldFromRound: number; foldToRound: number; toFold: MiaomiaoMessage[] } {
  const n = Math.max(1, Math.floor(foldN) || 1);
  const unfoldedUsers = messages.filter(m => m.role === 'user' && !m.folded);
  if (unfoldedUsers.length <= n) {
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

export function formatBoxHistoryForModel(messages: MiaomiaoMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messagesForModel(messages)) {
    if (m.role === 'summary') {
      out.push({
        role: 'user',
        content: `（箱子里的前情，第 ${m.summaryRange?.fromRound ?? '?'}–${m.summaryRange?.toRound ?? '?'} 轮：${m.content}）`,
      });
      continue;
    }
    const preview = m.htmlTextPreview
      ? `${m.content ? `${m.content}\n` : ''}（系统记录：先前发送过一张 HTML 卡片，已在界面渲染；卡片文字摘要——${m.htmlTextPreview}。这只是历史占位，请勿复述本行；要再发卡片必须用 [html]...[/html] 包裹真正的 HTML。）`
      : m.content;
    out.push({ role: m.role === 'user' ? 'user' : 'assistant', content: preview });
  }
  return out;
}
