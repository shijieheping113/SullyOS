import React, { useEffect, useMemo, useState } from 'react';
import type { APIConfig, ApiPreset, VideoApiDetail } from '../../types';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from '../../utils/apiConfigNormalize';
import { extractModelIds } from '../../utils/modelList';
import { safeResponseJson } from '../../utils/safeApi';
import {
  DEFAULT_VIDEO_API_BASE,
  DEFAULT_VIDEO_API_MODEL,
  VIDEO_API_MAX_FRAMES,
  VIDEO_API_MAX_FPS,
  VIDEO_API_PRESETS,
  describeVideoWithVideoApi,
  formatVideoDetailLabel,
  getVideoApiUsage,
  resetVideoApiUsage,
  videoApiUsageSummary,
  effectiveVideoFrames,
  loadBuiltInVideoApiTestFile,
  matchVideoPresetId,
  normalizeVideoApiConfig,
  videoApiConfigFromPreset,
  videoApiPresetLabel,
} from '../../utils/videoApi';

const VIDEO_MODEL_LIST_STORAGE_KEY = 'os_video_available_models';

const readStoredVideoModels = (): string[] => {
  try {
    const raw = localStorage.getItem(VIDEO_MODEL_LIST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const CUSTOM_PRESET_ID = 'custom';

interface Props {
  apiConfig: APIConfig;
  apiPresets: ApiPreset[];
  updateApiConfig: (patch: Partial<APIConfig>) => void;
  addToast: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

const VideoUnderstandingSettings: React.FC<Props> = ({ apiConfig, apiPresets, updateApiConfig, addToast }) => {
  const saved = normalizeVideoApiConfig(apiConfig.videoApi);
  const [enabled, setEnabled] = useState(saved.enabled);
  const [url, setUrl] = useState(saved.baseUrl);
  const [key, setKey] = useState(saved.apiKey);
  const [model, setModel] = useState(saved.model);
  const [detail, setDetail] = useState<VideoApiDetail>(saved.detail);
  const [fps, setFps] = useState(saved.fps);
  const [maxFrames, setMaxFrames] = useState(saved.maxFrames);
  const [maxDurationSec, setMaxDurationSec] = useState(saved.maxDurationSec);
  const [maxSizeMB, setMaxSizeMB] = useState(saved.maxSizeMB);
  const [statusMsg, setStatusMsg] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>(readStoredVideoModels);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() =>
    matchVideoPresetId(saved) ?? CUSTOM_PRESET_ID);
  const [usageStats, setUsageStats] = useState(() => getVideoApiUsage());

  useEffect(() => {
    const cfg = normalizeVideoApiConfig(apiConfig.videoApi);
    setEnabled(cfg.enabled);
    setUrl(cfg.baseUrl);
    setKey(cfg.apiKey);
    setModel(cfg.model);
    setDetail(cfg.detail);
    setFps(cfg.fps);
    setMaxFrames(cfg.maxFrames);
    setMaxDurationSec(cfg.maxDurationSec);
    setMaxSizeMB(cfg.maxSizeMB);
    setSelectedPresetId(matchVideoPresetId(cfg) ?? CUSTOM_PRESET_ID);
  }, [apiConfig.videoApi]);

  const buildDraft = (enabledOverride = enabled) => normalizeVideoApiConfig({
    enabled: enabledOverride,
    baseUrl: url,
    apiKey: key,
    model,
    detail,
    fps,
    maxFrames,
    maxDurationSec,
    maxSizeMB,
  });

  const presetLabel = useMemo(() => videoApiPresetLabel(buildDraft()), [enabled, url, key, model, detail, fps, maxFrames, maxDurationSec, maxSizeMB]);

  const resolveCredentials = (cfg: APIConfig) => {
    const v = normalizeVideoApiConfig(cfg.videoApi);
    const apiKey = v.apiKey.trim()
      || cfg.visionApi?.apiKey?.trim()
      || cfg.sttApi?.sfApiKey?.trim()
      || '';
    return {
      baseUrl: v.baseUrl.trim() || DEFAULT_VIDEO_API_BASE,
      apiKey,
      model: v.model.trim() || DEFAULT_VIDEO_API_MODEL,
    };
  };

  const credsReady = useMemo(() => {
    const draft: APIConfig = { ...apiConfig, videoApi: buildDraft(true) };
    const creds = resolveCredentials(draft);
    return !!creds.baseUrl && !!creds.model && !!creds.apiKey;
  }, [apiConfig, enabled, url, key, model, detail, fps, maxFrames, maxDurationSec, maxSizeMB]);

  const applyPreset = (preset: typeof VIDEO_API_PRESETS[number]) => {
    setDetail(preset.detail);
    setFps(preset.fps);
    setMaxFrames(preset.maxFrames);
    setSelectedPresetId(preset.id);
    setTestResult(null);
  };

  const selectCustomMode = () => {
    setSelectedPresetId(CUSTOM_PRESET_ID);
    setTestResult(null);
  };

  const isCustomMode = selectedPresetId === CUSTOM_PRESET_ID;
  const draftSampling = useMemo(() => buildDraft(), [enabled, url, key, model, detail, fps, maxFrames, maxDurationSec, maxSizeMB]);
  const effectiveFramesPreview = useMemo(
    () => effectiveVideoFrames(60, draftSampling.fps, draftSampling.maxFrames),
    [draftSampling.fps, draftSampling.maxFrames],
  );

  useEffect(() => {
    if (enabled) setUsageStats(getVideoApiUsage());
  }, [enabled]);

  const PRESET_CHIP_LABEL: Record<string, string> = {
    short_cheap: '省钱',
    recommended: '推荐',
    half_minute: '半分钟',
    minute_full: '看全',
    minute_dense: '更密',
    action: '动作',
  };

  const handleSave = (enabledOverride = enabled) => {
    const next = buildDraft(enabledOverride);
    if (next.enabled && (!next.baseUrl || !next.model)) {
      addToast('开启视频理解前，请至少填写 URL 和 Model', 'error');
      return;
    }
    const merged: APIConfig = { ...apiConfig, videoApi: next };
    if (next.enabled && !resolveCredentials(merged).apiKey) {
      addToast('请填写视频 Key，或在识图/语音里填好硅基 Key', 'error');
      return;
    }
    updateApiConfig({ videoApi: next });
    setStatusMsg(next.enabled ? '视频理解已接入' : '已关闭视频理解');
    setTimeout(() => setStatusMsg(''), 2200);
  };

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (!next) {
      updateApiConfig({ videoApi: { ...buildDraft(false), enabled: false } });
      setStatusMsg('已关闭视频理解');
    } else if (normalizeApiBaseUrl(url) && normalizeApiModel(model) && resolveCredentials({ ...apiConfig, videoApi: buildDraft(true) }).apiKey) {
      handleSave(true);
    } else {
      setStatusMsg('请填写 URL、Model 和 Key 后保存');
    }
  };

  const loadApiPreset = (preset: ApiPreset) => {
    const next = videoApiConfigFromPreset(preset, true);
    setEnabled(true);
    setUrl(next.baseUrl);
    setKey(next.apiKey);
    setModel(next.model || DEFAULT_VIDEO_API_MODEL);
    setTestResult(null);
    addToast(`已把「${preset.name}」填入视频理解；点保存后生效`, 'info');
  };

  const fetchModels = async () => {
    const baseUrl = normalizeApiBaseUrl(url);
    const apiKey = normalizeApiCredential(key)
      || normalizeApiCredential(apiConfig.visionApi?.apiKey)
      || normalizeApiCredential(apiConfig.sttApi?.sfApiKey);
    if (!baseUrl) { setStatusMsg('请先填写 URL'); return; }
    setLoadingModels(true);
    setTestResult(null);
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const models = extractModelIds(await safeResponseJson(response));
      setAvailableModels(models);
      localStorage.setItem(VIDEO_MODEL_LIST_STORAGE_KEY, JSON.stringify(models));
      setStatusMsg(`获取到 ${models.length} 个模型`);
    } catch (e: any) {
      setStatusMsg(`拉取失败：${e?.message || '未知错误'}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTestVideoApi = async () => {
    const draft: APIConfig = { ...apiConfig, videoApi: buildDraft(true) };
    const creds = resolveCredentials(draft);
    if (!creds.baseUrl) {
      setTestResult('❌ 请先填写 URL');
      addToast('请先填写 URL', 'error');
      return;
    }
    if (!creds.model) {
      setTestResult('❌ 请先填写 Model');
      addToast('请先填写 Model', 'error');
      return;
    }
    if (!creds.apiKey) {
      setTestResult('❌ 请先填写 Key，或在识图/语音里填好硅基 Key');
      addToast('还没填 Key', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    addToast('正在用内置短片测视频模型…', 'info');
    try {
      const file = await loadBuiltInVideoApiTestFile();
      const result = await describeVideoWithVideoApi(file, '内置测试：纯色小短片', draft);
      setUsageStats(getVideoApiUsage());
      const desc = result.description;
      setTestResult(`✅ 视频模型已通 — ${desc.slice(0, 120)}${desc.length > 120 ? '…' : ''}`);
    } catch (e: any) {
      const msg = e?.message || '未知错误';
      setTestResult(`❌ 视频模型不通：${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const detailOptions: { value: VideoApiDetail; label: string; hint: string }[] = [
    { value: 'auto', label: '自动', hint: '交给模型，费用难估' },
    { value: 'low', label: '省流量', hint: '更省、更快' },
    { value: 'high', label: '更清晰', hint: '动作更清楚、更费' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <p className="text-[10px] text-slate-400 leading-relaxed flex-1">
          私聊发本地视频，硅基 video_url 理解；原片不落库。发成功后记本机费用。
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-violet-500' : 'bg-slate-200'}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className={`rounded-2xl border border-violet-100/80 bg-white/80 p-3 space-y-2.5 transition-opacity ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <label className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">抽帧方案</label>
        <div className="flex flex-wrap gap-1.5">
          {VIDEO_API_PRESETS.map(p => {
            const selected = !isCustomMode && selectedPresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                title={p.suitable}
                onClick={() => applyPreset(p)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  selected
                    ? 'border-violet-400 bg-violet-500 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200'
                }`}
              >
                {PRESET_CHIP_LABEL[p.id] ?? p.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={selectCustomMode}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              isCustomMode
                ? 'border-violet-400 bg-violet-500 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200'
            }`}
          >
            自定义
          </button>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <span className="font-semibold text-slate-600">{presetLabel}</span>
          <span className="text-slate-300 mx-1">·</span>
          {formatVideoDetailLabel(detail)} · {fps} fps · 最多 {maxFrames} 帧
          <span className="text-slate-300 mx-1">·</span>
          60 秒约送 <span className="font-mono">{effectiveFramesPreview}</span> 帧
        </p>

        {isCustomMode && (
          <div className="pt-1 space-y-2 border-t border-slate-100">
            <div className="flex flex-wrap gap-1.5">
              {detailOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setDetail(opt.value); selectCustomMode(); }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
                    detail === opt.value ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-slate-400 mb-0.5 block">fps（1～{VIDEO_API_MAX_FPS}）</label>
                <input
                  type="number"
                  min={1}
                  max={VIDEO_API_MAX_FPS}
                  value={fps}
                  onChange={(e) => {
                    setFps(Math.min(VIDEO_API_MAX_FPS, Math.max(1, Number(e.target.value) || 2)));
                    selectCustomMode();
                  }}
                  className="w-full bg-white border border-slate-200/60 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 mb-0.5 block">最多帧（≤{VIDEO_API_MAX_FRAMES}）</label>
                <input
                  type="number"
                  min={1}
                  max={VIDEO_API_MAX_FRAMES}
                  value={maxFrames}
                  onChange={(e) => {
                    setMaxFrames(Math.min(VIDEO_API_MAX_FRAMES, Math.max(1, Number(e.target.value) || 16)));
                    selectCustomMode();
                  }}
                  className="w-full bg-white border border-slate-200/60 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        <details className="text-[9px] text-slate-400 leading-relaxed group">
          <summary className="cursor-pointer text-violet-600/90 font-semibold list-none [&::-webkit-details-marker]:hidden">
            帧数和「看不全」是什么关系？
          </summary>
          <p className="mt-1.5 pl-0.5">
            实际送帧 = min(时长×fps, max_frames)。25 秒点「看全」约 25 帧，「更密」约 50 帧；「半分钟快剪」适合 20～35 秒。自定义最多 {VIDEO_API_MAX_FRAMES} 帧（再高可能慢或 50507，会自动降档）。
            若【画面过程】写到片段后用括号总结、没写结尾，多半是输出字数被截断——现已按送帧加大 max_tokens 并可能自动重试。快剪仍可能漏极短镜头。
          </p>
        </details>
      </div>

      {apiPresets.length > 0 && (
        <div className="rounded-2xl border border-violet-100 bg-white/70 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <label className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">从模型预设载入</label>
            <span className="text-[9px] text-slate-300">不会切换主 API</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {apiPresets.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => loadApiPreset(preset)}
                className="max-w-full px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:border-violet-200 truncate"
                title={`${preset.name} · ${preset.config.model || '未配置模型'}`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`rounded-2xl border border-violet-100 bg-white/70 p-3 space-y-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-50'}`}>
        <label className="text-[10px] font-bold text-violet-500 uppercase tracking-widest block">连接配置</label>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
            disabled={!enabled}
            placeholder={DEFAULT_VIDEO_API_BASE}
            className="w-full bg-white/60 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all disabled:cursor-not-allowed"
            spellCheck={false}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">
            Key <span className="normal-case font-medium text-slate-400">留空则用识图 → 语音硅基</span>
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setTestResult(null); }}
            disabled={!enabled}
            autoComplete="new-password"
            placeholder="sk-..."
            className="w-full bg-white/60 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5 pl-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model</label>
            <button
              type="button"
              onClick={fetchModels}
              disabled={!enabled || loadingModels}
              className="text-[10px] text-violet-600 font-bold disabled:text-slate-300"
            >
              {loadingModels ? 'Fetching...' : '刷新模型列表'}
            </button>
          </div>
          <input
            type="text"
            value={model}
            onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
            disabled={!enabled}
            placeholder={DEFAULT_VIDEO_API_MODEL}
            className="w-full bg-white/60 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all disabled:cursor-not-allowed"
            spellCheck={false}
          />
          {availableModels.length > 0 && (
            <select
              value={model}
              disabled={!enabled}
              onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
              className="w-full mt-2 bg-white/60 border border-slate-200/60 rounded-xl px-4 py-2 text-xs font-mono disabled:cursor-not-allowed"
            >
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>

      </div>

      <div className={`rounded-2xl border border-slate-200/60 bg-white/40 p-3 grid grid-cols-2 gap-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-50'}`}>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">最长秒数</label>
            <input
              type="number"
              min={1}
              value={maxDurationSec}
              disabled={!enabled}
              onChange={(e) => setMaxDurationSec(Number(e.target.value) || 200)}
              className="w-full bg-white/60 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">最大体积 MB</label>
            <input
              type="number"
              min={1}
              value={maxSizeMB}
              disabled={!enabled}
              onChange={(e) => setMaxSizeMB(Number(e.target.value) || 30)}
              className="w-full bg-white/60 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all disabled:cursor-not-allowed"
            />
          </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleTestVideoApi}
          disabled={testing}
          className="py-3 rounded-2xl font-bold text-violet-600 border border-violet-200 bg-violet-50 active:scale-95 transition-all disabled:opacity-40"
        >
          {testing ? '测试中…' : '🎬 测试视频'}
        </button>
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={loadingModels || testing}
          className="py-3 rounded-2xl font-bold text-white shadow-lg shadow-violet-500/20 bg-violet-500 active:scale-95 transition-all disabled:opacity-50"
        >
          保存视频理解
        </button>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white/40 p-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">费用统计（本机）</div>
          <div className="text-[11px] text-slate-500 leading-relaxed">
            {usageStats.callCount ? (
              <>
                <span className="block">{videoApiUsageSummary()}</span>
                {usageStats.lastCallSummary && (
                  <span className="block text-slate-400 text-[10px] mt-0.5">最近：{usageStats.lastCallSummary}</span>
                )}
              </>
            ) : (
              <span>暂无用量——私聊发视频识别成功后会累计</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            resetVideoApiUsage();
            setUsageStats(getVideoApiUsage());
            addToast('已清零视频理解用量', 'info');
          }}
          disabled={!usageStats.callCount}
          className="shrink-0 text-[11px] font-semibold text-rose-500 hover:text-rose-600 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          清零
        </button>
      </div>

      {statusMsg && (
        <div className="text-[11px] text-center text-violet-600 bg-violet-50 px-3 py-2 rounded-xl">{statusMsg}</div>
      )}
      <p className="text-[9px] text-slate-300 px-1">
        测试会发送内置约 2 秒短片，确认 video_url 模型能通；不写入聊天。未填 Key 时可先用识图/语音里的硅基 Key。
      </p>
      {testResult && (
        <div className={`text-xs px-3 py-2 rounded-xl leading-relaxed ${
          testResult.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
        }`}>
          {testResult}
        </div>
      )}
    </div>
  );
};

export default VideoUnderstandingSettings;
