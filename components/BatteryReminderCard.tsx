import React from 'react';
import TokenImg from './os/TokenImg';
import {
    BATTERY_KIND_COLOR,
    batteryChipLabel,
    type BatteryKind,
} from '../utils/batteryReminder';
import type { BatterySpeech } from '../utils/batteryReminderRun';

const FONT = 'ui-rounded, "SF Pro Rounded", "PingFang SC", "HarmonyOS Sans SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

const reduceMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const BatteryGlyph: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
    const width = (17.4 * Math.max(0, Math.min(100, pct))) / 100;
    return (
        <svg width="19" height="11" viewBox="0 0 24 13" fill="none" aria-hidden="true">
            <rect x="0.7" y="0.7" width="19.6" height="11.6" rx="4.2" stroke={color} strokeWidth="1.4" opacity="0.55" />
            <rect x="20.9" y="4.2" width="2.4" height="4.6" rx="1.2" fill={color} opacity="0.55" />
            <rect x="2.6" y="2.6" width={width} height="7.8" rx="2.6" fill={color} />
        </svg>
    );
};

const Placeholder: React.FC = () => (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: '#B9A7B2' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="8" r="4.2" />
            <path d="M3.6 20.4c0-4.2 3.8-6.6 8.4-6.6s8.4 2.4 8.4 6.6Z" />
        </svg>
        <span style={{ fontSize: 8.5, letterSpacing: '0.02em' }}>小人位</span>
    </span>
);

const BatteryReminderCard: React.FC<{
    speech: BatterySpeech;
    onOpen: () => void;
    onDismiss: () => void;
}> = ({ speech, onOpen, onDismiss }) => {
    const color = BATTERY_KIND_COLOR[speech.kind as BatteryKind] || BATTERY_KIND_COLOR.low;
    const quiet = reduceMotion();
    return (
        <div
            style={{
                position: 'fixed',
                zIndex: 120,
                top: 'calc(var(--safe-top, 0px) + 8px)',
                left: 12,
                right: 12,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
                fontFamily: FONT,
            }}
        >
            <style>{`
                @keyframes battery-reminder-drop {
                    0% { opacity: 0; transform: translateY(-26px) scale(.94); }
                    64% { transform: translateY(3px) scale(1.012); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
            <div
                role="dialog"
                aria-label="手机电量提醒"
                style={{
                    pointerEvents: 'auto',
                    width: '100%',
                    maxWidth: 460,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,.80)',
                    backdropFilter: 'blur(22px) saturate(1.3)',
                    WebkitBackdropFilter: 'blur(22px) saturate(1.3)',
                    border: '1px solid rgba(255,255,255,.9)',
                    borderRadius: 26,
                    boxShadow: '0 18px 40px rgba(140,105,125,.24), inset 0 1px 0 rgba(255,255,255,.75)',
                    color: '#4A3B47',
                    animation: quiet ? undefined : 'battery-reminder-drop .6s cubic-bezier(.22,1.24,.36,1) both',
                }}
            >
                <div style={{ height: 4, background: 'linear-gradient(90deg,#FFC2D8 0%,#A8EDE8 100%)' }} />
                <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '14px 15px 11px' }}>
                    <div style={{ width: 54, height: 64, flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        {speech.chibi ? (
                            <TokenImg
                                value={speech.chibi}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom' }}
                            />
                        ) : <Placeholder />}
                    </div>
                    <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                            <b style={{ fontSize: 13.5, fontWeight: 600, color: '#4A3B47' }}>
                                {speech.systemFallback ? '系统提醒' : speech.charName}
                            </b>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 10.5,
                                fontWeight: 600,
                                lineHeight: 1,
                                padding: '4px 8px 4px 6px',
                                borderRadius: 999,
                                background: 'rgba(255,255,255,.9)',
                                border: '1px solid rgba(74,59,71,.08)',
                            }}>
                                <BatteryGlyph pct={speech.level} color={color} />
                                <span style={{ color }}>{batteryChipLabel(speech.kind, speech.level)}</span>
                            </span>
                        </div>
                        <p style={{ fontSize: 12.6, lineHeight: 1.58, color: '#4A3B47', wordBreak: 'break-word', margin: 0 }}>
                            {speech.text}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 7, padding: '0 15px 14px' }}>
                    <button
                        type="button"
                        onClick={onOpen}
                        style={{
                            fontFamily: FONT,
                            fontSize: 11.5,
                            fontWeight: 600,
                            minHeight: 38,
                            flex: 1,
                            borderRadius: 999,
                            border: 0,
                            cursor: 'pointer',
                            background: 'linear-gradient(135deg,#FFD3E3 0%,#BDEFF0 100%)',
                            color: '#4B3B4A',
                        }}
                    >去看看</button>
                    <button
                        type="button"
                        onClick={onDismiss}
                        style={{
                            fontFamily: FONT,
                            fontSize: 11.5,
                            fontWeight: 500,
                            minHeight: 38,
                            flex: 1,
                            borderRadius: 999,
                            cursor: 'pointer',
                            background: 'rgba(255,255,255,.7)',
                            color: '#8C7C88',
                            border: '1px solid rgba(74,59,71,.07)',
                        }}
                    >知道啦</button>
                </div>
            </div>
        </div>
    );
};

/** 聊天记录里的电量提醒。居中的系统卡片，间距跟顶部弹窗同一套，没有按钮。 */
export const BatteryReminderLogCard: React.FC<{
    name: string;
    chibi: string;
    text: string;
    kind: string;
    level: number;
    source: string;
}> = ({ name, chibi, text, kind, level, source }) => {
    const color = BATTERY_KIND_COLOR[kind as BatteryKind] || BATTERY_KIND_COLOR.low;
    return (
        <article
            style={{
                width: '100%',
                overflow: 'hidden',
                background: 'rgba(255,255,255,.92)',
                backdropFilter: 'blur(22px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(22px) saturate(1.3)',
                border: '1px solid rgba(255,255,255,.9)',
                borderRadius: 26,
                boxShadow: '0 12px 28px rgba(140,105,125,.16), inset 0 1px 0 rgba(255,255,255,.75)',
                color: '#4A3B47',
                fontFamily: FONT,
            }}
        >
            <div style={{ height: 4, background: 'linear-gradient(90deg,#FFC2D8 0%,#A8EDE8 100%)' }} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '16px 16px 8px' }}>
                <div style={{ width: 48, height: 56, flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {chibi ? (
                        <TokenImg
                            value={chibi}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom' }}
                        />
                    ) : <Placeholder />}
                </div>
                <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{name}</b>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            lineHeight: 1,
                            padding: '4px 8px 4px 6px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,.9)',
                            border: '1px solid rgba(74,59,71,.08)',
                            color,
                        }}>
                            <BatteryGlyph pct={level} color={color} />
                            {batteryChipLabel(kind as BatteryKind, level)}
                        </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, wordBreak: 'break-word' }}>{text}</p>
                </div>
            </div>
            {source && (
                <p style={{ margin: 0, padding: '2px 16px 14px', fontSize: 10, lineHeight: 1.4, color: '#6B5A64' }}>{source}</p>
            )}
        </article>
    );
};

export default BatteryReminderCard;
