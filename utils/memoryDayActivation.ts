/**
 * 神经链接「详细回忆」按天激活：与 activeMemoryMonths 并存。
 * 整月亮开仍按原作者逻辑；按天是补充，互斥规则见下方 helpers。
 */

/** 把记忆条目上的日期尽量归一成 YYYY-MM-DD；认不出则返回空串。 */
export function normalizeMemoryDayKey(raw: string | undefined | null): string {
    if (!raw) return '';
    const text = String(raw).trim();
    const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text);
    if (iso) {
        return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
    const cn = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(text);
    if (cn) {
        return `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`;
    }
    return '';
}

export function monthKeyOfDay(dayKey: string): string {
    return dayKey.slice(0, 7);
}

export function isMemoryDayActive(
    dayKey: string,
    activeMonths: string[] | undefined,
    activeDays: string[] | undefined,
): boolean {
    if (!dayKey) return false;
    const month = monthKeyOfDay(dayKey);
    if ((activeMonths || []).includes(month)) return true;
    return (activeDays || []).includes(dayKey);
}

/** 条目是否应进入「详细回忆」注入。 */
export function memoryEntryMatchesActiveDetail(
    entryDate: string,
    activeMonths: string[] | undefined,
    activeDays: string[] | undefined,
): boolean {
    const dayKey = normalizeMemoryDayKey(entryDate);
    if (dayKey) return isMemoryDayActive(dayKey, activeMonths, activeDays);
    // 认不出日时，退回旧行为：只按年月前缀匹配激活月份
    const loose = entryDate.replace(/[\/年月]/g, '-').replace('日', '');
    const parts = loose.split('-');
    if (parts.length >= 2) {
        const month = `${parts[0]}-${parts[1].padStart(2, '0')}`;
        return (activeMonths || []).includes(month);
    }
    return false;
}

export function countActiveDaysInMonth(monthKey: string, activeDays: string[] | undefined): number {
    return (activeDays || []).filter(day => day.startsWith(`${monthKey}-`)).length;
}

/** 亮某一天：写入 days，若该月整月已亮则关掉整月（改为按天）。 */
export function activateMemoryDay(
    dayKey: string,
    activeMonths: string[],
    activeDays: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    const month = monthKeyOfDay(dayKey);
    const months = activeMonths.filter(m => m !== month);
    const days = activeDays.includes(dayKey) ? activeDays : [...activeDays, dayKey];
    return { activeMemoryMonths: months, activeMemoryDays: days };
}

/** 关某一天：只从 days 移除；整月亮着时关一天 = 整月拆成「其余天」按天亮开。 */
export function deactivateMemoryDay(
    dayKey: string,
    activeMonths: string[],
    activeDays: string[],
    allDaysInMonth: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    const month = monthKeyOfDay(dayKey);
    if (activeMonths.includes(month)) {
        const rest = allDaysInMonth.filter(d => d !== dayKey);
        return {
            activeMemoryMonths: activeMonths.filter(m => m !== month),
            activeMemoryDays: [...new Set([...activeDays.filter(d => !d.startsWith(`${month}-`)), ...rest])],
        };
    }
    return {
        activeMemoryMonths: activeMonths,
        activeMemoryDays: activeDays.filter(d => d !== dayKey),
    };
}

export function toggleMemoryDay(
    dayKey: string,
    activeMonths: string[],
    activeDays: string[],
    allDaysInMonth: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    if (isMemoryDayActive(dayKey, activeMonths, activeDays)) {
        return deactivateMemoryDay(dayKey, activeMonths, activeDays, allDaysInMonth);
    }
    return activateMemoryDay(dayKey, activeMonths, activeDays);
}

/** 亮开区间（含端点）；只激活 allDaysInMonth 里真实存在的日期。关掉该月整月开关。 */
export function activateMemoryDayRange(
    startKey: string,
    endKey: string,
    activeMonths: string[],
    activeDays: string[],
    allDaysInMonth: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    const [from, to] = startKey <= endKey ? [startKey, endKey] : [endKey, startKey];
    const month = monthKeyOfDay(from);
    const picked = allDaysInMonth.filter(d => d >= from && d <= to);
    const months = activeMonths.filter(m => m !== month);
    const withoutMonthDays = activeDays.filter(d => !d.startsWith(`${month}-`));
    return {
        activeMemoryMonths: months,
        activeMemoryDays: [...new Set([...withoutMonthDays, ...picked])],
    };
}

/** 关掉区间内的天；若整月亮着则先拆成按天再关区间。 */
export function deactivateMemoryDayRange(
    startKey: string,
    endKey: string,
    activeMonths: string[],
    activeDays: string[],
    allDaysInMonth: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    const [from, to] = startKey <= endKey ? [startKey, endKey] : [endKey, startKey];
    const month = monthKeyOfDay(from);
    let months = activeMonths;
    let days = activeDays;
    if (months.includes(month)) {
        months = months.filter(m => m !== month);
        days = [...new Set([...days.filter(d => !d.startsWith(`${month}-`)), ...allDaysInMonth])];
    }
    const drop = new Set(allDaysInMonth.filter(d => d >= from && d <= to));
    return {
        activeMemoryMonths: months,
        activeMemoryDays: days.filter(d => !drop.has(d)),
    };
}

/** 亮整月：原作者行为 + 清掉该月按天名单，避免重复。 */
export function activateMemoryMonth(
    monthKey: string,
    activeMonths: string[],
    activeDays: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    const months = activeMonths.includes(monthKey) ? activeMonths : [...activeMonths, monthKey];
    return {
        activeMemoryMonths: months,
        activeMemoryDays: activeDays.filter(d => !d.startsWith(`${monthKey}-`)),
    };
}

/** 关整月：只关整月；按天名单不动。 */
export function deactivateMemoryMonth(
    monthKey: string,
    activeMonths: string[],
    activeDays: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    return {
        activeMemoryMonths: activeMonths.filter(m => m !== monthKey),
        activeMemoryDays: activeDays,
    };
}

export function toggleMemoryMonth(
    monthKey: string,
    activeMonths: string[],
    activeDays: string[],
): { activeMemoryMonths: string[]; activeMemoryDays: string[] } {
    if (activeMonths.includes(monthKey)) {
        return deactivateMemoryMonth(monthKey, activeMonths, activeDays);
    }
    return activateMemoryMonth(monthKey, activeMonths, activeDays);
}

/** 列出区间端点之间、按日历日步进的 YYYY-MM-DD（用于测试/展示；激活仍以档案里真实有的天为准）。 */
export function enumerateDayKeysInclusive(startKey: string, endKey: string): string[] {
    const [from, to] = startKey <= endKey ? [startKey, endKey] : [endKey, startKey];
    const out: string[] = [];
    const cur = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return out;
    while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        out.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
    }
    return out;
}
