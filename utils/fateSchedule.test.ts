import { describe, expect, it } from 'vitest';
import { BUILTIN_FATE_FACTORS } from './fateFactors';
import { buildPeopleDirectionPrompt, countFateFactors, drawPeopleDirection, hasActiveFateSlot, sampleFateFactors } from './fateSchedule';
import { getScheduleMode, isEmotionFeatureOn, isScheduleFeatureOn } from './scheduleFeature';
import type { DailySchedule } from '../types';

describe('命运牌阵抽取与分时段判断', () => {
    it('人物方向按 45/25/20/10 的边界抽取', () => {
        expect(drawPeopleDirection(() => 0)).toBe('free');
        expect(drawPeopleDirection(() => .4499)).toBe('free');
        expect(drawPeopleDirection(() => .45)).toBe('familiar');
        expect(drawPeopleDirection(() => .70)).toBe('new');
        expect(drawPeopleDirection(() => .90)).toBe('alone');
    });

    it('人物方向提示词每次只包含本轮抽中的一种，且熟人可以是材料里未出现的人', () => {
        const rows = [
            ['free', '无要求', '不为了安排人物而改变事件'],
            ['familiar', '熟人', '工位旁的同事'],
            ['new', '新接触', '不自动发展成朋友'],
            ['alone', '独处', '不主动发展人际互动'],
        ] as const;
        for (const [direction, label, ownText] of rows) {
            const prompt = buildPeopleDirectionPrompt(direction);
            expect(prompt).toContain(`本轮人物参与方向：${label}。`);
            expect(prompt).toContain(ownText);
            for (const [, otherLabel] of rows) {
                if (otherLabel !== label) expect(prompt).not.toContain(`方向：${otherLabel}。`);
            }
        }
    });

    it('只抽未停用且当天未达到两次的三个不同因子', () => {
        const factors = BUILTIN_FATE_FACTORS.slice(0, 5);
        const chosen = sampleFateFactors(factors, new Map([[factors[0].id, 2], [factors[1].id, 1]]), () => 0);
        expect(chosen).toHaveLength(3);
        expect(new Set(chosen.map(item => item.id)).size).toBe(3);
        expect(chosen.some(item => item.id === factors[0].id)).toBe(false);
    });

    it('只统计角色当地当天的已保存抽牌', () => {
        const schedules = [{ fateDraws: [
            { date: '2026-11-04', factorIds: ['a', 'b', 'c'] },
            { date: '2026-11-03', factorIds: ['a'] },
        ] }, { slots: [{ fate: { usageDate: '2026-11-04', factors: [{ id: 'a' }] } }] }] as unknown as DailySchedule[];
        const counts = countFateFactors(schedules, '2026-11-04');
        expect(counts.get('a')).toBe(2);
        expect(counts.get('b')).toBe(1);
        expect(counts.has('c')).toBe(true);
    });

    it('分时段只在开始与结束时刻之间有效', () => {
        const schedule = { mode: 'fate', slots: [{ startsAt: 1000, endsAt: 2000 }] } as DailySchedule;
        expect(hasActiveFateSlot(schedule, 1000)).toBe(true);
        expect(hasActiveFateSlot(schedule, 1999)).toBe(true);
        expect(hasActiveFateSlot(schedule, 2000)).toBe(false);
    });

    it('日程、情绪、模式的默认值互不绑定', () => {
        expect(isScheduleFeatureOn({ scheduleFeatureEnabled: true })).toBe(true);
        expect(isScheduleFeatureOn({ scheduleFeatureEnabled: false, scheduleStyle: 'lifestyle' })).toBe(false);
        expect(isEmotionFeatureOn({ emotionFeatureEnabled: true })).toBe(true);
        expect(isEmotionFeatureOn({ emotionFeatureEnabled: false, emotionConfig: { enabled: true } })).toBe(false);
        expect(getScheduleMode({ scheduleMode: 'fate' })).toBe('fate');
        expect(getScheduleMode({ scheduleMode: undefined })).toBe('classic');
    });
});
