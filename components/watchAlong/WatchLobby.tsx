/**
 * 陪看大厅。
 *
 * 一屏只做一件事：挑一个房间进去。
 * 顶栏：返回电波 / 标题 / 历史 / 设置（三个都常驻，不会被挤掉）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { washCoverSvg } from '../../utils/watchAlong/coverSvg';

/** 手指位移乘上阻尼，指示条最高到这里 */
const PULL_MAX = 88;
const PULL_AT = 56;
const PULL_DAMP = 0.45;
const PULL_LOCK = 10;

type PullMode = 'replace' | 'append';

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
  busyEdge = 'replace',
  sessions,
  onAskRefresh,
  tailToken,
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
  /** 这一轮是换掉整批，还是接在后面。圆圈就停在对应的那一头 */
  busyEdge?: PullMode;
  /** 全部历史，用来挑「还在看」的那场 */
  sessions: WatchAlongSession[];
  /** 松手过了阈值才打开口味。replace 换掉整批，append 接在现有房间后面 */
  onAskRefresh: (mode: PullMode) => void;
  /** 再刷一批写进池子之后 +1，列表滚到新的那一头 */
  tailToken: number;
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

  // 顶上往下拖：换掉这一批。滑到底再往上拖：再接一批。都只打开口味，不直接请求。
  const scrollerRef = useRef<HTMLDivElement>(null);
  const swallowRef = useRef(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onAskRef = useRef(onAskRefresh);
  onAskRef.current = onAskRefresh;
  const gesture = useRef({
    active: false,
    startY: 0,
    atTop: false,
    atBottom: false,
    kind: null as PullMode | null,
    offset: 0,
    dy: 0,
  });
  const settleTimer = useRef<number | null>(null);
  const [pull, setPull] = useState<{ kind: PullMode | null; offset: number; armed: boolean; dragging: boolean }>({
    kind: null,
    offset: 0,
    armed: false,
    dragging: false,
  });

  const pullApi = useRef({
    begin: (_y: number) => {},
    move: (_y: number) => false,
    end: (_open: boolean) => {},
  });

  pullApi.current.begin = (y: number) => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    const el = scrollerRef.current;
    const atTop = !el || el.scrollTop <= 2;
    const atBottom = !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    gesture.current = { active: true, startY: y, atTop, atBottom, kind: null, offset: 0, dy: 0 };
  };

  pullApi.current.move = (y: number) => {
    const g = gesture.current;
    if (!g.active) return false;
    const dy = y - g.startY;
    g.dy = dy;
    if (Math.abs(dy) > PULL_LOCK) clearPress();
    if (!g.kind) {
      if (dy > PULL_LOCK && g.atTop) g.kind = 'replace';
      else if (dy < -PULL_LOCK && g.atBottom) g.kind = 'append';
      else if (Math.abs(dy) > PULL_LOCK) {
        g.active = false;
        return false;
      } else {
        return false;
      }
    }
    const raw = g.kind === 'replace' ? Math.max(0, dy) : Math.max(0, -dy);
    const offset = Math.min(PULL_MAX, raw * PULL_DAMP);
    g.offset = offset;
    setPull({ kind: g.kind, offset, armed: offset >= PULL_AT, dragging: true });
    return true;
  };

  pullApi.current.end = (openIfArmed: boolean) => {
    const g = gesture.current;
    const moved = Math.abs(g.dy) > PULL_LOCK;
    const open = openIfArmed && Boolean(g.kind) && g.offset >= PULL_AT && !busyRef.current && !pressRef.current.fired;
    // 只吞松手带出来的那一下 click。弹层挡住、click 没来，也不能把下一次进房吃掉。
    if (moved || open) {
      swallowRef.current = true;
      window.setTimeout(() => {
        swallowRef.current = false;
      }, 400);
    }
    if (open && g.kind) onAskRef.current(g.kind);
    const kind = g.kind;
    gesture.current = { active: false, startY: 0, atTop: false, atBottom: false, kind: null, offset: 0, dy: 0 };
    setPull({ kind, offset: 0, armed: false, dragging: false });
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setPull({ kind: null, offset: 0, armed: false, dragging: false });
    }, 220);
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        pullApi.current.end(false);
        return;
      }
      pullApi.current.begin(e.touches[0].clientY);
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (pullApi.current.move(e.touches[0].clientY)) e.preventDefault();
    };
    const end = () => pullApi.current.end(true);
    const cancel = () => pullApi.current.end(false);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
    };
  }, []);

  useEffect(() => {
    if (!tailToken) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tailToken]);

  const pullLabel = pull.kind
    ? busy
      ? '刷台中…'
      : pull.kind === 'replace'
        ? pull.armed
          ? '松开，填写口味'
          : '下拉，换一批'
        : pull.armed
          ? '松开，填写口味'
          : '继续拖，再刷一批'
    : '';

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

      {/* 房间列表：下拉换一批，滑到底再拖就再接一批 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {busy ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
            style={{ top: busyEdge === 'append' ? undefined : 10, bottom: busyEdge === 'append' ? 10 : undefined }}
          >
            <span
              aria-label="正在刷新"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white"
              style={{ boxShadow: '0 6px 18px rgba(0,0,0,.16)' }}
            >
              <i
                className="block h-[18px] w-[18px] rounded-full"
                style={{
                  border: '2px solid rgba(15,15,15,.16)',
                  borderTopColor: W.ink,
                  animation: 'watchPullSpin .7s linear infinite',
                }}
              />
            </span>
          </div>
        ) : null}
        <style>{'@keyframes watchPullSpin { to { transform: rotate(360deg); } }'}</style>
        {pull.kind === 'replace' ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center overflow-hidden text-[12px]"
            style={{
              height: pull.offset,
              color: W.sub,
              transition: pull.dragging ? 'none' : 'height 200ms ease',
            }}
          >
            {pullLabel}
          </div>
        ) : null}
        <div
          ref={scrollerRef}
          className="h-full select-none overflow-y-auto"
          style={{
            overscrollBehavior: 'contain',
            transform:
              pull.kind === 'append'
                ? `translateY(${-pull.offset}px)`
                : pull.kind === 'replace'
                  ? `translateY(${pull.offset}px)`
                  : undefined,
            transition: pull.dragging ? 'none' : 'transform 200ms ease',
          }}
          onPointerDown={e => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            pullApi.current.begin(e.clientY);
          }}
          onPointerMove={e => {
            if (e.pointerType !== 'mouse') return;
            if (!pullApi.current.move(e.clientY)) return;
            e.preventDefault();
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={e => {
            if (e.pointerType !== 'mouse') return;
            pullApi.current.end(true);
          }}
          onPointerCancel={e => {
            if (e.pointerType !== 'mouse') return;
            pullApi.current.end(false);
          }}
        >
        {rooms.length === 0 ? (
          <EmptyState
            text={q ? '没有搜到这样的直播间' : busy ? '正在刷台…' : '还没刷出直播间'}
            hint={q ? '换个词试试' : busy ? undefined : '往下拉，换一批'}
          />
        ) : (
          <div className="px-3 pb-3">
            {rooms.map(room => {
              const cover = washCoverSvg(room.coverSvg);
              return (
              <button
                key={room.id}
                type="button"
                onPointerDown={() => startPress(room)}
                onPointerUp={clearPress}
                onPointerCancel={clearPress}
                onPointerLeave={clearPress}
                onContextMenu={e => e.preventDefault()}
                onClick={() => {
                  // 长按出过菜单，或者这一下是下拉松手，都不进场
                  if (pressRef.current.fired || swallowRef.current) {
                    pressRef.current.fired = false;
                    swallowRef.current = false;
                    return;
                  }
                  onStart(room);
                }}
                className="mb-4 block w-full text-left active:opacity-90"
              >
                <div
                  className="relative w-full overflow-hidden"
                  style={{
                    borderRadius: R_COVER,
                    background: cover ? W.fill : coverBackground(room.coverGradient),
                    aspectRatio: '16 / 9',
                  }}
                >
                  {cover ? (
                    <div
                      className="pointer-events-none absolute inset-0 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: cover }}
                    />
                  ) : null}
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
                    style={{
                      background: cover ? W.fill : coverBackground(room.coverGradient),
                      color: cover ? W.ink : 'rgba(255,255,255,.9)',
                    }}
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
              );
            })}
          </div>
        )}
        </div>
        {pull.kind === 'append' ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center overflow-hidden text-[12px]"
            style={{
              height: pull.offset,
              color: W.sub,
              transition: pull.dragging ? 'none' : 'height 200ms ease',
            }}
          >
            {pullLabel}
          </div>
        ) : null}
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
