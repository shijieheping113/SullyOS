import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, DailySchedule, Message, ScheduleSlot, UserProfile } from '../types';
import { clearPendingFateDraw, generateFateSchedule } from './fateSchedule';

const mocks = vi.hoisted(() => ({
    save: vi.fn(),
    daily: vi.fn(),
    history: vi.fn(),
    buildRequest: vi.fn(),
    settings: vi.fn(),
}));

vi.mock('./db', () => ({ DB: { saveDailySchedule: mocks.save } }));
vi.mock('./dailySchedule', () => ({
    getDailyScheduleForChar: mocks.daily,
    getRecentScheduleHistory: mocks.history,
}));
vi.mock('./context', () => ({ ContextBuilder: { buildCharacterRequest: mocks.buildRequest } }));
vi.mock('./fateSettings', () => ({ loadFateSettings: mocks.settings }));

const NOW = Date.parse('2026-11-04T12:00:00Z');
const MINUTE = 60_000;
const char = {
    id: 'fate-reroll-integration', name: '测试角色',
    customTimezoneEnabled: true, customTimezone: 'UTC',
} as CharacterProfile;
const user: UserProfile = { name: '测试用户', avatar: '', bio: '' };
const api = { baseUrl: 'https://model.invalid/v1/', apiKey: 'fake-test-key', model: 'fake-model' };
const chat = '真实聊天：用户明确说周六一起去天文馆。';
const messages: Message[] = [{ id: 1, charId: char.id, role: 'user', type: 'text', content: '周六一起去天文馆。', timestamp: NOW - MINUTE }];

function slot(activity: string, description: string, startsAt: number, endsAt: number): ScheduleSlot {
    return { activity, description, startsAt, endsAt, startTime: '10:00', endTime: '13:00', location: `${activity}地点` };
}

function day(date: string, slots: ScheduleSlot[]): DailySchedule {
    return { id: `fate:${char.id}_${date}`, charId: char.id, date, mode: 'fate', generatedAt: NOW - MINUTE, slots };
}

function completion(activity = '新活动乙', description = '新描述乙：在植物园整理观察记录。'): Response {
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        durationMinutes: 90, activity, description, location: '植物园',
        emoji: '🌿', homePosition: { kind: 'away' }, rationale: '结合现有安排展开新的活动。',
    }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('generateFateSchedule 重 Roll 请求与保存', () => {
    let stored: DailySchedule;
    let previous: DailySchedule;
    let fetchMock: ReturnType<typeof vi.fn>;
    let dispatch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        clearPendingFateDraw(char.id);
        stored = day('2026-11-04', [
            slot('更早活动：整理书架', '更早描述：把旧书登记在册。', NOW - 180 * MINUTE, NOW - 60 * MINUTE),
            slot('待替换活动甲：修理收音机', '待替换描述甲：在维修台拆开收音机。', NOW - 30 * MINUTE, NOW + 30 * MINUTE),
        ]);
        previous = day('2026-11-03', [slot('昨天活动：河边散步', '昨天描述：沿河走到旧桥。', NOW - 1440 * MINUTE, NOW - 1380 * MINUTE)]);
        mocks.daily.mockImplementation(async () => structuredClone(stored));
        mocks.history.mockImplementation(async () => structuredClone([previous, stored]));
        mocks.save.mockImplementation(async (schedule: DailySchedule) => { stored = structuredClone(schedule); });
        mocks.settings.mockReturnValue({
            tendencies: [{ id: 'steady', name: '平稳', meaning: '自然展开' }],
            factors: Array.from({ length: 12 }, (_, i) => ({ id: `factor-${i}`, name: `因子${i}`, meaning: '顺应当前生活' })),
            disabledTendencyIds: [], disabledFactorIds: [],
        });
        mocks.buildRequest.mockImplementation(async (_options, tasks) => [
            { role: 'system', content: '角色设定与世界书测试材料' }, ...tasks,
        ]);
        fetchMock = vi.fn().mockImplementation(async () => completion());
        dispatch = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('window', { dispatchEvent: dispatch });
        vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
        clearPendingFateDraw(char.id);
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function request(index = 0): { max_tokens: number; model: string; messages: { role: string; content: string }[] } {
        return JSON.parse(fetchMock.mock.calls[index][1].body);
    }

    function sentText(index = 0): string {
        return JSON.stringify(request(index).messages);
    }

    function generate(force = true) {
        return generateFateSchedule(char, user, api, chat, messages, force);
    }

    it('重 Roll 实际请求排除本轮活动、描述和地点，保留更早日程与真实聊天，输出上限为8000', async () => {
        const target = structuredClone(stored.slots[1]);
        await generate();

        const text = sentText();
        expect(text).not.toContain(target.activity);
        expect(text).not.toContain(target.description!);
        expect(text).not.toContain(target.location);
        expect(text).toContain('更早活动：整理书架');
        expect(text).toContain('更早描述：把旧书登记在册。');
        expect(text).toContain('昨天活动：河边散步');
        expect(text).toContain(chat);
        expect(text).toContain('本次是重 Roll：重新设计本轮活动，不是往后续写');
        expect(request()).toMatchObject({ max_tokens: 8000, model: api.model });
        expect(fetchMock.mock.calls[0][0]).toBe('https://model.invalid/v1/chat/completions');
        expect(mocks.buildRequest.mock.calls[0][0]).toMatchObject({
            char: { scheduleFeatureEnabled: false },
            includeDetailedMemories: true,
            timeOptions: { worldbookMessages: messages },
        });
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('连续三次重 Roll 每次排除正在被替换的活动，总数保持且更早活动不变', async () => {
        const earlier = structuredClone(stored.slots[0]);
        const rejected: ScheduleSlot[] = [];
        for (let i = 0; i < 3; i++) {
            rejected.push(structuredClone(stored.slots[1]));
            fetchMock.mockResolvedValueOnce(completion(`重抽结果${i}`, `重抽描述${i}：在展馆查看新展品。`));
            vi.setSystemTime(NOW + i * MINUTE);
            const result = await generate();

            for (const target of rejected) {
                expect(sentText(i)).not.toContain(target.activity);
                expect(sentText(i)).not.toContain(target.description!);
            }
            expect(sentText(i)).toContain(earlier.activity);
            expect(sentText(i)).toContain(chat);
            expect(request(i).max_tokens).toBe(8000);
            expect(result?.slots).toHaveLength(2);
            expect(stored.slots[0]).toEqual(earlier);
            expect(stored.slots[1].activity).toBe(`重抽结果${i}`);
        }
        expect(mocks.save).toHaveBeenCalledTimes(3);
    });

    it('正常到期续写保留全部过去活动，请求包含过去活动并只新增一条', async () => {
        vi.setSystemTime(NOW + 31 * MINUTE);
        const original = structuredClone(stored.slots);
        const result = await generate(false);

        expect(sentText()).toContain('本次是到期续写或首次生成');
        for (const activity of original) {
            expect(sentText()).toContain(activity.activity);
            expect(sentText()).toContain(activity.description!);
        }
        expect(result?.slots).toHaveLength(original.length + 1);
        expect(stored.slots.slice(0, original.length)).toEqual(original);
        expect(mocks.save).toHaveBeenCalledTimes(1);
    });
    it('不查看小剧场连续到期续写，所有已生成活动都直接保存在当天日程', async () => {
        expect(stored.slots.every(s => !s.theater)).toBe(true);
        const original = structuredClone(stored.slots);
        vi.setSystemTime(NOW + 31 * MINUTE);
        await generate(false);
        vi.setSystemTime(NOW + 122 * MINUTE);
        await generate(false);
        expect(stored.slots).toHaveLength(original.length + 2);
        expect(stored.slots.slice(0, original.length)).toEqual(original);
        expect(stored.slots.every(s => !s.theater)).toBe(true);
        expect(mocks.save).toHaveBeenCalledTimes(2);
    });

    it('非强制请求遇到正在进行的日程直接返回，不请求模型也不保存', async () => {
        const original = structuredClone(stored);
        await expect(generate(false)).resolves.toEqual(original);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.save).not.toHaveBeenCalled();
        expect(stored).toEqual(original);
    });

    it('HTTP失败保留整份日程，不保存也不发送更新通知', async () => {
        const original = structuredClone(stored);
        fetchMock.mockResolvedValueOnce(new Response('服务暂不可用', { status: 503 }));
        await expect(generate()).rejects.toThrow('命运牌阵生成失败（503）');
        expect(mocks.save).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
        expect(stored).toEqual(original);
    });

    it('121字描述拒绝整次生成，日程不变且不保存', async () => {
        const original = structuredClone(stored);
        fetchMock.mockResolvedValueOnce(completion('超长结果', '字'.repeat(121)));
        await expect(generate()).rejects.toThrow('日程描述超过120字');
        expect(mocks.save).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
        expect(stored).toEqual(original);
    });

    it('恰好120个字符的描述完整保存，表情按一个字符计算', async () => {
        const description = '字'.repeat(119) + '🌿';
        fetchMock.mockResolvedValueOnce(completion('长度合格结果', description));
        await generate();
        expect(stored.slots[1].description).toBe(description);
        expect(mocks.save).toHaveBeenCalledTimes(1);
    });

    it('有家园名单但模型没给有效房间时照常保存，位置留空', async () => {
        const homeChar = { ...char, homeDefinition: { kind: 'real', notes: '' }, home3D: { rooms: [{ id: 'bedroom', name: '卧室', level: 0 }] } } as CharacterProfile;
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
            durationMinutes: 90, activity: '回家补觉', description: '他回到卧室，把窗帘拉上，倒头睡了一会儿。', location: '卧室',
            emoji: '🌿', homePosition: { kind: 'home', roomId: '不存在的房间' }, rationale: '结合现有安排展开新的活动。',
        }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
        await generateFateSchedule(homeChar, user, api, chat, messages, true);
        expect(mocks.save).toHaveBeenCalledTimes(1);
        expect(stored.slots[1]).toMatchObject({ activity: '回家补觉', location: '卧室', homePosition: undefined });
    });

    it('生成期间用户编辑目标活动则拒绝覆盖，保留用户填写的内容', async () => {
        fetchMock.mockImplementationOnce(async () => {
            stored.slots[1].description = '用户亲自编辑：今天改去图书馆。';
            return completion();
        });
        await expect(generate()).rejects.toThrow('生成期间本轮日程已被编辑或删除');
        expect(stored.slots[1].description).toBe('用户亲自编辑：今天改去图书馆。');
        expect(stored.slots).toHaveLength(2);
        expect(mocks.save).not.toHaveBeenCalled();
    });

    it('目标结束后模型才返回仍替换发起时的目标，不误删后来开始的活动', async () => {
        const target = structuredClone(stored.slots[1]);
        const next = slot('后来活动：参加讲座', '后来描述：在报告厅等待开场。', NOW + 35 * MINUTE, NOW + 120 * MINUTE);
        stored.slots.push(next);
        fetchMock.mockImplementationOnce(async () => {
            vi.setSystemTime(NOW + 40 * MINUTE);
            return completion();
        });
        await generate();
        expect(stored.slots).toHaveLength(3);
        expect(stored.slots.some(s => s.startsAt === target.startsAt)).toBe(false);
        expect(stored.slots).toContainEqual(next);
        expect(stored.slots.find(s => s.activity === '新活动乙')?.startsAt).toBe(NOW + 40 * MINUTE);
        expect(mocks.save).toHaveBeenCalledTimes(1);
    });

    it('生成期间角色当地跨天则拒绝保存，原日程完整保留', async () => {
        const original = structuredClone(stored);
        fetchMock.mockImplementationOnce(async () => {
            vi.setSystemTime(Date.parse('2026-11-05T00:01:00Z'));
            return completion();
        });
        await expect(generate()).rejects.toThrow('生成期间角色当地已经跨天');
        expect(mocks.save).not.toHaveBeenCalled();
        expect(stored).toEqual(original);
    });
});
