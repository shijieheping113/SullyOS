/**
 * 电波 (OnAir) —— 真实 YouTube Live & 真实 ニコニコ生放送 (NicoNico Live) 直播间视图
 *
 * 彻底解决的 6 大核心体验与真实感还原：
 * 1. 两套完全独立的真实 UI 架构：
 *    - YouTube Live：纯白现代播放页 + #ff0033 红点可拖动进度条 + 订阅胶囊行 + 单行 Action Pills + Top Chat 实时聊天流 + Super Chat 色卡横栏 + 底部胶囊输入栏。
 *    - ニコニコ生放送 (NicoNico)：#252525 极客顶栏 + #0080ff 蓝色シークバー + 番組統計バー(来場者数/コメント数/ギフトpt) + 放送者実況ボックス + 正宗三列「コメント一覧 (コメビュ)」表格 + 底部 [なふだ/匿名] コマンド投稿栏。
 * 2. 播放器零遮挡、按键绝不被压死：
 *    - 飘屏弹幕严格限制在画面上半区（10%~46%），pointer-events-none，绝不挡字、绝不挡按钮。
 *    - 画面平时干净无杂乱按钮，点击画面空白处显隐播放器控制层；底部进度条独立可拖动/点击选拍（Beat 1~N）。
 * 3. 非全屏 100% 看全文字：
 *    - 画面动作描写与双语台词放在播放器正下方的独立实况面板，绝不截断（无 line-clamp），字号 14px 行高 1.65。
 * 4. 全屏模式可发弹幕、可调进度、弹幕与文字上下分区绝不重叠。
 * 5. 背景图明亮清透：不压黑遮罩，默认采用清透浅色柔光画布或 100% 原画质自定义背景。
 * 6. 长按菜单（BeatLongPressSheet）：点击台词直接播语音；长按台词/分镜（或点右侧 ⋮）呼出底部菜单进行重新合成语音、下载 .mp3、编辑画面台词、重 Roll 本段、转发切片。
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  normalizeBrightGradient,
  downloadVoiceAudioUrl,
} from '../../utils/liveStreamStorage';
import {
  FloatingDanmakuOverlay,
  SuperChatTickerBar,
  SuperChatHighlightCard,
  LiveFloatingPhone,
  BeatLongPressSheet,
  BeatActionSheetTarget,
  useLongPressMenu,
} from './LiveSharedWidgets';

interface LiveRoomViewProps {
  charId: string;
  charName: string;
  charAvatar?: string;
  userName: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  viewerPersonas: ViewerPersona[];
  activePersonaId: string;
  platformTheme: LivePlatformTheme;
  isGenerating: boolean;
  isSummarizing: boolean;
  ttsPlayingBeatId: string | null;
  ttsLoadingBeatId: string | null;
  onChangePlatformTheme: (theme: LivePlatformTheme) => void;
  onSelectPersona: (id: string) => void;
  onOpenPersonaModal: () => void;
  onOpenChannelSettings: () => void;
  onBackToLobby: () => void;
  onGenerateNextChunk: () => void;
  onRerollChunk: (chunkId: string) => void;
  onEditBeat: (
    chunkId: string,
    beatId: string,
    nextScreen: string,
    nextSpeechOriginal: string,
    nextSpeechTranslated?: string,
  ) => void;
  onPlayBeatVoice: (beat: LiveBeat, options?: { skipCache?: boolean }) => void;
  onSendUserDanmaku: (
    text: string,
    scAmount?: number,
    scColor?: 'blue' | 'cyan' | 'amber' | 'magenta' | 'red',
    triggerImmediateReply?: boolean,
    giftOption?: StreamGiftOption,
  ) => void;
  onUpdateCustomBackground: (url: string) => void;
  onRequestRefreshGifts: () => void;
  onManualFoldChunks: () => void;
  onEditRollingSummary: (summaryId: string, nextText: string) => void;
  onRegenerateRollingSummary: (summary: LiveRollingSummary) => void;
  onDissolveRollingSummary: (summaryId: string) => void;
  onEndStreamClick: () => void;
  onShareClipToChat: (beat: LiveBeat) => void;
}

export const LiveRoomView: React.FC<LiveRoomViewProps> = ({
  charId,
  charName,
  charAvatar,
  userName,
  channel,
  session,
  viewerPersonas,
  activePersonaId,
  platformTheme,
  isGenerating,
  isSummarizing,
  ttsPlayingBeatId,
  ttsLoadingBeatId,
  onChangePlatformTheme,
  onSelectPersona,
  onOpenPersonaModal,
  onOpenChannelSettings,
  onBackToLobby,
  onGenerateNextChunk,
  onRerollChunk,
  onEditBeat,
  onPlayBeatVoice,
  onSendUserDanmaku,
  onUpdateCustomBackground,
  onRequestRefreshGifts,
  onManualFoldChunks,
  onEditRollingSummary,
  onRegenerateRollingSummary,
  onDissolveRollingSummary,
  onEndStreamClick,
  onShareClipToChat,
}) => {
  // 视图与播放器控制状态
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlayerControls, setShowPlayerControls] = useState(false);
  const [autoPlayStep, setAutoPlayStep] = useState(true);
  const [showDanmakuOverlay, setShowDanmakuOverlay] = useState(true);
  const [showTranslation, setShowTranslation] = useState(
    Boolean(channel.voiceConfig?.enableTranslation || (channel.voiceConfig?.language && channel.voiceConfig.language !== 'zh')),
  );
  // 下方主内容 Tab：实时弹幕 (chat) vs 完整分镜回放 (script)
  const [lowerTab, setLowerTab] = useState<'chat' | 'script'>('chat');
  const [showHeaderDetail, setShowHeaderDetail] = useState(false);

  // 弹幕/SC/礼物输入状态
  const [danmakuInput, setDanmakuInput] = useState('');
  const [activeBottomDrawer, setActiveBottomDrawer] = useState<'none' | 'sc' | 'gift'>('none');
  const [selectedScTierIdx, setSelectedScTierIdx] = useState<number>(0);
  const [immediateReplyOnSend, setImmediateReplyOnSend] = useState(true);

  // 私聊小手机浮窗状态
  const [showFloatingPhone, setShowFloatingPhone] = useState(false);
  const [phoneUnread, setPhoneUnread] = useState(false);

  // 长按菜单状态
  const [actionSheetTarget, setActionSheetTarget] = useState<BeatActionSheetTarget | null>(null);
  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();

  // 阶段总结编辑状态
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState('');

  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // 展开所有未折叠的拍子，构建平坦进度轴（Beat 1 ~ N）
  const unfoldedChunks = useMemo(() => session.chunks.filter(c => !c.folded), [session.chunks]);
  const latestChunk: LiveChunk | undefined = session.chunks[session.chunks.length - 1];

  const allTimelineBeats = useMemo(() => {
    const list: Array<{ chunkId: string; chunkIndex: number; beat: LiveBeat; globalIdx: number }> = [];
    session.chunks.forEach(chunk => {
      chunk.beats.forEach(beat => {
        list.push({
          chunkId: chunk.id,
          chunkIndex: chunk.index,
          beat,
          globalIdx: list.length,
        });
      });
    });
    return list;
  }, [session.chunks]);

  // 当前播放到的全局拍索引（支持进度条自由拖动回看或快进）
  const [currentGlobalBeatIdx, setCurrentGlobalBeatIdx] = useState<number>(0);

  // 当新 Chunk 生成出来时，自动跳到新 Chunk 的第一拍开始逐拍推进
  const prevChunksLenRef = useRef(session.chunks.length);
  useEffect(() => {
    if (session.chunks.length > prevChunksLenRef.current && latestChunk) {
      const firstNewBeatId = latestChunk.beats[0]?.id;
      const foundIdx = allTimelineBeats.findIndex(item => item.beat.id === firstNewBeatId);
      if (foundIdx >= 0) {
        setCurrentGlobalBeatIdx(foundIdx);
      } else {
        setCurrentGlobalBeatIdx(Math.max(0, allTimelineBeats.length - 1));
      }
    } else if (currentGlobalBeatIdx >= allTimelineBeats.length && allTimelineBeats.length > 0) {
      setCurrentGlobalBeatIdx(allTimelineBeats.length - 1);
    }
    prevChunksLenRef.current = session.chunks.length;
  }, [session.chunks.length, allTimelineBeats.length]);

  // 自动逐拍推进定时器（每 5.5 秒推进到下一拍）
  useEffect(() => {
    if (!autoPlayStep || isGenerating || allTimelineBeats.length === 0) return;
    if (currentGlobalBeatIdx >= allTimelineBeats.length - 1) return;
    const timer = setTimeout(() => {
      setCurrentGlobalBeatIdx(prev => Math.min(prev + 1, allTimelineBeats.length - 1));
    }, 5500);
    return () => clearTimeout(timer);
  }, [autoPlayStep, isGenerating, currentGlobalBeatIdx, allTimelineBeats.length]);

  const currentTimelineItem =
    allTimelineBeats[currentGlobalBeatIdx] || allTimelineBeats[allTimelineBeats.length - 1];
  const currentBeat = currentTimelineItem?.beat;
  const currentChunkId = currentTimelineItem?.chunkId || latestChunk?.id || '';

  // 自动朗读当前拍台词
  const lastAutoSpokenBeatRef = useRef<string | null>(null);
  useEffect(() => {
    if (!channel.voiceConfig?.autoPlayTts || !currentBeat?.speechOriginal?.trim()) return;
    if (lastAutoSpokenBeatRef.current === currentBeat.id) return;
    lastAutoSpokenBeatRef.current = currentBeat.id;
    onPlayBeatVoice(currentBeat);
  }, [currentBeat?.id, channel.voiceConfig?.autoPlayTts]);

  // 截止到当前播放进度的可见弹幕流 & Super Chat 列表
  const visibleDanmakuFeed = useMemo(() => {
    const list: LiveDanmakuItem[] = [];
    for (let i = 0; i <= currentGlobalBeatIdx && i < allTimelineBeats.length; i++) {
      const dm = allTimelineBeats[i].beat.danmaku || [];
      list.push(...dm);
    }
    return list;
  }, [allTimelineBeats, currentGlobalBeatIdx]);

  const allSuperChats = useMemo(
    () => visibleDanmakuFeed.filter(d => (d.scAmount && d.scAmount > 0) || d.giftName),
    [visibleDanmakuFeed],
  );

  // 弹幕更新时自动滚到底部
  useEffect(() => {
    if (chatScrollRef.current && lowerTab === 'chat') {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [visibleDanmakuFeed.length, currentGlobalBeatIdx, lowerTab]);

  const activePersona =
    viewerPersonas.find(p => p.id === activePersonaId) ||
    viewerPersonas[0] || {
      id: 'viewer_main_self',
      name: userName,
      isMain: true,
      fanLevel: 20,
      badgeText: 'Member',
    };

  const displayAvatar = channel.avatar || charAvatar;
  const displayBackgroundUrl = session.customBackgroundUrl || channel.roomBackgroundUrl || '';
  const brightGradient = normalizeBrightGradient(channel.bannerGradient);
  const activeGifts: StreamGiftOption[] =
    session.sessionGifts && session.sessionGifts.length > 0
      ? session.sessionGifts
      : channel.customGifts || [];

  // 打开某拍的长按菜单
  const openBeatMenu = (chunkId: string, beat: LiveBeat, labelPrefix: string) => {
    setActionSheetTarget({
      title: `${labelPrefix} · 分镜操作`,
      screen: beat.screen,
      speechOriginal: beat.speechOriginal,
      speechTranslated: beat.speechTranslated,
      audioUrl: beat.audioUrl,
      canPlayVoice: Boolean(beat.speechOriginal?.trim()),
      canEdit: true,
      canRerollChunk: true,
      canShareClip: true,
      onPlayVoice: () => onPlayBeatVoice(beat),
      onRetryVoice: () => onPlayBeatVoice(beat, { skipCache: true }),
      onDownloadVoice: () => {
        if (beat.audioUrl) {
          void downloadVoiceAudioUrl(beat.audioUrl, `${channel.channelName}_beat_${beat.index + 1}`);
        } else {
          onPlayBeatVoice(beat);
        }
      },
      onSaveEdit: (nextScreen, nextSpeech, nextTrans) => {
        onEditBeat(chunkId, beat.id, nextScreen, nextSpeech, nextTrans);
      },
      onRerollChunk: () => onRerollChunk(chunkId),
      onShareClip: () => onShareClipToChat(beat),
    });
  };

  // 发送弹幕或 SC
  const handleSendSubmit = () => {
    const trimmed = danmakuInput.trim();
    if (!trimmed) return;
    if (activeBottomDrawer === 'sc') {
      const tier = SC_TIER_OPTIONS[selectedScTierIdx] || SC_TIER_OPTIONS[0];
      onSendUserDanmaku(trimmed, tier.amount, tier.color, immediateReplyOnSend);
      setActiveBottomDrawer('none');
    } else {
      onSendUserDanmaku(trimmed, undefined, undefined, immediateReplyOnSend);
    }
    setDanmakuInput('');
  };

  // 送出专属礼物
  const handleSendGift = (gift: StreamGiftOption) => {
    const msg = danmakuInput.trim() || `送出了 ${gift.emoji} ${gift.name}！`;
    onSendUserDanmaku(msg, undefined, undefined, immediateReplyOnSend, gift);
    setDanmakuInput('');
    setActiveBottomDrawer('none');
  };

  const handleUploadBgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateCustomBackground(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const cleanSpeechTrans = currentBeat?.speechTranslated
    ? currentBeat.speechTranslated.replace(/^译[：:]\s*/, '').trim()
    : '';

  const formatTimeCode = (idx: number) => {
    const totalSec = idx * 18 + 12;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isNico = platformTheme === 'niconico';

  // ==================== 共享：明亮干净的视频画面舞台（16:9 / 全屏） ====================
  const renderVideoStage = (fullscreenMode: boolean) => (
    <div
      className={`relative w-full overflow-hidden select-none ${
        fullscreenMode ? 'flex-1 min-h-[220px]' : 'aspect-video shrink-0'
      }`}
      style={{
        background: displayBackgroundUrl ? '#f8fafc' : brightGradient,
      }}
      onClick={() => setShowPlayerControls(v => !v)}
    >
      {/* 自定义背景图：100% 明亮原画质，绝不压黑遮罩 */}
      {displayBackgroundUrl && (
        <img
          src={displayBackgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* 默认明亮氛围舞台：展示主播清晰立绘/头像与声波光环 */}
      {!displayBackgroundUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative">
            {displayAvatar ? (
              <TokenImg
                src={displayAvatar}
                alt={channel.channelName}
                className={`rounded-full object-cover border-4 border-white shadow-xl transition-transform duration-300 ${
                  fullscreenMode ? 'w-28 h-28' : 'w-20 h-20'
                } ${ttsPlayingBeatId === currentBeat?.id ? 'scale-105 ring-4 ring-red-400/60' : ''}`}
              />
            ) : (
              <div
                className={`rounded-full bg-white/90 text-slate-800 border-4 border-white shadow-xl flex items-center justify-center font-extrabold ${
                  fullscreenMode ? 'w-28 h-28 text-3xl' : 'w-20 h-20 text-2xl'
                }`}
              >
                {channel.channelName.slice(0, 1)}
              </div>
            )}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#ff0033] text-white text-[10px] font-extrabold tracking-wider shadow">
              LIVE
            </span>
          </div>
        </div>
      )}

      {/* 左上角极简状态角标（pointer-events-none，绝不挡操作） */}
      {!fullscreenMode && (
        <div className="pointer-events-none absolute top-2.5 left-3 right-3 flex items-center justify-between z-[14]">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/55 backdrop-blur-sm text-white text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#ff0033] animate-pulse" />
            <span>{isNico ? '生放送 ON AIR' : 'LIVE'}</span>
            <span className="opacity-80">· {formatTimeCode(currentGlobalBeatIdx)}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/55 backdrop-blur-sm text-white text-[11px] font-medium">
            <span>👁 {session.viewerCount.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* 上半区无底色飘屏弹幕（严格限制在 top 0~48%，绝不挡下方或按钮） */}
      <FloatingDanmakuOverlay
        danmakuList={currentBeat?.danmaku || []}
        showTranslation={showTranslation}
        visible={showDanmakuOverlay}
        platformTheme={platformTheme}
      />

      {/* AI 生成中轻提示 */}
      {isGenerating && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[16] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 text-white text-xs font-semibold shadow">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
          <span>主播正在反应…</span>
        </div>
      )}

      {/* 点击画面才显隐的极简播放器控制层（Tap-to-reveal Controls） */}
      {showPlayerControls && (
        <div
          className="absolute inset-0 z-[20] bg-black/35 backdrop-blur-[1px] flex flex-col justify-between p-3"
          onClick={() => setShowPlayerControls(false)}
        >
          {/* 顶部快速开关行 */}
          <div
            className="flex items-center justify-end gap-2"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowDanmakuOverlay(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                showDanmakuOverlay ? 'bg-white text-slate-900' : 'bg-black/60 text-white/80'
              }`}
            >
              {showDanmakuOverlay ? '弹幕 ON' : '弹幕 OFF'}
            </button>
            {channel.voiceConfig?.language && channel.voiceConfig.language !== 'zh' && (
              <button
                type="button"
                onClick={() => setShowTranslation(v => !v)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                  showTranslation ? 'bg-white text-slate-900' : 'bg-black/60 text-white/80'
                }`}
              >
                CC 同传
              </button>
            )}
            <button
              type="button"
              onClick={() => bgFileInputRef.current?.click()}
              className="px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-bold whitespace-nowrap"
            >
              🖼️ 换背景
            </button>
          </div>

          {/* 中央大号播放/选拍控制键 */}
          <div
            className="flex items-center justify-center gap-6"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={currentGlobalBeatIdx <= 0}
              onClick={() => {
                setAutoPlayStep(false);
                setCurrentGlobalBeatIdx(i => Math.max(0, i - 1));
              }}
              className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center text-base font-bold disabled:opacity-35"
              aria-label="上一拍"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => setAutoPlayStep(v => !v)}
              className="w-12 h-12 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center text-lg font-extrabold"
              aria-label={autoPlayStep ? '暂停自动推进' : '开启自动推进'}
            >
              {autoPlayStep ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentGlobalBeatIdx < allTimelineBeats.length - 1) {
                  setCurrentGlobalBeatIdx(i => i + 1);
                } else {
                  onGenerateNextChunk();
                }
              }}
              className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center text-base font-bold"
              aria-label="下一拍"
            >
              ⏭
            </button>
          </div>

          {/* 右下角全屏切换与时间码 */}
          <div
            className="flex items-center justify-between text-white text-xs font-bold"
            onClick={e => e.stopPropagation()}
          >
            <span>
              分镜 {allTimelineBeats.length > 0 ? currentGlobalBeatIdx + 1 : 0} / {allTimelineBeats.length}
            </span>
            <button
              type="button"
              onClick={() => setIsFullscreen(v => !v)}
              className="px-3 py-1 rounded-full bg-black/65 text-white text-xs font-bold whitespace-nowrap"
            >
              {fullscreenMode ? '↙ 退出全屏' : '⛶ 全屏观看'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ==================== 共享：可自由拖动/点击的播放器进度条（Scrubber Bar） ====================
  const renderScrubberBar = () => {
    const total = Math.max(1, allTimelineBeats.length);
    return (
      <div
        className={`px-3 py-1.5 flex items-center gap-2.5 border-b shrink-0 ${
          isNico ? 'bg-[#1f1f1f] border-[#333] text-white' : 'bg-white border-slate-200 text-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => setAutoPlayStep(v => !v)}
          className="text-xs font-bold px-2 py-0.5 rounded hover:bg-black/5 whitespace-nowrap shrink-0"
          title={autoPlayStep ? '正在自动推进' : '已暂停推进'}
        >
          {autoPlayStep ? '⏸' : '▶'}
        </button>

        <span className="text-[11px] font-mono opacity-80 whitespace-nowrap shrink-0">
          {allTimelineBeats.length > 0 ? currentGlobalBeatIdx + 1 : 0}/{allTimelineBeats.length}拍
        </span>

        {/* 真实可拖拽进度滑块 */}
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={Math.min(currentGlobalBeatIdx, Math.max(0, total - 1))}
          onChange={e => {
            setAutoPlayStep(false);
            setCurrentGlobalBeatIdx(Number(e.target.value));
          }}
          className="flex-1 h-1.5 rounded-lg cursor-pointer accent-[#ff0033]"
          style={{
            accentColor: isNico ? '#0080ff' : '#ff0033',
          }}
        />

        <button
          type="button"
          disabled={isGenerating}
          onClick={onGenerateNextChunk}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 transition ${
            isNico
              ? 'bg-[#0080ff] text-white hover:bg-[#006dda]'
              : 'bg-[#ff0033] text-white hover:bg-[#cc0029]'
          } disabled:opacity-50`}
        >
          {isGenerating ? '生成中…' : '✨ 下一段'}
        </button>

        <button
          type="button"
          onClick={() => setIsFullscreen(v => !v)}
          className="px-2 py-0.5 rounded text-xs font-bold opacity-80 hover:opacity-100 whitespace-nowrap shrink-0"
          title="切换全屏"
        >
          {isFullscreen ? '↙ 收起' : '⛶ 全屏'}
        </button>
      </div>
    );
  };

  // ==================== 共享：完整不截断的当前镜头实况 & 台词卡（轻点播语音，长按弹菜单） ====================
  const renderCurrentBeatCard = (compact = false) => {
    if (!currentBeat) return null;
    const isPlaying = ttsPlayingBeatId === currentBeat.id;
    const isLoadingVoice = ttsLoadingBeatId === currentBeat.id;

    return (
      <div
        {...bindLongPress(() => openBeatMenu(currentChunkId, currentBeat, `第 ${currentGlobalBeatIdx + 1} 拍`))}
        onClick={() => {
          if (wasLongPressTriggered()) return;
          if (currentBeat.speechOriginal?.trim()) {
            onPlayBeatVoice(currentBeat);
          }
        }}
        className={`relative transition cursor-pointer select-text ${
          isNico
            ? 'bg-[#f7f9fb] border-b border-slate-200 px-3.5 py-2.5'
            : compact
            ? 'bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-lg px-3.5 py-2.5 mx-3'
            : 'bg-slate-50/90 border-b border-slate-200 px-4 py-3'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            {/* 镜头画面动作描写（完整显示，绝不 line-clamp 截断！） */}
            <div className="text-[13px] text-slate-600 leading-relaxed break-words">
              <span className="inline-block font-bold text-slate-800 mr-1.5">
                {isNico ? '【実況・画面】' : '🎥 画面：'}
              </span>
              {currentBeat.screen}
            </div>

            {/* 主播台词与同传翻译 */}
            {currentBeat.speechOriginal ? (
              <div className="pt-0.5">
                <div className="text-[14px] font-bold text-slate-900 leading-relaxed break-words flex items-start gap-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 ${
                      isPlaying
                        ? 'bg-red-600 text-white animate-pulse'
                        : isLoadingVoice
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isPlaying ? '🔊 朗读中' : isLoadingVoice ? '⏳ 合成中' : '🔊 点按听语音'}
                  </span>
                  <span>「{currentBeat.speechOriginal}」</span>
                </div>
                {showTranslation && cleanSpeechTrans && cleanSpeechTrans !== currentBeat.speechOriginal && (
                  <div className="text-[13px] text-sky-700 font-medium leading-relaxed mt-0.5 pl-1">
                    {cleanSpeechTrans}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs italic text-slate-400">
                （此拍主播正专注手头动作，未开口说话）
              </div>
            )}
          </div>

          {/* 右侧极简三点菜单触发器（与长按等效） */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              openBeatMenu(currentChunkId, currentBeat, `第 ${currentGlobalBeatIdx + 1} 拍`);
            }}
            className="w-7 h-7 rounded-full hover:bg-slate-200/80 text-slate-500 flex items-center justify-center text-base font-bold shrink-0"
            title="更多操作（播放/下载语音/编辑/重Roll）"
          >
            ⋮
          </button>
        </div>
      </div>
    );
  };

  // ==================== 共享：底部常驻输入栏（非全屏 & 全屏通用，支持马甲/弹幕/SC/礼物） ====================
  const renderBottomInputDock = () => (
    <div
      className={`border-t shrink-0 ${
        isNico ? 'bg-[#252525] border-[#3a3a3a] text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Super Chat 档位选择面板 */}
      {activeBottomDrawer === 'sc' && (
        <div className="p-3 bg-slate-50 border-b border-slate-200 text-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>💎 发送 Super Chat 付费醒目留言</span>
            <button
              type="button"
              onClick={() => setActiveBottomDrawer('none')}
              className="text-slate-400 hover:text-slate-700"
            >
              收起 ✕
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {SC_TIER_OPTIONS.map((tier, idx) => (
              <button
                type="button"
                key={tier.amount}
                onClick={() => setSelectedScTierIdx(idx)}
                style={{
                  backgroundColor: selectedScTierIdx === idx ? tier.headerBg : '#ffffff',
                  color: selectedScTierIdx === idx ? '#ffffff' : '#334155',
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 shrink-0 whitespace-nowrap shadow-sm"
              >
                {tier.label} · {tier.pinDurationLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 直播间专属礼物面板 */}
      {activeBottomDrawer === 'gift' && (
        <div className="p-3 bg-slate-50 border-b border-slate-200 text-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">🎁 投喂直播间专属礼物</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRequestRefreshGifts}
                className="text-red-600 font-bold hover:underline whitespace-nowrap"
              >
                🎲 AI 换一批专属礼物
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomDrawer('none')}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {activeGifts.map(gift => (
              <button
                type="button"
                key={gift.id}
                onClick={() => handleSendGift(gift)}
                className="p-2 rounded-xl bg-white border border-slate-200 hover:border-red-400 flex flex-col items-center text-center transition active:scale-95"
              >
                <span className="text-xl">{gift.emoji}</span>
                <span className="text-[11px] font-bold text-slate-800 truncate w-full mt-0.5">
                  {gift.name}
                </span>
                <span className="text-[10px] text-red-600 font-extrabold">
                  {gift.currencySymbol}{gift.price}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 主输入行 */}
      <div className="px-2.5 py-2 flex items-center gap-2">
        {/* 左侧：马甲切换键（YouTube 圆头像 / NicoNico [なふだ/184] 按钮） */}
        <button
          type="button"
          onClick={onOpenPersonaModal}
          className={`px-2.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1 border ${
            isNico
              ? activePersona.isMain
                ? 'bg-[#0080ff] border-[#0080ff] text-white'
                : 'bg-[#383838] border-[#555] text-slate-200'
              : activePersona.isMain
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-slate-100 border-slate-300 text-slate-700'
          }`}
          title="点击切换大号本尊 / 匿名小号马甲"
        >
          <span>{activePersona.isMain ? (isNico ? 'なふだON' : '本尊') : (isNico ? '184匿名' : '小号')}</span>
          <span className="max-w-[56px] truncate">{activePersona.name}</span>
        </button>

        {/* 输入框 */}
        <input
          value={danmakuInput}
          onChange={e => setDanmakuInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSendSubmit();
            }
          }}
          placeholder={
            activeBottomDrawer === 'sc'
              ? `发送 ${SC_TIER_OPTIONS[selectedScTierIdx]?.label} Super Chat…`
              : isNico
              ? 'コメントを入力…'
              : `Chat as ${activePersona.name}…`
          }
          className={`flex-1 min-w-0 px-3.5 py-2 text-sm focus:outline-none ${
            isNico
              ? 'rounded bg-[#141414] border border-[#444] text-white placeholder:text-slate-400'
              : 'rounded-full bg-[#f2f2f2] text-[#0f0f0f] placeholder:text-[#606060]'
          }`}
        />

        {/* Super Chat 按钮 */}
        <button
          type="button"
          onClick={() => setActiveBottomDrawer(v => (v === 'sc' ? 'none' : 'sc'))}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 ${
            activeBottomDrawer === 'sc'
              ? 'bg-amber-500 text-white'
              : isNico
              ? 'bg-[#383838] text-amber-300'
              : 'bg-[#f2f2f2] text-slate-700 hover:bg-slate-200'
          }`}
          title="发送 Super Chat 付费醒目留言"
        >
          $
        </button>

        {/* 专属礼物按钮 */}
        <button
          type="button"
          onClick={() => setActiveBottomDrawer(v => (v === 'gift' ? 'none' : 'gift'))}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
            activeBottomDrawer === 'gift'
              ? 'bg-pink-600 text-white'
              : isNico
              ? 'bg-[#383838] text-pink-300'
              : 'bg-[#f2f2f2] text-slate-700 hover:bg-slate-200'
          }`}
          title="投喂直播间专属礼物"
        >
          🎁
        </button>

        {/* 发送按钮 */}
        <button
          type="button"
          disabled={!danmakuInput.trim()}
          onClick={handleSendSubmit}
          className={`px-3.5 py-2 text-xs font-extrabold whitespace-nowrap shrink-0 transition disabled:opacity-40 ${
            activeBottomDrawer === 'sc'
              ? 'rounded-full bg-amber-500 text-white'
              : isNico
              ? 'rounded bg-[#0080ff] text-white'
              : 'rounded-full bg-[#0f0f0f] text-white'
          }`}
        >
          {isNico ? '投稿' : '发送'}
        </button>
      </div>
    </div>
  );

  // ==================== 全屏沉浸模式（Full-Screen Portrait Live） ====================
  if (isFullscreen) {
    return (
      <div className="h-full w-full flex flex-col bg-slate-900 overflow-hidden select-none">
        <input
          ref={bgFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadBgFile}
        />

        {/* 全屏顶栏：单行清爽，绝不换行 */}
        <div className="h-12 px-3 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold whitespace-nowrap shrink-0"
            >
              ← 退出全屏
            </button>
            <span className="text-xs font-bold text-slate-900 truncate">
              {channel.channelName} · {session.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowDanmakuOverlay(v => !v)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                showDanmakuOverlay ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {showDanmakuOverlay ? '弹幕开' : '弹幕关'}
            </button>
            <button
              type="button"
              onClick={() => setShowFloatingPhone(true)}
              className="relative px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold whitespace-nowrap"
            >
              📱 私聊
              {phoneUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500" />
              )}
            </button>
          </div>
        </div>

        {/* 全屏主画面舞台（上半区飘屏弹幕，下半区悬浮当前实况卡，互不遮挡） */}
        <div className="relative flex-1 min-h-0 flex flex-col justify-end">
          {renderVideoStage(true)}

          {/* 下方悬浮的当前镜头与台词卡片 */}
          <div className="pb-2 pt-1 bg-gradient-to-t from-black/25 to-transparent">
            {renderCurrentBeatCard(true)}
          </div>
        </div>

        {/* 全屏进度条 */}
        {renderScrubberBar()}

        {/* 全屏底部常驻发弹幕/SC/礼物栏 */}
        {renderBottomInputDock()}

        {/* 私聊小手机浮窗 & 长按菜单 */}
        <LiveFloatingPhone
          isOpen={showFloatingPhone}
          characterId={charId}
          charName={charName}
          contextDescription={`【直播间手机私聊】此刻你正在直播间《${session.title}》（频道：${channel.channelName}）开着直播，镜头正对着你。${userName} 正在台下用手机给你发私聊消息；你在直播间隙低头看手机回复TA，沿用正常私聊的交流方式。`}
          onClose={() => setShowFloatingPhone(false)}
          onUnreadChange={setPhoneUnread}
        />
        <BeatLongPressSheet
          target={actionSheetTarget}
          ttsLoading={Boolean(ttsLoadingBeatId)}
          onClose={() => setActionSheetTarget(null)}
        />
      </div>
    );
  }

  // ==================== 非全屏模式：真实 YouTube Live vs 真实 ニコニコ生放送 双架构 ====================
  return (
    <div className={`h-full w-full flex flex-col overflow-hidden ${isNico ? 'bg-[#f4f4f4]' : 'bg-white'}`}>
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadBgFile}
      />

      {/* ==================== 1. 顶部平台导航栏 ==================== */}
      {isNico ? (
        /* 真实 ニコニコ生放送 #252525 顶栏 */
        <header className="h-11 px-3 bg-[#252525] text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToLobby}
              className="px-2 py-1 rounded bg-[#383838] hover:bg-[#484848] text-xs font-bold whitespace-nowrap shrink-0"
            >
              ← 番組表
            </button>
            <span className="text-xs font-extrabold tracking-tight truncate text-slate-100">
              📺 {session.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onChangePlatformTheme('youtube')}
              className="px-2 py-1 rounded bg-[#383838] text-[11px] font-bold text-slate-200 whitespace-nowrap"
            >
              切 YouTube
            </button>
            <button
              type="button"
              onClick={onEndStreamClick}
              className="px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-bold whitespace-nowrap"
            >
              番組終了
            </button>
          </div>
        </header>
      ) : (
        /* 真实 YouTube 纯白极简顶栏 */
        <header className="h-11 px-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToLobby}
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 font-bold shrink-0"
              aria-label="返回大厅"
            >
              ←
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-1.5 py-0.5 rounded bg-[#ff0033] text-white text-[10px] font-extrabold shrink-0">
                ▶ LIVE
              </span>
              <span className="text-xs font-bold text-[#0f0f0f] truncate">
                {channel.channelName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onChangePlatformTheme('niconico')}
              className="px-2.5 py-1 rounded-full bg-[#f2f2f2] hover:bg-slate-200 text-[#0f0f0f] text-[11px] font-bold whitespace-nowrap"
            >
              📺 切 NicoNico
            </button>
            <button
              type="button"
              onClick={onEndStreamClick}
              className="px-2.5 py-1 rounded-full bg-red-50 text-[#ff0033] border border-red-200 text-[11px] font-bold whitespace-nowrap"
            >
              ⏹ 下播结算
            </button>
          </div>
        </header>
      )}

      {/* ==================== 2. 16:9 视频画面 + 进度条 + 完整实况台词卡 ==================== */}
      {renderVideoStage(false)}
      {renderScrubberBar()}
      {renderCurrentBeatCard(false)}

      {/* ==================== 3. 平台专属频道信息条 / 番組ステータスバー ==================== */}
      {isNico ? (
        /* 真实 ニコニコ生放送 番組統計ステータスバー */
        <div className="bg-white border-b border-slate-200 px-3 py-2 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3 text-slate-700 font-bold overflow-x-auto no-scrollbar whitespace-nowrap">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                放送中
              </span>
              <span>👤 来場者 {session.viewerCount.toLocaleString()}</span>
              <span>💬 コメ {visibleDanmakuFeed.length}</span>
              <span>🎁 ギフト {allSuperChats.length * 500} pt</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowFloatingPhone(true)}
                className="relative px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-bold whitespace-nowrap"
              >
                📱 私聊小窗
                {phoneUnread && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
                )}
              </button>
              <button
                type="button"
                onClick={onOpenChannelSettings}
                className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-[11px] font-bold whitespace-nowrap"
              >
                ⚙️ 設定
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 真实 YouTube Watch Page 标题 + 频道订阅行 + 横向单行 Action Pills */
        <div className="bg-white border-b border-slate-200 px-3.5 py-2.5 shrink-0 space-y-2">
          {/* 标题行（点击可展开今日企划详情与阶段总结） */}
          <div
            onClick={() => setShowHeaderDetail(v => !v)}
            className="cursor-pointer flex items-start justify-between gap-2"
          >
            <h1 className="text-[14px] font-bold text-[#0f0f0f] leading-snug break-words flex-1">
              {session.title}
            </h1>
            <span className="text-xs text-[#606060] whitespace-nowrap shrink-0 mt-0.5">
              {showHeaderDetail ? '收起 ▲' : '简介 ▼'}
            </span>
          </div>

          {showHeaderDetail && (
            <div className="p-2.5 rounded-xl bg-[#f2f2f2] text-xs text-[#0f0f0f] space-y-1.5">
              <div className="text-[#606060] font-medium">
                {session.viewerCount.toLocaleString()} watching now · 分区：{session.categoryLabel}
              </div>
              {session.topicNote && <div>📌 今日企划：{session.topicNote}</div>}
              <div className="flex items-center gap-2 pt-1">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={immediateReplyOnSend}
                    onChange={e => setImmediateReplyOnSend(e.target.checked)}
                    className="rounded accent-[#ff0033]"
                  />
                  <span>发弹幕/SC后立即让主播插队回应</span>
                </label>
              </div>
            </div>
          )}

          {/* 频道头像 + 订阅胶囊 + 横向单行工具胶囊（绝不折成两行字！） */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 shrink-0">
              {displayAvatar ? (
                <TokenImg
                  src={displayAvatar}
                  alt={channel.channelName}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {channel.channelName.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#0f0f0f] truncate max-w-[110px]">
                  {channel.channelName}
                </div>
                <div className="text-[10px] text-[#606060] whitespace-nowrap">
                  {(channel.followerCount / 1000).toFixed(1)}K subscribers
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#0f0f0f] text-white text-[11px] font-bold whitespace-nowrap">
                Subscribed
              </span>
            </div>

            {/* 右侧单行胶囊按钮组 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowFloatingPhone(true)}
                className="relative px-3 py-1.5 rounded-full bg-[#f2f2f2] hover:bg-slate-200 text-[#0f0f0f] text-xs font-bold whitespace-nowrap flex items-center gap-1"
              >
                <span>📱 私聊</span>
                {phoneUnread && (
                  <span className="w-2 h-2 rounded-full bg-[#ff0033]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => bgFileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-full bg-[#f2f2f2] hover:bg-slate-200 text-[#0f0f0f] text-xs font-bold whitespace-nowrap"
              >
                🖼️ 背景
              </button>
              <button
                type="button"
                onClick={onOpenChannelSettings}
                className="px-3 py-1.5 rounded-full bg-[#f2f2f2] hover:bg-slate-200 text-[#0f0f0f] text-xs font-bold whitespace-nowrap"
              >
                ⚙️ 频道
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 4. 下半屏切换栏：实时聊天/コメビュ vs 完整台词分镜回放 ==================== */}
      <div className="h-9 px-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setLowerTab('chat')}
            className={`h-9 text-xs font-extrabold border-b-2 transition whitespace-nowrap ${
              lowerTab === 'chat'
                ? isNico
                  ? 'border-[#0080ff] text-[#0080ff]'
                  : 'border-[#0f0f0f] text-[#0f0f0f]'
                : 'border-transparent text-slate-500'
            }`}
          >
            {isNico ? `コメント一覧 (${visibleDanmakuFeed.length})` : `Top chat ▾ (${visibleDanmakuFeed.length})`}
          </button>
          <button
            type="button"
            onClick={() => setLowerTab('script')}
            className={`h-9 text-xs font-extrabold border-b-2 transition whitespace-nowrap ${
              lowerTab === 'script'
                ? isNico
                  ? 'border-[#0080ff] text-[#0080ff]'
                  : 'border-[#0f0f0f] text-[#0f0f0f]'
                : 'border-transparent text-slate-500'
            }`}
          >
            {isNico ? `配信ログ・台本 (${allTimelineBeats.length}拍)` : `完整台词与分镜 (${allTimelineBeats.length})`}
          </button>
        </div>

        <span className="text-[11px] text-slate-400 whitespace-nowrap">
          长按台词可下载/编辑/重Roll
        </span>
      </div>

      {/* Super Chat 顶部固定色卡栏（仅在聊天视图且存在 SC 时显示） */}
      {lowerTab === 'chat' && (
        <SuperChatTickerBar scList={allSuperChats} showTranslation={showTranslation} />
      )}

      {/* ==================== 5. 主滚动列表区 ==================== */}
      <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto bg-white">
        {lowerTab === 'chat' ? (
          isNico ? (
            /* 架构 B：真实 ニコニコ生放送 「コメント一覧（コメビュ）」三列表格 */
            <div className="w-full text-xs">
              <div className="sticky top-0 bg-[#f0f0f0] border-b border-slate-300 px-3 py-1.5 grid grid-cols-12 font-bold text-slate-600 text-[11px]">
                <div className="col-span-7">コメント</div>
                <div className="col-span-2 text-right">再生</div>
                <div className="col-span-3 text-right">なふだ/ID</div>
              </div>

              {visibleDanmakuFeed.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  まだコメントはありません。最初のコメントを投稿しよう！
                </div>
              ) : (
                visibleDanmakuFeed.map((dm, idx) => {
                  const isScOrGift = Boolean((dm.scAmount && dm.scAmount > 0) || dm.giftName);
                  const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
                  const cleanTrans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';

                  return (
                    <div
                      key={dm.id || idx}
                      className={`px-3 py-2 border-b border-slate-100 grid grid-cols-12 items-baseline gap-1 ${
                        isScOrGift
                          ? 'bg-amber-50/90 font-bold'
                          : isMine
                          ? 'bg-sky-50/70'
                          : idx % 2 === 1
                          ? 'bg-[#fafafa]'
                          : 'bg-white'
                      }`}
                    >
                      <div className="col-span-7 min-w-0 break-words leading-snug text-slate-900">
                        {dm.scAmount ? (
                          <span className="inline-block px-1.5 py-0.2 mr-1 rounded bg-amber-500 text-white text-[10px] font-extrabold">
                            ¥{dm.scAmount}
                          </span>
                        ) : null}
                        {dm.giftName ? (
                          <span className="inline-block px-1.5 py-0.2 mr-1 rounded bg-pink-500 text-white text-[10px] font-extrabold">
                            {dm.giftEmoji || '🎁'}{dm.giftName}
                          </span>
                        ) : null}
                        <span>{dm.text}</span>
                        {showTranslation && cleanTrans && cleanTrans !== dm.text && (
                          <span className="block text-[11px] text-sky-700 font-normal mt-0.5">
                            {cleanTrans}
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 text-right font-mono text-[11px] text-slate-400">
                        {formatTimeCode(Math.floor(idx / 3))}
                      </div>
                      <div className="col-span-3 text-right truncate text-[11px]">
                        {isMine ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#0080ff] text-white font-bold text-[10px]">
                            {dm.senderName}
                          </span>
                        ) : (
                          <span className="text-slate-500">{dm.senderName}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* 架构 A：真实 YouTube Live Chat 列表（圆头像 + 灰名 + Member 绿标 + 弹幕正文） */
            <div className="px-3.5 py-2 space-y-2">
              {visibleDanmakuFeed.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Welcome to live chat! Remember to guard your privacy and abide by community guidelines.
                </div>
              ) : (
                visibleDanmakuFeed.map((dm, idx) => {
                  const isSc = Boolean(dm.scAmount && dm.scAmount > 0);
                  const isGift = Boolean(dm.giftName);
                  const isMine = Boolean(dm.isUserMain || dm.isUserAlt);
                  const cleanTrans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';

                  if (isSc) {
                    return (
                      <SuperChatHighlightCard
                        key={dm.id || idx}
                        item={dm}
                        showTranslation={showTranslation}
                      />
                    );
                  }

                  if (isGift) {
                    return (
                      <div
                        key={dm.id || idx}
                        className="my-1 px-3 py-2 rounded-xl bg-gradient-to-r from-pink-50 to-amber-50 border border-pink-200 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-pink-700 mr-1.5">{dm.senderName}</span>
                          <span className="text-slate-800 font-semibold">{dm.text}</span>
                        </div>
                        <span className="text-lg ml-2 shrink-0">{dm.giftEmoji || '🎁'}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={dm.id || idx}
                      className={`flex items-start gap-2.5 py-0.5 text-[13px] leading-snug ${
                        isMine ? 'bg-slate-50 -mx-2 px-2 py-1 rounded-lg' : ''
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
                          isMine ? 'bg-[#0f0f0f] text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {dm.senderName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 break-words">
                        <span
                          className={`font-semibold mr-1.5 text-xs ${
                            isMine
                              ? 'text-[#0f0f0f] font-bold'
                              : dm.fanBadge
                              ? 'text-[#0f9d58]'
                              : 'text-[#606060]'
                          }`}
                        >
                          {dm.senderName}
                        </span>
                        {dm.fanBadge && (
                          <span className="inline-block px-1 py-0.2 mr-1.5 rounded bg-emerald-50 text-[#0f9d58] border border-emerald-200 text-[10px] font-bold">
                            {dm.fanBadge}
                          </span>
                        )}
                        <span className="text-[#0f0f0f]">{dm.text}</span>
                        {showTranslation && cleanTrans && cleanTrans !== dm.text && (
                          <span className="text-sky-700 text-xs ml-1.5">
                            （{cleanTrans}）
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )
        ) : (
          /* ==================== 完整台词与分镜剧本回放视图（支持长按操作与阶段摘要管理） ==================== */
          <div className="p-3.5 space-y-3">
            {/* 已折叠的阶段总结卡片 */}
            {session.rollingSummaries.map((sum, sIdx) => (
              <div
                key={sum.id}
                className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900">
                    📑 阶段纪要 #{sIdx + 1}（已收纳第 {sum.fromChunkIndex + 1}~{sum.toChunkIndex + 1} 段）
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSummaryId(sum.id);
                        setSummaryDraft(sum.content);
                      }}
                      className="text-amber-800 font-semibold hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={isSummarizing}
                      onClick={() => onRegenerateRollingSummary(sum)}
                      className="text-amber-800 font-semibold hover:underline"
                    >
                      重总结
                    </button>
                    <button
                      type="button"
                      onClick={() => onDissolveRollingSummary(sum.id)}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      展开原段
                    </button>
                  </div>
                </div>
                {editingSummaryId === sum.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={summaryDraft}
                      onChange={e => setSummaryDraft(e.target.value)}
                      rows={5}
                      className="w-full rounded-xl bg-white border border-amber-300 p-2.5 text-xs text-slate-800 leading-relaxed"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingSummaryId(null)}
                        className="px-3 py-1 rounded-lg bg-slate-100 text-xs text-slate-600"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEditRollingSummary(sum.id, summaryDraft);
                          setEditingSummaryId(null);
                        }}
                        className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-bold"
                      >
                        保存纪要
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {sum.content}
                  </div>
                )}
              </div>
            ))}

            {/* 展开的分镜拍列表（点击跳到该拍并播语音，长按弹菜单） */}
            {unfoldedChunks.map(chunk => (
              <div
                key={chunk.id}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
              >
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">
                    🎬 第 {chunk.index + 1} 段切片
                  </span>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => onRerollChunk(chunk.id)}
                    className="text-violet-600 font-bold hover:underline"
                  >
                    🎲 重 Roll 本段
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {chunk.beats.map(beat => {
                    const globalIdx = allTimelineBeats.findIndex(item => item.beat.id === beat.id);
                    const isCurrent = globalIdx === currentGlobalBeatIdx;
                    const isPlaying = ttsPlayingBeatId === beat.id;
                    const cleanTr = beat.speechTranslated
                      ? beat.speechTranslated.replace(/^译[：:]\s*/, '').trim()
                      : '';

                    return (
                      <div
                        key={beat.id}
                        {...bindLongPress(() =>
                          openBeatMenu(chunk.id, beat, `第 ${chunk.index + 1} 段 · 第 ${beat.index + 1} 拍`),
                        )}
                        onClick={() => {
                          if (wasLongPressTriggered()) return;
                          if (globalIdx >= 0) setCurrentGlobalBeatIdx(globalIdx);
                          if (beat.speechOriginal?.trim()) {
                            onPlayBeatVoice(beat);
                          }
                        }}
                        className={`p-3.5 transition cursor-pointer ${
                          isCurrent ? 'bg-red-50/40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-[13px] text-slate-600 leading-relaxed">
                              <span className="font-bold text-slate-800 mr-1">
                                #{beat.index + 1}
                              </span>
                              {beat.screen}
                            </div>
                            {beat.speechOriginal && (
                              <div className="text-[14px] font-bold text-slate-900 leading-relaxed">
                                {isPlaying && (
                                  <span className="text-red-600 mr-1">🔊</span>
                                )}
                                「{beat.speechOriginal}」
                              </div>
                            )}
                            {showTranslation && cleanTr && cleanTr !== beat.speechOriginal && (
                              <div className="text-xs text-sky-700">
                                {cleanTr}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              openBeatMenu(chunk.id, beat, `第 ${chunk.index + 1} 段 · 第 ${beat.index + 1} 拍`);
                            }}
                            className="w-7 h-7 rounded-full hover:bg-slate-200/70 text-slate-400 flex items-center justify-center text-sm font-bold shrink-0"
                          >
                            ⋮
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {unfoldedChunks.length >= 2 && (
              <div className="pt-1 flex justify-center">
                <button
                  type="button"
                  disabled={isSummarizing}
                  onClick={onManualFoldChunks}
                  className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                >
                  {isSummarizing ? '正在用辅助模型整理阶段摘要…' : '📑 将早期切片折叠为阶段摘要'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== 6. 底部常驻输入栏 ==================== */}
      {renderBottomInputDock()}

      {/* ==================== 7. 真·私聊小手机浮窗 & 长按操作菜单 ==================== */}
      <LiveFloatingPhone
        isOpen={showFloatingPhone}
        characterId={charId}
        charName={charName}
        contextDescription={`【直播间手机私聊】此刻你正在直播间《${session.title}》（频道：${channel.channelName}）开着直播，镜头正对着你。${userName} 正在台下用手机给你发私聊消息；你在直播间隙低头看手机回复TA，沿用正常私聊的交流方式。`}
        onClose={() => setShowFloatingPhone(false)}
        onUnreadChange={setPhoneUnread}
      />

      <BeatLongPressSheet
        target={actionSheetTarget}
        ttsLoading={Boolean(ttsLoadingBeatId)}
        onClose={() => setActionSheetTarget(null)}
      />
    </div>
  );
};
