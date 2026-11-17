import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { OSPreviewProvider, useOS } from '../../context/OSContext';
import { AppNavigationActive } from '../../hooks/useLocalBackHandler';

/** 退出页保持最后的角色/数据快照；只同步前台 ID，让聊天等前台任务及时停下。 */
const AppRouteScope: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
  const live = useOS();
  const snapshot = useRef(live);
  const activeRef = useRef(active);
  activeRef.current = active;
  if (active) snapshot.current = live;
  const registrations = useRef(new Set<() => void>());
  const registerBackHandler = useCallback((handler: () => boolean) => {
    if (!activeRef.current) return () => {};
    const unregister = live.registerBackHandler(() => activeRef.current && handler());
    registrations.current.add(unregister);
    return () => { unregister(); registrations.current.delete(unregister); };
  }, [live.registerBackHandler, active]);
  useLayoutEffect(() => {
    if (!active) {
      registrations.current.forEach(unregister => unregister());
      registrations.current.clear();
    }
    return () => {
      registrations.current.forEach(unregister => unregister());
      registrations.current.clear();
    };
  }, [active]);
  const value = useMemo(() => ({ ...snapshot.current, activeApp: live.activeApp, registerBackHandler }),
    [active ? live : snapshot.current, live.activeApp, registerBackHandler]);
  return <AppNavigationActive.Provider value={active}><OSPreviewProvider value={value}>{children}</OSPreviewProvider></AppNavigationActive.Provider>;
};

export default AppRouteScope;
