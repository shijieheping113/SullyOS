export type SullyRepairParseResult = {
    reply: string;
    fixedSource: string;
    insertAbove: string;
    insertBelow: string;
    parseError?: string;
};

export const SULLY_REPLY_MARK = '<<<SULLY_REPLY>>>';
export const SULLY_INSERT_ABOVE_MARK = '<<<SULLY_INSERT_ABOVE>>>';
export const SULLY_INSERT_BELOW_MARK = '<<<SULLY_INSERT_BELOW>>>';
export const SULLY_FIXED_MARK = '<<<SULLY_FIXED_SOURCE>>>';
export const SULLY_END_MARK = '<<<END>>>';

const SECTION_MARKS = [
    SULLY_REPLY_MARK,
    SULLY_INSERT_ABOVE_MARK,
    SULLY_INSERT_BELOW_MARK,
    SULLY_FIXED_MARK,
    SULLY_END_MARK,
] as const;

function nextMarkIndex(text: string, from: number): { mark: string; index: number } | null {
    let best: { mark: string; index: number } | null = null;
    for (const mark of SECTION_MARKS) {
        const idx = text.indexOf(mark, from);
        if (idx >= 0 && (best === null || idx < best.index)) {
            best = { mark, index: idx };
        }
    }
    return best;
}

function sliceSection(text: string, startMark: string, endExclusive: number): string {
    const start = text.indexOf(startMark);
    if (start < 0) return '';
    const contentStart = start + startMark.length;
    const end = endExclusive > contentStart ? endExclusive : text.length;
    return text.slice(contentStart, end).trim();
}

function normalizeOptionalInsert(raw: string): string {
    const s = (raw || '').trim();
    if (!s) return '';
    if (/^(无|没有|none|n\/a|—|-)$/i.test(s)) return '';
    return s;
}

export function parseSullyRepairResponse(raw: string): SullyRepairParseResult {
    const text = (raw || '').trim();
    if (!text) {
        return { reply: '', fixedSource: '', insertAbove: '', insertBelow: '', parseError: 'empty' };
    }

    const replyIdx = text.indexOf(SULLY_REPLY_MARK);
    const fixedIdx = text.indexOf(SULLY_FIXED_MARK);
    const endIdx = text.indexOf(SULLY_END_MARK);

    if (replyIdx >= 0 && fixedIdx > replyIdx) {
        const aboveIdx = text.indexOf(SULLY_INSERT_ABOVE_MARK);
        const belowIdx = text.indexOf(SULLY_INSERT_BELOW_MARK);
        const replyEnd = nextMarkIndex(text, replyIdx + SULLY_REPLY_MARK.length)?.index ?? fixedIdx;
        const reply = text.slice(replyIdx + SULLY_REPLY_MARK.length, replyEnd).trim();
        const aboveEnd = belowIdx > aboveIdx ? belowIdx : (fixedIdx > aboveIdx ? fixedIdx : text.length);
        const insertAbove = aboveIdx >= 0 && aboveIdx < fixedIdx
            ? normalizeOptionalInsert(text.slice(aboveIdx + SULLY_INSERT_ABOVE_MARK.length, aboveEnd))
            : '';
        const belowEnd = fixedIdx > belowIdx ? fixedIdx : text.length;
        const insertBelow = belowIdx >= 0 && belowIdx < fixedIdx
            ? normalizeOptionalInsert(text.slice(belowIdx + SULLY_INSERT_BELOW_MARK.length, belowEnd))
            : '';
        const fixedEnd = endIdx > fixedIdx ? endIdx : text.length;
        const fixedSource = text.slice(fixedIdx + SULLY_FIXED_MARK.length, fixedEnd).trim();
        if (fixedSource || insertAbove || insertBelow) {
            return { reply, fixedSource, insertAbove, insertBelow };
        }
    }

    const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (fenced?.[1]?.trim()) {
        return {
            reply: text.replace(fenced[0], '').trim().slice(0, 400),
            fixedSource: fenced[1].trim(),
            insertAbove: '',
            insertBelow: '',
            parseError: 'fenced-fallback',
        };
    }

    if (fixedIdx >= 0) {
        const fixedSource = text.slice(fixedIdx + SULLY_FIXED_MARK.length).replace(SULLY_END_MARK, '').trim();
        const reply = replyIdx >= 0
            ? sliceSection(text, SULLY_REPLY_MARK, fixedIdx)
            : text.slice(0, fixedIdx).trim();
        if (fixedSource) {
            return {
                reply,
                fixedSource,
                insertAbove: normalizeOptionalInsert(sliceSection(text, SULLY_INSERT_ABOVE_MARK, fixedIdx)),
                insertBelow: normalizeOptionalInsert(sliceSection(text, SULLY_INSERT_BELOW_MARK, fixedIdx)),
                parseError: 'partial-markers',
            };
        }
    }

    return {
        reply: '',
        fixedSource: '',
        insertAbove: '',
        insertBelow: '',
        parseError: 'no-fixed-source',
    };
}
