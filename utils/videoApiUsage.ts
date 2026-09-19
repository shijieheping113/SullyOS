import type { VideoApiDetail } from '../types';
import { effectiveVideoFrames } from './videoApiPresets';

const STATS_KEY = 'video_api_usage_stats_v1';

export interface VideoApiUsageStats {
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalEstimatedYuan: number;
  lastCallAt: number;
  lastCallSummary: string;
}

export interface VideoApiUsageRecordInput {
  durationSec: number;
  fps: number;
  maxFrames: number;
  detail: VideoApiDetail;
  promptTokens?: number;
  completionTokens?: number;
}

/** 粗算单次费用（元），无 usage 时用帧数分桶。 */
export function estimateVideoCallYuan(input: Pick<VideoApiUsageRecordInput, 'durationSec' | 'fps' | 'maxFrames' | 'detail'>): number {
  const frames = effectiveVideoFrames(input.durationSec, input.fps, input.maxFrames);
  let yuan = 0.02;
  if (frames <= 8) yuan = 0.02;
  else if (frames <= 16) yuan = 0.05;
  else if (frames <= 24 && input.detail === 'high') yuan = 0.12;
  else if (frames <= 24) yuan = 0.06;
  else if (frames <= 60) yuan = 0.1;
  else yuan = 0.15;
  if (input.detail === 'high') yuan *= 1.4;
  return Math.round(yuan * 1000) / 1000;
}

export function getVideoApiUsage(): VideoApiUsageStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        callCount: p.callCount || 0,
        totalPromptTokens: p.totalPromptTokens || 0,
        totalCompletionTokens: p.totalCompletionTokens || 0,
        totalEstimatedYuan: p.totalEstimatedYuan || 0,
        lastCallAt: p.lastCallAt || 0,
        lastCallSummary: p.lastCallSummary || '',
      };
    }
  } catch { /* ignore */ }
  return {
    callCount: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalEstimatedYuan: 0,
    lastCallAt: 0,
    lastCallSummary: '',
  };
}

function formatYuan(n: number): string {
  if (n < 0.01) return '不足 1 分';
  if (n < 0.1) return `约 ${(n * 100).toFixed(0)} 分`;
  return `约 ${n.toFixed(2)} 元`;
}

export function recordVideoApiUsage(input: VideoApiUsageRecordInput): { callYuan: number; summary: string } {
  const prompt = input.promptTokens ?? 0;
  const completion = input.completionTokens ?? 0;
  const callYuan = (prompt + completion > 0)
    ? estimateVideoCallYuan(input)
    : estimateVideoCallYuan(input);

  const tokenPart = (prompt + completion > 0)
    ? `tokens ${prompt}+${completion}`
    : `${effectiveVideoFrames(input.durationSec, input.fps, input.maxFrames)} 帧`;
  const summary = `本次 ${formatYuan(callYuan)}（${tokenPart}）`;

  try {
    const cur = getVideoApiUsage();
    const next: VideoApiUsageStats = {
      callCount: cur.callCount + 1,
      totalPromptTokens: cur.totalPromptTokens + prompt,
      totalCompletionTokens: cur.totalCompletionTokens + completion,
      totalEstimatedYuan: Math.round((cur.totalEstimatedYuan + callYuan) * 1000) / 1000,
      lastCallAt: Date.now(),
      lastCallSummary: summary,
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }

  return { callYuan, summary };
}

export function resetVideoApiUsage(): void {
  try { localStorage.removeItem(STATS_KEY); } catch { /* ignore */ }
}

export function videoApiUsageSummary(): string {
  const s = getVideoApiUsage();
  if (!s.callCount) return '暂无用量';
  const total = formatYuan(s.totalEstimatedYuan);
  const tokens = (s.totalPromptTokens + s.totalCompletionTokens) > 0
    ? ` · tokens 约 ${s.totalPromptTokens + s.totalCompletionTokens}`
    : '';
  return `累计 ${s.callCount} 次 · ${total}${tokens}`;
}

export function videoApiLastCallToastLine(): string {
  const s = getVideoApiUsage();
  if (!s.lastCallSummary) return '';
  return `${s.lastCallSummary} · ${videoApiUsageSummary()}`;
}
