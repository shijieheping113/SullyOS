import { describe, expect, it } from 'vitest';
import { applyBigFold, applyFold, countUnfoldedRounds, dissolveSummary, messagesForModel, planBigFold, planFold, relocateSummaries } from './foldSession';
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
    expect(planFold(rows, 20, 1).shouldFold).toBe(false);
  });

  it('超过 20 轮把最前面 20 轮折起来，原文还在', () => {
    const rows: MiaomiaoMessage[] = [];
    for (let i = 0; i < 21; i++) {
      rows.push(msg(`u${i}`, 'user', i * 2));
      rows.push(msg(`a${i}`, 'assistant', i * 2 + 1));
    }
    const plan = planFold(rows, 20, 1);
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
    const plan = planFold(rows, 5, 1);
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

  it('8+3：10 轮不折，11 轮折前 8 轮、留下后 3 轮', () => {
    const rows: MiaomiaoMessage[] = [];
    for (let i = 0; i < 10; i++) rows.push(msg(`u${i}`, 'user', i));
    expect(planFold(rows, 8, 3).shouldFold).toBe(false);
    rows.push(msg('u10', 'user', 10));
    const plan = planFold(rows, 8, 3);
    expect(plan.shouldFold).toBe(true);
    expect(plan.toFold.map(m => m.id)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
    expect(plan.foldFromRound).toBe(1);
    expect(plan.foldToRound).toBe(8);
  });

  it('攒够 10 条滚动总结才取出前 10 条做大总结，折过的和大总结自己不算', () => {
    const rows: MiaomiaoMessage[] = [];
    for (let i = 0; i < 9; i++) rows.push(msg(`s${i}`, 'summary', i, { summaryKind: 'roll' }));
    expect(planBigFold(rows, 10)).toHaveLength(0);
    rows.push(msg('s9', 'summary', 9, { summaryKind: 'roll' }));
    rows.push(msg('old', 'summary', 0, { summaryKind: 'roll', folded: true }));
    rows.push(msg('big0', 'summary', 20, { summaryKind: 'big' }));
    const batch = planBigFold(rows, 10);
    expect(batch.map(m => m.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']);
    const folded = applyBigFold(rows, new Set(batch.map(m => m.id)), msg('big1', 'summary', 0, { summaryKind: 'big', content: '大前情' }));
    expect(folded.find(m => m.id === 's0')?.folded).toBe(true);
    expect(messagesForModel(folded).some(m => m.id === 's0')).toBe(false);
    expect(messagesForModel(folded).some(m => m.id === 'big1')).toBe(true);
    expect(planBigFold([], 0)).toHaveLength(0);
  });

  it('解散滚动总结后原文回到原位，并重新计入 X+X', () => {
    const rows: MiaomiaoMessage[] = [];
    for (let i = 0; i < 11; i++) {
      rows.push(msg(`u${i}`, 'user', i * 2, { content: `问${i}` }));
      rows.push(msg(`a${i}`, 'assistant', i * 2 + 1, { content: `答${i}` }));
    }
    const plan = planFold(rows, 8, 3);
    const folded = applyFold(
      rows,
      new Set(plan.toFold.map(m => m.id)),
      msg('sum', 'summary', 0, { content: '前情', summaryKind: 'roll', summaryRange: { fromRound: plan.foldFromRound, toRound: plan.foldToRound } }),
    );
    const undone = dissolveSummary(folded, 'sum');
    expect(undone.removedId).toBe('sum');
    expect(undone.restoredRounds).toBe(8);
    expect(undone.undoneFolds).toBe(1);
    expect(undone.messages.some(m => m.id === 'sum')).toBe(false);
    expect(undone.messages.find(m => m.id === 'u0')?.folded).toBe(false);
    expect(undone.messages.find(m => m.id === 'u0')?.content).toBe('问0');
    expect(undone.messages.find(m => m.id === 'a7')?.folded).toBe(false);
    expect(countUnfoldedRounds(undone.messages)).toBe(11);
    const ids = undone.messages.map(m => m.id);
    expect(ids.indexOf('u7')).toBeLessThan(ids.indexOf('u8'));
    const again = [...undone.messages, msg('u11', 'user', 30)];
    const next = planFold(again, 8, 3);
    expect(next.shouldFold).toBe(true);
    expect(next.toFold.filter(m => m.role === 'user').map(m => m.id)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
  });

  it('解散大总结时，露出被压住的滚动总结，原文继续折着，计数不退', () => {
    const rows = [
      msg('u0', 'user', 1, { folded: true }),
      msg('a0', 'assistant', 2, { folded: true }),
      msg('u1', 'user', 3, { folded: true }),
      msg('a1', 'assistant', 4, { folded: true }),
      msg('s0', 'summary', 5, { summaryKind: 'roll', folded: true, summaryRange: { fromRound: 1, toRound: 1 } }),
      msg('s1', 'summary', 6, { summaryKind: 'roll', folded: true, summaryRange: { fromRound: 2, toRound: 2 } }),
      msg('sOut', 'summary', 9, { summaryKind: 'roll', folded: true, summaryRange: { fromRound: 4, toRound: 4 } }),
      msg('big', 'summary', 7, { summaryKind: 'big', summaryRange: { fromRound: 1, toRound: 2 }, content: '大前情' }),
      msg('u2', 'user', 8),
    ];
    const undone = dissolveSummary(rows, 'big');
    expect(undone.messages.some(m => m.id === 'big')).toBe(false);
    expect(undone.messages.find(m => m.id === 'u0')?.folded).toBe(true);
    expect(undone.messages.find(m => m.id === 'a1')?.folded).toBe(true);
    expect(undone.messages.find(m => m.id === 's0')?.folded).toBe(false);
    expect(undone.messages.find(m => m.id === 's1')?.folded).toBe(false);
    expect(undone.messages.find(m => m.id === 'sOut')?.folded).toBe(true);
    expect(undone.restored.map(m => m.id)).toEqual(['s0', 's1']);
    expect(undone.restoredRounds).toBe(0);
    expect(undone.undoneFolds).toBe(0);
    expect(messagesForModel(undone.messages).map(m => m.id)).toEqual(['s0', 's1', 'u2']);
    expect(planBigFold(undone.messages, 2).map(m => m.id)).toEqual(['s0', 's1']);

    const one = dissolveSummary(undone.messages, 's0');
    expect(one.undoneFolds).toBe(1);
    expect(one.restoredRounds).toBe(1);
    expect(one.messages.find(m => m.id === 'u0')?.folded).toBe(false);
    expect(one.messages.find(m => m.id === 'a0')?.folded).toBe(false);
    expect(one.messages.find(m => m.id === 'u1')?.folded).toBe(true);
    expect(one.messages.find(m => m.id === 's1')?.folded).toBe(false);
    expect(messagesForModel(one.messages).map(m => m.id)).toEqual(['u0', 'a0', 's1', 'u2']);
  });
});
