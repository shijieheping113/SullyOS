import React, { useEffect, useState } from 'react';
import {
    SULLY_AI_REPAIR_PREFS_API_HINT,
    SULLY_AI_REPAIR_PREFS_CUSTOM,
    SULLY_AI_REPAIR_PREFS_OPEN_SETTINGS,
    SULLY_AI_REPAIR_PREFS_TEMP,
    SULLY_AI_REPAIR_PREFS_TITLE,
} from '../../utils/sullyAssistantCopy';
import {
    loadSullyRepairPrefs,
    loadSullyUserFormatRules,
    saveSullyRepairPrefs,
    saveSullyUserFormatRules,
} from '../../utils/sullyRepairPrefs';

type Props = {
    open: boolean;
    onClose: () => void;
    onOpenSettings: () => void;
};

const SullyRepairPrefsSheet: React.FC<Props> = ({ open, onClose, onOpenSettings }) => {
    const [temp, setTemp] = useState(0.3);
    const [rules, setRules] = useState('');

    useEffect(() => {
        if (!open) return;
        const p = loadSullyRepairPrefs();
        setTemp(p.temperature);
        setRules(loadSullyUserFormatRules());
    }, [open]);

    if (!open) return null;

    const save = () => {
        saveSullyRepairPrefs({ temperature: temp });
        saveSullyUserFormatRules(rules);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[520] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
            <div
                className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-xl max-h-[85vh] overflow-y-auto"
                style={{ paddingBottom: 'max(1.25rem, var(--safe-bottom))' }}
            >
                <h3 className="font-bold text-slate-800 mb-4">{SULLY_AI_REPAIR_PREFS_TITLE}</h3>
                <label className="text-xs font-medium text-slate-500 block mb-1">{SULLY_AI_REPAIR_PREFS_TEMP}</label>
                <input
                    type="number"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={temp}
                    onChange={e => setTemp(Number(e.target.value))}
                    className="w-full mb-4 px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
                <label className="text-xs font-medium text-slate-500 block mb-1">{SULLY_AI_REPAIR_PREFS_CUSTOM}</label>
                <textarea
                    value={rules}
                    onChange={e => setRules(e.target.value)}
                    className="w-full min-h-[100px] mb-4 px-3 py-2 rounded-xl border border-slate-200 text-sm leading-relaxed"
                    placeholder="例如：我家角色会用 [[NOTE:…]] 做旁白……"
                />
                <p className="text-[11px] text-slate-400 mb-2">{SULLY_AI_REPAIR_PREFS_API_HINT}</p>
                <button
                    type="button"
                    onClick={() => { onOpenSettings(); onClose(); }}
                    className="w-full mb-4 py-2.5 rounded-xl border border-violet-200 text-violet-700 text-sm font-medium"
                >
                    {SULLY_AI_REPAIR_PREFS_OPEN_SETTINGS}
                </button>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-medium"
                    >
                        先不改
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        className="flex-1 py-3 rounded-2xl bg-violet-600 text-white font-bold"
                    >
                        嗯，记住了
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SullyRepairPrefsSheet;
