import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneDisconnect, Clock } from '@phosphor-icons/react';
import TokenImg from '../os/TokenImg';
import { stopIncomingCallRingtone } from '../../utils/incomingCallRingtone';
import type { IncomingCallState } from '../../utils/incomingCall';
import './incomingCallOverlay.css';

const PhoneIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
    <Phone size={size} weight="fill" color="#fff" />
);

interface Props {
    call: IncomingCallState;
    onAccept: () => void;
    onReject: () => void;
    onSnooze: () => void;
}

const IncomingCallOverlay: React.FC<Props> = ({ call, onAccept, onReject, onSnooze }) => {
    const pillRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
    const [pillPos, setPillPos] = useState({ x: -1, y: 8 });

    useEffect(() => {
        if (call.status !== 'snoozed' || pillPos.x >= 0) return;
        const place = () => {
            const node = pillRef.current;
            const parent = node?.offsetParent as HTMLElement | null;
            if (!node || !parent) return false;
            setPillPos({ x: Math.max(8, parent.clientWidth - node.offsetWidth - 8), y: 8 });
            return true;
        };
        if (place()) return;
        const id = window.requestAnimationFrame(() => { place(); });
        return () => window.cancelAnimationFrame(id);
    }, [call.status, pillPos.x]);

    const stopThen = (fn: () => void) => {
        stopIncomingCallRingtone();
        fn();
    };

    const onPillPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const node = pillRef.current;
        if (!node) return;
        dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: pillPos.x, origY: pillPos.y };
        node.setPointerCapture(e.pointerId);
    };
    const onPillPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const node = pillRef.current;
        const parent = node?.offsetParent as HTMLElement | null;
        if (!drag || drag.pointerId !== e.pointerId || !node || !parent) return;
        const maxX = Math.max(8, parent.clientWidth - node.offsetWidth - 8);
        const maxY = Math.max(8, parent.clientHeight - node.offsetHeight - 8);
        setPillPos({
            x: Math.min(maxX, Math.max(8, drag.origX + (e.clientX - drag.startX))),
            y: Math.min(maxY, Math.max(8, drag.origY + (e.clientY - drag.startY))),
        });
    };
    const onPillPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    };

    if (call.status === 'snoozed') {
        return (
            <div
                ref={pillRef}
                className="icall-pill"
                role="status"
                aria-label={`${call.charName} 来电未接`}
                style={pillPos.x >= 0 ? { left: pillPos.x, top: pillPos.y } : { top: 8, right: 8 }}
                onPointerDown={onPillPointerDown}
                onPointerMove={onPillPointerMove}
                onPointerUp={onPillPointerUp}
                onPointerCancel={onPillPointerUp}
            >
                <TokenImg value={call.charAvatar} alt="" />
                <div className="icall-pill-name">{call.charName}</div>
                <button type="button" className="icall-mini icall-mini-down" onClick={() => stopThen(onReject)} aria-label="挂">
                    <PhoneDisconnect size={16} weight="fill" color="#fff" />
                </button>
                <button type="button" className="icall-mini icall-mini-up" onClick={() => stopThen(onAccept)} aria-label="接">
                    <PhoneIcon size={16} />
                </button>
            </div>
        );
    }

    if (call.popupStyle === 'fullscreen') {
        return (
            <div className="icall-full" role="dialog" aria-modal="true" aria-label={`${call.charName} 语音来电`}>
                {call.charAvatar ? <TokenImg value={call.charAvatar} alt="" className="icall-full-bg" /> : null}
                <div className="icall-full-scrim" />
                <div className="icall-full-body">
                    <button type="button" className="icall-later-chip" onClick={() => stopThen(onSnooze)}>
                        <Clock size={16} weight="bold" />
                        稍后
                    </button>
                    <TokenImg value={call.charAvatar} alt="" className="icall-avatar-lg" />
                    <div className="icall-name">{call.charName}</div>
                    <div className="icall-sub">语音来电</div>
                    {call.line ? <div className="icall-line">{call.line}</div> : null}
                    <div className="icall-full-keys">
                        <button type="button" className="icall-key icall-key-down" onClick={() => stopThen(onReject)}>
                            <i><PhoneDisconnect size={28} weight="fill" color="#fff" /></i>
                            <span>拒绝</span>
                        </button>
                        <button type="button" className="icall-key icall-key-up" onClick={() => stopThen(onAccept)}>
                            <i><PhoneIcon /></i>
                            <span>接听</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="icall-banner" role="dialog" aria-label={`${call.charName} 语音来电`}>
            <TokenImg value={call.charAvatar} alt="" />
            <div className="icall-banner-copy">
                <div className="icall-banner-name">{call.charName}</div>
                <div className="icall-banner-line">{call.line || '语音来电'}</div>
            </div>
            <div className="icall-banner-keys">
                <button type="button" className="icall-mini icall-mini-later" onClick={() => stopThen(onSnooze)} aria-label="稍后">
                    <Clock size={18} weight="bold" color="#fff" />
                </button>
                <button type="button" className="icall-mini icall-mini-down" onClick={() => stopThen(onReject)} aria-label="拒绝">
                    <PhoneDisconnect size={18} weight="fill" color="#fff" />
                </button>
                <button type="button" className="icall-mini icall-mini-up" onClick={() => stopThen(onAccept)} aria-label="接听">
                    <PhoneIcon size={18} />
                </button>
            </div>
        </div>
    );
};

export default IncomingCallOverlay;
