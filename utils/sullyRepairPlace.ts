import type { Message } from '../types';
import type { RenderedBubble } from './reprocessChatMessage';

/** 多条一起修时，用来记住每条原来的位置。模型必须原样留着这行。 */
export function sullyBubbleMark(id: number | 'new'): string {
    return `<<<SULLY_BUBBLE id="${id}">>>`;
}

export type MarkedBubblePart = { id: number | 'new'; source: string };

const MARK_LINE = /^<<<SULLY_BUBBLE id="?(\d+|new)"?>>>$/;
const EMPTY_PART = /^(无|没有|none|n\/a|—|-)$/i;

export function parseMarkedBubbleSource(text: string): MarkedBubblePart[] | null {
    const lines = (text || '').split(/\r?\n/);
    const marks: { index: number; id: number | 'new' }[] = [];
    lines.forEach((line, index) => {
        const matched = line.trim().match(MARK_LINE);
        if (!matched) return;
        marks.push({ index, id: matched[1] === 'new' ? 'new' : Number(matched[1]) });
    });
    if (!marks.length) return null;
    return marks.map((mark, i) => {
        const end = i + 1 < marks.length ? marks[i + 1].index : lines.length;
        const raw = lines.slice(mark.index + 1, end).join('\n').trim();
        return { id: mark.id, source: EMPTY_PART.test(raw) ? '' : raw };
    });
}

export function buildMarkedBubbleSource(parts: MarkedBubblePart[]): string {
    return parts.map(part => `${sullyBubbleMark(part.id)}\n${part.source.trim()}`).join('\n');
}

export type TimelineItem = { id: number; timestamp: number };

export type RepairPiece =
    | { kind: 'slot'; id: number; bubbles: RenderedBubble[] }
    | { kind: 'new'; bubbles: RenderedBubble[] };

export type PlacementOp =
    | { op: 'replace'; id: number; bubble: RenderedBubble }
    | { op: 'delete'; id: number }
    | { op: 'shift'; id: number; timestamp: number }
    | { op: 'insert'; timestamp: number; bubble: RenderedBubble };

export function normalizeRepairText(source: string): string {
    return (source || '')
        .replace(/<<<SULLY_BUBBLE[^>\n]*>>>/g, '')
        .replace(/\[\/?html\]/gi, '')
        .replace(/<[^>\n]*>/g, '')
        .replace(/\[\[SEND_EMOJI:\s*([^\]]+)\]\]/gi, '$1')
        .replace(/\[表情[：:]([^\]]+)\]/g, '$1')
        .replace(/\s+/g, '')
        .trim()
        .toLowerCase();
}

export function repairTextSimilarity(a: string, b: string): number {
    const left = normalizeRepairText(a).slice(0, 800);
    const right = normalizeRepairText(b).slice(0, 800);
    if (!left && !right) return 1;
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) {
        return Math.min(left.length, right.length) / Math.max(left.length, right.length);
    }
    const rows = left.length + 1;
    const cols = right.length + 1;
    const dp = new Uint16Array(cols);
    let prev = 0;
    for (let i = 1; i < rows; i++) {
        prev = 0;
        for (let j = 1; j < cols; j++) {
            const saved = dp[j];
            dp[j] = left[i - 1] === right[j - 1]
                ? prev + 1
                : Math.max(dp[j], dp[j - 1]);
            prev = saved;
        }
    }
    return dp[cols - 1] / Math.max(left.length, right.length);
}

function distinctiveKey(source: string): string {
    return (source || '')
        .replace(/<<<SULLY_BUBBLE[^>\n]*>>>/g, '')
        .replace(/\[\/?html\]/gi, '')
        .replace(/<[^>\n]*>/g, '')
        .replace(/\[\[SEND_EMOJI:\s*|\]\]/g, '')
        .replace(/\[表情[：:]|\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 18);
}

/** 模型把标记行弄丢、但每条的字还按原顺序留着时，按这些字把稿切回原来的几条。 */
function recoverPartsByKeys(
    originals: { id: number; source: string }[],
    fixed: string,
): MarkedBubblePart[] | null {
    const keys = originals.map(item => distinctiveKey(item.source));
    if (keys.some(key => key.length < 1)) return null;
    if (new Set(keys).size !== keys.length) return null;
    let from = 0;
    const ranges: { end: number }[] = [];
    const starts: number[] = [];
    for (let i = 0; i < keys.length; i++) {
        const at = fixed.indexOf(keys[i], from);
        if (at < 0) return null;
        if (i === 0) {
            starts.push(0);
        } else {
            const gap = fixed.slice(from, at);
            const nl = gap.lastIndexOf('\n');
            starts.push(nl >= 0 ? from + nl + 1 : at);
        }
        from = at + keys[i].length;
        ranges.push({ end: from });
    }
    return originals.map((item, i) => ({
        id: item.id,
        source: fixed.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : fixed.length).trim(),
    }));
}

function splitSourcePreservingOrder(source: string): string[] {
    const re = /\[html\][\s\S]*?\[\/html\]|\[\[SEND_EMOJI:\s*[^\]]+\]\]/gi;
    const parts: string[] = [];
    let last = 0;
    let matched: RegExpExecArray | null;
    while ((matched = re.exec(source))) {
        const before = source.slice(last, matched.index).trim();
        if (before) parts.push(before);
        parts.push(matched[0].trim());
        last = matched.index + matched[0].length;
    }
    const tail = source.slice(last).trim();
    if (tail) parts.push(tail);
    return parts;
}

const MATCH_THRESHOLD = 0.45;

function alignMonotone(
    originals: { id: number; source: string }[],
    pieces: string[],
): MarkedBubblePart[] {
    const out: MarkedBubblePart[] = [];
    let j = 0;
    for (let i = 0; i < originals.length; i++) {
        const orig = originals[i];
        if (j >= pieces.length) {
            out.push({ id: orig.id, source: '' });
            continue;
        }
        const here = repairTextSimilarity(orig.source, pieces[j]);
        let later = 0;
        for (let k = i + 1; k < originals.length; k++) {
            later = Math.max(later, repairTextSimilarity(originals[k].source, pieces[j]));
        }
        if (here >= MATCH_THRESHOLD && here >= later) {
            out.push({ id: orig.id, source: pieces[j] });
            j++;
            continue;
        }
        if (later >= MATCH_THRESHOLD) {
            out.push({ id: orig.id, source: '' });
            continue;
        }
        out.push({ id: 'new', source: pieces[j] });
        j++;
        i--;
    }
    while (j < pieces.length) {
        out.push({ id: 'new', source: pieces[j] });
        j++;
    }
    return out;
}

function zipParts(
    originals: { id: number; source: string }[],
    pieces: string[],
): MarkedBubblePart[] {
    return originals.map((item, i) => ({ id: item.id, source: pieces[i] ?? '' }));
}

/**
 * 把模型交回来的稿，拆回「哪一条还是原来的哪一条」。
 * 有位置标记就按标记。没有的话，条数一样就按顺序对上；条数不一样就按字对上，对不上的当新增或删除。
 */
export function resolveRepairSources(
    originals: { id: number; source: string }[],
    fixedSource: string,
): MarkedBubblePart[] {
    if (!originals.length) return [];
    const marked = parseMarkedBubbleSource(fixedSource);
    if (marked) {
        const ids = new Set(originals.map(item => item.id));
        const seen = new Set<number>();
        const out: MarkedBubblePart[] = [];
        for (const part of marked) {
            if (typeof part.id === 'number' && ids.has(part.id) && !seen.has(part.id)) {
                seen.add(part.id);
                out.push(part);
            } else if (part.source.trim()) {
                out.push({ id: 'new', source: part.source });
            }
        }
        if (seen.size > 0 || originals.length === 1) return out;
    }

    if (originals.length === 1) {
        return [{ id: originals[0].id, source: (fixedSource || '').trim() }];
    }

    const recovered = recoverPartsByKeys(originals, fixedSource || '');
    if (recovered) return recovered;

    const trimmed = (fixedSource || '').trim();
    if (!trimmed) return originals.map(item => ({ id: item.id, source: '' }));

    const blocks = splitSourcePreservingOrder(trimmed);
    if (blocks.length === originals.length) return zipParts(originals, blocks);
    const lines = trimmed.split(/\n+/).map(line => line.trim()).filter(Boolean);
    if (lines.length === originals.length) return zipParts(originals, lines);
    return alignMonotone(originals, blocks.length > 1 ? blocks : lines);
}

type GapJob = {
    afterId: number | null;
    beforeId: number | null;
    bubbles: RenderedBubble[];
    sort: number;
};

export function timestampsForGap(
    timeline: TimelineItem[],
    afterId: number | null,
    beforeId: number | null,
    count: number,
): { timestamps: number[]; shifts: { id: number; timestamp: number }[] } {
    if (count <= 0) return { timestamps: [], shifts: [] };
    const after = afterId == null ? null : timeline.find(item => item.id === afterId) ?? null;
    const before = beforeId == null ? null : timeline.find(item => item.id === beforeId) ?? null;
    const afterIdx = after ? timeline.findIndex(item => item.id === after.id) : -1;

    if (!before) {
        const start = after ? after.timestamp : 0;
        return {
            timestamps: Array.from({ length: count }, (_, i) => start + i + 1),
            shifts: [],
        };
    }
    if (!after) {
        return {
            timestamps: Array.from({ length: count }, (_, i) => before.timestamp - count + i),
            shifts: [],
        };
    }
    if (before.timestamp > after.timestamp) {
        const step = (before.timestamp - after.timestamp) / (count + 1);
        return {
            timestamps: Array.from({ length: count }, (_, i) => after.timestamp + step * (i + 1)),
            shifts: [],
        };
    }
    const timestamps = Array.from({ length: count }, (_, i) => after.timestamp + i + 1);
    const last = timestamps[timestamps.length - 1];
    const bump = count + 1;
    const shifts = timeline
        .filter((item, index) => index > afterIdx && item.timestamp <= last)
        .map(item => ({ id: item.id, timestamp: item.timestamp + bump }));
    return { timestamps, shifts };
}

function predecessorId(timeline: TimelineItem[], id: number, deleted: Set<number>): number | null {
    const idx = timeline.findIndex(item => item.id === id);
    if (idx < 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
        if (!deleted.has(timeline[i].id)) return timeline[i].id;
    }
    return null;
}

function successorId(timeline: TimelineItem[], id: number, deleted: Set<number>): number | null {
    const idx = timeline.findIndex(item => item.id === id);
    if (idx < 0) return null;
    for (let i = idx + 1; i < timeline.length; i++) {
        if (!deleted.has(timeline[i].id)) return timeline[i].id;
    }
    return null;
}

/**
 * 改过的泡写回自己的 id（位置不动）。
 * 某条被拆成好几条时，多出来的紧挨在它后面、下一条前面。
 * 删掉的只留一个空位。上方/下方新增分别贴在整段选区的头和尾。
 */
export function planRepairPlacement(opts: {
    timeline: TimelineItem[];
    originals: TimelineItem[];
    pieces: RepairPiece[];
    above?: RenderedBubble[];
    below?: RenderedBubble[];
}): PlacementOp[] {
    const timeline = [...opts.timeline].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
    const originals = [...opts.originals].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
    if (!originals.length) return [];

    const originalIds = new Set(originals.map(item => item.id));
    const deleted = new Set<number>();
    const replaced = new Map<number, RenderedBubble>();
    const extraAfter = new Map<number, RenderedBubble[]>();
    const leading: RenderedBubble[] = [...(opts.above ?? [])];
    let seenSlot = false;
    let lastSlotId: number | null = null;

    const pushAfter = (id: number, bubbles: RenderedBubble[]) => {
        if (!bubbles.length) return;
        const list = extraAfter.get(id) ?? [];
        list.push(...bubbles);
        extraAfter.set(id, list);
    };

    for (const piece of opts.pieces) {
        if (piece.kind === 'slot' && originalIds.has(piece.id)) {
            seenSlot = true;
            lastSlotId = piece.id;
            if (!piece.bubbles.length) {
                deleted.add(piece.id);
            } else {
                replaced.set(piece.id, piece.bubbles[0]);
                pushAfter(piece.id, piece.bubbles.slice(1));
            }
            continue;
        }
        if (!piece.bubbles.length) continue;
        if (!seenSlot || lastSlotId == null) leading.push(...piece.bubbles);
        else pushAfter(lastSlotId, piece.bubbles);
    }

    for (const item of originals) {
        const mentioned = opts.pieces.some(piece => piece.kind === 'slot' && piece.id === item.id);
        if (!mentioned && !replaced.has(item.id)) deleted.add(item.id);
    }

    const last = originals[originals.length - 1];
    if (last && opts.below?.length) pushAfter(last.id, opts.below);

    const ops: PlacementOp[] = [];
    for (const [id, bubble] of replaced) ops.push({ op: 'replace', id, bubble });
    for (const id of deleted) ops.push({ op: 'delete', id });

    const jobs: GapJob[] = [];
    const first = originals[0];
    if (leading.length) {
        const beforeId = deleted.has(first.id) ? successorId(timeline, first.id, deleted) : first.id;
        jobs.push({
            afterId: predecessorId(timeline, first.id, deleted),
            beforeId,
            bubbles: leading,
            sort: -1,
        });
    }
    for (const [id, bubbles] of extraAfter) {
        const idx = timeline.findIndex(item => item.id === id);
        const afterId = !deleted.has(id) ? id : predecessorId(timeline, id, deleted);
        const beforeId = successorId(timeline, id, deleted);
        jobs.push({ afterId, beforeId, bubbles, sort: idx < 0 ? originals.length : idx });
    }
    jobs.sort((a, b) => a.sort - b.sort);

    const working = timeline
        .filter(item => !deleted.has(item.id))
        .map(item => ({ ...item }));
    for (const job of jobs) {
        const gap = timestampsForGap(working, job.afterId, job.beforeId, job.bubbles.length);
        for (const shift of gap.shifts) {
            ops.push({ op: 'shift', id: shift.id, timestamp: shift.timestamp });
            const item = working.find(entry => entry.id === shift.id);
            if (item) item.timestamp = shift.timestamp;
        }
        job.bubbles.forEach((bubble, index) => {
            ops.push({ op: 'insert', timestamp: gap.timestamps[index], bubble });
        });
    }
    return ops;
}

export function bubbleFromMessage(msg: Message): Pick<Message, 'id' | 'timestamp'> {
    return { id: msg.id, timestamp: msg.timestamp };
}
