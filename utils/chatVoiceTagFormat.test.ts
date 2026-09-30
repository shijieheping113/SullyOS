import { describe, expect, it } from 'vitest';
import {
    formatChatVoiceOpenTag,
    inferChatVoiceEmotionFromSpoken,
    replaceVoiceTagSpeech,
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

describe('replaceVoiceTagSpeech（通话编辑后重读：只换念出来的那半）', () => {
    it('口白换掉，标签外的中文字幕一字不动', () => {
        const src = wrapSpokenWithOriginalChinese('こんにちは', '你好', 'calm');
        const out = replaceVoiceTagSpeech(src, 'おやすみ');
        expect(out).toContain('おやすみ</语音>');
        expect(out).toContain('<字幕>你好</字幕>');
        expect(parseVoiceOutput(out!).subtitle).toBe('你好');
        expect(parseVoiceOutput(out!).emotion).toBe('calm');
    });

    it('一个字没改也要原样写回并保住字幕（旧判据在这里把字幕弄丢过）', () => {
        const src = wrapSpokenWithOriginalChinese('こんにちは', '你好', 'calm');
        const out = replaceVoiceTagSpeech(src, 'こんにちは');
        expect(out).toBe(src);
        expect(parseVoiceOutput(out!).subtitle).toBe('你好');
    });

    it('繁体 語音 / 带属性 / 闭合标签带空格 都认', () => {
        expect(replaceVoiceTagSpeech('<語音 emotion="sad">あ</語音>\n中文', 'い'))
            .toBe('<語音 emotion="sad">い</語音>\n中文');
        expect(replaceVoiceTagSpeech('<语音>あ</ 语音 >中文', 'い'))
            .toBe('<语音>い</ 语音 >中文');
    });

    it('口白里带 $& / $1 也不会被当成替换占位符', () => {
        expect(replaceVoiceTagSpeech('<语音>あ</语音>中文', '$&$1'))
            .toBe('<语音>$&$1</语音>中文');
    });

    it('没有成对标签 → null（退路交给调用方）', () => {
        expect(replaceVoiceTagSpeech('纯中文，没有标签', 'x')).toBeNull();
        expect(replaceVoiceTagSpeech('<语音>没闭合的口白', 'x')).toBeNull();
        expect(replaceVoiceTagSpeech('', 'x')).toBeNull();
    });
});
