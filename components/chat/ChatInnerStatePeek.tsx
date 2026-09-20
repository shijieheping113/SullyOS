import React, { useEffect } from 'react';

type Props = {
    open: boolean;
    onClose: () => void;
    text: string;
    charName?: string;
};

/** 私聊专用：小巧可爱的「心里话」浮层（与查手机大卡分离） */
const ChatInnerStatePeek: React.FC<Props> = ({ open, onClose, text, charName }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[130] flex flex-col justify-end pointer-events-none">
            <button
                type="button"
                className="absolute inset-0 bg-slate-900/15 pointer-events-auto transition-opacity duration-200"
                aria-label="关闭"
                onClick={onClose}
            />
            <div
                className="relative mx-3 mb-[max(5.5rem,env(safe-area-inset-bottom))] pointer-events-auto"
                role="dialog"
                aria-modal="true"
                aria-labelledby="chat-inner-peek-title"
            >
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
                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-white/70 text-violet-500 border border-violet-100 active:scale-95 transition"
                        >
                            收起
                        </button>
                    </div>
                    <div className="px-3.5 pb-3.5 max-h-[38vh] overflow-y-auto no-scrollbar">
                        <p
                            className="text-[13px] leading-[1.75] text-slate-600/95 whitespace-pre-wrap"
                            style={{ fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif' }}
                        >
                            {text}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatInnerStatePeek;
