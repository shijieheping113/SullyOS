
import React from 'react';
import './Modal.css';

interface ModalProps {
    isOpen: boolean;
    title: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /** 遮罩层 z-index 类名，默认 z-[100] */
    zIndexClass?: string;
    /** 可选的完整外观；不传时保持原版窗口。 */
    appearance?: 'fate';
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, footer, zIndexClass = 'z-[100]', appearance }) => {
    if (!isOpen) return null;

    const titleText = typeof title === 'string' ? title : appearance === 'fate' ? '命运牌阵' : '日程';

    // 手机闪透原界面：旧外层 animate-fade-in / 卡片 animate-slide-up 都从 opacity:0 起，
    // 移动端易整层闪空。遮罩瞬时铺上；卡片只用位移进场（见 Modal.css），不动透明度。
    return (
        <div
            className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-6`}
            style={{ paddingTop: 'calc(var(--safe-top, 0px) + 1rem)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)', maxHeight: 'var(--visual-viewport-height, 100dvh)' }}
        >
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={titleText}
                className={`relative w-full max-h-full flex flex-col min-h-0 rounded-[2.5rem] shadow-2xl overflow-hidden sully-modal-card-in ${appearance === 'fate' ? 'fate-dialog' : 'max-w-sm bg-white text-slate-800 border border-white/20'}`}
            >
                {appearance === 'fate' && <div className="fate-dialog__corners" aria-hidden="true">{[0, 1, 2, 3].map(corner => <svg key={corner} viewBox="0 0 48 48"><path d="M4 44V16C4 9 9 4 16 4h28M10 36c0-13 8-22 22-26M12 14c1 9 6 14 15 15-1-9-6-14-15-15ZM18 8c0 7 4 11 11 12 0-7-4-11-11-12ZM8 26c1 7 5 11 12 12-1-7-5-11-12-12ZM32 16l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"/></svg>)}</div>}
                <div className="px-6 pt-6 pb-2 shrink-0">
                    {typeof title === 'string' ? <h3 className="text-lg font-bold text-slate-800 text-center">{title}</h3> : title}
                </div>
                <div className={appearance === 'fate' ? 'fate-dialog__body min-h-0 overflow-y-auto overscroll-contain no-scrollbar' : 'px-6 py-4 min-h-0 max-h-[60vh] overflow-y-auto overscroll-contain no-scrollbar'}>
                    {children}
                </div>
                {footer ? (
                    <div className="px-6 pb-6 flex gap-3 shrink-0">
                        {footer}
                    </div>
                ) : (
                    <div className="px-6 pb-6 shrink-0">
                        <button
                            onClick={onClose}
                            className={`w-full py-3 font-bold rounded-2xl active:scale-95 transition-transform ${appearance === 'fate' ? 'text-[#85495d] bg-[#ead9df]' : 'bg-slate-100 text-slate-500'}`}
                        >
                            关闭
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
