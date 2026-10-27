/**
 * 陪看桌宠。
 *
 * 可以在整个房间范围内自由拖动；拖到哪就停在哪。
 * 单击：气泡收着就亮出当前这一句，亮着就换下一条。
 * 双击：在直播画面上打字。长按：进入私聊。
 */
import React, { useEffect, useRef, useState } from 'react';
import TokenImg from '../os/TokenImg';
import { W } from './chrome';

const PET_SIZE = 46;

export function WatchPet({
  src,
  name,
  bubble,
  bubbleSeq,
  bubbleIsVoice,
  generating,
  onTapBubble,
  onRevealBubble,
  onCompose,
  onOpenChat,
  containerRef,
  hidden,
  onPlayVoice,
  voicePlaying,
}: {
  src?: string;
  name: string;
  /** 角色刚冒出的一句，null 表示不显示 */
  bubble: string | null;
  /** 气泡换了一句时 +1，用来重置「几秒后自动收起」 */
  bubbleSeq?: number;
  /** 这一句是不是语音：喇叭只负责播放，点气泡本身换下一条 */
  bubbleIsVoice?: boolean;
  /** 正在生成私聊回复：小人轻轻呼吸，好认出来还在想 */
  generating?: boolean;
  /** 气泡亮着时，点一下换下一条 */
  onTapBubble?: () => void;
  /** 气泡收着时，单击先亮出当前这一句 */
  onRevealBubble?: () => void;
  /** 双击：打开直播画面上的输入 */
  onCompose?: () => void;
  /** 长按：进入私聊 */
  onOpenChat: () => void;
  /** 房间页的最外层容器，用来限制拖动边界 */
  containerRef: React.RefObject<HTMLDivElement | null>;
  hidden?: boolean;
  /** 气泡上那个小喇叭：念这句语音 */
  onPlayVoice?: () => void;
  voicePlaying?: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [shown, setShown] = useState(true);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const longTimer = useRef<number | null>(null);
  const clickTimer = useRef<number | null>(null);
  const longFired = useRef(false);
  const lastClickAt = useRef(0);
  /** 当前这条语音有没有真正播过。没播完之前，不开始算收起时间。 */
  const voicePlayed = useRef(false);

  // 第一次摆位：右侧偏下，落在公屏那一带，不压主播行和底栏
  useEffect(() => {
    if (pos) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    // 别压在底下的输入条上：给底栏留出 130px
    const preferred = Math.max(120, r.height * 0.66);
    const ceiling = Math.max(120, r.height - PET_SIZE - 132);
    setPos({ x: Math.max(8, r.width - PET_SIZE - 12), y: Math.min(preferred, ceiling) });
  }, [containerRef, pos]);

  // 换一条就重新亮出来。文字消息马上开始算 6 秒无操作收起。
  // 语音消息要等这一条播放结束，才开始算这 6 秒。
  useEffect(() => {
    voicePlayed.current = false;
  }, [bubble, bubbleSeq]);

  useEffect(() => {
    if (!bubble) return;
    setShown(true);
    if (bubbleIsVoice) return;
    const t = setTimeout(() => setShown(false), 6000);
    return () => clearTimeout(t);
  }, [bubble, bubbleSeq, bubbleIsVoice]);

  useEffect(() => {
    if (!bubble || !bubbleIsVoice) return;
    if (voicePlaying) {
      voicePlayed.current = true;
      setShown(true);
      return;
    }
    if (!voicePlayed.current) return;
    const t = setTimeout(() => setShown(false), 6000);
    return () => clearTimeout(t);
  }, [bubble, bubbleIsVoice, voicePlaying]);

  if (hidden) return null;

  const clamp = (x: number, y: number) => {
    const el = containerRef.current;
    const r = el?.getBoundingClientRect();
    const maxX = (r?.width ?? 360) - PET_SIZE - 6;
    const maxY = (r?.height ?? 640) - PET_SIZE - 6;
    return { x: Math.min(maxX, Math.max(6, x)), y: Math.min(maxY, Math.max(6, y)) };
  };

  const clearLong = () => {
    if (longTimer.current !== null) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
    longFired.current = false;
    setDragging(true);
    clearLong();
    longTimer.current = window.setTimeout(() => {
      longTimer.current = null;
      longFired.current = true;
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      onOpenChat();
    }, 480);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clamp(e.clientX - d.dx, e.clientY - d.dy);
    if (Math.abs(next.x - (pos?.x ?? 0)) > 3 || Math.abs(next.y - (pos?.y ?? 0)) > 3) {
      d.moved = true;
      clearLong();
    }
    setPos(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    clearLong();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!d || d.moved || longFired.current) return;
    const now = Date.now();
    if (now - lastClickAt.current < 280) {
      lastClickAt.current = 0;
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      onCompose?.();
      return;
    }
    lastClickAt.current = now;
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      if (!shown) {
        setShown(true);
        onRevealBubble?.();
      } else {
        onTapBubble?.();
      }
    }, 280);
  };

  if (!pos) return null;

  // 气泡不越出屏幕：靠右边就把气泡往左挂，靠左边往右挂；人在下半屏时气泡放到脚边，免得压住台词
  const stage = containerRef.current?.getBoundingClientRect();
  const stageWidth = stage?.width ?? 360;
  const stageHeight = stage?.height ?? 640;
  const bubbleWidth = Math.min(196, Math.max(120, bubble ? bubble.length * 13 + 24 : 120));
  const overflowRight = pos.x + bubbleWidth / 2 + PET_SIZE / 2 > stageWidth - 6;
  const overflowLeft = pos.x - bubbleWidth / 2 < 6;
  // 脚下放不下（会掉出屏幕 / 压到输入条）就翻到头顶去
  const fitsBelow = pos.y + PET_SIZE + 96 < stageHeight - 110;
  const below = pos.y > stageHeight * 0.45 && fitsBelow;
  const bubbleStyle: React.CSSProperties = {
    ...(overflowRight ? { right: 0 } : overflowLeft ? { left: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
    ...(below ? { top: PET_SIZE + 8 } : { bottom: PET_SIZE + 8 }),
  };

  const breathing = Boolean(generating) && !dragging;

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: pos.x, top: pos.y, width: PET_SIZE, height: PET_SIZE }}
    >
      <style>{`
        @keyframes watchPetBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes watchPetRing {
          0%, 100% { opacity: .22; transform: scale(1); }
          50% { opacity: .5; transform: scale(1.14); }
        }
        @media (prefers-reduced-motion: reduce) {
          .watch-pet-breathe, .watch-pet-ring { animation: none !important; }
        }
      `}</style>
      {breathing ? (
        <span
          aria-hidden
          className="watch-pet-ring pointer-events-none absolute inset-0 rounded-full"
          style={{
            border: '1.5px solid rgba(255,255,255,.55)',
            animation: 'watchPetRing 1.7s ease-in-out infinite',
          }}
        />
      ) : null}
      {bubble && shown ? (
        <div
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            onTapBubble?.();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') onTapBubble?.();
          }}
          className="pointer-events-auto absolute w-max max-w-[196px] px-[11px] py-[8px] text-left"
          style={{
            borderRadius: 14,
            borderBottomRightRadius: 4,
            background: '#fff',
            color: W.ink,
            boxShadow: '0 6px 20px rgba(0,0,0,.22)',
            ...bubbleStyle,
          }}
        >
          <span className="mb-[2px] flex items-center gap-1 text-[9.5px]" style={{ color: W.faint }}>
            {name}
            {bubbleIsVoice ? (
              <button
                type="button"
                aria-label={voicePlaying ? '暂停语音' : '播放语音'}
                onClick={e => {
                  e.stopPropagation();
                  onPlayVoice?.();
                }}
                className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full"
                style={{ background: W.fill, color: W.ink }}
              >
                <span className="text-[7px] leading-none" style={{ opacity: voicePlaying ? 1 : 0.7 }}>
                  {voicePlaying ? '❚❚' : '▶'}
                </span>
              </button>
            ) : null}
          </span>
          <span className="block text-[11.5px] leading-[17px]">{bubble}</span>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={
          generating
            ? `${name}正在想回复（单击下一条，双击打字，长按进入私聊）`
            : `${name}（单击下一条，双击打字，长按进入私聊）`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`pointer-events-auto flex h-full w-full touch-none items-center justify-center overflow-hidden rounded-full${breathing ? ' watch-pet-breathe' : ''}`}
        style={{
          background: '#12141A',
          border: `1.5px solid ${dragging ? 'rgba(255,255,255,.45)' : breathing ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.22)'}`,
          boxShadow: dragging ? '0 10px 26px rgba(0,0,0,.32)' : '0 6px 18px rgba(0,0,0,.30)',
          transform: dragging ? 'scale(1.06)' : undefined,
          animation: breathing ? 'watchPetBreathe 1.7s ease-in-out infinite' : undefined,
          transition: dragging || breathing ? 'none' : 'transform .16s ease, box-shadow .16s ease',
        }}
      >
        {src ? (
          <TokenImg value={src} alt={name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="text-[15px] font-semibold text-white/80">
            {(name || '?').slice(0, 1)}
          </span>
        )}
      </button>
    </div>
  );
}
