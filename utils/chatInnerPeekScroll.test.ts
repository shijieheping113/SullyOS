import { describe, expect, it } from 'vitest';
import {
    chatRestingScrollTop,
    clampInnerPeekScrollTop,
    innerPeekMayEnter,
    innerPeekSettle,
    snapInnerPeek,
} from './chatInnerPeekScroll';

describe('心里话那行的停靠', () => {
    it('没有这行就滚到真正的底', () => {
        expect(chatRestingScrollTop(800, 500, 0)).toBe(300);
    });

    it('有这行就少滚它的高度，停在上沿', () => {
        expect(chatRestingScrollTop(800, 500, 48)).toBe(252);
    });

    it('带出一小段就算展开，停在上沿算藏起，离底还远就不动', () => {
        expect(snapInnerPeek(0, 48)).toBe('show');
        expect(snapInnerPeek(48, 48)).toBe('hide');
        expect(snapInnerPeek(40, 48)).toBe('show');
        expect(snapInnerPeek(44, 48)).toBe('hide');
        expect(snapInnerPeek(200, 48)).toBe('none');
        expect(snapInnerPeek(10, 0)).toBe('none');
    });

    it('贴着底边的下一滑才准进去，从上面开始的不准', () => {
        expect(innerPeekMayEnter(400, 48)).toBe(false);
        expect(innerPeekMayEnter(48, 48)).toBe(true);
        expect(innerPeekMayEnter(60, 48)).toBe(true);
        expect(innerPeekMayEnter(80, 48)).toBe(false);
        expect(innerPeekMayEnter(0, 48)).toBe(true);
        expect(innerPeekMayEnter(0, 0)).toBe(true);
        expect(innerPeekMayEnter(24, 0)).toBe(true);
        expect(innerPeekMayEnter(40, 0)).toBe(false);
    });

    it('往下带过一点就展开，往上带过一点就藏起', () => {
        expect(innerPeekSettle(48, 48, 8)).toBe('show');
        expect(innerPeekSettle(20, 48, -8)).toBe('hide');
        expect(innerPeekSettle(200, 48, -8)).toBe('none');
        expect(innerPeekSettle(48, 48, 0)).toBe('hide');
        expect(innerPeekSettle(0, 48, 0)).toBe('show');
        expect(innerPeekSettle(10, 0, 20)).toBe('none');
    });

    it('从上面滑下来时卡在上沿，贴底后再滑就跟着走', () => {
        expect(clampInnerPeekScrollTop(300, 800, 500, 48, false)).toBe(252);
        expect(clampInnerPeekScrollTop(200, 800, 500, 48, false)).toBe(200);
        expect(clampInnerPeekScrollTop(300, 800, 500, 48, true)).toBe(300);
    });
});
