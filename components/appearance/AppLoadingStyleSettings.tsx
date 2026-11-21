import React from 'react';
import type { OSTheme } from '../../types';

const OPTIONS = [
  { id: 'pigcat' as const, name: '猪咪跑圈', description: '黑球在小轮子里跳，默认样式' },
  { id: 'text' as const, name: '纯文字', description: '日语「準備しています」细线呼吸' },
];

export default function AppLoadingStyleSettings({
  theme,
  updateTheme,
}: {
  theme: OSTheme;
  updateTheme: (patch: Partial<OSTheme>) => void;
}) {
  const current = theme.appLoadingStyle === 'text' ? 'text' : 'pigcat';
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="text-xs font-bold text-slate-700">App 加载等待画面</h3>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
        只有打开 App 真正等了一小会儿才会出现。默认是猪咪；可换成纯文字，随时能换回来。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="App 加载等待画面">
        {OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            aria-pressed={current === option.id}
            onClick={() => updateTheme({ appLoadingStyle: option.id })}
            className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
              current === option.id ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white'
            }`}
          >
            <span className="block text-xs font-semibold text-slate-700">{option.name}</span>
            <span className="mt-1 block text-[10px] text-slate-400">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
