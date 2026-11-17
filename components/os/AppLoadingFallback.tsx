import React, { useEffect, useState } from 'react';
import { setVisibleTimeout } from '../../utils/visibleTimeout';
import { trackEvent } from '../../utils/analytics';

// 代码模块久未就绪时提供恢复入口；短时等待不显示额外视觉过场。
const AppLoadingFallback: React.FC<{ onReturn?: () => void }> = ({ onReturn }) => {
  const [stalled, setStalled] = useState(false);
  useEffect(() => setVisibleTimeout(() => {
    setStalled(true);
    // 保留历史事件名，但只计前台等待；切后台/锁屏时间不再算作加载卡死。
    trackEvent('App 加载卡死超时');
  }, 15_000), []);
  if (stalled) {
    return (
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
    );
  }
  return null;
};

export default AppLoadingFallback;
