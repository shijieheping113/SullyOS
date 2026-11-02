/**
 * 私聊回复通知的总开关。
 *
 * 只管「角色回复时弹不弹系统通知」这一件事，跟主动消息（1.0 / 2.0）那套推送完全无关——
 * 那套有自己的开关与链路，别在这里顺手关掉。
 *
 * 默认开：这个功能做出来就是给手机用的，默认关掉等于白做；不想被打扰的人自己去设置里关。
 */

const STORAGE_KEY = 'sullyos.chatNotify.enabled.v1';
const EVENT = 'sullyos-chat-notify-setting';

/**
 * 现在要不要弹。读不到存档（隐私模式、存储被禁）时按「开」算——
 * 功能本身还有权限那道坎挡着，不该因为读不到一个开关就静默失效。
 */
export function isChatNotifyEnabled(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
        return true;
    }
}

/** 改开关并广播。返回落定后的值（存储写不进去时以内存外的现状为准）。 */
export function setChatNotifyEnabled(enabled: boolean): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
        // 写不进去也不影响这次会话：调用方拿返回值刷新界面即可。
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: enabled }));
    }
    return enabled;
}

/** 订阅开关变化（设置页自己改、别的标签页改都能收到）。 */
export function subscribeChatNotifyEnabled(listener: (enabled: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const onChange = (event: Event) => {
        const detail = (event as CustomEvent<boolean>).detail;
        listener(typeof detail === 'boolean' ? detail : isChatNotifyEnabled());
    };
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) listener(isChatNotifyEnabled());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}
