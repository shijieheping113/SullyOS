import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchViaProxy,
  isLocalProxyMissing,
  isMissingLocalProxy,
  resetProxyFallbackState,
  voiceSocketUrls,
} from './proxyFallback';
import { setProxyWorkerUrl } from './proxyWorker';

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

// 托管平台的 SPA 兜底页：状态 200、类型 HTML —— 正是「同源代理不存在」的样子。
const htmlRes = () => new Response('<!doctype html><html><body>app</body></html>', {
  status: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});

const route = () => ({
  local: { url: '/api/fishaudio/tts', init: { method: 'POST' } as RequestInit },
  worker: { url: 'https://proxy.example.com/fishaudio/tts', init: { method: 'POST' } as RequestInit },
});

describe('isMissingLocalProxy', () => {
  it('把 404 / 405 / HTML 兜底页都算成「同源代理不存在」', () => {
    expect(isMissingLocalProxy(jsonRes({ error: 'x' }, 404))).toBe(true);
    expect(isMissingLocalProxy(jsonRes({ error: 'x' }, 405))).toBe(true);
    expect(isMissingLocalProxy(htmlRes())).toBe(true);
    expect(isMissingLocalProxy(jsonRes({ ok: true }))).toBe(false);
  });
});

describe('fetchViaProxy', () => {
  beforeEach(() => {
    resetProxyFallbackState();
    setProxyWorkerUrl('');
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setProxyWorkerUrl('');
  });

  it('本地代理正常时直接用本地响应，不碰 Worker', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ from: 'local' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchViaProxy(route());

    expect(await res.json()).toEqual({ from: 'local' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isLocalProxyMissing()).toBe(false);
  });

  it('本地回兜底页 → 自动改走 Worker，并记住「同源代理不存在」', async () => {
    const fetchMock = vi.fn(async (url: string) => (
      String(url).indexOf('https://') === 0 ? jsonRes({ from: 'worker' }) : htmlRes()
    ));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchViaProxy(route());

    expect(await res.json()).toEqual({ from: 'worker' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isLocalProxyMissing()).toBe(true);
  });

  it('记下之后，后面的请求直接走 Worker（语音识别每段都发一次，不能白跑）', async () => {
    const fetchMock = vi.fn(async (url: string) => (
      String(url).indexOf('https://') === 0 ? jsonRes({ from: 'worker' }) : htmlRes()
    ));
    vi.stubGlobal('fetch', fetchMock);

    await fetchViaProxy(route());
    fetchMock.mockClear();
    const res = await fetchViaProxy(route());

    expect(await res.json()).toEqual({ from: 'worker' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('两边都连不上时，把 Worker 那次的错误抛出去（本地那次不算数）', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      throw new Error(String(url).indexOf('https://') === 0 ? 'worker offline' : 'local offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchViaProxy(route())).rejects.toThrow('worker offline');
  });
});

describe('voiceSocketUrls', () => {
  beforeEach(() => {
    resetProxyFallbackState();
    setProxyWorkerUrl('https://proxy.example.com');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setProxyWorkerUrl('');
  });

  it('先本机同源、再自建 Worker（https → wss）', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:', host: 'app.example.com' } });

    expect(voiceSocketUrls('/api/volc-ws?k=1', '/volc-ws?k=1')).toEqual([
      'wss://app.example.com/api/volc-ws?k=1',
      'wss://proxy.example.com/volc-ws?k=1',
    ]);
  });

  it('本机同源永远是第一个候选（本地开发照旧）', () => {
    setProxyWorkerUrl('');
    vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:5173' } });

    expect(voiceSocketUrls('/api/volc-ws?k=1', '/volc-ws?k=1').length).toBeGreaterThan(0);
    expect(voiceSocketUrls('/api/volc-ws?k=1', '/volc-ws?k=1')[0]).toBe('ws://localhost:5173/api/volc-ws?k=1');
  });
});