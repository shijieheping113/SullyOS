import { describe, expect, it } from 'vitest';
import { ChatParser } from './chatParser';
import {
    diagnoseMessageFormat,
    normalizeStickerForRepair,
    promoteLinesToBubbleBoundaries,
    stripHtmlPromptLeaks,
    sullyFormatTidy,
} from './sullyMessageFormat';

describe('sullyMessageFormat', () => {
    it('diagnose 语音标签未配对', () => {
        const issues = diagnoseMessageFormat('<语音>你好', { type: 'text' });
        expect(issues.some(i => i.id === 'voice-unbalanced')).toBe(true);
    });

    it('叙述句发送表情包应诊断并整理', () => {
        const raw = '我刚才发送了表情包：咬你';
        expect(diagnoseMessageFormat(raw, { type: 'text' }).some(i => i.id === 'emoji-narrative')).toBe(true);
        expect(normalizeStickerForRepair(raw)).toContain('[[SEND_EMOJI: 咬你]]');
    });

    it('括号内发送了表情（无「包」）应整理并拆泡', () => {
        const raw =
            '你还是识别不出问题啊！……唔唔。（猫儿发送了表情：Sully对不起）';
        expect(diagnoseMessageFormat(raw, { type: 'text' }).some(i => i.id === 'emoji-paren-sent')).toBe(true);
        const { text } = sullyFormatTidy(raw, { scope: 'emoji' });
        expect(text).toContain('[[SEND_EMOJI: Sully对不起]]');
        expect(text).not.toContain('发送了表情');
        const parts = ChatParser.splitResponse(sullyFormatTidy(raw).text);
        expect(parts.length).toBeGreaterThanOrEqual(2);
    });

    it('混排表情 tidy 后可 split', () => {
        const raw = '你好[x 发送了表情包: 甲]再见';
        const { text } = sullyFormatTidy(raw, { scope: 'all' });
        const parts = ChatParser.splitResponse(text);
        expect(parts.length).toBeGreaterThanOrEqual(2);
    });

    it('剥 HTML 系统记录占位', () => {
        const leak = '（系统记录：你先前发送过一张 HTML 卡片，已在界面渲染；卡片文字摘要——测试。这只是历史占位，请勿复述本行；要再发卡片必须用 [html]...[/html] 包裹真正的 HTML。）';
        const card = '[html]<div>真卡</div>[/html]';
        const cleaned = stripHtmlPromptLeaks(`${leak}\n${card}`);
        expect(cleaned).not.toContain('系统记录');
        expect(cleaned).toContain('[html]');
    });

    it('promoteLinesToBubbleBoundaries 保留多行', () => {
        const out = promoteLinesToBubbleBoundaries('第一行\n第二行');
        expect(out).toContain('第一行');
        expect(out).toContain('第二行');
    });

    it('tidy 修好语音闭合', () => {
        const { text } = sullyFormatTidy('<语音>你好', { scope: 'voice' });
        expect(text).toContain('</语音>');
    });
});
