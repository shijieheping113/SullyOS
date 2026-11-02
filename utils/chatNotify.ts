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
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** 通知正文上限。安卓侧太长的正文会被系统截断，宁可自己先收干净。 */
const BODY_MAX_LENGTH = 80;

/** 网页通知等 Service Worker 就绪的最长时间，超时就不发（不能把整条链路卡住）。 */
const SW_READY_TIMEOUT_MS = 3000;

export interface ChatReplyNotification {
    charId: string;
    charName: string;
    body: string;
    /** 网页通知用的图标地址（已解析成可直接加载的地址）。原生不读这个字段。 */
    iconUrl?: string;
}

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

/**
 * 确保有通知权限。原生和网页都走这里。
 *
 * 原生这边以前只「检查」不「申请」，用户从没点过允许就永远收不到通知——
 * 这是本次要补的第一件事。并发调用共用同一个请求，避免连弹两次系统弹窗。
 */
let permissionRequest: Promise<boolean> | null = null;

export function ensureNotificationPermission(): Promise<boolean> {
    if (!permissionRequest) {
        permissionRequest = requestPermissionOnce().catch(() => false);
        // 结果不留缓存：用户可能中途去系统设置里改，下次调用要重新问真实状态。
        void permissionRequest.then(() => { permissionRequest = null; });
    }
    return permissionRequest;
}

async function requestPermissionOnce(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
        const current = await LocalNotifications.checkPermissions();
        if (current.display === 'granted') return true;
        // 'denied' 是用户在系统里明确关掉了，再问也不会弹，只能引导去设置。
        if (current.display === 'denied') return false;
        const requested = await LocalNotifications.requestPermissions();
        return requested.display === 'granted';
    }

    if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
}

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
 * 返回是否真的发出去了，调用方可以据此决定要不要退回到页内提示。
 */
export async function notifyChatReply(payload: ChatReplyNotification): Promise<boolean> {
    const body = toNotificationBody(payload.body, `${payload.charName} 回复了消息`);

    if (Capacitor.isNativePlatform()) {
        if (!(await ensureNotificationPermission())) return false;
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
            return true;
        } catch (err) {
            console.warn('[ChatNotify] 原生通知发送失败', err);
            return false;
        }
    }

    if (!(await ensureNotificationPermission())) return false;
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;
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
        return true;
    } catch (err) {
        console.warn('[ChatNotify] 网页通知发送失败', err);
        return false;
    }
}

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
