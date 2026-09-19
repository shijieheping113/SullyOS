/**
 * 给不在 React 树里的工具函数（鱼声 TTS 等）打一条屏幕提示。
 * OSContext 听这个事件，转成现有 addToast。
 */
export const APP_TOAST_EVENT = 'sully-app-toast';

export type AppToastType = 'info' | 'success' | 'error';

export type AppToastDetail = {
  message: string;
  type?: AppToastType;
};

export function emitAppToast(message: string, type: AppToastType = 'info'): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (!message) return;
  window.dispatchEvent(new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail: { message, type } }));
}
