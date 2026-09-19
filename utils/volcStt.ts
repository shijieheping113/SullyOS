// ============================================================
// 聊天语音识别（STT）三引擎 —— 从 public/stt-test.html 移植的生产版
//
//   doubao  → 豆包流式 2.0（火山引擎 /api/volc-ws 代理）
//             实时流式、热词接口级、情绪 5 格（angry/happy/neutral/sad/surprise）
//             计费：1元/小时，只按实际发送音频（静音停发护栏在 dbFeed）
//   omni    → Qwen3-Omni 全模态（硅基流动 /v1/chat/completions 代理）
//             本地 VAD 切段→逐段请求，情绪词库细腻（可自定义提示词），按段计费
//   teleasr → TeleASR 出字（硅基流动 /api/sf-stt 代理）
//             本地 VAD 切段→逐段请求，可选 SenseVoice 后台补情绪
//
// 计费记账：本机 localStorage（stt_usage_stats_v1），设置页展示。
// ============================================================
import type { SttApiConfig, SttEngineId, SttUsageStats } from '../types';

// ---------- 对外回调与句柄 ----------

export interface SttCallbacks {
  /** 中间结果（实时上屏用，可被后续覆盖）。切段引擎（omni/teleasr）不产生中间结果。 */
  onPartial?: (text: string) => void;
  /** 定句/段落完成。emotion 形如「（委屈地）」；emotionEnabled 关闭或引擎无情绪时为 ''。 */
  onFinal: (text: string, emotion: string) => void;
  /** 状态变化：connecting / recording / muted(静音停发不扣费) / stopping / done */
  onStatus?: (status: SttStatus) => void;
  /** 错误（识别失败、网络断开等）。报错后会自动收尾。 */
  onError?: (msg: string) => void;
}

export type SttStatus = 'connecting' | 'recording' | 'muted' | 'stopping' | 'done';

export interface SttSession {
  /** 停止录音并收尾（发负包/切尾段），返回后可安全开始下一次。 */
  stop: () => Promise<void>;
  /** 取本次完整录音（含静音段，16k 单声道 WAV）——聊天语音消息回放原声用。没录到返回 null。 */
  takeRecording: () => { wav: Blob; durationMs: number } | null;
  /** 暂停/恢复喂识别引擎（麦克风不断）：打电话时 AI 说话期间暂停，防外放回声被识别+计费。 */
  setPaused: (paused: boolean) => void;
}

// ---------- 引擎参数（与测试页一致，实测验证过） ----------
const START_RMS = 0.02;          // 说话判定阈值（RMS）
const SPLIT_SILENCE_MS = 650;    // 本地断句：静音 650ms 切一段
const MIN_SEG_MS = 350;          // 短于 350ms 的碎段丢弃
const MAX_SEG_MS = 15000;        // 最长段 15s 硬切
const DB_MUTE_MS = 1500;         // 豆包护栏：连续静音 1.5s 停发（不扣费）
const DB_PREROLL_SAMPLES = 8000; // 豆包恢复发包时补 0.5s 前置（16k 采样）
const SEG_SLOTS = 2;             // omni/teleasr 并发请求数

// ---------- 情绪标签翻译 ----------
const VOLC_EMO_ZH: Record<string, string> = { angry: '（生气）', happy: '（开心）', neutral: '（平静）', sad: '（低落）', surprise: '（惊讶）' };
const EMO_ZH: Record<string, string> = { HAPPY: '（开心）', SAD: '（低落）', ANGRY: '（生气）', SURPRISED: '（惊讶）', FEARFUL: '（紧张）', DISGUSTED: '（嫌弃）' };

// ---------- Omni 默认提示词（设置页可自定义；这是用户听写，不是角色语音指南） ----------
export function defaultQwenEmotionPrompt(hotwords: string[]): string {
  const hot = hotwords.length ? hotwords.join('、') : '';
  return [
    '请完成以下任务：',
    '1. 逐字转写这段语音，输出纯文字（不要标点外的任何标记）。',
    hot ? `2. 人名/专有名词务必准确转写：${hot}，不要写错字。` : '2. 人名务必准确转写。',
    '3. 单独一行用括号描述说话人的语气情绪。词库：生气地、愤怒地、委屈地、伤心地、难过地、失落地、撒娇地、愉快地、开心地、兴奋地、平静地、冷淡地、厌烦地、不耐烦地、无奈地、惊讶地、害怕地、紧张地。',
    '   要求：',
    '   - 听到语气稍重、语调上扬带攻击性 → 标「生气地」或「愤怒地」，别标「惊讶地」。',
    '   - 听到语调低沉、声音变小变慢 → 标「伤心地」或「失落地」，别轻易标「平静地」。',
    '   - 有疑问语气但语气平和 → 标「平静地」；有疑问且语调上扬惊讶 → 标「惊讶地」。',
    '   - 负面情绪宁可标重一档，不要标轻。不确定时按最可能的情绪标，不要写「不确定」。',
    '输出格式严格为两行：',
    '第一行：转写文字',
    '第二行：（情绪地）',
  ].join('\n');
}

/** Omni 情绪关闭时的纯转写提示词 */
function plainQwenPrompt(hotwords: string[]): string {
  const hot = hotwords.length ? hotwords.join('、') : '';
  return [
    '请逐字转写这段语音，输出纯文字（不要标点外的任何标记），不要输出其他任何内容。',
    hot ? `人名/专有名词务必准确转写：${hot}，不要写错字。` : '人名务必准确转写。',
  ].join('\n');
}

// ---------- 能力检测 ----------
export function isSttSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window !== 'undefined'
    && !!(window.AudioContext || (window as any).webkitAudioContext);
}

/** 豆包引擎需要 CompressionStream（gzip），老浏览器退化成裸包也能用，返回 false 仅作提示 */
export function doubaoGzipSupported(): boolean {
  return typeof CompressionStream !== 'undefined';
}

// ---------- 费用记账（本机 localStorage） ----------
const STATS_KEY = 'stt_usage_stats_v1';

export function getSttUsage(): SttUsageStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        doubaoMs: p.doubaoMs || 0,
        omniSegments: p.omniSegments || 0,
        teleasrSegments: p.teleasrSegments || 0,
        lastUpdated: p.lastUpdated || 0,
      };
    }
  } catch { /* ignore */ }
  return { doubaoMs: 0, omniSegments: 0, teleasrSegments: 0, lastUpdated: 0 };
}

function addSttUsage(patch: Partial<SttUsageStats>): void {
  try {
    const cur = getSttUsage();
    const next: SttUsageStats = {
      doubaoMs: cur.doubaoMs + (patch.doubaoMs || 0),
      omniSegments: cur.omniSegments + (patch.omniSegments || 0),
      teleasrSegments: cur.teleasrSegments + (patch.teleasrSegments || 0),
      lastUpdated: Date.now(),
    };
    localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function resetSttUsage(): void {
  try { localStorage.removeItem(STATS_KEY); } catch { /* ignore */ }
}

/** 费用概览文案（设置页/录音结束提示共用） */
export function sttUsageSummary(): string {
  const s = getSttUsage();
  const parts: string[] = [];
  if (s.doubaoMs) parts.push(`豆包 ${(s.doubaoMs / 60000).toFixed(1)} 分钟 ≈ ${(s.doubaoMs / 3600000).toFixed(4)} 元`);
  if (s.omniSegments) parts.push(`Omni ${s.omniSegments} 段`);
  if (s.teleasrSegments) parts.push(`TeleASR ${s.teleasrSegments} 段`);
  return parts.length ? `累计：${parts.join(' · ')}` : '暂无用量';
}

// ============================================================
// 公共：音频采集 + RMS
// ============================================================
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); ws(8, 'WAVE');
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s0 = Math.floor(i * ratio), s1 = Math.min(input.length, Math.floor((i + 1) * ratio));
    let acc = 0; for (let j = s0; j < s1; j++) acc += input[j];
    out[i] = acc / (s1 - s0 || 1);
  }
  return out;
}

function frameRms(d: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
  return Math.sqrt(sum / d.length);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function uuid(): string {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
}

/** 硅基流动音频转写（TeleASR / SenseVoice） */
async function sfStt(wavBlob: Blob, model: string, apiKey: string): Promise<any> {
  const form = new FormData();
  form.append('file', wavBlob, 'speech.wav');
  form.append('model', model);
  const res = await fetch('/api/sf-stt/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 100)}`);
  return JSON.parse(text);
}

/** SenseVoice 回信的情绪标签解析（<|happy|>xxx 或文本含情绪词） */
function senseVoiceEmotion(text: string): { emo: string; clean: string } {
  const m = text.match(/<\|(\w+)\|>/);
  if (m) return { emo: m[1].toUpperCase(), clean: text.replace(/<\|\w+\|>/g, '').trim() };
  return { emo: '', clean: text.trim() };
}

// ============================================================
// 入口：按配置选引擎
// ============================================================
// TODO(诊断): 需要排查链路时改回 true（每一步弹里程碑窗）
const STT_DEBUG = false;
export const sttDebug = (msg: string) => { if (STT_DEBUG) { try { window.alert(`[诊断] ${msg}`); } catch { /* ignore */ } } };

export async function startVoiceInput(
  cfg: SttApiConfig,
  cb: SttCallbacks,
): Promise<SttSession> {
  if (!isSttSupported()) throw new Error('当前浏览器不支持录音（需要 HTTPS + 麦克风权限）');

  const engine: SttEngineId = cfg.engine || 'doubao';
  const emotionOn = cfg.emotionEnabled !== false; // 缺省开
  const hotwords = (cfg.hotwords || '').split(/[,，、\s]+/).filter(Boolean);

  if (engine === 'doubao' && !(cfg.volcApiKey || '').trim()) throw new Error('豆包引擎需要先在设置里填火山引擎 API Key');
  if (engine !== 'doubao' && !(cfg.sfApiKey || '').trim()) throw new Error(`${engine === 'omni' ? 'Omni' : 'TeleASR'} 引擎需要先在设置里填硅基流动 API Key`);

  cb.onStatus?.('connecting');

  // 公共录音链路
  sttDebug(`1/4 准备申请麦克风（engine=${engine}）…`);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  sttDebug('2/4 麦克风已拿到 ✓（权限通过了）');
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const rate = ctx.sampleRate;
  const src = ctx.createMediaStreamSource(stream);
  const muteGain = ctx.createGain(); muteGain.gain.value = 0;
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  // 连线：source → processor → 静音出口。不接到 destination 就不触发 onaudioprocess，
  // 出口用零增益 GainNode 兜着，避免系统听到自己的回声。
  src.connect(proc); proc.connect(muteGain); muteGain.connect(ctx.destination);

  let stopped = false;
  let stopExecutor: (() => Promise<void>) | null = null;
  const cleanupAudio = () => {
    try { proc.disconnect(); } catch { /* ignore */ }
    try { muteGain.disconnect(); } catch { /* ignore */ }
    try { ctx.close(); } catch { /* ignore */ }
    stream.getTracks().forEach(t => t.stop());
  };
  const ec: EngineCtx = {
    proc, rate,
    getStopped: () => stopped,
    setStop: (fn) => { stopExecutor = fn; },
    pauseFlag: { paused: false },
    recChunks: [],
    recSamples: 0,
    pushRec: (d16: Float32Array) => {
      // 录音回放缓存上限 120 秒（16k 采样 ≈ 7.7MB），超了就不再累积
      if (ec.recSamples >= 1920000) return; // 120 秒上限（不用 1_920_000 写法，老内核兼容）
      ec.recChunks.push(d16);
      ec.recSamples += d16.length;
    },
  };

  try {
    if (engine === 'doubao') {
      await startDoubao(cfg, cb, ec);
    } else {
      await startSegmentEngine(engine, cfg, cb, hotwords, emotionOn, ec);
    }
  } catch (err) {
    // 引擎启动失败（Key 体检不过、连接超时等）：立刻释放麦克风，别让录音灯一直亮
    cleanupAudio();
    throw err;
  }

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      cb.onStatus?.('stopping');
      try { await stopExecutor?.(); } catch { /* 收尾失败不阻塞 */ }
      cleanupAudio();
      cb.onStatus?.('done');
    },
    takeRecording: () => {
      const total = ec.recSamples;
      if (!total) return null;
      const merged = new Float32Array(total);
      let o = 0;
      for (const c of ec.recChunks) { merged.set(c, o); o += c.length; }
      ec.recChunks = []; // 取走即清，防重复取
      return { wav: encodeWav(merged, 16000), durationMs: Math.round(total / 16) };
    },
    setPaused: (paused: boolean) => { ec.pauseFlag.paused = paused; },
  };
}

// ============================================================
// 引擎一：豆包流式 2.0（火山引擎 wss，二进制协议 + 静音停发护栏）
// ============================================================
const hasCS = typeof CompressionStream !== 'undefined';

async function dbGzip(u8: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function dbGunzip(u8: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 通用帧构造（整数全大端）：4字节头 + [seq 4B] + payload size(4B) + payload */
function dbFrame(msgType: number, flags: number, serialization: number, compression: number, seq: number | null, payload: Uint8Array<ArrayBuffer> | null): Uint8Array<ArrayBuffer> {
  const body = payload || new Uint8Array(0);
  const buf = new Uint8Array(4 + (seq !== null ? 4 : 0) + 4 + body.length);
  buf.set(new Uint8Array([0x11, (msgType << 4) | flags, (serialization << 4) | compression, 0x00]), 0);
  const dv = new DataView(buf.buffer);
  let off = 4;
  if (seq !== null) { dv.setInt32(off, seq); off += 4; }
  dv.setUint32(off, body.length);
  buf.set(body, off + 4);
  return buf;
}

function float32ToPcm16LE(float32: Float32Array): Uint8Array<ArrayBuffer> {
  const pcm = new Uint8Array(float32.length * 2);
  const pdv = new DataView(pcm.buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pdv.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return pcm;
}

interface EngineCtx {
  proc: ScriptProcessorNode;
  rate: number;
  getStopped: () => boolean;
  /** 引擎注册自己的收尾动作（发负包/等队列跑完），stop() 时按序执行 */
  setStop: (fn: () => Promise<void>) => void;
  /** 暂停喂引擎（录音继续）：打电话防回声用 */
  pauseFlag: { paused: boolean };
  /** 完整录音缓存（16k，含静音段）：聊天语音消息回放用。引擎喂帧回调里顺手调 pushRec。 */
  recChunks: Float32Array[];
  recSamples: number;
  pushRec: (d16: Float32Array) => void;
}

async function startDoubao(cfg: SttApiConfig, cb: SttCallbacks, ec: EngineCtx): Promise<void> {
  const key = (cfg.volcApiKey || '').trim();
  const reqId = uuid();
  const emotionOn = cfg.emotionEnabled !== false;
  const hotwords = (cfg.hotwords || '').split(/[,，、\s]+/).filter(Boolean);

  let ws: WebSocket | null = null;
  let acc: Float32Array[] = [];            // 凑包缓存
  let preRoll: Float32Array[] = [];        // 前置环形缓存（恢复发包补 0.5s）
  let sentMs = 0;                          // 实际发送毫秒（计费口径）
  let silentMs = 0;
  let muted = false;
  let done = false;
  let lastPacketSent = false; // 负包发出后禁止再喂音频，否则火山报 last packet has been received already
  let seq = 1;
  let sendChain: Promise<void> = Promise.resolve();
  const loggedKeys = new Set<string>();    // 定句去重（服务端每封回信带全量分句）

  // --- Key 体检：让 vite 替咱们向火山做一次真实握手，拒绝理由拿到明面上 ---
  let verdict: { ok: boolean; status?: number; body?: string } | null = null;
  try {
    sttDebug('3/4 正在做火山 Key 体检（连本机服务）…');
    const r = await fetch(`/api/volc-check?key=${encodeURIComponent(key)}&request_id=${encodeURIComponent(reqId)}`);
    verdict = await r.json();
    sttDebug(`Key 体检结果: ok=${verdict?.ok} status=${verdict?.status ?? '-'}`);
  } catch (e: any) {
    throw new Error('连不上本机服务（' + e.message + '），电脑上的开发服务可能停了');
  }
  if (verdict && !verdict.ok) {
    throw new Error(`火山拒绝握手：HTTP ${verdict.status} ${verdict.body || ''}（检查 Key 是否有效、是否开通「豆包流式语音识别2.0」）`);
  }

  // --- 喂帧队列：必须在 WS 建立之前定义！---
  // onopen 一触发就会同步调用 enqueue 发启动包；如果把它定义在
  // 「await 建立 WS」之后，onopen 执行时它还在暂时性死区（TDZ），
  // 会抛 ReferenceError 且 resolve() 永远不执行 —— 表现为四步全过
  // 后无声卡死在 connecting（图标只闪边框不变红）。
  const enqueue = (fn: () => Promise<void>) => { sendChain = sendChain.then(fn).catch(e => cb.onError?.('豆包发送失败: ' + e.message)); };

  // --- 建立 WS 语音通道 ---
  await new Promise<void>((resolve, reject) => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const sock = new WebSocket(`${proto}//${location.host}/api/volc-ws?key=${encodeURIComponent(key)}&request_id=${encodeURIComponent(reqId)}`);
    sock.binaryType = 'arraybuffer';
    const timer = setTimeout(() => { reject(new Error('连接火山超时（8秒）')); try { sock.close(); } catch { /* ignore */ } }, 8000);

    sock.onopen = () => {
      clearTimeout(timer);
      sttDebug('4/4 火山语音通道已连上 ✓ 开始录音');
      ws = sock;
      const sendFull = async () => {
        const json = new TextEncoder().encode(JSON.stringify({
          audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
          request: {
            model_name: 'bigmodel',
            enable_itn: true, enable_punc: true, enable_ddc: false,
            enable_nonstream: true,          // 二遍识别：实时上屏 + definite 最终句
            enable_emotion_detection: emotionOn,
            show_utterances: true, show_speech_rate: true, show_volume: true,
            result_type: 'full', end_window_size: 800, force_to_speech_time: 1000,
            ...(hotwords.length ? { corpus: { context: JSON.stringify({ hotwords: hotwords.map(w => ({ word: w })) }) } } : {}),
          },
        }));
        const body = hasCS ? await dbGzip(json) : json;
        ws!.send(dbFrame(0x01, 0x01, 0x01, hasCS ? 0x01 : 0x00, 1, body));
      };
      enqueue(sendFull);
      resolve();
    };
    sock.onmessage = (e) => { void dbOnMessage(e.data); };
    sock.onerror = () => { reject(new Error('语音通道连接出错（体检已过，多半是这台设备的浏览器拦了 WSS）')); };
    sock.onclose = () => {
      ws = null;
      if (!done && !ec.getStopped()) cb.onError?.('豆包连接被服务端/网络关闭（非正常收尾），已发送部分文字保留');
    };
  });

  cb.onStatus?.('recording');

  // --- 服务端回信解析 ---
  async function dbOnMessage(buf: ArrayBuffer): Promise<void> {
    try {
      const dv = new DataView(buf);
      const headerSize = dv.getUint8(0) & 0x0f;
      const msgType = dv.getUint8(1) >> 4;
      const flags = dv.getUint8(1) & 0x0f;
      const compression = dv.getUint8(2) & 0x0f;
      let off = headerSize * 4;
      if (flags & 0x01) off += 4;

      if (msgType === 0x0b) return;                 // ack 确认帧，忽略
      if (msgType === 0x0f) {                        // 错误帧
        const errorCode = dv.getInt32(off); off += 4;
        const esize = dv.getUint32(off); off += 4;
        let detail = '';
        try {
          let p = new Uint8Array(buf, off, esize);
          if (compression === 1 && hasCS) p = await dbGunzip(p);
          detail = new TextDecoder().decode(p);
        } catch { /* ignore */ }
        cb.onError?.(`豆包错误帧 errorCode=${errorCode}: ${detail.slice(0, 200)}`);
        return;
      }
      if (msgType !== 0x09) return;
      if (off + 4 > buf.byteLength) return;

      const size = dv.getUint32(off); off += 4;
      let payloadBytes = new Uint8Array(buf, off, size);
      if (compression === 1) {
        if (!hasCS) { cb.onError?.('回信是gzip压缩的，但这台浏览器解不了'); return; }
        payloadBytes = await dbGunzip(payloadBytes);
      }
      const text = new TextDecoder().decode(payloadBytes);
      let json: any;
      try { json = JSON.parse(text); } catch { return; }

      // 宽容点：code 字段可能不存在（确认/中间帧）——只有明确非 0 才算错误
      const code = json.code != null ? json.code : (json.payload_msg && json.payload_msg.code);
      if (code != null && code !== 0) {
        cb.onError?.(`豆包错误 code=${code} ${json.message || (json.payload_msg && json.payload_msg.message) || ''}`);
        return;
      }

      let result = (json.payload_msg && json.payload_msg.result != null) ? json.payload_msg.result : json.result;
      if (Array.isArray(result)) result = result[0];
      if (result && Array.isArray(result.utterances) && result.utterances.length) {
        for (const u of result.utterances) {
          // additions 兼容三种形态：JSON字符串 / 现成对象 / 没有
          let add: any = {};
          if (typeof u.additions === 'string') { try { add = JSON.parse(u.additions) || {}; } catch { /* ignore */ } }
          else if (u.additions && typeof u.additions === 'object') add = u.additions;
          const emo = add.emotion || '';
          if (u.definite) {
            const key = u.start_time + '|' + u.end_time + '|' + u.text;
            if (!loggedKeys.has(key)) {
              loggedKeys.add(key);
              const tag = emotionOn && emo && VOLC_EMO_ZH[emo] ? VOLC_EMO_ZH[emo] : '';
              cb.onFinal(u.text || '', tag);
            }
          } else if (u.text) {
            cb.onPartial?.(u.text);
          }
        }
      } else if (result && typeof result.text === 'string' && result.text) {
        const key = 'final|' + result.text;
        if (!loggedKeys.has(key)) {
          loggedKeys.add(key);
          cb.onFinal(result.text, '');
        }
      }

      const lastFlag = !!(flags & 0x02) || json.is_last_package === true || (json.payload_msg && json.payload_msg.is_last_package === true);
      if (lastFlag && !done) {
        done = true;
        addSttUsage({ doubaoMs: sentMs });
        try { ws && ws.close(); } catch { /* ignore */ }
      }
    } catch (e: any) {
      cb.onError?.('豆包回信处理异常: ' + e.message);
    }
  }

  // --- 喂帧 + 计费护栏（enqueue 已提前到 WS 建立前定义，见上）---

  async function sendAudio(float32: Float32Array, isLast: boolean): Promise<void> {
    if (!ws || ws.readyState !== 1) return;
    if (!isLast && lastPacketSent) return;
    if (isLast) lastPacketSent = true;
    let body: Uint8Array<ArrayBuffer> | null = null;
    if (float32.length) {
      const pcm = float32ToPcm16LE(float32);
      body = hasCS ? await dbGzip(pcm) : pcm;
    } else if (isLast) {
      body = hasCS ? await dbGzip(new Uint8Array(0)) : new Uint8Array(0); // 负包：空负载也要发
    }
    // gzip 期间可能已经发过负包；负包之后再发会被火山打回 45000000
    if (!ws || ws.readyState !== 1) return;
    if (!isLast && lastPacketSent) return;
    const s = ++seq;
    ws.send(dbFrame(0x02, isLast ? 0x03 : 0x01, 0x00, body ? (hasCS ? 0x01 : 0x00) : 0x00, isLast ? -s : s, body));
    if (!isLast) sentMs += float32.length / 16; // 16000 samples/s → ms = n/16
  }

  ec.proc.onaudioprocess = (e) => {
    if (done || lastPacketSent || ec.getStopped()) return;
    const d = e.inputBuffer.getChannelData(0);
    const rms = frameRms(d);
    const d16 = ec.rate === 16000 ? new Float32Array(d) : downsampleTo16k(d, ec.rate);
    ec.pushRec(d16);
    if (ec.pauseFlag.paused) return; // 通话防回声：AI 正在说话，这段不喂引擎

    // 前置环形缓存：保留最近 ~0.5s
    preRoll.push(d16);
    let preN = 0; for (const c of preRoll) preN += c.length;
    while (preN > DB_PREROLL_SAMPLES && preRoll.length) preN -= (preRoll.shift()?.length ?? 0);

    if (rms >= START_RMS) {
      if (muted) {
        acc = preRoll.slice();
        muted = false; silentMs = 0;
        cb.onStatus?.('recording');
      }
    } else if (!muted) {
      silentMs += (d.length / ec.rate) * 1000;
      if (silentMs > DB_MUTE_MS) {
        muted = true; acc = [];
        cb.onStatus?.('muted'); // 静音停发，不扣费
      }
    }
    if (!muted) acc.push(d16);
    let n = 0; for (const c of acc) n += c.length;
    if (!muted && n >= 3200) { // 凑满 200ms 发一包
      const out = new Float32Array(n);
      let o = 0; for (const c of acc) { out.set(c, o); o += c.length; }
      acc = [];
      enqueue(() => sendAudio(out, false));
    }
  };

  // --- 收尾：负包（说完了）---
  ec.setStop(async () => {
    lastPacketSent = true;
    if (ws && ws.readyState === 1) {
      // 没凑满一包的余量塞进负包里一起发，不丢尾音
      let n = 0; for (const c of acc) n += c.length;
      let leftover = new Float32Array(0);
      if (n) {
        leftover = new Float32Array(n);
        let o = 0; for (const c of acc) { leftover.set(c, o); o += c.length; }
        acc = [];
      }
      enqueue(() => sendAudio(leftover, true));
      // 等服务端回完最终句再关（兜底 5 秒）
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => { try { ws && ws.close(); } catch { /* ignore */ } resolve(); }, 5000);
        const check = setInterval(() => {
          if (done || !ws || ws.readyState !== 1) { clearTimeout(t); clearInterval(check); resolve(); }
        }, 200);
      });
    }
    addSttUsage({ doubaoMs: sentMs });
  });
}

// ============================================================
// 引擎二/三：切段式（Omni / TeleASR）—— 本地 VAD 切段 → 逐段请求
// ============================================================
interface SegPayload {
  wav: Blob;
  feat: { peak: number; zc: number; ratio: number };
  state: 'queued' | 'working';
}

async function startSegmentEngine(
  engine: 'omni' | 'teleasr',
  cfg: SttApiConfig,
  cb: SttCallbacks,
  hotwords: string[],
  emotionOn: boolean,
  ec: EngineCtx,
): Promise<void> {
  const sfKey = (cfg.sfApiKey || '').trim();
  let curChunks: Float32Array[] = [], curRms: number[] = [], curZc: number[] = [];
  let speechActive = false, silenceMs = 0, segStartT = 0, segPeak = 0;
  let segIndex = 0, inFlight = 0;
  const queue: SegPayload[] = [];
  let stopped = false;

  const pump = () => {
    while (inFlight < SEG_SLOTS && queue.length) {
      const p = queue.shift()!;
      inFlight++;
      runSeg(p).finally(() => { inFlight--; pump(); });
    }
  };

  const closeSeg = () => {
    if (!curChunks.length) return;
    let end = curRms.length;
    while (end > 0 && curRms[end - 1] < START_RMS * 0.7) end--;
    const keepChunks = Math.min(curChunks.length, end + 2);
    let len = 0; for (let i = 0; i < keepChunks; i++) len += curChunks[i].length;
    const merged = new Float32Array(len);
    let o = 0; for (let i = 0; i < keepChunks; i++) { merged.set(curChunks[i], o); o += curChunks[i].length; }
    const durMs = len / ec.rate * 1000;
    let speechFrames = 0, zcSum = 0, zcN = 0;
    for (let i = 0; i < end; i++) { if (curRms[i] > START_RMS) { speechFrames++; zcSum += curZc[i]; zcN++; } }
    const feat = { peak: segPeak, zc: zcN ? zcSum / zcN : 0, ratio: end ? speechFrames / end : 0 };
    const idx = ++segIndex;
    curChunks = []; curRms = []; curZc = []; speechActive = false; silenceMs = 0; segPeak = 0;
    if (durMs < MIN_SEG_MS) return; // 碎段丢弃
    const wav = encodeWav(downsampleTo16k(merged, ec.rate), 16000);
    queue.push({ wav, feat, state: 'queued' });
    pump();
  };

  ec.proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    ec.pushRec(ec.rate === 16000 ? new Float32Array(d) : downsampleTo16k(d, ec.rate));
    if (ec.pauseFlag.paused) return; // 通话防回声：AI 正在说话，这段不喂引擎
    const rms = frameRms(d);
    let zc = 0;
    for (let i = 1; i < d.length; i++) { if ((d[i] >= 0) !== (d[i - 1] >= 0)) zc++; }
    if (!speechActive) {
      if (rms >= START_RMS) {
        speechActive = true; silenceMs = 0; segStartT = performance.now(); segPeak = rms;
        curChunks = [new Float32Array(d)]; curRms = [rms]; curZc = [zc];
      }
    } else {
      curChunks.push(new Float32Array(d)); curRms.push(rms); curZc.push(zc);
      segPeak = Math.max(segPeak, rms);
      const dur = performance.now() - segStartT;
      if (rms < START_RMS * 0.7) silenceMs += (d.length / ec.rate) * 1000; else silenceMs = 0;
      if (silenceMs >= SPLIT_SILENCE_MS || dur >= MAX_SEG_MS) closeSeg();
    }
  };

  cb.onStatus?.('recording');

  async function runSeg(p: SegPayload): Promise<void> {
    p.state = 'working';
    try {
      if (engine === 'omni') {
        const b64 = await blobToBase64(p.wav);
        const prompt = emotionOn
          ? ((cfg.qwenEmotionPrompt || '').trim() || defaultQwenEmotionPrompt(hotwords))
          : plainQwenPrompt(hotwords);
        const res = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sfKey },
          body: JSON.stringify({
            model: 'Qwen/Qwen3-Omni-30B-A3B-Instruct',
            messages: [{
              role: 'user',
              content: [
                { type: 'audio_url', audio_url: { url: 'data:audio/wav;base64,' + b64 } },
                { type: 'text', text: prompt },
              ],
            }],
          }),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 100)}`);
        const data = JSON.parse(text);
        const out = String(data.choices?.[0]?.message?.content || '').trim();
        const lines = out.split('\n').filter((l: string) => l.trim());
        if (emotionOn && lines.length > 1) {
          const toneLine = lines[lines.length - 1];
          cb.onFinal(lines.slice(0, -1).join(''), toneLine);
        } else {
          cb.onFinal(lines.join(''), '');
        }
        addSttUsage({ omniSegments: 1 });
      } else {
        // TeleASR 快出字
        const r = await sfStt(p.wav, 'TeleAI/TeleSpeechASR', sfKey);
        const text = (r.text || '').trim();
        let finalText = text;
        let tag = '';
        // SenseVoice 后台补情绪（可选）
        if (emotionOn) {
          try {
            const r2 = await sfStt(p.wav, 'FunAudioLLM/SenseVoiceSmall', sfKey);
            const { emo, clean } = senseVoiceEmotion((r2.text || '').trim());
            if (clean && clean.length >= 2) finalText = clean;
            if (emo && EMO_ZH[emo]) {
              // 声学门控：峰值太低的"生气"/峰值太高的"低落"多半是误判，不标
              if (emo === 'ANGRY' && p.feat.peak < 0.10) { /* 不标 */ }
              else if (emo === 'SAD' && p.feat.peak > 0.20) { /* 不标 */ }
              else tag = EMO_ZH[emo];
            }
          } catch { /* 情绪失败不影响文字 */ }
        }
        cb.onFinal(finalText, tag);
        addSttUsage({ teleasrSegments: 1 });
      }
    } catch (e: any) {
      cb.onError?.(`第${queue.length + 1}段识别失败: ${e.message}（跳过该段）`);
    }
    p.state = 'queued'; // 标记用，实际已完成
  }

  ec.setStop(async () => {
    stopped = true;
    if (speechActive) closeSeg(); // 收尾切最后一段
    // 等队列里的段全部跑完（最多等 30 秒）
    const t0 = Date.now();
    while ((inFlight > 0 || queue.length) && Date.now() - t0 < 30000) {
      await new Promise(r => setTimeout(r, 200));
    }
  });
}
