import {meetingAppearance} from '../../utils/meetingAppearance';
import MeetingAppearanceControl from './MeetingAppearanceControl';

import React, { useState, useRef, useEffect } from 'react';
import { useOS } from '../../context/OSContext';
import { CharacterProfile, SkinSet, DateStyleConfig } from '../../types';
import { processImageToBlob } from '../../utils/file';
import { putImageBlob, useBlobRefUrl } from '../../utils/blobRef';
import { pickDateFallbackSprite } from '../../utils/dateSprites';
import TokenImg from '../os/TokenImg';
import { DATE_STYLE_PRESETS } from '../../utils/datePrompts';
import ObserveSettings from './ObserveSettings';
import DateExtraPresets from './DateExtraPresets';
import DateExtraEditor from './DateExtraEditor';
import DatePortraitAdjust, { type DatePortraitPreview } from './DatePortraitAdjust';
import { DateReplyControls, DateRuleList } from './DateReplyControls';
import { useLocalBackHandler } from '../../hooks/useLocalBackHandler';
import { DATE_EMOTION_SLOTS, DATE_DEFAULT_POSE, dateEmotionLabel, datePoseKey, planDateSpriteBatch } from '../../utils/dateSceneSettings';

type PortraitSlot = { skinId: string | null; key: string };
const tabs = [
    { id: 'scene', label: '场景' }, { id: 'writing', label: '文风' },
    { id: 'rules', label: '补充规则' }, { id: 'parameters', label: '参数' },
] as const;
function isImageUrl(value: string) {
    try {
        const { protocol, hostname } = new URL(value);
        return !!hostname && (protocol === 'https:' || protocol === 'http:');
    } catch { return false; }
}
const backgroundPresets = [
    { name: '林间小屋', src: '/date/scenes/wood.webp' },
    { name: '晴日客厅', src: '/date/scenes/blue.webp' },
];

// 标准情绪列表
const REQUIRED_EMOTIONS = DATE_EMOTION_SLOTS;
const DEFAULT_SPRITE_CONFIG: SpriteConfig = DATE_DEFAULT_POSE;

interface DateSettingsProps {
    char: CharacterProfile;
    onBack: () => void;
    onPortraitPreview?: (preview: DatePortraitPreview | null) => void;
}

/** 可折叠分区卡片：标题常驻，内容默认收起，点标题展开。用原生 <details> 省状态。 */
const Section: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen, children }) => (
    <details open={defaultOpen} className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <summary className="list-none cursor-pointer select-none flex items-center justify-between gap-2 px-4 py-3.5 active:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <h3 className="text-sm font-bold text-slate-700">{title}</h3>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-slate-300 transition-transform group-open:rotate-180 shrink-0"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
        </summary>
        <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
);

const DateSettings: React.FC<DateSettingsProps> = ({ char, onBack, onPortraitPreview }) => {
    const { updateCharacter, addToast, userProfile } = useOS();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [previewOpen, setPreviewOpen] = useState(true);
    const [showPreviewPortrait, setShowPreviewPortrait] = useState(true);
    useEffect(() => {
        const viewport = window.visualViewport;
        let frame = 0;
        const sync = () => {
            if (viewport && viewport.scale !== 1) return;
            const page = pageRef.current;
            if (!page) return;
            const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
            page.style.maxHeight = `${Math.max(0, bottom - page.getBoundingClientRect().top)}px`;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const focused = document.activeElement;
                const scroll = scrollRef.current;
                if (!(focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) || !scroll?.contains(focused)) return;
                const field = focused.getBoundingClientRect(), area = scroll.getBoundingClientRect();
                if (field.top < area.top || field.height > area.height) scroll.scrollTop += field.top - area.top - 8;
                else if (field.bottom > area.bottom) scroll.scrollTop += field.bottom - area.bottom + 8;
            });
        };
        sync();
        viewport?.addEventListener('resize', sync);
        viewport?.addEventListener('scroll', sync);
        window.addEventListener('resize', sync);
        pageRef.current?.addEventListener('focusin', sync);
        const page = pageRef.current;
        return () => {
            cancelAnimationFrame(frame);
            viewport?.removeEventListener('resize', sync);
            viewport?.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
            page?.removeEventListener('focusin', sync);
        };
    }, []);
    // 背景字段存的是 blobref 令牌（二进制在 IndexedDB），CSS url() 喂不了令牌，
    // 先在这里解析成能直接用的地址。非令牌值（旧 data: / 外链）原样透传。
    const dateBackgroundUrl = useBlobRefUrl(char.dateBackground);

    // 文风与叙事（即时生效：system prompt 每次请求重建，存上就影响下一条回复）
    const styleConfig = char.dateStyleConfig || {};
    const [extraDraft, setExtraDraft] = useState(styleConfig.extra || '');
    const [extraEditorOpen, setExtraEditorOpen] = useState(false);
    useEffect(() => { setExtraDraft(char.dateStyleConfig?.extra || ''); }, [char.id]);
    const patchStyleConfig = (patch: Partial<DateStyleConfig>) => {
        updateCharacter(char.id, previous => ({ dateStyleConfig: { ...previous.dateStyleConfig, ...patch } }));
    };
    const saveExtraDraft = () => {
        const trimmed = extraDraft.trim();
        if (trimmed === (char.dateStyleConfig?.extra || '')) return;
        patchStyleConfig({ extra: trimmed || undefined });
        addToast(trimmed ? '补充要求已保存' : '补充要求已清空', 'success');
    };
    const readingAppearance = meetingAppearance(char.dateAppearance);
    const userName = userProfile?.name || '用户';
    const POV_OPTIONS: { id: DateStyleConfig['pov']; label: string; example: string }[] = [
        { id: undefined, label: '默认', example: '不额外指定，随模型发挥' },
        { id: 'third-name', label: '第三人称 · 称名字', example: `${char.name}看着${userName}` },
        { id: 'third-you', label: '第三人称 · 称"你"', example: `${char.name}看着你` },
        { id: 'first-you', label: '第一人称', example: '我看着你' },
    ];

    const uploadTarget = useRef<'bg' | PortraitSlot>('bg');
    const batchInputRef = useRef<HTMLInputElement>(null);
    const batchSkin = useRef<string | null>(null);
    const [batchBusy, setBatchBusy] = useState(false);
    const [tab, setTab] = useState<(typeof tabs)[number]['id']>('scene');
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [sourceSlot, setSourceSlot] = useState<PortraitSlot | null>(null);
    const [urlMode, setUrlMode] = useState(false);
    useLocalBackHandler(() => { setSourceSlot(null); return true; }, 65, !!sourceSlot);
    useLocalBackHandler(() => { setAdjustOpen(false); return true; }, 60, adjustOpen);
    const globalPose = char.spriteConfig || DEFAULT_SPRITE_CONFIG;
    const [newEmotionName, setNewEmotionName] = useState<string>('');

    // Skin system state
    const [newSkinName, setNewSkinName] = useState('');
    const [editingSkinId, setEditingSkinId] = useState<string | null>(null);
    const [skinUrlInput, setSkinUrlInput] = useState('');
    const skinSets = char.dateSkinSets || [];
    const activeSkinId = char.activeSkinSetId || null;

    const sprites = char.sprites || {};
    // Preview shows active skin set's sprites if one is selected
    const previewSprites = React.useMemo(() => {
        if (activeSkinId) {
            const skin = skinSets.find(s => s.id === activeSkinId);
            if (skin && Object.keys(skin.sprites).length > 0) return skin.sprites;
        }
        return sprites;
    }, [activeSkinId, skinSets, sprites]);
    const currentSpriteImg = pickDateFallbackSprite(
        previewSprites,
        [...REQUIRED_EMOTIONS, ...(char.customDateSprites || [])],
        char.avatar,
    );

    const openSource = (skinId: string | null, key: string) => {
        setSkinUrlInput('');
        setUrlMode(false);
        setSourceSlot({ skinId, key });
    };

    const uploadBackground = () => {
        uploadTarget.current = 'bg';
        fileInputRef.current?.click();
    };

    const storeSprite = (slot: PortraitSlot, src?: string) => updateCharacter(char.id, previous => {
        const patch = (images: Record<string, string> = {}) => {
            const next = { ...images };
            if (src) return { ...next, [slot.key]: src };
            delete next[slot.key];
            return next;
        };
        if (slot.skinId) {
            const updatedSets = (previous.dateSkinSets || []).map(skin => skin.id === slot.skinId
                ? { ...skin, sprites: patch(skin.sprites) } : skin);
            return { dateSkinSets: updatedSets };
        }
        return { sprites: patch(previous.sprites) };
    });

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const target = uploadTarget.current;
        try {
            if (target === 'bg') {
                const blob = await processImageToBlob(file, { skipCompression: true });
                const ref = await putImageBlob(blob);
                await updateCharacter(char.id, { dateBackground: ref, dateCustomBackground: ref });
                addToast('背景已更新', 'success');
                return;
            }
            const blob = await processImageToBlob(file);
            const ref = await putImageBlob(blob);
            await storeSprite(target, ref);
            addToast('立绘已保存', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : '图片保存失败', 'error');
        }
    };

    const startBatch = (skinId: string | null) => {
        batchSkin.current = skinId;
        batchInputRef.current?.click();
    };

    const importBatch = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length || batchBusy) return;
        const skinId = batchSkin.current;
        setBatchBusy(true);
        const imported: Array<{ name: string; src: string }> = [];
        const failed: string[] = [];
        try {
            for (const file of files) {
                try {
                    const blob = await processImageToBlob(file);
                    imported.push({ name: file.name, src: await putImageBlob(blob) });
                } catch { failed.push(file.name); }
            }
            if (imported.length) await updateCharacter(char.id, previous => {
                const skin = previous.dateSkinSets?.find(item => item.id === skinId);
                if (skinId && !skin) return {};
                const batch = planDateSpriteBatch(imported, skin ? skin.sprites : previous.sprites, previous.customDateSprites);
                return {
                    customDateSprites: batch.customEmotions,
                    ...(skin ? { dateSkinSets: previous.dateSkinSets?.map(item => item.id === skin.id ? { ...item, sprites: batch.sprites } : item) } : { sprites: batch.sprites }),
                };
            });
            const count = '已导入 ' + imported.length + ' 张立绘';
            if (failed.length) addToast(count + '，无法读取：' + failed.join('、'), 'error');
            else addToast(count, 'success');
        } catch {
            addToast('保存立绘失败', 'error');
        } finally { setBatchBusy(false); }
    };

    // --- Skin Set Management ---
    const handleCreateSkinSet = () => {
        const name = newSkinName.trim();
        if (!name) { addToast('请输入皮肤名称', 'error'); return; }
        if (skinSets.some(s => s.name === name)) { addToast('该名称已存在', 'error'); return; }
        const newSkin: SkinSet = { id: `skin_${Date.now()}`, name, sprites: {} };
        updateCharacter(char.id, { dateSkinSets: [...skinSets, newSkin] });
        setNewSkinName('');
        addToast(`皮肤 [${name}] 已创建`, 'success');
    };

    const handleDeleteSkinSet = (skinId: string) => {
        const updated = skinSets.filter(s => s.id !== skinId);
        const patch: Partial<CharacterProfile> = { dateSkinSets: updated };
        if (activeSkinId === skinId) patch.activeSkinSetId = undefined;
        updateCharacter(char.id, patch);
        if (editingSkinId === skinId) setEditingSkinId(null);
        addToast('已删除皮肤', 'success');
    };

    const handleActivateSkin = (skinId: string | null) => {
        updateCharacter(char.id, { activeSkinSetId: skinId || undefined });
        addToast(skinId ? '已切换皮肤' : '已切换为默认立绘', 'success');
    };

    const closeSource = () => setSourceSlot(null);

    const handleUrlSubmit = async () => {
        const url = skinUrlInput.trim();
        if (!sourceSlot || !isImageUrl(url)) { addToast('请填写有效的 HTTP 或 HTTPS 图片链接', 'error'); return; }
        try {
            await storeSprite(sourceSlot, url);
            closeSource();
            addToast('立绘已保存', 'success');
        } catch { addToast('保存立绘失败', 'error'); }
    };

    const handleSaveSettings = () => {
        addToast('配置已保存', 'success');
        onBack();
    };

    const customEmotions = char.customDateSprites || [];
    const otherPortraits = (images: Record<string, string>) => Object.keys(images)
        .filter(key => key !== 'chibi' && images[key] && !REQUIRED_EMOTIONS.includes(key) && !customEmotions.includes(key));

    const handleAddCustomEmotion = () => {
        const key = newEmotionName.trim().toLowerCase().replace(/\s+/g, '_');
        if (!key) { addToast('请输入情绪名称', 'error'); return; }
        if (REQUIRED_EMOTIONS.includes(key)) { addToast('该名称与默认情绪重复', 'error'); return; }
        if (customEmotions.includes(key)) { addToast('该自定义情绪已存在', 'error'); return; }
        if (key === 'chibi') { addToast('不能使用 chibi 作为情绪名', 'error'); return; }
        const updated = [...customEmotions, key];
        updateCharacter(char.id, { customDateSprites: updated });
        setNewEmotionName('');
        addToast(`已添加自定义情绪 [${key}]`, 'success');
    };

    const handleDeleteCustomEmotion = (key: string) => {
        updateCharacter(char.id, previous => {
            const nextSprites = { ...previous.sprites };
            delete nextSprites[key];
            return { sprites: nextSprites, customDateSprites: (previous.customDateSprites || []).filter(emotion => emotion !== key) };
        });
        addToast('已删除自定义情绪', 'success');
    };

    const portraitGrid = (keys: string[], images: Record<string, string>, skinId: string | null, removable = false) => (
        <div className="grid grid-cols-3 gap-3">
            {keys.map(key => <div key={key} className="min-w-0 space-y-1.5">
                <button type="button" aria-label={'添加或更换' + dateEmotionLabel(key) + '立绘'} onClick={() => openSource(skinId, key)}
                    className="relative w-full aspect-[3/4] grid place-items-center overflow-hidden rounded-xl border border-dashed border-violet-200 bg-violet-50 text-violet-800">
                    {images[key] && <TokenImg value={images[key]} className="absolute inset-0 w-full h-full object-contain" />}
                    <span aria-hidden="true" className={images[key] ? 'absolute right-1 bottom-1 rounded-full px-1.5 bg-white/90 text-sm' : 'text-2xl'}>＋</span>
                </button>
                <div className="flex justify-center items-center gap-1">
                    <span title={key} className="truncate text-xs text-slate-700">{dateEmotionLabel(key)}</span>
                    {removable && <button type="button" aria-label={'删除' + key} className="px-1 text-rose-700" onClick={() => handleDeleteCustomEmotion(key)}>×</button>}
                </div>
            </div>)}
        </div>
    );
    const resetTab = () => {
        if (tab === 'scene') {
            setShowPreviewPortrait(true);
            updateCharacter(char.id, previous => ({
                activeSkinSetId: undefined, dateAppearance: undefined, dateLightReading: undefined, dateReadingShowAvatars: undefined,
                dateBackground: undefined, spriteConfig: DEFAULT_SPRITE_CONFIG,
                dateCustomBackground: previous.dateBackground && !backgroundPresets.some(preset => preset.src === previous.dateBackground)
                    ? previous.dateBackground : previous.dateCustomBackground,
            }));
        } else if (tab === 'writing') {
            updateCharacter(char.id, previous => ({
                dateStyleConfig: { ...previous.dateStyleConfig, style: undefined, pov: undefined, digDeeper: undefined },
                dateObserve: previous.dateObserve ? { ...previous.dateObserve, enabled: false } : undefined,
            }));
        } else if (tab === 'rules') {
            updateCharacter(char.id, previous => ({
                dateStyleConfig: { ...previous.dateStyleConfig, rules: previous.dateStyleConfig?.rules?.map(rule => ({ ...rule, enabled: false })) },
            }));
        } else {
            updateCharacter(char.id, previous => ({ dateReplySettings: { steps: previous.dateReplySettings?.steps } }));
        }
        addToast(tab === 'rules' ? '补充规则已停用，条目已保留' : '已恢复本页默认设置', 'success');
    };

    return (
        <div ref={pageRef} className={'relative h-full min-h-0 w-full flex flex-col overflow-hidden ' + (adjustOpen && onPortraitPreview ? 'bg-transparent' : 'bg-slate-50')}>
            <div style={adjustOpen ? { display: 'none' } : undefined} className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0 z-20">
                <button onClick={onBack} className="p-2 -ml-2 text-slate-600 active:scale-95 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
                <span className="font-bold text-slate-700">场景布置</span>
                <div className="w-8"></div>
            </div>
            
            <nav hidden={adjustOpen} aria-label="场景布置分类" style={adjustOpen ? { display: 'none' } : undefined}
                className="grid grid-cols-4 gap-1 bg-white border-b border-violet-100 px-3 py-2 shrink-0">
                {tabs.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id}
                    onClick={() => { setTab(item.id); if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
                    className={`rounded-xl px-1 py-2.5 text-xs font-bold ${tab === item.id ? 'bg-violet-100 text-violet-950' : 'text-slate-600'}`}>
                    {item.label}
                </button>)}
            </nav>
            <div ref={scrollRef} hidden={adjustOpen} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-testid="date-settings-scroll">
            <div hidden={tab !== 'scene'}>
            <MeetingAppearanceControl surface="date" characterId={char.id} />
            <button type="button" onClick={() => setPreviewOpen(open => !open)} aria-expanded={previewOpen}
                className="w-full px-5 py-3 text-left text-xs font-bold text-slate-500 bg-white border-b border-slate-100">
                {previewOpen ? '收起场景预览' : '展开场景预览'}
            </button>
            {/* Live Preview Area */}
            {previewOpen && <div className="h-64 bg-black relative overflow-hidden shrink-0 border-b border-slate-200">
                {readingAppearance.id!=='none'&&<div className="absolute inset-0 z-10 px-8 py-6 font-serif leading-8" style={{background:readingAppearance.background,color:readingAppearance.ink}}><small className="text-xs opacity-50">{readingAppearance.name} · 阅读预览</small><p className="mt-4">窗边的灯亮了，书页上留下了一小片暖色。</p><p>“今天读到哪里了？”</p><p>他把书签夹好，慢慢合上书。</p></div>}
                    <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: dateBackgroundUrl ? `url("${dateBackgroundUrl}")` : 'none' }}></div>
                    {showPreviewPortrait && <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
                        <TokenImg
                        value={currentSpriteImg}
                        className="max-h-[90%] object-contain transition-transform"
                        style={{ 
                            transform: `translate(${globalPose.x}%, ${globalPose.y}%) scale(${globalPose.scale})`
                        }}
                        />
                    </div>}
                    <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">预览 (Preview)</div>
            </div>}

            <div className="p-4 space-y-3">
                <button type="button" className="w-full min-h-11 rounded-xl bg-violet-100 text-violet-950 text-sm font-bold"
                    onClick={() => setAdjustOpen(true)}>立绘位置调整</button>
                <label className="flex items-center justify-between rounded-xl bg-white border border-slate-100 px-4 py-3 text-sm">
                    在场景预览显示立绘<input type="checkbox" checked={showPreviewPortrait} onChange={event => setShowPreviewPortrait(event.target.checked)} />
                </label>
                <Section title="背景" defaultOpen>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        {backgroundPresets.map(preset => <button key={preset.src} type="button" aria-pressed={char.dateBackground === preset.src}
                            className={'rounded-xl overflow-hidden border bg-slate-50 text-xs font-semibold ' + (char.dateBackground === preset.src ? 'border-violet-600' : 'border-slate-200')}
                            onClick={() => updateCharacter(char.id, previous => ({
                                dateBackground: preset.src,
                                dateCustomBackground: previous.dateBackground && !backgroundPresets.some(item => item.src === previous.dateBackground)
                                    ? previous.dateBackground : previous.dateCustomBackground,
                            }))}>
                            <img src={preset.src} alt="" className="w-full aspect-[2/1] object-cover" loading="lazy" />
                            <span className="block p-2">{preset.name}</span>
                        </button>)}
                    </div>
                    <button type="button" onClick={uploadBackground}
                        className="w-full min-h-10 rounded-xl border border-dashed border-violet-200 flex items-center justify-center gap-2 text-sm text-violet-800 bg-white"
                    >
                        {char.dateBackground && !backgroundPresets.some(preset => preset.src === char.dateBackground) && <TokenImg value={char.dateBackground} className="w-8 h-6 object-cover rounded" />}
                        ＋ 上传自己的背景
                    </button>
                    {char.dateCustomBackground && char.dateCustomBackground !== char.dateBackground && <button type="button" className="mt-2 text-xs text-violet-800 py-1"
                        onClick={() => updateCharacter(char.id, { dateBackground: char.dateCustomBackground })}>用回已上传的背景</button>}
                </Section>
                {!!otherPortraits(sprites).length && <Section title="其他已上传立绘">{portraitGrid(otherPortraits(sprites), sprites, null)}</Section>}

                <Section title="基础情绪立绘" defaultOpen>
                    {portraitGrid(REQUIRED_EMOTIONS, sprites, null)}
                    <button type="button" disabled={batchBusy} onClick={() => startBatch(null)} className="mt-3 w-full rounded-xl border border-violet-200 text-violet-800 py-2.5 text-sm disabled:opacity-50">{batchBusy ? "导入中…" : "批量上传立绘"}</button>
                    <p className="mt-2 text-xs text-slate-600">按文件名填入空情绪位，其余图片建成自定义情绪。已有立绘会保留。</p>
                </Section>

                <Section title="自定义情绪" defaultOpen>
                    {customEmotions.length > 0 && <div className="mb-3">{portraitGrid(customEmotions, sprites, null, true)}</div>}
                    {/* Add new custom emotion */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newEmotionName}
                            onChange={e => setNewEmotionName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddCustomEmotion(); }}
                            placeholder="输入情绪名 (如 scared, excited...)"
                            className="min-w-0 flex-1 px-4 py-3 bg-slate-100 rounded-xl text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                        />
                        <button
                            onClick={handleAddCustomEmotion}
                            disabled={!newEmotionName.trim()}
                            className="px-5 py-3 bg-primary text-white text-sm font-bold rounded-xl disabled:opacity-40 active:scale-95 transition-all"
                        >
                            添加
                        </button>
                    </div>
                </Section>

                {/* Skin Sets System */}
                <Section title="皮肤系统 (Skin Sets)">
                    <p className="text-[11px] text-slate-400 mb-4">为角色创建多套立绘皮肤。切换皮肤后，AI 将使用对应皮肤的表情立绘。</p>

                    {/* Active skin indicator */}
                    <div className="mb-4 flex items-center gap-2 text-xs">
                        <span className="text-slate-400">当前激活:</span>
                        <span className="font-bold text-slate-700">{activeSkinId ? (skinSets.find(s => s.id === activeSkinId)?.name || '未知') : '默认立绘'}</span>
                        {activeSkinId && (
                            <button onClick={() => handleActivateSkin(null)} className="text-[10px] text-primary underline">切回默认</button>
                        )}
                    </div>

                    {/* Existing skin sets */}
                    <div className="space-y-3 mb-4">
                        {skinSets.map(skin => (
                            <div key={skin.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${activeSkinId === skin.id ? 'border-primary ring-1 ring-primary/20' : 'border-slate-100'}`}>
                                <div className="p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-slate-700">{skin.name}</span>
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{Object.keys(skin.sprites).length} 个表情</span>
                                        {activeSkinId === skin.id && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">使用中</span>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {activeSkinId !== skin.id && (
                                            <button onClick={() => handleActivateSkin(skin.id)} className="text-[10px] text-primary font-bold px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors">激活</button>
                                        )}
                                        <button onClick={() => setEditingSkinId(editingSkinId === skin.id ? null : skin.id)} className="text-[10px] text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                                            {editingSkinId === skin.id ? '收起' : '编辑'}
                                        </button>
                                        <button onClick={() => handleDeleteSkinSet(skin.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded edit view */}
                                {editingSkinId === skin.id && (
                                    <div className="border-t border-slate-100 p-3">
                                        {portraitGrid([...REQUIRED_EMOTIONS, ...customEmotions, ...otherPortraits(skin.sprites)], skin.sprites, skin.id)}
                                        <button type="button" disabled={batchBusy} onClick={() => startBatch(skin.id)} className="mt-3 w-full py-2.5 rounded-xl border border-violet-200 text-violet-800 text-sm disabled:opacity-50">{batchBusy ? "导入中…" : "批量上传到此皮肤"}</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Create new skin set */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newSkinName}
                            onChange={e => setNewSkinName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateSkinSet(); }}
                            placeholder="皮肤名称 (如 冬装、泳装...)"
                            className="min-w-0 flex-1 px-4 py-3 bg-slate-100 rounded-xl text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                        />
                        <button
                            onClick={handleCreateSkinSet}
                            disabled={!newSkinName.trim()}
                            className="px-5 py-3 bg-primary text-white text-sm font-bold rounded-xl disabled:opacity-40 active:scale-95 transition-all"
                        >
                            创建
                        </button>
                    </div>
                </Section>

                {readingAppearance.id=== 'none' && <Section title="阅读模式选项"><section className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
                    <div className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold text-slate-400 uppercase">浅色阅读模式</h3>
                            <p className="text-[11px] text-slate-400 mt-1">小说视图使用浅色背景，减少眼睛疲劳</p>
                        </div>
                        <button
                            onClick={() => updateCharacter(char.id, { dateLightReading: !char.dateLightReading })}
                            type="button"
                            role="switch"
                            aria-checked={!!char.dateLightReading}
                            aria-label="切换浅色阅读模式"
                            className={`w-12 h-7 shrink-0 rounded-full transition-colors relative ${char.dateLightReading ? 'bg-primary' : 'bg-slate-200'}`}
                        >
                            <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${char.dateLightReading ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                        </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                            <h3 className="text-xs font-bold text-slate-400 uppercase">阅读模式显示头像</h3>
                            <p className="text-[11px] text-slate-400 mt-1">在双方的见面记录旁显示对应头像</p>
                        </div>
                        <button
                            onClick={() => updateCharacter(char.id, { dateReadingShowAvatars: !char.dateReadingShowAvatars })}
                            type="button"
                            role="switch"
                            aria-checked={!!char.dateReadingShowAvatars}
                            aria-label="切换阅读模式头像"
                            className={`w-12 h-7 shrink-0 rounded-full transition-colors relative ${char.dateReadingShowAvatars ? 'bg-primary' : 'bg-slate-200'}`}
                        >
                            <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${char.dateReadingShowAvatars ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                        </button>
                    </div>
                </section></Section>}

            </div>
            </div>

            <div hidden={tab !== "writing"} className="p-4 space-y-3">
                <Section title="文风与叙事" defaultOpen>
                    <p className="text-[11px] text-slate-400 mt-1 mb-4">调整见面时 AI 的写作风格与叙事人称，修改后从下一条回复开始生效。</p>

                    {/* 写作风格 */}
                    <div className="mb-5">
                        <label className="text-[11px] text-slate-500 font-bold mb-2 block">写作风格</label>
                        <div className="flex flex-wrap gap-2">
                            {DATE_STYLE_PRESETS.map(p => {
                                const active = (styleConfig.style || 'cinematic') === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => patchStyleConfig({ style: p.id })}
                                        className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all active:scale-95 ${active ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                    >
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                            {DATE_STYLE_PRESETS.find(p => p.id === (styleConfig.style || 'cinematic'))?.hint}
                        </p>
                    </div>

                    {/* 叙事人称 */}
                    <div className="mb-5">
                        <label className="text-[11px] text-slate-500 font-bold mb-2 block">叙事人称</label>
                        <div className="space-y-2">
                            {POV_OPTIONS.map(opt => {
                                const active = styleConfig.pov === opt.id;
                                return (
                                    <button
                                        key={opt.id || 'default'}
                                        onClick={() => patchStyleConfig({ pov: opt.id })}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}
                                    >
                                        <span className={`text-xs font-bold ${active ? 'text-primary' : 'text-slate-600'}`}>{opt.label}</span>
                                        <span className="text-[11px] text-slate-400 italic">{opt.example}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 细节深挖引导 */}
                    <div className="mb-5 flex items-center justify-between">
                        <div className="pr-4">
                            <label className="text-[11px] text-slate-500 font-bold block">细节深挖引导</label>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">从已有对话和现场细节中寻找可选线索，减少空话；不相关时可以跳过，也允许简短回应。</p>
                        </div>
                        <button
                            onClick={() => patchStyleConfig({ digDeeper: styleConfig.digDeeper === false ? undefined : false })}
                            className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${styleConfig.digDeeper !== false ? 'bg-primary' : 'bg-slate-200'}`}
                        >
                            <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${styleConfig.digDeeper !== false ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                        </button>
                    </div>

                </Section>
                <ObserveSettings char={char} />
            </div>
            <div hidden={tab !== "rules"} className="p-4 space-y-4">
                <Section title="规则预设" defaultOpen>
                    <DateExtraPresets key={char.id} presets={char.dateExtraPresets || []} value={extraDraft} rules={styleConfig.rules || []}
                        onApply={preset => {
                            setExtraDraft(preset.content);
                            patchStyleConfig({ extra: preset.content, ...(preset.rules ? { rules: preset.rules.map(rule => ({ ...rule })) } : {}) });
                        }}
                        onChange={dateExtraPresets => updateCharacter(char.id, { dateExtraPresets })} />
                </Section>
                <DateRuleList entries={styleConfig.rules} label="规则" change={apply => updateCharacter(char.id, previous => ({
                    dateStyleConfig: { ...previous.dateStyleConfig, rules: apply(previous.dateStyleConfig?.rules || []) },
                }))} />
                <Section title="补充文本" defaultOpen>
                    {/* 自定义补充 */}
                    <div>
                        <label className="text-[11px] text-slate-500 font-bold mb-2 block">自定义补充（可选）</label>
                        <div className="relative">
                        <textarea
                            aria-label="自定义补充"
                            value={extraDraft}
                            onChange={e => setExtraDraft(e.target.value)}
                            onBlur={saveExtraDraft}
                            placeholder="比如：多写环境互动；不要写心理活动；对话占比多一些……"
                            className="w-full h-28 px-4 pt-3 pb-11 bg-slate-100 rounded-xl text-sm resize-none focus:ring-1 focus:ring-primary/30 outline-none transition-all leading-relaxed"
                        />
                        <button type="button" aria-label="展开自定义补充" onClick={() => setExtraEditorOpen(true)}
                            className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-white text-xs font-semibold text-primary shadow-sm">↗ 展开</button>
                        </div>
                        <p className="text-[10px] text-slate-300 mt-1">点别处会自动保存；这段会照原样用上，比上面的风格优先。</p>
                    </div>
                </Section>
            </div>
            <div hidden={tab !== "parameters"} className="p-4">
                <DateReplyControls options={char.dateReplySettings} change={apply => updateCharacter(char.id, previous => ({ dateReplySettings: apply(previous.dateReplySettings || {}) }))} />
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
            <input type="file" ref={batchInputRef} className="hidden" accept="image/*" multiple onChange={importBatch} />
            {extraEditorOpen && <DateExtraEditor key={char.id} value={extraDraft} onChange={setExtraDraft} onClose={() => { saveExtraDraft(); setExtraEditorOpen(false); }} />}

            <div className="p-4 pb-safe border-t border-slate-200 bg-white/90">
                <button type="button" onClick={resetTab} className="w-full py-2 mb-1 text-xs font-semibold text-slate-600">
                    {tab === 'rules' ? '停用全部补充规则' : '恢复本页默认'}
                </button>
                <button onClick={handleSaveSettings} className="w-full py-3 bg-primary text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform">
                    保存当前布置
                </button>
            </div>
            </div>
            {sourceSlot && <div className="absolute inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={closeSource}>
                <section role="dialog" aria-modal="true" aria-label="添加或更换立绘"
                    className="w-full max-w-sm max-h-full overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 space-y-3 shadow-xl"
                    onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') closeSource(); }}>
                    <div className="flex justify-between items-start gap-2">
                        <div><h2 className="font-bold">添加或更换立绘</h2>
                            <p className="text-xs text-slate-600 mt-1">{skinSets.find(skin => skin.id === sourceSlot.skinId)?.name || '默认立绘'} · {dateEmotionLabel(sourceSlot.key)}</p></div>
                        <button type="button" aria-label="关闭添加立绘" className="w-9 h-9 text-xl" onClick={closeSource}>×</button>
                    </div>
                    {!urlMode ? <div className="grid grid-cols-2 gap-2">
                        <button type="button" autoFocus className="p-3 rounded-xl bg-violet-100 text-sm text-violet-950 font-bold" onClick={() => {
                            uploadTarget.current = sourceSlot;
                            closeSource();
                            fileInputRef.current?.click();
                        }}>从本地上传</button>
                        <button type="button" className="p-3 rounded-xl bg-slate-100 text-sm font-bold" onClick={() => setUrlMode(true)}>粘贴图片 URL</button>
                    </div> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); void handleUrlSubmit(); }}>
                        <label className="block text-xs text-slate-700">图片 URL
                            <input type="url" autoFocus value={skinUrlInput} onChange={event => setSkinUrlInput(event.target.value)}
                                placeholder="https://…" className="mt-1 w-full px-3 py-2.5 bg-slate-100 rounded-xl text-base" />
                        </label>
                        {isImageUrl(skinUrlInput.trim()) && <img key={skinUrlInput} src={skinUrlInput.trim()} alt="立绘预览" referrerPolicy="no-referrer"
                            className="max-h-28 w-full object-contain" onError={event => { event.currentTarget.hidden = true; }} />}
                        <div className="flex gap-2">
                            <button type="button" className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm" onClick={() => setUrlMode(false)}>返回</button>
                            <button type="submit" disabled={!skinUrlInput.trim()} className="flex-1 rounded-xl bg-violet-100 text-violet-950 py-2.5 text-sm font-bold disabled:opacity-40">保存立绘</button>
                        </div>
                    </form>}
                    {!urlMode && (sourceSlot.skinId ? skinSets.find(skin => skin.id === sourceSlot.skinId)?.sprites : sprites)?.[sourceSlot.key] &&
                        <button type="button" className="py-2 text-xs text-rose-700" onClick={async () => {
                            await storeSprite(sourceSlot);
                            closeSource();
                            addToast('已移除这张立绘', 'success');
                        }}>移除这张立绘</button>}
                </section>
            </div>}
            {adjustOpen && <DatePortraitAdjust char={char} skinId={previewSprites === sprites ? null : activeSkinId} onPreview={onPortraitPreview}
                onBack={() => setAdjustOpen(false)} onSave={async (target, pose) => {
                    await updateCharacter(char.id, previous => target.kind === 'global' ? { spriteConfig: pose } : {
                        datePortraitPoses: { ...previous.datePortraitPoses, [datePoseKey(target.skinId, target.emotion)]: pose },
                    });
                }} />}
        </div>
    );
};

export default DateSettings;
