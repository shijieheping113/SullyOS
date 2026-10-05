import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROXY_WORKER,
  getProxyWorkerUrl,
  getCoreProxyUrl,
  getXhsLiteUrl,
  setProxyWorkerUrl,
  isCustomProxyWorker,
  rewriteStaleWorkerUrl,
  rewriteSelfHostedXhsLiteUrl,
  migrateXhsServerUrl,
  requestProxyWorkerSettingsFocus,
  consumeProxyWorkerSettingsFocus,
} from './proxyWorker';

const LS_KEY = 'sully_proxy_worker_url_v1';

describe('proxyWorker 中心配置', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('没设过时返回默认地址', () => {
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
    expect(isCustomProxyWorker()).toBe(false);
  });

  it('设了自定义地址后读得到，且标记为自定义', () => {
    setProxyWorkerUrl('https://my-worker.example.com');
    expect(getProxyWorkerUrl()).toBe('https://my-worker.example.com');
    expect(isCustomProxyWorker()).toBe(true);
  });

  it('去掉首尾空格和结尾斜杠', () => {
    setProxyWorkerUrl('  https://my-worker.example.com///  ');
    expect(getProxyWorkerUrl()).toBe('https://my-worker.example.com');
  });

  it('填的就是默认地址 → 清空存储，回落默认', () => {
    setProxyWorkerUrl('https://my-worker.example.com');
    expect(isCustomProxyWorker()).toBe(true);
    setProxyWorkerUrl(DEFAULT_PROXY_WORKER);
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('传空字符串 → 清空存储，回落默认', () => {
    setProxyWorkerUrl('https://my-worker.example.com');
    setProxyWorkerUrl('');
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('非法地址（不带 http/https）→ 不写入', () => {
    setProxyWorkerUrl('my-worker.example.com'); // 缺协议
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('存量里如果是脏数据（非 http）→ 读取时回落默认', () => {
    localStorage.setItem(LS_KEY, 'javascript:alert(1)');
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('旧的 *.workers.dev 默认域名 → 读取时迁移回默认', () => {
    localStorage.setItem(LS_KEY, 'https://sully-n.qegj567.workers.dev');
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });

  it('http（非 https）的自定义地址也接受', () => {
    setProxyWorkerUrl('http://localhost:8787');
    expect(getProxyWorkerUrl()).toBe('http://localhost:8787');
  });

  it('已过期的 sullymeow.ccwu213.cc → 读取时迁移回默认', () => {
    localStorage.setItem(LS_KEY, 'https://sullymeow.ccwu213.cc');
    expect(getProxyWorkerUrl()).toBe(DEFAULT_PROXY_WORKER);
  });
});

describe('网络代理设置定位', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('公告发出的定位请求只消费一次', () => {
    expect(consumeProxyWorkerSettingsFocus()).toBe(false);
    requestProxyWorkerSettingsFocus();
    expect(consumeProxyWorkerSettingsFocus()).toBe(true);
    expect(consumeProxyWorkerSettingsFocus()).toBe(false);
  });
});

// 已死的历史公共实例域名必须被迁到当前 worker，否则独立持久化的存量配置
// （音乐播放器 / 小红书 serverUrl）会一直打 DNS 解析失败的地址
describe('rewriteStaleWorkerUrl', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('迁移已过期的 sullymeow.ccwu213.cc，保留路径', () => {
    expect(rewriteStaleWorkerUrl('https://sullymeow.ccwu213.cc')).toBe(DEFAULT_PROXY_WORKER);
    expect(rewriteStaleWorkerUrl('https://sullymeow.ccwu213.cc/api')).toBe(`${DEFAULT_PROXY_WORKER}/api`);
  });

  it('迁移最早的 workers.dev 默认域名', () => {
    expect(rewriteStaleWorkerUrl('https://sully-n.qegj567.workers.dev/api')).toBe(`${DEFAULT_PROXY_WORKER}/api`);
  });

  it('填了语音门铃时，死域名仍迁到作者小屋，不跟去自建', () => {
    setProxyWorkerUrl('https://my-own.example.com');
    expect(rewriteStaleWorkerUrl('https://sullymeow.ccwu213.cc/api')).toBe(`${DEFAULT_PROXY_WORKER}/api`);
  });

  it('活地址 / 用户自部署地址 / 空值原样保留', () => {
    expect(rewriteStaleWorkerUrl(DEFAULT_PROXY_WORKER)).toBe(DEFAULT_PROXY_WORKER);
    expect(rewriteStaleWorkerUrl('https://my-own.example.com/api')).toBe('https://my-own.example.com/api');
    expect(rewriteStaleWorkerUrl('')).toBe('');
  });
});

describe('rewriteSelfHostedXhsLiteUrl', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('没填自建门铃时原样返回', () => {
    expect(rewriteSelfHostedXhsLiteUrl('https://api.pigsullycat.ccwu.cc/api')).toBe('https://api.pigsullycat.ccwu.cc/api');
  });

  it('只把当前自建门铃加 /api 改回作者', () => {
    setProxyWorkerUrl('https://api.pigsullycat.ccwu.cc');
    expect(rewriteSelfHostedXhsLiteUrl('https://api.pigsullycat.ccwu.cc/api')).toBe(getXhsLiteUrl());
    expect(rewriteSelfHostedXhsLiteUrl('https://api.pigsullycat.ccwu.cc/api/')).toBe(getXhsLiteUrl());
  });

  it('localhost、手填的其他地址、没有 /api 的自建根地址都不动', () => {
    setProxyWorkerUrl('https://api.pigsullycat.ccwu.cc');
    expect(rewriteSelfHostedXhsLiteUrl('http://localhost:18060/mcp')).toBe('http://localhost:18060/mcp');
    expect(rewriteSelfHostedXhsLiteUrl('http://localhost:18061/api')).toBe('http://localhost:18061/api');
    expect(rewriteSelfHostedXhsLiteUrl('http://192.168.0.8:18061/api')).toBe('http://192.168.0.8:18061/api');
    expect(rewriteSelfHostedXhsLiteUrl('https://other-lite.example.com/api')).toBe('https://other-lite.example.com/api');
    expect(rewriteSelfHostedXhsLiteUrl('https://api.pigsullycat.ccwu.cc')).toBe('https://api.pigsullycat.ccwu.cc');
    expect(rewriteSelfHostedXhsLiteUrl(getXhsLiteUrl())).toBe(getXhsLiteUrl());
  });
});

describe('migrateXhsServerUrl / getCoreProxyUrl', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('作者小屋固定，不跟语音门铃走', () => {
    setProxyWorkerUrl('https://api.pigsullycat.ccwu.cc');
    expect(getCoreProxyUrl()).toBe(DEFAULT_PROXY_WORKER);
    expect(getXhsLiteUrl()).toBe(`${DEFAULT_PROXY_WORKER}/api`);
    expect(getProxyWorkerUrl()).toBe('https://api.pigsullycat.ccwu.cc');
  });

  it('死域名迁到作者后再改自建+/api', () => {
    setProxyWorkerUrl('https://api.pigsullycat.ccwu.cc');
    expect(migrateXhsServerUrl('https://sullymeow.ccwu213.cc/api')).toBe(getXhsLiteUrl());
    expect(migrateXhsServerUrl('https://api.pigsullycat.ccwu.cc/api')).toBe(getXhsLiteUrl());
    expect(migrateXhsServerUrl('http://localhost:18060/mcp')).toBe('http://localhost:18060/mcp');
  });
});
