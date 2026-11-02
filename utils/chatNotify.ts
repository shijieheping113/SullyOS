/**
 * 私聊消息的系统通知。
 *
 * 两条通道，一次调用自动选：
 *  - 原生 App：`@capacitor/local-notifications`。系统不会白给权限，得自己申请。
 *  - 网页 / PWA：Service Worker 的 `showNotification`，和主动消息那条链路一致
 *    （页面级 `new Notification` 在后台标签页会静默失败）。
 *
 * 这个模块只管「怎么发」，不管「该不该发」——该不该由调用点判断（用户不在
 * 这个聊天里、且页面不可见时才发），免得在前台重复打扰。
 *
 * 点击通知跳回聊天：原生这边插件给的是 `localNotificationActionPerformed`，
 * 网页那边 Service Worker 已经处理好了（sw-keep-alive.js 的 notificationclick）。
 * 两边最后都汇到同一个事件 `active-msg-open`，由 OSContext 里现成的监听切换页面。
 *
 * 发不出去时不能一声不响：手机端没有控制台，用户只能靠「怎么没弹」反过来猜。
 * 所以整条链路分三段留痕（监听挂上 / 回复到达 / 通知发出），每段带时间戳，
 * 回到前台时由 OSContext 用一句人话说清卡在哪一环。
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { resolveRefToDataUrl } from './blobRef';

/** 通知正文上限。安卓侧太长的正文会被系统截断，宁可自己先收干净。 */
const BODY_MAX_LENGTH = 80;

/** 自检探 Service Worker 时最多等多久（只用于自检，真正发通知不设超时）。 */
const SW_READY_TIMEOUT_MS = 3000;

/** 真发通知时等后台通道的上限。给安装/激活留足时间，又不至于卡死队列。 */
const SW_SEND_READY_TIMEOUT_MS = 5000;

/**
 * 「上一次离开屏幕时到底发生了什么」的存放处。
 *
 * 只记失败原因是不够的——失败记录解释不了「连失败记录都没有」这种情况
 * （回复是在用户回来之后才生成的、或者压根没走到发送那一步）。所以改成
 * 只要走到发送这一步就留一条，连同「当时页面是不是被看着」一起记下来，
 * 下次回到前台由 OSContext 用一句人话说清。超过这个时长的旧账不再翻。
 */
const ATTEMPT_STORAGE_KEY = 'sullyos.chatNotify.attempt.v1';
const ATTEMPT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * 链路留痕：一条回复要走三步才可能弹出通知——
 *   ① 监听器挂上了（程序愿意听这个消息）
 *   ② 回复真的到了（事件确实被派发、被收到）
 *   ③ 通知发了（走完发送，成功或失败）
 *
 * 用户看到的只有「没弹」。卡在哪一步，光看结果永远分不出来——之前就是这么
 * 原地打转的。所以每一步都留一个时间戳，自检时一次全摊开：哪一步没时间戳，
 * 就是那一步断的。
 */
const TRACE_STORAGE_KEY = 'sullyos.chatNotify.trace.v1';
const TRACE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface ChatReplyNotification {
    charId: string;
    charName: string;
    body: string;
    /** 角色头像的原始引用（blobref 令牌 / URL）。原生不读，网页用它当通知图标。 */
    avatarRef?: string;
}

/** 没发出去的具体原因。每种都给得出一条能照着做的提示。 */
export type NotifyFailureReason =
    | 'native-denied'
    | 'web-insecure'
    | 'web-unsupported'
    | 'web-denied'
    | 'sw-unavailable'
    | 'native-error'
    | 'web-error';

export interface NotifyResult {
    ok: boolean;
    reason?: NotifyFailureReason;
}

const OK: NotifyResult = { ok: true };

/** 通知 id 撞了会覆盖上一条，按递增搓一个 32 位整数。 */
let nextNotificationId = 1;
function takeNotificationId(): number {
    nextNotificationId = (nextNotificationId % 2147483000) + 1;
    return nextNotificationId;
}

/** 把消息内容压成一行短摘要：去换行、去多余空白、截断。 */
export function toNotificationBody(raw: string | undefined | null, fallback: string): string {
    const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return fallback;
    return cleaned.length > BODY_MAX_LENGTH ? `${cleaned.slice(0, BODY_MAX_LENGTH)}…` : cleaned;
}

function clockOf(at?: number): string {
    if (!at) return '';
    return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── 失败原因的人话 ───

/**
 * 把失败原因翻成用户能照着做的一句话。
 * 「没给权限」和「浏览器压根没有这个功能」是两回事，说错了会让人白去设置里翻半天。
 */
export function describeNotifyFailure(reason: NotifyFailureReason): string {
    switch (reason) {
        case 'native-denied':
            return '手机把通知权限关掉了，要去手机设置里给这个 App 打开通知';
        case 'web-insecure':
            return '这个网址浏览器不认作安全连接，所以不给发通知的资格（要 https 才能发）';
        case 'web-unsupported':
            return '这个浏览器没有通知功能';
        case 'web-denied':
            return '浏览器把通知权限关掉了，要去浏览器的网站设置里打开';
        case 'sw-unavailable':
            return '后台通道还没准备好，刷新一次再试';
        case 'native-error':
        case 'web-error':
            return '系统拒了这次通知';
        default:
            return '原因不明';
    }
}

// ─── 离开期间的记录 ───

/** 这一次通知的结局：发出去了 / 发失败了 / 判断成不该发（没走发送）。 */
export type NotifyOutcome = 'sent' | 'failed' | 'suppressed';

export interface NotifyAttempt {
    /** 回复到达的时刻。 */
    at: number;
    charName: string;
    /** 回复到达那一刻，页面是不是正在被用户看着。 */
    pageVisible: boolean;
    outcome: NotifyOutcome;
    reason?: NotifyFailureReason;
}

interface StoredAttempt extends NotifyAttempt {
    /** 已经跟用户说过一次了，别反复弹。 */
    acknowledged?: boolean;
}

/**
 * 记一条「这次回复到达时的处理结果」。
 *
 * 只在页面不可见（用户已经离开屏幕）时调用——页面可见的那些情况用户当场就在
 * 屏幕前，回来再复述一遍只是打扰，所以写入前会先被调用点挡掉。
 */
export function recordNotifyAttempt(attempt: Omit<NotifyAttempt, 'at'>): void {
    try {
        const record: StoredAttempt = { at: Date.now(), ...attempt };
        localStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(record));
    } catch { /* 隐私模式不让写，记不上就算了，不能因为记日志把通知链路搞崩 */ }
}

/**
 * 取走「用户离开屏幕期间发生过、还没跟他解释过」的那一条（读一次就清空）。
 *
 * 返回 null 的两种情况：没有记录；记录本身是页面可见时产生的（用户当时就在看）。
 * 过期的也不返回——半天前的失败再弹出来只会让人莫名其妙。
 */
export function takeUnseenAttempt(): NotifyAttempt | null {
    try {
        const raw = localStorage.getItem(ATTEMPT_STORAGE_KEY);
        if (!raw) return null;
        localStorage.removeItem(ATTEMPT_STORAGE_KEY);
        const record = JSON.parse(raw) as StoredAttempt;
        if (!record || typeof record.at !== 'number' || typeof record.outcome !== 'string') return null;
        if (record.acknowledged) return null;
        if (Date.now() - record.at > ATTEMPT_MAX_AGE_MS) return null;
        // 页面可见时产生的那条不用复述：用户当时就在屏幕前。
        if (record.pageVisible) return null;
        return {
            at: record.at,
            charName: record.charName,
            pageVisible: record.pageVisible,
            outcome: record.outcome,
            reason: record.reason,
        };
    } catch {
        return null;
    }
}

/**
 * 把一次尝试翻成人话。这段话唯一的用途是让用户（和隔着一层屏幕的排查者）
 * 分清三件完全不同的事：真的发出去了 / 发的时候被拦了 / 程序压根没打算发。
 */
export function describeAttempt(attempt: NotifyAttempt): string {
    const clock = clockOf(attempt.at);
    const head = `你离开屏幕的这段时间里，${attempt.charName} 在 ${clock} 回了一条消息。`;
    if (attempt.outcome === 'sent') {
        return `${head}这条的系统通知确实已经发出去了。要是你还是没看到弹窗，那是手机或浏览器把通知拦住了（静音模式、通知被系统关掉、或浏览器后台被限制）。`;
    }
    if (attempt.outcome === 'failed') {
        return `${head}通知没发出去：${describeNotifyFailure(attempt.reason || 'web-error')}。`;
    }
    return `${head}但程序当时以为你还在看着屏幕，所以没发系统通知，只在页面里飘了一下小卡片。`;
}

// ─── 该不该发 ───

/**
 * 回复到达时该走哪条路。抽成纯函数是有教训的：第一版把「界面正开着这个聊天」
 * 当成「人看着这个聊天」，结果从聊天页直接按 home 大退，页面还停在聊天页，
 * 程序认定用户在看，于是一条通知都不发、连页内提示也不飘。
 *
 *  - silent：页面在前台、而且正是这个聊天 → 屏幕上已经有这条了，不打扰
 *  - toast ：页面在前台、但开的是别处 → 页内小卡片（跟微信一致）
 *  - notify：页面在后台 / 熄屏 → 系统通知，不管开的是哪个页面
 */
export type ReplyDelivery = 'silent' | 'toast' | 'notify';

export function decideReplyDelivery(input: { isChattingWithThisChar: boolean; pageVisible: boolean }): ReplyDelivery {
    if (!input.pageVisible) return 'notify';
    return input.isChattingWithThisChar ? 'silent' : 'toast';
}

// ─── 流式：说一段播一条 ───

/**
 * 每个角色一条游标：这一轮已经播报过几段。
 *
 * 为什么需要它：一次回复可能分成好几段。如果等整段说完才发一条，用户体感是
 * 「发出去半天没回音，突然一次全冒出来」——不像在发消息，像在等一份文档。
 * 说一段播一条才像有人在那头真的说话。
 */
interface StreamCursor {
    /** 已经播报过的段数（按预览气泡的序号算）。 */
    spoken: number;
}

const streamCursors = new Map<string, StreamCursor>();

/**
 * 从「当前累计全文算出的预览气泡」里，取出刚说完的那几段。
 *
 * 只播已经收尾的段：最后一段后面还没有换行时，它可能还在长，这一轮先按住，
 * 等它收尾。宁可晚一条，也不要把半句话弹到锁屏上。
 *
 * 流式重试会重开一条流、全文从头累计，气泡数量会倒退。游标必须跟着收回来，
 * 否则重试之后新长出来的段会被当成「已经播过」，整段被吞掉。
 */
export function drainStreamSegments(
    charId: string,
    bubbles: string[],
    hasUnfinishedTail: boolean,
): string[] {
    if (bubbles.length === 0) return [];
    const current = streamCursors.get(charId);
    const spoken = current?.spoken ?? 0;
    const finishedCount = hasUnfinishedTail ? Math.max(0, bubbles.length - 1) : bubbles.length;

    if (spoken > finishedCount) {
        streamCursors.set(charId, { spoken: finishedCount });
        return [];
    }

    const fresh = bubbles.slice(spoken, finishedCount);
    if (fresh.length > 0) streamCursors.set(charId, { spoken: finishedCount });
    return fresh;
}

/** 这一轮已经播出去几条 —— 整段结束时用它算「还差哪几段没播」，避免重复也避免漏。 */
export function getStreamSpokenCount(charId: string): number {
    return streamCursors.get(charId)?.spoken ?? 0;
}

/**
 * 这一轮已经通知过哪些正文。
 *
 * 为什么不能只数「第几条」：这一轮有两条路会去发同一句话——流式那条按「预览气泡」
 * 数，落库那条按「落库气泡」数，两边的切分规则并不完全一样，差一段就会重弹，
 * 或者漏掉最后一句。所以改成按正文认领：同一句话这一轮只许通知一次，谁先来谁发，
 * 整段结束时的兜底只补「没人认领过」的那些。
 */
const roundSpoken = new Map<string, Set<string>>();

function roundTextKey(text: string): string {
    return (text || '').replace(/\s+/g, ' ').trim();
}

/** 这一轮这句正文是不是已经通知过了。 */
export function wasRoundNotified(charId: string, text: string): boolean {
    const key = roundTextKey(text);
    if (!key) return false;
    return roundSpoken.get(charId)?.has(key) ?? false;
}

/** 认领这一轮的这句正文（返回 false = 别人已经发过，这次别发了）。 */
function claimRoundText(charId: string, text: string): boolean {
    const key = roundTextKey(text);
    if (!key) return true;
    const spoken = roundSpoken.get(charId) ?? new Set<string>();
    if (spoken.has(key)) return false;
    spoken.add(key);
    roundSpoken.set(charId, spoken);
    return true;
}

/** 退回认领：这条其实没发出去，末尾那条兜底要能再试一次。 */
function releaseRoundText(charId: string, text: string): void {
    const key = roundTextKey(text);
    if (!key) return;
    roundSpoken.get(charId)?.delete(key);
}

/**
 * 发一条「这一轮的第 N 段」。已经发过的正文直接跳过。
 * 返回 null = 这句已经发过，什么都没做。
 *
 * 认领是同步占位的（不然两路同时发会一起通过检查），但发失败会把占位退回去——
 * 否则一次网络/系统抖动就让这一句永远发不出去，末尾兜底也会以为「发过了」。
 */
export function notifyRoundSegment(payload: ChatReplyNotification): Promise<NotifyResult> | null {
    if (!claimRoundText(payload.charId, payload.body)) return null;
    const task = notifyChatReply(payload);
    void task.then(
        result => { if (!result.ok) releaseRoundText(payload.charId, payload.body); },
        () => releaseRoundText(payload.charId, payload.body),
    );
    return task;
}

/**
 * 落库一条正文气泡时调一次：人不在屏幕前，就照这条的内容立刻弹一条系统通知。
 *
 * 这是「说一段弹一条」在「没开流式」时的正路：气泡是一条一条落库的（中间还有
 * 500~2000ms 的打字停顿），通知跟着气泡走，节奏跟聊天里看到的一致；而不是等整段
 * 说完才在末尾把几条一起补上——那正是「跟消息出来的时间对不上」的来源。
 */
export function notifyPersistedBubble(payload: ChatReplyNotification): void {
    // 人就在屏幕前：页面上本来就有一条条冒出来，不必再弹系统通知。
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    void notifyRoundSegment(payload);
}

/**
 * 流式播报的体检记录（只在内存里）。
 * 每次增量都写 localStorage 会拖慢流，所以攒着；整段结束时由 OSContext 汇总写进 trace。
 * 它存在的唯一理由：回答「明明回了三段，为什么只弹了一条」。
 */
interface StreamScan {
    /** 这一轮收到多少次增量。0 = 流式没开、或页面被冻住后一次到齐。 */
    deltas: number;
    /** 最后一次看到的预览气泡数。 */
    bubbles: number;
    /** 这一轮累计播出去几条。 */
    spoken: number;
    /** 最后一次增量时，最后一段后面是否还没换行（被按住不发）。 */
    hasTail: boolean;
    /** 最后一次增量时页面可见不可见。 */
    pageVisible: boolean;
}

const streamScans = new Map<string, StreamScan>();

export function noteStreamScan(charId: string, input: {
    bubbles: number;
    spokenNow: number;
    hasUnfinishedTail: boolean;
    pageVisible: boolean;
}): void {
    const prev = streamScans.get(charId);
    streamScans.set(charId, {
        deltas: (prev?.deltas ?? 0) + 1,
        bubbles: input.bubbles,
        spoken: (prev?.spoken ?? 0) + input.spokenNow,
        hasTail: input.hasUnfinishedTail,
        pageVisible: input.pageVisible,
    });
}

/** 用一句人话说清这一轮流式播报到底发生了什么 —— 自检里直接显示这句。 */
export function describeStreamScan(charId: string): string {
    const scan = streamScans.get(charId);
    if (!scan) {
        return '分段播报：这一轮没收到任何流式增量 —— 要么流式没开，要么页面被冻住、回复是回到前台才一次到齐的';
    }
    if (scan.spoken > 0) {
        return `分段播报：共 ${scan.deltas} 次增量、切出 ${scan.bubbles} 段，已播 ${scan.spoken} 条`;
    }
    if (scan.pageVisible) {
        return `分段播报：有 ${scan.deltas} 次增量，但那时页面是亮的 —— 按设计不弹系统通知`;
    }
    return `分段播报：有 ${scan.deltas} 次增量，却只切出 ${scan.bubbles} 段${scan.hasTail ? '（最后一段始终没换行、被按住）' : ''}，一条都没播`;
}

/** 一轮回复结束：清掉游标，下一轮从零开始数。 */
export function resetStreamNotify(charId: string): void {
    streamCursors.delete(charId);
    streamScans.delete(charId);
    roundSpoken.delete(charId);
}

// ─── 权限 ───

/**
 * 确保有通知权限。原生和网页都走这里。
 *
 * 原生这边以前只「检查」不「申请」，用户从没点过允许就永远收不到通知。
 * 并发调用共用同一个请求，避免连弹两次系统弹窗。
 */
let permissionRequest: Promise<NotifyResult> | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
    return (await resolveNotificationPermission()).ok;
}

export function resolveNotificationPermission(): Promise<NotifyResult> {
    if (!permissionRequest) {
        permissionRequest = requestPermissionOnce().catch((): NotifyResult => ({ ok: false, reason: 'native-error' }));
        // 结果不留缓存：用户可能中途去系统设置里改，下次调用要重新问真实状态。
        void permissionRequest.then(() => { permissionRequest = null; });
    }
    return permissionRequest;
}

async function requestPermissionOnce(): Promise<NotifyResult> {
    if (Capacitor.isNativePlatform()) {
        const current = await LocalNotifications.checkPermissions();
        if (current.display === 'granted') return OK;
        // 'denied' 是用户在系统里明确关掉了，再问也不会弹，只能引导去设置。
        if (current.display === 'denied') return { ok: false, reason: 'native-denied' };
        const requested = await LocalNotifications.requestPermissions();
        return requested.display === 'granted' ? OK : { ok: false, reason: 'native-denied' };
    }

    if (typeof window === 'undefined') return { ok: false, reason: 'web-unsupported' };
    if (typeof Notification === 'undefined') {
        // 通知 API 只在「安全环境」里存在：https 或 localhost。
        // 手机用 http://192.168.x.x 打开时整块 API 直接不见，这时候不是权限问题。
        return { ok: false, reason: window.isSecureContext === false ? 'web-insecure' : 'web-unsupported' };
    }
    if (Notification.permission === 'granted') return OK;
    if (Notification.permission === 'denied') return { ok: false, reason: 'web-denied' };
    return (await Notification.requestPermission()) === 'granted' ? OK : { ok: false, reason: 'web-denied' };
}

/**
 * 把权限申请安排到「弹得出框」的时机上。返回取消函数。
 *
 * 原生：上电后稍等一下直接问，系统弹窗不看手势。
 * 网页：安卓 Chrome / iOS Safari 只认「用户点了一下」之后的申请，
 *       定时器里申请会被静默丢掉（连框都不弹），所以等第一次触摸。
 */
export function primeNotificationPermission(): () => void {
    if (typeof window === 'undefined') return () => {};

    if (Capacitor.isNativePlatform()) {
        const timer = window.setTimeout(() => { void ensureNotificationPermission(); }, 1500);
        return () => window.clearTimeout(timer);
    }

    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return () => {};

    const handler = () => { void ensureNotificationPermission(); };
    window.addEventListener('pointerdown', handler, { once: true, capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', handler, true);
}

// ─── 发送 ───

/** 自检专用：探一次后台通道，超时就当没起来（真发送不设超时，见 sendWeb）。 */
async function probeServiceWorker(timeoutMs = SW_READY_TIMEOUT_MS): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
        return await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
        ]);
    } catch {
        return null;
    }
}

/**
 * 发一条「角色回复了」的系统通知。
 * 返回结果里带失败原因，调用方可以据此记录、或退回到页内提示。
 * 这里不落「尝试记录」——那次记录由调用方带着「当时页面可见吗」一起写，
 * 只有调用方知道回复到达那一刻用户在看什么。
 */
/** 通知发送队列：每次 notifyChatReply 接在这条链后面，保证先后顺序。 */
let sendChain: Promise<unknown> = Promise.resolve();

/**
 * 刚刚发过的正文，用来挡重复。
 *
 * 「说一段播一条」有两条路会碰到同一段话：流式那一路按「预览气泡」计数，
 * 整段结束时那一路按「落库气泡」补剩下的。两边的切分规则不完全一样，
 * 差一段就会把同一句再弹一遍。用户看到的是「怎么同一条弹了两遍」，
 * 比漏一条还难受。所以同一角色、同一正文、几秒之内只算一次。
 */
const recentBodies = new Map<string, { body: string; at: number }>();
const DEDUPE_WINDOW_MS = 4000;

export function notifyChatReply(
    payload: ChatReplyNotification,
    options?: { trace?: boolean; dedupe?: boolean },
): Promise<NotifyResult> {
    // 「说一段播一条」会连着调好几次。并发发出去的话，谁先准备好谁先弹，
    // 锁屏上就成了乱序——读起来像倒着说话。所以这里排一条队，按顺序落地。
    const task = sendChain.then(async () => {
        const body = toNotificationBody(payload.body, `${payload.charName} 回复了消息`);
        if (options?.dedupe !== false) {
            const last = recentBodies.get(payload.charId);
            if (last && last.body === body && Date.now() - last.at < DEDUPE_WINDOW_MS) {
                return OK;
            }
        }
        const result = await sendOne(payload, options);
        // 只有真的发出去了才记：失败的那条还要给下一次机会，不能被自己挡掉。
        if (result.ok) recentBodies.set(payload.charId, { body, at: Date.now() });
        return result;
    });
    // 排队只关心「什么时候能轮到下一条」：某一条卡死不等于后面全都不要了，
    // 到点先放行，别让一条通知把整轮都堵住。
    sendChain = Promise.race([task, delay(QUEUE_STALL_MS)]).then(() => undefined, () => undefined);
    return task;
}

/** 队列里某一条卡住时，最多等它这么久就放行下一条。 */
const QUEUE_STALL_MS = 8000;

function delay(ms: number): Promise<void> {
    return new Promise(resolve => { setTimeout(resolve, ms); });
}

async function sendOne(
    payload: ChatReplyNotification,
    options?: { trace?: boolean },
): Promise<NotifyResult> {
    const body = toNotificationBody(payload.body, `${payload.charName} 回复了消息`);
    const result = Capacitor.isNativePlatform()
        ? await sendNative(payload, body)
        : await sendWeb(payload, body);
    // 「说一段播一条」直接从这里发，不经过 OSContext，所以发送结果在这里统一留痕，
    // 否则自检第③行会一直是空的。自检自己发的那条要跳过，不然会把自己盖上去。
    if (options?.trace !== false) {
        traceNotify('send', { lastSendOk: result.ok, lastReason: result.reason });
    }
    return result;
}

async function sendNative(payload: ChatReplyNotification, body: string): Promise<NotifyResult> {
    const permission = await resolveNotificationPermission();
    if (!permission.ok) return permission;
    try {
        await LocalNotifications.schedule({
            notifications: [{
                id: takeNotificationId(),
                title: payload.charName,
                body,
                // 稍稍延后一点，避免和「刚打开 App」的启动动画抢焦点。
                schedule: { at: new Date(Date.now() + 250) },
                // 不指定 smallIcon：插件自带的只有 ic_transparent，写错名字反而没有图标。
                // 换成 App 自己的图标要等安卓工程建好之后再做。
                extra: { charId: payload.charId, kind: 'chat-reply' },
            }],
        });
        return OK;
    } catch (err) {
        console.warn('[ChatNotify] 原生通知发送失败', err);
        return { ok: false, reason: 'native-error' };
    }
}

/**
 * 网页通知：走 Service Worker 的 `showNotification`。
 *
 * 这一段是照着「主动消息 1.0 那条在你手机上确实弹得出来」的写法抄的，没有另发明一套。
 * 之前那版多绕了三道，每一道都能让它无声无息地死掉：
 *   ① 和 `serviceWorker.ready` 赛跑，超时 3 秒就放弃 —— 刚从后台回来时正好超时；
 *   ② 发送前又做一遍异步权限协商 —— 白白多一次等待；
 *   ③ 图标写死相对路径，不解析角色头像。
 * 现在：权限只看一眼现成状态，不协商；`ready` 等到「真的好了」为止，但封了 5 秒上限
 * （没注册 Service Worker 时它永远不兑现，封了上限才不会把发送队列卡死）；图标走和
 * 主动消息同一个解析函数，且解析失败只退成默认图标，不连累整条通知。
 */
async function sendWeb(payload: ChatReplyNotification, body: string): Promise<NotifyResult> {
    if (typeof window === 'undefined') return { ok: false, reason: 'web-unsupported' };
    if (typeof Notification === 'undefined') {
        return { ok: false, reason: window.isSecureContext === false ? 'web-insecure' : 'web-unsupported' };
    }
    if (Notification.permission !== 'granted') return { ok: false, reason: 'web-denied' };
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return { ok: false, reason: 'sw-unavailable' };
    }
    try {
        // 等后台通道就绪，但不能无限等：没注册 Service Worker 时（比如本地开发直接开端口）
        // `ready` 永远不会兑现，排队会一直卡住，用户只看到「怎么都不弹」。
        // 5 秒足够真实的安装/激活，超时就如实报「通道没起来」。
        const registration = await probeServiceWorker(SW_SEND_READY_TIMEOUT_MS);
        if (!registration) return { ok: false, reason: 'sw-unavailable' };
        // 令牌是个非空字符串，`avatar || 默认图标` 这种写法会让默认图标那条兜底永远轮不到，
        // 结果一个图标都没有还不报错。所以先解析成能加载的地址，拿到空串才用默认图标。
        // 解析要单独兜一层：它读的是本地资源库，万一抛错，不该把整条通知一起带走。
        let icon = './icons/icon-192.png';
        try {
            icon = (await resolveRefToDataUrl(payload.avatarRef || '')) || icon;
        } catch { /* 用默认图标 */ }
        await registration.showNotification(payload.charName, {
            body,
            icon,
            badge: './icons/icon-192.png',
            // 用唯一 tag 而不是按角色固定：同 tag 的通知浏览器会静默替换，后一条就不响了。
            // 「说一段播一条」时几段可能落在同一毫秒，用时间戳会撞 tag，所以走递增序号。
            tag: `chat-reply-${payload.charId}-${takeNotificationId()}`,
            data: { charId: payload.charId, kind: 'chat-reply' },
        });
        return OK;
    } catch (err) {
        console.warn('[ChatNotify] 网页通知发送失败', err);
        return { ok: false, reason: 'web-error' };
    }
}

// ─── 链路留痕 ───

export interface NotifyTrace {
    wiredAt?: number;
    lastReplyAt?: number;
    lastReplyVisible?: boolean;
    lastSendAt?: number;
    lastSendOk?: boolean;
    lastReason?: NotifyFailureReason;
    /** 最近一轮结束时，分段播报发生了什么的汇总（人话，直接显示）。 */
    lastStreamNote?: string;
    lastStreamAt?: number;
}

function readTraceRaw(): NotifyTrace {
    try {
        const raw = localStorage.getItem(TRACE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as NotifyTrace;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function traceNotify(
    step: 'wired' | 'reply' | 'send' | 'stream',
    extra: Omit<NotifyTrace, 'wiredAt' | 'lastReplyAt' | 'lastSendAt' | 'lastStreamAt'> = {},
): void {
    try {
        const next: NotifyTrace = { ...readTraceRaw(), ...extra };
        if (step === 'wired') next.wiredAt = Date.now();
        if (step === 'reply') next.lastReplyAt = Date.now();
        if (step === 'send') next.lastSendAt = Date.now();
        if (step === 'stream') next.lastStreamAt = Date.now();
        localStorage.setItem(TRACE_STORAGE_KEY, JSON.stringify(next));
    } catch { /* 记不上不影响主流程 */ }
}

/** 读链路留痕（不清空：自检要能反复看）。全部过期就整条作废。 */
export function readNotifyTrace(): NotifyTrace {
    const trace = readTraceRaw();
    const newest = Math.max(trace.wiredAt || 0, trace.lastReplyAt || 0, trace.lastSendAt || 0, trace.lastStreamAt || 0);
    if (!newest || Date.now() - newest > TRACE_MAX_AGE_MS) return {};
    return trace;
}

/** 把留痕翻成人话，直接展示，用户念出来就能定位。 */
export function describeNotifyTrace(trace: NotifyTrace = readNotifyTrace()): string[] {
    const lines: string[] = [];
    lines.push(trace.wiredAt
        ? `① 通知监听：已挂上（${clockOf(trace.wiredAt)}）`
        : '① 通知监听：没有挂上 —— 这一段代码根本没跑到，问题在更前面');
    lines.push(trace.lastReplyAt
        ? `② 收到回复：${clockOf(trace.lastReplyAt)}（当时屏幕${trace.lastReplyVisible ? '亮着、你在看' : '已经黑了 / 你退出了'}）`
        : '② 收到回复：没有记录 —— 从上次打开页面到现在，没有一条回复走到这里');
    if (trace.lastSendAt) {
        lines.push(trace.lastSendOk
            ? `③ 发通知：成功（${clockOf(trace.lastSendAt)}）`
            : `③ 发通知：失败（${clockOf(trace.lastSendAt)}）—— ${describeNotifyFailure(trace.lastReason || 'web-error')}`);
    } else {
        lines.push('③ 发通知：没有记录 —— 收到回复之后没走到发送这一步');
    }
    // ④ 只在「这一轮到底播了几段」上才有的答案。只弹一条时看这行：
    // 它要么说「页面是亮的所以按设计不弹」，要么说「只切出一段」，要么说「播了 N 条」。
    if (trace.lastStreamNote) {
        lines.push(`④ ${trace.lastStreamNote}`);
    }
    return lines;
}

// ─── 自检 ───

function permissionText(permission: string): string {
    if (permission === 'granted') return '已允许';
    if (permission === 'denied') return '被拒绝了（要去浏览器设置里手动开回来）';
    return '还没问过（点一下屏幕应该会弹框）';
}

/**
 * 一键自检：把通知这条链路上的每一环都问一遍，再真发一条试试。
 *
 * 为什么需要它：真机排查只能靠「有没有弹」反推，而「没弹」有五六种完全不同的
 * 原因，靠猜会一直原地打转。这里直接给出每一环的真实状态，用户念一遍就够了。
 * 返回的每一行都是人话，直接展示，不做二次翻译。
 */
export async function runNotifySelfCheck(): Promise<string[]> {
    if (typeof window === 'undefined') return ['这个环境里没有浏览器，测不了'];

    const lines: string[] = [];
    const isNative = Capacitor.isNativePlatform();
    lines.push(`运行环境：${isNative ? '装好的 App' : '浏览器里打开的网页'}`);

    if (!isNative) {
        // 通知 API 只在安全环境里存在：https 或 localhost。
        lines.push(`安全连接：${window.isSecureContext ? '是' : '不是（不是 https，浏览器不给发通知的资格）'}`);
        if (typeof Notification === 'undefined') {
            lines.push('浏览器通知能力：没有');
        } else {
            lines.push(`通知权限：${permissionText(Notification.permission)}`);
        }
        const sw = await probeServiceWorker();
        lines.push(`后台通道：${sw ? '已就绪' : '没起来（刷新一次页面再试）'}`);
    }

    const permission = await resolveNotificationPermission();
    if (!permission.ok) {
        lines.push(`权限确认：没有 —— ${describeNotifyFailure(permission.reason || 'web-denied')}`);
    } else {
        lines.push('权限确认：有');
        const sent = await notifyChatReply({
            charId: 'self-check',
            charName: '通知自检',
            body: '看到这一条，就说明通知通道是通的',
        }, { trace: false, dedupe: false });
        lines.push(sent.ok
            ? '试发一条：已经发出去了（去看通知栏 / 锁屏有没有）'
            : `试发一条：失败 —— ${describeNotifyFailure(sent.reason || 'web-error')}`);
    }

    // 上次离开屏幕时那一条走了多远：三步里哪一步缺时间戳，就是断在哪一步。
    lines.push(...describeNotifyTrace());
    return lines;
}

// ─── 点击跳回聊天 ───

/**
 * App 冷启动时点通知进来的那条，监听器可能还没挂上。
 * 先存在这里，等 OSContext 装好监听再去取，别让它丢了。
 */
let pendingTapCharId: string | null = null;

/** 取走冷启动时攒下的那次点击（取一次就清空）。 */
export function consumePendingNotificationTap(): string | null {
    const charId = pendingTapCharId;
    pendingTapCharId = null;
    return charId;
}

/**
 * 挂原生通知点击的监听。返回取消函数。
 * 网页那边不用挂：Service Worker 的 notificationclick 已经处理好了。
 */
export async function installNotificationTapHandler(): Promise<() => void> {
    if (!Capacitor.isNativePlatform()) return () => {};

    const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const extra = action.notification?.extra as { charId?: string } | undefined;
        const charId = extra?.charId;
        if (!charId) return;
        pendingTapCharId = charId;
        window.dispatchEvent(new CustomEvent('active-msg-open', { detail: { charId } }));
    });

    return () => { handle.remove(); };
}
