import React, { useMemo, useState } from 'react';
import { Check, DownloadSimple, Lock, Minus, PencilSimple, Plus, Smiley, Trash, X } from '@phosphor-icons/react';
import type { CharacterProfile, Emoji, EmojiCategory } from '../../types';
import Modal from '../os/Modal';
import TokenImg from '../os/TokenImg';
import {
    isCategoryAllowedForCharacter,
    normalizedBlockedCharacterIds,
} from '../../utils/emojiPermissions';

interface EmojiPermissionManagerProps {
    open: boolean;
    onClose: () => void;
    categories: EmojiCategory[];
    emojis: Emoji[];
    characters: CharacterProfile[];
    /** 私聊 = 角色 id；群聊 = group:<groupId>。折叠只影响这个聊天窗口。 */
    foldKey: string;
    /** 界面文案用：当前聊天是谁（角色名 / 群名） */
    foldLabel: string;
    /** 保留参数位，单页版不再用（旧调用方仍会传）。 */
    initialCategoryId?: string | null;
    onToggleFold: (categoryId: string, folded: boolean) => void;
    onToggleCharacter: (categoryId: string, characterId: string, allowed: boolean) => void;
    onToggleUserOnly: (categoryId: string, userOnly: boolean) => void;
    onRenameCategory: (categoryId: string, name: string) => void;
    onDeleteCategory: (categoryId: string) => void;
    onDownloadCategory?: (categoryId: string) => void;
}

const emojisOfCategory = (emojis: Emoji[], categoryId: string): Emoji[] => (
    emojis.filter(e => categoryId === 'default'
        ? (!e.categoryId || e.categoryId === 'default')
        : e.categoryId === categoryId)
);

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }> = ({ label, onClick, children, danger }) => (
    <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors active:scale-90 ${danger ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-slate-600'}`}
    >
        {children}
    </button>
);

const EmojiPermissionManager: React.FC<EmojiPermissionManagerProps> = ({
    open,
    onClose,
    categories,
    emojis,
    characters,
    foldKey,
    onToggleFold,
    onToggleCharacter,
    onToggleUserOnly,
    onRenameCategory,
    onDeleteCategory,
    onDownloadCategory,
}) => {
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const characterIds = useMemo(() => characters.map(c => c.id), [characters]);

    React.useEffect(() => {
        if (!open) {
            setRenamingId(null);
            setDeletingId(null);
        }
    }, [open]);

    const startRename = (category: EmojiCategory) => {
        setRenameValue(category.name);
        setRenamingId(category.id);
        setDeletingId(null);
    };

    const commitRename = (category: EmojiCategory) => {
        const name = renameValue.trim();
        if (name && name !== category.name) onRenameCategory(category.id, name);
        setRenamingId(null);
    };

    return (
        <Modal isOpen={open} title="表情包权限" onClose={onClose}>
            <div className="pb-1">
                <p className="text-[11px] text-slate-400 text-center leading-relaxed px-2 mb-3">
                    点头像切换谁能用 · 灰了就是这个角色不能发
                </p>

                <div className="space-y-2.5">
                    {categories.map(category => {
                        const categoryEmojis = emojisOfCategory(emojis, category.id);
                        const preview = categoryEmojis[0];
                        const blocked = normalizedBlockedCharacterIds(category, characterIds);
                        const folded = (category.foldedIn || []).includes(foldKey);
                        const isDefault = category.id === 'default';
                        const canEdit = !category.isSystem && !isDefault;
                        const status = category.userOnly
                            ? '只有我能用'
                            : blocked.length > 0
                                ? `${blocked.length} 个角色不能用`
                                : '全员可用';
                        const isRenaming = renamingId === category.id;

                        return (
                            <div
                                key={category.id}
                                className={`rounded-2xl border p-3 transition-colors ${folded ? 'border-amber-100 bg-amber-50/40' : 'border-slate-100 bg-slate-50/60'}`}
                            >
                                <div className="flex items-start gap-2.5">
                                    <div className="w-11 h-11 rounded-xl bg-white border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                        {preview
                                            ? <TokenImg value={preview.url} className="w-full h-full object-contain" loading="lazy" decoding="async" />
                                            : <Smiley size={20} className="text-slate-300" weight="duotone" />}
                                    </div>

                                    <div className="flex-1 min-w-0 pt-0.5">
                                        {isRenaming ? (
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    value={renameValue}
                                                    onChange={e => setRenameValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') commitRename(category);
                                                        if (e.key === 'Escape') setRenamingId(null);
                                                    }}
                                                    autoFocus
                                                    className="flex-1 min-w-0 h-8 rounded-lg bg-white border border-primary/40 px-2 text-[13px] font-bold text-slate-700 outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    aria-label="保存名称"
                                                    onClick={() => commitRename(category)}
                                                    className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center active:scale-90"
                                                >
                                                    <Check size={13} weight="bold" />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="取消改名"
                                                    onClick={() => setRenamingId(null)}
                                                    className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90"
                                                >
                                                    <X size={13} weight="bold" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="font-bold text-[13.5px] text-slate-700 truncate">{category.name}</div>
                                                <div className="text-[10.5px] text-slate-400 mt-0.5 truncate">
                                                    {categoryEmojis.length} 个表情 · {status}{folded ? ' · 已折叠' : ''}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {!isRenaming && (
                                        <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                                            {canEdit && (
                                                <IconButton label="改名" onClick={() => startRename(category)}>
                                                    <PencilSimple size={15} weight="bold" />
                                                </IconButton>
                                            )}
                                            {onDownloadCategory && (
                                                <IconButton label="下载原图" onClick={() => onDownloadCategory(category.id)}>
                                                    <DownloadSimple size={15} weight="bold" />
                                                </IconButton>
                                            )}
                                            {canEdit && (
                                                <IconButton label="删除分组" danger onClick={() => setDeletingId(deletingId === category.id ? null : category.id)}>
                                                    <Trash size={15} weight="bold" />
                                                </IconButton>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {!isRenaming && (
                                    <>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                            {characters.map(character => {
                                                const allowed = !category.userOnly && isCategoryAllowedForCharacter(category, character.id);
                                                return (
                                                    <button
                                                        key={character.id}
                                                        type="button"
                                                        disabled={!!category.userOnly}
                                                        aria-label={`${character.name}${allowed ? '能用' : '不能用'}`}
                                                        title={`${character.name}：${allowed ? '能用' : '不能用'}`}
                                                        onClick={() => onToggleCharacter(category.id, character.id, !allowed)}
                                                        className={`w-8 h-8 rounded-full overflow-hidden transition-all ${allowed ? 'ring-2 ring-emerald-400' : 'ring-2 ring-slate-200 opacity-35 grayscale'} ${category.userOnly ? 'cursor-default' : 'active:scale-90'}`}
                                                    >
                                                        <TokenImg value={character.avatar} className="w-full h-full object-cover" />
                                                    </button>
                                                );
                                            })}
                                            {characters.length === 0 && (
                                                <span className="text-[10.5px] text-slate-400">还没有角色</span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                            <button
                                                type="button"
                                                onClick={() => onToggleUserOnly(category.id, !category.userOnly)}
                                                className={`h-7 px-2.5 rounded-full border text-[11px] font-bold inline-flex items-center gap-1 transition-colors active:scale-95 ${category.userOnly ? 'bg-violet-50 text-violet-600 border-transparent' : 'bg-white text-slate-500 border-slate-200'}`}
                                            >
                                                <Lock size={12} weight="bold" />
                                                只有我能用
                                            </button>
                                            {!isDefault && (
                                                <button
                                                    type="button"
                                                    onClick={() => onToggleFold(category.id, !folded)}
                                                    className={`h-7 px-2.5 rounded-full border text-[11px] font-bold inline-flex items-center gap-1 transition-colors active:scale-95 ${folded ? 'bg-amber-50 text-amber-700 border-transparent' : 'bg-white text-slate-500 border-slate-200'}`}
                                                >
                                                    {folded
                                                        ? <Minus size={12} weight="bold" />
                                                        : <Plus size={12} weight="bold" />}
                                                    {folded ? '已折叠' : '折叠'}
                                                </button>
                                            )}
                                            {isDefault && (
                                                <span className="text-[10.5px] text-slate-400">默认分组不折叠</span>
                                            )}
                                        </div>

                                        {deletingId === category.id && (
                                            <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-50 px-2.5 py-1.5">
                                                <span className="text-[10.5px] text-red-500 flex-1">删掉分组和里面的表情？</span>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDeletingId(null); onDeleteCategory(category.id); }}
                                                    className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-[11px] font-bold active:scale-95"
                                                >
                                                    删
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeletingId(null)}
                                                    className="px-2.5 py-1 rounded-lg bg-white text-slate-500 text-[11px] active:scale-95"
                                                >
                                                    算了
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
};

export default EmojiPermissionManager;
