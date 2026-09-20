import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { APIConfig, CharacterProfile, Emoji, EmojiCategory, Message } from '../../types';
import type { SullyRepairPreviewContext } from './SullyRepairPreviewPane';
import TokenImg from '../os/TokenImg';
import type { SullyRepairPreviewSegment } from '../../utils/sullyRepairPreview';
import { messageToEditSource } from '../../utils/sullyMessageSource';
import { mergeMessagesToEditSource } from '../../utils/sullyChatNeighbors';
import { resolveSullyAssistantChibi } from '../../utils/sullyAssistantAvatar';
import {
    SULLY_AI_REPAIR_CANCEL,
    SULLY_AI_REPAIR_INPUT_PLACEHOLDER,
    SULLY_AI_REPAIR_PARSE_FAIL,
    SULLY_AI_REPAIR_PREFS_TITLE,
    SULLY_AI_REPAIR_SAVE,
    SULLY_AI_REPAIR_MERGED_LABEL,
    SULLY_AI_REPAIR_SEND,
    SULLY_AI_REPAIR_STREAM_OK,
    SULLY_AI_REPAIR_STREAM_WAIT,
    SULLY_AI_REPAIR_TITLE,
    SULLY_AI_REPAIR_WORKING,
} from '../../utils/sullyAssistantCopy';
import { runSullyRepairRound, type SullyRepairStreamPhase } from '../../utils/sullyRepairApi';
import type { SullyRepairChatTurn } from '../../utils/sullyRepairPrompt';
import {
    inferRepairFormatKind,
    isRepairedSourcePlausible,
    postProcessRepairedSource,
} from '../../utils/sullyRepairPostProcess';
import SullyRepairPreviewPane from './SullyRepairPreviewPane';

import type { SullyAiRepairResumeSession, SullyAiRepairUiBubble } from '../../utils/sullyAiRepairSession';

export type AiRepairChatBubble = SullyAiRepairUiBubble;

const EMPTY_SOURCE_MESSAGES: Message[] = [];

export type SullyAiRepairSavePayload = {
    source: string;
    insertAbove?: string;
    insertBelow?: string;
    resumeSession: SullyAiRepairResumeSession;
};

type Props = {
    open: boolean;
    message: Message | null;
    char: CharacterProfile;
    characters: CharacterProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    apiConfig: APIConfig;
    userName?: string;
    preview: SullyRepairPreviewContext;
    saving?: boolean;
    /** 多选合并进同一次任务时的全部泡 */
    sourceMessages?: Message[];
    onClose: () => void;
    onSave: (payload: SullyAiRepairSavePayload) => Promise<void>;
    onOpenPrefs: () => void;
    /** 保存后「重新编辑」时注入，与 resumeToken 一起变化才 hydrate */
    resumeSession?: SullyAiRepairResumeSession | null;
    resumeToken?: number;
};

const SullyAiRepairModal: React.FC<Props> = ({
    open,
    message,
    char,
    characters,
    emojis,
    categories,
    apiConfig,
    userName,
    preview,
    saving = false,
    sourceMessages,
    onClose,
    onSave,
    onOpenPrefs,
    resumeSession = null,
    resumeToken = 0,
}) => {
    const chibi = useMemo(() => resolveSullyAssistantChibi(characters), [characters]);
    const [draftSource, setDraftSource] = useState('');
    const [input, setInput] = useState('');
    const [bubbles, setBubbles] = useState<AiRepairChatBubble[]>([]);
    const [priorTurns, setPriorTurns] = useState<SullyRepairChatTurn[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [lastUserGoal, setLastUserGoal] = useState('');
    const [insertAbove, setInsertAbove] = useState('');
    const [insertBelow, setInsertBelow] = useState('');
    const [streamPhase, setStreamPhase] = useState<SullyRepairStreamPhase>('idle');

    const picks = sourceMessages && sourceMessages.length > 0 ? sourceMessages : EMPTY_SOURCE_MESSAGES;
    const mergedFromCount = picks.length > 1 ? picks.length : 0;
    const pickIdsKey = mergedFromCount > 0
        ? picks.map(m => m.id).sort((a, b) => a - b).join(',')
        : '';

    useEffect(() => {
        if (!open || !message) return;
        if (
            resumeSession
            && resumeSession.anchorMessageId === message.id
            && resumeSession.charId === char.id
        ) {
            setDraftSource(resumeSession.draftSource);
            setPriorTurns(resumeSession.priorTurns);
            setBubbles(resumeSession.uiBubbles);
            setInsertAbove(resumeSession.insertAbove);
            setInsertBelow(resumeSession.insertBelow);
            setLastUserGoal(resumeSession.lastUserGoal);
            setInput('');
            setShowSource(false);
            setStreamPhase('idle');
            return;
        }
        const source = mergedFromCount > 0
            ? mergeMessagesToEditSource(picks, emojis)
            : messageToEditSource(message, emojis);
        setDraftSource(source);
        setInput('');
        setBubbles([]);
        setPriorTurns([]);
        setShowSource(false);
        setLastUserGoal('');
        setInsertAbove('');
        setInsertBelow('');
        setStreamPhase('idle');
    }, [open, message?.id, mergedFromCount, pickIdsKey, emojis.length, char.id, resumeToken, resumeSession]);

    const previewSegments = useMemo((): SullyRepairPreviewSegment[] => {
        if (!message || !draftSource.trim()) return [];
        const mk = (key: string, label: string, raw: string): SullyRepairPreviewSegment | null => {
            const trimmed = raw.trim();
            if (!trimmed) return null;
            const kind = inferRepairFormatKind(trimmed);
            const source = postProcessRepairedSource(trimmed, kind, { userGoal: lastUserGoal });
            return { key, label, source };
        };
        const anchorLabel = mergedFromCount > 1 ? `合并锚点（${mergedFromCount} 条）` : '锚点泡';
        return [
            mk('above', '上方新泡', insertAbove),
            mk('anchor', anchorLabel, draftSource),
            mk('below', '下方新泡', insertBelow),
        ].filter((s): s is SullyRepairPreviewSegment => s !== null);
    }, [message, draftSource, insertAbove, insertBelow, mergedFromCount, lastUserGoal]);

    const sendGoal = useCallback(async () => {
        if (!message || loading) return;
        const goal = input.trim();
        const userBubble: AiRepairChatBubble = {
            id: `u-${Date.now()}`,
            role: 'user',
            text: goal || '（让猫儿自己判断怎么修）',
        };
        setBubbles(prev => [...prev, userBubble]);
        setLastUserGoal(goal);
        setInput('');
        setLoading(true);
        setStreamPhase('waiting');
        try {
            const result = await runSullyRepairRound({
                apiConfig,
                displayName: userName || '',
                draftSource,
                userGoal: goal,
                priorTurns,
                charId: char.id,
                htmlModeCustomPrompt: char.htmlModeCustomPrompt,
                chatVoice: {
                    chatVoiceEnabled: char.chatVoiceEnabled,
                    chatVoiceLang: char.chatVoiceLang,
                },
                emojis,
                categories,
                onStreamPhase: setStreamPhase,
            });
            const assistantText = result.reply
                || (result.fixedSource || result.insertAbove || result.insertBelow
                    ? '……猫儿修好了，预览里瞅一眼？'
                    : SULLY_AI_REPAIR_PARSE_FAIL);
            setBubbles(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: assistantText }]);
            setPriorTurns(prev => [
                ...prev,
                { role: 'user', content: goal || '（未指定目标，请继续按规则修当前稿）' },
                { role: 'assistant', content: result.reply || assistantText },
            ]);
            if (result.insertAbove) setInsertAbove(result.insertAbove);
            if (result.insertBelow) setInsertBelow(result.insertBelow);
            if (result.fixedSource) {
                const kind = inferRepairFormatKind(draftSource);
                const cleaned = postProcessRepairedSource(result.fixedSource, kind, { userGoal: goal });
                if (kind !== 'html' || isRepairedSourcePlausible(cleaned, draftSource)) {
                    setDraftSource(cleaned);
                } else {
                    setBubbles(prev => [...prev, {
                        id: `a-warn-${Date.now()}`,
                        role: 'assistant',
                        text: '……这稿不像卡片源码……猫儿没敢动预览，再跟猫儿说一次？',
                    }]);
                }
            }
        } catch (e) {
            console.warn('[SullyAiRepair]', e);
            setBubbles(prev => [...prev, {
                id: `a-err-${Date.now()}`,
                role: 'assistant',
                text: '……猫儿够不着模型了……去设置里看看辅助 API？',
            }]);
        } finally {
            setLoading(false);
            setStreamPhase('idle');
        }
    }, [message, loading, input, apiConfig, userName, draftSource, priorTurns, char, emojis, categories]);

    const handleSave = () => {
        if (!message) return;
        const kind = inferRepairFormatKind(draftSource);
        const cleaned = postProcessRepairedSource(draftSource, kind, { userGoal: lastUserGoal });
        void onSave({
            source: cleaned,
            insertAbove: insertAbove.trim() || undefined,
            insertBelow: insertBelow.trim() || undefined,
            resumeSession: {
                charId: char.id,
                anchorMessageId: message.id,
                priorTurns,
                uiBubbles: bubbles,
                draftSource: cleaned,
                insertAbove: insertAbove.trim(),
                insertBelow: insertBelow.trim(),
                lastUserGoal,
            },
        });
    };

    if (!open || !message) return null;

    const sourceSnippet = draftSource.length > 120 ? `${draftSource.slice(0, 120)}…` : draftSource;

    return (
        <div className="fixed inset-0 z-[510] flex flex-col bg-gradient-to-b from-violet-50 to-slate-50 animate-fade-in touch-manipulation">
            <style>{`
                @keyframes sullyPawTap {
                    0%, 100% { transform: translateY(0) rotate(-8deg); }
                    50% { transform: translateY(-4px) rotate(8deg); }
                }
                .sully-paw-busy { animation: sullyPawTap 0.55s ease-in-out infinite; display: inline-block; }
                .sully-paw-busy:nth-child(2) { animation-delay: 0.12s; }
                .sully-paw-busy:nth-child(3) { animation-delay: 0.24s; }
            `}</style>
            <div
                className="shrink-0 px-4 py-3 border-b border-violet-100 bg-white/90 flex items-center gap-3"
                style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}
            >
                <TokenImg value={chibi.img} className="w-10 h-10 object-contain" alt="" />
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm">
                        {SULLY_AI_REPAIR_TITLE}
                        {mergedFromCount > 1 && (
                            <span className="ml-2 text-[11px] font-medium text-violet-500">
                                {SULLY_AI_REPAIR_MERGED_LABEL(mergedFromCount)}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowSource(v => !v)}
                        className="text-[10px] text-violet-500 truncate text-left w-full"
                    >
                        {showSource ? draftSource : sourceSnippet}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onOpenPrefs}
                    className="text-[11px] text-violet-600 px-2 py-1 rounded-full bg-violet-50 border border-violet-100 shrink-0"
                >
                    {SULLY_AI_REPAIR_PREFS_TITLE}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {bubbles.length === 0 && (
                    <p className="text-center text-xs text-violet-400/80 py-6 leading-relaxed">
                        跟猫儿说这次要修什么……也能说在锚点上下加表情或 HTML 卡
                    </p>
                )}
                {bubbles.map(b => (
                    <div key={b.id} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start gap-2'}`}>
                        {b.role === 'assistant' && (
                            <TokenImg value={chibi.img} className="w-8 h-8 object-contain shrink-0 mt-0.5" alt="" />
                        )}
                        <div
                            className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                                b.role === 'user'
                                    ? 'bg-violet-600 text-white rounded-br-md'
                                    : 'bg-white border border-violet-100 text-slate-700 rounded-bl-md'
                            }`}
                        >
                            {b.text}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex items-start gap-2 pl-0.5">
                        <div className="relative shrink-0">
                            <TokenImg value={chibi.img} className="w-10 h-10 object-contain" alt="" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-gradient-to-br from-white to-violet-50 border border-violet-200 shadow-sm">
                            <p className="text-sm text-violet-800 font-medium">
                                {streamPhase === 'streaming' ? SULLY_AI_REPAIR_STREAM_OK : SULLY_AI_REPAIR_WORKING}
                            </p>
                            {streamPhase === 'waiting' && (
                                <p className="text-[10px] text-violet-500/90 mt-1">{SULLY_AI_REPAIR_STREAM_WAIT}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-lg leading-none" aria-hidden>
                                <span className="sully-paw-busy">🐾</span>
                                <span className="sully-paw-busy">🐾</span>
                                <span className="sully-paw-busy">🐾</span>
                            </div>
                            <p className="text-[10px] text-violet-500/90 mt-2">只动格式，剧情猫儿不敢碰</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="shrink-0 px-4 pb-2">
                {message && (
                    <SullyRepairPreviewPane
                        anchorMessage={message}
                        segments={previewSegments}
                        char={char}
                        emojis={emojis}
                        categories={categories}
                        preview={preview}
                        className="mb-2"
                    />
                )}
                <div className="flex gap-2">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={SULLY_AI_REPAIR_INPUT_PLACEHOLDER}
                        className="flex-1 px-3 py-2.5 rounded-2xl border border-violet-200 bg-white text-sm"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGoal(); } }}
                    />
                    <button
                        type="button"
                        disabled={loading}
                        onClick={sendGoal}
                        className="shrink-0 px-4 py-2.5 rounded-2xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50"
                    >
                        {SULLY_AI_REPAIR_SEND}
                    </button>
                </div>
            </div>

            <div
                className="shrink-0 px-4 py-3 border-t border-slate-200 bg-white flex gap-3"
                style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
            >
                <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-medium">
                    {SULLY_AI_REPAIR_CANCEL}
                </button>
                <button
                    type="button"
                    disabled={saving || (!draftSource.trim() && !insertAbove.trim() && !insertBelow.trim())}
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-2xl bg-violet-600 text-white font-bold disabled:opacity-50"
                >
                    {saving ? SULLY_AI_REPAIR_WORKING : SULLY_AI_REPAIR_SAVE}
                </button>
            </div>
        </div>
    );
};

export default SullyAiRepairModal;
