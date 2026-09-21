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
  const cutoffTs = unfoldedUsers[n - 1]?.timestamp ?? 0;
  const lastFoldedUser = unfoldedUsers[n - 1];
  const after = messages.find(m =>
    m.role === 'assistant' && !m.folded && m.timestamp >= (lastFoldedUser?.timestamp ?? 0),
  );
  const endTs = after?.timestamp ?? cutoffTs;
  const toFold = messages.filter(m =>
    !m.folded && m.role !== 'summary' && m.timestamp <= endTs,
  );
  return { shouldFold: true, foldFromRound, foldToRound, toFold };
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
