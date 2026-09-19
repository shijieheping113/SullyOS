import React, { useState } from 'react';
import type { Message } from '../../types';
import TokenImg from '../os/TokenImg';

interface Props {
  message: Message;
  isLatestMessage?: boolean;
  onMediaLoad?: (id: number) => void;
}

const VideoMessageBubble: React.FC<Props> = ({ message: m, isLatestMessage, onMediaLoad }) => {
  const [expanded, setExpanded] = useState(false);
  const status = m.metadata?.videoStatus as string | undefined;
  const isProcessing = status === 'processing';
  const isFailed = status === 'failed';
  const title = typeof m.metadata?.videoTitle === 'string' && m.metadata.videoTitle.trim()
    ? m.metadata.videoTitle.trim()
    : '一段视频';
  const desc = typeof m.metadata?.videoDescription === 'string' ? m.metadata.videoDescription.trim() : '';
  const hasDesc = !!desc && !isProcessing;
  const failMsg = typeof m.metadata?.videoError === 'string' ? m.metadata.videoError : '识别失败';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => hasDesc && setExpanded(v => !v)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (hasDesc) setExpanded(v => !v); } }}
      className="w-[240px] max-w-[240px] text-left rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/90 to-white overflow-hidden shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
    >
      <div className="relative h-[140px] w-full bg-slate-900/5">
        {m.content ? (
          <TokenImg
            value={m.content}
            className="w-full h-full object-cover"
            alt=""
            loading={isLatestMessage ? 'eager' : 'lazy'}
            onLoad={() => onMediaLoad?.(m.id)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl bg-slate-100">🎬</div>
        )}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          {isProcessing ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 shadow-lg backdrop-blur-[2px]">
              <svg className="h-7 w-7 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          ) : !isFailed ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 shadow-lg backdrop-blur-[2px]">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 text-white" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/80 text-white text-lg font-bold">!</span>
          )}
        </span>
      </div>
      <div className="px-3 py-2.5 space-y-1 min-h-[72px]">
        <p className="text-xs font-bold text-slate-700 leading-snug">
          {isProcessing ? '正在识别视频…' : isFailed ? '视频识别失败' : '已发送一段视频'}
        </p>
        <p className="text-[11px] text-slate-600 line-clamp-2">{title}</p>
        <p className="text-[9px] text-slate-400">
          {isProcessing ? '原片只给模型看，请稍候' : isFailed ? failMsg : '已看过 · 不存原片'}
        </p>
        {hasDesc && (
          <div className="mt-1 pt-2 border-t border-violet-100">
            {expanded ? (
              <div className="h-48 overflow-y-auto text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                <span className="font-semibold text-violet-600 block mb-1 sticky top-0 bg-gradient-to-br from-violet-50/95 to-white/95 py-0.5">画面内容</span>
                {desc}
              </div>
            ) : (
              <p className="text-[9px] text-violet-500">点击查看画面内容</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoMessageBubble;
