// 鱼声「带时间轴」合成：POST /v1/tts/stream/with-timestamp（SSE 流式）。
//
// 为什么要单开一个模块（而不是给 synthesizeSpeechFishDetailed 加参数）：
//  · 聊天语音条 / 约会 / 语音设计器**一律不走这里**（共享老函数原样不动）；
//  · 只有**电话**在字幕需要精确对位时才走这条路；
//  · 时间轴拿不到时返回 null，调用方退回老函数，**不会更差也不会打断通话**。
//
// 实测（2026-09-28，Ann 手机）：中文**逐字**给区间，且**不含标点**
// （"嗯" 0–0.4，"今" 1.44–1.6 …；0.4→1.44 那 1 秒是句号+换行的停顿）。
// 同一个 chunk_seq 会收到多条，**后者是累积快照**（segments 更全）——
// 官方明确要求「同 chunk_seq 取最新、**不要追加**」。
//
// ⚠️ 浏览器不能直连 api.fish.audio（对方不发 CORS 头），必须经过中转；
//    地址由用户自己填（utils/callTtsProxy.ts）。没填 → 返回 null，调用方退回老路。

import { resolveFishAudioApiKey, normalizeFishReferenceId, cleanTextForTtsFish } from './fishAudioTts';
import { getCallTtsTimestampProxy } from './callTtsProxy';
import type { SpeechTimeline, SpeechTimelineSegment } from './callSpeechTimeline';

const FISH_TS_TIMEOUT_MS = 85_000;

/** URL-safe base64 → Uint8Array（鱼声发的是 -_ 变体，atob 不认，先换回来再补 =）。 */
export const b64ToBytes = (b64: string): Uint8Array => {
  let s = (b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const pad = s.length % 4;
  if (pad === 1) throw new Error('base64 长度非法');
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return u8;
};

/** 从一段 SSE 事件块里取出 data 行的 JSON 文本。空行 / 注释行跳过。 */
export const extractSseData = (block: string): string => {
  const parts: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith(':')) continue;
    if (line.startsWith('data:')) parts.push(line.slice(5).replace(/^ /, ''));
  }
  return parts.join('\n');
};

export type FishTimestampResult = { url: string; timeline: SpeechTimeline };

/** 归并各 chunk 的 alignment 快照：同 chunk_seq 取最新、偏移加到全局时间上。 */
export function mergeTimelineSnapshots(
  snapshots: { seq: number; offset: number; duration?: number; segments: SpeechTimelineSegment[] }[],
): { segments: SpeechTimelineSegment[]; durationSec?: number } {
  const bySeq = new Map<number, { offset: number; duration?: number; segments: SpeechTimelineSegment[] }>();
  const order: number[] = [];
  for (const s of snapshots || []) {
    if (!bySeq.has(s.seq)) order.push(s.seq);
    bySeq.set(s.seq, { offset: s.offset, duration: s.duration, segments: s.segments });
  }
  const segments: SpeechTimelineSegment[] = [];
  let durationSec: number | undefined;
  for (const seq of order) {
    const al = bySeq.get(seq);
    if (!al) continue;
    if (typeof al.duration === 'number') durationSec = Math.max(durationSec || 0, al.duration);
    for (const s of al.segments) {
      segments.push({ text: s.text, start: s.start + al.offset, end: s.end + al.offset });
    }
  }
  return { segments, durationSec };
}

/**
 * 调鱼声时间轴接口，拿到可播放 URL + 逐字时间。
 * 任何一步不成立（没配中转 / 请求失败 / 一个时间点都没有）→ 返回 null，
 * 由调用方退回普通合成，**绝不抛错打断通话**。
 */
export async function synthesizeFishWithTimestamp(params: {
  text: string;
  referenceId: string;
  apiKey: string;
  model: string;
  proxyBase?: string;
  speed?: number;
  volumeDb?: number;
}): Promise<FishTimestampResult | null> {
  const { text, referenceId, apiKey, model } = params;
  if (!apiKey || !referenceId || !text.trim()) return null;

  const proxy = (params.proxyBase || '').trim().replace(/\/+$/, '');
  if (!proxy) return null;   // 没配中转 → 完全退回老路

  const spoken = cleanTextForTtsFish(text);
  if (!spoken) return null;

  const payload: Record<string, unknown> = {
    text: spoken,
    reference_id: referenceId,
    format: 'mp3',
    normalize: true,
    latency: 'normal',
  };
  const prosody: Record<string, number> = {};
  if (typeof params.speed === 'number' && params.speed > 0) {
    prosody.speed = Math.max(0.5, Math.min(2, params.speed));
  }
  if (typeof params.volumeDb === 'number' && Number.isFinite(params.volumeDb) && params.volumeDb > 0) {
    prosody.volume = Math.max(0, Math.min(12, params.volumeDb));
  }
  if (Object.keys(prosody).length) payload.prosody = prosody;

  const url = `${proxy}/fishaudio/tts-timestamp?model=${encodeURIComponent(model)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FISH_TS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      // model 走 query（中转层读 query），避免自定义 model 头触发 CORS 预检失败。
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    if (!res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const audioChunks: string[] = [];
    const snapshots: { seq: number; offset: number; duration?: number; segments: SpeechTimelineSegment[] }[] = [];

    const take = (ev: any) => {
      if (ev && typeof ev.audio_base64 === 'string' && ev.audio_base64) audioChunks.push(ev.audio_base64);
      const seq = ev && typeof ev.chunk_seq === 'number' ? ev.chunk_seq : null;
      if (seq === null) return;
      const al = ev && ev.alignment;
      if (!al || !Array.isArray(al.segments)) return;
      snapshots.push({
        seq,
        offset: typeof ev.chunk_audio_offset_sec === 'number' ? ev.chunk_audio_offset_sec : 0,
        duration: typeof al.audio_duration === 'number' ? al.audio_duration : undefined,
        segments: al.segments
          .filter((s: any) => s && typeof s.text === 'string' && typeof s.start === 'number')
          .map((s: any) => ({
            text: s.text,
            start: s.start,
            end: typeof s.end === 'number' ? s.end : s.start,
          })),
      });
    };

    // SSE：按**空行**分块（事件可能跨多次 read），逐行取 data 去掉前缀。
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.replace(/\r\n/g, '\n').split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const data = extractSseData(part);
        if (!data) continue;
        try { take(JSON.parse(data)); } catch (e) { /* 单条坏数据不中断整条流 */ }
      }
    }
    if (buf.trim()) {
      const data = extractSseData(buf.replace(/\r\n/g, '\n'));
      if (data) { try { take(JSON.parse(data)); } catch (e) { /* ignore */ } }
    }

    if (!audioChunks.length) return null;

    const { segments, durationSec } = mergeTimelineSnapshots(snapshots);
    if (!segments.length) return null;   // 没时间点就当没这能力，调用方退回估算

    const decoded = audioChunks.map(b64ToBytes);
    const merged = new Uint8Array(decoded.reduce((a, u) => a + u.length, 0));
    let at = 0;
    for (const u of decoded) { merged.set(u, at); at += u.length; }
    const blob = new Blob([merged], { type: 'audio/mpeg' });
    return { url: URL.createObjectURL(blob), timeline: { segments, durationSec } };
  } catch (e) {
    console.warn('[fish-ts] 时间轴合成失败，退回普通合成:', (e as any)?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 供 CallApp 复用同一套 Key / 音色 / 模型 / 中转解析，避免两处各写一遍。 */
export const resolveFishCallRefs = (apiConfig: any, char: any) => ({
  apiKey: resolveFishAudioApiKey(apiConfig),
  referenceId: normalizeFishReferenceId(char?.voiceProfile?.fishReferenceId),
  model: (char?.voiceProfile?.fishModel || apiConfig?.fishAudioModel || 's2.1-pro').trim() || 's2.1-pro',
  proxy: getCallTtsTimestampProxy(),
});

