import { describe, expect, it } from 'vitest';
import { extractSseData, mergeTimelineSnapshots, b64ToBytes } from './fishTimestampTts';

describe('extractSseData', () => {
    it('去掉 "data:" 前缀与其后一个空格', () => {
        expect(extractSseData('data: {"a":1}')).toBe('{"a":1}');
    });
    it('无空格前缀也能认', () => {
        expect(extractSseData('data:{"a":1}')).toBe('{"a":1}');
    });
    it('跳过空行与 : 注释（心跳）', () => {
        expect(extractSseData(': keep-alive\n\ndata: {"a":1}')).toBe('{"a":1}');
    });
    it('没有 data 行 → 空串', () => {
        expect(extractSseData('event: message\nid: 1')).toBe('');
        expect(extractSseData('')).toBe('');
    });
    it('多行 data 用换行拼回（JSON 被拆行的情况）', () => {
        expect(extractSseData('data: {"a":\ndata: 1}')).toBe('{"a":\n1}');
    });
});

describe('b64ToBytes', () => {
    it('标准 base64 正常解', () => {
        expect(Array.from(b64ToBytes('QUJD'))).toEqual([65, 66, 67]);
    });
    it('URL-safe 变体（- _）先换回标准字符', () => {
        // 'ab~>' → base64 "ab4+"，其中 '+' 在 URL-safe 里写作 '-'
        const std = btoa(String.fromCharCode(0xab, 0x4b));
        const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_');
        expect(Array.from(b64ToBytes(urlSafe))).toEqual([0xab, 0x4b]);
    });
    it('缺 = 能补齐', () => {
        expect(Array.from(b64ToBytes('QUJDRA'))).toEqual(Array.from(b64ToBytes('QUJDRA==')));
    });
    it('长度余 1（非法）抛错，不静默出错数据', () => {
        expect(() => b64ToBytes('QUJDR')).toThrow();
    });
});

describe('mergeTimelineSnapshots', () => {
    it('同 chunk_seq 取最新那份（不追加），实测里第 2 条 segments 更全', () => {
        const merged = mergeTimelineSnapshots([
            { seq: 0, offset: 0, duration: 5.75, segments: [
                { text: '嗯', start: 0, end: 0.4 },
                { text: '今', start: 1.44, end: 1.6 },
            ] },
            { seq: 0, offset: 0, duration: 5.75, segments: [
                { text: '嗯', start: 0, end: 0.4 },
                { text: '今', start: 1.44, end: 1.6 },
                { text: '天', start: 1.6, end: 1.84 },
            ] },
        ]);
        expect(merged.segments.map(s => s.text)).toEqual(['嗯', '今', '天']);
        expect(merged.durationSec).toBe(5.75);
    });
    it('不同 chunk_seq 按顺序拼接，offset 加到全局时间上', () => {
        const merged = mergeTimelineSnapshots([
            { seq: 0, offset: 0, segments: [{ text: '甲', start: 0, end: 0.5 }] },
            { seq: 1, offset: 3.25, segments: [{ text: '乙', start: 0, end: 0.4 }] },
        ]);
        expect(merged.segments).toEqual([
            { text: '甲', start: 0, end: 0.5 },
            { text: '乙', start: 3.25, end: 3.65 },
        ]);
    });
    it('duration 取各 chunk 里最大的', () => {
        const merged = mergeTimelineSnapshots([
            { seq: 0, offset: 0, duration: 2, segments: [{ text: 'a', start: 0, end: 1 }] },
            { seq: 1, offset: 2, duration: 5, segments: [{ text: 'b', start: 0, end: 1 }] },
        ]);
        expect(merged.durationSec).toBe(5);
    });
    it('空输入 → 空结果（调用方据此退回估算）', () => {
        expect(mergeTimelineSnapshots([]).segments).toEqual([]);
    });
});
