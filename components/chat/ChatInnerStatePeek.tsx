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
/** 跟「心里话」那一面同一套字形。 */
const noteFont = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
/** 「情绪备忘录」那一面：跟「心里话」同一套紫粉玻璃壳（不用背景图）。 */
const MEMO_SHELL_CLASS = 'overflow-hidden rounded-[1.35rem] border border-white/70 shadow-[0_12px_40px_rgba(167,139,250,0.22)]';
const MEMO_SHELL_STYLE: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.94) 0%, rgba(255,247,252,0.92) 55%, rgba(245,240,255,0.94) 100%)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
};
/** 顶部「退出」：奶白药丸 + 极淡紫边（与备忘录面板同一套色）。 */
const MEMO_EXIT_CLASS = 'shrink-0 rounded-full px-2.5 py-[3px] text-[10px] font-medium leading-none active:scale-95 transition';
const MEMO_EXIT_STYLE: React.CSSProperties = {
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid rgba(186,160,232,0.4)',
    color: '#8B7CD8',
};
/** 情绪名底下的手写感横线：按 id 稳定伪随机挑「波浪线 / 双横线」。真随机会每帧闪，所以用 id 做种子。 */
const HAND_UNDERLINE_STYLES = ['wavy', 'double'] as const;
const hashSeed = (seed: string) => {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 100003;
    return h;
};
/** 把 #rrggbb 转成带透明度的 rgba，用来给描边 / 强度 chip / 下划线取「该情绪自己的颜色」。 */
const withAlpha = (color: string, alpha: number) => {
    const m = /^#([0-9a-fA-F]{6})$/.exec(color);
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
const handUnderline = (color: string, seed: string): React.CSSProperties => {
    const style = HAND_UNDERLINE_STYLES[hashSeed(seed) % HAND_UNDERLINE_STYLES.length];
    return style === 'wavy'
        ? { textDecorationLine: 'underline', textDecorationStyle: 'wavy', textDecorationThickness: '1.5px', textUnderlineOffset: '3px', textDecorationColor: withAlpha(color, 0.7) }
        : { textDecorationLine: 'underline', textDecorationStyle: 'double', textDecorationThickness: '3px', textUnderlineOffset: '2px', textDecorationColor: withAlpha(color, 0.7) };
};
/** 手写横线只划标题里「连续的一小段」，不是整条都划——整条划会显得机械。
 *  起止同样按 id 稳定伪随机，两三个字的短标题就整条划。 */
const pickUnderlineSlice = (length: number, seed: string) => {
    if (length <= 2) return { start: 0, width: length };
    const width = Math.min(length, length >= 6 ? 2 + (hashSeed(`${seed}|w`) % 2) : 2);
    return { start: hashSeed(`${seed}|s`) % (length - width + 1), width };
};
/** 正文里每条情绪的「轻飘飘」：名字那一行极缓慢上下浮，每条错开相位，像各自飘着。尊重「减少动态效果」。 */
const PEEK_FLOAT_CSS = `
.sully-peek-drift{animation:sullyPeekDrift 4.2s ease-in-out infinite}
@keyframes sullyPeekDrift{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
@media (prefers-reduced-motion: reduce){.sully-peek-drift{animation:none}}
`;

export function EmotionNoteList({ emotions }: { emotions: CharacterBuff[] }) {
    if (emotions.length === 0) {
        return <p className="px-1 py-5 text-center text-[11.5px]" style={{ color: '#9A8FC4' }}>还没有情绪</p>;
    }
    return (
        <ul data-emotion-notes="" className="flex flex-col gap-2">
            {emotions.map((buff, index) => {
                const color = buff.color || '#8B7FBC';
                const labelChars = Array.from(buff.label);
                const slice = pickUnderlineSlice(labelChars.length, `${buff.id}|${buff.label}`);
                const sliceEnd = slice.start + slice.width;
                return (
                    <li
                        key={buff.id}
                        className="min-w-0 rounded-[13px] px-3 py-2.5"
                        style={{
                            background: 'rgba(255,255,255,0.55)',
                            border: `1px solid ${withAlpha(color, 0.34)}`,
                            boxShadow: '0 6px 18px rgba(150,120,205,0.12)',
                        }}
                    >
                        <div className="sully-peek-drift flex items-center gap-1.5" style={{ animationDelay: `${(index % 5) * 0.6}s` }}>
                            <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                            <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug break-words" style={{ color, fontFamily: noteFont }}>
                                {buff.emoji ? <span className="mr-1">{buff.emoji}</span> : null}
                                {labelChars.slice(0, slice.start).join('')}
                                <span style={handUnderline(color, buff.id)}>{labelChars.slice(slice.start, sliceEnd).join('')}</span>
                                {labelChars.slice(sliceEnd).join('')}
                            </p>
                            <span
                                className="shrink-0 rounded-full px-1.5 py-[2px] text-[9.5px] font-medium leading-none"
                                style={{ background: withAlpha(color, 0.16), color }}
                            >{intensityLabel(buff.intensity)}</span>
                        </div>
                        {buff.description ? (
                            <div className="mt-1.5 flex gap-2">
                                <span className="w-[3px] shrink-0 rounded-full" style={{ background: withAlpha(color, 0.5) }} aria-hidden />
                                <p className="min-w-0 flex-1 text-[11.5px] leading-[1.6] break-words" style={{ color: '#6E6584', fontFamily: noteFont }}>
                                    {buff.description}
                                </p>
                            </div>
                        ) : null}
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

type Fade = 'off' | 'in' | 'on' | 'hold' | 'out';

const ChatInnerStatePeek: React.FC<Props> = ({ open, onClose, text, charName, emotions }) => {
    const [showList, setShowList] = useState(false);
    const [swapping, setSwapping] = useState(false);
    const [present, setPresent] = useState(open);
    const [fade, setFade] = useState<Fade>('off');
    const onCloseRef = useRef(onClose);
    const gestureRef = useRef({ x: 0, y: 0, moved: false });
    const lockUntilRef = useRef(0);
    const swapTimer = useRef(0);
    onCloseRef.current = onClose;
    useEffect(() => {
        if (!open) return;
        setPresent(true);
        setShowList(false);
        setSwapping(false);
        window.clearTimeout(swapTimer.current);
        setFade('off');
        lockUntilRef.current = 0;
        let second = 0;
        let fadeTimer = 0;
        const first = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => {
                setFade('in');
                fadeTimer = window.setTimeout(() => setFade('on'), 220);
            });
        });
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCloseRef.current();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            cancelAnimationFrame(first);
            cancelAnimationFrame(second);
            window.clearTimeout(fadeTimer);
            window.clearTimeout(swapTimer.current);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);
    useEffect(() => {
        if (open || !present) return;
        setFade('hold');
    }, [open, present]);
    useEffect(() => {
        if (fade !== 'hold') return;
        const id = requestAnimationFrame(() => setFade('out'));
        return () => cancelAnimationFrame(id);
    }, [fade]);
    useEffect(() => {
        if (fade !== 'out') return;
        const id = window.setTimeout(() => setPresent(false), 200);
        return () => window.clearTimeout(id);
    }, [fade]);

    if (!present) return null;

    const interactive = fade === 'in' || fade === 'on' || fade === 'hold';
    const layer = 'fixed inset-0 z-[130] flex flex-col justify-end pointer-events-none';
    const shell = `relative z-10 mx-3 mb-[max(5.5rem,env(safe-area-inset-bottom))] ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}`;
    const veil = `absolute inset-0 bg-slate-900/15 transition-opacity duration-200 ${interactive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`;
    const shellFade: React.CSSProperties | undefined = fade === 'on'
        ? undefined
        : fade === 'hold'
            ? { opacity: 1 }
            : fade === 'in'
                ? { opacity: 1, transition: 'opacity 200ms ease-out' }
                : fade === 'out'
                    ? { opacity: 0, transition: 'opacity 200ms ease-out' }
                    : { opacity: 0 };

    if (!emotions) {
        return (
            <div className={layer}>
                <button
                    type="button"
                    className={veil}
                    aria-label="关闭"
                    onClick={onClose}
                />
                <div className={shell} style={shellFade} role="dialog" aria-modal="true" aria-labelledby="chat-inner-peek-title">
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
        lockUntilRef.current = Date.now() + 420;
        setSwapping(true);
        window.clearTimeout(swapTimer.current);
        swapTimer.current = window.setTimeout(() => {
            setShowList(value => !value);
            setSwapping(false);
        }, 160);
    };

    return (
        <div className={layer}>
            <button
                type="button"
                className={veil}
                aria-label="关闭"
                onClick={() => onCloseRef.current()}
            />
            <div className={shell} style={shellFade} role="dialog" aria-modal="true" aria-labelledby="chat-inner-peek-title">
                <div
                    onPointerDown={(event) => {
                        gestureRef.current = { x: event.clientX, y: event.clientY, moved: false };
                    }}
                    onPointerMove={(event) => {
                        const gesture = gestureRef.current;
                        if (Math.abs(event.clientX - gesture.x) > 8 || Math.abs(event.clientY - gesture.y) > 8) gesture.moved = true;
                    }}
                    onClick={flip}
                    style={{ opacity: swapping ? 0 : 1, transition: 'opacity 160ms ease-out' }}
                >
                    {showList ? (
                        <div className={MEMO_SHELL_CLASS} style={MEMO_SHELL_STYLE}>
                            <style>{PEEK_FLOAT_CSS}</style>
                            <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[12px] leading-none text-pink-400" aria-hidden>♡</span>
                                    <p
                                        className="text-[15px] font-semibold leading-none truncate"
                                        style={{
                                            fontFamily: noteFont,
                                            letterSpacing: '0.02em',
                                            backgroundImage: 'linear-gradient(95deg, #F072A8 0%, #8B6BE0 100%)',
                                            WebkitBackgroundClip: 'text',
                                            backgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            color: 'transparent',
                                        }}
                                    >情绪</p>
                                    <svg className="shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                                        <path d="M12 0.5L14.6 9.4L23.5 12L14.6 14.6L12 23.5L9.4 14.6L0.5 12L9.4 9.4Z" fill="#D9B8F0" />
                                    </svg>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <span className="text-[10.5px] leading-none" style={{ color: '#A294D6' }}>{emotions.length} 种</span>
                                    <button type="button" data-peek-exit="" onClick={leave} className={MEMO_EXIT_CLASS} style={MEMO_EXIT_STYLE}>退出</button>
                                </div>
                            </div>
                            <div
                                data-emotion-scroll=""
                                className="max-h-[38vh] overflow-y-auto overscroll-contain no-scrollbar px-3 pb-3"
                                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                                onScroll={() => { gestureRef.current.moved = true; }}
                            >
                                <EmotionNoteList emotions={emotions} />
                            </div>
                        </div>
                    ) : (
                        <div
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
    );
};

export default ChatInnerStatePeek;
