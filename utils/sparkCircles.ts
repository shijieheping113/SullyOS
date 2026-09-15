import type { SocialPost, SparkCircle } from '../types';

export const SPARK_CIRCLES_KEY = 'spark_circles';
export const SPARK_ACTIVE_CIRCLE_KEY = 'spark_active_circle';

/** 「全部」视图的固定 id */
export const SPARK_CIRCLE_ALL = 'all';

function safeParseArray(raw: string | null): unknown[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function loadSparkCircles(): SparkCircle[] {
    if (typeof localStorage === 'undefined') return [];
    const loaded = safeParseArray(localStorage.getItem(SPARK_CIRCLES_KEY)).filter((c): c is SparkCircle => {
        const circle = c as Partial<SparkCircle>;
        return typeof circle?.id === 'string'
            && typeof circle?.name === 'string'
            && Array.isArray(circle?.memberCharIds);
    }).map((c) => ({
        id: c.id,
        name: c.name,
        worldPrompt: typeof c.worldPrompt === 'string' ? c.worldPrompt : '',
        memberCharIds: c.memberCharIds,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    }));
    // 存量迁移：旧版建圈时 id 是空字符串（saveEditingCircle 从不生成 id），
    // 多个圈子全撞在 '' 上，帖子归属/候选池全失效。这里按数组顺序补发稳定 id，
    // 只跑一次（写回后 id 已非空，天然幂等）。
    if (loaded.some(c => !c.id)) {
        let legacyIndex = 0;
        const migrated = loaded.map(c => c.id ? c : { ...c, id: `circle-legacy-${legacyIndex++}` });
        try { localStorage.setItem(SPARK_CIRCLES_KEY, JSON.stringify(migrated)); } catch {}
        return migrated;
    }
    return loaded;
}

export function saveSparkCircles(circles: SparkCircle[]): void {
    localStorage.setItem(SPARK_CIRCLES_KEY, JSON.stringify(circles));
}

export function loadActiveCircleId(): string {
    if (typeof localStorage === 'undefined') return SPARK_CIRCLE_ALL;
    const id = localStorage.getItem(SPARK_ACTIVE_CIRCLE_KEY);
    return id || SPARK_CIRCLE_ALL;
}

export function saveActiveCircleId(id: string): void {
    localStorage.setItem(SPARK_ACTIVE_CIRCLE_KEY, id || SPARK_CIRCLE_ALL);
}

// --- 帖子追踪（分享到聊天的帖子，新互动追加通知消息给角色） ---

export interface TrackedSparkPost {
    /** 追踪这条帖子的角色（分享对象/同步对象），新评论时给它们各追加一条通知 */
    charIds: string[];
    /** 上次已同步进聊天的评论数：新评论数超过它才发通知，发完更新 */
    lastSyncedCommentCount: number;
}

const SPARK_TRACKED_KEY = 'spark_tracked_posts';

export function loadTrackedSparkPosts(): Record<string, TrackedSparkPost> {
    if (typeof localStorage === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(SPARK_TRACKED_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out: Record<string, TrackedSparkPost> = {};
        for (const [postId, v] of Object.entries(parsed)) {
            const entry = v as Partial<TrackedSparkPost>;
            if (Array.isArray(entry?.charIds) && typeof entry?.lastSyncedCommentCount === 'number') {
                out[postId] = { charIds: entry.charIds, lastSyncedCommentCount: entry.lastSyncedCommentCount };
            }
        }
        return out;
    } catch {
        return {};
    }
}

export function saveTrackedSparkPosts(tracked: Record<string, TrackedSparkPost>): void {
    try { localStorage.setItem(SPARK_TRACKED_KEY, JSON.stringify(tracked)); } catch {}
}

/** 把帖子注册进某角色的追踪名单（分享/同步到私聊时调用），评论水位 = 当前评论数 */
export function trackSparkPost(postId: string, charId: string, commentCount: number): void {
    const tracked = loadTrackedSparkPosts();
    const entry = tracked[postId];
    if (entry) {
        if (!entry.charIds.includes(charId)) entry.charIds.push(charId);
        entry.lastSyncedCommentCount = Math.max(entry.lastSyncedCommentCount, commentCount);
    } else {
        tracked[postId] = { charIds: [charId], lastSyncedCommentCount: commentCount };
    }
    saveTrackedSparkPosts(tracked);
}

/** 断开某帖的全部追踪（清空推荐流/手动断开） */
export function untrackSparkPost(postId: string): void {
    const tracked = loadTrackedSparkPosts();
    delete tracked[postId];
    saveTrackedSparkPosts(tracked);
}

// --- 楼中楼「新回复」已读水位（v9 二轮，Ann 拍板 B 案）---
// localStorage 持久化：postId → rootCommentId → 已读回复数。
// 语义：点开看过 = 永久已读（退出重进不复发）；首次打开的楼层记当前数（打开前的不算新）。

const SPARK_WATERMARK_KEY = 'spark_reply_watermarks';

export function loadSparkReplyWatermarks(): Record<string, Record<string, number>> {
    if (typeof localStorage === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(SPARK_WATERMARK_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as Record<string, Record<string, number>>;
    } catch {
        return {};
    }
}

export function saveSparkReplyWatermark(postId: string, rootId: string, count: number): void {
    try {
        const all = loadSparkReplyWatermarks();
        const postEntry = all[postId] || {};
        postEntry[rootId] = count;
        all[postId] = postEntry;
        localStorage.setItem(SPARK_WATERMARK_KEY, JSON.stringify(all));
    } catch {}
}

/**
 * 按当前视图过滤帖子（圈子间互相隔离，只能切换着看）：
 * - SPARK_CIRCLE_ALL → 无圈子的旧帖 + 孤儿帖（circleId 指向已删除圈子，回收进「全部」）
 * - 指定圈子 → 只返回 post.circleId 等于该圈子的帖子
 *
 * validCircleIds：当前仍存在的圈子 id 集合，用于识别孤儿帖。
 * 不传时「全部」只显示无圈子帖（保持纯函数可测）。
 */
export function filterPostsByCircle(
    posts: SocialPost[],
    activeCircleId: string,
    validCircleIds?: Set<string>,
): SocialPost[] {
    if (!activeCircleId || activeCircleId === SPARK_CIRCLE_ALL) {
        return posts.filter(post =>
            !post.circleId || (validCircleIds !== undefined && !validCircleIds.has(post.circleId))
        );
    }
    return posts.filter(post => post.circleId === activeCircleId);
}
