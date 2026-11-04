import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterProfile } from '../../types';
import type { FateFactor } from '../../utils/fateFactors';
import { defaultFateSettings, loadFateSettings, saveFateSettings, type FateSettings, type FateTendency } from '../../utils/fateSettings';
import './FateSettingsViews.css';

export interface FateLibraryViewProps {
    char: CharacterProfile;
    onChange: (patch: Partial<CharacterProfile>) => void;
    isBusy?: boolean;
}
type Kind = 'factors' | 'tendencies';
type Draft = { id?: string; name: string; meaning: string; category: string };
const PAGE_SIZE = 24;

export default function FateLibraryView({ char, onChange, isBusy = false }: FateLibraryViewProps) {
    const currentCharacter = useRef(char.id);
    currentCharacter.current = char.id;
    const [settings, setSettings] = useState(() => loadFateSettings(char.id));
    const [kind, setKind] = useState<Kind>('factors');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState('all');
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [api, setApi] = useState({ baseUrl: char.scheduleApi?.baseUrl || '', apiKey: char.scheduleApi?.apiKey || '', model: char.scheduleApi?.model || '' });
    const [apiDirty, setApiDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const busy = isBusy || saving;

    useEffect(() => {
        setSettings(loadFateSettings(char.id)); setKind('factors'); setQuery(''); setCategory(''); setStatus('all');
        setLimit(PAGE_SIZE); setExpanded(null); setDraft(null); setError(''); setNotice('');
        setApi({ baseUrl: char.scheduleApi?.baseUrl || '', apiKey: char.scheduleApi?.apiKey || '', model: char.scheduleApi?.model || '' }); setApiDirty(false); setSaving(false);
    }, [char.id]);
    useEffect(() => { setLimit(PAGE_SIZE); }, [kind, query, category, status]);
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
    const persist = (next: FateSettings) => {
        try { saveFateSettings(char.id, next); setSettings(next); setError(''); setNotice('已保存，只影响后续生成。'); return true; }
        catch { setError('保存失败，填写内容还在。请检查浏览器存储空间后重试。'); setNotice(''); return false; }
    };
    const leaveDraft = () => !draft || window.confirm('放弃尚未保存的条目内容？');
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
        if (persist(next)) { setDraft(null); setExpanded(id); setQuery(name); setCategory(''); setStatus('all'); }
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
    const editor = () => draft && <div className="fate-settings-editor">
        <h3>{draft.id ? '编辑' : '添加'}{noun}</h3>
        <label className="fate-settings-field">名称<input value={draft.name} disabled={busy} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        {kind === 'factors' && <label className="fate-settings-field">分类<input value={draft.category} disabled={busy} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>}
        <label className="fate-settings-field">含义<textarea rows={3} value={draft.meaning} disabled={busy} onChange={event => setDraft({ ...draft, meaning: event.target.value })} /></label>
        <div className="fate-settings-actions"><button type="button" className="fate-settings-primary" disabled={busy} onClick={saveEntry}>保存条目</button><button type="button" disabled={busy} onClick={() => { if (leaveDraft()) { setDraft(null); setError(''); } }}>取消编辑</button></div>
    </div>;

    return <section className="fate-settings-view" aria-label="命运资料库">
        <header className="fate-settings-heading"><h2>命运资料库</h2></header>
        <details className="fate-settings-model"><summary>日程专用模型{apiDirty ? ' · 未保存' : ''}</summary><p className="fate-settings-meta">全部留空，用主模型。</p>
            {(['baseUrl', 'apiKey', 'model'] as const).map((field, index) => <label key={field} className="fate-settings-field">{['URL', 'Key', '模型名称'][index]}<input type={field === 'apiKey' ? 'password' : 'text'} autoComplete={field === 'apiKey' ? 'new-password' : 'off'} value={api[field]} disabled={busy} onChange={event => { setApi({ ...api, [field]: event.target.value }); setApiDirty(true); }} /></label>)}
            <button type="button" className="fate-settings-primary" disabled={busy || !apiDirty} onClick={async () => {
                const values = { baseUrl: api.baseUrl.trim(), apiKey: api.apiKey.trim(), model: api.model.trim() };
                if (Object.values(values).some(Boolean) && !Object.values(values).every(Boolean)) { setError('请完整填写日程模型的 URL、Key 和模型名称，或全部清空。'); return; }
                const charId = char.id; setSaving(true);
                try { await onChange({ scheduleApi: values.baseUrl ? values : undefined }); if (charId === currentCharacter.current) { setApiDirty(false); setError(''); setNotice('日程模型已保存。'); } }
                catch { if (charId === currentCharacter.current) setError('日程模型保存失败，填写内容还在，请重试。'); } finally { if (charId === currentCharacter.current) setSaving(false); }
            }}>{apiDirty ? '保存日程模型' : '日程模型已保存'}</button>
        </details>
        <div className="fate-settings-tabs" aria-label="资料库种类">{(['factors', 'tendencies'] as const).map(value => <button type="button" key={value} disabled={busy} aria-pressed={kind === value} onClick={() => { if (kind !== value && leaveDraft()) { setKind(value); setDraft(null); setExpanded(null); setCategory(''); setError(''); setNotice(''); } }}>{value === 'factors' ? '因子' : '倾向'} · {settings[value].length}</button>)}</div>
        <div className="fate-settings-toolbar">
            <label className="fate-settings-search"><span className="fate-settings-sr">搜索{noun}</span><input type="search" value={query} placeholder="搜索名称、含义" onChange={event => setQuery(event.target.value)} /></label>
            <div className="fate-settings-filters">
                {kind === 'factors' && <label><span className="fate-settings-sr">分类筛选</span><select aria-label="分类筛选" value={category} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>}
                <label><span className="fate-settings-sr">启用状态</span><select aria-label="启用状态" value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select></label>
            </div>
        </div>
        <div className="fate-settings-summary"><span>共 {settings[kind].length} 项 · 启用 {settings[kind].filter(item => !disabledIds.includes(item.id)).length} 项 · 匹配 {filtered.length} 项</span><button type="button" disabled={busy} onClick={() => { if (leaveDraft()) { setDraft({ name: '', meaning: '', category: '自定义' }); setExpanded(null); setError(''); setNotice(''); } }}>添加{noun}</button></div>
        {error && <p role="alert" className="fate-settings-error">{error}</p>}{notice && <p role="status" className="fate-settings-meta">{notice}</p>}
        {draft && !draft.id && editor()}
        <div className="fate-settings-list">{filtered.slice(0, limit).map(item => <article className="fate-settings-entry" key={item.id}>
            <button type="button" className="fate-settings-entry-head" aria-expanded={expanded === item.id} onClick={() => { if (draft?.id === item.id || leaveDraft()) { if (draft?.id !== item.id) setDraft(null); setExpanded(expanded === item.id ? null : item.id); } }}>
                <span>{item.name}<span className="fate-settings-meta">{'category' in item ? String(item.category) : '倾向'}</span></span><span className="fate-settings-meta">{disabledIds.includes(item.id) ? '已停用' : '已启用'} {expanded === item.id ? '−' : '+'}</span>
            </button>
            {expanded === item.id && <div className="fate-settings-entry-body">{draft?.id === item.id ? editor() : <><p>{item.meaning}</p><div className="fate-settings-actions"><button type="button" disabled={busy} onClick={() => { setDraft({ ...item, category: (item as FateFactor).category || '自定义' }); setError(''); }}>编辑{noun}</button><button type="button" disabled={busy} onClick={() => toggle(item)}>{disabledIds.includes(item.id) ? '恢复启用' : '停用'}{item.name}</button></div></>}</div>}
        </article>)}</div>
        {!filtered.length && <p className="fate-settings-empty">没有找到，换个词试试。</p>}
        <div className="fate-settings-paging"><span className="fate-settings-meta">已显示 {Math.min(limit, filtered.length)} / {filtered.length} 项</span>{filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + PAGE_SIZE)}>再看 {PAGE_SIZE} 项</button>}</div>
        <div className="fate-settings-actions"><button type="button" disabled={busy} onClick={restore}>恢复内置{noun}</button><span className="fate-settings-meta">自定义条目会保留</span></div>
    </section>;
}
