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
