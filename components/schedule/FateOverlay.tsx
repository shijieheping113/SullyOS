import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './FateOverlay.css';

export default function FateOverlay({ title, children, onClose, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const id = useId();
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]')?.focus();
        return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, []);
    return createPortal(<div className="fate-overlay" onClick={event => { if (event.target === event.currentTarget) closeRef.current(); }} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); }
        if (event.key === 'Tab') {
            const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]');
            if (!nodes?.length) return;
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }}><div ref={ref} className={`fate-overlay__window ${className}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="fate-overlay__header"><h2 id={id}>{title}</h2><button type="button" onClick={() => closeRef.current()} aria-label={`关闭${title}`}>关闭</button></header>
        <div className="fate-overlay__content">{children}</div>
    </div></div>, document.body);
}
