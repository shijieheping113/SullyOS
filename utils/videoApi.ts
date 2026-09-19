import type { APIConfig, ApiPreset, VideoApiConfig, VideoApiDetail } from '../types';
import { extractContent, safeFetchJson } from './safeApi';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from './apiConfigNormalize';
import { buildVideoModelUserText } from './videoShareNote';
import { readVideoDurationSec } from './videoCoverFrame';
import {
  VIDEO_API_PRESETS,
  clampVideoFps,
  clampVideoMaxFrames,
  effectiveVideoFrames,
  shouldRetryVideoApi50507,
  videoApiConfigFor50507Fallback,
  videoApiPresetLabel,
} from './videoApiPresets';
import { recordVideoApiUsage, videoApiLastCallToastLine } from './videoApiUsage';
import {
  bumpVideoDescriptionMaxTokens,
  isVideoCompletionNearMaxTokens,
  isVideoDescriptionLikelyTruncated,
} from './videoDescribeQuality';

export {
  VIDEO_API_PRESETS,
  VIDEO_API_MAX_FPS,
  VIDEO_API_MAX_FRAMES,
  effectiveVideoFrames,
  estimateVideoCostHint,
  matchVideoPresetId,
  formatVideoDetailLabel,
  videoApiPresetLabel,
} from './videoApiPresets';

export {
  getVideoApiUsage,
  resetVideoApiUsage,
  videoApiUsageSummary,
  videoApiLastCallToastLine,
  estimateVideoCallYuan,
} from './videoApiUsage';

export const DEFAULT_VIDEO_API_BASE = 'https://api.siliconflow.cn/v1';
export const DEFAULT_VIDEO_API_MODEL = 'Qwen/Qwen3-VL-30B-A3B-Instruct';

export const VIDEO_DESCRIPTION_METADATA_KEY = 'videoDescription';

export interface VideoDescribeResult {
  description: string;
  durationSec: number;
  sampling: {
    detail: VideoApiDetail;
    fps: number;
    maxFrames: number;
    effectiveFrames: number;
  };
  requestedSampling: {
    detail: VideoApiDetail;
    fps: number;
    maxFrames: number;
  };
  samplingFallback: boolean;
  maxTokens: number;
  describeRetried: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  usageToastLine: string;
}

export { isVideoDescriptionLikelyTruncated } from './videoDescribeQuality';

/** 设置页「测试视频理解」用的内置短片（约 2 秒纯色，不写入聊天）。 */
export const VIDEO_API_TEST_VIDEO_URL = '/test-assets/video-understanding-probe.mp4';

export async function loadBuiltInVideoApiTestFile(): Promise<File> {
  const res = await fetch(VIDEO_API_TEST_VIDEO_URL);
  if (!res.ok) throw new Error('内置测试视频加载失败，请确认安装包完整');
  const blob = await res.blob();
  return new File([blob], 'video-understanding-probe.mp4', { type: blob.type || 'video/mp4' });
}

export const defaultVideoApiConfig = (): VideoApiConfig => ({
  enabled: false,
  baseUrl: DEFAULT_VIDEO_API_BASE,
  apiKey: '',
  model: DEFAULT_VIDEO_API_MODEL,
  detail: 'low',
  fps: 2,
  maxFrames: 16,
  maxDurationSec: 200,
  maxSizeMB: 30,
});

export function normalizeVideoApiConfig(raw?: Partial<VideoApiConfig> | null): VideoApiConfig {
  const base = defaultVideoApiConfig();
  if (!raw) return base;
  const detail = raw.detail === 'auto' || raw.detail === 'low' || raw.detail === 'high'
    ? raw.detail
    : base.detail;
  const fps = typeof raw.fps === 'number' && raw.fps > 0 ? clampVideoFps(raw.fps) : base.fps;
  const maxFrames = typeof raw.maxFrames === 'number' && raw.maxFrames > 0
    ? clampVideoMaxFrames(raw.maxFrames)
    : base.maxFrames;
  const maxDurationSec = typeof raw.maxDurationSec === 'number' && raw.maxDurationSec > 0
    ? raw.maxDurationSec
    : base.maxDurationSec;
  const maxSizeMB = typeof raw.maxSizeMB === 'number' && raw.maxSizeMB > 0
    ? raw.maxSizeMB
    : base.maxSizeMB;
  return {
    enabled: raw.enabled === true,
    baseUrl: normalizeApiBaseUrl(raw.baseUrl || base.baseUrl),
    apiKey: normalizeApiCredential(raw.apiKey),
    model: normalizeApiModel(raw.model || base.model),
    detail,
    fps,
    maxFrames,
    maxDurationSec,
    maxSizeMB,
  };
}

export function videoApiConfigFromPreset(preset: ApiPreset, enabled = true): VideoApiConfig {
  const next = defaultVideoApiConfig();
  return {
    ...next,
    enabled,
    baseUrl: normalizeApiBaseUrl(preset.config.baseUrl || next.baseUrl),
    apiKey: normalizeApiCredential(preset.config.apiKey),
    model: normalizeApiModel(preset.config.model || next.model),
  };
}

/** 运行时 Key：本栏 → 识图 → 语音硅基。 */
export function resolveVideoApiCredentials(apiConfig: APIConfig): {
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  const cfg = normalizeVideoApiConfig(apiConfig.videoApi);
  const baseUrl = cfg.baseUrl.trim() || DEFAULT_VIDEO_API_BASE;
  const model = cfg.model.trim() || DEFAULT_VIDEO_API_MODEL;
  const apiKey = cfg.apiKey.trim()
    || apiConfig.visionApi?.apiKey?.trim()
    || apiConfig.sttApi?.sfApiKey?.trim()
    || '';
  return { baseUrl, apiKey, model };
}

export function isVideoApiReady(apiConfig: APIConfig): boolean {
  const cfg = normalizeVideoApiConfig(apiConfig.videoApi);
  if (!cfg.enabled) return false;
  const { baseUrl, apiKey, model } = resolveVideoApiCredentials(apiConfig);
  return !!baseUrl && !!apiKey && !!model;
}

export function pickVideoDescriptionMaxTokens(durationSec: number, effectiveFrames = 0): number {
  const frames = Number.isFinite(effectiveFrames) && effectiveFrames > 0 ? effectiveFrames : 0;
  if (frames >= 61 || (Number.isFinite(durationSec) && durationSec > 60)) return 10_000;
  if (frames >= 33) return 8000;
  if (frames >= 17) return 6000;
  return 4000;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('视频读取失败'));
    };
    reader.onerror = () => reject(new Error('视频读取失败'));
    reader.readAsDataURL(file);
  });
}

export async function assertVideoFileWithinLimits(file: File, config: VideoApiConfig): Promise<number> {
  const maxBytes = config.maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`这段视频太大了（最大 ${config.maxSizeMB} MB）`);
  }
  const duration = await readVideoDurationSec(file);
  if (duration > config.maxDurationSec) {
    throw new Error(`这段视频太长了（最长 ${config.maxDurationSec} 秒）`);
  }
  return duration;
}

export const cleanVideoApiDescription = (value: string): string => {
  let s = value.trim();
  s = s.replace(/^(?:好的[，,、\s]*)+/i, '');
  s = s.replace(/^(?:我们来[，,、\s]*)+/i, '');
  s = s.replace(/^(?:以下是[：:\s]*)+/i, '');
  s = s.replace(/^我们来[^：:]{0,12}[：:\s]*/i, '');
  return s.trim().slice(0, 8000);
};

export function isVideoApi50507Error(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /50507/.test(msg);
}

type SamplingParams = Pick<VideoApiConfig, 'detail' | 'fps' | 'maxFrames'>;

function parseUsage(data: unknown): VideoDescribeResult['usage'] | undefined {
  const u = (data as any)?.usage;
  if (!u || typeof u !== 'object') return undefined;
  const prompt = Number(u.prompt_tokens ?? u.promptTokens ?? 0);
  const completion = Number(u.completion_tokens ?? u.completionTokens ?? 0);
  const total = Number(u.total_tokens ?? u.totalTokens ?? prompt + completion);
  if (!prompt && !completion && !total) return undefined;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

async function requestVideoDescription(
  dataUrl: string,
  titleForModel: string,
  sampling: SamplingParams,
  baseUrl: string,
  apiKey: string,
  model: string,
  durationSec: number,
  maxTokensOverride?: number,
): Promise<{ description: string; usage?: VideoDescribeResult['usage']; maxTokens: number }> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const effectiveFrames = effectiveVideoFrames(durationSec, sampling.fps, sampling.maxFrames);
  const maxTokens = maxTokensOverride ?? pickVideoDescriptionMaxTokens(durationSec, effectiveFrames);
  const data = await safeFetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: {
              url: dataUrl,
              detail: sampling.detail,
              fps: sampling.fps,
              max_frames: sampling.maxFrames,
            },
          },
          { type: 'text', text: buildVideoModelUserText(titleForModel) },
        ],
      }],
      temperature: 0,
      max_tokens: maxTokens,
      stream: false,
    }),
  }, 0, 180_000, { appName: '消息', purpose: '视频理解' });

  const description = cleanVideoApiDescription(extractContent(data));
  if (!description) throw new Error('视频理解没有返回内容，换一段短视频或稍后再试');
  return { description, usage: parseUsage(data), maxTokens };
}

function shouldRetryVideoDescription(
  result: { description: string; usage?: VideoDescribeResult['usage']; maxTokens: number },
  durationSec: number,
): boolean {
  const completion = result.usage?.completionTokens ?? 0;
  if (isVideoCompletionNearMaxTokens(completion, result.maxTokens)) return true;
  return isVideoDescriptionLikelyTruncated(result.description, durationSec);
}

/** 硅基 video_url 真视频理解；调用方负责立刻释放 data URL。 */
export async function describeVideoWithVideoApi(
  file: File,
  titleForModel: string,
  apiConfig: APIConfig,
): Promise<VideoDescribeResult> {
  if (!isVideoApiReady(apiConfig)) {
    throw new Error('视频理解还没配好，请先在设置里打开并填写模型');
  }
  const cfg = normalizeVideoApiConfig(apiConfig.videoApi);
  const durationSec = await assertVideoFileWithinLimits(file, cfg);
  const { baseUrl, apiKey, model } = resolveVideoApiCredentials(apiConfig);
  const dataUrl = await readFileAsDataUrl(file);
  const requestedSampling: SamplingParams = {
    detail: cfg.detail,
    fps: cfg.fps,
    maxFrames: cfg.maxFrames,
  };
  let sampling: SamplingParams = { ...requestedSampling };
  let samplingFallback = false;
  try {
    let result: { description: string; usage?: VideoDescribeResult['usage']; maxTokens: number };
    try {
      result = await requestVideoDescription(
        dataUrl, titleForModel, sampling, baseUrl, apiKey, model, durationSec,
      );
    } catch (err) {
      if (!isVideoApi50507Error(err) || !shouldRetryVideoApi50507(sampling)) throw err;
      sampling = videoApiConfigFor50507Fallback(sampling);
      samplingFallback = true;
      result = await requestVideoDescription(
        dataUrl, titleForModel, sampling, baseUrl, apiKey, model, durationSec,
      );
    }

    let describeRetried = false;
    if (shouldRetryVideoDescription(result, durationSec)) {
      const bumped = bumpVideoDescriptionMaxTokens(result.maxTokens);
      if (bumped > result.maxTokens) {
        describeRetried = true;
        result = await requestVideoDescription(
          dataUrl, titleForModel, sampling, baseUrl, apiKey, model, durationSec, bumped,
        );
      }
    }

    const effective = effectiveVideoFrames(durationSec, sampling.fps, sampling.maxFrames);
    const { summary } = recordVideoApiUsage({
      durationSec,
      fps: sampling.fps,
      maxFrames: sampling.maxFrames,
      detail: sampling.detail,
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
    });

    return {
      description: result.description,
      durationSec,
      sampling: {
        detail: sampling.detail,
        fps: sampling.fps,
        maxFrames: sampling.maxFrames,
        effectiveFrames: effective,
      },
      requestedSampling: {
        detail: requestedSampling.detail,
        fps: requestedSampling.fps,
        maxFrames: requestedSampling.maxFrames,
      },
      samplingFallback,
      maxTokens: result.maxTokens,
      describeRetried,
      usage: result.usage,
      usageToastLine: videoApiLastCallToastLine() || summary,
    };
  } finally {
    // dataUrl 仅在本函数栈内，离开即 GC；不写入任何持久层。
  }
}
