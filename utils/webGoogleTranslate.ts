/**
 * 心象翻译用的网页谷歌封装（client=gtx，无需 Cloud 计费密钥）。
 * gtx 响应带 Access-Control-Allow-Origin: *，浏览器直连即可，不必经主代理。
 * （主代理 `/` 是 Brave 搜索，要参数 q；MCP 的 ?target= 是另一套 Worker，不能混用。）
 */

const GTX_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const DEFAULT_TIMEOUT_MS = 20_000;

export const buildGtxTranslateUrl = (text: string, targetLang = 'zh-CN'): string => {
  const url = new URL(GTX_ENDPOINT);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  return url.toString();
};

/** 解析 gtx JSON：`[[["译文","原文",...],...],...]` */
export const parseGtxTranslateResponse = (data: unknown): string => {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('翻译结果格式不对');
  }
  const parts: string[] = [];
  for (const chunk of data[0]) {
    if (Array.isArray(chunk) && typeof chunk[0] === 'string' && chunk[0]) {
      parts.push(chunk[0]);
    }
  }
  const out = parts.join('').trim();
  if (!out) throw new Error('没有译文');
  return out;
};

const friendlyTranslateError = (err: unknown): Error => {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (/abort|timeout|超时/i.test(msg)) return new Error('翻译超时，请再试一次');
  if (/429|rate|限流|Too Many/i.test(msg)) return new Error('翻译太频繁，稍后再试');
  if (/Failed to fetch|NetworkError|网络|load failed/i.test(msg)) {
    return new Error('翻译失败：网络不通（谷歌本地需要能访问 Google）');
  }
  if (msg) return new Error(msg.startsWith('翻译') ? msg : `翻译失败：${msg}`);
  return new Error('翻译失败，请再试一次');
};

const fetchOnce = async (
  url: string,
  signal: AbortSignal | undefined,
): Promise<string> => {
  const res = await fetch(url, { method: 'GET', signal });
  const contentType = (res.headers.get('content-type') || '').slice(0, 80);
  const bodyText = await res.text().catch(() => '');
  const bodyHead = bodyText.slice(0, 220);
  if (res.status === 429) throw new Error('翻译太频繁，稍后再试');
  if (!res.ok) {
    throw new Error(`翻译失败：HTTP ${res.status}${bodyHead ? ` · ${bodyHead}` : ''}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`翻译结果不是 JSON · ${bodyHead || contentType || 'empty'}`);
  }
  return parseGtxTranslateResponse(data);
};

export type WebGoogleTranslateOptions = {
  targetLang?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * 把文本译成目标语言（默认简中）。失败会自动再试一次；两次都失败则抛可读错误。
 */
export async function webGoogleTranslate(
  text: string,
  options: WebGoogleTranslateOptions = {},
): Promise<string> {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('没有可翻译的文字');

  const url = buildGtxTranslateUrl(trimmed, options.targetLang || 'zh-CN');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        throw friendlyTranslateError(new Error('abort'));
      }
      options.signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchOnce(url, controller.signal);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
  throw friendlyTranslateError(lastError);
}
