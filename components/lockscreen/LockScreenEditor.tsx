import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowCounterClockwise, CaretDown, CaretLeft, ImageSquare, LinkSimple } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { useLocalBackHandler } from '../../hooks/useLocalBackHandler';
import { putImageBlob, deleteBlobRefIfUnreferenced } from '../../utils/blobRef';
import LockScreen from './LockScreen';
import { useLockForeground } from './LockScreenData';
import { CLOCK_GLASS_SLIDERS, LOCK_GLASS_REGIONS, glassSliderValue, isCardGlassRegion, isRingGlassRegion, normalizeLockScreenShade, readLockScreenSettings } from './lockScreenSettings';
import type { LockImageChanges, LockImageKind, LockScreenSettings, LockScreenShadeSide } from './lockScreenSettings';
import './lockScreenEditor.css';

const sections = [
  { id: 'wallpaper', label: '壁纸' },
  { id: 'clock', label: '钟面与文字' },
  { id: 'glass', label: '玻璃细调' },
  { id: 'shade', label: '上下阴影' },
] as const;

const colors = [
  { value: '#ffffff', name: '白色' },
  { value: '#66636a', name: '低饱和灰' },
  { value: '#54677d', name: '灰蓝' },
  { value: '#756784', name: '灰紫' },
];
const imageNames = { lock: '锁屏壁纸', home: '桌面壁纸', front: '透明前景图' };
const imageKinds = ['lock', 'home', 'front'] as const;
type DraftImage = { url: string; file?: File } | null;

function Slider({ label, min, max, step = 1, value, unit = '', fraction = false, onChange }: {
  label: string; min: number; max: number; step?: number; value: number; unit?: string; fraction?: boolean; onChange(value: number): void;
}) {
  const display = (fraction ? Math.round(value * 1000) / 10 : value) + unit;
  const input = useRef<HTMLInputElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; axis: 'pending' | 'x' | 'y' } | null>(null);

  function adjust(event: ReactPointerEvent<HTMLSpanElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const thumbRadius = 8;
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left - thumbRadius) / Math.max(1, bounds.width - 2 * thumbRadius)));
    const next = Number((min + Math.round(fraction * (max - min) / step) * step).toFixed(4));
    if (next !== value) onChange(Math.min(max, next));
  }

  return (
    <label className="lock-editor-range">
      <span>{label}<output>{display}</output></span>
      <span className="lock-editor-range-track"
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0 || input.current?.matches(':disabled')) return;
          const axis = event.pointerType === 'mouse' ? 'x' : 'pending';
          gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis };
          event.currentTarget.setPointerCapture(event.pointerId);
          if (axis === 'x') {
            input.current?.focus({ preventScroll: true });
            adjust(event);
          }
        }}
        onPointerMove={event => {
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
        onClick={event => event.preventDefault()}>
        <input ref={input} type="range" min={min} max={max} step={step} value={value}
          aria-valuetext={display} onChange={e => onChange(e.target.valueAsNumber)} />
      </span>
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(value: boolean): void }) {
  return (
    <button type="button" className="lock-editor-toggle" role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span>{label}</span>
      <span aria-hidden="true" className="lock-editor-switch" />
    </button>
  );
}

async function verifyImage(url: string) {
  const image = new Image();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = url;
      }),
      new Promise<never>((_, reject) => { timeout = setTimeout(reject, 7000); }),
    ]);
  } finally {
    clearTimeout(timeout);
    image.onload = image.onerror = null;
    image.removeAttribute('src');
  }
}

export default function LockScreenEditor({ onClose }: { onClose(): void }) {
  const { theme, saveLockScreenAppearance, addToast, realtimeConfig } = useOS();
  const { url: existingFront } = useLockForeground(true);
  const [original] = useState(readLockScreenSettings);
  const [draft, setDraft] = useState(original);
  const [images, setImages] = useState<Partial<Record<LockImageKind, DraftImage>>>({});
  const [section, setSection] = useState<typeof sections[number]['id']>('wallpaper');
  const [region, setRegion] = useState<typeof LOCK_GLASS_REGIONS[number]['id']>('clock');
  const [shadeSide, setShadeSide] = useState<'top' | 'bottom'>('top');
  const [expanded, setExpanded] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [linkKind, setLinkKind] = useState<'lock' | 'home' | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const alive = useRef(true);
  const operation = useRef(false);
  const objectUrls = useRef(new Map<LockImageKind, string>());
  const form = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original) || Object.keys(images).length > 0;
  const home = images.home === undefined ? theme.wallpaper : images.home?.url || '';
  const lock = images.lock === undefined ? theme.lockWallpaper : images.lock?.url;
  const front = images.front === undefined ? existingFront : images.front?.url || '';
  const shade = normalizeLockScreenShade(draft.shade);
  const shadeLabel = shadeSide === 'top' ? '顶部阴影' : '底部阴影';

  useLayoutEffect(() => {
    document.documentElement.classList.add('sully-lock-editor-open');
    return () => document.documentElement.classList.remove('sully-lock-editor-open');
  }, []);

  useEffect(() => {
    alive.current = true;
    backButton.current?.focus();
    return () => {
      alive.current = false;
      for (const url of objectUrls.current.values()) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    };
  }, []);
  useEffect(() => { if (confirm) continueButton.current?.focus(); }, [confirm]);
  useEffect(() => { if (form.current) form.current.scrollTop = 0; }, [section, region, shadeSide]);

  function change<K extends keyof LockScreenSettings>(key: K, value: LockScreenSettings[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
  }

  function changeGlass(key: string, value: number | boolean) {
    setDraft(previous => {
      const values = previous.glass[region];
      const field = region === 'clock' && key === 'blurRadius' && values?.overLight === true ? 'lightBlurRadius' : key;
      return {
        ...previous,
        glass: { ...previous.glass, [region]: { ...values, [field]: value } },
      };
    });
  }

  function changeShade(side: 'top' | 'bottom', changes: Partial<LockScreenShadeSide>) {
    setDraft(previous => {
      const shade = normalizeLockScreenShade(previous.shade);
      return { ...previous, shade: { ...shade, [side]: { ...shade[side], ...changes } } };
    });
  }

  function closeConfirm() {
    setConfirm(false);
    requestAnimationFrame(() => backButton.current?.focus());
  }

  function back() {
    if (operation.current) return;
    if (confirm) closeConfirm();
    else if (linkKind) { setLinkKind(null); setLink(''); }
    else if (dirty) setConfirm(true);
    else onClose();
  }
  useLocalBackHandler(() => {
    if (document.activeElement instanceof HTMLInputElement &&
        ['text', 'url'].includes(document.activeElement.type) &&
        form.current?.contains(document.activeElement)) {
      document.activeElement.blur();
    } else back();
    return true;
  }, 40);

  function setImage(kind: LockImageKind, next: DraftImage) {
    const previous = objectUrls.current.get(kind);
    if (previous) URL.revokeObjectURL(previous);
    objectUrls.current.delete(kind);
    if (next?.file) objectUrls.current.set(kind, next.url);
    setImages(current => ({ ...current, [kind]: next }));
  }

  function selectImage(kind: LockImageKind, next: DraftImage) {
    setImage(kind, next);
    if (kind === 'lock') setImage('front', null);
    if (kind === 'home') change('pair', false);
    if (kind === 'front') change('depth', true);
  }

  async function previewImage(kind: LockImageKind, source: string, file?: File) {
    if (operation.current) return;
    operation.current = true;
    setBusy('正在读取' + imageNames[kind]);
    setError('');
    let accepted = false;
    let url = source;
    try {
      if (!file && /^(data:image\/|blob:)/i.test(source)) {
        const response = await fetch(source);
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        file = new File([blob], 'wallpaper', { type: blob.type });
        url = URL.createObjectURL(file);
      }
      await verifyImage(url);
      if (!alive.current) return;
      selectImage(kind, { url, file });
      accepted = true;
      setLinkKind(null);
      setLink('');
    } catch {
      if (alive.current) setError(imageNames[kind] + '无法打开，请检查图片或链接');
    } finally {
      if (!accepted && file) URL.revokeObjectURL(url);
      operation.current = false;
      if (alive.current) setBusy('');
    }
  }

  function applyLink() {
    if (!linkKind) return;
    const url = link.trim();
    if (!/^(https?:\/\/|data:image\/|blob:)/i.test(url)) {
      setError('请输入以 https:// 或 http:// 开头的图片地址');
      return;
    }
    void previewImage(linkKind, url);
  }

  async function save() {
    if (operation.current) return;
    if (!dirty) { onClose(); return; }
    operation.current = true;
    setBusy('正在保存');
    setError('');
    const staged: string[] = [];
    try {
      const changes: LockImageChanges = {};
      for (const kind of imageKinds) {
        const image = images[kind];
        if (image === undefined) continue;
        if (!image?.file) { changes[kind] = image?.url || null; continue; }
        try {
          const ref = await putImageBlob(image.file);
          staged.push(ref);
          changes[kind] = ref;
        } catch {
          throw new Error(imageNames[kind] + '保存失败');
        }
      }
      await saveLockScreenAppearance(draft, changes);
      addToast('锁屏已更新', 'success');
      if (alive.current) onClose();
    } catch (failure) {
      for (const ref of staged) void deleteBlobRefIfUnreferenced(ref).catch(() => {});
      if (alive.current) setError((failure instanceof Error && /失败/.test(failure.message) ? failure.message : '锁屏设置保存失败') + '。可再次点「完成」重试。');
    } finally {
      operation.current = false;
      if (alive.current) setBusy('');
    }
  }

  function imageActions(kind: LockImageKind) {
    return (
      <div className="lock-editor-image-actions">
        <label className="lock-editor-action">
          <ImageSquare size={16} /> 选照片
          <input type="file" accept="image/*" aria-label={'上传' + imageNames[kind]} onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file && !operation.current) void previewImage(kind, URL.createObjectURL(file), file);
          }} />
        </label>
        {kind !== 'front' && <button type="button" className="lock-editor-action" onClick={() => {
          setLinkKind(linkKind === kind ? null : kind);
          setLink('');
          setError('');
        }}><LinkSimple size={16} /> 用图片链接</button>}
      </div>
    );
  }

  return (
    <div className="lock-editor" role="dialog" aria-modal="true" aria-label="编辑锁屏">
      <LockScreen preview={{ settings: draft, wallpapers: { lock: lock || home, front }, glassRegion: section === 'glass' ? region : undefined }} />
      <header className="lock-editor-header" {...(confirm ? { inert: '' } : {})}>
        <button ref={backButton} type="button" onClick={back} disabled={!!busy} aria-label="返回外观"><CaretLeft size={20} /></button>
        <button type="button" onClick={() => void save()} disabled={!!busy}>完成</button>
      </header>
      <section className="lock-editor-sheet"
        data-shade-sheet={section === 'shade' ? '' : undefined}
        data-top-sheet={(section === 'glass' && isCardGlassRegion(region) && expanded) || (section === 'shade' && shadeSide === 'bottom') ? '' : undefined}
        {...(confirm ? { inert: '' } : {})} aria-label="锁屏设置">
        <button className="lock-editor-grip" type="button" onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded} aria-controls="lock-editor-content">
          <span className="lock-editor-handle" aria-hidden="true" />
          <span>{expanded ? '收起设置' : '展开设置'}</span>
          <CaretDown size={16} aria-hidden="true" />
        </button>
        {(busy || error) && <div className="lock-editor-status" role={error ? 'alert' : 'status'}>{busy || error}</div>}
        <div className="lock-editor-content" id="lock-editor-content" hidden={!expanded}>
          <div className="lock-editor-tabs" role="group" aria-label="设置分类">
            {sections.map(item => <button type="button" key={item.id} aria-pressed={section === item.id} onClick={() => {
              setSection(item.id);
              setLinkKind(null);
              setLink('');
            }}>{item.label}</button>)}
          </div>
          <div className="lock-editor-scroll" ref={form}>
            <fieldset disabled={!!busy} className="lock-editor-fields">
              {section === 'wallpaper' && <>
                <div className="lock-editor-group">
                  <div className="lock-editor-group-title"><h3>锁屏壁纸</h3>
                    <button type="button" disabled={!lock} onClick={() => selectImage('lock', null)}>跟随桌面</button>
                  </div>
                  {imageActions('lock')}
                  {linkKind === 'lock' && <div className="lock-editor-link">
                    <input type="url" value={link} aria-label="锁屏图片地址" placeholder="https://…" onChange={e => setLink(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) applyLink(); }} />
                    <button type="button" onClick={applyLink}>预览</button>
                  </div>}
                  <Slider label="壁纸上下取景" min={0} max={100} value={draft.position} unit="%" onChange={value => change('position', value)} />
                </div>
                <div className="lock-editor-group">
                  <Toggle label="桌面沿用锁屏壁纸" value={draft.pair} onChange={value => change('pair', value)} />
                  {!draft.pair && <>
                    <div className="lock-editor-home">
                      <span aria-hidden="true" style={{ backgroundImage: /gradient\(/i.test(home) ? home : `url(${JSON.stringify(home)})` }} />
                      <div><h3>桌面壁纸</h3>{imageActions('home')}</div>
                    </div>
                    {linkKind === 'home' && <div className="lock-editor-link">
                      <input type="url" value={link} aria-label="桌面图片地址" placeholder="https://…" onChange={e => setLink(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) applyLink(); }} />
                      <button type="button" onClick={applyLink}>预览</button>
                    </div>}
                  </>}
                </div>
                <div className="lock-editor-group">
                  <Toggle label="人物遮住钟面" value={draft.depth} onChange={value => change('depth', value)} />
                  {draft.depth && <>
                    <p>选择一张与锁屏壁纸取景相同的透明前景图。</p>
                    <div className="lock-editor-group-title">{imageActions('front')}
                      {front && <button type="button" onClick={() => setImage('front', null)}>移除前景</button>}
                    </div>
                  </>}
                </div>
              </>}
              {section === 'clock' && <>
                <div className="lock-editor-group">
                  <Slider label="钟面大小" min={75} max={120} value={draft.clockSize} unit="%" onChange={value => change('clockSize', value)} />
                  <Slider label="钟面位置" min={6} max={25} step={.1} value={draft.clockPosition} unit="%" onChange={value => change('clockPosition', value)} />
                  <div className="lock-editor-colors" role="group" aria-label="锁屏颜色">
                    <span>锁屏颜色</span>
                    {colors.map(color => <button key={color.value} type="button" aria-label={color.name} aria-pressed={draft.color === color.value} title={color.name}
                      style={{ background: color.value }} onClick={() => change('color', color.value)} />)}
                    <input type="color" value={draft.color} aria-label="自选锁屏颜色" onChange={e => change('color', e.target.value)} />
                  </div>
                </div>
                <div className="lock-editor-group">
                  <label className="lock-editor-field">锁屏文字<input type="text" maxLength={28} value={draft.caption} onChange={e => change('caption', e.target.value)} /></label>
                  <label className="lock-editor-field">天气备用文字<input type="text" maxLength={24} value={draft.weather} onChange={e => change('weather', e.target.value)} /></label>
                  <p>{realtimeConfig.weatherEnabled ? '优先显示「实时感知」里所设城市的实况。' : '可在「设置 → 实时感知」开启天气。'}</p>
                  <label className="lock-editor-field">中间圆环<select value={draft.ring} onChange={e => change('ring', e.target.value as LockScreenSettings['ring'])}>
                    <option value="day">今天剩余时间</option><option value="music">当前歌曲进度</option><option value="moon">晚安小月亮</option>
                  </select></label>
                </div>
              </>}
              {section === 'shade' && <>
                <div className="lock-editor-shade-sides" role="group" aria-label="阴影作用区域">
                  {(['top', 'bottom'] as const).map(side => <button type="button" key={side}
                    aria-pressed={shadeSide === side} onClick={() => setShadeSide(side)}>
                    {side === 'top' ? '调顶部' : '调底部'}
                  </button>)}
                  <button type="button" className="lock-editor-shade-reset" aria-label="恢复上下阴影默认" title="恢复上下阴影默认"
                    onClick={() => change('shade', normalizeLockScreenShade())}>
                    <ArrowCounterClockwise size={14} /> 恢复默认
                  </button>
                </div>
                <div className="lock-editor-group">
                  <Toggle label={shadeLabel} value={shade[shadeSide].enabled}
                    onChange={enabled => changeShade(shadeSide, { enabled })} />
                  <fieldset key={shadeSide} className="lock-editor-fields lock-editor-shade-controls" disabled={!shade[shadeSide].enabled}
                    aria-label={shadeLabel + '参数'}>
                    <Slider label="深浅" min={0} max={1} step={.01} value={shade[shadeSide].strength} fraction unit="%"
                      onChange={strength => changeShade(shadeSide, { strength })} />
                    <Slider label="覆盖范围" min={0} max={100} value={shade[shadeSide].range} unit="%"
                      onChange={range => changeShade(shadeSide, { range })} />
                  </fieldset>
                </div>
              </>}
              {section === 'glass' && <>
                <div className="lock-editor-regions" role="group" aria-label="玻璃作用区域">
                  {LOCK_GLASS_REGIONS.map(item => <button type="button" key={item.id} aria-pressed={region === item.id} onClick={() => setRegion(item.id)}>{item.label}</button>)}
                </div>
                <div className="lock-editor-group">
                  {CLOCK_GLASS_SLIDERS.filter(slider => region === 'clock' || slider.key === 'shadow' || ((isCardGlassRegion(region) || isRingGlassRegion(region)) && slider.key !== 'inkOpacity')).map(slider =>
                    <Slider key={slider.key} label={slider.label} min={slider.min} max={slider.max} step={slider.step}
                      value={glassSliderValue(draft.glass, region, slider)} unit={slider.key === 'blurRadius' ? ' px' : '%'}
                      fraction={slider.key !== 'blurRadius' && slider.key !== 'saturation'}
                      onChange={value => changeGlass(slider.key, value)} />)}
                  {region === 'clock' && <Toggle label="浅色壁纸模式" value={draft.glass.clock?.overLight === true} onChange={value => changeGlass('overLight', value)} />}
                  <button type="button" className="lock-editor-action lock-editor-reset" onClick={() => {
                    const next = { ...draft.glass };
                    delete next[region];
                    change('glass', next);
                  }}><ArrowCounterClockwise size={15} /> 恢复本区默认</button>
                </div>
              </>}
            </fieldset>
          </div>
        </div>
      </section>
      {confirm && <div className="lock-editor-confirm">
        <div role="alertdialog" aria-modal="true" aria-labelledby="lock-editor-confirm-title">
          <h2 id="lock-editor-confirm-title">放弃本次修改？</h2>
          <p>已保存的锁屏设置会保留。</p>
          <div>
            <button type="button" className="text-rose-600" onClick={onClose}>放弃修改</button>
            <button type="button" ref={continueButton} onClick={closeConfirm}>继续编辑</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
