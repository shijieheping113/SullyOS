import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { APIConfig, ApiPreset, CharacterProfile } from '../../types';
import type { FateFactor } from '../../utils/fateFactors';
import { defaultFateSettings, loadFateSettings, saveFateSettings, type FateSettings, type FateTendency } from '../../utils/fateSettings';
import './FateSettingsViews.css';
import FateTarotArt, { FatePatronArt } from './FateTarotArt';
import FateOverlay from './FateOverlay';
import './FateLibraryView.css';

export interface FateLibraryViewProps {
    char: CharacterProfile;
    onChange: (patch: Partial<CharacterProfile>) => void;
    apiPresets?: ApiPreset[];
    onAddApiPreset?: (name: string, config: APIConfig) => void;
    isBusy?: boolean;
}
type Kind = 'factors' | 'tendencies';
type Draft = { id?: string; name: string; meaning: string; category: string };
const PAGE_SIZE = 6;

export default function FateLibraryView({ char, onChange, apiPresets = [], onAddApiPreset, isBusy = false }: FateLibraryViewProps) {
    const currentCharacter = useRef(char.id);
    currentCharacter.current = char.id;
    const readApi = () => ({ baseUrl: char.scheduleApi?.baseUrl || '', apiKey: char.scheduleApi?.apiKey || '', model: char.scheduleApi?.model || '' });
    const [settings, setSettings] = useState(() => loadFateSettings(char.id));
    const [kind, setKind] = useState<Kind>('factors');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);
    const [categoriesOpen, setCategoriesOpen] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [api, setApi] = useState(readApi);
    const [apiDirty, setApiDirty] = useState(false);
    const [picker, setPicker] = useState(false);
    const [presetQuery, setPresetQuery] = useState('');
    const [presetName, setPresetName] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const busy = isBusy || saving;

    useEffect(() => {
        setSettings(loadFateSettings(char.id)); setKind('factors'); setQuery(''); setCategory(''); setStatus('all');
        setPage(1); setCategoriesOpen(false); setExpanded(null); setDraft(null); setError(''); setNotice('');
        setApi(readApi()); setApiDirty(false); setPicker(false); setPresetQuery(''); setPresetName(null); setSaving(false);
    }, [char.id]);
    useEffect(() => { setPage(1); }, [kind, query, category, status]);
    const disabledField = kind === 'factors' ? 'disabledFactorIds' : 'disabledTendencyIds';
    const disabledIds = settings[disabledField];
    const noun = kind === 'factors' ? '因子' : '倾向';
    const categories = useMemo(() => Array.from(new Set(settings.factors.map(item => item.category))).sort(), [settings.factors]);
    const filtered = useMemo(() => settings[kind].filter(item => {
        const itemCategory = 'category' in item ? String(item.category) : '';
        const disabled = disabledIds.includes(item.id);
        return `${item.name} ${item.meaning} ${itemCategory}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
            && (!category || kind === 'tendencies' || itemCategory === category)
            && (status === 'all' || (status === 'disabled' ? disabled : !disabled));
    }), [settings, kind, query, category, status, disabledIds]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const selected = settings[kind].find(item => item.id === expanded);
    const presets = apiPresets.filter(preset => `${preset.name} ${preset.config.model}`.toLocaleLowerCase().includes(presetQuery.trim().toLocaleLowerCase()));
    const selectedPreset = apiPresets.find(preset => preset.config.baseUrl === api.baseUrl && preset.config.apiKey === api.apiKey && preset.config.model === api.model);
    const modelLabel = selectedPreset?.name || api.model || (api.baseUrl || api.apiKey ? '未填写模型' : '主模型');
    const completeApi = () => {
        const values = { baseUrl: api.baseUrl.trim(), apiKey: api.apiKey.trim(), model: api.model.trim() };
        if (Object.values(values).some(Boolean) && !Object.values(values).every(Boolean)) { setError('请完整填写日程模型的 URL、Key 和模型名称，或全部清空。'); return null; }
        return values;
    };
    const persist = (next: FateSettings) => {
        try { saveFateSettings(char.id, next); setSettings(next); setError(''); setNotice('已保存，只影响后续生成。'); return true; }
        catch { setError('保存失败，填写内容还在。请检查浏览器存储空间后重试。'); setNotice(''); return false; }
    };
    const leaveDraft = () => !busy && (!draft || window.confirm('放弃尚未保存的条目内容？'));
    const closeOverlay = () => { if (leaveDraft()) { setDraft(null); setExpanded(null); setError(''); } };
    const saveEntry = () => {
        if (!draft || busy) return;
        const name = draft.name.trim(); const meaning = draft.meaning.trim();
        if (!name || !meaning) { setError('名称和含义都要填写。'); return; }
        if (settings[kind].some(item => item.id !== draft.id && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
            setError('名称重复了，请换一个名称。'); return;
        }
        if (!window.confirm(`确认保存${noun}：${name}？`)) return;
        const id = draft.id || `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
        const entry = { id, name, meaning, ...(kind === 'factors' ? { category: draft.category.trim() || '自定义' } : {}) };
        const next = { ...settings, [kind]: draft.id ? settings[kind].map(item => item.id === id ? entry : item) : [...settings[kind], entry] } as FateSettings;
        if (persist(next)) { setDraft(null); setExpanded(id); }
    };
    const toggle = (item: FateTendency) => {
        const disabled = disabledIds.includes(item.id);
        if (busy || !window.confirm(`${disabled ? '恢复启用' : '停用'}${noun}：${item.name}？只影响后续生成。`)) return;
        persist({ ...settings, [disabledField]: disabled ? disabledIds.filter(id => id !== item.id) : [...disabledIds, item.id] });
    };
    const restore = () => {
        if (busy || !leaveDraft() || !window.confirm(`恢复全部内置${noun}的名称、含义和启用状态？自定义条目与自定义启停状态都会保留。`)) return;
        const defaults = defaultFateSettings(); const builtinIds = new Set(defaults[kind].map(item => item.id));
        const next = { ...settings, [kind]: [...defaults[kind], ...settings[kind].filter(item => !builtinIds.has(item.id))], [disabledField]: disabledIds.filter(id => !builtinIds.has(id)) } as FateSettings;
        if (persist(next)) { setDraft(null); setExpanded(null); }
    };
    const editor = () => draft && <div className="fate-book-editor">
        <label className="fate-book-field">名称<input value={draft.name} disabled={busy} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        {kind === 'factors' && <label className="fate-book-field">分类<input value={draft.category} disabled={busy} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>}
        <label className="fate-book-field">含义<textarea rows={4} value={draft.meaning} disabled={busy} onChange={event => setDraft({ ...draft, meaning: event.target.value })} /></label>
        <div className="fate-book-actions"><button type="button" disabled={busy} onClick={saveEntry}>保存条目</button><button type="button" disabled={busy} onClick={() => { if (leaveDraft()) { setDraft(null); setError(''); } }}>取消编辑</button></div>
    </div>;

    return <section className="fate-settings-view fate-book-root" aria-label="命运资料库">
        <header className="fate-settings-heading"><h2>命运牌册</h2><span className="fate-settings-meta">{settings.factors.length} 张因子牌</span></header>
        <details className="fate-settings-model fate-book-model" open={apiDirty || picker || presetName !== null || undefined}>
            <summary>日程专用模型<span>{modelLabel}</span>{apiDirty ? ' · 未保存' : ''}</summary>
            <div className="fate-settings-summary"><h3>日程专用模型</h3><span className="fate-settings-meta">全部留空，用主模型</span></div>
            <button type="button" className="fate-settings-preset-trigger" aria-label="搜索 / 选择模型预设" aria-expanded={picker} disabled={busy} onClick={() => setPicker(!picker)}>搜索 / 选择模型预设<span>{modelLabel}</span></button>
            {picker && <div className="fate-settings-picker"><label className="fate-settings-field">搜索预设<input type="search" value={presetQuery} onChange={event => setPresetQuery(event.target.value)} placeholder="名称或模型名称" /></label><div className="fate-settings-preset-list">{presets.map(preset => <button type="button" key={preset.id} disabled={busy} onClick={() => { setApi({ baseUrl: preset.config.baseUrl, apiKey: preset.config.apiKey, model: preset.config.model }); setApiDirty(true); setPicker(false); setError(''); setNotice('预设已载入，保存后生效。'); }}><span>{preset.name}</span><span className="fate-settings-meta">{preset.config.model || '未填写模型'}</span></button>)}{!presets.length && <p className="fate-settings-empty">没有匹配的预设。</p>}</div></div>}
            <div className="fate-settings-actions"><button type="button" disabled={busy} onClick={() => { setApi(readApi()); setApiDirty(false); setError(''); setNotice('保留当前已保存的模型。'); }}>保留当前值</button><button type="button" disabled={busy} onClick={() => { setApi({ baseUrl: '', apiKey: '', model: '' }); setApiDirty(true); setError(''); setNotice('保存后使用主模型。'); }}>留空用主模型</button></div>
            {(['baseUrl', 'apiKey', 'model'] as const).map((field, index) => <label key={field} className="fate-settings-field">{['URL', 'Key', '模型名称'][index]}<input type={field === 'apiKey' ? 'password' : 'text'} autoComplete={field === 'apiKey' ? 'new-password' : 'off'} value={api[field]} disabled={busy} onChange={event => { setApi({ ...api, [field]: event.target.value }); setApiDirty(true); setNotice(''); }} /></label>)}
            <div className="fate-settings-actions"><button type="button" className="fate-settings-primary" disabled={busy || !apiDirty} onClick={async () => {
                const values = completeApi(); if (!values) return;
                const charId = char.id; setSaving(true); setError('');
                try { await onChange({ scheduleApi: values.baseUrl ? values : undefined }); if (charId === currentCharacter.current) { setApiDirty(false); setError(''); setNotice('日程模型已保存。'); } }
                catch { if (charId === currentCharacter.current) setError('日程模型保存失败，填写内容还在，请重试。'); } finally { if (charId === currentCharacter.current) setSaving(false); }
            }}>{apiDirty ? '保存日程模型' : '日程模型已保存'}</button>{onAddApiPreset && <button type="button" disabled={busy} onClick={() => setPresetName(presetName === null ? '' : null)}>保存为预设</button>}</div>
            {presetName !== null && onAddApiPreset && <div className="fate-settings-editor"><label className="fate-settings-field">预设名称<input value={presetName} disabled={busy} onChange={event => setPresetName(event.target.value)} /></label><button type="button" disabled={busy} onClick={async () => {
                const name = presetName.trim(); if (!name) { setError('请填写预设名称。'); return; }
                if (apiPresets.some(preset => preset.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { setError('预设名称重复了，请换一个名称。'); return; }
                const values = completeApi(); if (!values) return; if (!values.baseUrl) { setError('保存预设需要完整填写 URL、Key 和模型名称。'); return; }
                const charId = char.id; setSaving(true); setError('');
                try { await onAddApiPreset(name, values); if (charId === currentCharacter.current) { setPresetName(null); setNotice('模型预设已保存，角色模型仍需单独保存。'); } }
                catch { if (charId === currentCharacter.current) setError('保存失败，填写内容还在，请重试。'); }
                finally { if (charId === currentCharacter.current) setSaving(false); }
            }}>确认保存预设</button></div>}
        </details>
        <div className="fate-settings-tabs fate-book-tabs" aria-label="资料库种类">{(['factors', 'tendencies'] as const).map(value => <button type="button" key={value} disabled={busy} aria-pressed={kind === value} onClick={() => { if (kind !== value && leaveDraft()) { setKind(value); setDraft(null); setExpanded(null); setCategory(''); setCategoriesOpen(false); setError(''); setNotice(''); } }}>{value === 'factors' ? '因子' : '倾向'} · {settings[value].length}</button>)}</div>
        <div className="fate-settings-toolbar">
            <label className="fate-settings-search"><span className="fate-settings-sr">搜索{noun}</span><input type="search" value={query} placeholder="搜索名称、含义" onChange={event => setQuery(event.target.value)} /></label>
            <div className="fate-settings-filters">
                {kind === 'factors' && <button className="fate-book-category-trigger" type="button" aria-expanded={categoriesOpen} onClick={() => setCategoriesOpen(!categoriesOpen)}>分类 · {category || '全部分类'}</button>}
                <label><span className="fate-settings-sr">启用状态</span><select aria-label="启用状态" value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select></label>
            </div>
        </div>
        {kind === 'factors' && categoriesOpen && <nav className="fate-book-categories" aria-label="选择牌册分类">
            <button type="button" aria-pressed={!category} onClick={() => { setCategory(''); setCategoriesOpen(false); }}>全部分类</button>
            {categories.map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setCategoriesOpen(false); }}>{value}</button>)}
        </nav>}
        <div className="fate-settings-summary"><span>匹配 {filtered.length} 张</span><button type="button" disabled={busy} onClick={() => { if (leaveDraft()) { setDraft({ name: '', meaning: '', category: '自定义' }); setExpanded(null); setError(''); setNotice(''); } }}>添加{noun}</button></div>
        {!selected && !draft && error && <p role="alert" className="fate-settings-error">{error}</p>}{notice && <p role="status" className="fate-settings-meta">{notice}</p>}
        <div className="fate-book-page" key={`${kind}-${currentPage}-${query}-${category}-${status}`} aria-label={`第${currentPage}页牌面`}>{filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(item => <button type="button" className="fate-book-card" key={item.id} aria-label={`查看${item.name}`} onClick={event => { event.currentTarget.focus(); setExpanded(item.id); setError(''); }}>
            {kind === 'tendencies' ? <FatePatronArt tendencyId={item.id} /> : <FateTarotArt factor={item} />}<span className="fate-book-name">{item.name}</span>{disabledIds.includes(item.id) && <span className="fate-book-meta">已停用</span>}
        </button>)}</div>
        {!filtered.length && <p className="fate-settings-empty">没有找到，换个词试试。</p>}
        <nav className="fate-book-paging" aria-label="牌册翻页"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span aria-live="polite">第 {currentPage} / {totalPages} 页</span><button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>
        <div className="fate-settings-actions"><button type="button" disabled={busy} onClick={restore}>恢复内置{noun}</button><span className="fate-settings-meta">自定义条目会保留</span></div>
        {(selected || draft) && <FateOverlay title={draft ? `${draft.id ? '编辑' : '添加'}${noun}` : selected!.name} className="fate-book-overlay" onClose={closeOverlay}>
            {error && <p className="fate-book-error" role="alert">{error}</p>}
            {draft ? editor() : selected && <>
                <button type="button" className="fate-book-card fate-book-enlarged" aria-label={`放回${selected.name}`} disabled={busy} onClick={closeOverlay}>{kind === 'tendencies' ? <FatePatronArt tendencyId={selected.id} /> : <FateTarotArt factor={selected} />}<span className="fate-book-name">{selected.name}</span><span className="fate-book-meta">点击放回</span></button>
                <p className="fate-book-meaning">{selected.meaning}</p>
                <p className="fate-book-meta">{'category' in selected ? String(selected.category) : '倾向'} · {disabledIds.includes(selected.id) ? '已停用' : '已启用'}</p>
                <div className="fate-book-actions"><button type="button" disabled={busy} onClick={() => { setDraft({ ...selected, category: (selected as FateFactor).category || '自定义' }); setError(''); }}>编辑{noun}</button><button type="button" disabled={busy} onClick={() => toggle(selected)}>{disabledIds.includes(selected.id) ? '恢复启用' : '停用'}{selected.name}</button></div>
            </>}
        </FateOverlay>}
    </section>;
}
