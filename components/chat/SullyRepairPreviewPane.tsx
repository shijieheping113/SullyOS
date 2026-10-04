import React, { useState } from 'react';
import type { CharacterProfile, ChatTheme, Emoji, EmojiCategory, Message } from '../../types';
import MessageItem from './MessageItem';
import { dryRunReprocessMessage } from '../../utils/reprocessChatMessage';
import {
    repairPreviewNeedsRawSource,
    type SullyRepairPreviewSegment,
} from '../../utils/sullyRepairPreview';

export type SullyRepairPreviewContext = {
    activeTheme: ChatTheme;
    userAvatar: string;
    moduleAlign?: 'anchor' | 'center';
    translationEnabled?: boolean;
};

type Props = {
    anchorMessage: Message;
    segments: SullyRepairPreviewSegment[];
    char: CharacterProfile;
    emojis: Emoji[];
    categories: EmojiCategory[];
    preview: SullyRepairPreviewContext;
    hint?: string;
    emptyLabel?: string;
    className?: string;
};

const noop = () => {};

const RepairRawSourcePanel: React.FC<{ label: string; source: string }> = ({ label, source }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="mb-2 rounded-xl border border-violet-200/90 bg-white px-3 py-2.5 shadow-sm">
            <div className="text-[10px] font-medium text-violet-500 mb-1.5">{label}</div>
            <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                聊天里的语音条会洗掉语气标注，这里看修好的源码。
            </p>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="text-xs font-medium text-violet-700 underline underline-offset-2 active:opacity-70"
            >
                {open ? '收起' : '点击查看原文'}
            </button>
            {open && (
                <pre
                    className="mt-2 max-h-40 overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all text-slate-800 bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100"
                >
                    {source}
                </pre>
            )}
        </div>
    );
};

/** 修格式预览：语音/翻译段显示可展开的源码；其余仍用 MessageItem */
const SullyRepairPreviewPane: React.FC<Props> = ({
    anchorMessage,
    segments,
    char,
    emojis,
    categories,
    preview,
    hint = '语音、翻译段请点「查看原文」核对语气标注',
    emptyLabel = '还没有预览',
    className = '',
}) => {
    const hasAny = segments.some(s => s.source.trim());

    return (
        <div
            className={`rounded-2xl border border-violet-100/80 bg-[#f1f5f9] p-2 max-h-[32vh] max-w-full min-w-0 overflow-y-auto overflow-x-hidden shadow-inner ${className}`}
        >
            <p className="text-[10px] text-slate-500 mb-2 text-center leading-relaxed px-1">{hint}</p>
            {!hasAny ? (
                <p className="text-xs text-slate-400 text-center py-4">{emptyLabel}</p>
            ) : (
                <div>
                    {segments.filter(s => s.source.trim()).map(seg => {
                        if (repairPreviewNeedsRawSource(seg.source)) {
                            return (
                                <RepairRawSourcePanel
                                    key={seg.key}
                                    label={seg.label}
                                    source={seg.source}
                                />
                            );
                        }
                        const messages = dryRunReprocessMessage(anchorMessage, {
                            char,
                            emojis,
                            categories,
                            source: seg.source,
                        });
                        return messages.map((pm, i) => (
                            <div key={`${seg.key}-${i}`} className="pointer-events-none select-none mb-1">
                                {seg.label && i === 0 && (
                                    <div className="text-[10px] text-violet-400 mb-0.5 px-1">{seg.label}</div>
                                )}
                                <MessageItem
                                    msg={pm}
                                    isFirstInGroup
                                    isLastInGroup={i === messages.length - 1}
                                    activeTheme={preview.activeTheme}
                                    charAvatar={char.avatar}
                                    charName={char.name}
                                    userAvatar={preview.userAvatar}
                                    moduleAlign={preview.moduleAlign ?? 'center'}
                                    translationEnabled={false}
                                    onLongPress={noop}
                                    onReply={noop}
                                    selectionMode={false}
                                    isSelected={false}
                                    onToggleSelect={noop}
                                    suppressEntranceAnimation
                                />
                            </div>
                        ));
                    })}
                </div>
            )}
        </div>
    );
};

export default SullyRepairPreviewPane;
