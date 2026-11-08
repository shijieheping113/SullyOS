// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useDeploymentNotice } from '../hooks/useDeploymentNotice';
import { DEPLOYMENT_NOTICE_KEY } from './deploymentNotice';

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

function Startup() {
  const notice = useDeploymentNotice();
  if (notice.blocked) return React.createElement('p', {}, '被版本来源提醒拦住了');
  return React.createElement('p', {}, '后续启动流程');
}

it('二改不拦截启动、也不展示版本来源提醒', async () => {
  await act(async () => root.render(React.createElement(StrictMode, {}, React.createElement(Startup))));
  expect(host.textContent).toBe('后续启动流程');
  expect(host.querySelector('dialog')).toBeNull();
  expect(localStorage.getItem(DEPLOYMENT_NOTICE_KEY)).toBeNull();
});
