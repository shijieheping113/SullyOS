/**
 * 陪看私聊（YouTube 私信的样子）。
 *
 * 上面一条直播还在演的横条，中间是两个人说话，下面是输入条。
 * 五个常用功能都在这儿：表情包、引用、翻译、语音、转账。
 *
 * 语音照喵喵盒的规矩：**只留一条语音条，点一下才去合成，合成完直接响**；
 * 合成中显示点点，长按可以「语音下载」。这里不出声的地方一律不出声。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import TokenImg from '../os/TokenImg';
import {
  Avatar,
  R_PILL,
  Sheet,
  SolidButton,
  StatusBar,
  W,
  WIco,
  timeAgo,
} from './chrome';
import type { Emoji, EmojiCategory } from '../../types';
import type {
  WatchAlongSession,
  WatchChatMessage,
  WatchQuote,
  WatchTransfer,
} from '../../utils/watchAlong/types';

/** 关掉长按菜单时的选块蓝影 */
const NO_SELECT = { WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties;

type SendPayload = {
  text?: string;
  sticker?: string;
  quote?: WatchQuote;
  transfer?: WatchTransfer;
};

export function WatchChat({
  session,
  charName,
  charAvatar,
  busy,
  emojis,
  categories,
  playingId,
  loadingId,
  voiceReady,
  onBack,
  onOpenRoom,
  onOpenDirector,
  onSend,
  onPlayVoice,
  onDownloadVoice,
  onTranslate,
  onDelete,
  onToggleVoiceReply,
  onResendAsVoice,
}: {
  session: WatchAlongSession;
  charName: string;
  charAvatar?: string;
  /** 角色正在想 */
  busy: boolean;
  emojis: Emoji[];
  categories: EmojiCategory[];
  /** 正在响的那条 */
  playingId: string | null;
  /** 正在合成的那条 */
  loadingId: string | null;
  /** 这台设备能不能合成语音（没配 TTS 就只显示文字） */
  voiceReady: boolean;
  onBack: () => void;
  onOpenRoom: () => void;
  onOpenDirector: () => void;
  onSend: (payload: SendPayload) => void;
  onPlayVoice: (msg: WatchChatMessage) => void;
  onDownloadVoice: (msg: WatchChatMessage) => void;
  onTranslate: (msg: WatchChatMessage) => void;
  onDelete: (msg: WatchChatMessage) => void;
  onToggleVoiceReply: (on: boolean) => void;
  onResendAsVoice: (msg: WatchChatMessage) => void;
}) {
  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState<WatchQuote | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState<string>('all');
  const [menuFor, setMenuFor] = useState<WatchChatMessage | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('200');
  const [payNote, setPayNote] = useState('');
  const flowRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charHere = session.cast.presence !== 'solo';
  const voiceReply = session.cast.voiceReply === true;

  // 新消息进来就贴到底（主题样式是运行时生成的，排版会晚一拍，所以补一次）
  useEffect(() => {
    const el = flowRef.current;
    if (!el) return;
    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    toBottom();
    const t = setTimeout(toBottom, 120);
    return () => clearTimeout(t);
  }, [session.chat.length, busy]);

  // 换表情分类时回到全部
  useEffect(() => {
    setEmojiTab('all');
  }, [emojiOpen]);

  const shownEmojis = useMemo(() => {
    if (emojiTab === 'all') return emojis;
    return emojis.filter(e => e.categoryId === emojiTab);
  }, [emojis, emojiTab]);

  const emojiUrl = (name?: string): string | undefined =>
    name ? emojis.find(e => e.name === name)?.url : undefined;

  const startPress = (m: WatchChatMessage) => {
    if (m.from === 'action') return;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setMenuFor(m), 420);
  };
  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setQuote(null);
    setEmojiOpen(false);
    onSend({ text, quote: quote ?? undefined });
  };

  const sendSticker = (name: string) => {
    if (busy) return;
    setEmojiOpen(false);
    onSend({ sticker: name, quote: quote ?? undefined, text: undefined });
    setQuote(null);
  };

  const sendPay = () => {
    const amount = Math.max(1, Math.round(Number(payAmount) || 0));
    if (!amount) return;
    setPayOpen(false);
    onSend({
      transfer: { amount, note: payNote.trim() || undefined, status: 'pending' },
    });
    setPayNote('');
  };

  const bubbleColor = (mine: boolean) => (mine ? W.ink : W.fill);
  const textColor = (mine: boolean) => (mine ? '#FFFFFF' : W.ink);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: W.page }}>
      <StatusBar />

      {/* 台上还在演的那一条 */}
      <button
        type="button"
        onClick={onOpenRoom}
        className="relative flex h-[40px] shrink-0 items-center gap-2 px-3 text-left"
        style={{ background: W.ink, color: 'rgba(255,255,255,.9)' }}
      >
        <span
          className="inline-flex h-[17px] items-center px-[5px] text-[9px] font-bold tracking-wide text-white"
          style={{ borderRadius: 3, background: W.red }}
        >
          LIVE
        </span>
        <span className="truncate text-[11.5px]">
          {session.room.streamerName} · 第 {Math.max(1, session.beats.length)} 幕
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-white/55">回到直播</span>
        <WIco name="next" size={13} style={{ color: 'rgba(255,255,255,.6)' }} />
      </button>

      {/* 会话头 */}
      <div className="flex h-[50px] shrink-0 items-center gap-2 px-2" style={{ borderBottom: `1px solid ${W.line}` }}>
        <button
          type="button"
          aria-label="返回直播"
          onClick={onBack}
          className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-full active:bg-[#F2F2F2]"
          style={{ color: W.ink }}
        >
          <WIco name="back" size={21} />
        </button>
        <Avatar src={charAvatar} name={charName} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-[17px]" style={{ color: W.ink }}>
            {charName}
          </div>
          <div className="truncate text-[10.5px] leading-[13px]" style={{ color: W.sub }}>
            {charHere ? (session.cast.presence === 'side' ? '陪你看 · 同屏中' : '只在私聊里') : '还没进来'}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenDirector}
          className="inline-flex h-[30px] shrink-0 items-center gap-1 px-3 text-[11.5px] font-medium"
          style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
        >
          <WIco name="clap" size={13} />
          导演
        </button>
      </div>

      {/* 消息流 */}
      <div ref={flowRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2" style={NO_SELECT}>
        {session.chat.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] leading-[19px]" style={{ color: W.sub }}>
            {charHere ? `跟${charName}说点什么，或者把刚才那一幕转给她。` : `${charName}还没进来看，先把好笑的转发给她也行。`}
          </div>
        ) : null}

        {session.chat.map(m => {
          const mine = m.from === 'user';
          const stickerUrl = emojiUrl(m.sticker);
          const isVoice = Boolean(m.wantVoice || m.voiceId);
          const mineQuote = m.quote;

          if (m.from === 'action') {
            return (
              <div key={m.id} className="my-2 text-center text-[10.5px] leading-[15px]" style={{ color: W.faint }}>
                {m.text}
              </div>
            );
          }

          if (m.from === 'clip' && m.clip) {
            return (
              <div
                key={m.id}
                className="mb-2 flex"
                onPointerDown={() => startPress(m)}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onContextMenu={e => e.preventDefault()}
              >
                <div
                  className="w-[232px] overflow-hidden"
                  style={{ borderRadius: 14, border: `1px solid ${W.line}`, background: '#fff' }}
                >
                  <div className="flex items-center gap-1.5 px-3 pt-2 text-[10px]" style={{ color: W.faint }}>
                    <span style={{ color: W.red, fontWeight: 700 }}>片段</span>
                    第 {m.clip.beatIndex + 1} 幕 · {m.clip.streamerName}
                  </div>
                  <div className="px-3 pb-1 pt-1 text-[12px] leading-[17px]" style={{ color: W.ink }}>
                    {m.clip.scene}
                  </div>
                  {m.clip.speech ? (
                    <div className="px-3 pb-2 text-[12px] leading-[17px]" style={{ color: W.sub }}>
                      「{m.clip.speech}」
                    </div>
                  ) : null}
                  <div className="px-3 pb-2.5 text-[10px]" style={{ color: W.faint }}>
                    公屏 {m.clip.danmaku.length} 条
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} className={`mb-2 flex gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
              {!mine ? <Avatar src={charAvatar} name={charName} size={24} /> : null}

              <div className={`flex min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ maxWidth: '78%' }}>
                {/* 表情包：不带气泡的大图 */}
                {m.sticker ? (
                  <button
                    type="button"
                    onPointerDown={() => startPress(m)}
                    onPointerUp={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={e => e.preventDefault()}
                    className="block overflow-hidden active:opacity-90"
                    style={{ borderRadius: 10, width: 82, height: 82, background: W.fill }}
                  >
                    {stickerUrl ? (
                      <TokenImg value={stickerUrl} alt={m.sticker} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px]" style={{ color: W.sub }}>
                        {m.sticker}
                      </span>
                    )}
                  </button>
                ) : null}

                {/* 转账卡 */}
                {m.transfer ? (
                  <button
                    type="button"
                    onPointerDown={() => startPress(m)}
                    onPointerUp={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={e => e.preventDefault()}
                    className="mb-1 block w-[214px] overflow-hidden text-left active:opacity-95"
                    style={{
                      borderRadius: 16,
                      padding: '12px 14px 11px',
                      color: '#fff',
                      background: 'linear-gradient(135deg,#FFB224,#FF7A18)',
                    }}
                  >
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ background: 'rgba(255,255,255,.24)' }}
                      >
                        <WIco name="gift" size={11} style={{ color: '#fff' }} />
                      </span>
                      Sully Pay
                    </span>
                    <span className="mt-1.5 block text-[21px] font-bold leading-[25px] tracking-tight">
                      ₩ {m.transfer.amount}
                    </span>
                    {m.transfer.note ? (
                      <span className="mt-[1px] block truncate text-[10.5px] text-white/85">{m.transfer.note}</span>
                    ) : null}
                    <span className="mt-2 flex items-center justify-between text-[10px] text-white/90">
                      <span>转账给 {charName}</span>
                      <span className="px-1.5 py-[1px] text-[9px]" style={{ borderRadius: R_PILL, background: 'rgba(255,255,255,.26)' }}>
                        {m.transfer.status === 'accepted' ? '已收款' : m.transfer.status === 'returned' ? '已退回' : '待领取'}
                      </span>
                    </span>
                  </button>
                ) : null}

                {/* 语音条：点一下才去合成，合成中点点；说的什么字跟在下面一行 */}
                {isVoice && !m.sticker ? (
                  <button
                    type="button"
                    disabled={!voiceReady || busy}
                    onPointerDown={() => startPress(m)}
                    onPointerUp={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={e => e.preventDefault()}
                    onClick={() => {
                      if (!voiceReady) return;
                      onPlayVoice(m);
                    }}
                    className="block max-w-full px-[13px] py-[9px] text-left active:opacity-90 disabled:opacity-60"
                    style={{ borderRadius: 16, background: bubbleColor(mine), color: textColor(mine) }}
                  >
                    <span className="flex items-center gap-2">
                      {loadingId === m.id ? (
                        <span className="flex items-center gap-[3px]">
                          {[0, 1, 2].map(i => (
                            <i
                              key={i}
                              className="block h-[4px] w-[4px] rounded-full"
                              style={{
                                background: 'currentColor',
                                opacity: 0.55,
                                animation: `watchDot 1s ${i * 0.16}s infinite ease-in-out`,
                              }}
                            />
                          ))}
                        </span>
                      ) : (
                        <WIco name={playingId === m.id ? 'pause' : 'play'} size={12} />
                      )}
                      <span className="flex h-[13px] items-center gap-[2px]">
                        {[5, 10, 14, 8, 12, 6, 9].map((h, i) => (
                          <i
                            key={i}
                            className="block w-[2px] rounded-[1px]"
                            style={{
                              height: h,
                              background: 'currentColor',
                              opacity: playingId === m.id ? 0.95 : 0.7,
                              animation: playingId === m.id ? `watchWave .9s ${i * 0.09}s infinite ease-in-out` : undefined,
                            }}
                          />
                        ))}
                      </span>
                      <span className="text-[10.5px] tabular-nums opacity-70">
                        {m.text ? `${Math.max(2, Math.round(m.text.length / 4))}″` : '语音'}
                      </span>
                    </span>
                    {m.text ? (
                      <span className="mt-1 block whitespace-pre-wrap break-words text-[11.5px] leading-[17px] opacity-70">
                        {m.text}
                      </span>
                    ) : null}
                  </button>
                ) : null}

                {/* 文字气泡 */}
                {!m.sticker && !isVoice && m.text ? (
                  <button
                    type="button"
                    onPointerDown={() => startPress(m)}
                    onPointerUp={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={e => e.preventDefault()}
                    onClick={() => {
                      if (m.translation) {
                        const el = document.getElementById(`tr_${m.id}`);
                        if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
                      }
                    }}
                    className="block text-left"
                    style={{
                      borderRadius: 16,
                      borderBottomLeftRadius: mine ? 16 : 5,
                      borderBottomRightRadius: mine ? 5 : 16,
                      background: bubbleColor(mine),
                      color: textColor(mine),
                      padding: '8px 12px',
                      maxWidth: '100%',
                    }}
                  >
                    {mineQuote ? (
                      <span
                        className="mb-1.5 flex gap-1.5 px-2 py-1"
                        style={{
                          borderRadius: 8,
                          background: mine ? 'rgba(255,255,255,.15)' : 'rgba(15,15,15,.06)',
                        }}
                      >
                        <i className="block w-[2px] shrink-0 rounded-[1px]" style={{ background: mine ? 'rgba(255,255,255,.62)' : '#B0B0B0' }} />
                        <span
                          className="text-[10.5px] leading-[15px]"
                          style={{
                            color: mine ? 'rgba(255,255,255,.74)' : W.sub,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {mineQuote.from === 'char' ? `${charName}：` : '我：'}
                          {mineQuote.text}
                        </span>
                      </span>
                    ) : null}
                    <span className="block whitespace-pre-wrap break-words text-[13px] leading-[19px]">{m.text}</span>
                    {m.translation ? (
                      <span
                        id={`tr_${m.id}`}
                        className="mt-1.5 block pt-1.5 text-[11.5px] leading-[17px]"
                        style={{
                          borderTop: `1px solid ${mine ? 'rgba(255,255,255,.18)' : 'rgba(15,15,15,.10)'}`,
                          color: mine ? 'rgba(255,255,255,.78)' : W.sub,
                        }}
                      >
                        <span
                          className="mr-1 px-[2px] align-[1px] text-[8.5px]"
                          style={{
                            border: `1px solid ${mine ? 'rgba(255,255,255,.4)' : '#D6D6D6'}`,
                            borderRadius: 3,
                            color: mine ? 'rgba(255,255,255,.7)' : W.faint,
                          }}
                        >
                          译
                        </span>
                        {m.translation}
                      </span>
                    ) : null}
                  </button>
                ) : null}

                <span className="mt-[2px] px-1 text-[9px]" style={{ color: W.faint }}>
                  {timeAgo(m.at)}
                </span>
              </div>
            </div>
          );
        })}

        {busy ? (
          <div className="mb-2 flex items-center gap-1.5 pl-1">
            <Avatar src={charAvatar} name={charName} size={24} />
            <span className="flex items-center gap-[3px] px-3 py-2" style={{ borderRadius: 16, background: W.fill }}>
              {[0, 1, 2].map(i => (
                <i
                  key={i}
                  className="block h-[5px] w-[5px] rounded-full"
                  style={{ background: W.sub, animation: `watchDot 1s ${i * 0.16}s infinite ease-in-out` }}
                />
              ))}
            </span>
          </div>
        ) : null}
      </div>

      {/* 引用条 */}
      {quote ? (
        <div className="mx-3 mb-1 flex shrink-0 items-center gap-2 px-2.5 py-1.5" style={{ borderRadius: 9, background: W.soft, borderLeft: `2px solid ${W.ink}` }}>
          <span className="flex-1 truncate text-[10.5px]" style={{ color: W.sub }}>
            <b style={{ color: W.ink }}>{quote.from === 'char' ? charName : '我'}：</b>
            {quote.text}
          </span>
          <button type="button" aria-label="取消引用" onClick={() => setQuote(null)} className="shrink-0 px-1 text-[15px] leading-none" style={{ color: W.faint }}>
            ×
          </button>
        </div>
      ) : null}

      {/* 加号展开的三样 */}
      {plusOpen ? (
        <div className="flex shrink-0 justify-center gap-9 px-4 pb-2 pt-3" style={{ background: W.page }}>
          {[
            { key: 'pay', label: '转账', icon: 'gift' as const, run: () => setPayOpen(true) },
            { key: 'voice', label: voiceReply ? '语音回你' : '语音', icon: 'mic' as const, run: () => onToggleVoiceReply(!voiceReply) },
            { key: 'emoji', label: '表情包', icon: 'emoji' as const, run: () => setEmojiOpen(true) },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setPlusOpen(false);
                item.run();
              }}
              className="flex flex-col items-center gap-1.5 text-[10px]"
              style={{ color: item.key === 'voice' && voiceReply ? W.ink : W.sub }}
            >
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                style={{
                  background: item.key === 'voice' && voiceReply ? W.ink : W.fill,
                  color: item.key === 'voice' && voiceReply ? '#fff' : W.ink,
                }}
              >
                <WIco name={item.icon} size={19} />
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 表情面板 */}
      {emojiOpen ? (
        <div className="shrink-0 px-3 pb-2 pt-2" style={{ borderTop: `1px solid ${W.line}`, background: W.page }}>
          {categories.length > 1 ? (
            <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
              {[{ id: 'all', name: '全部' } as EmojiCategory, ...categories].map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEmojiTab(c.id)}
                  className="h-[26px] shrink-0 px-[11px] text-[11px]"
                  style={{
                    borderRadius: R_PILL,
                    background: emojiTab === c.id ? W.ink : W.fill,
                    color: emojiTab === c.id ? '#fff' : W.ink,
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          {shownEmojis.length === 0 ? (
            <div className="py-6 text-center text-[11.5px]" style={{ color: W.sub }}>
              表情库里还空着，去主聊天存几个就能在这儿用
            </div>
          ) : (
            <div className="no-scrollbar grid max-h-[168px] grid-cols-4 gap-2 overflow-y-auto">
              {shownEmojis.map(e => (
                <button
                  key={`${e.name}_${e.url.slice(-12)}`}
                  type="button"
                  onClick={() => sendSticker(e.name)}
                  className="flex h-[52px] items-center justify-center overflow-hidden active:opacity-80"
                  style={{ borderRadius: 10, background: W.fill }}
                  aria-label={e.name}
                >
                  <TokenImg value={e.url} alt={e.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* 输入条 */}
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-2" style={{ borderTop: emojiOpen || plusOpen ? 'none' : `1px solid ${W.line}` }}>
        <button
          type="button"
          aria-label="更多"
          onClick={() => {
            setPlusOpen(v => !v);
            setEmojiOpen(false);
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: W.fill, color: W.ink, transform: plusOpen ? 'rotate(45deg)' : 'none', transition: 'transform .18s ease' }}
        >
          <WIco name="plus" size={17} />
        </button>

        <div className="flex h-[34px] min-w-0 flex-1 items-center px-3.5" style={{ borderRadius: R_PILL, background: W.fill }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') send();
            }}
            placeholder={`跟${charName}说点什么…`}
            aria-label="私聊输入框"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#909090]"
            style={{ color: W.ink }}
          />
        </div>

        <button
          type="button"
          aria-label="表情包"
          onClick={() => {
            setEmojiOpen(v => !v);
            setPlusOpen(false);
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ color: emojiOpen ? W.ink : W.sub }}
        >
          <WIco name="emoji" size={20} />
        </button>

        <button
          type="button"
          aria-label="发送"
          disabled={!draft.trim() || busy}
          onClick={send}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-35"
          style={{ background: W.ink, color: '#fff' }}
        >
          <WIco name="next" size={16} />
        </button>
      </div>

      {/* 长按菜单 */}
      {menuFor ? (() => {
        const target = menuFor;
        const isChar = target.from === 'char';
        const hasVoice = Boolean(target.voiceId || target.wantVoice);
        const items: Array<{ label: string; danger?: boolean; run: () => void }> = [];
        if (target.text || target.sticker || target.clip) {
          items.push({
            label: '引用',
            run: () =>
              setQuote({
                from: isChar ? 'char' : 'user',
                text: (target.text || target.sticker || target.clip?.speech || '').slice(0, 80),
              }),
          });
        }
        if (target.text) items.push({ label: '翻译', run: () => onTranslate(target) });
        if (target.text && isChar && voiceReady && !hasVoice) {
          items.push({ label: '转语音', run: () => onResendAsVoice(target) });
        }
        if (hasVoice && voiceReady) {
          items.push({ label: '播放语音', run: () => onPlayVoice(target) });
          items.push({ label: '语音下载', run: () => onDownloadVoice(target) });
        }
        if (target.text) {
          items.push({
            label: '复制',
            run: () => {
              if (target.text) void navigator.clipboard?.writeText(target.text).catch(() => undefined);
            },
          });
        }
        items.push({ label: '删除', danger: true, run: () => onDelete(target) });

        return (
          <div className="absolute inset-0 z-40 flex flex-col justify-end">
            <button type="button" aria-label="关闭菜单" onClick={() => setMenuFor(null)} className="absolute inset-0 bg-[rgba(15,15,15,0.16)]" />
            <div className="relative mx-auto mb-4 w-[210px] overflow-hidden bg-white" style={{ borderRadius: 14, boxShadow: '0 14px 40px rgba(0,0,0,.22)' }}>
              {items.map((item, i) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
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
        );
      })() : null}

      {/* 转账 */}
      <Sheet
        open={payOpen}
        title="转账"
        onClose={() => setPayOpen(false)}
        footer={<SolidButton onClick={sendPay} disabled={!Number(payAmount)}>转给{charName}</SolidButton>}
      >
        <div className="px-4 pb-2">
          <div className="mb-1 mt-2 text-[11.5px]" style={{ color: W.sub }}>
            金额
          </div>
          <div className="flex items-center gap-2 px-3" style={{ borderRadius: 12, background: W.fill, height: 46 }}>
            <span className="text-[18px] font-semibold" style={{ color: W.ink }}>
              ₩
            </span>
            <input
              value={payAmount}
              inputMode="numeric"
              onChange={e => setPayAmount(e.target.value.replace(/[^\d]/g, ''))}
              aria-label="转账金额"
              className="w-full bg-transparent text-[18px] font-semibold outline-none"
              style={{ color: W.ink }}
            />
          </div>
          <div className="mb-1 mt-4 text-[11.5px]" style={{ color: W.sub }}>
            留言
          </div>
          <div className="flex items-center px-3" style={{ borderRadius: 12, background: W.fill, height: 42 }}>
            <input
              value={payNote}
              onChange={e => setPayNote(e.target.value)}
              placeholder="不用写也行"
              aria-label="转账留言"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#909090]"
              style={{ color: W.ink }}
            />
          </div>
          <div className="mt-2 text-[10.5px] leading-[16px]" style={{ color: W.faint }}>
            这钱在本场里记着，她会在私聊里回应收不收。
          </div>
        </div>
      </Sheet>

      <style>{`
        @keyframes watchDot { 0%,100%{opacity:.28;transform:translateY(0)} 50%{opacity:1;transform:translateY(-2px)} }
        @keyframes watchWave { 0%,100%{transform:scaleY(.55)} 50%{transform:scaleY(1.15)} }
      `}</style>
    </div>
  );
}
