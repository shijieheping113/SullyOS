import { describe, expect, it } from 'vitest';
import type { CharacterProfile, ScheduleSlot } from '../types';
import {
    FATE_SLOT_MAX_MINUTES,
    FATE_SLOT_MIN_MINUTES,
    fateSlotOverlapsOthers,
    fateSlotRangesOverlap,
    normalizeFateClock,
    resolveFateSlotTimes,
} from './fateSchedule';

const shanghai = { customTimezoneEnabled: true, customTimezone: 'Asia/Shanghai' } as CharacterProfile;

describe('命运日程时间编辑工具', () => {
    it('规范钟点并拒绝非法值', () => {
        expect(normalizeFateClock('9:05')).toBe('09:05');
        expect(normalizeFateClock('10:00:00')).toBe('10:00');
        expect(normalizeFateClock('24:00')).toBeNull();
        expect(normalizeFateClock('abc')).toBeNull();
    });

    it('半开区间重叠判断', () => {
        expect(fateSlotRangesOverlap(0, 60, 60, 120)).toBe(false);
        expect(fateSlotRangesOverlap(0, 61, 60, 120)).toBe(true);
        expect(fateSlotRangesOverlap(100, 200, 50, 100)).toBe(false);
        expect(fateSlotRangesOverlap(100, 200, 50, 101)).toBe(true);
    });

    it('解析当天起止并限制 30—180 分钟', () => {
        const ok = resolveFateSlotTimes(shanghai, '2027-01-15', '10:00', '11:00');
        expect(ok.ok).toBe(true);
        if (!ok.ok) return;
        expect(ok.startTime).toBe('10:00');
        expect(ok.endTime).toBe('11:00');
        expect(ok.endsAt - ok.startsAt).toBe(60 * 60_000);

        expect(resolveFateSlotTimes(shanghai, '2027-01-15', '10:00', '10:20').ok).toBe(false);
        expect(resolveFateSlotTimes(shanghai, '2027-01-15', '10:00', '10:20')).toMatchObject({
            error: `活动时长需在 ${FATE_SLOT_MIN_MINUTES}—${FATE_SLOT_MAX_MINUTES} 分钟之间。`,
        });
        expect(resolveFateSlotTimes(shanghai, '2027-01-15', '10:00', '14:00')).toMatchObject({
            error: `活动时长需在 ${FATE_SLOT_MIN_MINUTES}—${FATE_SLOT_MAX_MINUTES} 分钟之间。`,
        });
        expect(resolveFateSlotTimes(shanghai, '2027-01-15', '12:00', '11:00')).toMatchObject({
            error: '结束时间必须晚于开始时间。',
        });
    });

    it('恰好 30 与 180 分钟可通过', () => {        const short = resolveFateSlotTimes(shanghai, '2027-01-15', '10:00', '10:30');
        const long = resolveFateSlotTimes(shanghai, '2027-01-15', '10:00', '13:00');
        expect(short.ok).toBe(true);
        expect(long.ok).toBe(true);
        if (short.ok) expect(short.endsAt - short.startsAt).toBe(FATE_SLOT_MIN_MINUTES * 60_000);
        if (long.ok) expect(long.endsAt - long.startsAt).toBe(FATE_SLOT_MAX_MINUTES * 60_000);
    });

    it('跨午夜的结束钟点落在次日，不再误判为结束早于开始', () => {
        const night = resolveFateSlotTimes(shanghai, '2027-01-15', '23:20', '02:20');
        expect(night.ok).toBe(true);
        if (night.ok) {
            expect(night.endsAt - night.startsAt).toBe(180 * 60_000);
            expect(night.startTime).toBe('23:20');
            expect(night.endTime).toBe('02:20');
            // 2027-01-16 02:20 Asia/Shanghai
            expect(new Date(night.endsAt).toISOString()).toBe('2027-01-15T18:20:00.000Z');
        }
        const shortNight = resolveFateSlotTimes(shanghai, '2027-01-15', '23:00', '00:30');
        expect(shortNight.ok).toBe(true);
        if (shortNight.ok) expect(shortNight.endsAt - shortNight.startsAt).toBe(90 * 60_000);
    });

    it('跨午夜但时长超出上限时仍报结束早于开始，不吃掉既有语义', () => {
        expect(resolveFateSlotTimes(shanghai, '2027-01-15', '23:20', '02:30')).toMatchObject({
            error: '结束时间必须晚于开始时间。',
        });
        expect(resolveFateSlotTimes(shanghai, '2027-01-15', '10:00', '10:00')).toMatchObject({
            error: '结束时间必须晚于开始时间。',
        });
    });

    it('与其他条目重叠时检出，跳过自身 index', () => {
        const slots = [
            { startsAt: 1000, endsAt: 2000 },
            { startsAt: 3000, endsAt: 4000 },
        ] as ScheduleSlot[];
        expect(fateSlotOverlapsOthers(slots, 1, 1500, 2500)).toBe(true);
        expect(fateSlotOverlapsOthers(slots, 0, 1000, 2000)).toBe(false);
        expect(fateSlotOverlapsOthers(slots, 1, 2000, 3000)).toBe(false);
    });
});
