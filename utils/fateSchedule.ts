import type { CharacterProfile, DailySchedule, ScheduleSlot, UserProfile, Message } from '../types';
import { ContextBuilder } from './context';
import { DB } from './db';
import { getDailyScheduleForChar, getRecentScheduleHistory } from './dailySchedule';
import { getScheduleDateKey, getScheduleWallClock } from './scheduleTime';
import { resolveCharTimeZone, wallClockToTimestamp } from './timezone';
import { loadFateSettings, type FateTendency } from './fateSettings';
import type { FateFactor } from './fateFactors';
import { buildHomeSchedulePrompt, parseHomePosition } from './homeSchedule';
import { extractContent, extractJson, safeResponseJson } from './safeApi';

/** 命运单段活动时长上下限（分钟），生成与手工编辑共用。 */
export const FATE_SLOT_MIN_MINUTES = 30;
export const FATE_SLOT_MAX_MINUTES = 180;

/** 接受 HH:MM 或 HH:MM:SS，规范成 HH:MM；非法返回 null。 */
export function normalizeFateClock(value: string): string | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 半开区间 [aStart, aEnd) 与 [bStart, bEnd) 是否重叠。 */
export function fateSlotRangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart < bEnd && bStart < aEnd;
}

export type ResolveFateSlotTimesResult =
    | { ok: true; startsAt: number; endsAt: number; startTime: string; endTime: string }
    | { ok: false; error: string };

/**
 * 把角色当地当天的开始/结束钟点换成真实时间戳。
 * 只允许落在 dateKey 这一天内；时长须在 FATE_SLOT_MIN/MAX 分钟之间。
 */
export function resolveFateSlotTimes(
    char: Pick<CharacterProfile, 'customTimezoneEnabled' | 'customTimezone'> | null | undefined,
    dateKey: string,
    startHHMM: string,
    endHHMM: string,
): ResolveFateSlotTimesResult {
    const startTime = normalizeFateClock(startHHMM);
    const endTime = normalizeFateClock(endHHMM);
    if (!startTime || !endTime) return { ok: false, error: '请填写有效的开始和结束时间。' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { ok: false, error: '日程日期无效，无法保存时间。' };
    const tz = resolveCharTimeZone(char);
    const startsAt = wallClockToTimestamp(`${dateKey} ${startTime}:00`, tz);
    const endsAt = wallClockToTimestamp(`${dateKey} ${endTime}:00`, tz);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { ok: false, error: '时间无法换算，请重试。' };
    if (endsAt <= startsAt) return { ok: false, error: '结束时间必须晚于开始时间。' };
    const minutes = Math.round((endsAt - startsAt) / 60_000);
    if (minutes < FATE_SLOT_MIN_MINUTES || minutes > FATE_SLOT_MAX_MINUTES) {
        return { ok: false, error: `活动时长需在 ${FATE_SLOT_MIN_MINUTES}—${FATE_SLOT_MAX_MINUTES} 分钟之间。` };
    }
    if (getScheduleDateKey(char, new Date(startsAt)) !== dateKey || getScheduleDateKey(char, new Date(endsAt)) !== dateKey) {
        return { ok: false, error: '只能修改当天内的时间，不能跨天。' };
    }
    return { ok: true, startsAt, endsAt, startTime, endTime };
}

/** 新起止是否与同表其他条目（半开区间）重叠；index 为正在编辑的那条。 */
export function fateSlotOverlapsOthers(slots: ScheduleSlot[], index: number, startsAt: number, endsAt: number): boolean {
    return slots.some((slot, i) => {
        if (i === index) return false;
        if (typeof slot.startsAt !== 'number' || typeof slot.endsAt !== 'number') return false;
        return fateSlotRangesOverlap(startsAt, endsAt, slot.startsAt, slot.endsAt);
    });
}

type PeopleDirection = 'free' | 'familiar' | 'new' | 'alone';
export function drawPeopleDirection(random = Math.random): PeopleDirection {
    const n = random();
    return n < .45 ? 'free' : n < .70 ? 'familiar' : n < .90 ? 'new' : 'alone';
}
export const PEOPLE_DIRECTION_LABELS: Record<PeopleDirection, string> = { free: '无要求', familiar: '熟人', new: '新接触', alone: '独处' };
export function buildPeopleDirectionPrompt(direction: PeopleDirection): string {
    const instruction: Record<PeopleDirection, string> = {
        free: '人物参与由事件自然决定，可以有人，也可以独处；不为了安排人物而改变事件。',
        familiar: '优先考虑角色身份和当前事件中合理存在的熟人。熟人不必已经出现在聊天材料里，例如工位旁的同事、同行或邻居；只在事件需要时补姓名、关系和本次表现，不先造人再安排见面。',
        new: '只有事件提供合理机会时才安排新接触；根据本次实际互动补出对方的必要身份与表现，不自动发展成朋友，也不为了认识新人而改变事件。',
        alone: '本轮重点放在角色自己的活动，不主动发展人际互动。公共场所仍可有其他人，必要的服务交流不算人际支线。',
    };
    return `本轮人物参与方向：${PEOPLE_DIRECTION_LABELS[direction]}。${instruction[direction]}`;
}
export function hasActiveFateSlot(schedule: DailySchedule | null, at = Date.now()): boolean {
    return !!schedule?.slots.some(slot => typeof slot.startsAt === 'number' && typeof slot.endsAt === 'number' && slot.startsAt <= at && at < slot.endsAt);
}
export function countFateFactors(history: DailySchedule[], date: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const schedule of history) {
        const draws = schedule.fateDraws || schedule.slots.filter(s => s.fate).map(s => ({ date: s.fate!.usageDate, factorIds: s.fate!.factors.map(f => f.id) }));
        for (const draw of draws) if (draw.date === date) for (const id of draw.factorIds) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
}
export function sampleFateFactors(factors: FateFactor[], counts: Map<string, number>, random = Math.random): FateFactor[] {
    const pool = factors.filter(f => (counts.get(f.id) || 0) < 2);
    const picked: FateFactor[] = [];
    while (pool.length && picked.length < 3) picked.push(pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0]);
    return picked;
}
interface FateDraw { date: string; tendency: FateTendency; factors: FateFactor[]; people: PeopleDirection }
const pendingDraws = new Map<string, FateDraw>();
export function clearPendingFateDraw(charId: string): void { pendingDraws.delete(charId); }

/** 重 Roll 始终针对发起时选中的一轮，而不是请求结束时随时间变化的当前轮。 */
export function getFateRerollTarget(schedule: DailySchedule | null, at: number): ScheduleSlot | undefined {
    const slots = schedule?.slots || [];
    return slots.find(s => typeof s.startsAt === 'number' && typeof s.endsAt === 'number' && s.startsAt <= at && at < s.endsAt)
        || slots.filter(s => typeof s.startsAt === 'number' && s.startsAt <= at).slice(-1)[0];
}
export function omitRerolledFateSlot(history: DailySchedule[], target?: ScheduleSlot): DailySchedule[] {
    if (!target) return history;
    return history.map(day => ({ ...day, slots: day.slots.filter(slot => slot.startsAt !== target.startsAt) }));
}
export function validateFateDescription(description: string): void {
    if (Array.from(description).length > 120) throw new Error('日程描述超过120字，未替换本轮；请重试，当前日程已保留。');
}

export function buildFateTask(char: CharacterProfile, draw: FateDraw, history: DailySchedule[], chat: string, now: Date, reroll = false): string {
    const recent = history.map(day => ({ date: day.date, activities: day.slots.map(s => ({ startTime: s.startTime, endTime: s.endTime, startsAt: s.startsAt, endsAt: s.endsAt, activity: s.activity, location: s.location, description: s.description, kind: s.fate?.activityKind, scene: s.fate?.sceneKind, development: s.fate?.development })) }));
    return `你是命运之神，负责续写角色生活，不是角色本人。人物设定、世界书、记忆是创作资料；本次输出任务是日程，不是代角色回复聊天。
${reroll ? '本次是重 Roll：重新设计本轮活动，不是往后续写。被替换的日程已从活动材料中排除，不视为发生过；保留聊天明确确定的事实及更早日程。从当前处境重新创作，成功结果替换本轮。' : '本次是到期续写或首次生成：承接已知处境，从当前时刻展开一轮新的活动。'}
角色：${char.name}。角色当地日期：${draw.date}，现在 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}。
${chat}
最近七天与今天实际保存的日程（缺失不代表角色没有生活；安排不是所有活动都已完成的证明）：
 ${JSON.stringify(recent)}

先从人物设定、世界书、记忆、实际聊天和已保存日程中辨认仍在持续的长期目标与已经确认的约定，再构思本轮活动。备考、学习、创作、工作项目、训练、康复、筹备和与用户共同计划等都可考虑，这些不是全部。结合已知目标的阶段、已有进度、截止时间和下一步需要投入的时间，让适合当前时段的活动自然推进目标，同时保留休息、饮食、人际与其他正常生活。与用户明确约好的时间和事项优先留出空间；用户或角色已经更改、完成、取消的计划按最新事实处理。随口提及的愿望不当作双方已经确认的约定，缺少的考试日期、目标进度和承诺不自行编造。长期目标作为生活的连续依据，不要求每轮都安排同一目标，也不要求在短描述里重复解释计划。

先把角色今天已经发生的活动连成一条连续生活，再决定本轮活动。结合每项活动的起止时间、地点、事情进度、往返路程和身体状态，判断角色现在实际能做什么。已经结束的日程只证明记录中明确发生的内容；尚未结束的安排不当作已经完成。
涉及外勤、旅行、赴约、运动、家务或其他占用时间精力的活动时，把当天已经投入的时间、必要往返和后续已有约定一起考虑；这些不是全部。一天里再次安排同类活动，需要符合角色身份、确切动机、剩余时间和体力；时间不足时，合理延续手头事情、就近活动、休息或处理后续。准备、路程和收尾只在实际影响可行性时纳入判断，不必逐项写进描述。
命运因子影响现实生活中的细节、阻碍、机会和感受，活动安排以角色当天实际可行的生活为准。正常的工作延续、休息和重复作息同样可以承载命运变化。

本轮牌阵倾向：${draw.tendency.name}，${draw.tendency.meaning}
主因子：${draw.factors[0].name}——${draw.factors[0].meaning}
副因子一：${draw.factors[1].name}——${draw.factors[1].meaning}
副因子二：${draw.factors[2].name}——${draw.factors[2].meaning}
主因子决定整体走向，两副因子提供条件与变化，三个因子共同影响一件事，不是三项任务。把开放含义结合处境解释，内容里体现组合，不机械抄牌名。

创作顺序：先根据当前处境、牌阵与近期生活决定事件和具体地点，再按照本轮抽中的人物方向处理事件里自然涉及的人物，最后检查因果、时间、空间与近期重复。人物方向不能反过来强行改变事件。
${buildPeopleDirectionPrompt(draw.people)}
人物只按事件实际需要补全。比如中学宣讲可以出现接待老师、同行同事或提问学生；不参与事件的人不用补写，不给无关人群逐一取名。不建立人物档案；姓名、身份、关系与本次表现直接写进活动描述，已有材料中的事实保持一致。

活动范围尽可能全面：工作、求索、玩乐、运动、休息、饮食、文化、出行、办事、公共空间、自然环境、恋爱亲密、临时起意等都可出现；这些不是全部。地点具体，不默认职业只对应办公室、下班只对应超市。换地点要有动机并符合时间、距离、预算、营业时间和身体状态；未知资料不装作掌握精确事实。允许摸鱼、放空和正常重复的作息，不强制每天新地点。
检查最近几天的活动、地点、事件发展和顺序，避免连续复用下班采购游戏睡觉、偶遇熟人得到灵感等模板；换词或换人名不算变化。现有约定、用户编辑和已经发生的事实优先；睡觉、工作、旅行可合理延续，不每轮强换事件。
重大变化须有资料支持；不足就缩小影响或换一种表现。受伤也可理解为尴尬或情感打击，失去不必失业。死亡事件排除。
恋爱、暧昧、吸引、欲望与亲密可自然存在，不把生活写成只有健康工作；涉及亲密的内容仅限明确成年的双方自愿关系，以非露骨的感受、氛围、亲昵和关系变化表现，不代替用户决定或实施行为。
${char.scheduleStyle === 'mindful' ? '此角色使用意识系：尊重角色自述的存在形态，不虚构不具备的身体与物理能力，生活变化可以是思绪与真实交流的发展。' : ''}

输出前核对当天活动的前后衔接，确认角色有时间到达、有时间完成，工作安排与身份相符，再输出本轮日程。从现在开始设计一项活动，覆盖未来30—180分钟，由你选合理时长。不补过去，不排全天。
日程描述是简短的场景提要，用朴实、直接的第三人称写1—2个短句，目标30—60字，最多80字。只交代活动和进入活动的一处变化，让读者知道在哪、做什么、有什么不同。人物按需要点明姓名或身份，具体地点单独填写。描述保留尚可发展的空间，动作演出、完整对话、感官描摹、内心分析、后续选择与结局留给进一步查看和聊天。
三个因子共同影响活动构思，不要求短描述逐个解释或逐个制造转折；组合如何作用写在rationale里，用一句面向用户的设计说明，最多100字，不写内心推理。活动服务于角色自己的生活，用户相关内容只在已知关系和当前情境适合时自然出现。
仅输出JSON：{"durationMinutes":30到180的整数,"activity":"具体活动名","description":"一小段正在展开的生活","location":"具体地点","emoji":"一个表情","homePosition":{"kind":"home","roomId":"所列真实房间ID"}或{"kind":"away"},"rationale":"简短说明因子组合怎样符合处境，不输出内心推理","activityKind":"活动类别","sceneKind":"场景类别","development":"事件发展类型"}。
${buildHomeSchedulePrompt(char).replace(/每个 slots 项/g, '输出对象').replace(/每条日程/g, '本轮日程')}`;
}

export async function generateFateSchedule(
    char: CharacterProfile, user: UserProfile,
    mainApi: { baseUrl: string; apiKey: string; model: string },
    chat: string, messages: Message[], force = false,
): Promise<DailySchedule | null> {
    const at = new Date();
    const existing = await getDailyScheduleForChar(char, at);
    if (!force && hasActiveFateSlot(existing, at.getTime())) return existing;
    const date = getScheduleDateKey(char, at);
    const rerollTarget = force ? getFateRerollTarget(existing, at.getTime()) : undefined;
    const history = await getRecentScheduleHistory(char, at);
    const settings = loadFateSettings(char.id);
    let draw = pendingDraws.get(char.id);
    if (force || draw?.date !== date) draw = undefined;
    if (!draw) {
        const tendencies = settings.tendencies.filter(t => !settings.disabledTendencyIds.includes(t.id));
        const factors = sampleFateFactors(settings.factors.filter(f => !settings.disabledFactorIds.includes(f.id)), countFateFactors(history, date));
        if (!tendencies.length) throw new Error('没有可用的命运倾向，请在命运牌阵设置中启用至少一种倾向。');
        if (factors.length < 3) throw new Error('今天可用的命运因子不足三个，请增加或启用因子；每天最多使用两次的限制保持不变。');
        draw = { date, tendency: tendencies[Math.floor(Math.random() * tendencies.length)], factors, people: drawPeopleDirection() };
        pendingDraws.set(char.id, draw);
    }
    const api = char.scheduleApi?.baseUrl ? char.scheduleApi : mainApi;
    if (!api.baseUrl || !api.model) throw new Error('请先填写日程模型，或在总设置填写主模型。');
    const prompt = buildFateTask(char, draw, omitRerolledFateSlot(history, rerollTarget), chat, getScheduleWallClock(char, at), force);
    const request = await ContextBuilder.buildCharacterRequest({ char: { ...char, scheduleFeatureEnabled: false }, user, includeDetailedMemories: true, timeOptions: { worldbookMessages: messages } }, [{ role: 'user', content: prompt }]);
    const response = await fetch(`${api.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
        body: JSON.stringify({ model: api.model, messages: request, temperature: .95, max_tokens: 8000 }),
        __sullyMeta: { appName: '日程系统', charId: char.id, charName: char.name, purpose: '命运牌阵日程' },
    } as RequestInit);
    if (!response.ok) throw new Error(`命运牌阵生成失败（${response.status}），原日程已保留。`);
    const data = extractJson(extractContent(await safeResponseJson(response)));
    const duration = data?.durationMinutes;
    if (!Number.isInteger(duration) || duration < FATE_SLOT_MIN_MINUTES || duration > FATE_SLOT_MAX_MINUTES || typeof data.activity !== 'string' || !data.activity.trim() || typeof data.description !== 'string' || !data.description.trim() || typeof data.location !== 'string' || !data.location.trim()) throw new Error('日程内容或时长不完整，未保存；重试会沿用本轮抽牌。');
    validateFateDescription(data.description.trim());
    const homePosition = parseHomePosition(data.homePosition, char);
    // 与普通日程一致：有家园名单但模型没给出有效房间时照常保存，位置留空，不丢整轮。
    // 请求期间用户编辑过的日程以最新版本为准，不把传入快照整份覆盖回去。
    const latest = await getDailyScheduleForChar(char);
    const now = Date.now();
    if (getScheduleDateKey(char, new Date(now)) !== date) throw new Error('生成期间角色当地已经跨天，请重试生成当前日程。');
    if (!force && hasActiveFateSlot(latest, now)) return latest;
    if (rerollTarget) {
        const liveTarget = latest?.slots.find(s => s.startsAt === rerollTarget.startsAt);
        if (!liveTarget || JSON.stringify(liveTarget) !== JSON.stringify(rerollTarget)) throw new Error('生成期间本轮日程已被编辑或删除，未覆盖修改，请重新重 Roll。');
    }
    const end = now + duration * 60_000;
    const clock = (stamp: number) => { const wall = getScheduleWallClock(char, new Date(stamp)); return `${String(wall.getHours()).padStart(2, '0')}:${String(wall.getMinutes()).padStart(2, '0')}`; };
    const slot: ScheduleSlot = {
        startTime: clock(now), endTime: clock(end), startsAt: now, endsAt: end,
        activity: data.activity.trim(), description: data.description.trim(), location: data.location.trim(),
        emoji: typeof data.emoji === 'string' ? data.emoji : undefined, homePosition,
        fate: { tendency: draw.tendency, factors: draw.factors, peopleDirection: draw.people, rationale: typeof data.rationale === 'string' ? data.rationale : '', activityKind: String(data.activityKind || data.activity), sceneKind: String(data.sceneKind || data.location), development: String(data.development || ''), usageDate: date },
    };
    const base = latest || existing;
    const slots = (base?.slots || []).filter(s => !rerollTarget || s.startsAt !== rerollTarget.startsAt);
    const schedule: DailySchedule = {
        id: `fate:${char.id}_${date}`, charId: char.id, date, mode: 'fate', generatedAt: now,
        slots: [...slots, slot].sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0)),
        coverImage: base?.coverImage,
        fateReplacedStarts: Array.from(new Set([...(base?.fateReplacedStarts || []), ...(rerollTarget?.startsAt !== undefined ? [rerollTarget.startsAt] : [])])),
        fateDraws: [...(base?.fateDraws || []).filter(d => d.date === date), { date, factorIds: draw.factors.map(f => f.id) }],
    };
    await DB.saveDailySchedule(schedule);
    pendingDraws.delete(char.id);
    window.dispatchEvent(new CustomEvent('fate-schedule-updated', { detail: { charId: char.id } }));
    return schedule;
}
