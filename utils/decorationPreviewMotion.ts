/** Freeze each sample row until it is in view during an explicit replay. */
export const DECORATION_PREVIEW_MOTION_CSS = `
#decoration-preview-contents:not([data-preview-replaying]) *,
#decoration-preview-contents:not([data-preview-replaying]) *::before,
#decoration-preview-contents:not([data-preview-replaying]) *::after,
#decoration-preview-contents [data-preview-message]:not([data-preview-entered]),
#decoration-preview-contents [data-preview-message]:not([data-preview-entered])::before,
#decoration-preview-contents [data-preview-message]:not([data-preview-entered])::after,
#decoration-preview-contents [data-preview-message]:not([data-preview-entered]) *,
#decoration-preview-contents [data-preview-message]:not([data-preview-entered]) *::before,
#decoration-preview-contents [data-preview-message]:not([data-preview-entered]) *::after {
    animation:none!important;transition:none!important;
}
@media(prefers-reduced-motion:reduce){
    #decoration-preview-contents *, #decoration-preview-contents *::before,
    #decoration-preview-contents *::after {animation:none!important;transition:none!important;}
}`;

export function replayDecorationMessages(body: HTMLElement): () => void {
    const list = body.querySelector<HTMLElement>('.sample-messages');
    if (!list) return () => {};
    const remaining = new Set(list.querySelectorAll<HTMLElement>('[data-preview-message]'));
    let frame = 0;
    let startFrame = 0;
    let observer: ResizeObserver | undefined;
    body.removeAttribute('data-preview-replaying');
    for (const row of remaining) {
        row.removeAttribute('data-preview-entered');
        row.classList.remove('animate-fade-in');
    }
    list.scrollTop = 0;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
    const reveal = () => {
        frame = 0;
        const viewport = list.getBoundingClientRect();
        const visible = Array.from(remaining).filter(row => {
            const bounds = row.getBoundingClientRect();
            return bounds.height > 0 && bounds.top < viewport.bottom && bounds.bottom > viewport.top;
        });
        for (const row of visible) {
            remaining.delete(row);
            row.setAttribute('data-preview-entered', '');
            row.classList.add('animate-fade-in');
        }
    };
    const schedule = () => {
        if (!frame && remaining.size) frame = window.requestAnimationFrame(reveal);
    };
    // Give the browser one painted frame in the reset state before replaying the same CSS.
    startFrame = window.requestAnimationFrame(() => {
        startFrame = window.requestAnimationFrame(() => {
            body.setAttribute('data-preview-replaying', '');
            list.addEventListener('scroll', schedule, {passive: true});
            if (typeof ResizeObserver === 'function') {
                observer = new ResizeObserver(schedule);
                observer.observe(list);
            }
            reveal();
        });
    });
    return () => {
        if (startFrame) window.cancelAnimationFrame(startFrame);
        if (frame) window.cancelAnimationFrame(frame);
        list.removeEventListener('scroll', schedule);
        observer?.disconnect();
        body.removeAttribute('data-preview-replaying');
    };
}
