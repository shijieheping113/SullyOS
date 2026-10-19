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
  onEditRoundSummary: (chunkId: string, nextText: string) => void;
  onRegenerateRoundSummary: (chunk: LiveChunk) => void;
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
  }, [beat?.screen, beat?.speechOriginal, trans, props.isFullscreen, props.showTranslation]);

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
  }, [beat?.speechOriginal, trans, props.showTranslation, props.isFullscreen]);

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

  // 自适应字号：小窗台词放在画面外的白带上，全屏台词放在气泡里，都是长文自动降档、不滚不截
  const screenText = beat?.screen || (props.isGenerating ? '主播正在镜头前反应…' : '');
  const speechText = beat?.speechOriginal || '';
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
          style={{ top: 32, height: 44 }}
        >
          <FloatingDanmakuOverlay
            danmakuList={visibleDanmakuFeed}
            showTranslation={props.showTranslation}
            visible
            platformTheme={platformTheme}
            tracks={2}
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
        <div className="min-w-0 flex-1">
          {speechText ? (
            <p
              className="break-words"
              style={{
                fontSize: `calc(${speechFontSize}px * var(--k))`,
                lineHeight: 1.46,
                fontWeight: 800,
                letterSpacing: '-0.012em',
                color: voiceOn ? accent : ink,
                transition: 'color 200ms',
              }}
            >
              {speechText}
            </p>
          ) : (
            <p className="text-[13px] font-semibold" style={{ color: '#a1a1aa' }}>
              {props.isGenerating ? '正在准备下一句…' : '这一拍还没有台词'}
            </p>
          )}

          {props.showTranslation && trans && trans !== speechText && (
            <p
              className="break-words mt-[3px]"
              style={{
                fontSize: `calc(${transFontSize}px * var(--k))`,
                lineHeight: 1.45,
                fontWeight: 600,
                color: isNico ? '#005eb8' : '#075985',
              }}
            >
              {trans}
            </p>
          )}
        </div>

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
          return (
            <p
              key={dm.id || `fs_dm_${i}`}
              className="text-[11.5px] leading-[1.35] break-words"
              style={haloSoft}
            >
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
              <span style={{ fontWeight: 600, color: '#1f2937' }}>　{dm.text}</span>
            </p>
          );
        })}
      </div>
    );
  };

  const renderFullscreen = () => (
    <div className="relative flex-1 min-h-0 overflow-hidden select-none bg-[#e8ecf1]">
      {renderStageBackdrop()}

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
              <p
                className="relative break-words"
                style={{
                  fontSize: `calc(${speechFontSize}px * var(--k))`,
                  lineHeight: 1.46,
                  fontWeight: 800,
                  letterSpacing: '-0.012em',
                  color: voiceOn ? accent : '#0f0f0f',
                  transition: 'color 200ms',
                }}
              >
                {speechText}
              </p>
              {props.showTranslation && trans && trans !== speechText && (
                <p
                  className="relative break-words mt-[3px]"
                  style={{
                    fontSize: `calc(${transFontSize}px * var(--k))`,
                    lineHeight: 1.45,
                    fontWeight: 600,
                    color: isNico ? '#005eb8' : '#075985',
                  }}
                >
                  {trans}
                </p>
              )}
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
    <form
      onSubmit={e => {
        e.preventDefault();
        props.handleSendSubmit();
      }}
      className="shrink-0 flex items-center gap-1.5 px-2 pt-2"
      style={{
        backgroundColor: overlay ? 'transparent' : isNico ? '#f2f4f7' : '#ffffff',
        borderTop: overlay ? 'none' : `1px solid ${isNico ? '#e0e4ea' : hairline}`,
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
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
                onEditRoundSummary={props.onEditRoundSummary}
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
