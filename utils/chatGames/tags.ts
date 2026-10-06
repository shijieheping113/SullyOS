/**
 * 小游戏旁边的记号分三类。
 * 会再跑一轮的那份，和 applyAssistantPostProcessing 里原先的 willRegenerate 是同一份。
 * 显示类留在正文里交给渲染；动作类抽出来交还给调用方执行，不能塞进渲染，否则会被剥掉。
 */

const RERUN_SOURCES = [
    String.raw`\[\[RECALL:\s*\d{4}[-/年]\d{1,2}\]\]`,
    String.raw`\[\[SEARCH:\s*.+?\]\]`,
    String.raw`\[\[READ_DIARY:\s*.+?\]\]`,
    String.raw`\[\[FS_READ_DIARY:\s*.+?\]\]`,
    String.raw`\[\[READ_NOTE:\s*.+?\]\]`,
    String.raw`\[\[XHS_SEARCH:\s*.+?\]\]`,
    String.raw`\[\[XHS_BROWSE(?::\s*.+?)?\]\]`,
    String.raw`\[\[XHS_MY_PROFILE\]\]`,
    String.raw`\[\[XHS_DETAIL:\s*.+?\]\]`,
];

const ACTION_SOURCE = [
    String.raw`\[\[ACTION:[\s\S]*?\]\]`,
    String.raw`\[\[MUSIC_ACTION(?::[\s\S]*?)?\]\]`,
    String.raw`\[\[LIFE:[\s\S]*?\]\]`,
    String.raw`\[\[NEWS_CARD:[\s\S]*?\]\]`,
    String.raw`\[\[COLLAB_FILE:[\s\S]*?\]\]`,
    String.raw`\[\[DIARY_START:[\s\S]*?\]\][\s\S]*?\[\[DIARY_END\]\]`,
    String.raw`\[\[DIARY:[\s\S]*?\]\]`,
    String.raw`\[\[FS_DIARY_START:[\s\S]*?\]\][\s\S]*?\[\[FS_DIARY_END\]\]`,
    String.raw`\[\[FS_DIARY:[\s\S]*?\]\]`,
    String.raw`\[\[XHS_SHARE:[\s\S]*?\]\]`,
    String.raw`\[\[XHS_POST:[\s\S]*?\]\]`,
    String.raw`\[\[XHS_COMMENT:[\s\S]*?\]\]`,
    String.raw`\[\[XHS_REPLY:[\s\S]*?\]\]`,
    String.raw`\[\[XHS_LIKE:[\s\S]*?\]\]`,
    String.raw`\[\[XHS_FAV:[\s\S]*?\]\]`,
].join('|');

const STICKY_SOURCE = [
    String.raw`\[\[INNER_STATE:\s*[\s\S]*?\]\]`,
    String.raw`\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]`,
    String.raw`\[(?:QU[OA]TE|引用)[：:][^\]]*\]`,
    String.raw`\[回复\s*[""“][^""”]*?[""”](?:\.{0,3})\]\s*[：:]?\s*`,
    String.raw`\[[^\[\]\n「」]{0,24}引用了[^\[\]\n「」]{0,24}「[^」\n]*?」[^\[\]\n]{0,24}\]\s*`,
].join('|');

const DISPLAY_TOKEN_SOURCE = `${STICKY_SOURCE}|\\[\\[SEND_EMOJI[:：]\\s*.*?\\]\\]`;

export function hasRerunTags(content: string): boolean {
    return RERUN_SOURCES.some((source) => new RegExp(source).test(content || ''));
}

export function stripRerunTags(content: string): string {
    let next = String(content || '');
    for (const source of RERUN_SOURCES) {
        next = next.replace(new RegExp(`(?:\\n[ \\t]*)?${source}(?:[ \\t]*\\n)?`, 'g'), '\n');
    }
    return next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function splitActionTags(text: string): { display: string; actions: string[] } {
    const actions: string[] = [];
    const display = String(text || '').replace(new RegExp(ACTION_SOURCE, 'gi'), (match) => {
        actions.push(match);
        return '';
    });
    return { display, actions };
}

type DisplayToken = { kind: 'sticky' | 'emoji' | 'text'; text: string; index: number };

function tokenizeDisplay(text: string): DisplayToken[] {
    const re = new RegExp(DISPLAY_TOKEN_SOURCE, 'gi');
    const out: DisplayToken[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
        if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index), index: last });
        const raw = match[0];
        out.push({
            kind: /^\[\[SEND_EMOJI/i.test(raw) ? 'emoji' : 'sticky',
            text: raw,
            index: match.index,
        });
        last = match.index + raw.length;
    }
    if (last < text.length) out.push({ kind: 'text', text: text.slice(last), index: last });
    return out;
}

/**
 * 引用单独一行时，渲染会把它当成没有字的一段丢掉。
 * 有表情就先落表情；引用并到后面真正有字的那一段。没有下一段时，留给接话挂上。
 */
export function partitionDisplay(text: string): { persist: string; carry: string } {
    const source = String(text || '');
    const tokens = tokenizeDisplay(source);
    let lastWord = -1;
    tokens.forEach((token, index) => {
        if (token.kind === 'text' && token.text.trim()) lastWord = index;
    });
    if (lastWord === -1) {
        return {
            persist: tokens.filter((token) => token.kind === 'emoji').map((token) => token.text).join('\n'),
            carry: tokens.filter((token) => token.kind === 'sticky').map((token) => token.text).join('\n'),
        };
    }
    const trailing = tokens.slice(lastWord + 1).find((token) => token.kind === 'sticky');
    if (!trailing) return { persist: source, carry: '' };
    return { persist: source.slice(0, trailing.index).trim(), carry: source.slice(trailing.index).trim() };
}

/** 给接话模型看的上文：去掉表情、引用这些已经落过库的记号，只留说过的话。 */
export function plainGameSpeech(text: string): string {
    const { display } = splitActionTags(text);
    return display
        .replace(new RegExp(STICKY_SOURCE, 'gi'), '')
        .replace(/\[\[SEND_EMOJI[:：]\s*.*?\]\]/gi, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
