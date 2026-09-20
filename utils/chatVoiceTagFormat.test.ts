import { describe, expect, it } from 'vitest';
import {
    formatChatVoiceOpenTag,
    inferChatVoiceEmotionFromSpoken,
    wrapSpokenWithOriginalChinese,
} from './chatVoiceTagFormat';
import { parseVoiceOutput } from './minimaxTts';

describe('wrapSpokenWithOriginalChinese', () => {
    it('口白进语音标签，中文原文进字幕', () => {
        const src = wrapSpokenWithOriginalChinese('[sad] こんにちは', '你好', 'sad');
        expect(src).toContain(`${formatChatVoiceOpenTag('sad')}[sad] こんにちは</语音>`);
        expect(src).toContain('<字幕>你好</字幕>');
        const parsed = parseVoiceOutput(src);
        expect(parsed.hasVoiceTag).toBe(true);
        expect(parsed.emotion).toBe('sad');
        expect(parsed.subtitle).toBe('你好');
    });

    it('无情绪时用裸 <语音>', () => {
        const src = wrapSpokenWithOriginalChinese('hello', '你好');
        expect(src.startsWith('<语音>hello</语音>')).toBe(true);
        expect(parseVoiceOutput(src).emotion).toBeUndefined();
    });
});

describe('inferChatVoiceEmotionFromSpoken', () => {
    it('认 [sad]，excited 当成 happy，其它鱼声词不写', () => {
        expect(inferChatVoiceEmotionFromSpoken('[sad] こんにちは')).toBe('sad');
        expect(inferChatVoiceEmotionFromSpoken('[excited] hi')).toBe('happy');
        expect(inferChatVoiceEmotionFromSpoken('[soft] hi')).toBeUndefined();
        expect(inferChatVoiceEmotionFromSpoken('plain')).toBeUndefined();
    });
});
