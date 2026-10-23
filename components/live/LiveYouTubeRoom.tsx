/**
 * 电波 · YouTube Live 新壳（对照原型 E:\电波UI设计\youtube-live）。
 *
 * 两条硬规矩：
 * 1. 小窗与全屏是两套独立机位，不共用同一套 DOM —— 全屏 ≠ 小窗放大。
 * 2. 旧项目里已经有的能力（设置、私聊、分镜、摘要、长按、SC/礼物、导演引导、圆盘头像开关…）
 *    一样都不许丢，位置可以按原型重排。
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import TokenImg from '../os/TokenImg';
import {
  LiveDanmakuItem,
  SC_CUSTOM_MIN,
  SC_GOLD_BORDER,
  SC_TIER_OPTIONS,
  StreamGiftOption,
  resolveScTier,
} from '../../utils/liveStreamTypes';
import { FloatingDanmakuOverlay, BeatLongPressSheet, LiveFloatingPhone } from './LiveSharedWidgets';
import { LiveUiStyle, formatCount } from './platformChrome';
import { getLiveDanmakuComment } from '../../utils/liveStreamTimeline';
import {
  alignLiveSpeech,
  pairCursorAfterClock,
  spokenLineIndexAt,
  spokenLineStartSec,
  visibleLivePair,
} from '../../utils/liveSpeechPairs';
import type { LiveWatchScreenProps } from './LiveWatchScreen';
import './liveYoutube.css';

type YtTab = 'chat' | 'script' | 'summary';

// —— 原型图标（path 直接取自原型 index.html，别自己改形）——
const Ico = {
  back: 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  more: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  gear: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.72 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.6.22l2.39-.96c.5.4 1.04.72 1.62.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.62-.94l2.39.96c.23.1.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z',
  chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12zM7 9h10v2H7V9zm0-3h10v2H7V6zm0 6h7v2H7v-2z',
  menu: 'M3 5h18v2H3V5zm4 6h10v2H7v-2zm3 6h4v2h-4v-2z',
  person:
    'M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v1.2h19.2v-1.2c0-3.2-6.4-4.8-9.6-4.8z',
  gift: 'M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11.5 8.5 14.38 12 16 10.83 13.92 8H20v6z',
  director:
    'M18 3.5 15.6 1 13.2 5H4c-1.1 0-2 .9-2 2v13c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-2.2L20.4 1 18 3.5zM4 20V9h16v11H4zm2-8h8v2H6v-2zm0 4h5v2H6v-2z',
  send: 'M3.4 20.4 21 12 3.4 3.6v6.5L14.2 12 3.4 13.9v6.5z',
  prevBeat: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z',
  nextBeat: 'M8.6 7.4 10 6l6 6-6 6-1.4-1.4L13.2 12z',
  prevSkip: 'M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z',
  nextSkip: 'M6 18l8.5-6L6 6v12zM16 6h2v12h-2V6z',
  chevR: 'M8.59 7.41 10 6l6 6-6 6-1.41-1.41L13.17 12z',
  expand: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  signal:
    'M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13',
};

function SVG({
  d,
  size = 22,
  stroke = false,
}: {
  d: string;
  size?: number;
  stroke?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d={d}
        fill={stroke ? 'none' : 'currentColor'}
        stroke={stroke ? 'currentColor' : 'none'}
        strokeWidth={stroke ? 2 : 0}
        strokeLinecap="round"
      />
    </svg>
  );
}

function initial(name: string) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function scTierFor(dm: LiveDanmakuItem) {
  return resolveScTier(dm.scAmount, dm.scColor);
}

function goldFrame(tier: { goldBorder?: boolean }): React.CSSProperties {
  return tier.goldBorder ? { boxShadow: `inset 0 0 0 2px ${SC_GOLD_BORDER}` } : {};
}

/** 顶部 pill：绿黄橙紫红 + 礼物紫 */
function pillToneFor(dm: LiveDanmakuItem) {
  if (dm.giftName) return 'gift';
  return scTierFor(dm).color;
}

/** 长按自己的弹幕：编辑 / 删除（既有能力，位置随新列表重排）。 */
function useOwnDanmakuMenu() {
  const [menuFor, setMenuFor] = useState<LiveDanmakuItem | null>(null);
  const timerRef = useRef<number | null>(null);
  const itemRef = useRef<LiveDanmakuItem | null>(null);
  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const begin = (dm: LiveDanmakuItem) => {
    if (!dm.id || !(dm.isUserMain || dm.isUserAlt)) return;
    clear();
    itemRef.current = dm;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (itemRef.current) setMenuFor(itemRef.current);
    }, 420);
  };
  useEffect(() => () => clear(), []);
  const handlers = (dm: LiveDanmakuItem) => ({
    onPointerDown: () => begin(dm),
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (event: React.MouseEvent) => {
      if (dm.id && (dm.isUserMain || dm.isUserAlt)) {
        event.preventDefault();
        setMenuFor(dm);
      }
    },
  });
  return { menuFor, setMenuFor, handlers };
}

function OwnDanmakuMenu({
  item,
  onEdit,
  onDelete,
  onClose,
}: {
  item: LiveDanmakuItem;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  return (
    <div className="dyt-ov" onClick={onClose}>
      <div className="dyt-sheet" onClick={e => e.stopPropagation()}>
        <div className="dyt-grab" />
        <h2 className="dyt-sheet__title">我发的弹幕</h2>
        {editing ? (
          <>
            <label className="dyt-scnote">
              <textarea
                rows={3}
                value={draft}
                aria-label="编辑我的弹幕"
                onChange={e => setDraft(e.target.value)}
              />
            </label>
            <div className="dyt-seg">
              <button type="button" onClick={() => setEditing(false)}>
                取消
              </button>
              <button
                type="button"
                className="is-on"
                disabled={!draft.trim()}
                onClick={() => {
                  onEdit(item.id, draft.trim());
                  onClose();
                }}
              >
                保存
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="dyt-block">{item.text}</div>
            <button type="button" className="dyt-menu" onClick={() => setEditing(true)}>
              <span className="dyt-menu__main">
                <strong>编辑</strong>
              </span>
            </button>
            <button
              type="button"
              className="dyt-menu dyt-menu--danger"
              onClick={() => {
                if (window.confirm('删除这条弹幕？')) {
                  onDelete(item.id);
                  onClose();
                }
              }}
            >
              <span className="dyt-menu__main">
                <strong>删除</strong>
              </span>
            </button>
            <button type="button" className="dyt-menu" onClick={onClose}>
              <span className="dyt-menu__main">
                <strong>取消</strong>
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function LiveYouTubeRoom(props: LiveWatchScreenProps) {
  const {
    channel,
    session,
    activePersona,
    allTimelineBeats,
    visibleDanmakuFeed,
    currentGlobalBeatIdx,
  } = props;

  // 原型那套浮层：更多 / 三视图菜单 / 打赏分段
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [supportTab, setSupportTab] = useState<'sc' | 'gift'>('sc');
  const [customScText, setCustomScText] = useState('');
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [guidanceDraft, setGuidanceDraft] = useState('');
  const [pinDetail, setPinDetail] = useState<LiveDanmakuItem | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [composeFocus, setComposeFocus] = useState(false);
  const [fsBarH, setFsBarH] = useState(48);
  const [toast, setToast] = useState<{ key: number; html: string } | null>(null);
  const [giftEffect, setGiftEffect] = useState<{
    kind: 'sc' | 'gift';
    emoji?: string;
    name: string;
    amount?: string;
    color: string;
    ink: string;
    key: number;
  } | null>(null);

  const [subTab, setSubTab] = useState<YtTab>(props.lowerTab === 'script' ? 'script' : 'chat');
  const tab: YtTab = subTab;

  const toastTimerRef = useRef<number | null>(null);
  const showToast = (html: string) => {
    setToast({ key: Date.now(), html });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  };
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // SC / 礼物弹窗特效：跟拍推进时依次弹出
  const giftEffectTimerRef = useRef<number | null>(null);
  const giftEffectQueueRef = useRef<LiveDanmakuItem[]>([]);
  const giftEffectRunningRef = useRef(false);
  const seenGiftEffectIdsRef = useRef<Set<string>>(
    new Set(
      props.allTimelineBeats
        .slice(0, Math.max(0, props.currentGlobalBeatIdx))
        .flatMap(row => row.beat.danmaku || [])
        .filter(dm => (dm.scAmount && dm.scAmount > 0) || dm.giftName)
        .map(dm => dm.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const previousGiftEffectBeatIdxRef = useRef(props.currentGlobalBeatIdx);
  useEffect(() => {
    if (props.currentGlobalBeatIdx < previousGiftEffectBeatIdxRef.current) {
      for (const row of props.allTimelineBeats.slice(props.currentGlobalBeatIdx + 1)) {
        for (const dm of row.beat.danmaku || []) {
          if ((dm.scAmount && dm.scAmount > 0) || dm.giftName) {
            if (dm.id) seenGiftEffectIdsRef.current.delete(dm.id);
          }
        }
      }
      giftEffectQueueRef.current = [];
      giftEffectRunningRef.current = false;
      if (giftEffectTimerRef.current !== null) window.clearTimeout(giftEffectTimerRef.current);
      giftEffectTimerRef.current = null;
      setGiftEffect(null);
    }
    previousGiftEffectBeatIdxRef.current = props.currentGlobalBeatIdx;

    const fresh = (props.visibleDanmakuFeed || []).filter(item => {
      const isPaid = Boolean((item.scAmount && item.scAmount > 0) || item.giftName);
      if (!isPaid || !item.id || seenGiftEffectIdsRef.current.has(item.id)) return false;
      seenGiftEffectIdsRef.current.add(item.id);
      return true;
    });
    if (fresh.length) giftEffectQueueRef.current.push(...fresh);
    if (giftEffectRunningRef.current || giftEffectQueueRef.current.length === 0) return;

    giftEffectRunningRef.current = true;
    const showNext = () => {
      const item = giftEffectQueueRef.current.shift();
      if (!item) {
        giftEffectRunningRef.current = false;
        giftEffectTimerRef.current = null;
        setGiftEffect(null);
        return;
      }
      const isSc = Boolean(item.scAmount && item.scAmount > 0);
      const tier = isSc ? resolveScTier(item.scAmount, item.scColor) : null;
      setGiftEffect({
        key: Date.now() + giftEffectQueueRef.current.length,
        kind: isSc ? 'sc' : 'gift',
        emoji: isSc ? undefined : item.giftEmoji,
        name: isSc
          ? `${item.senderName}：${item.text}`
          : `${item.senderName} 送出 ${item.giftName || '频道礼物'}`,
        amount: isSc
          ? `${item.scCurrency || '¥'}${item.scAmount}`
          : item.giftAmount
          ? `${item.giftCurrency || '¥'}${item.giftAmount}`
          : undefined,
        color: isSc ? tier!.bodyBg : '#8e24aa',
        ink: isSc ? tier!.textColor : '#ffffff',
      });
      giftEffectTimerRef.current = window.setTimeout(showNext, 2800);
    };
    showNext();
  }, [props.allTimelineBeats, props.currentGlobalBeatIdx, props.visibleDanmakuFeed]);
  useEffect(
    () => () => {
      if (giftEffectTimerRef.current !== null) window.clearTimeout(giftEffectTimerRef.current);
    },
    [],
  );

  // 画面中央圆盘头像：原型没有这个，是既有功能，靠开关（设置里）控制，默认关
  const [showStageAvatar, setShowStageAvatar] = useState(() => {
    try {
      return localStorage.getItem('live_stage_avatar') === '1';
    } catch {
      return false;
    }
  });
  const toggleStageAvatar = () =>
    setShowStageAvatar(v => {
      const next = !v;
      try {
        localStorage.setItem('live_stage_avatar', next ? '1' : '0');
      } catch {
        /* 忽略浏览器存储限制 */
      }
      return next;
    });

  const item =
    allTimelineBeats[currentGlobalBeatIdx] || allTimelineBeats[allTimelineBeats.length - 1];
  const beat = item?.beat;
  const atEnd = allTimelineBeats.length === 0 || currentGlobalBeatIdx >= allTimelineBeats.length - 1;
  const ended = session.status === 'ended';
  const maxIdx = Math.max(0, allTimelineBeats.length - 1);

  // —— 台词：一次只显示一对（中文主层级 / 日语小灰）——
  const trans = beat?.speechTranslated ? beat.speechTranslated.replace(/^译[：:]\s*/, '').trim() : '';
  const spokenFull = beat?.speechOriginal || '';
  const pairAlignment = alignLiveSpeech(spokenFull, trans);
  const clockForThis =
    props.voiceClock && props.voiceClock.beatId === beat?.id ? props.voiceClock : null;
  const playingThis = Boolean(beat && props.ttsPlayingBeatId === beat.id && clockForThis);
  const followedIndex =
    props.followVoiceSentences && playingThis
      ? spokenLineIndexAt(
          pairAlignment.spokenLines,
          beat?.speechTimeline,
          clockForThis!.currentTime,
          clockForThis!.duration || beat?.speechTimeline?.durationSec,
        )
      : null;
  const [pairCursor, setPairCursor] = useState(0);
  const [cursorBeatId, setCursorBeatId] = useState<string | null>(null);
  const beatKey = beat?.id || '';
  const beatChanged = beatKey !== cursorBeatId;
  const heldCursor = pairCursorAfterClock(pairCursor, followedIndex, beatChanged);
  if (beatChanged) setCursorBeatId(beatKey);
  if (heldCursor !== pairCursor) setPairCursor(heldCursor);
  const pairIndex = pairAlignment.spokenLines.length
    ? Math.max(
        0,
        Math.min(
          pairAlignment.spokenLines.length - 1,
          followedIndex != null ? followedIndex : heldCursor,
        ),
      )
    : 0;
  const pair = visibleLivePair(spokenFull, trans, pairIndex);
  const goPair = (dir: -1 | 1) => {
    const count = pairAlignment.spokenLines.length;
    const next = pairIndex + dir;
    if (!beat || next < 0 || next >= count) return;
    if (props.followVoiceSentences && playingThis) {
      const start = spokenLineStartSec(
        pairAlignment.spokenLines,
        next,
        beat.speechTimeline,
        clockForThis?.duration || beat.speechTimeline?.durationSec,
      );
      if (start != null) props.onSeekVoice(start);
      return;
    }
    setPairCursor(next);
  };

  const voiceOn = Boolean(beat && props.ttsPlayingBeatId === beat.id);
  const voiceBusy = Boolean(beat && props.ttsLoadingBeatId === beat.id);
  const toggleVoice = () => {
    if (!beat?.speechOriginal?.trim() || voiceBusy) return;
    props.onPlayBeatVoice(beat);
  };

  const seek = (n: number) => props.setCurrentGlobalBeatIdx(Math.max(0, Math.min(maxIdx, n)));
  const advance = () => {
    if (!atEnd) {
      seek(currentGlobalBeatIdx + 1);
      return;
    }
    if (!ended && !props.isGenerating) props.onGenerateNextChunk();
  };

  const screenText = beat?.screen || (props.isGenerating ? '主播正在镜头前反应…' : '');

  // 日语 → 小灰次层级；中文（原声或同传）→ 主层级
  const spokenIsJa = /[\u3040-\u30ff]/.test(pair.spokenLine || '');
  const showTrans =
    props.showTranslation &&
    Boolean(pair.translatedLine) &&
    pair.translatedLine !== pair.spokenLine;
  const zhLine = spokenIsJa ? (showTrans ? pair.translatedLine : '') : pair.spokenLine;
  const jaLine = spokenIsJa ? pair.spokenLine : '';
  const jaOnly = !zhLine && Boolean(jaLine);

  const pickSize = (len: number, tiers: Array<[number, number]>) => {
    for (const [limit, size] of tiers) if (len <= limit) return size;
    return tiers[tiers.length - 1][1];
  };
  const smallZhSize = pickSize(zhLine.length, [
    [40, 13.5],
    [80, 12.5],
    [130, 11.5],
    [1e9, 10.5],
  ]);
  const fsZhSize = pickSize(zhLine.length, [
    [40, 18],
    [80, 16.5],
    [130, 15],
    [1e9, 13.5],
  ]);

  const popInner = () => {
    if (props.actionSheetTarget) {
      props.setActionSheetTarget(null);
      return true;
    }
    if (titleOpen) {
      setTitleOpen(false);
      return true;
    }
    if (viewMenuOpen) {
      setViewMenuOpen(false);
      return true;
    }
    if (pinDetail) {
      setPinDetail(null);
      return true;
    }
    if (props.activeBottomDrawer !== 'none') {
      props.setActiveBottomDrawer('none');
      return true;
    }
    if (guidanceOpen) {
      setGuidanceOpen(false);
      return true;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    if (props.showFloatingPhone) {
      props.setShowFloatingPhone(false);
      return true;
    }
    if (props.isFullscreen) {
      props.setIsFullscreen(false);
      return true;
    }
    return false;
  };
  props.onBindBack(() => {
    if (popInner()) return true;
    props.onBackToLobby();
    return true;
  });

  // 点身份只在「本尊 / 匿名」之间来回切（既有行为）
  const cyclePersona = () => {
    const personas = props.viewerPersonas;
    if (personas.length <= 1) {
      props.onOpenPersonaModal();
      return;
    }
    const main = personas.find(p => p.isMain);
    const alts = personas.filter(p => !p.isMain);
    if (!activePersona.isMain) {
      if (main) props.onSelectPersona(main.id);
      return;
    }
    let lastAltId = '';
    try {
      lastAltId = localStorage.getItem('live_last_alt_persona_v1') || '';
    } catch {
      /* 忽略浏览器存储限制 */
    }
    const target = alts.find(p => p.id === lastAltId) || alts[0];
    if (target) props.onSelectPersona(target.id);
    else props.onOpenPersonaModal();
  };

  const switchTab = (next: YtTab) => {
    setSubTab(next);
    props.setLowerTab(next === 'chat' ? 'chat' : 'script');
    setViewMenuOpen(false);
  };

  const openThisBeat = () => {
    if (beat && item) props.openBeatMenu(item.chunkId, beat, `第 ${currentGlobalBeatIdx + 1} 拍`);
  };

  // 长按台词 / 画面 → 同一套分镜菜单（既有）
  const longPress = useLongPress(openThisBeat);

  // 顶栏标题变高后，镜头笺跟着下移，别压住标题（原型 syncFsNoteTop）
  const fsBarRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!props.isFullscreen) return;
    const el = fsBarRef.current;
    const measure = () => setFsBarH(el?.offsetHeight || 48);
    measure();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.isFullscreen, session.title]);

  const topChatters = visibleDanmakuFeed
    .filter(dm => (dm.scAmount && dm.scAmount > 0) || dm.giftName)
    .slice(-4)
    .reverse();

  // 全屏左下弹幕（Ann 2026-10-23 定的机制：循环是「流水」，不是「存货」）：
  // 上面是「当前这一拍之前、从开场到现在」的真实弹幕，一条只出现一次，不封顶；
  // 底下是「当前这一拍」的循环：一条条从最底下冒出来、往上滑。
  // 收的规矩：只收「整条已经滑出弹幕区上边缘」的（收的时候看不见，视野里的一条都不动），
  // 而且本拍整整一轮——本拍有几条就留几条，不设上限——永远留在弹幕区里接着转。
  const railRef = useRef<HTMLDivElement | null>(null);
  const [railFlow, setRailFlow] = useState<{ dm: LiveDanmakuItem; seq: number }[]>([]);
  const [railPaused, setRailPaused] = useState(false);
  const railFlowSeqRef = useRef(0);
  const railFlowIdxRef = useRef(0);
  const beatDanmaku = props.scrollingDanmakuFeed || [];
  const beatDanmakuKey = beatDanmaku.map(dm => dm.id || dm.text || '').join('|');
  const railLastSeq = railFlow.length ? railFlow[railFlow.length - 1].seq : 0;
  // 真实弹幕：把「当前这一拍」摘掉（本拍只在底下的循环里出现，免得同一条出现两遍）
  const railHistory = beatDanmaku.length
    ? visibleDanmakuFeed.slice(0, Math.max(0, visibleDanmakuFeed.length - beatDanmaku.length))
    : visibleDanmakuFeed;

  // 收掉已经整条滑出弹幕区上边缘的循环弹幕。本拍整整一轮（本拍几条就是几条）永远留着，不截。
  const trimRailFlow = () => {
    const el = railRef.current;
    if (!el) return;
    const chips = el.querySelectorAll<HTMLElement>('[data-rail-flow="1"]');
    const keep = Math.max(beatDanmaku.length, 1);
    const maxDrop = Math.max(0, chips.length - keep);
    let drop = 0;
    while (drop < maxDrop) {
      const chip = chips[drop];
      if (chip.offsetTop + chip.offsetHeight <= el.scrollTop + 1) drop += 1;
      else break;
    }
    if (drop > 0) setRailFlow(prev => prev.slice(drop));
  };

  // 换拍：底下的循环从新的一拍重新开始（旧那一拍已经进了上面的真实弹幕）
  useEffect(() => {
    railFlowIdxRef.current = 0;
    setRailFlow([]);
  }, [beatDanmakuKey]);

  useEffect(() => {
    if (!props.isFullscreen || railPaused || beatDanmaku.length === 0) return;
    const timer = window.setInterval(() => {
      const idx = railFlowIdxRef.current % beatDanmaku.length;
      railFlowIdxRef.current = idx + 1;
      railFlowSeqRef.current += 1;
      const dm = beatDanmaku[idx];
      const seq = railFlowSeqRef.current;
      setRailFlow(prev => [...prev, { dm, seq }]);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [props.isFullscreen, railPaused, beatDanmakuKey]);

  // 没在手动回看时，整列顺滑地往上滑到底（不是「啪」地跳一格）
  const railAutoRef = useRef(false); // 正在自动滑：这期间的滚动事件不算「手动上滑」
  const railRafRef = useRef<number | null>(null);
  const railInitRef = useRef(false);
  const stopRailAuto = () => {
    railAutoRef.current = false;
    if (railRafRef.current !== null) {
      window.cancelAnimationFrame(railRafRef.current);
      railRafRef.current = null;
    }
  };
  // 刚进全屏时直接落到底，不要从最上面长距离滑下来
  useEffect(() => {
    railInitRef.current = false;
  }, [props.isFullscreen]);
  useEffect(() => {
    const el = railRef.current;
    if (!el || railPaused) return;
    const target = el.scrollHeight - el.clientHeight;
    if (!railInitRef.current) {
      railInitRef.current = true;
      el.scrollTop = target;
      return;
    }
    const start = el.scrollTop;
    if (target - start < 1) {
      el.scrollTop = target;
      return;
    }
    railAutoRef.current = true;
    const dur = 340;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      el.scrollTop = start + (target - start) * ease(p);
      if (p < 1) {
        railRafRef.current = window.requestAnimationFrame(step);
      } else {
        railRafRef.current = null;
        railAutoRef.current = false;
        // 滑到位了：把已经整条滑出上边缘的循环弹幕收掉（收的时候看不见，看不出动静）
        trimRailFlow();
      }
    };
    railRafRef.current = window.requestAnimationFrame(step);
    return () => {
      if (railRafRef.current !== null) {
        window.cancelAnimationFrame(railRafRef.current);
        railRafRef.current = null;
      }
      railAutoRef.current = false;
    };
  }, [railLastSeq, visibleDanmakuFeed.length, railPaused, props.isFullscreen]);

  const handleRailScroll = () => {
    const el = railRef.current;
    if (!el || railAutoRef.current) return; // 自动滑动那一下不算手动
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 14;
    setRailPaused(prev => (prev === !atBottom ? prev : !atBottom));
  };

  const renderRailChip = (dm: LiveDanmakuItem, key: string, isFlow = false) => {
    const isSc = Boolean(dm.scAmount && dm.scAmount > 0);
    const isGift = Boolean(dm.giftName);
    const comment = getLiveDanmakuComment(dm);
    const railTrans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
    const railBody = isGift ? `送出 ${dm.giftName}` : comment;
    // 名字按身份上色（Ann 2026-10-24 选的方案 ②）：
    // 判定跟小窗公屏那条 renderChatList 一字不差——本尊蓝、会员/老粉绿、路人/匿名不额外上色
    const railUserClass = dm.isUserMain
      ? ' dyt-chip__user--host'
      : dm.isUserAlt
      ? ' dyt-chip__user--anon'
      : dm.fanBadge || dm.roleType === 'old_fan'
      ? ' dyt-chip__user--member'
      : ' dyt-chip__user--anon';
    return (
      <div
        key={key}
        data-rail-flow={isFlow ? '1' : undefined}
        className={`dyt-chip${isSc ? ' dyt-chip--sc' : ''}${isGift ? ' dyt-chip--gift' : ''}`}
      >
        <span className={`dyt-chip__user${railUserClass}`}>
          {dm.senderName}
          {isSc ? ` · ${dm.scCurrency || '¥'}${dm.scAmount}` : ''}
        </span>
        {railBody}
        {props.showTranslation && railTrans && railTrans !== railBody ? (
          <span className="dyt-chip__trans">{railTrans}</span>
        ) : null}
      </div>
    );
  };

  // 台词那一层只有「真的超出被裁掉」时才渐隐；平时不留，免得把日语那行洗白
  const linesTextRef = useRef<HTMLDivElement | null>(null);
  const [linesClipped, setLinesClipped] = useState(false);
  useEffect(() => {
    const el = linesTextRef.current;
    if (!el) return;
    setLinesClipped(el.scrollHeight > el.clientHeight + 1);
  }, [zhLine, jaLine, props.isGenerating, props.isFullscreen]);

  // 待生效导演引导：贴在输入框上方的窄条；本轮生成后 pendingGuidance 会被清空，自然消失
  const pendingCue = props.pendingGuidance[0];
  const renderGuidanceCue = () => {
    if (!pendingCue) return null;
    const more =
      props.pendingGuidance.length > 1 ? `（另有 ${props.pendingGuidance.length - 1} 条）` : '';
    return (
      <div className="dyt-guidance-cue" role="status" aria-label="待生效的导演引导">
        <span className="dyt-guidance-cue__label">导演引导</span>
        <span className="dyt-guidance-cue__text">
          {pendingCue.text}
          {more}
        </span>
        <button
          type="button"
          className="dyt-guidance-cue__x"
          aria-label="移除这条导演引导"
          onClick={() => props.onRemoveGuidance(pendingCue.id)}
        >
          ×
        </button>
      </div>
    );
  };

  const displayName = channel.channelName || props.charName;

  const renderAvatar = () => (
    <span className="dyt-av">
      {props.displayAvatar ? <TokenImg value={props.displayAvatar} alt="" /> : initial(displayName)}
    </span>
  );

  const renderBackdrop = (className: string) =>
    props.displayBackgroundUrl ? (
      <div className={className}>
        <TokenImg value={props.displayBackgroundUrl} alt="" />
      </div>
    ) : (
      <div className={className} />
    );

  const renderStageAvatar = (extraClass?: string) =>
    showStageAvatar ? (
      <span className={`dyt-avatar${extraClass ? ` ${extraClass}` : ''}`}>
        {voiceOn &&
          [0, 1, 2].map(i => (
            <i key={i} className="dyt-avatar__ring live-voice-ring" style={{ animationDelay: `${i * 0.62}s` }} />
          ))}
        <span className={`dyt-avatar__disc${voiceOn ? ' live-voice-disc is-speaking' : ''}`}>
          {props.displayAvatar ? (
            <TokenImg value={props.displayAvatar} alt="" />
          ) : (
            <span className="dyt-avatar__ini">{initial(displayName)}</span>
          )}
        </span>
      </span>
    ) : null;

  // ============ 语音切句：箭头 + 圆点进度（不用文字按钮）============
  const sentenceCount = pairAlignment.spokenLines.length;
  const renderSentenceNav = (fs?: boolean) => {
    if (sentenceCount <= 1) return null;
    return (
      <div
        className={`dyt-snav${fs ? ' dyt-snav--fs' : ''}`}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className="dyt-snav__btn"
          aria-label="上一句"
          disabled={pairIndex <= 0}
          onClick={e => {
            e.stopPropagation();
            goPair(-1);
          }}
        >
          <SVG d={Ico.back} size={fs ? 20 : 16} />
        </button>
        <span className="dyt-snav__dots" aria-hidden="true">
          {pairAlignment.spokenLines.map((_, i) => (
            <i key={i} className={`dyt-snav__dot${i === pairIndex ? ' is-on' : ''}${i < pairIndex ? ' is-past' : ''}`} />
          ))}
        </span>
        <button
          type="button"
          className="dyt-snav__btn"
          aria-label="下一句"
          disabled={pairIndex >= sentenceCount - 1}
          onClick={e => {
            e.stopPropagation();
            goPair(1);
          }}
        >
          <SVG d={Ico.chevR} size={fs ? 20 : 16} />
        </button>
      </div>
    );
  };

  // ============ 小窗双击切句：左半边上一句 / 右半边下一句 ============
  // 台词那一条、画面最底进度条、左上返回键都不算双击区，
  // 所以单击字幕播语音还是立刻出声，一点延迟都没有。
  const [pairTip, setPairTip] = useState<{ dir: -1 | 1; blocked: boolean } | null>(null);
  const pairTipTimer = useRef<number | null>(null);
  const lastTapAt = useRef(0);
  useEffect(
    () => () => {
      if (pairTipTimer.current != null) window.clearTimeout(pairTipTimer.current);
    },
    [],
  );
  // 小窗和全屏共用这一套双击切句，只是「不算双击区」的那几块不一样：
  // 小窗是台词条 / 画面底进度条 / 左上返回键；
  // 全屏是台词台 / 底栏 / 顶栏 / 镜头笺 / 左下弹幕轨（那些地方点了要么播语音、要么滚弹幕）。
  const handlePlayerTap = (e: React.MouseEvent<HTMLElement>, scope: 'small' | 'full' = 'small') => {
    if (sentenceCount <= 1) return;
    const target = e.target as HTMLElement | null;
    const blockedSel =
      scope === 'full'
        ? '.dyt-lines, .dyt-dock, .dyt-fsbar, .dyt-note, .dyt-rail'
        : '.dyt-cap, .dyt-player__bar, .dyt-back';
    if (target?.closest(blockedSel)) return;
    const now = Date.now();
    // 连点第三下、第四下都算「接着切」，不必重新成对双击
    const isFollowUpTap = now - lastTapAt.current < 320;
    lastTapAt.current = now;
    if (!isFollowUpTap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dir: -1 | 1 = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
    const blocked = dir === -1 ? pairIndex <= 0 : pairIndex >= sentenceCount - 1;
    goPair(dir);
    if (pairTipTimer.current != null) window.clearTimeout(pairTipTimer.current);
    setPairTip({ dir, blocked });
    pairTipTimer.current = window.setTimeout(() => setPairTip(null), 1200);
  };

  // ============ 聊天列表（原型油管公屏 + 既有 SC / 礼物 / 长按能力）============
  const list = useOwnDanmakuMenu();
  const renderChatList = () => {
    if (!visibleDanmakuFeed.length) {
      return <p className="dyt-empty">公屏还没有弹幕，在下方发一条弹幕或 Super Chat 互动吧！</p>;
    }
    return (
      <>
        {visibleDanmakuFeed.map((dm, idx) => {
          const paid = Boolean(dm.scAmount && dm.scAmount > 0);
          const isGift = Boolean(dm.giftName);
          const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
          const giftComment = getLiveDanmakuComment(dm);
          const dmTrans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';

          if (paid) {
            const tier = scTierFor(dm);
            return (
              <article
                key={dm.id || idx}
                className={`dyt-sc dyt-sc--${tier.color}`}
                style={{ color: tier.textColor, ...goldFrame(tier) }}
                {...list.handlers(dm)}
              >
                <div className="dyt-sc__head" style={{ background: tier.headerBg }}>
                  <span className="dyt-sc__av">{initial(dm.senderName)}</span>
                  <span className="dyt-sc__name">@{dm.senderName}</span>
                  <span className="dyt-sc__amount">
                    {dm.scCurrency || '¥'}
                    {dm.scAmount}
                  </span>
                </div>
                <div className="dyt-sc__body" style={{ background: tier.bodyBg }}>
                  <p className="dyt-sc__text">
                    {dm.text}
                    {props.showTranslation && dmTrans && dmTrans !== dm.text ? (
                      <span className="dyt-sc__trans">{dmTrans}</span>
                    ) : null}
                  </p>
                  <div className="dyt-sc__foot">
                    <span className="dyt-sc__chip">赞</span>
                    <span className="dyt-sc__chip">回复</span>
                  </div>
                </div>
              </article>
            );
          }

          if (isGift) {
            return (
              <article key={dm.id || idx} className="dyt-gift" {...list.handlers(dm)}>
                <span className="dyt-gift__mark" aria-hidden="true">
                  <SVG d={Ico.gift} size={18} />
                </span>
                <div>
                  <div className="dyt-gift__title">
                    {dm.senderName} 送出 {dm.giftName}
                  </div>
                  {giftComment ? <div className="dyt-gift__note">{giftComment}</div> : null}
                  <div className="dyt-gift__meta">
                    {dm.giftCurrency || '¥'}
                    {dm.giftAmount ?? 0}
                    {` · ×${dm.giftCount && dm.giftCount > 1 ? dm.giftCount : 1}`}
                  </div>
                </div>
              </article>
            );
          }

          // 对照原型：本尊=host 蓝名黑头像；会员/粉=绿名；路人/匿名=灰名
          const avClass = dm.isUserMain
            ? 'dyt-msg__av--host'
            : dm.isUserAlt
            ? 'dyt-msg__av--anon'
            : dm.fanBadge
            ? 'dyt-msg__av--member'
            : dm.roleType === 'old_fan'
            ? 'dyt-msg__av--fan'
            : 'dyt-msg__av--anon';
          const userClass = dm.isUserMain
            ? 'dyt-msg__user--host'
            : dm.isUserAlt
            ? 'dyt-msg__user--anon'
            : dm.fanBadge || dm.roleType === 'old_fan'
            ? 'dyt-msg__user--member'
            : 'dyt-msg__user--anon';
          return (
            <article
              key={dm.id || idx}
              className="dyt-msg"
              title={isMine ? '长按可编辑或删除' : undefined}
              {...list.handlers(dm)}
            >
              <span className={`dyt-msg__av ${avClass}`}>{initial(dm.senderName)}</span>
              <div className="dyt-msg__body">
                <span className={`dyt-msg__user ${userClass}`}>@{dm.senderName}</span>
                {dm.isUserMain && <span className="dyt-msg__badge">我</span>}
                {dm.isUserAlt && <span className="dyt-msg__badge dyt-msg__badge--alt">马甲</span>}
                {dm.fanBadge && !isMine && <span className="dyt-msg__badge">{dm.fanBadge}</span>}
                <span className="dyt-msg__text"> {dm.text}</span>
                {props.showTranslation && dmTrans && dmTrans !== dm.text ? (
                  <span className="dyt-msg__trans">{dmTrans}</span>
                ) : null}
              </div>
            </article>
          );
        })}
        {list.menuFor && (
          <OwnDanmakuMenu
            item={list.menuFor}
            onEdit={props.onEditUserDanmaku}
            onDelete={props.onDeleteUserDanmaku}
            onClose={() => list.setMenuFor(null)}
          />
        )}
      </>
    );
  };

  // ============ 分镜 ============
  const renderScript = () => {
    if (!allTimelineBeats.length) return <p className="dyt-empty">暂无分镜记录</p>;
    return (
      <>
        {allTimelineBeats.map(row => {
          const current = row.globalIdx === currentGlobalBeatIdx;
          const playing = props.ttsPlayingBeatId === row.beat.id;
          const rowTrans = row.beat.speechTranslated
            ? row.beat.speechTranslated.replace(/^译[：:]\s*/, '').trim()
            : '';
          return (
            <article
              key={row.beat.id}
              className={`dyt-beat${current ? ' is-current' : ''}`}
              onClick={() => props.setCurrentGlobalBeatIdx(row.globalIdx)}
            >
              <div className="dyt-beat__head">
                <span className="dyt-beat__n">第 {row.globalIdx + 1} 拍</span>
                <div className="dyt-beat__tools" onClick={e => e.stopPropagation()}>
                  {row.beat.speechOriginal?.trim() && (
                    <button
                      type="button"
                      className="dyt-beat__tool"
                      onClick={() => props.onPlayBeatVoice(row.beat)}
                    >
                      {playing ? '播音中' : '听原声'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="dyt-beat__tool"
                    onClick={() =>
                      props.openBeatMenu(row.chunkId, row.beat, `第 ${row.globalIdx + 1} 拍`)
                    }
                  >
                    菜单
                  </button>
                </div>
              </div>
              {row.beat.screen && <p className="dyt-beat__desc">{row.beat.screen}</p>}
              <p className="dyt-beat__line">
                {row.beat.speechOriginal ? `「${row.beat.speechOriginal}」` : '（专注动作未开口）'}
              </p>
              {props.showTranslation && rowTrans && rowTrans !== row.beat.speechOriginal && (
                <p className="dyt-beat__trans">{rowTrans}</p>
              )}
            </article>
          );
        })}
      </>
    );
  };

  // ============ 摘要 ============
  const renderSummary = () => {
    const rounds = [...(session.chunks || [])].sort((a, b) => a.index - b.index);
    const compressible = props.unfoldedChunks.length > 3;
    return (
      <>
        <div className="dyt-block dyt-foldbar">
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: 13 }}>逐轮压缩（不满 4 轮不压）</strong>
            <span style={{ fontSize: 12, color: '#606060' }}>
              当前有 {props.unfoldedChunks.length} 轮还是原文。
              {compressible ? '可以手动重试最早那一轮的压缩。' : '最近 3 轮保留原文。'}
            </span>
          </div>
          <button
            type="button"
            className="dyt-quiet"
            disabled={!compressible || props.isSummarizing}
            onClick={props.onManualFoldChunks}
          >
            {props.isSummarizing ? '正在压缩…' : compressible ? '重试最早一轮' : '保留原文'}
          </button>
        </div>
        {rounds.length === 0 && <p className="dyt-empty">这一场还没有推进过任何一轮。</p>}
        {rounds.map(chunk => {
          const compressed = Boolean(chunk.roundSummary && chunk.roundSummary.trim());
          return (
            <article key={chunk.id} className="dyt-summary">
              <div className="dyt-summary__head">
                <strong>第 {chunk.index + 1} 轮</strong>
                <span className={`dyt-pilltag${compressed ? ' dyt-pilltag--ok' : ' dyt-pilltag--accent'}`}>
                  {compressed ? '已有摘要' : '仍是原文'}
                </span>
              </div>
              {props.editingSummaryId === chunk.id ? (
                <>
                  <textarea
                    rows={4}
                    value={props.summaryDraft}
                    placeholder="这一轮的摘要留空也可以，留空就回到显示原文"
                    onChange={e => props.setSummaryDraft(e.target.value)}
                  />
                  <div className="dyt-summary__acts">
                    <button
                      type="button"
                      className="dyt-quiet"
                      onClick={() => props.setEditingSummaryId(null)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="dyt-quiet"
                      onClick={() => {
                        props.onEditRoundSummary(chunk.id, props.summaryDraft);
                        props.setEditingSummaryId(null);
                      }}
                    >
                      保存这一轮
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="dyt-summary__text">
                    {compressed
                      ? chunk.roundSummary
                      : chunk.beats
                          .map(
                            (b, bi) =>
                              `${bi + 1}. ${b.screen}${
                                b.speechOriginal ? ` ｜「${b.speechOriginal}」` : ''
                              }`,
                          )
                          .join('\n')}
                  </p>
                  <div className="dyt-summary__acts">
                    <button
                      type="button"
                      className="dyt-quiet"
                      onClick={() => {
                        props.setEditingSummaryId(chunk.id);
                        props.setSummaryDraft(chunk.roundSummary || '');
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="dyt-quiet"
                      onClick={() => props.onForwardRoundToPrivate(chunk.id)}
                    >
                      发到私聊
                    </button>
                    <button
                      type="button"
                      className="dyt-quiet"
                      disabled={props.isSummarizing}
                      onClick={() => props.onRegenerateRoundSummary(chunk)}
                    >
                      重压缩
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </>
    );
  };

  // ============ 公共片段 ============
  const tabLabel = tab === 'chat' ? '实时聊天' : tab === 'script' ? '分镜' : '摘要';
  const viewerText = `${formatCount(session.viewerCount)} 人正在观看`;

  return (
    <div className="dyt">
      <LiveUiStyle />

      {/* ==================== 小窗机位 ==================== */}
      <section className="dyt-player" onClick={handlePlayerTap}>
        {renderBackdrop('dyt-player__scene')}

        {props.showDanmakuOverlay && (
          <div className="dyt-lane">
            <FloatingDanmakuOverlay
              key={`dm-beat-${props.allTimelineBeats[currentGlobalBeatIdx]?.beat.id || currentGlobalBeatIdx}`}
              danmakuList={props.scrollingDanmakuFeed}
              showTranslation={props.showTranslation}
              visible
              platformTheme="youtube"
              tracks={2}
            />
          </div>
        )}

        <div className="dyt-player__chrome">
          <div className="dyt-player__top">
            <button
              type="button"
              className="dyt-back"
              aria-label="返回"
              onClick={() => {
                if (!popInner()) props.onBackToLobby();
              }}
            >
              <SVG d={Ico.back} size={20} />
            </button>
          </div>
        </div>

        <div
          className="dyt-cap"
          onClick={() => {
            if (longPress.wasLongPressTriggered()) return;
            if (spokenFull) toggleVoice();
          }}
          {...longPress.handlers}
        >
          <div className="dyt-cap__text">
            {zhLine ? (
              <p className="dyt-cap__zh" style={{ fontSize: smallZhSize }}>
                {zhLine}
              </p>
            ) : null}
            {jaLine ? (
              <p
                className="dyt-cap__ja"
                style={
                  jaOnly
                    ? {
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: '#fff',
                        textShadow:
                          '-1px 0 0 #000, 1px 0 0 #000, 0 -1px 0 #000, 0 1px 0 #000',
                      }
                    : undefined
                }
              >
                {jaLine}
              </p>
            ) : null}
            {!zhLine && !jaLine && (
              <p className="dyt-cap__empty">
                {props.isGenerating ? '主播正在准备下一句…' : '这一拍还没有台词'}
              </p>
            )}
          </div>
        </div>

        {pairTip ? (
          <div className={`dyt-ptip${pairTip.blocked ? ' is-blocked' : ''}`} role="status">
            <span className="dyt-ptip__arrow" aria-hidden="true">
              {pairTip.dir === -1 ? '‹' : '›'}
            </span>
            <span>
              第 {pairIndex + 1}/{sentenceCount} 句
            </span>
            {sentenceCount <= 8 ? (
              <span className="dyt-ptip__dots" aria-hidden="true">
                {pairAlignment.spokenLines.map((_, i) => (
                  <i
                    key={i}
                    className={`dyt-ptip__dot${i === pairIndex ? ' is-on' : ''}${i < pairIndex ? ' is-past' : ''}`}
                  />
                ))}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="dyt-player__bar">
          <SeekBar
            label="直播进度"
            min={0}
            max={maxIdx}
            value={Math.min(currentGlobalBeatIdx, maxIdx)}
            onChange={seek}
            tone="player"
          />
        </div>

        {renderStageAvatar()}

        {/* 全屏时这里不画：全屏自己那条在下面，否则两条红条会叠在一起（z-index 55 > 全屏 30） */}
        {giftEffect && !props.isFullscreen && (
          <div
            key={giftEffect.key}
            className="dyt-fx"
            style={{ background: giftEffect.color, color: giftEffect.ink }}
            role="status"
          >
            {giftEffect.emoji ? <span className="dyt-fx__emoji">{giftEffect.emoji}</span> : null}
            <div>
              <div className="dyt-fx__label">
                {giftEffect.kind === 'sc' ? 'Super Chat 付费留言' : '频道礼物打赏'}
              </div>
              <div className="dyt-fx__main">
                {giftEffect.name}
                {giftEffect.amount ? ` · ${giftEffect.amount}` : ''}
              </div>
            </div>
          </div>
        )}
      </section>

      <header className="dyt-meta">
        <button type="button" className="dyt-meta__title" onClick={() => setTitleOpen(true)}>
          {session.title}
        </button>
        <div className="dyt-meta__row">
          <div className={`dyt-av-wrap${ended ? '' : ' is-live'}${voiceOn ? ' is-speaking' : ''}`}>
            {renderAvatar()}
            {!ended && (
              <span className="dyt-av-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                  <path
                    d={Ico.signal}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
          </div>
          <div className="dyt-who">
            <div className="dyt-name">{displayName}</div>
            <div className="dyt-subline">
              <span>{channel.handle || `@${displayName}`}</span>
              <span aria-hidden="true">·</span>
              <span>{viewerText}</span>
            </div>
          </div>
          <button
            type="button"
            className={`dyt-sub-btn${subscribed ? ' is-on' : ''}`}
            onClick={() => setSubscribed(v => !v)}
          >
            {subscribed ? '已订阅' : '订阅'}
          </button>
          <button
            type="button"
            className="dyt-ico"
            aria-label="更多"
            onClick={() => setSettingsOpen(true)}
          >
            <SVG d={Ico.more} size={22} />
          </button>
        </div>
      </header>

      <section className="dyt-content">
        <div className="dyt-chead">
          <div className="dyt-chead__left">
            <div className="dyt-chead__titlerow">
              <h2 className="dyt-chead__title">{tabLabel}</h2>
              <span className="dyt-chead__count">
                <SVG d={Ico.person} size={16} />
                {formatCount(session.viewerCount)}
              </span>
            </div>
          </div>
          <div className="dyt-chead__tools">
            <button
              type="button"
              className="dyt-ico"
              aria-label="全屏"
              onClick={() => props.setIsFullscreen(true)}
            >
              <SVG d={Ico.expand} size={22} />
            </button>
            <button
              type="button"
              className="dyt-ico"
              aria-label="私聊"
              onClick={() => props.setShowFloatingPhone(true)}
            >
              <SVG d={Ico.chat} size={22} />
              {props.phoneUnread && <span className="dyt-dot" />}
            </button>
            <div className={`dyt-vswitch${viewMenuOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="dyt-ico"
                aria-label="切换视图"
                aria-haspopup="listbox"
                aria-expanded={viewMenuOpen}
                onClick={() => setViewMenuOpen(v => !v)}
              >
                <SVG d={Ico.menu} size={22} />
              </button>
              {viewMenuOpen && (
                <div className="dyt-vmenu" role="listbox">
                  {(
                    [
                      ['chat', '实时聊天'],
                      ['script', '分镜'],
                      ['summary', '摘要'],
                    ] as Array<[YtTab, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={tab === id}
                      onClick={() => switchTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dyt-panel">
          {tab === 'chat' && (
            <>
              <section className="dyt-scene" aria-label="画面描写">
                <p className="dyt-scene__text">{screenText}</p>
              </section>
              <div
                className="dyt-toprow"
                aria-label="置顶留言"
                onPointerDown={e => {
                  const el = e.currentTarget;
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  const startX = e.clientX;
                  const startScroll = el.scrollLeft;
                  let dragged = false;
                  const onMove = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX;
                    if (Math.abs(dx) > 4) dragged = true;
                    el.scrollLeft = startScroll - dx;
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    if (dragged) el.dataset.dragged = '1';
                    else delete el.dataset.dragged;
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
              >
                {topChatters.map(dm => {
                  const tone = pillToneFor(dm);
                  const tier = dm.giftName ? null : scTierFor(dm);
                  const shortName =
                    dm.senderName.length > 8 ? `${dm.senderName.slice(0, 8)}…` : dm.senderName;
                  return (
                    <button
                      key={dm.id}
                      type="button"
                      className={`dyt-pill dyt-pill--${tone}`}
                      style={
                        tier
                          ? { background: tier.bodyBg, color: tier.textColor, ...goldFrame(tier) }
                          : { background: '#8e24aa', color: '#ffffff' }
                      }
                      onClick={e => {
                        const row = e.currentTarget.parentElement as HTMLElement | null;
                        if (row?.dataset.dragged === '1') {
                          delete row.dataset.dragged;
                          return;
                        }
                        setPinDetail(dm);
                      }}
                    >
                      <span className="dyt-pill__av">{initial(dm.senderName)}</span>
                      <span className="dyt-pill__name">@{shortName}</span>
                      {dm.giftName ? (
                        <span className="dyt-pill__gift">
                          {dm.giftEmoji || '🎁'}
                          {dm.giftAmount != null
                            ? ` ${dm.giftCurrency || '¥'}${dm.giftAmount}`
                            : ''}
                        </span>
                      ) : (
                        <span className="dyt-pill__amt">
                          {dm.scCurrency || '¥'}
                          {dm.scAmount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div
                className="dyt-list"
                ref={props.chatScrollRef as React.RefObject<HTMLDivElement>}
                aria-live="polite"
              >
                {renderChatList()}
              </div>
            </>
          )}
          {tab === 'script' && (
            <div className="dyt-list" style={{ paddingTop: 4 }}>
              {renderScript()}
            </div>
          )}
          {tab === 'summary' && (
            <div className="dyt-list" style={{ paddingTop: 10 }}>
              {renderSummary()}
            </div>
          )}
        </div>
      </section>

      <footer className="dyt-composer">
        {renderGuidanceCue()}
        <form
          className="dyt-composer__row"
          onSubmit={e => {
            e.preventDefault();
            props.handleSendSubmit();
          }}
        >
          <button
            type="button"
            className={`dyt-ident${activePersona.isMain ? ' is-main' : ' is-anon'}`}
            aria-label="切换发言身份"
            onClick={cyclePersona}
          >
            {activePersona.isMain ? '本' : '匿'}
          </button>
          <label className="dyt-field">
            <input
              type="text"
              value={props.danmakuInput}
              onChange={e => props.setDanmakuInput(e.target.value)}
              placeholder="聊天…"
              aria-label="发送弹幕"
              maxLength={200}
            />
            <button
              type="button"
              className={`dyt-send${props.danmakuInput.trim() ? ' is-ready' : ''}`}
              aria-label="发送"
              disabled={!props.danmakuInput.trim()}
              onClick={() => props.handleSendSubmit()}
            >
              <SVG d={Ico.send} size={20} />
            </button>
          </label>
          <button
            type="button"
            className="dyt-cico"
            disabled={currentGlobalBeatIdx <= 0}
            aria-label="上一拍"
            onClick={() => seek(currentGlobalBeatIdx - 1)}
          >
            <SVG d={Ico.prevBeat} size={22} />
          </button>
          <button
            type="button"
            className={`dyt-cico${props.isGenerating ? ' is-busy' : ''}`}
            disabled={ended && atEnd}
            aria-label={props.isGenerating ? '正在生成下一拍' : '继续'}
            aria-busy={props.isGenerating}
            onClick={advance}
          >
            <SVG d={Ico.nextBeat} size={22} />
          </button>
          <button
            type="button"
            className="dyt-cico"
            aria-label="打赏与礼物"
            onClick={() => {
              setSupportTab('gift');
              props.setActiveBottomDrawer('gift');
            }}
          >
            <SVG d={Ico.gift} size={22} />
          </button>
          <button
            type="button"
            className={`dyt-cico${props.pendingGuidance.length ? ' is-on' : ''}`}
            aria-label="导演引导"
            onClick={() => setGuidanceOpen(true)}
          >
            <SVG d={Ico.director} size={22} />
          </button>
        </form>
      </footer>

      {/* ==================== 全屏机位（独立一套，不是小窗放大） ==================== */}
      {props.isFullscreen && (
        <div className="dyt-fs" onClick={e => handlePlayerTap(e, 'full')}>
          {renderBackdrop('dyt-fs__scene')}

          <header className="dyt-fsbar" ref={fsBarRef}>
            <button
              type="button"
              className="dyt-fsbar__ico"
              aria-label="退出全屏"
              onClick={() => props.setIsFullscreen(false)}
            >
              <SVG d={Ico.back} size={24} />
            </button>
            <div className="dyt-fsbar__mid">
              <p className="dyt-fsbar__title">{session.title}</p>
              {/* Ann 2026-10-24：标题下面一行在线人数，只要图标 + 人数，不要文字 */}
              <p className="dyt-fsbar__views">
                <SVG d={Ico.person} size={13} />
                {formatCount(session.viewerCount)}
              </p>
            </div>
            <button
              type="button"
              className="dyt-fsbar__ico"
              aria-label="设置"
              onClick={() => setSettingsOpen(true)}
            >
              <SVG d={Ico.gear} size={24} />
              {props.phoneUnread && <span className="dyt-dot" />}
            </button>
          </header>

          <aside className="dyt-note" style={{ top: fsBarH + 8 }}>
            <span className="dyt-note__dot" aria-hidden="true" />
            <div className="dyt-note__body">
              <p className="dyt-note__kicker">镜头</p>
              <p className="dyt-note__text">{screenText}</p>
            </div>
          </aside>

          <section className="dyt-lines" aria-label="本拍语音">
            {/* 全屏双击切句的提示：内容跟小窗那条一模一样，
                位置挪到台词正上方（全屏中间那块是空的，贴台词最顺眼，
                也不压顶栏和镜头笺）。它是这一块的第一个孩子，
                出现/消失只让整块往上长或缩，台词本身一动不动。 */}
            {pairTip ? (
              <div className={`dyt-ptip dyt-ptip--fs${pairTip.blocked ? ' is-blocked' : ''}`} role="status">
                <span className="dyt-ptip__arrow" aria-hidden="true">
                  {pairTip.dir === -1 ? '‹' : '›'}
                </span>
                <span>
                  第 {pairIndex + 1}/{sentenceCount} 句
                </span>
                {sentenceCount <= 8 ? (
                  <span className="dyt-ptip__dots" aria-hidden="true">
                    {pairAlignment.spokenLines.map((_, i) => (
                      <i
                        key={i}
                        className={`dyt-ptip__dot${i === pairIndex ? ' is-on' : ''}${i < pairIndex ? ' is-past' : ''}`}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            ) : null}
            {/* 台词单独包一层：长台词超高度时只把这一层裁掉（底部渐隐），
                上面那条「第 N/M 句」小提示留在外面，不会被裁掉也不会被渐隐盖住 */}
            <div
              className={`dyt-lines__text${linesClipped ? ' is-clipped' : ''}`}
              ref={linesTextRef}
            >
              {zhLine ? (
                <p
                  className="dyt-lines__zh"
                  style={{ fontSize: fsZhSize }}
                  onClick={() => {
                    if (longPress.wasLongPressTriggered()) return;
                    toggleVoice();
                  }}
                  {...longPress.handlers}
                >
                  {zhLine}
                </p>
              ) : null}
              {jaLine ? (
                <p
                  className="dyt-lines__ja"
                  style={jaOnly ? { fontSize: 18, fontWeight: 700, color: '#0f0f0f' } : undefined}
                >
                  {jaLine}
                </p>
              ) : null}
              {!zhLine && !jaLine && (
                <p className="dyt-lines__ja">
                  {props.isGenerating ? '主播正在准备下一句…' : '这一拍还没有台词'}
                </p>
              )}
            </div>
          </section>

          <div
            className="dyt-rail"
            aria-label="全屏左下弹幕"
            ref={railRef}
            onScroll={handleRailScroll}
            onPointerDown={stopRailAuto}
            onWheel={stopRailAuto}
          >
            {railHistory.map((dm, i) => renderRailChip(dm, `h_${dm.id || i}`))}
            {railFlow.map(({ dm, seq }) => renderRailChip(dm, `l_${seq}`, true))}
          </div>

          {renderStageAvatar('dyt-fs__avatar')}

          {giftEffect && (
            <div
              key={`fs-${giftEffect.key}`}
              className="dyt-fx"
              style={{ background: giftEffect.color, color: giftEffect.ink, top: fsBarH + 12 }}
              role="status"
            >
              {giftEffect.emoji ? <span className="dyt-fx__emoji">{giftEffect.emoji}</span> : null}
              <div>
                <div className="dyt-fx__label">
                  {giftEffect.kind === 'sc' ? 'Super Chat 付费留言' : '频道礼物打赏'}
                </div>
                <div className="dyt-fx__main">
                  {giftEffect.name}
                  {giftEffect.amount ? ` · ${giftEffect.amount}` : ''}
                </div>
              </div>
            </div>
          )}

          <div className="dyt-dock">
            <div className="dyt-dock__track">
              <SeekBar
                label="直播进度"
                min={0}
                max={maxIdx}
                value={Math.min(currentGlobalBeatIdx, maxIdx)}
                onChange={seek}
                tone="dock"
              />
            </div>
            {renderGuidanceCue()}
            <div className="dyt-dock__row">
              <div className="dyt-skips" role="group" aria-label="切拍">
                <button
                  type="button"
                  disabled={currentGlobalBeatIdx <= 0}
                  aria-label="上一拍"
                  onClick={() => seek(currentGlobalBeatIdx - 1)}
                >
                  <SVG d={Ico.prevSkip} size={22} />
                </button>
                <button
                  type="button"
                  className={props.isGenerating ? 'is-busy' : undefined}
                  disabled={ended && atEnd}
                  aria-label={props.isGenerating ? '正在生成下一拍' : '下一拍'}
                  aria-busy={props.isGenerating}
                  onClick={advance}
                >
                  <SVG d={Ico.nextSkip} size={22} />
                </button>
              </div>
              <div className={`dyt-compose${composeFocus ? ' is-focus' : ''}`}>
                <button
                  type="button"
                  className={`dyt-compose__ident${activePersona.isMain ? ' is-main' : ' is-anon'}`}
                  aria-label="切换发言身份"
                  onClick={cyclePersona}
                >
                  {activePersona.isMain ? '本' : '匿'}
                </button>
                <input
                  type="text"
                  value={props.danmakuInput}
                  onChange={e => props.setDanmakuInput(e.target.value)}
                  onFocus={() => setComposeFocus(true)}
                  onBlur={() => setComposeFocus(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      props.handleSendSubmit();
                    }
                  }}
                  placeholder="聊天…"
                  aria-label="发送弹幕"
                />
                {props.danmakuInput.trim() ? (
                  <button
                    type="button"
                    className="dyt-send is-ready"
                    aria-label="发送"
                    onClick={() => props.handleSendSubmit()}
                    style={{ width: 28, height: 28 }}
                  >
                    <SVG d={Ico.send} size={16} />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="dyt-dock__btn"
                aria-label="打赏与礼物"
                onClick={() => {
                  setSupportTab('gift');
                  props.setActiveBottomDrawer('gift');
                }}
              >
                <SVG d={Ico.gift} size={22} />
              </button>
              <button
                type="button"
                className={`dyt-dock__btn${props.pendingGuidance.length ? ' is-on' : ''}`}
                aria-label="导演引导"
                onClick={() => setGuidanceOpen(true)}
              >
                <SVG d={Ico.director} size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 浮层 ==================== */}
      {titleOpen && (
        <YtSheet title={session.title} onClose={() => setTitleOpen(false)}>
          <div className="dyt-stats">
            <div className="dyt-stat">
              <strong>{formatCount(session.viewerCount)}</strong>
              <span>在看</span>
            </div>
            <div className="dyt-stat">
              <strong>
                {`${Math.min(currentGlobalBeatIdx + 1, Math.max(1, allTimelineBeats.length))}/${
                  allTimelineBeats.length || 1
                }`}
              </strong>
              <span>当前拍</span>
            </div>
            <div className="dyt-stat">
              <strong>{ended ? 'REPLAY' : 'LIVE'}</strong>
              <span>状态</span>
            </div>
          </div>
          <div className="dyt-tags">
            <span className="dyt-tag">{session.categoryLabel}</span>
            <span className="dyt-tag">{channel.handle || `@${displayName}`}</span>
            <span className="dyt-tag">{formatCount(channel.followerCount)} 位订阅者</span>
          </div>
          {(session.customTopic || channel.bio) && (
            <div className="dyt-block">{session.customTopic || channel.bio}</div>
          )}
        </YtSheet>
      )}

      {settingsOpen && (
        <YtSheet title="直播间设置" onClose={() => setSettingsOpen(false)}>
          <section className="dyt-sheet__section" aria-label="本场">
            <p className="dyt-sheet__section-label">本场</p>
            <button
              type="button"
              className="dyt-menu"
              onClick={() => {
                setSettingsOpen(false);
                props.setShowFloatingPhone(true);
              }}
            >
              <span className="dyt-menu__main">
                <strong>私聊小窗</strong>
              </span>
              {props.phoneUnread && (
                <span className="dyt-menu__value" style={{ color: '#d93025', fontWeight: 700 }}>
                  有新消息
                </span>
              )}
            </button>
            <button
              type="button"
              className="dyt-menu"
              onClick={() => {
                setSettingsOpen(false);
                props.onEndStreamClick();
              }}
            >
              <span className="dyt-menu__main">
                <strong style={{ color: ended ? '#0f0f0f' : '#d93025' }}>
                  {ended ? '查看下播纪要' : '下播并结算'}
                </strong>
                <span>标记本场结束并离开本页</span>
              </span>
            </button>
          </section>

          <section className="dyt-sheet__section" aria-label="频道">
            <p className="dyt-sheet__section-label">频道</p>
            <button
              type="button"
              className="dyt-menu"
              onClick={() => props.onChangePlatformTheme('niconico')}
            >
              <span className="dyt-menu__main">
                <strong>平台外观</strong>
                <span>切到ニコニコ生放送</span>
              </span>
              <span className="dyt-menu__value">YouTube Live</span>
            </button>
            <button
              type="button"
              className="dyt-menu"
              onClick={() => {
                setSettingsOpen(false);
                props.onOpenPersonaModal();
              }}
            >
              <span className="dyt-menu__main">
                <strong>发言身份</strong>
                <span>本尊 / 匿名马甲</span>
              </span>
              <span className="dyt-menu__value">
                {activePersona.isMain ? '本尊' : '匿名'} · {activePersona.name}
              </span>
            </button>
            <button
              type="button"
              className="dyt-menu"
              onClick={() => {
                setSettingsOpen(false);
                props.onOpenChannelSettings();
              }}
            >
              <span className="dyt-menu__main">
                <strong>频道人设与语音</strong>
                <span>改完仍留在本页</span>
              </span>
            </button>
            <button
              type="button"
              className="dyt-menu"
              onClick={() => {
                setSettingsOpen(false);
                props.bgFileInputRef.current?.click();
              }}
            >
              <span className="dyt-menu__main">
                <strong>直播间背景</strong>
                <span>选图后替换画面</span>
              </span>
            </button>
            <button
              type="button"
              className="dyt-menu"
              onClick={() => {
                setSettingsOpen(false);
                setSupportTab('gift');
                props.setActiveBottomDrawer('gift');
              }}
            >
              <span className="dyt-menu__main">
                <strong>频道专属礼物</strong>
              </span>
              <span className="dyt-menu__value">{props.activeGifts.length} 件</span>
            </button>
          </section>

          <section className="dyt-sheet__section" aria-label="播放">
            <p className="dyt-sheet__section-label">播放</p>
            <ToggleRow
              title="顶部飘屏弹幕"
              checked={props.showDanmakuOverlay}
              onToggle={() => props.setShowDanmakuOverlay(v => !v)}
            />
            <ToggleRow
              title="外语同传与弹幕翻译"
              checked={props.showTranslation}
              onToggle={() => props.setShowTranslation(v => !v)}
            />
            <ToggleRow
              title="发弹幕后主播立即接话"
              checked={props.immediateReplyOnSend}
              onToggle={() => props.setImmediateReplyOnSend(v => !v)}
            />
            <ToggleRow
              title="语音播完自动跳下一拍"
              checked={props.autoPlayStep}
              onToggle={() => props.setAutoPlayStep(v => !v)}
            />
            <ToggleRow
              title="字跟着录音换"
              checked={props.followVoiceSentences}
              onToggle={() => props.setFollowVoiceSentences(v => !v)}
            />
            <ToggleRow
              title="台词出现后静默预生成语音"
              checked={props.preGenerateVoice}
              onToggle={props.onTogglePreGenerateVoice}
            />
            <ToggleRow
              title="画面中央显示主播圆盘头像（随语音起伏）"
              checked={showStageAvatar}
              onToggle={toggleStageAvatar}
            />
          </section>
        </YtSheet>
      )}

      {pinDetail && (
        <YtSheet
          title={pinDetail.giftName ? '频道礼物' : 'Super Chat'}
          onClose={() => setPinDetail(null)}
        >
          {pinDetail.scAmount && pinDetail.scAmount > 0 ? (
            (() => {
              const tier = scTierFor(pinDetail);
              const dmTrans = pinDetail.translation
                ? pinDetail.translation.replace(/^译[：:]\s*/, '').trim()
                : '';
              return (
                <article
                  className={`dyt-sc dyt-sc--${tier.color}`}
                  style={{ color: tier.textColor, margin: 0, ...goldFrame(tier) }}
                >
                  <div className="dyt-sc__head" style={{ background: tier.headerBg }}>
                    <span className="dyt-sc__av">{initial(pinDetail.senderName)}</span>
                    <span className="dyt-sc__name">@{pinDetail.senderName}</span>
                    <span className="dyt-sc__amount">
                      {pinDetail.scCurrency || '¥'}
                      {pinDetail.scAmount}
                    </span>
                  </div>
                  <div className="dyt-sc__body" style={{ background: tier.bodyBg }}>
                    <p className="dyt-sc__text">
                      {pinDetail.text}
                      {props.showTranslation && dmTrans && dmTrans !== pinDetail.text ? (
                        <span className="dyt-sc__trans">{dmTrans}</span>
                      ) : null}
                    </p>
                    <p className="dyt-hint" style={{ marginTop: 10 }}>
                      {tier.colorLabel}卡片 · {tier.pinDurationLabel}
                    </p>
                  </div>
                </article>
              );
            })()
          ) : (
            <article className="dyt-gift" style={{ margin: 0 }}>
              <span className="dyt-gift__mark" aria-hidden="true">
                <SVG d={Ico.gift} size={18} />
              </span>
              <div>
                <div className="dyt-gift__title">
                  {pinDetail.senderName} 送出 {pinDetail.giftName}
                </div>
                {getLiveDanmakuComment(pinDetail) ? (
                  <div className="dyt-gift__note">{getLiveDanmakuComment(pinDetail)}</div>
                ) : null}
                <div className="dyt-gift__meta">
                  {pinDetail.giftCurrency || '¥'}
                  {pinDetail.giftAmount ?? 0}
                  {` · ×${pinDetail.giftCount && pinDetail.giftCount > 1 ? pinDetail.giftCount : 1}`}
                </div>
              </div>
            </article>
          )}
        </YtSheet>
      )}

      {props.activeBottomDrawer !== 'none' && (
        <YtSheet title="打赏与礼物" onClose={() => props.setActiveBottomDrawer('none')}>
          <div className="dyt-seg">
            <button
              type="button"
              className={supportTab === 'sc' ? 'is-on' : ''}
              aria-selected={supportTab === 'sc'}
              onClick={() => {
                setSupportTab('sc');
                props.setActiveBottomDrawer('sc');
              }}
            >
              Super Chat
            </button>
            <button
              type="button"
              className={supportTab === 'gift' ? 'is-on' : ''}
              aria-selected={supportTab === 'gift'}
              onClick={() => {
                setSupportTab('gift');
                props.setActiveBottomDrawer('gift');
              }}
            >
              频道礼物
            </button>
          </div>

          {supportTab === 'sc' ? (
            <>
              <p className="dyt-hint">选择金额档位，留言会以醒目卡片出现在实时聊天。¥800 起可以自己填，是红底金边。</p>
              <div className="dyt-tiers">
                {SC_TIER_OPTIONS.map((tier, idx) =>
                  tier.goldBorder ? null : (
                    <button
                      key={tier.amount}
                      type="button"
                      className={`dyt-tier${props.selectedScTierIdx === idx && Math.floor(Number(customScText) || 0) < SC_CUSTOM_MIN ? ' is-on' : ''}`}
                      onClick={() => {
                        setCustomScText('');
                        props.setSelectedScTierIdx(idx);
                      }}
                    >
                      {tier.label}
                      <small>{tier.pinDurationLabel.replace('置顶 ', '')}</small>
                    </button>
                  ),
                )}
              </div>
              <label className="dyt-custom-sc">
                自定义
                <input
                  type="number"
                  min={SC_CUSTOM_MIN}
                  inputMode="numeric"
                  value={customScText}
                  placeholder="800"
                  aria-label="自定义 Super Chat 金额"
                  onChange={e => setCustomScText(e.target.value)}
                />
                <span>元起，红底金边</span>
              </label>
              <label className="dyt-scnote">
                <textarea
                  rows={3}
                  value={props.danmakuInput}
                  onChange={e => props.setDanmakuInput(e.target.value)}
                  placeholder={`以「${activePersona.name}」写一句醒目留言…`}
                />
              </label>
              <button
                type="button"
                className="dyt-submit"
                disabled={!props.danmakuInput.trim()}
                onClick={() => {
                  const custom = Math.floor(Number(customScText) || 0);
                  const usingCustom = custom >= SC_CUSTOM_MIN;
                  showToast(usingCustom ? `Super Chat · ¥${custom} 红底金边` : `Super Chat · ${SC_TIER_OPTIONS[props.selectedScTierIdx]?.label || ''}`);
                  props.handleSendSubmit(usingCustom ? { scAmount: custom } : undefined);
                  if (usingCustom) setCustomScText('');
                }}
              >
                发送 {Math.floor(Number(customScText) || 0) >= SC_CUSTOM_MIN
                  ? `¥${Math.floor(Number(customScText))} 红底金边`
                  : SC_TIER_OPTIONS[props.selectedScTierIdx]?.label || ''} Super Chat
              </button>
            </>
          ) : (
            <>
              <p className="dyt-hint">
                当前身份：<strong style={{ color: '#0f0f0f' }}>{activePersona.name}</strong>
              </p>
              {props.activeGifts.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <p className="dyt-hint">暂无频道礼物</p>
                  <button
                    type="button"
                    className="dyt-submit"
                    style={{ width: 'auto', padding: '0 16px' }}
                    onClick={props.onOpenChannelSettings}
                  >
                    去频道设置选择或生成礼物
                  </button>
                </div>
              ) : (
                <div className="dyt-gifts">
                  {props.activeGifts.map((gift: StreamGiftOption) => (
                    <button
                      key={gift.id}
                      type="button"
                      className="dyt-gift-tile"
                      onClick={() => {
                        showToast(`礼物 · ${gift.emoji || '🎁'} ${gift.name}`);
                        props.handleSendGift(gift);
                      }}
                    >
                      <span className="dyt-gift-tile__emoji">{gift.emoji || '🎁'}</span>
                      <span className="dyt-gift-tile__name">{gift.name}</span>
                      <span className="dyt-gift-tile__price">
                        {gift.currencySymbol}
                        {gift.price}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="dyt-hint" style={{ marginTop: 12, fontSize: 11, color: '#909090' }}>
                频道礼物是数字贴纸打赏，不是现实实物；和 Super Chat 付费留言分开计算。
              </p>
            </>
          )}
        </YtSheet>
      )}

      {guidanceOpen && (
        <YtSheet title="导演引导" onClose={() => setGuidanceOpen(false)}>
          {props.pendingGuidance.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {props.pendingGuidance.map(g => (
                <div key={g.id} className="dyt-menu" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <span className="dyt-menu__main">
                    <strong>待生效</strong>
                    <span style={{ display: 'block', marginTop: 2, color: '#0f0f0f', fontSize: 13 }}>
                      {g.text}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="移除这条引导"
                    style={{ color: '#d93025', fontWeight: 700, fontSize: 13 }}
                    onClick={() => props.onRemoveGuidance(g.id)}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="dyt-scnote">
            <textarea
              rows={3}
              value={guidanceDraft}
              onChange={e => setGuidanceDraft(e.target.value)}
              placeholder="写下一段走向…"
            />
          </label>
          <button
            type="button"
            className="dyt-submit"
            disabled={!guidanceDraft.trim()}
            onClick={() => {
              props.onAddGuidance(guidanceDraft.trim());
              setGuidanceDraft('');
              setGuidanceOpen(false);
            }}
          >
            加入引导
          </button>
        </YtSheet>
      )}

      <input
        ref={props.bgFileInputRef as React.Ref<HTMLInputElement>}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={props.handleUploadBgFile}
      />

      <LiveFloatingPhone
        isOpen={props.showFloatingPhone}
        characterId={props.charId}
        charName={props.charName}
        onClose={() => props.setShowFloatingPhone(false)}
        onUnreadChange={props.onPhoneUnread}
      />

      <BeatLongPressSheet
        target={props.actionSheetTarget}
        ttsLoading={Boolean(props.ttsLoadingBeatId)}
        onClose={() => props.setActionSheetTarget(null)}
        onNudgeVoice={props.onNudgeVoice}
        voiceSeekEnabled={Boolean(
          props.actionSheetTarget?.beatId &&
            props.ttsPlayingBeatId === props.actionSheetTarget.beatId,
        )}
      />

      {toast && (
        <div key={toast.key} className="dyt-toast" role="status">
          {toast.html}
        </div>
      )}
    </div>
  );
}

/* ==================== 小组件 ==================== */

function YtSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="dyt-ov" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dyt-sheet"
        onClick={e => e.stopPropagation()}
      >
        <div className="dyt-grab" />
        <h2 className="dyt-sheet__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  checked,
  onToggle,
}: {
  title: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="dyt-switchrow"
      onClick={onToggle}
    >
      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{title}</span>
      <span className={`dyt-switch${checked ? ' is-on' : ''}`} />
    </button>
  );
}

/**
 * 进度细轨：已播段由深到亮、未播段往右淡出；头部一颗白底红芯光点。
 * 拖动 = 换拍（既有能力）。
 */
function SeekBar({
  label,
  min,
  max,
  value,
  onChange,
  tone,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  tone: 'player' | 'dock';
}) {
  const span = Math.max(1, max - min);
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  const track =
    tone === 'player'
      ? `linear-gradient(to right, #ff0000 0%, #ff0000 ${pct}%, rgba(255,255,255,0.35) ${pct}%, rgba(255,255,255,0.35) 100%)`
      : `linear-gradient(to right, #ff0033 0%, #ff0033 ${pct}%, #e5e5e5 ${pct}%, #e5e5e5 100%)`;
  return (
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      value={Math.min(value, max)}
      onChange={e => onChange(Number(e.target.value))}
      className="dyt-seek"
      style={{ backgroundImage: track }}
    />
  );
}

/** 长按：480ms，10px 容差（跟旧直播间同一套手感） */
function useLongPress(onTrigger: () => void) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);
  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  useEffect(() => () => clear(), []);
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      triggeredRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      clear();
      timerRef.current = window.setTimeout(() => {
        triggeredRef.current = true;
        try {
          navigator.vibrate?.(18);
        } catch {
          /* 忽略不支持震动的浏览器 */
        }
        onTriggerRef.current();
      }, 480);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!startRef.current || timerRef.current === null) return;
      if (
        Math.abs(e.clientX - startRef.current.x) > 10 ||
        Math.abs(e.clientY - startRef.current.y) > 10
      ) {
        clear();
      }
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      onTriggerRef.current();
    },
  };
  return { handlers, wasLongPressTriggered: () => triggeredRef.current };
}
