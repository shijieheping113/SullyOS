/**
 * 语音外语模式下，长按中文转外语：把台词翻成要念的语言。
 * 辅助 API 配齐就走辅助（本功能：温度 0.6、60 秒、流式）；没配才走主 API。
 * 辅助这次失败不改打主 API。
 * 不对模型提字幕；中文原文由调用方当字幕。
 */
import type { APIConfig } from '../types';
import { isSecondaryLlmReady } from './secondaryLlmApi';
import { secondaryLlmCall } from './secondaryLlmCall';
import { voiceLanguagePromptLabel } from './voiceLanguage';
import { parseVoiceOutput } from './minimaxTts';
import { resolveVoiceActingGuideFromApiConfig } from './voiceMessagePrompt';
import { extractContent, safeFetchJson } from './safeApi';

export const VOICE_LANG_TRANSLATE_TIMEOUT_MS = 60_000;
export const VOICE_LANG_TRANSLATE_TEMPERATURE = 0.6;

const JAPANESE_KANA_HINT =
    'For Japanese: do not use kanji. Write in hiragana and katakana only. Do not use ideographic full-width spaces to separate words.';

const ACTING_GLUE =
    'Follow the guide below for pauses and delivery marks. Still output ONLY the translation, nothing else.';

function authorTranslateLine(langLabel: string): string {
    return `Translate the following text to ${langLabel}. Output ONLY the translation, nothing else.`;
}

export function buildVoiceLangTranslateSystemPrompt(
    targetLang: string,
    opts?: {
        apiConfig?: Pick<APIConfig, 'ttsProvider' | 'voicePrompts' | 'elevenLabsModel'> | null;
    },
): string {
    const langLabel = voiceLanguagePromptLabel(targetLang);
    const parts = [authorTranslateLine(langLabel)];
    if ((targetLang || '').trim().toLowerCase() === 'ja') {
        parts.push(JAPANESE_KANA_HINT);
    }
    const acting = resolveVoiceActingGuideFromApiConfig(opts?.apiConfig);
    if (acting) {
        parts.push(ACTING_GLUE);
        parts.push(acting);
    }
    return parts.join('\n\n');
}

/** 模型只出口语；若自己套了 <语音> 就抠内文。字幕一律不用模型的。 */
export function applyLongpressTranslateResult(
    translated: string,
    opts: { preserveRawMarkup: boolean },
): { spokenText: string; voiceEmotion?: string } {
    const src = (translated || '').trim();
    const parsed = parseVoiceOutput(src);
    if (!parsed.hasVoiceTag) return { spokenText: src };
    const spokenText = opts.preserveRawMarkup ? parsed.rawSpeech : parsed.speech;
    return { spokenText, voiceEmotion: parsed.emotion };
}

export type VoiceLangTranslateOpts = {
    apiConfig: APIConfig;
    systemPrompt: string;
    text: string;
    purpose: string;
    charId?: string;
    /** 走主 API 时失败再试一次（聊天旧行为）。 */
    retryMainOnce?: boolean;
};

const mainTranslateOnce = async (
    apiConfig: APIConfig,
    systemPrompt: string,
    text: string,
    purpose: string,
    charId?: string,
): Promise<string> => {
    const data = await safeFetchJson(
        `${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiConfig.apiKey}`,
            },
            body: JSON.stringify({
                model: apiConfig.model,
                stream: true,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text },
                ],
                temperature: VOICE_LANG_TRANSLATE_TEMPERATURE,
            }),
        },
        1,
        VOICE_LANG_TRANSLATE_TIMEOUT_MS,
        { appId: 'chat', charId, purpose },
    );
    return (extractContent(data) || '').trim();
};

export async function translateVoiceLangText(opts: VoiceLangTranslateOpts): Promise<string> {
    const { apiConfig, systemPrompt, text, purpose, charId, retryMainOnce } = opts;
    if (isSecondaryLlmReady(apiConfig.secondaryLlm)) {
        return secondaryLlmCall({
            config: apiConfig.secondaryLlm!,
            purpose,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text },
            ],
            featureOpts: { temperature: VOICE_LANG_TRANSLATE_TEMPERATURE },
            timeoutMs: VOICE_LANG_TRANSLATE_TIMEOUT_MS,
            charId,
        });
    }

    try {
        return await mainTranslateOnce(apiConfig, systemPrompt, text, purpose, charId);
    } catch (err) {
        if (!retryMainOnce) throw err;
        try {
            return await mainTranslateOnce(apiConfig, systemPrompt, text, purpose, charId);
        } catch {
            return '';
        }
    }
}
