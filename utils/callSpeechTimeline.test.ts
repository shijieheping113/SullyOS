import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
    buildMatchableStream,
    buildLineTimings,
    lineProgressAt,
    mapLineAcross,
    resolveLineIndexByTimeline,
    type SpeechTimeline,
} from './callSpeechTimeline';
import { cleanTextForTtsFish } from './fishAudioTts';

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

describe('对号用的字表要和音频同一套清洗（传 cleanLine 时）', () => {
    it('行内舞台指示不参与配对（音频里没有它）', () => {
        const s = buildMatchableStream(
            ['（丸まって、受話器を持つ）うわあ——！'],
            cleanTextForTtsFish,
        );
        expect(s.chars.join('')).toBe('うわあ');
    });
    it('跨行的括号：两行里的那段都不参与配对（关键：切句只看标点，括号会被切成两半）', () => {
        const s = buildMatchableStream(
            ['（丸まって。', '受話器を持つ）うわあ——！'],
            cleanTextForTtsFish,
        );
        expect(s.chars.join('')).toBe('うわあ');
        // 剩下的字仍然记得自己属于第 2 行（行结构没乱）
        expect(s.lineOf).toEqual([1, 1, 1]);
    });
    it('上限 80：括号里 80 字以内删掉，超过 80 的两边都留（关键仍是两边规则一致）', () => {
        const atLimit = 'あ'.repeat(80);   // 内容正好 80 字 → 删
        const over = 'あ'.repeat(81);      // 超过 80 → 两边都留着
        expect(buildMatchableStream(['（' + atLimit + '）うん'], cleanTextForTtsFish).chars.join('')).toBe('うん');
        expect(buildMatchableStream(['（' + over + '）うん'], cleanTextForTtsFish).chars.join('')).toBe(over + 'うん');
    });
    it('钉住：算出来的字表 == 把整条交给音频清洗函数之后的字表', () => {
        const cases: string[][] = [
            ['（丸まって、受話器を持つ）うわあ——！'],
            ['（丸まって。', '受話器を持つ）うわあ——！'],
            ['（小声で、うん……', '）やばい'],
            ['（' + 'あ'.repeat(60) + '）うん'],
            ['(laughs) うわあ', '[excited] そうだね'],
            ['（丸まって、受話器を落としそうになりながら、しっぽをお腹の下にぎゅっと巻き込む）うわあ'],
        ];
        for (const lines of cases) {
            const ours = buildMatchableStream(lines, cleanTextForTtsFish).chars.join('');
            // 音频那边：整条文本交给清洗函数，再走同一个字表（不带 cleanLine）
            const audioSide = buildMatchableStream([cleanTextForTtsFish(lines.join('\n'))]).chars.join('');
            expect(ours).toBe(audioSide);
        }
    });
    it('跨行括号时，后面的行照样拿得到秒数（不再整段退回估算）', () => {
        const timeline: SpeechTimeline = {
            segments: [
                { text: 'う', start: 0, end: 0.2 },
                { text: 'わ', start: 0.2, end: 0.4 },
                { text: 'あ', start: 0.4, end: 0.6 },
                { text: '助', start: 2, end: 2.2 },
            ],
        };
        const t = buildLineTimings(
            ['（丸まって。', '受話器を持つ）うわあ——！', '助けて'],
            timeline,
            cleanTextForTtsFish,
        );
        expect(t).not.toBeNull();
        expect(t![0]).toBeNull();   // 这行的字音频里没有 → 没有起始时间（滚动跳过它）
        expect(t![1]).toBe(0);
        expect(t![2]).toBe(2);
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

describe('双语摊行：原文句数 ≠ 字幕句数（日语 3 句 / 中文字幕 10 句）', () => {
    // 真实场景：声音念外语原文（3 句），屏幕上是中文翻译（10 行），一句原文摊成好几句字幕。
    // 这里沿用 Ann 实测的那 3 句 + 真实 segments 保证对得上；摊行逻辑本身跟语言无关。
    const spoken3 = ['嗯。', '今天天气真不错啊。', '你要不要一起出去走走？'];
    const t = buildLineTimings(spoken3, REAL)!;

    it('句数相同 → 原样返回，单语路径一个字不变', () => {
        expect(mapLineAcross(0, 3, 3, 0.5)).toBe(0);
        expect(mapLineAcross(2, 3, 3, 0.9)).toBe(2);
    });

    it('原文第 2 句没念完时，字幕已经走到它那一段的中间几行（不再整段偏慢）', () => {
        const idx = 1;   // 原文第 2 句（1.44s 起）
        expect(mapLineAcross(idx, 3, 10, 0)).toBe(3);      // 刚开口 → 字幕第 4 行
        expect(mapLineAcross(idx, 3, 10, 0.5)).toBe(5);    // 念到一半 → 字幕第 6 行
        expect(mapLineAcross(idx, 3, 10, 1)).toBe(6);      // 快念完 → 字幕第 7 行
    });

    it('映射结果永远落在字幕行范围内，不会越界', () => {
        for (let i = 0; i < 3; i += 1) {
            for (const r of [0, 0.25, 0.5, 0.75, 1, -1, 9, NaN]) {
                const at = mapLineAcross(i, 3, 10, r);
                expect(at).toBeGreaterThanOrEqual(0);
                expect(at).toBeLessThanOrEqual(9);
            }
        }
    });

    it('整段播放期间中文行号单调前进，不回跳', () => {
        let prev = -1;
        for (let sec = 0; sec <= 5.8; sec += 0.05) {
            const at = resolveLineIndexByTimeline(t, sec);
            const line = mapLineAcross(at, 3, 10, lineProgressAt(t, at, sec, REAL.durationSec));
            expect(line).toBeGreaterThanOrEqual(prev);
            prev = line;
        }
    });

    it('lineProgressAt：句内进度 0 → 1，最后一句用整段总时长', () => {
        expect(lineProgressAt(t, 0, 0)).toBe(0);
        expect(lineProgressAt(t, 0, 0.72)).toBeCloseTo(0.5, 1);
        expect(lineProgressAt(t, 0, 1.44)).toBe(1);
        // 最后一句 3.52s 起，整段 5.7585s → 走到一半约 0.5
        expect(lineProgressAt(t, 2, 4.64, REAL.durationSec)).toBeCloseTo(0.5, 1);
        // 对不上时间轴 / 非法秒数时给个安全的边界值，不返回 NaN
        expect(lineProgressAt(null, 0, 1)).toBe(1);
        expect(lineProgressAt(t, 0, NaN)).toBe(0);
        expect(lineProgressAt([0, null, 3.5], 1, 2)).toBe(1);
    });
});

describe('钉住：双语摊行的接线（直接读 VoicePhoneB 源码）', () => {
    const src = readFileSync(path.join(process.cwd(), 'components/call/VoicePhoneB.tsx'), 'utf8');

    it('位置一律按原文算，再 mapLineAcross 摊到字幕行', () => {
        expect(src).toContain('mapLineAcross(atLine, spoken.length, useLines.length');
        expect(src).toContain('resolveSpeakingLineProgress(estimateLines');
    });

    it('不许退回「句数相同才敢用原文、否则拿中文字数猜」的老写法', () => {
        expect(src).not.toContain('const aligned = !!spokenLines');
    });
});

describe('括号上限：音频侧与对位侧必须同一条（Ann 定为 80）', () => {
    const fish = readFileSync(path.join(process.cwd(), 'utils/fishAudioTts.ts'), 'utf8');
    const align = readFileSync(path.join(process.cwd(), 'utils/callSpeechTimeline.ts'), 'utf8');

    it('两边都写 80，不许只改单边（单边一改字表就和音频不一致）', () => {
        expect(fish).toContain('（[^）]{0,80}）');
        expect(align).toContain('（[^）]{0,80}）');
    });

    it('60 字的舞台指示会被删掉（以前 48 上限漏掉它 → 没被念的字留在字表里 → 整条时间轴作废）', () => {
        const long = '（' + 'あ'.repeat(58) + '）';   // 60 字：48 的上限删不掉，80 能
        expect(long.length).toBe(60);
        expect(cleanTextForTtsFish(long)).toBe('');
        const s = buildMatchableStream([long + 'うわあ'], cleanTextForTtsFish);
        expect(s.chars.join('')).toBe('うわあ');
    });
});
