import React, { useEffect, useMemo, useState } from 'react';
import type { CharacterProfile } from '../../types';
import { BUILTIN_FATE_FACTORS, type FateFactor } from '../../utils/fateFactors';
import { loadFateSettings, saveFateSettings, DEFAULT_FATE_TENDENCIES, type FateSettings, type FateTendency } from '../../utils/fateSettings';

interface FateScheduleSettingsProps {
    char: CharacterProfile;
    onChange: (patch: Partial<CharacterProfile>) => void;
    isGenerating?: boolean;
}

type LibraryKind = 'factors' | 'tendencies';
type LibraryEditor = { kind: LibraryKind; id?: string; name: string; meaning: string; category: string };
const inputClass = 'w-full bg-white/50 border border-slate-200/60 rounded-xl px-3 py-2.5 text-sm focus:bg-white transition-all';
const smallButtonClass = 'px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold active:scale-95 transition-transform';

const FateScheduleSettings: React.FC<FateScheduleSettingsProps> = ({ char, onChange, isGenerating = false }) => {
    const [settings, setSettings] = useState<FateSettings>(() => loadFateSettings(char.id));
    const [url, setUrl] = useState(char.scheduleApi?.baseUrl || '');
    const [key, setKey] = useState(char.scheduleApi?.apiKey || '');
    const [model, setModel] = useState(char.scheduleApi?.model || '');
    const [apiDirty, setApiDirty] = useState(false);
    const [query, setQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(30);
    const [library, setLibrary] = useState<LibraryKind | null>(null);
    const [editor, setEditor] = useState<LibraryEditor | null>(null);
    const [error, setError] = useState('');
    const mode = char.scheduleMode === 'fate' ? 'fate' : 'classic';

    useEffect(() => {
        setSettings(loadFateSettings(char.id));
        setUrl(char.scheduleApi?.baseUrl || '');
        setKey(char.scheduleApi?.apiKey || '');
        setModel(char.scheduleApi?.model || '');
        setApiDirty(false);
        setEditor(null);
        setLibrary(null);
        setQuery('');
        setVisibleCount(30);
        setError('');
    }, [char.id]);

    const persist = (next: FateSettings): boolean => {
        try {
            saveFateSettings(char.id, next);
            setSettings(next);
            setError('');
            return true;
        } catch {
            setError('保存失败，浏览器可能没有足够的存储空间。请保留填写内容后重试。');
            return false;
        }
    };

    const filtered = useMemo(() => {
        if (!library) return [];
        const search = query.trim().toLocaleLowerCase();
        return settings[library].filter(item => {
            const category = 'category' in item ? item.category : '';
            return `${item.name} ${item.meaning} ${category}`.toLocaleLowerCase().includes(search);
        });
    }, [settings, library, query]);

    const openLibrary = (kind: LibraryKind) => {
        setLibrary(library === kind ? null : kind);
        setQuery('');
        setVisibleCount(30);
        setEditor(null);
        setError('');
    };

    const saveEntry = () => {
        if (!editor) return;
        if (!editor.name.trim() || !editor.meaning.trim()) {
            setError('请填写名称和含义。');
            return;
        }
        const id = editor.id || `custom_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
        const common: FateTendency = { id, name: editor.name.trim(), meaning: editor.meaning.trim() };
        let next: FateSettings;
        if (editor.kind === 'factors') {
            const original = settings.factors.find(item => item.id === id);
            const factor: FateFactor = { ...original, ...common, category: editor.category.trim() || '自定义' };
            next = { ...settings, factors: editor.id ? settings.factors.map(item => item.id === id ? factor : item) : [...settings.factors, factor] };
        } else {
            next = { ...settings, tendencies: editor.id ? settings.tendencies.map(item => item.id === id ? common : item) : [...settings.tendencies, common] };
        }
        if (persist(next)) setEditor(null);
    };

    const toggleEntry = (kind: LibraryKind, id: string) => {
        const field = kind === 'factors' ? 'disabledFactorIds' : 'disabledTendencyIds';
        const disabled = settings[field];
        persist({ ...settings, [field]: disabled.includes(id) ? disabled.filter(value => value !== id) : [...disabled, id] });
    };

    const restoreBuiltin = (kind: LibraryKind) => {
        if (!window.confirm('恢复内置名称、含义并启用全部内置项？自定义添加的内容和启停状态会保留。')) return;
        const next = kind === 'factors'
            ? { ...settings, factors: [...BUILTIN_FATE_FACTORS.map(item => ({ ...item })), ...settings.factors.filter(item => item.id.startsWith('custom'))], disabledFactorIds: settings.disabledFactorIds.filter(id => id.startsWith('custom')) }
            : { ...settings, tendencies: [...DEFAULT_FATE_TENDENCIES.map(item => ({ ...item })), ...settings.tendencies.filter(item => item.id.startsWith('custom'))], disabledTendencyIds: settings.disabledTendencyIds.filter(id => id.startsWith('custom')) };
        if (persist(next)) setEditor(null);
    };

    return (
        <div className="space-y-3 mb-4">
            <div className="text-xs font-bold text-slate-700">日程生成方式</div>
            <div className="flex gap-2">
                {([{ id: 'classic', name: '原版日程', text: '保留作者原版生成方式' }, { id: 'fate', name: '命运牌阵', text: '因子与倾向共同展开日程' }] as const).map(option => (
                    <button
                        type="button"
                        key={option.id}
                        disabled={isGenerating}
                        aria-pressed={mode === option.id}
                        onClick={() => { if (mode !== option.id) onChange({ scheduleMode: option.id }); }}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border disabled:opacity-50 ${mode === option.id ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                        <span className="block text-sm mb-0.5">{option.name}</span>
                        <span className="block text-[10px] opacity-70 font-normal">{option.text}</span>
                    </button>
                ))}
            </div>
            {mode === 'fate' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <details>
                        <summary className="text-xs font-bold text-slate-700 cursor-pointer py-1">日程专用模型</summary>
                        <div className="space-y-3 pt-3">
                            <p className="text-[11px] text-slate-500 leading-relaxed">只用于命运牌阵，留空使用主模型。与情绪专用模型分开保存。</p>
                            <label className="block text-xs text-slate-600 space-y-1">
                                <span>URL</span>
                                <input type="text" value={url} onChange={event => { setUrl(event.target.value); setApiDirty(true); }} placeholder="留空使用主模型" className={inputClass} />
                            </label>
                            <label className="block text-xs text-slate-600 space-y-1">
                                <span>Key</span>
                                <input type="password" autoComplete="new-password" value={key} onChange={event => { setKey(event.target.value); setApiDirty(true); }} placeholder="填写密钥" className={inputClass} />
                            </label>
                            <label className="block text-xs text-slate-600 space-y-1">
                                <span>模型名称</span>
                                <input type="text" value={model} onChange={event => { setModel(event.target.value); setApiDirty(true); }} placeholder="填写模型名称" className={inputClass} />
                            </label>
                            <button
                                type="button"
                                disabled={!apiDirty || isGenerating}
                                onClick={() => {
                                    if ((url.trim() || key.trim() || model.trim()) && (!url.trim() || !key.trim() || !model.trim())) {
                                        setError('日程专用模型需要完整填写 URL、Key 和模型名称；全部清空后保存会使用主模型。');
                                        return;
                                    }
                                    onChange({ scheduleApi: url.trim() ? { baseUrl: url.trim(), apiKey: key.trim(), model: model.trim() } : undefined });
                                    setApiDirty(false);
                                    setError('');
                                }}
                                className="w-full py-2.5 rounded-xl text-xs font-bold bg-primary text-white disabled:bg-slate-200 disabled:text-slate-400 active:scale-95 transition-all"
                            >{apiDirty ? '保存日程模型' : '✓ 已保存'}</button>
                        </div>
                    </details>

                    <p className="text-[11px] text-slate-500 leading-relaxed">因子提供活动线索，倾向决定关注方向。内置项和自定义项都能编辑、停用或恢复，修改后用于后续生成。</p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => openLibrary('factors')} aria-expanded={library === 'factors'} className={`flex-1 ${smallButtonClass}`}>
                            因子库 · {settings.factors.length}
                        </button>
                        <button type="button" onClick={() => openLibrary('tendencies')} aria-expanded={library === 'tendencies'} className={`flex-1 ${smallButtonClass}`}>
                            倾向库 · {settings.tendencies.length}
                        </button>
                    </div>

                    {library && (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => { setEditor({ kind: library, name: '', meaning: '', category: '自定义' }); setError(''); }} className={smallButtonClass}>添加{library === 'factors' ? '因子' : '倾向'}</button>
                                <button type="button" onClick={() => restoreBuiltin(library)} className={smallButtonClass}>恢复内置{library === 'factors' ? '因子' : '倾向'}</button>
                            </div>
                            <input type="search" aria-label={library === 'factors' ? '搜索因子' : '搜索倾向'} value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(30); }} placeholder="搜索名称、含义或分类" className={inputClass} />

                            {editor && editor.kind === library && (
                                <div className="space-y-2 bg-white rounded-xl p-3">
                                    <div className="text-xs font-bold text-slate-700">{editor.id ? '编辑' : '添加'}{library === 'factors' ? '因子' : '倾向'}</div>
                                    <label className="block text-xs text-slate-600 space-y-1"><span>名称</span><input value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} className={inputClass} /></label>
                                    {library === 'factors' && <label className="block text-xs text-slate-600 space-y-1"><span>分类</span><input value={editor.category} onChange={event => setEditor({ ...editor, category: event.target.value })} className={inputClass} /></label>}
                                    <label className="block text-xs text-slate-600 space-y-1"><span>含义</span><textarea value={editor.meaning} onChange={event => setEditor({ ...editor, meaning: event.target.value })} rows={4} className={`${inputClass} resize-y`} /></label>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={saveEntry} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold">保存条目</button>
                                        <button type="button" onClick={() => { setEditor(null); setError(''); }} className={smallButtonClass}>取消</button>
                                    </div>
                                </div>
                            )}

                            <div className="max-h-72 overflow-y-auto space-y-2">
                                {filtered.slice(0, visibleCount).map(item => {
                                    const disabled = (library === 'factors' ? settings.disabledFactorIds : settings.disabledTendencyIds).includes(item.id);
                                    const category = 'category' in item ? String(item.category || '') : '';
                                    return (
                                        <div key={item.id} className="bg-white rounded-xl p-3 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 break-words">
                                                    <div className={`text-xs font-bold ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>{item.name}{disabled ? ' · 已停用' : ''}</div>
                                                    {category && <div className="text-[10px] text-slate-400 mt-0.5">{category}</div>}
                                                </div>
                                                <button type="button" onClick={() => toggleEntry(library, item.id)} aria-label={`${disabled ? '恢复' : '停用'}${item.name}`} className={smallButtonClass}>{disabled ? '恢复' : '停用'}</button>
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap break-words">{item.meaning}</p>
                                            <button type="button" onClick={() => { setEditor({ kind: library, id: item.id, name: item.name, meaning: item.meaning, category: category || '自定义' }); setError(''); }} className="text-xs text-primary font-bold py-1">编辑</button>
                                        </div>
                                    );
                                })}
                                {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-4">没有匹配的条目</p>}
                                {filtered.length > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 30)} className={`w-full ${smallButtonClass}`}>再显示 30 项（共 {filtered.length} 项）</button>}
                            </div>
                            <p className="text-[10px] text-slate-400">已保存的修改只影响当前角色；恢复内置内容会保留自定义添加的条目。</p>
                        </div>
                    )}
                </div>
            )}
            {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
        </div>
    );
};

export default React.memo(FateScheduleSettings);
