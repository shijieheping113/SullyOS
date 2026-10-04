/**
 * 聊天里的双语气泡落库是「原文 + 一行 %%BILINGUAL%% + 译文」。
 * 这行记号只给界面认「翻译」，不能进编辑框，也不能跟着语音再拆成第二条。
 */

const MARK_RE = /%%BILINGUAL%%/i;
const MARK_TOKEN = '%%BILINGUAL%%';

function voiceAtomicRe(): RegExp {
    return /(?:<字幕>[\s\S]*?<\/字幕>\s*)?<[语語]音[^>]*>[\s\S]*?<\/\s*[语語]音\s*>(?:\s*<字幕>[\s\S]*?<\/字幕>)?/g;
}

function norm(text: string): string {
    return text.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

/** 两边差不多是同一句（允许改了标点），才算复读，避免误删旁边另一句。 */
function closeEnough(a: string, b: string): boolean {
    const left = norm(a);
    const right = norm(b);
    if (!left || !right) return false;
    const short = left.length < right.length ? left : right;
    const long = left.length < right.length ? right : left;
    if (short.length < 8) return false;
    if (!long.includes(short)) return false;
    return short.length / long.length >= 0.7;
}

export function textBeforeBilingualMarker(text: string): string {
    const idx = text.search(MARK_RE);
    if (idx < 0) return text.trim();
    const before = text.slice(0, idx).trim();
    const after = text.slice(idx + MARK_TOKEN.length).trim();
    return before || after;
}

/** 口播取记号后面的半边（译文）；没有后半边就留前半边。 */
export function spokenWithoutBilingualMarker(text: string): string {
    const idx = text.search(MARK_RE);
    if (idx < 0) return text.trim();
    const after = text.slice(idx + MARK_TOKEN.length).trim();
    return after || text.slice(0, idx).trim();
}

/** 同一句写了两遍时只留第一遍。比较时忽略空格和标点。 */
export function dedupeRepeatedLines(text: string): string {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const line of (text || '').split(/\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const key = norm(trimmed);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        kept.push(trimmed);
    }
    return kept.join('\n');
}

function linesOf(text: string): string[] {
    return dedupeRepeatedLines(text).split(/\n/).map(line => line.trim()).filter(Boolean);
}

/** 转文字面板里的字幕。同一句写两行、或把口播再抄进字幕，只留一遍。 */
export function visibleVoiceSubtitle(subtitle: string, spoken = ''): string {
    const spokenLines = linesOf(spoken);
    const kept: string[] = [];
    for (const line of linesOf(subtitle)) {
        if (spokenLines.some(part => closeEnough(line, part))) continue;
        if (kept.some(prev => closeEnough(line, prev))) continue;
        kept.push(line);
    }
    return kept.join('\n');
}

/** 一条语音里多出来的同一句字幕收成一份，贴在语音后面。 */
function collapseVoiceBlock(block: string): string {
    const subs: string[] = [];
    let next = block.replace(/<字幕>([\s\S]*?)<\/字幕>/gi, (_m, inner: string) => {
        const text = dedupeRepeatedLines(textBeforeBilingualMarker(inner));
        if (text) subs.push(text);
        return '';
    });
    next = next.replace(
        /<([语語]音)([^>]*)>([\s\S]*?)<\/\s*[语語]音\s*>/i,
        (_full, name: string, attrs: string, inner: string) => (
            `<${name}${attrs}>${spokenWithoutBilingualMarker(inner).trim()}</${name}>`
        ),
    );
    const subtitle = dedupeRepeatedLines(subs.join('\n'));
    const voice = next.replace(/\n+/g, '\n').trim();
    return subtitle ? `${voice}\n<字幕>${subtitle}</字幕>` : voice;
}

function voiceSides(source: string): { spoken: string; subtitle: string } {
    const spoken: string[] = [];
    const subtitle: string[] = [];
    const re = /<([语語]音)[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>|<字幕>([\s\S]*?)<\/字幕>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        if (match[1]) spoken.push(match[2] || '');
        else subtitle.push(match[3] || '');
    }
    return { spoken: spoken.join('\n'), subtitle: subtitle.join('\n') };
}

function echoes(side: string, spoken: string, subtitle: string): boolean {
    const parts = [spoken, subtitle].flatMap(part => part.split(/\n/)).map(part => part.trim()).filter(Boolean);
    return parts.some(part => closeEnough(side, part));
}

function guardBlocks(source: string, pattern: RegExp, prefix: string): { text: string; blocks: string[] } {
    const blocks: string[] = [];
    const text = source.replace(pattern, (block) => {
        const token = `\u0002${prefix}${blocks.length}\u0002`;
        blocks.push(block);
        return token;
    });
    return { text, blocks };
}

function restoreBlocks(text: string, prefix: string, blocks: string[]): string {
    return text.replace(new RegExp(`\\u0002${prefix}(\\d+)\\u0002`, 'g'), (_m, n) => blocks[Number(n)] ?? '');
}

/**
 * 修格式用的源码：编辑框和模型都不该再看见 %%BILINGUAL%%。
 * 纯双语气泡改回 <翻译> 标签；已经有语音时，把复读的那一半收掉，只留一条语音。
 */
export function normalizeBilingualRepairSource(source: string): string {
    let text = source || '';
    if (!MARK_RE.test(text) && !/<翻译>/.test(text) && !/<字幕>/.test(text)) return text;

    text = text.replace(voiceAtomicRe(), collapseVoiceBlock);
    const { spoken, subtitle } = voiceSides(text);
    const hasVoice = /<[语語]音/.test(text);

    const guardedVoice = guardBlocks(text, voiceAtomicRe(), 'V');
    const guardedHtml = guardBlocks(guardedVoice.text, /\[html\][\s\S]*?\[\/html\]/gi, 'H');
    let body = guardedHtml.text;

    if (hasVoice) {
        body = body.replace(
            /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>([\s\S]*?)<\/译文>\s*<\/翻译>/g,
            (full, original: string, translated: string) => (
                echoes(original, spoken, subtitle) || echoes(translated, spoken, subtitle) ? '' : full
            ),
        );
    }

    body = body.replace(
        /(^|\n)[ \t]*([^\n]*?)[ \t]*\n[ \t]*%%BILINGUAL%%[ \t]*\n[ \t]*([^\n]*?)[ \t]*(?=\n|$)/gi,
        (_full, lead: string, original: string, translated: string) => {
            if (hasVoice && (echoes(original, spoken, subtitle) || echoes(translated, spoken, subtitle))) {
                return lead;
            }
            const a = original.trim();
            const b = translated.trim();
            if (!a && !b) return lead;
            return `${lead}<翻译><原文>${a}</原文><译文>${b}</译文></翻译>`;
        },
    );

    const guardedTrans = guardBlocks(body, /<翻译>[\s\S]*?<\/翻译>/gi, 'T');
    body = guardedTrans.text;
    if (hasVoice) {
        body = body.split(/\r?\n/).filter((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.includes('\u0002')) return true;
            if (/^%%BILINGUAL%%$/i.test(trimmed)) return false;
            const subtitleOnly = trimmed.match(/^<字幕>([\s\S]*)<\/字幕>$/i);
            if (subtitleOnly) return !echoes(subtitleOnly[1], spoken, subtitle);
            if (/<[语語]音|<字幕>|<翻译>|\[html\]|\[\[SEND_EMOJI/i.test(trimmed)) return true;
            return !echoes(trimmed, spoken, subtitle);
        }).join('\n');
    }
    body = body.replace(/^[ \t]*%%BILINGUAL%%[ \t]*$/gim, '');
    body = restoreBlocks(body, 'T', guardedTrans.blocks);

    body = body.replace(/([^\n]*?)%%BILINGUAL%%([^\n]*)/gi, (_full, original: string, translated: string) => {
        const a = String(original).trim();
        const b = String(translated).trim();
        if (hasVoice && (echoes(a, spoken, subtitle) || echoes(b, spoken, subtitle))) return '';
        if (!a && !b) return '';
        return `<翻译><原文>${a}</原文><译文>${b}</译文></翻译>`;
    });

    text = restoreBlocks(restoreBlocks(body, 'H', guardedHtml.blocks), 'V', guardedVoice.blocks);
    return text.replace(/\n{3,}/g, '\n\n').trim();
}
