// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import AppRouteScope from '../components/os/AppRouteScope';
import { OSPreviewProvider, useOS } from '../context/OSContext';
import { useLocalBackHandler } from '../hooks/useLocalBackHandler';
import { handleLocalBack } from './localBackHandlers';
import { AppID } from '../types';
import { createAppPortal } from '../components/os/appPortal';

vi.mock('../context/OSContext', async () => {
  const React = await import('react');
  const context = React.createContext<any>(null);
  return { OSPreviewProvider: context.Provider, useOS: () => React.useContext(context) };
});

describe('outgoing app ownership', () => {
  it('removes outgoing body portals immediately while preserving a global portal', () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    const root = createRoot(container);
    function Portals({ active }: { active: boolean }) {
      return React.createElement(React.Fragment, null,
        React.createElement(OSPreviewProvider, { value: { activeApp: AppID.Chat } as any },
          React.createElement(AppRouteScope, { active, children: createAppPortal(React.createElement('button', { id: 'app-portal' }, 'app'), document.body) })),
        createAppPortal(React.createElement('button', { id: 'global-portal' }, 'global'), document.body));
    }
    try {
      act(() => root.render(React.createElement(Portals, { active: true })));
      expect(document.querySelector('#app-portal')).not.toBeNull();
      act(() => root.render(React.createElement(Portals, { active: false })));
      expect(document.querySelector('#app-portal')).toBeNull();
      expect(document.querySelector('#global-portal')).not.toBeNull();
      act(() => root.render(React.createElement(Portals, { active: true })));
      expect(document.querySelector('#app-portal')).not.toBeNull();
    } finally { act(() => root.unmount()); }
  });
  it('freezes outgoing character data, releases local and app back handlers, and reclaims them on reversal', () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    const root = createRoot(container);
    let appBack: (() => boolean) | undefined;
    const registerBackHandler = (handler: () => boolean) => {
      appBack = handler;
      return () => { if (appBack === handler) appBack = undefined; };
    };
    const hits: string[] = [];
    const staleRegistrations: Array<(handler: () => boolean) => () => void> = [];
    function Page({ id }: { id: string }) {
      const os = useOS();
      useLocalBackHandler(() => { hits.push(`local-${id}`); return true; }, 30, id === 'old');
      useEffect(() => {
        staleRegistrations.push(os.registerBackHandler);
        return os.registerBackHandler(() => { hits.push(`app-${id}`); return true; });
      }, [os.registerBackHandler]);
      return React.createElement('div', { 'data-page': id, 'data-char': os.activeCharacterId, 'data-app': os.activeApp });
    }
    const render = (id: AppID, char: string, includeNew: boolean) => act(() => root.render(
      React.createElement(OSPreviewProvider, { value: { activeApp: id, activeCharacterId: char, registerBackHandler } as any },
        React.createElement(AppRouteScope, { active: id === AppID.Character, children: React.createElement(Page, { id: 'old' }) }),
        includeNew && React.createElement(AppRouteScope, { active: id === AppID.Chat, children: React.createElement(Page, { id: 'new' }) }),
      ),
    ));
    try {
      render(AppID.Character, 'alice', false);
      expect(handleLocalBack()).toBe(true);
      const stale = staleRegistrations[0];
      render(AppID.Chat, 'bob', true);
      expect(container.querySelector('[data-page="old"]')?.getAttribute('data-char')).toBe('alice');
      expect(container.querySelector('[data-page="old"]')?.getAttribute('data-app')).toBe(AppID.Chat);
      expect(container.querySelector('[data-page="new"]')?.getAttribute('data-char')).toBe('bob');
      expect(handleLocalBack()).toBe(false);
      stale(() => { throw new Error('outgoing route stole back'); });
      expect(appBack?.()).toBe(true);
      expect(hits).toEqual(['local-old', 'app-new']);
      render(AppID.Character, 'alice', true);
      expect(handleLocalBack()).toBe(true);
      expect(appBack?.()).toBe(true);
      expect(hits.slice(-2)).toEqual(['local-old', 'app-old']);
    } finally {
      act(() => root.unmount());
      expect(handleLocalBack()).toBe(false);
    }
  });
});
