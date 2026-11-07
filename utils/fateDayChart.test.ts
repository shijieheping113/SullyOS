import { describe, expect, it } from 'vitest';
import { fateChartAngleGap, fateChartDuration, fateChartLayout, fateChartMinutes, fateChartPoint, fateChartRing, fateChartSize } from '../components/schedule/FateDayChart';
import type { ScheduleSlot } from '../types';

const slot = (patch: Partial<ScheduleSlot> = {}): ScheduleSlot => ({ startTime: '10:00', activity: '活动', ...patch });

describe('今日星盘排版', () => {
    it('钟点转成当天分钟数，解析不出来返回 null', () => {
        expect(fateChartMinutes(slot({ startTime: '00:00' }))).toBe(0);
        expect(fateChartMinutes(slot({ startTime: '06:00' }))).toBe(360);
        expect(fateChartMinutes(slot({ startTime: '23:59' }))).toBe(1439);
        expect(fateChartMinutes(slot({ startTime: '9:05' }))).toBe(545);
        expect(fateChartMinutes(slot({ startTime: '' }))).toBeNull();
        expect(fateChartMinutes(slot({ startTime: '24:00' }))).toBeNull();
        expect(fateChartMinutes(slot({ startTime: '10:60' }))).toBeNull();
    });

    it('00:00 在正上方，顺时针走一圈回到原点', () => {
        const top = fateChartPoint(0, 1);
        expect(top.x).toBeCloseTo(50, 5);
        expect(top.y).toBeCloseTo(50 - 42, 5);
        const right = fateChartPoint(360, 1);
        expect(right.x).toBeCloseTo(50 + 42, 5);
        expect(right.y).toBeCloseTo(50, 5);
        const bottom = fateChartPoint(720, 1);
        expect(bottom.x).toBeCloseTo(50, 5);
        expect(bottom.y).toBeCloseTo(50 + 42, 5);
        const left = fateChartPoint(1080, 1);
        expect(left.x).toBeCloseTo(50 - 42, 5);
        expect(left.y).toBeCloseTo(50, 5);
        // 内圈只改半径，不改方向
        const inner = fateChartPoint(0, 0.5);
        expect(inner.x).toBeCloseTo(50, 5);
        expect(inner.y).toBeCloseTo(50 - 21, 5);
    });

    it('角度差取环形最短距离', () => {
        expect(fateChartAngleGap(0, 0)).toBe(0);
        expect(fateChartAngleGap(0, 720)).toBe(180);
        expect(fateChartAngleGap(1439, 0)).toBeLessThan(1);
    });

    it('挤在一起时向内错开一到几圈，不重叠的仍在最外圈', () => {
        expect(fateChartRing(0, [])).toBe(1);
        expect(fateChartRing(600, [0])).toBe(1);
        // 相隔 5 分钟，落到下一圈
        expect(fateChartRing(5, [0])).toBeLessThan(1);
        // 多个都挤在一起，继续往里
        expect(fateChartRing(10, [0, 5])).toBeLessThan(fateChartRing(5, [0]));
    });

    it('时长决定节点大小，缺时间戳按最短处理', () => {
        expect(fateChartDuration(slot({ startsAt: 0, endsAt: 30 * 60_000 }))).toBe(30);
        expect(fateChartDuration(slot({ startsAt: 0 }))).toBeNull();
        expect(fateChartDuration(slot())).toBeNull();
        expect(fateChartSize(30)).toBe('short');
        expect(fateChartSize(60)).toBe('short');
        expect(fateChartSize(61)).toBe('mid');
        expect(fateChartSize(120)).toBe('mid');
        expect(fateChartSize(121)).toBe('long');
        expect(fateChartSize(180)).toBe('long');
        expect(fateChartSize(null)).toBe('short');
    });

    it('排版不丢任何一条：无时刻的进 untimed，有时刻的按时间排序', () => {
        const slots = [
            slot({ startTime: '18:00', activity: '晚饭' }),
            slot({ startTime: '06:00', activity: '晨跑' }),
            slot({ startTime: '', activity: '记不清几点' }),
            slot({ startTime: '12:00', activity: '午饭' }),
        ];
        const layout = fateChartLayout(slots);
        expect(layout.nodes.map(node => node.slot.activity)).toEqual(['晨跑', '午饭', '晚饭']);
        expect(layout.nodes.map(node => node.index)).toEqual([1, 3, 0]);
        expect(layout.untimed).toHaveLength(1);
        expect(layout.untimed[0].slot.activity).toBe('记不清几点');
        expect(layout.untimed[0].index).toBe(2);
    });

    it('同一时刻的多条不会互相覆盖', () => {
        const layout = fateChartLayout([slot({ startTime: '10:00', activity: 'A' }), slot({ startTime: '10:00', activity: 'B' })]);
        expect(layout.nodes).toHaveLength(2);
        expect(layout.nodes[0].point).not.toEqual(layout.nodes[1].point);
    });
});
