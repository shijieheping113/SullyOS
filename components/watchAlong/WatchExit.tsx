/**
 * 退房。
 *
 * 先把整场回顾端出来给你看，能改能重写；然后二选一：
 * 写成一张卡片放进主聊天，或者只留在陪看历史里。
 * 只有选「写进主聊天」才碰主聊天，且只写这一张，不触发记忆整理。
 */
import React, { useEffect, useState } from 'react';
import { R_PILL, Sheet, W, WIco } from './chrome';
import type { WatchAlongSession } from '../../utils/watchAlong/types';

export function WatchExit({
  open,
  session,
  busy,
  onClose,
  onRewrite,
  onLeave,
}: {
  open: boolean;
  session: WatchAlongSession | null;
  /** 正在写回顾 */
  busy: boolean;
  onClose: () => void;
  onRewrite: (draft: string) => void;
  onLeave: (opts: { recap: string; intoChat: boolean }) => void;
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(session?.recap || '');
  }, [open, session?.id, session?.recap]);

  if (!open || !session) return null;

  return (
    <Sheet open={open} title="结束这场陪看" onClose={onClose}>
      <div className="px-4 pb-4">
        <div className="text-[11.5px] leading-[17px]" style={{ color: W.sub }}>
          看了 {Math.max(1, session.beats.length)} 幕 · {session.chat.filter(c => c.from === 'user' || c.from === 'char').length} 句私聊
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12px]" style={{ color: W.sub }}>
            这场回顾
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRewrite(draft)}
            className="inline-flex items-center gap-1 text-[11.5px] disabled:opacity-40"
            style={{ color: W.ink }}
          >
            <WIco name="rewrite" size={13} />
            {busy ? '写着…' : '重写一段'}
          </button>
        </div>

        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          placeholder={busy ? '正在写…' : '想留点什么就写在这儿，不想写也行。'}
          aria-label="这场回顾"
          className="mt-2 w-full resize-none px-3 py-2.5 text-[13px] leading-[20px] outline-none placeholder:text-[#ADADAD]"
          style={{ borderRadius: 12, background: W.fill, color: W.ink }}
        />

        <button
          type="button"
          onClick={() => onLeave({ recap: draft.trim(), intoChat: true })}
          className="mt-3 flex w-full items-center gap-3 px-3 py-2.5 text-left active:opacity-95"
          style={{ borderRadius: 12, background: W.ink, color: '#fff' }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,.16)' }}>
            <WIco name="send" size={17} style={{ color: '#fff' }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">写进主聊天</span>
            <span className="mt-[1px] block text-[10.5px] text-white/60">放一张汇总卡，不动记忆宫殿</span>
          </span>
          <WIco name="next" size={16} style={{ color: 'rgba(255,255,255,.55)' }} />
        </button>

        <button
          type="button"
          onClick={() => onLeave({ recap: draft.trim(), intoChat: false })}
          className="mt-2 flex w-full items-center gap-3 px-3 py-2.5 text-left active:opacity-95"
          style={{ borderRadius: 12, background: W.fill, color: W.ink }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: '#fff' }}>
            <WIco name="clock" size={17} style={{ color: W.ink }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">只留在陪看历史</span>
            <span className="mt-[1px] block text-[10.5px]" style={{ color: W.sub }}>
              主聊天里不会多出任何东西
            </span>
          </span>
          <WIco name="next" size={16} style={{ color: W.sub }} />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 h-[34px] w-full text-[12.5px]"
          style={{ borderRadius: R_PILL, color: W.sub }}
        >
          再陪她看会儿
        </button>
      </div>
    </Sheet>
  );
}
