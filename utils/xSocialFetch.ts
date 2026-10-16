/**
 * 手机直连 Fx / x.md；Threads 与雅虎讨论走中心代理。
 */

import { getXJpProxyBase } from './proxyWorker';
import { expandShortUrl } from './webpageExtractor';
import {
    buildSocialModelFeed,
    cleanFeedText,
    extractTweetId,
    isThreadsUrl,
    isXUrl,
    personLabelShort,
    parseXSearchArg,
    resolveXReplyLimit,
    sliceSocialCardReplies,
    trimFeedFromEnd,
    type XJpRealtimeFlags,
    type XSocialCardData,
    type XSocialReply,
} from './xJpPack';

export interface XPackToolResult {
    ok: boolean;
    reason?: 'not_enabled' | 'parse_error' | 'unreachable' | 'no_results';
    summary: string;
    count?: number;
}

const timeoutSignal = (ms: number): AbortSignal => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
};

const getJson = async (url: string, ms: number): Promise<any> => {
    const res = await fetch(url, { signal: timeoutSignal(ms), headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        (err as any).status = res.status;
        (err as any).data = data;
        throw err;
    }
    return data;
};

const authorOf = (a: any) => ({
    name: a?.name || a?.full_name || null,
    handle: a?.screen_name || a?.username || null,
    avatar: a?.avatar_url || a?.avatar || a?.profile_pic_url || null,
});

const replyToOf = (st: any): { handle: string | null; name: string | null } => {
    const rt = st?.replying_to;
    if (rt && typeof rt === 'object') return { handle: rt.screen_name || null, name: rt.name || null };
    if (typeof rt === 'string' && rt.trim()) return { handle: rt.trim().replace(/^@+/, ''), name: null };
    return { handle: null, name: null };
};

const brief = (st: any) => {
    if (!st || typeof st !== 'object') return null;
    const rt = replyToOf(st);
    const author = authorOf(st.author);
    return {
        id: st.id,
        text: st.text || '',
        author,
        replyToHandle: rt.handle,
        replyToName: rt.name,
    };
};

export const cardFromFxConversation = (conv: any): XSocialCardData | null => {
    const status = conv?.status;
    if (!status) return null;
    const author = authorOf(status.author || conv.author);
    const mainId = String(status.id || '');
    const thread = (Array.isArray(conv.thread) ? conv.thread : []).map(brief).filter(Boolean) as NonNullable<ReturnType<typeof brief>>[];
    const repliesRaw = (Array.isArray(conv.replies) ? conv.replies : []).map(brief).filter(Boolean) as NonNullable<ReturnType<typeof brief>>[];
    const nameMap = new Map<string, string>();
    if (author.handle && author.name) nameMap.set(String(author.handle).toLowerCase(), author.name);
    thread.concat(repliesRaw).forEach(t => {
        if (t.author.handle && t.author.name) nameMap.set(String(t.author.handle).toLowerCase(), t.author.name);
    });
    const replies: XSocialReply[] = repliesRaw.map(t => {
        const handle = t.replyToHandle || author.handle;
        const name = t.replyToName || (handle ? nameMap.get(String(handle).toLowerCase()) : null) || null;
        return {
            name: t.author.name,
            handle: t.author.handle,
            avatar: t.author.avatar,
            text: t.text,
            replyToHandle: handle,
            replyToName: name,
        };
    });
    return {
        provider: 'fxtwitter',
        url: status.url,
        authorName: author.name,
        authorHandle: author.handle,
        avatar: author.avatar,
        text: status.text || '',
        statsLine: `互动：赞 ${status.likes ?? 0}｜转 ${status.reposts ?? status.retweets ?? 0}｜评 ${status.replies ?? 0}｜引用 ${status.quotes ?? 0}`,
        threadTexts: thread.filter(t => String(t.id) !== mainId).map(t => t.text),
        replies,
        totalReplies: Number(status.replies) || undefined,
    };
};

export const cardFromThreadsPayload = (card: any): XSocialCardData | null => {
    if (!card) return null;
    const replies: XSocialReply[] = (Array.isArray(card.replies) ? card.replies : []).map((r: any) => ({
        name: r.full_name || r.name || null,
        handle: r.username || r.handle || null,
        text: r.text || '',
        avatar: r.profile_pic_url || null,
        replyToHandle: r.reply_to_author || null,
        replyToName: r.reply_to_full_name || null,
    }));
    return {
        provider: 'threads-ssr',
        url: card.url,
        authorName: card.full_name || card.author?.full_name || null,
        authorHandle: card.username || card.author?.username || null,
        avatar: card.author?.profile_pic_url || card.profile_pic_url || null,
        text: card.text || '',
        statsLine: `互动：赞 ${card.like_count ?? 0}｜回复 ${card.reply_count ?? 0}｜转发 ${card.repost_count ?? 0}`,
        replies,
    };
};

const resolveTweetId = async (raw: string): Promise<string | null> => {
    const direct = extractTweetId(raw);
    if (direct) return direct;
    if (!/^https?:/i.test(raw)) return null;
    try {
        const finalUrl = await expandShortUrl(raw);
        return extractTweetId(finalUrl);
    } catch {
        return extractTweetId(raw);
    }
};

export const fetchXConversationCard = async (raw: string): Promise<XSocialCardData> => {
    const id = await resolveTweetId(raw);
    if (!id) throw Object.assign(new Error('parse_error'), { reason: 'parse_error' });
    let last: unknown;
    for (let i = 0; i < 2; i++) {
        try {
            const data = await getJson(`https://api.fxtwitter.com/2/conversation/${id}`, 25000);
            const card = cardFromFxConversation(data);
            if (!card) throw Object.assign(new Error('no_results'), { reason: 'no_results' });
            return card;
        } catch (e) {
            last = e;
        }
    }
    const reason = (last as any)?.reason === 'parse_error' || (last as any)?.reason === 'no_results' ? (last as any).reason : 'unreachable';
    throw Object.assign(new Error(reason), { reason });
};

export const fetchThreadsCard = async (raw: string): Promise<XSocialCardData> => {
    const url = `${getXJpProxyBase()}/threads/post?url=${encodeURIComponent(raw)}`;
    const res = await fetch(url, { signal: timeoutSignal(20000) });
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true) {
        const reason = data?.reason === 'parse_error' || data?.reason === 'no_results' ? data.reason : 'unreachable';
        throw Object.assign(new Error(reason), { reason });
    }
    const card = cardFromThreadsPayload(data.threads_card);
    if (!card) throw Object.assign(new Error('parse_error'), { reason: 'parse_error' });
    return card;
};

export const fetchLinkSocialCard = async (
    url: string,
    rc?: Pick<XJpRealtimeFlags, 'xReplyLimitMode' | 'xReplyMaxCount'> | null,
): Promise<{ kind: 'x' | 'threads'; card: XSocialCardData; feed: string } | null> => {
    const maxReplies = resolveXReplyLimit(rc);
    if (isThreadsUrl(url)) {
        const card = sliceSocialCardReplies(await fetchThreadsCard(url), maxReplies);
        return { kind: 'threads', card, feed: buildSocialModelFeed('threads', card) };
    }
    if (isXUrl(url)) {
        const card = sliceSocialCardReplies(await fetchXConversationCard(url), maxReplies);
        return { kind: 'x', card, feed: buildSocialModelFeed('x', card) };
    }
    return null;
};

const fail = (reason: XPackToolResult['reason'], detail = ''): XPackToolResult => ({
    ok: false,
    reason,
    summary: `ok: false\nreason: ${reason}${detail ? `\n${detail}` : ''}`,
});

/** 超长会从末尾收掉。收过就明说，免得模型以为自己看到了全部。 */
const okSummary = (summary: string): XPackToolResult => {
    const trimmed = trimFeedFromEnd(summary);
    const note = trimmed === summary ? '' : '\n（这条太长，末尾有一截没收进来，别当成全部。）';
    return { ok: true, summary: `ok: true\n${trimmed}${note}` };
};

export const runXSearch = async (
    q: string,
    options: { sort?: 'top' | 'latest'; includeReplies?: boolean } = {},
): Promise<XPackToolResult> => {
    const parsed = parseXSearchArg(q);
    const query = parsed.query.trim();
    if (!query) return fail('parse_error', '空关键词');
    const sort = parsed.sort || (options.sort === 'latest' ? 'latest' : 'top');
    const includeReplies = parsed.replies != null ? parsed.replies : !!options.includeReplies;
    const limited = 8;
    const fetchLim = Math.min(40, limited * 3);
    const qEff = !includeReplies && !/-filter:replies/i.test(query) ? `${query} -filter:replies` : query;
    const url = `https://x.pcstyle.dev/api/v1/search?${new URLSearchParams({
        q: qEff, format: 'json', feed: sort, limit: String(fetchLim),
    })}`;
    try {
        const data = await getJson(url, 12000);
        const posts = Array.isArray(data?.posts) ? data.posts : [];
        if (!posts.length) return fail('no_results');
        const kept: any[] = [];
        for (const st of posts) {
            const text = st?.raw_text?.text || st?.text || '';
            if (!includeReplies && String(text).trim().startsWith('@')) continue;
            kept.push(st);
            if (kept.length >= limited) break;
        }
        if (kept.length < limited) {
            const seen = new Set(kept);
            for (const st of posts) {
                if (seen.has(st)) continue;
                kept.push(st);
                if (kept.length >= limited) break;
            }
        }
        const used = kept;
        const replyNote = includeReplies ? '含回复' : '已加 -filter:replies';
        const lines = [`[X搜索] 「${query}」feed=${sort}｜${replyNote}｜${used.length}/${limited} 条`];
        if (used.length < limited) lines[0] += `｜仅找到 ${used.length} 条`;
        for (const st of used) {
            const text = cleanFeedText(st?.raw_text?.text || st?.text || '');
            const author = st?.author || {};
            lines.push(`- ${personLabelShort(author.name, author.screen_name)}: ${text}`);
        }
        return { ...okSummary(lines.join('\n')), count: used.length };
    } catch {
        return fail('unreachable');
    }
};

export const runXProfile = async (handleRaw: string): Promise<XPackToolResult> => {
    const handle = handleRaw.trim().replace(/^@+/, '');
    if (!handle) return fail('parse_error', '空用户名');
    const n = 8;
    try {
        const profile = await getJson(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(handle)}`, 12000).catch(() => null);
        const user = profile?.user || {};
        const data = await getJson(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(handle)}/statuses?count=34`, 12000);
        const results = Array.isArray(data?.results) ? data.results : [];
        if (!results.length) return fail('no_results');
        const own = results.filter((st: any) => {
            const h = String(st?.author?.screen_name || '').replace(/^@+/, '');
            return !h || h.toLowerCase() === handle.toLowerCase();
        }).slice(0, n);
        if (!own.length) return fail('no_results');
        const lines = [
            `[X主页] ${personLabelShort(user.name, user.screen_name || handle)}`,
            user.description ? `简介：${cleanFeedText(user.description)}` : '简介：（空）',
            `昵称：${user.name || '（无）'}`,
        ];
        own.forEach((st: any) => lines.push(`- ${cleanFeedText(st.text || '')}`));
        return { ...okSummary(lines.join('\n')), count: own.length };
    } catch {
        return fail('unreachable');
    }
};

export const runYahooDiscuss = async (q: string): Promise<XPackToolResult> => {
    const query = q.trim();
    if (!query) return fail('parse_error', '空关键词');
    try {
        const res = await fetch(`${getXJpProxyBase()}/yahoo-realtime/discuss?q=${encodeURIComponent(query)}&limit=8`, { signal: timeoutSignal(12000) });
        const data = await res.json().catch(() => null);
        if (!data || data.ok !== true) return fail(data?.reason === 'no_results' || data?.reason === 'parse_error' ? data.reason : 'unreachable');
        const items = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
        if (!items.length) return fail('no_results');
        const lines = [`[雅虎讨论] 「${query}」${items.length} 条`];
        items.forEach((it: any) => lines.push(`- ${personLabelShort(it.name, it.handle)}: ${cleanFeedText(it.text || '')}`));
        return { ...okSummary(lines.join('\n')), count: items.length };
    } catch {
        return fail('unreachable');
    }
};

export const runXRead = async (
    raw: string,
    rc?: Pick<XJpRealtimeFlags, 'xReplyLimitMode' | 'xReplyMaxCount'> | null,
): Promise<XPackToolResult> => {
    try {
        const card = sliceSocialCardReplies(await fetchXConversationCard(raw), resolveXReplyLimit(rc));
        return okSummary(buildSocialModelFeed('x', card));
    } catch (e) {
        const reason = (e as any)?.reason;
        return fail(reason === 'parse_error' || reason === 'no_results' ? reason : 'unreachable');
    }
};

export const runThreadsRead = async (
    raw: string,
    rc?: Pick<XJpRealtimeFlags, 'xReplyLimitMode' | 'xReplyMaxCount'> | null,
): Promise<XPackToolResult> => {
    try {
        const card = sliceSocialCardReplies(await fetchThreadsCard(raw), resolveXReplyLimit(rc));
        return okSummary(buildSocialModelFeed('threads', card));
    } catch (e) {
        const reason = (e as any)?.reason;
        return fail(reason === 'parse_error' || reason === 'no_results' ? reason : 'unreachable');
    }
};
