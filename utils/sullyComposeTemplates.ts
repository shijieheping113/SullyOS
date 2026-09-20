import {
    CHAT_VOICE_SNIPPET_MONO,
    CHAT_VOICE_SNIPPET_WITH_SUBTITLE,
} from './chatVoiceTagFormat';
import type { SullyQuickComposeTemplate } from './sullyAssistantCopy';
import {
    SULLY_BUBBLE_COMPOSE_PLACEHOLDER_PLAIN,
    SULLY_FORMAT_SNIPPET_BILINGUAL,
    SULLY_FORMAT_SNIPPET_HTML,
} from './sullyAssistantCopy';

/** 语音：开翻译 = 外语语音 + 字幕；关翻译 = 仅语音标签 */
export function voiceSnippetPrefill(translationEnabled: boolean): string {
    if (translationEnabled) return CHAT_VOICE_SNIPPET_WITH_SUBTITLE;
    return CHAT_VOICE_SNIPPET_MONO;
}

/** 双语块：仅翻译模式有意义；关翻译时给单行文字壳 */
export function bilingualSnippetPrefill(translationEnabled: boolean): string {
    if (translationEnabled) {
        return '<翻译><原文></原文><译文></译文></翻译>';
    }
    return '';
}

export function buildQuickComposeTemplates(translationEnabled: boolean): SullyQuickComposeTemplate[] {
    const templates: SullyQuickComposeTemplate[] = [
        {
            id: 'plain',
            label: '普通文字',
            composeKind: 'plain',
            prefill: '',
            placeholder: SULLY_BUBBLE_COMPOSE_PLACEHOLDER_PLAIN,
        },
        {
            id: 'emoji',
            label: '加一个表情',
            composeKind: 'emoji',
            prefill: '',
            placeholder: '点下面选一张，或写表情名',
        },
        {
            id: 'voice',
            label: '加一段语音',
            composeKind: 'voice',
            prefill: voiceSnippetPrefill(translationEnabled),
            placeholder: translationEnabled ? '语音里写外语，字幕写中文……' : '语音里要写的话……',
        },
        {
            id: 'html',
            label: '加一张小卡片',
            composeKind: 'html',
            prefill: SULLY_FORMAT_SNIPPET_HTML.replace('<div></div>', '<div></div>'),
            placeholder: 'HTML 片段',
        },
    ];
    if (translationEnabled) {
        templates.push({
            id: 'bilingual',
            label: '加一句双语',
            composeKind: 'bilingual',
            prefill: bilingualSnippetPrefill(true),
            placeholder: '原文写在外语侧，译文写在中文侧……',
        });
    }
    return templates;
}
