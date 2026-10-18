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
import React, { useState } from 'react';
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

type TimelineItem = { chunkId: string; chunkIndex: number; beat: LiveBeat; globalIdx: number };

export function LiveWatchScreen(props: {
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
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  showPlayerControls: boolean;
  setShowPlayerControls: React.Dispatch<React.SetStateAction<boolean>>;
  autoPlayStep: boolean;
  setAutoPlayStep: React.Dispatch<React.SetStateAction<boolean>>;
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
  displayAvatar?: string;
  displayBackgroundUrl: string;
  activeGifts: StreamGiftOption[];
  openBeatMenu: (chunkId: string, beat: LiveBeat, labelPrefix: string) => void;
  handleSendSubmit: () => void;
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
  onRequestRefreshGifts: () => void;
  onManualFoldChunks: () => void;
  onEditRollingSummary: (summaryId: string, nextText: string) => void;
  onRegenerateRollingSummary: (summary: LiveRollingSummary) => void;
  onDissolveRollingSummary: (summaryId: string) => void;
  onEndStreamClick: () => void;
}) {
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

  // 字幕组自动收缩：以 --k 为缩放系数，量出实际高度后逐档降字号，保证任何长度都塞得下、不越界
  const stackRef = React.useRef<HTMLDivElement | null>(null);
  const stackInnerRef = React.useRef<HTMLDivElement | null>(null);

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

  const [subTab, setSubTab] = useState<'chat' | 'script' | 'summary'>('chat');
  const activeTab = props.lowerTab === 'script' && subTab === 'chat' ? 'script' : subTab;
  const switchTab = (next: 'chat' | 'script' | 'summary') => {
    setSubTab(next);
    props.setLowerTab(next === 'chat' ? 'chat' : 'script');
  };

  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();
  const item =
    allTimelineBeats[currentGlobalBeatIdx] || allTimelineBeats[allTimelineBeats.length - 1];
  const beat = item?.beat;
  const atEnd =
    allTimelineBeats.length === 0 || currentGlobalBeatIdx >= allTimelineBeats.length - 1;
  const ended = session.status === 'ended';
  const trans = beat?.speechTranslated
    ? beat.speechTranslated.replace(/^译[：:]\s*/, '').trim()
    : '';
  const maxIdx = Math.max(0, allTimelineBeats.length - 1);

  // 量高逐档收缩：先按满字号排版，塞不下就 3% 一步往下收，最低收到七成
  React.useLayoutEffect(() => {
    const box = stackRef.current;
    const inner = stackInnerRef.current;
    if (!box || !inner) return;
    const fit = () => {
      const cs = getComputedStyle(box);
      const avail =
        box.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0');
      let k = 1;
      box.style.setProperty('--k', '1');
      let guard = 0;
      while (inner.getBoundingClientRect().height > avail - 1 && k > 0.7 && guard < 24) {
        k -= 0.03;
        box.style.setProperty('--k', k.toFixed(3));
        guard += 1;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [beat?.screen, beat?.speechOriginal, trans, props.isFullscreen, props.showTranslation]);

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

  const cyclePersona = () => {
    if (props.viewerPersonas.length <= 1) {
      props.onOpenPersonaModal();
      return;
    }
    const curIdx = props.viewerPersonas.findIndex(p => p.id === activePersona.id);
    const nextPersona = props.viewerPersonas[(curIdx + 1) % props.viewerPersonas.length];
    if (nextPersona) props.onSelectPersona(nextPersona.id);
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

  // 自适应字号：舞台高度固定，字幕从底部往上长，长文自动降字号，绝不滚动、绝不截断
  const screenText = beat?.screen || (props.isGenerating ? '主播正在镜头前反应…' : '');
  const speechText = beat?.speechOriginal || '';
  const pickSize = (len: number, tiers: Array<[number, number]>) => {
    for (const [limit, size] of tiers) if (len <= limit) return size;
    return tiers[tiers.length - 1][1];
  };
  const screenFontSize = props.isFullscreen
    ? pickSize(screenText.length, [
        [60, 13.5],
        [120, 12.5],
        [1e9, 11.5],
      ])
    : pickSize(screenText.length, [
        [60, 11],
        [120, 10.5],
        [1e9, 10],
      ]);
  const speechFontSize = props.isFullscreen
    ? pickSize(speechText.length, [
        [45, 20],
        [85, 18],
        [130, 16],
        [1e9, 14.5],
      ])
    : pickSize(speechText.length, [
        [45, 15.5],
        [85, 14],
        [130, 13],
        [1e9, 12],
      ]);
  const transFontSize = props.isFullscreen ? 12 : 10.5;

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

  // ==================== 2. 视频主舞台（弹幕带 / 镜头 / 台词，三层各占地盘） ====================
  // 骨架：整块视频 = 顶部一排状态 + 一条弹幕带 + 底部字幕组。
  // 字幕组贴底、由下往上生长：动作描写小字在上，台词大字在下，长文自动降字号，永不互相压住。
  const renderVideoStage = (fullscreenMode: boolean) => (
    <div
      onClick={() => {
        if (wasLongPressTriggered()) return;
        if (speechText) toggleVoice();
      }}
      {...bindLongPress(openThisBeat)}
      className={`relative w-full overflow-hidden select-none flex flex-col ${
        fullscreenMode ? 'flex-1 min-h-0' : 'shrink-0'
      }`}
      style={fullscreenMode ? undefined : { height: 'clamp(224px, 34%, 302px)' }}
    >
      {renderStageBackdrop()}

      {/* 顶部状态：LIVE · 在看人数 · 全屏。别的功能一律收进设置，画面上不堆按钮 */}
      <div
        className={`relative z-30 shrink-0 flex items-center gap-2 px-3 ${
          fullscreenMode ? 'h-12' : 'h-9'
        }`}
      >
        <span
          className={`h-[18px] px-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wide text-white ${
            isNico ? 'rounded-[2px]' : 'rounded-[3px]'
          } ${ended ? 'bg-[#a3a3a3]' : isNico ? 'bg-[#00b34a]' : 'bg-[#FF0033]'}`}
        >
          <span
            className={`w-[5px] h-[5px] rounded-full ${ended ? 'bg-white/70' : 'bg-white animate-pulse'}`}
          />
          {isNico ? (ended ? 'TS' : '生放送') : ended ? 'REPLAY' : 'LIVE'}
        </span>

        <span
          className="inline-flex items-center gap-1 text-[10.5px] font-bold tabular-nums"
          style={{ color: ink, opacity: 0.55 }}
        >
          <Icon name="people" size={11} />
          {formatCount(session.viewerCount)}
        </span>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            props.setIsFullscreen(!props.isFullscreen);
          }}
          aria-label={props.isFullscreen ? '退出全屏' : '全屏'}
          className="ml-auto -mr-1.5 w-8 h-8 inline-flex items-center justify-center rounded-full active:scale-95 transition"
          style={{ color: ink, opacity: 0.58 }}
        >
          <Icon name={props.isFullscreen ? 'collapse' : 'expand'} size={15} />
        </button>
      </div>

      {/* 弹幕带：单独一条，跟字幕各走各的 */}
      {props.showDanmakuOverlay && (
        <div
          className="relative z-10 shrink-0 overflow-hidden"
          style={{ height: fullscreenMode ? 62 : 44, marginRight: showStageAvatar ? 44 : 0 }}
        >
          <FloatingDanmakuOverlay
            danmakuList={visibleDanmakuFeed}
            showTranslation={props.showTranslation}
            visible
            platformTheme={platformTheme}
            tracks={fullscreenMode ? 3 : 2}
          />
        </div>
      )}

      {/* 字幕组：贴底、从下往上长；--k 由脚本按实际高度收放 */}
      <div
        ref={stackRef}
        className={`relative z-20 flex-1 min-h-0 flex flex-col justify-end overflow-hidden ${
          fullscreenMode ? 'px-5 pb-5' : 'px-4 pb-3'
        }`}
        style={{ '--k': 1 } as React.CSSProperties}
      >
        <div ref={stackInnerRef}>
        {(voiceBusy || voiceOn) && (
          <div className="flex items-center gap-1.5 mb-[5px]">
            <span
              className="text-[10px] font-bold leading-none tracking-[0.1em]"
              style={{ color: accent, opacity: 0.8 }}
            >
              {voiceBusy ? '•••' : ''}
            </span>
            {voiceOn && <VoiceWaveBars active color={accent} />}
          </div>
        )}

        {screenText && (
          <p
            className="break-words"
            style={{
              fontSize: `calc(${screenFontSize}px * var(--k))`,
              lineHeight: 1.55,
              fontWeight: 600,
              letterSpacing: '0.015em',
              color: isNico ? '#39434f' : '#3f3f46',
            }}
          >
            {screenText}
          </p>
        )}

        {speechText && (
          <p
            className="break-words"
            style={{
              fontSize: `calc(${speechFontSize}px * var(--k))`,
              lineHeight: 1.48,
              fontWeight: 900,
              letterSpacing: '-0.012em',
              marginTop: `calc(${fullscreenMode ? 12 : 9}px * var(--k))`,
              color: voiceOn ? accent : ink,
              transition: 'color 200ms',
            }}
          >
            「{speechText}」
          </p>
        )}

        {props.showTranslation && trans && trans !== speechText && (
          <p
            className="break-words"
            style={{
              fontSize: `calc(${transFontSize}px * var(--k))`,
              lineHeight: 1.45,
              fontWeight: 700,
              marginTop: 2,
              color: isNico ? '#005eb8' : '#075985',
            }}
          >
            {trans}
          </p>
        )}
        </div>
      </div>

      {/* 可选主播小头像：只占右上角 30px，不压字 */}
      {showStageAvatar && (
        <div
          className="pointer-events-none absolute z-20"
          style={{ right: 10, top: fullscreenMode ? 54 : 40 }}
        >
          <div className="relative flex items-center justify-center">
            {voiceOn && (
              <span
                className="absolute -inset-1 rounded-full border-2 animate-ping"
                style={{ borderColor: accent }}
              />
            )}
            <div className="rounded-full p-[1.5px] bg-white">
              <Avatar src={props.displayAvatar} name={channel.channelName} size={30} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ==================== 3. 播控条：上一拍 · 进度 · 拍数 · 播放 ====================
  const renderTransportBar = () => (
    <div
      className="shrink-0 flex items-center gap-1 px-1.5 h-11 border-b"
      style={{
        backgroundColor: isNico ? '#252525' : '#ffffff',
        borderColor: isNico ? '#1a1a1a' : hairline,
      }}
    >
      <button
        type="button"
        disabled={currentGlobalBeatIdx <= 0}
        onClick={() => seek(currentGlobalBeatIdx - 1)}
        aria-label="上一拍"
        className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-25"
        style={{ color: isNico ? '#e8e8e8' : ink }}
      >
        <Icon name="skipBack" size={15} />
      </button>

      <div className="flex-1 min-w-0 px-0.5">
        <Seek
          label="直播进度"
          min={0}
          max={maxIdx}
          value={Math.min(currentGlobalBeatIdx, maxIdx)}
          onChange={seek}
          variant={isNico ? 'nico' : 'ytLight'}
        />
      </div>

      <span
        className="text-[10px] font-mono tabular-nums shrink-0 tracking-tight"
        style={{ color: isNico ? 'rgba(255,255,255,0.5)' : '#9a9a9a' }}
      >
        {currentGlobalBeatIdx + 1}/{allTimelineBeats.length || 1}
      </span>

      <button
        type="button"
        onClick={advance}
        disabled={(ended && atEnd) || props.isGenerating}
        aria-label="继续演播"
        className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full text-white active:scale-95 transition disabled:opacity-30"
        style={{ backgroundColor: accent }}
      >
        {props.isGenerating ? (
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
        ) : (
          <Icon name="play" size={13} />
        )}
      </button>
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
  const renderComposer = () => (
    <form
      onSubmit={e => {
        e.preventDefault();
        props.handleSendSubmit();
      }}
      className="shrink-0 flex items-center gap-1.5 px-2 pt-2"
      style={{
        backgroundColor: isNico ? '#f2f4f7' : '#ffffff',
        borderTop: `1px solid ${isNico ? '#e0e4ea' : hairline}`,
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}
    >
      <button
        type="button"
        onClick={cyclePersona}
        aria-label="切换发言身份"
        className="w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold transition active:scale-95"
        style={
          activePersona.isMain
            ? {
                backgroundColor: isNico ? '#e8eef7' : '#f2f2f2',
                color: isNico ? '#334155' : '#0f0f0f',
              }
            : { backgroundColor: isNico ? '#252525' : '#0f0f0f', color: '#ffffff' }
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
          backgroundColor: isNico ? '#ffffff' : '#f2f2f2',
          border: `1px solid ${isNico ? '#d5dae2' : 'transparent'}`,
          borderRadius: isNico ? 4 : 999,
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
            : { backgroundColor: isNico ? '#e8ecf2' : '#f2f2f2', color: isNico ? '#4b5563' : ink }
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
            : { backgroundColor: isNico ? '#e8ecf2' : '#f2f2f2', color: isNico ? '#4b5563' : ink }
        }
      >
        <Icon name="gift" size={15} />
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
        <div className="flex-1 min-h-0 flex flex-col bg-white">
          {renderVideoStage(true)}
          {renderTransportBar()}
          {renderComposer()}
        </div>
      ) : (
        <>
          {renderVideoStage(false)}
          {renderTransportBar()}
          {renderLowerTabs()}

          {/* 实时公屏聊天 / 分镜回放 / 阶段摘要（整页最大核心区 flex-1） */}
          <div
            ref={props.chatScrollRef as React.RefObject<HTMLDivElement>}
            className="flex-1 min-h-0 overflow-y-auto bg-white"
          >
            {activeTab === 'chat' ? (
              isNico ? (
                <NicoCommentTable
                  items={visibleDanmakuFeed}
                  showTranslation={props.showTranslation}
                />
              ) : (
                <YtChatList
                  items={visibleDanmakuFeed}
                  showTranslation={props.showTranslation}
                />
              )
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
                onEditRollingSummary={props.onEditRollingSummary}
                onRegenerateRollingSummary={props.onRegenerateRollingSummary}
                onDissolveRollingSummary={props.onDissolveRollingSummary}
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
              label="本场礼物"
              value={`${props.activeGifts.length} 件`}
              onClick={props.onRequestRefreshGifts}
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
              title="画面右上角显示主播头像"
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

      {/* 礼物抽屉 */}
      <Sheet
        open={props.activeBottomDrawer === 'gift'}
        title="投喂直播间专属礼物"
        onClose={() => props.setActiveBottomDrawer('none')}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              当前身份：<strong className="text-slate-800">{activePersona.name}</strong>
            </span>
            <button
              type="button"
              onClick={props.onRequestRefreshGifts}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              🔄 AI 根据本场主题换一批礼物
            </button>
          </div>

          {props.activeGifts.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-500">暂无专属礼物</p>
              <button
                type="button"
                onClick={props.onRequestRefreshGifts}
                className="mt-3 h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                立即生成专属礼物
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {props.activeGifts.map(gift => (
                <button
                  type="button"
                  key={gift.id}
                  onClick={() => props.handleSendGift(gift)}
                  className="p-3 rounded-2xl border border-slate-200 hover:border-pink-400 hover:bg-pink-50/40 flex items-center gap-2.5 text-left transition"
                >
                  <span className="text-2xl shrink-0">{gift.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">{gift.name}</div>
                    <div className="text-[11px] font-semibold text-pink-600">
                      {gift.currencySymbol}{gift.price}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      <LiveFloatingPhone
        isOpen={props.showFloatingPhone}
        characterId={props.charId}
        charName={props.charName}
        contextDescription={`【直播间手机私聊】此刻你正在直播间《${session.title}》（频道：${channel.channelName}）开着直播，镜头正对着你。${props.userName} 正在台下用手机给你发私聊消息；你在直播间隙低头看手机回复TA，沿用正常私聊的交流方式。`}
        onClose={() => props.setShowFloatingPhone(false)}
        onUnreadChange={props.onPhoneUnread}
      />

      <BeatLongPressSheet
        target={props.actionSheetTarget}
        ttsLoading={Boolean(props.ttsLoadingBeatId)}
        onClose={() => props.setActionSheetTarget(null)}
      />
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

function YtChatList({
  items,
  showTranslation,
}: {
  items: LiveDanmakuItem[];
  showTranslation: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-slate-400">
        公屏还没有弹幕，在下方发一条弹幕或 Super Chat 互动吧！
      </div>
    );
  }
  return (
    <ul className="px-2.5 py-1.5 space-y-0.5">
      {items.map((dm, idx) => {
        const paid = Boolean(dm.scAmount && dm.scAmount > 0);
        const isGift = Boolean(dm.giftName);
        const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
        const trans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';

        if (paid) {
          return (
            <li key={dm.id || idx} className="my-1.5">
              <SuperChatHighlightCard item={dm} showTranslation={showTranslation} />
            </li>
          );
        }

        if (isGift) {
          return (
            <li
              key={dm.id || idx}
              className="my-1 px-3 py-1.5 rounded-xl bg-[#fff0f6] border border-[#ffdeeb] flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar src={undefined} name={dm.senderName} size={20} />
                <span className="font-bold text-[#a61e4d] truncate">{dm.senderName}</span>
                <span className="text-[#c2255c] truncate">{dm.text}</span>
              </div>
              <span className="text-sm font-bold text-[#d6336c] shrink-0 ml-2">
                {dm.giftEmoji || '🎁'} {dm.giftName}
              </span>
            </li>
          );
        }

        return (
          <li
            key={dm.id || idx}
            className={`py-1 px-2 rounded-lg flex items-start gap-2 text-[12.5px] leading-[18px] ${
              isMine ? 'bg-[#f8fafc] border border-[#e2e8f0]' : ''
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
              {showTranslation && trans && trans !== dm.text && (
                <span className="ml-1.5 text-[11.5px] text-[#0369a1]">（{trans}）</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ==================== ニコニコ生放送 经典三列式コメントビュアー ====================

function NicoCommentTable({
  items,
  showTranslation,
}: {
  items: LiveDanmakuItem[];
  showTranslation: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-[#767676]">
        コメントはまだありません。下の入力欄から投稿してみましょう。
      </div>
    );
  }
  return (
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
          const paid = Boolean((dm.scAmount && dm.scAmount > 0) || dm.giftName);
          const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
          const trans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
          return (
            <tr
              key={dm.id || i}
              className={`border-b border-[#eceff3] align-top ${
                paid
                  ? 'bg-[#fffbeb]'
                  : isMine
                  ? 'bg-[#eff6ff]'
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
                  <span className="mr-1.5 px-1.5 py-[1px] rounded-[2px] bg-[#f59e0b] text-white text-[10px] font-extrabold">
                    広告 ¥{dm.scAmount}
                  </span>
                ) : null}
                {dm.giftName ? (
                  <span className="mr-1.5 px-1.5 py-[1px] rounded-[2px] bg-[#ec4899] text-white text-[10px] font-bold">
                    {dm.giftEmoji}
                    {dm.giftName}
                  </span>
                ) : null}
                <span>{dm.text}</span>
                {showTranslation && trans && trans !== dm.text ? (
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

// ==================== 阶段滚动摘要管理 Tab ====================

function RollingSummaryPanel(props: {
  session: LiveStreamSession;
  unfoldedCount: number;
  isSummarizing: boolean;
  editingSummaryId: string | null;
  setEditingSummaryId: (id: string | null) => void;
  summaryDraft: string;
  setSummaryDraft: (v: string) => void;
  onManualFoldChunks: () => void;
  onEditRollingSummary: (summaryId: string, nextText: string) => void;
  onRegenerateRollingSummary: (summary: LiveRollingSummary) => void;
  onDissolveRollingSummary: (summaryId: string) => void;
}) {
  return (
    <div className="p-3.5 space-y-3">
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
        <div className="text-xs text-slate-600 leading-relaxed">
          <div className="font-bold text-slate-800">防爆 Token 阶段滚动折叠</div>
          <div>当前未折叠切片：{props.unfoldedCount} 段（满 2 段可随时手动压缩）</div>
        </div>
        <button
          type="button"
          disabled={props.unfoldedCount < 2 || props.isSummarizing}
          onClick={props.onManualFoldChunks}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0 disabled:opacity-35"
        >
          {props.isSummarizing ? '正在提炼…' : '📝 立即压缩旧段'}
        </button>
      </div>

      {props.session.rollingSummaries.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">
          本场直播还没有生成阶段摘要卡。直播满 {props.session.foldEveryNChunks || 4} 段会自动折叠，也可点击上方按钮手动压缩。
        </p>
      ) : (
        props.session.rollingSummaries.map(sum => (
          <div
            key={sum.id}
            className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-amber-900">
                📌 第 {sum.fromChunkIndex + 1} ～ {sum.toChunkIndex + 1} 段阶段摘要
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    props.setEditingSummaryId(sum.id);
                    props.setSummaryDraft(sum.content);
                  }}
                  className="text-amber-800 font-bold hover:underline"
                >
                  ✏️ 编辑
                </button>
                <button
                  type="button"
                  disabled={props.isSummarizing}
                  onClick={() => props.onRegenerateRollingSummary(sum)}
                  className="text-amber-800 font-bold hover:underline disabled:opacity-40"
                >
                  🔄 重总结
                </button>
                <button
                  type="button"
                  onClick={() => props.onDissolveRollingSummary(sum.id)}
                  className="text-red-600 font-bold hover:underline"
                >
                  📂 解散还原
                </button>
              </div>
            </div>

            {props.editingSummaryId === sum.id ? (
              <div className="space-y-2">
                <textarea
                  value={props.summaryDraft}
                  onChange={e => props.setSummaryDraft(e.target.value)}
                  rows={4}
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
                      props.onEditRollingSummary(sum.id, props.summaryDraft);
                      props.setEditingSummaryId(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
                  >
                    保存摘要
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                {sum.content}
              </p>
            )}
          </div>
        ))
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
