/**
 * X 贴链／日本热词／Threads 的纯规则。
 * 门控只有一套公式。国内热点来源不在这里。
 */

export const JP_HOT_DEFAULT_N = 6;
export const JP_HOT_HARD_CAP = 12;
export const JP_NO_NEWS = '（暂无可靠新闻摘要）';
export const X_PACK_TAG_NAMES = ['X_SEARCH', 'X_PROFILE', 'X_READ', 'YAHOO_DISCUSS', 'THREADS_READ'] as const;
export type XPackTagName = typeof X_PACK_TAG_NAMES[number];

export const JP_DOMAIN_OPTIONS: Array<{ key: string; label: string }> = [
    { key: 'anime', label: '二次元' },
    { key: 'seiyuu', label: '声优' },
    { key: 'tokusatsu', label: '特撮' },
    { key: 'celebrity', label: '明星' },
    { key: 'trending', label: '热议' },
    { key: 'local_social', label: '地方社会' },
    { key: 'game', label: '游戏' },
    { key: 'sports', label: '体育' },
];

export const JP_DOMAIN_DEFAULT_KEYS = JP_DOMAIN_OPTIONS.map(item => item.key);

export interface XJpRealtimeFlags {
    jpHotEnabled?: boolean;
    jpHotPickCount?: number;
    jpHotHours?: 4 | 24;
    jpHotInterestEnabled?: boolean;
    jpHotDomains?: string[];
    jpHotSource?: 'trends' | 'yahoo' | 'bing';
    xToolsEnabled?: boolean;
    xFeatLinkCards?: boolean;
    xFeatReadDeep?: boolean;
    xFeatSearch?: boolean;
    xFeatProfile?: boolean;
    xFeatYahooDiscuss?: boolean;
    xSearchFeed?: 'top' | 'latest';
    xSearchIncludeReplies?: boolean;
    xReplyLimitMode?: 'all' | 'custom';
    xReplyMaxCount?: number;
}

export interface XJpCharFlags {
    jpHotEnabled?: boolean;
    xToolsEnabled?: boolean;
}

export const clampJpHotCount = (n: unknown): number => {
    const v = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(v)) return JP_HOT_DEFAULT_N;
    return Math.max(1, Math.min(JP_HOT_HARD_CAP, Math.floor(v)));
};

export const X_REPLY_DEFAULT_MAX = 15;
export const X_REPLY_HARD_CAP = 200;

export const clampXReplyCount = (n: unknown): number => {
    const v = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(v)) return X_REPLY_DEFAULT_MAX;
    return Math.max(1, Math.min(X_REPLY_HARD_CAP, Math.floor(v)));
};

export const resolveXReplyLimit = (rc?: Pick<XJpRealtimeFlags, 'xReplyLimitMode' | 'xReplyMaxCount'> | null): number | null => {
    if (rc?.xReplyLimitMode !== 'custom') return null;
    return clampXReplyCount(rc?.xReplyMaxCount);
};

export const sliceSocialCardReplies = (card: XSocialCardData, maxReplies?: number | null): XSocialCardData => {
    if (maxReplies == null || !Number.isFinite(maxReplies)) return card;
    const cap = Math.max(0, Math.floor(maxReplies));
    const replies = card.replies || [];
    if (replies.length <= cap) return card;
    const totalReplies = Math.max(card.totalReplies || 0, replies.length);
    return {
        ...card,
        replies: replies.slice(0, cap),
        totalReplies,
    };
};

export const jpHotHoursOf = (hours: unknown): 4 | 24 => (hours === 24 ? 24 : 4);

export const jpHotInjectOn = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean =>
    !!rc?.jpHotEnabled && !!char?.jpHotEnabled;

export const xPackOn = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean =>
    !!rc?.xToolsEnabled && !!char?.xToolsEnabled;

/** Threads 贴链并进贴链分能力，不再单设第二面旗。 */
export const xLinkCardsOn = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean =>
    xPackOn(rc, char) && rc?.xFeatLinkCards !== false;

export const xReadDeepOn = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean =>
    xPackOn(rc, char) && !!rc?.xFeatReadDeep;

export const xSearchOn = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean =>
    xPackOn(rc, char) && rc?.xFeatSearch !== false;

export const xProfileOn = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean =>
    xPackOn(rc, char) && rc?.xFeatProfile !== false;

export const xYahooDiscussOn = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean =>
    xPackOn(rc, char) && !!rc?.xFeatYahooDiscuss;

export const xPackTagEnabled = (name: XPackTagName, rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): boolean => {
    if (name === 'X_SEARCH') return xSearchOn(rc, char);
    if (name === 'X_PROFILE') return xProfileOn(rc, char);
    if (name === 'X_READ' || name === 'THREADS_READ') return xReadDeepOn(rc, char);
    return xYahooDiscussOn(rc, char);
};

export const personLabel = (name?: string | null, handle?: string | null): string => {
    const h = (handle || '').trim().replace(/^@+/, '') || '';
    const n = (name || '').trim();
    if (n && h) return `${n}（@${h}）`;
    if (n) return n;
    if (h) return `@${h}`;
    return '?';
};

export const personLabelShort = (name?: string | null, handle?: string | null): string => {
    const h = (handle || '').trim().replace(/^@+/, '') || '';
    const n = (name || '').trim();
    if (n) return n;
    if (h) return `@${h}`;
    return '?';
};

export const cleanFeedText = (s: string | null | undefined): string => {
    if (!s) return '';
    let out = String(s)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    out = out.replace(/https?:\/\/\S+/gi, '');
    out = out.replace(/(^|[^\w/])(?:t\.co|pic\.twitter\.com|(?:mobile\.|m\.)?(?:x|twitter)\.com|threads\.(?:com|net))\/\S+/gi, '$1');
    out = out.replace(/[ \t\u3000]+/g, ' ');
    out = out.replace(/ *\n */g, '\n');
    out = out.replace(/ +([,.;:!?，。！？；：])/g, '$1');
    return out.trim();
};

export interface XSocialReply {
    name?: string | null;
    handle?: string | null;
    text: string;
    replyToName?: string | null;
    replyToHandle?: string | null;
    avatar?: string | null;
}

export interface XSocialCardData {
    provider: 'fxtwitter' | 'threads-ssr';
    url?: string;
    authorName?: string | null;
    authorHandle?: string | null;
    avatar?: string | null;
    text: string;
    statsLine?: string;
    threadTexts?: string[];
    replies: XSocialReply[];
    /** 帖子上挂着的回复总数（接口给的统计）。可能大于 replies.length：接口一页只回一部分。 */
    totalReplies?: number;
}

export const formatReplyLine = (reply: XSocialReply, opHandle: string, opName?: string | null): string => {
    const who = personLabelShort(reply.name, reply.handle);
    const th = (reply.replyToHandle || opHandle || '').replace(/^@+/, '');
    const tn = reply.replyToName || (th && opHandle && th.toLowerCase() === opHandle.replace(/^@+/, '').toLowerCase() ? opName : null);
    const target = personLabelShort(tn, th);
    return `${who} 回复 ${target}：${cleanFeedText(reply.text || '')}`;
};

export const socialShareHead = (kind: 'x' | 'threads', sharer: string, card: Pick<XSocialCardData, 'authorName' | 'authorHandle'>): string => {
    const brand = kind === 'x' ? 'X' : 'Threads';
    return `[${brand}帖子] ${sharer}分享了一条 ${brand} 帖（发帖作者：${personLabel(card.authorName, card.authorHandle)}；这是${sharer}在 ${brand} 上刷到后转给你一起看、找你聊的帖子卡片，不是${sharer}本人说的话）`;
};

export const extractSocialShareNote = (raw?: string | null): string => {
    if (!raw) return '';
    return cleanFeedText(raw);
};

export const buildSocialModelFeed = (
    kind: 'x' | 'threads',
    card: XSocialCardData,
    sharer?: string,
    shareNote?: string | null,
): string => {
    const handle = card.authorHandle || '?';
    const head = sharer
        ? socialShareHead(kind, sharer, card)
        : `${kind === 'x' ? '[X帖子]' : '[Threads帖子]'} ${personLabel(card.authorName, card.authorHandle)}`;
    const lines = [head];
    const note = extractSocialShareNote(shareNote);
    if (sharer && note) {
        lines.push(`${sharer}分享时附言：${note}`);
    }
    const body = (card.text || '').trim();
    if (body) {
        lines.push(sharer ? `帖子正文：\n${body}` : body);
    }
    if (card.statsLine) lines.push(card.statsLine);
    const extras = (card.threadTexts || []).filter(Boolean);
    if (extras.length) {
        lines.push(sharer ? '楼主连发补充：' : '—— 楼主连发 ——');
        extras.forEach(t => lines.push(t || ''));
    }
    const replies = card.replies || [];
    if (replies.length) {
        const total = card.totalReplies || 0;
        const more = total > replies.length;
        if (sharer) {
            lines.push(more
                ? `评论区（共 ${total} 条，当前展示前 ${replies.length} 条）：`
                : `评论区（${replies.length} 条）：`);
            replies.forEach(r => lines.push(`· ${formatReplyLine(r, handle, card.authorName)}`));
        } else {
            const rHead = kind === 'x' ? '—— 回复' : '—— 可见回复';
            lines.push(more
                ? `${rHead}—— 共 ${total} 条，这里只看到最新的 ${replies.length} 条（接口一页就回这么多，不是帖子只有这么点）`
                : `${rHead}（${replies.length}）——`);
            replies.forEach(r => lines.push(formatReplyLine(r, handle, card.authorName)));
        }
    }
    return cleanFeedText(lines.join('\n'));
};

const TWEET_ID_RE = /(?:status|statuses)\/(\d{5,25})/;

export const extractTweetId = (urlOrId: string): string | null => {
    const s = (urlOrId || '').trim();
    if (!s) return null;
    if (/^\d{5,25}$/.test(s)) return s;
    const m = s.match(TWEET_ID_RE);
    return m ? m[1] : null;
};

const hostOf = (url: string): string => {
    try {
        const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
        return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
};

const X_HOSTS = new Set([
    'x.com', 'twitter.com', 'fxtwitter.com', 't.co',
    'mobile.x.com', 'mobile.twitter.com', 'mobile.fxtwitter.com',
    'm.x.com', 'm.twitter.com',
]);

export const isXUrl = (url: string): boolean => {
    const host = hostOf(url);
    return X_HOSTS.has(host) || host.endsWith('.t.co');
};

export const isThreadsUrl = (url: string): boolean => {
    const host = hostOf(url);
    return host === 'threads.com' || host === 'threads.net' || host.endsWith('.threads.com') || host.endsWith('.threads.net');
};

export const isXOrThreadsUrl = (url: string): boolean => isXUrl(url) || isThreadsUrl(url);

export const findXOrThreadsUrl = (text: string): string | null => {
    const matches = text.match(/https?:\/\/[^\s，。！？；、"'《》()（）【】]+/ig) || [];
    return matches.find(isXOrThreadsUrl) || null;
};

/** 精确全名。先扫过的 XHS_* 不会被这里吃掉。 */
const X_PACK_TAG_RES: Array<{ name: XPackTagName; re: RegExp }> = [
    { name: 'X_SEARCH', re: /\[\[X_SEARCH:\s*([\s\S]*?)\]\]/ },
    { name: 'X_PROFILE', re: /\[\[X_PROFILE:\s*([\s\S]*?)\]\]/ },
    { name: 'X_READ', re: /\[\[X_READ:\s*([\s\S]*?)\]\]/ },
    { name: 'YAHOO_DISCUSS', re: /\[\[YAHOO_DISCUSS:\s*([\s\S]*?)\]\]/ },
    { name: 'THREADS_READ', re: /\[\[THREADS_READ:\s*([\s\S]*?)\]\]/ },
];

export const findFirstXPackTag = (text: string): { name: XPackTagName; arg: string; raw: string } | null => {
    let best: { name: XPackTagName; arg: string; raw: string; index: number } | null = null;
    for (const item of X_PACK_TAG_RES) {
        const re = new RegExp(item.re.source);
        const m = re.exec(text || '');
        if (!m || m.index < 0) continue;
        if (!best || m.index < best.index) best = { name: item.name, arg: (m[1] || '').trim(), raw: m[0], index: m.index };
    }
    return best ? { name: best.name, arg: best.arg, raw: best.raw } : null;
};

export const stripXPackTags = (text: string): string => {
    let next = String(text || '');
    for (const item of X_PACK_TAG_RES) {
        next = next.replace(new RegExp(item.re.source, 'g'), '');
    }
    return next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

const SNS_FLUFF = ['ホロライブ', 'おやつはホテル', '切り抜き', 'キリヌキ', 'スパチャ', '配信枠', 'youtube.com', 'youtu.be', '@youtube', 'チャンネル登録', '高評価', '草草草', 'マジで草', '誰かまとめて', 'それな', 'ガチャ', '天井到達', 'ファンアート', 'howl.link', 'hackernoon'];
const NEWSY = ['発表', '決定', '配信', '発売', '選出', '流出', '結婚', '死去', 'リコール', '不正', 'アップデート', '開幕', '当選', '就任', '辞任', '逮捕', '勝利', '敗退', '引退', 'リリース', '公開', '出演'];

export const looksLikeSnsFluff = (text: string | null | undefined): boolean => {
    if (!text) return true;
    const t = text.trim();
    if (t.length < 12) return true;
    if (t === JP_NO_NEWS || t === '（无摘要）') return false;
    const tl = t.toLowerCase();
    if (tl.includes('howl') || tl.includes('hackernoon')) return true;
    if (/\bon\s*x\b/i.test(t) || t.includes(' on X') || t.includes(' on Twitter')) return true;
    for (const h of SNS_FLUFF) {
        const hit = h.split('').every(ch => ch.charCodeAt(0) < 128) ? tl.includes(h.toLowerCase()) : t.includes(h);
        if (hit && !NEWSY.some(n => t.includes(n))) return true;
    }
    if ((t.match(/#/g) || []).length >= 3 || (t.match(/@/g) || []).length >= 2) return true;
    if (t.includes('热议关键词') || t.startsWith('関連：')) return true;
    return false;
};

export const stripHeatFromSummary = (s: string | null | undefined): string | null => {
    if (!s) return s ?? null;
    let t = s;
    t = t.replace(/（热度[^）]*）/g, '');
    t = t.replace(/\(热度[^)]*\)/g, '');
    t = t.replace(/热度约\s*[\d,，.]+万?\+?/g, '');
    t = t.replace(/热度\s*[\d,，.]+万?\+?/g, '');
    t = t.replace(/\d{1,3}(?:,\d{3})+\+/g, '');
    t = t.replace(/[。．]\s*[。．]/g, '。');
    t = t.replace(/^[ \t\r\n;；]+|[ \t\r\n;；]+$/g, '');
    return t || null;
};

const PRIMARY_ENDS = ['。', '！', '？', '…'];
const GOOD_TAIL = ['。', '！', '？', '…', '）', ')', '」', '』', '】', '》'];

const lastSentenceEnd = (window: string, floor: number): number => {
    let best = -1;
    for (const ch of PRIMARY_ENDS) {
        const i = window.lastIndexOf(ch);
        if (i >= floor - 1 && i > best) best = i;
    }
    let i = window.length;
    while (true) {
        i = window.lastIndexOf('.', i - 1);
        if (i < 0 || i < floor - 1) break;
        const prev = i > 0 ? window[i - 1] : '';
        const next = i + 1 < window.length ? window[i + 1] : '';
        if (/\d/.test(prev) && /\d/.test(next)) continue;
        if (i > best) best = i;
        break;
    }
    return best;
};

/** 短新闻收到句末。名义窗口大约 200 字，必要时软抬到 280，不在词中间硬切。 */
export const clipJpSummary = (raw: string, maxChars = 200): string => {
    let s = (raw || '').replace(/https?:\/\/\S+/gi, '').replace(/_{3,}/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return s;
    const minKeep = Math.min(80, maxChars);
    const healMin = Math.min(36, maxChars);
    const softCap = Math.max(maxChars, 280);
    const looksIncomplete = (t: string): boolean => {
        if (!t || t.startsWith('（暂无')) return false;
        if (GOOD_TAIL.some(ch => t.endsWith(ch))) return false;
        if (/[A-Za-z0-9]$/.test(t)) return true;
        if (/[てでにをがはのともへや～、,]$/.test(t)) return true;
        return lastSentenceEnd(t, healMin) >= healMin - 1;
    };
    const heal = (t: string): string => {
        const win = t.length <= softCap ? t : t.slice(0, softCap);
        const cut = lastSentenceEnd(win, healMin);
        if (cut >= 0) return t.slice(0, cut + 1).replace(/\s+$/, '');
        return t;
    };
    if (s.length <= maxChars) return looksIncomplete(s) ? heal(s) : s;
    let cut = lastSentenceEnd(s.slice(0, maxChars), minKeep);
    if (cut >= 0) return s.slice(0, cut + 1).replace(/\s+$/, '');
    cut = lastSentenceEnd(s.slice(0, softCap), minKeep);
    if (cut >= 0) return s.slice(0, cut + 1).replace(/\s+$/, '');
    if (s.length <= softCap) return looksIncomplete(s) ? heal(s) : s;
    let chunk = s.slice(0, softCap - 1).replace(/\s+$/, '');
    const alnum = chunk.match(/[A-Za-z0-9]+$/);
    if (alnum && alnum.index != null && alnum.index >= minKeep) chunk = chunk.slice(0, alnum.index).replace(/\s+$/, '');
    if (!chunk) chunk = s.slice(0, softCap - 1).replace(/\s+$/, '');
    const out = `${chunk}…`;
    if (looksIncomplete(out.replace(/…+$/, ''))) {
        const healed = heal(s.slice(0, softCap));
        if (GOOD_TAIL.some(ch => healed.endsWith(ch))) return healed;
    }
    return out;
};

export interface JpHotItem {
    query: string;
    domain_label?: string;
    summary?: string | null;
}

export const buildJpHotLines = (items: JpHotItem[]): string[] => items.map(item => {
    const dom = item.domain_label || '其它';
    let summ = stripHeatFromSummary(item.summary || '');
    if (!summ || summ === '（无摘要）' || summ.startsWith('関連：') || summ.includes('热议关键词') || looksLikeSnsFluff(summ)) {
        summ = JP_NO_NEWS;
    }
    return `${item.query}｜${dom}｜${summ}`;
});

export const buildJpHotModelFeed = (lines: string[], source: 'trends' | 'yahoo' | 'bing'): string => {
    if (!lines.length) return '';
    const header = source === 'yahoo'
        ? '【日本热词｜雅虎】'
        : source === 'bing'
            ? '【日本热词｜Bing】'
            : '【日本热词｜Google Trends】';
    return `${header}\n${lines.map(w => `- ${w}`).join('\n')}`;
};

export const jpHotCacheKey = (
    source: string,
    date: string,
    slot: number | string,
    hours: number,
    n: number,
    interest: string,
    domains: string,
): string => `jp-hot#${source}#${date}#${slot}#${hours}#${n}#${interest}#${domains}`;

export const estimateFeedTokens = (text: string): number => {
    let n = 0;
    for (let i = 0; i < text.length; i++) n += text.charCodeAt(i) > 127 ? 1 : 0.25;
    return Math.ceil(n);
};

/** 超了从末尾往回收，不从开头砍。 */
export const trimFeedFromEnd = (text: string, maxTokens = 8000): string => {
    if (estimateFeedTokens(text) <= maxTokens) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (estimateFeedTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
        else hi = mid - 1;
    }
    const nl = text.lastIndexOf('\n', lo);
    const cut = nl > 40 ? nl : lo;
    return text.slice(0, cut).replace(/\s+$/, '');
};

export const parseXSearchArg = (raw: string): { query: string; sort?: 'top' | 'latest'; replies?: boolean } => {
    const parts = String(raw || '').split('|').map(part => part.trim()).filter(Boolean);
    let query = '';
    let sort: 'top' | 'latest' | undefined;
    let replies: boolean | undefined;
    for (const part of parts) {
        const sortHit = part.match(/^sort\s*=\s*(top|latest)$/i);
        if (sortHit) {
            sort = sortHit[1].toLowerCase() as 'top' | 'latest';
            continue;
        }
        const replyHit = part.match(/^replies\s*=\s*(0|1)$/i);
        if (replyHit) {
            replies = replyHit[1] === '1';
            continue;
        }
        if (!query) query = part;
    }
    return { query, sort, replies };
};

export const xPackShortRecord = (
    name: XPackTagName,
    arg: string,
    ok: boolean,
    who = '',
    count?: number,
): string => {
    if (!ok) return '';
    const query = name === 'X_SEARCH' ? parseXSearchArg(arg).query : String(arg || '').trim();
    const handle = String(arg || '').trim().replace(/^@+/, '');
    const person = who || '角色';
    const seen = typeof count === 'number' ? `，看了 ${count} 条` : '';
    if (name === 'X_SEARCH') return `${person}在 X 搜索了「${query}」${seen}`;
    if (name === 'X_PROFILE') return `𝕏 ${person}看了 @${handle} 的 X 主页${seen}`;
    if (name === 'THREADS_READ') return `🧵 ${person}读了一条 Threads 帖`;
    if (name === 'YAHOO_DISCUSS') return `𝕏 ${person}看了雅虎上「${query}」的讨论${seen}`;
    return `𝕏 ${person}读了一条 X 帖`;
};

export const buildXPackTeaching = (rc?: XJpRealtimeFlags | null, char?: XJpCharFlags | null): string => {
    if (!xPackOn(rc, char)) return '';
    const lines: string[] = [
        '### X 与 Threads（和「小红书」不是一回事）',
        '下面这些标记只在对应能力开着时才有用。一次只写一个标记，写在单独一行。不要编造没看到的帖子，不要把原链接写进回复。',
    ];
    if (xSearchOn(rc, char)) {
        const sort = rc?.xSearchFeed === 'latest' ? 'latest' : 'top';
        const replies = rc?.xSearchIncludeReplies ? '1' : '0';
        lines.push(`- 搜 X：\`[[X_SEARCH: 关键词 | sort=top|latest | replies=0|1]]\`。搜索词必须用话题的原生语言（例如搜日本人物／作品／事件 → 用日语写关键词；英语圈话题 → 用英语）。不要把译成别的语言的词拿去搜，否则结果会对不上。不写 sort／replies 时，用设置里的默认：当前是 sort=${sort}、replies=${replies}（replies=0 不看回复，replies=1 连回复一起看）。`);
    }
    if (xProfileOn(rc, char)) {
        lines.push('- 看某人公开主页：`[[X_PROFILE: 用户名]]`（不用带 @）。');
    }
    if (xReadDeepOn(rc, char)) {
        lines.push('- 再翻一页 X 的楼：`[[X_READ: 帖子链接或数字 id]]`。');
        lines.push('- 再翻一页 Threads：`[[THREADS_READ: 帖子链接]]`。');
    }
    if (xYahooDiscussOn(rc, char)) {
        lines.push('- 看日本热词底下人们怎么聊：`[[YAHOO_DISCUSS: 日语词]]`。这是讨论，不是新闻。');
    }
    if (lines.length === 2) return '';
    return `\n${lines.join('\n')}\n`;
};

export const jpDiscussTeachingLine = (): string =>
    '若想看某条底下人们怎么聊（不是新闻），可以单独一行：[[YAHOO_DISCUSS: 日语关键词]]。别把讨论碎嘴当成新闻摘要。';
