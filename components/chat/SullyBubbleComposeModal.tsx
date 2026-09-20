import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterProfile, Emoji, EmojiCategory, Message } from '../../types';
import TokenImg from '../os/TokenImg';
import { dryRunReprocessMessage, reprocessSourceToBubbles } from '../../utils/reprocessChatMessage';
import { resolveSullyAssistantChibi } from '../../utils/sullyAssistantAvatar';
import {
    SULLY_BUBBLE_COMPOSE_CANCEL,
    SULLY_BUBBLE_COMPOSE_CONFIRM,
    SULLY_BUBBLE_COMPOSE_PICK_EMOJI,
    SULLY_BUBBLE_COMPOSE_TITLE_ABOVE,
    SULLY_BUBBLE_COMPOSE_TITLE_BELOW,
    type SullyComposeKind,
    type SullyQuickComposeTemplate,
    sullyAssistantGreeting,
} from '../../utils/sullyAssistantCopy';
import { buildQuickComposeTemplates } from '../../utils/sullyComposeTemplates';
import SullyFormatSnippetsBar from './SullyFormatSnippetsBar';
import HtmlCard from './HtmlCard';

type Props = {
    open: boolean;
    position: 'before' | 'after';
    anchor: Message;
    char: CharacterProfile;
    characters: CharacterProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    activeCategory: string;
    onActiveCategoryChange: (categoryId: string) => void;
    translationEnabled: boolean;
    userName?: string;
    saving?: boolean;
    onClose: () => void;
    onSave: (bubbles: ReturnType<typeof reprocessSourceToBubbles>) => Promise<void>;
};

const SullyBubbleComposeModal: React.FC<Props> = ({
    open,
    position,
    anchor,
    char,
    characters,
    emojis,
    categories,
    activeCategory,
    onActiveCategoryChange,
    translationEnabled,
    userName,
    saving = false,
    onClose,
    onSave,
}) => {
    const chibi = useMemo(() => resolveSullyAssistantChibi(characters), [characters]);
    const quickTemplates = useMemo(
        () => buildQuickComposeTemplates(translationEnabled),
        [translationEnabled],
    );
    const [quickId, setQuickId] = useState('plain');
    const [composeKind, setComposeKind] = useState<SullyComposeKind>('plain');
    const [body, setBody] = useState('');
    const [selectedEmojiName, setSelectedEmojiName] = useState<string | null>(null);
    const sourceRef = useRef<HTMLTextAreaElement>(null);

    const emojisInCategory = useMemo(() => emojis.filter(e => {
        if (activeCategory === 'default') return !e.categoryId || e.categoryId === 'default';
        return e.categoryId === activeCategory;
    }), [emojis, activeCategory]);

    useEffect(() => {
        if (!open) return;
        const plain = quickTemplates[0];
        setQuickId(plain?.id ?? 'plain');
        setComposeKind(plain?.composeKind ?? 'plain');
        setBody('');
        setSelectedEmojiName(null);
    }, [open, anchor.id, quickTemplates]);

    const selectQuick = useCallback((t: SullyQuickComposeTemplate) => {
        setQuickId(t.id);
        setComposeKind(t.composeKind);
        setSelectedEmojiName(null);
        if (t.composeKind === 'plain') {
            setBody('');
        } else if (t.composeKind === 'emoji') {
            setBody('');
        } else {
            setBody(t.prefill);
            requestAnimationFrame(() => sourceRef.current?.focus());
        }
    }, []);

    const pickEmoji = useCallback((name: string) => {
        setSelectedEmojiName(name);
        setBody(`[[SEND_EMOJI: ${name}]]`);
        setComposeKind('emoji');
        setQuickId('emoji');
    }, []);

    const insertAdvanced = useCallback((text: string) => {
        const ta = sourceRef.current;
        const start = ta?.selectionStart ?? body.length;
        const end = ta?.selectionEnd ?? start;
        setBody(body.slice(0, start) + text + body.slice(end));
        setComposeKind('plain');
        setQuickId('plain');
        setSelectedEmojiName(null);
    }, [body]);

    const effectiveSource = useMemo(() => {
        if (composeKind === 'emoji' && selectedEmojiName) {
            return `[[SEND_EMOJI: ${selectedEmojiName}]]`;
        }
        if (composeKind === 'emoji' && body.trim() && !body.includes('SEND_EMOJI')) {
            return `[[SEND_EMOJI: ${body.trim()}]]`;
        }
        return body;
    }, [body, composeKind, selectedEmojiName]);

    const previewMessages = useMemo(() => {
        if (!effectiveSource.trim() && composeKind === 'plain') return [];
        return dryRunReprocessMessage(anchor, {
            char,
            emojis,
            categories,
            source: effectiveSource,
            composeKind: composeKind === 'plain' ? 'plain' : undefined,
        });
    }, [effectiveSource, composeKind, anchor, char, emojis, categories]);

    const handleSave = async () => {
        const trimmed = effectiveSource.trim();
        if (!trimmed && composeKind === 'plain') return;
        const bubbles = reprocessSourceToBubbles({
            char,
            emojis,
            categories,
            source: trimmed,
            role: anchor.role,
            composeKind: composeKind === 'plain' ? 'plain' : undefined,
        });
        if (!bubbles.length) return;
        await onSave(bubbles);
    };

    const placeholder = quickTemplates.find(t => t.id === quickId)?.placeholder
        ?? quickTemplates[0]?.placeholder;

    const canSave = composeKind === 'emoji'
        ? !!(selectedEmojiName || body.trim())
        : !!body.trim();

    if (!open) return null;

    const title = position === 'before' ? SULLY_BUBBLE_COMPOSE_TITLE_ABOVE : SULLY_BUBBLE_COMPOSE_TITLE_BELOW;

    return (
        <div className="fixed inset-0 z-[500] flex flex-col bg-slate-50 animate-fade-in touch-manipulation">
            <div
                className="shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3"
                style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}
            >
                <TokenImg value={chibi.img} className="w-10 h-10 object-contain" alt="" />
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm">{title}</div>
                    <div className="text-[11px] text-slate-500 truncate">{sullyAssistantGreeting(userName)}</div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <SullyFormatSnippetsBar
                    mode="quick"
                    templates={quickTemplates}
                    selectedQuickId={quickId}
                    onSelectQuick={selectQuick}
                    onInsertAdvanced={insertAdvanced}
                />
                {composeKind === 'emoji' && (
                    <div>
                        <div className="text-xs font-medium text-slate-500 mb-2">{SULLY_BUBBLE_COMPOSE_PICK_EMOJI}</div>
                        {categories.length > 0 && (
                            <div
                                className="flex gap-2 overflow-x-auto no-scrollbar mb-2 pb-1"
                                style={{ touchAction: 'pan-x' }}
                            >
                                {categories.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => onActiveCategoryChange(cat.id)}
                                        className={`px-3 py-1 text-xs rounded-full whitespace-nowrap shrink-0 border transition-colors ${
                                            activeCategory === cat.id
                                                ? 'bg-violet-600 text-white border-violet-600'
                                                : 'bg-white text-slate-600 border-slate-200'
                                        }`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-5 gap-2 max-h-[200px] overflow-y-auto p-2 rounded-2xl border border-slate-200 bg-white">
                            {emojisInCategory.length === 0 && (
                                <p className="col-span-5 text-xs text-slate-400 text-center py-4">这个分组里还没有表情</p>
                            )}
                            {emojisInCategory.map(e => (
                                <button
                                    key={e.name}
                                    type="button"
                                    title={e.name}
                                    onClick={() => pickEmoji(e.name)}
                                    className={`flex flex-col items-center p-1 rounded-xl border ${
                                        selectedEmojiName === e.name
                                            ? 'border-violet-500 ring-2 ring-violet-200'
                                            : 'border-transparent'
                                    }`}
                                >
                                    <TokenImg value={e.url} className="w-10 h-10 object-contain" alt="" />
                                    <span className="text-[9px] truncate w-full text-center text-slate-500 mt-0.5">{e.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <textarea
                    ref={sourceRef}
                    value={body}
                    onChange={e => {
                        setBody(e.target.value);
                        if (composeKind === 'emoji') setSelectedEmojiName(null);
                    }}
                    placeholder={placeholder}
                    className="w-full min-h-[120px] text-sm p-3 rounded-2xl border border-slate-200 bg-white leading-relaxed resize-y font-mono"
                    spellCheck={false}
                />
                <div>
                    <div className="text-xs font-medium text-slate-500 mb-2">预览</div>
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 min-h-[60px]">
                        {previewMessages.length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-3">还没有字……</p>
                        )}
                        {previewMessages.map(pm => (
                            <div key={`${pm.type}-${pm.content.slice(0, 16)}`} className="text-sm">
                                {pm.type === 'html_card' && pm.metadata?.htmlSource ? (
                                    <HtmlCard html={pm.metadata.htmlSource} />
                                ) : pm.type === 'emoji' ? (
                                    <TokenImg value={pm.content} className="w-20 h-20 object-contain" alt="" />
                                ) : (
                                    <div className="px-3 py-2 rounded-2xl bg-slate-100 text-slate-800 whitespace-pre-wrap break-words">
                                        {pm.content}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
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
                    {SULLY_BUBBLE_COMPOSE_CANCEL}
                </button>
                <button
                    type="button"
                    disabled={saving || !canSave}
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-2xl bg-violet-600 text-white font-bold disabled:opacity-50"
                >
                    {saving ? '猫儿在加……' : SULLY_BUBBLE_COMPOSE_CONFIRM}
                </button>
            </div>
        </div>
    );
};

export default SullyBubbleComposeModal;
