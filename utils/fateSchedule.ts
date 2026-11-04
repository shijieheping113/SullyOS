import type { CharacterProfile, DailySchedule, ScheduleSlot, UserProfile, Message } from '../types';
import { ContextBuilder } from './context';
import { DB } from './db';
import { getDailyScheduleForChar, getRecentScheduleHistory } from './dailySchedule';
import { getScheduleDateKey, getScheduleWallClock } from './scheduleTime';
import { loadFateSettings, type FateTendency } from './fateSettings';
import type { FateFactor } from './fateFactors';
import { buildHomeSchedulePrompt, parseHomePosition } from './homeSchedule';
import { extractContent, extractJson, safeResponseJson } from './safeApi';

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

export function buildFateTask(char: CharacterProfile, draw: FateDraw, history: DailySchedule[], chat: string, now: Date): string {
    const recent = history.map(day => ({ date: day.date, activities: day.slots.map(s => ({ time: s.startTime, activity: s.activity, location: s.location, description: s.description, kind: s.fate?.activityKind, scene: s.fate?.sceneKind, development: s.fate?.development })) }));
    return `你是命运之神，负责续写角色生活，不是角色本人。人物设定、世界书、记忆是创作资料；本次输出任务是日程，不是代角色回复聊天。
角色：${char.name}。角色当地日期：${draw.date}，现在 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}。
${chat}
最近七天与今天实际保存的日程（缺失不代表角色没有生活；安排不是所有活动都已完成的证明）：
${JSON.stringify(recent)}

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

从现在开始写一项正在展开的生活片段，覆盖未来60—180分钟，由你选合理时长。不补过去，不排全天。描述2—3句，交代具体动作、场景、进入活动的变化和当前进展；有具体质感和所有因子的作用，但把角色完整内心、后续选择和最终结局留给聊天与进一步查看。不要提前声称未来结果已经完成，不写完整小故事，不要求围绕用户，不强迫联系用户。
仅输出JSON：{"durationMinutes":60到180的整数,"activity":"具体活动名","description":"一小段正在展开的生活","location":"具体地点","emoji":"一个表情","homePosition":{"kind":"home","roomId":"所列真实房间ID"}或{"kind":"away"},"rationale":"简短说明因子组合怎样符合处境，不输出内心推理","activityKind":"活动类别","sceneKind":"场景类别","development":"事件发展类型"}。
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
    const prompt = buildFateTask(char, draw, history, chat, getScheduleWallClock(char, at));
    const request = await ContextBuilder.buildCharacterRequest({ char: { ...char, scheduleFeatureEnabled: false }, user, includeDetailedMemories: true, timeOptions: { worldbookMessages: messages } }, [{ role: 'user', content: prompt }]);
    const response = await fetch(`${api.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
        body: JSON.stringify({ model: api.model, messages: request, temperature: .95, max_tokens: 8000 }),
        __sullyMeta: { appName: '日程系统', charId: char.id, charName: char.name, purpose: '命运牌阵日程' },
    } as RequestInit);
    if (!response.ok) throw new Error(`命运牌阵生成失败（${response.status}），原日程已保留。`);
    const data = extractJson(extractContent(await safeResponseJson(response)));
    const duration = data?.durationMinutes;
    if (!Number.isInteger(duration) || duration < 60 || duration > 180 || typeof data.activity !== 'string' || !data.activity.trim() || typeof data.description !== 'string' || !data.description.trim() || typeof data.location !== 'string' || !data.location.trim()) throw new Error('日程内容或时长不完整，未保存；重试会沿用本轮抽牌。');
    const homePosition = parseHomePosition(data.homePosition, char);
    if (buildHomeSchedulePrompt(char) && !homePosition) throw new Error('日程缺少有效家园位置，原日程已保留。');
    // 请求期间用户编辑过的日程以最新版本为准，不把传入快照整份覆盖回去。
    const latest = await getDailyScheduleForChar(char);
    const now = Date.now();
    if (getScheduleDateKey(char, new Date(now)) !== date) throw new Error('生成期间角色当地已经跨天，请重试生成当前日程。');
    if (!force && hasActiveFateSlot(latest, now)) return latest;
    const end = now + duration * 60_000;
    const clock = (stamp: number) => { const wall = getScheduleWallClock(char, new Date(stamp)); return `${String(wall.getHours()).padStart(2, '0')}:${String(wall.getMinutes()).padStart(2, '0')}`; };
    const slot: ScheduleSlot = {
        startTime: clock(now), endTime: clock(end), startsAt: now, endsAt: end,
        activity: data.activity.trim(), description: data.description.trim(), location: data.location.trim(),
        emoji: typeof data.emoji === 'string' ? data.emoji : undefined, homePosition,
        fate: { tendency: draw.tendency, factors: draw.factors, peopleDirection: draw.people, rationale: typeof data.rationale === 'string' ? data.rationale : '', activityKind: String(data.activityKind || data.activity), sceneKind: String(data.sceneKind || data.location), development: String(data.development || ''), usageDate: date },
    };
    const base = latest || existing;
    const slots = (base?.slots || []).filter(s => !force || !s.startsAt || !s.endsAt || s.startsAt > now || s.endsAt <= now);
    const schedule: DailySchedule = {
        id: `fate:${char.id}_${date}`, charId: char.id, date, mode: 'fate', generatedAt: now,
        slots: [...slots, slot].sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0)),
        coverImage: base?.coverImage,
        fateDraws: [...(base?.fateDraws || []).filter(d => d.date === date), { date, factorIds: draw.factors.map(f => f.id) }],
    };
    await DB.saveDailySchedule(schedule);
    pendingDraws.delete(char.id);
    window.dispatchEvent(new CustomEvent('fate-schedule-updated', { detail: { charId: char.id } }));
    return schedule;
}
