import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { registerLocalBackHandler } from '../utils/localBackHandlers';

// 窗口退出期间仍会短暂保留页面；只有当前窗口可以消费全局返回。
export const AppNavigationActive = createContext(true);

/** Keep registration stable as a panel's state changes; remove it when the panel closes. */
export function useLocalBackHandler(handler: () => boolean, layer: number, enabled = true) {
  const latest = useRef(handler);
  const active = useContext(AppNavigationActive);
  useLayoutEffect(() => { latest.current = handler; });
  useLayoutEffect(() => {
    if (enabled && active) return registerLocalBackHandler(() => latest.current(), layer);
  }, [layer, enabled, active]);
}
