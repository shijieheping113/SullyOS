import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, DailySchedule, UserProfile } from '../types';
vi.mock('./context', () => ({ ContextBuilder: { buildCharacterRequest: vi.fn(async () => []) } }));
vi.mock('./db', () => ({ DB: { saveDailySchedule: vi.fn() } }));
vi.mock('./dailySchedule', () => ({ getDailyScheduleForChar: vi.fn() }));
import { DB } from './db';
import { getDailyScheduleForChar } from './dailySchedule';
import { generateSlotTheater } from './theaterGenerator';

describe('命运日程的小剧场保存不覆盖续写或编辑', () => {
    const char = { id: 'test', name: '测试角色', scheduleFeatureEnabled: true, scheduleMode: 'fate' } as CharacterProfile;
    const base = () => ({ id: 'fate:test_date', charId: 'test', date: '2026-11-04', generatedAt: 1000, mode: 'fate', slots: [{ startTime: '10:00', startsAt: 1000, endsAt: 2000, activity: '整理资料', description: '整理宣讲材料。', location: '资料室' }] }) as DailySchedule;
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '[🙂] 他翻开资料。' } }] }), { status: 200 })));
    });
    afterEach(() => vi.unstubAllGlobals());
    it('读取最新日程，只合入对应活动的小剧场，保留新生成的一轮', async () => {
        const old = base();
        const latest = { ...old, slots: [...old.slots, { startTime: '11:00', startsAt: 2000, endsAt: 3000, activity: '去宣讲' }] };
        vi.mocked(getDailyScheduleForChar).mockResolvedValue(latest);
        const result = await generateSlotTheater(char, { name: '用户' } as UserProfile, old, 0, { baseUrl: 'https://example.invalid', apiKey: '', model: 'mock' });
        expect(result?.slots).toHaveLength(2);
        expect(result?.slots[0].theater?.lines[0].text).toBe('他翻开资料。');
        expect(result?.slots[1].activity).toBe('去宣讲');
        expect(DB.saveDailySchedule).toHaveBeenCalledTimes(1);
    });
    it('原活动已被重 Roll 或编辑时，不保存失去对应活动的小剧场', async () => {
        const old = base();
        vi.mocked(getDailyScheduleForChar).mockResolvedValue({ ...old, slots: [{ ...old.slots[0], description: '用户已经改了活动内容。' }] });
        expect(await generateSlotTheater(char, { name: '用户' } as UserProfile, old, 0, { baseUrl: 'https://example.invalid', apiKey: '', model: 'mock' })).toBeNull();
        expect(DB.saveDailySchedule).not.toHaveBeenCalled();
    });
});
