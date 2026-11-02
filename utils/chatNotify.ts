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
 * 所以每次失败都记一条原因，下次打开 App 由 OSContext 用一句人话说出来。
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** 通知正文上限。安卓侧太长的正文会被系统截断，宁可自己先收干净。 */
const BODY_MAX_LENGTH = 80;

/** 网页通知等 Service Worker 就绪的最长时间，超时就不发（不能把整条链路卡住）。 */
const SW_READY_TIMEOUT_MS = 3000;

/** 失败记录的存放处。超过这个时长的旧账不再翻，免得几天前的事也弹出来。 */
const FAILURE_STORAGE_KEY = 'sullyos.chatNotify.failure.v1';
const FAILURE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ChatReplyNotification {
    charId: string;
    charName: string;
    body: string;
    /** 网页通知用的图标地址（已解析成可直接加载的地址）。原生不读这个字段。 */
    iconUrl?: string;
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

interface NotifyFailureRecord {
    at: number;
    reason: NotifyFailureReason;
    charName: string;
}

function saveFailure(reason: NotifyFailureReason, charName: string): void {
    try {
        const record: NotifyFailureRecord = { at: Date.now(), reason, charName };
        localStorage.setItem(FAILURE_STORAGE_KEY, JSON.stringify(record));
    } catch { /* 隐私模式不让写，记不上就算了，不能因为记日志把通知链路搞崩 */ }
}

/** 发成功一次就把旧账清掉，免得下次打开还翻出早就不成立的失败。 */
function clearFailure(): void {
    try { localStorage.removeItem(FAILURE_STORAGE_KEY); } catch { /* 同上 */ }
}

/**
 * 取走「上次通知没发出去」那条记录（读一次就清空）。
 * 过期的不返回——几天前的失败再弹出来只会让人莫名其妙。
 */
export function takeNotifyFailure(): NotifyFailureRecord | null {
    try {
        const raw = localStorage.getItem(FAILURE_STORAGE_KEY);
        if (!raw) return null;
        localStorage.removeItem(FAILURE_STORAGE_KEY);
        const record = JSON.parse(raw) as NotifyFailureRecord;
        if (!record || typeof record.at !== 'number' || typeof record.reason !== 'string') return null;
        if (Date.now() - record.at > FAILURE_MAX_AGE_MS) return null;
        return record;
    } catch {
        return null;
    }
}

// ─── 权限 ───

/**
 * 确保有通知权限。原生和网页都走这里。
 *
 * 原生这边以前只「检查」不「申请」，用户从没点过允许就永远收不到通知——
 * 这是本次要补的第一件事。并发调用共用同一个请求，避免连弹两次系统弹窗。
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
 *       这条以前写成定时器，等于在手机上永远申请不到。
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

/** 网页通知：走 Service Worker。拿不到 registration 就不发，不抛错。 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
        return await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>(resolve => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
        ]);
    } catch {
        return null;
    }
}

/**
 * 发一条「角色回复了」的系统通知。
 * 返回结果里带失败原因，调用方可以据此决定要不要退回到页内提示。
 */
export async function notifyChatReply(payload: ChatReplyNotification): Promise<NotifyResult> {
    const body = toNotificationBody(payload.body, `${payload.charName} 回复了消息`);
    const result = Capacitor.isNativePlatform()
        ? await sendNative(payload, body)
        : await sendWeb(payload, body);

    if (result.ok) clearFailure();
    else if (result.reason) saveFailure(result.reason, payload.charName);
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

async function sendWeb(payload: ChatReplyNotification, body: string): Promise<NotifyResult> {
    const permission = await resolveNotificationPermission();
    if (!permission.ok) return permission;
    const registration = await getServiceWorkerRegistration();
    if (!registration) return { ok: false, reason: 'sw-unavailable' };
    try {
        await registration.showNotification(payload.charName, {
            body,
            icon: payload.iconUrl || './icons/icon-192.png',
            badge: './icons/icon-192.png',
            // 用唯一 tag 而不是按角色固定：同 tag 的通知浏览器会静默替换，后一条就不响了。
            // 连着来几条就叠几条，跟微信一样。
            tag: `chat-reply-${payload.charId}-${Date.now()}`,
            data: { charId: payload.charId, kind: 'chat-reply' },
        });
        return OK;
    } catch (err) {
        console.warn('[ChatNotify] 网页通知发送失败', err);
        return { ok: false, reason: 'web-error' };
    }
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

    return () => { void handle.remove(); };
}
