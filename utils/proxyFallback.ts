/**
 * 静态部署下的「同源 /api 代理」兜底（二改：语音链路）。
 *
 * 背景：语音识别（硅基流动 Omni / TeleASR、火山豆包）、鱼声 / ElevenLabs 朗读、
 * 音色烘焙这几条路，本地开发时靠 vite 的 dev proxy 转发（`/api/xxx`）。部署成静态
 * 站点后那层代理不存在，同源请求会落到托管平台的兜底页（HTML 200）或 404，于是这些
 * 功能静默失效。
 *
 * 做法：本地优先，不是业务响应就改走用户自己填的代理 Worker（设置 → 网络代理 (Worker)）。
 * 一旦确认这个部署没有同源代理，后续请求直接走 Worker —— 语音识别是每段都发一次的
 * 热路径，不能让每段都白跑一趟。
 */
import { getProxyWorkerUrl } from './proxyWorker';

export type ProxyAttempt = { url: string; init: RequestInit };
export type ProxyRoute = { local: ProxyAttempt; worker: ProxyAttempt };

/** 这个响应说明「同源代理不存在」，不是真实业务响应：404 / 405，或回的是 HTML 兜底页。 */
export const isMissingLocalProxy = (res: Response): boolean => {
  if (res.status === 404 || res.status === 405) return true;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  return contentType.indexOf('text/html') >= 0;
};

// 记住「这个部署没有同源 /api 代理」。探测过一次就不再问第二遍。
let localProxyMissing = false;

/** 排障与测试用：忘掉探测结果，回到「先试本地」。 */
export const resetProxyFallbackState = (): void => { localProxyMissing = false; };

/** 当前是否已经确认「没有同源代理」。 */
export const isLocalProxyMissing = (): boolean => localProxyMissing;

/**
 * 按「本地 → 自建 Worker」的顺序请求，返回第一个正常响应。
 * 两次都不正常时抛最后一次的网络错误；本地那次的失败响应不会当成结果交出去。
 */
export async function fetchViaProxy(route: ProxyRoute): Promise<Response> {
  const attempts: ProxyAttempt[] = [];
  // 成品网站没有 vite 那层同源转发。先打自己会得到 405，日志里就像识别接口坏了。
  const publicSite = typeof window !== 'undefined' && !isDevVoiceHost(window.location.host);
  if (!localProxyMissing && !publicSite) attempts.push(route.local);
  attempts.push(route.worker);

  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, attempt.init);
      if (!isMissingLocalProxy(res)) return res;
      if (attempt === route.local) localProxyMissing = true;
      lastResponse = res;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  if (lastResponse) return lastResponse;
  throw new Error('请求失败：没有可用的代理地址');
}

/** 自建 Worker 上某个中转路径的完整地址。 */
export const workerProxyUrl = (workerPath: string): string => `${getProxyWorkerUrl()}${workerPath}`;

/** 自建 Worker 的 WebSocket 基地址（http(s) → ws(s)）。没配就返回空串。 */
export const proxyWorkerWsBase = (): string => {
  const base = getProxyWorkerUrl();
  return base ? base.replace(/^http/i, 'ws') : '';
};

/** 本机开发（localhost / 局域网预览）才有 vite 的同源转发。成品域名上先敲自己会白等。 */
const isDevVoiceHost = (host: string): boolean => {
  let name = host.trim().toLowerCase();
  if (name.startsWith('[')) {
    const end = name.indexOf(']');
    name = end >= 0 ? name.slice(1, end) : name;
  } else {
    const colon = name.lastIndexOf(':');
    if (colon > -1 && /^\d+$/.test(name.slice(colon + 1))) name = name.slice(0, colon);
  }
  if (name === 'localhost' || name === '127.0.0.1' || name === '::1') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(name)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(name)) return true;
  const priv = /^172\.(\d+)\.\d+\.\d+$/.exec(name);
  if (priv) {
    const n = Number(priv[1]);
    return n >= 16 && n <= 31;
  }
  return false;
};

/**
 * WebSocket 候选地址。
 * 本机开发：先同源转发，再自建 Worker。
 * 成品网站：直接自建 Worker。同源 /api 在静态站点上不存在，先敲它每次都要白等。
 */
export const voiceSocketUrls = (localPath: string, workerPath: string): string[] => {
  const urls: string[] = [];
  const wsBase = proxyWorkerWsBase();
  const devHost = typeof window !== 'undefined' && isDevVoiceHost(window.location.host);
  if (!localProxyMissing && devHost) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    urls.push(`${proto}//${window.location.host}${localPath}`);
  }
  if (wsBase) urls.push(`${wsBase}${workerPath}`);
  if (!urls.length && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    urls.push(`${proto}//${window.location.host}${localPath}`);
  }
  return urls;
};