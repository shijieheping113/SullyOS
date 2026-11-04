import { CharacterProfile, DailySchedule } from '../types';
import { DB } from './db';
import { getLocalDateKey } from './localDate';
import { nowInTimeZone, resolveCharTimeZone } from './timezone';
import { getScheduleMode } from './scheduleFeature';

/**
 * Load a schedule for the requested calendar timezone (device time by default).
 *
 * Older builds keyed schedules by UTC date or by the phone's date. If the target
 * key is absent, a legacy record is reused only when its generatedAt belongs to
 * today in the requested timezone. Historical records are deliberately untouched.
 */
export async function getLocalDailySchedule(
    charId: string,
    at: Date = new Date(),
    timeZone?: string,
): Promise<DailySchedule | null> {
    const localKey = getLocalDateKey(nowInTimeZone(timeZone, at));
    /** 这份日程是不是「今天」在角色当地生成的。 */
    const belongsToToday = (record: DailySchedule): boolean =>
        Number.isFinite(record.generatedAt)
        && getLocalDateKey(nowInTimeZone(timeZone, new Date(record.generatedAt))) === localKey;

    const current = await DB.getDailySchedule(charId, localKey);
    // 命中也要验 generatedAt：开启自定义时区之前按手机日写下的记录，
    // 其 key 可能正好等于今天的角色当地日，但内容是角色那边前一天的。
    // 不验就会把昨天的日程当成今天的接着用，而且当天不会再重新生成。
    if (current && belongsToToday(current)) return current;

    // 兼容两类旧 key：
    // 1) 更早版本按 UTC 日写入；
    // 2) 角色时区支持接入前按手机日写入。
    // 只有 generatedAt 在角色当地确实属于“今天”时才迁移，历史日程绝不挪动。
    const legacyKeys = [
        getLocalDateKey(at),
        at.toISOString().slice(0, 10),
    ].filter((key, index, all) => key !== localKey && all.indexOf(key) === index);

    for (const legacyKey of legacyKeys) {
        const legacy = await DB.getDailySchedule(charId, legacyKey);
        if (!legacy || !belongsToToday(legacy)) continue;

        const migrated: DailySchedule = {
            ...legacy,
            id: `${charId}_${localKey}`,
            charId,
            date: localKey,
        };
        await DB.saveDailySchedule(migrated);
        // 搬走而不是复制：留着旧 key 的话，等角色当地日历翻到那个日期时会被
        // 上面的命中分支再取一次，同一份日程就被当成两天用了。
        await DB.deleteDailySchedule(charId, legacyKey);
        return migrated;
    }
    return null;
}

/** 按角色自己的日历日读取日程；未开启自定义时区时保持原本的手机时间行为。 */
export async function getDailyScheduleForChar(
    char: Pick<CharacterProfile, 'id' | 'customTimezoneEnabled' | 'customTimezone' | 'scheduleMode'>,
    at: Date = new Date(),
): Promise<DailySchedule | null> {
    if (getScheduleMode(char) !== 'fate') return getLocalDailySchedule(char.id, at, resolveCharTimeZone(char));
    const wall = nowInTimeZone(resolveCharTimeZone(char), at);
    const today = getLocalDateKey(wall);
    const current = await DB.getDailySchedule(`fate:${char.id}`, today);
    const yesterday = new Date(wall);
    yesterday.setDate(yesterday.getDate() - 1);
    const previous = await DB.getDailySchedule(`fate:${char.id}`, getLocalDateKey(yesterday));
    const carry = previous?.slots.filter(slot => typeof slot.endsAt === 'number' && slot.endsAt > at.getTime()
        && !current?.fateReplacedStarts?.includes(slot.startsAt!)
        && !current?.slots.some(saved => typeof saved.startsAt === 'number' && saved.startsAt >= (slot.startsAt || 0) && saved.startsAt < slot.endsAt!));
    if (!carry?.length) return current;
    return {
        ...(current || { id: `fate:${char.id}_${today}`, charId: char.id, date: today, generatedAt: at.getTime(), mode: 'fate' as const }),
        slots: [...carry, ...(current?.slots || [])],
        fateDraws: [...(previous?.fateDraws || []).filter(draw => draw.date === today), ...(current?.fateDraws || [])],
    };
}

/** 直接按日期读真实历史，不迁移、不补造。包括两种模式，以免切换后去重失去依据。 */
export async function getRecentScheduleHistory(
    char: Pick<CharacterProfile, 'id' | 'customTimezoneEnabled' | 'customTimezone'>,
    at: Date = new Date(),
    days = 7,
): Promise<DailySchedule[]> {
    const wall = nowInTimeZone(resolveCharTimeZone(char), at);
    const dates = Array.from({ length: days + 1 }, (_, index) => {
        const date = new Date(wall);
        date.setDate(date.getDate() - index);
        return getLocalDateKey(date);
    });
    const rows = await Promise.all(dates.map(async date => Promise.all([
        DB.getDailySchedule(char.id, date), DB.getDailySchedule(`fate:${char.id}`, date),
    ])));
    const history = rows.flat().filter((row): row is DailySchedule => !!row);
    const replaced = new Set(history.reduce<number[]>((all, row) => all.concat(row.fateReplacedStarts || []), []));
    return history.map(row => ({ ...row, slots: row.slots.filter(slot => !replaced.has(slot.startsAt!)) }));
}
