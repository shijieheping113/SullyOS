import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './TextBootSequence.css';

export interface TextBootSequenceProps {
  dataReady: boolean;
  /** 可选最低等待；默认 0。点跳过可略过本限制。 */
  minDurationMs?: number;
  /** 淡出时长，默认 650ms。 */
  exitDurationMs?: number;
  wallpaper?: string;
  onDone: () => void;
}

type Phase = 'waiting' | 'ready' | 'exiting' | 'done';

const WAIT_JA = '起動しています';
const READY_JA = 'ようこそ';
const FILL_TO_FULL_MS = 560;
const READY_HOLD_MS = 1100;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    if (query.addEventListener) {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  return reduced;
}

function finiteMs(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function charsOf(text: string) {
  return Array.from(text);
}

/** 文字风开屏：深底 + 二改图标 + pigcat ver.；等待期呼吸；进度只向前；就绪再拉满。 */
export default function TextBootSequence({
  dataReady,
  minDurationMs = 0,
  exitDurationMs = 650,
  onDone,
}: TextBootSequenceProps) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('waiting');
  const [skipRequested, setSkipRequested] = useState(false);
  const [jaText, setJaText] = useState(WAIT_JA);
  const [enText, setEnText] = useState('starting up');
  const fillRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const finished = useRef(false);
  const latestReady = useRef(dataReady);
  const latestFinish = useRef(onDone);
  const minimum = finiteMs(minDurationMs, 0);
  const exitMs = reduced ? Math.min(160, finiteMs(exitDurationMs, 650)) : finiteMs(exitDurationMs, 650);
  const jaChars = useMemo(() => charsOf(jaText), [jaText]);

  useLayoutEffect(() => {
    latestReady.current = dataReady;
    latestFinish.current = onDone;
  }, [dataReady, onDone]);

  useEffect(() => {
    started.current = performance.now();
  }, []);

  // 等待期间进度只向前，渐近到约 78%；不回缩。
  useEffect(() => {
    if (phase !== 'waiting' || reduced) return;
    let frame = 0;
    const tick = () => {
      const fill = fillRef.current;
      if (!fill) return;
      const elapsed = performance.now() - started.current;
      const progress = 78 * (1 - Math.exp(-elapsed / 3500));
      fill.style.width = progress.toFixed(2) + '%';
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced]);

  useEffect(() => {
    if (phase !== 'waiting' || !reduced || !fillRef.current) return;
    fillRef.current.style.width = '55%';
  }, [phase, reduced]);

  const readFillPercent = () => {
    const fill = fillRef.current;
    const track = trackRef.current;
    if (!fill || !track) return 0;
    const trackWidth = track.getBoundingClientRect().width;
    if (!trackWidth) return 0;
    return Math.max(0, Math.min(100, fill.getBoundingClientRect().width / trackWidth * 100));
  };

  const finish = useCallback(() => {
    if (finished.current) return;
    if (!latestReady.current) {
      setPhase('waiting');
      return;
    }
    finished.current = true;
    setPhase('done');
    latestFinish.current();
  }, []);

  const beginReady = useCallback(() => {
    const from = reduced ? 55 : readFillPercent();
    const fill = fillRef.current;
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = from + '%';
      void fill.offsetWidth;
    }
    setJaText(READY_JA);
    setEnText('welcome');
    setPhase('ready');
    // setTimeout 便于测试推进；正式界面仍能看见从当前进度拉满。
    window.setTimeout(() => {
      if (!fillRef.current) return;
      fillRef.current.style.transition = 'width ' + (reduced ? 160 : FILL_TO_FULL_MS) + 'ms ' + EASE;
      fillRef.current.style.width = '100%';
    }, 16);
  }, [reduced]);

  useEffect(() => {
    if (phase === 'done' || phase === 'exiting' || phase === 'ready') return;
    if (!dataReady) return;
    if (skipRequested) {
      beginReady();
      return;
    }
    const remaining = Math.max(0, minimum - (performance.now() - started.current));
    if (remaining === 0) {
      beginReady();
      return;
    }
    const timer = window.setTimeout(beginReady, remaining);
    return () => window.clearTimeout(timer);
  }, [dataReady, phase, skipRequested, minimum, beginReady]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const hold = reduced ? 160 : READY_HOLD_MS;
    const timer = window.setTimeout(() => {
      if (!latestReady.current) {
        setPhase('waiting');
        setJaText(WAIT_JA);
        setEnText('starting up');
        return;
      }
      setPhase('exiting');
    }, hold);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    const timer = window.setTimeout(finish, exitMs + 40);
    return () => window.clearTimeout(timer);
  }, [phase, exitMs, finish]);

  const requestSkip = () => {
    if (phase === 'done' || phase === 'exiting') return;
    setSkipRequested(true);
    if (phase === 'waiting' && dataReady) beginReady();
    else if (phase === 'ready') setPhase('exiting');
  };

  if (phase === 'done') return null;

  return (
    <div
      className={`sully-text-boot is-${phase === 'exiting' ? 'exit' : phase === 'waiting' ? 'waiting' : 'ready'}`}
      style={{ ['--exit-duration' as string]: exitMs + 'ms' }}
      role="button"
      tabIndex={0}
      aria-label={dataReady ? '跳过开屏动画' : '跳过开屏动画，加载完成后进入'}
      onClick={requestSkip}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!event.repeat) requestSkip();
        }
      }}
    >
      <div className="sully-text-boot-copy">
        <div className="sully-text-boot-icon" aria-hidden="true">
          <svg viewBox="0 0 120 112" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 67Q10 34 16 12Q18 5 24 10L57 38L56 69Z" fill="#3d3a36" />
            <path d="M22 18Q20 28 19 37L39 33Z" fill="#ebe4da" />
            <path d="M110 67Q110 34 104 12Q102 5 96 10L63 38L64 69Z" fill="#3d3a36" />
            <path d="M98 18Q100 28 101 37L81 33Z" fill="#ebe4da" />
            <path d="M3 76C3 46 30 28 60 28C90 28 117 46 117 76C117 100 92 112 60 112C28 112 3 100 3 76Z" fill="#3d3a36" />
            <rect x="35" y="58" width="11" height="24" rx="5.5" fill="#ebe4da" />
            <rect x="74" y="58" width="11" height="24" rx="5.5" fill="#ebe4da" />
          </svg>
        </div>
        <p className="sully-text-boot-kicker">SULLYOS</p>
        <p className="sully-text-boot-ja" lang="ja">
          {jaChars.map((ch, index) => (
            <span key={jaText + '-' + index} className="sully-tb-ch" style={{ ['--d' as string]: index * 70 + 'ms' }}>{ch}</span>
          ))}
        </p>
        <div className="sully-text-boot-track" ref={trackRef} aria-hidden="true">
          <div className="sully-text-boot-fill" ref={fillRef} />
        </div>
        <p className="sully-text-boot-edition">
          <svg className="sully-text-boot-mark" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2.5" y="5" width="19" height="14" rx="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <ellipse cx="8.5" cy="12" rx="1.6" ry="2.5" fill="currentColor" />
            <ellipse cx="15.5" cy="12" rx="1.6" ry="2.5" fill="currentColor" />
          </svg>
          <span>pigcat ver.</span>
          <svg className="sully-text-boot-mark" viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="5" cy="9" rx="2.4" ry="3.2" transform="rotate(-23 5 9)" fill="currentColor" />
            <ellipse cx="10" cy="5.5" rx="2.3" ry="3" fill="currentColor" />
            <ellipse cx="16" cy="6" rx="2.3" ry="3" transform="rotate(12 16 6)" fill="currentColor" />
            <ellipse cx="20" cy="11" rx="2.2" ry="3" transform="rotate(30 20 11)" fill="currentColor" />
            <path d="M6.3 16.4C7.5 14.7 8.4 11.7 12 11.7S16.5 14.7 17.7 16.4C20.5 20.5 16.5 22 13.8 20.7Q12 19.7 10.2 20.7C7.5 22 3.5 20.5 6.3 16.4Z" fill="currentColor" />
          </svg>
        </p>
        <p className="sully-text-boot-en">{enText}</p>
      </div>
      <div className="sully-text-boot-skip" aria-hidden="true">轻触跳过</div>
      <span className="sully-text-boot-sr" role="status">
        {phase === 'waiting' ? (skipRequested ? '等待加载完成后进入' : '正在加载') : '加载完成'}
      </span>
    </div>
  );
}
