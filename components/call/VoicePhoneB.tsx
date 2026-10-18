import React, { useEffect, useRef, useState } from 'react';
import {
  ChatTeardrop,
  Check,
  Microphone,
  PhoneDisconnect,
  SpeakerHigh,
  SpeakerSlash,
  Translate,
  X,
} from '@phosphor-icons/react';
import TokenImg from '../os/TokenImg';
import AvatarTouchFeedback, { type AvatarTouchEffect } from './AvatarTouchFeedback';
import { estimateLinesTotalMs, resolveSpeakingLineProgress } from '../../utils/callSpeechTiming';
import { buildLineTimings, lineProgressAt, mapLineAcross, resolveLineIndexByTimeline, type SpeechTimeline } from '../../utils/callSpeechTimeline';
import { splitBilingualLines } from '../../utils/callSpeechLines';
import { dockMicOnArm, dockMicOnCancel, dockMicOnDown, dockMicOnUp, type DockMicPhase } from '../../utils/dockMicHold';
import './voicePhoneB.css';

export type VoicePhoneBubble = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  audioUrl?: string;
  thinkingChain?: string;
  timestamp?: number;
  /** 鱼声 with-timestamp 返回的逐字时间（秒）。没有就退回估算。 */
  speechTimeline?: SpeechTimeline | null;
};

type SpeakingTrack = { bubbleId: string; p: number; t: number } | null;

const WAVE = [10, 18, 26, 14, 30, 12, 22, 32, 16, 24, 12, 28, 18, 10, 26, 20];
const DELAYS = [0, 0.07, 0.16, 0.04, 0.24, 0.11, 0.29, 0.06, 0.2, 0.14, 0.26, 0.09];
const SPARKLES = [
  { top: '14%', left: '16%', s: 3 }, { top: '22%', left: '82%', s: 2 },
  { top: '40%', left: '10%', s: 2 }, { top: '58%', left: '88%', s: 3 },
  { top: '70%', left: '20%', s: 2 }, { top: '34%', left: '70%', s: 2 },
  { top: '48%', left: '54%', s: 2 }, { top: '12%', left: '58%', s: 2 },
  { top: '78%', left: '64%', s: 3 }, { top: '64%', left: '38%', s: 2 },
];
const THEMES = ['ink', 'violet', 'day'];
const THEME_KEY = 'sully-voice-b-theme';
// 跟读偏移档位。**方向按「使用逻辑」定，不按「同向/反向」定**：
//   · 字幕跑太快（声音还在上一句，高亮已经跳到下一句）→ 要把字幕**往后拖** → ▲ → 数字变**负**
//   · 字幕跟不上（声音已经念下一句了，高亮还停在这句）→ 要把字幕**往前赶** → ▼ → 数字变**正**
// 所以「负号＝太早、正号＝太晚」，看数字就知道该往哪边调。
// ⚠️ 单位是**秒**：一档 0.5 秒、满档 ±5.0 秒。
//    以前一档 = 总时长的 4%（10 秒音频点一下 0.4 秒、60 秒音频点一下 2.4 秒，同一个按钮两种手感）。
//    key 升到 v2：老值存的是「档」不是秒，换算不出 → 自动重置 0，只发生一次。
const SPEED_KEY = 'sully-voice-b-speed-v2';
const SPEED_MIN = -10;
const SPEED_MAX = 10;
const SPEED_STEP_SEC = 0.5;
const readSpeedStep = () => {
  try {
    const n = Number(window.localStorage.getItem(SPEED_KEY));
    if (Number.isFinite(n)) return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(n)));
  } catch (e) { /* ignore */ }
  return 0;
};
/** 档位 → 秒偏移。正数＝字幕提前（往前赶），负数＝字幕拖后。 */
const speedStepToOffsetSec = (step: number) => step * SPEED_STEP_SEC;
const readTheme = () => {
  try {
    const t = window.localStorage.getItem(THEME_KEY) || '';
    if (THEMES.indexOf(t) >= 0) return t;
  } catch (e) { /* ignore */ }
  return 'ink';
};

type Props = {
  charName: string;
  charAvatar?: string;
  wallpaperUrl?: string;
  elapsedLabel: string;
  statusWord: string;
  waveMode: 'live' | 'think' | 'off';
  emptyPrompt: string;
  bubbles: VoicePhoneBubble[];
  speakingTrack: SpeakingTrack;
  translateVisible: boolean;
  voiceView: 'keys' | 'log';
  sheetOpen: boolean;
  speakerOn: boolean;
  isListening: boolean;
  sttSupported: boolean;
  sttRecSec: number;
  sttStarting: boolean;
  sttPausedByPlayback: boolean;
  sttPreview: string;
  draftInput: string;
  sendingBusy: boolean;
  placeholder: string;
  pendingRetry: boolean;
  errorMessage: string;
  generatingId: string | null;
  rerollingId: string | null;
  playingUserId: string | null;
  draftInputRef: React.RefObject<HTMLInputElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  renderLine: (text: string) => React.ReactNode;
  splitSpeakLines: (text: string) => string[];
  parseVoice: (text: string) => { display: string; voiceText: string };
  stripVoice: (text: string) => string;
  /** 送 TTS 前那套清洗（按当前服务商）。对号用的字表要和音频**同一套规则**，
   *  否则音频删了、字表还留着，字表比音频多字 → 游标卡住 → 整段退回估算。 */
  cleanSpeechLine: (text: string) => string;
  onVoiceView: (view: 'keys' | 'log') => void;
  onSheetOpen: (open: boolean) => void;
  onSpeaker: () => void;
  onMic: () => void;
  onHoldRecordStart: () => void;
  onHoldRecordEnd: () => void;
  onCancelStt: () => void;
  onTranslateTap: () => void;
  onTranslateHold: () => void;
  onHangup: () => void;
  onSend: () => void;
  onDraft: (value: string) => void;
  onPlayAssistant: (bubble: VoicePhoneBubble) => void;
  onDownload: (bubble: VoicePhoneBubble) => void;
  onReroll: (bubble: VoicePhoneBubble) => void;
  onFavorite: (bubble: VoicePhoneBubble) => void;
  onPlayUser: (bubble: VoicePhoneBubble) => void;
  onEdit: (bubble: VoicePhoneBubble) => void;
  onEditReread: (bubble: VoicePhoneBubble) => void;
  onPokeDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPokeMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPokeUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPokeCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPokeKey: () => void;
  pokeNonce: number;
  touchEffects: AvatarTouchEffect[];
};

const VoicePhoneB: React.FC<Props> = (props) => {
  const [theme, setTheme] = useState(readTheme);
  const cycleTheme = () => {
    const i = THEMES.indexOf(theme);
    const next = THEMES[(i + 1) % THEMES.length];
    setTheme(next);
    try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  };
  const [action, setAction] = useState<VoicePhoneBubble | null>(null);
  const transHold = useRef<number | null>(null);
  const readBox = useRef<HTMLDivElement | null>(null);
  const capBox = useRef<HTMLDivElement | null>(null);
  const dockTimer = useRef<number | null>(null);
  const dockPhase = useRef<DockMicPhase>('idle');
  const dockPointerId = useRef<number | null>(null);
  const dockMicEl = useRef<HTMLDivElement | null>(null);
  const dockStopWatch = useRef<(() => void) | null>(null);
  const dockApi = useRef(props);
  dockApi.current = props;
  const sheetOpenedAt = useRef(0);
  /** 程序自己写 scrollTop 的那一瞬间。这一下冒出来的 scroll 不算用户拖。 */
  const ownScroll = useRef(false);
  /** 最近约 40 毫秒内程序写下的位置。只用来认回声，手指按下就清空。 */
  const ownEcho = useRef<{ y: number; t: number }[]>([]);
  /** 用户还占着列表。占着的时候，弹簧和跟读都不许写 scrollTop。 */
  const blockFollow = useRef(false);
  const userMoved = useRef(false);
  const scrollWhich = useRef<'keys' | 'log' | null>(null);
  /** 手指还按在字幕上。指针被浏览器取消不算松开。 */
  const fingerDown = useRef(false);
  const idleTimer = useRef(0);
  const wantFollow = useRef(false);
  const settleRef = useRef<() => void>(() => {});
  const lingerLine = useRef<string | null>(null);
  /** 每句当前亮到哪。换句时从这里缓过去，不跟屏幕正中走。 */
  const lyricShown = useRef(new WeakMap<HTMLElement, { scale: number; opacity: number; blur: number }>());
  const nameHold = useRef<number | null>(null);
  const didInitScroll = useRef(false);
  // 跟读偏移档位：长按某一句 → 旁边浮出上下箭头，点箭头一档一档调。
  const [speedStep, setSpeedStep] = useState(readSpeedStep);
  const [tuningKey, setTuningKey] = useState<string | null>(null);
  const speedOffsetSec = speedStepToOffsetSec(speedStep);
  const setSpeed = (step: number) => {
    const next = Math.max(SPEED_MIN, Math.min(SPEED_MAX, step));
    setSpeedStep(next);
    try { window.localStorage.setItem(SPEED_KEY, String(next)); } catch (e) { /* ignore */ }
  };
  // 长按某句开调速面板；不按、或按住滑走超过阈值，就当普通滚动处理。
  const lineTuneTimer = useRef<number | null>(null);
  const lineTuneX = useRef(0);
  const lineTuneY = useRef(0);
  const clearLineTune = () => {
    if (lineTuneTimer.current) { window.clearTimeout(lineTuneTimer.current); lineTuneTimer.current = null; }
  };
  const lineTuneProps = (key: string) => ({
    onPointerDown: (event: React.PointerEvent) => {
      clearLineTune();
      lineTuneX.current = event.clientX;
      lineTuneY.current = event.clientY;
      lineTuneTimer.current = window.setTimeout(() => {
        lineTuneTimer.current = null;
        setTuningKey(key);
      }, 420);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!lineTuneTimer.current) return;
      if (Math.hypot(event.clientX - lineTuneX.current, event.clientY - lineTuneY.current) > 10) clearLineTune();
    },
    onPointerUp: clearLineTune,
    onPointerCancel: clearLineTune,
    onPointerLeave: clearLineTune,
  });
  // 面板开着时：点页面别处（含点任意别的句子）立刻收起；页面一动也收起。
  // 面板自己冒泡挡住，所以这里只处理「面板之外」的落点。
  useEffect(() => {
    if (!tuningKey) return;
    const close = () => setTuningKey(null);
    const onDown = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest && target.closest('.vb-speed')) return;
      close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('pointerdown', onDown, true);
      clearLineTune();
    };
  }, [tuningKey]);

  /**
   * 字幕滚动。不用浏览器自带的平滑滚动：老内核上会静默失败，手感也是匀速滑。
   *
   * 手指还按着，弹簧不许写 scrollTop。手机一滑动就会取消指针，那一下不算松手。
   * 只有 touchend / pointerup 才算手离开。离开之后列表若还在滑，也不托回。
   * 最后一次滚动停稳约 360 毫秒，四键和全屏才把正在念的那句托回正中。
   *
   * 亮、淡、糊绑在正在念的那句上，不绑在屏幕正中。拖动时正中换句也不许轮流变亮。
   * 糊是慢坡：旁边一句已经柔，再远继续加重，最远约 1.15px。换句时大约 0.18 秒缓过去。
   * 播放结束、暂停，正在念的标记没了，这三样立刻清掉。名字不参与绘制。
   */
  const lyricSpring = useRef({ box: null as HTMLElement | null, target: 0, y: 0, v: 0, active: false });
  const motionReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const stopLyricSpring = () => { lyricSpring.current.active = false; };
  const clearOwnEcho = () => { ownEcho.current = []; };
  const armIdle = (ms: number) => {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (fingerDown.current) return;
      settleRef.current();
    }, ms);
  };
  /** 手指落下：先把弹簧停死。取消指针、窗口失焦都不从这里放行。 */
  const claimScroll = (which: 'keys' | 'log') => {
    blockFollow.current = true;
    scrollWhich.current = which;
    fingerDown.current = true;
    stopLyricSpring();
    clearOwnEcho();
    window.clearTimeout(idleTimer.current);
  };
  const rememberOwn = (y: number) => {
    const now = Date.now();
    const list = ownEcho.current;
    list.push({ y: y, t: now });
    while (list.length && now - list[0].t > 40) list.shift();
  };
  const isOwnPosition = (top: number) => {
    if (ownScroll.current) return true;
    const now = Date.now();
    const list = ownEcho.current;
    for (let i = list.length - 1; i >= 0; i--) {
      if (now - list[i].t > 40) break;
      if (Math.abs(list[i].y - top) < 2) return true;
    }
    return false;
  };
  /** 只有手真正离开才开始等列表停。pointercancel 不准进这里。 */
  const notePointerEnd = () => {
    const wasDown = fingerDown.current;
    fingerDown.current = false;
    if (!wasDown || !blockFollow.current) return;
    armIdle(360);
  };
  const markUserScroll = (which: 'keys' | 'log') => {
    blockFollow.current = true;
    userMoved.current = true;
    scrollWhich.current = which;
    clearOwnEcho();
    stopLyricSpring();
    if (fingerDown.current) {
      window.clearTimeout(idleTimer.current);
      return;
    }
    armIdle(360);
  };
  const writeScrollTop = (box: HTMLElement, y: number) => {
    const max = Math.max(0, box.scrollHeight - box.clientHeight);
    const next = Math.max(0, Math.min(max, y));
    rememberOwn(next);
    ownScroll.current = true;
    box.scrollTop = next;
    ownScroll.current = false;
  };
  const scrollBoxTo = (box: HTMLElement | null, next: number) => {
    if (!box || !Number.isFinite(next)) return;
    if (blockFollow.current) return;
    const max = Math.max(0, box.scrollHeight - box.clientHeight);
    const target = Math.max(0, Math.min(max, next));
    if (motionReduced()) {
      stopLyricSpring();
      writeScrollTop(box, target);
      return;
    }
    const spring = lyricSpring.current;
    if (!spring.active || spring.box !== box) {
      spring.box = box;
      spring.y = box.scrollTop;
      spring.v = 0;
    }
    spring.target = target;
    spring.active = true;
  };
  const lyricNodes = (box: HTMLElement, keysMode: boolean) => (
    box.querySelectorAll(keysMode ? '.vb-line, .vb-k-user' : '.vb-line, .vb-you-text')
  );
  const clearLyricPaint = (box: HTMLElement, keysMode: boolean) => {
    const shown = lyricShown.current;
    const nodes = lyricNodes(box, keysMode);
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i] as HTMLElement;
      shown.delete(el);
      if (!el.style.transform && !el.style.filter && !el.style.opacity) continue;
      el.style.transform = '';
      el.style.filter = '';
      el.style.opacity = '';
    }
  };
  /** 名字是旁边的按钮，不是句子。每帧清掉可能沾上的行内样式，颜色交给原来的变量。 */
  const clearNamePaint = (box: HTMLElement) => {
    const root = (box.closest && box.closest('.sully-voice-b')) || box;
    const names = root.querySelectorAll('.vb-name, .vb-k-name, .vb-who');
    for (let i = 0; i < names.length; i++) {
      const el = names[i] as HTMLElement;
      if (!el.style.opacity && !el.style.filter && !el.style.transform && !el.style.color) continue;
      el.style.opacity = '';
      el.style.filter = '';
      el.style.transform = '';
      el.style.color = '';
    }
  };
  const paintLyricFocus = (box: HTMLElement, keysMode: boolean, dt: number) => {
    clearNamePaint(box);
    const spoken = box.querySelector('.sully-speaking-line') as HTMLElement | null;
    if (!spoken) {
      clearLyricPaint(box, keysMode);
      return;
    }
    const reduced = motionReduced();
    const spokenRect = spoken.getBoundingClientRect();
    const anchor = spokenRect.top + spokenRect.height / 2;
    const nodes = lyricNodes(box, keysMode);
    const sample = box.querySelector('.vb-line') as HTMLElement | null;
    const unit = Math.max(28, sample ? sample.offsetHeight : 36);
    const ease = reduced ? 1 : (1 - Math.exp(-Math.max(0.001, dt) / 0.18));
    const shown = lyricShown.current;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i] as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.height < 1) continue;
      const dist = Math.abs((rect.top + rect.height / 2) - anchor);
      const u = dist / unit;
      let tScale = 1 - Math.min(0.06, u * 0.035);
      let tOpacity = Math.pow(0.78, u);
      if (tOpacity < 0.4) tOpacity = 0.4;
      if (tOpacity > 1) tOpacity = 1;
      const tBlur = reduced ? 0 : Math.min(1.15, (1 - Math.exp(-u * 0.42)) * 1.15);
      const prev = shown.get(el);
      let scale = tScale;
      let opacity = tOpacity;
      let blur = tBlur;
      if (prev && !reduced) {
        scale = prev.scale + (tScale - prev.scale) * ease;
        opacity = prev.opacity + (tOpacity - prev.opacity) * ease;
        blur = prev.blur + (tBlur - prev.blur) * ease;
        if (Math.abs(scale - tScale) < 0.001) scale = tScale;
        if (Math.abs(opacity - tOpacity) < 0.004) opacity = tOpacity;
        if (Math.abs(blur - tBlur) < 0.01) blur = tBlur;
      }
      shown.set(el, { scale: scale, opacity: opacity, blur: blur });
      if (reduced) {
        el.style.transform = '';
        el.style.filter = '';
        el.style.opacity = opacity.toFixed(3);
        continue;
      }
      el.style.transform = 'scale(' + scale.toFixed(3) + ')';
      el.style.opacity = opacity.toFixed(3);
      el.style.filter = blur < 0.04 ? '' : 'blur(' + blur.toFixed(2) + 'px)';
    }
  };
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      const spring = lyricSpring.current;
      if (blockFollow.current || fingerDown.current) {
        spring.active = false;
      } else if (spring.active && spring.box) {
        if (!spring.box.isConnected) {
          spring.active = false;
        } else {
          const acc = -180 * (spring.y - spring.target) - 24 * spring.v;
          spring.v += acc * dt;
          spring.y += spring.v * dt;
          if (Math.abs(spring.y - spring.target) < 0.35 && Math.abs(spring.v) < 8) {
            spring.y = spring.target;
            spring.v = 0;
            spring.active = false;
          }
          const max = Math.max(0, spring.box.scrollHeight - spring.box.clientHeight);
          const y = Math.max(0, Math.min(max, spring.y));
          rememberOwn(y);
          ownScroll.current = true;
          spring.box.scrollTop = y;
          ownScroll.current = false;
        }
      }
      const box = props.voiceView === 'keys' ? capBox.current : readBox.current;
      if (box) paintLyricFocus(box, props.voiceView === 'keys', dt);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [props.voiceView]);

  useEffect(() => {
    blockFollow.current = false;
    userMoved.current = false;
    fingerDown.current = false;
    const box = props.voiceView === 'keys' ? capBox.current : readBox.current;
    if (!box) return;
    const which: 'keys' | 'log' = props.voiceView === 'keys' ? 'keys' : 'log';
    const onScroll = () => {
      if (isOwnPosition(box.scrollTop)) return;
      markUserScroll(which);
    };
    const onDown = () => claimScroll(which);
    const onUp = () => notePointerEnd();
    box.addEventListener('scroll', onScroll);
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('touchstart', onDown, { passive: true });
    box.addEventListener('touchend', onUp);
    return () => {
      box.removeEventListener('scroll', onScroll);
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('pointerup', onUp);
      box.removeEventListener('touchstart', onDown);
      box.removeEventListener('touchend', onUp);
      window.clearTimeout(idleTimer.current);
    };
  }, [props.voiceView]);

  /** 按 data-k-line 找行。key 里有冒号，选择器万一写坏整个查询会抛，所以套一层壳。 */
  const lineByKey = (box: HTMLElement | null, key: string) => {
    if (!box || !key) return null;
    try {
      return box.querySelector('[data-k-line="' + key + '"]') as HTMLElement | null;
    } catch (e) {
      return null;
    }
  };

  // 手在列表外抬起时，框上收不到 touchend。pointercancel 和失焦不算松手。
  useEffect(() => {
    window.addEventListener('pointerup', notePointerEnd);
    window.addEventListener('touchend', notePointerEnd);
    return () => {
      window.removeEventListener('pointerup', notePointerEnd);
      window.removeEventListener('touchend', notePointerEnd);
      window.clearTimeout(idleTimer.current);
    };
  }, []);

  const clearDockTimer = () => {
    if (dockTimer.current) {
      window.clearTimeout(dockTimer.current);
      dockTimer.current = null;
    }
  };
  const stopDockWatch = () => {
    dockStopWatch.current?.();
    dockStopWatch.current = null;
  };
  const releaseDockCapture = (pointerId: number | null) => {
    const el = dockMicEl.current;
    if (!el || pointerId == null) return;
    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    } catch { /* 捕获已经不在了 */ }
  };
  const finishDockUp = () => {
    const result = dockMicOnUp(dockPhase.current);
    dockPhase.current = result.phase;
    clearDockTimer();
    releaseDockCapture(dockPointerId.current);
    dockPointerId.current = null;
    stopDockWatch();
    if (result.action === 'send') dockApi.current.onHoldRecordEnd();
    else if (result.action === 'open-sheet') {
      sheetOpenedAt.current = Date.now();
      dockApi.current.onSheetOpen(true);
    }
  };
  const watchDockRelease = (pointerId: number) => {
    stopDockWatch();
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      finishDockUp();
    };
    window.addEventListener('pointerup', onUp, true);
    dockStopWatch.current = () => window.removeEventListener('pointerup', onUp, true);
  };
  const onDockPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 个别内核拒绝捕获 */ }
    event.preventDefault();
    const prev = dockPhase.current;
    dockPhase.current = dockMicOnDown(prev);
    dockPointerId.current = event.pointerId;
    watchDockRelease(event.pointerId);
    clearDockTimer();
    if (prev === 'recording') return;
    dockTimer.current = window.setTimeout(() => {
      dockTimer.current = null;
      const armed = dockMicOnArm(dockPhase.current);
      dockPhase.current = armed;
      if (armed === 'recording') dockApi.current.onHoldRecordStart();
    }, 320);
  };
  const onDockPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dockPointerId.current != null && event.pointerId !== dockPointerId.current) return;
    finishDockUp();
  };
  const onDockPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dockPointerId.current != null && event.pointerId !== dockPointerId.current) return;
    const next = dockMicOnCancel(dockPhase.current);
    dockPhase.current = next.phase;
    if (next.action !== 'drop-pending') return;
    clearDockTimer();
    releaseDockCapture(dockPointerId.current);
    dockPointerId.current = null;
    stopDockWatch();
  };
  const onDockKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.repeat) return;
    if (dockPhase.current === 'recording' || dockApi.current.isListening) {
      dockPhase.current = 'idle';
      clearDockTimer();
      releaseDockCapture(dockPointerId.current);
      dockPointerId.current = null;
      stopDockWatch();
      dockApi.current.onHoldRecordEnd();
      return;
    }
    sheetOpenedAt.current = Date.now();
    dockApi.current.onSheetOpen(true);
  };
  useEffect(() => {
    const el = dockMicEl.current;
    if (!el) return;
    // React 挂在根上的触摸监听是被动的，拦不住系统长按。这里单独用不被动的监听把菜单按掉。
    const blockMenu = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    el.addEventListener('touchstart', blockMenu, { passive: false });
    return () => el.removeEventListener('touchstart', blockMenu);
  }, [props.voiceView, props.sheetOpen]);
  useEffect(() => () => {
    clearDockTimer();
    stopDockWatch();
  }, []);

  const bubbleLen = props.bubbles.length;
  const prevView = useRef(props.voiceView);
  const prevLen = useRef(bubbleLen);
  useEffect(() => {
    const last = props.bubbles[bubbleLen - 1];
    const switched = prevView.current !== props.voiceView;
    const grew = bubbleLen > prevLen.current;
    prevView.current = props.voiceView;
    prevLen.current = bubbleLen;
    if (props.voiceView === 'keys') {
      if (grew && last && last.role === 'user') {
        if (blockFollow.current) return;
        const node = lineByKey(capBox.current, last.id + ':u');
        if (node) {
          centerCapLine(node, true);
          // 新气泡刚进 DOM，行高可能还没量准；下一帧再对一次，第二次多半就正了。
          window.requestAnimationFrame(() => {
            if (blockFollow.current) return;
            centerCapLine(node, true);
          });
        }
      }
      return;
    }
    const el = (props.scrollRef && props.scrollRef.current) || readBox.current;
    if (!el) return;
    if (blockFollow.current) return;
    if (switched || grew) {
      scrollBoxTo(el, el.scrollHeight);
    }
  }, [bubbleLen, props.voiceView]);

  const moreBtn = (bubble: VoicePhoneBubble) => (
    <button type="button" className="vb-more" aria-label="更多" onClick={(event) => { event.stopPropagation(); setAction(bubble); }}>···</button>
  );

  const clearNameHold = () => {
    if (nameHold.current) {
      window.clearTimeout(nameHold.current);
      nameHold.current = null;
    }
  };
  const nameHoldProps = (bubble: VoicePhoneBubble) => ({
    onPointerDown: (event: React.PointerEvent) => {
      if (!event.isPrimary) return;
      clearNameHold();
      const x0 = event.clientX;
      const y0 = event.clientY;
      nameHold.current = window.setTimeout(() => {
        nameHold.current = null;
        setAction(bubble);
      }, 700);
      const move = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) clearNameHold();
      };
      const end = () => {
        clearNameHold();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      setAction(bubble);
    },
  });

  // 双语切句已搬到 utils/callSpeechLines.ts（纯计算，带单测）：
  // ⚠️ 那里的中文圆括号上限必须和送 TTS 的清洗、对号字表一样是 80，否则两边行数会错开。
  // 单语 / 视频仍走 CallApp 那套老切法，与这里无关。

  /**
   * 现在该亮第几句。
   *
   * 双语（<语音> 里是原文、标签外是字幕）时：**位置永远按原文算**（声音念的就是原文），
   * 算出来的「原文第几句 + 这一句念到几成」再摊到字幕行上（`mapLineAcross`）：
   *   · 有鱼声真秒数 → 用真秒数定位原文第几句，句内进度按「下一句的起始时间」算
   *   · 没真秒数 → 按原文每句的预计念多久定位，句内进度用同一套权重算
   *   · 两边句数相同（单语，或字幕正好一句对一句）→ 摊行这步原样返回，逐字一致
   * ⚠️ 以前句数不同就整个放弃、改拿**中文字数**猜进度 —— 声音念的是外语，
   *    中文译文字数占比和音频占比对不上 → 整段越走越慢。别再退回那种做法。
   */
  const lineIndex = (bubble: VoicePhoneBubble, useLines: string[], spokenLines?: string[]) => {
    const tracking = props.speakingTrack && props.speakingTrack.bubbleId === bubble.id ? props.speakingTrack : null;
    if (!useLines.length) return -1;
    if (!tracking) return useLines.length - 1;
    // 声音念的那份（原文）；没有就退回字幕自己。
    const spoken = (spokenLines && spokenLines.length) ? spokenLines : useLines;
    const spread = spoken.length !== useLines.length;   // 要不要摊到字幕行上
    const atSec = tracking.t + speedOffsetSec;
    // —— 1) 鱼声真时间轴：拿原文去对逐字秒数（同一个语言，字字对得上）
    const timings = buildLineTimings(spoken, bubble.speechTimeline, props.cleanSpeechLine);
    const atLine = resolveLineIndexByTimeline(timings, atSec);
    if (atLine >= 0) {
      if (!spread) return atLine;
      const ratio = lineProgressAt(timings, atLine, atSec, bubble.speechTimeline ? bubble.speechTimeline.durationSec : undefined);
      return mapLineAcross(atLine, spoken.length, useLines.length, ratio);
    }
    // —— 2) 没有真秒数：按原文每句的预计念多久定位（标点停顿 + 拉丁词音节），
    //        再叠加用户的字幕偏移。偏移的单位是秒，估算吃的是「进度」，所以按整段预计秒数换算一次。
    // ⚠️ 估算必须用**清洗后**的字：舞台指示（（小声）这类）根本不会被念出来，算进去会把那一句撑大。
    //    实测 Ann 那句 47 字的（「仕事」…）让第 1 句占比从真实的 23% 涨到 42%
    //    ⇒ 前面拖、后面追，怎么调都对不上。清洗和送 TTS 是同一条规则（cleanSpeechLine）。
    const estimateLines = spoken.map(line => props.cleanSpeechLine(line || ''));
    const totalSec = estimateLinesTotalMs(estimateLines) / 1000;
    const offsetProgress = totalSec > 0 ? speedOffsetSec / totalSec : 0;
    const at = resolveSpeakingLineProgress(estimateLines, tracking.p, offsetProgress);
    if (at.index < 0) return -1;
    if (!spread) return at.index;
    return mapLineAcross(at.index, spoken.length, useLines.length, at.ratio);
  };

  const bubbleLines = (bubble: VoicePhoneBubble) => {
    const parsed = props.parseVoice(bubble.text);
    const bilingual = !!(parsed.display && parsed.display.trim() && parsed.voiceText && parsed.voiceText.trim());
    const body = (parsed.display && parsed.display.trim()) || parsed.voiceText || bubble.text || '';
    // 双语：字幕按「句」切（只看标点），一句一行，和声音的推进单位一致。
    // 单语：保持原来那套切法（含换行那一刀），行为一个字没变。
    let useLines: string[];
    if (bilingual) {
      useLines = splitBilingualLines(body);
    } else {
      // 单语（没开语种翻译）：**完全原来的自然分句**，一行没动。
      // 单语的时间轴和显示同源，不需要任何对齐处理。
      const lines = body ? props.splitSpeakLines(body) : [];
      useLines = lines.length ? lines : (body ? [body] : []);
    }
    // 原文的句子：只用来算时间，不参与显示。
    const spokenLines = bilingual ? splitBilingualLines(parsed.voiceText) : undefined;
    const clean = bilingual ? props.stripVoice(parsed.voiceText) : '';
    return { parsed, clean, useLines, spokenLines };
  };

  const centerCapLine = (el: HTMLElement, smooth: boolean) => {
    const box = capBox.current;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    const lineRect = el.getBoundingClientRect();
    const delta = (lineRect.top + lineRect.height / 2) - (boxRect.top + boxRect.height / 2);
    if (!Number.isFinite(delta)) return;
    if (Math.abs(delta) < 3) return;
    const next = box.scrollTop + delta;
    if (smooth) {
      scrollBoxTo(box, next);
    } else {
      stopLyricSpring();
      writeScrollTop(box, next);
    }
  };

  const lineAtBoxCenter = (box: HTMLElement | null) => {
    if (!box) return null;
    const mid = box.getBoundingClientRect().top + box.clientHeight / 2;
    const nodes = box.querySelectorAll('.vb-line, .vb-k-user, .vb-you-text');
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as HTMLElement;
      const rect = node.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  };

  const trackBubbleId = props.speakingTrack ? props.speakingTrack.bubbleId : '';
  const trackIdx = trackBubbleId ? props.bubbles.findIndex((item) => item.id === trackBubbleId) : -1;
  let followKey = '';
  if (trackIdx >= 0) {
    const tracked = props.bubbles[trackIdx];
    if (tracked && tracked.role === 'assistant') {
      const { useLines, spokenLines } = bubbleLines(tracked);
      const idx = lineIndex(tracked, useLines, spokenLines);
      if (idx >= 0) followKey = tracked.id + ':' + idx;
    }
  }

  const centerLogLine = (el: HTMLElement, smooth: boolean) => {
    const box = readBox.current;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    const lineRect = el.getBoundingClientRect();
    const delta = (lineRect.top + lineRect.height / 2) - (boxRect.top + boxRect.height / 2);
    if (!Number.isFinite(delta)) return;
    if (Math.abs(delta) < 3) return;
    const next = box.scrollTop + delta;
    if (smooth) {
      scrollBoxTo(box, next);
    } else {
      stopLyricSpring();
      writeScrollTop(box, next);
    }
  };

  const runKeysFollow = () => {
    if (!followKey) return;
    if (lingerLine.current === followKey) return;
    lingerLine.current = null;
    const box = capBox.current;
    // 先找「正在念」那一行；万一标记没贴上，就按 key 直接找——别整段放弃。
    const el = box
      ? ((box.querySelector('[data-k-now]') || lineByKey(box, followKey)) as HTMLElement | null)
      : null;
    if (el) centerCapLine(el, true);
  };
  const runLogFollow = () => {
    if (!followKey) return;
    if (lingerLine.current === followKey) return;
    lingerLine.current = null;
    const box = readBox.current;
    const el = box ? (box.querySelector('.sully-speaking-line') as HTMLElement | null) : null;
    if (el) centerLogLine(el, true);
  };

  // 列表停稳、手也离开了，才走到这里。四键和全屏同一套：正中不是正在念的那句才托回去。
  settleRef.current = () => {
    if (fingerDown.current) return;
    const which = scrollWhich.current;
    const moved = userMoved.current;
    blockFollow.current = false;
    userMoved.current = false;
    scrollWhich.current = null;
    clearOwnEcho();
    if (moved && (which === 'keys' || which === 'log')) {
      wantFollow.current = false;
      const box = which === 'keys' ? capBox.current : readBox.current;
      const spoken = box
        ? (box.querySelector('.sully-speaking-line') as HTMLElement | null)
        : null;
      const at = lineAtBoxCenter(box);
      if (spoken && at && at !== spoken) {
        lingerLine.current = null;
        if (which === 'keys') centerCapLine(spoken, true);
        else centerLogLine(spoken, true);
      } else {
        lingerLine.current = followKey || null;
      }
      return;
    }
    if (wantFollow.current) {
      wantFollow.current = false;
      if (props.voiceView === 'keys') runKeysFollow();
      else runLogFollow();
    }
  };

  useEffect(() => {
    if (didInitScroll.current) return;
    if (!bubbleLen) return;
    didInitScroll.current = true;
    if (props.voiceView === 'keys') {
      const box = capBox.current;
      const nodes = box ? box.querySelectorAll('[data-k-line]') : [];
      const last = nodes.length ? (nodes[nodes.length - 1] as HTMLElement) : null;
      if (last) centerCapLine(last, false);
      return;
    }
    const el = (props.scrollRef && props.scrollRef.current) || readBox.current;
    if (el) {
      stopLyricSpring();
      writeScrollTop(el, el.scrollHeight);
    }
  }, [bubbleLen, props.voiceView]);

  useEffect(() => {
    if (props.voiceView !== 'keys') return;
    if (!followKey) return;
    const follow = () => {
      if (blockFollow.current) {
        wantFollow.current = true;
        return;
      }
      runKeysFollow();
    };
    follow();
    // 行刚换，高度要下一帧才量得准：再对一次。
    const raf = window.requestAnimationFrame(follow);
    return () => window.cancelAnimationFrame(raf);
  }, [props.voiceView, followKey]);

  useEffect(() => {
    if (props.voiceView !== 'log') return;
    if (!followKey) return;
    const follow = () => {
      if (blockFollow.current) {
        wantFollow.current = true;
        return;
      }
      runLogFollow();
    };
    follow();
    const raf = window.requestAnimationFrame(follow);
    return () => window.cancelAnimationFrame(raf);
  }, [props.voiceView, followKey]);

  // 长按某句后浮在旁边的小控件：上下两个小三角 + 中间偏移数字。
  // ▲＝字幕往后拖（它跑太快了，就往回拉），▼＝字幕往前赶（它跟不上，就往前送）。
  // 所以 ▲ 数字变负、▼ 数字变正 —— 和「快→负、慢→正」的使用逻辑一致：
  // 看数字就知道该往哪边调，负号＝太早、正号＝太晚。
  // 没有外框，只用半透明小片贴在这句话末尾，不遮正文。
  const speedTuner = (key: string) => (
    tuningKey === key ? (
      <div className="vb-speed" onPointerDown={(event) => { event.stopPropagation(); }}>
        <button
          type="button"
          className="vb-speed-btn"
          aria-label="字幕往后拖一点"
          disabled={speedStep <= SPEED_MIN}
          onClick={(event) => { event.stopPropagation(); setSpeed(speedStep - 1); }}
        ><span aria-hidden="true">▲</span></button>
        <span className="vb-speed-num" title="负数＝字幕太早，往正数调；正数＝字幕太晚，往负数调">{speedOffsetSec > 0 ? '+' + speedOffsetSec.toFixed(1) : speedOffsetSec.toFixed(1)}s</span>
        <button
          type="button"
          className="vb-speed-btn"
          aria-label="字幕往前赶一点"
          disabled={speedStep >= SPEED_MAX}
          onClick={(event) => { event.stopPropagation(); setSpeed(speedStep + 1); }}
        ><span aria-hidden="true">▼</span></button>
      </div>
    ) : null
  );

  const renderKeysAi = (bubble: VoicePhoneBubble, index: number) => {
    const { clean, useLines, spokenLines } = bubbleLines(bubble);
    const tracking = props.speakingTrack && props.speakingTrack.bubbleId === bubble.id ? props.speakingTrack : null;
    const activeIdx = tracking ? lineIndex(bubble, useLines, spokenLines) : -1;
    return (
      <div className="vb-k-body">
        {useLines.map((line, i) => {
          let kind = 'on';
          if (trackIdx >= 0) {
            if (index < trackIdx) kind = 'old';
            else if (index > trackIdx) kind = 'off';
            else kind = i === activeIdx ? 'now' : (i < activeIdx ? 'old' : 'off');
          }
          const key = bubble.id + ':' + i;
          return (
            <div
              key={i}
              data-k-line={key}
              data-k-now={kind === 'now' ? '1' : undefined}
              className={'vb-line vb-line-' + kind + (kind === 'now' ? ' sully-speaking-line' : '')}
              {...lineTuneProps(key)}
            >
              {props.renderLine(line)}
              {speedTuner(key)}
            </div>
          );
        })}
        {clean ? <div className="vb-tr">{clean}</div> : null}
      </div>
    );
  };

  const renderLogKaraoke = (bubble: VoicePhoneBubble) => {
    const { clean, useLines, spokenLines } = bubbleLines(bubble);
    const tracking = props.speakingTrack && props.speakingTrack.bubbleId === bubble.id ? props.speakingTrack : null;
    const activeIdx = tracking ? lineIndex(bubble, useLines, spokenLines) : -1;
    return (
      <div className="vb-body">
        {bubble.thinkingChain && (
          <details className="vb-heart">
            <summary>心象</summary>
            <p>{bubble.thinkingChain}</p>
          </details>
        )}
        {useLines.map((line, i) => {
          const kind = activeIdx < 0 ? 'on' : (i === activeIdx ? 'now' : (i < activeIdx ? 'old' : 'off'));
          const key = bubble.id + ':' + i;
          return (
            <div key={i} className={'vb-line vb-line-' + kind + (kind === 'now' ? ' sully-speaking-line' : '')} {...lineTuneProps(key)}>
              {props.renderLine(line)}
              {speedTuner(key)}
            </div>
          );
        })}
        {clean ? <div className="vb-tr">{clean}</div> : null}
      </div>
    );
  };

  const recLabel = props.sttStarting
    ? '连接中…'
    : props.sttPausedByPlayback
      ? '对方说话中…'
      : '录音中 ' + Math.floor(props.sttRecSec / 60) + ':' + String(props.sttRecSec % 60).padStart(2, '0');

  const field = (
    <div className={'vb-field' + (props.isListening ? ' rec' : '')}>
      {props.isListening ? (
        <>
          <button type="button" className="vb-side left" aria-label="取消录音" onClick={props.onCancelStt}>
            <X size={14} weight="bold" />
          </button>
          <div className="vb-rec-mid">
            <div className="vb-rec-lab">{recLabel}</div>
            {props.sttPreview ? <div className="vb-rec-preview">{props.sttPreview}</div> : null}
          </div>
          <button type="button" className="vb-side right send" aria-label="说完发送" onClick={props.onMic}>
            <Check size={16} weight="bold" />
          </button>
        </>
      ) : (
        <>
          {props.sttSupported ? (
            <button type="button" className="vb-side left" aria-label="语音输入" onClick={props.onMic} disabled={props.sendingBusy}>
              <Microphone size={16} weight="fill" />
            </button>
          ) : null}
          <input
            ref={props.draftInputRef as React.RefObject<HTMLInputElement>}
            value={props.draftInput}
            onChange={(event) => props.onDraft(event.target.value)}
            placeholder={props.placeholder}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onSend();
            }}
          />
          <button type="button" className="vb-side right" aria-label="发送" onClick={props.onSend} disabled={props.sendingBusy}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.47 3.97a.75.75 0 011.06 0l7.5 7.5a.75.75 0 11-1.06 1.06L12.75 6.81V20a.75.75 0 01-1.5 0V6.81l-6.22 6.22a.75.75 0 11-1.06-1.06l7.5-7.5z"/></svg>
          </button>
        </>
      )}
    </div>
  );

  const vizClass = 'vb-viz' + (props.waveMode === 'live' ? ' live' : props.waveMode === 'think' ? ' think' : '');
  const keys = props.voiceView === 'keys';
  const pad = (mini: boolean) => {
    const cls = mini ? 'vb-mini' : 'vb-btn';
    const on = (yes: boolean) => (yes ? ' on' : '');
    const holdStart = () => {
      if (transHold.current) window.clearTimeout(transHold.current);
      transHold.current = window.setTimeout(() => props.onTranslateHold(), 500);
    };
    const holdEnd = () => {
      if (transHold.current) {
        window.clearTimeout(transHold.current);
        transHold.current = null;
      }
    };
    const inner = (icon: React.ReactNode, label: string, extra: string, fn: () => void, hold?: boolean) => (
      mini ? (
        <button
          type="button"
          className={cls + extra}
          onClick={fn}
          onContextMenu={hold ? (e) => { e.preventDefault(); props.onTranslateHold(); } : undefined}
          onTouchStart={hold ? holdStart : undefined}
          onTouchEnd={hold ? holdEnd : undefined}
        >{icon}</button>
      ) : (
        <button
          type="button"
          className={cls + extra}
          onClick={fn}
          onContextMenu={hold ? (e) => { e.preventDefault(); props.onTranslateHold(); } : undefined}
          onTouchStart={hold ? holdStart : undefined}
          onTouchEnd={hold ? holdEnd : undefined}
        >
          <span className="c">{icon}</span>{label}
        </button>
      )
    );
    const size = mini ? 18 : 20;
    return (
      <>
        {inner(props.speakerOn ? <SpeakerHigh size={size} weight="fill" /> : <SpeakerSlash size={size} weight="fill" />, '外放', on(props.speakerOn), props.onSpeaker)}
        {inner(<ChatTeardrop size={size} weight="fill" />, '对话', on(!keys), () => props.onVoiceView(keys ? 'log' : 'keys'))}
        {inner(<Translate size={size} weight="fill" />, '翻译', on(props.translateVisible), props.onTranslateTap, true)}
        {inner(<PhoneDisconnect size={size} weight="fill" />, '结束', ' end', props.onHangup)}
      </>
    );
  };

  return (
    <div className={'sully-voice-b' + (keys ? '' : ' is-log') + (keys || !props.sheetOpen ? '' : ' sheet-on') + (props.translateVisible ? '' : ' no-tr')} data-theme={theme}>
      <div className="vb-wall" style={props.wallpaperUrl ? { backgroundImage: 'url(' + props.wallpaperUrl + ')' } : undefined} />
      <div className="vb-glow vb-glow-top" />
      <div className="vb-glow vb-glow-bot" />
      <div className="vb-dim" />
      <div className="vb-stars" aria-hidden="true">
        {SPARKLES.map((p, i) => (
          <i key={i} style={{ top: p.top, left: p.left, width: p.s, height: p.s, animationDelay: (i * 0.4) + 's' }} />
        ))}
      </div>
      <div className="vb-top">
        {keys ? null : (
          <button type="button" className="vb-back" aria-label="返回六键" onClick={() => props.onVoiceView('keys')}>‹</button>
        )}
        <button
          type="button"
          className={'vb-poke' + (keys ? '' : ' sm')}
          aria-label={'戳戳' + props.charName}
          onPointerDown={props.onPokeDown}
          onPointerMove={props.onPokeMove}
          onPointerUp={props.onPokeUp}
          onPointerCancel={props.onPokeCancel}
          onClick={(event) => { if (event.detail === 0) props.onPokeKey(); }}
        >
          <span
            key={'poke-' + props.pokeNonce}
            className="vb-poke-face"
            style={props.pokeNonce ? { animation: 'sully-touch-avatar-bounce 420ms cubic-bezier(.2,.9,.3,1) both' } : undefined}
          >
            {props.charAvatar
              ? <TokenImg value={props.charAvatar} alt={props.charName} className="vb-avatar" draggable={false} />
              : <span className="vb-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3a3a3c' }}>{props.charName.slice(0, 1)}</span>}
            <AvatarTouchFeedback
              characterName={props.charName}
              accentColor="#ffffff"
              effects={props.touchEffects || []}
            />
          </span>
        </button>
        <div className="vb-name">{props.charName}</div>
        <div className="vb-timer">{props.elapsedLabel}</div>
        <div className="vb-live">
          <div className={vizClass}>
            {WAVE.map((h, i) => (
              <i key={i} style={{ animationDelay: DELAYS[i % DELAYS.length] + 's', height: Math.max(4, h * 0.5) + 'px' }} />
            ))}
          </div>
          <div className="vb-state">{props.statusWord}</div>
        </div>
      </div>

      {keys ? (
        <>
          <div className="vb-caption">
            <div
              className="vb-caption-scroll"
              ref={capBox}
            >
              <div className="vb-k-pad" />
              <div className="vb-caption-inner">
                {!props.bubbles.length && <div className="vb-k-name">{props.emptyPrompt}</div>}
                {props.bubbles.map((bubble, index) => {
                  const prev = index > 0 ? props.bubbles[index - 1] : null;
                  const cont = !!(prev && prev.role === bubble.role);
                  if (bubble.role === 'user') {
                    return (
                      <div key={bubble.id} className={'vb-k-block' + (cont ? ' cont' : '')}>
                        {!cont ? (
                          <button type="button" className="vb-k-name" {...nameHoldProps(bubble)}>你</button>
                        ) : null}
                        <div className="vb-k-user" data-k-line={bubble.id + ':u'} {...(cont ? nameHoldProps(bubble) : {})}>{bubble.text}</div>
                      </div>
                    );
                  }
                  return (
                    <div key={bubble.id} className={'vb-k-block' + (cont ? ' cont' : '')}>
                      {!cont ? (
                        <button type="button" className="vb-k-name" {...nameHoldProps(bubble)}>{props.charName}</button>
                      ) : null}
                      <div {...(cont ? nameHoldProps(bubble) : {})}>
                        {renderKeysAi(bubble, index)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="vb-k-pad" />
            </div>
          </div>
          {props.pendingRetry ? <div className="vb-hint">上一句话还没得到回复，点发送可重试</div> : <div className="vb-hint" />}
          {props.errorMessage ? <div className="vb-err">{props.errorMessage}</div> : null}
          <div className="vb-composer">{field}</div>
          <div className="vb-pad"><div className="vb-grid">{pad(false)}</div></div>
          <button type="button" className="vb-home" aria-label="切换配色" onClick={cycleTheme}><span /></button>
        </>
      ) : (
        <>
          <div
            className="vb-read"
            ref={(el) => {
              readBox.current = el;
              if (props.scrollRef) (props.scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }}
          >
            {!props.bubbles.length && <div className="vb-empty">{props.emptyPrompt}</div>}
            {props.bubbles.map((bubble, index) => {
              const prev = index > 0 ? props.bubbles[index - 1] : null;
              const cont = !!(prev && prev.role === bubble.role);
              return (
                <div key={bubble.id} className={'vb-msg ' + bubble.role + (cont ? ' cont' : '')}>
                  <div className={'vb-msg-head' + (bubble.role === 'user' ? ' right' : '')}>
                    {!cont ? (
                      <button type="button" className="vb-who" {...nameHoldProps(bubble)}>
                        {bubble.role === 'user' ? '你' : props.charName}
                      </button>
                    ) : null}
                  </div>
                  <div {...(cont ? nameHoldProps(bubble) : {})}>
                    {bubble.role === 'assistant' ? renderLogKaraoke(bubble) : <div className="vb-you-text">{bubble.text}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {props.errorMessage ? <div className="vb-err">{props.errorMessage}</div> : null}
          <div className="vb-foot">
            {props.sheetOpen ? (
              <div className="vb-sheet">
                {field}
                <div className="vb-minis">{pad(true)}</div>
                <button type="button" className="vb-sheet-close" onClick={() => {
                  if (Date.now() - sheetOpenedAt.current < 400) return;
                  props.onSheetOpen(false);
                }}>收起</button>
              </div>
            ) : (
              <>
                <div className="vb-dock">
                  {props.isListening ? <div className="vb-dock-hint">松手发送</div> : null}
                  <div
                    role="button"
                    tabIndex={0}
                    ref={dockMicEl}
                    className={'vb-dock-mic' + (props.isListening ? ' rec' : '')}
                    aria-label="点按打开键盘，长按录音松开发送"
                    onPointerDown={onDockPointerDown}
                    onPointerUp={onDockPointerUp}
                    onPointerCancel={onDockPointerCancel}
                    onKeyDown={onDockKeyDown}
                    onContextMenu={(event) => { event.preventDefault(); }}
                  >
                    <Microphone size={22} weight="fill" />
                    {props.isListening ? <span className="vb-dock-ring" aria-hidden="true" /> : null}
                  </div>
                </div>
              </>
            )}
            <button type="button" className="vb-home" aria-label="切换配色" onClick={cycleTheme}><span /></button>
          </div>
        </>
      )}

      {action && (
        <div className="vb-mask" onClick={() => setAction(null)}>
          <div className="vb-card" onClick={(event) => event.stopPropagation()}>
            {action.role === 'assistant' ? (
              <>
                <h3>这条语音</h3>
                <p>{props.bubbles[props.bubbles.length - 1]?.id === action.id ? '重播、下载、换个说法、收藏' : '重播、下载、收藏'}</p>
                <div className="row">
                  <button type="button" onClick={() => { props.onPlayAssistant(action); setAction(null); }}>
                    {props.generatingId === action.id ? '生成语音…' : action.audioUrl ? '重播语音' : '播放语音'}
                  </button>
                  <button type="button" onClick={() => { props.onDownload(action); setAction(null); }}>下载</button>
                  {props.bubbles[props.bubbles.length - 1]?.id === action.id && (
                    <button type="button" onClick={() => { props.onReroll(action); setAction(null); }} disabled={!!props.rerollingId}>
                      {props.rerollingId === action.id ? '换一种说法…' : '换个说法'}
                    </button>
                  )}
                  <button type="button" onClick={() => { props.onFavorite(action); setAction(null); }}>收藏</button>
                  <button type="button" onClick={() => { props.onEditReread(action); setAction(null); }}>编辑后重读</button>
                  <button type="button" onClick={() => setAction(null)}>取消</button>
                </div>
              </>
            ) : (
              <>
                <h3>你的语音</h3>
                <p>回放或改刚才说的话</p>
                <div className="row">
                  {action.audioUrl ? (
                    <button type="button" onClick={() => { props.onPlayUser(action); setAction(null); }}>
                      {props.playingUserId === action.id ? '停止回放' : '回放语音'}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => { props.onEdit(action); setAction(null); }}>改刚才的话</button>
                  <button type="button" onClick={() => setAction(null)}>取消</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoicePhoneB;
