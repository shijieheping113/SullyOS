import type { CharacterProfile, Emoji, EmojiCategory, Message } from '../types';
import { normalizeAssistantActionFormatting } from './assistantActionFormat';
import { ChatParser } from './chatParser';
import { extractHtmlBlocks } from './htmlPrompt';
import type { SullyComposeKind } from './sullyAssistantCopy';
import { isSingleHtmlCardSource, sullyFormatTidy } from './sullyMessageFormat';

export type RenderedBubble = Pick<Message, 'role' | 'type' | 'content' | 'metadata' | 'replyTo' | 'charId'>;

/** 合并两条消息后只保留一条聊天气泡（常见：两段文字被按行拆成两条） */
export function collapseSullyMergeBubbles(bubbles: RenderedBubble[]): RenderedBubble[] {
    if (bubbles.length <= 1) return bubbles;
    const head = bubbles[0];
    if (bubbles.every(b => b.type === 'text')) {
        return [{
            charId: head.charId,
            role: head.role,
            type: 'text',
            content: bubbles.map(b => b.content).join('\n'),
            replyTo: head.replyTo,
            metadata: head.metadata ? { ...head.metadata } : undefined,
        }];
    }
    return bubbles;
}

function resolveEmojiForSend(
    rawName: string,
    emojis: Emoji[],
    categories: EmojiCategory[] = [],
): Emoji | undefined {
    const name = rawName.trim();
    const exact = emojis.find(emoji => emoji.name === name);
    if (exact) return exact;

    const separator = name.match(/^(.+?)\s*[:：]\s*(.+)$/u);
    if (!separator) return undefined;
    const categoryName = separator[1].trim();
    const emojiName = separator[2].trim();
    if (!categoryName || !emojiName) return undefined;

    const categoryIds = new Set(categories.map(category => category.id));
    const candidates: Emoji[] = [];
    for (const category of categories) {
        if (category.name !== categoryName) continue;
        candidates.push(...emojis.filter(emoji => (
            emoji.categoryId === category.id && emoji.name === emojiName
        )));
    }
    if (categoryName === '通用') {
        candidates.push(...emojis.filter(emoji => !emoji.categoryId && emoji.name === emojiName));
    } else if (categoryName === '其他') {
        candidates.push(...emojis.filter(emoji => (
            !!emoji.categoryId && !categoryIds.has(emoji.categoryId) && emoji.name === emojiName
        )));
    }
    const unique = candidates.filter((c, i) => candidates.indexOf(c) === i);
    return unique.length === 1 ? unique[0] : undefined;
}

function filterEmojisForChar(emojis: Emoji[], categories: EmojiCategory[], charId: string): Emoji[] {
    const visibleCategoryIds = new Set(
        categories
            .filter(c => !c.allowedCharacterIds || c.allowedCharacterIds.includes(charId))
            .map(c => c.id),
    );
    return emojis.filter(e => {
        if (!e.categoryId) return true;
        if (!visibleCategoryIds.has(e.categoryId)) {
            const cat = categories.find(c => c.id === e.categoryId);
            if (cat?.allowedCharacterIds && !cat.allowedCharacterIds.includes(charId)) return false;
        }
        return true;
    });
}

export type ReprocessOptions = {
    char: CharacterProfile;
    emojis: Emoji[];
    categories: EmojiCategory[];
    source: string;
    role: Message['role'];
    replyTo?: Message['replyTo'];
    inheritMetadata?: Record<string, unknown>;
    htmlModeEnabled?: boolean;
    /** 加泡「普通文字」：不套指令，按行落 text */
    composeKind?: SullyComposeKind;
    /** 合并邻泡：多条预览压成一条消息落库 */
    mergeAsSingle?: boolean;
};

function reprocessPlainTextBubbles(opts: ReprocessOptions): RenderedBubble[] {
    const { char, role, replyTo, inheritMetadata } = opts;
    const raw = (opts.source || '').trim();
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const list = lines.length ? lines : [raw];
    return list.map((line, i) => {
        const content = ChatParser.sanitize(line, { keepCitations: true }) || line;
        return {
            charId: char.id,
            role,
            type: 'text' as const,
            content,
            replyTo: i === 0 ? replyTo : undefined,
            metadata: inheritMetadata ? { ...inheritMetadata } : undefined,
        };
    });
}

export function reprocessSourceToBubbles(opts: ReprocessOptions): RenderedBubble[] {
    const { char, emojis, categories, role, replyTo, inheritMetadata } = opts;
    if (opts.composeKind === 'plain') {
        return reprocessPlainTextBubbles(opts);
    }
    const htmlOn = opts.htmlModeEnabled ?? !!(char as { htmlModeEnabled?: boolean }).htmlModeEnabled;
    const normalizedSource = normalizeAssistantActionFormatting(opts.source || '');
    const tidied = isSingleHtmlCardSource(normalizedSource)
        ? normalizedSource.trim()
        : sullyFormatTidy(normalizedSource, { scope: 'all' }).text;

    const bubbles: RenderedBubble[] = [];
    let remainder = tidied;

    if (htmlOn && /\[html\]/i.test(remainder)) {
        const { blocks, cleanedContent } = extractHtmlBlocks(remainder);
        for (const blk of blocks) {
            bubbles.push({
                charId: char.id,
                role,
                type: 'html_card',
                content: blk.textPreview ? `[HTML卡片] ${blk.textPreview}` : '[HTML卡片]',
                metadata: {
                    ...(inheritMetadata || {}),
                    htmlSource: blk.html,
                    htmlTextPreview: blk.textPreview,
                },
            });
        }
        remainder = cleanedContent;
    } else if (/\[html\]/i.test(remainder)) {
        remainder = remainder.replace(/\[html\][\s\S]*?\[\/html\]/gi, '[HTML 卡片]').trim();
    }

    const rawRemainder = remainder
        .replace(/\[\[INNER_STATE:\s*[\s\S]*?\]\]/g, '')
        .trim();
    if (!rawRemainder) return bubbles;

    const scopedEmojis = filterEmojisForChar(emojis, categories, char.id);
    let firstText = true;

    const pushTextChunks = (segment: string) => {
        const rawBlocks = segment.split(/^\s*---\s*$/m).filter(b => b.trim());
        const allChunks: string[] = [];
        for (const block of rawBlocks) {
            allChunks.push(...ChatParser.chunkText(block.trim()));
        }
        if (allChunks.length === 0 && segment.trim()) allChunks.push(segment.trim());

        for (const chunk of allChunks) {
            if (!ChatParser.hasDisplayContent(chunk)) continue;
            const cleanChunk = ChatParser.sanitize(chunk);
            if (!cleanChunk) continue;
            bubbles.push({
                charId: char.id,
                role,
                type: 'text',
                content: cleanChunk,
                replyTo: firstText ? replyTo : undefined,
                metadata: inheritMetadata ? { ...inheritMetadata } : undefined,
            });
            firstText = false;
        }
    };

    for (const part of ChatParser.splitResponse(rawRemainder)) {
        if (part.type === 'emoji') {
            const found = resolveEmojiForSend(part.content, scopedEmojis, categories);
            if (found) {
                bubbles.push({
                    charId: char.id,
                    role,
                    type: 'emoji',
                    content: found.url,
                    metadata: inheritMetadata ? { ...inheritMetadata } : undefined,
                });
            } else {
                bubbles.push({
                    charId: char.id,
                    role,
                    type: 'text',
                    content: `[表情：${part.content}]`,
                    metadata: inheritMetadata ? { ...inheritMetadata } : undefined,
                });
            }
            firstText = false;
        } else {
            const sanitized = ChatParser.sanitize(part.content, { keepCitations: true }).trim();
            if (sanitized) pushTextChunks(sanitized);
        }
    }

    if (bubbles.length === 0 && rawRemainder) {
        const sanitized = ChatParser.sanitize(rawRemainder, { keepCitations: true }).trim();
        if (sanitized) pushTextChunks(sanitized);
    }

    if (opts.mergeAsSingle) {
        return collapseSullyMergeBubbles(bubbles);
    }
    return orderAssistantTurnBubbles(bubbles);
}

/** 与 applyAssistantPostProcessing 一致：先 html 卡，再表情，再文字 */
export function orderAssistantTurnBubbles(bubbles: RenderedBubble[]): RenderedBubble[] {
    const html = bubbles.filter(b => b.type === 'html_card');
    const emoji = bubbles.filter(b => b.type === 'emoji');
    const rest = bubbles.filter(b => b.type !== 'html_card' && b.type !== 'emoji');
    return [...html, ...emoji, ...rest];
}

/** dryRun：生成预览用 Message（假 id） */
export function dryRunReprocessMessage(
    original: Message,
    opts: Omit<ReprocessOptions, 'role' | 'replyTo'> & { source: string },
): Message[] {
    const inherit = { ...(original.metadata || {}) };
    delete inherit.thinkingChain;
    const bubbles = reprocessSourceToBubbles({
        ...opts,
        role: original.role,
        replyTo: original.replyTo,
        inheritMetadata: inherit,
    });
    const baseTs = original.timestamp || Date.now();
    return bubbles.map((b, i) => ({
        id: -(i + 1),
        timestamp: baseTs + i,
        charId: original.charId,
        role: b.role,
        type: b.type,
        content: b.content,
        metadata: b.metadata,
        replyTo: b.replyTo,
    }));
}
