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
  LiveGuidance,
  LiveVoiceClock,
  SC_TIER_OPTIONS,
} from '../../utils/liveStreamTypes';
import { downloadVoiceAudioUrl } from '../../utils/liveStreamStorage';
import {
  getLatestChunkFirstBeatIndex,
  getCurrentBeatDanmakuFeed,
  getVisibleLiveDanmakuFeed,
} from '../../utils/liveStreamTimeline';
import { processImageToBlob } from '../../utils/file';
import { putImageBlobDeduped } from '../../utils/blobRef';
import { BeatActionSheetTarget } from './LiveSharedWidgets';
import { LIVE_SILENT_BEAT_HOLD_MS, nextIndexAfterSilentBeat } from '../../utils/liveSpeechPairs';
import { nextAutoBeatIndex } from '../../utils/liveReplayAudio';
import { LiveWatchScreen } from './LiveWatchScreen';

/** 直播间播放设置：记住用户上次拨过的开关，回到直播间不再重置。 */
type LiveRoomSettings = {
  showDanmakuOverlay: boolean;
  showTranslation: boolean;
  autoPlayStep: boolean;
  immediateReplyOnSend: boolean;
  followVoiceSentences: boolean;
};
const LIVE_ROOM_SETTINGS_KEY = 'live_room_settings_v1';
const loadLiveRoomSettings = (): Partial<LiveRoomSettings> => {
  try {
    const raw = localStorage.getItem(LIVE_ROOM_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<LiveRoomSettings>) : {};
  } catch {
    return {};
  }
};
const saveLiveRoomSettings = (patch: Partial<LiveRoomSettings>) => {
  try {
    localStorage.setItem(LIVE_ROOM_SETTINGS_KEY, JSON.stringify({ ...loadLiveRoomSettings(), ...patch }));
  } catch {
    /* 忽略浏览器存储限制 */
  }
};

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
  voiceClock: LiveVoiceClock | null;
  onSeekVoice: (seconds: number) => void;
  onNudgeVoice: (deltaSec: number) => void;
  voiceEnd: { id: string; n: number } | null;
  onBindAfterVoiceEnd: (handler: ((endedBeatId: string, endCount: number) => void) | null) => void;
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
  onPlayBeatVoice: (beat: LiveBeat, options?: { skipCache?: boolean; fromAuto?: boolean }) => void;
  onPreGenerateBeatVoice: (beat: LiveBeat, sessionId: string) => Promise<void>;
  onSendUserDanmaku: (
    text: string,
    scAmount?: number,
    scColor?: import('../../utils/liveStreamTypes').LiveScColor | 'blue' | 'cyan' | 'amber' | 'magenta',
    triggerImmediateReply?: boolean,
    giftOption?: StreamGiftOption,
    targetBeat?: { chunkId: string; beatId: string },
  ) => void;
  onEditUserDanmaku: (id: string, text: string) => void;
  onDeleteUserDanmaku: (id: string) => void;
  pendingGuidance: LiveGuidance[];
  onAddGuidance: (text: string) => void;
  onRemoveGuidance: (id: string) => void;
  onEditGuidance: (id: string, text: string) => void;
  onToggleDanmakuReply: (danmakuId: string) => void;
  onUpdateCustomBackground: (url: string) => void;
  onManualFoldChunks: () => void;
  onEditRoundSummary: (chunkId: string, nextText: string) => void;
  onForwardRoundToPrivate: (chunkId: string) => void;
  onRegenerateRoundSummary: (chunk: LiveChunk) => void;
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
  voiceClock,
  onSeekVoice,
  onNudgeVoice,
  voiceEnd,
  onBindAfterVoiceEnd,
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
  onPreGenerateBeatVoice,
  onSendUserDanmaku,
  onEditUserDanmaku,
  onDeleteUserDanmaku,
  pendingGuidance,
  onAddGuidance,
  onRemoveGuidance,
  onEditGuidance,
  onToggleDanmakuReply,
  onUpdateCustomBackground,
  onManualFoldChunks,
  onEditRoundSummary,
  onForwardRoundToPrivate,
  onRegenerateRoundSummary,
  onEndStreamClick,
  onShareClipToChat,
}) => {
  // 视图与播放器控制状态（开关读上次保存的偏好，不再每次重置）
  const savedRoomSettings = useRef(loadLiveRoomSettings()).current;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlayerControls, setShowPlayerControls] = useState(false);
  const [autoPlayStep, setAutoPlayStep] = useState(savedRoomSettings.autoPlayStep ?? false);
  const [preGenerateVoice, setPreGenerateVoice] = useState(() => {
    try {
      return localStorage.getItem('live_silent_tts_pregeneration') === '1';
    } catch {
      return false;
    }
  });
  const [showDanmakuOverlay, setShowDanmakuOverlay] = useState(savedRoomSettings.showDanmakuOverlay ?? true);
  const [showTranslation, setShowTranslation] = useState(
    savedRoomSettings.showTranslation
      ?? Boolean(channel.voiceConfig?.enableTranslation || (channel.voiceConfig?.language && channel.voiceConfig.language !== 'zh')),
  );
  // 下方主内容 Tab：实时弹幕 (chat) vs 完整分镜回放 (script)
  const [lowerTab, setLowerTab] = useState<'chat' | 'script'>('chat');
  // 弹幕/SC/礼物输入状态
  const [danmakuInput, setDanmakuInput] = useState('');
  const [activeBottomDrawer, setActiveBottomDrawer] = useState<'none' | 'sc' | 'gift'>('none');
  const [selectedScTierIdx, setSelectedScTierIdx] = useState<number>(0);
  const [immediateReplyOnSend, setImmediateReplyOnSend] = useState(savedRoomSettings.immediateReplyOnSend ?? true);
  const [followVoiceSentences, setFollowVoiceSentences] = useState(savedRoomSettings.followVoiceSentences ?? false);

  // 首次挂载不算用户操作，之后每次改动才写回偏好
  const roomSettingsReadyRef = useRef(false);
  useEffect(() => {
    if (!roomSettingsReadyRef.current) {
      roomSettingsReadyRef.current = true;
      return;
    }
    saveLiveRoomSettings({
      showDanmakuOverlay,
      showTranslation,
      autoPlayStep,
      immediateReplyOnSend,
      followVoiceSentences,
    });
  }, [showDanmakuOverlay, showTranslation, autoPlayStep, immediateReplyOnSend, followVoiceSentences]);

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
  // 「未压缩」= 还没有逐轮摘要的轮次；folded 是旧字段，只给旧数据兼容读
  const unfoldedChunks = useMemo(
    () => session.chunks.filter(c => !(c.roundSummary && c.roundSummary.trim())),
    [session.chunks],
  );
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

  const latestChunkFirstBeatIdx = getLatestChunkFirstBeatIndex(session.chunks, allTimelineBeats);

  const preGenerationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const requestedPreGenerationRef = useRef(new Set<string>());
  const knownBeatIdsRef = useRef(new Set(session.chunks.flatMap(chunk => chunk.beats.map(beat => beat.id))));
  useEffect(() => {
    for (const chunk of session.chunks) {
      for (const beat of chunk.beats) {
        if (knownBeatIdsRef.current.has(beat.id)) continue;
        knownBeatIdsRef.current.add(beat.id);
        if (!preGenerateVoice || !beat.speechOriginal?.trim() || beat.audioUrl || requestedPreGenerationRef.current.has(beat.id)) continue;
        requestedPreGenerationRef.current.add(beat.id);
        preGenerationQueueRef.current = preGenerationQueueRef.current
          .then(() => onPreGenerateBeatVoice(beat, session.id))
          .catch(() => {});
      }
    }
  }, [preGenerateVoice, session.id, session.chunks, onPreGenerateBeatVoice]);

  const togglePreGenerateVoice = () => {
    setPreGenerateVoice(current => {
      const next = !current;
      try {
        localStorage.setItem('live_silent_tts_pregeneration', next ? '1' : '0');
      } catch {
        /* 忽略浏览器存储限制 */
      }
      return next;
    });
  };

  // 当前播放到的全局拍索引（支持进度条自由拖动回看或快进）；新场次从最新一轮第一拍进入。
  const [currentGlobalBeatIdx, setCurrentGlobalBeatIdx] = useState<number>(() => {
    if (session.status === 'ended') return 0;
    return latestChunkFirstBeatIdx;
  });

  // 第一次进来和新切片落库后，都从最新一轮的第一拍看起；切换场次也重新定位。
  const prevChunksLenRef = useRef(session.chunks.length);
  const landedRef = useRef(false);
  const previousSessionIdRef = useRef(session.id);
  useEffect(() => {
    if (previousSessionIdRef.current !== session.id) {
      previousSessionIdRef.current = session.id;
      prevChunksLenRef.current = session.chunks.length;
      landedRef.current = true;
      setCurrentGlobalBeatIdx(session.status === 'ended' ? 0 : latestChunkFirstBeatIdx);
      return;
    }
    if (!landedRef.current) {
      if (allTimelineBeats.length === 0) return;
      landedRef.current = true;
      prevChunksLenRef.current = session.chunks.length;
      setCurrentGlobalBeatIdx(session.status === 'ended' ? 0 : latestChunkFirstBeatIdx);
      return;
    }
    if (session.chunks.length > prevChunksLenRef.current && latestChunk) {
      setCurrentGlobalBeatIdx(latestChunkFirstBeatIdx);
    } else if (currentGlobalBeatIdx >= allTimelineBeats.length && allTimelineBeats.length > 0) {
      setCurrentGlobalBeatIdx(allTimelineBeats.length - 1);
    }
    prevChunksLenRef.current = session.chunks.length;
  }, [session.id, session.chunks.length, allTimelineBeats.length, session.status, latestChunkFirstBeatIdx]);

  const beatsRef = useRef(allTimelineBeats);
  beatsRef.current = allTimelineBeats;

  // 「播完自动下一句」只在声音真正播完时跳到已经写好的下一句，不向模型要新内容。
  // 录音结束的那一下就接下一拍，避免等页面刷新完再播，被浏览器拦住。
  const seenVoiceEnd = useRef(0);
  const playRef = useRef(onPlayBeatVoice);
  playRef.current = onPlayBeatVoice;
  const autoPlayStepRef = useRef(autoPlayStep);
  autoPlayStepRef.current = autoPlayStep;
  const handledVoiceEndRef = useRef<string | null>(null);
  const advanceAfterVoice = (endedId: string, endCount: number) => {
    const stamp = `${endedId}:${endCount}`;
    if (handledVoiceEndRef.current === stamp) return;
    handledVoiceEndRef.current = stamp;
    const list = beatsRef.current;
    const idx = nextAutoBeatIndex({
      autoPlayStep: autoPlayStepRef.current,
      endedId,
      beatIds: list.map(item => item.beat.id),
    });
    if (idx == null) return;
    const next = list[idx].beat;
    setCurrentGlobalBeatIdx(idx);
    if (next.speechOriginal?.trim()) playRef.current(next, { fromAuto: true });
  };
  const advanceAfterVoiceRef = useRef(advanceAfterVoice);
  advanceAfterVoiceRef.current = advanceAfterVoice;
  useEffect(() => {
    onBindAfterVoiceEnd((endedId, endCount) => advanceAfterVoiceRef.current(endedId, endCount));
    return () => onBindAfterVoiceEnd(null);
  }, [onBindAfterVoiceEnd]);
  useEffect(() => {
    if (!voiceEnd || voiceEnd.n === seenVoiceEnd.current) return;
    seenVoiceEnd.current = voiceEnd.n;
    advanceAfterVoice(voiceEnd.id, voiceEnd.n);
  }, [voiceEnd, autoPlayStep, allTimelineBeats]);

  // 两个开关都开时，没有台词的描写拍停 8 秒再进下一拍。最后一拍停住。
  useEffect(() => {
    const current = allTimelineBeats[currentGlobalBeatIdx];
    const nextIndex = nextIndexAfterSilentBeat({
      autoNext: autoPlayStep,
      follow: followVoiceSentences,
      index: currentGlobalBeatIdx,
      count: allTimelineBeats.length,
      hasSpeech: Boolean(current?.beat.speechOriginal?.trim()),
    });
    if (nextIndex == null) return;
    const from = currentGlobalBeatIdx;
    const timer = window.setTimeout(() => {
      const list = beatsRef.current;
      const nextItem = list[from + 1];
      if (!nextItem || list[from]?.beat.speechOriginal?.trim()) return;
      setCurrentGlobalBeatIdx(from + 1);
      if (nextItem.beat.speechOriginal?.trim()) playRef.current(nextItem.beat, { fromAuto: true });
    }, LIVE_SILENT_BEAT_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [autoPlayStep, followVoiceSentences, currentGlobalBeatIdx, allTimelineBeats]);

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
    onPlayBeatVoice(currentBeat, { fromAuto: true });
  }, [currentBeat?.id, channel.voiceConfig?.autoPlayTts]);

  // 实时聊天：已播到的全部轮次；舞台滚动：只飘当前这一拍，切拍就换，本拍内循环
  const scrollingDanmakuFeed = useMemo(() => {
    return getCurrentBeatDanmakuFeed(allTimelineBeats, currentGlobalBeatIdx);
  }, [allTimelineBeats, currentGlobalBeatIdx]);

  const visibleDanmakuFeed = useMemo(() => {
    return getVisibleLiveDanmakuFeed(allTimelineBeats, currentGlobalBeatIdx);
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
      beatId: beat.id,
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
  const handleSendSubmit = (override?: { scAmount?: number }) => {
    const trimmed = danmakuInput.trim();
    if (!trimmed) return;
    const targetBeat = currentTimelineItem
      ? { chunkId: currentTimelineItem.chunkId, beatId: currentTimelineItem.beat.id }
      : undefined;
    if (activeBottomDrawer === 'sc') {
      const custom = Math.floor(Number(override?.scAmount) || 0);
      const tier = SC_TIER_OPTIONS[selectedScTierIdx] || SC_TIER_OPTIONS[0];
      const amount = custom >= 800 ? custom : tier.amount;
      const color = custom >= 800 ? 'red' : tier.color;
      onSendUserDanmaku(trimmed, amount, color, immediateReplyOnSend, undefined, targetBeat);
      setActiveBottomDrawer('none');
    } else {
      onSendUserDanmaku(trimmed, undefined, undefined, immediateReplyOnSend, undefined, targetBeat);
    }
    setDanmakuInput('');
  };

  // 送出专属礼物
  const handleSendGift = (gift: StreamGiftOption) => {
    const msg = danmakuInput.trim() || `送出了 ${gift.emoji} ${gift.name}！`;
    const targetBeat = currentTimelineItem
      ? { chunkId: currentTimelineItem.chunkId, beatId: currentTimelineItem.beat.id }
      : undefined;
    onSendUserDanmaku(msg, undefined, undefined, immediateReplyOnSend, gift, targetBeat);
    setDanmakuInput('');
    setActiveBottomDrawer('none');
  };

  /** 换本场背景：先压到 1600 宽，再存成 blobref 令牌；失败才退回原图 base64 */
  const handleUploadBgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await processImageToBlob(file, { maxWidth: 1600, quality: 0.82, forceJpeg: true });
      const { token } = await putImageBlobDeduped(blob);
      onUpdateCustomBackground(token);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') onUpdateCustomBackground(reader.result);
      };
      reader.readAsDataURL(file);
    }
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
      voiceClock={voiceClock}
      onSeekVoice={onSeekVoice}
      onNudgeVoice={onNudgeVoice}
      followVoiceSentences={followVoiceSentences}
      setFollowVoiceSentences={setFollowVoiceSentences}
      isFullscreen={isFullscreen}
      setIsFullscreen={setIsFullscreen}
      showPlayerControls={showPlayerControls}
      setShowPlayerControls={setShowPlayerControls}
      autoPlayStep={autoPlayStep}
      setAutoPlayStep={setAutoPlayStep}
      preGenerateVoice={preGenerateVoice}
      onTogglePreGenerateVoice={togglePreGenerateVoice}
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
      scrollingDanmakuFeed={scrollingDanmakuFeed}
      onEditUserDanmaku={onEditUserDanmaku}
      onDeleteUserDanmaku={onDeleteUserDanmaku}
      pendingGuidance={pendingGuidance}
      onAddGuidance={onAddGuidance}
      onRemoveGuidance={onRemoveGuidance}
      onEditGuidance={onEditGuidance}
      onToggleDanmakuReply={onToggleDanmakuReply}
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
      onManualFoldChunks={onManualFoldChunks}
      onEditRoundSummary={onEditRoundSummary}
      onForwardRoundToPrivate={onForwardRoundToPrivate}
      onRegenerateRoundSummary={onRegenerateRoundSummary}
      onEndStreamClick={onEndStreamClick}
    />
  );
};
