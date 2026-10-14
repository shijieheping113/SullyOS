import React, { useEffect, useRef, useState } from 'react';
import type { CharacterBuff } from '../../types';

type Props = {
    open: boolean;
    onClose: () => void;
    text: string;
    charName?: string;
    /** 传入时才启用翻面。不传则仍是原来的心里话浮层。 */
    emotions?: CharacterBuff[];
};

const intensityLabel = (intensity: CharacterBuff['intensity']) =>
    intensity === 1 ? '轻微' : intensity === 2 ? '中等' : '强烈';

const exitButtonClass = 'shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-white/80 text-slate-500 border border-black/10 active:scale-95 transition';
const noteFont = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif';

export function EmotionNoteList({ emotions }: { emotions: CharacterBuff[] }) {
    if (emotions.length === 0) {
        return <p className="px-1 py-4 text-center text-[12px] text-[#8e8e93]">还没有情绪</p>;
    }
    return (
        <ul data-emotion-notes="" className="overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_0.5px_rgba(60,60,67,0.18)]">
            {emotions.map((buff, index) => (
                <li key={buff.id} className="flex items-start gap-2 pl-2.5">
                    <span className="mt-[9px] h-[14px] w-[14px] shrink-0 rounded-full border-[1.5px] border-[#ffcc00] bg-white" aria-hidden />
                    <div className={`min-w-0 flex-1 py-1.5 pr-2.5 ${index === emotions.length - 1 ? '' : 'border-b border-[#c6c6c8]'}`}>
                        <p className="text-[12px] leading-snug text-[#1c1c1e] break-words" style={{ fontFamily: noteFont }}>
                            {buff.emoji ? `${buff.emoji} ` : ''}{buff.label}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-[#8e8e93] break-words">
                            {intensityLabel(buff.intensity)}{buff.description ? ` · ${buff.description}` : ''}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** 私聊专用：小巧可爱的「心里话」浮层（与查手机大卡分离）。点一下只翻一次。 */
/** 滑动、以及翻面后立刻跟来的那下点击，都不算翻面。 */
export function shouldPeekFlip(moved: boolean, now: number, lockUntil: number, targetIsExit: boolean): boolean {
    if (targetIsExit || moved || now < lockUntil) return false;
    return true;
}

const ChatInnerStatePeek: React.FC<Props> = ({ open, onClose, text, charName, emotions }) => {
    const [showList, setShowList] = useState(false);
    const onCloseRef = useRef(onClose);
    const gestureRef = useRef({ x: 0, y: 0, moved: false });
    const lockUntilRef = useRef(0);
    onCloseRef.current = onClose;
    useEffect(() => {
        if (!open) return;
        setShowList(false);
        lockUntilRef.current = 0;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCloseRef.current();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) return null;

    const shell = 'relative mx-3 mb-[max(5.5rem,env(safe-area-inset-bottom))] pointer-events-auto';

    if (!emotions) {
        return (
            <div className="fixed inset-0 z-[130] flex flex-col justify-end pointer-events-none">
                <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/15 pointer-events-auto transition-opacity duration-200"
                    aria-label="关闭"
                    onClick={onClose}
                />
                <div className={shell} role="dialog" aria-modal="true" aria-labelledby="chat-inner-peek-title">
                    <div
                        className="rounded-[1.35rem] border border-white/70 shadow-[0_12px_40px_rgba(167,139,250,0.22)] overflow-hidden"
                        style={{
                            background: 'linear-gradient(145deg, rgba(255,255,255,0.94) 0%, rgba(255,247,252,0.92) 55%, rgba(245,240,255,0.94) 100%)',
                            backdropFilter: 'blur(14px)',
                            WebkitBackdropFilter: 'blur(14px)',
                        }}
                    >
                        <div className="px-3.5 pt-3 pb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[11px] text-pink-400" aria-hidden>♡</span>
                                <p id="chat-inner-peek-title" className="text-[12px] font-semibold text-violet-600/90 truncate">
                                    {charName ? `${charName} 的心里话` : '心里话'}
                                </p>
                            </div>
                            <button type="button" onClick={onClose} className="shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-white/70 text-violet-500 border border-violet-100 active:scale-95 transition">
                                收起
                            </button>
                        </div>
                        <div className="px-3.5 pb-3.5 max-h-[38vh] overflow-y-auto no-scrollbar">
                            <p className="text-[13px] leading-[1.75] text-slate-600/95 whitespace-pre-wrap" style={{ fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif' }}>
                                {text}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const leave = (event: React.MouseEvent) => {
        event.stopPropagation();
        onCloseRef.current();
    };
    const flip = (event: React.MouseEvent) => {
        event.stopPropagation();
        const targetIsExit = !!(event.target as HTMLElement).closest('[data-peek-exit]');
        if (!shouldPeekFlip(gestureRef.current.moved, Date.now(), lockUntilRef.current, targetIsExit)) {
            gestureRef.current.moved = false;
            return;
        }
        lockUntilRef.current = Date.now() + 500;
        setShowList(value => !value);
    };

    return (
        <div className="fixed inset-0 z-[130] flex flex-col justify-end pointer-events-none">
            <style>{'@keyframes sullyPeekIn{from{transform:rotateY(78deg);opacity:.45}to{transform:none;opacity:1}}'}</style>
            <button
                type="button"
                className="absolute inset-0 bg-slate-900/15 pointer-events-auto transition-opacity duration-200"
                aria-label="关闭"
                onClick={() => onCloseRef.current()}
            />
            <div className={`${shell} z-10`} role="dialog" aria-modal="true" aria-labelledby="chat-inner-peek-title">
                <div className="[perspective:1100px]">
                    <div
                        className="rounded-[1.35rem]"
                        onPointerDown={(event) => {
                            gestureRef.current = { x: event.clientX, y: event.clientY, moved: false };
                        }}
                        onPointerMove={(event) => {
                            const gesture = gestureRef.current;
                            if (Math.abs(event.clientX - gesture.x) > 8 || Math.abs(event.clientY - gesture.y) > 8) gesture.moved = true;
                        }}
                        onClick={flip}
                    >
                        {showList ? (
                            <div key="list" className="flex flex-col overflow-hidden rounded-[1.35rem] bg-[#fffdf8] shadow-[0_12px_40px_rgba(60,40,20,0.16)] [animation:sullyPeekIn_240ms_ease]">
                                <div className="h-[3px] bg-[#ffcc00]" />
                                <div className="px-3.5 pt-2.5 pb-1 flex items-center justify-between gap-2">
                                    <p className="text-[13px] font-semibold text-[#1c1c1e]" style={{ fontFamily: noteFont }}>情绪</p>
                                    <button type="button" data-peek-exit="" onClick={leave} className={exitButtonClass}>退出</button>
                                </div>
                                <div
                                    data-emotion-scroll=""
                                    className="max-h-[40vh] overflow-y-auto overscroll-contain px-3 pb-3"
                                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                                    onScroll={() => { gestureRef.current.moved = true; }}
                                >
                                    <EmotionNoteList emotions={emotions} />
                                </div>
                            </div>
                        ) : (
                            <div
                                key="thought"
                                className="overflow-hidden rounded-[1.35rem] border border-white/70 shadow-[0_12px_40px_rgba(167,139,250,0.22)] [animation:sullyPeekIn_240ms_ease]"
                                style={{
                                    background: 'linear-gradient(145deg, rgba(255,255,255,0.94) 0%, rgba(255,247,252,0.92) 55%, rgba(245,240,255,0.94) 100%)',
                                    backdropFilter: 'blur(14px)',
                                    WebkitBackdropFilter: 'blur(14px)',
                                }}
                            >
                                <div className="px-3.5 pt-3 pb-1 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-[11px] text-pink-400" aria-hidden>♡</span>
                                        <p id="chat-inner-peek-title" className="text-[12px] font-semibold text-violet-600/90 truncate">
                                            {charName ? `${charName} 的心里话` : '心里话'}
                                        </p>
                                    </div>
                                    <button type="button" data-peek-exit="" onClick={leave} className={exitButtonClass}>退出</button>
                                </div>
                                <div
                                    className="max-h-[40vh] overflow-y-auto overscroll-contain px-3.5 pb-3.5"
                                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                                    onScroll={() => { gestureRef.current.moved = true; }}
                                >
                                    <p className="text-[13px] leading-[1.75] text-slate-600/95 whitespace-pre-wrap break-words" style={{ fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif' }}>
                                        {text || '还没有心里话'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatInnerStatePeek;
