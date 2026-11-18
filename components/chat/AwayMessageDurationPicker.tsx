import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { MAX_AWAY_DELAY_MINUTES } from '../../utils/awayMessageCore';
import './AwayMessageDurationPicker.css';

const ROW_HEIGHT = 44;

interface WheelProps {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}

const DurationWheel: React.FC<WheelProps> = ({ label, value, min, max, onChange }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touching = useRef(false);
    const previousRange = useRef('');
    const clamp = (next: number) => Math.max(min, Math.min(max, next));

    useLayoutEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        const range = `${min}:${max}`;
        // Leave native dragging/momentum alone when the parent echoes the visible row.
        if (previousRange.current !== range || Math.round(node.scrollTop / ROW_HEIGHT) !== value - min) {
            if (timer.current !== null) clearTimeout(timer.current);
            node.scrollTop = (value - min) * ROW_HEIGHT;
        }
        previousRange.current = range;
    }, [value, min, max]);

    useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

    const settle = () => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const node = scrollRef.current;
            if (!node || touching.current) return;
            // Also align on older browsers without scroll snapping / scrollend.
            node.scrollTop = (clamp(Math.round(node.scrollTop / ROW_HEIGHT) + min) - min) * ROW_HEIGHT;
        }, 160);
    };

    return (
        <div className="away-duration-column">
            <span className="away-duration-unit" aria-hidden="true">{label}</span>
            <div
                ref={scrollRef}
                className="away-duration-wheel"
                role="spinbutton"
                tabIndex={0}
                aria-label={label}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={value}
                aria-valuetext={`${value} ${label}`}
                onScroll={event => {
                    onChange(clamp(Math.round(event.currentTarget.scrollTop / ROW_HEIGHT) + min));
                    settle();
                }}
                onTouchStart={() => { touching.current = true; }}
                onTouchEnd={() => { touching.current = false; settle(); }}
                onTouchCancel={() => { touching.current = false; settle(); }}
                onKeyDown={event => {
                    let next = value;
                    if (event.key === 'ArrowUp') next--;
                    else if (event.key === 'ArrowDown') next++;
                    else if (event.key === 'Home') next = min;
                    else if (event.key === 'End') next = max;
                    else return;
                    event.preventDefault();
                    onChange(clamp(next));
                }}
            >
                {Array.from({ length: max - min + 1 }, (_, index) => index + min).map(number => (
                    <div
                        key={number}
                        className={`away-duration-row${number === value ? ' is-selected' : ''}`}
                        aria-hidden="true"
                        onClick={() => onChange(number)}
                    >{String(number).padStart(2, '0')}</div>
                ))}
            </div>
        </div>
    );
};

const AwayMessageDurationPicker: React.FC<{ minutes: number; onChange: (minutes: number) => void }> = ({ minutes, onChange }) => {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return (
        <div className="away-duration-picker" role="group" aria-label="自定义离开时长">
            <div className="away-duration-selection" aria-hidden="true" />
            <DurationWheel label="小时" value={hours} min={0} max={MAX_AWAY_DELAY_MINUTES / 60} onChange={next => onChange(Math.max(1, Math.min(MAX_AWAY_DELAY_MINUTES, next * 60 + remainder)))} />
            <DurationWheel label="分钟" value={remainder} min={hours === 0 ? 1 : 0} max={hours === 24 ? 0 : 59} onChange={next => onChange(hours * 60 + next)} />
        </div>
    );
};

export default AwayMessageDurationPicker;
