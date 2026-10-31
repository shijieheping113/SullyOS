import type { CharacterProfile, MemoryFragment } from '../types';
import { memoryEntryMatchesActiveDetail, normalizeMemoryDayKey, monthKeyOfDay } from './memoryDayActivation';

/** Shared with the prompt renderer: closed eyes suppress daily logs, never monthly summaries. */
export function readableContextMemories(char: CharacterProfile, includeDetails = true) {
    const monthly = Object.entries(char.refinedMemories || {}).sort().map(([date, summary]) => ({ date, summary }));
    if (!includeDetails) return { monthly, daily: [] as { month: string; entries: MemoryFragment[] }[] };

    const activeMonths = char.activeMemoryMonths || [];
    const activeDays = char.activeMemoryDays || [];
    const bucket = new Map<string, MemoryFragment[]>();

    for (const memory of char.memories || []) {
        if (!memoryEntryMatchesActiveDetail(memory.date, activeMonths, activeDays)) continue;
        const dayKey = normalizeMemoryDayKey(memory.date);
        const month = dayKey
            ? monthKeyOfDay(dayKey)
            : (() => {
                let date = memory.date.replace(/[\/年月]/g, '-').replace('日', '');
                const parts = date.split('-');
                if (parts.length >= 2) return `${parts[0]}-${parts[1].padStart(2, '0')}`;
                return 'unknown';
            })();
        const list = bucket.get(month) || [];
        list.push(memory);
        bucket.set(month, list);
    }

    const daily = [...bucket.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, entries]) => ({ month, entries }));

    return { monthly, daily };
}
