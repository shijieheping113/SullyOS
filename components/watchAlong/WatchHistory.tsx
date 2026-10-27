/**
 * 陪看历史。
 *
 * 点一下打开那场；长按才出菜单（删除、看回顾）。
 * 删除不弹二次确认——长按本身已经是确认动作了。
 */
import React, { useRef, useState } from 'react';
import { EmptyState, R_COVER, TopBar, W } from './chrome';
import { coverBackground } from './WatchLobby';
import type { WatchAlongSession } from '../../utils/watchAlong/types';

const dayLabel = (at: number): string => {
  const d = new Date(at);
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay(d, today)) return `今天 ${hh}:${mm}`;
  const yest = new Date(today.getTime() - 86_400_000);
  if (sameDay(d, yest)) return `昨天 ${hh}:${mm}`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

export function WatchHistory({
  sessions,
  onBack,
  onOpen,
  onOpenRecap,
  onDelete,
}: {
  sessions: WatchAlongSession[];
  onBack: () => void;
  onOpen: (session: WatchAlongSession) => void;
  onOpenRecap: (session: WatchAlongSession) => void;
  onDelete: (session: WatchAlongSession) => void;
}) {
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipClick = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const startPress = (id: string, el: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      skipClick.current = true;
      const page = root.getBoundingClientRect();
      const row = el.getBoundingClientRect();
      const menuW = 210;
      const menuH = 124;
      let top = row.bottom - page.top + 6;
      if (top + menuH > page.height - 8) top = Math.max(8, row.top - page.top - menuH - 6);
      let left = row.left - page.left + 8;
      if (left + menuW > page.width - 8) left = Math.max(8, page.width - menuW - 8);
      setMenu({ id, top, left });
    }, 420);
  };
  const endPress = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const menuTarget = sessions.find(s => s.id === menu?.id) || null;

  return (
    <div ref={rootRef} className="relative flex h-full w-full flex-col" style={{ background: W.page, color: W.ink }}>
      <TopBar title="陪看历史" subtitle={sessions.length ? `${sessions.length} 场` : '还没看过'} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {sessions.length === 0 ? (
          <EmptyState text="还没有陪看记录" hint="在陪看大厅挑一个房间进去，看完就会留在这儿" />
        ) : (
          sessions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (skipClick.current) {
                  skipClick.current = false;
                  return;
                }
                onOpen(s);
              }}
              onPointerDown={e => startPress(s.id, e.currentTarget)}
              onPointerUp={endPress}
              onPointerCancel={endPress}
              onContextMenu={e => e.preventDefault()}
              className="mb-2 flex w-full items-center gap-3 p-2 text-left active:bg-[#FAFAFA]"
              style={{
                borderRadius: 12,
                background: menu?.id === s.id ? W.soft : 'transparent',
                boxShadow: menu?.id === s.id ? `inset 0 0 0 1.5px rgba(15,15,15,.14)` : undefined,
              }}
            >
              <div
                className="relative flex h-[54px] w-[80px] shrink-0 items-end overflow-hidden p-1.5"
                style={{ borderRadius: R_COVER, background: coverBackground(s.room.coverGradient) }}
              >
                <span className="truncate text-[10px] text-white/85">{s.room.streamerName}</span>
                {s.status === 'watching' ? (
                  <span
                    className="absolute right-1 top-1 inline-flex h-[14px] items-center px-[4px] text-[8px] font-bold text-white"
                    style={{ borderRadius: 3, background: W.red }}
                  >
                    LIVE
                  </span>
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium" style={{ color: W.ink }}>
                  {s.room.title}
                </div>
                <div className="mt-[2px] flex items-center gap-1.5 text-[11px]" style={{ color: W.sub }}>
                  {s.status === 'watching' ? (
                    <>
                      <i className="block h-[5px] w-[5px] rounded-full" style={{ background: W.red }} />
                      还在看
                    </>
                  ) : (
                    '已结束'
                  )}
                  <span style={{ color: W.line }}>·</span>
                  <span>{s.room.category}</span>
                </div>
                <div className="mt-[1px] text-[10.5px]" style={{ color: W.faint }}>
                  {dayLabel(s.updatedAt)} · {s.beats.length} 幕
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {menuTarget && menu ? (
        <div className="absolute inset-0 z-40">
          <button type="button" aria-label="关闭" onClick={() => setMenu(null)} className="absolute inset-0 bg-[rgba(15,15,15,0.16)]" />
          <div
            className="absolute w-[210px] overflow-hidden bg-white"
            style={{ top: menu.top, left: menu.left, borderRadius: 14, boxShadow: '0 14px 40px rgba(0,0,0,.22)' }}
          >
            {[
              { label: '看这场回顾', run: () => onOpenRecap(menuTarget) },
              { label: '打开这一场', run: () => onOpen(menuTarget) },
              { label: '删除这条记录', danger: true, run: () => onDelete(menuTarget) },
            ].map((item, i) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setMenu(null);
                  item.run();
                }}
                className="block w-full px-3.5 py-[11px] text-left text-[12.5px] active:bg-[#F8F8F8]"
                style={{ color: item.danger ? W.red : W.ink, borderTop: i === 0 ? 'none' : `1px solid ${W.line}` }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
