import { describe, expect, it } from 'vitest';
import {
    buildSullyRepairSystemPrompt,
    repairPromptNeedsEmojiCatalog,
} from './sullyRepairPrompt';

describe('sullyRepairPrompt', () => {
    it('修 HTML 时注入作者 htmlPrompt 设计规范', () => {
        const sys = buildSullyRepairSystemPrompt('Ann', '[html]<div>卡</div>[/html]', '粉调圆润');
        expect(sys).toContain('视觉审美准则');
        expect(sys).toContain('最外层 `<div>` 绝对不要加 `box-shadow`');
        expect(sys).toContain('## 用户自定义补充');
        expect(sys).toContain('粉调圆润');
        expect(sys).toContain('htmlPrompt 同源');
    });

    it('纯文字不修时不塞整段 HTML 审美', () => {
        const sys = buildSullyRepairSystemPrompt('Ann', '你好呀');
        expect(sys).not.toContain('视觉审美准则');
        expect(sys).not.toContain('各自留在原位');
    });

    it('多条带位置标记时才要求按原位交回', () => {
        const sys = buildSullyRepairSystemPrompt('Ann', '<<<SULLY_BUBBLE id="2">>>\n早安\n<<<SULLY_BUBBLE id="4">>>\n晚安');
        expect(sys).toContain('各自留在原位');
        expect(sys).toContain('<<<SULLY_BUBBLE id="new">>>');
        expect(sys).toContain('禁止把多条并成一条');
    });

    it('涉及语音时注入与主聊天同源的语气规范', () => {
        const sys = buildSullyRepairSystemPrompt(
            'Ann',
            '嗯嗯',
            undefined,
            { chatVoiceEnabled: true },
            '转成语音消息',
        );
        expect(sys).toContain('语音消息 — 与主聊天 chatPrompts 同源');
        expect(sys).toContain('让它听起来像活人在说话');
        expect(sys).toContain('<语音>');
    });

    it('纯文字且未提语音时不塞整段语音规范', () => {
        const sys = buildSullyRepairSystemPrompt('Ann', '你好呀', undefined, { chatVoiceEnabled: true }, '');
        expect(sys).not.toContain('让它听起来像活人在说话');
    });

    it('修语音未提表情时不注入表情库', () => {
        expect(repairPromptNeedsEmojiCatalog('<语音>嗯</语音>', '补语气')).toBe(false);
        expect(repairPromptNeedsEmojiCatalog('你好', '下面加个合适的表情')).toBe(true);
    });
});
