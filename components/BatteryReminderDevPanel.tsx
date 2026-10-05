import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOS } from '../context/OSContext';
import { canReadBattery, readBatteryLastTrigger, type BatteryKind, type BatteryLastTrigger } from '../utils/batteryReminder';
import { runBatteryReminder } from '../utils/batteryReminderRun';

interface LiveBattery {
    supported: boolean;
    level: number | null;
    charging: boolean | null;
}

const readLive = async (): Promise<LiveBattery> => {
    if (!canReadBattery()) return { supported: false, level: null, charging: null };
    try {
        const battery = await (navigator as Navigator & {
            getBattery?: () => Promise<{ level: number; charging: boolean }>;
        }).getBattery?.();
        if (!battery) return { supported: false, level: null, charging: null };
        return {
            supported: true,
            level: Math.round(battery.level * 100),
            charging: !!battery.charging,
        };
    } catch {
        return { supported: false, level: null, charging: null };
    }
};

const kindLabel: Record<BatteryKind, string> = {
    plug: '插上电',
    low: '低电',
    full: '充满',
};

const POS_KEY = 'sully_battery_dev_panel_pos';

type PanelPos = { x: number; y: number };

const defaultPos = (): PanelPos => {
    if (typeof window === 'undefined') return { x: 16, y: 180 };
    return {
        x: Math.max(8, window.innerWidth - 44 - 14),
        y: Math.max(8, Math.round(window.innerHeight * 0.42)),
    };
};

const clampPos = (pos: PanelPos): PanelPos => {
    if (typeof window === 'undefined') return pos;
    const maxX = Math.max(8, window.innerWidth - 44 - 8);
    const maxY = Math.max(8, window.innerHeight - 44 - 8);
    return {
        x: Math.min(maxX, Math.max(8, pos.x)),
        y: Math.min(maxY, Math.max(8, pos.y)),
    };
};

const readPos = (): PanelPos => {
    try {
        const raw = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
        if (raw && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y))) {
            return clampPos({ x: Number(raw.x), y: Number(raw.y) });
        }
    } catch {
        /* 没有存过位置 */
    }
    return defaultPos();
};

const formatLast = (last: BatteryLastTrigger | null): string => {
    if (!last) return '还没有';
    const time = new Date(last.at);
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    const fallback = last.systemFallback ? ' · 系统提醒' : '';
    return `${kindLabel[last.kind]} · ${hh}:${mm}${fallback}`;
};

/**
 * 开发版测试台。功能本体不引用这个文件。
 * 测完由施工的人删掉本文件，再删掉 App.tsx 里挂它的那一行。
 */
const BatteryReminderDevPanel: React.FC = () => {
    const { characters, userProfile, apiConfig, groups, realtimeConfig } = useOS();
    const [live, setLive] = useState<LiveBattery>({ supported: canReadBattery(), level: null, charging: null });
    const [last, setLast] = useState<BatteryLastTrigger | null>(() => readBatteryLastTrigger());
    const [busy, setBusy] = useState<string>('');
    const [note, setNote] = useState('');
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<PanelPos>(() => readPos());
    const posRef = useRef(pos);
    posRef.current = pos;
    const dragRef = useRef({ on: false, moved: false, dx: 0, dy: 0, id: -1 });

    useEffect(() => {
        const onResize = () => setPos(current => clampPos(current));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        dragRef.current = {
            on: true,
            moved: false,
            dx: event.clientX - posRef.current.x,
            dy: event.clientY - posRef.current.y,
            id: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag.on || event.pointerId !== drag.id) return;
        const next = clampPos({ x: event.clientX - drag.dx, y: event.clientY - drag.dy });
        if (Math.hypot(next.x - posRef.current.x, next.y - posRef.current.y) > 4) drag.moved = true;
        if (!drag.moved) return;
        posRef.current = next;
        setPos(next);
    };

    const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag.on || event.pointerId !== drag.id) return;
        drag.on = false;
        if (drag.moved) {
            try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* 记不住就下次再放 */ }
            return;
        }
        setOpen(value => !value);
    };

    useEffect(() => {
        let stopped = false;
        const pull = () => {
            void readLive().then(next => { if (!stopped) setLive(next); });
            if (!stopped) setLast(readBatteryLastTrigger());
        };
        pull();
        const timer = window.setInterval(pull, 2000);
        const onLast = () => { if (!stopped) setLast(readBatteryLastTrigger()); };
        window.addEventListener('battery-reminder-last-changed', onLast);
        return () => {
            stopped = true;
            window.clearInterval(timer);
            window.removeEventListener('battery-reminder-last-changed', onLast);
        };
    }, []);

    const run = async (kind: BatteryKind, forceFallback = false) => {
        if (!userProfile || busy) return;
        setBusy(kind + (forceFallback ? '-dead' : ''));
        setNote('');
        const level = kind === 'low' ? 19 : kind === 'full' ? 100 : (live.level ?? 42);
        try {
            const speech = await runBatteryReminder({
                kind,
                level,
                characters,
                userProfile,
                apiConfig,
                groups: groups || [],
                realtimeConfig,
                forceFallback,
            });
            setNote(speech ? `已写进 ${speech.charName} 的聊天` : '还没有聊过，不会触发');
        } catch (error) {
            console.error('[电量提醒测试台]', error);
            setNote('这一下没走完');
        } finally {
            setBusy('');
            setLast(readBatteryLastTrigger());
        }
    };

    if (typeof document === 'undefined') return null;

    const buttonStyle = (background: string, color: string): React.CSSProperties => ({
        fontSize: 11.5,
        fontWeight: 600,
        minHeight: 40,
        borderRadius: 13,
        border: 0,
        cursor: busy ? 'default' : 'pointer',
        background,
        color,
        opacity: busy ? 0.55 : 1,
    });

    const opensLeft = typeof window !== 'undefined' && pos.x > window.innerWidth * 0.5;
    const opensUp = typeof window !== 'undefined' && pos.y > window.innerHeight * 0.55;

    return createPortal(
        <div style={{
            position: 'fixed',
            zIndex: 130,
            left: pos.x,
            top: pos.y,
            width: 44,
            height: 44,
            pointerEvents: 'none',
            fontFamily: 'ui-rounded, "PingFang SC", "Microsoft YaHei", sans-serif',
        }}>
            <button
                type="button"
                aria-expanded={open}
                aria-label={open ? '收起电量测试台' : '打开电量测试台'}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                    pointerEvents: 'auto',
                    width: 44,
                    height: 44,
                    border: 0,
                    borderRadius: 14,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#2A2629',
                    boxShadow: '0 8px 18px rgba(0,0,0,.22)',
                    cursor: 'grab',
                    touchAction: 'none',
                }}
            >
                <BatteryMark />
            </button>
            {open && (
                <div style={{
                    pointerEvents: 'auto',
                    position: 'absolute',
                    top: opensUp ? 'auto' : 52,
                    bottom: opensUp ? 52 : 'auto',
                    left: opensLeft ? 'auto' : 0,
                    right: opensLeft ? 0 : 'auto',
                    width: 248,
                    maxWidth: 'calc(100vw - 24px)',
                    background: '#2A2629',
                        borderRadius: 18,
                        padding: 12,
                        color: '#F2EBF0',
                        boxShadow: '0 12px 30px rgba(0,0,0,.26)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <b style={{ fontSize: 13, fontWeight: 600 }}>电量测试</b>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                style={{
                                    marginLeft: 'auto',
                                    border: 0,
                                    background: 'transparent',
                                    color: '#C8BCC4',
                                    fontSize: 12,
                                    minHeight: 44,
                                    padding: '0 8px',
                                    cursor: 'pointer',
                                }}
                            >收起</button>
                        </div>
                        <div style={{ background: '#38343A', borderRadius: 12, padding: '9px 11px', marginBottom: 10 }}>
                            <Row label="读到了吗" value={live.supported ? '能读' : '不能读'} ok={live.supported} />
                            <Row label="当前电量" value={live.level == null ? '—' : `${live.level}%`} />
                            <Row label="充电中" value={live.charging == null ? '—' : (live.charging ? '是' : '否')} />
                            <Row label="上次触发" value={formatLast(last)} last />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button type="button" disabled={!!busy} onClick={() => void run('plug')} style={buttonStyle('linear-gradient(135deg,#FFE2C2,#FFD3E3)', '#5A4030')}>测插上电</button>
                            <button type="button" disabled={!!busy} onClick={() => void run('low')} style={buttonStyle('linear-gradient(135deg,#FFD3E3,#FFC2D8)', '#6B3044')}>测低电</button>
                            <button type="button" disabled={!!busy} onClick={() => void run('full')} style={buttonStyle('linear-gradient(135deg,#CBF2EE,#BDEFF0)', '#1F5148')}>测充满</button>
                            <button type="button" disabled={!!busy} onClick={() => void run('low', true)} style={buttonStyle('#D8D3D6', '#2A2629')}>测说不出话</button>
                        </div>
                        {note && <p style={{ margin: '8px 2px 0', fontSize: 11, color: '#C8BCC4' }}>{note}</p>}
                    </div>
                )}
        </div>,
        document.body,
    );
};

const BatteryMark: React.FC = () => (
    <svg width="18" height="11" viewBox="0 0 24 13" fill="none" aria-hidden="true">
        <rect x="0.7" y="0.7" width="19.6" height="11.6" rx="4.2" stroke="#FFC2D8" strokeWidth="1.6" />
        <rect x="20.9" y="4.2" width="2.4" height="4.6" rx="1.2" fill="#FFC2D8" />
        <rect x="2.6" y="2.6" width="10" height="7.8" rx="2.6" fill="#FFC2D8" />
    </svg>
);

const Row: React.FC<{ label: string; value: string; ok?: boolean; last?: boolean }> = ({ label, value, ok, last }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: last ? 0 : 5 }}>
        <span style={{ color: '#9C8F98' }}>{label}</span>
        <span style={{ color: ok ? '#A8EDE8' : '#F2EBF0', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
);

export default BatteryReminderDevPanel;
