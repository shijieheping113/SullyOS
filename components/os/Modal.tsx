
import React from 'react';

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

    return (
        <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-6 animate-fade-in`} style={{ paddingTop: 'calc(var(--safe-top, 0px) + 1rem)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)', maxHeight: 'var(--visual-viewport-height, 100dvh)' }}>
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : appearance === 'fate' ? '命运牌阵' : '日程'} className={`relative w-full max-h-full flex flex-col min-h-0 rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up ${appearance === 'fate' ? 'fate-dialog' : 'max-w-sm bg-white text-slate-800 border border-white/20'}`}>
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
