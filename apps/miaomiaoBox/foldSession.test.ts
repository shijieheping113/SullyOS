import { describe, expect, it } from 'vitest';
import { applyFold, countUnfoldedRounds, messagesForModel, planFold, relocateSummaries } from './foldSession';
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
    const sumAt = folded.findIndex(m => m.id === 'sum');
    const stayAt = folded.findIndex(m => m.id === 'u20');
    expect(sumAt).toBeGreaterThan(-1);
    expect(sumAt).toBeLessThan(stayAt);
  });

  it('同一轮拆成多条回复时，整轮都折在下一轮之前', () => {
    const rows: MiaomiaoMessage[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push(msg(`u${i}`, 'user', i * 10));
      rows.push(msg(`a${i}a`, 'assistant', i * 10 + 1));
      rows.push(msg(`a${i}b`, 'assistant', i * 10 + 2));
    }
    rows.push(msg('u5', 'user', 50));
    rows.push(msg('a5', 'assistant', 51));
    const plan = planFold(rows, 5);
    expect(plan.toFold.map(m => m.id)).toEqual(['u0', 'a0a', 'a0b', 'u1', 'a1a', 'a1b', 'u2', 'a2a', 'a2b', 'u3', 'a3a', 'a3b', 'u4', 'a4a', 'a4b']);
    const folded = applyFold(
      rows,
      new Set(plan.toFold.map(m => m.id)),
      msg('sum', 'summary', 999, { content: '前情', summaryRange: { fromRound: 1, toRound: 5 } }),
    );
    const ids = folded.map(m => m.id);
    expect(ids.indexOf('sum')).toBe(ids.indexOf('u5') - 1);
    expect(messagesForModel(folded).map(m => m.id)).toEqual(['sum', 'u5', 'a5']);
  });

  it('摘要时间戳落在下一轮后面时，挪回下一轮之前', () => {
    const rows = [
      msg('u0', 'user', 1, { folded: true }),
      msg('a0', 'assistant', 2, { folded: true }),
      msg('u1', 'user', 10),
      msg('a1', 'assistant', 11),
      msg('sum', 'summary', 50, { summaryRange: { fromRound: 1, toRound: 1 }, content: '前情' }),
    ];
    const fixed = relocateSummaries(rows);
    expect(fixed.moved).toHaveLength(1);
    const ids = fixed.messages.map(m => m.id);
    expect(ids.indexOf('sum')).toBeLessThan(ids.indexOf('u1'));
    expect(messagesForModel(fixed.messages).some(m => m.id === 'u0')).toBe(false);
  });
});
