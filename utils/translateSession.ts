/**
 * 心象译文的会话内台账（只管内存，不落库）。
 *
 * 背景：心象「译」出来的译文只活在组件 state 里（见 components/chat/MessageItem.tsx 的
 * ThinkingChainBlock），点「替换」才写回 metadata.thinkingChain。所以译文本来就不占磁盘，
 * 但它也没有过期策略——一旦用户把聊天窗口撑到全量（apps/Chat.tsx 里 LARGE = 999999 那条路），
 * 所有消息常驻不卸载，翻过的每一条译文就跟着一直躺在内存里。
 *
 * 规则（Ann 2026-11-08 定）：**离最新一条超过 30 条、且没点过替换的译态，清掉。**
 * 替换过的不用管：runReplace 成功后会自己把译文清空，登记随之注销。
 *
 * 唯一的例外是「翻旧账」：往上翻到一条几十条之前的老消息再点「译」，它天生就在窗口外。
 * 若立刻回收，译文会在眼前一闪就没，看着像功能坏了。所以**登记时就已经在窗口外**的那种，
 * 给一段宽限（TRANSLATE_GRACE_MS）再清；在窗口内翻的没有宽限，滑出窗口就走。
 *
 * 为什么不把「距离」当 prop 传进 MessageItem：那个组件有自定义 memo 比较器
 * （components/chat/MessageItem.tsx 末尾），多一个每来一条消息就变的 prop 会让 30 个重组件
 * 每次全量重渲染——apps/Chat.tsx 的注释点名过这是进聊天卡顿的主因之一。台账只回调真正要清的那几个。
 */

/** 离最新消息多少条之内保留。取 30 跟聊天默认一次渲染的条数对齐。 */
export const TRANSLATE_KEEP_WINDOW = 30;

/** 「翻旧账」译文的宽限时长，从登记那一刻起算。过了照常按距离清。 */
export const TRANSLATE_GRACE_MS = 120_000;

export interface TranslateHolder {
    /** 消息 id；流式预览那种临时负数 id 不登记。 */
    messageId: number;
    /** 清掉这条译文（回到原文显示）。 */
    clear: () => void;
}

interface Entry {
    holder: TranslateHolder;
    /** 登记时间，宽限从这里起算。 */
    since: number;
    /** 登记时就已经在窗口外（翻旧账）：这种才给宽限。 */
    graceEligible: boolean;
}

const entries = new Map<number, Entry>();
/** 最近一次发布的可见消息 id，从旧到新。空数组表示还没发布过。 */
let windowIds: number[] = [];
let nowFn: () => number = () => Date.now();

/** 登记一条有译文的块，返回注销函数。重复登记以最后一次为准。 */
export function registerTranslateHolder(holder: TranslateHolder): () => void {
    const entry: Entry = {
        holder,
        since: nowFn(),
        graceEligible: isGraceEligible(holder.messageId),
    };
    entries.set(holder.messageId, entry);
    return () => {
        if (entries.get(holder.messageId) === entry) entries.delete(holder.messageId);
    };
}

/**
 * 聊天把当前可见消息列表报过来。顺序必须从旧到新，返回这轮清掉了几条。
 *
 * 清理只由这条驱动：聊天变长、窗口变化时顺带清一次。没有定时器——聊天不长了本来也没东西要清，
 * 没必要为它养一个一直在跑的钟。
 */
export function setTranslateWindow(orderedIds: readonly number[]): number {
    windowIds = [...orderedIds];
    return dropOutOfWindow();
}

/** 测试用：清空台账和窗口。 */
export function resetTranslateSession(): void {
    entries.clear();
    windowIds = [];
    nowFn = () => Date.now();
}

/** 测试用：接管时钟，验证宽限窗口。 */
export function setTranslateSessionClock(clock: () => number): void {
    nowFn = clock;
}

/** 当前登记着的条数（测试与排查用）。 */
export function translateHolderCount(): number {
    return entries.size;
}

/** 在窗口里的位置：-1 表示压根不在列表里。 */
function windowIndex(messageId: number): number {
    if (windowIds.length === 0) return -1;
    return windowIds.lastIndexOf(messageId);
}

/** 已经不在保留窗口内（含压根不在列表里的情况）。 */
function isOutOfWindow(messageId: number): boolean {
    if (windowIds.length === 0) return false;
    const index = windowIndex(messageId);
    if (index < 0) return true;
    return index < windowIds.length - TRANSLATE_KEEP_WINDOW;
}

/**
 * 值不值得给宽限：只有「还在列表里、只是排得比较靠前」才算翻旧账。
 * 压根不在列表里的（删了 / 换角色 / 被过滤）不享受宽限，立刻清。
 */
function isGraceEligible(messageId: number): boolean {
    if (windowIds.length === 0) return false;
    const index = windowIndex(messageId);
    if (index < 0) return false;
    return index < windowIds.length - TRANSLATE_KEEP_WINDOW;
}

function dropOutOfWindow(): number {
    if (entries.size === 0) return 0;
    // 还没发布过窗口时不动手：那时判断不了新旧，贸然清会把刚翻好的译文抹掉。
    if (windowIds.length === 0) return 0;

    const now = nowFn();
    let dropped = 0;
    for (const entry of [...entries.values()]) {
        const { holder } = entry;
        // 不在列表里 = 已经不在聊天窗口（删了 / 换了角色 / 被过滤掉），按丢掉处理。
        if (!isOutOfWindow(holder.messageId)) continue;
        if (entry.graceEligible && now - entry.since < TRANSLATE_GRACE_MS) continue;
        entries.delete(holder.messageId);
        holder.clear();
        dropped += 1;
    }
    return dropped;
}
