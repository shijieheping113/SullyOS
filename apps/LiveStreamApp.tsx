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
  StreamGiftOption,
  VodVideoPost,
  VodChapterBeat,
  VodCommentItem,
  NpcWatchSession,
  NpcWatchBeat,
  NpcStreamerChannelCard,
  LivestreamChatCardPayload,
  OnAirRealtimeSettings,
  DEFAULT_ONAIR_REALTIME_SETTINGS,
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
  syncNpcBeatToDb,
  updateLiveRoundCardSummary,
  setLiveStorageWriteErrorHandler,
  loadOnAirRealtimeSettings,
  saveOnAirRealtimeSettings,
  liveRoundSignature,
  pickRoundToFold,
  applyRoundSummary,
} from '../utils/liveStreamStorage';
import {
  buildLiveStreamTurnPrompt,
  parseLiveBeatsResponse,
  callMainStreamerLlm,
  generateLiveRoundSummary,
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
} from '../components/live/LiveStreamModals';
import { LiveRoomView } from '../components/live/LiveRoomView';
import { LiveLobby } from '../components/live/LiveLobby';
import { VodDetailView, NpcWatchRoomView } from '../components/live/VodAndNpcViews';
import { LiveFloatingPhone } from '../components/live/LiveSharedWidgets';
import { migrateLiveStorageToIdbOnce } from '../utils/liveStreamMigration';
import { loadCharacterContextMessages } from '../utils/chatContextRange';
import { RealtimeContextManager, defaultRealtimeConfig } from '../utils/realtimeContext';
import { resolveCharTimeZone } from '../utils/timezone';
import type { RealtimeConfig } from '../types';
import { clampManualContextLimit } from '../utils/chatContextRange';

type MainTab = 'char_live' | 'char_vod' | 'npc_watch';

const LiveStreamApp: React.FC = () => {
  const {
    closeApp,
    characters,
    activeCharacterId,
    setActiveCharacterId,
    apiConfig,
    userProfile,
    realtimeConfig,
    addToast,
    registerBackHandler,
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
  const [viewerPersonas, setViewerPersonas] = useState<ViewerPersona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState<string>('viewer_main_self');

  // 会话与内容数据
  const [liveSessions, setLiveSessions] = useState<LiveStreamSession[]>([]);
  const [activeLiveSessionId, setActiveLiveSessionId] = useState<string | null>(null);
  const [vodPosts, setVodPosts] = useState<VodVideoPost[]>([]);
  const [activeVodId, setActiveVodId] = useState<string | null>(null);
  const [npcSessions, setNpcSessions] = useState<NpcWatchSession[]>([]);
  const [activeNpcSessionId, setActiveNpcSessionId] = useState<string | null>(null);

  // NPC 频道池与自定义规则
  const [npcPool, setNpcPool] = useState<NpcStreamerChannelCard[]>([]);
  const [npcCustomRule, setNpcCustomRule] = useState<string>('');
  const [showNpcRuleBox, setShowNpcRuleBox] = useState(false);

  /** 数据都在 IndexedDB 里，读出来之前不能先摆一个「没有直播」的空大厅 */
  const [storeReady, setStoreReady] = useState(false);

  // 电波总控 · 实时背景开关（存 live_kv，只作用于电波生成请求）
  const [onAirRealtime, setOnAirRealtime] = useState<OnAirRealtimeSettings>({
    ...DEFAULT_ONAIR_REALTIME_SETTINGS,
  });
  useEffect(() => {
    void loadOnAirRealtimeSettings()
      .then(next => setOnAirRealtime(next))
      .catch(() => {
        /* 读不到就用默认值，不影响直播 */
      });
  }, []);
  const updateOnAirRealtime = useCallback(async (next: OnAirRealtimeSettings) => {
    setOnAirRealtime(next);
    try {
      await saveOnAirRealtimeSettings(next);
    } catch {
      /* toast 已由存储层弹出 */
    }
  }, []);

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
  const [showLobbyPhone, setShowLobbyPhone] = useState(false);

  // 生成与语音状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiHelperBusy, setAiHelperBusy] = useState(false);
  const [vodReplyGeneratingId, setVodReplyGeneratingId] = useState<string | null>(null);
  const [npcRerollingBeatId, setNpcRerollingBeatId] = useState<string | null>(null);
  const [ttsPlayingBeatId, setTtsPlayingBeatId] = useState<string | null>(null);
  const [ttsLoadingBeatId, setTtsLoadingBeatId] = useState<string | null>(null);
  const [voiceEnd, setVoiceEnd] = useState<{ id: string; n: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const screenBackRef = useRef<() => boolean>(() => false);

  const stopVoiceAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audioRef.current = null;
  }, []);

  const playVoiceUrl = useCallback(
    async (url: string, id: string): Promise<boolean> => {
      stopVoiceAudio();
      if (!url) return false;
      const audio = new Audio();
      audioRef.current = audio;
      audio.onended = () => {
        setTtsPlayingBeatId(prev => (prev === id ? null : prev));
        setVoiceEnd(prev => ({ id, n: (prev?.n ?? 0) + 1 }));
      };
      audio.onerror = () => setTtsPlayingBeatId(prev => (prev === id ? null : prev));
      audio.src = url;
      setTtsPlayingBeatId(id);
      try {
        await audio.play();
        return true;
      } catch {
        if (audioRef.current === audio) audioRef.current = null;
        setTtsPlayingBeatId(prev => (prev === id ? null : prev));
        return false;
      }
    },
    [stopVoiceAudio],
  );

  useEffect(() => {
    return registerBackHandler(() => {
      if (showChannelModal) {
        setShowChannelModal(false);
        return true;
      }
      if (showPersonaModal) {
        setShowPersonaModal(false);
        return true;
      }
      if (showLobbyPhone) {
        setShowLobbyPhone(false);
        return true;
      }
      return screenBackRef.current();
    });
  }, [
    registerBackHandler,
    showChannelModal,
    showPersonaModal,
    showLobbyPhone,
  ]);

  const [pendingUserInputs, setPendingUserInputs] = useState<
    Array<{
      text: string;
      persona: ViewerPersona;
      scAmount?: number;
      scColor?: 'blue' | 'cyan' | 'amber' | 'magenta' | 'red';
      gift?: StreamGiftOption;
    }>
  >([]);

  // ==================== 落库：先改界面，再等真正写进 IndexedDB ====================
  // 以前是把「写 localStorage 的结果」直接塞回 state，写失败静默丢，刷新才发现整场没了。
  // 现在写失败由存储层的 toast 说明，界面不回滚——内容还看得见，用户可以再操作一次。

  const rememberLiveSession = useCallback(async (session: LiveStreamSession): Promise<boolean> => {
    setLiveSessions(prev =>
      prev.some(s => s.id === session.id)
        ? prev.map(s => (s.id === session.id ? session : s))
        : [session, ...prev],
    );
    try {
      await upsertLiveSession(session);
      return true;
    } catch {
      return false;
    }
  }, []);

  const forgetLiveSession = useCallback(async (sessionId: string): Promise<void> => {
    setLiveSessions(prev => prev.filter(s => s.id !== sessionId));
    try {
      await deleteLiveSession(sessionId);
    } catch {
      /* toast 已由存储层弹出 */
    }
  }, []);

  const rememberVodPost = useCallback(async (post: VodVideoPost): Promise<boolean> => {
    setVodPosts(prev =>
      prev.some(v => v.id === post.id)
        ? prev.map(v => (v.id === post.id ? post : v))
        : [post, ...prev],
    );
    try {
      await upsertVodPost(post);
      return true;
    } catch {
      return false;
    }
  }, []);

  const forgetVodPost = useCallback(async (postId: string): Promise<void> => {
    setVodPosts(prev => prev.filter(v => v.id !== postId));
    try {
      await deleteVodPost(postId);
    } catch {
      /* toast 已由存储层弹出 */
    }
  }, []);

  const rememberNpcSession = useCallback(async (session: NpcWatchSession): Promise<boolean> => {
    setNpcSessions(prev =>
      prev.some(s => s.id === session.id)
        ? prev.map(s => (s.id === session.id ? session : s))
        : [session, ...prev],
    );
    try {
      await upsertNpcWatchSession(session);
      return true;
    } catch {
      return false;
    }
  }, []);

  const rememberChannel = useCallback(
    async (channel: StreamerChannelProfile): Promise<boolean> => {
      setChannels(prev =>
        prev.some(c => c.id === channel.id)
          ? prev.map(c => (c.id === channel.id ? channel : c))
          : [...prev, channel],
      );
      try {
        await upsertChannel(channel);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const forgetChannel = useCallback(async (channelId: string): Promise<void> => {
    setChannels(prev => prev.filter(c => c.id !== channelId));
    try {
      await deleteChannelById(channelId);
    } catch {
      /* toast 已由存储层弹出 */
    }
  }, []);

  const rememberPersonas = useCallback(async (next: ViewerPersona[]): Promise<void> => {
    setViewerPersonas(next);
    try {
      await saveViewerPersonas(next);
    } catch {
      /* toast 已由存储层弹出 */
    }
  }, []);

  const rememberNpcPool = useCallback(async (next: NpcStreamerChannelCard[]): Promise<void> => {
    setNpcPool(next);
    try {
      await saveNpcChannelPool(next);
    } catch {
      /* toast 已由存储层弹出 */
    }
  }, []);

  const rememberNpcRule = useCallback(async (next: string): Promise<void> => {
    setNpcCustomRule(next);
    try {
      await saveNpcCustomRule(next);
    } catch {
      /* toast 已由存储层弹出 */
    }
  }, []);

  // 异步回调（AI 生成完才回来）要拿「此刻最新的一场」，不能用闭包里的旧对象
  const liveSessionsRef = useRef<LiveStreamSession[]>([]);
  useEffect(() => {
    liveSessionsRef.current = liveSessions;
  }, [liveSessions]);

  // 启动：先把 localStorage 里的旧数据搬进 IndexedDB（只跑一次），再真正加载。
  // 没加载完不能先用空数组渲染，那样会闪一下「还没有直播」。
  useEffect(() => {
    if (!currentChar) return;
    let cancelled = false;

    void (async () => {
      try {
        const report = await migrateLiveStorageToIdbOnce();
        if (report.status === 'failed') {
          addToast('直播数据迁移没完成，旧数据还保留着，下次打开再试', 'error');
        }
        if (report.warnings.length > 0) {
          console.warn('[LiveStream 迁移]', report.warnings.join('；'));
        }
      } catch (e) {
        console.warn('[LiveStream 迁移] 未预期错误', e);
      }
      if (cancelled) return;

      try {
        const [charChs, personas, sessions, vods, npcList, pool, rule] = await Promise.all([
          ensureDefaultChannelForChar(currentChar),
          loadViewerPersonas(userProfile),
          loadLiveSessions(),
          loadVodPosts(),
          loadNpcWatchSessions(),
          loadNpcChannelPool(),
          loadNpcCustomRule(),
        ]);
        if (cancelled) return;
        setChannels(charChs);
        setSelectedChannelId(prev => (charChs.some(c => c.id === prev) ? prev : charChs[0]?.id || ''));
        setViewerPersonas(personas);
        setLiveSessions(sessions);
        setVodPosts(vods);
        setNpcSessions(npcList);
        setNpcPool(pool);
        setNpcCustomRule(rule);
      } catch (e: any) {
        addToast(e?.message || '直播数据读取失败，请刷新重试', 'error');
      } finally {
        if (!cancelled) setStoreReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentChar?.id]);

  // 本地存储写不进去时立刻说一声：以前是静默丢弃，刷新后才发现整场没了
  useEffect(() => {
    setLiveStorageWriteErrorHandler((key, err) => {
      const label = key.includes('npc_watches')
        ? '陪看记录'
        : key.includes('sessions')
        ? '直播记录'
        : key.includes('vods')
        ? '视频投稿'
        : key.includes('channels')
        ? '频道设置'
        : '直播数据';
      const reason = (err as any)?.name || (err as any)?.message || '未知错误';
      addToast(`${label}没存进本地数据库（原因：${reason}），刚才的内容刷新后会丢，请截图反馈`, 'error');
    });
    return () => setLiveStorageWriteErrorHandler(null);
  }, [addToast]);

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
      if (ttsLoadingBeatId === id) return;

      if (!options?.skipCache && options?.cachedUrl) {
        const cachedOk = await playVoiceUrl(options.cachedUrl, id);
        if (cachedOk) return;
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
        const played = await playVoiceUrl(audioUrl, id);
        if (!played) {
          addToast('这句声音没播出来。再点一次「听这句」，或到「这一段的操作」里重新合成。', 'error');
        }
      } catch (err: any) {
        setTtsLoadingBeatId(null);
        setTtsPlayingBeatId(null);
        addToast(err?.message || '语音合成失败，请检查设置里的语音', 'error');
      }
    },
    [currentChar, activeChannel, apiConfig, ttsPlayingBeatId, ttsLoadingBeatId, addToast, playVoiceUrl, stopVoiceAudio],
  );

  // ==================== 1. Char 直播间核心流程 ====================

  // ==================== 电波实时背景：总开关 + 分类开关 ====================

  /**
   * 只过滤这一次请求用的实时配置。
   * 系统总开关关掉、取不到配置时直接返回 undefined（一个实时块都不要）；
   * 分类开关只关电波这一侧，不动系统「实时感知」设置。
   */
  const resolveOnAirRealtimeConfig = useCallback((): RealtimeConfig => {
    const base = realtimeConfig || defaultRealtimeConfig;
    // 系统那边关着的类别，电波开关不能把它打开；总开关关掉时一个类别都不请求
    const allowed = onAirRealtime.enabled;
    return {
      ...base,
      weatherEnabled: Boolean(base.weatherEnabled) && allowed && onAirRealtime.weather,
      newsEnabled: Boolean(base.newsEnabled) && allowed && onAirRealtime.news,
      jpHotEnabled: Boolean(base.jpHotEnabled) && allowed && onAirRealtime.jpHot,
    };
  }, [onAirRealtime, realtimeConfig]);

  // ==================== 逐轮压缩：四轮一压，每次只压最早一轮 ====================

  /** 同一时间只跑一趟压缩；这一趟会一直做到「最新 3 轮以外都压完」 */
  const summarizeRunningRef = useRef(false);

  /** 这一轮的内容指纹：压缩请求发出后如果又被重 Roll / 编辑，晚到的旧结果不许覆盖 */
  const roundSignature = liveRoundSignature;

  const summarizeOneRound = async (
    session: LiveStreamSession,
    target: LiveChunk,
    channel: StreamerChannelProfile,
  ): Promise<boolean> => {
    if (!currentChar) return false;
    const signature = roundSignature(target);
    try {
      const summary = await generateLiveRoundSummary({
        apiConfig,
        char: currentChar,
        channel,
        session,
        chunk: target,
      });
      // 拿最新的场次再写：请求期间可能有新轮、重 Roll 或编辑
      const latest = liveSessionsRef.current.find(s => s.id === session.id) || session;
      const latestChunk = latest.chunks.find(c => c.id === target.id);
      if (!latestChunk || roundSignature(latestChunk) !== signature) return false;

      const nextSession = applyRoundSummary(latest, latestChunk.id, summary);
      const saved = await rememberLiveSession(nextSession);
      if (!saved) {
        addToast('这一轮摘要没能存进本地数据库，原文还在', 'error');
        return false;
      }
      const summarizedChunk = nextSession.chunks.find(c => c.id === target.id)!;
      if (summarizedChunk.dbMessageId) {
        try {
          const updated = await updateLiveRoundCardSummary({
            messageId: summarizedChunk.dbMessageId,
            charId: currentChar.id,
            charName: currentChar.name,
            channel,
            session: nextSession,
            chunk: summarizedChunk,
            summary,
          });
          if (!updated) {
            // 用户自己把这张卡删了：不重建，摘要只留在直播记录里
            addToast('这一轮的聊天卡片已经被删掉，摘要只留在直播记录里', 'info');
          }
        } catch (e: any) {
          addToast(`这一轮的聊天卡片没更新上（${e?.name || '未知错误'}）`, 'error');
        }
      }
      return true;
    } catch {
      addToast(`第 ${target.index + 1} 轮压缩失败，原文还在，可以手动重试`, 'error');
      return false;
    }
  };

  /** 每次推进后调一次：未压缩满 4 轮就压最早一轮，直到只剩最新 3 轮原文 */
  const runCompressionPass = async (sessionId: string) => {
    if (summarizeRunningRef.current) return; // 正在跑的那一趟会自己接着往下压
    summarizeRunningRef.current = true;
    setIsSummarizing(true);
    try {
      for (;;) {
        const session = liveSessionsRef.current.find(s => s.id === sessionId);
        if (!session) break;
        // 第 4 轮触发第 1 轮；此后每加一轮只压一轮，最新 3 轮永远保留原文
        const target = pickRoundToFold(session.chunks, 3);
        if (!target) break;
        const channel = channels.find(c => c.id === session.channelId) || activeChannel;
        if (!channel) break;
        const ok = await summarizeOneRound(session, target, channel);
        if (!ok) break; // 失败就停：交给用户手动重试，不在后台空转
      }
    } finally {
      summarizeRunningRef.current = false;
      setIsSummarizing(false);
    }
  };

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

      // 正常聊天范围：服从角色自己的自适应/手动上下文设置，不另设条数或时间上限。
      // 本场自己的轮次卡不重复贴——本轮前情由 session.chunks 提供。
      const contextMsgs = (await loadCharacterContextMessages(currentChar)).filter(
        m => !(m.metadata?.source === 'live_round' && m.metadata?.liveSessionId === session.id),
      );
      // 「时间/节日」分类关掉时，只对这一次请求关掉时间感知，不改角色设置
      const charForPrompt =
        onAirRealtime.enabled && !onAirRealtime.time
          ? { ...currentChar, timeAwarenessEnabled: false }
          : currentChar;

      const messages = await buildLiveStreamTurnPrompt({
        char: charForPrompt,
        userProfile,
        channel,
        session: sessionForPrompt,
        pendingUserInputs: queuedInputs,
        historyMessages: contextMsgs,
        realtimeConfig: resolveOnAirRealtimeConfig(),
        includeUserLocation: onAirRealtime.enabled && onAirRealtime.location,
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

      // 旧场次可能没有这两个字段（重建的场次、老数据），给个保底值再累加
      let peak = session.peakViewerCount ?? session.viewerCount;
      let currViewers = session.viewerCount;
      let scTotal = session.totalScRevenue ?? 0;
      queuedInputs.forEach(inp => {
        if (inp.scAmount && inp.scAmount > 0) scTotal += inp.scAmount;
        if (inp.gift && inp.gift.price > 0) scTotal += inp.gift.price;
      });
      currViewers = Math.max(50, currViewers + Math.floor(Math.random() * 140) - 35);
      if (currViewers > peak) peak = currViewers;

      const existingChunk = options?.replaceChunkId
        ? session.chunks.find(c => c.id === options.replaceChunkId)
        : undefined;

      // 这一轮在聊天里的那张卡：新建，或原位更新重 Roll 前的那张。
      // 卡写失败只丢时间线上的这一条，这一轮本身照样存进直播库，不连累整轮。
      let dbMsgId: number | undefined;
      try {
        dbMsgId = await syncLiveChunkToDb({
          charId: currentChar.id,
          charName: currentChar.name,
          channel,
          session,
          chunkIndex: targetChunkIndex,
          beats,
          existingDbMsgId: existingChunk?.dbMessageId,
        });
      } catch (e: any) {
        addToast(`这一轮没能写进聊天时间线（${e?.name || '未知错误'}），直播记录还在`, 'error');
      }

      const newChunk: LiveChunk = {
        id: existingChunk?.id || `chunk_${session.id}_${targetChunkIndex}_${Date.now()}`,
        index: targetChunkIndex,
        beats,
        // 用户投递的弹幕已经作为 danmaku 落在拍里，这里按类型要求留空数组（以前是 undefined）
        userInputs: [],
        dbMessageId: dbMsgId,
        createdAt: Date.now(),
      };

      const nextChunks = options?.replaceChunkId
        ? session.chunks.map(c => (c.id === options.replaceChunkId ? newChunk : c))
        : [...session.chunks, newChunk];

      const updatedSession: LiveStreamSession = {
        ...session,
        chunks: nextChunks,
        viewerCount: currViewers,
        peakViewerCount: peak,
        totalScRevenue: scTotal,
      };

      setPendingUserInputs([]);
      await rememberLiveSession(updatedSession);

      // 重 Roll 会把这轮的旧摘要清掉（内容变了），统一交给压缩那一趟重新判断；
      // 不 await：压缩不该拖慢「推进」。
      void runCompressionPass(updatedSession.id);
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
      likeCount: 0,
      totalScRevenue: 0,
      // 不再把频道背景整张复制进这场（以前就是这样把 localStorage 写满的）；
      // 直播间显示时会自动退回用频道背景，只有这场单独换过才填
      customBackgroundUrl: '',
      sessionGifts: activeChannel.customGifts || [],
      chunks: [],
      rollingSummaries: [],
      pendingDanmakuQueue: [],
      foldEveryNChunks: 4,
      foldKeepRecentChunks: 3,
      startedAt: Date.now(),
    };

    // 必须确认这场真的写进本地了才进直播间，否则刷新一下就没了
    const saved = await rememberLiveSession(newSession);
    if (!saved) {
      // 没写进去就别在列表里留一张点开就消失的卡片
      setLiveSessions(prev => prev.filter(s => s.id !== newSession.id));
      return;
    }
    setActiveLiveSessionId(newSession.id);
    setPendingUserInputs([]);

    // 后台用辅助模型动态生成本场专属礼物
    void generateStreamCustomGifts({
      apiConfig,
      char: currentChar,
      channel: activeChannel,
      streamTitle: title,
    }).then(gifts => {
      if (!gifts || gifts.length === 0) return;
      const latest =
        liveSessionsRef.current.find(s => s.id === newSession.id) || newSession;
      void rememberLiveSession({ ...latest, sessionGifts: gifts });
    });

    await runGenerateLiveChunk(newSession, activeChannel, []);
  };

  /** 手动重试：只压最早一轮，绝不把几轮合并成一段 */
  const handleManualFoldChunks = () => {
    if (!activeLiveSession) return;
    const channel = activeChannel;
    if (!channel) return;
    const target = pickRoundToFold(activeLiveSession.chunks, 3);
    if (!target) {
      addToast('现在不足 4 轮未压缩，先保留最近 3 轮原文', 'info');
      return;
    }
    if (summarizeRunningRef.current) return;
    summarizeRunningRef.current = true;
    setIsSummarizing(true);
    void summarizeOneRound(activeLiveSession, target, channel).finally(() => {
      summarizeRunningRef.current = false;
      setIsSummarizing(false);
      // 压完一轮如果还超，继续按顺序补压，直到只剩 3 轮原文
      void runCompressionPass(activeLiveSession.id);
    });
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
      void rememberLiveSession(updatedSession);
      // 这一轮还没压缩时，把刚发的弹幕也补进它那张卡；压过的轮次卡正文是摘要，不重写
      const target = nextChunks[lastChunkIdx];
      if (target && !(target.roundSummary && target.roundSummary.trim()) && currentChar) {
        void syncLiveChunkToDb({
          charId: currentChar.id,
          charName: currentChar.name,
          channel: activeChannel,
          session: updatedSession,
          chunkIndex: target.index,
          beats: target.beats,
          existingDbMsgId: target.dbMessageId,
        }).catch(() => {
          /* 卡没更新上不影响弹幕本身，下一次推进还会重写这一轮 */
        });
      }
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

    let dbId = targetChunk.dbMessageId;
    try {
      dbId = await syncLiveChunkToDb({
        charId: currentChar.id,
        channel: activeChannel,
        session: activeLiveSession,
        chunkIndex: targetChunk.index,
        beats: nextBeats,
        existingDbMsgId: targetChunk.dbMessageId,
      });
    } catch (e: any) {
      // 记忆那一步失败了不能连累场次保存：下面照样把分镜存进直播库，再单独说一声
      addToast(`台词已改，但同步进记忆失败（${e?.name || '未知错误'}）`, 'error');
    }

    const nextSession: LiveStreamSession = {
      ...activeLiveSession,
      chunks: activeLiveSession.chunks.map(c =>
        c.id === chunkId ? { ...c, beats: nextBeats, dbMessageId: dbId } : c,
      ),
    };
    const beatSaved = await rememberLiveSession(nextSession);
    if (beatSaved) addToast('分镜与台词已保存并同步到记忆', 'success');
    else addToast('分镜已更新，但没能存进本地数据库', 'error');
  };

  // 下播：只改状态和结束时间，不生成整场总结、不发下播卡
  const handleEndStream = async () => {
    if (!activeLiveSession) return;
    const ended: LiveStreamSession = {
      ...activeLiveSession,
      status: 'ended',
      endedAt: Date.now(),
    };
    const saved = await rememberLiveSession(ended);
    setActiveLiveSessionId(null);
    addToast(
      saved ? '已下播，本场记录留着，随时能回看' : '已下播，但结束状态没存进本地数据库，请截图反馈',
      saved ? 'success' : 'error',
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

      await rememberVodPost(vod);
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
    await rememberNpcSession(newSession);
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
      // 角色这一侧用正常聊天范围 + 记忆召回；第三方主播那一侧只拿公开材料
      const contextMsgs = await loadCharacterContextMessages(currentChar);
      const rtConfig = resolveOnAirRealtimeConfig();
      let publicRealtimeText = '';
      if (onAirRealtime.enabled) {
        try {
          publicRealtimeText = await RealtimeContextManager.buildFullContext(
            rtConfig,
            resolveCharTimeZone(currentChar),
            {
              includeTime: onAirRealtime.time && currentChar.timeAwarenessEnabled !== false,
              includeJp: Boolean(rtConfig.jpHotEnabled),
            },
          );
        } catch {
          publicRealtimeText = '';
        }
      }

      const beat = await generateNpcWatchBeatDualEngine({
        apiConfig,
        char: currentChar,
        userProfile,
        npcSession: sess,
        userInteractionText: userText,
        interactionType: mode,
        charHistoryMessages: contextMsgs,
        realtimeConfig: rtConfig,
        publicRealtimeText,
      });

      // 每一拍在聊天时间线上有一张可见卡，按发生顺序落位
      beat.dbMessageId = await syncNpcBeatToDb({
        charId: currentChar.id,
        charName: currentChar.name,
        session: sess,
        beat,
      });

      const updated: NpcWatchSession = {
        ...sess,
        beats: [...sess.beats, beat],
      };
      await rememberNpcSession(updated);
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
          voiceEnd={voiceEnd}
          onBindBack={fn => {
            screenBackRef.current = fn;
          }}
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
                void rememberLiveSession({ ...activeLiveSession, chunks: nextChunks });
              },
            })
          }
          onSendUserDanmaku={handleSendUserDanmaku}
          onUpdateCustomBackground={url => {
            void rememberLiveSession({ ...activeLiveSession, customBackgroundUrl: url });
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
              void rememberLiveSession({ ...activeLiveSession, sessionGifts: gifts });
              addToast('专属礼物已刷新！', 'success');
            });
          }}
          onManualFoldChunks={() => handleManualFoldChunks()}
          onEditRoundSummary={(chunkId, nextText) => {
            const target = activeLiveSession.chunks.find(c => c.id === chunkId);
            if (!target) return;
            const trimmed = nextText.trim();
            const nextChunk: LiveChunk = {
              ...target,
              roundSummary: trimmed || undefined,
              summaryUpdatedAt: Date.now(),
            };
            const nextSession: LiveStreamSession = {
              ...activeLiveSession,
              chunks: activeLiveSession.chunks.map(c => (c.id === chunkId ? nextChunk : c)),
            };
            void rememberLiveSession(nextSession);
            // 手改摘要也要回到同一张原卡上；卡被删了就不重建
            if (nextChunk.dbMessageId) {
              void updateLiveRoundCardSummary({
                messageId: nextChunk.dbMessageId,
                charId: currentChar.id,
                charName: currentChar.name,
                channel: activeChannel,
                session: nextSession,
                chunk: nextChunk,
                summary: trimmed,
              }).catch(() => addToast('这一轮的聊天卡片没更新上', 'error'));
            }
          }}
          onRegenerateRoundSummary={chunk => {
            if (summarizeRunningRef.current) return;
            summarizeRunningRef.current = true;
            setIsSummarizing(true);
            void summarizeOneRound(activeLiveSession, chunk, activeChannel).finally(() => {
              summarizeRunningRef.current = false;
              setIsSummarizing(false);
            });
          }}
          onEndStreamClick={() => void handleEndStream()}
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
            void rememberChannel(ch);
            setSelectedChannelId(ch.id);
          }}
          onDelete={id => {
            void forgetChannel(id);
            const rest = channels.filter(c => c.charId === currentChar.id && c.id !== id);
            setSelectedChannelId(rest[0]?.id || '');
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
            void rememberPersonas(next);
          }}
          onClose={() => setShowPersonaModal(false)}
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
          onBindBack={fn => {
            screenBackRef.current = fn;
          }}
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
                void rememberVodPost({ ...activeVod, chapters: nextChapters });
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
            void rememberVodPost({ ...activeVod, chapters: nextChapters });
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
            void rememberVodPost(updated);
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
              void rememberVodPost(updated);
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
            void rememberPersonas(next);
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
        onBindBack={fn => {
          screenBackRef.current = fn;
        }}
        onChangePlatformTheme={handleChangePlatformTheme}
        onBack={() => setActiveNpcSessionId(null)}
        onAdvanceBeat={(text, mode) =>
          void handleAdvanceNpcBeat(activeNpcSession, text, mode)
        }
        onRerollCharReaction={async beat => {
          setNpcRerollingBeatId(beat.id);
          try {
            // 和首拍一样走正常聊天范围，不在陪看这一侧另砍一刀
            const charHistory = await loadCharacterContextMessages(currentChar);
            const res = await rerollCharNpcReactionOnly({
              apiConfig,
              char: currentChar,
              userProfile,
              npcSession: activeNpcSession,
              beat,
              charHistoryMessages: charHistory,
              realtimeConfig: resolveOnAirRealtimeConfig(),
            });
            const nextBeat = {
              ...beat,
              charReactionAction: res.charReactionAction,
              charReactionSpeech: res.charReactionSpeech,
              charEmotion: res.charEmotion,
            };
            const updated: NpcWatchSession = {
              ...activeNpcSession,
              beats: activeNpcSession.beats.map(b => (b.id === beat.id ? nextBeat : b)),
            };
            void rememberNpcSession(updated);
            // 这一拍在聊天里还是原来那张卡：原位更新，不另发一张
            void syncNpcBeatToDb({
              charId: currentChar.id,
              charName: currentChar.name,
              session: updated,
              beat: nextBeat,
              existingDbMsgId: beat.dbMessageId,
            }).catch(() => addToast('这一拍的聊天卡片没更新上', 'error'));
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
              void rememberNpcSession(updated);
            },
          })
        }
        onShareNpcWatchToChat={async () => {
          // 陪看每一拍从这一版起本来就会自己落一张卡在聊天里，
          // 再写一次就是同一拍两条记录，所以这里只提醒、不重复写。
          addToast('这一拍已经自己进私聊了，往上翻就能看到', 'info');
        }}
      />
    );
  }

  // 数据还在 IndexedDB 里往外取的时候，先别摆一个「还没有直播」的空大厅
  if (!storeReady) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: platformTheme === 'niconico' ? '#1b1b1b' : '#f8f9fb',
          color: platformTheme === 'niconico' ? 'rgba(255,255,255,0.72)' : '#6b7280',
          fontSize: 14,
          letterSpacing: '0.06em',
        }}
      >
        正在读取直播数据…
      </div>
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
        onBindBack={fn => {
          screenBackRef.current = fn;
        }}
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
        onDeleteLive={id => void forgetLiveSession(id)}
        vodPosts={charVods}
        onOpenVod={setActiveVodId}
        onDeleteVod={id => void forgetVodPost(id)}
        npcPool={npcPool}
        npcSessions={charNpcSessions}
        onStartNpc={card => void handleStartNpcWatch(card)}
        onOpenNpcSession={setActiveNpcSessionId}
        npcCustomRule={npcCustomRule}
        onChangeNpcRule={value => {
          void rememberNpcRule(value);
        }}
        onAiNpcRule={() => {
          void handleRequestAiField('npc_custom_rule').then(res => {
            if (res.rule) {
              void rememberNpcRule(res.rule);
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
              void rememberNpcPool(nextPool);
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
        onAirRealtime={onAirRealtime}
        onChangeOnAirRealtime={next => void updateOnAirRealtime(next)}
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
                void rememberChannel(ch);
                setSelectedChannelId(ch.id);
              }}
              onDelete={id => {
                void forgetChannel(id);
                const rest = channels.filter(c => c.charId === currentChar.id && c.id !== id);
                setSelectedChannelId(rest[0]?.id || '');
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
              void rememberPersonas(next);
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
          onClose={() => setShowLobbyPhone(false)}
        />
      )}
    </>
  );
};

export default LiveStreamApp;
