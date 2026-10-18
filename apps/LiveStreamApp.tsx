/**
 * 直播与视频平台 App（电波 / OnAir）主应用组件
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { loadCharacterContextMessages } from '../utils/chatContextRange';
import { processNewMessagesWithAutoArchive } from '../utils/memoryPalace/autoArchive';
import { canSynthesizeSpeech, synthesizeSpeech } from '../utils/ttsRouter';
import { playVoiceAudio } from '../utils/voicePlayback';
import { ContextBuilder } from '../utils/context';
import TokenImg from '../components/os/TokenImg';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  LiveChunk,
  LiveBeat,
  LiveDanmakuItem,
  LiveRollingSummary,
  LiveArchiveDropMode,
  VodVideoPost,
  VodCommentItem,
  NpcWatchSession,
  DanmakuTranslateMode,
  LivestreamChatCardPayload,
  STREAM_PRESET_TEMPLATES,
  NPC_PRESET_ROOMS,
  SC_TIER_OPTIONS,
} from '../utils/liveStreamTypes';
import {
  loadAllChannels,
  ensureDefaultChannelForChar,
  upsertChannel,
  deleteChannelById,
  loadViewerPersonas,
  saveViewerPersonas,
  loadLiveSessions,
  upsertLiveSession,
  deleteLiveSession,
  loadVodPosts,
  upsertVodPost,
  deleteVodPost,
  loadNpcWatchSessions,
  upsertNpcWatchSession,
  syncLiveChunkToDb,
  supersedeLiveMessagesWithSummary,
  forgetLiveSessionInDb,
} from '../utils/liveStreamStorage';
import {
  buildLiveChunkGenerationMessages,
  parseLiveBeatsResponse,
  callMainStreamerLlm,
  generateLiveRollingSummary,
  generateLiveFinalSummary,
  generateVodVideoPost,
  generateStreamerVodReply,
  generateNpcWatchBeatDualEngine,
  rerollCharNpcReactionOnly,
} from '../utils/liveStreamPrompts';
import {
  ChannelEditorModal,
  ViewerPersonaModal,
  EndStreamSummaryModal,
} from '../components/live/LiveStreamModals';
import { VodDetailView, NpcWatchRoomView } from '../components/live/VodAndNpcViews';
import { LiveRoomView } from '../components/live/LiveRoomView';
import type { CharacterProfile, Message } from '../types';

const LiveStreamApp: React.FC = () => {
  const {
    closeApp,
    characters,
    activeCharacterId,
    setActiveCharacterId,
    apiConfig,
    userProfile,
    addToast,
    updateCharacter,
    memoryPalaceConfig,
  } = useOS();

  const [selectedCharId, setSelectedCharId] = useState<string>(
    activeCharacterId || characters[0]?.id || '',
  );
  const currentChar: CharacterProfile | undefined =
    characters.find(c => c.id === selectedCharId) || characters[0];

  // 频道、马甲、直播场次、VOD投稿、NPC陪看状态
  const [channels, setChannels] = useState<StreamerChannelProfile[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [personas, setPersonas] = useState<ViewerPersona[]>(() => loadViewerPersonas(userProfile));
  const [activePersonaId, setActivePersonaId] = useState<string>('viewer_main_self');

  const [sessions, setSessions] = useState<LiveStreamSession[]>(() => loadLiveSessions());
  const [vodPosts, setVodPosts] = useState<VodVideoPost[]>(() => loadVodPosts());
  const [npcWatches, setNpcWatches] = useState<NpcWatchSession[]>(() => loadNpcWatchSessions());

  // 导航与页面状态
  const [homeTab, setHomeTab] = useState<'live' | 'vod' | 'npc'>('live');
  const [activeLiveSessionId, setActiveLiveSessionId] = useState<string | null>(null);
  const [activeVodId, setActiveVodId] = useState<string | null>(null);
  const [activeNpcSessionId, setActiveNpcSessionId] = useState<string | null>(null);

  // 开播/投稿表单状态
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>(STREAM_PRESET_TEMPLATES[0].key);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customTopic, setCustomTopic] = useState<string>('');

  // 播放器内部状态
  const [currentChunkIdx, setCurrentChunkIdx] = useState(0);
  const [currentBeatIdx, setCurrentBeatIdx] = useState(0);
  const [autoPlayBeats, setAutoPlayBeats] = useState(false);
  const [translateMode, setTranslateMode] = useState<DanmakuTranslateMode>('bilingual');
  const [busy, setBusy] = useState(false);
  const [foldingBusy, setFoldingBusy] = useState(false);
  const [recentWechatMsgs, setRecentWechatMsgs] = useState<Message[]>([]);

  // 弹窗状态
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<StreamerChannelProfile | null>(null);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [endSummaryModalOpen, setEndSummaryModalOpen] = useState(false);
  const [draftFinalSummary, setDraftFinalSummary] = useState('');
  const [isFinalSummarizing, setIsFinalSummarizing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 初始化当前角色的默认频道
  useEffect(() => {
    if (!currentChar) return;
    ensureDefaultChannelForChar(currentChar);
    const all = loadAllChannels();
    setChannels(all);
    const charChs = all.filter(c => c.charId === currentChar.id);
    if (charChs.length > 0 && !charChs.some(c => c.id === selectedChannelId)) {
      setSelectedChannelId(charChs[0].id);
    }
  }, [currentChar?.id]);

  const charChannels = channels.filter(c => c.charId === currentChar?.id);
  const activeChannel =
    charChannels.find(c => c.id === selectedChannelId) || charChannels[0];
  const activePersona =
    personas.find(p => p.id === activePersonaId) || personas[0];

  const activeLiveSession = sessions.find(s => s.id === activeLiveSessionId) || null;
  const activeVod = vodPosts.find(v => v.id === activeVodId) || null;
  const activeNpcSession = npcWatches.find(n => n.id === activeNpcSessionId) || null;

  // 刷新微信私聊最近消息（供直播间内嵌微信捣乱抽屉显示）
  const refreshRecentWechat = useCallback(async () => {
    if (!currentChar) return;
    const all = await DB.getMessagesByCharId(currentChar.id, true);
    const chatOnly = all.filter(m => {
      const src = m.metadata?.source;
      return !src && (m.role === 'user' || m.role === 'assistant');
    });
    setRecentWechatMsgs(chatOnly.slice(-10));
  }, [currentChar?.id]);

  useEffect(() => {
    if (activeLiveSessionId) {
      void refreshRecentWechat();
    }
  }, [activeLiveSessionId, refreshRecentWechat]);

  // 记忆宫殿后台归档钩子（对齐 DateApp）
  const triggerMemoryPalaceIfNeeded = useCallback(
    async (char: CharacterProfile) => {
      if (!char.memoryPalaceEnabled) return;
      const emb = memoryPalaceConfig?.embedding;
      if (!emb?.apiKey || !emb.baseUrl || !emb.model) return;
      const llm = memoryPalaceConfig?.lightLLM;
      const effectiveLLM =
        llm?.apiKey && llm.baseUrl && llm.model
          ? llm
          : { baseUrl: apiConfig.baseUrl, apiKey: apiConfig.apiKey, model: apiConfig.model };
      if (!effectiveLLM.apiKey || !effectiveLLM.baseUrl) return;
      try {
        const recentMsgs = await DB.getRecentMessagesByCharId(char.id, 50);
        await processNewMessagesWithAutoArchive(
          recentMsgs,
          char.id,
          char.name,
          emb,
          effectiveLLM,
          userProfile?.name || '你',
          false,
        );
      } catch {
        // ignore background archive error
      }
    },
    [memoryPalaceConfig, apiConfig, userProfile?.name],
  );

  // TTS 播放封装（支持频道覆盖音色与语种）
  const handlePlayTts = useCallback(
    async (text: string, emotion?: string) => {
      if (!currentChar || !text.trim()) return;
      const overrideId = activeChannel?.voiceConfig?.overrideVoiceId?.trim();
      const charForVoice: CharacterProfile = overrideId
        ? {
            ...currentChar,
            voiceProfile: {
              ...(currentChar.voiceProfile || {}),
              voiceId: overrideId,
              fishReferenceId: overrideId,
              elevenLabsVoiceId: overrideId,
            },
          }
        : currentChar;

      if (!canSynthesizeSpeech(charForVoice, apiConfig)) {
        addToast('尚未为该角色配置可用的 TTS 音色或 API Key', 'info');
        return;
      }

      try {
        const lang = activeChannel?.voiceConfig?.language || undefined;
        const url = await synthesizeSpeech(text, charForVoice, apiConfig, {
          languageBoost: lang,
          emotion,
        });
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        await playVoiceAudio(audioRef.current, url, {
          onPlaying: () => {},
          onStopped: () => {},
          onError: () => {},
        });
      } catch (e: any) {
        addToast(e?.message || '语音合成失败', 'error');
      }
    },
    [currentChar, activeChannel, apiConfig, addToast],
  );

  // ==================== 直播间核心动作 ====================

  const generateNextChunkForSession = useCallback(
    async (targetSession: LiveStreamSession, isRerollLast = false) => {
      if (!currentChar || !activeChannel || busy) return;
      setBusy(true);
      try {
        let baseSession = targetSession;
        let existingDbId: number | undefined;

        if (isRerollLast && baseSession.chunks.length > 0) {
          const lastChunk = baseSession.chunks[baseSession.chunks.length - 1];
          existingDbId = lastChunk.dbMessageId;
          baseSession = {
            ...baseSession,
            chunks: baseSession.chunks.slice(0, -1),
            pendingDanmakuQueue: lastChunk.userInputs || [],
          };
        }

        const allMsgs = await loadCharacterContextMessages(currentChar);
        const messages = await buildLiveChunkGenerationMessages({
          char: currentChar,
          userProfile,
          channel: activeChannel,
          session: baseSession,
          allMsgs,
        });

        const raw = await callMainStreamerLlm({
          apiConfig,
          char: currentChar,
          messages,
          purpose: '生成直播切片(Chunk)',
        });

        const chunkIndex = baseSession.chunks.length;
        const chunkId = `chk_${baseSession.id}_${chunkIndex}_${Date.now()}`;
        const pendingInputs = baseSession.pendingDanmakuQueue || [];
        const beats = parseLiveBeatsResponse(raw, chunkId, pendingInputs);

        // 实时同步写入主聊天 DB（source: 'live'），实现与微信私聊实时互通
        const dbMessageId = await syncLiveChunkToDb({
          charId: currentChar.id,
          channel: activeChannel,
          session: baseSession,
          chunkIndex,
          beats,
          existingDbMsgId: existingDbId,
        });

        const newChunk: LiveChunk = {
          id: chunkId,
          index: chunkIndex,
          createdAt: Date.now(),
          beats,
          userInputs: pendingInputs,
          dbMessageId,
        };

        const deltaSum = beats.reduce((acc, b) => acc + (b.viewerDelta || 0), 0);
        let updatedSession: LiveStreamSession = {
          ...baseSession,
          viewerCount: Math.max(50, baseSession.viewerCount + deltaSum),
          chunks: [...baseSession.chunks, newChunk],
          pendingDanmakuQueue: [],
        };

        setSessions(upsertLiveSession(updatedSession));
        setCurrentChunkIdx(updatedSession.chunks.length - 1);
        setCurrentBeatIdx(0);

        // 自动朗读第一拍
        if (activeChannel.voiceConfig?.autoPlayTts && beats[0]?.speechOriginal) {
          void handlePlayTts(beats[0].speechOriginal, beats[0].emotion);
        }

        // 检查是否满 N 段需要自动触发辅助模型阶段滚动折叠（防爆 Token）
        const unfolded = updatedSession.chunks.filter(c => !c.folded);
        if (
          unfolded.length >=
          updatedSession.foldEveryNChunks + updatedSession.foldKeepRecentChunks
        ) {
          void performRollingFold(updatedSession, activeChannel);
        }
      } catch (e: any) {
        addToast(e?.message || '生成直播切片失败', 'error');
      } finally {
        setBusy(false);
      }
    },
    [currentChar, activeChannel, busy, userProfile, apiConfig, handlePlayTts, addToast],
  );

  // 阶段滚动折叠（调用辅助模型 secondaryLlm 提炼四栏细节并顶替旧过程）
  const performRollingFold = async (
    targetSession: LiveStreamSession,
    channel: StreamerChannelProfile,
  ) => {
    if (!currentChar || foldingBusy) return;
    const unfolded = targetSession.chunks.filter(c => !c.folded);
    if (unfolded.length < 2) return;
    const toFoldCount = Math.max(1, unfolded.length - targetSession.foldKeepRecentChunks);
    const chunksToFold = unfolded.slice(0, toFoldCount);

    setFoldingBusy(true);
    try {
      const summaryContent = await generateLiveRollingSummary({
        apiConfig,
        char: currentChar,
        channel,
        session: targetSession,
        chunksToFold,
      });

      const sumId = `rsum_${Date.now()}`;
      const oldDbIds = chunksToFold
        .map(c => c.dbMessageId)
        .filter((id): id is number => typeof id === 'number' && id > 0);

      const sumDbId = await supersedeLiveMessagesWithSummary({
        charId: currentChar.id,
        sessionId: targetSession.id,
        channelId: channel.id,
        summaryText: summaryContent,
        supersededMsgIds: oldDbIds,
        isFinal: false,
      });

      const newSummary: LiveRollingSummary = {
        id: sumId,
        fromChunkIndex: chunksToFold[0].index,
        toChunkIndex: chunksToFold[chunksToFold.length - 1].index,
        content: summaryContent,
        createdAt: Date.now(),
        dbMessageId: sumDbId,
      };

      const foldedSet = new Set(chunksToFold.map(c => c.id));
      const nextSession: LiveStreamSession = {
        ...targetSession,
        chunks: targetSession.chunks.map(c =>
          foldedSet.has(c.id) ? { ...c, folded: true, foldedBySummaryId: sumId } : c,
        ),
        rollingSummaries: [...targetSession.rollingSummaries, newSummary],
      };

      setSessions(upsertLiveSession(nextSession));
      addToast('已由辅助模型生成阶段滚动摘要，释放旧切片 Token', 'success');
    } catch (e: any) {
      addToast(e?.message || '阶段总结失败', 'error');
    } finally {
      setFoldingBusy(false);
    }
  };

  // 自动逐拍播放定时器
  useEffect(() => {
    if (!autoPlayBeats || !activeLiveSession || busy) return;
    const curChunk = activeLiveSession.chunks[currentChunkIdx];
    if (!curChunk) return;

    const timer = window.setTimeout(() => {
      if (currentBeatIdx < curChunk.beats.length - 1) {
        const nextB = currentBeatIdx + 1;
        setCurrentBeatIdx(nextB);
        const beat = curChunk.beats[nextB];
        if (activeChannel?.voiceConfig?.autoPlayTts && beat?.speechOriginal) {
          void handlePlayTts(beat.speechOriginal, beat.emotion);
        }
      } else {
        setAutoPlayBeats(false);
      }
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [autoPlayBeats, activeLiveSession, currentChunkIdx, currentBeatIdx, busy, activeChannel, handlePlayTts]);

  // 开新直播
  const handleStartNewLive = async () => {
    if (!currentChar || !activeChannel) return;
    const preset =
      STREAM_PRESET_TEMPLATES.find(t => t.key === selectedPresetKey) ||
      STREAM_PRESET_TEMPLATES[0];
    const newSession: LiveStreamSession = {
      id: `live_${Date.now()}`,
      channelId: activeChannel.id,
      charId: currentChar.id,
      title: customTitle.trim() || preset.defaultTitle,
      categoryKey: preset.key,
      categoryLabel: preset.label,
      customTopic: customTopic.trim() || undefined,
      status: 'live',
      viewerCount: Math.max(120, Math.floor(activeChannel.followerCount * 0.08)),
      likeCount: 0,
      chunks: [],
      rollingSummaries: [],
      pendingDanmakuQueue: [],
      foldEveryNChunks: 3,
      foldKeepRecentChunks: 1,
      startedAt: Date.now(),
    };
    setSessions(upsertLiveSession(newSession));
    setActiveLiveSessionId(newSession.id);
    setCurrentChunkIdx(0);
    setCurrentBeatIdx(0);
    await generateNextChunkForSession(newSession, false);
  };

  // 在直播间内嵌微信抽屉偷偷发微信捣乱（真实写入主聊天并让 Char 在桌下回一条微信）
  const handleSendSneakyWechat = async (text: string) => {
    if (!currentChar || !activeLiveSession || !activeChannel) return;
    await DB.saveMessage({
      charId: currentChar.id,
      role: 'user',
      type: 'text',
      content: text,
    });
    await refreshRecentWechat();

    const allMsgs = await loadCharacterContextMessages(currentChar);
    const prompt = `【特殊情境：你现在正开着直播《${activeLiveSession.title}》（频道：${activeChannel.channelName}），镜头正对着你！此时 ${userProfile?.name || '对方'} 在微信私聊给你发来了这条消息：「${text}」】
请你趁着直播间隙，在桌子底下偷偷用手机微信打字回复TA（1~2句简短真实的微信回复，不要写直播镜头描写，因为这是发在微信窗口里的字）：`;

    const reqMsgs = await ContextBuilder.buildCharacterRequest(
      { char: currentChar, user: userProfile },
      [
        ...allMsgs.slice(-12).map(m => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content || '',
        })),
        { role: 'user', content: prompt },
      ],
    );

    const reply = await callMainStreamerLlm({
      apiConfig,
      char: currentChar,
      messages: reqMsgs,
      purpose: '直播中桌下偷偷回微信',
    });

    if (reply) {
      await DB.saveMessage({
        charId: currentChar.id,
        role: 'assistant',
        type: 'text',
        content: reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(),
      });
      await refreshRecentWechat();
      addToast(`${currentChar.name} 在直播桌下偷偷回了你微信！快点「下一段切片」看TA镜头反应`, 'success');
    }
  };

  // 打开下播全貌总结弹窗
  const handleOpenEndSummaryModal = async () => {
    if (!currentChar || !activeLiveSession || !activeChannel) return;
    setEndSummaryModalOpen(true);
    if (activeLiveSession.finalSummary) {
      setDraftFinalSummary(activeLiveSession.finalSummary);
      return;
    }
    setIsFinalSummarizing(true);
    try {
      const allMsgs = await loadCharacterContextMessages(currentChar);
      const sum = await generateLiveFinalSummary({
        apiConfig,
        char: currentChar,
        channel: activeChannel,
        session: activeLiveSession,
        allMsgs,
        userName: userProfile?.name || '我',
      });
      setDraftFinalSummary(sum);
    } catch (e: any) {
      addToast(e?.message || '生成下播总结失败', 'error');
    } finally {
      setIsFinalSummarizing(false);
    }
  };

  // 确认下播落入主聊天
  const handleConfirmEndDrop = async (mode: LiveArchiveDropMode) => {
    if (!currentChar || !activeLiveSession || !activeChannel) return;
    if (mode === 'forget') {
      await forgetLiveSessionInDb(activeLiveSession);
      const ended: LiveStreamSession = {
        ...activeLiveSession,
        status: 'ended',
        finalArchiveMode: 'forget',
        endedAt: Date.now(),
      };
      setSessions(upsertLiveSession(ended));
      setEndSummaryModalOpen(false);
      setActiveLiveSessionId(null);
      addToast('已清理本场临时记录，不进入记忆', 'info');
      return;
    }

    const oldIds: number[] = [];
    activeLiveSession.chunks.forEach(c => {
      if (c.dbMessageId) oldIds.push(c.dbMessageId);
    });
    activeLiveSession.rollingSummaries.forEach(r => {
      if (r.dbMessageId) oldIds.push(r.dbMessageId);
    });

    const finalDbId = await supersedeLiveMessagesWithSummary({
      charId: currentChar.id,
      sessionId: activeLiveSession.id,
      channelId: activeChannel.id,
      summaryText: draftFinalSummary,
      supersededMsgIds: oldIds,
      existingSummaryDbId: activeLiveSession.finalDbMessageId,
      isFinal: true,
    });

    let cardMsgId = activeLiveSession.finalCardMessageId;
    if (mode === 'card_and_memory') {
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
        viewerCount: activeLiveSession.viewerCount,
        summary: draftFinalSummary.trim(),
        createdAt: Date.now(),
      };
      cardMsgId = await DB.saveMessage({
        charId: currentChar.id,
        role: 'system',
        type: 'score_card',
        content: JSON.stringify(cardPayload),
        metadata: { scoreCard: cardPayload },
      });
    }

    const ended: LiveStreamSession = {
      ...activeLiveSession,
      status: 'ended',
      finalSummary: draftFinalSummary.trim(),
      finalArchiveMode: mode,
      finalDbMessageId: finalDbId,
      finalCardMessageId: cardMsgId,
      endedAt: Date.now(),
    };
    setSessions(upsertLiveSession(ended));
    triggerMemoryPalaceIfNeeded(currentChar);
    setEndSummaryModalOpen(false);
    setActiveLiveSessionId(null);
    addToast(
      mode === 'card_and_memory'
        ? '已下播归档并发送「下播纪念卡」到主聊天！'
        : '已静默归档至角色记忆，主聊天不弹卡',
      'success',
    );
  };

  // 分享单拍直播切片或 VOD / NPC 到主聊天
  const shareCardToMainChat = async (payload: LivestreamChatCardPayload) => {
    await DB.saveMessage({
      charId: payload.charId,
      role: 'user',
      type: 'score_card',
      content: JSON.stringify(payload),
      metadata: { scoreCard: payload },
    });
    addToast('已将卡片转发到主聊天窗口！', 'success');
  };

  // ==================== 子视图路由切换 ====================

  if (activeLiveSession && activeChannel && currentChar) {
    return (
      <>
        <LiveRoomView
          session={activeLiveSession}
          channel={activeChannel}
          charName={currentChar.name}
          activePersona={activePersona}
          currentChunkIdx={currentChunkIdx}
          currentBeatIdx={currentBeatIdx}
          autoPlayBeats={autoPlayBeats}
          translateMode={translateMode}
          busy={busy}
          foldingBusy={foldingBusy}
          recentWechatMsgs={recentWechatMsgs}
          onBack={() => {
            setAutoPlayBeats(false);
            setActiveLiveSessionId(null);
          }}
          onToggleAutoPlay={() => setAutoPlayBeats(p => !p)}
          onChangeTranslateMode={setTranslateMode}
          onStepNextBeatOrGenerate={() => {
            const curChunk = activeLiveSession.chunks[currentChunkIdx];
            if (curChunk && currentBeatIdx < curChunk.beats.length - 1) {
              const nextB = currentBeatIdx + 1;
              setCurrentBeatIdx(nextB);
              const b = curChunk.beats[nextB];
              if (activeChannel.voiceConfig?.autoPlayTts && b?.speechOriginal) {
                void handlePlayTts(b.speechOriginal, b.emotion);
              }
            } else {
              void generateNextChunkForSession(activeLiveSession, false);
            }
          }}
          onSelectBeatPosition={(ci, bi) => {
            setCurrentChunkIdx(ci);
            setCurrentBeatIdx(bi);
          }}
          onRerollCurrentChunk={() => void generateNextChunkForSession(activeLiveSession, true)}
          onSaveEditedBeat={async (ci, bi, nextBeat) => {
            const nextChunks = activeLiveSession.chunks.map((ch, idx) =>
              idx === ci
                ? { ...ch, beats: ch.beats.map((b, bIdx) => (bIdx === bi ? nextBeat : b)) }
                : ch,
            );
            const updated = { ...activeLiveSession, chunks: nextChunks };
            setSessions(upsertLiveSession(updated));
            const targetCh = nextChunks[ci];
            if (targetCh?.dbMessageId) {
              await syncLiveChunkToDb({
                charId: currentChar.id,
                channel: activeChannel,
                session: updated,
                chunkIndex: ci,
                beats: targetCh.beats,
                existingDbMsgId: targetCh.dbMessageId,
              });
            }
            addToast('已保存本拍修改并同步更新后台记忆', 'success');
          }}
          onSendDanmakuOrSc={(text, scTier) => {
            const item: LiveDanmakuItem = {
              id: `udm_${Date.now()}`,
              senderName: activePersona.name,
              viewerPersonaId: activePersona.id,
              isUserMain: activePersona.isMain,
              isUserAlt: !activePersona.isMain,
              fanBadge: activePersona.badgeText || activeChannel.fanBadgeName,
              fanLevel: activePersona.fanLevel,
              roleType: activePersona.isMain ? 'user_main' : 'user_alt',
              text,
              scAmount: scTier?.amount,
              scColor: scTier?.color,
              giftName: scTier?.giftName,
              timestamp: Date.now(),
            };
            const updated: LiveStreamSession = {
              ...activeLiveSession,
              pendingDanmakuQueue: [...(activeLiveSession.pendingDanmakuQueue || []), item],
            };
            setSessions(upsertLiveSession(updated));
          }}
          onSendSneakyWechat={handleSendSneakyWechat}
          onTriggerRollingFold={() => void performRollingFold(activeLiveSession, activeChannel)}
          onEditRollingSummary={async (sumId, newContent) => {
            const target = activeLiveSession.rollingSummaries.find(s => s.id === sumId);
            const nextSums = activeLiveSession.rollingSummaries.map(s =>
              s.id === sumId ? { ...s, content: newContent } : s,
            );
            const updated = { ...activeLiveSession, rollingSummaries: nextSums };
            setSessions(upsertLiveSession(updated));
            if (target?.dbMessageId) {
              await supersedeLiveMessagesWithSummary({
                charId: currentChar.id,
                sessionId: activeLiveSession.id,
                channelId: activeChannel.id,
                summaryText: newContent,
                supersededMsgIds: [],
                existingSummaryDbId: target.dbMessageId,
              });
            }
          }}
          onRegenerateRollingSummary={async sum => {
            const chunksToFold = activeLiveSession.chunks.filter(
              c => c.index >= sum.fromChunkIndex && c.index <= sum.toChunkIndex,
            );
            setFoldingBusy(true);
            try {
              const fresh = await generateLiveRollingSummary({
                apiConfig,
                char: currentChar,
                channel: activeChannel,
                session: activeLiveSession,
                chunksToFold,
              });
              const nextSums = activeLiveSession.rollingSummaries.map(s =>
                s.id === sum.id ? { ...s, content: fresh } : s,
              );
              setSessions(upsertLiveSession({ ...activeLiveSession, rollingSummaries: nextSums }));
              if (sum.dbMessageId) {
                await supersedeLiveMessagesWithSummary({
                  charId: currentChar.id,
                  sessionId: activeLiveSession.id,
                  channelId: activeChannel.id,
                  summaryText: fresh,
                  supersededMsgIds: [],
                  existingSummaryDbId: sum.dbMessageId,
                });
              }
              addToast('已由辅助模型重新生成该阶段摘要', 'success');
            } finally {
              setFoldingBusy(false);
            }
          }}
          onDissolveRollingSummary={sum => {
            const nextChunks = activeLiveSession.chunks.map(c =>
              c.foldedBySummaryId === sum.id ? { ...c, folded: false, foldedBySummaryId: undefined } : c,
            );
            const nextSums = activeLiveSession.rollingSummaries.filter(s => s.id !== sum.id);
            setSessions(
              upsertLiveSession({ ...activeLiveSession, chunks: nextChunks, rollingSummaries: nextSums }),
            );
            addToast('已解散该阶段摘要，还原原始切片', 'info');
          }}
          onOpenPersonaModal={() => setPersonaModalOpen(true)}
          onOpenChannelModal={() => {
            setEditingChannel(activeChannel);
            setChannelModalOpen(true);
          }}
          onOpenEndSummaryModal={() => void handleOpenEndSummaryModal()}
          onShareClipToChat={beat => {
            void shareCardToMainChat({
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
              summary: `${beat.screen}\n${currentChar.name}：「${beat.speechOriginal}」`,
              clipBeat: {
                screen: beat.screen,
                speechOriginal: beat.speechOriginal,
                speechTranslated: beat.speechTranslated,
                highlightDanmaku: (beat.danmaku || []).slice(0, 3).map(d => `${d.senderName}: ${d.text}`),
              },
              createdAt: Date.now(),
            });
          }}
          onPlayTts={handlePlayTts}
        />

        <ViewerPersonaModal
          isOpen={personaModalOpen}
          personas={personas}
          activePersonaId={activePersonaId}
          onSelect={setActivePersonaId}
          onSavePersonas={next => {
            setPersonas(next);
            saveViewerPersonas(next);
          }}
          onClose={() => setPersonaModalOpen(false)}
        />

        <ChannelEditorModal
          isOpen={channelModalOpen}
          charId={currentChar.id}
          charName={currentChar.name}
          charAvatar={currentChar.avatar}
          initialChannel={editingChannel}
          onClose={() => setChannelModalOpen(false)}
          onSave={ch => {
            setChannels(upsertChannel(ch));
            setSelectedChannelId(ch.id);
          }}
          onDelete={id => setChannels(deleteChannelById(id))}
        />

        <EndStreamSummaryModal
          isOpen={endSummaryModalOpen}
          sessionTitle={activeLiveSession.title}
          summaryText={draftFinalSummary}
          isSummarizing={isFinalSummarizing}
          onChangeSummaryText={setDraftFinalSummary}
          onRegenerateSummary={async () => {
            setIsFinalSummarizing(true);
            try {
              const allMsgs = await loadCharacterContextMessages(currentChar);
              const fresh = await generateLiveFinalSummary({
                apiConfig,
                char: currentChar,
                channel: activeChannel,
                session: activeLiveSession,
                allMsgs,
                userName: userProfile?.name || '我',
              });
              setDraftFinalSummary(fresh);
            } finally {
              setIsFinalSummarizing(false);
            }
          }}
          onConfirmDrop={mode => void handleConfirmEndDrop(mode)}
          onClose={() => setEndSummaryModalOpen(false)}
        />
      </>
    );
  }

  if (activeVod && activeChannel && currentChar) {
    return (
      <>
        <VodDetailView
          vod={activeVod}
          channel={activeChannel}
          activePersona={activePersona}
          translateMode={translateMode}
          busy={busy}
          onBack={() => setActiveVodId(null)}
          onPlayTts={text => void handlePlayTts(text)}
          onOpenPersonaModal={() => setPersonaModalOpen(true)}
          onUpdateVod={next => setVodPosts(upsertVodPost(next))}
          onRequestStreamerReply={async comment => {
            setBusy(true);
            try {
              const res = await generateStreamerVodReply({
                apiConfig,
                char: currentChar,
                userProfile,
                channel: activeChannel,
                vod: activeVod,
                targetComment: comment,
              });
              const nextComments = activeVod.comments.map(c =>
                c.id === comment.id
                  ? {
                      ...c,
                      likedByStreamer: true,
                      replies: [
                        {
                          id: `vrp_${Date.now()}`,
                          authorName: activeChannel.channelName,
                          isStreamer: true,
                          content: res.replyOriginal,
                          translation: res.replyTranslated,
                          timestamp: Date.now(),
                        },
                      ],
                    }
                  : c,
              );
              setVodPosts(upsertVodPost({ ...activeVod, comments: nextComments }));
            } catch (e: any) {
              addToast(e?.message || 'UP主翻牌失败', 'error');
            } finally {
              setBusy(false);
            }
          }}
          onShareToChat={() =>
            void shareCardToMainChat({
              type: 'livestream_card',
              cardKind: 'vod_share',
              sessionId: activeVod.id,
              channelId: activeChannel.id,
              charId: currentChar.id,
              charName: currentChar.name,
              channelName: activeChannel.channelName,
              title: activeVod.title,
              categoryLabel: activeVod.categoryLabel,
              summary: activeVod.chapters.map(c => `${c.timestampLabel} ${c.chapterTitle}：${c.speechOriginal || c.screen}`).join('\n'),
              createdAt: Date.now(),
            })
          }
        />
        <ViewerPersonaModal
          isOpen={personaModalOpen}
          personas={personas}
          activePersonaId={activePersonaId}
          onSelect={setActivePersonaId}
          onSavePersonas={next => {
            setPersonas(next);
            saveViewerPersonas(next);
          }}
          onClose={() => setPersonaModalOpen(false)}
        />
      </>
    );
  }

  if (activeNpcSession && currentChar) {
    return (
      <NpcWatchRoomView
        npcSession={activeNpcSession}
        charName={currentChar.name}
        busy={busy}
        onBack={() => setActiveNpcSessionId(null)}
        onSwitchNextNpc={async () => {
          const nextTpl =
            NPC_PRESET_ROOMS[Math.floor(Math.random() * NPC_PRESET_ROOMS.length)];
          const created: NpcWatchSession = {
            id: `npcw_${Date.now()}`,
            charId: currentChar.id,
            npcStreamerName: nextTpl.npcName,
            npcCategoryLabel: nextTpl.categoryLabel,
            npcRoomTitle: nextTpl.roomTitle,
            npcBio: nextTpl.npcBio,
            coverGradient: nextTpl.coverGradient,
            viewerCount: Math.floor(Math.random() * 8000) + 500,
            beats: [],
            createdAt: Date.now(),
          };
          setNpcWatches(upsertNpcWatchSession(created));
          setActiveNpcSessionId(created.id);
        }}
        onNextNpcBeat={async (text, mode) => {
          setBusy(true);
          try {
            const allMsgs = await loadCharacterContextMessages(currentChar);
            const beat = await generateNpcWatchBeatDualEngine({
              apiConfig,
              char: currentChar,
              userProfile,
              npcSession: activeNpcSession,
              userInteractionText: text,
              interactionType: mode,
              allMsgs,
            });
            // 同步写入一条 source: 'live' 记录供后续私聊衔接
            const dbId = await DB.saveMessage({
              charId: currentChar.id,
              role: 'assistant',
              type: 'text',
              content: `[陪看NPC直播《${activeNpcSession.npcRoomTitle}》] 画面：${beat.npcScreen} ｜ ${currentChar.name}反应：${beat.charReactionAction}「${beat.charReactionSpeech}」`,
              metadata: { source: 'live', liveSessionId: activeNpcSession.id },
            });
            const updated: NpcWatchSession = {
              ...activeNpcSession,
              beats: [...activeNpcSession.beats, { ...beat, dbMessageId: dbId }],
            };
            setNpcWatches(upsertNpcWatchSession(updated));
          } catch (e: any) {
            addToast(e?.message || '生成陪看剧情失败', 'error');
          } finally {
            setBusy(false);
          }
        }}
        onRerollCharOnly={async beatIdx => {
          const targetBeat = activeNpcSession.beats[beatIdx];
          if (!targetBeat) return;
          setBusy(true);
          try {
            const allMsgs = await loadCharacterContextMessages(currentChar);
            const rerolled = await rerollCharNpcReactionOnly({
              apiConfig,
              char: currentChar,
              userProfile,
              npcSession: activeNpcSession,
              beat: targetBeat,
              allMsgs,
            });
            const nextBeats = activeNpcSession.beats.map((b, i) =>
              i === beatIdx ? { ...b, ...rerolled } : b,
            );
            setNpcWatches(upsertNpcWatchSession({ ...activeNpcSession, beats: nextBeats }));
          } finally {
            setBusy(false);
          }
        }}
        onPlayCharTts={text => void handlePlayTts(text)}
        onShareToChat={() => {
          const last = activeNpcSession.beats[activeNpcSession.beats.length - 1];
          void shareCardToMainChat({
            type: 'livestream_card',
            cardKind: 'npc_watch',
            sessionId: activeNpcSession.id,
            charId: currentChar.id,
            charName: currentChar.name,
            channelName: activeNpcSession.npcStreamerName,
            title: `和 ${currentChar.name} 一起刷：${activeNpcSession.npcRoomTitle}`,
            categoryLabel: activeNpcSession.npcCategoryLabel,
            summary: last
              ? `NPC主播：「${last.npcSpeech}」\n${currentChar.name}吐槽：${last.charReactionAction}「${last.charReactionSpeech}」`
              : activeNpcSession.npcBio,
            createdAt: Date.now(),
          });
        }}
      />
    );
  }

  // ==================== 首页大厅视图 ====================

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none">
      {/* 顶栏：返回 + 角色切换 + 马甲入口 */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <button onClick={closeApp} className="text-xs px-2.5 py-1 rounded-xl bg-zinc-800 text-zinc-300">
            ← 桌面
          </button>
          <span className="text-sm font-black tracking-wide bg-gradient-to-r from-rose-400 to-violet-400 bg-clip-text text-transparent">
            OnAir · 电波配信
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={currentChar?.id || ''}
            onChange={e => {
              setSelectedCharId(e.target.value);
              setActiveCharacterId(e.target.value);
            }}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1 text-xs text-white"
          >
            {characters.map(c => (
              <option key={c.id} value={c.id}>
                角色：{c.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setPersonaModalOpen(true)}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${
              activePersona.isMain ? 'bg-emerald-600 text-white' : 'bg-violet-600 text-white'
            }`}
          >
            {activePersona.isMain ? '大号' : '马甲'}: {activePersona.name.slice(0, 4)}
          </button>
        </div>
      </div>

      {/* 多频道横向矩阵栏（一个 Char 可建多个频道） */}
      <div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-semibold">
            {currentChar?.name} 的主播/UP主频道（支持本尊号、不露脸小号、皮套人）
          </span>
          <button
            onClick={() => {
              setEditingChannel(null);
              setChannelModalOpen(true);
            }}
            className="text-rose-400 font-bold hover:underline"
          >
            + 新建频道
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {charChannels.map(ch => {
            const isSel = ch.id === activeChannel?.id;
            return (
              <div
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                className={`px-3 py-2 rounded-2xl border flex items-center gap-2.5 cursor-pointer shrink-0 transition ${
                  isSel
                    ? 'border-rose-500 bg-rose-500/15 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                {ch.avatar ? (
                  <TokenImg value={ch.avatar} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center text-white font-bold text-xs">
                    {ch.channelName[0]}
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold flex items-center gap-1">
                    <span>{ch.channelName}</span>
                    {ch.voiceConfig?.language && (
                      <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 uppercase">
                        {ch.voiceConfig.language}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-75">
                    {ch.identityMode === 'secret_alt' ? '匿名马甲' : ch.identityMode === 'vtuber' ? '虚拟皮套' : '公开本尊'} · {ch.followerCount}粉
                  </div>
                </div>
                {isSel && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setEditingChannel(ch);
                      setChannelModalOpen(true);
                    }}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300"
                  >
                    设置
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 三大核心玩法 Tab */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-xs font-bold">
        <button
          onClick={() => setHomeTab('live')}
          className={`flex-1 py-2.5 border-b-2 ${
            homeTab === 'live' ? 'border-rose-500 text-rose-400' : 'border-transparent text-zinc-400'
          }`}
        >
          🔴 Char 直播配信
        </button>
        <button
          onClick={() => setHomeTab('vod')}
          className={`flex-1 py-2.5 border-b-2 ${
            homeTab === 'vod' ? 'border-rose-500 text-rose-400' : 'border-transparent text-zinc-400'
          }`}
        >
          🎬 视频博主投稿 (VOD)
        </button>
        <button
          onClick={() => setHomeTab('npc')}
          className={`flex-1 py-2.5 border-b-2 ${
            homeTab === 'npc' ? 'border-rose-500 text-rose-400' : 'border-transparent text-zinc-400'
          }`}
        >
          🛋️ 刷 NPC 陪看房
        </button>
      </div>

      {/* 主体内容区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {homeTab === 'live' && (
          <>
            {/* 开播控制台 */}
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
              <div className="text-xs font-bold text-zinc-200">
                选择今日直播模板（频道：{activeChannel?.channelName}）
              </div>
              <div className="grid grid-cols-3 gap-2">
                {STREAM_PRESET_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.key}
                    onClick={() => {
                      setSelectedPresetKey(tpl.key);
                      if (!customTitle) setCustomTitle(tpl.defaultTitle);
                    }}
                    className={`p-2.5 rounded-2xl border text-left transition ${
                      selectedPresetKey === tpl.key
                        ? 'border-rose-500 bg-rose-500/15 text-white'
                        : 'border-zinc-800 bg-zinc-800/50 text-zinc-400'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-rose-400">{tpl.badge}</div>
                    <div className="text-xs font-bold mt-0.5">{tpl.label}</div>
                  </button>
                ))}
              </div>

              <input
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="自定义直播间标题（留空使用模板默认标题）"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <input
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                placeholder="可选：附加今日脚本走向或特殊惩罚 Flag…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
              />

              <button
                disabled={busy}
                onClick={() => void handleStartNewLive()}
                className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 text-white text-xs font-bold shadow-lg disabled:opacity-40"
              >
                {busy ? '正在连线开播…' : '🔴 立即进入直播间开播'}
              </button>
            </div>

            {/* 历史直播场次列表 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-zinc-400">本角色直播记录 / 回放</div>
              {sessions
                .filter(s => s.charId === currentChar?.id)
                .map(s => (
                  <div
                    key={s.id}
                    onClick={() => {
                      setActiveLiveSessionId(s.id);
                      setCurrentChunkIdx(Math.max(0, s.chunks.length - 1));
                      setCurrentBeatIdx(0);
                    }}
                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between cursor-pointer hover:border-zinc-700"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            s.status === 'live' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {s.status === 'live' ? '直播中' : '回放'}
                        </span>
                        <span className="text-xs font-bold text-white truncate">《{s.title}》</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        {s.categoryLabel} · 共 {s.chunks.length} 段切片 · 在线峰值 {s.viewerCount}
                      </div>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSessions(deleteLiveSession(s.id));
                      }}
                      className="text-xs text-zinc-500 hover:text-red-400 px-2 py-1"
                    >
                      删除
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}

        {homeTab === 'vod' && (
          <>
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
              <div className="text-xs font-bold text-zinc-200">
                让「{activeChannel?.channelName}」发布新视频投稿（带分镜进度条+弹幕+盖楼翻牌）
              </div>
              <input
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="输入视频投稿主题（如：深夜偷偷测评奇葩零食 / 男友视角哄睡Vlog）"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <button
                disabled={busy || !activeChannel || !currentChar}
                onClick={async () => {
                  if (!currentChar || !activeChannel) return;
                  setBusy(true);
                  try {
                    const allMsgs = await loadCharacterContextMessages(currentChar);
                    const post = await generateVodVideoPost({
                      apiConfig,
                      char: currentChar,
                      userProfile,
                      channel: activeChannel,
                      topicTitle: customTitle.trim() || `${activeChannel.channelName}的最新投稿视频`,
                      categoryLabel: '热门投稿',
                      allMsgs,
                    });
                    setVodPosts(upsertVodPost(post));
                    setActiveVodId(post.id);
                  } catch (e: any) {
                    addToast(e?.message || '生成视频投稿失败', 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full py-2.5 rounded-2xl bg-rose-600 text-white text-xs font-bold disabled:opacity-40"
              >
                {busy ? '正在剪辑生成视频分镜与热评…' : '🎬 立即生成新视频投稿'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {vodPosts
                .filter(v => v.charId === currentChar?.id)
                .map(v => (
                  <div
                    key={v.id}
                    onClick={() => setActiveVodId(v.id)}
                    className="p-3.5 rounded-2xl border border-zinc-800 cursor-pointer flex items-center justify-between"
                    style={{ background: v.coverGradient }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">《{v.title}》</div>
                      <div className="text-[11px] text-white/80 mt-1">
                        时长 {v.durationLabel} · ▶ {v.viewsCount} · 评论 {v.comments.length}
                      </div>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setVodPosts(deleteVodPost(v.id));
                      }}
                      className="text-xs bg-black/40 text-zinc-300 px-2 py-1 rounded-lg"
                    >
                      删除
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}

        {homeTab === 'npc' && (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
              💡 <strong>双擎陪看模式</strong>：台上的奇葩路人主播由「设置里的辅助模型」独立扮演，而 <strong>{currentChar?.name}</strong> 由主模型扮演坐在你身边陪看、吃醋、吐槽或跟你一起发弹幕搞事！
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {NPC_PRESET_ROOMS.map(tpl => (
                <div
                  key={tpl.key}
                  onClick={() => {
                    if (!currentChar) return;
                    const created: NpcWatchSession = {
                      id: `npcw_${Date.now()}`,
                      charId: currentChar.id,
                      npcStreamerName: tpl.npcName,
                      npcCategoryLabel: tpl.categoryLabel,
                      npcRoomTitle: tpl.roomTitle,
                      npcBio: tpl.npcBio,
                      coverGradient: tpl.coverGradient,
                      viewerCount: Math.floor(Math.random() * 9000) + 800,
                      beats: [],
                      createdAt: Date.now(),
                    };
                    setNpcWatches(upsertNpcWatchSession(created));
                    setActiveNpcSessionId(created.id);
                  }}
                  className="p-4 rounded-2xl border border-zinc-800 cursor-pointer hover:border-rose-500/50 transition"
                  style={{ background: tpl.coverGradient }}
                >
                  <div className="flex items-center justify-between text-[11px] text-amber-300 font-bold">
                    <span>{tpl.categoryLabel} · {tpl.npcName}</span>
                    <span>拉 {currentChar?.name} 进去看 →</span>
                  </div>
                  <div className="text-sm font-bold text-white mt-1">《{tpl.roomTitle}》</div>
                  <div className="text-xs text-white/80 mt-1">{tpl.npcBio}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ChannelEditorModal
        isOpen={channelModalOpen}
        charId={currentChar?.id || ''}
        charName={currentChar?.name || '角色'}
        charAvatar={currentChar?.avatar}
        initialChannel={editingChannel}
        onClose={() => setChannelModalOpen(false)}
        onSave={ch => {
          setChannels(upsertChannel(ch));
          setSelectedChannelId(ch.id);
        }}
        onDelete={id => setChannels(deleteChannelById(id))}
      />

      <ViewerPersonaModal
        isOpen={personaModalOpen}
        personas={personas}
        activePersonaId={activePersonaId}
        onSelect={setActivePersonaId}
        onSavePersonas={next => {
          setPersonas(next);
          saveViewerPersonas(next);
        }}
        onClose={() => setPersonaModalOpen(false)}
      />
    </div>
  );
};

export default LiveStreamApp;
