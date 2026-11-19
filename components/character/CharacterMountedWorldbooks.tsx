import React, { useMemo, useState } from 'react';
import { Books, PencilSimple, X } from '@phosphor-icons/react';
import type { MountedWorldbook, Worldbook } from '../../types';
import WorldbookEntryEditor, {
    type WorldbookEntryEditorSavePayload,
} from '../worldbook/WorldbookEntryEditor';
import {
    groupWorldbooksByCategory,
    groupWorldbooksBySendPosition,
    toMountedWorldbook,
    WORLDBOOK_POSITION_LABELS,
    WORLDBOOK_ROLE_LABELS,
} from '../../utils/worldbook';
import { trackEvent } from '../../utils/analytics';

type ViewMode = 'send' | 'category';

type CharacterMountedWorldbooksProps = {
    books: MountedWorldbook[];
    worldbooks: Worldbook[];
    onChangeMounted: (next: MountedWorldbook[]) => void;
    onUpdateLibraryBook: (id: string, updates: Partial<Worldbook>) => Promise<void>;
    onMountClick: () => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

const triggerLabel = (book: MountedWorldbook) => {
    if (book.disable) return '已停用';
    return (book.constant ?? !(book.key && book.key.length > 0)) ? '常驻' : '关键词';
};

const BookRow: React.FC<{
    book: MountedWorldbook;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onUnmount: () => void;
}> = ({ book, expanded, onToggle, onEdit, onUnmount }) => {
    const position = book.position ?? 1;
    return (
        <div className="rounded-2xl border border-indigo-50/90 bg-gradient-to-br from-white to-indigo-50/30 px-3.5 py-3 shadow-[0_1px_0_rgba(99,102,241,0.04)]">
            <div className="flex items-start gap-2.5">
                <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
                    <div className="text-[13px] font-semibold text-slate-700 break-words leading-snug">{book.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${book.disable ? 'bg-slate-200 text-slate-500' : 'bg-indigo-50 text-indigo-500'}`}>
                            {triggerLabel(book)}
                        </span>
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-medium text-slate-500 ring-1 ring-indigo-100/80">
                            {WORLDBOOK_POSITION_LABELS[position]}
                        </span>
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-mono text-slate-400 ring-1 ring-slate-100">
                            顺序 {Number.isFinite(book.order) ? book.order : 100}
                        </span>
                        {position === 4 && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-medium text-violet-500">
                                深度 {book.depth ?? 4} · {WORLDBOOK_ROLE_LABELS[book.role ?? 0]}
                            </span>
                        )}
                    </div>
                </button>
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                    <button
                        type="button"
                        aria-label={`编辑 ${book.title}`}
                        onClick={onEdit}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-indigo-400 shadow-sm ring-1 ring-indigo-100 active:scale-90"
                    >
                        <PencilSimple size={14} weight="bold" />
                    </button>
                    <button
                        type="button"
                        aria-label={`取消挂载 ${book.title}`}
                        onClick={onUnmount}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm ring-1 ring-slate-100 active:scale-90 hover:text-rose-400"
                    >
                        <X size={14} weight="bold" />
                    </button>
                </div>
            </div>
            {expanded && (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-white/80 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500 ring-1 ring-indigo-50">
                    {book.content || '暂无内容'}
                </p>
            )}
        </div>
    );
};

const CharacterMountedWorldbooks: React.FC<CharacterMountedWorldbooksProps> = ({
    books,
    worldbooks,
    onChangeMounted,
    onUpdateLibraryBook,
    onMountClick,
    addToast,
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('send');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [editingBook, setEditingBook] = useState<MountedWorldbook | null>(null);
    const [saving, setSaving] = useState(false);

    const categoryNames = useMemo(() => {
        const names = new Set<string>();
        worldbooks.forEach(book => names.add(book.category || '未分类设定 (General)'));
        books.forEach(book => names.add(book.category || '未分类设定 (General)'));
        return [...names];
    }, [worldbooks, books]);

    const sendGroups = useMemo(() => groupWorldbooksBySendPosition(books), [books]);
    const categoryGroups = useMemo(() => groupWorldbooksByCategory(books), [books]);

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const unmountOne = (id: string) => {
        onChangeMounted(books.filter(book => book.id !== id));
    };

    const unmountMany = (ids: string[]) => {
        const drop = new Set(ids);
        onChangeMounted(books.filter(book => !drop.has(book.id)));
    };

    const openEditor = (book: MountedWorldbook) => {
        const live = worldbooks.find(item => item.id === book.id);
        setEditingBook(live ? { ...book, ...toMountedWorldbook(live) } : book);
        trackEvent('打开世界书编辑页', { mode: 'edit' });
    };

    const handleSave = async (payload: WorldbookEntryEditorSavePayload) => {
        if (!editingBook || saving) return;
        setSaving(true);
        try {
            const nextMounted: MountedWorldbook = {
                ...editingBook,
                ...payload,
            };
            const inLibrary = worldbooks.some(book => book.id === editingBook.id);
            if (inLibrary) {
                await onUpdateLibraryBook(editingBook.id, payload);
                addToast('已保存（同步至相关角色）', 'success');
            } else {
                addToast('已保存到当前角色挂载', 'success');
            }
            onChangeMounted(books.map(book => (book.id === editingBook.id ? nextMounted : book)));
            setEditingBook(null);
        } catch (error: any) {
            addToast(error?.message || '保存失败', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (editingBook) {
        return (
            <div className="fixed inset-0 z-[80]">
                <WorldbookEntryEditor
                    key={editingBook.id}
                    mode="edit"
                    initial={editingBook}
                    categoryNames={categoryNames}
                    saving={saving}
                    onCancel={() => { if (!saving) setEditingBook(null); }}
                    onSave={handleSave}
                />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                    <Books size={12} /> 扩展设定
                </label>
                <button
                    type="button"
                    onClick={onMountClick}
                    className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 active:scale-95"
                >
                    + 挂载
                </button>
            </div>

            <div className="mb-3 rounded-2xl bg-indigo-50/60 p-1 ring-1 ring-indigo-100/80">
                <div className="grid grid-cols-2 gap-1">
                    <button
                        type="button"
                        onClick={() => setViewMode('send')}
                        className={`rounded-xl px-3 py-2 text-[11px] font-bold transition-all active:scale-[0.98] ${
                            viewMode === 'send'
                                ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-100/80'
                                : 'text-slate-400 hover:text-indigo-500'
                        }`}
                    >
                        发送顺序
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('category')}
                        className={`rounded-xl px-3 py-2 text-[11px] font-bold transition-all active:scale-[0.98] ${
                            viewMode === 'category'
                                ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-100/80'
                                : 'text-slate-400 hover:text-indigo-500'
                        }`}
                    >
                        按分组
                    </button>
                </div>
            </div>

            <p className="mb-3 px-1 text-[10px] leading-relaxed text-slate-400">
                {viewMode === 'send'
                    ? '按发给模型的上下排列：先看插入位置，再看顺序数字。关键词条目仍可能因对话内容暂时不注入。'
                    : '按世界书分组浏览；组内仍按发给模型的上下排。点铅笔可改位置与顺序，跟世界书 App 同一套。'}
            </p>

            {books.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-4 text-center text-xs text-slate-400">
                    暂未挂载任何世界书
                </div>
            ) : viewMode === 'send' ? (
                <div className="space-y-3">
                    {sendGroups.map(group => (
                        <section key={group.position} className="overflow-hidden rounded-[1.35rem] border border-indigo-50 bg-white/95 shadow-[0_2px_10px_rgba(99,102,241,0.05)]">
                            <div className="flex items-center justify-between gap-3 border-b border-indigo-50/80 bg-gradient-to-r from-indigo-50/80 to-transparent px-4 py-3">
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold text-slate-700">{group.label}</div>
                                    <div className="mt-0.5 text-[10px] text-slate-400">{group.books.length} 条 · 位置 {group.position}</div>
                                </div>
                            </div>
                            <div className="space-y-2 p-3">
                                {group.books.map(book => (
                                    <BookRow
                                        key={book.id}
                                        book={book}
                                        expanded={expandedIds.has(book.id)}
                                        onToggle={() => toggleExpanded(book.id)}
                                        onEdit={() => openEditor(book)}
                                        onUnmount={() => unmountOne(book.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {categoryGroups.map(({ category, books: groupBooks }) => (
                        <details key={category} className="overflow-hidden rounded-[1.35rem] border border-indigo-50 bg-white/95 shadow-[0_2px_10px_rgba(99,102,241,0.05)]" data-mounted-worldbook-group={category}>
                            <summary className="cursor-pointer break-words px-4 py-3 text-xs font-bold text-slate-700">
                                {category} <span className="font-normal text-slate-400">· {groupBooks.length} 条</span>
                            </summary>
                            <div className="space-y-2 px-3 pb-3">
                                <div className="flex justify-end px-1">
                                    <button
                                        type="button"
                                        onClick={() => unmountMany(groupBooks.map(book => book.id))}
                                        className="py-1 text-[11px] text-rose-400"
                                    >
                                        整组取消挂载
                                    </button>
                                </div>
                                {groupBooks.map(book => (
                                    <BookRow
                                        key={book.id}
                                        book={book}
                                        expanded={expandedIds.has(book.id)}
                                        onToggle={() => toggleExpanded(book.id)}
                                        onEdit={() => openEditor(book)}
                                        onUnmount={() => unmountOne(book.id)}
                                    />
                                ))}
                            </div>
                        </details>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CharacterMountedWorldbooks;
