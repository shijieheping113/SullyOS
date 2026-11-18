import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setVisibleTimeout } from '../../utils/visibleTimeout';
import { trackEvent } from '../../utils/analytics';
import PigcatLoading from './PigcatLoading';

export const APP_LOADING_TIMING = { reveal: 250, exit: 160, recovery: 15_000 } as const;

type Props = { pending: boolean; active: boolean; onReturn?: () => void };

// 背景立刻随窗口进入；只有确实需要等待时才显示猪咪，不给快速加载增加过场。
const AppLoadingFallback: React.FC<Props> = ({ pending, active, onReturn }) => {
  const [stage, setStage] = useState<'blank' | 'cat' | 'stalled'>('blank');
  const [exiting, setExiting] = useState(false);
  const shown = useRef(false);
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');

  useEffect(() => {
    const update = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useLayoutEffect(() => {
    if (pending) {
      shown.current = false;
      setStage('blank');
      setExiting(false);
      return;
    }
    if (!shown.current) return;
    setExiting(true);
    const timer = window.setTimeout(() => {
      setExiting(false);
      setStage('blank');
      shown.current = false;
    }, APP_LOADING_TIMING.exit);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (!pending || !active) return;
    const reveal = setVisibleTimeout(() => {
      shown.current = true;
      setStage('cat');
    }, APP_LOADING_TIMING.reveal);
    const recovery = setVisibleTimeout(() => {
      shown.current = true;
      setStage('stalled');
      // 保留历史事件名，只统计前台等待，不新增埋点。
      trackEvent('App 加载卡死超时');
    }, APP_LOADING_TIMING.recovery);
    return () => { reveal(); recovery(); };
  }, [pending, active]);

  if (!pending && !exiting && !shown.current) return null;
  return <div className={`sully-app-loading${!pending ? ' sully-app-loading-exiting' : ''}${!pending || !active || hidden ? ' sully-app-loading-paused' : ''}`}
    role={pending && active ? 'status' : undefined} aria-label={pending && active ? '正在加载' : undefined}
    {...(!pending || !active ? { inert: '' } : {})}
    aria-hidden={!pending || !active} style={{ pointerEvents: pending && active ? 'auto' : 'none' }}>
    {stage === 'stalled' ? (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/95 text-white p-6 text-center space-y-4" style={{ animation: 'appLoadIn 320ms ease-out both' }}>
        <style>{`@keyframes appLoadIn{from{opacity:0}to{opacity:1}}`}</style>
        <h2 className="text-base font-bold">加载有点慢…</h2>
        <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
          首次打开会下载并解析功能代码；网络波动或设备性能较低都可能变慢。页面仍在继续加载，若长时间没有恢复再刷新。
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            type="button"
            onClick={() => { trackEvent('卡死页点刷新恢复'); window.location.reload(); }}
            className="w-full px-6 py-3 bg-red-600 rounded-full font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            刷新恢复
          </button>
          {import.meta.env.MODE !== 'capacitor' && (
            <a href={`${import.meta.env.BASE_URL}recover.html`} className="w-full px-4 py-2 bg-slate-700 rounded-full text-xs font-bold">
              检查更新并修复
            </a>
          )}
          {onReturn && (
            <button
              type="button"
              onClick={() => { onReturn(); trackEvent('从卡死页返回桌面'); }}
              className="w-full px-4 py-2 bg-slate-700 rounded-full text-xs font-bold active:scale-95 transition-transform"
            >
              返回桌面
            </button>
          )}
        </div>
      </div>
    ) : stage === 'cat' ? <PigcatLoading /> : null}
  </div>;
};

export default AppLoadingFallback;
