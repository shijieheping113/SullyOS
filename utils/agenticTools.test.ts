// utils/agenticTools.test.ts
import { describe, it, expect } from 'vitest';
import { listRecallableMonths, runRecall, type AgenticToolMemory, type AgenticToolCtx } from './agenticTools';
import type { UserProfile } from '../types';

const mem = (date: string, summary = '那天的事'): AgenticToolMemory => ({ date, summary });

const ctxWith = (memories: AgenticToolMemory[]): AgenticToolCtx => ({
  char: { name: '测试角色', memories },
  userProfile: { name: '用户' } as UserProfile,
});

describe('listRecallableMonths', () => {
  it('ISO 日期取出年月，去重后升序', () => {
    expect(listRecallableMonths([mem('2026-06-15'), mem('2026-06-28'), mem('2026-05-02')]))
      .toEqual(['2026-05', '2026-06']);
  });

  it('中文日期同样认，月份补零', () => {
    expect(listRecallableMonths([mem('2026年6月15日'), mem('2026年11月3日')]))
      .toEqual(['2026-06', '2026-11']);
  });

  it('没有记忆时给空清单（调用方据此不注入这行提示）', () => {
    expect(listRecallableMonths(undefined)).toEqual([]);
    expect(listRecallableMonths([])).toEqual([]);
  });

  it('认不出日期的条目跳过，不产出垃圾月份', () => {
    expect(listRecallableMonths([mem('不知道什么时候'), mem('2026-07-01')])).toEqual(['2026-07']);
  });

  // 这条是这个函数存在的意义：清单要摆给角色看，报了一个查不到的月份
  // 比不报还糟——角色会以为自己有那段记忆，[[RECALL]] 回来却是空的。
  it('报出来的每个月份，runRecall 都真能查到', async () => {
    const memories = [mem('2026-06-15'), mem('2026年5月2日'), mem('2026-11-30')];
    const months = listRecallableMonths(memories);
    expect(months.length).toBeGreaterThan(0);
    for (const month of months) {
      const [year, mm] = month.split('-');
      const result = await runRecall({ year, month: mm }, ctxWith(memories));
      expect(result, `${month} 应该查得到`).toMatchObject({ ok: true });
    }
  });

  it('没被报出来的月份确实查不到', async () => {
    const memories = [mem('2026-06-15')];
    expect(listRecallableMonths(memories)).not.toContain('2026-07');
    expect(await runRecall({ year: '2026', month: '07' }, ctxWith(memories)))
      .toMatchObject({ ok: false, reason: 'no_logs' });
  });
});

describe('runRecall 按天', () => {
  it('只返回那一天的日志', async () => {
    const memories = [mem('2026-06-15', '十五'), mem('2026-06-16', '十六'), mem('2026年6月15日', '十五中文')];
    const result = await runRecall({ year: '2026', month: '06', day: '15' }, ctxWith(memories));
    expect(result).toMatchObject({ ok: true, alreadyActive: false, yearMonth: '2026-06-15' });
    if (result.ok) {
      expect(result.logsText).toContain('十五');
      expect(result.logsText).not.toContain('十六');
    }
  });

  it('整月亮着或该日已亮时算 alreadyActive', async () => {
    const memories = [mem('2026-06-15')];
    expect(await runRecall({ year: '2026', month: '06', day: '15' }, {
      char: { name: '测', memories, activeMemoryMonths: ['2026-06'] },
      userProfile: { name: '用户' } as UserProfile,
    })).toMatchObject({ ok: true, alreadyActive: true });
    expect(await runRecall({ year: '2026', month: '06', day: '15' }, {
      char: { name: '测', memories, activeMemoryDays: ['2026-06-15'] },
      userProfile: { name: '用户' } as UserProfile,
    })).toMatchObject({ ok: true, alreadyActive: true });
  });
});
