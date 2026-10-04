/** 心里话那行藏在正常底边下面时，滚到哪、松手后该停在哪。 */

export const INNER_PEEK_SNAP_SLACK = 24;
/** 这一下开始时，离底边这么近，就算已经贴住，可以滑进心里话。 */
export const INNER_PEEK_ENTER_SLACK = 24;
/** 往里带过这么一点，松手就顺到展开，不要弹回去让人再滑一次。 */
export const INNER_PEEK_COMMIT_PX = 8;

export const chatMaxScrollTop = (scrollHeight: number, clientHeight: number): number => (
    Math.max(0, scrollHeight - clientHeight)
);

/** peekHeight 为 0 时就是真正的底。有这行时少滚它的高度，停在它的上沿。 */
export const chatRestingScrollTop = (
    scrollHeight: number,
    clientHeight: number,
    peekHeight: number,
): number => {
    const max = chatMaxScrollTop(scrollHeight, clientHeight);
    return Math.max(0, max - Math.max(0, peekHeight));
};

export type InnerPeekSnap = 'show' | 'hide' | 'none';

/**
 * distanceFromBottom 为 0 表示滚进了心里话那行。
 * 等于 peekHeight 表示刚好停在它上沿。再远就是在看上面的消息。
 */
export const snapInnerPeek = (
    distanceFromBottom: number,
    peekHeight: number,
    slack = INNER_PEEK_SNAP_SLACK,
): InnerPeekSnap => {
    if (peekHeight <= 0 || distanceFromBottom > peekHeight + slack) return 'none';
    const revealed = peekHeight - distanceFromBottom;
    return revealed >= INNER_PEEK_COMMIT_PX ? 'show' : 'hide';
};

/**
 * 藏起来时高度是 0，贴着真底才算可以滑进去。
 * 已经展开时，停在它上沿或更下面也算。
 */
export const innerPeekMayEnter = (
    distanceFromBottom: number,
    peekHeight: number,
    slack = INNER_PEEK_ENTER_SLACK,
): boolean => {
    if (peekHeight <= 0) return distanceFromBottom <= slack;
    return distanceFromBottom <= peekHeight + slack;
};

/**
 * fingerScrollDelta 大于 0 表示这一下把列表往心里话那边带了。
 * 往下带过一点就展开，往上带过一点就藏起。几乎没动时看停在哪。
 */
export const innerPeekSettle = (
    distanceFromBottom: number,
    peekHeight: number,
    fingerScrollDelta: number,
): InnerPeekSnap => {
    if (peekHeight <= 0) return 'none';
    if (fingerScrollDelta >= INNER_PEEK_COMMIT_PX) return 'show';
    if (fingerScrollDelta <= -INNER_PEEK_COMMIT_PX) {
        return distanceFromBottom > peekHeight + INNER_PEEK_SNAP_SLACK ? 'none' : 'hide';
    }
    return snapInnerPeek(distanceFromBottom, peekHeight);
};

/** 从上面滑下来时，不准滚过心里话的上沿。 */
export const clampInnerPeekScrollTop = (
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    peekHeight: number,
    allowEnter: boolean,
): number => {
    if (allowEnter || peekHeight <= 0) return scrollTop;
    const resting = chatRestingScrollTop(scrollHeight, clientHeight, peekHeight);
    return Math.min(scrollTop, resting);
};
