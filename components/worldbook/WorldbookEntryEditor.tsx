import React, { useMemo, useState } from 'react';
import type {
    MountedWorldbook,
    Worldbook,
    WorldbookDepthRole,
    WorldbookPosition,
    WorldbookSelectiveLogic,
} from '../../types';
import {
    splitWorldbookKeywords,
    WORLDBOOK_POSITION_DESCRIPTIONS,
    WORLDBOOK_POSITION_LABELS,
    WORLDBOOK_ROLE_LABELS,
} from '../../utils/worldbook';
import { trackEvent } from '../../utils/analytics';

export type WorldbookEntryEditorSeed = Pick<Worldbook, 'title' | 'content' | 'category'> & Partial<Worldbook>;

export type WorldbookEntryEditorSavePayload = {
    title: string;
    content: string;
    category: string;
    disable: boolean;
    constant: boolean;
    key: string[];
    keysecondary: string[];
    selective: boolean;
    selectiveLogic: WorldbookSelectiveLogic;
    position: WorldbookPosition;
    depth: number;
    role: WorldbookDepthRole;
    order: number;
    scanDepth: number;
    useProbability: boolean;
    probability: number;
    caseSensitive: boolean;
    matchWholeWords: boolean;
};

type WorldbookEntryEditorProps = {
    mode: 'create' | 'edit';
    initial: WorldbookEntryEditorSeed | MountedWorldbook | Worldbook | null;
    categoryNames: string[];
    onCancel: () => void;
    onSave: (payload: WorldbookEntryEditorSavePayload) => void | Promise<void>;
    saving?: boolean;
};

const defaultSeed = (): WorldbookEntryEditorSeed => ({
    title: '',
    content: '',
    category: '',
    disable: false,
    constant: true,
    key: [],
    keysecondary: [],
    selectiveLogic: 0,
    position: 1,
    depth: 4,
    role: 0,
    order: 100,
    scanDepth: 4,
    useProbability: false,
    probability: 100,
    caseSensitive: false,
    matchWholeWords: false,
});

export const seedFromWorldbook = (
    book?: WorldbookEntryEditorSeed | MountedWorldbook | Worldbook | null,
): WorldbookEntryEditorSeed => {
    if (!book) return defaultSeed();
    return {
        ...defaultSeed(),
        ...book,
        category: book.category || '',
    };
};

const WorldbookEntryEditor: React.FC<WorldbookEntryEditorProps> = ({
    mode,
    initial,
    categoryNames,
    onCancel,
    onSave,
    saving = false,
}) => {
    const seed = useMemo(() => seedFromWorldbook(initial), [initial]);
    const [tempTitle, setTempTitle] = useState(seed.title);
    const [tempContent, setTempContent] = useState(seed.content);
    const [tempCategory, setTempCategory] = useState(seed.category || '');
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [tempEnabled, setTempEnabled] = useState(!(seed.disable === true));
    const [tempConstant, setTempConstant] = useState(seed.constant ?? !(seed.key && seed.key.length > 0));
    const [tempKeywords, setTempKeywords] = useState((seed.key || []).join(', '));
    const [tempSecondaryKeywords, setTempSecondaryKeywords] = useState((seed.keysecondary || []).join(', '));
    const [tempSelectiveLogic, setTempSelectiveLogic] = useState<WorldbookSelectiveLogic>(seed.selectiveLogic ?? 0);
    const [tempPosition, setTempPosition] = useState<WorldbookPosition>(seed.position ?? 1);
    const [tempDepth, setTempDepth] = useState(seed.depth ?? 4);
    const [tempRole, setTempRole] = useState<WorldbookDepthRole>(seed.role ?? 0);
    const [tempOrder, setTempOrder] = useState(seed.order ?? 100);
    const [tempScanDepth, setTempScanDepth] = useState(seed.scanDepth ?? 4);
    const [tempUseProbability, setTempUseProbability] = useState(seed.useProbability === true);
    const [tempProbability, setTempProbability] = useState(seed.probability ?? 100);
    const [tempCaseSensitive, setTempCaseSensitive] = useState(seed.caseSensitive === true);
    const [tempWholeWords, setTempWholeWords] = useState(seed.matchWholeWords === true);
    const [error, setError] = useState('');

    const filteredCategorySuggestions = useMemo(() => {
        const query = tempCategory.trim().toLowerCase();
        if (!query) return categoryNames;
        return categoryNames.filter(cat => cat.toLowerCase().includes(query));
    }, [categoryNames, tempCategory]);

    const handleSave = async () => {
        if (saving) return;
        if (!tempTitle.trim()) {
            setError('请输入标题');
            return;
        }
        const primaryKeywords = splitWorldbookKeywords(tempKeywords);
        const secondaryKeywords = splitWorldbookKeywords(tempSecondaryKeywords);
        if (!tempConstant && primaryKeywords.length === 0) {
            setError('关键词触发模式至少需要一个主要关键词');
            return;
        }
        setError('');
        await onSave({
            title: tempTitle,
            content: tempContent,
            category: tempCategory.trim() || '未分类设定 (General)',
            disable: !tempEnabled,
            constant: tempConstant,
            key: primaryKeywords,
            keysecondary: secondaryKeywords,
            selective: secondaryKeywords.length > 0,
            selectiveLogic: tempSelectiveLogic,
            position: tempPosition,
            depth: Math.max(0, Math.floor(tempDepth || 0)),
            role: tempRole,
            order: Number.isFinite(tempOrder) ? tempOrder : 100,
            scanDepth: Math.max(0, Math.floor(tempScanDepth || 0)),
            useProbability: tempUseProbability,
            probability: Math.max(0, Math.min(100, tempProbability || 0)),
            caseSensitive: tempCaseSensitive,
            matchWholeWords: tempWholeWords,
        });
    };

    return (
        <div className="h-full w-full bg-[#f5f6fa] flex flex-col font-sans animate-fade-in">
            <div className="bg-white/90 backdrop-blur-xl border-b border-slate-200/70 shrink-0 z-20" style={{ paddingTop: 'var(--safe-top)' }}>
                <div className="h-16 max-w-2xl mx-auto w-full flex items-center justify-between px-5">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="px-3 py-2 -ml-3 rounded-xl text-slate-500 font-semibold text-sm hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
                    >
                        取消
                    </button>
                    <div className="text-center">
                        <div className="text-[10px] font-bold tracking-[0.16em] text-indigo-400 uppercase">Worldbook</div>
                        <div className="text-sm font-bold text-slate-800 mt-0.5">{mode === 'edit' ? '编辑条目' : '新建条目'}</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => { void handleSave(); }}
                        disabled={saving}
                        className="px-4 py-2 -mr-1 bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 active:scale-95 transition-all hover:bg-indigo-600 disabled:opacity-50"
                    >
                        {saving ? '保存中' : '保存'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="w-full max-w-2xl mx-auto px-5 py-5 pb-10 space-y-4">
                    {error && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
                            {error}
                        </div>
                    )}

                    <div className="bg-white rounded-[1.5rem] border border-slate-200/70 p-5 shadow-sm shadow-slate-200/40 space-y-4">
                        <div>
                            <div className="text-[11px] font-bold tracking-[0.14em] text-indigo-500 uppercase">基础信息</div>
                            <p className="text-[10px] text-slate-400 mt-1">用于识别、整理和挂载这条世界书。</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-2 block">标题</label>
                            <input
                                value={tempTitle}
                                onChange={e => setTempTitle(e.target.value)}
                                placeholder="例如: 魔法体系、公司背景..."
                                className="w-full text-base font-bold text-slate-800 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-2 block">分组</label>
                            <input
                                value={tempCategory}
                                onChange={e => setTempCategory(e.target.value)}
                                placeholder="例如: 世界观、人物、地理..."
                                className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                            />
                            {categoryNames.length > 0 && (
                                <div className="mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCategoryPicker(v => !v)}
                                        className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-500 px-1 py-1 active:scale-95 transition-transform"
                                    >
                                        <span className={`transition-transform duration-200 inline-block ${showCategoryPicker ? 'rotate-90' : ''}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                                        </span>
                                        选择已有分组 ({categoryNames.length})
                                    </button>
                                    {showCategoryPicker && (
                                        <div className="mt-1.5 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2 flex flex-wrap gap-1.5 overscroll-contain">
                                            {filteredCategorySuggestions.length === 0 ? (
                                                <span className="text-[10px] text-slate-400 px-1 py-0.5">没有匹配「{tempCategory.trim()}」的分组，保存后将新建。</span>
                                            ) : (
                                                filteredCategorySuggestions.map(cat => (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        onClick={() => { setTempCategory(cat); setShowCategoryPicker(false); }}
                                                        className={`max-w-full truncate text-[11px] px-2.5 py-1 rounded-full border transition-colors active:scale-95 ${tempCategory.trim() === cat ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                                                    >
                                                        {cat}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1.5 px-1">同名条目会自动归入已有分组；输入文字可过滤上方候选。</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[1.5rem] border border-slate-200/70 p-5 shadow-sm shadow-slate-200/40 space-y-5">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-xs font-bold text-slate-700">启用条目</div>
                                <p className="text-[10px] text-slate-400 mt-1">关闭后保留内容，但不会注入提示词。</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setTempEnabled(value => !value)}
                                className={`relative inline-flex w-12 h-7 shrink-0 items-center rounded-full p-1 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${tempEnabled ? 'bg-indigo-500' : 'bg-slate-200'}`}
                                aria-pressed={tempEnabled}
                            >
                                <span className={`block w-5 h-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ${tempEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                            <label className="text-[11px] font-bold text-slate-400 uppercase mb-2 block tracking-[0.12em]">触发方式</label>
                            <label className="flex items-center gap-3 py-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={!tempConstant}
                                    onChange={e => setTempConstant(!e.target.checked)}
                                    className="w-4 h-4 accent-indigo-500"
                                />
                                <span>
                                    <span className="block text-sm font-semibold text-slate-700">启用关键词触发</span>
                                    <span className="block mt-1 text-[10px] text-slate-400">关闭后改为常驻，已填关键词会保留。</span>
                                </span>
                            </label>
                            <p className={`text-[10px] leading-relaxed mt-1 pl-7 ${tempConstant ? 'text-slate-400' : 'text-indigo-500'}`}>
                                {tempConstant
                                    ? '未勾选：不检查关键词，这条世界书会始终生效。'
                                    : '已勾选：只有主要关键词命中时才生效；未填写关键词将无法保存。'}
                            </p>
                        </div>

                        {!tempConstant && (
                            <div className="space-y-4 animate-fade-in">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-2 block">主要关键词</label>
                                    <input
                                        value={tempKeywords}
                                        onChange={e => setTempKeywords(e.target.value)}
                                        placeholder="多个关键词用逗号或换行分隔"
                                        className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-2 block">辅助关键词（可选）</label>
                                    <input
                                        value={tempSecondaryKeywords}
                                        onChange={e => setTempSecondaryKeywords(e.target.value)}
                                        placeholder="用于进一步限制触发条件"
                                        className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                                    />
                                </div>
                                {splitWorldbookKeywords(tempSecondaryKeywords).length > 0 && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 mb-2 block">辅助关键词条件</label>
                                        <select
                                            value={tempSelectiveLogic}
                                            onChange={e => setTempSelectiveLogic(Number(e.target.value) as WorldbookSelectiveLogic)}
                                            className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                                        >
                                            <option value={0}>至少匹配一个</option>
                                            <option value={3}>全部匹配</option>
                                            <option value={2}>全部不能匹配</option>
                                            <option value={1}>不能全部匹配</option>
                                        </select>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                        <input type="checkbox" checked={tempCaseSensitive} onChange={e => setTempCaseSensitive(e.target.checked)} className="accent-indigo-500" />
                                        区分大小写
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                        <input type="checkbox" checked={tempWholeWords} onChange={e => setTempWholeWords(e.target.checked)} className="accent-indigo-500" />
                                        完整词匹配
                                    </label>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-2 block">扫描最近消息数</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={tempScanDepth}
                                        onChange={e => setTempScanDepth(Number(e.target.value))}
                                        className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-[1.5rem] border border-slate-200/70 p-5 shadow-sm shadow-slate-200/40 space-y-4">
                        <div>
                            <div className="text-[11px] font-bold tracking-[0.14em] text-indigo-500 uppercase">注入设置</div>
                            <p className="text-[10px] text-slate-400 mt-1">控制条目在提示词中的位置和优先级。</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-2 block">注入位置</label>
                            <select
                                value={tempPosition}
                                onChange={e => {
                                    const nextPosition = Number(e.target.value) as WorldbookPosition;
                                    setTempPosition(nextPosition);
                                    trackEvent('切换世界书注入位置', { position: nextPosition });
                                }}
                                className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                            >
                                {(Object.entries(WORLDBOOK_POSITION_LABELS) as [string, string][]).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}{value === '1' ? '（默认 · 旧版位置）' : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] leading-relaxed text-slate-400 mt-2 px-1">
                                {WORLDBOOK_POSITION_DESCRIPTIONS[tempPosition]}
                            </p>
                        </div>

                        {tempPosition === 4 && (
                            <div className="grid grid-cols-2 gap-3 animate-fade-in">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-2 block">消息深度</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={tempDepth}
                                        onChange={e => setTempDepth(Number(e.target.value))}
                                        className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1 px-1">0 最靠近最新消息，数字越大越往前。</p>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-2 block">消息角色</label>
                                    <select
                                        value={tempRole}
                                        onChange={e => setTempRole(Number(e.target.value) as WorldbookDepthRole)}
                                        className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                                    >
                                        {(Object.entries(WORLDBOOK_ROLE_LABELS) as [string, string][]).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block">插入顺序</label>
                                <input
                                    type="number"
                                    value={tempOrder}
                                    onChange={e => setTempOrder(Number(e.target.value))}
                                    className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2">
                                    <input type="checkbox" checked={tempUseProbability} onChange={e => setTempUseProbability(e.target.checked)} className="accent-indigo-500" />
                                    启用随机概率
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    disabled={!tempUseProbability}
                                    value={tempProbability}
                                    onChange={e => setTempProbability(Number(e.target.value))}
                                    className="w-full text-sm text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all disabled:opacity-40"
                                />
                            </div>
                        </div>
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-[10px] leading-relaxed text-indigo-700">
                            <span className="font-bold">未勾选“启用随机概率”不代表条目没有激活。</span>
                            未勾选时会跳过随机判定：只要条目已启用且满足常驻／关键词条件，就会按 100% 通过；勾选后，才会在条件满足时按上方百分比再次随机判断。
                        </div>
                    </div>

                    <div className="bg-white rounded-[1.5rem] border border-slate-200/70 p-5 shadow-sm shadow-slate-200/40">
                        <div className="text-[11px] font-bold tracking-[0.14em] text-indigo-500 uppercase">设定内容</div>
                        <p className="text-[10px] text-slate-400 mt-1 mb-3">支持 Markdown；这里只填写实际需要注入模型的内容。</p>
                        <textarea
                            value={tempContent}
                            onChange={e => setTempContent(e.target.value)}
                            placeholder="在此输入详细的设定内容，支持 Markdown 格式..."
                            className="w-full h-80 bg-slate-50/80 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 leading-relaxed resize-none outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all font-mono"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorldbookEntryEditor;
