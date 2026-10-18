/**
 * 电波 (OnAir) —— 商业级双平台直播间视图 (YouTube Live vs ニコニコ生放送)
 *
 * 彻底重做解决的 5 大核心痛点：
 * 1. 【防黑屏氛围舞台】：未设置自定义背景图时，自动采用「主播头像高斯模糊光晕 + 频道氛围渐变」铺满舞台与全屏，彻底告别死黑屏。
 * 2. 【防截断多轨飘屏弹幕】：配合 108px 多轨弹幕层，只走舞台中上部，绝不裁切半截文字。
 * 3. 【正文零折叠高可读】：废除把长段画面描写与台词挤在播放器底部小黑盒里滑动的反人类设计；
 *    改为播放器下方独立「🎥 实时镜头 & 🎙️ 主播台词」全文展开卡片（全屏模式下提供半透明悬浮剧本文本舱），一目了然。
 * 4. 【告别意义不明的下拉框】：采用商业 App 标准分段导航栏：
 *    - YouTube Live：Top Chat 实时互动 (带 Super Chat 彩色胶囊顶栏) ｜ 分镜回放 (${N}拍) ｜ 阶段摘要 (${M})
 *    - ニコニコ生放送：コメント一覧 (经典三列表格) ｜ タイムシフト台本 (${N}) ｜ 要約ログ (${M})
 * 5. 【常用操作全部外置直达】：推进下一拍、上一拍、听语音、换马甲、发微信私聊、开关弹幕/同传、换背景、下播结算全部在主界面一键直达，不再大海捞针翻菜单。
 */
import React, { useEffect, useMemo, useState } from 'react';
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
  SuperChatTickerBar,
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
  // 画面里是否显示主播头像（默认关）。关着的时候画面全给弹幕和描写，开了才有音波效果。
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
  const item = allTimelineBeats[currentGlobalBeatIdx] || allTimelineBeats[allTimelineBeats.length - 1];
  const beat = item?.beat;
  const atEnd = allTimelineBeats.length === 0 || currentGlobalBeatIdx >= allTimelineBeats.length - 1;
  const ended = session.status === 'ended';
  const trans = beat?.speechTranslated ? beat.speechTranslated.replace(/^译[：:]\s*/, '').trim() : '';
  const maxIdx = Math.max(0, allTimelineBeats.length - 1);

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

  const scItems = useMemo(
    () => visibleDanmakuFeed.filter(d => (d.scAmount && d.scAmount > 0) || d.giftName),
    [visibleDanmakuFeed],
  );

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

  // ==================== 舞台背景渲染（彻底告别死黑屏） ====================
  const renderStageBackdrop = () => {
    if (props.displayBackgroundUrl) {
      return (
        <>
          <TokenImg
            value={props.displayBackgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </>
      );
    }
    return (
      <>
        <div
          className="absolute inset-0"
          style={{
            background:
              channel.bannerGradient ||
              'linear-gradient(135deg, #dbe6f3 0%, #c9d6e8 50%, #aebfd6 100%)',
          }}
        />
        {props.displayAvatar && (
          <TokenImg
            value={props.displayAvatar}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-40"
          />
        )}
        {/* 一点黑都不加：壁纸本色直接透出来，文字靠浅色磨砂面板托底，不靠阴影也不靠黑蒙版 */}
      </>
    );
  };

  // ==================== 视频播放区：弹幕 / 画面 / 台词 三层（按 Ann 手绘稿） ====================
  // 1/5 弹幕（只放本轮）· 2/5 画面 · 2/5 台词。全程零黑色：不铺黑蒙版、不加黑色文字阴影，
  // 文字靠浅色磨砂面板托底，壁纸本色该透的地方就透出来。
  const renderVideoStage = (fullscreenMode: boolean) => (
    <div
      className={`relative w-full overflow-hidden select-none flex flex-col ${
        fullscreenMode ? 'flex-1 min-h-0' : 'h-[300px] shrink-0'
      }`}
    >
      {renderStageBackdrop()}

      {/* ① 弹幕层：只铺本轮最新两条，1/5 高度 */}
      <div className="relative z-10 h-[76px] shrink-0 overflow-hidden">
        {props.showDanmakuOverlay && (
          <div className="absolute inset-x-0 bottom-0">
            <FloatingDanmakuOverlay
              danmakuList={visibleDanmakuFeed}
              showTranslation={props.showTranslation}
              visible
              platformTheme={platformTheme}
            />
          </div>
        )}

        {/* 状态条压在弹幕层顶部：LIVE / 人数 在左，弹幕开关 / 全屏 在右 */}
        <div className="absolute inset-x-0 top-0 z-30 h-9 px-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {fullscreenMode && (
              <button
                type="button"
                onClick={() => props.setIsFullscreen(false)}
                aria-label="退出全屏"
                className="w-7 h-6 shrink-0 rounded-md bg-white/80 text-slate-700 text-xs font-bold inline-flex items-center justify-center"
              >
                <Icon name="back" size={14} />
              </button>
            )}
            <span
              className={`h-5 px-1.5 shrink-0 rounded-[3px] text-white text-[10.5px] font-bold tracking-wide inline-flex items-center gap-1 ${
                ended ? 'bg-slate-400' : isNico ? 'bg-[#00b34a]' : 'bg-[#ff0000]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  ended ? 'bg-white/70' : 'bg-white animate-pulse'
                }`}
              />
              {isNico ? (ended ? 'タイムシフト' : '生放送中') : ended ? 'REPLAY' : 'LIVE'}
            </span>
            <span className="h-5 px-1.5 shrink-0 rounded-[3px] bg-white/80 text-slate-700 text-[10.5px] font-semibold inline-flex items-center gap-0.5 whitespace-nowrap">
              👁 {formatCount(session.viewerCount)}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 rounded-lg bg-white/80 p-0.5">
            <button
              type="button"
              onClick={() => props.setShowDanmakuOverlay(v => !v)}
              title={props.showDanmakuOverlay ? '关闭弹幕' : '打开弹幕'}
              aria-label="弹幕开关"
              className={`w-7 h-6 shrink-0 rounded-md text-[10.5px] font-extrabold whitespace-nowrap inline-flex items-center justify-center ${
                props.showDanmakuOverlay ? 'bg-slate-900 text-white' : 'text-slate-400'
              }`}
            >
              {isNico ? 'コメ' : '弹'}
            </button>
            <button
              type="button"
              onClick={() => props.setIsFullscreen(!props.isFullscreen)}
              aria-label={props.isFullscreen ? '退出全屏' : '全屏'}
              className="w-7 h-6 shrink-0 rounded-md text-slate-600 inline-flex items-center justify-center"
            >
              <Icon name={props.isFullscreen ? 'collapse' : 'expand'} size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ② 画面层：不铺任何底色，壁纸原图直接透出来；字号压到不用滚 */}
      <div
        className="relative z-10 flex-[2] min-h-0 px-2.5 pt-1 pb-0.5 overflow-hidden"
        {...bindLongPress(openThisBeat)}
      >
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 mt-[2px] text-[9.5px] font-bold text-slate-500">画面</span>
          <p
            className={`flex-1 min-w-0 break-words text-slate-800 ${
              fullscreenMode ? 'text-[12.5px] leading-[1.5]' : 'text-[11px] leading-[1.45]'
            }`}
          >
            {beat?.screen || (props.isGenerating ? '主播正在镜头前反应…' : '暂无画面描写')}
          </p>
        </div>
      </div>

      {/* ③ 台词层：不铺底色、不滚动、全文显示；点一下播放/重播，长按出菜单，✏️ 编辑 / 重 Roll */}
      <div
        className="relative z-10 flex-[2] min-h-0 px-2.5 pt-0.5 pb-1 overflow-hidden"
        {...bindLongPress(openThisBeat)}
        onClick={() => {
          if (wasLongPressTriggered()) return;
          toggleVoice();
        }}
      >
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 mt-[2px] text-[9.5px] font-bold text-red-600">台词</span>
          <div className="flex-1 min-w-0">
            {beat?.speechOriginal ? (
              <p
                className={`break-words text-slate-900 ${
                  fullscreenMode ? 'text-[13px] leading-[1.55]' : 'text-[11.5px] leading-[1.5]'
                }`}
              >
                {beat.speechOriginal}
              </p>
            ) : (
              <p className="text-[10.5px] italic leading-[1.4] text-slate-500">（这一拍没开口）</p>
            )}
            {props.showTranslation && trans && trans !== beat?.speechOriginal && (
              <p className="mt-0.5 break-words text-[10.5px] leading-[1.45] text-sky-700">{trans}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (wasLongPressTriggered()) return;
                toggleVoice();
              }}
              aria-label={voiceOn ? '重播这一拍' : '播放这一拍'}
              className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[12px] ${
                voiceOn ? 'text-amber-600' : 'text-slate-500'
              }`}
            >
              {voiceBusy ? '⏳' : '🔊'}
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openThisBeat();
              }}
              aria-label="编辑或重 Roll 这一拍"
              className="w-6 h-6 rounded-full text-slate-500 inline-flex items-center justify-center text-[11px]"
            >
              ✏️
            </button>
          </div>
        </div>
      </div>

      {showStageAvatar && (
        <div className="pointer-events-none absolute right-2 top-[74px] z-20">
          <div className="relative flex items-center justify-center">
            {voiceOn && (
              <span className="absolute -inset-2 rounded-full border-2 border-white/70 animate-ping" />
            )}
            <div className="rounded-full p-[2px] bg-white/60">
              <Avatar src={props.displayAvatar} name={channel.channelName} size={34} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
  // ==================== 播放器进度与主推进控制条 ====================
  const renderTransportBar = () => (
    <div
      className={`shrink-0 h-11 px-2 flex items-center gap-2 border-b ${
        isNico
          ? 'bg-[#1f1f1f] text-white border-[#333]'
          : 'bg-[#0f0f0f] text-white border-[#222]'
      }`}
    >
      <button
        type="button"
        disabled={currentGlobalBeatIdx <= 0}
        onClick={() => seek(currentGlobalBeatIdx - 1)}
        aria-label="上一拍"
        className="w-8 h-8 shrink-0 rounded-lg bg-white/10 active:bg-white/20 disabled:opacity-25 text-[13px] font-bold inline-flex items-center justify-center"
      >
        ◀
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <Seek
          label="直播拍数进度"
          min={0}
          max={maxIdx}
          value={Math.min(currentGlobalBeatIdx, maxIdx)}
          onChange={seek}
          variant={isNico ? 'nico' : 'yt'}
        />
        <span className="text-[11px] tabular-nums text-white/55 shrink-0 font-mono">
          {currentGlobalBeatIdx + 1}/{allTimelineBeats.length || 1}
        </span>
      </div>

      <button
        type="button"
        disabled={!beat?.speechOriginal?.trim() || voiceBusy}
        onClick={toggleVoice}
        aria-label={voiceOn ? '停止朗读' : '朗读这一拍'}
        title={voiceOn ? '正在朗读，点一下停' : '听这一拍的语音'}
        className={`w-8 h-8 shrink-0 rounded-lg text-[13px] inline-flex items-center justify-center transition ${
          voiceOn ? 'bg-amber-500 text-black' : 'bg-white/10 text-white disabled:opacity-25'
        }`}
      >
        {voiceBusy ? '⏳' : '🔊'}
      </button>

      <button
        type="button"
        onClick={advance}
        disabled={(ended && atEnd) || props.isGenerating}
        className={`h-8 px-3 shrink-0 rounded-lg text-[12.5px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap shadow transition disabled:opacity-40 ${
          !atEnd
            ? 'bg-emerald-500 active:bg-emerald-600 text-white'
            : isNico
            ? 'bg-[#0080ff] text-white'
            : 'bg-[#ff0000] text-white'
        }`}
      >
        {props.isGenerating ? '演播中…' : !atEnd ? '下一拍 ▶' : ended ? '已下播' : '✨ 继续演'}
      </button>
    </div>
  );

  // ==================== 下半屏导航栏（三等分，一眼看清） ====================
  const renderLowerTabs = () => {
    const summaryCount = session.rollingSummaries.length;
    const tabs: Array<{ id: 'chat' | 'script' | 'summary'; label: string; count: number }> = [
      { id: 'chat', label: isNico ? 'コメント' : '实时聊天', count: visibleDanmakuFeed.length },
      { id: 'script', label: isNico ? '台本' : '全部分镜', count: allTimelineBeats.length },
      { id: 'summary', label: isNico ? '要約' : '阶段总结', count: summaryCount },
    ];
    return (
      <div
        className={`shrink-0 grid grid-cols-3 ${
          isNico ? 'bg-[#252525] border-b border-[#111]' : 'bg-white border-y border-slate-200'
        }`}
      >
        {tabs.map(t => {
          const on = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`h-10 text-[12.5px] font-bold border-b-2 transition ${
                isNico
                  ? on
                    ? 'border-[#0080ff] text-white'
                    : 'border-transparent text-white/55'
                  : on
                  ? 'border-[#0f0f0f] text-[#0f0f0f]'
                  : 'border-transparent text-slate-500'
              }`}
            >
              {t.label}
              <span className="ml-1 text-[11px] font-normal opacity-55 tabular-nums">{t.count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // ==================== 底部互动输入栏（一排放得下，不挤） ====================
  const renderComposer = () => (
    <form
      className={`shrink-0 border-t px-2 py-1.5 flex items-center gap-1.5 pb-[max(8px,env(safe-area-inset-bottom))] ${
        isNico ? 'bg-[#f4f4f4] border-[#d0d0d0]' : 'bg-white border-slate-200'
      }`}
      onSubmit={e => {
        e.preventDefault();
        props.handleSendSubmit();
      }}
    >
      <button
        type="button"
        onClick={cyclePersona}
        title={`当前发言身份：${activePersona.name}（点一下换号）`}
        aria-label="切换发言身份"
        className={`relative w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center border-2 transition ${
          activePersona.isMain
            ? 'border-slate-300 bg-slate-100'
            : 'border-violet-500 bg-violet-950'
        }`}
      >
        <Avatar src={undefined} name={activePersona.name} size={26} />
        {!activePersona.isMain && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded bg-violet-600 text-white text-[8px] font-bold leading-[11px] whitespace-nowrap">
            184
          </span>
        )}
      </button>

      <input
        value={props.danmakuInput}
        onChange={e => props.setDanmakuInput(e.target.value)}
        placeholder={isNico ? 'コメントを入力…' : `以「${activePersona.name}」发弹幕…`}
        aria-label="发送弹幕"
        className={`flex-1 min-w-0 h-9 px-3 text-[13px] focus:outline-none transition ${
          isNico
            ? 'bg-white border border-[#ccc] rounded focus:border-[#0080ff]'
            : 'bg-[#f2f2f2] rounded-full focus:bg-white focus:ring-2 focus:ring-[#0f0f0f]'
        }`}
      />

      <button
        type="button"
        onClick={() =>
          props.setActiveBottomDrawer(props.activeBottomDrawer === 'sc' ? 'none' : 'sc')
        }
        title={isNico ? 'ニコニ広告' : 'Super Chat 醒目留言'}
        aria-label={isNico ? '投广告' : '发送 Super Chat'}
        className={`w-9 h-9 shrink-0 rounded-full text-[15px] font-black inline-flex items-center justify-center transition ${
          props.activeBottomDrawer === 'sc'
            ? 'bg-amber-500 text-white'
            : 'bg-amber-50 text-amber-700 border border-amber-300'
        }`}
      >
        ¥
      </button>

      <button
        type="button"
        onClick={() =>
          props.setActiveBottomDrawer(props.activeBottomDrawer === 'gift' ? 'none' : 'gift')
        }
        title="投喂礼物"
        aria-label="投喂礼物"
        className={`w-9 h-9 shrink-0 rounded-full text-[15px] inline-flex items-center justify-center transition ${
          props.activeBottomDrawer === 'gift'
            ? 'bg-pink-600 text-white'
            : 'bg-pink-50 border border-pink-200'
        }`}
      >
        🎁
      </button>

      <button
        type="submit"
        disabled={!props.danmakuInput.trim()}
        className={`h-9 px-3 text-[12.5px] font-bold text-white disabled:opacity-35 shrink-0 transition ${
          isNico ? 'bg-[#0080ff] rounded' : 'bg-[#0f0f0f] rounded-full'
        }`}
      >
        {isNico ? '投稿' : '发送'}
      </button>
    </form>
  );

  return (
    <div
      className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]"
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

      {!props.isFullscreen && (
        <header
          className={`min-h-12 py-1 px-1.5 flex items-center gap-1 shrink-0 border-b ${
            isNico
              ? 'bg-[#252525] text-white border-[#111]'
              : 'bg-white text-[#0f0f0f] border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (!popInner()) props.onBackToLobby();
              }}
              aria-label="返回大厅"
              className={`w-8 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${
                isNico ? 'active:bg-white/10 text-white' : 'active:bg-slate-100 text-slate-800'
              }`}
            >
              <Icon name="back" size={19} />
            </button>

            <Avatar src={props.displayAvatar} name={channel.channelName} size={24} />

            {/* 长标题允许折两行，整条标题都能看见；点一下弹全文，彻底不靠"能塞几个字" */}
            <button
              type="button"
              onClick={() => setTitleOpen(true)}
              aria-label="查看完整直播标题"
              className="min-w-0 flex-1 pl-1 text-left"
            >
              <span
                className="block text-[13px] font-bold leading-[1.3] break-words"
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
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => props.setShowFloatingPhone(true)}
              aria-label="打开私聊小窗"
              title="私聊小窗"
              className={`relative w-8 h-9 rounded-full inline-flex items-center justify-center text-[15px] ${
                isNico ? 'active:bg-white/10 text-white' : 'active:bg-slate-100 text-slate-700'
              }`}
            >
              💬
              {props.phoneUnread && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="直播间设置"
              className={`w-8 h-9 rounded-full inline-flex items-center justify-center ${
                isNico ? 'active:bg-white/10 text-white' : 'active:bg-slate-100 text-slate-700'
              }`}
            >
              <Icon name="gear" size={19} />
            </button>
          </div>
        </header>
      )}

      {props.isFullscreen ? (
        <div className="flex-1 min-h-0 flex flex-col bg-black">
          {renderVideoStage(true)}
          {renderTransportBar()}
        </div>
      ) : (
        <>
          {renderVideoStage(false)}
          {renderTransportBar()}

          {!isNico && activeTab === 'chat' && (
            <SuperChatTickerBar scList={scItems} showTranslation={props.showTranslation} />
          )}

          {renderLowerTabs()}

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

      {props.isGenerating && !props.isFullscreen && (
        <div className="pointer-events-none absolute right-3 bottom-16 z-30 h-8 px-3 rounded-full inline-flex items-center gap-1.5 bg-black/80 text-white text-xs font-bold shadow-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          主播正在接话演播…
        </div>
      )}

      {titleOpen && (
        <div
          className="absolute inset-0 z-40 bg-black/35 flex items-start justify-center px-4 pt-14"
          onClick={() => setTitleOpen(false)}
        >
          <div className="max-w-full rounded-xl bg-white px-3.5 py-2.5 shadow-xl">
            <p className="text-[14px] font-bold leading-relaxed text-slate-900 break-words">
              {session.title}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">点空白处关闭</p>
          </div>
        </div>
      )}

      <Sheet open={settingsOpen} title="直播间偏好与设置" onClose={() => setSettingsOpen(false)}>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              props.onEndStreamClick();
            }}
            className={`w-full h-11 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 ${
              ended
                ? 'bg-slate-100 text-slate-700'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {ended ? '📋 查看下播纪要' : '⏹ 下播并结算这一场'}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico')
              }
              className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-left"
            >
              <div className="text-xs text-slate-500">当前平台外观</div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {isNico ? 'ニコニコ生放送 ⇄' : 'YouTube Live ⇄'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                props.onOpenPersonaModal();
              }}
              className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-left"
            >
              <div className="text-xs text-slate-500">管理大小号马甲</div>
              <div className="text-sm font-bold text-slate-900 mt-0.5 truncate">
                🎭 {activePersona.name}
              </div>
            </button>
          </div>

          <SettingToggleRow
            title="画面里显示主播头像"
            desc="开启后画面中央显示主播头像，朗读时带音波；关闭则画面全给弹幕和画面描写"
            checked={showStageAvatar}
            onToggle={toggleStageAvatar}
          />
          <SettingToggleRow
            title="发弹幕后立即让主播接话"
            desc="开启后，你每发一条弹幕或SC会自动生成下一段主播反应"
            checked={props.immediateReplyOnSend}
            onToggle={() => props.setImmediateReplyOnSend(v => !v)}
          />
          <SettingToggleRow
            title="语音播完自动跳下一拍"
            desc="当前拍 TTS 朗读完毕后，自动推进到已生成的下一拍"
            checked={props.autoPlayStep}
            onToggle={() => props.setAutoPlayStep(v => !v)}
          />
          <SettingToggleRow
            title="画面顶部飘屏弹幕"
            desc="在视频舞台上方显示实时横向滚动弹幕"
            checked={props.showDanmakuOverlay}
            onToggle={() => props.setShowDanmakuOverlay(v => !v)}
          />
          <SettingToggleRow
            title="显示外语同传与弹幕中文翻译"
            desc="开启外语配信时显示【同传】字幕与外语弹幕译文"
            checked={props.showTranslation}
            onToggle={() => props.setShowTranslation(v => !v)}
          />

          <div className="pt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                props.onOpenChannelSettings();
              }}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
            >
              🎙️ 频道人设与语音设置
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                props.bgFileInputRef.current?.click();
              }}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
            >
              🖼️ 上传直播间背景图
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                props.onRequestRefreshGifts();
              }}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
            >
              🎁 AI 换一批本场礼物
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                props.onEndStreamClick();
              }}
              className="h-11 rounded-xl bg-red-600 text-white text-xs font-bold"
            >
              ⏹ 下播结算与归档
            </button>
          </div>
        </div>
      </Sheet>

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
                  <div className="text-[10px] opacity-80 mt-0.5">{tier.pinDurationLabel.replace('置顶 ', '')}</div>
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
    <ul className="px-2.5 py-1.5 space-y-1">
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
              className="my-1 px-3 py-2 rounded-xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar src={undefined} name={dm.senderName} size={22} />
                <span className="font-bold text-pink-900 truncate">{dm.senderName}</span>
                <span className="text-pink-700 truncate">{dm.text}</span>
              </div>
              <span className="text-base shrink-0 ml-2">
                {dm.giftEmoji || '🎁'} {dm.giftName}
              </span>
            </li>
          );
        }

        return (
          <li
            key={dm.id || idx}
            className={`py-1 px-2 rounded-lg flex items-start gap-2 text-[13px] leading-[19px] ${
              isMine ? 'bg-emerald-50/80 border border-emerald-200/70' : ''
            }`}
          >
            <Avatar src={undefined} name={dm.senderName} size={20} />
            <div className="flex-1 min-w-0 break-words">
              <span
                className={`font-semibold text-[12px] mr-1.5 ${
                  dm.isUserMain
                    ? 'text-emerald-700'
                    : dm.isUserAlt
                    ? 'text-violet-700'
                    : dm.fanBadge
                    ? 'text-[#0f9d58]'
                    : 'text-[#606060]'
                }`}
              >
                {dm.senderName}
              </span>
              {dm.isUserMain && (
                <span className="mr-1.5 px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[10px] font-bold">
                  我·本尊
                </span>
              )}
              {dm.isUserAlt && (
                <span className="mr-1.5 px-1.5 py-0.2 rounded bg-violet-600 text-white text-[10px] font-bold">
                  我的马甲
                </span>
              )}
              {dm.fanBadge && !isMine && (
                <span className="mr-1.5 px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                  {dm.fanBadge}
                </span>
              )}
              <span className="text-[#0f0f0f]">{dm.text}</span>
              {showTranslation && trans && trans !== dm.text && (
                <span className="ml-1.5 text-[12px] text-sky-700">（{trans}）</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ==================== ニコニコ生放送 经典三列式コメント一覧表 ====================

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
    <table className="w-full text-left border-collapse text-[12.5px]">
      <thead className="sticky top-0 bg-[#f0f0f0] text-[#555] text-[11px] border-b border-[#ccc] z-10">
        <tr>
          <th className="py-1 px-2.5 w-14 font-bold">番目</th>
          <th className="py-1 px-2 w-24 font-bold">名前 / ID</th>
          <th className="py-1 px-2.5 font-bold">コメント</th>
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
              className={`border-b border-[#ebebeb] align-top ${
                paid ? 'bg-[#fff8e1]' : isMine ? 'bg-[#e8f5e9]' : i % 2 === 1 ? 'bg-[#fafafa]' : 'bg-white'
              }`}
            >
              <td className="px-2.5 py-1.5 text-[11px] text-[#888] tabular-nums whitespace-nowrap">
                #{i + 1}
              </td>
              <td className="px-2 py-1.5 text-[11.5px] text-[#555] truncate max-w-[92px]">
                {dm.isUserAlt ? `184:${dm.senderName}` : dm.senderName}
              </td>
              <td className="px-2.5 py-1.5 leading-[18px] text-[#111] break-words">
                {dm.scAmount ? (
                  <span className="mr-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-black text-[10px] font-extrabold">
                    広告 ¥{dm.scAmount}
                  </span>
                ) : null}
                {dm.giftName ? (
                  <span className="mr-1.5 px-1.5 py-0.5 rounded bg-pink-500 text-white text-[10px] font-bold">
                    {dm.giftEmoji}{dm.giftName}
                  </span>
                ) : null}
                <span>{dm.text}</span>
                {showTranslation && trans && trans !== dm.text ? (
                  <span className="ml-1.5 text-[11.5px] text-sky-700">（{trans}）</span>
                ) : null}
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
            className={`px-3.5 py-3 cursor-pointer transition ${
              isCurrent ? 'bg-red-50/60 border-l-4 border-red-600' : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-bold text-slate-700">
                #{row.globalIdx + 1} · {clockFromIndex(row.globalIdx)}
                {isCurrent && <span className="ml-1.5 text-red-600">● 当前拍</span>}
              </span>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                {row.beat.speechOriginal?.trim() && (
                  <button
                    type="button"
                    onClick={() => props.onPlayBeatVoice(row.beat)}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold"
                  >
                    {isPlaying ? '🔊 播放中' : '🔊 听语音'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    props.openBeatMenu(row.chunkId, row.beat, `第 ${row.globalIdx + 1} 拍`)
                  }
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold"
                >
                  ✏️ 操作
                </button>
              </div>
            </div>
            {row.beat.screen && (
              <p className="text-xs text-slate-600 leading-relaxed mb-1">🎥 {row.beat.screen}</p>
            )}
            {row.beat.speechOriginal ? (
              <p className="text-sm font-bold text-slate-900 leading-relaxed">
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

function SettingToggleRow({
  title,
  desc,
  checked,
  onToggle,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-left hover:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-extrabold shrink-0 ${
          checked ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
        }`}
      >
        {checked ? '已开启' : '已关闭'}
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
