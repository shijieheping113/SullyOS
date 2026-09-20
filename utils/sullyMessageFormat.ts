import type { Message } from '../types';
import { normalizeAssistantEmojiFormatting } from './assistantActionFormat';
import { ChatParser } from './chatParser';
import { looksLikeBareHtml } from './htmlPrompt';
import { normalizeTranslationTags, normalizeVoiceTags } from './sanitize';

export type FormatIssue = {
    id: string;
    severity: 'error' | 'warn' | 'info';
    message: string;
    start?: number;
    end?: number;
    title?: string;
};

const EMOJI_KEYWORD_RE = /表情包|SEND_EMOJI|表情\s*[:：]|发送了表情(?:包)?|发了.{0,24}表情(?:包)?/i;
const HTML_KEYWORD_RE = /\[html\]|\[\/html\]|HTML\s*卡片|系统记录|请勿复述|要再发卡片必须用|<\s*div\b|<\s*html\b/i;
const VOICE_KEYWORD_RE = /<(?:语音|語音)|<\/(?:语音|語音)>|<字幕>/i;

const SEND_EMOJI_LINE_RE = /^\s*\[\[SEND_EMOJI:\s*.+?\]\]\s*$/i;
const NARRATIVE_STICKER_RE = /我刚才发送了表情(?:包)?\s*[:：]\s*([^\s，。！？\n]+)/i;
/** （猫儿发送了表情：名字） / (x发了表情包：名字) */
const PAREN_STICKER_SENT_PATTERN = '[（(]([^（）)\\n]{0,32}?)(?:发了|发送了)\\s*表情(?:包)?\\s*[:：]\\s*([^（）)\\n]+?)[)）]';
const PAREN_STICKER_SENT_RE = new RegExp(PAREN_STICKER_SENT_PATTERN, 'g');
const PAREN_STICKER_SENT_TEST_RE = new RegExp(PAREN_STICKER_SENT_PATTERN);

const HTML_SYSTEM_RECORD_RE = /[（(][^）)]*系统记录[^）)]*HTML\s*卡片[^）)]*[）)]/gi;
const HTML_CARD_LEAK_RE = /\[[^\]\n]{0,40}发送了(?:一张\s*)?HTML\s*卡片\][^\n]*/gi;
const HTML_PROMPT_ECHO_RE = /这只是历史占位[^\n]*|要再发卡片必须用\s*\[html\][^\n]*|包裹真正的\s*HTML[。.）)\]]*/gi;

const VOICE_ATOMIC_RE = /(?:<字幕>[\s\S]*?<\/字幕>\s*)?<[语語]音[^>]*>[\s\S]*?<\/\s*[语語]音\s*>(?:\s*<字幕>[\s\S]*?<\/字幕>)?/g;

export const FORMAT_FIXABLE_MESSAGE_TYPES = new Set<Message['type']>(['text', 'html_card', 'emoji']);

export function isFormatFixableMessage(msg: Pick<Message, 'type'> | null | undefined): boolean {
    return !!msg && FORMAT_FIXABLE_MESSAGE_TYPES.has(msg.type);
}

const HTML_GUARD = '\u0002';

function guardHtmlCardBlocksForLeaks(text: string): { guarded: string; blocks: string[] } {
    const blocks: string[] = [];
    const guarded = (text || '').replace(/\[html\][\s\S]*?\[\/html\]/gi, block => {
        const i = blocks.length;
        blocks.push(block);
        return `${HTML_GUARD}H${i}${HTML_GUARD}`;
    });
    return { guarded, blocks };
}

function restoreHtmlCardBlocks(guarded: string, blocks: string[]): string {
    return guarded.replace(new RegExp(`${HTML_GUARD}H(\\d+)${HTML_GUARD}`, 'g'), (_m, n) => blocks[Number(n)] ?? '');
}

/** 剥掉模型照抄的 HTML 历史占位 / 提示词回显（猫儿理顺专用） */
export function stripHtmlPromptLeaks(text: string): string {
    const { guarded, blocks } = guardHtmlCardBlocksForLeaks(text || '');
    let s = guarded;
    s = s.replace(HTML_SYSTEM_RECORD_RE, '');
    s = s.replace(HTML_CARD_LEAK_RE, '');
    s = s.replace(HTML_PROMPT_ECHO_RE, '');
    s = restoreHtmlCardBlocks(s, blocks);
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    return s;
}

export function isSingleHtmlCardSource(source: string): boolean {
    const t = (source || '').trim();
    return /^\[html\][\s\S]*\[\/html\]$/i.test(t);
}

/** 猫儿理顺专用：比生成管线更积极地修表情掉格式 */
export function normalizeStickerForRepair(raw: string): string {
    let s = normalizeAssistantEmojiFormatting(raw || '');
    s = s.replace(NARRATIVE_STICKER_RE, '[[SEND_EMOJI: $1]]');
    s = s.replace(PAREN_STICKER_SENT_RE, '[[SEND_EMOJI: $2]]');
    s = s.replace(/\[表情\s*[:：]\s*([^\]\n]+?)\]/g, '\n[[SEND_EMOJI: $1]]\n');
    return s;
}

/** 把 [[SEND_EMOJI:]] 推到独立行，便于 splitResponse */
export function isolateSendEmojiOnOwnLines(text: string): string {
    let s = text || '';
    s = s.replace(/\[\[SEND_EMOJI:\s*[^\]]+?\]\]/gi, (token) => `\n${token}\n`);
    return s.replace(/\n{3,}/g, '\n\n').trim();
}

/** 语音原子块提到独立行（与 chunkText 一致） */
export function isolateVoiceBlocksOnOwnLines(text: string): string {
    let s = text || '';
    s = s.replace(VOICE_ATOMIC_RE, (block) => `\n${block.trim()}\n`);
    return s.replace(/\n{3,}/g, '\n\n').trim();
}

function lineHasEmojiKeyword(line: string): boolean {
    return EMOJI_KEYWORD_RE.test(line);
}

function lineIsCanonicalEmoji(line: string): boolean {
    return SEND_EMOJI_LINE_RE.test(line.trim());
}

function stripTagsForSidecarCheck(segment: string): string {
    return segment
        .replace(VOICE_ATOMIC_RE, '')
        .replace(/\[\[SEND_EMOJI:\s*[^\]]+?\]\]/gi, '')
        .replace(/\[html\][\s\S]*?\[\/html\]/gi, '')
        .trim();
}

function diagnoseLineMixing(text: string, issues: FormatIssue[]): void {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (lineHasEmojiKeyword(trimmed) && !lineIsCanonicalEmoji(trimmed)) {
            const side = stripTagsForSidecarCheck(trimmed);
            if (side && !/^\[\[SEND_EMOJI:/i.test(trimmed)) {
                issues.push({
                    id: 'emoji-wrong-shape',
                    severity: 'error',
                    message: '这里的表情包格式不对……要单独一行 [[SEND_EMOJI: 名字]]',
                    title: trimmed.slice(0, 80),
                });
            }
        }

        if (VOICE_KEYWORD_RE.test(trimmed)) {
            const withoutVoice = trimmed.replace(VOICE_ATOMIC_RE, '').trim();
            if (withoutVoice && !/^<字幕>[\s\S]*<\/字幕>$/.test(withoutVoice)) {
                issues.push({
                    id: 'voice-inline-prose',
                    severity: 'error',
                    message: '语音要单独一行……别和旁白粘在一起',
                });
            }
        }

        if (HTML_KEYWORD_RE.test(trimmed) && /<\s*div\b/i.test(trimmed) && !/\[html\]/i.test(trimmed)) {
            issues.push({
                id: 'html-bare-div',
                severity: 'error',
                message: '小卡片要用 [html]…[/html] 包好',
            });
        }
    }

    if (HTML_SYSTEM_RECORD_RE.test(text) || HTML_CARD_LEAK_RE.test(text)) {
        issues.push({
            id: 'html-prompt-leak',
            severity: 'error',
            message: '小卡片和提示词说明粘在一起了……点「去掉 HTML 占位回显」',
        });
    }
}

export function diagnoseMessageFormat(
    source: string,
    msg: Pick<Message, 'type' | 'metadata'>,
): FormatIssue[] {
    const issues: FormatIssue[] = [];
    const text = source || '';

    diagnoseLineMixing(text, issues);

    const voiceOpens = (text.match(/<(?:语音|語音)(?![^>]*\/>)/gi) || []).length;
    const voiceCloses = (text.match(/<\/(?:语音|語音)>/gi) || []).length;
    if (voiceOpens !== voiceCloses) {
        issues.push({
            id: 'voice-unbalanced',
            severity: 'error',
            message: '语音标签好像没配对……',
            title: `语音开 ${voiceOpens} / 闭 ${voiceCloses}`,
        });
    }

    const htmlOpens = (text.match(/\[html\]/gi) || []).length;
    const htmlCloses = (text.match(/\[\/html\]/gi) || []).length;
    if (htmlOpens !== htmlCloses) {
        issues.push({
            id: 'html-unbalanced',
            severity: 'error',
            message: '小卡片的外壳 [html] 没对齐……',
        });
    }

    if (msg.type === 'html_card' && !msg.metadata?.htmlSource && !/\[html\]/i.test(text)) {
        issues.push({
            id: 'html-source-empty',
            severity: 'warn',
            message: '卡片里好像没有 HTML 源码……',
        });
    }

    if (NARRATIVE_STICKER_RE.test(text)) {
        issues.push({
            id: 'emoji-narrative',
            severity: 'error',
            message: '这句话其实是表情包……理顺后会拆成表情泡',
        });
    }

    if (PAREN_STICKER_SENT_TEST_RE.test(text)) {
        issues.push({
            id: 'emoji-paren-sent',
            severity: 'error',
            message: '括号里的「发送了表情」要拆成真正的表情泡',
        });
    }

    if (/\[表情[：:]/.test(text) && msg.type === 'text') {
        issues.push({
            id: 'emoji-leaked-display',
            severity: 'error',
            message: '[表情：…] 应该变成真正的表情气泡',
        });
    }

    const tidied = sullyFormatTidy(text, { scope: 'all' }).text;
    if (ChatParser.splitResponse(tidied).length > 1) {
        issues.push({
            id: 'will-split-bubbles',
            severity: 'info',
            message: '保存后会拆成多条气泡哦',
        });
    }

    if (/<翻译>|<原文>|<译文>/.test(text) && !/<翻译>\s*<原文>[\s\S]*?<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/.test(text)) {
        issues.push({
            id: 'translation-tags',
            severity: 'warn',
            message: '双语标签有点歪……点一下「双语标签修一下」',
        });
    }

    const deduped = issues.filter((item, idx) => issues.findIndex(x => x.id === item.id) === idx);
    return deduped;
}

function wrapBareHtmlDivBlocks(t: string): string {
    if (!t.trim()) return t;
    const { guarded, blocks } = guardHtmlCardBlocksForLeaks(t);
    const re = /(<div[\s\S]*?<\/div>)/gi;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(guarded)) !== null) {
        out += guarded.slice(last, m.index);
        const block = m[1];
        if (looksLikeBareHtml(block) || block.length > 80) out += `\n[html]${block}[/html]\n`;
        else out += block;
        last = m.index + m[0].length;
    }
    out += guarded.slice(last);
    return restoreHtmlCardBlocks(out, blocks);
}

/** 理顺时保留按行拆泡边界（不吞单行换行） */
export function promoteLinesToBubbleBoundaries(text: string): string {
    const ATOM = '\u0001';
    const voiceBlocks: string[] = [];
    const guarded = (text || '').replace(VOICE_ATOMIC_RE, (block) => {
        const i = voiceBlocks.length;
        voiceBlocks.push(block);
        return `${ATOM}V${i}${ATOM}`;
    });
    const htmlBlocks: string[] = [];
    const guarded2 = guarded.replace(/\[html\][\s\S]*?\[\/html\]/gi, (block) => {
        const i = htmlBlocks.length;
        htmlBlocks.push(block);
        return `${ATOM}H${i}${ATOM}`;
    });
    const lines = guarded2.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let joined = lines.join('\n');
    const restore = (s: string) => s
        .replace(new RegExp(`${ATOM}V(\\d+)${ATOM}`, 'g'), (_m, n) => voiceBlocks[Number(n)] ?? '')
        .replace(new RegExp(`${ATOM}H(\\d+)${ATOM}`, 'g'), (_m, n) => htmlBlocks[Number(n)] ?? '');
    return restore(joined);
}

export type SullyFormatTidyScope = 'all' | 'voice' | 'html' | 'emoji' | 'translation' | 'html-leak' | 'lines';

export function sullyFormatTidy(
    source: string,
    opts?: { scope?: SullyFormatTidyScope },
): { text: string; issuesFixed: string[] } {
    const scope = opts?.scope ?? 'all';
    const fixed: string[] = [];
    let text = source || '';

    const run = (id: string, fn: (s: string) => string) => {
        const next = fn(text);
        if (next !== text) fixed.push(id);
        text = next;
    };

    const runAll = () => {
        run('html-leak', stripHtmlPromptLeaks);
        run('emoji', normalizeStickerForRepair);
        run('emoji-isolate', isolateSendEmojiOnOwnLines);
        run('voice', normalizeVoiceTags);
        run('voice-isolate', isolateVoiceBlocksOnOwnLines);
        run('translation', normalizeTranslationTags);
        run('html-wrap', wrapBareHtmlDivBlocks);
        run('sanitize', s => ChatParser.sanitize(s, { keepCitations: true }));
        run('inner-state', s => s.replace(/\[\[INNER_STATE:\s*[\s\S]*?\]\]/g, '').trim());
        run('lines', promoteLinesToBubbleBoundaries);
    };

    if (scope === 'all') runAll();
    else if (scope === 'html-leak') run('html-leak', stripHtmlPromptLeaks);
    else if (scope === 'voice') {
        run('voice', normalizeVoiceTags);
        run('voice-isolate', isolateVoiceBlocksOnOwnLines);
    } else if (scope === 'translation') run('translation', normalizeTranslationTags);
    else if (scope === 'emoji') {
        run('emoji', normalizeStickerForRepair);
        run('emoji-isolate', isolateSendEmojiOnOwnLines);
    } else if (scope === 'html') {
        run('html-leak', stripHtmlPromptLeaks);
        run('html-wrap', wrapBareHtmlDivBlocks);
    } else if (scope === 'lines') run('lines', promoteLinesToBubbleBoundaries);

    return { text, issuesFixed: fixed };
}
