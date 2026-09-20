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
        expect(preview[preview.length - 1].content).toBe('blob:sorry');
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
