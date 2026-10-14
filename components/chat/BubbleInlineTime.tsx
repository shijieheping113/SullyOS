import React from 'react';

const spacerClass = 'invisible inline-block whitespace-nowrap text-[9px] select-none ml-1';
const visibleClass = 'absolute bottom-0 right-0 text-[9px] whitespace-nowrap pointer-events-none select-none';

/** 电脑悬停才显；没有悬停能力的设备（手机）按始终显示。 */
const hoverVisibleClass = `${visibleClass} opacity-55 [@media(hover:hover)]:!opacity-0 [@media(hover:hover)]:group-hover:!opacity-55`;
const shownVisibleClass = `${visibleClass} opacity-55`;

export function BubbleInlineTime({ time, hover = false }: { time: string; hover?: boolean }) {
    return (
        <>
            <span aria-hidden="true" className={spacerClass}>{time}</span>
            <span className={hover ? hoverVisibleClass : shownVisibleClass}>{time}</span>
        </>
    );
}

/** 没有文字末行时，气泡内右下角单独一行。 */
export function BubbleCornerTime({ time, hover = false }: { time: string; hover?: boolean }) {
    const textClass = hover
        ? 'text-[9px] whitespace-nowrap pointer-events-none select-none opacity-55 [@media(hover:hover)]:!opacity-0 [@media(hover:hover)]:group-hover:!opacity-55'
        : 'text-[9px] whitespace-nowrap pointer-events-none select-none opacity-55';
    return (
        <div className="relative z-10 mt-0.5 flex justify-end" data-bubble-time-corner="">
            <span className={textClass}>{time}</span>
        </div>
    );
}

function lastPieceIndex(nodes: React.ReactNode[]): number {
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (typeof node === 'string') {
            if (Array.from(node).length > 0) return i;
            continue;
        }
        if (node !== null && node !== undefined && node !== false) return i;
    }
    return -1;
}

/** 把时间和最后一个字绑在同一行，避免时间自己掉下去。 */
export function pinInlineTime(nodes: React.ReactNode[], time: React.ReactNode): { nodes: React.ReactNode[]; pinned: boolean } {
    const list = nodes.flat();
    const index = lastPieceIndex(list);
    if (index < 0) return { nodes: list, pinned: false };
    const node = list[index];
    const pinnedNode = typeof node === 'string'
        ? (() => {
            const chars = Array.from(node);
            const last = chars.pop() ?? '';
            return <React.Fragment key="inline-time">{chars.join('')}<span className="whitespace-nowrap">{last}{time}</span></React.Fragment>;
        })()
        : <span className="whitespace-nowrap">{node}{time}</span>;
    const next = list.slice();
    next[index] = pinnedNode;
    return { nodes: next, pinned: true };
}

export function lastBlockIsCodeFence(text: string): boolean {
    const parts = text.split(/(```[\s\S]*?```)/g).filter(part => part.trim());
    const last = parts[parts.length - 1] || '';
    return last.startsWith('```') && last.endsWith('```') && last.length > 6;
}

export function plainLinesWithInlineTime(text: string, time: React.ReactNode): { nodes: React.ReactNode; attached: boolean } {
    const lines = text.split('\n');
    let last = -1;
    lines.forEach((line, index) => { if (line.trim()) last = index; });
    if (last < 0) return { nodes: text, attached: false };
    return {
        attached: true,
        nodes: lines.map((line, index) => {
            const target = index === last;
            const body = target ? pinInlineTime([line], time) : null;
            return (
                <div key={index} className={target ? 'relative min-h-[1.2em]' : 'min-h-[1.2em]'} data-inline-time={target ? '' : undefined}>
                    {body?.pinned ? body.nodes : line}
                </div>
            );
        }),
    };
}
