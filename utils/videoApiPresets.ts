import type { VideoApiConfig, VideoApiDetail } from '../types';

export const VIDEO_API_MAX_FPS = 5;
export const VIDEO_API_MAX_FRAMES = 256;

export type VideoApiPresetId =
  | 'short_cheap'
  | 'recommended'
  | 'half_minute'
  | 'minute_full'
  | 'minute_dense'
  | 'action';

export interface VideoApiSamplingPreset {
  id: VideoApiPresetId;
  label: string;
  detail: VideoApiDetail;
  fps: number;
  maxFrames: number;
  suitable: string;
  costHint: string;
  fallbackPresetId?: VideoApiPresetId;
}

export const VIDEO_API_PRESETS: readonly VideoApiSamplingPreset[] = [
  {
    id: 'short_cheap',
    label: '省钱短片',
    detail: 'low',
    fps: 1,
    maxFrames: 8,
    suitable: '≤15～20 秒随手发',
    costHint: '几分钱不到',
  },
  {
    id: 'recommended',
    label: '推荐（默认）',
    detail: 'low',
    fps: 2,
    maxFrames: 16,
    suitable: '≤20 秒随手发',
    costHint: '约几分',
  },
  {
    id: 'half_minute',
    label: '半分钟快剪',
    detail: 'low',
    fps: 2,
    maxFrames: 48,
    suitable: '20～35 秒种草/梗串',
    costHint: '约几分～一毛',
  },
  {
    id: 'minute_full',
    label: '一分钟看全',
    detail: 'low',
    fps: 1,
    maxFrames: 60,
    suitable: '≈1 分钟，优先看完整段',
    costHint: '大约几分～一毛',
  },
  {
    id: 'minute_dense',
    label: '一分钟更密',
    detail: 'low',
    fps: 2,
    maxFrames: 100,
    suitable: '1 分钟且动作多',
    costHint: '大约一毛上下',
    fallbackPresetId: 'minute_full',
  },
  {
    id: 'action',
    label: '看清动作',
    detail: 'high',
    fps: 2,
    maxFrames: 24,
    suitable: '短片、愿多花钱',
    costHint: '贵一点，别硬扛 1 分钟',
  },
];

export function clampVideoFps(fps: number): number {
  const n = Math.round(fps);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(VIDEO_API_MAX_FPS, n);
}

export function clampVideoMaxFrames(maxFrames: number): number {
  const n = Math.round(maxFrames);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(VIDEO_API_MAX_FRAMES, n);
}

export function matchVideoPresetId(config: Pick<VideoApiConfig, 'detail' | 'fps' | 'maxFrames'>): VideoApiPresetId | null {
  const hit = VIDEO_API_PRESETS.find(p =>
    p.detail === config.detail && p.fps === config.fps && p.maxFrames === config.maxFrames);
  return hit?.id ?? null;
}

export function videoApiPresetLabel(config: Pick<VideoApiConfig, 'detail' | 'fps' | 'maxFrames'>): string {
  const id = matchVideoPresetId(config);
  if (!id) return '自定义';
  return VIDEO_API_PRESETS.find(p => p.id === id)?.label ?? '自定义';
}

export function getVideoPresetById(id: VideoApiPresetId): VideoApiSamplingPreset {
  const p = VIDEO_API_PRESETS.find(x => x.id === id);
  if (!p) throw new Error(`Unknown video preset: ${id}`);
  return p;
}

export function effectiveVideoFrames(durationSec: number, fps: number, maxFrames: number): number {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const f = clampVideoFps(fps);
  const cap = clampVideoMaxFrames(maxFrames);
  if (d <= 0) return Math.min(cap, f);
  return Math.min(cap, Math.max(1, Math.ceil(d * f)));
}

export function estimateVideoCostHint(
  config: Pick<VideoApiConfig, 'detail' | 'fps' | 'maxFrames'>,
  durationSec: number,
): string {
  const preset = VIDEO_API_PRESETS.find(p =>
    p.detail === config.detail && p.fps === config.fps && p.maxFrames === config.maxFrames);
  if (preset) return preset.costHint;

  const frames = effectiveVideoFrames(durationSec, config.fps, config.maxFrames);
  const detail = config.detail;
  if (frames <= 8) return '几分钱不到';
  if (frames <= 16 && detail !== 'high') return '约几分';
  if (detail === 'high' && frames <= 24) return '贵一点，别硬扛 1 分钟';
  if (frames <= 60 && detail !== 'high') return '大约几分～一毛';
  return '大约一毛上下；帧数多可能更慢或报错';
}

export function shouldRetryVideoApi50507(config: Pick<VideoApiConfig, 'detail' | 'fps' | 'maxFrames'>): boolean {
  const id = matchVideoPresetId(config);
  if (id === 'minute_dense') return true;
  return config.maxFrames >= 90 && config.fps >= 2;
}

export function videoApiConfigFor50507Fallback(
  config: Pick<VideoApiConfig, 'detail' | 'fps' | 'maxFrames'>,
): Pick<VideoApiConfig, 'detail' | 'fps' | 'maxFrames'> {
  const id = matchVideoPresetId(config);
  if (id === 'minute_dense') {
    const fb = getVideoPresetById('minute_full');
    return { detail: fb.detail, fps: fb.fps, maxFrames: fb.maxFrames };
  }
  return { detail: 'low', fps: 1, maxFrames: 60 };
}

export function formatVideoDetailLabel(detail: VideoApiDetail): string {
  if (detail === 'high') return 'high 更清晰';
  if (detail === 'auto') return 'auto 自动';
  return 'low 省流量';
}
