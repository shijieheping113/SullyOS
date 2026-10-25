/**
 * 陪看房间。
 *
 * 从上到下：状态栏 → 顶栏 → 直播画面 → 主播行（含下一幕）→ 台词 → 公屏 → 输入条。
 * 一屏只做一件事：看。别的操作全收在顶栏和底栏几个入口里。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  EmptyState,
  R_COVER,
  R_PILL,
  Sheet,
  StatusBar,
  W,
  WIco,
  formatCount,
} from './chrome';
import { WatchPet } from './WatchPet';
import { coverBackground } from './WatchLobby';
import type { WatchAlongSession } from '../../utils/watchAlong/types';

export function WatchRoom({
  session,
  charName,
  charAvatar,
  busy,
  bubble,
  chatUnread,
  micPlaying,
  micLoading,
  onPlayMic,
  onBack,
  onAdvance,
  onForward,
  onSendDanmaku,
  onMicToggle,
  onOpenChat,
  onOpenDirector,
  onOpenSummary,
  onOpenSettings,
  onExit,
  onSummon,
  onHidePet,
}: {
  session: WatchAlongSession;
  charName: string;
  charAvatar?: string;
  /** 正在生成下一幕 */
  busy: boolean;
  bubble: string | null;
  chatUnread: number;
  /** 麦上那句正在响 / 正在合成 */
  micPlaying?: boolean;
  micLoading?: boolean;
  onPlayMic: () => void;
  onBack: () => void;
  onAdvance: () => void;
  /** 把当前这一幕转发进私聊 */
  onForward: () => void;
  onSendDanmaku: (text: string) => void;
  onMicToggle: () => void;
  onOpenChat: () => void;
  onOpenDirector: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
  onExit: () => void;
  onSummon: () => void;
  onHidePet: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const danmakuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  const last = session.beats[session.beats.length - 1];
  const charHere = session.cast.presence !== 'solo';

  /** 麦上最后一句话（角色说的）；没有就是 undefined */
  const micLine = useMemo(() => {
    for (let i = session.beats.length - 1; i >= 0; i--) {
      const b = session.beats[i];
      if (b.charMicLine) return b.charMicLine;
      const spoken = [...b.charActions].reverse().find(a => a.kind === 'mic_line' && a.text);
      if (spoken?.text) return spoken.text;
    }
    return undefined;
  }, [session.beats]);

  const myMicLine = useMemo(() => {
    for (let i = session.beats.length - 1; i >= 0; i--) {
      const b = session.beats[i];
      if (b.userMicLine) return b.userMicLine;
      const spoken = [...b.userActions].reverse().find(a => a.kind === 'mic_line' && a.text);
      if (spoken?.text) return spoken.text;
    }
    return undefined;
  }, [session.beats]);

  // 公屏滚动：新弹幕进来就贴到底
  useEffect(() => {
    const el = danmakuRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last?.id, session.beats.length]);

  const lines = useMemo(() => {
    const out: Array<{ id: string; author: string; text: string; mine: boolean; char: boolean }> = [];
    (last?.danmaku ?? []).forEach(d => {
      out.push({ id: d.id, author: d.author, text: d.text, mine: false, char: false });
    });
    (last?.userActions ?? []).forEach(a => {
      // 我在麦上说的话在连麦席里，公屏不重复
      if (a.kind === 'mic_line') return;
      if (a.kind === 'danmaku' && a.text) {
        out.push({ id: a.id, author: session.cast.userAccount.nickname, text: a.text, mine: true, char: false });
      } else {
        out.push({
          id: a.id,
          author: session.cast.userAccount.nickname,
          text: a.kind === 'gift' ? `送出 ${a.giftName || '礼物'}${a.giftAmount ? ` ×${a.giftAmount}` : ''}` : a.kind === 'mic_on' ? '申请上麦，接通了' : a.kind === 'mic_off' ? '下麦了' : a.text || '',
          mine: true,
          char: false,
        });
      }
    });
    (last?.charActions ?? []).forEach(a => {
      // 麦上说的那句已经在连麦席里了，公屏不再重复一遍
      if (a.kind === 'mic_line') return;
      out.push({
        id: a.id,
        author: session.cast.charAccount.nickname,
        text:
          a.kind === 'gift'
            ? `送出 ${a.giftName || '礼物'}${a.giftAmount ? ` ×${a.giftAmount}` : ''}`
            : a.kind === 'mic_on'
              ? '上麦了'
              : a.kind === 'mic_off'
                ? '下麦了'
                : a.text || '',
        mine: false,
        char: true,
      });
    });
    return out.filter(l => l.text);
  }, [last, session.cast.charAccount.nickname, session.cast.userAccount.nickname]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    onSendDanmaku(text);
  };

  return (
    <div ref={rootRef} className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: W.page, color: W.ink }}>
      <StatusBar />

      {/* 顶栏 */}
      <div className="flex h-[50px] shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          aria-label="返回大厅"
          onClick={onBack}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-[#F2F2F2]"
        >
          <WIco name="back" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{session.room.streamerName}</div>
          <div className="truncate text-[11px]" style={{ color: W.sub }}>
            {session.room.category} · {formatCount(session.room.viewerCount)} 人在看
          </div>
        </div>

        {!charHere ? (
          <button
            type="button"
            onClick={onSummon}
            className="inline-flex h-[32px] shrink-0 items-center gap-1 px-[11px] text-[12px] font-medium"
            style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
          >
            <WIco name="people" size={14} />
            叫{charName || '阿猫'}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onOpenDirector}
          className="inline-flex h-[32px] shrink-0 items-center gap-1 px-[11px] text-[12px] font-medium"
          style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
        >
          <WIco name="clap" size={14} />
          导演
        </button>

        <button
          type="button"
          aria-label="更多"
          onClick={() => setMoreOpen(true)}
          className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-full active:bg-[#F2F2F2]"
        >
          <WIco name="more" size={19} />
        </button>
      </div>

      {/* 直播画面 */}
      <div
        className="relative mx-3 shrink-0 overflow-hidden"
        style={{ borderRadius: R_COVER, background: coverBackground(session.room.coverGradient), aspectRatio: '16 / 9' }}
      >
        <div className="absolute inset-0 flex flex-col justify-between p-3">
          <div className="flex items-start justify-between">
            <span
              className="inline-flex h-[19px] items-center gap-[4px] px-[6px] text-[9.5px] font-bold tracking-wide text-white"
              style={{ borderRadius: 4, background: W.red }}
            >
              LIVE
            </span>
            <span className="text-[10px] text-white/55">第 {session.beats.length} 幕</span>
          </div>

          {/* 画面描写贴在底部，像直播的字幕层 */}
          <div>
            {busy ? (
              <div className="text-[11.5px] text-white/70">正在接通下一幕…</div>
            ) : (
              <div
                className="text-[11.5px] leading-[17px] text-white/85"
                style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {last?.scene || '画面还没接通，点「下一幕」开始看。'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 主播行：下一幕在这儿，不压在画面上 */}
      <div className="flex shrink-0 items-center gap-2.5 px-3 pt-2.5">
        <span
          className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-medium"
          style={{ background: coverBackground(session.room.coverGradient), color: 'rgba(255,255,255,.9)' }}
        >
          {(session.room.streamerName || '?').slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium">{session.room.streamerName}</div>
          <div className="truncate text-[10.5px]" style={{ color: W.sub }}>
            {session.room.streamerHandle} · {session.room.title}
          </div>
        </div>
        <button
          type="button"
          aria-label="把这一幕转给她"
          disabled={busy || session.legacy || !last}
          onClick={onForward}
          className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: W.fill, color: W.ink }}
        >
          <WIco name="send" size={15} />
        </button>
        <button
          type="button"
          disabled={busy || session.legacy}
          onClick={onAdvance}
          className="inline-flex h-[34px] shrink-0 items-center gap-0.5 pl-[13px] pr-[9px] text-[12.5px] font-medium text-white disabled:opacity-40"
          style={{ borderRadius: R_PILL, background: W.ink }}
        >
          {busy ? '生成中' : '下一幕'}
          <WIco name="next" size={15} />
        </button>
      </div>

      {/* 连麦席：麦上只有角色出声，我说的话是文字 */}
      {micLine ? (
        <div className="mx-3 mt-2 shrink-0 px-3 py-2.5" style={{ borderRadius: 12, background: W.soft, border: `1px solid ${W.line}` }}>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-[16px] items-center gap-1 px-[5px] text-[9px] font-bold text-white" style={{ borderRadius: 3, background: W.red }}>
              连麦
            </span>
            <span className="text-[10.5px]" style={{ color: W.sub }}>
              只有{charName || '阿猫'}出声
            </span>
          </div>

          {/* 角色：麦上语音 */}
          <div className="mt-2 flex items-start gap-2">
            <Avatar src={charAvatar} name={charName} size={22} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={onPlayMic}
                className="flex max-w-full items-center gap-2 px-2.5 py-1.5 active:opacity-90"
                style={{ borderRadius: 12, background: W.ink, color: '#fff' }}
              >
                {micLoading ? (
                  <span className="flex items-center gap-[3px]">
                    {[0, 1, 2].map(i => (
                      <i
                        key={i}
                        className="block h-[4px] w-[4px] rounded-full"
                        style={{ background: 'currentColor', opacity: 0.55, animation: `roomDot 1s ${i * 0.16}s infinite ease-in-out` }}
                      />
                    ))}
                  </span>
                ) : (
                  <WIco name={micPlaying ? 'pause' : 'play'} size={11} />
                )}
                <span className="flex h-[12px] items-center gap-[2px]">
                  {[4, 9, 12, 6, 10, 5].map((h, i) => (
                    <i
                      key={i}
                      className="block w-[2px] rounded-[1px]"
                      style={{
                        height: h,
                        background: 'currentColor',
                        opacity: micPlaying ? 0.95 : 0.7,
                        animation: micPlaying ? `roomWave .9s ${i * 0.09}s infinite ease-in-out` : undefined,
                      }}
                    />
                  ))}
                </span>
                <span className="truncate text-[10.5px] opacity-70">
                  {micPlaying ? '正在说…' : '点一下听'}
                </span>
              </button>
              <div className="mt-1 text-[11.5px] leading-[16px]" style={{ color: W.ink }}>
                {micLine}
              </div>
            </div>
          </div>

          {/* 我：麦上打字 */}
          {myMicLine ? (
            <div className="mt-2 flex justify-end">
              <div className="max-w-[78%] px-2.5 py-1.5 text-[11.5px] leading-[16px]" style={{ borderRadius: 12, background: '#fff', color: W.ink, border: `1px solid ${W.line}` }}>
                {myMicLine}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 台词与接招 */}
      {last?.speech || last?.followUp ? (
        <div className="shrink-0 px-3 pt-2">
          {last?.speech ? (
            <div className="text-[14px] leading-[21px]" style={{ color: W.ink }}>
              {last.speech}
            </div>
          ) : null}
          {last?.followUp ? (
            <div
              className="mt-1.5 pl-2.5 text-[11.5px] leading-[17px]"
              style={{ color: W.sub, borderLeft: `2px solid ${W.red}` }}
            >
              {last.followUp.scene}
              {last.followUp.speech ? <span className="mt-0.5 block" style={{ color: W.ink }}>{last.followUp.speech}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 公屏 */}
      <div ref={danmakuRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pt-2">
        {session.legacy ? (
          <div className="pb-2 text-[11px]" style={{ color: W.sub }}>
            这是旧版陪看记录，只能翻看，不能再往下演。
          </div>
        ) : null}
        {lines.length === 0 ? (
          <div className="py-6 text-center text-[11.5px]" style={{ color: W.sub }}>
            公屏还很安静
          </div>
        ) : (
          lines.map(l => (
            <div key={l.id} className="mb-[7px] text-[12px] leading-[17px]">
              <span
                style={{
                  color: l.mine ? W.ink : l.char ? W.ink : W.sub,
                  fontWeight: l.mine || l.char ? 600 : 400,
                }}
              >
                {l.author}
              </span>
              <span style={{ color: W.sub }}>：</span>
              <span style={{ color: W.ink }}>{l.text}</span>
            </div>
          ))
        )}
      </div>

      {/* 输入条 */}
      <div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-1.5">
        <div
          className="flex h-[38px] min-w-0 flex-1 items-center px-3"
          style={{ borderRadius: R_PILL, background: W.fill }}
        >
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') send();
            }}
            placeholder="发条弹幕…"
            aria-label="发弹幕"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#909090]"
            style={{ color: W.ink }}
          />
          {draft.trim() ? (
            <button type="button" aria-label="发送弹幕" onClick={send} disabled={busy} className="ml-1 shrink-0 disabled:opacity-40">
              <WIco name="send" size={18} style={{ color: W.ink }} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          aria-label={session.cast.mic === 'on' ? '下麦' : '上麦'}
          onClick={onMicToggle}
          className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
          style={{
            background: session.cast.mic === 'on' ? W.red : W.fill,
            color: session.cast.mic === 'on' ? '#fff' : W.ink,
          }}
        >
          <WIco name="mic" size={17} />
        </button>

        <button
          type="button"
          aria-label="私聊"
          onClick={onOpenChat}
          className="relative inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
          style={{ background: W.fill, color: W.ink }}
        >
          <WIco name="chat" size={17} />
          {chatUnread > 0 ? (
            <i
              className="absolute right-1 top-1 block h-[7px] w-[7px] rounded-full"
              style={{ background: W.red }}
            />
          ) : null}
        </button>
      </div>

      {/* 桌宠：整屏可拖 */}
      <WatchPet
        src={charAvatar}
        name={charName}
        bubble={bubble}
        hidden={!charHere || !session.cast.petVisible}
        containerRef={rootRef}
        onClick={onOpenChat}
      />

      {/* 更多 */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={session.room.title}>
        <div className="pb-2">
          {[
            { label: '看总结', desc: '整场回顾与阶段摘要', icon: 'clock' as const, run: onOpenSummary },
            { label: '陪看设置', desc: '小号、总结、模型', icon: 'gear' as const, run: onOpenSettings },
            charHere
              ? { label: '收起小人', desc: '桌宠先藏起来，人还在', icon: 'eye' as const, run: onHidePet }
              : { label: `叫${charName || '阿猫'}进来`, desc: '叫进来一起看', icon: 'people' as const, run: onSummon },
            { label: '结束陪看', desc: '收场，写一段回顾', icon: 'close' as const, run: onExit },
          ].map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setMoreOpen(false);
                item.run();
              }}
              className="flex w-full items-center gap-3 px-4 py-[13px] text-left active:bg-[#F8F8F8]"
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

      <style>{`
        @keyframes roomDot { 0%,100%{opacity:.28;transform:translateY(0)} 50%{opacity:1;transform:translateY(-2px)} }
        @keyframes roomWave { 0%,100%{transform:scaleY(.55)} 50%{transform:scaleY(1.15)} }
      `}</style>
    </div>
  );
}
