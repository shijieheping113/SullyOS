/**
 * 陪看大厅。
 *
 * 一屏只做一件事：挑一个房间进去。
 * 顶栏：返回电波 / 标题 / 历史 / 设置（三个都常驻，不会被挤掉）。
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  EmptyState,
  Pill,
  R_COVER,
  R_PILL,
  RoundIconButton,
  Sheet,
  TopBar,
  W,
  WIco,
  formatCount,
  timeAgo,
} from './chrome';
import type { WatchAlongSession, WatchRoomCard } from '../../utils/watchAlong/types';

/** 封面渐变：存档里存的是「起始色,结束色」 */
export const coverBackground = (gradient: string): string => {
  const [a, b] = (gradient || '').split(',').map(s => s.trim());
  if (a && b) return `linear-gradient(142deg, ${a} 0%, ${b} 100%)`;
  if (a) return a;
  return 'linear-gradient(142deg, #1b2430 0%, #3a2a44 100%)';
};

export function WatchLobby({
  userName,
  pool,
  customRule,
  busy,
  sessions,
  onRefresh,
  onEditRule,
  onStart,
  onOpenSession,
  onOpenHistory,
  onOpenSettings,
  onEditRoom,
  onRemoveRoom,
  onBack,
}: {
  userName: string;
  pool: WatchRoomCard[];
  customRule: string;
  /** 正在刷台 */
  busy: boolean;
  /** 全部历史，用来挑「还在看」的那场 */
  sessions: WatchAlongSession[];
  onRefresh: () => void;
  onEditRule: () => void;
  onStart: (room: WatchRoomCard) => void;
  onOpenSession: (id: string) => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  /** 长按卡片：改这一场的直播信息 */
  onEditRoom: (room: WatchRoomCard) => void;
  /** 长按卡片：把它从列表里删掉 */
  onRemoveRoom: (roomId: string) => void;
  /** 退回电波 */
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('全部');
  const [menuRoom, setMenuRoom] = useState<WatchRoomCard | null>(null);

  // 长按 480ms 出菜单；长按触发后那一下 click 要吞掉，不然会顺手进场
  const pressRef = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });

  const clearPress = () => {
    if (pressRef.current.timer !== null) {
      window.clearTimeout(pressRef.current.timer);
      pressRef.current.timer = null;
    }
  };

  const startPress = (room: WatchRoomCard) => {
    clearPress();
    pressRef.current.fired = false;
    pressRef.current.timer = window.setTimeout(() => {
      pressRef.current.timer = null;
      pressRef.current.fired = true;
      setMenuRoom(room);
    }, 480);
  };

  const categories = useMemo(() => {
    const seen: string[] = [];
    pool.forEach(r => {
      if (r.category && !seen.includes(r.category)) seen.push(r.category);
    });
    return ['全部', ...seen.slice(0, 8)];
  }, [pool]);

  const q = query.trim();
  const rooms = useMemo(
    () =>
      pool.filter(r => {
        if (filter !== '全部' && r.category !== filter) return false;
        if (!q) return true;
        return `${r.streamerName} ${r.title} ${r.category} ${r.styleTag}`.includes(q);
      }),
    [pool, filter, q],
  );

  const watching = useMemo(
    () => sessions.find(s => s.status === 'watching' && !s.legacy) || null,
    [sessions],
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: W.page, color: W.ink }}>
      <TopBar
        title="陪看"
        subtitle={customRule ? `按你的口味在刷：${customRule.slice(0, 14)}` : '刷几个路人直播，一起看'}
        onBack={onBack}
        right={
          <>
            <RoundIconButton
              name="clock"
              label="历史陪看"
              onClick={onOpenHistory}
              badge={sessions.length > 0}
            />
            <RoundIconButton name="gear" label="陪看设置" onClick={onOpenSettings} />
          </>
        }
      />

      {/* 搜一条：常驻在这儿，不藏在顶栏图标里 */}
      <div className="shrink-0 px-3 pb-2">
        <div
          className="flex h-[36px] items-center gap-2 px-3"
          style={{ borderRadius: R_PILL, background: W.fill }}
        >
          <WIco name="search" size={15} style={{ color: W.sub }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜直播间、主播、分区"
            aria-label="搜索直播间"
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[#909090]"
            style={{ color: W.ink }}
          />
          {q ? (
            <button type="button" aria-label="清空搜索" onClick={() => setQuery('')} className="shrink-0">
              <WIco name="close" size={14} style={{ color: W.sub }} />
            </button>
          ) : null}
        </div>
      </div>

      {/* 还在看的那场：刷新回来直接从这儿接着看 */}
      {watching && !q ? (
        <button
          type="button"
          onClick={() => onOpenSession(watching.id)}
          className="mx-3 mb-2 flex shrink-0 items-center gap-2.5 px-3 py-2 text-left"
          style={{ borderRadius: 10, background: W.soft, border: `1px solid ${W.line}` }}
        >
          <i className="block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: W.red }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium" style={{ color: W.ink }}>
              还在看 {watching.room.streamerName}
            </div>
            <div className="truncate text-[11px]" style={{ color: W.sub }}>
              第 {watching.beats.length} 幕 · {timeAgo(watching.updatedAt)}动过
            </div>
          </div>
          <span className="shrink-0 text-[11.5px] font-medium" style={{ color: W.ink }}>
            接着看
          </span>
          <WIco name="next" size={15} style={{ color: W.sub }} />
        </button>
      ) : null}

      {/* 分类胶囊 */}
      {categories.length > 1 ? (
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 pb-2">
          {categories.map(c => (
            <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>
              {c}
            </Pill>
          ))}
        </div>
      ) : null}

      {/* 房间列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <EmptyState
            text={q ? '没有搜到这样的直播间' : busy ? '正在刷台…' : '还没刷出直播间'}
            hint={q ? '换个词试试' : '点下面的「换一批」，按你的口味刷几个出来'}
            action={q ? undefined : busy ? undefined : '换一批'}
            onAction={q ? undefined : onRefresh}
          />
        ) : (
          <div className="px-3 pb-3">
            {rooms.map(room => (
              <button
                key={room.id}
                type="button"
                onPointerDown={() => startPress(room)}
                onPointerUp={clearPress}
                onPointerCancel={clearPress}
                onPointerLeave={clearPress}
                onContextMenu={e => e.preventDefault()}
                onClick={() => {
                  // 长按已经出过菜单，这一下 click 不进场
                  if (pressRef.current.fired) {
                    pressRef.current.fired = false;
                    return;
                  }
                  onStart(room);
                }}
                className="mb-4 block w-full text-left active:opacity-90"
              >
                <div
                  className="relative w-full overflow-hidden"
                  style={{ borderRadius: R_COVER, background: coverBackground(room.coverGradient), aspectRatio: '16 / 9' }}
                >
                  <span
                    className="absolute left-2 top-2 inline-flex h-[19px] items-center gap-[4px] px-[6px] text-[9.5px] font-bold tracking-wide text-white"
                    style={{ borderRadius: 4, background: W.red }}
                  >
                    LIVE
                  </span>
                  <span
                    className="absolute bottom-2 right-2 inline-flex h-[18px] items-center px-[6px] text-[10px] text-white"
                    style={{ borderRadius: 4, background: 'rgba(0,0,0,.62)' }}
                  >
                    {formatCount(room.viewerCount)} 人在看
                  </span>
                  {room.styleTag ? (
                    <span
                      className="absolute bottom-2 left-2 inline-flex h-[18px] items-center px-[6px] text-[10px] text-white"
                      style={{ borderRadius: 4, background: 'rgba(0,0,0,.45)' }}
                    >
                      {room.styleTag}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex gap-2.5">
                  <span
                    className="mt-[1px] inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-medium"
                    style={{ background: coverBackground(room.coverGradient), color: 'rgba(255,255,255,.9)' }}
                  >
                    {(room.streamerName || '?').slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[13.5px] font-medium leading-[19px]"
                      style={{ color: W.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {room.title}
                    </div>
                    {room.titleTranslated ? (
                      <div className="mt-[2px] truncate text-[11.5px]" style={{ color: W.faint }}>
                        {room.titleTranslated}
                      </div>
                    ) : null}
                    <div className="mt-[3px] truncate text-[11.5px]" style={{ color: W.sub }}>
                      {room.streamerName} · {room.category}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 底条：换一批 + 口味 */}
      <div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-2" style={{ borderTop: `1px solid ${W.line}` }}>
        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          className="inline-flex h-[38px] flex-1 items-center justify-center gap-1.5 text-[13px] font-medium disabled:opacity-45"
          style={{ borderRadius: R_PILL, background: W.ink, color: '#fff' }}
        >
          <WIco name="rewrite" size={16} />
          {busy ? '刷台中…' : '换一批'}
        </button>
        <button
          type="button"
          onClick={onEditRule}
          className="inline-flex h-[38px] shrink-0 items-center gap-1.5 px-4 text-[13px]"
          style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
        >
          <WIco name="edit" size={15} />
          口味
        </button>
      </div>

      {/* 长按卡片出的小菜单 */}
      <Sheet open={Boolean(menuRoom)} onClose={() => setMenuRoom(null)} title={menuRoom?.streamerName}>
        <div className="pb-2">
          {[
            {
              label: '编辑本场信息',
              desc: '主播名、人设、房间标题、分区，就地改',
              icon: 'edit' as const,
              run: () => {
                if (menuRoom) onEditRoom(menuRoom);
              },
            },
            {
              label: '从列表里删掉',
              desc: '只是不在大厅里出现，看过的那场还在历史里',
              icon: 'close' as const,
              run: () => {
                if (menuRoom) onRemoveRoom(menuRoom.id);
              },
            },
          ].map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setMenuRoom(null);
                item.run();
              }}
              className="flex w-full items-center gap-3 px-4 py-[12px] text-left active:bg-[#F8F8F8]"
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: W.fill, color: W.ink }}
              >
                <WIco name={item.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px]" style={{ color: W.ink }}>
                  {item.label}
                </span>
                <span className="mt-[1px] block text-[11px]" style={{ color: W.sub }}>
                  {item.desc}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
