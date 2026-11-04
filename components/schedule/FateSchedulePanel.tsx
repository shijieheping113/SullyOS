import React, { useEffect, useState } from 'react';
import type { CharacterProfile, DailySchedule, ScheduleSlot } from '../../types';
import './FateSchedulePanel.css';

export interface FateSchedulePanelProps {
    schedule: DailySchedule | null;
    character: CharacterProfile | null;
    onEdit?: (index: number, slot: ScheduleSlot) => void | Promise<void>;
    onDelete?: (index: number) => void | Promise<void>;
    onReroll?: () => void;
    onPlayTheater?: (index: number) => void;
    isGenerating?: boolean;
    isViewing?: boolean;
}

const PEOPLE = { free: '无要求', familiar: '熟人', new: '新接触', alone: '独处' };
const range = (slot: ScheduleSlot) => `${slot.startTime} — ${slot.endTime || '结束时间未记录'}`;
const validStamp = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

function primaryIndex(slots: ScheduleSlot[], now: number): number {
    const active = slots.findIndex(slot => validStamp(slot.startsAt) && validStamp(slot.endsAt) && slot.startsAt <= now && now < slot.endsAt);
    if (active !== -1) return active;
    // 仅用实际时间判断进行状态；旧内容没有时间戳时仍可阅读，不猜成正在进行。
    const begun = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => validStamp(slot.startsAt) && slot.startsAt <= now);
    if (begun.length) return begun.sort((a, b) => b.slot.startsAt! - a.slot.startsAt!)[0].index;
    return slots.length ? slots.reduce((latest, slot, index) => (slot.startsAt || 0) >= (slots[latest].startsAt || 0) ? index : latest, 0) : -1;
}

function slotState(slot: ScheduleSlot, now: number): string {
    if (!validStamp(slot.startsAt) || !validStamp(slot.endsAt)) return '时间未完整记录';
    if (slot.endsAt <= now) return '已结束 · 待续写';
    return slot.startsAt > now ? '尚未开始' : '正在进行';
}

function CatAndYarn() {
    return (
        <svg className="fate-panel__cat" viewBox="0 0 200 110" fill="none" aria-hidden="true">
            <path className="fate-panel__thread" d="M148 86c13 4 31-1 31 6 0 8-25 4-38 8s-10 6-19 4" />
            <g className="fate-panel__yarn">
                <circle cx="156" cy="69" r="22" fill="#cc9ca8" />
                <path d="M138 58c9-4 24 2 32 14M135 67c8-2 21 4 30 17M145 50c-3 9 2 29 12 39M155 48c-4 9 0 28 10 38M171 56c-9 1-23 16-26 31" stroke="#805664" />
            </g>
            <path d="M40 85C13 88 8 64 19 57c8-5 14 6 7 9-6 3-6 13 10 12" />
            <path d="M43 80c-7-21 1-36 20-39 21-4 38 7 41 29l1 16H42Z" fill="#fffdfa" />
            <path d="m53 48-2-28 20 14c7-2 15-2 20 0l17-14-1 29c6 25-50 30-54-1Z" fill="#fffdfa" />
            <path d="m56 28 10 9-10 5m45-14-9 9 10 4" stroke="#c392a0" />
            <path d="m65 48 4 2m20-2-4 2m-10 8 4 2 4-2m-4 2v4m0 0c-4 3-7 2-8 0m8 0c4 3 7 1 8-1" />
            <path d="m57 56-10-2m11 6-12 2m48-6 12-3m-12 7 13 2M48 86h18m16 0h20" />
            <path className="fate-panel__paw" d="M92 75c10 7 19 9 34 0 6-4 11 2 6 7-11 12-27 17-39 8" fill="#fffdfa" />
            <path d="M118 96h-8m-5 0h-2" stroke="#c392a0" />
        </svg>
    );
}

function CardDrawing({ index }: { index: number }) {
    return (
        <svg className="fate-panel__card-art" viewBox="0 0 72 66" fill="none" aria-hidden="true">
            {index === 0 ? <>
                <circle cx="36" cy="29" r="15" /><circle cx="36" cy="29" r="9" />
                <path d="M36 7V2m0 54v-5M14 29H9m54 0h-5M20 13l-4-4m40 40-4-4M52 13l4-4M20 45l-4 4M31 59h10" />
            </> : index === 1 ? <>
                <path d="M46 7c-20 3-26 31-3 40C14 50 9 16 32 8M50 20l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />
                <path d="M25 57h26m-20 5h14M16 9v6m-3-3h6" />
            </> : <>
                <path d="M36 57V27m0 13C16 39 14 24 17 18c13 0 21 7 19 22Zm0 8c18-1 22-14 20-21-13-1-22 7-20 21ZM22 58c8-5 22-5 29 0" />
                <path d="m36 5 2 7 8 2-8 2-2 8-2-8-8-2 8-2ZM55 10v6m-3-3h6" />
            </>}
        </svg>
    );
}

function FateCards({ slot, identity }: { slot: ScheduleSlot; identity: string }) {
    const [expanded, setExpanded] = useState<number | null>(null);
    const factors = slot.fate?.factors || [];
    useEffect(() => setExpanded(null), [identity]);
    return (
        <section className="fate-panel__reading" aria-label="本轮因子牌">
            <div className="fate-panel__deck">
                {factors.map((factor, index) => (
                    <button key={`${index}-${factor.id}`} type="button"
                        className={`fate-panel__card ${index === 0 ? 'fate-panel__card--lead' : ''} ${expanded === index ? 'fate-panel__card--open' : ''}`}
                        aria-expanded={expanded === index}
                        aria-label={`${index === 0 ? '主因子' : `副因子${index}`}：${factor.name}，查看含义`}
                        onClick={() => setExpanded(expanded === index ? null : index)}>
                        <span className="fate-panel__card-role">{index === 0 ? '主因子' : `副因子${index}`}</span>
                        <CardDrawing index={index} />
                        <strong>{factor.name}</strong>
                        <span className="fate-panel__card-hint">{expanded === index ? '收起含义' : '翻看含义'}</span>
                    </button>
                ))}
            </div>
            {factors.length === 0 && <p className="fate-panel__muted">本轮没有保存因子牌。</p>}
            {expanded !== null && factors[expanded] && <div className="fate-panel__meaning" role="region" aria-label={`${factors[expanded].name}的含义`}>
                <strong>{factors[expanded].name}</strong><p>{factors[expanded].meaning}</p>
            </div>}
            {slot.fate && <div className="fate-panel__context">
                <div><span className="fate-panel__label">本轮倾向</span><strong>{slot.fate.tendency.name}</strong><p>{slot.fate.tendency.meaning}</p></div>
                <div><span className="fate-panel__label">人物方向</span><strong>{PEOPLE[slot.fate.peopleDirection] || '未记录'}</strong></div>
                <details className="fate-panel__rationale"><summary>设计说明</summary><p>{slot.fate.rationale || '本轮没有保存设计说明。'}</p></details>
            </div>}
        </section>
    );
}

interface SlotSnapshot {
    index: number;
    scheduleId: string;
    characterId?: string;
    startsAt?: number;
    original: string;
    wasPrimary: boolean;
}
interface EditDraft extends SlotSnapshot { activity: string; description: string; location: string; home: string }

const FateSchedulePanel: React.FC<FateSchedulePanelProps> = ({ schedule, character, onEdit, onDelete, onReroll, onPlayTheater, isGenerating = false, isViewing = false }) => {
    const [now, setNow] = useState(Date.now);
    const [draft, setDraft] = useState<EditDraft | null>(null);
    const [deleting, setDeleting] = useState<SlotSnapshot | null>(null);
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const busy = isGenerating || isViewing;
    const writesDisabled = busy || isSaving;
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => { setDraft(null); setDeleting(null); setError(''); }, [character?.id, schedule?.id]);
    const slots = schedule?.slots || [];
    const index = primaryIndex(slots, now);
    const slot = slots[index];
    const rooms = character?.home3D?.rooms || [];
    const homeRoomId = slot?.homePosition?.kind === 'home' ? slot.homePosition.roomId : undefined;
    const history = slots.map((item, itemIndex) => ({ slot: item, index: itemIndex })).filter(item => item.index !== index).sort((a, b) => (b.slot.startsAt || 0) - (a.slot.startsAt || 0));
    const snapshot = (itemIndex: number): SlotSnapshot => ({ index: itemIndex, scheduleId: schedule!.id, characterId: character?.id, startsAt: slots[itemIndex].startsAt, original: JSON.stringify(slots[itemIndex]), wasPrimary: itemIndex === index });
    const matches = (saved: SlotSnapshot) => saved.scheduleId === schedule?.id && saved.characterId === character?.id
        && saved.startsAt === slots[saved.index]?.startsAt && saved.original === JSON.stringify(slots[saved.index])
        && (!saved.wasPrimary || saved.index === primaryIndex(slots, Date.now()));

    const startEdit = (itemIndex: number) => {
        if (writesDisabled) return;
        const item = slots[itemIndex];
        setDraft({ ...snapshot(itemIndex), activity: item.activity, description: item.description || '', location: item.location || '', home: item.homePosition?.kind === 'home' ? item.homePosition.roomId : item.homePosition?.kind === 'away' ? '__away' : '' });
        setDeleting(null);
        setError('');
    };
    const saveEdit = async () => {
        if (!draft || !onEdit || writesDisabled) return;
        if (!matches(draft)) { setError('日程轮次或活动内容已经变化，请取消编辑后重新打开活动。填写内容尚未保存。'); return; }
        if (!draft.activity.trim()) { setError('请填写活动名称。'); return; }
        const room = rooms.find(item => item.id === draft.home);
        if (draft.home && draft.home !== '__away' && !room) { setError('选择的家园房间已不存在，请重新选择房间或外出。'); return; }
        const original = slots[draft.index];
        setIsSaving(true);
        try {
            await onEdit(draft.index, { ...original, activity: draft.activity.trim(), description: draft.description.trim() || undefined,
                location: draft.location.trim() || room?.name || undefined,
                homePosition: draft.home === '__away' ? { kind: 'away' } : room ? { kind: 'home', roomId: room.id } : undefined,
                theater: undefined });
            setDraft(null); setError('');
        } catch { setError('活动保存失败，填写内容已保留，请重试。'); }
        finally { setIsSaving(false); }
    };
    const actions = (item: ScheduleSlot, itemIndex: number) => <div className="fate-panel__actions">
        {onPlayTheater && <button type="button" disabled={writesDisabled || (validStamp(item.startsAt) && item.startsAt > now)} onClick={() => onPlayTheater(itemIndex)}>{item.theater ? '重看小剧场' : '进一步查看'}</button>}
        {onEdit && <button type="button" disabled={writesDisabled} onClick={() => startEdit(itemIndex)}>编辑活动</button>}
        {onDelete && <button type="button" className="fate-panel__delete" disabled={writesDisabled} onClick={() => { setDeleting(snapshot(itemIndex)); setDraft(null); setError(''); }}>删除活动</button>}
    </div>;
    return (
        <div className={`fate-panel ${isGenerating ? 'fate-panel--waiting' : ''}`} aria-label="命运牌阵" aria-busy={busy || isSaving}>
            <header className="fate-panel__header"><h1>命运牌阵</h1><span>{character?.name || '角色'}的生活片段</span></header>
            <button className="fate-panel__draw" type="button" disabled={!onReroll || writesDisabled} onClick={() => { if (!writesDisabled) onReroll?.(); }}>
                <CatAndYarn />
                <span><strong>{isGenerating ? '猫咪拨球中…' : isViewing ? '进一步查看生成中…' : slot ? '拨一下 · 重 Roll' : '拨一下 · 生成本轮'}</strong>
                    <span>{isGenerating ? '正在等待真实日程，牌面暂不更换' : isViewing ? '正在展开小剧场，活动与牌面保持不变' : slot ? '重 Roll 会替换本轮活动与三张牌' : '让三张因子牌展开一段生活'}</span></span>
            </button>
            <p className="fate-panel__continuation" role="status">{isGenerating ? '生成中，当前内容仍保留；完成后才更新。' : isViewing ? '进一步查看生成中，请等待小剧场完成。' : '本轮结束后自动续写，不会提前排满全天。'}</p>

            {slot ? <>
                <article className="fate-panel__activity" aria-label="本轮活动">
                    <div className="fate-panel__timing"><span>{slotState(slot, now)}</span><span>{range(slot)} · 角色当地时间</span></div>
                    <h3>{slot.activity}</h3>
                    <p className="fate-panel__location">{slot.location || rooms.find(room => room.id === homeRoomId)?.name || '地点未记录'}</p>
                    {slot.description && <p className="fate-panel__description">{slot.description}</p>}
                    {actions(slot, index)}
                </article>
                <FateCards slot={slot} identity={`${schedule?.id}:${slot.startsAt}:${JSON.stringify(slot.fate)}`} />
            </> : <div className="fate-panel__empty"><h3>还没有展开的生活片段</h3><p>轻点猫咪与毛线球，等待真实日程与三张因子牌。生成失败时可以再次轻点重试。</p></div>}

            {draft && <form className="fate-panel__editor" aria-label="编辑活动" onSubmit={event => { event.preventDefault(); saveEdit(); }}>
                <h3>编辑活动</h3>
                <p className="fate-panel__muted">{range(JSON.parse(draft.original))} · 时间只读，保存不会改变起止时间。编辑后需重新生成小剧场。</p>
                <fieldset disabled={writesDisabled}>
                    <label>活动名称<input value={draft.activity} onChange={event => setDraft({ ...draft, activity: event.target.value })} /></label>
                    <label>活动描述<textarea rows={4} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
                    <label>具体地点<input value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} /></label>
                    <label>家园位置<select value={draft.home} onChange={event => setDraft({ ...draft, home: event.target.value })}>
                        <option value="">未设置</option><option value="__away">外出（保留具体地点）</option>
                        {draft.home && draft.home !== '__away' && !rooms.some(room => room.id === draft.home) && <option value={draft.home}>原房间已不存在，请重新选择</option>}
                        {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                    </select></label>
                    <div className="fate-panel__actions"><button type="submit" className="fate-panel__save">{isSaving ? '正在保存…' : '保存活动'}</button><button type="button" onClick={() => { setDraft(null); setError(''); }}>取消编辑</button></div>
                </fieldset>
            </form>}
            {deleting && <div className="fate-panel__confirm" role="group" aria-label="删除活动确认">
                <p>删除活动：{JSON.parse(deleting.original).activity}？日程与小剧场记录都会删除。</p>
                <div className="fate-panel__actions"><button type="button" disabled={writesDisabled} className="fate-panel__delete" onClick={async () => {
                    if (writesDisabled || !onDelete) return;
                    if (!matches(deleting)) { setError('活动已经变化，请取消删除后重新选择。'); return; }
                    setIsSaving(true);
                    try { await onDelete(deleting.index); setDeleting(null); setError(''); } catch { setError('删除失败，活动仍然保留，请重试。'); }
                    finally { setIsSaving(false); }
                }}>{isSaving ? '正在删除…' : '确认删除'}</button><button type="button" disabled={writesDisabled} onClick={() => { setDeleting(null); setError(''); }}>取消删除</button></div>
            </div>}
            {error && <p className="fate-panel__error" role="alert">{error}</p>}

            {history.length > 0 && <details className="fate-panel__history"><summary>历史片段 · {history.length}</summary>
                <div className="fate-panel__history-list">{history.map(({ slot: past, index: pastIndex }) => <article key={`${pastIndex}:${past.startsAt}`}>
                    <span className="fate-panel__muted">{range(past)} · {slotState(past, now)}</span>
                    <h3>{past.activity}</h3><p className="fate-panel__location">{past.location || '地点未记录'}</p>
                    {past.description && <p className="fate-panel__description">{past.description}</p>}
                    {actions(past, pastIndex)}
                    <details><summary>查看本轮牌阵</summary><FateCards slot={past} identity={`${schedule?.id}:${past.startsAt}:${JSON.stringify(past.fate)}`} /></details>
                </article>)}</div>
            </details>}
        </div>
    );
};

export default FateSchedulePanel;
