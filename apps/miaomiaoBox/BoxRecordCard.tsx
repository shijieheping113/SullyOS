import React, { useState } from 'react';
import { MiaomiaoBoxCat } from './MiaomiaoBoxCat';
import type { MiaomiaoArchiveMode } from './types';
import './miaomiao-box.css';

const BADGE: Record<string, { text: string; cls: string }> = {
  remember: { text: '已归档', cls: '' },
  raw: { text: '原样', cls: 'raw' },
  forget: { text: '已忘掉', cls: 'forget' },
  paused: { text: '未完待续', cls: 'todo' },
};

export const BoxRecordCard: React.FC<{
  title?: string;
  content: string;
  archiveMode?: MiaomiaoArchiveMode;
  timestamp?: number;
}> = ({ title, content, archiveMode = 'remember', timestamp }) => {
  const [open, setOpen] = useState(false);
  const badge = BADGE[archiveMode] || BADGE.remember;
  const faded = archiveMode === 'forget';
  const time = timestamp ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="miaomiao-root" data-theme="light">
      <button
        className={`arcard ${faded ? 'faded' : ''} ${archiveMode === 'paused' ? 'todo' : ''}`}
        style={{ maxWidth: '100%' }}
        onClick={() => setOpen(v => !v)}
      >
        <span className="arcorner" />
        <div className="arhead">
          <span className="pawtile"><MiaomiaoBoxCat lid={archiveMode === 'paused' ? 'behind' : 'on'} tail={archiveMode === 'paused' ? 'out' : 'in'} cls="mini" /></span>
          <b>喵喵盒 · {title || '一箱'}</b>
          <span className={`arbadge ${badge.cls}`}>{badge.text}</span>
        </div>
        <p className="arline" style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{content}</p>
        <div className="arft">
          <span>{time}</span>
          <span className="aropen">{open ? '收起 ▴' : '点开看全文 ▾'}</span>
        </div>
      </button>
    </div>
  );
};
