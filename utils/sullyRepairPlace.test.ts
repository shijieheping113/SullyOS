import { describe, expect, it } from 'vitest';
import type { RenderedBubble } from './reprocessChatMessage';
import {
    buildMarkedBubbleSource,
    parseMarkedBubbleSource,
    planRepairPlacement,
    resolveRepairSources,
    timestampsForGap,
} from './sullyRepairPlace';

function bubble(content: string): RenderedBubble {
    return { charId: 'c', role: 'assistant', type: 'text', content };
}

const timeline = [
    { id: 1, timestamp: 100 },
    { id: 2, timestamp: 200 },
    { id: 3, timestamp: 300 },
    { id: 4, timestamp: 400 },
    { id: 5, timestamp: 500 },
];
const originals = [timeline[1], timeline[3]];

describe('resolveRepairSources', () => {
    const picked = [
        { id: 2, source: '早安' },
        { id: 4, source: '晚安' },
    ];

    it('按标记把每条放回自己的 id', () => {
        const fixed = buildMarkedBubbleSource([
            { id: 2, source: '早安呀' },
            { id: 4, source: '晚安呀' },
        ]);
        expect(resolveRepairSources(picked, fixed)).toEqual([
            { id: 2, source: '早安呀' },
            { id: 4, source: '晚安呀' },
        ]);
    });

    it('标记写成无就是删掉那一条', () => {
        const fixed = `${buildMarkedBubbleSource([
            { id: 2, source: '早安' },
            { id: 4, source: '无' },
        ])}`;
        expect(resolveRepairSources(picked, fixed)).toEqual([
            { id: 2, source: '早安' },
            { id: 4, source: '' },
        ]);
    });

    it('new 标记是插在两条中间的新泡', () => {
        const fixed = [
            '<<<SULLY_BUBBLE id="2">>>',
            '早安',
            '<<<SULLY_BUBBLE id="new">>>',
            '[[SEND_EMOJI: 摸头]]',
            '<<<SULLY_BUBBLE id="4">>>',
            '晚安',
        ].join('\n');
        expect(parseMarkedBubbleSource(fixed)?.map(part => part.id)).toEqual([2, 'new', 4]);
        expect(resolveRepairSources(picked, fixed)[1]).toEqual({
            id: 'new',
            source: '[[SEND_EMOJI: 摸头]]',
        });
    });

    it('没标记但行数一样时按原来的顺序对上', () => {
        expect(resolveRepairSources(picked, '早安呀\n晚安呀')).toEqual([
            { id: 2, source: '早安呀' },
            { id: 4, source: '晚安呀' },
        ]);
    });

    it('没标记但每句还在时，按原句把稿切开', () => {
        const fixed = '<语音>早安</语音>\n晚安';
        expect(resolveRepairSources(picked, fixed)).toEqual([
            { id: 2, source: '<语音>早安</语音>' },
            { id: 4, source: '晚安' },
        ]);
    });
});

describe('planRepairPlacement', () => {
    it('只改字的两条各自留在原来的 id 上', () => {
        const ops = planRepairPlacement({
            timeline,
            originals,
            pieces: [
                { kind: 'slot', id: 2, bubbles: [bubble('早安呀')] },
                { kind: 'slot', id: 4, bubbles: [bubble('晚安呀')] },
            ],
        });
        expect(ops).toEqual([
            { op: 'replace', id: 2, bubble: bubble('早安呀') },
            { op: 'replace', id: 4, bubble: bubble('晚安呀') },
        ]);
    });

    it('删掉后面那条时，前面那条不动，中间没选中的也不动', () => {
        const ops = planRepairPlacement({
            timeline,
            originals,
            pieces: [
                { kind: 'slot', id: 2, bubbles: [bubble('早安')] },
                { kind: 'slot', id: 4, bubbles: [] },
            ],
        });
        expect(ops.map(op => op.op === 'delete' ? op.id : `${op.op}:${'id' in op ? op.id : ''}`)).toEqual([
            'replace:2',
            4,
        ]);
    });

    it('一条拆成两段时，多出来的挨在这条和下一条中间', () => {
        const ops = planRepairPlacement({
            timeline,
            originals,
            pieces: [
                { kind: 'slot', id: 2, bubbles: [bubble('上'), bubble('下')] },
                { kind: 'slot', id: 4, bubbles: [bubble('晚安')] },
            ],
        });
        const inserted = ops.find(op => op.op === 'insert');
        expect(inserted && inserted.op === 'insert' ? inserted.bubble.content : '').toBe('下');
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeGreaterThan(200);
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeLessThan(300);
        expect(ops.some(op => op.op === 'replace' && op.id === 4)).toBe(true);
    });

    it('新泡插在两条选中消息之间时，落在前一条和中间没选中的那条之间', () => {
        const ops = planRepairPlacement({
            timeline,
            originals,
            pieces: [
                { kind: 'slot', id: 2, bubbles: [bubble('早安')] },
                { kind: 'new', bubbles: [bubble('新的')] },
                { kind: 'slot', id: 4, bubbles: [bubble('晚安')] },
            ],
        });
        const inserted = ops.find(op => op.op === 'insert');
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeGreaterThan(200);
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeLessThan(300);
    });

    it('下方新增贴在最后一条选中消息后面，不是贴在第一条后面', () => {
        const ops = planRepairPlacement({
            timeline,
            originals,
            pieces: [
                { kind: 'slot', id: 2, bubbles: [bubble('早安')] },
                { kind: 'slot', id: 4, bubbles: [bubble('晚安')] },
            ],
            below: [bubble('底下')],
        });
        const inserted = ops.find(op => op.op === 'insert');
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeGreaterThan(400);
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeLessThan(500);
    });

    it('上方新增贴在第一条选中消息前面', () => {
        const ops = planRepairPlacement({
            timeline,
            originals,
            pieces: [
                { kind: 'slot', id: 2, bubbles: [bubble('早安')] },
                { kind: 'slot', id: 4, bubbles: [bubble('晚安')] },
            ],
            above: [bubble('顶上')],
        });
        const inserted = ops.find(op => op.op === 'insert');
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeGreaterThan(100);
        expect(inserted && inserted.op === 'insert' ? inserted.timestamp : 0).toBeLessThan(200);
    });
});

describe('timestampsForGap', () => {
    it('时间贴在一起时，把后面那条轻轻往后挪，新泡才挤得进去', () => {
        const packed = [
            { id: 2, timestamp: 200 },
            { id: 3, timestamp: 200 },
        ];
        const gap = timestampsForGap(packed, 2, 3, 1);
        expect(gap.timestamps).toEqual([201]);
        expect(gap.shifts).toEqual([{ id: 3, timestamp: 202 }]);
    });
});
