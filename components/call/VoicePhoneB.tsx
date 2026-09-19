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
import './voicePhoneB.css';

export type VoicePhoneBubble = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  audioUrl?: string;
  thinkingChain?: string;
  timestamp?: number;
};

type SpeakingTrack = { bubbleId: string; p: number } | null;

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
  const dockHeld = useRef(false);
  const sheetOpenedAt = useRef(0);
  const capHold = useRef(false);
  const capDrag = useRef(false);
  const capStartY = useRef(0);
  const logHold = useRef(false);
  const logDrag = useRef(false);
  const logStartY = useRef(0);
  const lingerLine = useRef<string | null>(null);
  const nameHold = useRef<number | null>(null);
  const didInitScroll = useRef(false);

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
        const node = capBox.current && capBox.current.querySelector('[data-k-line="' + last.id + ':u"]');
        if (node) centerCapLine(node as HTMLElement, true);
      }
      return;
    }
    const el = (props.scrollRef && props.scrollRef.current) || readBox.current;
    if (!el) return;
    if (logHold.current) return;
    if (switched || grew) {
      try { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); } catch (e) { el.scrollTop = el.scrollHeight; }
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

  const lineIndex = (bubble: VoicePhoneBubble, useLines: string[]) => {
    const tracking = props.speakingTrack && props.speakingTrack.bubbleId === bubble.id ? props.speakingTrack : null;
    if (!useLines.length) return -1;
    if (!tracking) return useLines.length - 1;
    let total = 0;
    for (let i = 0; i < useLines.length; i++) total += useLines[i].length;
    const target = tracking.p * total;
    let acc = 0;
    let activeIdx = 0;
    for (let i = 0; i < useLines.length; i++) {
      acc += useLines[i].length;
      activeIdx = i;
      if (target < acc) break;
    }
    return activeIdx;
  };

  const bubbleLines = (bubble: VoicePhoneBubble) => {
    const parsed = props.parseVoice(bubble.text);
    const body = (parsed.display && parsed.display.trim()) || parsed.voiceText || bubble.text || '';
    const lines = body ? props.splitSpeakLines(body) : [];
    const useLines = lines.length ? lines : (body ? [body] : []);
    const bilingual = !!(parsed.display && parsed.display.trim() && parsed.voiceText && parsed.voiceText.trim());
    const clean = bilingual ? props.stripVoice(parsed.voiceText) : '';
    return { parsed, clean, useLines };
  };

  const centerCapLine = (el: HTMLElement, smooth: boolean) => {
    const box = capBox.current;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    const lineRect = el.getBoundingClientRect();
    const delta = (lineRect.top + lineRect.height / 2) - (boxRect.top + boxRect.height / 2);
    if (Math.abs(delta) < 3) return;
    const next = box.scrollTop + delta;
    if (smooth) {
      try { box.scrollTo({ top: next, behavior: 'smooth' }); } catch (e) { box.scrollTop = next; }
    } else {
      box.scrollTop = next;
    }
  };

  const lineAtCapCenter = () => {
    const box = capBox.current;
    if (!box) return null;
    const mid = box.getBoundingClientRect().top + box.clientHeight / 2;
    const nodes = box.querySelectorAll('[data-k-line]');
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
      const { useLines } = bubbleLines(tracked);
      const idx = lineIndex(tracked, useLines);
      if (idx >= 0) followKey = tracked.id + ':' + idx;
    }
  }

  const centerLogLine = (el: HTMLElement, smooth: boolean) => {
    const box = readBox.current;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    const lineRect = el.getBoundingClientRect();
    const delta = (lineRect.top + lineRect.height / 2) - (boxRect.top + boxRect.height / 2);
    if (Math.abs(delta) < 3) return;
    const next = box.scrollTop + delta;
    if (smooth) {
      try { box.scrollTo({ top: next, behavior: 'smooth' }); } catch (e) { box.scrollTop = next; }
    } else {
      box.scrollTop = next;
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
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbleLen, props.voiceView]);

  useEffect(() => {
    if (props.voiceView !== 'keys') return;
    if (!followKey) return;
    if (capHold.current) return;
    if (lingerLine.current === followKey) return;
    lingerLine.current = null;
    const box = capBox.current;
    const el = box ? (box.querySelector('[data-k-now]') as HTMLElement | null) : null;
    if (el) centerCapLine(el, true);
  }, [props.voiceView, followKey]);

  useEffect(() => {
    if (props.voiceView !== 'log') return;
    if (!followKey) return;
    if (logHold.current) return;
    if (lingerLine.current === followKey) return;
    lingerLine.current = null;
    const box = readBox.current;
    const el = box ? (box.querySelector('.sully-speaking-line') as HTMLElement | null) : null;
    if (el) centerLogLine(el, true);
  }, [props.voiceView, followKey]);

  const renderKeysAi = (bubble: VoicePhoneBubble, index: number) => {
    const { clean, useLines } = bubbleLines(bubble);
    const tracking = props.speakingTrack && props.speakingTrack.bubbleId === bubble.id ? props.speakingTrack : null;
    const activeIdx = tracking ? lineIndex(bubble, useLines) : -1;
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
            >
              {props.renderLine(line)}
            </div>
          );
        })}
        {clean ? <div className="vb-tr">{clean}</div> : null}
      </div>
    );
  };

  const renderLogKaraoke = (bubble: VoicePhoneBubble) => {
    const { clean, useLines } = bubbleLines(bubble);
    const tracking = props.speakingTrack && props.speakingTrack.bubbleId === bubble.id ? props.speakingTrack : null;
    const activeIdx = tracking ? lineIndex(bubble, useLines) : -1;
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
          return (
            <div key={i} className={'vb-line vb-line-' + kind + (kind === 'now' ? ' sully-speaking-line' : '')}>
              {props.renderLine(line)}
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
              onPointerDown={(event) => {
                capHold.current = true;
                capDrag.current = false;
                capStartY.current = event.clientY;
              }}
              onPointerMove={(event) => {
                if (!capHold.current) return;
                if (Math.abs(event.clientY - capStartY.current) > 8) capDrag.current = true;
              }}
              onPointerUp={() => {
                const dragged = capDrag.current;
                capHold.current = false;
                capDrag.current = false;
                if (!dragged) return;
                const at = lineAtCapCenter();
                const cur = capBox.current ? (capBox.current.querySelector('[data-k-now]') as HTMLElement | null) : null;
                const atKey = at ? at.getAttribute('data-k-line') : '';
                const curKey = cur ? cur.getAttribute('data-k-line') : '';
                if (cur && atKey && curKey && atKey !== curKey) {
                  lingerLine.current = null;
                  centerCapLine(cur, true);
                } else {
                  lingerLine.current = curKey || followKey || null;
                }
              }}
              onPointerCancel={() => {
                capHold.current = false;
                capDrag.current = false;
              }}
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
            onPointerDown={(event) => {
              logHold.current = true;
              logDrag.current = false;
              logStartY.current = event.clientY;
            }}
            onPointerMove={(event) => {
              if (!logHold.current) return;
              if (Math.abs(event.clientY - logStartY.current) > 8) logDrag.current = true;
            }}
            onPointerUp={() => {
              const dragged = logDrag.current;
              logHold.current = false;
              logDrag.current = false;
              if (!dragged) return;
              const box = readBox.current;
              const cur = box ? (box.querySelector('.sully-speaking-line') as HTMLElement | null) : null;
              if (cur && followKey) lingerLine.current = followKey;
            }}
            onPointerCancel={() => {
              logHold.current = false;
              logDrag.current = false;
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
                {props.isListening ? <div className="vb-dock-hint">松手发送</div> : null}
                <button
                  type="button"
                  className={'vb-dock-mic' + (props.isListening ? ' rec' : '')}
                  aria-label="点按打开键盘，长按录音松开发送"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    dockHeld.current = false;
                    if (dockTimer.current) window.clearTimeout(dockTimer.current);
                    dockTimer.current = window.setTimeout(() => {
                      dockHeld.current = true;
                      props.onHoldRecordStart();
                    }, 320);
                  }}
                  onPointerUp={() => {
                    if (dockTimer.current) {
                      window.clearTimeout(dockTimer.current);
                      dockTimer.current = null;
                    }
                    if (dockHeld.current) {
                      dockHeld.current = false;
                      props.onHoldRecordEnd();
                      return;
                    }
                    sheetOpenedAt.current = Date.now();
                    props.onSheetOpen(true);
                  }}
                  onPointerCancel={() => {
                    if (dockTimer.current) {
                      window.clearTimeout(dockTimer.current);
                      dockTimer.current = null;
                    }
                    if (dockHeld.current) {
                      dockHeld.current = false;
                      props.onCancelStt();
                    }
                  }}
                >
                  <Microphone size={22} weight="fill" />
                </button>
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
                <p>重播、下载、换个说法、收藏</p>
                <div className="row">
                  <button type="button" onClick={() => { props.onPlayAssistant(action); setAction(null); }}>
                    {props.generatingId === action.id ? '生成语音…' : action.audioUrl ? '重播语音' : '播放语音'}
                  </button>
                  <button type="button" onClick={() => { props.onDownload(action); setAction(null); }}>下载</button>
                  <button type="button" onClick={() => { props.onReroll(action); setAction(null); }} disabled={!!props.rerollingId}>
                    {props.rerollingId === action.id ? '换一种说法…' : '换个说法'}
                  </button>
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
