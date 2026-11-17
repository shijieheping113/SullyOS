import React, { useContext } from 'react';
import { createPortal } from 'react-dom';
import { AppNavigationActive } from '../../hooks/useLocalBackHandler';

function ActivePortal({ children }: { children: React.ReactNode }) {
  return useContext(AppNavigationActive) ? <>{children}</> : null;
}

/** App 退出时，挂到 body 的菜单也要离场；窗口外的全局组件默认始终有效。 */
export function createAppPortal(children: React.ReactNode, container: Element | DocumentFragment, key?: string | null) {
  return createPortal(<ActivePortal>{children}</ActivePortal>, container, key);
}
