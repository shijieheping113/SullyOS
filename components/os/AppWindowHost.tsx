import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppID } from '../../types';

export const APP_WINDOW_MOTION = {
  enter: 560,
  exit: 440,
  fade: 360,
  reduced: 130,
  ease: 'cubic-bezier(.32,.72,0,1)',
} as const;

const rest = 'translate(0px, 0px) scale(1)';
const folded = 'translate(0px, 12px) scale(.94)';
const horizontal = (x: number) => `translate(${x}px, 0px) scale(.97)`;

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
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

function Ready({ onReady, children }: { onReady: () => void; children: React.ReactNode }) {
  useLayoutEffect(onReady, [onReady]);
  return <>{children}</>;
}

function Pending({ onPending }: { onPending: () => void }) {
  useLayoutEffect(onPending, [onPending]);
  return null;
}

/** inert 尚未普及的旧浏览器也要让退出页面离开键盘焦点顺序。 */
function InactivePage({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || active) return;
    const saved = new Map<HTMLElement, string | null>();
    const disable = () => {
      root.querySelectorAll<HTMLElement>('a[href],button,input,textarea,select,[tabindex],[contenteditable]').forEach(node => {
        if (!saved.has(node)) saved.set(node, node.getAttribute('tabindex'));
        if (node.getAttribute('tabindex') !== '-1') node.setAttribute('tabindex', '-1');
      });
      if (root.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
    };
    disable();
    const observer = new MutationObserver(disable);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      saved.forEach((value, node) => value === null ? node.removeAttribute('tabindex') : node.setAttribute('tabindex', value));
    };
  }, [active]);
  return <div ref={ref} className="sully-app-route-root w-full h-full" {...(!active ? { inert: '' } : {})}
    onFocusCapture={!active ? event => (event.target as HTMLElement).blur() : undefined}>{children}</div>;
}

type Operation = {
  token: number;
  to: AppID;
  from?: AppID;
  kind: 'open' | 'close' | 'switch';
  instant: boolean;
  started: boolean;
};

type Props = {
  activeApp: AppID;
  locked: boolean;
  disabled: boolean;
  preserveChatBackdropLayers?: boolean;
  desktop: React.ReactNode;
  renderApp: (id: AppID, active: boolean) => React.ReactNode;
  renderBackdrop: (id: AppID, settled: boolean) => React.ReactNode;
  renderLoading: (state: { pending: boolean; active: boolean }) => React.ReactNode;
};

/** 只管理窗口寿命与合成层；导航、App 内返回和锁屏手势仍由原来的拥有者处理。 */
export default function AppWindowHost({ activeApp, locked, disabled, preserveChatBackdropLayers = false, desktop, renderApp, renderBackdrop, renderLoading }: Props) {
  const reduced = useReducedMotion();
  const [pages, setPages] = useState<AppID[]>([]);
  const [busy, setBusy] = useState(false);
  const [, refreshReady] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const desktopMotion = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<AppID, HTMLDivElement>());
  const nodeCallbacks = useRef(new Map<AppID, (node: HTMLDivElement | null) => void>());
  const initialized = useRef(new WeakSet<HTMLDivElement>());
  const ready = useRef(new Set<AppID>());
  const readyCallbacks = useRef(new Map<AppID, () => void>());
  const pendingCallbacks = useRef(new Map<AppID, () => void>());
  const previous = useRef<{ id: AppID; disabled: boolean; reduced: boolean }>();
  const operation = useRef<Operation>();
  const token = useRef(0);
  const timers = useRef<number[]>([]);
  const frame = useRef<number>();
  const currentPages = useRef(pages);
  currentPages.current = pages;
  const preserveChatBackdrop = useRef(preserveChatBackdropLayers);
  preserveChatBackdrop.current = preserveChatBackdropLayers;
  const holdingBackdropLayers = useRef(false);

  const cancel = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    frame.current = undefined;
  };
  useLayoutEffect(() => () => { ++token.current; cancel(); }, []);

  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { id: activeApp, disabled, reduced };
    cancel();
    // 正在加载的窗口也已上屏，返回/切换必须从它继续，不能退回等待前的页面。
    const from = currentPages.current.find(id => id === old?.id)
      ?? currentPages.current[currentPages.current.length - 1];
    const kind = activeApp === AppID.Launcher ? 'close'
      : old?.id !== AppID.Launcher && from ? 'switch' : 'open';
    const instant = disabled || !old || old.disabled || old.reduced !== reduced;
    operation.current = { token: ++token.current, to: activeApp, from, kind, instant, started: false };
    const next = locked ? [] : activeApp === AppID.Launcher ? (from ? [from] : [])
      : kind === 'switch' && from !== activeApp ? [from!, activeApp] : [activeApp];
    setPages(next);
    setBusy(!instant);
    // 带锁屏的桌面有自己的 transform；这里只复位其外层，绝不接管解锁手势。
    if (locked) {
      if (surface.current) {
        surface.current.style.visibility = 'hidden';
        if (holdingBackdropLayers.current) {
          surface.current.style.transition = 'none';
          surface.current.style.transform = 'none';
          surface.current.style.willChange = '';
          holdingBackdropLayers.current = false;
        }
      }
      if (desktopMotion.current) {
        desktopMotion.current.style.transition = 'none';
        desktopMotion.current.style.transform = 'none';
      }
      if (shade.current) shade.current.style.opacity = '0';
    }
  }, [activeApp, disabled, locked, reduced]);

  useLayoutEffect(() => {
    const op = operation.current;
    const windowNode = surface.current;
    const home = desktopMotion.current;
    if (!op || op.started || !windowNode || !home || locked) return;
    // 窗口先响应，Suspense 与内容准备在窗口内并行完成。
    if (op.to !== AppID.Launcher && !pages.includes(op.to)) return;
    op.started = true;
    const duration = reduced ? APP_WINDOW_MOTION.reduced
      : op.kind === 'close' ? APP_WINDOW_MOTION.exit : APP_WINDOW_MOTION.enter;
    const fade = reduced ? APP_WINDOW_MOTION.reduced : APP_WINDOW_MOTION.fade;
    const transition = (move: number) => `transform ${move}ms ${APP_WINDOW_MOTION.ease}, opacity ${fade}ms ${APP_WINDOW_MOTION.ease}`;
    const finish = () => {
      if (op.token !== token.current) return;
      // 见面选人页和玻璃私聊在老内核可能在拆绘制层时白闪，停稳后保留两层直到离开。
      const keep = op.to === AppID.Date || (op.to === AppID.Chat && preserveChatBackdrop.current);
      holdingBackdropLayers.current = keep;
      setPages(op.to === AppID.Launcher ? [] : [op.to]);
      setBusy(false);
      windowNode.style.transition = 'none';
      windowNode.style.transform = keep ? rest : 'none';
      windowNode.style.willChange = keep ? 'transform, opacity' : '';
      home.style.willChange = '';
      nodes.current.forEach(node => {
        node.style.willChange = keep && node.dataset.appWindow === op.to ? 'transform, opacity' : '';
        if (node.dataset.appWindow === op.to) {
          node.style.transition = 'none';
          node.style.transform = keep ? rest : 'none';
        }
      });
      if (op.to === AppID.Launcher) windowNode.style.visibility = 'hidden';
    };
    const apply = () => {
      if (op.token !== token.current) return;
      const closing = op.to === AppID.Launcher;
      windowNode.style.transition = op.instant ? 'none' : transition(duration);
      windowNode.style.transform = reduced || !closing ? rest : folded;
      windowNode.style.opacity = closing ? '0' : '1';
      home.style.transition = op.instant ? 'none' : `transform ${duration}ms ${APP_WINDOW_MOTION.ease}`;
      home.style.transform = reduced || closing ? 'none' : 'scale(.965)';
      if (shade.current) {
        shade.current.style.transition = op.instant ? 'none' : `opacity ${fade}ms ${APP_WINDOW_MOTION.ease}`;
        shade.current.style.opacity = closing ? '0' : '1';
      }
      nodes.current.forEach((node, id) => {
        const exiting = op.kind === 'switch' && id !== op.to;
        node.style.transition = op.instant ? 'none' : transition(exiting && !reduced ? APP_WINDOW_MOTION.exit : duration);
        node.style.transform = exiting && !reduced ? horizontal(-18) : rest;
        node.style.opacity = exiting ? '0' : '1';
      });
      if (op.instant) finish();
      else {
        // 退出窗口先释放；最长入场完成后才允许隐藏不透明 App 的背景。
        if (op.kind === 'switch') timers.current.push(window.setTimeout(() => {
          if (op.token === token.current) setPages([op.to]);
        }, (reduced ? duration : APP_WINDOW_MOTION.exit) + 34));
        timers.current.push(window.setTimeout(finish, duration + 34));
      }
    };
    if (!op.instant) {
      windowNode.style.willChange = 'transform, opacity';
      home.style.willChange = reduced ? '' : 'transform';
      if (windowNode.style.visibility === 'hidden' && op.to !== AppID.Launcher) {
        windowNode.style.transition = 'none';
        windowNode.style.transform = reduced ? rest : folded;
        windowNode.style.opacity = '0';
      }
      nodes.current.forEach((node, id) => {
        node.style.willChange = 'transform, opacity';
        if (!initialized.current.has(node)) {
          initialized.current.add(node);
          node.style.transition = 'none';
          node.style.transform = op.kind === 'switch' && id === op.to && !reduced ? horizontal(18) : rest;
          node.style.opacity = op.kind === 'switch' && id === op.to ? '0' : '1';
        }
      });
    }
    windowNode.style.visibility = 'visible';
    if (op.instant) apply();
    else {
      // 只在一次导航开始时提交起点；后续连点由 CSS 从当前合成值继续，而非重播关键帧。
      void windowNode.offsetWidth;
      frame.current = window.requestAnimationFrame(apply);
    }
  });

  const onReady = (id: AppID) => {
    let callback = readyCallbacks.current.get(id);
    if (!callback) {
      callback = () => { ready.current.add(id); refreshReady(value => value + 1); };
      readyCallbacks.current.set(id, callback);
    }
    return callback;
  };
  const onNode = (id: AppID) => {
    let callback = nodeCallbacks.current.get(id);
    if (!callback) {
      callback = node => {
        if (node) nodes.current.set(id, node);
        else { nodes.current.delete(id); ready.current.delete(id); }
      };
      nodeCallbacks.current.set(id, callback);
    }
    return callback;
  };
  const onPending = (id: AppID) => {
    let callback = pendingCallbacks.current.get(id);
    if (!callback) {
      callback = () => { if (ready.current.delete(id)) refreshReady(value => value + 1); };
      pendingCallbacks.current.set(id, callback);
    }
    return callback;
  };
  const desktopVisible = activeApp === AppID.Launcher || locked || busy;
  const backgroundApp = activeApp !== AppID.Launcher ? activeApp : pages[pages.length - 1] ?? AppID.Launcher;
  return <>
    <style>{`.sully-app-page > .h-full.animate-fade-in { animation: none !important; }`}</style>
    <div ref={desktopMotion} className="absolute inset-0" data-app-desktop=""
      style={{ visibility: desktopVisible ? 'visible' : 'hidden', pointerEvents: activeApp === AppID.Launcher && !locked ? 'auto' : 'none' }}
      aria-hidden={activeApp !== AppID.Launcher || locked} {...(activeApp !== AppID.Launcher || locked ? { inert: '' } : {})}>
      {desktop}
      <div ref={shade} className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(15,23,42,.08)', opacity: 0 }} />
    </div>
    <div ref={surface} className="sully-app-surface absolute inset-0 overflow-hidden bg-gradient-to-br from-pink-200 via-purple-200 to-indigo-200"
      style={{ visibility: 'hidden', pointerEvents: activeApp === AppID.Launcher || locked ? 'none' : 'auto' }} data-app-motion={busy ? 'moving' : 'settled'}>
      {renderBackdrop(backgroundApp, !busy && ready.current.has(activeApp))}
      {pages.map(id => <div key={id} data-app-window={id} className="absolute inset-0"
        ref={onNode(id)}
        style={{ pointerEvents: id === activeApp && !locked ? 'auto' : 'none', zIndex: id === activeApp ? 2 : 1 }}
        aria-hidden={id !== activeApp || locked}>
        <InactivePage active={id === activeApp && !locked}>
          <Suspense fallback={<Pending onPending={onPending(id)} />}><Ready onReady={onReady(id)}>{renderApp(id, id === activeApp && !locked)}</Ready></Suspense>
          {renderLoading({ pending: !ready.current.has(id), active: id === activeApp && !locked })}
        </InactivePage>
      </div>)}
    </div>
  </>;
}
