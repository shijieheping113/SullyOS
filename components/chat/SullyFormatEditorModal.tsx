import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterProfile, Emoji, EmojiCategory, Message } from '../../types';
import TokenImg from '../os/TokenImg';
import { sortChatMessages } from '../../utils/chatMessageOrder';
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

type SourcePart = { id: number; source: string };

type Props = {
    open: boolean;
    message: Message | null;
    char: CharacterProfile;
    characters: CharacterProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    onClose: () => void;
    onSave: (parts: SourcePart[]) => Promise<void>;
    saving?: boolean;
    userName?: string;
    preview: SullyRepairPreviewContext;
    /** 合并等场景预填源码，优先于 messageToEditSource。多条时不用这个。 */
    initialSource?: string | null;
    /** 多选时按时间序逐条编辑，保存后各回原位。 */
    batchMessages?: Message[] | null;
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
    batchMessages,
}) => {
    const chibi = useMemo(() => resolveSullyAssistantChibi(characters), [characters]);
    const [parts, setParts] = useState<SourcePart[]>([]);
    const [undoStack, setUndoStack] = useState<SourcePart[][]>([]);
    const [tidyHint, setTidyHint] = useState(SULLY_FORMAT_TIDY_OK);
    const sourceRef = useRef<HTMLTextAreaElement | null>(null);
    const focusIndex = useRef(0);
    const partsRef = useRef(parts);
    partsRef.current = parts;

    const pushUndo = useCallback((prev: SourcePart[]) => {
        setUndoStack(stack => {
            const next = [...stack, prev.map(part => ({ ...part }))];
            if (next.length > UNDO_MAX) next.shift();
            return next;
        });
    }, []);

    const insertAtCursor = useCallback((snippet: string) => {
        const prev = partsRef.current;
        if (!prev.length) return;
        pushUndo(prev);
        const index = Math.min(focusIndex.current, prev.length - 1);
        const current = prev[index];
        const ta = sourceRef.current;
        const value = current.source;
        const start = ta ? (ta.selectionStart ?? value.length) : value.length;
        const end = ta ? (ta.selectionEnd ?? start) : start;
        const next = prev.slice();
        next[index] = { ...current, source: value.slice(0, start) + snippet + value.slice(end) };
        setParts(next);
    }, [pushUndo]);

    const batchKey = batchMessages?.map(item => item.id).join(',') ?? '';

    useEffect(() => {
        if (!open || !message) return;
        if (batchMessages && batchMessages.length > 1) {
            const ordered = sortChatMessages(batchMessages);
            setParts(ordered.map(item => ({ id: item.id, source: messageToEditSource(item, emojis) })));
        } else {
            const initial = initialSource != null && initialSource !== ''
                ? initialSource
                : messageToEditSource(message, emojis);
            setParts([{ id: message.id, source: initial }]);
        }
        setUndoStack([]);
        setTidyHint(SULLY_FORMAT_TIDY_OK);
        focusIndex.current = 0;
    }, [open, message, emojis.length, initialSource, batchKey]);

    const issues = useMemo(() => {
        if (!message) return [];
        return parts.flatMap((part, index) => (
            diagnoseMessageFormat(part.source, message).map(issue => ({
                ...issue,
                id: `${issue.id}-${index}`,
            }))
        ));
    }, [parts, message]);

    const previewSegments = useMemo((): SullyRepairPreviewSegment[] => {
        if (!message) return [];
        return parts.flatMap((part, index) => (
            part.source.trim()
                ? [{
                    key: `part-${part.id}`,
                    label: parts.length > 1 ? `第 ${index + 1} 条` : '当前稿',
                    source: part.source,
                }]
                : []
        ));
    }, [message, parts]);

    const applyTidy = (scope?: SullyFormatTidyScope) => {
        pushUndo(parts);
        let fixed = 0;
        const next = parts.map(part => {
            const result = sullyFormatTidy(part.source, scope ? { scope } : undefined);
            if (result.issuesFixed.length) fixed += 1;
            return { ...part, source: result.text };
        });
        setParts(next);
        setTidyHint(fixed ? SULLY_FORMAT_TIDY_OK : SULLY_FORMAT_TIDY_NOOP);
    };

    const handleUndo = () => {
        setUndoStack(stack => {
            if (!stack.length) return stack;
            const prev = stack[stack.length - 1];
            setParts(prev.map(part => ({ ...part })));
            return stack.slice(0, -1);
        });
    };

    if (!open || !message) return null;

    return (
        <div className="fixed inset-0 z-[500] flex flex-col bg-slate-50 animate-fade-in touch-manipulation overflow-x-hidden max-w-[100vw]">
            <div
                className="shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3 min-w-0 max-w-full"
                style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}
            >
                <TokenImg value={chibi.img} className="w-10 h-10 object-contain" alt="" />
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm">{SULLY_FORMAT_EDITOR_TITLE}</div>
                    <div className="text-[11px] text-slate-500 truncate">{sullyAssistantGreeting(userName)}</div>
                </div>
            </div>

            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4" style={{ paddingBottom: 'var(--safe-bottom)' }}>
                {parts.length > 1 && (
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        每一条都会回到自己原来的位置。把某一格清空再保存，就是删掉那一条。
                    </p>
                )}
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

                {parts.map((part, index) => (
                    <div key={part.id} className="min-w-0">
                        <label className="text-xs font-medium text-slate-500 mb-1 block">
                            {parts.length > 1 ? `第 ${index + 1} 条` : '源码'}
                        </label>
                        <textarea
                            ref={index === 0 ? sourceRef : undefined}
                            value={part.source}
                            onFocus={event => {
                                focusIndex.current = index;
                                sourceRef.current = event.currentTarget;
                            }}
                            onChange={event => {
                                const value = event.target.value;
                                setParts(prev => prev.map(item => item.id === part.id ? { ...item, source: value } : item));
                            }}
                            className="w-full min-w-0 max-w-full min-h-[140px] text-sm p-3 rounded-2xl border border-slate-200 bg-white font-mono leading-relaxed resize-y"
                            spellCheck={false}
                        />
                        {parts.length > 1 && !part.source.trim() && (
                            <p className="text-[10px] text-amber-600 mt-1">空着保存，这条会从原来的位置拿掉。</p>
                        )}
                    </div>
                ))}

                <SullyFormatSnippetsBar mode="advanced" onInsert={insertAtCursor} />

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => applyTidy()}
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
                    {QUICK_ACTIONS.map(action => (
                        <button
                            key={action.scope}
                            type="button"
                            onClick={() => applyTidy(action.scope)}
                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs"
                        >
                            {action.label}
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
                className="shrink-0 px-4 py-3 border-t border-slate-200 bg-white flex gap-3 w-full min-w-0 max-w-full"
                style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 min-w-0 py-3 rounded-2xl bg-slate-100 text-slate-600 font-medium"
                >
                    {SULLY_FORMAT_EDITOR_CANCEL}
                </button>
                <button
                    type="button"
                    disabled={saving || (parts.length < 2 && parts.every(part => !part.source.trim()))}
                    onClick={() => onSave(parts)}
                    className="flex-1 min-w-0 py-3 rounded-2xl bg-violet-600 text-white font-bold disabled:opacity-50"
                >
                    {saving ? '猫儿在存……' : SULLY_FORMAT_EDITOR_SAVE}
                </button>
            </div>
        </div>
    );
};

export default SullyFormatEditorModal;
