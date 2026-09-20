import { describe, expect, it } from 'vitest';
import { parseSullyRepairResponse } from './sullyRepairParse';

describe('parseSullyRepairResponse', () => {
    it('解析标准三段标记', () => {
        const raw = `<<<SULLY_REPLY>>>
嗯嗯修好了
<<<SULLY_FIXED_SOURCE>>>
[[SEND_EMOJI: 甲]]
<<<END>>>`;
        const r = parseSullyRepairResponse(raw);
        expect(r.reply).toContain('修好了');
        expect(r.fixedSource).toContain('SEND_EMOJI');
        expect(r.parseError).toBeUndefined();
    });

    it('缺标记时不把全文当 fixedSource 或 reply', () => {
        const r = parseSullyRepairResponse('猫儿在说话\n没有标记');
        expect(r.fixedSource).toBe('');
        expect(r.reply).toBe('');
        expect(r.parseError).toBe('no-fixed-source');
    });

    it('fenced fallback', () => {
        const raw = '好了\n```\n<div>卡</div>\n```';
        const r = parseSullyRepairResponse(raw);
        expect(r.fixedSource).toContain('<div>');
    });

    it('解析上下插泡标记', () => {
        const raw = `<<<SULLY_REPLY>>>
好
<<<SULLY_INSERT_ABOVE>>>
[[SEND_EMOJI: 开心]]
<<<SULLY_INSERT_BELOW>>>
无
<<<SULLY_FIXED_SOURCE>>>
原文
<<<END>>>`;
        const r = parseSullyRepairResponse(raw);
        expect(r.insertAbove).toContain('SEND_EMOJI');
        expect(r.insertBelow).toBe('');
        expect(r.fixedSource).toBe('原文');
    });
});
