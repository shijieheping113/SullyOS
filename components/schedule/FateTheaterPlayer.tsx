import React, { useEffect, useId, useRef, useState } from 'react';
import type { CharacterProfile, ScheduleSlot, TheaterLine } from '../../types';
import { FateTheaterDetails, FateTheaterText } from './FateTheaterCard';
import './FateTheater.css';

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
    const [progress, setProgress] = useState({ row: 0, chars: 0, pause: 0 });
    const [replay, setReplay] = useState(0);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const sendLock = useRef(false);
    const timerRef = useRef<number | null>(null);
    const mounted = useRef(true);
    const closeRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const total = Array.isArray(lines) ? lines.length : 0;
    const available = !isGenerating && total > 0;
    const finished = available && progress.row >= total;
    const currentLine = available && !finished ? lines?.[progress.row] : undefined;
    const characters = Array.from(currentLine?.text || '');

    useEffect(() => {
        mounted.current = true;
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        return () => { mounted.current = false; previous?.focus?.(); };
    }, []);

    useEffect(() => {
        setProgress({ row: 0, chars: 0, pause: 0 });
        setNotice('');
        if (!available || !lines) return;
        const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (motion?.matches) {
            setProgress({ row: total, chars: 0, pause: 0 });
            return;
        }
        const timer = window.setInterval(() => setProgress(value => {
            if (value.row >= total) return value;
            const length = Array.from(lines[value.row]?.text || '').length;
            if (value.chars < length) return { ...value, chars: value.chars + 1 };
            if (value.pause < 13) return { ...value, pause: value.pause + 1 };
            return { row: value.row + 1, chars: 0, pause: 0 };
        }), 38);
        timerRef.current = timer;
        return () => { window.clearInterval(timer); timerRef.current = null; };
    }, [lines, isGenerating, replay]);

    useEffect(() => {
        if (finished && timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, [finished]);

    useEffect(() => {
        const region = scrollRef.current;
        if (region) region.scrollTop = region.scrollHeight;
    }, [progress.row, progress.chars]);

    const finish = () => setProgress({ row: total, chars: 0, pause: 0 });
    const advance = () => {
        if (!available || finished) return;
        if (progress.chars < characters.length) setProgress(value => ({ ...value, chars: characters.length }));
        else finish();
    };
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

    return <div ref={dialogRef} className="fate-theater-player" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
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
        <div className="fate-theater-reader">
            <header className="fate-theater-header">
                <div className="fate-theater-heading"><h1 id={titleId}>顺着毛线偷看一会儿</h1><button ref={closeRef} type="button" className="fate-theater-button" onClick={onClose} aria-label="关闭小剧场">关闭</button></div>
                <p className="fate-theater-person">{character?.name || '角色'}的小剧场</p>
                <FateTheaterDetails activity={slot?.activity || ''} slotTime={slot?.startTime} endTime={slot?.endTime} location={slot?.location} />
            </header>
            <div ref={scrollRef} className="fate-theater-reading" aria-label="剧场正文" tabIndex={0} onClick={advance}>
                {isGenerating ? <p role="status" className="fate-theater-empty">正在写下这一刻……</p> : !total ? <p role="status" className="fate-theater-empty">暂时没有剧场内容，可以重试。</p> : <>
                    {lines?.slice(0, progress.row).map((line, index) => <FateTheaterText key={index} line={line} />)}
                    {currentLine && <FateTheaterText line={currentLine} text={characters.slice(0, progress.chars).join('')} />}
                    {finished && <p className="fate-theater-ending">这一刻，读完了。</p>}
                </>}
            </div>
            <footer className="fate-theater-controls">
                {available && !finished && <div className="fate-theater-actions">
                    <button type="button" className="fate-theater-button" onClick={advance}>补全当前行</button>
                    <button type="button" className="fate-theater-button" onClick={finish}>跳到结尾</button>
                </div>}
                <button type="button" className="fate-theater-button fate-theater-replay" disabled={saving || isGenerating} onClick={() => { setReplay(value => value + 1); onReplay(); }}>{isGenerating ? '正在生成……' : available ? '换一段重演' : '重新尝试'}</button>
                {finished && onSendCard && <div className="fate-theater-actions">
                    <button type="button" className="fate-theater-button" disabled={saving} onClick={() => void sendCard(false)}>TA 不知道你看了</button>
                    <button type="button" className="fate-theater-button fate-theater-primary" disabled={saving} onClick={() => void sendCard(true)}>让 TA 发现你在看</button>
                </div>}
                <p className="fate-theater-notice" role="status">{saving ? '正在保存到聊天……' : notice}</p>
            </footer>
        </div>
    </div>;
};

export default FateTheaterPlayer;
