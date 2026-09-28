import { describe, expect, it } from 'vitest';
import {
    buildMatchableStream,
    buildLineTimings,
    resolveLineIndexByTimeline,
    type SpeechTimeline,
} from './callSpeechTimeline';

// ── 以下 segments 是 Ann 2026-09-28 实机跑出来的真实返回（模型 s2.1-pro-free，
//    句子「嗯。今天天气真不错啊。你要不要一起出去走走？」），逐字、且不含标点。 ──
const REAL_SEGMENTS = [
    { text: '嗯', start: 0, end: 0.4 },
    { text: '今', start: 1.44, end: 1.6 },
    { text: '天', start: 1.6, end: 1.84 },
    { text: '天', start: 1.84, end: 2 },
    { text: '气', start: 2, end: 2.16 },
    { text: '真', start: 2.16, end: 2.4 },
    { text: '不', start: 2.4, end: 2.56 },
    { text: '错', start: 2.56, end: 3.04 },
    { text: '啊', start: 3.04, end: 3.04 },
    { text: '你', start: 3.52, end: 3.68 },
    { text: '要', start: 3.68, end: 3.84 },
    { text: '不', start: 3.84, end: 4 },
    { text: '要', start: 4, end: 4.08 },
    { text: '一', start: 4.08, end: 4.24 },
    { text: '起', start: 4.24, end: 4.48 },
    { text: '出', start: 4.48, end: 4.64 },
    { text: '去', start: 4.64, end: 4.72 },
    { text: '走', start: 4.72, end: 5.04 },
    { text: '走', start: 5.04, end: 5.44 },
];
const REAL: SpeechTimeline = { segments: REAL_SEGMENTS, durationSec: 5.7585 };

describe('buildMatchableStream', () => {
    it('剥掉标点、空白与 [cue] 标签，只留能配对的字', () => {
        const s = buildMatchableStream(['嗯。', '今天[excited]天气']);
        // 「今天」+「天气」= 嗯今天天气（标签被剥掉，两句的标点都跳过）
        expect(s.chars.join('')).toBe('嗯今天天气');
    });
    it('记住每个字属于第几行', () => {
        const s = buildMatchableStream(['嗯。', '今天']);
        expect(s.lineOf).toEqual([0, 1, 1]);
    });
    it('纯标签的行不产生任何字符', () => {
        const s = buildMatchableStream(['[sighing]']);
        expect(s.chars).toEqual([]);
    });
});

describe('buildLineTimings', () => {
    it('每行起始时间 = 该行第一个对上的字的 start（真实数据）', () => {
        const t = buildLineTimings(['嗯。', '今天天气真不错啊。', '你要不要一起出去走走？'], REAL);
        expect(t).not.toBeNull();
        // 第 1 行首字「嗯」start=0；第 2 行首字「今」start=1.44；第 3 行首字「你」start=3.52
        expect(t![0]).toBe(0);
        expect(t![1]).toBe(1.44);
        expect(t![2]).toBe(3.52);
    });
    it('首行带 [cue] 标签时，也能对上（标签被剥掉）', () => {
        const t = buildLineTimings(['[excited] 嗯。', '今天天气真不错啊。'], REAL);
        expect(t![0]).toBe(0);
        expect(t![1]).toBe(1.44);
    });
    it('没时间轴 → null（调用方退回估算）', () => {
        expect(buildLineTimings(['嗯。', '今天。'], null)).toBeNull();
        expect(buildLineTimings(['嗯。', '今天。'], { segments: [] })).toBeNull();
    });
    it('空行数组 → null', () => {
        expect(buildLineTimings([], REAL)).toBeNull();
    });
    it('完全对不上（台词被改写）→ null，不硬凑', () => {
        const t = buildLineTimings(['ABCDEFGHIJ', 'KLMNOPQRST'], REAL);
        expect(t).toBeNull();
    });
    it('命中率过低 → null（宁可退回估算，也不用错的时间轴）', () => {
        // 5 行里只有 1 行对得上（1*2 < 5）→ 判为不可信
        const t = buildLineTimings(['嗯。', '完全不同的台词一', '另外一句', '再一句', '最后一句'], REAL);
        expect(t).toBeNull();
    });
    it('只对上一半行（2/4）→ 视为可信，逐字时间优先于估算', () => {
        const t = buildLineTimings(['嗯。', '今天天气真不错啊。', '对不上', '也'], REAL);
        expect(t).not.toBeNull();
        expect(t![0]).toBe(0);
        expect(t![1]).toBe(1.44);
        expect(t![2]).toBeNull();
    });
});

describe('resolveLineIndexByTimeline', () => {
    const t = buildLineTimings(['嗯。', '今天天气真不错啊。', '你要不要一起出去走走？'], REAL)!;

    it('0 秒 → 第 1 行', () => {
        expect(resolveLineIndexByTimeline(t, 0)).toBe(0);
        expect(resolveLineIndexByTimeline(t, 0.4)).toBe(0);
    });
    it('1.44 秒（第二行首字起点）→ 第 2 行', () => {
        expect(resolveLineIndexByTimeline(t, 1.44)).toBe(1);
    });
    it('3.52 秒 → 第 3 行', () => {
        expect(resolveLineIndexByTimeline(t, 3.52)).toBe(2);
    });
    it('末尾（5.7 秒）仍停在最后一行', () => {
        expect(resolveLineIndexByTimeline(t, 5.7)).toBe(2);
    });
    it('早于第一行 → 第 1 行，不返回 -1', () => {
        expect(resolveLineIndexByTimeline(t, 0)).toBe(0);
    });
    it('null 时间轴 → -1（调用方据此退回估算）', () => {
        expect(resolveLineIndexByTimeline(null, 1)).toBe(-1);
    });
    it('非法秒数 → -1', () => {
        expect(resolveLineIndexByTimeline(t, NaN)).toBe(-1);
    });
    it('中间有对不上的行 → 自动跳过，不卡住', () => {
        const withGap: (number | null)[] = [0, null, 3.5];
        expect(resolveLineIndexByTimeline(withGap, 0.5)).toBe(0);
        expect(resolveLineIndexByTimeline(withGap, 3.6)).toBe(2);
    });
    it('整段播放期间单调前进，不回跳', () => {
        let prev = -1;
        for (let sec = 0; sec <= 5.8; sec += 0.05) {
            const idx = resolveLineIndexByTimeline(t, sec);
            expect(idx).toBeGreaterThanOrEqual(prev);
            prev = idx;
        }
    });
});
