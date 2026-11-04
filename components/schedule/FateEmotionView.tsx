import React, { useEffect, useId, useRef, useState } from 'react';
import type { CharacterProfile, ApiPreset, APIConfig } from '../../types';
import { isEmotionFeatureOn } from '../../utils/scheduleFeature';
import './FateSettingsViews.css';
import { FateAstrolabe } from './FateTarotArt';
import FateOverlay from './FateOverlay';
import './FateEmotionSky.css';

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
    const [skyPage, setSkyPage] = useState(0);
    const [selection, setSelection] = useState<{ characterId: string; buffId: string | null }>(() => ({ characterId: char.id, buffId: null }));
    const detailId = useId();
    const buffs = char.activeBuffs || [];
    const pageCount = Math.max(1, Math.ceil(buffs.length / 6));
    const page = selection.characterId === char.id ? Math.min(skyPage, pageCount - 1) : 0;
    const visibleBuffs = buffs.slice(page * 6, page * 6 + 6);
    const selectedBuff = selection.characterId === char.id ? buffs.find(buff => buff.id === selection.buffId) : undefined;
    const emotionOn = isEmotionFeatureOn(char);
    const busy = isBusy || saving;
    useEffect(() => { setApi(readApi()); setDirty(false); setPicker(false); setQuery(''); setPresetName(null); setError(''); setNotice(''); setSaving(false); }, [char.id]);
    useEffect(() => { setSkyPage(0); setSelection({ characterId: char.id, buffId: null }); }, [char.id]);
    useEffect(() => {
        setSkyPage(previous => Math.min(previous, pageCount - 1));
        if (selection.characterId === char.id && selection.buffId && !buffs.some(buff => buff.id === selection.buffId)) setSelection({ characterId: char.id, buffId: null });
    }, [char.id, buffs, pageCount, selection]);
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
    return <section className="fate-settings-view fate-emotion fate-sky-view" aria-label="情绪设置">
        <header className="fate-settings-heading"><h2>情绪星盘</h2><button type="button" className="fate-settings-switch" role="switch" aria-label="情绪独立开关" aria-checked={emotionOn} disabled={busy} onClick={() => { void perform(() => onSave({ ...char.emotionConfig, enabled: !emotionOn }), emotionOn ? '情绪已关闭，日程保持不变。' : '情绪已开启，日程保持不变。'); }}><span /></button></header>
        <p className="fate-settings-meta">{emotionOn ? '情绪已开启' : '情绪已关闭，不再生成或使用情绪状态'}{dirty ? ' · 模型尚未保存' : ''}</p>
        {error && <p role="alert" className="fate-settings-error">{error}</p>}{notice && <p role="status" className="fate-settings-meta">{notice}</p>}
        <section className="fate-emotion-current fate-sky-region" aria-label="当前情绪星盘">
            <div className="fate-sky-chart">
                <div className="fate-sky-art"><FateAstrolabe /></div>
                {visibleBuffs.map((buff, index) => <button type="button" className="fate-sky-star" key={buff.id} data-slot={index} data-intensity={buff.intensity} aria-label={`${buff.label}，强度 ${buff.intensity} / 3`} aria-pressed={selectedBuff?.id === buff.id} aria-haspopup="dialog" aria-controls={selectedBuff?.id === buff.id ? detailId : undefined} onClick={event => { event.currentTarget.focus(); setSelection({ characterId: char.id, buffId: selectedBuff?.id === buff.id ? null : buff.id }); }}>
                    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" /></svg>
                    <span className="fate-sky-label">{buff.label}</span>
                </button>)}
            </div>
            <div className="fate-sky-identity"><p>{char.name}</p><span>{buffs.length} 种情绪</span></div>
            {pageCount > 1 && <nav className="fate-sky-pages" aria-label="情绪星页"><button type="button" disabled={page === 0} onClick={() => { setSkyPage(page - 1); setSelection({ characterId: char.id, buffId: null }); }}>上一星页</button><span aria-live="polite">第 {page + 1} / {pageCount} 页</span><button type="button" disabled={page === pageCount - 1} onClick={() => { setSkyPage(page + 1); setSelection({ characterId: char.id, buffId: null }); }}>下一星页</button></nav>}
            <div className="fate-sky-tools"><p className="fate-sky-hint">{buffs.length ? '点星星查看情绪' : '还没有情绪，聊聊天再来看看。'}</p>{!!buffs.length && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`清除${char.name}的全部 ${buffs.length} 个当前情绪？清除后无法恢复。`)) void perform(onClearBuffs, '当前情绪已清除。', '清除情绪失败，请重试。'); }}>清除情绪</button>}</div>
            {selectedBuff && <FateOverlay title={selectedBuff.label} className="fate-sky-window" onClose={() => setSelection({ characterId: char.id, buffId: null })}><div id={detailId} className="fate-sky-detail"><span className="fate-sky-emoji" aria-hidden="true">{selectedBuff.emoji}</span><div className="fate-sky-copy"><p className="fate-sky-description">{selectedBuff.description || '没有记录情绪描述。'}</p><div className="fate-sky-strength"><span className="fate-emotion-dots" aria-hidden="true">{[1, 2, 3].map(level => <i key={level} data-lit={level <= selectedBuff.intensity} />)}</span><span>强度 {selectedBuff.intensity} / 3</span></div></div></div></FateOverlay>}
        </section>
        <details className="fate-settings-section fate-emotion-model" open={dirty || picker || presetName !== null || undefined}>
            <summary>情绪专用模型<span>{modelLabel}</span></summary>
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
        </details>
    </section>;
}
