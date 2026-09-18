import React, { useEffect, useMemo, useRef, useState } from 'react';
import './BootSequence.css';
import { trackEvent } from '../../utils/analytics';

// CSS 水母开场：紫黑星空、轻浮与微光，沿用原有数据等待和同会话短开场。
// 动画仅使用 transform / opacity；减少动态效果时以静态图形呈现。
const BOOT_SEEN_KEY = 'sullyos_boot_seen_session';

interface Props {
  /** 数据是否已就绪（IndexedDB 加载完）。未就绪时场景持续呼吸等待，不退场。 */
  dataReady: boolean;
  /** 外观 App「全屏模式」总开关（默认 true）。关闭时点入桌面不再请求全屏。 */
  allowFullscreen?: boolean;
  /** 退场动画播完后回调，交还控制权给 PhoneShell。 */
  onDone: () => void;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const JellyfishBootSequence: React.FC<Props> = ({ dataReady, allowFullscreen = true, onDone }) => {
  // 本会话是否首次看到开场：刷新页面仍属同 session → 走极短版。
  const firstThisSession = useMemo(() => {
    try { return !sessionStorage.getItem(BOOT_SEEN_KEY); } catch { return true; }
  }, []);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const cinematic = firstThisSession && !reduced;

  const HOLD = cinematic ? 2000 : 520; // 退场前最短停留（也是「等数据」的下限）
  const EXIT = cinematic ? 680 : 300;  // 推进式退场时长

  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');
  const startRef = useRef(0);
  if (startRef.current === 0) {
    startRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  useEffect(() => {
    try { sessionStorage.setItem(BOOT_SEEN_KEY, '1'); } catch { /* ignore */ }
  }, []);

  // 「数据就绪 且 停留够 HOLD」→ 退场；否则一直呼吸等待。
  useEffect(() => {
    if (phase === 'exit') return;
    let raf = 0;
    const tick = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (dataReady && now - startRef.current >= HOLD) {
        const waited = now - startRef.current;
        trackEvent('冷启动等待数据就绪', {
          等待档位: waited < 1000 ? '<1s' : waited < 3000 ? '1-3s' : waited < 8000 ? '3-8s' : '8s+',
          开场版本: cinematic ? '完整版' : '极短版',
        });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dataReady, phase, HOLD]);

  // 退场动画播完 → 交还控制权。
  useEffect(() => {
    if (phase !== 'exit') return;
    const t = setTimeout(onDone, EXIT);
    return () => clearTimeout(t);
  }, [phase, EXIT, onDone]);

  const bootGuardReleasedRef = useRef(false);
  useEffect(() => {
    const alreadyArmed = !!(window.history.state && (window.history.state as any).sullyosBootGuard);
    if (!alreadyArmed) {
      try { window.history.pushState({ sullyosBootGuard: true }, '', window.location.href); } catch { return; }
    }
    const onPop = () => {
      if (bootGuardReleasedRef.current) return;
      try { window.history.pushState({ sullyosBootGuard: true }, '', window.location.href); } catch { /* ignore */ }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 轻触跳过：进入平滑退场（非硬切）。
  const skip = () => {
    if (phase !== 'exit') {
      bootGuardReleasedRef.current = true;
      try { window.history.back(); } catch { /* ignore */ }
      setPhase('exit');
      trackEvent('跳过开机动画', {
        数据是否已就绪: dataReady ? '是' : '否',
        开场版本: cinematic ? '完整版' : '极短版',
      });
      if (allowFullscreen && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.()?.catch(() => {});
      }
    }
  };

  const exiting = phase === 'exit';

  return (
    <div
      className="sully-boot"
      data-phase={phase}
      data-cinematic={cinematic}
      onClick={skip}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); skip(); } }}
      role="button"
      tabIndex={0}
      aria-label="SullyOS·糯米机，轻触进入"
      style={{ opacity: exiting ? 0 : 1, transition: 'opacity ' + EXIT + 'ms ease-in' }}
    >
      <div className="sully-boot-scene">
        <div className="sully-boot-halo" aria-hidden="true" />
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="sully-boot-star" aria-hidden="true" style={{
            left: ((i * 37 + 7) % 100) + '%', top: ((i * 23 + 11) % 100) + '%',
            width: i % 4 === 0 ? 2 : 1, height: i % 4 === 0 ? 2 : 1, animationDelay: (-i * .37) + 's',
          }} />
        ))}
        <div className="sully-boot-art" aria-hidden="true">
          <div className="sully-boot-orbit" />
          <div className="sully-boot-jelly">
            <div className="sully-boot-threads"><i /><i /><i /></div>
            <div className="sully-boot-ribbons"><i /><i /><i /><i /></div>
            <div className="sully-boot-bell"><div className="sully-boot-facets" /><span>∞</span><i className="sully-boot-shine" /></div>
          </div>
          <i className="sully-boot-planet planet-one" /><i className="sully-boot-planet planet-two" /><i className="sully-boot-planet planet-three" />
          <i className="sully-boot-spark spark-one" /><i className="sully-boot-spark spark-two" /><i className="sully-boot-spark spark-three" />
        </div>
        <div className="sully-boot-wordmark">Sully<span>OS<i /></span><small>糯米机</small></div>
        <div className="sully-boot-rule" aria-hidden="true" />
        <p className="sully-boot-greeting">欢迎回家</p>
      </div>
      {!exiting && <div className="sully-boot-hint">轻触进入</div>}
    </div>
  );
};

export default JellyfishBootSequence;
