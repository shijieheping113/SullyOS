/**
 * 全局翻译总开关。
 *
 * 只管「要不要露出翻译入口」这一件事。目前来源只有谷歌本地（网页 gtx），
 * 对象只有心象；以后加来源／对象也走这个总闸，别再另开一套。
 *
 * 默认开：心象「译」已经先上了，开关是为了能关掉，不是为了再开一次才给用。
 */

const STORAGE_KEY = 'sullyos.globalTranslate.enabled.v1';
const EVENT = 'sullyos-global-translate-setting';

/** 现在开没开。读不到存档时按「开」——跟已经放出的心象译入口对齐。 */
export function isGlobalTranslateEnabled(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
        return true;
    }
}

/** 改开关并广播。返回落定后的值。 */
export function setGlobalTranslateEnabled(enabled: boolean): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
        // 写不进去也不挡这次会话：调用方拿返回值刷新界面即可。
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: enabled }));
    }
    return enabled;
}

/** 订阅开关变化（设置页自己改、别的标签页改都能收到）。 */
export function subscribeGlobalTranslateEnabled(listener: (enabled: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const onChange = (event: Event) => {
        const detail = (event as CustomEvent<boolean>).detail;
        listener(typeof detail === 'boolean' ? detail : isGlobalTranslateEnabled());
    };
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) listener(isGlobalTranslateEnabled());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}
