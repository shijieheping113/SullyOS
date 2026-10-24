/**
 * 电波 (OnAir) —— 核心共享组件：
 * 1. LiveFloatingPhone：100% 复用家园同款 <Chat homePhone={...} /> 真·小手机私聊浮窗（完全对齐主聊天，文字无语音按钮）
 * 2. BeatLongPressSheet & createLongPressHandlers：长按操作菜单（收起播放语音、重新生成语音、下载音频、编辑本拍、重Roll、转发切片）
 * 3. FloatingDanmakuOverlay：严格限定在画面上半区（10%~46%）的无底色横滚飘屏弹幕（绝不遮挡文字与按键）
 * 4. SuperChatTickerBar & SuperChatHighlightCard：YouTube Live 标准付费醒目留言组件
 */
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  SC_GOLD_BORDER,
  resolveScTier,
} from '../../utils/liveStreamTypes';
import { getLiveDanmakuComment } from '../../utils/liveStreamTimeline';
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
  /** 可选：不传就完全不加任何场景说明，走普通私聊上下文 */
  contextDescription?: string;
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
  // 电波四个入口都不再注入场景说明：没有就是空串，Chat 请求里不会拼出占位文案
  const contextRef = useRef<string>(contextDescription || '');
  contextRef.current = contextDescription || '';

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

  // 用 portal 挂到 body：直播间的祖先节点若带 transform/filter，会让 position:fixed 的浮窗
  // 被当成相对祖先定位，背景跟着错位、看起来像镜像。挂到 body 后彻底不受影响。
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-end p-2.5 sm:p-4"
      style={{ background: 'rgba(15, 23, 42, 0.42)' }}
      onClick={onClose}
    >
      <section
        className="home-phone"
        style={{
          position: 'relative',
          right: 'auto',
          bottom: 'auto',
          width: 'min(430px, calc(100vw - 16px))',
          height: 'min(780px, 92vh)',
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
                emojiPickerEnabled: true,
              }}
            />
          </Suspense>
        </div>
      </section>
    </div>,
    document.body,
  );
};

// ==================== 2. 长按手势绑定辅助 & 底部长按操作菜单 ====================

export interface BeatActionSheetTarget {
  title: string;
  beatId?: string;
  screen: string;
  speechOriginal: string;
  speechTranslated?: string;
  /** 带语音表演标注的念稿版（只给 TTS 用）；空 = 还没标注 */
  speechPerform?: string;
  audioUrl?: string;
  canPlayVoice?: boolean;
  canEdit?: boolean;
  canRerollChunk?: boolean;
  canShareClip?: boolean;
  onPlayVoice?: () => void;
  onRetryVoice?: () => void;
  onDownloadVoice?: () => void;
  onSaveEdit?: (nextScreen: string, nextSpeech: string, nextTranslated?: string) => void;
  /** 保存手动改的语音标注；传了才会出现标注编辑框 */
  onSavePerform?: (nextPerform: string) => void;
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
  /** 只移动正在播的这一条录音。没传时菜单不出现这一行，点播和陪看保持原样。 */
  onNudgeVoice?: (deltaSec: number) => void;
  voiceSeekEnabled?: boolean;
}

export const BeatLongPressSheet: React.FC<BeatLongPressSheetProps> = ({
  target,
  ttsLoading,
  onClose,
  onNudgeVoice,
  voiceSeekEnabled = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [screenDraft, setScreenDraft] = useState('');
  const [speechDraft, setSpeechDraft] = useState('');
  const [transDraft, setTransDraft] = useState('');
  const [performDraft, setPerformDraft] = useState('');
  // 编辑区默认只显示一个台词框：有语音标注默认显示标注，没有就显示原文；小字切换
  const [performMode, setPerformMode] = useState(false);
  const [seekStep, setSeekStep] = useState(0.5);

  useEffect(() => {
    if (target) {
      setEditing(false);
      setScreenDraft(target.screen || '');
      setSpeechDraft(target.speechOriginal || '');
      setTransDraft(target.speechTranslated || '');
      setPerformDraft(target.speechPerform || '');
      setPerformMode(Boolean(target.speechPerform));
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
            {hasSpeech && target.onSavePerform ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600">
                    {performMode
                      ? '🎭 语音标注（念稿版，只影响听感）'
                      : '🎙️ 主播原声台词（留空代表专注动作不说话）'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setPerformMode(v => !v)}
                    className="text-[11px] font-semibold text-slate-500 underline underline-offset-2 shrink-0 pl-2"
                  >
                    {performMode ? '切到原声台词' : '切到语音标注'}
                  </button>
                </div>
                {performMode ? (
                  <textarea
                    value={performDraft}
                    onChange={e => setPerformDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 leading-relaxed focus:outline-none focus:border-red-500"
                  />
                ) : (
                  <textarea
                    value={speechDraft}
                    onChange={e => setSpeechDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-900 font-medium leading-relaxed focus:outline-none focus:border-red-500"
                  />
                )}
                {performMode && (
                  <div className="text-[11px] text-slate-400 mt-1">
                    画面台词、时间轴同步都走原声台词，标注只给语音合成用。
                  </div>
                )}
              </div>
            ) : (
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
            )}
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
                  if (target.onSavePerform) {
                    target.onSavePerform(performDraft.trim());
                  }
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
            {onNudgeVoice && (
              <div className="px-4 py-3 rounded-2xl bg-slate-50">
                <div className="text-sm font-bold text-slate-900">微调这一次播放</div>
                <div className="text-xs text-slate-500 mt-0.5">只移动正在播的这一条，不改别的拍</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-600 shrink-0">每次</span>
                  <input
                    type="number"
                    min={0.05}
                    step={0.1}
                    value={seekStep}
                    aria-label="每次移动的秒数"
                    onChange={event => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next > 0) setSeekStep(next);
                    }}
                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                  />
                  <span className="text-xs text-slate-500">秒</span>
                  <button
                    type="button"
                    disabled={!voiceSeekEnabled}
                    onClick={() => onNudgeVoice(-Math.abs(seekStep))}
                    className="h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 disabled:opacity-40"
                  >
                    后退
                  </button>
                  <button
                    type="button"
                    disabled={!voiceSeekEnabled}
                    onClick={() => onNudgeVoice(Math.abs(seekStep))}
                    className="h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 disabled:opacity-40"
                  >
                    前进
                  </button>
                </div>
              </div>
            )}

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

// ==================== 3. 真实多轨防截断横滚飘屏弹幕（YouTube 轻飘屏 / ニコニコ 多轨立体描边弹幕） ====================

interface FloatingDanmakuOverlayProps {
  danmakuList: LiveDanmakuItem[];
  showTranslation?: boolean;
  visible?: boolean;
  platformTheme?: LivePlatformTheme;
  /** 可用行数（小窗建议 3，全屏 4~5）；行数越多越像真实弹幕墙 */
  tracks?: number;
}

const GIFT_DANMAKU_ICON =
  'M22 12v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8h20zM2 7h3.2l-.9-1.7A1.5 1.5 0 1 1 7 3.7L9.1 7h5.8L17 3.7a1.5 1.5 0 1 1 2.7 1.6L18.8 7H22v3H2V7zm9 13V12H4v8h7zm2 0h7v-8h-7v8z';

export const FloatingDanmakuOverlay: React.FC<FloatingDanmakuOverlayProps> = ({
  danmakuList,
  showTranslation = true,
  visible = true,
  platformTheme = 'youtube',
  tracks = 3,
}) => {
  if (!visible || !danmakuList || danmakuList.length === 0) return null;

  const isNico = platformTheme === 'niconico';
  // YouTube：两行道、间距拉开；本拍弹幕循环飘，不挤在一起
  const rowCount = isNico ? Math.max(1, Math.min(5, tracks)) : Math.max(1, Math.min(2, tracks));
  const rowTops = isNico
    ? Array.from({ length: rowCount }, (_, i) => `${i * 21}px`)
    : Array.from({ length: rowCount }, (_, i) => `${2 + i * 44}px`);
  const laneHeight = isNico ? rowCount * 21 : 92;

  const estimateWidth = (text: string) => {
    let w = 0;
    for (const ch of text) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 13 : 7.5;
    return w;
  };
  const seedOf = (key: string) => {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  };

  const ordered = danmakuList.map((dm, idx) => ({ dm, idx }));

  // 按「这一行什么时候空出来」排班，避免一堆叠在左边；YouTube 循环时也要先藏在屏外
  const rowFreeAt = Array.from({ length: rowCount }, () => 0);
  let lastStart = -0.55;
  const items = ordered.map(({ dm, idx }) => {
    const cleanTrans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
    const comment = getLiveDanmakuComment(dm);
    const isSc = Boolean(dm.scAmount && dm.scAmount > 0);
    const isGift = Boolean(dm.giftName);
    const giftLabel = dm.giftName
      ? `${dm.giftName}${dm.giftCount && dm.giftCount > 1 ? ` ×${dm.giftCount}` : ' ×1'}`
      : '';
    const bodyText = isGift ? giftLabel || comment : comment || dm.text || '';
    const transShown = showTranslation && cleanTrans && cleanTrans !== bodyText ? cleanTrans : '';
    const full = `${isSc ? `¥${dm.scAmount} ` : ''}${
      estimateWidth(transShown) > estimateWidth(bodyText) ? transShown : bodyText
    }`;
    const duration = Math.max(isNico ? 6.5 : 12, (460 + estimateWidth(full)) / (isNico ? 52 : 40));
    const seed = seedOf(dm.id || `${idx}_${dm.text}`);
    let row = 0;
    for (let i = 1; i < rowCount; i++) {
      if (rowFreeAt[i] < rowFreeAt[row] - 0.001) row = i;
    }
    const gap = isNico ? 0.28 + seed * 0.5 : 1.35 + seed * 0.7;
    const start = Math.max(rowFreeAt[row], lastStart + gap);
    // 上一趟滚完约一半再发下一趟，循环时也不会挤成一团
    rowFreeAt[row] = start + duration * (isNico ? 0.62 : 0.48);
    lastStart = start;
    const scTier = isSc ? resolveScTier(dm.scAmount, dm.scColor) : null;
    return {
      dm,
      idx,
      row,
      delay: start,
      duration,
      cleanTrans,
      comment,
      bodyText,
      isSc,
      isGift,
      scTier,
    };
  });

  const bilingual = (main: string, trans: string) => {
    if (!showTranslation || !trans || trans === main) {
      return <span className="onair-dm__jp">{main}</span>;
    }
    return (
      <span className="onair-dm__stack">
        <span className="onair-dm__jp">{main}</span>
        <span className="onair-dm__zh">{trans}</span>
      </span>
    );
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 select-none overflow-hidden"
      style={{ zIndex: 15, height: laneHeight, containerType: 'inline-size' }}
    >
      <style>{`
        @keyframes onAirDanmakuFlow {
          0% { transform: translate3d(100cqw, 0, 0); }
          100% { transform: translate3d(-105%, 0, 0); }
        }
        .onair-dm {
          position: absolute;
          left: 0;
          /* 动画开始前也停在屏外，避免 delay 期间卡在左边 */
          transform: translate3d(100cqw, 0, 0);
          display: inline-flex;
          align-items: center;
          gap: 3px;
          max-width: none;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.15;
          will-change: transform;
          backface-visibility: hidden;
        }
        /* 普通文字：保持旧版描边字，不改成白字黑影 */
        .onair-dm--plain {
          color: #1e293b;
          -webkit-text-stroke: 2px rgba(255, 255, 255, 0.72);
          paint-order: stroke fill;
        }
        .onair-dm--plain.is-mine { color: #047857; }
        .onair-dm__stack {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
          min-width: 0;
        }
        .onair-dm__zh {
          display: block;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.15;
          opacity: 0.92;
        }
        .onair-dm--plain .onair-dm__zh {
          font-weight: 650;
          opacity: 1;
        }
        .onair-dm--sc {
          height: auto;
          min-height: 28px;
          padding: 3px 10px 3px 3px;
          border-radius: 14px;
          text-shadow: none;
          -webkit-text-stroke: 0;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
        }
        /* 色值与 SC_TIER_OPTIONS.bodyBg 对齐；实际渲染用 inline 再盖一层防漂移 */
        .onair-dm--sc.is-green { background: #43a047; color: #fff; }
        .onair-dm--sc.is-yellow { background: #ffc928; color: #3e2723; }
        .onair-dm--sc.is-orange { background: #ff9800; color: #fff; }
        .onair-dm--sc.is-purple { background: #8e24aa; color: #fff; }
        .onair-dm--sc.is-red { background: #e53935; color: #fff; }
        .onair-dm__amt {
          display: inline-flex;
          align-items: center;
          height: 22px;
          padding: 0 7px;
          border-radius: 11px;
          background: rgba(0, 0, 0, 0.14);
          font-variant-numeric: tabular-nums;
        }
        .onair-dm--sc.is-green .onair-dm__amt,
        .onair-dm--sc.is-orange .onair-dm__amt,
        .onair-dm--sc.is-purple .onair-dm__amt,
        .onair-dm--sc.is-red .onair-dm__amt {
          background: rgba(0, 0, 0, 0.22);
        }
        .onair-dm--sc.is-yellow .onair-dm__amt {
          background: rgba(0, 0, 0, 0.12);
        }
        .onair-dm__body {
          max-width: none;
          overflow: visible;
          white-space: nowrap;
        }
        .onair-dm--gift {
          height: auto;
          min-height: 28px;
          padding: 3px 10px 3px 6px;
          border-radius: 14px;
          background: #8e24aa;
          color: #fff;
          text-shadow: none;
          -webkit-text-stroke: 0;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
        }
        .onair-dm__ico {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
          fill: currentColor;
        }
        .onair-dm--nico {
          font-size: 12.5px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #1e293b;
          text-shadow: none;
          -webkit-text-stroke: 2px rgba(255, 255, 255, 0.72);
          paint-order: stroke fill;
        }
        .onair-dm--nico.is-mine {
          color: #0066cc;
          text-decoration: underline;
          text-underline-offset: 2px;
          text-decoration-color: #0080ff;
        }
        .onair-dm--nico.is-sc { color: #b45309; }
        .onair-dm--nico.is-gift { color: #be185d; }
        .onair-dm--nico .onair-dm__badge {
          display: inline-flex;
          align-items: center;
          padding: 1px 6px;
          border-radius: 4px;
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          -webkit-text-stroke: 0;
        }
        .onair-dm--nico .onair-dm__badge--sc { background: #f59e0b; }
        .onair-dm--nico .onair-dm__badge--gift { background: #ec4899; }
      `}</style>
      {items.map(({ dm, idx, row, delay, duration, cleanTrans, comment, bodyText, isSc, isGift, scTier }) => {
        const top = rowTops[row];
        const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
        // both：delay 期间保持 0%（屏外）；infinite 循环时也不会闪回 left:0
        const anim = {
          top,
          animation: `onAirDanmakuFlow ${duration}s linear ${delay}s ${
            isNico ? '1 both' : 'infinite both'
          }`,
        } as React.CSSProperties;

        if (!isNico && isSc && scTier) {
          return (
            <div
              key={dm.id || `${idx}_${dm.text}`}
              className={`onair-dm onair-dm--sc is-${scTier.color}`}
              style={{
                ...anim,
                background: scTier.bodyBg,
                color: scTier.textColor,
                boxShadow: scTier.goldBorder
                  ? `inset 0 0 0 2px ${SC_GOLD_BORDER}, 0 2px 6px rgba(0, 0, 0, 0.28)`
                  : undefined,
              }}
            >
              <span className="onair-dm__amt">
                {dm.scCurrency || '¥'}
                {dm.scAmount}
              </span>
              <span className="onair-dm__body">{bilingual(bodyText, cleanTrans)}</span>
            </div>
          );
        }

        if (!isNico && isGift) {
          return (
            <div
              key={dm.id || `${idx}_${dm.text}`}
              className="onair-dm onair-dm--gift"
              style={anim}
            >
              <svg className="onair-dm__ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d={GIFT_DANMAKU_ICON} />
              </svg>
              <span className="onair-dm__body">{bilingual(bodyText, cleanTrans)}</span>
            </div>
          );
        }

        if (!isNico) {
          return (
            <div
              key={dm.id || `${idx}_${dm.text}`}
              className={`onair-dm onair-dm--plain${isMine ? ' is-mine' : ''}`}
              style={anim}
            >
              {bilingual(bodyText || comment, cleanTrans)}
            </div>
          );
        }

        return (
          <div
            key={dm.id || `${idx}_${dm.text}`}
            className={`onair-dm onair-dm--nico${isMine ? ' is-mine' : ''}${
              isSc ? ' is-sc' : ''
            }${isGift ? ' is-gift' : ''}`}
            style={anim}
          >
            {isSc && (
              <span className="onair-dm__badge onair-dm__badge--sc">¥{dm.scAmount}</span>
            )}
            {isGift && (
              <span className="onair-dm__badge onair-dm__badge--gift">
                {dm.giftEmoji || '🎁'} {dm.giftName}
              </span>
            )}
            {comment || cleanTrans ? bilingual(comment || bodyText, cleanTrans) : null}
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
          const tier = resolveScTier(sc.scAmount, sc.scColor);
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
  const tier = resolveScTier(item.scAmount, item.scColor);
  const cleanTrans = item.translation ? item.translation.replace(/^译[：:]\s*/, '').trim() : '';

  return (
    <div className="rounded-xl overflow-hidden shadow-sm border border-black/10 my-1.5">
      <div
        style={{ backgroundColor: tier.headerBg, color: tier.textColor === '#3e2723' ? '#3e2723' : '#ffffff' }}
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
