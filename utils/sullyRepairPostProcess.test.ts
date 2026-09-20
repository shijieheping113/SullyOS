import { describe, expect, it } from 'vitest';
import {
    inferRepairFormatKind,
    minimalHtmlFormatRepair,
    normalizeSingleHtmlCard,
    postProcessRepairedSource,
    reorderHtmlBlockBeforeTrailingText,
    isRepairedSourcePlausible,
    sanitizeRepairReplyForDisplay,
    stripRepairLeakageTags,
    wantsFormatOnlyRepair,
} from './sullyRepairPostProcess';

describe('sullyRepairPostProcess', () => {
    it('inferRepairFormatKind 识别 HTML', () => {
        expect(inferRepairFormatKind('[html]<div>卡</div>')).toBe('html');
    });

    it('剥占位与 [html] 提示回显', () => {
        const bad = `系统记录：这是一条 HTML 卡片
要再发卡片必须用 [html]包裹真正的 HTML。
[html]<div style="padding:8px">你好</div>[/html]`;
        const out = postProcessRepairedSource(bad, 'html');
        expect(out).not.toMatch(/系统记录/);
        expect(out).not.toMatch(/要再发卡片/);
        expect(out).toMatch(/\[html\]/i);
        expect(out).toMatch(/\[\/html\]/i);
    });

    it('叠多层 [html] 收成一对', () => {
        const messy = `[html][html][html]<div>卡</div>[/html][/html][/html]`;
        const out = normalizeSingleHtmlCard(messy);
        expect(out.match(/\[html\]/gi)?.length).toBe(1);
        expect(out.match(/\[\/html\]/gi)?.length).toBe(1);
        expect(out).toContain('卡');
    });

    it('剥提示词尾巴并保留错误日志卡', () => {
        const broken = `包裹真正的 HTML。）</div><div style="font-size:11px;color:#ba7a92;">[HTML卡片] 错误日志：<br/>想念</div><div style="margin-top:10px;">—— 等待 🐾</div>[/html]`;
        const out = postProcessRepairedSource(broken, 'html');
        expect(out).not.toMatch(/包裹真正的/);
        expect(out).not.toMatch(/\[HTML卡片\]/);
        expect(out).toMatch(/^\[html\]<div/i);
        expect(out).toMatch(/\[\/html\]$/);
        expect(out).toContain('错误日志');
    });

    it('同条消息 HTML 排在文字前', () => {
        const src = '收尾话\n[html]<div>卡</div>[/html]';
        const out = reorderHtmlBlockBeforeTrailingText(src);
        expect(out.indexOf('[html]')).toBeLessThan(out.indexOf('收尾话'));
    });

    it('只修格式时保留原 style', () => {
        const card = '[html]<div style="color:pink">错误日志</div>[/html]';
        const out = postProcessRepairedSource(card, 'html', { userGoal: '只修格式不动样式' });
        expect(out).toContain('color:pink');
        expect(wantsFormatOnlyRepair('只修复成正确的格式')).toBe(true);
        expect(minimalHtmlFormatRepair('[html]<div style="color:pink">[HTML卡片] 错</div>[/html]')).not.toMatch(/\[HTML卡片\]/);
    });

    it('单层 [html] 卡片不被 tidy 打碎', () => {
        const card = '[html]<div style="max-width:270px;">错误日志</div>[/html]';
        const out = postProcessRepairedSource(card, 'html');
        expect(out).toBe(card);
    });

    it('sanitizeRepairReplyForDisplay 去掉格式标签', () => {
        const r = sanitizeRepairReplyForDisplay('好啦 [[SEND_EMOJI: 甲]] 你看 <字幕>旁白</字幕>');
        expect(r).not.toMatch(/SEND_EMOJI/);
        expect(r).not.toMatch(/字幕/);
        expect(r).toContain('好啦');
    });

    it('stripRepairLeakageTags 剥字幕', () => {
        expect(stripRepairLeakageTags('卡 [html]<div>x</div>[/html] <字幕>坏</字幕>')).not.toMatch(/字幕/);
    });

    it('isRepairedSourcePlausible HTML 须仍是卡片', () => {
        const draft = '[html]<div>卡</div>[/html]';
        expect(isRepairedSourcePlausible('<字幕>只有字幕</字幕>', draft)).toBe(false);
        expect(isRepairedSourcePlausible('[html]<div>卡</div>[/html]', draft)).toBe(true);
    });

    it('wantsFormatOnlyRepair 识别不改 html', () => {
        expect(wantsFormatOnlyRepair('不改html样式和内容，只修正成正确的卡片样式')).toBe(true);
    });

    it('文字路径保留语音与翻译标签', () => {
        const fixed = '<语音>\n你好\n</语音>\n<翻译><原文>a</原文><译文>b</译文></翻译>';
        const out = postProcessRepairedSource(fixed, 'plain');
        expect(out).toMatch(/<语音>/);
        expect(out).toMatch(/<翻译>/);
    });
});
