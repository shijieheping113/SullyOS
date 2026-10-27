/**
 * 陪看私聊（YouTube 私信的样子）。
 *
 * 上面是会话头，中间是两个人说话，下面是输入条。返回键回到直播间。
 * 表情包、引用、语音、转账、编辑、重来都在这儿。
 * 消息翻译不开自己的开关，只跟主聊天已经存的那一组键。
 *
 * 语音条用陪看自己的颜色和圆角。没开自动播放时点一下才合成；
 * 开了就自己念。合成中显示点点，长按可以「语音下载」。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import TokenImg from '../os/TokenImg';
import {
  Avatar,
  R_PILL,
  Sheet,
  SolidButton,
  W,
  WIco,
  timeAgo,
} from './chrome';
import type { APIConfig, Emoji, EmojiCategory } from '../../types';
import type {
  WatchAlongSession,
  WatchChatMessage,
  WatchQuote,
  WatchTransfer,
} from '../../utils/watchAlong/types';
import { shownWatchText, watchLineIsVoice } from '../../utils/watchAlong/voice';
import { normalizeTranslationLangLabel } from '../../utils/translationLang';

/** 主聊天按角色存的翻译开关。没有按角色的语言键时，看旧的全局键。 */
export function readChatTranslatePrefs(charId: string): {
  enabled: boolean;
  expanded: boolean;
  sourceLang: string;
  targetLang: string;
} {
  const flag = (key: string) => {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    try {
      return JSON.parse(raw || 'false') === true;
    } catch {
      return false;
    }
  };
  const lang = (perChar: string, legacy: string, fallback: string) =>
    normalizeTranslationLangLabel(localStorage.getItem(perChar) || localStorage.getItem(legacy) || fallback) || fallback;
  return {
    enabled: flag(`chat_translate_enabled_${charId}`),
    expanded: flag(`chat_translate_expanded_${charId}`),
    sourceLang: lang(`chat_translate_source_lang_${charId}`, 'chat_translate_source_lang', '日本語'),
    targetLang: lang(`chat_translate_lang_${charId}`, 'chat_translate_lang', '中文'),
  };
}

/** 一条消息里的两种语言：正文里的双语标记优先，否则用存好的译文 */
function splitWatchText(text?: string, translation?: string): { source: string; target: string } {
  const raw = text || '';
  const marker = '%%bilingual%%';
  const at = raw.toLowerCase().indexOf(marker);
  if (at !== -1) {
    return {
      source: raw.slice(0, at).trim(),
      target: raw.slice(at + marker.length).trim(),
    };
  }
  const tagged = raw.match(/<原文>([\s\S]*?)<\/原文>[\s\S]*?<译文>([\s\S]*?)<\/译文>/);
  if (tagged) return { source: tagged[1].trim(), target: tagged[2].trim() };
  return { source: raw.trim(), target: (translation || '').trim() };
}

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
  charId,
  charName,
  charAvatar,
  apiConfig,
  busy,
  emojis,
  categories,
  playingId,
  loadingId,
  voiceReady,
  onBack,
  onOpenDirector,
  onTrigger,
  onTogglePresence,
  onToggleAutoReact,
  onSend,
  onPlayVoice,
  onDownloadVoice,
  onEdit,
  onDelete,
  onRedo,
  onToggleVoiceReply,
  onResendAsVoice,
}: {
  session: WatchAlongSession;
  charId: string;
  charName: string;
  charAvatar?: string;
  apiConfig: APIConfig;
  /** 角色正在想（只有点了「触发」或「重来」才亮） */
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
  /** 手动触发：让角色接着往下说 */
  onTrigger: () => void;
  /** 同屏陪看 ↔ 仅后台私聊 */
  onTogglePresence: () => void;
  onToggleAutoReact: () => void;
  onSend: (payload: SendPayload) => void;
  onPlayVoice: (msg: WatchChatMessage) => void;
  onDownloadVoice: (msg: WatchChatMessage) => void;
  /** 改一条文字消息，写回本场记录 */
  onEdit: (msg: WatchChatMessage, text: string) => void;
  onDelete: (msg: WatchChatMessage) => void;
  /** 重新生成角色最近一次回复 */
  onRedo: () => void;
  onToggleVoiceReply: (on: boolean) => void;
  onResendAsVoice: (msg: WatchChatMessage) => void;
}) {
  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState<WatchQuote | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState<string>('all');
  /** 哪些语音条点了「转文字」 */
  const [trans, setTrans] = useState<Set<string>>(new Set());
  /** 开了翻译、没开同时展开时，哪些消息正显示译文 */
  const [showTarget, setShowTarget] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ msg: WatchChatMessage; top: number; left: number } | null>(null);
  const [editing, setEditing] = useState<WatchChatMessage | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('200');
  const [payNote, setPayNote] = useState('');
  const flowRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charHere = session.cast.presence !== 'solo';
  const voiceReply = session.cast.voiceReply === true;
  const hasCharReply = session.chat.some(m => m.from === 'char');
  const translatePrefs = useMemo(() => readChatTranslatePrefs(charId), [charId, session.chat.length]);
  const showLine = (raw?: string) => shownWatchText(raw, apiConfig);
  const flipTarget = (id: string) => {
    setShowTarget(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // 最后一条是不是我说的：用来提示「该触发了」
  const lastReal = [...session.chat].reverse().find(m => m.from === 'user' || m.from === 'char' || m.from === 'clip');
  const lastFromUser = lastReal?.from === 'user' || lastReal?.from === 'clip';

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

  const menuRows = (m: WatchChatMessage): number => {
    let n = 1;
    if (m.text || m.sticker || m.clip) n += 1;
    if ((m.from === 'user' || m.from === 'char') && m.text && !m.sticker && !m.clip) n += 1;
    const hasVoice = watchLineIsVoice(m.text, { wantVoice: m.wantVoice, voiceId: m.voiceId });
    if (m.text && m.from === 'char' && voiceReady && !hasVoice) n += 1;
    if (hasVoice && voiceReady) n += 2;
    if (m.text) n += 1;
    return n;
  };

  const startPress = (m: WatchChatMessage, el: HTMLElement) => {
    if (m.from === 'action') return;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      const page = root.getBoundingClientRect();
      const row = el.getBoundingClientRect();
      const menuW = 210;
      const menuH = menuRows(m) * 42;
      let top = row.bottom - page.top + 6;
      if (top + menuH > page.height - 8) top = row.top - page.top - menuH - 6;
      if (top < 8) top = 8;
      if (top + menuH > page.height - 8) top = Math.max(8, page.height - menuH - 8);
      let left = m.from === 'user' ? row.right - page.left - menuW : row.left - page.left;
      if (left + menuW > page.width - 8) left = Math.max(8, page.width - menuW - 8);
      if (left < 8) left = 8;
      setMenu({ msg: m, top, left });
    }, 420);
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
    <div ref={rootRef} className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: W.page }}>
      {/* 会话头 */}
      <div
        className="flex min-h-[50px] shrink-0 items-center gap-2 px-2"
        style={{ borderBottom: `1px solid ${W.line}`, paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
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
            {charHere
              ? (session.cast.presence === 'side'
                ? `一起看${session.room.streamerName} · 第 ${Math.max(1, session.beats.length)} 幕`
                : '只在私聊里')
              : '还没进来'}
          </div>
        </div>
        <button
          type="button"
          onClick={onTrigger}
          disabled={busy || !charHere}
          className="inline-flex h-[30px] shrink-0 items-center gap-1 px-3 text-[11.5px] font-medium text-white disabled:opacity-40"
          style={{ borderRadius: R_PILL, background: W.ink }}
        >
          <WIco name="send" size={12} />
          {busy ? '想着…' : '触发'}
        </button>
      </div>

      {/* 消息流 */}
      <div ref={flowRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2" style={NO_SELECT}>
        {session.chat.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] leading-[19px]" style={{ color: W.sub }}>
            {charHere ? `跟${charName}说点什么，或者把刚才那一幕转过去。` : `${charName}还没进来看，先把好笑的片段转发过去也行。`}
          </div>
        ) : null}

        {session.chat.map((m, i) => {
          const mine = m.from === 'user';
          const prev = session.chat[i - 1];
          // 上一条隔了五分钟以上才重新报一次时间（YouTube 私信就这样）
          const showTime = !prev || m.at - prev.at > 5 * 60_000;
          // 同一个人连着说，头像只留第一个
          const showAvatar = !mine && !(prev && prev.from === m.from);
          const stickerUrl = emojiUrl(m.sticker);
          const isVoice = watchLineIsVoice(m.text, { wantVoice: m.wantVoice, voiceId: m.voiceId });
          const mineQuote = m.quote;
          const sides = splitWatchText(m.text, m.translation);
          const sourceShown = showLine(sides.source);
          const targetShown = translatePrefs.enabled ? showLine(sides.target) : '';
          const hasTarget = Boolean(translatePrefs.enabled && targetShown);
          const bothLangs = hasTarget && translatePrefs.expanded;
          const showingTranslated = hasTarget && !bothLangs && showTarget.has(m.id);
          const bodyShown = showingTranslated ? targetShown : sourceShown;

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
                className="mb-2 flex justify-center"
                onPointerDown={e => startPress(m, e.currentTarget)}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onContextMenu={e => e.preventDefault()}
              >
                <div
                  className="w-[232px] overflow-hidden"
                  style={{ borderRadius: 16, background: W.fill }}
                >
                  <div className="flex items-center gap-1.5 px-3 pt-2 text-[10.5px]" style={{ color: W.faint }}>
                    <span style={{ color: W.red, fontWeight: 700 }}>片段</span>
                    第 {m.clip.beatIndex + 1} 幕 · {m.clip.streamerName}
                  </div>
                  <div className="px-3 pb-1 pt-1 text-[13px] leading-[19px]" style={{ color: W.ink }}>
                    {m.clip.scene}
                  </div>
                  {m.clip.speech ? (
                    <div className="px-3 pb-2 text-[13px] leading-[19px]" style={{ color: W.sub }}>
                      「{m.clip.speech}」
                    </div>
                  ) : null}
                  <div className="px-3 pb-2.5 text-[10.5px]" style={{ color: W.faint }}>
                    公屏 {m.clip.danmaku.length} 条
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} className={`mb-2 flex gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
              {!mine ? (
                showAvatar ? (
                  <Avatar src={charAvatar} name={charName} size={24} />
                ) : (
                  <span className="shrink-0" style={{ width: 24 }} />
                )
              ) : null}

              <div className={`flex min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ maxWidth: '78%' }}>
                {/* 表情包：不带气泡的大图 */}
                {m.sticker ? (
                  <button
                    type="button"
                    onPointerDown={e => startPress(m, e.currentTarget)}
                    onPointerUp={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={e => e.preventDefault()}
                    className="block overflow-hidden active:opacity-90"
                    style={{ borderRadius: 10, width: 56, height: 56, background: W.fill }}
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
                    onPointerDown={e => startPress(m, e.currentTarget)}
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
                      ¥ {m.transfer.amount}
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

                {/* 语音条：折叠的一条，点一下播放；下面「转文字」点了才展开念的字 */}
                {isVoice && !m.sticker ? (
                  <div className="flex max-w-full flex-col items-start gap-1">
                    <button
                      type="button"
                      disabled={!voiceReady || busy}
                      onPointerDown={e => startPress(m, e.currentTarget)}
                      onPointerUp={endPress}
                      onPointerCancel={endPress}
                      onContextMenu={e => e.preventDefault()}
                      onClick={() => {
                        if (!voiceReady) return;
                        onPlayVoice(m);
                      }}
                      className="block min-w-[96px] px-[13px] py-[9px] text-left active:opacity-90 disabled:opacity-60"
                      style={{ borderRadius: 16, background: bubbleColor(mine), color: textColor(mine) }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                          style={{ background: mine ? 'rgba(255,255,255,.18)' : 'rgba(15,15,15,.07)' }}
                        >
                          {loadingId === m.id ? (
                            <span className="flex items-center gap-[2px]">
                              {[0, 1, 2].map(i => (
                                <i
                                  key={i}
                                  className="block h-[3px] w-[3px] rounded-full"
                                  style={{
                                    background: 'currentColor',
                                    opacity: 0.55,
                                    animation: `watchDot 1s ${i * 0.16}s infinite ease-in-out`,
                                  }}
                                />
                              ))}
                            </span>
                          ) : (
                            <WIco name={playingId === m.id ? 'pause' : 'play'} size={10} />
                          )}
                        </span>
                        <span className="flex h-[14px] items-center gap-[2px]">
                          {[5, 9, 13, 7, 11, 15, 8, 12, 6].map((h, i) => (
                            <i
                              key={i}
                              className="block w-[2px] rounded-[1px]"
                              style={{
                                height: h,
                                background: 'currentColor',
                                opacity: playingId === m.id ? 0.95 : 0.62,
                                animation: playingId === m.id ? `watchWave .9s ${i * 0.07}s infinite ease-in-out` : undefined,
                              }}
                            />
                          ))}
                        </span>
                        <span className="text-[10.5px] tabular-nums opacity-60">
                          {sourceShown ? `${Math.max(2, Math.round(sourceShown.length / 4))}″` : '语音'}
                        </span>
                      </span>
                    </button>
                    {sourceShown || hasTarget ? (
                      <button
                        type="button"
                        onClick={() => setTrans(prev => {
                          const next = new Set(prev);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })}
                        className="ml-1 text-[10.5px]"
                        style={{ color: W.sub }}
                      >
                        {trans.has(m.id) ? '收起文字' : '转文字'}
                      </button>
                    ) : null}
                    {trans.has(m.id) && (bodyShown || (bothLangs && targetShown)) ? (
                      <div
                        className="max-w-[220px] px-2.5 py-2 text-[11.5px] leading-[17px]"
                        style={{ borderRadius: 10, background: mine ? 'rgba(15,15,15,.05)' : W.fill, color: W.ink }}
                      >
                        {bodyShown ? <span className="block whitespace-pre-wrap break-words">{bodyShown}</span> : null}
                        {bothLangs && targetShown ? (
                          <span
                            className="mt-1.5 block whitespace-pre-wrap break-words pt-1.5 text-[11px] leading-[16px]"
                            style={{ borderTop: '1px solid rgba(15,15,15,.10)', color: W.sub }}
                          >
                            {targetShown}
                          </span>
                        ) : null}
                        {hasTarget && !bothLangs ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              flipTarget(m.id);
                            }}
                            className="mt-1 block text-[10px]"
                            style={{ color: W.faint }}
                          >
                            译
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* 文字气泡 */}
                {!m.sticker && !isVoice && (bodyShown || (bothLangs && targetShown)) ? (
                  <div
                    onPointerDown={e => startPress(m, e.currentTarget)}
                    onPointerUp={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={e => e.preventDefault()}
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
                          {showLine(mineQuote.text)}
                        </span>
                      </span>
                    ) : null}
                    <span className="block whitespace-pre-wrap break-words text-[13px] leading-[19px]">{bodyShown}</span>
                    {bothLangs && targetShown ? (
                      <span
                        className="mt-1.5 block whitespace-pre-wrap break-words pt-1.5 text-[11.5px] leading-[17px]"
                        style={{
                          borderTop: `1px solid ${mine ? 'rgba(255,255,255,.18)' : 'rgba(15,15,15,.10)'}`,
                          color: mine ? 'rgba(255,255,255,.78)' : W.sub,
                        }}
                      >
                        {targetShown}
                      </span>
                    ) : null}
                    {hasTarget && !bothLangs ? (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          flipTarget(m.id);
                        }}
                        className="mt-1 block text-right text-[10px]"
                        style={{ color: mine ? 'rgba(255,255,255,.62)' : W.faint }}
                      >
                        译
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {showTime ? (
                  <span className="mt-[2px] px-1 text-[9px]" style={{ color: W.faint }}>
                    {timeAgo(m.at)}
                  </span>
                ) : null}
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

      {/* 发完了、还没触发：一句话提示（私聊是手动触发的） */}
      {charHere && !busy && lastFromUser ? (
        <div className="shrink-0 px-3 pb-1 text-center text-[10.5px]" style={{ color: W.faint }}>
          说完了就点右上角「触发」，{charName}才会回
        </div>
      ) : null}

      {/* 加号展开：只有几个圆钮，跟原型一样（指令类的东西都在导演里，不摆在这儿） */}
      {plusOpen ? (
        <div
          className="flex shrink-0 items-start justify-between gap-1 px-2 pb-2 pt-3.5"
          style={{ borderTop: `1px solid ${W.line}` }}
        >
          {[
            {
              key: 'voice',
              label: voiceReply ? '语音中' : '语音',
              icon: 'mic' as const,
              on: voiceReply,
              disabled: false,
              run: () => onToggleVoiceReply(!voiceReply),
            },
            { key: 'pay', label: '转账', icon: 'coin' as const, on: false, disabled: false, run: () => setPayOpen(true) },
            { key: 'director', label: '导演', icon: 'clap' as const, on: !!(session.stageCue || session.charCue), disabled: false, run: onOpenDirector },
            {
              key: 'presence',
              label: session.cast.presence === 'side' ? '一起看' : '后台',
              icon: 'people' as const,
              on: session.cast.presence === 'side',
              disabled: false,
              run: onTogglePresence,
            },
            {
              key: 'react',
              label: '自主',
              icon: 'chat' as const,
              on: session.cast.autoReact === true,
              disabled: false,
              run: onToggleAutoReact,
            },
            {
              key: 'redo',
              label: '重来',
              icon: 'rewrite' as const,
              on: false,
              disabled: !hasCharReply,
              run: () => onRedo(),
            },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.run();
              }}
              className="flex min-w-0 flex-1 flex-col items-center gap-[6px] disabled:opacity-35"
            >
              <span
                className="grid h-[44px] w-[44px] place-items-center rounded-full"
                style={
                  item.on
                    ? { background: W.ink, color: '#fff' }
                    : { background: W.fill, color: W.ink }
                }
              >
                <WIco name={item.icon} size={20} />
              </span>
              <span className="text-[10px]" style={{ color: W.sub }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* 表情面板 */}
      {emojiOpen ? (
        <div className="flex shrink-0 flex-col px-3 pb-2 pt-2" style={{ borderTop: `1px solid ${W.line}`, background: W.page }}>
          {categories.length > 1 ? (
            <div className="no-scrollbar mb-2 flex shrink-0 gap-2 overflow-x-auto">
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
            <div
              className="no-scrollbar grid shrink-0 grid-cols-5 gap-2 overflow-y-auto overscroll-contain"
              style={{ maxHeight: 228 }}
            >
              {shownEmojis.map((e, idx) => (
                <button
                  key={`${e.name}_${idx}`}
                  type="button"
                  onClick={() => sendSticker(e.name)}
                  className="flex min-w-0 flex-col items-center active:opacity-80"
                  style={{ borderRadius: 8, background: W.fill, padding: 4 }}
                  aria-label={e.name}
                >
                  <span className="block h-[44px] w-full overflow-hidden">
                    <TokenImg
                      value={e.url}
                      alt={e.name}
                      draggable={false}
                      className="pointer-events-none h-full w-full object-contain"
                    />
                  </span>
                  <span className="mt-0.5 w-full truncate text-center text-[9px] leading-tight" style={{ color: W.sub }}>
                    {e.name}
                  </span>
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
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              send();
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
          <WIco name="send" size={15} />
        </button>
      </div>

      {/* 长按菜单 */}
      {menu ? (() => {
        const target = menu.msg;
        const isChar = target.from === 'char';
        const hasVoice = watchLineIsVoice(target.text, { wantVoice: target.wantVoice, voiceId: target.voiceId });
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
        if ((target.from === 'user' || target.from === 'char') && target.text && !target.sticker && !target.clip) {
          items.push({
            label: '编辑',
            run: () => {
              setEditing(target);
              setEditDraft(target.text || '');
            },
          });
        }
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
              const text = showLine(splitWatchText(target.text).source);
              if (text) void navigator.clipboard?.writeText(text).catch(() => undefined);
            },
          });
        }
        items.push({ label: '删除', danger: true, run: () => onDelete(target) });

        return (
          <div className="absolute inset-0 z-40">
            <button type="button" aria-label="关闭菜单" onClick={() => setMenu(null)} className="absolute inset-0 bg-[rgba(15,15,15,0.16)]" />
            <div
              className="absolute w-[210px] overflow-hidden bg-white"
              style={{ top: menu.top, left: menu.left, borderRadius: 14, boxShadow: '0 14px 40px rgba(0,0,0,.22)' }}
            >
              {items.map((item, i) => (
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
        );
      })() : null}

      {/* 改一条文字 */}
      <Sheet
        open={Boolean(editing)}
        title="改这句"
        onClose={() => setEditing(null)}
        footer={
          <SolidButton
            disabled={!editDraft.trim()}
            onClick={() => {
              const target = editing;
              const next = editDraft.trim();
              setEditing(null);
              if (target && next) onEdit(target, next);
            }}
          >
            记下
          </SolidButton>
        }
      >
        <div className="px-4 pb-2">
          <div className="mt-2 flex px-3 py-2.5" style={{ borderRadius: 12, background: W.fill }}>
            <textarea
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              rows={4}
              aria-label="消息内容"
              className="w-full resize-none bg-transparent text-[13px] leading-[19px] outline-none"
              style={{ color: W.ink }}
            />
          </div>
        </div>
      </Sheet>

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
              ¥
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
            这钱在本场里记着，{charName}会在私聊里回应收不收。
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
