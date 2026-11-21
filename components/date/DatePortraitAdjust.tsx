import React, { useEffect, useRef, useState } from 'react';
import type { CharacterProfile, SpriteConfig } from '../../types';
import { useBlobRefUrl } from '../../utils/blobRef';
import { DATE_DEFAULT_POSE, DATE_EMOTION_SLOTS, dateEmotionLabel, datePoseFor, datePoseKey } from '../../utils/dateSceneSettings';
import { pickDateFallbackSprite } from '../../utils/dateSprites';
import TokenImg from '../os/TokenImg';

export const DATE_DIALOGUE_BOX = 'w-[90%] max-w-lg bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-6 min-h-[140px] shadow-2xl';
export const DATE_DIALOGUE_NAME = 'bg-white/90 text-black px-4 py-1 rounded-sm text-xs font-bold tracking-widest uppercase shadow-[0_4px_10px_rgba(0,0,0,0.3)] transform -skew-x-12';
export const DATE_DIALOGUE_TEXT = 'text-white/90 text-[16px] leading-relaxed font-light tracking-wide drop-shadow-md mt-2 whitespace-pre-wrap';

export function DateAdjustedPortrait({ src, pose, brightness }: { src: string; pose: SpriteConfig; brightness?: string }) {
    const zone = useRef<HTMLDivElement>(null);
    const [bounds, setBounds] = useState({ w: 0, h: 0 });
    const [image, setImage] = useState({ src: '', w: 0, h: 0 });
    useEffect(() => {
        const node = zone.current;
        if (!node) return;
        const measure = () => setBounds(previous => {
            const next = { w: node.clientWidth, h: node.clientHeight };
            return previous.w === next.w && previous.h === next.h ? previous : next;
        });
        measure();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
        observer?.observe(node);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
    }, []);
    const fitted = image.src === src && image.w && image.h && bounds.w && bounds.h;
    const scale = fitted ? Math.min(bounds.w / image.w, bounds.h / image.h) * .94 * pose.scale : 0;
    const width = image.w * scale;
    const height = image.h * scale;
    const headClearance = Math.max(48, Math.min(110, height * .25));
    const top = Math.max(0, Math.min(Math.max(0, bounds.h - headClearance - 120), bounds.h - height - bounds.h * .08 + bounds.h * pose.y / 100));
    const left = (bounds.w - width) / 2 + bounds.w * pose.x / 100;
    return <div ref={zone} className="absolute inset-x-0 top-10 bottom-0 z-10 pointer-events-none overflow-hidden">
        <TokenImg value={src} data-date-adjusted-portrait="" className="absolute left-0 top-0 max-w-none object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
            style={{ width, height, transform: `translate(${left}px, ${top}px)`, filter: brightness, visibility: fitted ? 'visible' : 'hidden' }}
            onLoad={event => setImage({ src, w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })} />
    </div>;
}

export type DatePortraitTarget = { kind: 'global' } | { kind: 'single'; skinId: string | null; emotion: string };

type Props = {
    char: CharacterProfile; skinId: string | null;
    onSave: (target: DatePortraitTarget, pose: SpriteConfig) => Promise<void>; onBack: () => void;
    onPreview?: (preview: DatePortraitPreview | null) => void;
};

export type DatePortraitPreview = { src: string; pose: SpriteConfig; single: boolean };

export function DateDefaultPortrait({ src, pose, brightness, preview }: { src: string; pose: SpriteConfig; brightness?: string; preview?: boolean }) {
    return <div className="absolute inset-x-0 bottom-0 h-[90%] flex items-end justify-center pointer-events-none z-10 overflow-hidden">
        {src && <TokenImg value={src} className={'max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] origin-bottom ' + (preview ? '' : 'transition-all duration-300')}
            style={{ filter: brightness, transform: `translate(${pose.x}%, ${pose.y}%) scale(${pose.scale})` }} />}
    </div>;
}

const fields = [
    { id: 'scale', label: '缩放', min: .5, max: 2, step: .05 },
    { id: 'x', label: '左右', min: -100, max: 100, step: 1 },
    { id: 'y', label: '上下', min: -50, max: 50, step: 1 },
] as const;

export default function DatePortraitAdjust({ char, skinId, onSave, onBack, onPreview }: Props) {
    const [scope, setScope] = useState<'global' | 'single'>('global');
    const [selectedSkin, setSelectedSkin] = useState(skinId);
    const [selected, setSelected] = useState('');
    const [drafts, setDrafts] = useState<Record<string, SpriteConfig>>({});
    const [collapsed, setCollapsed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');
    const background = useBlobRefUrl(char.dateBackground);
    const skin = char.dateSkinSets?.find(item => item.id === selectedSkin);
    const sprites = (skin ? skin.sprites : char.sprites) || {};
    const emotions = Object.keys(sprites).filter(key => key !== 'chibi' && sprites[key]);
    const fallback = pickDateFallbackSprite(sprites, [...DATE_EMOTION_SLOTS, ...(char.customDateSprites || [])], char.avatar);
    const emotion = emotions.includes(selected) ? selected : emotions.find(key => sprites[key] === fallback) || '';
    const single = scope === 'single';
    const draftKey = single ? datePoseKey(selectedSkin, emotion) : 'global';
    const globalPose = char.spriteConfig || DATE_DEFAULT_POSE;
    const pose = drafts[draftKey] || (single ? datePoseFor(char, emotion, selectedSkin) : undefined) || globalPose;
    const src = sprites[emotion] || fallback || '';
    const canEdit = !saving && (!single || !!emotion);
    const updatePose = (next: SpriteConfig) => { setStatus(''); setDrafts(previous => ({ ...previous, [draftKey]: next })); };
    React.useLayoutEffect(() => {
        onPreview?.({ src, pose, single });
    }, [onPreview, src, pose, single]);
    React.useLayoutEffect(() => () => onPreview?.(null), [onPreview]);
    return <section role="dialog" aria-modal="true" aria-label="在见面画面调整立绘" className={'absolute inset-0 z-30 overflow-hidden font-sans select-none ' + (onPreview ? '' : 'bg-black')}>
        {!onPreview && <>
        {background && <div className="absolute inset-0 bg-cover bg-center opacity-80" style={{ backgroundImage: `url("${background}")` }} />}
        {src && (single ? <DateAdjustedPortrait src={src} pose={pose} /> : <DateDefaultPortrait src={src} pose={pose} preview />)}
        <div className="absolute inset-x-0 bottom-8 z-30 flex justify-center pointer-events-none">
            <div className={`${DATE_DIALOGUE_BOX} relative`}>
                <div className="absolute -top-3 left-6 flex items-center gap-2"><div className={DATE_DIALOGUE_NAME}>{char.name}</div></div>
                <p className={DATE_DIALOGUE_TEXT}>进来吧。窗边的位置一直给你留着。</p>
            </div>
        </div>
        </>}
        <div className="absolute left-3 right-3 z-30 flex justify-between items-start gap-2" style={{ top: 'max(12px, var(--safe-top, 0px))' }}>
            <button type="button" className="rounded-lg bg-black/75 text-white text-xs px-3 min-h-10" onClick={onBack}>返回布置</button>
            <button type="button" aria-expanded={!collapsed} aria-controls="date-portrait-controls" className="rounded-lg bg-black/75 text-white text-xs px-3 min-h-10" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '显示调整' : '收起调整'}</button>
        </div>
        {!collapsed && <div id="date-portrait-controls" className="absolute right-3 z-30 w-40 max-w-[55%] flex flex-col rounded-xl bg-black/75 text-white border border-white/20 overflow-hidden"
            style={{ top: 'calc(max(12px, var(--safe-top, 0px)) + 46px)', maxHeight: 'calc(100% - max(12px, var(--safe-top, 0px)) - 210px)' }}>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2">
                <label className="block text-xs">调整范围<select value={scope} onChange={event => {
                    setScope(event.target.value === 'single' ? 'single' : 'global'); setStatus('');
                }} className="block mt-1 w-full rounded bg-white text-slate-800 p-2" disabled={saving}>
                    <option value="global">全局默认</option><option value="single">单张立绘</option>
                </select></label>
                {!!char.dateSkinSets?.length && <label className="block text-xs">预览皮肤<select value={selectedSkin || ''} onChange={event => {
                    setSelectedSkin(event.target.value || null); setSelected(''); setStatus('');
                }} className="block mt-1 w-full rounded bg-white text-slate-800 p-2" disabled={saving}>
                    <option value="">默认立绘</option>
                    {char.dateSkinSets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select></label>}
                <label className="block text-xs">{single ? '调整哪张' : '用哪张图预览'}<select value={emotion} onChange={event => { setSelected(event.target.value); setStatus(''); }}
                    className="block mt-1 w-full rounded bg-white text-slate-800 p-2" disabled={saving || !emotions.length}>
                    {!emotions.length && <option value="">{src ? '角色头像' : '还没有立绘'}</option>}
                    {emotions.map(key => <option key={key} value={key}>{dateEmotionLabel(key)}</option>)}
                </select></label>
                {!single && <p className="text-[11px] leading-relaxed text-white/75">用于没有单独调整的立绘。</p>}
                {fields.map(field => <label key={field.id} className="block text-xs">
                    <span className="flex justify-between">{field.label}<output>{pose[field.id]}{field.id === 'scale' ? '×' : '%'}</output></span>
                    <input aria-label={field.label} className="w-full accent-violet-300" type="range" min={field.min} max={field.max} step={field.step} value={pose[field.id]}
                        disabled={!canEdit} onChange={event => updatePose({ ...pose, [field.id]: Number(event.target.value) })}
                        onWheel={event => {
                            const input = event.currentTarget;
                            if (document.activeElement !== input || !canEdit || !event.deltaY) return;
                            const current = pose[field.id];
                            const next = Math.min(field.max, Math.max(field.min, Math.round((current + (event.deltaY < 0 ? field.step : -field.step)) * 100) / 100));
                            updatePose({ ...pose, [field.id]: next });
                        }} />
                </label>)}
                <button type="button" className="text-xs py-2" disabled={!canEdit}
                    onClick={() => updatePose(single ? globalPose : DATE_DEFAULT_POSE)}>{single ? '用全局数值' : '恢复默认数值'}</button>
            </div>
            <div className="shrink-0 p-2 border-t border-white/20">
                <button type="button" disabled={!drafts[draftKey] || !canEdit} className="w-full min-h-9 rounded-lg bg-violet-100 text-slate-900 text-xs disabled:opacity-60" onClick={async () => {
                    setSaving(true);
                    try {
                        await onSave(single ? { kind: 'single', skinId: selectedSkin, emotion } : { kind: 'global' }, pose);
                        setDrafts(previous => { const next = { ...previous }; delete next[draftKey]; return next; });
                        setStatus('已保存');
                    } catch { setStatus('保存失败，可重试'); }
                    finally { setSaving(false); }
                }}>{saving ? '保存中…' : single ? '保存这张' : '保存全局调整'}</button>
                <p role="status" className="text-[11px] mt-1 text-center min-h-4">{status || (drafts[draftKey] ? '调整还未保存' : '')}</p>
            </div>
        </div>}
    </section>;
}
