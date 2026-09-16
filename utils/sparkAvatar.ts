/**
 * Spark 角色头像解析（v8c-1 / Ann 2026-09-16）
 *
 * 解析优先级：自定义头像 > 当前主聊天头像 > 生成时快照 > 名字 hash dicebear
 *
 * 为什么要独立一份模块级缓存：
 * - 帖子 / 评论里的 authorAvatar 是「生成那一刻的快照」，之后换主聊天头像，旧帖旧评原地不动；
 * - 聊天里的 Spark 卡片（components/chat/MessageItem）拿不到角色表，但也得跟着主聊天头像变。
 * 所以由 SocialApp 每次渲染把「charId → 主聊天头像」喂进本模块（syncSparkLiveAvatars），
 * 渲染端一律走 resolveSparkCharAvatar，不再直接读快照。
 */

const SPARK_CHAR_AVATARS_KEY = 'spark_char_avatars';

/** charId → 自定义头像（图片 URL 或 blobref 令牌）。「恢复默认」= 从表里删掉这个 key */
let customAvatars: Record<string, string> = {};
let customLoaded = false;

/** charId → 当前主聊天头像（SocialApp 每次渲染同步进来） */
let liveAvatars: Record<string, string> = {};

const ensureLoaded = (): void => {
    if (customLoaded) return;
    try {
        const raw = localStorage.getItem(SPARK_CHAR_AVATARS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        customAvatars = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        customAvatars = {};
    }
    customLoaded = true;
};

/** 读自定义头像表（副本，别直接改返回值） */
export const loadSparkCharAvatars = (): Record<string, string> => {
    ensureLoaded();
    return { ...customAvatars };
};

/** 写自定义头像；value 传空 = 恢复默认（回落主聊天头像） */
export const setSparkCharAvatar = (charId: string, value: string | null): void => {
    if (!charId) return;
    ensureLoaded();
    const next = { ...customAvatars };
    const v = (value || '').trim();
    if (v) next[charId] = v;
    else delete next[charId];
    customAvatars = next;
    try { localStorage.setItem(SPARK_CHAR_AVATARS_KEY, JSON.stringify(next)); } catch {}
};

/** SocialApp 每次渲染把角色表主头像喂进来，供聊天卡片共用（幂等，可安全重复调用） */
export const syncSparkLiveAvatars = (chars?: Array<{ id?: string; avatar?: string }> | null): void => {
    const next: Record<string, string> = {};
    for (const c of chars || []) {
        if (c && c.id && c.avatar) next[c.id] = c.avatar;
    }
    liveAvatars = next;
};

/** 路人头像：名字 hash dicebear（v8 任务 5 定稿的方案，与帖子流生成侧同一套） */
export const sparkStrangerAvatar = (name?: string): string => {
    const seeds = ['micah', 'avataaars', 'bottts', 'notionists'];
    const n = name || 'Unknown';
    const styleIdx = [...n].reduce((s, ch) => s + (ch.codePointAt(0) || 0), 0) % 4;
    return `https://api.dicebear.com/7.x/${seeds[styleIdx]}/svg?seed=${encodeURIComponent(n)}`;
};

/**
 * Spark 头像解析入口。
 * 传了 charId → 角色；没传 → 当路人（纯名字 hash，不碰角色逻辑）。
 */
export const resolveSparkCharAvatar = (charId?: string, snapshotAvatar?: string, fallbackName?: string): string => {
    if (charId) {
        const custom = loadSparkCharAvatars()[charId];
        if (custom) return custom;
        const live = liveAvatars[charId];
        if (live) return live;
    }
    if (snapshotAvatar) return snapshotAvatar;
    return sparkStrangerAvatar(fallbackName);
};
