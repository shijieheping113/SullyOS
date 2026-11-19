import React, { useRef } from 'react';
import type { ChatFineTuneFields } from '../../../types';
import './atelierFineTune.css';

/**
 * 二改：聊天细节微调拉条版。
 * 作者 ChatFineTunePanel 仍保留档位按钮；装扮/装修间改走本面板。
 * 字号 / 行距 / 头像间距 / 垂直微调改为连续拉条；下滑优先滚页面，左右拖才改数。
 */

type Props = {
    value: ChatFineTuneFields;
    onChange: (patch: Partial<ChatFineTuneFields>) => void;
};

const FONT_MIN = 10;
const FONT_MAX = 32;
const FONT_DEFAULT_PREVIEW = 15;
const LINE_MIN = 1;
const LINE_MAX = 2.2;
const LINE_STEP = 0.05;
const LINE_DEFAULT_PREVIEW = 1.5;
const INDENT_MIN = 0;
const INDENT_MAX = 120;
const OFFSET_MIN = -32;
const OFFSET_MAX = 32;

const OptionButton: React.FC<{ active: boolean; label: string; desc?: string; onClick: () => void }> = ({ active, label, desc, onClick }) => (
    <button type="button" onClick={onClick}
        className={`px-3 py-2 text-[11px] font-bold rounded-xl border transition-all active:scale-95 ${active ? 'bg-primary/10 text-primary border-primary/30 ring-1 ring-primary/20' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
        <div>{label}</div>
        {desc && <div className="text-[9px] font-normal mt-0.5 opacity-70">{desc}</div>}
    </button>
);

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

function GuardedRange({
    label,
    display,
    min,
    max,
    step,
    value,
    isDefault,
    onChange,
    onReset,
}: {
    label: string;
    display: string;
    min: number;
    max: number;
    step: number;
    value: number;
    isDefault: boolean;
    onChange: (next: number) => void;
    onReset: () => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const gesture = useRef<{ id: number; x: number; y: number; axis: 'x' | 'y' | 'pending' } | null>(null);

    function adjust(event: React.PointerEvent<HTMLSpanElement>) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const thumbRadius = 9;
        const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left - thumbRadius) / Math.max(1, bounds.width - 2 * thumbRadius)));
        const raw = min + Math.round(fraction * (max - min) / step) * step;
        const next = Number(clamp(raw, min, max).toFixed(4));
        if (next !== value) onChange(next);
    }

    return (
        <label className="atelier-fine-tune-range">
            <span>{label}<output>{display}</output></span>
            <span
                className="atelier-fine-tune-range-track"
                onPointerDown={(event) => {
                    if (!event.isPrimary || event.button !== 0 || input.current?.matches(':disabled')) return;
                    const axis = event.pointerType === 'mouse' ? 'x' : 'pending';
                    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    if (axis === 'x') {
                        input.current?.focus({ preventScroll: true });
                        adjust(event);
                    }
                }}
                onPointerMove={(event) => {
                    const active = gesture.current;
                    if (!active || active.id !== event.pointerId) return;
                    if (active.axis === 'pending') {
                        const dx = Math.abs(event.clientX - active.x);
                        const dy = Math.abs(event.clientY - active.y);
                        if (dy >= 8 && dy >= dx) active.axis = 'y';
                        else if (dx >= 8 && dx > dy * 1.2) active.axis = 'x';
                    }
                    if (active.axis === 'x') adjust(event);
                }}
                onLostPointerCapture={() => { gesture.current = null; }}
                onClick={(event) => event.preventDefault()}
            >
                <input
                    ref={input}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    aria-valuetext={display}
                    onChange={(e) => onChange(e.target.valueAsNumber)}
                />
            </span>
            <button type="button" className="atelier-fine-tune-reset" disabled={isDefault} onClick={onReset}>
                恢复默认
            </button>
        </label>
    );
}

export const AtelierFineTunePanel: React.FC<Props> = ({ value, onChange }) => {
    const fontStored = value.chatBubbleFontSize || 0;
    const lineStored = value.chatBubbleLineHeight || 0;
    const indentStored = value.chatBubbleIndent || 0;
    const offsetStored = value.chatAvatarOffsetY || 0;

    const fontSlider = clamp(fontStored || FONT_DEFAULT_PREVIEW, FONT_MIN, FONT_MAX);
    const lineSlider = clamp(lineStored || LINE_DEFAULT_PREVIEW, LINE_MIN, LINE_MAX);
    const indentSlider = clamp(indentStored, INDENT_MIN, INDENT_MAX);
    const offsetSlider = clamp(offsetStored, OFFSET_MIN, OFFSET_MAX);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-[11px] font-bold text-slate-500 mb-2">头像显示</h3>
                <div className="flex gap-2 flex-wrap">
                    {([['both', '全部显示'], ['hide_ai', '隐藏角色侧'], ['hide_user', '隐藏我的'], ['hide_both', '全部隐藏']] as const).map(([v, label]) => (
                        <OptionButton key={v} active={(value.chatAvatarVisibility || 'both') === v} label={label} onClick={() => onChange({ chatAvatarVisibility: v })} />
                    ))}
                </div>
                {(value.chatAvatarVisibility || 'both') !== 'both' && (
                    <label className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                        <input type="checkbox" checked={!!value.chatSnapToEdge} onChange={(e) => onChange({ chatSnapToEdge: e.target.checked })} className="accent-current" />
                        隐藏的一侧气泡贴边（收回头像空位）
                    </label>
                )}
            </div>
            <div>
                <h3 className="text-[11px] font-bold text-slate-500 mb-2">头像位置</h3>
                <div className="flex gap-2 flex-wrap">
                    <OptionButton active={(value.chatAvatarPlacement || 'beside') === 'beside'} label="气泡旁（默认）" desc="跟随头像出现频率" onClick={() => onChange({ chatAvatarPlacement: 'beside' })} />
                    <OptionButton active={value.chatAvatarPlacement === 'above_group'} label="每轮气泡上方" desc="连续气泡共用一次头像" onClick={() => onChange({ chatAvatarPlacement: 'above_group' })} />
                </div>
            </div>
            {(value.chatAvatarPlacement || 'beside') === 'beside' && (
                <div>
                    <h3 className="text-[11px] font-bold text-slate-500 mb-2">头像对齐气泡</h3>
                    <div className="flex gap-2 flex-wrap">
                        {([['bottom', '底部（默认）'], ['top', '顶部'], ['center', '垂直居中']] as const).map(([v, label]) => (
                            <OptionButton key={v} active={(value.chatAvatarAlign || 'bottom') === v} label={label} onClick={() => onChange({ chatAvatarAlign: v })} />
                        ))}
                    </div>
                    <GuardedRange
                        label="垂直微调"
                        display={`${offsetSlider}px`}
                        min={OFFSET_MIN}
                        max={OFFSET_MAX}
                        step={1}
                        value={offsetSlider}
                        isDefault={offsetStored === 0}
                        onChange={(next) => onChange({ chatAvatarOffsetY: next })}
                        onReset={() => onChange({ chatAvatarOffsetY: 0 })}
                    />
                    <div className="mt-2 flex gap-2">
                        <button type="button" className="atelier-fine-tune-reset" disabled={offsetSlider <= OFFSET_MIN}
                            onClick={() => onChange({ chatAvatarOffsetY: clamp(offsetSlider - 1, OFFSET_MIN, OFFSET_MAX) })}>上移 1px</button>
                        <button type="button" className="atelier-fine-tune-reset" disabled={offsetSlider >= OFFSET_MAX}
                            onClick={() => onChange({ chatAvatarOffsetY: clamp(offsetSlider + 1, OFFSET_MIN, OFFSET_MAX) })}>下移 1px</button>
                    </div>
                </div>
            )}
            <div>
                <h3 className="text-[11px] font-bold text-slate-500 mb-2">气泡正文字号</h3>
                <GuardedRange
                    label="字号"
                    display={fontStored ? `${fontStored}px` : `默认（预览 ${FONT_DEFAULT_PREVIEW}px）`}
                    min={FONT_MIN}
                    max={FONT_MAX}
                    step={1}
                    value={fontSlider}
                    isDefault={!fontStored}
                    onChange={(next) => onChange({ chatBubbleFontSize: next })}
                    onReset={() => onChange({ chatBubbleFontSize: 0 })}
                />
                <p className="mt-1 text-[10px] text-slate-400">可调 {FONT_MIN}–{FONT_MAX}px。恢复默认后跟系统正文走。</p>
            </div>
            <div>
                <h3 className="text-[11px] font-bold text-slate-500 mb-2">气泡正文行距</h3>
                <GuardedRange
                    label="行距"
                    display={lineStored ? String(lineStored) : `默认（预览 ${LINE_DEFAULT_PREVIEW}）`}
                    min={LINE_MIN}
                    max={LINE_MAX}
                    step={LINE_STEP}
                    value={lineSlider}
                    isDefault={!lineStored}
                    onChange={(next) => onChange({ chatBubbleLineHeight: next })}
                    onReset={() => onChange({ chatBubbleLineHeight: 0 })}
                />
            </div>
            <div>
                <h3 className="text-[11px] font-bold text-slate-500 mb-2">气泡与头像间距</h3>
                <GuardedRange
                    label="间距"
                    display={indentStored ? `${indentStored}px` : '默认（48px）'}
                    min={INDENT_MIN}
                    max={INDENT_MAX}
                    step={1}
                    value={indentSlider}
                    isDefault={!indentStored}
                    onChange={(next) => onChange({ chatBubbleIndent: next })}
                    onReset={() => onChange({ chatBubbleIndent: 0 })}
                />
                <p className="mt-1 text-[10px] text-slate-400">可调 0–{INDENT_MAX}px。恢复默认后回到系统 48px 空位。</p>
            </div>
            <div>
                <h3 className="text-[11px] font-bold text-slate-500 mb-2">HTML / 心象 / 音乐 / 小剧场卡片位置</h3>
                <div className="flex gap-2 flex-wrap">
                    <OptionButton active={(value.chatModuleAlign || 'center') === 'center'} label="水平居中（默认）" desc="卡片类内容居中显示" onClick={() => onChange({ chatModuleAlign: 'center' })} />
                    <OptionButton active={value.chatModuleAlign === 'anchor'} label="贴气泡列" desc="跟气泡同侧，旧版观感" onClick={() => onChange({ chatModuleAlign: 'anchor' })} />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">角色发的 HTML 卡片、心象（思考链）卡片、音乐（一起听）卡片和小剧场卡片的横向位置。可在白框进阶预览里切换对应卡片查看效果。</p>
            </div>
        </div>
    );
};

export default AtelierFineTunePanel;
