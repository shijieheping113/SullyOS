import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './SplashScreen.css';

export interface SplashScreenProps {
  /** 由接入方提供；false 时绝不关闭，true 时开始欢迎动画。 */
  dataReady: boolean;
  /** 可选的最低等待时间，默认 0；不再强制等待 4 秒或 8.8 秒。点击跳过可略过本限制。 */
  minDurationMs?: number;
  /** 欢迎完成后的淡出时长，默认 650 毫秒。 */
  exitDurationMs?: number;
  /** 为原接入约定保留；定稿采用固定配色，本组件不读取或加载壁纸。 */
  wallpaper?: string;
  /** 退场完成后调用一次；组件提前卸载不调用。 */
  onDone: () => void;
}

type Phase = 'waiting' | 'welcoming' | 'exiting' | 'done';
type Variables = React.CSSProperties & { [key: `--${string}`]: string | number };
type Confetti = { css: string; pieces: Variables[] };
const CORNERS = ['br', 'tl', 'bl', 'tr'] as const;
const DIRECTIONS = [[-4, 0], [4, 0], [0, -3], [0, 3], [-3, -2], [3, -2], [-3, 2], [3, 2]];
const COLORS = ['#bca6ad', '#cfc3c7', '#b4b5ad', '#c8bcb0'];
const finiteMs = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, value) : fallback;

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function randomizeEyes(eyes: SVGElement) {
  const previous = Number(eyes.dataset.lastGaze ?? -1);
  const choices = DIRECTIONS.map((_, i) => i).filter(i => i !== previous);
  const first = choices[Math.floor(Math.random() * choices.length)];
  const next = DIRECTIONS.map((_, i) => i).filter(i => i !== first);
  const second = next[Math.floor(Math.random() * next.length)];
  eyes.dataset.lastGaze = String(second);
  for (const [name, value] of [['--lx', DIRECTIONS[first][0]], ['--ly', DIRECTIONS[first][1]], ['--mx', DIRECTIONS[second][0]], ['--my', DIRECTIONS[second][1]]] as const) {
    eyes.style.setProperty(name, value + 'px');
  }
}

/* 唯一动态样式例外：保留定稿礼花的 88 条随机重力轨迹，不装动画库。 */
function createConfetti(width: number, height: number, id: string): Confetti {
  const rules: string[] = [];
  const pieces: Variables[] = [];
  for (let i = 0; i < 88; i++) {
    const corner = Math.floor(i / 22);
    const right = corner === 1 || corner === 3;
    const bottom = corner >= 2;
    const trailing = i % 22 >= 16;
    const duration = trailing ? 1.42 + Math.random() * .09 : 1.55 + Math.random() * .1;
    const distance = (right ? -1 : 1) * width * (.14 + Math.random() * .7);
    const velocityY = height * (bottom ? -.96 - Math.random() * .4 : -.08 + Math.random() * .23);
    const gravity = height * (bottom ? 1.5 : .85);
    const spin = (Math.random() > .5 ? 1 : -1) * (260 + Math.random() * 360);
    const phase = Math.random() * Math.PI;
    const frames: string[] = [];
    for (let step = 0; step <= 32; step++) {
      const progress = step / 32;
      const time = progress * duration;
      const x = distance * (1 - Math.exp(-2.5 * time)) / (1 - Math.exp(-2.5 * duration));
      const y = velocityY * time + .5 * gravity * time * time;
      const flutter = .3 + .7 * Math.abs(Math.cos(phase + progress * Math.PI * 3));
      const opacity = progress < .06 ? progress / .06 * .9 : progress > .7 ? .9 * (1 - progress) / .3 : .9;
      frames.push(`${progress * 100}%{opacity:${opacity.toFixed(3)};transform:translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${(spin * progress).toFixed(1)}deg) scaleX(${flutter.toFixed(3)})}`);
    }
    const name = `spl-flight-${id}-${i}`;
    rules.push(`@keyframes ${name}{${frames.join('')}}`);
    pieces.push({ left: (right ? 97 : 3) + '%', top: (bottom ? 96 : 4) + '%', '--flight': name, '--flight-duration': duration.toFixed(3) + 's', '--paper-color': COLORS[i % COLORS.length], '--burst-delay': (.34 + corner * .015 + (trailing ? .15 : 0) + Math.random() * .035).toFixed(3) + 's' });
  }
  return { css: rules.join('\n'), pieces };
}

export default function SplashScreen({ dataReady, minDurationMs = 0, exitDurationMs = 650, onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [peek, setPeek] = useState(() => ({ corner: Math.floor(Math.random() * CORNERS.length), turn: 0 }));
  const [skipRequested, setSkipRequested] = useState(false);
  const [carried, setCarried] = useState<string | null>(null);
  const [confetti, setConfetti] = useState<Confetti>({ css: '', pieces: [] });
  const stageRef = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const finished = useRef(false);
  const latestLoaded = useRef(dataReady);
  const latestFinish = useRef(onDone);
  const reduced = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const minimum = finiteMs(minDurationMs, 0);
  const exitMs = reduced ? Math.min(160, finiteMs(exitDurationMs, 650)) : finiteMs(exitDurationMs, 650);

  useLayoutEffect(() => { latestLoaded.current = dataReady; latestFinish.current = onDone; }, [dataReady, onDone]);
  useEffect(() => { started.current = performance.now(); }, []);

  const captureProgress = useCallback(() => {
    const fill = stageRef.current?.querySelector<HTMLElement>('.spl-fill');
    if (fill) fill.style.setProperty('--from-progress', getComputedStyle(fill).transform);
    stageRef.current?.querySelectorAll<HTMLElement>('.spl-confetti-piece').forEach(element => {
      const style = getComputedStyle(element);
      element.style.setProperty('--exit-transform', style.transform);
      element.style.setProperty('--exit-opacity', style.opacity);
    });
    stageRef.current?.querySelectorAll<SVGElement | HTMLElement>('.spl-cat .spl-flip,.spl-cat .spl-jelly,.spl-cat .spl-ear,.spl-cat .spl-eyes').forEach(element => {
      element.style.setProperty('--exit-transform', getComputedStyle(element).transform);
    });
  }, []);

  const beginWelcome = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    captureProgress();
    const cat = stage.querySelector<HTMLElement>('.spl-is-peeking');
    cat?.querySelectorAll<SVGElement | HTMLElement>('.spl-flip,.spl-jelly,.spl-ear,.spl-eyes').forEach(element => {
      element.style.setProperty('--carry-transform', getComputedStyle(element).transform);
    });
    setCarried(cat?.dataset.corner ?? null);
    setConfetti(reduced ? { css: '', pieces: [] } : createConfetti(stage.clientWidth, stage.clientHeight, id));
    setPhase('welcoming');
  }, [captureProgress, id, reduced]);

  const finish = useCallback(() => {
    if (finished.current) return;
    if (!latestLoaded.current) { setPhase('waiting'); return; }
    finished.current = true;
    setPhase('done');
    latestFinish.current();
  }, []);

  // StrictMode 会重新建立 effect；每份定时器都有清理，不在挂载时写访问记录。
  useEffect(() => {
    if (phase !== 'waiting' || reduced) return;
    // 每次从另外三个角落随机选一个；探头动作和轮换间隔沿用定稿。
    const timer = window.setInterval(() => setPeek(value => ({
      corner: (value.corner + 1 + Math.floor(Math.random() * (CORNERS.length - 1))) % CORNERS.length,
      turn: value.turn + 1,
    })), 2200);
    return () => window.clearInterval(timer);
  }, [phase, reduced]);

  useEffect(() => {
    if (phase === 'done') return;
    if (!dataReady) {
      if (phase !== 'waiting') { setConfetti({ css: '', pieces: [] }); setPhase('waiting'); }
      return;
    }
    if (phase !== 'waiting') return;
    if (skipRequested) { captureProgress(); setPhase('exiting'); return; }
    const remaining = Math.max(0, minimum - (performance.now() - started.current));
    if (remaining === 0) { beginWelcome(); return; }
    const timer = window.setTimeout(beginWelcome, remaining);
    return () => window.clearTimeout(timer);
  }, [dataReady, phase, skipRequested, minimum, beginWelcome, captureProgress]);

  useEffect(() => {
    if (phase !== 'welcoming') return;
    const timer = window.setTimeout(() => {
      if (latestLoaded.current) { captureProgress(); setPhase('exiting'); }
      else setPhase('waiting');
    }, reduced ? 160 : 2200);
    return () => window.clearTimeout(timer);
  }, [phase, reduced, captureProgress]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    // animationend 为主，定时兜底用于零时长、页面切后台等情况。
    const timer = window.setTimeout(finish, exitMs + 80);
    return () => window.clearTimeout(timer);
  }, [phase, exitMs, finish]);

  const requestSkip = () => {
    if (phase === 'done' || phase === 'exiting') return;
    setSkipRequested(true);
    if (dataReady) { captureProgress(); setPhase('exiting'); }
  };

  if (phase === 'done') return null;
  const label = phase === 'waiting' ? (peek.turn === 0 ? '準備中…' : 'もうすぐだよ') : 'できた！';
  return (
    <div className={`sully-splash spl-${phase}`} style={{ '--exit-duration': exitMs + 'ms' } as Variables}
      role="button" tabIndex={0} aria-label={dataReady ? '跳过开屏动画' : '跳过开屏动画，加载完成后进入'}
      onClick={requestSkip} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) requestSkip(); }
      }} onAnimationEnd={event => {
        if (phase === 'exiting' && event.target === event.currentTarget && event.animationName === 'spl-exit') finish();
      }}>
      <div className="spl-phone">
        <div className="spl-stage" ref={stageRef} onAnimationStart={event => {
          if (event.target instanceof SVGElement && event.target.classList.contains('spl-eyes')) randomizeEyes(event.target);
        }}>
          {confetti.css && <style>{confetti.css}</style>}
          <div className="spl-confetti" aria-hidden="true">
            {confetti.pieces.map((style, index) => <i key={index} className="spl-confetti-piece" style={style} />)}
          </div>
          {CORNERS.map((corner, index) => <div key={corner} data-corner={corner} aria-hidden="true"
            className={`spl-cat spl-${corner}${phase === 'waiting' && index === peek.corner ? ' spl-is-peeking' : ''}${phase === 'welcoming' && carried === corner ? ' spl-is-carried' : ''}`}>
            <div className="spl-flip"><CatDrawing /></div>
          </div>)}
          <div className="spl-center">
            <div className="spl-app-icon" aria-hidden="true"><CatDrawing /></div>
            <h1 className="spl-app-name">SullyOS <span>糯米机</span></h1>
            <Edition />
            <div className="spl-loading">
              <div className="spl-labels" lang="ja" aria-hidden="true"><span className="spl-label">{label}</span></div>
              <div className="spl-bar"><div className="spl-fill" /></div>
            </div>
          </div>
        </div>
      </div>
      <span className="spl-sr-only" role="status">{phase === 'waiting' ? (skipRequested ? '等待加载完成后进入' : '正在加载') : '加载完成'}</span>
    </div>
  );
}
function CatDrawing() { return (<svg viewBox='0 0 120 112' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
  <g className="spl-jelly">

    <g className="spl-ear spl-ear-left">
      <path d='M10 67 Q10 34 16 12 Q18 5 24 10 L57 38 L56 69 Z' fill='#4a4a4a'/>
      <path d='M22 18 Q20 28 19 37 L39 33 Z' fill='#fff'/>
    </g>
    <g className="spl-ear spl-ear-right">
      <path d='M110 67 Q110 34 104 12 Q102 5 96 10 L63 38 L64 69 Z' fill='#4a4a4a'/>
      <path d='M98 18 Q100 28 101 37 L81 33 Z' fill='#fff'/>
    </g>
    <path d='M3 76 C3 46 30 28 60 28 C90 28 117 46 117 76 C117 100 92 112 60 112 C28 112 3 100 3 76 Z' fill='#4a4a4a'/>
    <g className="spl-eyes">
      <rect x='35' y='58' width='11' height='24' rx='5.5' fill='#fff'/>
      <rect x='74' y='58' width='11' height='24' rx='5.5' fill='#fff'/>
    </g>
  </g>
</svg>); }

function Edition() { return (      <p className="spl-edition"><span>pigcat ver.</span><span className="spl-pigcat-mark" aria-hidden='true'><svg className="spl-edition-mark spl-snout" viewBox='0 0 24 24' aria-hidden='true'><rect x='2.5' y='5' width='19' height='14' rx='7' fill='none' stroke='currentColor' strokeWidth='1.8'/><ellipse cx='8.5' cy='12' rx='1.6' ry='2.5' fill='currentColor'/><ellipse cx='15.5' cy='12' rx='1.6' ry='2.5' fill='currentColor'/></svg><svg className="spl-edition-mark spl-paw" viewBox='0 0 24 24' aria-hidden='true'><ellipse cx='5' cy='9' rx='2.4' ry='3.2' transform='rotate(-23 5 9)' fill='currentColor'/><ellipse cx='10' cy='5.5' rx='2.3' ry='3' fill='currentColor'/><ellipse cx='16' cy='6' rx='2.3' ry='3' transform='rotate(12 16 6)' fill='currentColor'/><ellipse cx='20' cy='11' rx='2.2' ry='3' transform='rotate(30 20 11)' fill='currentColor'/><path d='M6.3 16.4C7.5 14.7 8.4 11.7 12 11.7S16.5 14.7 17.7 16.4C20.5 20.5 16.5 22 13.8 20.7Q12 19.7 10.2 20.7C7.5 22 3.5 20.5 6.3 16.4Z' fill='currentColor'/></svg></span></p>); }
