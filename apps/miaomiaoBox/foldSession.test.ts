import { describe, expect, it } from 'vitest';
import { applyFold, countUnfoldedRounds, messagesForModel, planFold } from './foldSession';
import type { MiaomiaoMessage } from './types';

const msg = (
  id: string,
  role: MiaomiaoMessage['role'],
  ts: number,
  extra: Partial<MiaomiaoMessage> = {},
): MiaomiaoMessage => ({
  id,
  sessionId: 's',
  charId: 'c',
  role,
  content: id,
  timestamp: ts,
  ...extra,
});

describe('miaomiao fold', () => {
  it('N=20 时 20 轮不折', () => {
    const rows: MiaomiaoMessage[] = [];
    for (let i = 0; i < 20; i++) {
      rows.push(msg(`u${i}`, 'user', i * 2));
      rows.push(msg(`a${i}`, 'assistant', i * 2 + 1));
    }
    expect(countUnfoldedRounds(rows)).toBe(20);
    expect(planFold(rows, 20).shouldFold).toBe(false);
  });

  it('超过 20 轮把最前面 20 轮折起来，原文还在', () => {
    const rows: MiaomiaoMessage[] = [];
    for (let i = 0; i < 21; i++) {
      rows.push(msg(`u${i}`, 'user', i * 2));
      rows.push(msg(`a${i}`, 'assistant', i * 2 + 1));
    }
    const plan = planFold(rows, 20);
    expect(plan.shouldFold).toBe(true);
    expect(plan.foldFromRound).toBe(1);
    expect(plan.foldToRound).toBe(20);
    expect(plan.toFold.some(m => m.id === 'u0')).toBe(true);
    expect(plan.toFold.some(m => m.id === 'u20')).toBe(false);

    const folded = applyFold(
      rows,
      new Set(plan.toFold.map(m => m.id)),
      msg('sum', 'summary', 0, { content: '前情', summaryRange: { fromRound: 1, toRound: 20 } }),
    );
    expect(folded.find(m => m.id === 'u0')?.folded).toBe(true);
    expect(folded.find(m => m.id === 'u20')?.folded).toBeFalsy();
    expect(messagesForModel(folded).some(m => m.id === 'u0')).toBe(false);
    expect(messagesForModel(folded).some(m => m.id === 'sum')).toBe(true);
    expect(folded.find(m => m.id === 'u0')?.content).toBe('u0');
  });
});
