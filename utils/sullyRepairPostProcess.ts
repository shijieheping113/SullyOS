import { stripHtmlPromptLeaks, sullyFormatTidy } from './sullyMessageFormat';
import { extractHtmlBlocks, htmlToText } from './htmlPrompt';

export type RepairFormatKind = 'html' | 'emoji' | 'voice' | 'bilingual' | 'plain' | 'mixed';

export function inferRepairFormatKind(source: string): RepairFormatKind {
    const s = source || '';
    const hasHtml = /\[html\]/i.test(s) || /\[\/html\]/i.test(s)
        || (/<\s*div\b/i.test(s) && /HTML\s*卡片|系统记录|错误日志/i.test(s));
    const hasEmoji = /\[\[SEND_EMOJI:/i.test(s) || /\[表情[：:]/i.test(s) || /发送了表情/.test(s);
    const hasVoice = /<(?:语音|語音)/i.test(s);
    const hasBilingual = /<翻译>/i.test(s);
    const flags = [hasHtml, hasEmoji, hasVoice, hasBilingual].filter(Boolean).length;
    if (flags > 1) return 'mixed';
    if (hasHtml) return 'html';
    if (hasEmoji) return 'emoji';
    if (hasVoice) return 'voice';
    if (hasBilingual) return 'bilingual';
    return 'plain';
}

const HTML_BLOCK_RE = /\[html\]\s*([\s\S]*?)\s*\[\/html\]/gi;

/** 从损坏稿里抽出卡片可见文字，给模型当「必须保留」锚点 */
export function extractHtmlCardSemanticText(draftSource: string): string {
    const raw = (draftSource || '').trim();
    if (!raw) return '';
    let inner = raw;
    const m = raw.match(/\[html\]([\s\S]*?)\[\/html\]/i);
    if (m?.[1]) inner = m[1];
    else inner = inner.replace(/\[html\]/gi, '').replace(/\[\/html\]/gi, '');
    return htmlToText(inner).replace(/\s+/g, ' ').trim();
}

/** 剥提示词回显（勿误伤 [html] 标记本身） */
export function stripInlineHtmlPromptGarbage(source: string): string {
    let s = stripHtmlPromptLeaks(source || '');
    s = s.replace(/包裹真正的\s*HTML[。.）)\]]*/gi, '');
    s = s.replace(/要再发卡片必须用[^\n<]*/gi, '');
    s = s.replace(/\[HTML\s*卡片\]\s*/gi, '');
    s = s.replace(/（系统记录[^）)]*HTML\s*卡片[^）)]*）/gi, '');
    s = s.replace(/\[[^\]\n]{0,40}发送了(?:一张\s*)?HTML\s*卡片\]/gi, '');
    while (/^\s*<\/div>/i.test(s)) {
        s = s.replace(/^\s*<\/div>\s*/i, '');
    }
    const divStart = s.search(/<div\b/i);
    if (divStart > 0) s = s.slice(divStart);
    return s.trim();
}

/** 取第一段闭合的顶层 div */
export function extractFirstClosedDivBlock(html: string): string {
    const start = html.search(/<div\b/i);
    if (start < 0) return html.trim();
    const frag = html.slice(start);
    let depth = 0;
    const re = /<\/?div\b[^>]*>/gi;
    let end = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(frag)) !== null) {
        if (/^<\//.test(m[0])) depth--;
        else depth++;
        if (depth === 0) {
            end = m.index + m[0].length;
            break;
        }
    }
    if (end > 0) return frag.slice(0, end);
    return frag.trim();
}

/** 卡片内不许出现字面量 [html]；合并并列 div 时只加一层 max-width 外壳 */
function simplifyHtmlCardInner(html: string): string {
    let h = (html || '').trim();
    h = h.replace(/\[\/?html\]/gi, '');
    h = h.replace(/\s*\[html\]\s*/gi, '').replace(/\s*\[\/html\]\s*/gi, '');

    const nested270 = /^<div[^>]*width\s*:\s*27[^>]*>\s*<div([^>]*)>([\s\S]*)<\/div>\s*<\/div>$/i.exec(h);
    if (nested270) {
        h = `<div${nested270[1]}>${nested270[2]}</div>`;
    }

    const t = h.trim();
    if (!/^<div\b/i.test(t)) return t;
    const afterFirst = t.replace(/^<div\b[\s\S]*?<\/div>/i, '').trim();
    if (afterFirst && /^<div\b/i.test(afterFirst)) {
        return `<div style="max-width:270px;margin:0 auto;">${t}</div>`;
    }
    if (!/max-width|width\s*:/i.test(t.slice(0, 120))) {
        return t.replace(/^<div\b/i, '<div style="max-width:270px;margin:0 auto;"');
    }
    return t;
}

/** 模型常叠很多层 [html]；理顺成恰好一对，内层只留真实 HTML */
export function normalizeSingleHtmlCard(source: string): string {
    const withMarkers = (source || '').trim();
    const innerChunks: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(HTML_BLOCK_RE.source, 'gi');
    while ((m = re.exec(withMarkers)) !== null) {
        innerChunks.push(m[1].trim());
    }

    let inner: string;
    if (innerChunks.length > 0) {
        inner = innerChunks.reduce((best, cur) => (cur.length > best.length ? cur : best), '');
    } else {
        inner = withMarkers.replace(/\[html\]/gi, '').replace(/\[\/html\]/gi, '').trim();
    }

    inner = stripInlineHtmlPromptGarbage(inner);
    if (!/<\s*div\b/i.test(inner)) {
        return '';
    }

    inner = extractFirstClosedDivBlock(inner);
    const tail = withMarkers.replace(/\[html\][\s\S]*?\[\/html\]/gi, '').trim();
    if (tail && /<div\b/i.test(tail) && !inner.includes(tail.slice(0, 40))) {
        const extra = extractFirstClosedDivBlock(stripInlineHtmlPromptGarbage(tail));
        if (extra && extra !== inner) {
            inner = `<div style="max-width:270px;margin:0 auto;">${inner}${extra}</div>`;
        }
    }

    inner = simplifyHtmlCardInner(inner);
    if (!/<\s*div\b/i.test(inner)) return '';

    return `[html]${inner}[/html]`;
}

function isPromptOnlyLine(line: string): boolean {
    const t = line.trim();
    if (!t) return true;
    if (/^要修复的原文|^本次修复目标/.test(t)) return true;
    if (/^(系统记录|这只是历史占位|要再发卡片必须用|请勿复述)/.test(t)) return true;
    if (/^包裹真正的\s*HTML[。.）)]*$/.test(t)) return true;
    if (/^\[HTML\s*卡片\][^<]*$/.test(t)) return true;
    return false;
}

/** 猫儿 REPLY 里不许出现修格式用的标签片段 */
/** 剥误塞进 FIXED 的语音/字幕（HTML 卡修格式时防污染）；语音转换目标下禁止调用 */
export function stripRepairLeakageTags(source: string): string {
    let s = (source || '').trim();
    s = s.replace(/<字幕>[\s\S]*?<\/字幕>/gi, '');
    s = s.replace(/<字幕>[\s\S]*/gi, '');
    s = s.replace(/<(?:语音|語音)[\s\S]*?<\/\s*(?:语音|語音)\s*>/gi, '');
    return s.trim();
}

export function sanitizeRepairReplyForDisplay(reply: string): string {
    let s = (reply || '').trim();
    if (!s) return s;
    if (s.includes('<<<SULLY_')) {
        s = s.split('<<<SULLY_')[0].trim();
    }
    s = stripRepairLeakageTags(s);
    s = s.replace(/\[\[SEND_EMOJI:[^\]]+\]\]/gi, '');
    s = s.replace(/\[html\][\s\S]*?\[\/html\]/gi, '');
    s = s.replace(/\[html\][\s\S]*/gi, '');
    s = s.replace(/<翻译>[\s\S]*?<\/翻译>/gi, '');
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    return s || '……猫儿修了一手，预览里瞅一眼？';
}

/** 模型回传的 FIXED 若不像该类型（尤其 HTML 卡），别覆盖用户稿 */
export function isRepairedSourcePlausible(
    cleaned: string,
    draftSource: string,
): boolean {
    const out = (cleaned || '').trim();
    if (!out) return false;
    const expected = inferRepairFormatKind(draftSource);
    if (expected !== 'html' && expected !== 'mixed') return true;
    if (/\[html\][\s\S]*\[\/html\]/i.test(out)) return true;
    if (/<\s*div\b/i.test(out)) return true;
    return false;
}

/** 落库 / 预览前：剥占位、去提示词回显、按类型收紧格式 */
export function postProcessRepairedSource(
    source: string,
    originalHint?: RepairFormatKind,
    opts?: PostProcessRepairOpts,
): string {
    let s = (source || '').trim();
    if (!s) return s;

    s = s.replace(/<<<SULLY_REPLY>>>[\s\S]*?<<<SULLY_FIXED_SOURCE>>>/gi, '');
    s = s.replace(/<<<SULLY_FIXED_SOURCE>>>/gi, '');
    s = s.replace(/<<<END>>>/gi, '');

    const userGoal = opts?.userGoal ?? '';
    const kind = originalHint ?? opts?.originalHint ?? inferRepairFormatKind(s);
    const treatAsHtml = kind === 'html'
        || (/\[html\]/i.test(s) && !/\[\[SEND_EMOJI:/i.test(s))
        || (/\[\/html\]/i.test(s) && !/\[\[SEND_EMOJI:/i.test(s))
        || (/<\s*div\b/i.test(s) && !/\[\[SEND_EMOJI:/i.test(s) && kind !== 'emoji' && kind !== 'voice');

    if (treatAsHtml) {
        s = stripRepairLeakageTags(s);
        if (wantsFormatOnlyRepair(userGoal)) {
            s = minimalHtmlFormatRepair(s);
        } else {
            s = normalizeSingleHtmlCard(s);
            if (!s) {
                s = normalizeSingleHtmlCard(stripHtmlPromptLeaks(source));
            }
        }
        s = reorderHtmlBlockBeforeTrailingText(s);
    } else {
        s = stripHtmlPromptLeaks(s);
        const lines = s.split(/\r?\n/).filter(line => !isPromptOnlyLine(line));
        s = lines.join('\n').trim();
        const { text } = sullyFormatTidy(s, { scope: 'all' });
        s = text;
    }

    return stripHtmlPromptLeaks(s).trim();
}

/** 用户说只修格式、不动样式/内容时走轻量路径 */
export function wantsFormatOnlyRepair(userGoal: string): boolean {
    const g = (userGoal || '').trim();
    if (!g) return false;
    return /只修|格式.*(正确|对齐|规范)|不动\s*(样式|内容|排版)|不改编排|保留.*样式|删.*占位|去.*占位|不要重做|不改\s*html|html.*(样式|内容).*(不改|不动)/i.test(g);
}

/** 与主聊天管线一致：同一条源码里 HTML 卡写在最前，后面才是文字 */
export function reorderHtmlBlockBeforeTrailingText(source: string): string {
    if (!/\[html\]/i.test(source || '')) return (source || '').trim();
    const { blocks, cleanedContent } = extractHtmlBlocks(source);
    if (!blocks.length) return (source || '').trim();
    const cards = blocks.map(b => `[html]${b.html}[/html]`).join('\n');
    const tail = (cleanedContent || '').trim();
    return tail ? `${cards}\n${tail}` : cards;
}

/** 只剥占位/错标签，不重排 DOM、不改 style */
export function minimalHtmlFormatRepair(source: string): string {
    let s = (source || '').trim();
    s = s.replace(/<<<SULLY_FIXED_SOURCE>>>/gi, '').replace(/<<<END>>>/gi, '');
    const m = s.match(/\[html\]([\s\S]*?)\[\/html\]/i);
    if (!m) return normalizeSingleHtmlCard(s);
    let inner = stripInlineHtmlPromptGarbage(m[1]);
    inner = inner.replace(/^\[html\]\s*/i, '').replace(/\s*\[\/html\]\s*$/i, '');
    return reorderHtmlBlockBeforeTrailingText(`[html]${inner}[/html]`);
}

export type PostProcessRepairOpts = {
    originalHint?: RepairFormatKind;
    userGoal?: string;
};

export function formatKindLabel(kind: RepairFormatKind): string {
    switch (kind) {
        case 'html': return 'HTML 小卡片';
        case 'emoji': return '表情包';
        case 'voice': return '语音+字幕';
        case 'bilingual': return '双语块';
        case 'mixed': return '混排（多类型）';
        default: return '普通文字';
    }
}
