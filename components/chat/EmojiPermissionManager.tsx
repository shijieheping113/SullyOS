import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterProfile, Emoji, EmojiCategory } from '../../types';
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

const CharacterAvatar: React.FC<{ character: CharacterProfile; allowed: boolean; small?: boolean }> = ({ character, allowed, small }) => (
    <div
        className={`relative ${small ? 'w-8 h-8' : 'w-10 h-10'} rounded-full overflow-hidden shrink-0 ${allowed ? 'ring-2 ring-emerald-400' : 'grayscale opacity-40 ring-2 ring-slate-200'}`}
        title={`${character.name}${allowed ? ' · 能用' : ' · 不能用'}`}
    >
        <TokenImg value={character.avatar} className="w-full h-full object-cover" />
    </div>
);

const Switch: React.FC<{ on: boolean; disabled?: boolean; onClick: () => void; label?: string }> = ({ on, disabled, onClick, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'} ${disabled ? 'opacity-40' : 'active:scale-95'}`}
    >
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'}`} />
    </button>
);

const EmojiPermissionManager: React.FC<EmojiPermissionManagerProps> = ({
    open,
    onClose,
    categories,
    emojis,
    characters,
    foldKey,
    foldLabel,
    initialCategoryId,
    onToggleFold,
    onToggleCharacter,
    onToggleUserOnly,
    onRenameCategory,
    onDeleteCategory,
    onDownloadCategory,
}) => {
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(initialCategoryId || null);
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [deleting, setDeleting] = useState(false);

    React.useEffect(() => {
        if (open) {
            setActiveCategoryId(initialCategoryId || null);
            setRenaming(false);
            setDeleting(false);
        }
    }, [open, initialCategoryId]);

    const activeCategory = useMemo(
        () => categories.find(c => c.id === activeCategoryId) || null,
        [categories, activeCategoryId],
    );

    if (!open) return null;

    const renderOverview = () => (
        <div className="px-4 pb-6 space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed px-1">
                点分组进去，改「谁能发这里的表情」。卡片右上角的开关 = 在跟{foldLabel}聊天时折叠这个分组；折叠后它不进快速发送，随时可以展开回来。
            </p>
            {categories.map(category => {
                const categoryEmojis = emojisOfCategory(emojis, category.id);
                const blocked = normalizedBlockedCharacterIds(category, characters.map(ch => ch.id));
                const isFolded = (category.foldedIn || []).includes(foldKey);
                const hasEmojiBlocks = categoryEmojis.some(e => (e.blockedCharacterIds?.length || 0) > 0);
                const isDefault = category.id === 'default';
                const badges: { text: string; cls: string }[] = [];
                if (category.userOnly) badges.push({ text: '只有我能用', cls: 'bg-violet-50 text-violet-600' });
                else if (blocked.length > 0) badges.push({ text: `${blocked.length} 个角色不能用`, cls: 'bg-sky-50 text-sky-600' });
                if (hasEmojiBlocks) badges.push({ text: '有表情被屏蔽', cls: 'bg-orange-50 text-orange-600' });
                if (isFolded) badges.push({ text: '已折叠', cls: 'bg-amber-50 text-amber-700' });
                if (badges.length === 0) badges.push({ text: '全员可用', cls: 'bg-emerald-50 text-emerald-700' });

                return (
                    <div key={category.id} className={`rounded-2xl border p-3 ${isFolded ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100 bg-white'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={() => { setActiveCategoryId(category.id); setRenaming(false); setDeleting(false); }}
                                className="font-bold text-slate-700 text-sm text-left flex-1 min-w-0 truncate"
                            >
                                {category.name}
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-slate-400">折叠</span>
                                <Switch
                                    on={isFolded}
                                    disabled={isDefault}
                                    label={`在跟${foldLabel}聊天时折叠${category.name}`}
                                    onClick={() => onToggleFold(category.id, !isFolded)}
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {badges.map(badge => (
                                <span key={badge.text} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.text}</span>
                            ))}
                            {isDefault && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">默认分组不能折叠</span>}
                        </div>
                        {characters.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
                                {characters.map(character => (
                                    <CharacterAvatar
                                        key={character.id}
                                        character={character}
                                        allowed={!category.userOnly && isCategoryAllowedForCharacter(category, character.id)}
                                        small
                                    />
                                ))}
                                <span className="text-[10px] text-slate-400 ml-1">亮 = 能用，灰 = 不能用</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    const renderDetail = () => {
        if (!activeCategory) return null;
        const isDefault = activeCategory.id === 'default';
        const canRenameOrDelete = !activeCategory.isSystem && !isDefault;
        return (
            <div className="px-4 pb-8 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                        {renaming ? (
                            <div className="flex items-center gap-2">
                                <input
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    className="flex-1 min-w-0 bg-slate-100 rounded-xl px-3 py-2 text-sm font-bold"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const name = renameValue.trim();
                                        if (name && name !== activeCategory.name) onRenameCategory(activeCategory.id, name);
                                        setRenaming(false);
                                    }}
                                    className="px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold"
                                >
                                    保存
                                </button>
                                <button type="button" onClick={() => setRenaming(false)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-sm">取消</button>
                            </div>
                        ) : (
                            <div className="text-base font-bold text-slate-800 truncate">{activeCategory.name}</div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <div className="text-sm font-bold text-slate-700">只有我能用</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">打开后，所有角色都不能发这个分组里的表情，只有你自己能发</div>
                        </div>
                        <Switch on={!!activeCategory.userOnly} onClick={() => onToggleUserOnly(activeCategory.id, !activeCategory.userOnly)} label="只有我能用" />
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                    <div className="text-sm font-bold text-slate-700 mb-0.5">谁能发</div>
                    <div className="text-[11px] text-slate-400 mb-2">默认全开。关掉哪个角色，就只在跟那个角色的聊天里「只有你能用」；别的角色不受影响。</div>
                    {characters.length === 0 && <div className="text-xs text-slate-400 py-3 text-center">还没有角色</div>}
                    <div className="space-y-1.5">
                        {characters.map(character => {
                            const allowed = isCategoryAllowedForCharacter(activeCategory, character.id);
                            return (
                                <div key={character.id} className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${allowed ? '' : 'bg-slate-50'}`}>
                                    <CharacterAvatar character={character} allowed={allowed} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-slate-700 truncate">{character.name}</div>
                                        <div className="text-[10px] text-slate-400">{allowed ? '能发' : '不能发'}</div>
                                    </div>
                                    <Switch
                                        on={allowed}
                                        disabled={!!activeCategory.userOnly}
                                        label={`${character.name}${allowed ? '能用' : '不能用'}`}
                                        onClick={() => onToggleCharacter(activeCategory.id, character.id, !allowed)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    {!!activeCategory.userOnly && (
                        <div className="text-[10px] text-violet-500 mt-2">「只有我能用」开着时，角色开关暂时不起作用。</div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {canRenameOrDelete && !renaming && (
                        <button
                            type="button"
                            onClick={() => { setRenameValue(activeCategory.name); setRenaming(true); }}
                            className="flex-1 min-w-[7rem] py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold"
                        >
                            改名
                        </button>
                    )}
                    {onDownloadCategory && (
                        <button
                            type="button"
                            onClick={() => onDownloadCategory(activeCategory.id)}
                            className="flex-1 min-w-[7rem] py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold"
                        >
                            下载原图
                        </button>
                    )}
                    {canRenameOrDelete && (
                        !deleting ? (
                            <button
                                type="button"
                                onClick={() => setDeleting(true)}
                                className="flex-1 min-w-[7rem] py-3 rounded-2xl bg-red-50 text-red-500 text-sm font-bold"
                            >
                                删除分组
                            </button>
                        ) : (
                            <div className="flex-[2] min-w-[14rem] flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2">
                                <span className="text-[11px] text-red-500 flex-1">删掉分组和里面的表情？</span>
                                <button type="button" onClick={() => { setDeleting(false); onDeleteCategory(activeCategory.id); }} className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-bold">删</button>
                                <button type="button" onClick={() => setDeleting(false)} className="px-3 py-1.5 rounded-xl bg-white text-slate-500 text-xs">算了</button>
                            </div>
                        )
                    )}
                </div>
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[130] flex flex-col bg-[#f7f7fa]" style={{ paddingTop: 'var(--safe-top, 0px)', paddingBottom: 'var(--safe-bottom, 0px)' }}>
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100">
                {activeCategory ? (
                    <button type="button" onClick={() => { setActiveCategoryId(null); setRenaming(false); setDeleting(false); }} className="text-slate-500 text-sm font-bold px-1">
                        ← 全部
                    </button>
                ) : (
                    <span className="w-12" />
                )}
                <div className="flex-1 text-center text-sm font-bold text-slate-800">表情包权限</div>
                <button type="button" onClick={onClose} aria-label="关闭" className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-lg leading-none">×</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar pt-3">
                {activeCategory ? renderDetail() : renderOverview()}
            </div>
        </div>,
        document.body,
    );
};

export default EmojiPermissionManager;
