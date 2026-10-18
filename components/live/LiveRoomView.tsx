/**
 * 电波直播间：逻辑留在这里，画面交给 LiveWatchScreen。
 * YouTube 是白底播放页；ニコニコ是白页、黑播放槽、评论表。不要改回深色顶栏或蓝色条。
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { downloadVoiceAudioUrl } from '../../utils/liveStreamStorage';
import { BeatActionSheetTarget } from './LiveSharedWidgets';
import { LiveWatchScreen } from './LiveWatchScreen';

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
  voiceEnd: { id: string; n: number } | null;
  onBindBack: (fn: () => boolean) => void;
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
  voiceEnd,
  onBindBack,
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
  const [autoPlayStep, setAutoPlayStep] = useState(false);
  const [showDanmakuOverlay, setShowDanmakuOverlay] = useState(true);
  const [showTranslation, setShowTranslation] = useState(
    Boolean(channel.voiceConfig?.enableTranslation || (channel.voiceConfig?.language && channel.voiceConfig.language !== 'zh')),
  );
  // 下方主内容 Tab：实时弹幕 (chat) vs 完整分镜回放 (script)
  const [lowerTab, setLowerTab] = useState<'chat' | 'script'>('chat');
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
  const [currentGlobalBeatIdx, setCurrentGlobalBeatIdx] = useState<number>(() => {
    if (session.status === 'ended') return 0;
    const count = session.chunks.reduce((n, chunk) => n + chunk.beats.length, 0);
    return Math.max(0, count - 1);
  });

  // 第一次进来停在最新一句，推进按钮才在眼前。新切片写出来后，从这一段的第一句看起。
  const prevChunksLenRef = useRef(session.chunks.length);
  const landedRef = useRef(false);
  useEffect(() => {
    if (!landedRef.current) {
      if (allTimelineBeats.length === 0) return;
      landedRef.current = true;
      prevChunksLenRef.current = session.chunks.length;
      if (session.status !== 'ended') {
        setCurrentGlobalBeatIdx(allTimelineBeats.length - 1);
      }
      return;
    }
    if (session.chunks.length > prevChunksLenRef.current && latestChunk) {
      const firstNewBeatId = latestChunk.beats[0]?.id;
      const foundIdx = allTimelineBeats.findIndex(item => item.beat.id === firstNewBeatId);
      if (foundIdx >= 0) setCurrentGlobalBeatIdx(foundIdx);
      else setCurrentGlobalBeatIdx(Math.max(0, allTimelineBeats.length - 1));
    } else if (currentGlobalBeatIdx >= allTimelineBeats.length && allTimelineBeats.length > 0) {
      setCurrentGlobalBeatIdx(allTimelineBeats.length - 1);
    }
    prevChunksLenRef.current = session.chunks.length;
  }, [session.chunks.length, allTimelineBeats.length, session.status]);

  // 「播完自动下一句」只在声音真正播完时跳到已经写好的下一句，不向模型要新内容。
  const seenVoiceEnd = useRef(0);
  const playRef = useRef(onPlayBeatVoice);
  playRef.current = onPlayBeatVoice;
  useEffect(() => {
    if (!voiceEnd || voiceEnd.n === seenVoiceEnd.current) return;
    seenVoiceEnd.current = voiceEnd.n;
    if (!autoPlayStep) return;
    const idx = allTimelineBeats.findIndex(item => item.beat.id === voiceEnd.id);
    if (idx < 0 || idx >= allTimelineBeats.length - 1) return;
    const next = allTimelineBeats[idx + 1].beat;
    setCurrentGlobalBeatIdx(idx + 1);
    if (next.speechOriginal?.trim()) playRef.current(next);
  }, [voiceEnd, autoPlayStep, allTimelineBeats]);

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
    setCurrentGlobalBeatIdx(Math.max(0, allTimelineBeats.length - 1));
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

  return (
    <LiveWatchScreen
      charId={charId}
      charName={charName}
      userName={userName}
      channel={channel}
      session={session}
      viewerPersonas={viewerPersonas}
      activePersona={activePersona}
      platformTheme={platformTheme}
      isGenerating={isGenerating}
      isSummarizing={isSummarizing}
      ttsPlayingBeatId={ttsPlayingBeatId}
      ttsLoadingBeatId={ttsLoadingBeatId}
      isFullscreen={isFullscreen}
      setIsFullscreen={setIsFullscreen}
      showPlayerControls={showPlayerControls}
      setShowPlayerControls={setShowPlayerControls}
      autoPlayStep={autoPlayStep}
      setAutoPlayStep={setAutoPlayStep}
      showDanmakuOverlay={showDanmakuOverlay}
      setShowDanmakuOverlay={setShowDanmakuOverlay}
      showTranslation={showTranslation}
      setShowTranslation={setShowTranslation}
      lowerTab={lowerTab}
      setLowerTab={setLowerTab}
      danmakuInput={danmakuInput}
      setDanmakuInput={setDanmakuInput}
      activeBottomDrawer={activeBottomDrawer}
      setActiveBottomDrawer={setActiveBottomDrawer}
      selectedScTierIdx={selectedScTierIdx}
      setSelectedScTierIdx={setSelectedScTierIdx}
      immediateReplyOnSend={immediateReplyOnSend}
      setImmediateReplyOnSend={setImmediateReplyOnSend}
      showFloatingPhone={showFloatingPhone}
      setShowFloatingPhone={setShowFloatingPhone}
      phoneUnread={phoneUnread}
      onPhoneUnread={setPhoneUnread}
      actionSheetTarget={actionSheetTarget}
      setActionSheetTarget={setActionSheetTarget}
      editingSummaryId={editingSummaryId}
      setEditingSummaryId={setEditingSummaryId}
      summaryDraft={summaryDraft}
      setSummaryDraft={setSummaryDraft}
      bgFileInputRef={bgFileInputRef}
      chatScrollRef={chatScrollRef}
      currentGlobalBeatIdx={currentGlobalBeatIdx}
      setCurrentGlobalBeatIdx={setCurrentGlobalBeatIdx}
      allTimelineBeats={allTimelineBeats}
      unfoldedChunks={unfoldedChunks}
      visibleDanmakuFeed={visibleDanmakuFeed}
      displayAvatar={displayAvatar}
      displayBackgroundUrl={displayBackgroundUrl}
      activeGifts={activeGifts}
      openBeatMenu={openBeatMenu}
      handleSendSubmit={handleSendSubmit}
      handleSendGift={handleSendGift}
      handleUploadBgFile={handleUploadBgFile}
      onChangePlatformTheme={onChangePlatformTheme}
      onSelectPersona={onSelectPersona}
      onOpenPersonaModal={onOpenPersonaModal}
      onOpenChannelSettings={onOpenChannelSettings}
      onBackToLobby={onBackToLobby}
      onBindBack={onBindBack}
      onGenerateNextChunk={onGenerateNextChunk}
      onPlayBeatVoice={onPlayBeatVoice}
      onRequestRefreshGifts={onRequestRefreshGifts}
      onManualFoldChunks={onManualFoldChunks}
      onEditRollingSummary={onEditRollingSummary}
      onRegenerateRollingSummary={onRegenerateRollingSummary}
      onDissolveRollingSummary={onDissolveRollingSummary}
      onEndStreamClick={onEndStreamClick}
    />
  );
};
