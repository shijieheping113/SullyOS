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
    return safeParseArray(localStorage.getItem(SPARK_CIRCLES_KEY)).filter((c): c is SparkCircle => {
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

/**
 * 按当前视图过滤帖子：
 * - SPARK_CIRCLE_ALL → 全部帖子（含圈子帖与旧帖）
 * - 指定圈子 → 只返回 post.circleId 等于该圈子的帖子
 *   circleId 指向已删除圈子的"孤儿帖"仅在「全部」可见
 */
export function filterPostsByCircle(posts: SocialPost[], activeCircleId: string): SocialPost[] {
    if (!activeCircleId || activeCircleId === SPARK_CIRCLE_ALL) return posts;
    return posts.filter(post => post.circleId === activeCircleId);
}
