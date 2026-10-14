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
        <ul data-emotion-notes="" className="overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_0.5px_rgba(60,60,67,0.16)]">
            {emotions.map((buff, index) => {
                const color = buff.color || '#1c1c1e';
                return (
                    <li key={buff.id} className="flex items-start gap-2.5 pl-3">
                        <span className="mt-[11px] h-[15px] w-[15px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                        <div className={`min-w-0 flex-1 py-2 pr-3 ${index === emotions.length - 1 ? '' : 'border-b'}`} style={index === emotions.length - 1 ? undefined : { borderColor: 'rgba(60,60,67,0.29)' }}>
                            <p className="text-[13px] font-bold leading-snug break-words" style={{ color, fontFamily: noteFont }}>
                                {buff.emoji ? `${buff.emoji} ` : ''}{buff.label}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-[1.35] text-[#8e8e93] break-words">
                                {intensityLabel(buff.intensity)}{buff.description ? ` · ${buff.description}` : ''}
                            </p>
                        </div>
                    </li>
                );
            })}
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
    const [turn, setTurn] = useState<'idle' | 'out' | 'edge' | 'in'>('idle');
    const [present, setPresent] = useState(open);
    const [shown, setShown] = useState(false);
    const onCloseRef = useRef(onClose);
    const gestureRef = useRef({ x: 0, y: 0, moved: false });
    const lockUntilRef = useRef(0);
    onCloseRef.current = onClose;
    useEffect(() => {
        if (open) {
            setPresent(true);
            setShowList(false);
            setTurn('idle');
            lockUntilRef.current = 0;
            let second = 0;
            const first = requestAnimationFrame(() => {
                second = requestAnimationFrame(() => setShown(true));
            });
            const onKey = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onCloseRef.current();
            };
            window.addEventListener('keydown', onKey);
            return () => {
                cancelAnimationFrame(first);
                cancelAnimationFrame(second);
                window.removeEventListener('keydown', onKey);
            };
        }
        setShown(false);
        setTurn('idle');
        const timer = window.setTimeout(() => setPresent(false), 200);
        return () => window.clearTimeout(timer);
    }, [open]);
    useEffect(() => {
        if (turn !== 'edge') return;
        let second = 0;
        const first = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => setTurn('in'));
        });
        return () => {
            cancelAnimationFrame(first);
            cancelAnimationFrame(second);
        };
    }, [turn]);
    useEffect(() => {
        if (turn !== 'out' && turn !== 'in') return;
        const ms = turn === 'out' ? 240 : 260;
        const id = window.setTimeout(() => {
            if (turn === 'out') {
                setShowList(value => !value);
                setTurn('edge');
            } else {
                setTurn('idle');
            }
        }, ms);
        return () => window.clearTimeout(id);
    }, [turn]);

    if (!present) return null;

    const lit = shown && open;
    const layer = `fixed inset-0 z-[130] flex flex-col justify-end pointer-events-none transition-opacity duration-200 ease-out ${lit ? 'opacity-100' : 'opacity-0'}`;
    const shell = `relative z-10 mx-3 mb-[max(5.5rem,env(safe-area-inset-bottom))] ${lit ? 'pointer-events-auto' : 'pointer-events-none'}`;
    const veil = `absolute inset-0 bg-slate-900/15 transition-opacity duration-200 ${lit ? 'pointer-events-auto' : 'pointer-events-none'}`;

    if (!emotions) {
        return (
            <div className={layer}>
                <button
                    type="button"
                    className={veil}
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
        lockUntilRef.current = Date.now() + 560;
        setTurn('out');
    };
    const cardTurn: React.CSSProperties = turn === 'out'
        ? { transform: 'rotateY(90deg)', transition: 'transform 240ms ease-in' }
        : turn === 'edge'
            ? { transform: 'rotateY(-90deg)', transition: 'none' }
            : turn === 'in'
                ? { transform: 'rotateY(0deg)', transition: 'transform 260ms ease-out' }
                : { transform: 'rotateY(0deg)', transition: 'none' };

    return (
        <div className={layer}>
            <button
                type="button"
                className={veil}
                aria-label="关闭"
                onClick={() => onCloseRef.current()}
            />
            <div className={shell} role="dialog" aria-modal="true" aria-labelledby="chat-inner-peek-title">
                <div style={{ perspective: '720px', perspectiveOrigin: 'center center' }}>
                    <div
                        onPointerDown={(event) => {
                            gestureRef.current = { x: event.clientX, y: event.clientY, moved: false };
                        }}
                        onPointerMove={(event) => {
                            const gesture = gestureRef.current;
                            if (Math.abs(event.clientX - gesture.x) > 8 || Math.abs(event.clientY - gesture.y) > 8) gesture.moved = true;
                        }}
                        onClick={flip}
                        style={{
                            transformStyle: 'preserve-3d',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transformOrigin: 'center center',
                            ...cardTurn,
                        }}
                    >
                        {showList ? (
                            <div key="list" className="flex flex-col overflow-hidden rounded-[1.35rem] bg-[#fffdf8] shadow-[0_12px_40px_rgba(60,40,20,0.16)]">
                                <div className="h-[3px] bg-[#ffcc00]" />
                                <div className="px-3.5 pt-2.5 pb-1 flex items-center justify-between gap-2">
                                    <p className="text-[13px] font-bold text-[#1c1c1e]" style={{ fontFamily: noteFont }}>情绪</p>
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
                                className="overflow-hidden rounded-[1.35rem] border border-white/70 shadow-[0_12px_40px_rgba(167,139,250,0.22)]"
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
