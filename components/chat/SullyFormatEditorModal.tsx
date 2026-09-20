import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterProfile, Emoji, EmojiCategory, Message } from '../../types';
import TokenImg from '../os/TokenImg';
import { messageToEditSource } from '../../utils/sullyMessageSource';
import { diagnoseMessageFormat, sullyFormatTidy, type FormatIssue, type SullyFormatTidyScope } from '../../utils/sullyMessageFormat';
import { resolveSullyAssistantChibi } from '../../utils/sullyAssistantAvatar';
import {
    SULLY_FORMAT_EDITOR_CANCEL,
    SULLY_FORMAT_EDITOR_SAVE,
    SULLY_FORMAT_EDITOR_TITLE,
    SULLY_FORMAT_TIDY_ALL,
    SULLY_FORMAT_TIDY_NOOP,
    SULLY_FORMAT_TIDY_OK,
    sullyAssistantGreeting,
} from '../../utils/sullyAssistantCopy';
import SullyFormatSnippetsBar from './SullyFormatSnippetsBar';
import SullyRepairPreviewPane, { type SullyRepairPreviewContext } from './SullyRepairPreviewPane';
import type { SullyRepairPreviewSegment } from '../../utils/sullyRepairPreview';

const UNDO_MAX = 20;

type Props = {
    open: boolean;
    message: Message | null;
    char: CharacterProfile;
    characters: CharacterProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    onClose: () => void;
    onSave: (source: string) => Promise<void>;
    saving?: boolean;
    userName?: string;
    preview: SullyRepairPreviewContext;
    /** 合并等场景预填源码，优先于 messageToEditSource */
    initialSource?: string | null;
};

const QUICK_ACTIONS: { label: string; scope: SullyFormatTidyScope }[] = [
    { label: '修好语音标签', scope: 'voice' },
    { label: '去掉 HTML 占位回显', scope: 'html-leak' },
    { label: '包好 HTML 卡片', scope: 'html' },
    { label: '表情包指令归一', scope: 'emoji' },
    { label: '双语标签修一下', scope: 'translation' },
];

const SullyFormatEditorModal: React.FC<Props> = ({
    open,
    message,
    char,
    characters,
    emojis,
    categories,
    onClose,
    onSave,
    saving = false,
    userName,
    preview,
    initialSource,
}) => {
    const chibi = useMemo(() => resolveSullyAssistantChibi(characters), [characters]);
    const [source, setSource] = useState('');
    const [undoStack, setUndoStack] = useState<string[]>([]);
    const [tidyHint, setTidyHint] = useState(SULLY_FORMAT_TIDY_OK);
    const sourceRef = useRef<HTMLTextAreaElement>(null);

    const pushUndo = useCallback((prev: string) => {
        setUndoStack(stack => {
            const next = [...stack, prev];
            if (next.length > UNDO_MAX) next.shift();
            return next;
        });
    }, []);

    const insertAtCursor = useCallback((snippet: string) => {
        pushUndo(source);
        const ta = sourceRef.current;
        const start = ta?.selectionStart ?? source.length;
        const end = ta?.selectionEnd ?? start;
        setSource(source.slice(0, start) + snippet + source.slice(end));
    }, [source, pushUndo]);

    useEffect(() => {
        if (!open || !message) return;
        const initial = initialSource != null && initialSource !== ''
            ? initialSource
            : messageToEditSource(message, emojis);
        setSource(initial);
        setUndoStack([]);
        setTidyHint(SULLY_FORMAT_TIDY_OK);
    }, [open, message, emojis, initialSource]);

    const issues = useMemo(() => {
        if (!message) return [];
        return diagnoseMessageFormat(source, message);
    }, [source, message]);

    const previewSegments = useMemo((): SullyRepairPreviewSegment[] => {
        if (!message || !source.trim()) return [];
        return [{ key: 'main', label: '当前稿', source }];
    }, [message, source]);

    const runTidy = (scope: SullyFormatTidyScope) => {
        pushUndo(source);
        const { text, issuesFixed } = sullyFormatTidy(source, { scope });
        setSource(text);
        setTidyHint(issuesFixed.length ? SULLY_FORMAT_TIDY_OK : SULLY_FORMAT_TIDY_NOOP);
    };

    const handleUndo = () => {
        setUndoStack(stack => {
            if (!stack.length) return stack;
            const prev = stack[stack.length - 1];
            setSource(prev);
            return stack.slice(0, -1);
        });
    };

    if (!open || !message) return null;

    return (
        <div className="fixed inset-0 z-[500] flex flex-col bg-slate-50 animate-fade-in touch-manipulation">
            <div
                className="shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3"
                style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}
            >
                <TokenImg value={chibi.img} className="w-10 h-10 object-contain" alt="" />
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm">{SULLY_FORMAT_EDITOR_TITLE}</div>
                    <div className="text-[11px] text-slate-500 truncate">{sullyAssistantGreeting(userName)}</div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: 'var(--safe-bottom)' }}>
                {issues.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {issues.map((issue: FormatIssue) => (
                            <span
                                key={issue.id}
                                title={issue.title}
                                className={`text-[11px] px-2.5 py-1 rounded-full ${
                                    issue.severity === 'error'
                                        ? 'bg-rose-100 text-rose-700'
                                        : issue.severity === 'info'
                                            ? 'bg-violet-50 text-violet-700'
                                            : 'bg-amber-50 text-amber-800'
                                }`}
                            >
                                {issue.message}
                            </span>
                        ))}
                    </div>
                )}

                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">源码</label>
                    <textarea
                        ref={sourceRef}
                        value={source}
                        onChange={e => setSource(e.target.value)}
                        className="w-full min-h-[140px] text-sm p-3 rounded-2xl border border-slate-200 bg-white font-mono leading-relaxed resize-y"
                        spellCheck={false}
                    />
                </div>

                <SullyFormatSnippetsBar mode="advanced" onInsert={insertAtCursor} />

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            pushUndo(source);
                            const { text, issuesFixed } = sullyFormatTidy(source);
                            setSource(text);
                            setTidyHint(issuesFixed.length ? SULLY_FORMAT_TIDY_OK : SULLY_FORMAT_TIDY_NOOP);
                        }}
                        className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold active:scale-[0.98]"
                    >
                        {SULLY_FORMAT_TIDY_ALL}
                    </button>
                    <button
                        type="button"
                        disabled={!undoStack.length}
                        onClick={handleUndo}
                        className="px-3 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-medium disabled:opacity-40"
                    >
                        撤销上一步
                    </button>
                    {QUICK_ACTIONS.map(a => (
                        <button
                            key={a.scope}
                            type="button"
                            onClick={() => runTidy(a.scope)}
                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs"
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
                <p className={`text-[11px] ${tidyHint === SULLY_FORMAT_TIDY_NOOP ? 'text-amber-600' : 'text-slate-400'}`}>{tidyHint}</p>

                {message && (
                    <SullyRepairPreviewPane
                        anchorMessage={message}
                        segments={previewSegments}
                        char={char}
                        emojis={emojis}
                        categories={categories}
                        preview={preview}
                        hint="预览"
                        emptyLabel="还没有可预览的气泡……"
                    />
                )}
            </div>

            <div
                className="shrink-0 px-4 py-3 border-t border-slate-200 bg-white flex gap-3"
                style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-medium"
                >
                    {SULLY_FORMAT_EDITOR_CANCEL}
                </button>
                <button
                    type="button"
                    disabled={saving || !source.trim()}
                    onClick={() => onSave(source)}
                    className="flex-1 py-3 rounded-2xl bg-violet-600 text-white font-bold disabled:opacity-50"
                >
                    {saving ? '猫儿在存……' : SULLY_FORMAT_EDITOR_SAVE}
                </button>
            </div>
        </div>
    );
};

export default SullyFormatEditorModal;
