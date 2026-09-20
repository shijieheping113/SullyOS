import React, { useEffect, useMemo, useState } from 'react';
import type { CharacterProfile } from '../../types';
import TokenImg from '../os/TokenImg';
import { resolveSullyAssistantChibi } from '../../utils/sullyAssistantAvatar';
import {
    SULLY_ASSISTANT_FEATURE_BUBBLE_SUB,
    SULLY_ASSISTANT_FEATURE_BUBBLE_TITLE,
    SULLY_ASSISTANT_FEATURE_EDIT_SUB,
    SULLY_ASSISTANT_FEATURE_EDIT_TITLE,
    SULLY_AI_REPAIR_SHEET_PREFS_LINK,
    SULLY_ASSISTANT_TAP_CAT_HINT,
    type SullyAssistantFeatureId,
    pickSullyAiRepairClickLine,
    sullyAssistantGreeting,
} from '../../utils/sullyAssistantCopy';

export type { SullyAssistantFeatureId };

export type SullyAssistantFeature = {
    id: SullyAssistantFeatureId;
    title: string;
    subtitle: string;
    enabled: boolean;
};

type Props = {
    open: boolean;
    characters: CharacterProfile[];
    userName?: string;
    hasRepairSeed: boolean;
    onClose: () => void;
    onSelectFeature: (id: SullyAssistantFeatureId) => void;
    onTapCatForAiRepair: () => void;
    onOpenRepairPrefs: () => void;
};

const TAP_HINT_KEY = 'sully_assistant_tap_cat_hint_seen';

const FEATURES: SullyAssistantFeature[] = [
    {
        id: 'edit-rerender',
        title: SULLY_ASSISTANT_FEATURE_EDIT_TITLE,
        subtitle: SULLY_ASSISTANT_FEATURE_EDIT_SUB,
        enabled: true,
    },
    {
        id: 'bubble-ops',
        title: SULLY_ASSISTANT_FEATURE_BUBBLE_TITLE,
        subtitle: SULLY_ASSISTANT_FEATURE_BUBBLE_SUB,
        enabled: true,
    },
];

const SullyAssistantSheet: React.FC<Props> = ({
    open,
    characters,
    userName,
    hasRepairSeed,
    onClose,
    onSelectFeature,
    onTapCatForAiRepair,
    onOpenRepairPrefs,
}) => {
    const chibi = useMemo(() => resolveSullyAssistantChibi(characters), [characters]);
    const [showTapHint, setShowTapHint] = useState(false);

    useEffect(() => {
        if (!open) return;
        try {
            const seen = localStorage.getItem(TAP_HINT_KEY);
            setShowTapHint(!seen);
        } catch {
            setShowTapHint(true);
        }
    }, [open]);

    const handleTapCat = () => {
        try { localStorage.setItem(TAP_HINT_KEY, '1'); } catch { /* */ }
        setShowTapHint(false);
        onTapCatForAiRepair();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center animate-fade-in touch-manipulation">
            <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
            <div
                className="relative w-full max-w-md bg-gradient-to-b from-[#1a1228] to-[#120c1c] text-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden animate-slide-up max-h-[88vh] flex flex-col"
                style={{ paddingBottom: 'max(1.25rem, var(--safe-bottom))' }}
            >
                <style>{`
                    @keyframes sullyOrbit { to { transform: rotate(360deg); } }
                    @keyframes sullyFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
                    @keyframes sullyHintPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
                    .sully-asst-orbit {
                        width: 140px; height: 140px; margin: 12px auto 4px; position: relative;
                        display: grid; place-items: center;
                    }
                    .sully-asst-orbit::before, .sully-asst-orbit::after {
                        content: ""; position: absolute; border-radius: 999px; inset: 14px;
                        border: 1px solid rgba(216, 193, 255, .22);
                        animation: sullyOrbit 9s linear infinite;
                    }
                    .sully-asst-orbit::after { inset: 0; border-style: dashed; animation-duration: 14s; animation-direction: reverse; }
                    .sully-asst-image {
                        max-width: 112px; max-height: 112px; object-fit: contain;
                        filter: drop-shadow(0 10px 24px rgba(152, 114, 222, .35));
                        animation: sullyFloat 4.6s ease-in-out infinite;
                    }
                    .sully-tap-hint { animation: sullyHintPulse 2.4s ease-in-out infinite; }
                `}</style>
                <div className="px-6 pt-5 pb-2 flex items-center justify-between">
                    <h2 className="text-lg font-bold tracking-wide">猫儿小助手</h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onOpenRepairPrefs}
                            className="text-[11px] text-violet-200/70 px-2 py-1 rounded-full hover:bg-white/10"
                        >
                            {SULLY_AI_REPAIR_SHEET_PREFS_LINK}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-sm text-white/50 px-3 py-1 rounded-full hover:bg-white/10"
                        >
                            先不用
                        </button>
                    </div>
                </div>
                <div className="px-6 pb-6 overflow-y-auto flex-1">
                    <div className="flex flex-col items-center">
                        {(showTapHint || hasRepairSeed) && (
                            <p className="text-center text-[11px] text-violet-100/90 mb-3 px-4 py-2 rounded-2xl bg-violet-500/15 border border-violet-300/20 leading-relaxed sully-tap-hint max-w-[280px]">
                                {SULLY_ASSISTANT_TAP_CAT_HINT}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={handleTapCat}
                            className="sully-asst-orbit w-full border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-full"
                            aria-label="点猫儿帮你修格式"
                        >
                            <TokenImg value={chibi.img} className="sully-asst-image pointer-events-none" alt="" />
                        </button>
                    </div>
                    <p className="text-center text-sm text-violet-100/70 leading-relaxed mb-6 px-2">
                        {sullyAssistantGreeting(userName)}
                    </p>
                    <div className="space-y-3">
                        {FEATURES.filter(f => f.enabled).map(f => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => onSelectFeature(f.id)}
                                className="w-full text-left p-4 rounded-2xl bg-white/8 border border-white/10 active:scale-[0.99] transition-transform hover:bg-white/12"
                            >
                                <div className="font-semibold text-[15px]">{f.title}</div>
                                <div className="text-xs text-white/55 mt-1.5 leading-relaxed">{f.subtitle}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SullyAssistantSheet;
