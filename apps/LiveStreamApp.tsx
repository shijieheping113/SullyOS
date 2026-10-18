/**
 * 电波 (OnAir) —— 真实 YouTube & 真实 ニコニコ生放送 (NicoNico Live) 独立桌面 App
 *
 * 彻底重做要点：
 * 1. 真实双平台架构（非换皮）：
 *    - YouTube 模式：白底现代流媒体 Masthead + 黑白 Filter Chips + 16:9 宽屏大图 Feed 卡片。
 *    - ニコニコ生放送 模式：#252525 极客顶栏 + #0080ff 蓝线番组 Tab + 双列紧凑「番組表」网格卡片（带 👤来場者 / 💬コメ 统计）。
 * 2. 所有自定义内容生成（标题/今日企划/频道档案/小号马甲/视频主题/NPC规则/专属礼物/阶段总结）全部走辅助模型 (secondaryLlm)。
 * 3. 私聊窗口 100% 复用真 <Chat homePhone={...} /> 小窗，文字无语音按钮，完全对齐主聊天。
 * 4. 严禁 AI 替用户/小号捏造弹幕（Prompt 禁令 + 解析层物理剔除双保险）。
 * 5. 重 Roll 传入被弃用旧文本 + 排除旧 DB 消息 + 高 Temperature 彻底防雷同。
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { synthesizeSpeech } from '../utils/ttsRouter';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  LiveChunk,
  LiveBeat,
  LiveDanmakuItem,
  LiveRollingSummary,
  LiveArchiveDropMode,
  StreamGiftOption,
  VodVideoPost,
  VodChapterBeat,
  VodCommentItem,
  NpcWatchSession,
  NpcWatchBeat,
  NpcStreamerChannelCard,
  LivestreamChatCardPayload,
  LivePlatformTheme,
  STREAM_PRESET_TEMPLATES,
} from '../utils/liveStreamTypes';
import {
  loadPlatformTheme,
  savePlatformTheme,
  ensureDefaultChannelForChar,
  upsertChannel,
  deleteChannelById,
  loadViewerPersonas,
  saveViewerPersonas,
  loadLiveSessions,
  upsertLiveSession,
  deleteLiveSession,
  deleteVodPost,
  loadVodPosts,
  upsertVodPost,
  loadNpcWatchSessions,
  upsertNpcWatchSession,
  loadNpcChannelPool,
  saveNpcChannelPool,
  loadNpcCustomRule,
  saveNpcCustomRule,
  normalizeBrightGradient,
  syncLiveChunkToDb,
  supersedeLiveMessagesWithSummary,
  forgetLiveSessionInDb,
} from '../utils/liveStreamStorage';
import {
  buildLiveStreamTurnPrompt,
  parseLiveBeatsResponse,
  callMainStreamerLlm,
  generateLiveRollingSummary,
  generateLiveFinalSummary,
  generateVodVideoPost,
  generateStreamerVodReply,
  generateNpcWatchBeatDualEngine,
  rerollCharNpcReactionOnly,
  generateAiFieldSuggestion,
  generateStreamCustomGifts,
  generateNpcChannelPoolWithAi,
  AiFieldKind,
} from '../utils/liveStreamPrompts';
import {
  ChannelEditorModal,
  ViewerPersonaModal,
  EndStreamSummaryModal,
} from '../components/live/LiveStreamModals';
import { LiveRoomView } from '../components/live/LiveRoomView';
import { LiveLobby } from '../components/live/LiveLobby';
import { VodDetailView, NpcWatchRoomView } from '../components/live/VodAndNpcViews';
import { LiveFloatingPhone } from '../components/live/LiveSharedWidgets';

type MainTab = 'char_live' | 'char_vod' | 'npc_watch';

const LiveStreamApp: React.FC = () => {
  const {
    closeApp,
    characters,
    activeCharacterId,
    setActiveCharacterId,
    apiConfig,
    userProfile,
    addToast,
  } = useOS();

  const currentChar = useMemo(
    () => characters.find(c => c.id === activeCharacterId) || characters[0],
    [characters, activeCharacterId],
  );

  // 平台 UI 主题：YouTube vs ニコニコ生放送
  const [platformTheme, setPlatformTheme] = useState<LivePlatformTheme>(() => loadPlatformTheme());
  const handleChangePlatformTheme = (next: LivePlatformTheme) => {
    setPlatformTheme(next);
    savePlatformTheme(next);
  };

  const [activeTab, setActiveTab] = useState<MainTab>('char_live');
  const [channels, setChannels] = useState<StreamerChannelProfile[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [viewerPersonas, setViewerPersonas] = useState<ViewerPersona[]>(() =>
    loadViewerPersonas(userProfile),
  );
  const [activePersonaId, setActivePersonaId] = useState<string>('viewer_main_self');

  // 会话与内容数据
  const [liveSessions, setLiveSessions] = useState<LiveStreamSession[]>(() => loadLiveSessions());
  const [activeLiveSessionId, setActiveLiveSessionId] = useState<string | null>(null);
  const [vodPosts, setVodPosts] = useState<VodVideoPost[]>(() => loadVodPosts());
  const [activeVodId, setActiveVodId] = useState<string | null>(null);
  const [npcSessions, setNpcSessions] = useState<NpcWatchSession[]>(() => loadNpcWatchSessions());
  const [activeNpcSessionId, setActiveNpcSessionId] = useState<string | null>(null);

  // NPC 频道池与自定义规则
  const [npcPool, setNpcPool] = useState<NpcStreamerChannelCard[]>(() => loadNpcChannelPool());
  const [npcCustomRule, setNpcCustomRule] = useState<string>(() => loadNpcCustomRule());
  const [showNpcRuleBox, setShowNpcRuleBox] = useState(false);

  // 开播与投稿表单状态
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('just_chatting');
  const [customStreamTitle, setCustomStreamTitle] = useState<string>('');
  const [customStreamTopic, setCustomStreamTopic] = useState<string>('');
  const [customVodTitle, setCustomVodTitle] = useState<string>('');
  const [customVodCategory, setCustomVodCategory] = useState<string>('Vlog · 日常');

  // 弹窗状态
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<StreamerChannelProfile | null>(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [showEndSummaryModal, setShowEndSummaryModal] = useState(false);
  const [finalSummaryDraft, setFinalSummaryDraft] = useState<string>('');
  const [showLobbyPhone, setShowLobbyPhone] = useState(false);

  // 生成与语音状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiHelperBusy, setAiHelperBusy] = useState(false);
  const [vodReplyGeneratingId, setVodReplyGeneratingId] = useState<string | null>(null);
  const [npcRerollingBeatId, setNpcRerollingBeatId] = useState<string | null>(null);
  const [ttsPlayingBeatId, setTtsPlayingBeatId] = useState<string | null>(null);
  const [ttsLoadingBeatId, setTtsLoadingBeatId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopVoiceAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const playVoiceUrl = useCallback(
    async (url: string, id: string) => {
      stopVoiceAudio();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setTtsPlayingBeatId(prev => (prev === id ? null : prev));
      audio.onerror = () => setTtsPlayingBeatId(prev => (prev === id ? null : prev));
      try {
        await audio.play();
      } catch {
        setTtsPlayingBeatId(prev => (prev === id ? null : prev));
      }
    },
    [stopVoiceAudio],
  );

  const [pendingUserInputs, setPendingUserInputs] = useState<
    Array<{
      text: string;
      persona: ViewerPersona;
      scAmount?: number;
      scColor?: 'blue' | 'cyan' | 'amber' | 'magenta' | 'red';
      gift?: StreamGiftOption;
    }>
  >([]);

  // 初始化当前角色的默认频道
  useEffect(() => {
    if (!currentChar) return;
    const charChs = ensureDefaultChannelForChar(currentChar);
    setChannels(charChs);
    if (!charChs.some(c => c.id === selectedChannelId)) {
      setSelectedChannelId(charChs[0]?.id || '');
    }
  }, [currentChar?.id]);

  useEffect(() => {
    return () => {
      stopVoiceAudio();
    };
  }, []);

  const activeLiveSession = useMemo(
    () => liveSessions.find(s => s.id === activeLiveSessionId) || null,
    [liveSessions, activeLiveSessionId],
  );

  const activeVod = useMemo(
    () => vodPosts.find(v => v.id === activeVodId) || null,
    [vodPosts, activeVodId],
  );

  const activeNpcSession = useMemo(
    () => npcSessions.find(s => s.id === activeNpcSessionId) || null,
    [npcSessions, activeNpcSessionId],
  );

  const activeChannel = useMemo(() => {
    const targetChannelId =
      activeLiveSession?.channelId || activeVod?.channelId || selectedChannelId;
    return (
      channels.find(c => c.id === targetChannelId) ||
      channels.find(c => c.id === selectedChannelId) ||
      channels[0]
    );
  }, [channels, selectedChannelId, activeLiveSession?.channelId, activeVod?.channelId]);

  // ==================== 辅助模型（Secondary LLM）驱动的全场景 AI 代写 ====================

  const handleRequestAiField = async (
    fieldKind: AiFieldKind,
    extra?: { categoryLabel?: string; identityMode?: string },
  ): Promise<Record<string, string>> => {
    if (!currentChar) return {};
    setAiHelperBusy(true);
    try {
      const recentMsgs = await DB.getMessagesByCharId(currentChar.id);
      const res = await generateAiFieldSuggestion({
        apiConfig,
        char: currentChar,
        userProfile,
        channel: activeChannel,
        fieldKind,
        categoryLabel: extra?.categoryLabel,
        identityMode: extra?.identityMode,
        recentMsgs,
      });
      return res;
    } catch (e: any) {
      addToast(e?.message || '辅助模型构思失败', 'error');
      return {};
    } finally {
      setAiHelperBusy(false);
    }
  };

  // ==================== TTS 语音合成与缓存（点击台词播放，长按菜单重试/下载） ====================

  const speakTextWithChannelConfig = useCallback(
    async (
      id: string,
      text: string,
      overrideChannel?: StreamerChannelProfile,
      options?: {
        skipCache?: boolean;
        cachedUrl?: string;
        onAudioUrlReady?: (url: string) => void;
      },
    ) => {
      if (!currentChar || !text.trim()) return;
      if (ttsPlayingBeatId === id && !options?.skipCache) {
        stopVoiceAudio();
        setTtsPlayingBeatId(null);
        return;
      }

      if (!options?.skipCache && options?.cachedUrl) {
        setTtsPlayingBeatId(id);
        await playVoiceUrl(options.cachedUrl, id);
        return;
      }

      setTtsLoadingBeatId(id);
      try {
        const ch = overrideChannel || activeChannel;
        const langOverride = ch?.voiceConfig?.language;
        const voiceIdOverride = ch?.voiceConfig?.overrideVoiceId;

        const tempChar = {
          ...currentChar,
          voiceProfile: {
            ...(currentChar.voiceProfile || {}),
            ...(voiceIdOverride ? { voiceId: voiceIdOverride } : {}),
            ...(langOverride ? { languageBoost: langOverride } : {}),
          },
        };

        const audioUrl = await synthesizeSpeech(text, tempChar, apiConfig, {
          skipCache: options?.skipCache,
        });
        options?.onAudioUrlReady?.(audioUrl);
        setTtsLoadingBeatId(null);
        setTtsPlayingBeatId(id);
        await playVoiceUrl(audioUrl, id);
      } catch (err: any) {
        setTtsLoadingBeatId(null);
        setTtsPlayingBeatId(null);
        addToast(err?.message || 'TTS 语音合成失败，请检查设置中的语音配置', 'error');
      }
    },
    [currentChar, activeChannel, apiConfig, ttsPlayingBeatId, addToast],
  );

  // ==================== 1. Char 直播间核心流程 ====================

  const runGenerateLiveChunk = async (
    session: LiveStreamSession,
    channel: StreamerChannelProfile,
    queuedInputs = pendingUserInputs,
    options?: {
      replaceChunkId?: string;
      rejectedDraftText?: string;
      excludeDbMsgId?: number;
    },
  ) => {
    if (!currentChar || isGenerating) return;
    setIsGenerating(true);
    try {
      const allMsgs = await DB.getMessagesByCharId(currentChar.id);
      const userName = (userProfile?.name || '你').trim() || '你';

      const targetChunkIndex = options?.replaceChunkId
        ? session.chunks.find(c => c.id === options.replaceChunkId)?.index ?? session.chunks.length
        : session.chunks.length;

      const sessionForPrompt: LiveStreamSession = options?.replaceChunkId
        ? {
            ...session,
            chunks: session.chunks.filter(c => c.id !== options.replaceChunkId),
          }
        : session;

      const messages = await buildLiveStreamTurnPrompt({
        char: currentChar,
        userProfile,
        channel,
        session: sessionForPrompt,
        pendingUserInputs: queuedInputs,
        allMsgs,
        userName,
        rejectedDraftText: options?.rejectedDraftText,
        excludeDbMsgId: options?.excludeDbMsgId,
      });

      const rawText = await callMainStreamerLlm({
        apiConfig,
        char: currentChar,
        messages,
        temperature: options?.replaceChunkId ? 0.98 : 0.88,
        purpose: options?.replaceChunkId ? '重Roll直播切片' : '生成直播切片',
      });

      // 物理过滤：严禁 AI 生成用户名或任何用户小号名字的弹幕
      const forbiddenViewerNames = [
        userName,
        ...viewerPersonas.map(p => p.name),
      ].filter(Boolean);

      const beats = parseLiveBeatsResponse(
        rawText,
        session.id,
        targetChunkIndex,
        queuedInputs,
        forbiddenViewerNames,
      );

      let peak = session.peakViewerCount;
      let currViewers = session.viewerCount;
      let scTotal = session.totalScRevenue;
      queuedInputs.forEach(inp => {
        if (inp.scAmount && inp.scAmount > 0) scTotal += inp.scAmount;
        if (inp.gift && inp.gift.price > 0) scTotal += inp.gift.price;
      });
      currViewers = Math.max(50, currViewers + Math.floor(Math.random() * 140) - 35);
      if (currViewers > peak) peak = currViewers;

      const existingChunk = options?.replaceChunkId
        ? session.chunks.find(c => c.id === options.replaceChunkId)
        : undefined;

      const dbMsgId = await syncLiveChunkToDb({
        charId: currentChar.id,
        channel,
        session,
        chunkIndex: targetChunkIndex,
        beats,
        existingDbMsgId: existingChunk?.dbMessageId,
      });

      const newChunk: LiveChunk = {
        id: existingChunk?.id || `chunk_${session.id}_${targetChunkIndex}_${Date.now()}`,
        index: targetChunkIndex,
        beats,
        dbMessageId: dbMsgId,
        createdAt: Date.now(),
      };

      const nextChunks = options?.replaceChunkId
        ? session.chunks.map(c => (c.id === options.replaceChunkId ? newChunk : c))
        : [...session.chunks, newChunk];

      let updatedSession: LiveStreamSession = {
        ...session,
        chunks: nextChunks,
        viewerCount: currViewers,
        peakViewerCount: peak,
        totalScRevenue: scTotal,
      };

      setPendingUserInputs([]);
      const allSaved = upsertLiveSession(updatedSession);
      setLiveSessions(allSaved);

      // 当未折叠段达到 4 段时自动用辅助模型滚动折叠前 2 段
      const unfolded = updatedSession.chunks.filter(c => !c.folded);
      if (unfolded.length >= 4 && !options?.replaceChunkId) {
        void foldEarlyChunksIntoRollingSummary(updatedSession, channel, unfolded.slice(0, 2));
      }
    } catch (err: any) {
      addToast(err?.message || '生成直播画面失败', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartNewStream = async () => {
    if (!currentChar || !activeChannel) return;
    const preset =
      STREAM_PRESET_TEMPLATES.find(t => t.key === selectedPresetKey) ||
      STREAM_PRESET_TEMPLATES[0];
    const title = customStreamTitle.trim() || preset.defaultTitle;
    const topicNote = customStreamTopic.trim() || preset.promptHint;

    const newSession: LiveStreamSession = {
      id: `live_${Date.now()}`,
      channelId: activeChannel.id,
      charId: currentChar.id,
      title,
      categoryKey: preset.key,
      categoryLabel: preset.label,
      topicNote,
      status: 'live',
      viewerCount: Math.floor(activeChannel.followerCount * 0.08) + 120,
      peakViewerCount: Math.floor(activeChannel.followerCount * 0.08) + 120,
      totalScRevenue: 0,
      customBackgroundUrl: activeChannel.roomBackgroundUrl || '',
      sessionGifts: activeChannel.customGifts || [],
      chunks: [],
      rollingSummaries: [],
      startedAt: Date.now(),
    };

    const nextList = upsertLiveSession(newSession);
    setLiveSessions(nextList);
    setActiveLiveSessionId(newSession.id);
    setPendingUserInputs([]);

    // 后台用辅助模型动态生成本场专属礼物
    void generateStreamCustomGifts({
      apiConfig,
      char: currentChar,
      channel: activeChannel,
      streamTitle: title,
    }).then(gifts => {
      if (gifts && gifts.length > 0) {
        setLiveSessions(prev => {
          const target = prev.find(s => s.id === newSession.id);
          if (!target) return prev;
          return upsertLiveSession({ ...target, sessionGifts: gifts });
        });
      }
    });

    await runGenerateLiveChunk(newSession, activeChannel, []);
  };

  const foldEarlyChunksIntoRollingSummary = async (
    session: LiveStreamSession,
    channel: StreamerChannelProfile,
    chunksToFold: LiveChunk[],
  ) => {
    if (!currentChar || chunksToFold.length === 0 || isSummarizing) return;
    setIsSummarizing(true);
    try {
      const summaryText = await generateLiveRollingSummary({
        apiConfig,
        char: currentChar,
        channel,
        session,
        chunksToFold,
      });

      const oldDbIds = chunksToFold
        .map(c => c.dbMessageId)
        .filter((id): id is number => typeof id === 'number' && id > 0);

      const summaryDbId = await supersedeLiveMessagesWithSummary({
        charId: currentChar.id,
        sessionId: session.id,
        channelId: channel.id,
        summaryText,
        supersededMsgIds: oldDbIds,
        isFinal: false,
      });

      const foldIds = new Set(chunksToFold.map(c => c.id));
      const newSummary: LiveRollingSummary = {
        id: `rsum_${session.id}_${Date.now()}`,
        fromChunkIndex: chunksToFold[0].index,
        toChunkIndex: chunksToFold[chunksToFold.length - 1].index,
        content: summaryText,
        supersededChunkIds: chunksToFold.map(c => c.id),
        dbMessageId: summaryDbId,
        createdAt: Date.now(),
      };

      const nextSession: LiveStreamSession = {
        ...session,
        chunks: session.chunks.map(c => (foldIds.has(c.id) ? { ...c, folded: true } : c)),
        rollingSummaries: [...session.rollingSummaries, newSummary],
      };
      setLiveSessions(upsertLiveSession(nextSession));
    } catch (e: any) {
      console.warn('[LiveStream] 阶段滚动总结失败:', e);
    } finally {
      setIsSummarizing(false);
    }
  };

  // 发送弹幕 / Super Chat / 礼物（支持立即插队触发主播回应）
  const handleSendUserDanmaku = (
    text: string,
    scAmount?: number,
    scColor?: 'blue' | 'cyan' | 'amber' | 'magenta' | 'red',
    triggerImmediateReply = true,
    gift?: StreamGiftOption,
  ) => {
    if (!activeLiveSession || !activeChannel) return;
    const persona =
      viewerPersonas.find(p => p.id === activePersonaId) || viewerPersonas[0];
    const newItem = { text, persona, scAmount, scColor, gift };
    const nextQueue = [...pendingUserInputs, newItem];
    setPendingUserInputs(nextQueue);

    // 立即插入当前最新拍的弹幕流中，让用户一发出去就能在公屏和飘屏上看到
    const lastChunkIdx = activeLiveSession.chunks.length - 1;
    let updatedSession = activeLiveSession;
    if (lastChunkIdx >= 0) {
      const targetChunk = activeLiveSession.chunks[lastChunkIdx];
      const lastBeatIdx = Math.max(0, targetChunk.beats.length - 1);
      const dmObj: LiveDanmakuItem = {
        id: `udm_${Date.now()}`,
        senderName: persona.name,
        viewerPersonaId: persona.id,
        isUserMain: persona.isMain,
        isUserAlt: !persona.isMain,
        fanBadge: persona.badgeText,
        fanLevel: persona.fanLevel,
        text,
        scAmount,
        scColor,
        giftName: gift?.name,
        giftEmoji: gift?.emoji,
        giftCount: gift ? 1 : undefined,
        timestamp: Date.now(),
      };
      const nextBeats = targetChunk.beats.map((b, bi) =>
        bi === lastBeatIdx ? { ...b, danmaku: [...b.danmaku, dmObj] } : b,
      );
      const nextChunks = activeLiveSession.chunks.map((c, ci) =>
        ci === lastChunkIdx ? { ...c, beats: nextBeats } : c,
      );
      updatedSession = { ...activeLiveSession, chunks: nextChunks };
      setLiveSessions(upsertLiveSession(updatedSession));
    }

    if (triggerImmediateReply && !isGenerating) {
      void runGenerateLiveChunk(updatedSession, activeChannel, nextQueue);
    }
  };

  // 重 Roll 某一段切片（传入旧台词防雷同 + 排除旧 DB 消息）
  const handleRerollChunk = async (chunkId: string) => {
    if (!activeLiveSession || !activeChannel || isGenerating) return;
    const oldChunk = activeLiveSession.chunks.find(c => c.id === chunkId);
    const rejectedDraftText = oldChunk
      ? oldChunk.beats
          .map(b => `画面：${b.screen} ｜ 台词：${b.speechOriginal}`)
          .join('\n')
      : undefined;

    await runGenerateLiveChunk(activeLiveSession, activeChannel, pendingUserInputs, {
      replaceChunkId: chunkId,
      rejectedDraftText,
      excludeDbMsgId: oldChunk?.dbMessageId,
    });
    addToast('已重新生成全新走向的直播切片', 'success');
  };

  // 编辑单拍画面或台词
  const handleEditBeat = async (
    chunkId: string,
    beatId: string,
    nextScreen: string,
    nextSpeechOriginal: string,
    nextSpeechTranslated?: string,
  ) => {
    if (!activeLiveSession || !activeChannel || !currentChar) return;
    const targetChunk = activeLiveSession.chunks.find(c => c.id === chunkId);
    if (!targetChunk) return;

    const nextBeats = targetChunk.beats.map(b =>
      b.id === beatId
        ? {
            ...b,
            screen: nextScreen,
            speechOriginal: nextSpeechOriginal,
            speechTranslated: nextSpeechTranslated,
          }
        : b,
    );

    const dbId = await syncLiveChunkToDb({
      charId: currentChar.id,
      channel: activeChannel,
      session: activeLiveSession,
      chunkIndex: targetChunk.index,
      beats: nextBeats,
      existingDbMsgId: targetChunk.dbMessageId,
    });

    const nextSession: LiveStreamSession = {
      ...activeLiveSession,
      chunks: activeLiveSession.chunks.map(c =>
        c.id === chunkId ? { ...c, beats: nextBeats, dbMessageId: dbId } : c,
      ),
    };
    setLiveSessions(upsertLiveSession(nextSession));
    addToast('分镜与台词已保存并同步到记忆', 'success');
  };

  // 下播结算
  const handleOpenEndStreamModal = async () => {
    if (!activeLiveSession || !activeChannel || !currentChar) return;
    setShowEndSummaryModal(true);
    if (activeLiveSession.finalSummary) {
      setFinalSummaryDraft(activeLiveSession.finalSummary);
      return;
    }
    setIsSummarizing(true);
    try {
      const allMsgs = await DB.getMessagesByCharId(currentChar.id);
      const userName = (userProfile?.name || '你').trim() || '你';
      const summary = await generateLiveFinalSummary({
        apiConfig,
        char: currentChar,
        channel: activeChannel,
        session: activeLiveSession,
        allMsgs,
        userName,
      });
      setFinalSummaryDraft(summary);
    } catch (e: any) {
      addToast(e?.message || '生成下播纪要失败，可手动填写', 'error');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleConfirmEndStream = async (
    finalSummaryText: string,
    dropMode: LiveArchiveDropMode,
  ) => {
    if (!activeLiveSession || !activeChannel || !currentChar) return;

    if (dropMode === 'forget') {
      await forgetLiveSessionInDb(activeLiveSession);
      const ended: LiveStreamSession = {
        ...activeLiveSession,
        status: 'ended',
        finalSummary: finalSummaryText,
        archiveDropMode: 'forget',
        endedAt: Date.now(),
      };
      setLiveSessions(upsertLiveSession(ended));
      setShowEndSummaryModal(false);
      setActiveLiveSessionId(null);
      addToast('已抹除本场配信记忆', 'info');
      return;
    }

    const allOldIds: number[] = [];
    activeLiveSession.chunks.forEach(c => {
      if (c.dbMessageId) allOldIds.push(c.dbMessageId);
    });
    activeLiveSession.rollingSummaries.forEach(r => {
      if (r.dbMessageId) allOldIds.push(r.dbMessageId);
    });

    const finalDbId = await supersedeLiveMessagesWithSummary({
      charId: currentChar.id,
      sessionId: activeLiveSession.id,
      channelId: activeChannel.id,
      summaryText: finalSummaryText,
      supersededMsgIds: allOldIds,
      existingSummaryDbId: activeLiveSession.finalDbMessageId,
      isFinal: true,
    });

    let cardMsgId = activeLiveSession.finalCardMessageId;
    if (dropMode === 'card_and_memory' || (dropMode as string) === 'chat_card') {
      const cardPayload: LivestreamChatCardPayload = {
        type: 'livestream_card',
        cardKind: 'live_summary',
        sessionId: activeLiveSession.id,
        channelId: activeChannel.id,
        charId: currentChar.id,
        charName: currentChar.name,
        channelName: activeChannel.channelName,
        identityMode: activeChannel.identityMode,
        title: activeLiveSession.title,
        categoryLabel: activeLiveSession.categoryLabel,
        viewerCount: activeLiveSession.peakViewerCount,
        summary: finalSummaryText,
        createdAt: Date.now(),
      };
      cardMsgId = await DB.saveMessage({
        charId: currentChar.id,
        role: 'system',
        type: 'score_card',
        content: JSON.stringify(cardPayload),
        metadata: {
          source: 'live_card',
          scoreCard: cardPayload,
          liveSessionId: activeLiveSession.id,
        },
      });
    }

    const endedSession: LiveStreamSession = {
      ...activeLiveSession,
      status: 'ended',
      finalSummary: finalSummaryText,
      archiveDropMode: dropMode,
      finalDbMessageId: finalDbId,
      finalCardMessageId: cardMsgId,
      endedAt: Date.now(),
    };
    setLiveSessions(upsertLiveSession(endedSession));
    setShowEndSummaryModal(false);
    setActiveLiveSessionId(null);
    addToast(
      dropMode === 'card_and_memory' || (dropMode as string) === 'chat_card'
        ? '下播纪要卡片已发送到私聊'
        : '下播总结已静默归档至角色记忆',
      'success',
    );
  };

  // 转发高能切片到主聊天
  const handleShareClipToChat = async (beat: LiveBeat) => {
    if (!currentChar || !activeChannel || !activeLiveSession) return;
    const summaryText = `🎥 画面：${beat.screen}\n🎙️ ${activeChannel.channelName}：「${beat.speechOriginal || '（专注动作）'}」${
      beat.speechTranslated ? `\n🌐 同传：${beat.speechTranslated.replace(/^译[：:]\s*/, '')}` : ''
    }`;
    const payload: LivestreamChatCardPayload = {
      type: 'livestream_card',
      cardKind: 'live_clip',
      sessionId: activeLiveSession.id,
      channelId: activeChannel.id,
      charId: currentChar.id,
      charName: currentChar.name,
      channelName: activeChannel.channelName,
      identityMode: activeChannel.identityMode,
      title: activeLiveSession.title,
      categoryLabel: activeLiveSession.categoryLabel,
      viewerCount: activeLiveSession.viewerCount,
      summary: summaryText,
      createdAt: Date.now(),
    };
    await DB.saveMessage({
      charId: currentChar.id,
      role: 'user',
      type: 'score_card',
      content: JSON.stringify(payload),
      metadata: {
        source: 'live_clip',
        scoreCard: payload,
      },
    });
    addToast('已将直播高能切片转发到私聊！', 'success');
  };

  // ==================== 2. 视频投稿 (VOD) & 3. NPC 陪看 ====================

  const handleCreateVodPost = async () => {
    if (!currentChar || !activeChannel || isGenerating) return;
    const title = customVodTitle.trim() || `${activeChannel.channelName} 的最新日常 Vlog`;
    setIsGenerating(true);
    try {
      const allMsgs = await DB.getMessagesByCharId(currentChar.id);
      const vod = await generateVodVideoPost({
        apiConfig,
        char: currentChar,
        userProfile,
        channel: activeChannel,
        topicTitle: title,
        categoryLabel: customVodCategory,
        allMsgs,
      });

      const dbId = await DB.saveMessage({
        charId: currentChar.id,
        role: 'assistant',
        type: 'text',
        content: `[发布了视频投稿《${vod.title}》（频道：${activeChannel.channelName}）]\n置顶留言：${vod.streamerPinnedNote}\n分镜概要：${vod.chapters.map(c => `${c.timestampLabel} ${c.chapterTitle}: ${c.screen}`).join('；')}`,
        metadata: { source: 'live_vod', vodId: vod.id },
      });
      vod.dbMessageId = dbId;

      setVodPosts(upsertVodPost(vod));
      setActiveVodId(vod.id);
      setCustomVodTitle('');
      addToast(`《${vod.title}》视频已发布！`, 'success');
    } catch (e: any) {
      addToast(e?.message || '生成视频投稿失败', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartNpcWatch = async (npcCard: NpcStreamerChannelCard) => {
    if (!currentChar || isGenerating) return;
    const newSession: NpcWatchSession = {
      id: `npcw_${Date.now()}`,
      charId: currentChar.id,
      npcStreamerName: npcCard.npcName,
      npcHandle: npcCard.handle,
      npcCategoryLabel: npcCard.categoryLabel,
      npcRoomTitle: npcCard.roomTitle,
      npcBio: npcCard.npcBio,
      customRulePrompt: npcCustomRule.trim() || undefined,
      coverGradient: npcCard.coverGradient,
      viewerCount: npcCard.viewerCount,
      beats: [],
      createdAt: Date.now(),
    };
    setNpcSessions(upsertNpcWatchSession(newSession));
    setActiveNpcSessionId(newSession.id);
    await handleAdvanceNpcBeat(newSession);
  };

  const handleAdvanceNpcBeat = async (
    targetSession?: NpcWatchSession,
    userText?: string,
    mode?: 'whisper_char' | 'send_npc_danmaku',
  ) => {
    const sess = targetSession || activeNpcSession;
    if (!sess || !currentChar || isGenerating) return;
    setIsGenerating(true);
    try {
      const allMsgs = await DB.getMessagesByCharId(currentChar.id);
      const beat = await generateNpcWatchBeatDualEngine({
        apiConfig,
        char: currentChar,
        userProfile,
        npcSession: sess,
        userInteractionText: userText,
        interactionType: mode,
        allMsgs,
      });

      const dbId = await DB.saveMessage({
        charId: currentChar.id,
        role: 'assistant',
        type: 'text',
        content: `[与你一起刷 NPC 直播《${sess.npcRoomTitle}》(${sess.npcStreamerName})]\n直播画面：${beat.npcScreen}（「${beat.npcSpeech}」）\n${
          beat.userActionNote ? `你的互动：${beat.userActionNote}\n` : ''
        }${currentChar.name}反应：${beat.charReactionAction}「${beat.charReactionSpeech}」`,
        metadata: { source: 'live_npc_watch', npcSessionId: sess.id },
      });
      beat.dbMessageId = dbId;

      const updated: NpcWatchSession = {
        ...sess,
        beats: [...sess.beats, beat],
      };
      setNpcSessions(upsertNpcWatchSession(updated));
    } catch (e: any) {
      addToast(e?.message || '生成陪看剧情失败', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // ==================== 子页面路由（进入直播间 / 视频详情页 / 陪看房） ====================

  if (activeLiveSession && activeChannel && currentChar) {
    return (
      <>
        <LiveRoomView
          charId={currentChar.id}
          charName={currentChar.name}
          charAvatar={currentChar.avatar}
          userName={userProfile?.name || '我'}
          channel={activeChannel}
          session={activeLiveSession}
          viewerPersonas={viewerPersonas}
          activePersonaId={activePersonaId}
          platformTheme={platformTheme}
          isGenerating={isGenerating}
          isSummarizing={isSummarizing}
          ttsPlayingBeatId={ttsPlayingBeatId}
          ttsLoadingBeatId={ttsLoadingBeatId}
          onChangePlatformTheme={handleChangePlatformTheme}
          onSelectPersona={setActivePersonaId}
          onOpenPersonaModal={() => setShowPersonaModal(true)}
          onOpenChannelSettings={() => {
            setEditingChannel(activeChannel);
            setShowChannelModal(true);
          }}
          onBackToLobby={() => setActiveLiveSessionId(null)}
          onGenerateNextChunk={() =>
            void runGenerateLiveChunk(activeLiveSession, activeChannel, pendingUserInputs)
          }
          onRerollChunk={chunkId => void handleRerollChunk(chunkId)}
          onEditBeat={(chunkId, beatId, nextScreen, nextSpeech, nextTrans) =>
            void handleEditBeat(chunkId, beatId, nextScreen, nextSpeech, nextTrans)
          }
          onPlayBeatVoice={(beat, opts) =>
            void speakTextWithChannelConfig(beat.id, beat.speechOriginal, activeChannel, {
              skipCache: opts?.skipCache,
              cachedUrl: beat.audioUrl,
              onAudioUrlReady: url => {
                const nextChunks = activeLiveSession.chunks.map(c => ({
                  ...c,
                  beats: c.beats.map(b => (b.id === beat.id ? { ...b, audioUrl: url } : b)),
                }));
                setLiveSessions(
                  upsertLiveSession({ ...activeLiveSession, chunks: nextChunks }),
                );
              },
            })
          }
          onSendUserDanmaku={handleSendUserDanmaku}
          onUpdateCustomBackground={url => {
            setLiveSessions(
              upsertLiveSession({ ...activeLiveSession, customBackgroundUrl: url }),
            );
            addToast('直播间背景已更新', 'success');
          }}
          onRequestRefreshGifts={() => {
            addToast('正在用辅助模型生成专属礼物…', 'info');
            void generateStreamCustomGifts({
              apiConfig,
              char: currentChar,
              channel: activeChannel,
              streamTitle: activeLiveSession.title,
            }).then(gifts => {
              setLiveSessions(
                upsertLiveSession({ ...activeLiveSession, sessionGifts: gifts }),
              );
              addToast('专属礼物已刷新！', 'success');
            });
          }}
          onManualFoldChunks={() => {
            const unfolded = activeLiveSession.chunks.filter(c => !c.folded);
            if (unfolded.length >= 2) {
              void foldEarlyChunksIntoRollingSummary(
                activeLiveSession,
                activeChannel,
                unfolded.slice(0, Math.max(1, unfolded.length - 1)),
              );
            }
          }}
          onEditRollingSummary={(summaryId, nextText) => {
            const target = activeLiveSession.rollingSummaries.find(r => r.id === summaryId);
            if (!target) return;
            void supersedeLiveMessagesWithSummary({
              charId: currentChar.id,
              sessionId: activeLiveSession.id,
              channelId: activeChannel.id,
              summaryText: nextText,
              supersededMsgIds: [],
              existingSummaryDbId: target.dbMessageId,
            });
            const nextList = activeLiveSession.rollingSummaries.map(r =>
              r.id === summaryId ? { ...r, content: nextText } : r,
            );
            setLiveSessions(
              upsertLiveSession({ ...activeLiveSession, rollingSummaries: nextList }),
            );
          }}
          onRegenerateRollingSummary={summary => {
            const targetChunks = activeLiveSession.chunks.filter(c =>
              summary.supersededChunkIds.includes(c.id),
            );
            if (targetChunks.length > 0) {
              void generateLiveRollingSummary({
                apiConfig,
                char: currentChar,
                channel: activeChannel,
                session: activeLiveSession,
                chunksToFold: targetChunks,
              }).then(newText => {
                const nextList = activeLiveSession.rollingSummaries.map(r =>
                  r.id === summary.id ? { ...r, content: newText } : r,
                );
                setLiveSessions(
                  upsertLiveSession({ ...activeLiveSession, rollingSummaries: nextList }),
                );
                addToast('阶段摘要已重新生成', 'success');
              });
            }
          }}
          onDissolveRollingSummary={summaryId => {
            const target = activeLiveSession.rollingSummaries.find(r => r.id === summaryId);
            if (!target) return;
            const restoreSet = new Set(target.supersededChunkIds);
            const nextSession: LiveStreamSession = {
              ...activeLiveSession,
              chunks: activeLiveSession.chunks.map(c =>
                restoreSet.has(c.id) ? { ...c, folded: false } : c,
              ),
              rollingSummaries: activeLiveSession.rollingSummaries.filter(
                r => r.id !== summaryId,
              ),
            };
            setLiveSessions(upsertLiveSession(nextSession));
          }}
          onEndStreamClick={() => void handleOpenEndStreamModal()}
          onShareClipToChat={beat => void handleShareClipToChat(beat)}
        />

        <ChannelEditorModal
          isOpen={showChannelModal}
          charId={currentChar.id}
          charName={currentChar.name}
          charAvatar={currentChar.avatar}
          initialChannel={editingChannel}
          aiGenerating={aiHelperBusy}
          onRequestAiFillChannel={mode =>
            handleRequestAiField('channel_profile', { identityMode: mode })
          }
          onRequestAiGenerateGifts={draft =>
            generateStreamCustomGifts({
              apiConfig,
              char: currentChar,
              channel: draft,
            })
          }
          onClose={() => setShowChannelModal(false)}
          onSave={ch => {
            const all = upsertChannel(ch);
            setChannels(all.filter(c => c.charId === currentChar.id));
            setSelectedChannelId(ch.id);
          }}
          onDelete={id => {
            const all = deleteChannelById(id);
            const charChs = all.filter(c => c.charId === currentChar.id);
            setChannels(charChs);
            setSelectedChannelId(charChs[0]?.id || '');
          }}
        />

        <ViewerPersonaModal
          isOpen={showPersonaModal}
          personas={viewerPersonas}
          activePersonaId={activePersonaId}
          aiGenerating={aiHelperBusy}
          onRequestAiPersona={() => handleRequestAiField('viewer_alt_persona')}
          onSelect={setActivePersonaId}
          onSaveAll={next => {
            setViewerPersonas(next);
            saveViewerPersonas(next);
          }}
          onClose={() => setShowPersonaModal(false)}
        />

        <EndStreamSummaryModal
          isOpen={showEndSummaryModal}
          sessionTitle={activeLiveSession.title}
          channelName={activeChannel.channelName}
          initialSummary={finalSummaryDraft}
          isGenerating={isSummarizing}
          onRegenerate={() => {
            setFinalSummaryDraft('');
            void handleOpenEndStreamModal();
          }}
          onConfirm={(text, mode) => void handleConfirmEndStream(text, mode)}
          onClose={() => setShowEndSummaryModal(false)}
        />
      </>
    );
  }

  if (activeVod && activeChannel && currentChar) {
    return (
      <>
        <VodDetailView
          charId={currentChar.id}
          charName={currentChar.name}
          charAvatar={currentChar.avatar}
          userName={userProfile?.name || '我'}
          channel={activeChannel}
          vod={activeVod}
          viewerPersonas={viewerPersonas}
          activePersonaId={activePersonaId}
          platformTheme={platformTheme}
          isGeneratingReplyId={vodReplyGeneratingId}
          ttsPlayingId={ttsPlayingBeatId}
          onChangePlatformTheme={handleChangePlatformTheme}
          onSelectPersona={setActivePersonaId}
          onOpenPersonaModal={() => setShowPersonaModal(true)}
          onBack={() => setActiveVodId(null)}
          onPlayChapterVoice={(ch: VodChapterBeat, opts) =>
            void speakTextWithChannelConfig(ch.id, ch.speechOriginal, activeChannel, {
              skipCache: opts?.skipCache,
              cachedUrl: ch.audioUrl,
              onAudioUrlReady: url => {
                const nextChapters = activeVod.chapters.map(c =>
                  c.id === ch.id ? { ...c, audioUrl: url } : c,
                );
                setVodPosts(upsertVodPost({ ...activeVod, chapters: nextChapters }));
              },
            })
          }
          onEditChapter={(chId, nextScreen, nextSpeech, nextTrans) => {
            const nextChapters = activeVod.chapters.map(c =>
              c.id === chId
                ? {
                    ...c,
                    screen: nextScreen,
                    speechOriginal: nextSpeech,
                    speechTranslated: nextTrans,
                  }
                : c,
            );
            setVodPosts(upsertVodPost({ ...activeVod, chapters: nextChapters }));
            addToast('章节内容已保存', 'success');
          }}
          onAddComment={text => {
            const persona =
              viewerPersonas.find(p => p.id === activePersonaId) || viewerPersonas[0];
            const newCm: VodCommentItem = {
              id: `vcm_${Date.now()}`,
              authorName: persona.name,
              viewerPersonaId: persona.id,
              isUserMain: persona.isMain,
              isUserAlt: !persona.isMain,
              fanBadge: persona.badgeText,
              fanLevel: persona.fanLevel,
              content: text,
              likes: 1,
              replies: [],
              timestamp: Date.now(),
            };
            const updated: VodVideoPost = {
              ...activeVod,
              comments: [newCm, ...activeVod.comments],
            };
            setVodPosts(upsertVodPost(updated));
          }}
          onTriggerStreamerReply={async comment => {
            setVodReplyGeneratingId(comment.id);
            try {
              const rep = await generateStreamerVodReply({
                apiConfig,
                char: currentChar,
                userProfile,
                channel: activeChannel,
                vod: activeVod,
                targetComment: comment,
              });
              const replyObj = {
                id: `vrp_${Date.now()}`,
                authorName: activeChannel.channelName,
                isStreamer: true,
                content: rep.replyOriginal,
                translation: rep.replyTranslated,
                timestamp: Date.now(),
              };
              const updated: VodVideoPost = {
                ...activeVod,
                comments: activeVod.comments.map(c =>
                  c.id === comment.id
                    ? { ...c, likedByStreamer: true, replies: [replyObj] }
                    : c,
                ),
              };
              setVodPosts(upsertVodPost(updated));
            } catch (e: any) {
              addToast(e?.message || '创作者回复生成失败', 'error');
            } finally {
              setVodReplyGeneratingId(null);
            }
          }}
          onShareVodToChat={async () => {
            const payload: LivestreamChatCardPayload = {
              type: 'livestream_card',
              cardKind: 'vod_share',
              sessionId: activeVod.id,
              channelId: activeChannel.id,
              charId: currentChar.id,
              charName: currentChar.name,
              channelName: activeChannel.channelName,
              identityMode: activeChannel.identityMode,
              title: activeVod.title,
              categoryLabel: activeVod.categoryLabel,
              viewerCount: activeVod.viewsCount,
              summary: `📌 置顶：${activeVod.streamerPinnedNote}\n🎬 章节：${activeVod.chapters
                .map(c => `${c.timestampLabel} ${c.chapterTitle}`)
                .join(' / ')}`,
              createdAt: Date.now(),
            };
            await DB.saveMessage({
              charId: currentChar.id,
              role: 'user',
              type: 'score_card',
              content: JSON.stringify(payload),
              metadata: { source: 'live_vod_share', scoreCard: payload },
            });
            addToast('已将视频卡片分享到私聊', 'success');
          }}
        />

        <ViewerPersonaModal
          isOpen={showPersonaModal}
          personas={viewerPersonas}
          activePersonaId={activePersonaId}
          aiGenerating={aiHelperBusy}
          onRequestAiPersona={() => handleRequestAiField('viewer_alt_persona')}
          onSelect={setActivePersonaId}
          onSaveAll={next => {
            setViewerPersonas(next);
            saveViewerPersonas(next);
          }}
          onClose={() => setShowPersonaModal(false)}
        />
      </>
    );
  }

  if (activeNpcSession && currentChar) {
    return (
      <NpcWatchRoomView
        charId={currentChar.id}
        charName={currentChar.name}
        charAvatar={currentChar.avatar}
        userName={userProfile?.name || '我'}
        npcSession={activeNpcSession}
        platformTheme={platformTheme}
        isGenerating={isGenerating}
        isRerollingBeatId={npcRerollingBeatId}
        ttsPlayingId={ttsPlayingBeatId}
        onChangePlatformTheme={handleChangePlatformTheme}
        onBack={() => setActiveNpcSessionId(null)}
        onAdvanceBeat={(text, mode) =>
          void handleAdvanceNpcBeat(activeNpcSession, text, mode)
        }
        onRerollCharReaction={async beat => {
          setNpcRerollingBeatId(beat.id);
          try {
            const allMsgs = await DB.getMessagesByCharId(currentChar.id);
            const res = await rerollCharNpcReactionOnly({
              apiConfig,
              char: currentChar,
              userProfile,
              npcSession: activeNpcSession,
              beat,
              allMsgs,
            });
            const updated: NpcWatchSession = {
              ...activeNpcSession,
              beats: activeNpcSession.beats.map(b =>
                b.id === beat.id
                  ? {
                      ...b,
                      charReactionAction: res.charReactionAction,
                      charReactionSpeech: res.charReactionSpeech,
                      charEmotion: res.charEmotion,
                    }
                  : b,
              ),
            };
            setNpcSessions(upsertNpcWatchSession(updated));
            addToast(`已重新生成 ${currentChar.name} 的反应`, 'success');
          } catch (e: any) {
            addToast(e?.message || '重Roll失败', 'error');
          } finally {
            setNpcRerollingBeatId(null);
          }
        }}
        onPlayCharVoice={(beat, opts) =>
          void speakTextWithChannelConfig(beat.id, beat.charReactionSpeech, undefined, {
            skipCache: opts?.skipCache,
            cachedUrl: beat.charAudioUrl,
            onAudioUrlReady: url => {
              const updated: NpcWatchSession = {
                ...activeNpcSession,
                beats: activeNpcSession.beats.map(b =>
                  b.id === beat.id ? { ...b, charAudioUrl: url } : b,
                ),
              };
              setNpcSessions(upsertNpcWatchSession(updated));
            },
          })
        }
        onShareNpcWatchToChat={async () => {
          const lastBeat = activeNpcSession.beats[activeNpcSession.beats.length - 1];
          const summary = lastBeat
            ? `📺 正在看：${activeNpcSession.npcStreamerName}《${activeNpcSession.npcRoomTitle}》\n🎬 直播间：${lastBeat.npcScreen}\n🛋️ ${currentChar.name}吐槽：「${lastBeat.charReactionSpeech}」`
            : `和 ${currentChar.name} 一起围观了《${activeNpcSession.npcRoomTitle}》`;
          const payload: LivestreamChatCardPayload = {
            type: 'livestream_card',
            cardKind: 'npc_watch',
            sessionId: activeNpcSession.id,
            charId: currentChar.id,
            charName: currentChar.name,
            channelName: activeNpcSession.npcStreamerName,
            title: activeNpcSession.npcRoomTitle,
            categoryLabel: activeNpcSession.npcCategoryLabel,
            viewerCount: activeNpcSession.viewerCount,
            summary,
            createdAt: Date.now(),
          };
          await DB.saveMessage({
            charId: currentChar.id,
            role: 'user',
            type: 'score_card',
            content: JSON.stringify(payload),
            metadata: { source: 'live_npc_share', scoreCard: payload },
          });
          addToast('已将陪看卡片分享到私聊', 'success');
        }}
      />
    );
  }

  const charSessions = liveSessions.filter(s => s.charId === currentChar?.id);
  const charVods = vodPosts.filter(v => v.charId === currentChar?.id);
  const charNpcSessions = npcSessions.filter(s => s.charId === currentChar?.id);

  return (
    <>
      <LiveLobby
        platformTheme={platformTheme}
        onChangePlatformTheme={handleChangePlatformTheme}
        closeApp={closeApp}
        characters={characters}
        currentChar={currentChar}
        onSelectChar={setActiveCharacterId}
        channels={channels}
        activeChannel={activeChannel}
        onSelectChannel={setSelectedChannelId}
        onCreateChannel={() => {
          setEditingChannel(null);
          setShowChannelModal(true);
        }}
        onEditChannel={() => {
          if (!activeChannel) return;
          setEditingChannel(activeChannel);
          setShowChannelModal(true);
        }}
        viewerPersonas={viewerPersonas}
        activePersonaId={activePersonaId}
        onOpenPersonas={() => setShowPersonaModal(true)}
        liveSessions={charSessions}
        onOpenLive={setActiveLiveSessionId}
        onDeleteLive={id => setLiveSessions(deleteLiveSession(id))}
        vodPosts={charVods}
        onOpenVod={setActiveVodId}
        onDeleteVod={id => setVodPosts(deleteVodPost(id))}
        npcPool={npcPool}
        npcSessions={charNpcSessions}
        onStartNpc={card => void handleStartNpcWatch(card)}
        onOpenNpcSession={setActiveNpcSessionId}
        npcCustomRule={npcCustomRule}
        onChangeNpcRule={value => {
          setNpcCustomRule(value);
          saveNpcCustomRule(value);
        }}
        onAiNpcRule={() => {
          void handleRequestAiField('npc_custom_rule').then(res => {
            if (res.rule) {
              setNpcCustomRule(res.rule);
              saveNpcCustomRule(res.rule);
            }
          });
        }}
        onRefreshNpcPool={() => {
          if (!currentChar) return;
          setAiHelperBusy(true);
          void generateNpcChannelPoolWithAi({
            apiConfig,
            char: currentChar,
            customRule: npcCustomRule,
          })
            .then(nextPool => {
              setNpcPool(nextPool);
              saveNpcChannelPool(nextPool);
              addToast('已换了一批直播', 'success');
            })
            .finally(() => setAiHelperBusy(false));
        }}
        showNpcRule={showNpcRuleBox}
        onToggleNpcRule={() => setShowNpcRuleBox(v => !v)}
        selectedPresetKey={selectedPresetKey}
        onSelectPreset={setSelectedPresetKey}
        customStreamTitle={customStreamTitle}
        onChangeStreamTitle={setCustomStreamTitle}
        customStreamTopic={customStreamTopic}
        onChangeStreamTopic={setCustomStreamTopic}
        onAiStream={() => {
          const preset = STREAM_PRESET_TEMPLATES.find(t => t.key === selectedPresetKey);
          void handleRequestAiField('live_title', { categoryLabel: preset?.label }).then(res => {
            if (res.title) setCustomStreamTitle(res.title);
            if (res.topic) setCustomStreamTopic(res.topic);
          });
        }}
        onStartStream={() => void handleStartNewStream()}
        customVodTitle={customVodTitle}
        onChangeVodTitle={setCustomVodTitle}
        customVodCategory={customVodCategory}
        onChangeVodCategory={setCustomVodCategory}
        onAiVod={() => {
          void handleRequestAiField('vod_topic').then(res => {
            if (res.title) setCustomVodTitle(res.title);
            if (res.categoryLabel) setCustomVodCategory(res.categoryLabel);
          });
        }}
        onCreateVod={() => void handleCreateVodPost()}
        isGenerating={isGenerating}
        aiHelperBusy={aiHelperBusy}
        onOpenPhone={() => setShowLobbyPhone(true)}
        channelModal={
          currentChar ? (
            <ChannelEditorModal
              isOpen={showChannelModal}
              charId={currentChar.id}
              charName={currentChar.name}
              charAvatar={currentChar.avatar}
              initialChannel={editingChannel}
              aiGenerating={aiHelperBusy}
              onRequestAiFillChannel={mode =>
                handleRequestAiField('channel_profile', { identityMode: mode })
              }
              onRequestAiGenerateGifts={draft =>
                generateStreamCustomGifts({
                  apiConfig,
                  char: currentChar,
                  channel: draft,
                })
              }
              onClose={() => setShowChannelModal(false)}
              onSave={ch => {
                const all = upsertChannel(ch);
                setChannels(all.filter(c => c.charId === currentChar.id));
                setSelectedChannelId(ch.id);
              }}
              onDelete={id => {
                const all = deleteChannelById(id);
                const charChs = all.filter(c => c.charId === currentChar.id);
                setChannels(charChs);
                setSelectedChannelId(charChs[0]?.id || '');
              }}
            />
          ) : null
        }
        personaModal={
          <ViewerPersonaModal
            isOpen={showPersonaModal}
            personas={viewerPersonas}
            activePersonaId={activePersonaId}
            aiGenerating={aiHelperBusy}
            onRequestAiPersona={() => handleRequestAiField('viewer_alt_persona')}
            onSelect={setActivePersonaId}
            onSaveAll={next => {
              setViewerPersonas(next);
              saveViewerPersonas(next);
            }}
            onClose={() => setShowPersonaModal(false)}
          />
        }
      />
      {currentChar && (
        <LiveFloatingPhone
          isOpen={showLobbyPhone}
          characterId={currentChar.id}
          charName={currentChar.name}
          contextDescription={`【电波OnAir平台私聊】此刻 ${userProfile?.name || '对方'} 正在浏览电波直播与视频，并用私聊小窗找你聊天。`}
          onClose={() => setShowLobbyPhone(false)}
        />
      )}
    </>
  );
};

export default LiveStreamApp;
