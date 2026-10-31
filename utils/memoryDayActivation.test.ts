import { describe, expect, it } from 'vitest';
import {
    activateMemoryDayRange,
    deactivateMemoryDay,
    isMemoryDayActive,
    memoryEntryMatchesActiveDetail,
    normalizeMemoryDayKey,
    toggleMemoryDay,
    toggleMemoryMonth,
} from './memoryDayActivation';
import { readableContextMemories } from './contextMemories';
import type { CharacterProfile } from '../types';

describe('normalizeMemoryDayKey', () => {
    it('认 ISO 与中文日期', () => {
        expect(normalizeMemoryDayKey('2026-10-05')).toBe('2026-10-05');
        expect(normalizeMemoryDayKey('2026/10/5')).toBe('2026-10-05');
        expect(normalizeMemoryDayKey('2026年10月5日')).toBe('2026-10-05');
    });
});

describe('按天 / 整月互斥', () => {
    const monthDays = ['2026-10-01', '2026-10-05', '2026-10-12', '2026-10-20'];

    it('亮开几天后上下文只有这几天', () => {
        const next = activateMemoryDayRange('2026-10-05', '2026-10-12', ['2026-10'], [], monthDays);
        expect(next.activeMemoryMonths).toEqual([]);
        expect(next.activeMemoryDays.sort()).toEqual(['2026-10-05', '2026-10-12']);
        const char = {
            refinedMemories: { '2026-10': '十月核心' },
            activeMemoryMonths: next.activeMemoryMonths,
            activeMemoryDays: next.activeMemoryDays,
            memories: [
                { id: '1', date: '2026-10-01', summary: '一日' },
                { id: '2', date: '2026-10-05', summary: '五日' },
                { id: '3', date: '2026-10-12', summary: '十二日' },
                { id: '4', date: '2026-10-20', summary: '二十日' },
            ],
        } as CharacterProfile;
        const { monthly, daily } = readableContextMemories(char, true);
        expect(monthly).toEqual([{ date: '2026-10', summary: '十月核心' }]);
        expect(daily[0].entries.map(e => e.summary).sort()).toEqual(['五日', '十二日']);
    });

    it('亮整月会清掉该月按天名单', () => {
        const next = toggleMemoryMonth('2026-10', [], ['2026-10-05', '2026-09-01']);
        expect(next.activeMemoryMonths).toEqual(['2026-10']);
        expect(next.activeMemoryDays).toEqual(['2026-09-01']);
    });

    it('整月亮着时关掉某一天会拆成其余天', () => {
        const next = deactivateMemoryDay('2026-10-05', ['2026-10'], [], monthDays);
        expect(next.activeMemoryMonths).toEqual([]);
        expect(next.activeMemoryDays.sort()).toEqual(['2026-10-01', '2026-10-12', '2026-10-20']);
    });

    it('toggle 某一天：关→开→关', () => {
        let state = { activeMemoryMonths: [] as string[], activeMemoryDays: [] as string[] };
        state = toggleMemoryDay('2026-10-05', state.activeMemoryMonths, state.activeMemoryDays, monthDays);
        expect(isMemoryDayActive('2026-10-05', state.activeMemoryMonths, state.activeMemoryDays)).toBe(true);
        state = toggleMemoryDay('2026-10-05', state.activeMemoryMonths, state.activeMemoryDays, monthDays);
        expect(isMemoryDayActive('2026-10-05', state.activeMemoryMonths, state.activeMemoryDays)).toBe(false);
    });

    it('认不出日的条目仍可按月匹配', () => {
        expect(memoryEntryMatchesActiveDetail('unknown', ['2026-10'], [])).toBe(false);
        expect(memoryEntryMatchesActiveDetail('2026年10月', ['2026-10'], [])).toBe(true);
    });
});
