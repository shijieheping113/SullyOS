import React, { useState } from 'react';
import {
    SULLY_ADVANCED_SNIPPETS,
    SULLY_BUBBLE_COMPOSE_MORE_FORMATS,
    SULLY_FORMAT_SNIPPETS_TITLE,
    type SullyQuickComposeTemplate,
} from '../../utils/sullyAssistantCopy';

type AdvancedProps = {
    mode: 'advanced';
    onInsert: (text: string) => void;
};

type QuickProps = {
    mode: 'quick';
    templates: SullyQuickComposeTemplate[];
    selectedQuickId: string;
    onSelectQuick: (template: SullyQuickComposeTemplate) => void;
    onInsertAdvanced?: (text: string) => void;
};

type Props = AdvancedProps | QuickProps;

const SullyFormatSnippetsBar: React.FC<Props> = (props) => {
    const [moreOpen, setMoreOpen] = useState(false);

    if (props.mode === 'advanced') {
        return (
            <div>
                <div className="text-xs font-medium text-slate-500 mb-2">{SULLY_FORMAT_SNIPPETS_TITLE}</div>
                <div className="flex flex-wrap gap-2">
                    {SULLY_ADVANCED_SNIPPETS.map(s => (
                        <button
                            key={s.label}
                            type="button"
                            onClick={() => props.onInsert(s.text)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200/80"
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    const { templates, selectedQuickId, onSelectQuick, onInsertAdvanced } = props;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {templates.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => onSelectQuick(t)}
                        className={`px-3 py-2 rounded-xl text-[11px] font-medium border transition-colors ${
                            selectedQuickId === t.id
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-violet-50 text-violet-800 border-violet-200/80'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            {onInsertAdvanced && (
                <div>
                    <button
                        type="button"
                        onClick={() => setMoreOpen(v => !v)}
                        className="text-[11px] text-violet-600 font-medium"
                    >
                        {SULLY_BUBBLE_COMPOSE_MORE_FORMATS}{moreOpen ? ' ↑' : ' …'}
                    </button>
                    {moreOpen && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {SULLY_ADVANCED_SNIPPETS.map(s => (
                                <button
                                    key={s.label}
                                    type="button"
                                    onClick={() => onInsertAdvanced(s.text)}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200/80"
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SullyFormatSnippetsBar;
