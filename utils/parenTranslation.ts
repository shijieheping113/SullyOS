/** 私聊「气泡下中文」：只在显示时拆开紧贴的双语。不改库存、不注入提示词。 */

export type ParenTranslationFormat = 'paren' | 'quoted';

/** 白字黑描边 + 字重/层级；挂在美化 CSS 之后，用 !important 钉死，不被气泡美化改色或压细。 */
const PAREN_OUTLINE_SHADOW = '0.65px 0 0 #000,0.56px 0.32px 0 #000,0.33px 0.56px 0 #000,0 0.65px 0 #000,-0.32px 0.56px 0 #000,-0.56px 0.32px 0 #000,-0.65px 0 0 #000,-0.56px -0.32px 0 #000,-0.33px -0.56px 0 #000,0 -0.65px 0 #000,0.33px -0.56px 0 #000,0.56px -0.33px 0 #000,1.25px 0 0 #000,1.15px 0.48px 0 #000,0.88px 0.88px 0 #000,0.48px 1.15px 0 #000,0 1.25px 0 #000,-0.48px 1.15px 0 #000,-0.88px 0.88px 0 #000,-1.15px 0.48px 0 #000,-1.25px 0 0 #000,-1.15px -0.48px 0 #000,-0.88px -0.88px 0 #000,-0.48px -1.15px 0 #000,0 -1.25px 0 #000,0.48px -1.15px 0 #000,0.88px -0.88px 0 #000,1.15px -0.48px 0 #000';
export const PAREN_TRANSLATION_LOCK_CSS = [
    // 挂在气泡外时仍要压过伪元素小尾巴；字重钉死，避免美化把字压成细体。
    `.sully-chat-root .sully-paren-translation{z-index:20!important;font-weight:700!important;opacity:1!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;-webkit-text-stroke:0!important;background:transparent!important;text-shadow:${PAREN_OUTLINE_SHADOW}!important;}`,
    `.sully-chat-root .sully-paren-translation *{font-weight:700!important;opacity:1!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;-webkit-text-stroke:0!important;background:transparent!important;text-shadow:${PAREN_OUTLINE_SHADOW}!important;}`,
].join('');

export interface ParenTranslationSplit {
    original: string;
    translations: string[];
}

interface ParenSpan {
    start: number;
    end: number;
    inner: string;
}

const TIGHT_PUNCT = '。！？…、，,.!?〜~';

function isSpace(ch: string): boolean {
    return ch === ' ' || ch === '　' || ch === '\t';
}

function isNewline(ch: string): boolean {
    return ch === '\n' || ch === '\r';
}

function isOpenParen(ch: string): boolean {
    return ch === '（' || ch === '(';
}

function isCloseParen(ch: string): boolean {
    return ch === '）' || ch === ')';
}

function isKana(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF);
}

function hasKana(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        if (isKana(text.charAt(i))) return true;
    }
    return false;
}

function hanCount(text: string): number {
    const found = text.match(/[\u4E00-\u9FFF]/g);
    return found ? found.length : 0;
}

/** 括号里至少 2 个汉字，并且没有假名，才像中文翻译。一个字的（笑）（嗯）留下。 */
function isChineseTranslation(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || hasKana(trimmed)) return false;
    return hanCount(trimmed) >= 2;
}

function stripTrailingSpaceAndPunct(text: string): string {
    let end = text.length;
    while (end > 0) {
        const ch = text.charAt(end - 1);
        if (isSpace(ch) || TIGHT_PUNCT.indexOf(ch) >= 0) end--;
        else break;
    }
    return text.slice(0, end);
}

function matchingQuoteOpen(text: string, closeIndex: number): number {
    let depth = 0;
    for (let i = closeIndex; i >= 0; i--) {
        const ch = text.charAt(i);
        if (ch === '」') depth++;
        else if (ch === '「') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** 最外层括号。里面再套的括号算在这一对里。没闭合的不认。 */
function findOutermostParens(text: string): ParenSpan[] {
    const spans: ParenSpan[] = [];
    let i = 0;
    while (i < text.length) {
        const ch = text.charAt(i);
        if (!isOpenParen(ch)) {
            i++;
            continue;
        }
        const close = ch === '（' ? '）' : ')';
        let depth = 1;
        let j = i + 1;
        for (; j < text.length; j++) {
            const cur = text.charAt(j);
            if (cur === ch) depth++;
            else if (cur === close) {
                depth--;
                if (depth === 0) break;
            }
        }
        if (depth !== 0) {
            i++;
            continue;
        }
        spans.push({ start: i, end: j, inner: text.slice(i + 1, j) });
        i = j + 1;
    }
    return spans;
}

/** 字符数按眼睛看到的算：emoji、生僻字各算一个，不按字节数。 */
function charCount(text: string): number {
    return Array.from(text).length;
}

/**
 * 这对括号能不能整对穿过去 —— 它只是注音或旁注，不构成断句。
 *
 * 两类：括号里是假名（(バオバオ)，模型给「宝宝」加的读音），
 * 或者括号里只剩一个字符（(笑)(汗)）。
 * 一段中文译文、一句较长的动作描写都不算，照旧当断句停下。
 */
function isSkippableParen(inner: string): boolean {
    const trimmed = inner.trim();
    if (!trimmed) return false;
    if (hasKana(trimmed)) return true;
    return charCount(trimmed) === 1;
}

/** 把能穿过去的括号整对挖掉，其余原样留着。用来只看「真正在说的那句」。 */
function dropSkippableParens(text: string): string {
    const spans = findOutermostParens(text);
    let out = '';
    let cursor = 0;
    for (let n = 0; n < spans.length; n++) {
        const span = spans[n];
        if (!isSkippableParen(span.inner)) continue;
        out += text.slice(cursor, span.start);
        cursor = span.end + 1;
    }
    return out + text.slice(cursor);
}

/**
 * 括号前这段是不是紧贴的日文。
 * 句号、问号、感叹号、省略号和空格可以夹在中间。
 * 最后一个字可以是汉字。整段里要能看见假名。
 * 再往前若是句号隔开的中文、或一对既不是注音也不是单字的括号，就不算紧贴。
 */
function hasTightJapaneseBefore(parenHead: string): boolean {
    // 先把左边那段里「假名注音、单字旁注」整对挖掉，再判断紧不紧贴。
    // 不挖的话，(バオバオ)baobao（…）这种会被那对括号截成 baobao——
    // 罗马字里没有假名，整句就当没对上，气泡下面也就不出中文了。
    const head = dropSkippableParens(parenHead);

    let end = head.length - 1;
    while (end >= 0 && isSpace(head.charAt(end))) end--;
    if (end < 0 || isNewline(head.charAt(end)) || isCloseParen(head.charAt(end))) return false;

    let quoteDepth = 0;
    let j = end;
    for (; j >= 0; j--) {
        const ch = head.charAt(j);
        if (ch === '」') quoteDepth++;
        else if (ch === '「') quoteDepth = Math.max(0, quoteDepth - 1);
        if (quoteDepth === 0 && (isNewline(ch) || isOpenParen(ch) || isCloseParen(ch))) break;
    }
    const left = j < 0 ? 0 : j + 1;
    const segment = stripTrailingSpaceAndPunct(head.slice(left));
    if (!segment || isCloseParen(segment.charAt(segment.length - 1))) return false;

    let depth = 0;
    let boundary = -1;
    for (let i = 0; i < segment.length; i++) {
        const ch = segment.charAt(i);
        if (ch === '「') depth++;
        else if (ch === '」') depth = Math.max(0, depth - 1);
        else if (depth === 0 && '。！？…'.indexOf(ch) >= 0) boundary = i;
    }
    const candidate = stripTrailingSpaceAndPunct(boundary < 0 ? segment : segment.slice(boundary + 1)).trim();
    return !!candidate && hasKana(candidate);
}

/** 括号后面同一句还接着日文时，这个括号是夹在句子里的，不是这句的翻译。 */
function utteranceContinues(text: string, closeIndex: number): boolean {
    let i = closeIndex + 1;
    while (i < text.length && isSpace(text.charAt(i))) i++;
    if (i >= text.length || isNewline(text.charAt(i))) return false;
    const ch = text.charAt(i);
    if ('。！？…」.!?)'.indexOf(ch) >= 0 || isOpenParen(ch) || isCloseParen(ch)) return false;
    if ('、，,'.indexOf(ch) >= 0) {
        i++;
        while (i < text.length && isSpace(text.charAt(i))) i++;
        if (i >= text.length || isNewline(text.charAt(i))) return false;
        return isKana(text.charAt(i));
    }
    return isKana(ch);
}

/** 「日文（中文）」：翻译括号后面立刻是包住整句的引号。 */
function quoteClosesRightAfter(text: string, parenStart: number, parenEnd: number): boolean {
    let i = parenEnd + 1;
    while (i < text.length && isSpace(text.charAt(i))) i++;
    if (i >= text.length || text.charAt(i) !== '」') return false;
    const open = matchingQuoteOpen(text, i);
    return open >= 0 && open < parenStart;
}

/** 「日文」（中文）：引号只包日文，括号紧跟在引号后面。中间可以有句号。 */
function isParenRightAfterQuote(text: string, parenStart: number): boolean {
    let i = parenStart - 1;
    while (i >= 0 && (isSpace(text.charAt(i)) || TIGHT_PUNCT.indexOf(text.charAt(i)) >= 0)) i--;
    return i >= 0 && text.charAt(i) === '」';
}

function looksLikeVoiceOrLegacyBilingual(text: string): boolean {
    return /%%bilingual%%/i.test(text)
        || /<[语語]音/.test(text)
        || /<字幕>/.test(text);
}

function buildOriginal(text: string, spans: ParenSpan[]): string {
    let out = '';
    let cursor = 0;
    for (let n = 0; n < spans.length; n++) {
        const span = spans[n];
        let cut = span.start;
        while (cut > cursor && isSpace(text.charAt(cut - 1))) cut--;
        out += text.slice(cursor, cut);
        cursor = span.end + 1;
    }
    out += text.slice(cursor);
    return out.trim();
}

/**
 * 在一段话里找出紧贴的双语。对不上的括号原样留着。
 * paren：日文（中文）。整句被「」包住的那种留给 quoted。
 * quoted：「日文（中文）」或「日文」（中文）。
 * 上一行日文、下一行中文不认。
 */
export function splitParenTranslation(raw: string, format: ParenTranslationFormat): ParenTranslationSplit | null {
    const text = (raw || '').trim();
    if (!text || looksLikeVoiceOrLegacyBilingual(text)) return null;

    const spans = findOutermostParens(text);
    const hits: ParenSpan[] = [];
    for (let n = 0; n < spans.length; n++) {
        const span = spans[n];
        if (!isChineseTranslation(span.inner)) continue;
        if (utteranceContinues(text, span.end)) continue;
        if (!hasTightJapaneseBefore(text.slice(0, span.start))) continue;
        const wrapped = quoteClosesRightAfter(text, span.start, span.end);
        const afterQuote = isParenRightAfterQuote(text, span.start);
        if (format === 'paren') {
            if (wrapped) continue;
        } else if (!wrapped && !afterQuote) {
            continue;
        }
        hits.push(span);
    }
    if (!hits.length) return null;

    const original = buildOriginal(text, hits);
    if (!original || !hasKana(original)) return null;
    const translations: string[] = [];
    for (let n = 0; n < hits.length; n++) translations.push(hits[n].inner.trim());
    return { original, translations };
}
