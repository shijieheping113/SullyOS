import { useSyncExternalStore } from 'react';

export const GUIDE_KEY = 'os_first_use_memory_guide_v1';
export const GUIDE_SULLY_ID = 'preset-sully-v2';
const SKIP_VECTOR_KEY = 'os_first_use_skip_vector_v1';
const event = 'sully:first-use-guide';
export function setVectorGuideSkipped(skipped: boolean) {
    localStorage.setItem(SKIP_VECTOR_KEY, String(skipped));
    window.dispatchEvent(new Event(event));
}
export function useVectorGuideSkipped() {
    return useSyncExternalStore(subscribe, () => localStorage.getItem(SKIP_VECTOR_KEY) === 'true', () => false);
}
export function readGuideStep(): number | null {
    const value = localStorage.getItem(GUIDE_KEY);
    return value !== null && /^[0-6]$/.test(value) ? Number(value) : null;
}
export function setGuideStep(step: number | 'done') {
    localStorage.setItem(GUIDE_KEY, String(step));
    window.dispatchEvent(new Event(event));
}
// Called only after a successful DB read, before inserting the built-in Sully.
// 二改：不要作者新手引导；新装直接记成完成，避免空角色表被拉进引导。
export function initializeFirstUseGuide(_characterCount: number) {
    try {
        if (localStorage.getItem(GUIDE_KEY) === null) {
            setGuideStep('done');
        }
    } catch { /* Storage failure must never turn a successful DB read into an empty roster. */ }
}
function subscribe(notify: () => void) {
    window.addEventListener(event, notify);
    window.addEventListener('storage', notify);
    return () => {
        window.removeEventListener(event, notify);
        window.removeEventListener('storage', notify);
    };
}
/** 二改：永远不进入新手引导步骤。 */
export function useFirstUseGuideStep() {
    return useSyncExternalStore(subscribe, () => null, () => null);
}
export function hasGuideApi(config?: { baseUrl?: string; apiKey?: string; model?: string }) {
    return !!(config?.baseUrl?.trim() && config.apiKey?.trim() && config.model?.trim());
}
