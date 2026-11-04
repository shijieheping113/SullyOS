import React, { useEffect, useRef, useState } from 'react';
import type { CharacterProfile, ApiPreset, APIConfig } from '../../types';
import { isEmotionFeatureOn } from '../../utils/scheduleFeature';
import './FateSettingsViews.css';

export interface FateEmotionViewProps {
    char: CharacterProfile;
    apiPresets: ApiPreset[];
    onSave: (config: NonNullable<CharacterProfile['emotionConfig']>) => void;
    onClearBuffs: () => void;
    onAddApiPreset?: (name: string, config: APIConfig) => void;
    isBusy?: boolean;
}

export default function FateEmotionView({ char, apiPresets, onSave, onClearBuffs, onAddApiPreset, isBusy = false }: FateEmotionViewProps) {
    const currentCharacter = useRef(char.id);
    currentCharacter.current = char.id;
    const readApi = () => ({ baseUrl: char.emotionConfig?.api?.baseUrl || '', apiKey: char.emotionConfig?.api?.apiKey || '', model: char.emotionConfig?.api?.model || '' });
    const [api, setApi] = useState(readApi);
    const [dirty, setDirty] = useState(false);
    const [picker, setPicker] = useState(false);
    const [query, setQuery] = useState('');
    const [presetName, setPresetName] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [saving, setSaving] = useState(false);
    const emotionOn = isEmotionFeatureOn(char);
    const busy = isBusy || saving;
    useEffect(() => { setApi(readApi()); setDirty(false); setPicker(false); setQuery(''); setPresetName(null); setError(''); setNotice(''); setSaving(false); }, [char.id]);
    const presets = apiPresets.filter(preset => `${preset.name} ${preset.config.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    const selectedPreset = apiPresets.find(preset => preset.config.baseUrl === api.baseUrl && preset.config.apiKey === api.apiKey && preset.config.model === api.model);
    const modelLabel = selectedPreset?.name || api.model || (api.baseUrl || api.apiKey ? '未填写模型' : '主模型');
    const completeApi = () => {
        const values = { baseUrl: api.baseUrl.trim(), apiKey: api.apiKey.trim(), model: api.model.trim() };
        if (Object.values(values).some(Boolean) && !Object.values(values).every(Boolean)) { setError('请完整填写情绪模型的 URL、Key 和模型名称，或全部清空。'); return null; }
        return values;
    };
    const perform = async (operation: () => void, success: string, failure = '保存失败，填写内容还在，请重试。') => {
        const charId = char.id;
        setSaving(true); setError(''); setNotice('');
        try { await operation(); if (currentCharacter.current !== charId) return false; setNotice(success); return true; }
        catch { if (currentCharacter.current === charId) setError(failure); return false; }
        finally { if (currentCharacter.current === charId) setSaving(false); }
    };
    return <section className="fate-settings-view" aria-label="情绪设置">
        <header className="fate-settings-heading"><h2>情绪底色</h2><button type="button" className="fate-settings-switch" role="switch" aria-label="情绪独立开关" aria-checked={emotionOn} disabled={busy} onClick={() => { void perform(() => onSave({ ...char.emotionConfig, enabled: !emotionOn }), emotionOn ? '情绪已关闭，日程保持不变。' : '情绪已开启，日程保持不变。'); }}><span /></button></header>
        <p className="fate-settings-meta">{emotionOn ? '情绪已开启' : '情绪已关闭，不再生成或使用情绪状态'}{dirty ? ' · 模型尚未保存' : ''}</p>
        {error && <p role="alert" className="fate-settings-error">{error}</p>}{notice && <p role="status" className="fate-settings-meta">{notice}</p>}
        <div className="fate-settings-section">
            <div className="fate-settings-summary"><h3>情绪专用模型</h3><span className="fate-settings-meta">全部留空，用主模型</span></div>
            <button type="button" className="fate-settings-preset-trigger" aria-label="搜索 / 选择模型预设" aria-expanded={picker} disabled={busy} onClick={() => setPicker(!picker)}>搜索 / 选择模型预设<span>{modelLabel}</span></button>
            {picker && <div className="fate-settings-picker"><label className="fate-settings-field">搜索预设<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="名称或模型名称" /></label><div className="fate-settings-preset-list">{presets.map(preset => <button type="button" key={preset.id} disabled={busy} onClick={() => { setApi({ baseUrl: preset.config.baseUrl, apiKey: preset.config.apiKey, model: preset.config.model }); setDirty(true); setPicker(false); setError(''); setNotice('预设已载入，保存后生效。'); }}><span>{preset.name}</span><span className="fate-settings-meta">{preset.config.model || '未填写模型'}</span></button>)}{!presets.length && <p className="fate-settings-empty">没有匹配的预设。</p>}</div></div>}
            <div className="fate-settings-actions"><button type="button" disabled={busy} onClick={() => { setApi(readApi()); setDirty(false); setError(''); setNotice('保留当前已保存的模型。'); }}>保留当前值</button><button type="button" disabled={busy} onClick={() => { setApi({ baseUrl: '', apiKey: '', model: '' }); setDirty(true); setError(''); setNotice('保存后使用主模型。'); }}>留空用主模型</button></div>
            {(['baseUrl', 'apiKey', 'model'] as const).map((field, index) => <label className="fate-settings-field" key={field}>{['URL', 'Key', '模型名称'][index]}<input type={field === 'apiKey' ? 'password' : 'text'} autoComplete={field === 'apiKey' ? 'new-password' : 'off'} value={api[field]} disabled={busy} onChange={event => { setApi({ ...api, [field]: event.target.value }); setDirty(true); setNotice(''); }} /></label>)}
            <div className="fate-settings-actions"><button type="button" className="fate-settings-primary" disabled={busy || !dirty} onClick={async () => { const values = completeApi(); if (!values) return; if (await perform(() => onSave({ enabled: emotionOn, api: values.baseUrl ? values : undefined }), '情绪模型已保存。')) setDirty(false); }}>{dirty ? '保存情绪模型' : '情绪模型已保存'}</button>{onAddApiPreset && <button type="button" disabled={busy} onClick={() => setPresetName(presetName === null ? '' : null)}>保存为预设</button>}</div>
            {presetName !== null && onAddApiPreset && <div className="fate-settings-editor"><label className="fate-settings-field">预设名称<input value={presetName} disabled={busy} onChange={event => setPresetName(event.target.value)} /></label><button type="button" disabled={busy} onClick={async () => {
                const name = presetName.trim(); if (!name) { setError('请填写预设名称。'); return; }
                if (apiPresets.some(preset => preset.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { setError('预设名称重复了，请换一个名称。'); return; }
                const values = completeApi(); if (!values) return; if (!values.baseUrl) { setError('保存预设需要完整填写 URL、Key 和模型名称。'); return; }
                if (await perform(() => onAddApiPreset(name, values), '模型预设已保存，角色模型仍需单独保存。')) setPresetName(null);
            }}>确认保存预设</button></div>}
        </div>
        <div className="fate-settings-section"><div className="fate-settings-summary"><h3>当前情绪</h3>{!!char.activeBuffs?.length && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`清除${char.name}的全部 ${char.activeBuffs?.length} 个当前情绪？清除后无法恢复。`)) void perform(onClearBuffs, '当前情绪已清除。', '清除情绪失败，请重试。'); }}>清除情绪</button>}</div>
            {char.activeBuffs?.length ? <div className="fate-settings-buffs">{char.activeBuffs.map(buff => <div className="fate-settings-buff" key={buff.id}><div><span>{buff.emoji} {buff.label}</span>{buff.description && <p className="fate-settings-meta">{buff.description}</p>}</div><span className="fate-settings-meta" aria-label={`强度 ${buff.intensity} / 3`}>强度 {buff.intensity} / 3</span></div>)}</div> : <p className="fate-settings-empty">还没有情绪，聊聊天再来看看。</p>}
        </div>
    </section>;
}
