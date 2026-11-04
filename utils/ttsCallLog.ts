/**
 * 语音（TTS）调用记录 —— 与 LLM 的 api_call_log 分账。
 *
 * 记「声音厂」合成：服务商 / 字数 / 成败 / 耗时。不记音频原文与 Key。
 * 挂点以 ttsRouter.synthesizeSpeechDetailed 为主；绕过 router 的路径自行调 recordTtsCall。
 * best-effort：任何异常吞掉，不影响播音。
 */

import type { ApiCallMeta } from './apiCallLog';
import { getApiCallAmbientContext } from './apiCallLog';

export type TtsProviderId = 'minimax' | 'fishaudio' | 'elevenlabs' | string;

/** 落库的一条语音调用。 */
export interface TtsCallLogEntry extends ApiCallMeta {
  id: string;
  /** 调用结束（或失败）时间戳 ms */
  timestamp: number;
  provider: TtsProviderId;
  /** 模型 / 音色侧标识（能拿多少记多少） */
  model?: string;
  /** 送去合成的正文字符数（计费主指标） */
  textChars: number;
  /** 请求耗时 ms */
  durationMs?: number;
  /** 是否成功拿到可播音频 */
  ok: boolean;
  /** HTTP 状态（有则记） */
  status?: number;
  /**
   * 本机缓存命中。列表可显示，汇总「计费次数 / 计费字符」时排除。
   */
  cached?: boolean;
}

const META_KEYS = ['appId', 'appName', 'charId', 'charName', 'purpose'] as const;

/**
 * 多层 meta 合并：后层非空字段覆盖前层。
 * ambient（当前 App / 角色）→ 调用点显式 meta → purpose 快捷参数。
 * 避免「只传了角色」把 App / 用途整层盖没。
 */
export function mergeTtsCallMeta(
  ...layers: Array<ApiCallMeta | undefined | null>
): ApiCallMeta {
  const out: ApiCallMeta = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of META_KEYS) {
      const value = layer[key];
      if (value != null && value !== '') out[key] = value;
    }
  }
  return out;
}

/**
 * 记录一次 TTS 调用。fire-and-forget，绝不 throw / 阻塞主链路。
 */
export function recordTtsCall(input: {
  provider: TtsProviderId;
  model?: string;
  textChars: number;
  ok: boolean;
  status?: number;
  durationMs?: number;
  cached?: boolean;
  /** 可直接传；也会并入 meta.purpose */
  purpose?: string;
  meta?: ApiCallMeta;
}): void {
  try {
    const meta = mergeTtsCallMeta(
      getApiCallAmbientContext(),
      input.meta,
      input.purpose ? { purpose: input.purpose } : undefined,
    );
    const chars = Number.isFinite(input.textChars) ? Math.max(0, Math.floor(input.textChars)) : 0;
    const entry: TtsCallLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      provider: input.provider || 'unknown',
      model: input.model || undefined,
      textChars: chars,
      durationMs: input.durationMs,
      ok: !!input.ok,
      status: input.status,
      cached: input.cached || undefined,
      appId: meta.appId,
      appName: meta.appName,
      charId: meta.charId,
      charName: meta.charName,
      purpose: meta.purpose,
    };
    import('./db')
      .then(({ DB }) => DB.appendTtsCallLog(entry))
      .catch(() => {});
  } catch {
    // best-effort
  }
}

/** 汇总：计费次数排除缓存；字符只加计费成功/失败里的非缓存条目。 */
export function summarizeTtsCallLog(entries: TtsCallLogEntry[]): {
  billableCount: number;
  billableChars: number;
  cachedCount: number;
  byProvider: Record<string, { count: number; chars: number }>;
} {
  const byProvider: Record<string, { count: number; chars: number }> = {};
  let billableCount = 0;
  let billableChars = 0;
  let cachedCount = 0;
  for (const e of entries) {
    if (e.cached) {
      cachedCount += 1;
      continue;
    }
    billableCount += 1;
    billableChars += e.textChars || 0;
    const key = e.provider || 'unknown';
    const slot = byProvider[key] || (byProvider[key] = { count: 0, chars: 0 });
    slot.count += 1;
    slot.chars += e.textChars || 0;
  }
  return { billableCount, billableChars, cachedCount, byProvider };
}
