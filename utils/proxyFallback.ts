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
  if (!localProxyMissing) attempts.push(route.local);
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

/**
 * WebSocket 候选地址：先试本机开发服务器上的同源转发，再试自建 Worker。
 * 电话/聊天语音识别连接失败时会按顺序换下一个候选。
 */
export const voiceSocketUrls = (localPath: string, workerPath: string): string[] => {
  const urls: string[] = [];
  const wsBase = proxyWorkerWsBase();
  if (!localProxyMissing && typeof window !== 'undefined') {
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