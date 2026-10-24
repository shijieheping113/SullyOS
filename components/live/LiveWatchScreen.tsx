/**
 * 电波 (OnAir) —— 直播间视图（YouTube Live / ニコニコ生放送 两套日间皮肤）
 *
 * 结构原则：
 * 1. 画面上只留必要按钮，其余全部收进设置；画面上不写任何中文解释字。
 * 2. 视频区三层各占地盘：顶部 LIVE/人数/全屏 → 弹幕带 → 贴底字幕组。
 *    字幕组由下往上长（拍号 → 镜头描写 → 台词 → 同传），超长时按 --k 自动降字号，不滚动不截断。
 * 3. 点画面 = 播/停语音，长按 = 编辑/重Roll 菜单，不需要额外的「听语音」按钮。
 * 4. 两套皮肤共用同一骨架：YouTube 白底红标圆角；ニコニコ 炭黑顶栏与播控条、蓝标方角。
 */
import React, { useState, useRef, useEffect } from 'react';
import TokenImg from '../os/TokenImg';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  LiveBeat,
  LiveChunk,
  LiveDanmakuItem,
  LiveRollingSummary,
  StreamGiftOption,
  LivePlatformTheme,
  LiveGuidance,
  LiveVoiceClock,
  SC_TIER_OPTIONS,
} from '../../utils/liveStreamTypes';
import {
  FloatingDanmakuOverlay,
  SuperChatHighlightCard,
  LiveFloatingPhone,
  BeatLongPressSheet,
  BeatActionSheetTarget,
  useLongPressMenu,
} from './LiveSharedWidgets';
import {
  Icon,
  Sheet,
  Seek,
  LiveUiStyle,
  formatCount,
  clockFromIndex,
} from './platformChrome';
import { getLiveDanmakuComment } from '../../utils/liveStreamTimeline';
import {
  alignLiveSpeech,
  pairCursorAfterClock,
  spokenLineIndexAt,
  spokenLineStartSec,
  visibleLivePair,
} from '../../utils/liveSpeechPairs';
import { LiveSpeechPair } from './LiveSpeechPair';
import { LiveYouTubeRoom } from './LiveYouTubeRoom';

type TimelineItem = { chunkId: string; chunkIndex: number; beat: LiveBeat; globalIdx: number };

export interface LiveWatchScreenProps {
  charId: string;
  charName: string;
  userName: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  viewerPersonas: ViewerPersona[];
  activePersona: ViewerPersona;
  platformTheme: LivePlatformTheme;
  isGenerating: boolean;
  isSummarizing: boolean;
  ttsPlayingBeatId: string | null;
  ttsLoadingBeatId: string | null;
  voiceClock: LiveVoiceClock | null;
  onSeekVoice: (seconds: number) => void;
  onNudgeVoice: (deltaSec: number) => void;
  followVoiceSentences: boolean;
  setFollowVoiceSentences: React.Dispatch<React.SetStateAction<boolean>>;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  showPlayerControls: boolean;
  setShowPlayerControls: React.Dispatch<React.SetStateAction<boolean>>;
  autoPlayStep: boolean;
  setAutoPlayStep: React.Dispatch<React.SetStateAction<boolean>>;
  preGenerateVoice: boolean;
  onTogglePreGenerateVoice: () => void;
  showDanmakuOverlay: boolean;
  setShowDanmakuOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  showTranslation: boolean;
  setShowTranslation: React.Dispatch<React.SetStateAction<boolean>>;
  lowerTab: 'chat' | 'script';
  setLowerTab: (t: 'chat' | 'script') => void;
  danmakuInput: string;
  setDanmakuInput: (v: string) => void;
  activeBottomDrawer: 'none' | 'sc' | 'gift';
  setActiveBottomDrawer: (v: 'none' | 'sc' | 'gift') => void;
  selectedScTierIdx: number;
  setSelectedScTierIdx: (n: number) => void;
  immediateReplyOnSend: boolean;
  setImmediateReplyOnSend: React.Dispatch<React.SetStateAction<boolean>>;
  showFloatingPhone: boolean;
  setShowFloatingPhone: (v: boolean) => void;
  phoneUnread: boolean;
  onPhoneUnread: (unread: boolean) => void;
  actionSheetTarget: BeatActionSheetTarget | null;
  setActionSheetTarget: (t: BeatActionSheetTarget | null) => void;
  editingSummaryId: string | null;
  setEditingSummaryId: (id: string | null) => void;
  summaryDraft: string;
  setSummaryDraft: (v: string) => void;
  bgFileInputRef: React.RefObject<HTMLInputElement | null>;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  currentGlobalBeatIdx: number;
  setCurrentGlobalBeatIdx: (n: number) => void;
  allTimelineBeats: TimelineItem[];
  unfoldedChunks: LiveChunk[];
  visibleDanmakuFeed: LiveDanmakuItem[];
  scrollingDanmakuFeed: LiveDanmakuItem[];
  onEditUserDanmaku: (id: string, text: string) => void;
  onDeleteUserDanmaku: (id: string) => void;
  /** 导演引导：写接下来走向，不进公屏，生效后消失 */
  pendingGuidance: LiveGuidance[];
  onAddGuidance: (text: string) => void;
  onEditGuidance: (id: string, text: string) => void;
  /** 圈中/取消本轮一条路人弹幕，让主播下一轮必须接住 */
  onToggleDanmakuReply: (danmakuId: string) => void;
  onRemoveGuidance: (id: string) => void;
  displayAvatar?: string;
  displayBackgroundUrl: string;
  activeGifts: StreamGiftOption[];
  openBeatMenu: (chunkId: string, beat: LiveBeat, labelPrefix: string) => void;
  handleSendSubmit: (override?: { scAmount?: number }) => void;
  handleSendGift: (gift: StreamGiftOption) => void;
  handleUploadBgFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onChangePlatformTheme: (theme: LivePlatformTheme) => void;
  onSelectPersona: (id: string) => void;
  onOpenPersonaModal: () => void;
  onOpenChannelSettings: () => void;
  onBackToLobby: () => void;
  onBindBack: (fn: () => boolean) => void;
  onGenerateNextChunk: () => void;
  onPlayBeatVoice: (beat: LiveBeat, options?: { skipCache?: boolean }) => void;
  onManualFoldChunks: () => void;
  onEditRoundSummary: (chunkId: string, nextText: string) => void;
  onForwardRoundToPrivate: (chunkId: string) => void;
  onRegenerateRoundSummary: (chunk: LiveChunk) => void;
  onEndStreamClick: () => void;
}

export function LiveWatchScreen(props: LiveWatchScreenProps) {
  if (props.platformTheme !== 'niconico') return <LiveYouTubeRoom {...props} />;
  return <NicoWatchScreen {...props} />;
}

/** ニコニコ生放送：保留旧骨架（黑播放槽 / 三列コメント）。 */
function NicoWatchScreen(props: LiveWatchScreenProps) {
  const {
    channel,
    session,
    platformTheme,
    currentGlobalBeatIdx,
    allTimelineBeats,
    visibleDanmakuFeed,
    activePersona,
  } = props;

  const isNico = platformTheme === 'niconico';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [guidanceDraft, setGuidanceDraft] = useState('');
  const [editingGuidanceId, setEditingGuidanceId] = useState<string | null>(null);
  const [guidanceEditDraft, setGuidanceEditDraft] = useState('');
  // 圈出来的弹幕（只可能落在最新一轮）：抽屉里列清单，底栏 🎬 上挂数字
  const replyRequestedItems = React.useMemo(
    () =>
      session.chunks.flatMap(chunk =>
        chunk.beats.flatMap(beat => (beat.danmaku || []).filter(d => d.replyRequested)),
      ),
    [session.chunks],
  );
  const directorCount = props.pendingGuidance.length + replyRequestedItems.length;
  // 圈出来的弹幕两种状态：下轮回应（琥珀）/ 本轮已回应（蓝灰）
  const nextReplyTarget = session.chunks.length;
  const latestReplyTarget = session.chunks.length - 1;
  const replyStateOf = (dm: LiveDanmakuItem): 'pending' | 'done' | null => {
    if (!dm.replyRequested) return null;
    if (dm.replyTargetChunkIndex === nextReplyTarget) return 'pending';
    if (dm.replyTargetChunkIndex === latestReplyTarget) return 'done';
    return null;
  };
  // 送 SC / 礼物时的瞬时横幅（小窗和全屏都显示）
  const [giftEffect, setGiftEffect] = useState<{
    kind: 'sc' | 'gift';
    emoji?: string;
    name: string;
    amount?: string;
    color: string;
    key: number;
  } | null>(null);
  const giftEffectTimerRef = useRef<number | null>(null);
  const giftEffectQueueRef = useRef<LiveDanmakuItem[]>([]);
  const giftEffectRunningRef = useRef(false);
  const initialPlayedGiftIds = props.allTimelineBeats
    .slice(0, Math.max(0, props.currentGlobalBeatIdx))
    .flatMap(item => item.beat.danmaku || [])
    .filter(item => (item.scAmount && item.scAmount > 0) || item.giftName)
    .map(item => item.id)
    .filter((id): id is string => Boolean(id));
  const seenGiftEffectIdsRef = useRef(
    new Set(initialPlayedGiftIds),
  );
  const previousGiftEffectBeatIdxRef = useRef(props.currentGlobalBeatIdx);

  useEffect(() => {
    if (props.currentGlobalBeatIdx < previousGiftEffectBeatIdxRef.current) {
      // 回放进度倒退后，后续拍里的礼物重新变成未播放，供再次回放时触发。
      for (const item of props.allTimelineBeats.slice(props.currentGlobalBeatIdx)) {
        for (const dm of item.beat.danmaku || []) {
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
      const isPaidEffect = Boolean((item.scAmount && item.scAmount > 0) || item.giftName);
      if (!isPaidEffect || !item.id || seenGiftEffectIdsRef.current.has(item.id)) return false;
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
      const tier = SC_TIER_OPTIONS.find(option => option.color === item.scColor) || SC_TIER_OPTIONS[0];
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
        color: isSc ? tier.headerBg : '#ec4899',
      });
      giftEffectTimerRef.current = window.setTimeout(showNext, 2800);
    };
    showNext();
  }, [props.allTimelineBeats, props.currentGlobalBeatIdx, props.visibleDanmakuFeed]);

  useEffect(() => () => {
    if (giftEffectTimerRef.current !== null) window.clearTimeout(giftEffectTimerRef.current);
  }, []);

  // 字幕组自动收缩：以 --k 为缩放系数，量出实际高度后逐档降字号，保证任何长度都塞得下、不越界
  const stackRef = React.useRef<HTMLDivElement | null>(null);
  const stackInnerRef = React.useRef<HTMLDivElement | null>(null);
  // 台词带自己的收缩通道（跟画面里的描写各量各的，互不干扰）
  const capRef = React.useRef<HTMLDivElement | null>(null);
  const capInnerRef = React.useRef<HTMLDivElement | null>(null);

  // 画面里是否显示主播动态头像（默认关闭，把空间完全留给画面与台词；可在设置或舞台快捷开启）
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
        /* 忽略 */
      }
      return next;
    });

  const [pairCursor, setPairCursor] = useState(0);
  const [cursorBeatId, setCursorBeatId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'chat' | 'script' | 'summary'>('chat');
  const activeTab = props.lowerTab === 'script' && subTab === 'chat' ? 'script' : subTab;
  const switchTab = (next: 'chat' | 'script' | 'summary') => {
    setSubTab(next);
    props.setLowerTab(next === 'chat' ? 'chat' : 'script');
  };

  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();
  // 一套手势给公屏表格和全屏 5 条弹幕流共用；菜单也只挂一处
  const dmGestures = useDanmakuPressMenu({ onToggleReply: props.onToggleDanmakuReply });
  const item =
    allTimelineBeats[currentGlobalBeatIdx] || allTimelineBeats[allTimelineBeats.length - 1];
  const beat = item?.beat;
  const atEnd =
    allTimelineBeats.length === 0 || currentGlobalBeatIdx >= allTimelineBeats.length - 1;
  const ended = session.status === 'ended';
  const trans = beat?.speechTranslated
    ? beat.speechTranslated.replace(/^译[：:]\s*/, '').trim()
    : '';
  const spokenFull = beat?.speechOriginal || '';
  const pairAlignment = alignLiveSpeech(spokenFull, trans);
  const clockForThis = props.voiceClock && props.voiceClock.beatId === beat?.id ? props.voiceClock : null;
  const playingThis = Boolean(beat && props.ttsPlayingBeatId === beat.id && clockForThis);
  const followedIndex = props.followVoiceSentences && playingThis
    ? spokenLineIndexAt(
        pairAlignment.spokenLines,
        beat?.speechTimeline,
        clockForThis!.currentTime,
        clockForThis!.duration || beat?.speechTimeline?.durationSec,
      )
    : null;
  const beatKey = beat?.id || '';
  const beatChanged = beatKey !== cursorBeatId;
  const heldCursor = pairCursorAfterClock(pairCursor, followedIndex, beatChanged);
  if (beatChanged) setCursorBeatId(beatKey);
  if (heldCursor !== pairCursor) setPairCursor(heldCursor);
  const pairIndex = pairAlignment.spokenLines.length
    ? Math.max(0, Math.min(pairAlignment.spokenLines.length - 1, followedIndex != null ? followedIndex : heldCursor))
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
  const maxIdx = Math.max(0, allTimelineBeats.length - 1);

  // 量高逐档收缩：先按满字号排版，塞不下就 3% 一步往下收，最低收到 floor
  const fitRef = (
    box: HTMLDivElement | null,
    inner: HTMLDivElement | null,
    floor = 0.7,
  ) => {
    if (!box || !inner) return;
    const cs = getComputedStyle(box);
    const avail =
      box.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0');
    let k = 1;
    box.style.setProperty('--k', '1');
    let guard = 0;
    while (inner.getBoundingClientRect().height > avail - 1 && k > floor && guard < 30) {
      k -= 0.03;
      box.style.setProperty('--k', k.toFixed(3));
      guard += 1;
    }
  };

  React.useLayoutEffect(() => {
    const box = stackRef.current;
    const inner = stackInnerRef.current;
    if (!box || !inner) return;
    const fit = () => fitRef(box, inner);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [beat?.screen, pair.spokenLine, pair.translatedLine, props.isFullscreen, props.showTranslation]);

  // 台词带同样要收：中日双语同时灌进来时，先降一档字号，名额固定、绝不挤压聊天区
  React.useLayoutEffect(() => {
    const box = capRef.current;
    const inner = capInnerRef.current;
    if (!box || !inner) return;
    const fit = () => fitRef(box, inner, 0.56);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [pair.spokenLine, pair.translatedLine, props.showTranslation, props.isFullscreen]);

  const font = isNico
    ? '"Yu Gothic UI", "Hiragino Sans", Meiryo, "PingFang SC", "Noto Sans SC", sans-serif'
    : 'Roboto, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif';

  const seek = (n: number) => {
    props.setCurrentGlobalBeatIdx(Math.max(0, Math.min(maxIdx, n)));
  };

  const voiceOn = Boolean(beat && props.ttsPlayingBeatId === beat.id);
  const voiceBusy = Boolean(beat && props.ttsLoadingBeatId === beat.id);

  const toggleVoice = () => {
    if (!beat?.speechOriginal?.trim() || voiceBusy) return;
    props.onPlayBeatVoice(beat);
  };

  const popInner = () => {
    if (titleOpen) {
      setTitleOpen(false);
      return true;
    }
    if (props.actionSheetTarget) {
      props.setActionSheetTarget(null);
      return true;
    }
    if (props.activeBottomDrawer !== 'none') {
      props.setActiveBottomDrawer('none');
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

  // 点左下角头像只在「本尊」和「匿名」之间来回切；切到匿名时记住上次用的那个马甲，
  // 不再每次都回到默认小号。马甲多于一个、想换别的，走「管理身份」弹窗。
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

  const advance = () => {
    if (!atEnd) {
      seek(currentGlobalBeatIdx + 1);
      return;
    }
    if (!ended && !props.isGenerating) props.onGenerateNextChunk();
  };

  const openThisBeat = () => {
    if (beat && item) props.openBeatMenu(item.chunkId, beat, `第 ${currentGlobalBeatIdx + 1} 拍`);
  };

  // 自适应字号：小窗台词放在画面外的白带上，全屏台词放在气泡里，都是长文自动降档、不滚不截
  const screenText = beat?.screen || (props.isGenerating ? '主播正在镜头前反应…' : '');
  const speechText = pair.spokenLine || beat?.speechOriginal || '';
  const pickSize = (len: number, tiers: Array<[number, number]>) => {
    for (const [limit, size] of tiers) if (len <= limit) return size;
    return tiers[tiers.length - 1][1];
  };
  const speechFontSize = props.isFullscreen
    ? pickSize(speechText.length, [
        [45, 19],
        [85, 17],
        [130, 15.5],
        [1e9, 14],
      ])
    : pickSize(speechText.length, [
        [45, 15.5],
        [85, 14.5],
        [130, 13.5],
        [1e9, 13],
      ]);
  const transFontSize = props.isFullscreen ? 11.5 : 10.5;

  // 两套皮肤共用一套骨架，只换颜色与圆角：这样才像同一个产品，而不是两套临时拼的界面
  const accent = isNico ? '#0080ff' : '#FF0033';
  const ink = isNico ? '#111111' : '#0f0f0f';
  const hairline = isNico ? '#e5e8ee' : '#ececec';

  // ==================== 1. 舞台背景层（零黑罩、通透高质感画布） ====================
  const renderStageBackdrop = () => {
    if (props.displayBackgroundUrl) {
      return (
        <TokenImg
          value={props.displayBackgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      );
    }
    return (
      <>
        <div
          className="absolute inset-0"
          style={{
            background: isNico
              ? 'linear-gradient(135deg, #f4f9ff 0%, #eaf2fc 48%, #f2f4f9 100%)'
              : 'linear-gradient(135deg, #fffaf8 0%, #f8f2f6 50%, #f0f4fb 100%)',
          }}
        />
        {props.displayAvatar && (
          <TokenImg
            value={props.displayAvatar}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-25"
          />
        )}
      </>
    );
  };

  // 压在图上的字一律走「白描边」：深浅底都读得清，又不用任何黑色遮罩。
  const haloStrong: React.CSSProperties = {
    WebkitTextStroke: '2.9px rgba(255,255,255,0.95)',
    paintOrder: 'stroke fill',
  };
  const haloSoft: React.CSSProperties = {
    WebkitTextStroke: '2.2px rgba(255,255,255,0.92)',
    paintOrder: 'stroke fill',
  };
  // 压在图上的图标：深色字 + 白色柔光，同样不靠任何底色块
  const haloIcon: React.CSSProperties = {
    color: '#2b3440',
    filter:
      'drop-shadow(0 0 1.4px rgba(255,255,255,1)) drop-shadow(0 0 3px rgba(255,255,255,0.92)) drop-shadow(0 0 5px rgba(255,255,255,0.6))',
  };

  /**
   * LIVE / 生放送 标：实色块 + 纯白字。
   * 之前这里被外层灰色继承压成了灰字，务必保持 color 独立、不受父级影响。
   */
  const renderLiveBadge = (compact = false) => {
    const label = isNico ? (ended ? 'TS' : '生放送') : ended ? 'REPLAY' : 'LIVE';
    const bg = ended ? '#a3a3a3' : isNico ? '#00b34a' : '#FF0033';
    return (
      <span
        className={`inline-flex items-center gap-[3px] text-white font-extrabold tracking-wide ${
          compact ? 'h-[15px] px-[5px] text-[9px]' : 'h-[17px] px-1.5 text-[10px]'
        } ${isNico ? 'rounded-[2px]' : 'rounded-[3px]'}`}
        style={{ backgroundColor: bg, color: '#ffffff', opacity: 1 }}
      >
        <span
          className={`w-[4px] h-[4px] rounded-full bg-white ${ended ? 'opacity-70' : 'animate-pulse'}`}
        />
        {label}
      </span>
    );
  };

  const renderViewerCount = (compact = false) => (
    <span
      className={`inline-flex items-center gap-1 font-bold tabular-nums ${
        compact ? 'text-[9.5px]' : 'text-[10.5px]'
      }`}
      style={{ color: '#1f2937', ...haloSoft }}
    >
      <span style={{ ...haloIcon, display: 'inline-flex' }}>
        <Icon name="people" size={compact ? 10 : 11} />
      </span>
      {formatCount(session.viewerCount)}
    </span>
  );

  const seekProps = {
    min: 0,
    max: maxIdx,
    value: Math.min(currentGlobalBeatIdx, maxIdx),
    onChange: seek,
  };

  // ==================== 2. 小窗画面：整块播放器，描写压在里面，台词搬到画面外 ====================
  const renderSmallStage = () => (
    <div
      className="relative w-full shrink-0 overflow-hidden select-none"
      style={{ height: 'clamp(232px, 36%, 312px)' }}
    >
      <div
        className="absolute inset-0"
        onClick={() => {
          if (wasLongPressTriggered()) return;
          if (speechText) toggleVoice();
        }}
        {...bindLongPress(openThisBeat)}
      >
        {renderStageBackdrop()}
      </div>

      {/* 顶行：LIVE · 在看人数 · 全屏。人数是纯文字，不加任何白色底块 */}
      <div className="absolute inset-x-0 top-0 z-30 h-9 px-3 flex items-center gap-2">
        {renderLiveBadge()}
        {renderViewerCount()}
        <button
          type="button"
          onClick={() => props.setIsFullscreen(true)}
          aria-label="全屏"
          className="ml-auto -mr-1.5 w-8 h-8 inline-flex items-center justify-center active:opacity-60 transition"
          style={haloIcon}
        >
          <Icon name="expand" size={15} />
        </button>
      </div>

      {/* 弹幕带：只跑在画面里，绝不落到台词上；样式沿用原白描边那一套 */}
      {props.showDanmakuOverlay && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 overflow-hidden"
          style={{ top: 30, height: 63 }}
        >
          <FloatingDanmakuOverlay
            danmakuList={props.scrollingDanmakuFeed}
            showTranslation={props.showTranslation}
            visible
            platformTheme={platformTheme}
            tracks={3}
          />
        </div>
      )}

      {/* 镜头描写：贴画面底边压在图里，字号由 --k 自动收，长了也不会顶到弹幕 */}
      <div
        ref={stackRef}
        className="absolute inset-x-0 z-20 px-3.5 overflow-hidden"
        style={{ bottom: 58, maxHeight: 78, '--k': 1 } as React.CSSProperties}
      >
        <div ref={stackInnerRef}>
          {screenText && (
            <p
              className="break-words"
              style={{
                fontSize: 'calc(11px * var(--k))',
                lineHeight: 1.58,
                fontWeight: 600,
                letterSpacing: '0.012em',
                color: '#33404d',
                ...haloSoft,
              }}
            >
              {screenText}
            </p>
          )}
        </div>
      </div>

      {/* 播控：上一拍 / 继续演，压在画面下沿；进度就是最底那 3px 细线 */}
      <div className="absolute inset-x-0 bottom-[24px] z-30 flex items-center px-2.5">
        <button
          type="button"
          disabled={currentGlobalBeatIdx <= 0}
          onClick={() => seek(currentGlobalBeatIdx - 1)}
          aria-label="上一拍"
          className="w-8 h-8 -ml-1 inline-flex items-center justify-center active:scale-95 transition disabled:opacity-30"
          style={haloIcon}
        >
          <Icon name="skipBack" size={14} />
        </button>

        <button
          type="button"
          onClick={advance}
          disabled={(ended && atEnd) || props.isGenerating}
          aria-label="继续演播"
          className="ml-auto w-[30px] h-[30px] inline-flex items-center justify-center rounded-full text-white active:scale-95 transition disabled:opacity-40"
          style={{
            background: `linear-gradient(158deg, ${accent} 0%, ${isNico ? '#0068d4' : '#d8002b'} 100%)`,
            boxShadow: `0 4px 12px ${isNico ? 'rgba(0,128,255,0.28)' : 'rgba(255,0,51,0.28)'}`,
            outline: '1.5px solid rgba(255,255,255,0.8)',
            outlineOffset: -1,
          }}
        >
          {props.isGenerating ? (
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          ) : (
            <Icon name={ended && atEnd ? 'pause' : 'play'} size={12} />
          )}
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-[4px] z-40 px-3.5">
        <Seek {...seekProps} label="直播进度" variant={isNico ? 'nico' : 'yt'} thin />
      </div>

      {/* 可选「画面中央圆盘头像」：光盘 + 念台词时往外扩的声波环，默认关 */}
      {showStageAvatar && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={{ paddingBottom: 62 }}
        >
          <div className="relative flex items-center justify-center">
            {voiceOn &&
              [0, 1, 2].map(i => (
                <span
                  key={i}
                  className="absolute rounded-full live-voice-ring"
                  style={{
                    width: 84,
                    height: 84,
                    border: `2px solid ${accent}`,
                    animationDelay: `${i * 0.62}s`,
                  }}
                />
              ))}
            <div
              className={`relative rounded-full ${voiceOn ? 'live-voice-disc' : ''}`}
              style={{
                padding: 2.5,
                backgroundColor: 'rgba(255,255,255,0.94)',
                boxShadow: '0 6px 20px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.55)',
              }}
            >
              <Avatar src={props.displayAvatar} name={channel.channelName} size={72} />
            </div>
          </div>
        </div>
      )}

      <GiftEffectOverlay effect={giftEffect} />
    </div>
  );

  // ==================== 3. 台词带：画面外面的一条白带，左侧竖线就是发声指示灯 ====================
  const renderCaptionBand = () => (
    <div
      ref={capRef}
      onClick={() => {
        if (wasLongPressTriggered()) return;
        if (speechText) toggleVoice();
      }}
      {...bindLongPress(openThisBeat)}
      className="relative shrink-0 w-full bg-white px-3.5 border-b select-none overflow-hidden flex items-center"
      style={{ borderColor: hairline, height: 92, '--k': 1 } as React.CSSProperties}
    >
      <div ref={capInnerRef} className="w-full flex items-stretch gap-2.5 py-2">
        <span
          className="w-[2px] shrink-0 rounded-full transition-colors"
          style={{ backgroundColor: voiceOn ? accent : '#d7dbe1' }}
        />
        {speechText ? (
          <LiveSpeechPair
            spokenLine={pair.spokenLine || speechText}
            translatedLine={pair.translatedLine}
            showTranslation={props.showTranslation}
            showButtons={pair.count > 1}
            canPrev={pairIndex > 0}
            canNext={pairIndex < pair.count - 1}
            onPrev={() => goPair(-1)}
            onNext={() => goPair(1)}
            spokenStyle={{
              fontSize: `calc(${speechFontSize}px * var(--k))`,
              lineHeight: 1.46,
              fontWeight: 800,
              letterSpacing: '-0.012em',
              color: voiceOn ? accent : ink,
              transition: 'color 200ms',
            }}
            translatedStyle={{
              fontSize: `calc(${transFontSize}px * var(--k))`,
              lineHeight: 1.45,
              fontWeight: 600,
              color: isNico ? '#005eb8' : '#075985',
            }}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold" style={{ color: '#a1a1aa' }}>
              {props.isGenerating ? '正在准备下一句…' : '这一拍还没有台词'}
            </p>
          </div>
        )}

        {(voiceOn || voiceBusy) && (
          <span className="shrink-0 self-end pb-1">
            {voiceOn ? <VoiceWaveBars active color={accent} /> : null}
          </span>
        )}
      </div>
    </div>
  );

  // ==================== 4. 全屏：壁纸铺满整屏，主播居中，弹幕沉到左下 ====================
  const renderFullscreenFeed = () => {
    const items = visibleDanmakuFeed.slice(-5);
    if (!items.length) return null;
    return (
      <div
        className="flex flex-col justify-end gap-[3px] overflow-hidden"
        style={{
          maxHeight: 84,
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 30%)',
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 30%)',
        }}
      >
        {items.map((dm, i) => {
          const isSc = Boolean(dm.scAmount && dm.scAmount > 0);
          const isGift = Boolean(dm.giftName);
          const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
          const comment = getLiveDanmakuComment(dm);
          return (
            <p
              key={dm.id || `fs_dm_${i}`}
              className="text-[11.5px] leading-[1.35] break-words"
              style={haloSoft}
              title="长按编辑或删除；左滑让主播下一轮回应"
              {...dmGestures.pressHandlers(dm)}
            >
              {dm.replyRequested && (
                <span
                  aria-hidden="true"
                  style={{
                    color: replyStateOf(dm) === 'done' ? '#7b93b3' : '#f0a500',
                    marginRight: 4,
                    fontSize: 9,
                    verticalAlign: 1,
                  }}
                >
                  {replyStateOf(dm) === 'done' ? '✓' : '●'}
                </span>
              )}
              <span
                style={{
                  fontWeight: 800,
                  color: isSc
                    ? '#b45309'
                    : isGift
                    ? '#be185d'
                    : isMine
                    ? isNico
                      ? '#0066cc'
                      : '#047857'
                    : '#3f4a58',
                }}
              >
                {dm.senderName}
              </span>
              {isSc && <span style={{ fontWeight: 700, color: '#b45309' }}>　¥{dm.scAmount}</span>}
              {isGift && <span style={{ fontWeight: 700, color: '#be185d' }}>　{dm.giftEmoji || '🎁'} {dm.giftName}</span>}
              {comment && <span style={{ fontWeight: 600, color: '#1f2937' }}>　{comment}</span>}
            </p>
          );
        })}
      </div>
    );
  };

  const renderFullscreen = () => (
    <div className="relative flex-1 min-h-0 overflow-hidden select-none bg-[#e8ecf1]">
      {renderStageBackdrop()}

      {/* 全屏也铺一层自然横滚弹幕，和真实视频全屏一样不断从右侧飘过 */}
      {props.showDanmakuOverlay && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden"
          style={{ top: 54, height: 105 }}
        >
          <FloatingDanmakuOverlay
            danmakuList={props.scrollingDanmakuFeed}
            showTranslation={props.showTranslation}
            visible
            platformTheme={platformTheme}
            tracks={5}
          />
        </div>
      )}


      {/* 全屏播放器也保留舞台中央主播头像与语音波纹；小窗开关状态在这里共用。 */}
      {showStageAvatar && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          style={{ paddingBottom: 112 }}
        >
          <div className="relative flex items-center justify-center">
            {voiceOn &&
              [0, 1, 2].map(i => (
                <span
                  key={i}
                  className="absolute rounded-full live-voice-ring"
                  style={{
                    width: 96,
                    height: 96,
                    border: `2px solid ${accent}`,
                    animationDelay: `${i * 0.62}s`,
                  }}
                />
              ))}
            <div
              className={`relative rounded-full ${voiceOn ? 'live-voice-disc' : ''}`}
              style={{
                padding: 3,
                backgroundColor: 'rgba(255,255,255,0.94)',
                boxShadow: '0 6px 20px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.55)',
              }}
            >
              <Avatar src={props.displayAvatar} name={channel.channelName} size={84} />
            </div>
          </div>
        </div>
      )}

      {/* 顶栏：没有白色胶囊底，靠白描边读字 */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 pt-3">
        <div className="w-[28px] h-[28px] shrink-0 rounded-full overflow-hidden ring-2 ring-white">
          <Avatar src={props.displayAvatar} name={channel.channelName} size={28} />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-[12.5px] font-extrabold leading-tight truncate"
            style={{ color: '#1d2530', ...haloSoft }}
          >
            {session.title}
          </p>
          <div className="mt-[3px] flex items-center gap-1.5">
            {renderLiveBadge(true)}
            {renderViewerCount(true)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => props.setShowFloatingPhone(true)}
          aria-label="私聊"
          className="relative w-8 h-8 shrink-0 inline-flex items-center justify-center active:opacity-60"
          style={haloIcon}
        >
          <Icon name="chat" size={18} />
          {props.phoneUnread && (
            <span className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full bg-[#FF0033] ring-2 ring-white" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="设置"
          className="w-8 h-8 shrink-0 inline-flex items-center justify-center active:opacity-60"
          style={haloIcon}
        >
          <Icon name="gear" size={18} />
        </button>
        <button
          type="button"
          onClick={() => props.setIsFullscreen(false)}
          aria-label="退出全屏"
          className="w-8 h-8 shrink-0 inline-flex items-center justify-center active:opacity-60"
          style={haloIcon}
        >
          <Icon name="collapse" size={18} />
        </button>
      </div>

      {/* 底部整摞：图注 → 台词气泡 → 左下弹幕流 → 输入栏 */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col">
        {screenText && (
          <p
            className="mx-4 mb-2 text-[11px] font-semibold leading-[1.58] break-words"
            style={{ color: '#33404d', ...haloSoft }}
          >
            {screenText}
          </p>
        )}

        {speechText && (
          <div
            ref={stackRef}
            className="relative mx-4 mb-2.5 rounded-[16px] px-3.5 py-2.5 overflow-hidden"
            style={
              { backgroundColor: 'rgba(255,255,255,0.97)', maxHeight: 214, '--k': 1 } as React.CSSProperties
            }
            onClick={() => {
              if (wasLongPressTriggered()) return;
              toggleVoice();
            }}
            {...bindLongPress(openThisBeat)}
          >
            <span
              className="absolute left-6 -top-[5px] w-[11px] h-[11px] rotate-45 rounded-[2px]"
              style={{ backgroundColor: 'rgba(255,255,255,0.97)' }}
            />
            <div ref={stackInnerRef}>
              <LiveSpeechPair
                spokenLine={pair.spokenLine || speechText}
                translatedLine={pair.translatedLine}
                showTranslation={props.showTranslation}
                showButtons={pair.count > 1}
                canPrev={pairIndex > 0}
                canNext={pairIndex < pair.count - 1}
                onPrev={() => goPair(-1)}
                onNext={() => goPair(1)}
                spokenStyle={{
                  fontSize: `calc(${speechFontSize}px * var(--k))`,
                  lineHeight: 1.46,
                  fontWeight: 800,
                  letterSpacing: '-0.012em',
                  color: voiceOn ? accent : '#0f0f0f',
                  transition: 'color 200ms',
                }}
                translatedStyle={{
                  fontSize: `calc(${transFontSize}px * var(--k))`,
                  lineHeight: 1.45,
                  fontWeight: 600,
                  color: isNico ? '#005eb8' : '#075985',
                }}
              />
            </div>
          </div>
        )}

        {/* 左下弹幕流 + 右下播控：同一行贴着输入栏，按钮成组、不再单个悬空 */}
        <div className="flex items-end gap-2 px-3.5 mb-2">
          <div className="flex-1 min-w-0">
            {props.showDanmakuOverlay && renderFullscreenFeed()}
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentGlobalBeatIdx <= 0}
              onClick={() => seek(currentGlobalBeatIdx - 1)}
              aria-label="上一拍"
              className="w-9 h-9 inline-flex items-center justify-center active:scale-95 transition disabled:opacity-30"
              style={haloIcon}
            >
              <Icon name="skipBack" size={17} />
            </button>
            <button
              type="button"
              onClick={advance}
              disabled={(ended && atEnd) || props.isGenerating}
              aria-label="继续演播"
              className="w-[36px] h-[36px] inline-flex items-center justify-center rounded-full text-white active:scale-95 transition disabled:opacity-40"
              style={{
                background: `linear-gradient(158deg, ${accent} 0%, ${isNico ? '#0068d4' : '#d8002b'} 100%)`,
                boxShadow: `0 5px 14px ${isNico ? 'rgba(0,128,255,0.30)' : 'rgba(255,0,51,0.30)'}, 0 1px 0 rgba(255,255,255,0.45) inset`,
                outline: '1.5px solid rgba(255,255,255,0.85)',
                outlineOffset: -1,
              }}
            >
              {props.isGenerating ? (
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              ) : (
                <Icon name={ended && atEnd ? 'pause' : 'play'} size={15} />
              )}
            </button>
          </div>
        </div>

        {/* 进度：贴在输入栏上方的一条细线，不压任何按钮 */}
        <div className="px-4 mb-1">
          <Seek {...seekProps} label="直播进度" variant={isNico ? 'nico' : 'yt'} thin />
        </div>

        {renderComposer(true)}
      </div>

      <GiftEffectOverlay effect={giftEffect} />
    </div>
  );

  // ==================== 4. 页签：三段文字 + 细底线，不堆胶囊 ====================
  const renderLowerTabs = () => {
    const tabs: Array<{ id: 'chat' | 'script' | 'summary'; label: string }> = [
      { id: 'chat', label: isNico ? 'コメント' : '实时聊天' },
      { id: 'script', label: isNico ? '台本' : '分镜' },
      { id: 'summary', label: isNico ? '要約' : '摘要' },
    ];

    return (
      <div
        className="shrink-0 flex items-stretch px-2 h-10 border-b"
        style={{ backgroundColor: '#ffffff', borderColor: hairline }}
      >
        {tabs.map(t => {
          const on = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className="relative flex-1 inline-flex items-center justify-center"
            >
              <span
                className="text-[12.5px] transition-colors"
                style={{ fontWeight: on ? 800 : 600, color: on ? ink : '#9a9a9a' }}
              >
                {t.label}
              </span>
              {on && (
                <span
                  className="absolute bottom-0 h-[2px] rounded-full"
                  style={{ width: 20, backgroundColor: accent }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // ==================== 5. 发送栏：身份 · 输入 · 醒目留言 · 礼物 · 发送 ====================
  const renderComposer = (overlay = false) => (
    <div
      className="shrink-0"
      style={{
        backgroundColor: overlay ? 'transparent' : isNico ? '#f2f4f7' : '#ffffff',
        borderTop: overlay ? 'none' : `1px solid ${isNico ? '#e0e4ea' : hairline}`,
      }}
    >
      {/* 导演台（本轮指令 + 待回应弹幕）收进底栏 🎬 打开的抽屉 */}
    <form
      onSubmit={e => {
        e.preventDefault();
        props.handleSendSubmit();
      }}
      className="flex items-center gap-1.5 px-2 pt-2"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={cyclePersona}
        aria-label="切换发言身份"
        className="w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold transition active:scale-95"
        style={
          activePersona.isMain
            ? {
                backgroundColor: overlay ? 'rgba(255,255,255,0.9)' : isNico ? '#e8eef7' : '#f2f2f2',
                color: isNico ? '#334155' : '#0f0f0f',
              }
            : { backgroundColor: overlay ? '#1d2530' : isNico ? '#252525' : '#0f0f0f', color: '#ffffff' }
        }
      >
        {activePersona.isMain ? '本' : '匿'}
      </button>

      <input
        value={props.danmakuInput}
        onChange={e => props.setDanmakuInput(e.target.value)}
        placeholder={isNico ? 'コメントを入力…' : '发一条弹幕…'}
        aria-label="发送弹幕"
        className="flex-1 min-w-0 h-9 px-3 text-[12.5px] placeholder:text-[#a3a3a3] focus:outline-none transition"
        style={{
          backgroundColor: overlay ? 'rgba(255,255,255,0.92)' : isNico ? '#ffffff' : '#f2f2f2',
          border: `1px solid ${overlay ? 'rgba(255,255,255,0.95)' : isNico ? '#d5dae2' : 'transparent'}`,
          borderRadius: isNico && !overlay ? 4 : 999,
          color: ink,
        }}
      />

      <button
        type="button"
        onClick={() =>
          props.setActiveBottomDrawer(props.activeBottomDrawer === 'sc' ? 'none' : 'sc')
        }
        aria-label={isNico ? 'ニコニ広告' : 'Super Chat'}
        className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full transition active:scale-95"
        style={
          props.activeBottomDrawer === 'sc'
            ? { backgroundColor: '#f59e0b', color: '#ffffff' }
            : {
                backgroundColor: overlay ? 'rgba(255,255,255,0.9)' : isNico ? '#e8ecf2' : '#f2f2f2',
                color: isNico ? '#4b5563' : ink,
              }
        }
      >
        <Icon name="yen" size={15} />
      </button>

      <button
        type="button"
        onClick={() =>
          props.setActiveBottomDrawer(props.activeBottomDrawer === 'gift' ? 'none' : 'gift')
        }
        aria-label="投喂礼物"
        className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full transition active:scale-95"
        style={
          props.activeBottomDrawer === 'gift'
            ? { backgroundColor: '#ec4899', color: '#ffffff' }
            : {
                backgroundColor: overlay ? 'rgba(255,255,255,0.9)' : isNico ? '#e8ecf2' : '#f2f2f2',
                color: isNico ? '#4b5563' : ink,
              }
        }
      >
        <Icon name="gift" size={15} />
      </button>

      <button
        type="button"
        onClick={() => setGuidanceOpen(v => !v)}
        aria-label="导演台"
        title="导演台：本轮指令与要回应的弹幕"
        className="relative w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full transition active:scale-95"
        style={
          guidanceOpen
            ? { backgroundColor: '#f59e0b', color: '#ffffff' }
            : {
                backgroundColor: overlay ? 'rgba(255,255,255,0.9)' : isNico ? '#e8ecf2' : '#f2f2f2',
                color: isNico ? '#4b5563' : ink,
              }
        }
      >
        🎬
        {directorCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#e11d48] text-white text-[10px] font-extrabold leading-[15px] text-center border border-white">
            {directorCount}
          </span>
        )}
      </button>

      <button
        type="submit"
        disabled={!props.danmakuInput.trim()}
        aria-label="发送"
        className="w-[34px] h-[34px] shrink-0 inline-flex items-center justify-center rounded-full text-white disabled:opacity-30 transition active:scale-95"
        style={{ backgroundColor: accent }}
      >
        <Icon name="send" size={15} />
      </button>
    </form>
    </div>
  );

  return (
    <div
      className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#0f0f0f]"
      style={{ fontFamily: font }}
    >
      <LiveUiStyle />
      <input
        ref={props.bgFileInputRef as React.Ref<HTMLInputElement>}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={props.handleUploadBgFile}
      />

      {/* ==================== 顶部导航：返回 · 头像 · 标题 · 设置 ==================== */}
      {!props.isFullscreen && (
        <header
          className="shrink-0 flex items-center gap-1 pl-1 pr-2 h-[46px] border-b"
          style={{
            backgroundColor: isNico ? '#252525' : '#ffffff',
            borderColor: isNico ? '#141414' : hairline,
            color: isNico ? '#ffffff' : ink,
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (!popInner()) props.onBackToLobby();
            }}
            aria-label="返回"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full active:opacity-60"
          >
            <Icon name="back" size={20} />
          </button>

          <Avatar src={props.displayAvatar} name={channel.channelName} size={24} />

          <button
            type="button"
            onClick={() => setTitleOpen(true)}
            aria-label="完整标题"
            className="min-w-0 flex-1 text-left px-1.5"
          >
            <span
              className="block text-[13px] font-bold leading-[1.25] break-words"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {session.title}
            </span>
          </button>

          <button
            type="button"
            onClick={() => props.setShowFloatingPhone(true)}
            aria-label="私聊"
            className="relative w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full active:opacity-60"
          >
            <Icon name="chat" size={18} />
            {props.phoneUnread && (
              <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-[#FF0033] ring-2 ring-white" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full active:opacity-60"
          >
            <Icon name="gear" size={18} />
          </button>
        </header>
      )}

      {/* ==================== 主体视图：全屏 vs 分屏 ==================== */}
      {props.isFullscreen ? (
        renderFullscreen()
      ) : (
        <>
          {renderSmallStage()}
          {renderCaptionBand()}
          {renderLowerTabs()}

          {/* 实时公屏聊天 / 分镜回放 / 阶段摘要（整页最大核心区 flex-1） */}
          <div
            ref={props.chatScrollRef as React.RefObject<HTMLDivElement>}
            className="flex-1 min-h-0 overflow-y-auto bg-white"
          >
            {activeTab === 'chat' ? (
              <>
                {isNico ? (
                  <NicoCommentTable
                    items={visibleDanmakuFeed}
                    showTranslation={props.showTranslation}
                    onEditUserDanmaku={props.onEditUserDanmaku}
                    onDeleteUserDanmaku={props.onDeleteUserDanmaku}
                    pressHandlers={dmGestures.pressHandlers}
                    replyStateOf={replyStateOf}
                  />
                ) : (
                  <YtChatList
                    items={visibleDanmakuFeed}
                    showTranslation={props.showTranslation}
                    onEditUserDanmaku={props.onEditUserDanmaku}
                    onDeleteUserDanmaku={props.onDeleteUserDanmaku}
                    pressHandlers={dmGestures.pressHandlers}
                    replyStateOf={replyStateOf}
                  />
                )}
              </>
            ) : activeTab === 'script' ? (
              <FullScriptTimeline
                allTimelineBeats={allTimelineBeats}
                currentGlobalBeatIdx={currentGlobalBeatIdx}
                setCurrentGlobalBeatIdx={props.setCurrentGlobalBeatIdx}
                openBeatMenu={props.openBeatMenu}
                onPlayBeatVoice={props.onPlayBeatVoice}
                ttsPlayingBeatId={props.ttsPlayingBeatId}
                showTranslation={props.showTranslation}
                isNico={isNico}
              />
            ) : (
              <RollingSummaryPanel
                session={session}
                unfoldedCount={props.unfoldedChunks.length}
                isSummarizing={props.isSummarizing}
                editingSummaryId={props.editingSummaryId}
                setEditingSummaryId={props.setEditingSummaryId}
                summaryDraft={props.summaryDraft}
                setSummaryDraft={props.setSummaryDraft}
                onManualFoldChunks={props.onManualFoldChunks}
                onEditRoundSummary={props.onEditRoundSummary}
                onForwardRoundToPrivate={props.onForwardRoundToPrivate}
                onRegenerateRoundSummary={props.onRegenerateRoundSummary}
              />
            )}
          </div>

          {renderComposer()}
        </>
      )}

      {/* 标题与本场详情浮层 */}
      {titleOpen && (
        <div
          className="absolute inset-0 z-40 bg-black/35 flex items-start justify-center px-4 pt-12"
          onClick={() => setTitleOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-slate-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400">
                {channel.channelName} · {session.categoryLabel}
              </span>
              <button
                type="button"
                onClick={() => setTitleOpen(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <p className="text-[14px] font-bold leading-relaxed text-slate-900 break-words">
              {session.title}
            </p>
            {session.customTopic && (
              <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5 leading-relaxed">
                📋 企划设定：{session.customTopic}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 长按弹幕的编辑 / 删除菜单：公屏表格和全屏弹幕流共用 */}
      {dmGestures.menuFor && (
        <UserDanmakuMenu
          item={dmGestures.menuFor}
          onEdit={props.onEditUserDanmaku}
          onDelete={props.onDeleteUserDanmaku}
          onClose={() => dmGestures.setMenuFor(null)}
        />
      )}

      {/* ==================== 导演台：本轮指令 + 待回应弹幕 ==================== */}
      <Sheet
        open={guidanceOpen}
        title="导演台"
        onClose={() => {
          setGuidanceOpen(false);
          setEditingGuidanceId(null);
        }}
      >
        <div className="space-y-5 pb-1">
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <h3 className="text-[12px] font-extrabold tracking-wide text-[#0f172a]">本轮指令</h3>
              {props.pendingGuidance.length > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-sm bg-[#0080ff] text-white text-[10px] font-extrabold leading-4 text-center">
                  {props.pendingGuidance.length}
                </span>
              )}
            </div>
            {props.pendingGuidance.length === 0 ? (
              <p className="mb-2 text-[12px] leading-relaxed text-[#64748b]">
                还没有指令。写一句想让直播往哪走，只给主播看，不会变成弹幕。
              </p>
            ) : (
              <div className="mb-2 space-y-1.5">
                {props.pendingGuidance.map(g => (
                  <div
                    key={g.id}
                    className="rounded-sm border-l-[3px] border-[#0080ff] bg-[#f2f7ff] px-2.5 py-2"
                  >
                    {editingGuidanceId === g.id ? (
                      <>
                        <textarea
                          rows={3}
                          value={guidanceEditDraft}
                          aria-label="修改这条指令"
                          onChange={e => setGuidanceEditDraft(e.target.value)}
                          className="w-full resize-y rounded-sm border border-[#dbe3ec] bg-white px-2 py-1.5 text-[12px] leading-relaxed text-[#0f172a] focus:outline-none"
                        />
                        <div className="mt-1.5 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingGuidanceId(null)}
                            className="text-[11px] font-bold text-[#64748b]"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={!guidanceEditDraft.trim()}
                            onClick={() => {
                              props.onEditGuidance(g.id, guidanceEditDraft.trim());
                              setEditingGuidanceId(null);
                            }}
                            className="text-[11px] font-bold text-[#0066cc] disabled:opacity-40"
                          >
                            保存
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 break-words text-[12px] leading-relaxed text-[#0f172a]">
                          {g.text}
                        </p>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGuidanceId(g.id);
                              setGuidanceEditDraft(g.text);
                            }}
                            className="text-[11px] font-bold text-[#0066cc]"
                          >
                            改
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onRemoveGuidance(g.id)}
                            className="text-[11px] font-bold text-[#d93025]"
                          >
                            删
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                value={guidanceDraft}
                onChange={e => setGuidanceDraft(e.target.value)}
                placeholder="写一句接下来想让直播往哪走…"
                className="h-9 min-w-0 flex-1 rounded-sm border border-[#dbe3ec] bg-[#f2f5f9] px-3 text-[12px] text-[#0f172a] focus:outline-none"
              />
              <button
                type="button"
                disabled={!guidanceDraft.trim()}
                onClick={() => {
                  props.onAddGuidance(guidanceDraft.trim());
                  setGuidanceDraft('');
                }}
                className="h-9 shrink-0 rounded-sm bg-[#0080ff] px-3 text-xs font-bold text-white disabled:opacity-40"
              >
                加入
              </button>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <h3 className="text-[12px] font-extrabold tracking-wide text-[#0f172a]">待回应弹幕</h3>
              {replyRequestedItems.length > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-sm bg-[#e0a000] text-white text-[10px] font-extrabold leading-4 text-center">
                  {replyRequestedItems.length}
                </span>
              )}
            </div>
            {replyRequestedItems.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-[#64748b]">
                在本轮公屏或全屏弹幕流上长按一条弹幕，就能圈进这里。
              </p>
            ) : (
              <div className="space-y-1.5">
                {replyRequestedItems.map(dm => {
                  const trans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
                  const st = replyStateOf(dm);
                  const done = st === 'done';
                  return (
                    <div
                      key={dm.id}
                      className={`flex items-start gap-2 rounded-sm border-l-[3px] px-2.5 py-2 ${
                        done ? 'border-[#7b93b3] bg-[#eef2f7]' : 'border-[#e0a000] bg-[#fffaf0]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold">
                          <span
                            className="mr-1.5 inline-flex items-center rounded-sm px-1 py-[1px] text-[9.5px] font-extrabold"
                            style={
                              done
                                ? { background: '#e2e8f0', color: '#51617a' }
                                : { background: '#fdefc8', color: '#8a5a00' }
                            }
                          >
                            {done ? '已回应' : '下轮回应'}
                          </span>
                          <span style={{ color: done ? '#51617a' : '#8a5a00' }}>
                            {dm.senderName}
                          </span>
                        </div>
                        <div className="break-words text-[12px] leading-relaxed text-[#0f172a]">{dm.text}</div>
                        {trans && trans !== dm.text && (
                          <div className="text-[11px] text-[#0066cc]">{trans}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="取消圈选这条弹幕"
                        onClick={() => props.onToggleDanmakuReply(dm.id)}
                        className="shrink-0 text-[15px] font-bold text-[#b26b00]"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <p className="text-[11px] text-[#94a3b8]">最多 5 条；下一轮回应一次，重 Roll 还在。</p>
              </div>
            )}
          </section>
        </div>
      </Sheet>

      {/* ==================== 设置抽屉：画面上不塞的功能都收在这里 ==================== */}
      <Sheet open={settingsOpen} title="直播间设置" onClose={() => setSettingsOpen(false)}>
        <div className="pb-1">
          <SheetGroupLabel text="本场" />
          <div className="divide-y divide-[#f4f4f5]">
            <SheetRow
              label="私聊小窗"
              value={props.phoneUnread ? '有新消息' : undefined}
              highlight={props.phoneUnread}
              onClick={() => {
                setSettingsOpen(false);
                props.setShowFloatingPhone(true);
              }}
            />
            <SheetRow
              label={ended ? '查看下播纪要' : '下播并结算'}
              danger={!ended}
              onClick={() => {
                setSettingsOpen(false);
                props.onEndStreamClick();
              }}
            />
          </div>

          <SheetGroupLabel text="频道" />
          <div className="divide-y divide-[#f4f4f5]">
            <SheetRow
              label="平台外观"
              value={isNico ? 'ニコニコ生放送' : 'YouTube Live'}
              onClick={() => props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico')}
            />
            <SheetRow
              label="发言身份"
              value={`${activePersona.isMain ? '本尊' : '匿名'} · ${activePersona.name}`}
              onClick={() => {
                setSettingsOpen(false);
                props.onOpenPersonaModal();
              }}
            />
            <SheetRow
              label="频道人设与语音"
              onClick={() => {
                setSettingsOpen(false);
                props.onOpenChannelSettings();
              }}
            />
            <SheetRow
              label="直播间背景"
              onClick={() => {
                setSettingsOpen(false);
                props.bgFileInputRef.current?.click();
              }}
            />
            <SheetRow
              label="频道专属礼物"
              value={`${props.activeGifts.length} 件`}
              onClick={() => {
                setSettingsOpen(false);
                props.onOpenChannelSettings();
              }}
            />
          </div>

          <SheetGroupLabel text="播放" />
          <div className="divide-y divide-[#f4f4f5]">
            <SettingToggleRow
              title="顶部飘屏弹幕"
              checked={props.showDanmakuOverlay}
              onToggle={() => props.setShowDanmakuOverlay(v => !v)}
            />
            <SettingToggleRow
              title="外语同传与弹幕翻译"
              checked={props.showTranslation}
              onToggle={() => props.setShowTranslation(v => !v)}
            />
            <SettingToggleRow
              title="发弹幕后主播立即接话"
              checked={props.immediateReplyOnSend}
              onToggle={() => props.setImmediateReplyOnSend(v => !v)}
            />
            <SettingToggleRow
              title="语音播完自动跳下一拍"
              checked={props.autoPlayStep}
              onToggle={() => props.setAutoPlayStep(v => !v)}
            />
            <SettingToggleRow
              title="字跟着录音换"
              checked={props.followVoiceSentences}
              onToggle={() => props.setFollowVoiceSentences(v => !v)}
            />
            <SettingToggleRow
              title="台词出现后静默预生成语音"
              checked={props.preGenerateVoice}
              onToggle={props.onTogglePreGenerateVoice}
            />
            <SettingToggleRow
              title="画面中央显示主播圆盘头像（随语音起伏）"
              checked={showStageAvatar}
              onToggle={toggleStageAvatar}
            />
          </div>
        </div>
      </Sheet>

      {/* Super Chat / ニコニ広告 抽屉 */}
      <Sheet
        open={props.activeBottomDrawer === 'sc'}
        title={isNico ? 'ニコニ広告（醒目置顶）' : '发送 Super Chat（醒目留言）'}
        onClose={() => props.setActiveBottomDrawer('none')}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-1.5">
            {SC_TIER_OPTIONS.map((tier, idx) => {
              const selected = props.selectedScTierIdx === idx;
              return (
                <button
                  type="button"
                  key={tier.amount}
                  onClick={() => props.setSelectedScTierIdx(idx)}
                  style={{
                    backgroundColor: selected ? tier.headerBg : '#f1f5f9',
                    color: selected ? '#fff' : '#0f172a',
                  }}
                  className={`py-2 px-1 rounded-xl text-center transition ${
                    selected ? 'ring-2 ring-offset-1 ring-slate-900 font-extrabold shadow' : 'font-semibold'
                  }`}
                >
                  <div className="text-xs">{tier.label}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">
                    {tier.pinDurationLabel.replace('置顶 ', '')}
                  </div>
                </button>
              );
            })}
          </div>

          <textarea
            value={props.danmakuInput}
            onChange={e => props.setDanmakuInput(e.target.value)}
            rows={2}
            placeholder={`以「${activePersona.name}」写下醒目留言，主播会重点停下来念出回应…`}
            className="w-full rounded-xl bg-slate-100 p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          <button
            type="button"
            disabled={!props.danmakuInput.trim()}
            onClick={props.handleSendSubmit}
            style={{
              backgroundColor:
                SC_TIER_OPTIONS[props.selectedScTierIdx]?.headerBg || '#e62117',
            }}
            className="w-full h-11 rounded-xl text-white text-sm font-extrabold shadow disabled:opacity-40"
          >
            发送 {SC_TIER_OPTIONS[props.selectedScTierIdx]?.label} 醒目留言
          </button>
        </div>
      </Sheet>

      {/* 礼物抽屉：YouTube 式贴纸托盘，名字换行不截断，点一下播礼物特效 */}
      <Sheet
        open={props.activeBottomDrawer === 'gift'}
        title="投喂频道礼物"
        onClose={() => props.setActiveBottomDrawer('none')}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 min-w-0 truncate">
              当前身份：<strong className="text-slate-800">{activePersona.name}</strong>
            </span>
            <button
              type="button"
              onClick={props.onOpenChannelSettings}
              className="shrink-0 text-xs font-bold text-blue-600 hover:underline"
            >
              频道礼物设置
            </button>
          </div>

          {props.activeGifts.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-500">暂无频道礼物</p>
              <button
                type="button"
                onClick={props.onOpenChannelSettings}
                className="mt-3 h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                去频道设置选择或生成礼物
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {props.activeGifts.map(gift => (
                <button
                  type="button"
                  key={gift.id}
                  onClick={() => props.handleSendGift(gift)}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border border-slate-200 hover:border-pink-300 hover:bg-pink-50/50 transition active:scale-95"
                >
                  <span className="w-12 h-12 grid place-items-center text-3xl shrink-0">
                    {gift.emoji}
                  </span>
                  <span className="w-full text-[11px] font-bold text-slate-800 text-center leading-tight break-words line-clamp-2">
                    {gift.name}
                  </span>
                  <span className="text-[10px] font-bold text-pink-600 px-2 py-0.5 rounded-full bg-pink-50">
                    {gift.currencySymbol}{gift.price}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-400 leading-relaxed">
            频道礼物是数字贴纸打赏，不是现实实物；和 Super Chat 付费留言分开计算。
          </p>
        </div>
      </Sheet>

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
          props.actionSheetTarget?.beatId
          && props.ttsPlayingBeatId === props.actionSheetTarget.beatId,
        )}
      />
    </div>
  );
}

// ==================== 送 SC / 礼物的瞬时特效横幅（小窗 + 全屏共用） ====================

function GiftEffectOverlay({
  effect,
}: {
  effect: { kind: 'sc' | 'gift'; emoji?: string; name: string; amount?: string; color: string; key: number } | null;
}) {
  if (!effect) return null;
  return (
    <div
      key={effect.key}
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
      style={{ top: 46 }}
    >
      <style>{`
        @keyframes onAirGiftPop {
          0% { opacity: 0; transform: translateY(-10px) scale(0.9); }
          12% { opacity: 1; transform: none; }
          80% { opacity: 1; transform: none; }
          100% { opacity: 0; transform: translateY(-8px); }
        }
      `}</style>
      <div
        className="flex w-full max-w-[min(92vw,420px)] items-center gap-2.5 rounded-2xl px-3.5 py-2 shadow-lg"
        style={{ background: effect.color, animation: 'onAirGiftPop 2.8s ease-out both' }}
      >
        {effect.emoji && <span className="text-2xl shrink-0">{effect.emoji}</span>}
        <div className="text-white min-w-0 flex-1">
          <div className="text-[10px] font-bold opacity-90">
            {effect.kind === 'sc' ? 'Super Chat 付费留言' : '频道礼物打赏'}
          </div>
          <div className="text-sm font-extrabold leading-tight whitespace-normal break-words">
            {effect.name}{effect.amount ? ` · ${effect.amount}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 语音动态声波条 ====================

function VoiceWaveBars({ active, color }: { active: boolean; color: string }) {
  return (
    <span className="inline-flex items-end gap-[1.5px] h-2.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            backgroundColor: color,
            height: active ? (i === 1 ? '10px' : '7px') : '4px',
            animationDelay: `${i * 0.15}s`,
          }}
          className={`w-[2px] rounded-full transition-all ${active ? 'animate-pulse' : 'opacity-60'}`}
        />
      ))}
    </span>
  );
}

// ==================== YouTube Live 标准公屏聊天列表 ====================

/** 长按自己的弹幕弹出功能菜单：编辑 / 删除，不再在每条弹幕下面挂小按钮。 */
/**
 * 弹幕手势：长按任意一条 → 编辑/删除；向左滑 → 圈中/取消（只认路人普通弹幕）。
 * 手指竖着动超过 10px 当成滚动，不触发长按。
 */
function useDanmakuPressMenu(options?: { onToggleReply?: (id: string) => void }) {
  const [menuFor, setMenuFor] = useState<LiveDanmakuItem | null>(null);
  const timerRef = useRef<number | null>(null);
  const itemRef = useRef<LiveDanmakuItem | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const reset = () => {
    clearTimer();
    itemRef.current = null;
    startRef.current = null;
  };
  const canCircle = (dm: LiveDanmakuItem) =>
    Boolean(dm.id) &&
    !dm.isUserMain &&
    !dm.isUserAlt &&
    !(dm.scAmount && dm.scAmount > 0) &&
    !dm.giftName;
  React.useEffect(() => () => clearTimer(), []);
  const pressHandlers = (dm: LiveDanmakuItem) => ({
    onPointerDown: (event: React.PointerEvent) => {
      if (!dm.id) return;
      clearTimer();
      itemRef.current = dm;
      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        setMenuFor(dm);
      }, 420);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const start = startRef.current;
      const item = itemRef.current;
      if (!start || !item) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (dx < -34 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        clearTimer();
        startRef.current = null;
        if (canCircle(item)) options?.onToggleReply?.(item.id);
        return;
      }
      if (Math.abs(dy) > 10) clearTimer();
    },
    onPointerUp: reset,
    onPointerLeave: reset,
    onPointerCancel: reset,
    onContextMenu: (event: React.MouseEvent) => {
      if (!dm.id) return;
      event.preventDefault();
      setMenuFor(dm);
    },
  });
  return { menuFor, setMenuFor, pressHandlers };
}

function UserDanmakuMenu({
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
  if (!item.id) return null;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/35 flex items-end justify-center p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-3 space-y-2 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="px-1 text-[11px] font-bold text-slate-400">这条弹幕</div>
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              rows={2}
              aria-label="编辑这条弹幕"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600">取消</button>
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={() => {
                  onEdit(item.id!, draft.trim());
                  onClose();
                }}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 p-2 text-xs leading-relaxed text-slate-700 break-words">{item.text}</div>
            <button type="button" onClick={() => setEditing(true)} className="w-full py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">编辑</button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('删除这条弹幕？')) {
                  onDelete(item.id!);
                  onClose();
                }
              }}
              className="w-full py-2 rounded-xl bg-rose-50 text-xs font-bold text-rose-600"
            >
              删除
            </button>
            <button type="button" onClick={onClose} className="w-full py-2 rounded-xl text-xs font-bold text-slate-400">取消</button>
          </>
        )}
      </div>
    </div>
  );
}

function YtChatList({
  items,
  showTranslation,
  onEditUserDanmaku,
  onDeleteUserDanmaku,
  pressHandlers,
  replyStateOf,
}: {
  items: LiveDanmakuItem[];
  showTranslation: boolean;
  onEditUserDanmaku: (id: string, text: string) => void;
  onDeleteUserDanmaku: (id: string) => void;
  pressHandlers: (dm: LiveDanmakuItem) => React.HTMLAttributes<HTMLElement>;
  replyStateOf: (dm: LiveDanmakuItem) => 'pending' | 'done' | null;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-slate-400">
        公屏还没有弹幕，在下方发一条弹幕或 Super Chat 互动吧！
      </div>
    );
  }
  return (
    <>
      <ul className="px-2.5 py-1.5 space-y-0.5">
        {items.map((dm, idx) => {
          const paid = Boolean(dm.scAmount && dm.scAmount > 0);
          const isGift = Boolean(dm.giftName);
          const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
          const giftComment = getLiveDanmakuComment(dm);
          const trans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
          const mineHint = '长按编辑或删除；左滑让主播下一轮回应';
          const replyState = replyStateOf(dm);

          if (paid) {
            return (
              <li key={dm.id || idx} className="my-1.5" title={mineHint} {...pressHandlers(dm)}>
                <SuperChatHighlightCard item={dm} showTranslation={showTranslation} />
              </li>
            );
          }

          if (isGift) {
            return (
              <li
                key={dm.id || idx}
                title={mineHint}
                {...pressHandlers(dm)}
                className="my-2 overflow-hidden rounded-2xl border border-[#f4bfd5] bg-white shadow-sm text-xs"
              >
                <div className="flex items-center gap-2 border-b border-[#f8dce8] bg-[#fff2f7] px-3 py-2">
                  <Avatar src={undefined} name={dm.senderName} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-[#861b48]">{dm.senderName}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#b83269]">送出了频道礼物</div>
                  </div>
                  {dm.giftAmount ? (
                    <span className="shrink-0 rounded-full bg-[#c2185b] px-2.5 py-1 font-extrabold text-white">
                      {dm.giftCurrency || '¥'}{dm.giftAmount}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 px-3 py-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#fff2f7] text-[30px] leading-none">
                    {dm.giftEmoji || '🎁'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-extrabold leading-snug text-[#70163d]">{dm.giftName}</div>
                    {(dm.giftCount || 0) > 1 ? <div className="mt-0.5 text-[10px] font-bold text-[#b83269]">×{dm.giftCount}</div> : null}
                    {giftComment && <div className="mt-1 break-words leading-relaxed text-[#8a526b]">{giftComment}</div>}
                  </div>
                </div>
              </li>
            );
          }

          return (
            <li
              key={dm.id || idx}
              title={mineHint}
              {...pressHandlers(dm)}
              className={`py-1 px-2 rounded-lg flex items-start gap-2 text-[12.5px] leading-[18px] ${
                isMine
                  ? 'bg-[#f8fafc] border border-[#e2e8f0]'
                  : replyState === 'pending'
                  ? 'bg-[#fff8e6] border border-[#f0c15c] border-l-[3px] border-l-[#f0a500]'
                  : replyState === 'done'
                  ? 'bg-[#eef2f7] border border-[#c3cedd] border-l-[3px] border-l-[#7b93b3]'
                  : ''
              }`}
            >
              <Avatar src={undefined} name={dm.senderName} size={20} />
              <div className="flex-1 min-w-0 break-words">
                <span
                  className={`font-semibold text-[11.5px] mr-1.5 ${
                    dm.isUserMain
                      ? 'text-[#0f0f0f]'
                      : dm.isUserAlt
                      ? 'text-[#6d28d9]'
                      : dm.fanBadge
                      ? 'text-[#0f9d58]'
                      : 'text-[#606060]'
                  }`}
                >
                  {dm.senderName}
                </span>
                {dm.isUserMain && (
                  <span className="mr-1.5 px-1.5 py-[1px] rounded bg-[#FF0033] text-white text-[9.5px] font-bold">
                    我
                  </span>
                )}
                {dm.isUserAlt && (
                  <span className="mr-1.5 px-1.5 py-[1px] rounded bg-[#6d28d9] text-white text-[9.5px] font-bold">
                    马甲
                  </span>
                )}
                {dm.fanBadge && !isMine && (
                  <span className="mr-1.5 px-1 py-[1px] rounded bg-[#e6f4ea] text-[#137333] text-[9.5px] font-bold">
                    {dm.fanBadge}
                  </span>
                )}
                <span className="text-[#0f0f0f]">{dm.text}</span>
                {replyState && (
                  <span
                    className={`ml-1.5 rounded px-1 py-[1px] text-[9.5px] font-bold ${
                      replyState === 'done'
                        ? 'bg-[#e2e8f0] text-[#51617a]'
                        : 'bg-[#fdefc8] text-[#8a5a00]'
                    }`}
                  >
                    {replyState === 'done' ? '已回应' : '下轮回应'}
                  </span>
                )}
                {showTranslation && trans && trans !== dm.text && (
                  <span className="ml-1.5 text-[11.5px] text-[#0369a1]">（{trans}）</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
// ==================== ニコニコ生放送 经典三列式コメントビュアー ====================
function NicoCommentTable({
  items,
  showTranslation,
  onEditUserDanmaku,
  onDeleteUserDanmaku,
  pressHandlers,
  replyStateOf,
}: {
  items: LiveDanmakuItem[];
  showTranslation: boolean;
  onEditUserDanmaku: (id: string, text: string) => void;
  onDeleteUserDanmaku: (id: string) => void;
  pressHandlers: (dm: LiveDanmakuItem) => React.HTMLAttributes<HTMLElement>;
  replyStateOf: (dm: LiveDanmakuItem) => 'pending' | 'done' | null;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-[#767676]">
        コメントはまだありません。下の入力欄から投稿してみましょう。
      </div>
    );
  }
  return (
    <>
    <table className="w-full text-left border-collapse text-[12px]">
      <thead className="sticky top-0 bg-[#f0f2f5] text-[#475569] text-[10.5px] border-b border-[#cbd5e1] z-10">
        <tr>
          <th className="py-1 px-2 w-12 font-bold">コメ番</th>
          <th className="py-1 px-2 font-bold">コメント</th>
          <th className="py-1 px-2 w-24 font-bold text-right">ID / なふだ</th>
        </tr>
      </thead>
      <tbody>
        {items.map((dm, i) => {
          const isSc = Boolean(dm.scAmount && dm.scAmount > 0);
          const isGift = Boolean(dm.giftName);
          const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
          const trans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
          const comment = isGift ? getLiveDanmakuComment(dm) : dm.text;
          const replyState = replyStateOf(dm);
          return (
            <tr
              key={dm.id || i}
              title="长按编辑或删除；左滑让主播下一轮回应"
              {...pressHandlers(dm)}
              className={`border-b border-[#eceff3] align-top ${
                isSc
                  ? 'bg-[#fffbeb]'
                  : isGift
                  ? 'bg-[#fff8fb]'
                  : isMine
                  ? 'bg-[#eff6ff]'
                  : replyState === 'pending'
                  ? 'bg-[#fff4d6] border-l-[3px] border-l-[#e0a000]'
                  : replyState === 'done'
                  ? 'bg-[#eef2f7] border-l-[3px] border-l-[#7b93b3]'
                  : i % 2 === 1
                  ? 'bg-[#f8fafc]'
                  : 'bg-white'
              }`}
            >
              <td className="px-2 py-1.5 text-[10.5px] text-[#64748b] tabular-nums whitespace-nowrap font-mono">
                {i + 1}
              </td>
              <td className="px-2 py-1.5 leading-[17px] text-[#0f172a] break-words">
                {dm.scAmount ? (
                  <span className="mr-1.5 inline-flex items-center rounded-sm border border-[#d6a500] bg-[#fff4c2] px-1.5 py-[2px] text-[10px] font-extrabold text-[#5a4300]">
                    SC&nbsp;¥{dm.scAmount}
                  </span>
                ) : null}
                {dm.giftName ? (
                  <span className="mr-1.5 inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-sm border border-[#f0a7cc] bg-white px-1.5 py-[2px] text-[10px] font-bold text-[#9d174d]">
                    <span>{dm.giftEmoji || '🎁'}</span>
                    <span className="break-words">ギフト · {dm.giftName}</span>
                    {dm.giftCount && dm.giftCount > 1 ? <span>×{dm.giftCount}</span> : null}
                    {dm.giftAmount ? <span className="font-mono">{dm.giftCurrency || '¥'}{dm.giftAmount}</span> : null}
                  </span>
                ) : null}
                {comment && <span>{comment}</span>}
                {replyState && (
                  <span
                    className="ml-1.5 inline-flex items-center rounded-sm px-1 py-[1px] text-[9.5px] font-extrabold"
                    style={
                      replyState === 'done'
                        ? { background: '#e2e8f0', color: '#51617a' }
                        : { background: '#fdefc8', color: '#8a5a00' }
                    }
                  >
                    {replyState === 'done' ? '已回应' : '下轮回应'}
                  </span>
                )}
                {showTranslation && trans && trans !== dm.text && (!isGift || comment) ? (
                  <span className="ml-1.5 text-[11px] text-[#0066cc]">（{trans}）</span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-[10.5px] text-[#64748b] truncate max-w-[92px] text-right">
                {dm.isUserAlt ? `184:${dm.senderName}` : dm.senderName}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

// ==================== 全部分镜剧本时间轴 Tab ====================

function FullScriptTimeline(props: {
  allTimelineBeats: TimelineItem[];
  currentGlobalBeatIdx: number;
  setCurrentGlobalBeatIdx: (n: number) => void;
  openBeatMenu: (chunkId: string, beat: LiveBeat, labelPrefix: string) => void;
  onPlayBeatVoice: (beat: LiveBeat, options?: { skipCache?: boolean }) => void;
  ttsPlayingBeatId: string | null;
  showTranslation: boolean;
  isNico: boolean;
}) {
  if (props.allTimelineBeats.length === 0) {
    return <p className="p-6 text-center text-xs text-slate-400">暂无分镜记录</p>;
  }
  return (
    <div className="divide-y divide-slate-100">
      {props.allTimelineBeats.map(row => {
        const isCurrent = row.globalIdx === props.currentGlobalBeatIdx;
        const isPlaying = props.ttsPlayingBeatId === row.beat.id;
        const trans = row.beat.speechTranslated
          ? row.beat.speechTranslated.replace(/^译[：:]\s*/, '').trim()
          : '';
        return (
          <div
            key={row.beat.id}
            onClick={() => props.setCurrentGlobalBeatIdx(row.globalIdx)}
            className={`px-3.5 py-2.5 cursor-pointer transition ${
              isCurrent
                ? props.isNico
                  ? 'bg-[#eff6ff] border-l-4 border-[#0080ff]'
                  : 'bg-[#fff5f5] border-l-4 border-[#FF0033]'
                : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-bold text-slate-700">
                #{row.globalIdx + 1} · {clockFromIndex(row.globalIdx)}
                {isCurrent && (
                  <span
                    className={`ml-1.5 font-extrabold ${
                      props.isNico ? 'text-[#0080ff]' : 'text-[#FF0033]'
                    }`}
                  >
                    ● 当前正在看
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                {row.beat.speechOriginal?.trim() && (
                  <button
                    type="button"
                    onClick={() => props.onPlayBeatVoice(row.beat)}
                    className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold"
                  >
                    {isPlaying ? '🔊 播音中' : '🔊 听原声'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    props.openBeatMenu(row.chunkId, row.beat, `第 ${row.globalIdx + 1} 拍`)
                  }
                  className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold"
                >
                  ⋯ 菜单
                </button>
              </div>
            </div>
            {row.beat.screen && (
              <p className="text-xs text-slate-600 leading-relaxed mb-1">🎥 {row.beat.screen}</p>
            )}
            {row.beat.speechOriginal ? (
              <p className="text-[13px] font-bold text-slate-900 leading-relaxed">
                「{row.beat.speechOriginal}」
              </p>
            ) : (
              <p className="text-xs italic text-slate-400">（专注动作未开口）</p>
            )}
            {props.showTranslation && trans && trans !== row.beat.speechOriginal && (
              <p className="text-xs text-sky-700 mt-0.5">🌐 {trans}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== 逐轮摘要管理 Tab ====================

function RollingSummaryPanel(props: {
  session: LiveStreamSession;
  unfoldedCount: number;
  isSummarizing: boolean;
  editingSummaryId: string | null;
  setEditingSummaryId: (id: string | null) => void;
  summaryDraft: string;
  setSummaryDraft: (v: string) => void;
  onManualFoldChunks: () => void;
  onEditRoundSummary: (chunkId: string, nextText: string) => void;
  onForwardRoundToPrivate: (chunkId: string) => void;
  onRegenerateRoundSummary: (chunk: LiveChunk) => void;
}) {
  const rounds = [...(props.session.chunks || [])].sort((a, b) => a.index - b.index);
  const compressible = props.unfoldedCount > 3;

  return (
    <div className="p-3.5 space-y-3">
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-2">
        <div className="text-xs text-slate-600 leading-relaxed">
          <div className="font-bold text-slate-800">逐轮压缩（不满 4 轮不压）</div>
          <div>
            当前有 {props.unfoldedCount} 轮还是原文。
            {compressible ? '可以手动重试最早那一轮的压缩。' : '最近 3 轮保留原文。'}
          </div>
        </div>
        <button
          type="button"
          disabled={!compressible || props.isSummarizing}
          onClick={props.onManualFoldChunks}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0 disabled:opacity-35"
        >
          {props.isSummarizing ? '正在压缩…' : compressible ? '📝 重试最早一轮' : '保留最近 3 轮原文'}
        </button>
      </div>

      {rounds.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">这一场还没有推进过任何一轮。</p>
      ) : (
        rounds.map(chunk => {
          const compressed = Boolean(chunk.roundSummary && chunk.roundSummary.trim());
          return (
            <div
              key={chunk.id}
              className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2"
            >
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-extrabold text-amber-900">
                  📌 第 {chunk.index + 1} 轮 · {compressed ? '逐轮摘要' : '原文'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      props.setEditingSummaryId(chunk.id);
                      props.setSummaryDraft(chunk.roundSummary || '');
                    }}
                    className="text-amber-800 font-bold hover:underline"
                  >
                    ✏️ 编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onForwardRoundToPrivate(chunk.id)}
                    className="text-rose-700 font-bold hover:underline"
                  >
                    发这轮卡片到私聊
                  </button>
                  <button
                    type="button"
                    disabled={props.isSummarizing}
                    onClick={() => props.onRegenerateRoundSummary(chunk)}
                    className="text-amber-800 font-bold hover:underline disabled:opacity-40"
                  >
                    🔄 重压缩
                  </button>
                </div>
              </div>

              {props.editingSummaryId === chunk.id ? (
                <div className="space-y-2">
                  <textarea
                    value={props.summaryDraft}
                    onChange={e => props.setSummaryDraft(e.target.value)}
                    rows={4}
                    placeholder="这一轮的摘要留空也可以，留空就回到显示原文"
                    className="w-full p-2.5 rounded-xl bg-white border border-amber-300 text-xs leading-relaxed focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => props.setEditingSummaryId(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        props.onEditRoundSummary(chunk.id, props.summaryDraft);
                        props.setEditingSummaryId(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
                    >
                      保存这一轮
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                  {compressed
                    ? chunk.roundSummary
                    : chunk.beats
                        .map((b, bi) => `${bi + 1}. ${b.screen}${b.speechOriginal ? ` ｜「${b.speechOriginal}」` : ''}`)
                        .join('\n')}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function SheetGroupLabel({ text }: { text: string }) {
  return (
    <div className="pt-3 pb-1 px-1 text-[11px] font-bold tracking-[0.1em] text-[#a3a3a3]">{text}</div>
  );
}

function SheetRow({
  label,
  value,
  onClick,
  danger,
  highlight,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-12 px-1 py-2 flex items-center justify-between gap-3 text-left active:bg-[#fafafa]"
    >
      <span
        className="text-[14px] font-semibold shrink-0"
        style={{ color: danger ? '#dc2626' : '#0f0f0f' }}
      >
        {label}
      </span>
      <span className="flex items-center gap-1.5 min-w-0">
        {value && (
          <span
            className="text-[12.5px] truncate"
            style={{ color: highlight ? '#FF0033' : '#9a9a9a', fontWeight: highlight ? 700 : 500 }}
          >
            {value}
          </span>
        )}
        <span className="text-[#cbcbcb] text-[16px] leading-none shrink-0">›</span>
      </span>
    </button>
  );
}

function SettingToggleRow({
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
      onClick={onToggle}
      role="switch"
      aria-checked={checked}
      className="w-full min-h-12 px-1 py-2 flex items-center justify-between gap-3 text-left active:bg-[#fafafa]"
    >
      <span className="text-[14px] font-semibold text-[#0f0f0f] min-w-0 break-words">{title}</span>
      <span
        className="relative w-[42px] h-[26px] rounded-full shrink-0 transition-colors"
        style={{ backgroundColor: checked ? '#34c759' : '#e4e4e7' }}
      >
        <span
          className="absolute top-[3px] w-5 h-5 rounded-full bg-white transition-all"
          style={{ left: checked ? 19 : 3, boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }}
        />
      </span>
    </button>
  );
}

function Avatar({ src, name, size }: { src?: string; name: string; size: number }) {
  if (src) {
    return (
      <TokenImg
        value={src}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-slate-200 text-slate-800 inline-flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
