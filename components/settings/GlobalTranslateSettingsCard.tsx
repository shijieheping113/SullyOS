import React, { useCallback, useEffect, useState } from 'react';
import {
    isGlobalTranslateEnabled,
    setGlobalTranslateEnabled,
    subscribeGlobalTranslateEnabled,
} from '../../utils/globalTranslateSettings';

/**
 * 设置里的「全局翻译」卡片。
 *
 * 总闸：关掉后心象不再露「译」；目前来源只有谷歌本地，对象只有心象。
 */
const GlobalTranslateSettingsCard: React.FC = () => {
    const [enabled, setEnabled] = useState(() => isGlobalTranslateEnabled());

    useEffect(() => subscribeGlobalTranslateEnabled(setEnabled), []);

    const toggle = useCallback(() => {
        setEnabled(setGlobalTranslateEnabled(!enabled));
    }, [enabled]);

    return (
        <section className="bg-[#fffefe] rounded-3xl p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100/60 rounded-xl text-emerald-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0v2.25m0-2.25c-2.24 0-4.407.134-6.48.39m6.48-.39c2.24 0 4.407.134 6.48.39m-12.96 0A48.436 48.436 0 0 0 3 7.875C3 12.799 6.71 16.875 11.25 17.25m0 0c.855.047 1.71.094 2.55.094M11.25 17.25v2.25" />
                        </svg>
                    </div>
                    <h2 className="text-sm font-semibold text-slate-600 tracking-wider">全局翻译</h2>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {enabled ? '已打开' : '已关闭'}
                </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-3">
                打开后，心象里可以点淡字「译」把外文收成中文。来源目前只有谷歌本地（需要能访问 Google），对象目前只有心象。
            </p>

            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                <div>
                    <p className="text-[11px] text-slate-600 font-medium">启用翻译</p>
                    <p className="text-[10px] text-slate-400">关掉后心象不再显示「译」</p>
                </div>
                <button
                    type="button"
                    onClick={toggle}
                    aria-pressed={enabled}
                    aria-label="全局翻译"
                    className={`w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
            </div>
        </section>
    );
};

export default GlobalTranslateSettingsCard;
