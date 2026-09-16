
import React from 'react';

interface ModalProps {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /**
     * v8d 任务 6（Ann 2026-09-17）：关掉外层遮罩的「透明度渐变」。
     * 默认 false = 全 App 原有行为（animate-fade-in），一行不变。
     * 说明：动画 fadeIn 的第一帧 opacity=0（见 index.html keyframes.fadeIn），
     * 所以浮层弹出的第一帧整体是透明的、连 bg-black/40 遮罩也透明，底下内容会透上来「闪一下」。
     * 目前只有 Spark 的「身份管理」和「角色头像」两个浮层需要开这个开关（Ann 指定范围）。
     * 卡片自身的 animate-slide-up 不受影响，手感不变。
     */
    noOverlayFade?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, footer, noOverlayFade }) => {
    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-6${noOverlayFade ? '' : ' animate-fade-in'}`}>
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden animate-slide-up">
                <div className="px-6 pt-6 pb-2">
                    <h3 className="text-lg font-bold text-slate-800 text-center">{title}</h3>
                </div>
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto no-scrollbar">
                    {children}
                </div>
                {footer ? (
                    <div className="px-6 pb-6 flex gap-3">
                        {footer}
                    </div>
                ) : (
                    <div className="px-6 pb-6">
                        <button 
                            onClick={onClose}
                            className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform"
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
