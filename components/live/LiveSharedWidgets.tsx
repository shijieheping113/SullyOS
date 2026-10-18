/**
 * 电波 (OnAir) —— 核心共享组件：
 * 1. LiveFloatingPhone：100% 复用家园同款 <Chat homePhone={...} /> 真·小手机私聊浮窗（完全对齐主聊天，文字无语音按钮）
 * 2. BeatLongPressSheet & createLongPressHandlers：长按操作菜单（收起播放语音、重新生成语音、下载音频、编辑本拍、重Roll、转发切片）
 * 3. FloatingDanmakuOverlay：严格限定在画面上半区（10%~46%）的无底色横滚飘屏弹幕（绝不遮挡文字与按键）
 * 4. SuperChatTickerBar & SuperChatHighlightCard：YouTube Live 标准付费醒目留言组件
 */
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import type { HomePhoneChatProps } from '../../apps/Chat';
import { CHAT_GEN_EVENTS, registerEmbeddedChatView } from '../../utils/chatGenEvents';
import {
  AMSG_INSTANT_CHAT_PENDING_EVENT,
  AMSG_INSTANT_CHAT_PENDING_LS_KEY,
  getInstantChatPending,
} from '../../utils/amsgInstantChat';
import {
  LiveDanmakuItem,
  LivePlatformTheme,
  SC_TIER_OPTIONS,
} from '../../utils/liveStreamTypes';
import '../../apps/room3d/homePhone.css';

const Chat = lazy(() => import('../../apps/Chat'));

// ==================== 1. 家园同款「真·小手机私聊浮窗」 ====================

function EmbeddedPhoneMessages({ homePhone }: { homePhone: HomePhoneChatProps }) {
  const { characters } = useOS();
  return characters.some(c => c.id === homePhone.characterId) ? (
    <Chat homePhone={homePhone} />
  ) : (
    <p className="home-phone-loading" role="status">
      正在连接私聊窗口…
    </p>
  );
}

interface LiveFloatingPhoneProps {
  isOpen: boolean;
  characterId: string;
  charName: string;
  contextDescription: string;
  onClose: () => void;
  onUnreadChange?: (unread: boolean) => void;
}

export const LiveFloatingPhone: React.FC<LiveFloatingPhoneProps> = ({
  isOpen,
  characterId,
  contextDescription,
  onClose,
  onUnreadChange,
}) => {
  const [unread, setUnread] = useState(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const contextRef = useRef(contextDescription);
  contextRef.current = contextDescription;

  useEffect(() => {
    if (isOpen) {
      setUnread(false);
      onUnreadChange?.(false);
      return registerEmbeddedChatView(characterId);
    }
  }, [isOpen, characterId, onUnreadChange]);

  useEffect(() => {
    const matches = (event: Event) => (event as CustomEvent).detail?.charId === characterId;
    const arrived = (e: Event) => {
      if (!matches(e)) return;
      if (!isOpenRef.current) {
        setUnread(true);
        onUnreadChange?.(true);
      }
    };
    window.addEventListener(CHAT_GEN_EVENTS.replyArrived, arrived);
    window.addEventListener('active-msg-received', arrived);
    window.addEventListener(AMSG_INSTANT_CHAT_PENDING_EVENT, arrived);
    const onStorage = (e: StorageEvent) => {
      if (e.key === AMSG_INSTANT_CHAT_PENDING_LS_KEY && getInstantChatPending(characterId) && !isOpenRef.current) {
        setUnread(true);
        onUnreadChange?.(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHAT_GEN_EVENTS.replyArrived, arrived);
      window.removeEventListener('active-msg-received', arrived);
      window.removeEventListener(AMSG_INSTANT_CHAT_PENDING_EVENT, arrived);
      window.removeEventListener('storage', onStorage);
    };
  }, [characterId, onUnreadChange]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/30 backdrop-blur-[1px] flex items-end justify-end p-2.5 sm:p-4"
      onClick={onClose}
    >
      <section
        className="home-phone"
        style={{
          position: 'relative',
          right: 'auto',
          bottom: 'auto',
          width: 'min(368px, calc(100vw - 20px))',
          height: 'min(620px, 82vh)',
          zIndex: 125,
          padding: 0,
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '24px',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.22)',
          overflow: 'hidden',
          color: '#0f172a',
        }}
        role="dialog"
        aria-label="私聊悬浮窗"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-11 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-bold text-slate-800 truncate">
              私聊小窗（与主聊天实时同步）
            </span>
          </div>
          <button
            type="button"
            aria-label="关闭私聊小窗"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0"
          >
            ✕
          </button>
        </div>

        <div
          className="home-phone-screen"
          style={{
            borderRadius: 0,
            background: '#f8fafc',
          }}
        >
          <Suspense
            fallback={
              <p className="home-phone-loading" role="status">
                正在打开私聊窗口…
              </p>
            }
          >
            <EmbeddedPhoneMessages
              homePhone={{
                characterId,
                onBack: onClose,
                getContext: () => contextRef.current,
              }}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
};

// ==================== 2. 长按手势绑定辅助 & 底部长按操作菜单 ====================

export interface BeatActionSheetTarget {
  title: string;
  screen: string;
  speechOriginal: string;
  speechTranslated?: string;
  audioUrl?: string;
  canPlayVoice?: boolean;
  canEdit?: boolean;
  canRerollChunk?: boolean;
  canShareClip?: boolean;
  onPlayVoice?: () => void;
  onRetryVoice?: () => void;
  onDownloadVoice?: () => void;
  onSaveEdit?: (nextScreen: string, nextSpeech: string, nextTranslated?: string) => void;
  onRerollChunk?: () => void;
  onShareClip?: () => void;
}

/**
 * 生成对齐主聊天 MessageItem 的 500ms 长按手势属性（带 10px 移动容差，防止滚动误触）
 */
export function useLongPressMenu() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const bindLongPress = (onTrigger: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      triggeredRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        try {
          navigator.vibrate?.(18);
        } catch {}
        onTrigger();
      }, 480);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!startPosRef.current || !timerRef.current) return;
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      if (dx > 10 || dy > 10) {
        clearTimer();
      }
    },
    onPointerUp: clearTimer,
    onPointerCancel: clearTimer,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clearTimer();
      onTrigger();
    },
  });

  return { bindLongPress, wasLongPressTriggered: () => triggeredRef.current };
}

interface BeatLongPressSheetProps {
  target: BeatActionSheetTarget | null;
  ttsLoading?: boolean;
  onClose: () => void;
}

export const BeatLongPressSheet: React.FC<BeatLongPressSheetProps> = ({
  target,
  ttsLoading,
  onClose,
}) => {
  const [editing, setEditing] = useState(false);
  const [screenDraft, setScreenDraft] = useState('');
  const [speechDraft, setSpeechDraft] = useState('');
  const [transDraft, setTransDraft] = useState('');

  useEffect(() => {
    if (target) {
      setEditing(false);
      setScreenDraft(target.screen || '');
      setSpeechDraft(target.speechOriginal || '');
      setTransDraft(target.speechTranslated || '');
    }
  }, [target]);

  if (!target) return null;

  const hasSpeech = Boolean(target.speechOriginal?.trim());

  return (
    <div
      className="absolute inset-0 z-[90] bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部拖拽指示条 */}
        <div className="pt-3 pb-2 px-5 flex items-center justify-between border-b border-slate-100">
          <div className="min-w-0 flex-1 pr-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {editing ? '编辑当前分镜与台词' : target.title}
            </div>
            {!editing && (
              <div className="text-sm font-semibold text-slate-800 truncate mt-0.5">
                {target.speechOriginal || target.screen}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold shrink-0"
          >
            ✕
          </button>
        </div>

        {editing ? (
          <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                🎥 镜头画面与动作描写
              </label>
              <textarea
                value={screenDraft}
                onChange={e => setScreenDraft(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 leading-relaxed focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                🎙️ 主播原声台词（留空代表专注动作不说话）
              </label>
              <textarea
                value={speechDraft}
                onChange={e => setSpeechDraft(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-900 font-medium leading-relaxed focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                🌐 中文同传翻译（选填）
              </label>
              <input
                value={transDraft}
                onChange={e => setTransDraft(e.target.value)}
                placeholder="外语直播时的中文译文…"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold"
              >
                返回菜单
              </button>
              <button
                type="button"
                onClick={() => {
                  target.onSaveEdit?.(
                    screenDraft.trim(),
                    speechDraft.trim(),
                    transDraft.trim() || undefined,
                  );
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold"
              >
                保存修改
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-1.5 pb-6">
            {hasSpeech && target.onPlayVoice && (
              <button
                type="button"
                onClick={() => {
                  target.onPlayVoice?.();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 text-left transition"
              >
                <span className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center text-base shrink-0">
                  🔊
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">
                    {ttsLoading ? '正在合成语音…' : '播放这句语音'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {target.audioUrl ? '已缓存音频，点击直接秒播' : '调用角色 TTS 朗读该句台词'}
                  </div>
                </div>
              </button>
            )}

            {hasSpeech && target.onRetryVoice && (
              <button
                type="button"
                onClick={() => {
                  target.onRetryVoice?.();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 text-left transition"
              >
                <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-base shrink-0">
                  🔄
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">重新生成语音</div>
                  <div className="text-xs text-slate-500">跳过本地缓存，重新请求合成这句语音</div>
                </div>
              </button>
            )}

            {hasSpeech && target.onDownloadVoice && (
              <button
                type="button"
                onClick={() => {
                  target.onDownloadVoice?.();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 text-left transition"
              >
                <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-base shrink-0">
                  ⬇️
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">下载语音音频 (.mp3)</div>
                  <div className="text-xs text-slate-500">
                    {target.audioUrl ? '直接保存当前语音文件到本地' : '合成后自动保存到本地'}
                  </div>
                </div>
              </button>
            )}

            {target.canEdit && target.onSaveEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 text-left transition"
              >
                <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-base shrink-0">
                  ✏️
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">编辑画面与台词</div>
                  <div className="text-xs text-slate-500">修改本拍镜头描写、原声台词或同传翻译</div>
                </div>
              </button>
            )}

            {target.canRerollChunk && target.onRerollChunk && (
              <button
                type="button"
                onClick={() => {
                  target.onRerollChunk?.();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 text-left transition"
              >
                <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center text-base shrink-0">
                  🎲
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">重 Roll 本段直播走向</div>
                  <div className="text-xs text-slate-500">推翻当前切片，让主播换一个全新的反应与话题</div>
                </div>
              </button>
            )}

            {target.canShareClip && target.onShareClip && (
              <button
                type="button"
                onClick={() => {
                  target.onShareClip?.();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 text-left transition"
              >
                <span className="w-9 h-9 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center text-base shrink-0">
                  📤
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">转发高能切片到私聊</div>
                  <div className="text-xs text-slate-500">将这一幕做成切片卡片发进主聊天</div>
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== 3. 严格限定在画面上半区的无底色横滚飘屏弹幕 ====================

interface FloatingDanmakuOverlayProps {
  danmakuList: LiveDanmakuItem[];
  showTranslation?: boolean;
  visible?: boolean;
  platformTheme?: LivePlatformTheme;
}

export const FloatingDanmakuOverlay: React.FC<FloatingDanmakuOverlayProps> = ({
  danmakuList,
  showTranslation = true,
  visible = true,
  platformTheme = 'youtube',
}) => {
  if (!visible || !danmakuList || danmakuList.length === 0) return null;

  // 只走画面最上沿，字号收小，下面留给台词。
  const items = danmakuList.slice(-4);
  const trackTops = ['0px', '16px'];

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-1 h-8 overflow-hidden select-none"
      style={{ zIndex: 12, containerType: 'inline-size' }}
    >
      <style>{`
        @keyframes onAirDanmakuFlow {
          0% { transform: translate3d(100cqw, 0, 0); }
          100% { transform: translate3d(-100%, 0, 0); }
        }
      `}</style>
      {items.map((dm, idx) => {
        const top = trackTops[idx % trackTops.length];
        const duration = 9 + (idx % 3) * 1.6;
        const delay = (idx % 3) * 1.1;
        const isSc = Boolean(dm.scAmount && dm.scAmount > 0);
        const isGift = Boolean(dm.giftName);
        const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
        const cleanTrans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';

        return (
          <div
            key={dm.id || `${idx}_${dm.text}`}
            className="danmaku-fly"
            style={{
              position: 'absolute',
              top,
              left: 0,
              width: 'max-content',
              whiteSpace: 'nowrap',
              animation: `onAirDanmakuFlow ${duration}s linear ${delay}s infinite`,
              willChange: 'transform',
            }}
          >
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                platformTheme === 'niconico' ? 'text-[12px]' : 'text-[11px]'
              } ${
                isSc
                  ? 'text-amber-300'
                  : isGift
                  ? 'text-pink-200'
                  : isMine
                  ? 'text-emerald-200 underline decoration-2 underline-offset-4'
                  : 'text-white'
              }`}
              style={{
                textShadow:
                  platformTheme === 'niconico'
                    ? '1.5px 1.5px 0 #000, -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 0 2px 4px rgba(0,0,0,0.65)'
                    : '0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.65)',
              }}
            >
              {isSc && <span>[¥{dm.scAmount}]</span>}
              {isGift && <span>[{dm.giftEmoji || '🎁'}{dm.giftName}]</span>}
              <span>{dm.text}</span>
              {showTranslation && cleanTrans && cleanTrans !== dm.text && (
                <span className="text-[11px] font-medium text-sky-200">
                  （{cleanTrans}）
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ==================== 4. YouTube Live 顶部 Super Chat 色卡长驻栏 & 高亮卡片 ====================

export const SuperChatTickerBar: React.FC<{
  scList: LiveDanmakuItem[];
  showTranslation?: boolean;
}> = ({ scList, showTranslation = true }) => {
  const [selectedSc, setSelectedSc] = useState<LiveDanmakuItem | null>(null);

  if (!scList || scList.length === 0) return null;

  return (
    <div className="bg-white border-b border-slate-200 px-3 py-1.5 shrink-0">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {scList.slice(-10).reverse().map(sc => {
          const tier =
            SC_TIER_OPTIONS.slice().reverse().find(t => (sc.scAmount || 0) >= t.amount) ||
            SC_TIER_OPTIONS[0];
          const isSelected = selectedSc?.id === sc.id;
          return (
            <button
              type="button"
              key={sc.id}
              onClick={() => setSelectedSc(isSelected ? null : sc)}
              style={{ backgroundColor: tier.headerBg, color: '#fff' }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 shadow-sm transition ${
                isSelected ? 'ring-2 ring-offset-1 ring-slate-900' : ' opacity-95 hover:opacity-100'
              }`}
            >
              <span>{sc.senderName.slice(0, 10)}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/25 text-[11px]">
                ¥{sc.scAmount}
              </span>
            </button>
          );
        })}
      </div>

      {selectedSc && (
        <div className="mt-1.5">
          <SuperChatHighlightCard item={selectedSc} showTranslation={showTranslation} />
        </div>
      )}
    </div>
  );
};

export const SuperChatHighlightCard: React.FC<{
  item: LiveDanmakuItem;
  showTranslation?: boolean;
}> = ({ item, showTranslation = true }) => {
  const tier =
    SC_TIER_OPTIONS.slice().reverse().find(t => (item.scAmount || 0) >= t.amount) ||
    SC_TIER_OPTIONS[0];
  const cleanTrans = item.translation ? item.translation.replace(/^译[：:]\s*/, '').trim() : '';

  return (
    <div className="rounded-xl overflow-hidden shadow-sm border border-black/10 my-1.5">
      <div
        style={{ backgroundColor: tier.headerBg, color: '#ffffff' }}
        className="px-3 py-1.5 flex items-center justify-between text-xs font-bold"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[11px] shrink-0">
            {item.senderName.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{item.senderName}</span>
          {item.fanBadge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/25 shrink-0">
              {item.fanBadge}
            </span>
          )}
        </div>
        <div className="shrink-0 font-extrabold">¥{item.scAmount}</div>
      </div>

      <div
        style={{ backgroundColor: tier.bodyBg, color: tier.textColor }}
        className="px-3 py-2 text-xs font-semibold leading-relaxed break-words"
      >
        <div>{item.text}</div>
        {showTranslation && cleanTrans && cleanTrans !== item.text && (
          <div className="mt-1 pt-1 border-t border-black/10 text-[11px] opacity-90">
            {cleanTrans}
          </div>
        )}
      </div>
    </div>
  );
};
