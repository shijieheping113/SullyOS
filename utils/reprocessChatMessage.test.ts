import { describe, expect, it } from 'vitest';
import type { CharacterProfile, Message } from '../types';
import { dryRunReprocessMessage, reprocessSourceToBubbles } from './reprocessChatMessage';

const char: CharacterProfile = {
    id: 'c1',
    name: 'Test',
    avatar: '',
    description: '',
    systemPrompt: '',
    htmlModeEnabled: true,
} as CharacterProfile;

describe('reprocessChatMessage', () => {
    it('dryRun 拆出 text + emoji + html_card', () => {
        const original: Message = {
            id: 1,
            charId: 'c1',
            role: 'assistant',
            type: 'text',
            content: 'old',
            timestamp: 1000,
        };
        const source = '你好[[SEND_EMOJI: 测试表情]][html]<div>卡</div>[/html]';
        const preview = dryRunReprocessMessage(original, {
            char,
            emojis: [{ name: '测试表情', url: 'https://example.com/e.png' }],
            categories: [],
            source,
        });
        const types = preview.map(p => p.type);
        expect(types).toContain('text');
        expect(types).toContain('emoji');
        expect(types).toContain('html_card');
    });

    it('括号发送了表情 + 库里有名 → emoji 泡', () => {
        const original: Message = {
            id: 4,
            charId: 'c1',
            role: 'assistant',
            type: 'text',
            content: '',
            timestamp: 4000,
        };
        const source =
            '你还是识别不出问题啊！……唔唔。（猫儿发送了表情：Sully对不起）';
        const preview = dryRunReprocessMessage(original, {
            char,
            emojis: [{ name: 'Sully对不起', url: 'https://example.com/sorry.png' }],
            categories: [],
            source,
        });
        expect(preview.some(p => p.type === 'emoji' && p.content.includes('sorry.png'))).toBe(true);
        expect(preview.some(p => p.type === 'text' && p.content.includes('识别不出'))).toBe(true);
    });

    it('[表情：名] 展示占位也能落成 emoji 泡', () => {
        const original: Message = {
            id: 5,
            charId: 'c1',
            role: 'assistant',
            type: 'text',
            content: '前言[表情：Sully对不起]',
            timestamp: 5000,
        };
        const preview = dryRunReprocessMessage(original, {
            char,
            emojis: [{ name: 'Sully对不起', url: 'blob:sorry' }],
            categories: [],
            source: original.content,
        });
        expect(preview.filter(p => p.type === 'emoji')).toHaveLength(1);
        expect(preview.some(p => p.type === 'emoji' && p.content === 'blob:sorry')).toBe(true);
        expect(preview.some(p => p.type === 'text' && p.content.includes('前言'))).toBe(true);
    });

    it('翻译标签落成双语气泡，不再变成普通文字', () => {
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: '<翻译><原文>能看到，就是每次消息前面系统塞的那一坨</原文><译文>見えてるよ、メッセージのたびにシステムが頭に詰め込んでくるあれでしょ</译文></翻译>',
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].type).toBe('text');
        expect(bubbles[0].content).toBe(
            '能看到，就是每次消息前面系统塞的那一坨\n%%BILINGUAL%%\n見えてるよ、メッセージのたびにシステムが頭に詰め込んでくるあれでしょ',
        );
    });

    it('语音和字幕留在同一条里，字幕不会被丢掉', () => {
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: '<语音>見えてるよ</语音>\n<字幕>能看到</字幕>',
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content).toContain('<语音>見えてるよ</语音>');
        expect(bubbles[0].content).toContain('<字幕>能看到</字幕>');
    });

    it('库里的双语记号再渲染时仍是一条，不会按行拆开', () => {
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: '能看到，就是每次消息前面系统塞的那一坨\n%%BILINGUAL%%\n見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ',
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content).toBe(
            '能看到，就是每次消息前面系统塞的那一坨\n%%BILINGUAL%%\n見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ',
        );
    });

    it('双语再改成语音时只留一条语音，不再带出 %%BILINGUAL%%', () => {
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: [
                '<语音>見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</语音>',
                '<字幕>能看到，就是每次消息前面系统塞的那一坨</字幕>',
                '能看到，就是每次消息前面系统塞的那一坨',
                '%%BILINGUAL%%',
                '見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ',
            ].join('\n'),
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content).toContain('<语音>見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</语音>');
        expect(bubbles[0].content).toContain('<字幕>能看到，就是每次消息前面系统塞的那一坨</字幕>');
        expect(bubbles[0].content).not.toContain('%%BILINGUAL%%');
    });

    it('记号被塞进字幕里时，字幕只留中文那半边', () => {
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: [
                '<语音>見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</语音>',
                '<字幕>能看到，就是每次消息前面系统塞的那一坨',
                '%%BILINGUAL%%',
                '見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</字幕>',
            ].join('\n'),
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content).toContain('<字幕>能看到，就是每次消息前面系统塞的那一坨</字幕>');
        expect(bubbles[0].content).not.toContain('%%BILINGUAL%%');
    });

    it('字幕里同一句写了两行，渲染后中文只留一遍', () => {
        const cn = '能看到，就是每次消息前面系统塞的那一坨';
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: `<语音>見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</语音>\n<字幕>${cn}\n${cn}</字幕>`,
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content.split(cn).length - 1).toBe(1);
    });

    it('连着两枚字幕标签不会再拆出一条纯文字', () => {
        const cn = '能看到，就是每次消息前面系统塞的那一坨';
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: [
                '<语音>見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</语音>',
                `<字幕>${cn}</字幕>`,
                `<字幕>${cn}</字幕>`,
            ].join('\n'),
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content.split(cn).length - 1).toBe(1);
    });

    it('语音前后各写一枚字幕，中文也只留一遍', () => {
        const cn = '能看到，就是每次消息前面系统塞的那一坨';
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: [
                `<字幕>${cn}</字幕>`,
                '<语音>見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</语音>',
                `<字幕>${cn}</字幕>`,
            ].join('\n'),
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0].content.split(cn).length - 1).toBe(1);
    });

    it('语音旁边另一句不相关的双语还在', () => {
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: [
                '<语音>おはよう</语音>',
                '<字幕>早安</字幕>',
                '<翻译><原文>另一句完全不同的话呀</原文><译文>これは別の文ですよ</译文></翻译>',
            ].join('\n'),
            role: 'assistant',
        });
        expect(bubbles).toHaveLength(2);
        expect(bubbles.some(b => b.content.includes('<语音>おはよう</语音>'))).toBe(true);
        expect(bubbles.some(b => b.content.includes('%%BILINGUAL%%') && b.content.includes('另一句完全不同的话呀'))).toBe(true);
    });

    it('plain composeKind 落纯 text', () => {
        const original: Message = {
            id: 6,
            charId: 'c1',
            role: 'assistant',
            type: 'text',
            content: '',
            timestamp: 6000,
        };
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis: [],
            categories: [],
            source: '你好\n第二行',
            role: 'assistant',
            composeKind: 'plain',
        });
        expect(bubbles.every(b => b.type === 'text')).toBe(true);
        expect(bubbles.map(b => b.content)).toEqual(['你好', '第二行']);
    });

    it('混排历史表情语法拆多泡', () => {
        const original: Message = {
            id: 2,
            charId: 'c1',
            role: 'assistant',
            type: 'text',
            content: '',
            timestamp: 2000,
        };
        const source = '你好[x 发送了表情包: 测试表情]再见';
        const preview = dryRunReprocessMessage(original, {
            char,
            emojis: [{ name: '测试表情', url: 'https://example.com/e.png' }],
            categories: [],
            source,
        });
        expect(preview.length).toBeGreaterThanOrEqual(3);
    });

    it('系统记录占位 + 真 html 卡', () => {
        const original: Message = {
            id: 3,
            charId: 'c1',
            role: 'assistant',
            type: 'text',
            content: '',
            timestamp: 3000,
        };
        const leak = '（系统记录：你先前发送过一张 HTML 卡片，已在界面渲染；卡片文字摘要——测试。这只是历史占位，请勿复述本行。）';
        const source = `${leak}\n[html]<div>真卡</div>[/html]`;
        const preview = dryRunReprocessMessage(original, {
            char,
            emojis: [],
            categories: [],
            source,
        });
        expect(preview.some(p => p.type === 'html_card')).toBe(true);
    });
});
