import type { CharacterProfile, DateRuleEntry, SpriteConfig } from '../types';
import { extractContent } from './safeApi';
import { extractInlineThinkTags } from './inlineThinkTags';
import { applyThinkingParams, THINKING_BUDGET_TOKENS } from './thinkingEffort';
import { buildThinkingChainSystemSection } from './thinkingChainPrompt';

export const DATE_EMOTION_SLOTS = ['normal', 'happy', 'angry', 'sad', 'shy'];
export const DATE_EMOTION_NAMES: Record<string, string> = { normal: '平常', happy: '开心', angry: '生气', sad: '难过', shy: '害羞' };
export const dateEmotionLabel = (key: string) => DATE_EMOTION_SLOTS.includes(key) ? DATE_EMOTION_NAMES[key] : key;
export const DATE_DEFAULT_POSE: SpriteConfig = { scale: 1, x: 0, y: 0 };
export const datePoseKey = (skinId: string | null | undefined, emotion: string) => JSON.stringify([skinId || null, emotion]);

export function datePoseFor(char: CharacterProfile, emotion: string, skinId?: string | null) {
    return char.datePortraitPoses?.[datePoseKey(skinId, emotion)];
}

const emotionFileNames: Record<string, string> = {
    平常: 'normal', 普通: 'normal', 默认: 'normal', 开心: 'happy', 高兴: 'happy',
    生气: 'angry', 愤怒: 'angry', 难过: 'sad', 悲伤: 'sad', 害羞: 'shy',
};

export function planDateSpriteBatch(files: Array<{ name: string; src: string }>, current: Record<string, string> = {}, custom: string[] = []) {
    const sprites = { ...current };
    const customEmotions = [...custom];
    const reserved = new Set([...DATE_EMOTION_SLOTS, ...custom, 'chibi', 'default']);
    for (const file of files) {
        const base = file.name.replace(/\.[^.]+$/, '').trim().toLowerCase().replace(/\s+/g, '_') || 'sprite';
        const words = base.split(/[_-]+/);
        const known = custom.includes(base) ? base : words.map(word => Object.prototype.hasOwnProperty.call(emotionFileNames, word) ? emotionFileNames[word] : word)
            .find(word => DATE_EMOTION_SLOTS.includes(word));
        let key = known && !Object.prototype.hasOwnProperty.call(sprites, known) ? known : base;
        if (key !== known || Object.prototype.hasOwnProperty.call(sprites, key)) {
            let suffix = 2;
            while (reserved.has(key) || key in sprites) key = base + '_' + suffix++;
            customEmotions.push(key);
            reserved.add(key);
        }
        sprites[key] = file.src;
    }
    return { sprites, customEmotions };
}

export function enabledDateEntries(entries: DateRuleEntry[] = []) {
    return entries.filter(entry => entry.enabled && (entry.title.trim() || entry.body.trim())).map(entry =>
        [entry.title.trim(), entry.body.trim()].filter(Boolean).join('：'));
}

// 短暂合并过的版本会把原文风补充写成这一条，恢复时按来源归位。
export const isLegacyDateStyleRule = (rule: DateRuleEntry) => /^legacy-extra(?:-legacy)*$/.test(rule.id);

export function dateMeetingRules(rules: DateRuleEntry[] = []) {
    return rules.filter(rule => !isLegacyDateStyleRule(rule));
}

export function dateWritingSupplement(config?: { extra?: string; rules?: DateRuleEntry[] }, forEditor = false) {
    return config?.extra ?? config?.rules?.find(rule => isLegacyDateStyleRule(rule) && (forEditor || rule.enabled))?.body ?? '';
}

export function activeDateRuleSet(char: CharacterProfile) {
    return char.dateExtraPresets?.find(preset => preset.id === char.dateActiveRuleSetId && Array.isArray(preset.rules));
}

export function activeDateRules(char: CharacterProfile) {
    const preset = activeDateRuleSet(char);
    return dateMeetingRules(preset ? preset.rules : char.dateStyleConfig?.rules);
}

export function dateReplyRequest(char: CharacterProfile | undefined, userName: string, input: {
    model: string; messages: Array<{ role: string; content: unknown }>; temperature: number; stream?: boolean; nativeAnthropic?: boolean;
}) {
    const options = char?.dateReplySettings;
    const maxTokens = options?.maxTokens && options.maxTokens >= 1 ? Math.trunc(options.maxTokens) : 8000;
    const body = {
        model: input.model,
        messages: input.messages,
        temperature: options?.temperature ?? input.temperature,
        max_tokens: maxTokens,
        stream: options?.stream ?? input.stream ?? false,
        ...(options?.topP !== undefined ? { top_p: options.topP } : {}),
        ...(options?.frequencyPenalty !== undefined ? { frequency_penalty: options.frequencyPenalty } : {}),
        ...(options?.presencePenalty !== undefined ? { presence_penalty: options.presencePenalty } : {}),
    };
    if (!options?.thinking || !char) return body;
    const steps = enabledDateEntries(options.steps).map((step, index) => `${index + 1}. ${step}`).join('\n');
    const instruction = buildThinkingChainSystemSection({ charName: char.name, userName, mode: steps ? options.thinkingMode : 'default',
        customPrompt: steps, fieldsSplit: true });
    const [first, ...rest] = body.messages;
    body.messages = first?.role === 'system' && typeof first.content === 'string'
        ? [{ ...first, content: `${first.content}\n\n${instruction}` }, ...rest]
        : [{ role: 'system', content: instruction }, ...body.messages];
    if (maxTokens > 1024) {
        applyThinkingParams(body, options.effort || 'default');
        if (input.nativeAnthropic) body.model = input.model;
        const thinking = { type: 'enabled', budget_tokens: Math.min(THINKING_BUDGET_TOKENS, maxTokens - 1) };
        Object.assign(body, { thinking, extra_body: { thinking } });
    }
    return body;
}

export function parseDateReply(data: any, captureThinking = false) {
    const content = extractContent(data);
    if (!captureThinking) return { content, thinkingChain: undefined };
    const message = data?.choices?.[0]?.message;
    const reasoning = [message?.reasoning_content, message?.reasoning, message?.thinking]
        .find(value => typeof value === 'string' && value.trim());
    const inline = typeof message?.content === 'string' ? extractInlineThinkTags(message.content) : '';
    const thinkingChain = Array.from(new Set([reasoning?.trim(), inline.trim()].filter(Boolean)))
        .filter(value => value !== content).join('\n\n');
    return { content, thinkingChain: thinkingChain || undefined };
}
