import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIConfig } from '../types';
import { FISH_VOICE_ACTING_GUIDE } from './fishAudioTts';
import { safeFetchJson } from './safeApi';
import { secondaryLlmCall } from './secondaryLlmCall';
import {
    VOICE_LANG_TRANSLATE_TEMPERATURE,
    VOICE_LANG_TRANSLATE_TIMEOUT_MS,
    applyLongpressTranslateResult,
    buildDateVoiceLangTranslateSystemPrompt,
    buildVoiceLangTranslateSystemPrompt,
    translateVoiceLangText,
} from './voiceLangTranslate';
import { wrapSpokenWithOriginalChinese } from './chatVoiceTagFormat';

vi.mock('./secondaryLlmCall', () => ({
    secondaryLlmCall: vi.fn(),
}));

vi.mock('./safeApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./safeApi')>();
    return { ...actual, safeFetchJson: vi.fn() };
});

const mainConfig = (): APIConfig => ({
    baseUrl: 'https://main.example.com/v1',
    apiKey: 'main-key',
    model: 'main-model',
});

const secondary = {
    enabled: true,
    baseUrl: 'https://sec.example.com/v1',
    apiKey: 'sec-key',
    model: 'sec-model',
};

describe('buildVoiceLangTranslateSystemPrompt', () => {
    it('作者原句保留；日语加假名英文句；胶水层不对模型提字幕', () => {
        const ja = buildVoiceLangTranslateSystemPrompt('ja');
        const head = ja.split('Follow the guide')[0];
        expect(ja).toContain('Translate the following text to 日本語');
        expect(ja).toContain('Output ONLY the translation, nothing else');
        expect(ja).toContain('do not use kanji');
        expect(ja).toContain('hiragana and katakana');
        expect(head).not.toContain('字幕');
        expect(head).not.toContain('口播');
        expect(head).not.toContain('自定义');
        expect(head).not.toContain('<语音>');
        expect(buildVoiceLangTranslateSystemPrompt('en')).not.toContain('kanji');
    });

    it('无自定义时拼默认鱼声指南，胶水不提自定义', () => {
        const ja = buildVoiceLangTranslateSystemPrompt('ja', {
            apiConfig: { ttsProvider: 'fishaudio', voicePrompts: {} },
        });
        expect(ja).toContain('Follow the guide below for pauses and delivery marks');
        expect(ja).toContain(FISH_VOICE_ACTING_GUIDE);
        expect(ja).toContain('让它听起来像活人在说话');
        expect(ja).not.toContain('用户自定义');
    });

    it('有自定义只拼用户那一份，仍用同一句胶水', () => {
        const apiConfig = {
            ttsProvider: 'fishaudio' as const,
            voicePrompts: { fishaudio: 'ONLY_CUSTOM_MARKER' },
        };
        const ja = buildVoiceLangTranslateSystemPrompt('ja', { apiConfig });
        expect(ja).toContain('ONLY_CUSTOM_MARKER');
        expect(ja).toContain('Follow the guide below for pauses and delivery marks');
        expect(ja).not.toContain(FISH_VOICE_ACTING_GUIDE);
        expect(ja).not.toContain('自定义');
    });
});

describe('applyLongpressTranslateResult', () => {
    it('模型套了标签也只取口白，不用模型字幕', () => {
        const raw = '<语音 emotion="sad">[sad] hi</语音>\n<字幕>模型乱写的字幕</字幕>';
        const applied = applyLongpressTranslateResult(raw, { preserveRawMarkup: true });
        expect(applied.spokenText).toContain('[sad]');
        expect(applied.voiceEmotion).toBe('sad');
        expect(JSON.stringify(applied)).not.toContain('模型乱写的字幕');
        const wrapped = wrapSpokenWithOriginalChinese(applied.spokenText, '原来的中文', applied.voiceEmotion);
        expect(wrapped).toContain('<字幕>原来的中文</字幕>');
        expect(wrapped).not.toContain('模型乱写的字幕');
    });

    it('没标签就把全文当口白', () => {
        expect(applyLongpressTranslateResult('こんにちは', { preserveRawMarkup: true }).spokenText).toBe('こんにちは');
    });
});

describe('translateVoiceLangText', () => {
    beforeEach(() => {
        vi.mocked(secondaryLlmCall).mockReset();
        vi.mocked(safeFetchJson).mockReset();
    });

    it('辅助 API 配齐时走副模型，温度 0.6、60 秒，不打主 API', async () => {
        vi.mocked(secondaryLlmCall).mockResolvedValue('こんにちは');
        const out = await translateVoiceLangText({
            apiConfig: { ...mainConfig(), secondaryLlm: secondary },
            systemPrompt: buildVoiceLangTranslateSystemPrompt('ja'),
            text: '你好',
            purpose: 'chat-manual-voice-translate',
            charId: 'c1',
        });
        expect(out).toBe('こんにちは');
        expect(secondaryLlmCall).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'chat-manual-voice-translate',
            timeoutMs: VOICE_LANG_TRANSLATE_TIMEOUT_MS,
            featureOpts: { temperature: VOICE_LANG_TRANSLATE_TEMPERATURE },
            charId: 'c1',
            config: secondary,
        }));
        expect(safeFetchJson).not.toHaveBeenCalled();
    });

    it('没配辅助 API 时走主流式 0.6', async () => {
        vi.mocked(safeFetchJson).mockResolvedValue({
            choices: [{ message: { content: ' Hello ' } }],
        });
        const out = await translateVoiceLangText({
            apiConfig: mainConfig(),
            systemPrompt: buildVoiceLangTranslateSystemPrompt('en'),
            text: '你好',
            purpose: 'chat-manual-voice-translate',
            retryMainOnce: true,
        });
        expect(out).toBe('Hello');
        expect(secondaryLlmCall).not.toHaveBeenCalled();
        const init = vi.mocked(safeFetchJson).mock.calls[0][1] as RequestInit;
        const body = JSON.parse(String(init.body));
        expect(body.model).toBe('main-model');
        expect(body.temperature).toBe(0.6);
        expect(body.stream).toBe(true);
        expect(vi.mocked(safeFetchJson).mock.calls[0][3]).toBe(VOICE_LANG_TRANSLATE_TIMEOUT_MS);
    });

    it('辅助 API 这次失败不改打主 API', async () => {
        vi.mocked(secondaryLlmCall).mockRejectedValue(new Error('sec 500'));
        await expect(translateVoiceLangText({
            apiConfig: { ...mainConfig(), secondaryLlm: secondary },
            systemPrompt: buildVoiceLangTranslateSystemPrompt('en'),
            text: '你好',
            purpose: 'chat-manual-voice-translate',
        })).rejects.toThrow('sec 500');
        expect(safeFetchJson).not.toHaveBeenCalled();
    });
});

describe('接线：只动长按外语翻译，不动路 A 和对话翻译', () => {
    it('Chat 长按外语走辅助翻译；缺字幕仍用 llmTranslate 固定句', () => {
        const source = readFileSync(path.resolve(__dirname, '../apps/Chat.tsx'), 'utf8');
        expect(source).toContain("purpose: 'chat-manual-voice-translate'");
        expect(source).toContain('buildVoiceLangTranslateSystemPrompt(voiceLang, { apiConfig })');
        expect(source).toContain('wrapSpokenWithOriginalChinese');
        expect(source).toContain('inferChatVoiceEmotionFromSpoken');
        expect(source).toContain('把以下内容翻译成中文。只输出翻译结果，不要任何解释。');
        expect(source).toContain('%%bilingual%%');
        expect(source).toContain('discardVoiceForMessages([selectedMessage.id])');
        expect(source).not.toContain('void handleManualTts(editedMessage, false)');
        expect(source).not.toContain('toChinese');
    });

    it('辅助 API 设置页不再放自定义格式', () => {
        const source = readFileSync(path.resolve(__dirname, '../components/settings/SecondaryLlmSettings.tsx'), 'utf8');
        expect(source).not.toContain('loadSullyUserFormatRules');
        expect(source).not.toContain('formatRules');
        expect(source).not.toContain('SULLY_AI_REPAIR_PREFS_CUSTOM');
    });

    it('见面朗读只换辅助翻译 + 日语禁汉字，不拼指南、不包语音标签', () => {
        const source = readFileSync(path.resolve(__dirname, '../components/date/DateSession.tsx'), 'utf8');
        expect(source).toContain("purpose: 'date-voice-translate'");
        expect(source).toContain('buildDateVoiceLangTranslateSystemPrompt(voiceLang)');
        expect(source).not.toContain('buildVoiceLangTranslateSystemPrompt');
        expect(source).not.toContain('wrapSpokenWithOriginalChinese');
        expect(source).toContain('extractVoiceEmotionTag');
        expect(source).toContain('catch { /* use original */ }');
        const ja = buildDateVoiceLangTranslateSystemPrompt('ja');
        expect(ja).toContain('Translate the following text to 日本語');
        expect(ja).toContain('do not use kanji');
        expect(ja).not.toContain('Follow the guide below');
        expect(ja).not.toContain(FISH_VOICE_ACTING_GUIDE);
        expect(ja).not.toContain('<语音');
        expect(ja).not.toContain('字幕');
        expect(buildDateVoiceLangTranslateSystemPrompt('en')).not.toContain('kanji');
    });
});
