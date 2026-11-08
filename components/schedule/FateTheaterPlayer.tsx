import React, { useEffect, useId, useRef, useState } from 'react';
import type { CharacterProfile, ScheduleSlot, TheaterLine } from '../../types';
import './FateTheaterReading.css';
import { FatePatronArt } from './FateTarotArt';

export interface FateTheaterPlayerProps {
    character: CharacterProfile | null;
    slot: ScheduleSlot | null;
    lines: TheaterLine[] | null;
    isGenerating: boolean;
    onReplay: () => void;
    onSendCard?: (exposed: boolean) => void | Promise<void>;
    onClose: () => void;
}

const FateTheaterPlayer: React.FC<FateTheaterPlayerProps> = ({ character, slot, lines, isGenerating, onReplay, onSendCard, onClose }) => {
    const titleId = useId();
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const sendLock = useRef(false);
    const mounted = useRef(true);
    const closeRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const total = Array.isArray(lines) ? lines.length : 0;
    const available = !isGenerating && total > 0;

    useEffect(() => {
        mounted.current = true;
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => { mounted.current = false; previous?.focus?.(); };
    }, []);

    // 正文指纹：轮询刷新会换新数组引用，但同一段剧场内容不该把滚动拽回顶。
    const linesKey = isGenerating
        ? '__generating__'
        : (lines ? lines.map(line => `${line.emotion || ''}\n${line.text}`).join('\u0001') : '__null__');
    useEffect(() => {
        setNotice('');
        const region = scrollRef.current;
        if (region) region.scrollTop = 0;
    }, [linesKey]);

    const sendCard = async (exposed: boolean) => {
        if (sendLock.current || !onSendCard) return;
        sendLock.current = true;
        setSaving(true);
        setNotice('');
        try {
            await onSendCard(exposed);
            if (mounted.current) setNotice('已保存到聊天');
        } catch {
            if (mounted.current) setNotice('保存失败，请再试一次。');
        } finally {
            sendLock.current = false;
            if (mounted.current) setSaving(false);
        }
    };

    return <div ref={dialogRef} className="fate-scene-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
            const buttons = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
            if (!buttons?.length) return;
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }}>
        <div className="fate-scene-reader">
            <div className="fate-scene-topbar"><span>{character?.name || '角色'}的小剧场</span><button ref={closeRef} type="button" className="fate-scene-button fate-scene-close" onClick={onClose} aria-label="关闭小剧场">关闭</button></div>
            <header className="fate-scene-header">
                <div className="fate-scene-title"><FatePatronArt tendencyId={slot?.fate?.tendency.id} /><h1 id={titleId}>{slot?.activity || '命运小剧场'}</h1></div>
                <p className="fate-scene-context">{slot?.startTime && <span>{slot.startTime}{slot.endTime ? ` — ${slot.endTime}` : ''}</span>}{!slot?.startTime && slot?.endTime && <span>结束 {slot.endTime}</span>}{slot?.location && <span>{slot.location}</span>}</p>
            </header>
            <div ref={scrollRef} className="fate-scene-reading" aria-label="剧场正文" tabIndex={0} aria-busy={isGenerating}>
                {isGenerating ? <div className="fate-scene-waiting" role="status"><span className="fate-scene-page" aria-hidden="true">◇</span><p>小剧场正在生成</p></div> : !total ? <p role="status" className="fate-scene-empty">暂时没有剧场内容，可以重试。</p> : <div className="fate-scene-manuscript">
                    {lines?.map((line, index) => <div key={index} className={`fate-scene-passage ${/[「」『』“”"]/.test(line.text || '') ? 'fate-scene-dialogue' : 'fate-scene-narration'}`}>
                        {line.emotion && <span className="fate-scene-emotion">{line.emotion}</span>}
                        <p className="fate-scene-text">{line.text}</p>
                    </div>)}
                </div>}
            </div>
            <footer className="fate-scene-controls">
                <button type="button" className="fate-scene-button fate-scene-replay" disabled={saving || isGenerating} onClick={() => { setNotice(''); onReplay(); }}>{isGenerating ? '正在生成……' : available ? '换一段重演' : '重新尝试'}</button>
                {available && onSendCard && <div className="fate-scene-actions">
                    <button type="button" className="fate-scene-button" disabled={saving} onClick={() => void sendCard(false)}>TA 不知道你看了</button>
                    <button type="button" className="fate-scene-button fate-scene-primary" disabled={saving} onClick={() => void sendCard(true)}>让 TA 发现你在看</button>
                </div>}
                <p className="fate-scene-notice" role="status">{saving ? '正在保存到聊天……' : notice}</p>
            </footer>
        </div>
    </div>;
};

export default FateTheaterPlayer;
