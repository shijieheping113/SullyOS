import React, { useEffect, useMemo, useState } from 'react';
import type { APIConfig, ApiPreset } from '../../types';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from '../../utils/apiConfigNormalize';
import { secondaryLlmConfigFromPreset } from '../../utils/secondaryLlmApi';
import { extractContent, safeResponseJson } from '../../utils/safeApi';

type Props = {
    apiConfig: APIConfig;
    apiPresets: ApiPreset[];
    updateApiConfig: (updates: Partial<APIConfig>) => void;
    addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
};

const SecondaryLlmSettings: React.FC<Props> = ({ apiConfig, apiPresets, updateApiConfig, addToast }) => {
    const [enabled, setEnabled] = useState(apiConfig.secondaryLlm?.enabled === true);
    const [url, setUrl] = useState(apiConfig.secondaryLlm?.baseUrl || '');
    const [key, setKey] = useState(apiConfig.secondaryLlm?.apiKey || '');
    const [model, setModel] = useState(apiConfig.secondaryLlm?.model || '');
    const [presetId, setPresetId] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    useEffect(() => {
        setEnabled(apiConfig.secondaryLlm?.enabled === true);
        setUrl(apiConfig.secondaryLlm?.baseUrl || '');
        setKey(apiConfig.secondaryLlm?.apiKey || '');
        setModel(apiConfig.secondaryLlm?.model || '');
    }, [
        apiConfig.secondaryLlm?.enabled,
        apiConfig.secondaryLlm?.baseUrl,
        apiConfig.secondaryLlm?.apiKey,
        apiConfig.secondaryLlm?.model,
    ]);

    const save = (nextEnabled = enabled) => {
        updateApiConfig({
            secondaryLlm: {
                enabled: nextEnabled,
                baseUrl: normalizeApiBaseUrl(url),
                apiKey: normalizeApiCredential(key),
                model: normalizeApiModel(model),
            },
        });
        setStatus('已保存');
        setTimeout(() => setStatus(''), 2000);
    };

    const loadPreset = (preset: ApiPreset) => {
        const next = secondaryLlmConfigFromPreset(preset);
        setPresetId(preset.id);
        setEnabled(true);
        setUrl(next.baseUrl);
        setKey(next.apiKey);
        setModel(next.model);
        setTestResult(null);
        addToast(`已把「${preset.name}」填入辅助 API；记得点保存`, 'info');
    };

    const toggle = () => {
        const next = !enabled;
        setEnabled(next);
        if (!next) {
            updateApiConfig({
                secondaryLlm: {
                    baseUrl: '',
                    apiKey: '',
                    model: '',
                    ...apiConfig.secondaryLlm,
                    enabled: false,
                },
            });
            setStatus('已关闭');
        } else if (normalizeApiBaseUrl(url) && normalizeApiCredential(key) && normalizeApiModel(model)) {
            save(true);
        } else {
            setStatus('请填写 URL、Key 和 Model');
        }
    };

    const testConnection = async () => {
        const base = normalizeApiBaseUrl(url);
        const apiKey = normalizeApiCredential(key);
        const m = normalizeApiModel(model);
        if (!base || !apiKey || !m) {
            setTestResult('❌ 请先填写完整');
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${base}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: m,
                    stream: false,
                    messages: [{ role: 'user', content: 'ping' }],
                }),
            });
            if (!res.ok) {
                const t = await res.text().catch(() => '');
                setTestResult(`❌ HTTP ${res.status}: ${t.slice(0, 80)}`);
                return;
            }
            const data = await safeResponseJson(res);
            const reply = extractContent(data);
            setTestResult(`✅ 连接成功 — ${reply.slice(0, 40)}`);
        } catch (e: unknown) {
            setTestResult(`❌ ${e instanceof Error ? e.message : '失败'}`);
        } finally {
            setTesting(false);
        }
    };

    const activePresetId = useMemo(() => presetId, [presetId]);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-bold text-slate-600">启用辅助 API</div>
                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            供猫儿修格式等小任务共用；与主聊天 API 分开计费。
                        </p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        onClick={toggle}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-violet-500' : 'bg-slate-200'}`}
                    >
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">从模型预设载入</label>
                    <span className="text-[9px] text-slate-300">不切主 API</span>
                </div>
                {apiPresets.length > 0 ? (
                    <div className="flex gap-2 flex-wrap">
                        {apiPresets.map(preset => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => loadPreset(preset)}
                                className={`max-w-full px-3 py-1.5 rounded-lg border text-[11px] font-medium truncate ${
                                    activePresetId === preset.id
                                        ? 'bg-violet-100 border-violet-200 text-violet-700'
                                        : 'bg-white border-slate-200 text-slate-500'
                                }`}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-[10px] text-slate-400">先在上方 API 配置保存预设，或手动填写。</p>
                )}
            </div>

            <div className={`space-y-3 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
                <input
                    type="text"
                    value={url}
                    onChange={e => { setUrl(e.target.value); setPresetId(null); }}
                    placeholder="https://.../v1"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
                <input
                    type="password"
                    value={key}
                    onChange={e => { setKey(e.target.value); setPresetId(null); }}
                    placeholder="API Key"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
                <input
                    type="text"
                    value={model}
                    onChange={e => { setModel(e.target.value); setPresetId(null); }}
                    placeholder="model id"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={testConnection}
                        disabled={testing}
                        className="py-2.5 rounded-xl border border-violet-200 text-violet-600 text-sm font-medium disabled:opacity-50"
                    >
                        {testing ? '测试中…' : '测试连接'}
                    </button>
                    <button
                        type="button"
                        onClick={() => save()}
                        className="py-2.5 rounded-xl bg-violet-500 text-white text-sm font-bold"
                    >
                        保存
                    </button>
                </div>
            </div>
            {status && <p className="text-[11px] text-center text-violet-600">{status}</p>}
            {testResult && (
                <p className={`text-xs px-3 py-2 rounded-xl ${testResult.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {testResult}
                </p>
            )}
        </div>
    );
};

export default SecondaryLlmSettings;
