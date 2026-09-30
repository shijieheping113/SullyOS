import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
    countLatinSyllables,
    estimateLineMs,
    estimateLinesTotalMs,
    resolveSpeakingLineIndex,
    resolveSpeakingLineProgress,
} from './callSpeechTiming';

describe('countLatinSyllables', () => {
    it('counts a simple word as one syllable', () => {
        expect(countLatinSyllables('hi')).toBe(1);
    });
    it('counts vowel groups', () => {
        expect(countLatinSyllables('beautiful')).toBe(3);
        expect(countLatinSyllables('happy')).toBe(2);
    });
    it('drops a silent trailing e', () => {
        expect(countLatinSyllables('time')).toBe(1);
        expect(countLatinSyllables('make')).toBe(1);
    });
    it('never returns zero for a non-empty word', () => {
        expect(countLatinSyllables('rhythm')).toBeGreaterThanOrEqual(1);
        expect(countLatinSyllables('sh')).toBeGreaterThanOrEqual(1);
    });
    it('empty word is zero', () => {
        expect(countLatinSyllables('')).toBe(0);
    });
});

describe('estimateLineMs', () => {
    it('empty / blank line costs nothing', () => {
        expect(estimateLineMs('')).toBe(0);
        expect(estimateLineMs('   ')).toBe(0);
    });
    it('a longer sentence costs more than a shorter one', () => {
        expect(estimateLineMs('我今天下班特别早')).toBeGreaterThan(estimateLineMs('嗯'));
    });
    it('a full stop adds more time than a comma', () => {
        expect(estimateLineMs('好。')).toBeGreaterThan(estimateLineMs('好，'));
    });
    it('a latin word costs more than a single han character', () => {
        expect(estimateLineMs('beautiful')).toBeGreaterThan(estimateLineMs('猫'));
    });
    it('punctuation-only content still gets some time', () => {
        expect(estimateLineMs('…')).toBeGreaterThan(0);
    });
});

describe('estimateLinesTotalMs', () => {
    it('sums the individual lines', () => {
        const lines = ['你今天怎么样？', '还行吧。'];
        expect(estimateLinesTotalMs(lines))
            .toBe(estimateLineMs(lines[0]) + estimateLineMs(lines[1]));
    });
    it('empty list is zero', () => {
        expect(estimateLinesTotalMs([])).toBe(0);
    });
});

describe('resolveSpeakingLineIndex', () => {
    const lines = ['嗯。', '我今天下班特别早，想去逛逛超市，买点菜回来做饭。', '好啊。'];

    it('no lines means no active line', () => {
        expect(resolveSpeakingLineIndex([], 0.5)).toBe(-1);
    });
    it('progress 0 highlights the first line', () => {
        expect(resolveSpeakingLineIndex(lines, 0)).toBe(0);
    });
    it('progress 1 highlights the last line', () => {
        expect(resolveSpeakingLineIndex(lines, 1)).toBe(2);
    });
    it('the short first line is left behind long before the midpoint', () => {
        // 「嗯。」按预计时长只占整段的 8.8%（旧算法按字数也差不多，但长句/英文词会严重失衡）。
        // 关键断言：进度 5% 时还停在第 1 句，进度 10% 才推进到长句。
        expect(resolveSpeakingLineIndex(lines, 0.05)).toBe(0);
        expect(resolveSpeakingLineIndex(lines, 0.1)).toBe(1);
    });
    it('stays on the long middle line across the middle of playback', () => {
        expect(resolveSpeakingLineIndex(lines, 0.4)).toBe(1);
        expect(resolveSpeakingLineIndex(lines, 0.6)).toBe(1);
    });
    it('reaches the last line only near the end', () => {
        expect(resolveSpeakingLineIndex(lines, 0.95)).toBe(2);
    });
    it('walks forward monotonically as progress advances', () => {
        let previous = -1;
        for (let p = 0; p <= 1.0001; p += 0.01) {
            const idx = resolveSpeakingLineIndex(lines, p);
            expect(idx).toBeGreaterThanOrEqual(previous);
            previous = idx;
        }
    });
    it('UI 方向：字幕太快→▲→负号，字幕太慢→▼→正号', () => {
        // 数值侧：shifted = p + offset，所以 offset 为**负** = 进度往回 = 字幕**更晚/更慢**。
        // UI 侧：▲（往后拖）必须让 step 变**负**，▼（往前赶）必须让 step 变**正**。
        // 也就是说：拖后 → 字幕不再抢跑；往前 → 字幕追上去。
        // 这条锁死 VoicePhoneB 的 ▲ = setSpeed(step-1)、▼ = setSpeed(step+1)，
        // 防止再出现「箭头语义和数字符号对不上」。
        const src = readFileSync(path.resolve(__dirname, '../components/call/VoicePhoneB.tsx'), 'utf8');
        const up = src.match(/aria-label="字幕往后拖一点"[\s\S]{0,400}?setSpeed\(speedStep ([+-]) 1\)/);
        const down = src.match(/aria-label="字幕往前赶一点"[\s\S]{0,400}?setSpeed\(speedStep ([+-]) 1\)/);
        expect(up).not.toBeNull();
        expect(down).not.toBeNull();
        expect(up![1]).toBe('-');   // ▲ 往回拖 → step 变负 → 字幕变慢
        expect(down![1]).toBe('+'); // ▼ 往前赶 → step 变正 → 字幕变早
    });
    it('a positive offset moves the highlight earlier, a negative one later', () => {
        // 实测边界（weights 505 / 4545 / 690，总 5740）：
        //   p=0.08 → 第1句；+0.24 后 → 第2句（字幕提前了）
        //   p=0.10 → 第2句；-0.24 后 → 第1句（字幕拖后了）
        expect(resolveSpeakingLineIndex(lines, 0.08)).toBe(0);
        expect(resolveSpeakingLineIndex(lines, 0.08, 0.24)).toBe(1);
        expect(resolveSpeakingLineIndex(lines, 0.10)).toBe(1);
        expect(resolveSpeakingLineIndex(lines, 0.10, -0.24)).toBe(0);
    });
    it('the offset actually changes the result (regression: it used to be a no-op)', () => {
        // 旧实现把 offset 当缩放系数去缩放每句权重 —— 全部同比缩放，比值不变，
        // 定位结果恒等，等于白调。这里逐档验证「调了就有区别」。
        const seen = new Set<number>();
        for (let step = -6; step <= 6; step += 1) {
            seen.add(resolveSpeakingLineIndex(lines, 0.08, step * 0.04));
        }
        expect(seen.size).toBeGreaterThan(1);
    });
    it('the offset shifts the whole walk, not just one boundary', () => {
        // 满档 ±0.24 会把整条推进曲线平移：提前档更早进入下一句，拖后档更晚。
        const enterSecond = (offset: number) => {
            for (let p = 0; p <= 1.0001; p += 0.01) {
                if (resolveSpeakingLineIndex(lines, p, offset) === 1) return p;
            }
            return 1;
        };
        expect(enterSecond(0.24)).toBeLessThan(enterSecond(0));
        expect(enterSecond(-0.24)).toBeGreaterThan(enterSecond(0));
    });
    it('out-of-range progress is clamped, not crashed on', () => {
        expect(resolveSpeakingLineIndex(lines, -1)).toBe(0);
        expect(resolveSpeakingLineIndex(lines, 5)).toBe(2);
    });
    it('a huge offset is clamped to the ends instead of overflowing', () => {
        expect(resolveSpeakingLineIndex(lines, 0.5, 99)).toBe(2);
        expect(resolveSpeakingLineIndex(lines, 0.5, -99)).toBe(0);
    });
    it('a non-finite offset is ignored rather than producing NaN', () => {
        expect(resolveSpeakingLineIndex(lines, 0.5, NaN))
            .toBe(resolveSpeakingLineIndex(lines, 0.5, 0));
    });
});

describe('resolveSpeakingLineProgress（双语摊行要的句内进度）', () => {
    const lines = ['嗯。', '今天天气真不错啊。', '你要不要一起出去走走？'];

    it('index 与 resolveSpeakingLineIndex 逐点一致（后者就是取它的 index）', () => {
        for (const p of [0, 0.05, 0.1, 0.5, 0.9, 1]) {
            for (const off of [0, 0.2, -0.2]) {
                expect(resolveSpeakingLineProgress(lines, p, off).index)
                    .toBe(resolveSpeakingLineIndex(lines, p, off));
            }
        }
    });

    it('句内进度从 0 往 1 走', () => {
        const early = resolveSpeakingLineProgress(lines, 0.02);
        expect(early.index).toBe(0);
        expect(early.ratio).toBeGreaterThanOrEqual(0);
        expect(early.ratio).toBeLessThan(0.5);
        const late = resolveSpeakingLineProgress(lines, 0.99);
        expect(late.index).toBe(2);
        expect(late.ratio).toBeGreaterThan(0.5);
        expect(late.ratio).toBeLessThanOrEqual(1);
    });

    it('边界：空数组 / 进度越界 / 非法偏移都不炸', () => {
        expect(resolveSpeakingLineProgress([], 0.5)).toEqual({ index: -1, ratio: 0 });
        expect(resolveSpeakingLineProgress(lines, -1)).toEqual({ index: 0, ratio: 0 });
        expect(resolveSpeakingLineProgress(lines, 2)).toEqual({ index: 2, ratio: 1 });
        expect(Number.isFinite(resolveSpeakingLineProgress(lines, 0.5, NaN).ratio)).toBe(true);
    });
});
