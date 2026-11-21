import React, { useState } from 'react';
import type { CharacterProfile, DateRuleEntry } from '../../types';
import { activeDateRuleSet, dateMeetingRules, dateWritingSupplement, isLegacyDateStyleRule } from '../../utils/dateSceneSettings';
import { DateRuleList } from './DateReplyControls';

interface Props {
    char: CharacterProfile;
    update: (patch: (previous: CharacterProfile) => Partial<CharacterProfile>) => void;
}

const defaultName = '默认规则';
const field = 'min-w-0 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-base';

export default function DateExtraPresets({ char, update }: Props) {
    const presets = (char.dateExtraPresets || []).filter(item => Array.isArray(item.rules));
    const active = activeDateRuleSet(char);
    const [selection, setSelection] = useState(active?.id || '');
    const [form, setForm] = useState<'new' | 'copy' | 'rename' | null>(null);
    const [name, setName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const preset = presets.find(item => item.id === selection);
    const selectedId = preset?.id || '';
    const selectedName = preset?.name || defaultName;
    const isActive = selectedId === (active?.id || '');
    const rules = dateMeetingRules(preset ? preset.rules : char.dateStyleConfig?.rules);

    const select = (id: string) => {
        setSelection(id);
        setForm(null);
        setConfirmDelete(false);
    };
    const changeRules = (apply: (previous: DateRuleEntry[]) => DateRuleEntry[]) => update(previous => {
        const replace = (entries: DateRuleEntry[] = []) => [...entries.filter(isLegacyDateStyleRule), ...apply(dateMeetingRules(entries))];
        if (selectedId) return {
            dateExtraPresets: previous.dateExtraPresets?.map(item => item.id === selectedId
                ? { ...item, rules: replace(item.rules) } : item),
        };
        return {
            dateStyleConfig: { ...previous.dateStyleConfig, rules: replace(previous.dateStyleConfig?.rules) },
        };
    });
    const openForm = (kind: NonNullable<typeof form>) => {
        setForm(kind);
        setName(kind === 'rename' ? selectedName : kind === 'copy' ? selectedName + ' 副本' : '');
        setConfirmDelete(false);
    };
    const cleanName = name.trim();
    const duplicate = cleanName === defaultName || presets.some(item => item.name === cleanName && (form !== 'rename' || item.id !== selectedId));

    return <div className="space-y-4">
        <section aria-label="选择规则预设" className="rounded-2xl border border-violet-100 bg-white p-4 space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
                <div><h2 className="text-sm font-bold text-slate-800">本场见面规则</h2>
                    <p className="text-xs text-violet-900 mt-1">当前使用：{active?.name || defaultName}</p></div>
                <button type="button" onClick={() => openForm('new')} className="rounded-lg px-3 py-2 text-xs font-semibold text-violet-950 bg-violet-100">＋ 新建一套</button>
            </div>
            <div className="flex flex-wrap gap-2">
                {[{ id: '', name: defaultName }, ...presets].map(item => <button key={item.id} type="button"
                    aria-pressed={selectedId === item.id} onClick={() => select(item.id)}
                    className={'max-w-full truncate rounded-lg border px-3 py-2 text-sm ' + (selectedId === item.id ? 'text-violet-950 border-violet-400 bg-violet-50' : 'text-slate-700 border-slate-200')}>
                    {item.name}
                </button>)}
            </div>
            {form && <form className="space-y-2" onSubmit={event => {
                event.preventDefault();
                if (!cleanName || duplicate) return;
                if (form === 'rename') {
                    update(previous => ({ dateExtraPresets: previous.dateExtraPresets?.map(item =>
                        item.id === selectedId ? { ...item, name: cleanName } : item) }));
                    setForm(null);
                    return;
                }
                const id = `date-preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                const newRules = form === 'copy' ? rules.map(rule => ({ ...rule })) : [];
                update(previous => ({ dateExtraPresets: [...(previous.dateExtraPresets || []), { id, name: cleanName, content: '', rules: newRules }] }));
                select(id);
            }}>
                <label className="block text-xs text-slate-700">规则预设名称
                    <input autoFocus className={field} value={name} onChange={event => setName(event.target.value)} placeholder="例如：日常、冒险" />
                </label>
                {duplicate && <p className="text-xs text-rose-700">已经有一套叫这个名字。</p>}
                <div className="flex gap-3 text-sm">
                    <button type="submit" disabled={!cleanName || duplicate} className="font-bold text-violet-900 disabled:opacity-40">{form === 'rename' ? '保存名称' : '建立预设'}</button>
                    <button type="button" onClick={() => setForm(null)} className="text-slate-600">取消</button>
                </div>
            </form>}
        </section>
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm min-w-0 break-words font-bold text-slate-800">编辑「{selectedName}」</h2>
            {!isActive && <button type="button" className="shrink-0 px-3 py-2 rounded-lg bg-violet-100 text-sm text-violet-950 font-bold"
                onClick={() => update(() => ({ dateActiveRuleSetId: selectedId || undefined }))}>使用这套</button>}
        </div>
        <DateRuleList key={selectedId} entries={rules} label="规则" expandText change={changeRules} />
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs text-slate-700">
            <button type="button" onClick={() => openForm('copy')}>复制为新预设</button>
            {preset && <button type="button" onClick={() => openForm('rename')}>改名</button>}
            {rules.some(rule => rule.enabled) && <button type="button" onClick={() => changeRules(previous => previous.map(rule => ({ ...rule, enabled: false })))}>停用这套的所有规则</button>}
            {preset && <button type="button" className="text-rose-700" onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                update(previous => ({
                    dateExtraPresets: previous.dateExtraPresets?.flatMap(item => {
                        if (item.id !== selectedId) return [item];
                        const content = item.content || dateWritingSupplement({ rules: item.rules }, true);
                        return content.trim() ? [{ ...item, content, rules: undefined }] : [];
                    }),
                    ...(previous.dateActiveRuleSetId === selectedId ? { dateActiveRuleSetId: undefined } : {}),
                }));
                select('');
            }}>{confirmDelete ? (isActive ? '确认删除并切回默认规则' : '确认删除这套') : '删除这套'}</button>}
        </div>
    </div>;
}
