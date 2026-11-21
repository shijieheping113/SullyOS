import React, { useEffect, useRef } from 'react';
import { createAppPortal as createPortal } from '../os/appPortal';
import { useOS } from '../../context/OSContext';

export default function DateExtraEditor({ value, onChange, onClose, writing }: {
    value: string; onChange: (value: string) => void; onClose: () => void; writing?: boolean;
}) {
    const label = writing ? '自定义补充' : '规则正文';
    const { registerBackHandler } = useOS();
    const overlay = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const done = useRef<HTMLButtonElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const viewport = window.visualViewport;
        const sync = () => {
            if (!overlay.current) return;
            overlay.current.style.top = `${viewport?.offsetTop || 0}px`;
            overlay.current.style.height = `${viewport?.height || window.innerHeight}px`;
        };
        sync();
        input.current?.focus({ preventScroll: true });
        viewport?.addEventListener('resize', sync);
        viewport?.addEventListener('scroll', sync);
        window.addEventListener('resize', sync);
        const unregister = registerBackHandler(() => { close.current(); return true; });
        return () => {
            unregister();
            viewport?.removeEventListener('resize', sync);
            viewport?.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
            previous?.focus({ preventScroll: true });
        };
    }, [registerBackHandler]);
    return createPortal(<div ref={overlay} className="fixed left-0 right-0 top-0 z-[1000] bg-black/40 flex items-center justify-center p-3"
        style={{ height: '100dvh' }} onClick={() => close.current()}>
        <div role="dialog" aria-modal="true" aria-label={'编辑' + label}
            className="flex flex-col w-full max-w-xl h-full max-h-[640px] min-h-0 bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={event => event.stopPropagation()} onKeyDown={event => {
                if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); close.current(); }
                if (event.key === 'Tab') {
                    event.preventDefault();
                    (document.activeElement === input.current ? done.current : input.current)?.focus();
                }
            }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-700">{label}</h3>
                <button ref={done} type="button" onClick={() => close.current()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold">完成</button>
            </div>
            <textarea ref={input} aria-label={label} value={value} onChange={event => onChange(event.target.value)}
                placeholder="比如：多写环境互动；不要写心理活动；对话占比多一些……"
                className="flex-1 min-h-0 w-full p-4 text-base leading-relaxed text-slate-700 bg-white resize-none outline-none overflow-y-auto" />
            <p className="px-4 py-2 shrink-0 text-xs text-slate-600">{writing ? '关闭后保存到文风设置。' : '关闭后保存到这套规则。'}</p>
        </div>
    </div>, document.body);
}
