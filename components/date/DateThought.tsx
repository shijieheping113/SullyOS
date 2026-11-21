import React, { useEffect, useRef, useState } from 'react';
import { useLocalBackHandler } from '../../hooks/useLocalBackHandler';
import { isGlobalTranslateEnabled, subscribeGlobalTranslateEnabled } from '../../utils/globalTranslateSettings';
import { webGoogleTranslate } from '../../utils/webGoogleTranslate';
import { createAppPortal } from '../os/appPortal';
import './DateThought.css';

export default function DateThought({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    const [canTranslate, setCanTranslate] = useState(isGlobalTranslateEnabled);
    const [translation, setTranslation] = useState('');
    const [translated, setTranslated] = useState(false);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const request = useRef<AbortController>();
    const trigger = useRef<HTMLButtonElement>(null);
    const close = () => { setOpen(false); request.current?.abort(); trigger.current?.focus(); return true; };
    useLocalBackHandler(close, 65, open);
    useEffect(() => subscribeGlobalTranslateEnabled(setCanTranslate), []);
    useEffect(() => () => request.current?.abort(), []);

    const translate = async () => {
        if (translated) { setTranslated(false); return; }
        if (translation) { setTranslated(true); return; }
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setError(false);
        try {
            const pieces = text.match(/[\s\S]{1,700}(?:[。！？.!?\n]|$)|[\s\S]{1,700}/g) || [text];
            const result: string[] = [];
            for (const piece of pieces) {
                if (!piece.trim()) { result.push(piece); continue; }
                result.push(await webGoogleTranslate(piece, { signal: controller.signal }));
                if (piece.endsWith('\n')) result.push('\n');
            }
            if (controller.signal.aborted) return;
            setTranslation(result.join(''));
            setTranslated(true);
        } catch {
            if (!controller.signal.aborted) setError(true);
        } finally { setLoading(false); }
    };

    return <>
        <button ref={trigger} type="button" className="date-thought-cloud" title="心象" aria-label="心象" aria-expanded={open}
            onClick={event => { event.stopPropagation(); setOpen(true); }}>💭</button>
        {open && createAppPortal(<div className="date-thought-overlay" onClick={event => { event.stopPropagation(); close(); }}>
            <section role="dialog" aria-modal="true" aria-label="心象" className="date-thought-card"
                onClick={event => event.stopPropagation()} onKeyDown={event => {
                    if (event.key === 'Escape') { event.stopPropagation(); close(); }
                }}>
                <div className="date-thought-header">
                    <b>💭 心象</b>
                    {canTranslate && <button type="button" disabled={loading} onClick={translate}>
                        {loading ? '翻译中…' : translated ? '查看原文' : 'Google 翻译'}
                    </button>}
                    <button type="button" aria-label="关闭心象" onClick={close} autoFocus>×</button>
                </div>
                <div className="date-thought-text" tabIndex={0}>
                    {error && <p role="status" className="mb-3 text-rose-300">翻译暂不可用，可以点按钮重试。</p>}
                    {canTranslate && translated ? translation : text}
                </div>
            </section>
        </div>, document.body)}
    </>;
}
