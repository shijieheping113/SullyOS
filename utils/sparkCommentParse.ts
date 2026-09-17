/** 把模型一条 JSON 拆成「公开评论」和「私聊」——两样可以同时有。 */

export function splitSparkCommentItem(raw: unknown): { publicContent: string | null; privateLines: string[] } {
    const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const content = typeof c.content === 'string' ? c.content.trim() : '';
    const privateLines = Array.isArray(c.privateChat)
        ? (c.privateChat as unknown[]).map(x => String(x ?? '').trim()).filter(Boolean)
        : [];
    if (c.toPrivateChat === true) {
        const lines = privateLines.length ? privateLines : (content ? [content] : []);
        return { publicContent: null, privateLines: lines };
    }
    return { publicContent: content || null, privateLines };
}

export function mergeSparkMentionIds(...groups: Array<string[] | undefined | null>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
        if (!group) continue;
        for (const id of group) {
            if (typeof id !== 'string' || !id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

export function canSparkPrivateChat(
    charId: string | undefined,
    syncedIds: string[],
    privateChatOff: Record<string, boolean> | undefined,
): boolean {
    if (!charId) return false;
    if (!syncedIds.includes(charId)) return false;
    if (privateChatOff && privateChatOff[charId]) return false;
    return true;
}

/** 发帖 @ 还没用掉强制的那一轮时，返回名单；用过了返回空。 */
export function unusedPostMentionIds(post: { mentions?: string[]; mentionForceUsed?: boolean } | null | undefined): string[] {
    if (!post || post.mentionForceUsed) return [];
    return mergeSparkMentionIds(post.mentions);
}

type ReplyNode = { id: string; authorName: string; authorCharId?: string; replyToId?: string };

/** 按作者名挂楼中楼：回复用户时优先挂到「这个说话者所在的那条线」；本轮被 @ 则强制挂在 @ 那条。 */
export function findSparkReplyTarget<T extends ReplyNode>(
    replyToName: string | undefined | null,
    pool: T[],
    opts: { matchedCharId?: string; speakerName?: string; userNames: string[]; forceCommentId?: string },
): T | undefined {
    if (opts.forceCommentId) {
        const forced = pool.find(c => c.id === opts.forceCommentId);
        if (forced) return forced;
    }
    const want = (replyToName || '').trim();
    const speaker = (opts.speakerName || '').trim();
    const byId = new Map(pool.map(c => [c.id, c]));
    const talksToSpeaker = (c: T): boolean => {
        let cur: T | undefined = c;
        const seen = new Set<string>();
        while (cur) {
            if (opts.matchedCharId && cur.authorCharId === opts.matchedCharId) return true;
            if (speaker && cur.authorName.trim() === speaker) return true;
            if (!cur.replyToId || seen.has(cur.id)) break;
            seen.add(cur.id);
            cur = byId.get(cur.replyToId);
        }
        return false;
    };
    if (want) {
        const byName = pool.filter(x => x.authorName.trim() === want);
        if (byName.length) {
            const isUser = opts.userNames.some(n => n.trim() === want);
            if (isUser && (opts.matchedCharId || speaker)) {
                const hit = [...byName].reverse().find(talksToSpeaker);
                if (hit) return hit;
            }
            return byName[byName.length - 1];
        }
    }
    if (speaker) {
        const own = pool.filter(x => x.authorName.trim() === speaker);
        if (own.length) return own[own.length - 1];
    }
    return undefined;
}
