import React from 'react';
import type { ScheduleSlot } from '../../types';
import { FateAstrolabe } from './FateTarotArt';
import './FateDayChart.css';

/**
 * 一天的星盘。
 *
 * 只编码程序算得出来的量，不用模型自由文本：
 *  - 方向：时刻。正上方 00:00，顺时针一圈 24 小时。取 slot.startTime——那本来就是
 *    角色当地钟面，不用再算时区。
 *  - 大小：时长（生成约束 30—180 分钟），只有三档。
 *  - 沿环的虚线弧：按时间顺序把节点串起来，读成一条「今天走过的路线」。
 *  - 填充：已结束实心、正在进行加光环、未开始空心。
 *  - 描边：人物方向（抽牌时写死的四选一）。
 *
 * 半径不承载语义，只在两段几乎同时开始时向内错一层，纯排版手段。
 * homePosition 一律不参与——很多角色没开家园，拿它画半径只会画出一张假图。
 */

/** 星盘上节点最外圈占半宽的比例，留出节点自身宽度。 */
const RADIUS_MAX = 42;
/** 两个节点的角度差小于这个值就算叠在一起，要错开。 */
const MIN_ANGLE_DEG = 14;
/** 错开用的同心圈。只做避让，不表示任何数据。 */
const RINGS = [1, 0.82, 0.66, 0.52];
/** 人物方向的描边样式。取自抽牌时写死的四选一，永远有值。 */
export const FATE_PEOPLE_STROKE: Record<string, string> = {
    alone: 'solid',
    familiar: 'double',
    new: 'dotted',
    free: 'regular',
};

/** 一天的分钟数。 */
const MINUTES_PER_DAY = 24 * 60;

/**
 * slot 在钟面上的分钟数（0—1439）。取 startTime 而不是 startsAt：startTime 已经是角色
 * 当地的钟面，跨时区角色也不用二次换算。解析不出来返回 null，由调用方放进「时间未记录」组。
 */
export function fateChartMinutes(slot: Pick<ScheduleSlot, 'startTime'>): number | null {
    const match = /^(\d{1,2}):(\d{2})/.exec(slot.startTime || '');
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
}

/** 时长（分钟），拿不到起止时间返回 null。 */
export function fateChartDuration(slot: Pick<ScheduleSlot, 'startsAt' | 'endsAt'>): number | null {
    if (typeof slot.startsAt !== 'number' || typeof slot.endsAt !== 'number') return null;
    const minutes = Math.round((slot.endsAt - slot.startsAt) / 60_000);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/** 节点档位：短 / 中 / 长。用来决定点的大小。 */
export function fateChartSize(durationMinutes: number | null): 'short' | 'mid' | 'long' {
    if (durationMinutes === null) return 'short';
    if (durationMinutes <= 60) return 'short';
    if (durationMinutes <= 120) return 'mid';
    return 'long';
}

/**
 * 钟面坐标，单位与 viewBox 一致（0—100，原点左上）。
 * 00:00 在正上方，顺时针走：06:00 右、12:00 下、18:00 左。
 */
export function fateChartPoint(minutesOfDay: number, ring = 1): { x: number; y: number } {
    const angle = (minutesOfDay / MINUTES_PER_DAY) * Math.PI * 2 - Math.PI / 2;
    const radius = RADIUS_MAX * ring;
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
}

/** 两个钟面时刻之间的夹角（度，0—180）。 */
export function fateChartAngleGap(a: number, b: number): number {
    const diff = Math.abs((((a - b) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
    return (Math.min(diff, MINUTES_PER_DAY - diff) / MINUTES_PER_DAY) * 360;
}

/**
 * 这个节点该放第几圈。已经被放下的节点里有夹角过小的，就往内错一圈。
 * 只看角度，不看语义——挤不挤是排版问题，不是数据问题。
 */
export function fateChartRing(minutesOfDay: number, placed: number[]): number {
    let collisions = 0;
    for (const other of placed) {
        if (fateChartAngleGap(minutesOfDay, other) < MIN_ANGLE_DEG) collisions += 1;
    }
    return RINGS[Math.min(collisions, RINGS.length - 1)];
}

export interface FateChartNode {
    index: number;
    slot: ScheduleSlot;
    minutes: number;
    point: { x: number; y: number };
    ring: number;
    size: 'short' | 'mid' | 'long';
}

export interface FateChartLayout {
    /** 能落在钟面上的节点，按时间先后排好。 */
    nodes: FateChartNode[];
    /** startTime 解析不出来的条目；照样能点开，只是画不到环上。 */
    untimed: { index: number; slot: ScheduleSlot }[];
}

/** 把一天的条目排版到钟面上。不丢任何一条：解析不出时间的进 untimed。 */
export function fateChartLayout(slots: ScheduleSlot[]): FateChartLayout {
    const timed: { index: number; slot: ScheduleSlot; minutes: number }[] = [];
    const untimed: { index: number; slot: ScheduleSlot }[] = [];
    slots.forEach((slot, index) => {
        const minutes = fateChartMinutes(slot);
        if (minutes === null) untimed.push({ index, slot });
        else timed.push({ index, slot, minutes });
    });
    timed.sort((a, b) => a.minutes - b.minutes || a.index - b.index);
    const placed: number[] = [];
    const nodes = timed.map(item => {
        const ring = fateChartRing(item.minutes, placed);
        placed.push(item.minutes);
        return {
            index: item.index,
            slot: item.slot,
            minutes: item.minutes,
            ring,
            point: fateChartPoint(item.minutes, ring),
            size: fateChartSize(fateChartDuration(item.slot)),
        };
    });
    return { nodes, untimed };
}

/**
 * 沿环从一段走到下一段的那截弧：这一天的时间顺序就是这条路线。
 * 两段落在不同圈上时退回直连，保证不出现跨圈的大弧。
 */
export function fateChartRoute(from: FateChartNode, to: FateChartNode): string {
    if (from.ring !== to.ring) {
        return `M${from.point.x} ${from.point.y}L${to.point.x} ${to.point.y}`;
    }
    let gap = to.minutes - from.minutes;
    if (gap < 0) gap += MINUTES_PER_DAY;
    if (gap === 0) return '';
    const radius = RADIUS_MAX * from.ring;
    const largeArc = gap > MINUTES_PER_DAY / 2 ? 1 : 0;
    return `M${from.point.x} ${from.point.y}A${radius} ${radius} 0 ${largeArc} 1 ${to.point.x} ${to.point.y}`;
}

/** 底盘上的四个时刻刻度。没有刻度，读者无法把这圈点和钟面对上。 */
const HOUR_TICKS = [
    { minutes: 0, label: '00' },
    { minutes: 360, label: '06' },
    { minutes: 720, label: '12' },
    { minutes: 1080, label: '18' },
];

/** 二十四根整点刻度。有了它，这一圈才读得出是钟面。 */
const HOUR_MARKS = Array.from({ length: 24 }, (_, index) => index * 60);

export interface FateDayChartProps {
    slots: ScheduleSlot[];
    now: number;
    /** 角色当地钟面的「现在」分钟数。给了就画出指针，不给就不画。 */
    nowMinutes?: number | null;
    /** 面板现有的状态判定，沿用同一套文案，避免两处各自实现后走偏。 */
    stateOf: (slot: ScheduleSlot, now: number) => string;
    selectedIndex: number | null;
    onSelect: (index: number) => void;
}

export default function FateDayChart({ slots, now, nowMinutes, stateOf, selectedIndex, onSelect }: FateDayChartProps) {
    const { nodes, untimed } = fateChartLayout(slots);
    const hand = typeof nowMinutes === 'number' && Number.isFinite(nowMinutes)
        ? Math.max(0, Math.min(MINUTES_PER_DAY, nowMinutes))
        : null;
    const handPoint = hand === null ? null : fateChartPoint(hand, 1);
    return <>
        <div className="fate-day-chart" role="group" aria-label="今日星盘">
            <div className="fate-day-chart__dial">
                {/* 底盘只当纸纹，压得很淡；真正的内容是刻度、路线与节点。 */}
                <FateAstrolabe />
                <svg className="fate-day-chart__marks" viewBox="0 0 100 100" aria-hidden="true">
                    {HOUR_MARKS.map(minutes => {
                        const outer = fateChartPoint(minutes, 1);
                        const inner = fateChartPoint(minutes, minutes % 360 === 0 ? 0.9 : 0.955);
                        return <line key={minutes}
                            className={`fate-day-chart__mark${minutes % 360 === 0 ? ' fate-day-chart__mark--major' : ''}`}
                            x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} />;
                    })}
                </svg>
                {HOUR_TICKS.map(tick => {
                    const point = fateChartPoint(tick.minutes, 1.15);
                    return <span key={tick.minutes} className="fate-day-chart__tick"
                        style={{ left: `${point.x}%`, top: `${point.y}%` }} aria-hidden="true">{tick.label}</span>;
                })}
                {/* 一天走过的那条路线：沿环把相邻两段接起来。 */}
                <svg className="fate-day-chart__routes" viewBox="0 0 100 100" aria-hidden="true">
                    {nodes.slice(1).map((node, i) => {
                        const path = fateChartRoute(nodes[i], node);
                        if (!path) return null;
                        return <path key={`route-${nodes[i].index}-${node.index}`}
                            className="fate-day-chart__route" d={path} />;
                    })}
                </svg>
                {/* 现在：一道细长的指针加末端亮点，指针只从盘心伸到环上，不压住占位。 */}
                {handPoint && hand !== null && <svg className="fate-day-chart__now" viewBox="0 0 100 100" aria-hidden="true">
                    <line className="fate-day-chart__now-hand" x1="50" y1="50" x2={handPoint.x} y2={handPoint.y} />
                    <circle className="fate-day-chart__now-dot" cx={handPoint.x} cy={handPoint.y} r="1.7" />
                </svg>}
                {nodes.map(node => <button key={node.index} type="button"
                    className={`fate-day-chart__node fate-day-chart__node--${node.size} ${node.index === selectedIndex ? 'fate-day-chart__node--active' : ''}`}
                    style={{ left: `${node.point.x}%`, top: `${node.point.y}%` }}
                    data-stroke={FATE_PEOPLE_STROKE[node.slot.fate?.peopleDirection || 'free'] || 'regular'}
                    data-state={stateOf(node.slot, now)}
                    aria-pressed={node.index === selectedIndex}
                    aria-label={`${node.slot.startTime} ${node.slot.activity}，${stateOf(node.slot, now)}`}
                    onClick={() => onSelect(node.index)} />)}
            </div>
            {untimed.length > 0 && <div className="fate-day-chart__untimed">
                <p className="fate-day-chart__untimed-title">时间未记录</p>
                <div className="fate-day-chart__untimed-list">
                    {untimed.map(item => <button key={item.index} type="button"
                        className={`fate-day-chart__chip ${item.index === selectedIndex ? 'fate-day-chart__chip--active' : ''}`}
                        aria-pressed={item.index === selectedIndex}
                        aria-label={`${item.slot.startTime || '时间未记录'} ${item.slot.activity}，${stateOf(item.slot, now)}`}
                        onClick={() => onSelect(item.index)}>{item.slot.activity}</button>)}
                </div>
            </div>}
        </div>
        {/* 没选中时，这张单子补上「几点做了哪一段」；选中后让位给那一段的详情。 */}
        {selectedIndex === null && <ol className="fate-day-chart__roster">
            {nodes.map(node => <li key={node.index}>
                <button type="button" className="fate-day-chart__row"
                    data-state={stateOf(node.slot, now)}
                    aria-label={`${node.slot.startTime} ${node.slot.activity}，${stateOf(node.slot, now)}`}
                    onClick={() => onSelect(node.index)}>
                    <span className="fate-day-chart__row-time">{node.slot.startTime}</span>
                    <span className="fate-day-chart__row-activity">{node.slot.activity}</span>
                </button>
            </li>)}
        </ol>}
        {/* 图里的信息对读屏器不可读，按时间顺序再念一遍。 */}
        <ol className="fate-day-chart__sr">
            {slots.map((slot, index) => <li key={index}>{slot.startTime} {slot.activity}，{stateOf(slot, now)}</li>)}
        </ol>
    </>;
}
