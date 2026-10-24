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
import { readCachedSpeechUrl, synthesizeSpeechDetailed } from '../utils/ttsRouter';
import { resolveTtsProvider } from '../utils/ttsProvider';
import { isSecondaryLlmReady } from '../utils/secondaryLlmApi';
import { secondaryLlmCall } from '../utils/secondaryLlmCall';
import { resolveVoiceActingGuideFromApiConfig } from '../utils/voiceMessagePrompt';
import { fishTimestampCacheKey, resolveFishCallRefs, synthesizeFishWithTimestamp } from '../utils/fishTimestampTts';
import { getCachedTts, saveCachedTts } from '../utils/ttsCache';
import { chooseLiveReplaySource, liveVoiceTapAction, mergeBeatAudio, type StoredPlay } from '../utils/liveReplayAudio';
import {
  acceptRepairedTranslation,
  alignLiveSpeech,
  buildLiveTranslationRepairPrompt,
  stripPerformanceMarkup,
} from '../utils/liveSpeechPairs';
import type { SpeechTimeline } from '../utils/callSpeechTimeline';
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
  LiveVoiceClock,
  STREAM_PRESET_TEMPLATES,
  settleLiveViewerCount,
} from '../utils/liveStreamTypes';
import {
  loadPlatformTheme,
  savePlatformTheme,
  ensureDefaultChannelForChar,
  upsertChannel,
  deleteChannelById,
  loadViewerPersonas,
  saveViewerPersonas,
  loadActiveViewerPersonaId,
  saveActiveViewerPersonaId,
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
  buildLiveRoundCard,
  syncLiveChunkToDb,
  syncNpcBeatToDb,
  updateLiveRoundCardSummary,
  createLiveSessionMarkerInDb,
  updateLiveSessionMarkerInDb,
  setLiveStorageWriteErrorHandler,
  loadOnAirRealtimeSettings,
  saveOnAirRealtimeSettings,
  liveRoundSignature,
  pickRoundToFold,
  applyRoundSummary,
  restoreMissingRoundSummaries,
  loadLiveSpeechPerformEnabled,
  saveLiveBeatVoiceAsset,
  loadLiveBeatVoiceAsset,
  forgetLiveBeatVoices,
} from '../utils/liveStreamStorage';
import {
  buildLiveStreamTurnPrompt,
  parseLiveBeatsResponse,
  callMainStreamerLlm,
  callAuxOrMainLlm,
  generateLiveRoundSummary,
  generateVodVideoPost,
  generateStreamerVodReply,
  generateNpcWatchBeatDualEngine,
  rerollCharNpcReactionOnly,
  generateAiFieldSuggestion,
  generateStreamCustomGifts,
  generateLiveCategorySuggestions,
  generateNpcChannelPoolWithAi,
  AiFieldKind,
} from '../utils/liveStreamPrompts';
import type { LiveCategorySuggestion } from '../utils/liveStreamAiHelpers';
import {
  ChannelEditorModal,
  ViewerPersonaModal,
  LiveSessionInfoModal,
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
import {
  appendLiveDanmakuToBeat,
  truncateLiveChunkAfterBeat,
} from '../utils/liveStreamTimeline';

type MainTab = 'char_live' | 'char_vod' | 'npc_watch';

/** 旧场次回写时如果没带摘要，保留这边已经有的逐轮摘要 */
function mergeLiveSessionSummaries(
  prev: LiveStreamSession | undefined,
  next: LiveStreamSession,
): LiveStreamSession {
  if (!prev || prev.id !== next.id) return next;
  const prevById = new Map(prev.chunks.map(c => [c.id, c]));
  return {
    ...next,
    chunks: next.chunks.map(c => {
      const old = prevById.get(c.id);
      if (!old) return c;
      const nextHas = Boolean(c.roundSummary && c.roundSummary.trim());
      const oldHas = Boolean(old.roundSummary && old.roundSummary.trim());
      if (!nextHas && oldHas) {
        return {
          ...c,
          roundSummary: old.roundSummary,
          summaryUpdatedAt: old.summaryUpdatedAt,
        };
      }
      return c;
    }),
  };
}

const SILENT_UNLOCK_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

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
  // 自定义分区只作用于当前这场，不写进频道
  const [customCategoryName, setCustomCategoryName] = useState<string>('');
  const [customCategoryEn, setCustomCategoryEn] = useState<string>('');
  const [customCategoryHint, setCustomCategoryHint] = useState<string>('');
  const [customVodTitle, setCustomVodTitle] = useState<string>('');
  const [customVodCategory, setCustomVodCategory] = useState<string>('Vlog · 日常');

  // 弹窗状态
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<StreamerChannelProfile | null>(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [showLobbyPhone, setShowLobbyPhone] = useState(false);
  const [editingLiveSessionId, setEditingLiveSessionId] = useState<string | null>(null);

  // 生成与语音状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiHelperBusy, setAiHelperBusy] = useState(false);
  const [vodReplyGeneratingId, setVodReplyGeneratingId] = useState<string | null>(null);
  const [npcRerollingBeatId, setNpcRerollingBeatId] = useState<string | null>(null);
  const [ttsPlayingBeatId, setTtsPlayingBeatId] = useState<string | null>(null);
  const [ttsLoadingBeatId, setTtsLoadingBeatId] = useState<string | null>(null);
  const [voiceEnd, setVoiceEnd] = useState<{ id: string; n: number } | null>(null);
  const [voiceClock, setVoiceClock] = useState<LiveVoiceClock | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const voiceJobRef = useRef<{ id: string; token: object } | null>(null);
  const afterVoiceEndRef = useRef<((endedBeatId: string, endCount: number) => void) | null>(null);
  const voiceEndCountRef = useRef(0);
  const bindAfterVoiceEnd = useCallback((fn: ((endedBeatId: string, endCount: number) => void) | null) => {
    afterVoiceEndRef.current = fn;
  }, []);
  const screenBackRef = useRef<() => boolean>(() => false);

  const publishVoiceClock = useCallback((audio: HTMLAudioElement, id: string) => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    setVoiceClock(prev => {
      if (
        prev
        && prev.beatId === id
        && Math.abs(prev.currentTime - currentTime) < 0.05
        && Math.abs(prev.duration - duration) < 0.05
      ) return prev;
      return { beatId: id, currentTime, duration };
    });
  }, []);

  const stopVoiceAudio = useCallback(() => {
    playTokenRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.pause();
    }
    setVoiceClock(null);
  }, []);

  const playVoiceUrl = useCallback(
    async (url: string, id: string): Promise<StoredPlay> => {
      const token = ++playTokenRef.current;
      if (!url) return 'failed';
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.pause();
      audio.muted = false;
      const still = () => playTokenRef.current === token;
      const clearThis = () => {
        setTtsPlayingBeatId(prev => (prev === id ? null : prev));
        setVoiceClock(prev => (prev?.beatId === id ? null : prev));
      };
      audio.ontimeupdate = () => {
        if (!still()) return;
        publishVoiceClock(audio, id);
      };
      audio.onloadedmetadata = () => {
        if (!still()) return;
        publishVoiceClock(audio, id);
      };
      audio.onended = () => {
        if (!still()) return;
        clearThis();
        voiceEndCountRef.current += 1;
        const endCount = voiceEndCountRef.current;
        setVoiceEnd({ id, n: endCount });
        afterVoiceEndRef.current?.(id, endCount);
      };
      audio.onerror = () => {
        if (!still()) return;
        clearThis();
      };
      audio.src = url;
      setTtsPlayingBeatId(id);
      setVoiceClock({ beatId: id, currentTime: 0, duration: 0 });
      try {
        await audio.play();
        if (!still()) return 'superseded';
        return 'played';
      } catch (err) {
        if (!still()) return 'superseded';
        audio.onended = null;
        audio.onerror = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;
        clearThis();
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
        if (name === 'NotAllowedError') return 'blocked';
        return 'failed';
      }
    },
    [publishVoiceClock],
  );

  const seekVoiceSeconds = useCallback((nextSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const raw = Number.isFinite(nextSec) ? nextSec : 0;
    const clamped = duration > 0 ? Math.max(0, Math.min(duration, raw)) : Math.max(0, raw);
    try {
      audio.currentTime = clamped;
    } catch {
      return;
    }
    setVoiceClock(prev => (
      prev ? { ...prev, currentTime: audio.currentTime, duration: duration || prev.duration } : prev
    ));
  }, []);

  const nudgeVoiceSeconds = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(delta) || delta === 0) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const raw = (Number.isFinite(audio.currentTime) ? audio.currentTime : 0) + delta;
    const clamped = duration > 0 ? Math.max(0, Math.min(duration, raw)) : Math.max(0, raw);
    try {
      audio.currentTime = clamped;
    } catch {
      return;
    }
    setVoiceClock(prev => (
      prev ? { ...prev, currentTime: audio.currentTime, duration: duration || prev.duration } : prev
    ));
  }, []);

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
      id?: string;
      text: string;
      persona: ViewerPersona;
      scAmount?: number;
      scColor?: import('../utils/liveStreamTypes').LiveScColor | 'blue' | 'cyan' | 'amber' | 'magenta';
      gift?: StreamGiftOption;
      alreadyDisplayedInTimeline?: boolean;
    }>
  >([]);

  // ==================== 落库：先改界面，再等真正写进 IndexedDB ====================
  // 以前是把「写 localStorage 的结果」直接塞回 state，写失败静默丢，刷新才发现整场没了。
  // 现在写失败由存储层的 toast 说明，界面不回滚——内容还看得见，用户可以再操作一次。

  // 异步回调要拿「此刻最新的一场」。这个 ref 必须在 rememberLiveSession 之前建好。
  const liveSessionsRef = useRef<LiveStreamSession[]>([]);

  const rememberLiveSession = useCallback(async (session: LiveStreamSession): Promise<boolean> => {
    // 先按 ref 里的最新场次合并，再写界面和数据库。
    // 不能等 setState 回调：回调还没跑就把旧场次写进库，摘要会被盖成空的。
    const existing = liveSessionsRef.current.find(s => s.id === session.id);
    const toSave = mergeLiveSessionSummaries(existing, session);
    const next = existing
      ? liveSessionsRef.current.map(s => (s.id === session.id ? toSave : s))
      : [toSave, ...liveSessionsRef.current];
    liveSessionsRef.current = next;
    setLiveSessions(next);
    try {
      await upsertLiveSession(toSave);
      return true;
    } catch {
      return false;
    }
  }, []);

  const forgetLiveSession = useCallback(async (sessionId: string): Promise<void> => {
    // 删场次时把它每一拍存下来的录音一并清掉（不清就变成永远占地方的垃圾）
    const target = liveSessionsRef.current.find(s => s.id === sessionId);
    if (target) {
      void forgetLiveBeatVoices(target.chunks.flatMap(chunk => chunk.beats.map(beat => beat.id)));
    }
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
    if (!next.some(persona => persona.id === activePersonaId)) {
      const fallback = next.find(persona => persona.isMain)?.id || next[0]?.id || 'viewer_main_self';
      setActivePersonaId(fallback);
      try {
        await saveActiveViewerPersonaId(fallback, next);
      } catch {
        addToast('观众身份已回退为本尊，但没能保存这个选择', 'error');
      }
    }
  }, [activePersonaId, addToast]);

  const handleSelectViewerPersona = useCallback((personaId: string) => {
    const selected = viewerPersonas.some(persona => persona.id === personaId)
      ? personaId
      : viewerPersonas.find(persona => persona.isMain)?.id || viewerPersonas[0]?.id || 'viewer_main_self';
    // 记住最近一次用过的匿名马甲，下次点头像切匿名时回到它，而不是默认小号
    const picked = viewerPersonas.find(persona => persona.id === selected);
    if (picked && !picked.isMain) {
      try {
        localStorage.setItem('live_last_alt_persona_v1', selected);
      } catch {
        /* 忽略浏览器存储限制 */
      }
    }
    setActivePersonaId(selected);
    void saveActiveViewerPersonaId(selected, viewerPersonas).catch(() => {
      addToast('观众身份已切换，但没能保存这个选择', 'error');
    });
  }, [viewerPersonas, addToast]);

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

  // 渲染落定后把 state 抄进 ref。ref 里若已经有更新的摘要或更多轮次，不要用旧 state 盖掉。
  useEffect(() => {
    const refById = new Map(liveSessionsRef.current.map(s => [s.id, s]));
    liveSessionsRef.current = liveSessions.map(st => {
      const refS = refById.get(st.id);
      if (!refS) return st;
      const base = refS.chunks.length > st.chunks.length ? refS : st;
      const other = base === refS ? st : refS;
      return mergeLiveSessionSummaries(other, base);
    });
  }, [liveSessions]);

  const persistBeatAudioUrl = useCallback(
    async (
      sessionId: string,
      beatId: string,
      audioUrl: string,
      speechTimeline?: SpeechTimeline | null,
    ) => {
      const latest = liveSessionsRef.current.find(session => session.id === sessionId);
      if (!latest) return;
      const target = latest.chunks.flatMap(chunk => chunk.beats).find(beat => beat.id === beatId);
      if (!target) return;
      const updatedBeat = mergeBeatAudio(target, audioUrl, speechTimeline);
      if (updatedBeat === target) return;
      const next: LiveStreamSession = {
        ...latest,
        chunks: latest.chunks.map(chunk => ({
          ...chunk,
          beats: chunk.beats.map(beat => (beat.id === beatId ? updatedBeat : beat)),
        })),
      };
      // 先同步 ref，排队的下一句合成就能接着最新版本写，不会互相覆盖缓存地址。
      liveSessionsRef.current = liveSessionsRef.current.map(session =>
        session.id === sessionId ? next : session,
      );
      await rememberLiveSession(next);
    },
    [rememberLiveSession],
  );

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
        const savedPersonaId = await loadActiveViewerPersonaId(personas);
        if (cancelled) return;
        setActivePersonaId(savedPersonaId);
        const savedPersona = personas.find(persona => persona.id === savedPersonaId);
        if (savedPersona && !savedPersona.isMain) {
          try {
            localStorage.setItem('live_last_alt_persona_v1', savedPersona.id);
          } catch {
            /* 忽略浏览器存储限制 */
          }
        }
        const healedSessions = await Promise.all(
          sessions.map(session =>
            session.charId === currentChar.id
              ? restoreMissingRoundSummaries(session, currentChar.id)
              : session,
          ),
        );
        if (cancelled) return;
        setLiveSessions(healedSessions);
        liveSessionsRef.current = healedSessions;
        for (const session of healedSessions) {
          const before = sessions.find(item => item.id === session.id);
          if (!before) continue;
          const gained = session.chunks.some(
            (chunk, index) => chunk.roundSummary && !before.chunks[index]?.roundSummary,
          );
          if (gained) void upsertLiveSession(session);
        }
        // 旧版下播标记可能停在开播处或某一轮中间；修正到本场真实最后一轮之后，不动其他场次。
        void Promise.all(sessions
          .filter(session => session.status === 'ended' && session.endedAt && session.startMarkerMessageId)
          .map(async session => {
            const channel = charChs.find(item => item.id === session.channelId);
            if (!channel) return;
            await updateLiveSessionMarkerInDb({
              messageId: session.startMarkerMessageId,
              charId: session.charId,
              charName: currentChar.name,
              channel,
              session,
            });
          })
        ).catch(error => console.warn('[LiveStream] 下播标记位置修复失败', error));
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
  }, [stopVoiceAudio]);

  useEffect(() => {
    const unlock = () => {
      const playing = audioRef.current;
      if (playing && !playing.paused && playing.src && !playing.src.startsWith('data:')) return;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      const tokenAtUnlock = playTokenRef.current;
      audio.muted = true;
      audio.src = SILENT_UNLOCK_WAV;
      const pending = audio.play();
      if (!pending) return;
      pending.then(() => {
        if (playTokenRef.current !== tokenAtUnlock) return;
        audio.pause();
        audio.muted = false;
        window.removeEventListener('pointerdown', unlock, true);
      }).catch(() => {
        audio.muted = false;
      });
    };
    window.addEventListener('pointerdown', unlock, true);
    return () => window.removeEventListener('pointerdown', unlock, true);
  }, []);

  const activeLiveSession = useMemo(
    () => liveSessions.find(s => s.id === activeLiveSessionId) || null,
    [liveSessions, activeLiveSessionId],
  );

  // 私聊卡已是摘要、这场记录却空着时，从聊天卡把摘要补回摘要页
  const summaryHealKeyRef = useRef('');
  useEffect(() => {
    if (!activeLiveSession || !currentChar) return;
    if (!activeLiveSession.chunks.some(c => !(c.roundSummary && c.roundSummary.trim()))) return;
    const key = `${activeLiveSession.id}:${activeLiveSession.chunks
      .map(c => `${c.id}:${c.roundSummary ? 1 : 0}`)
      .join(',')}`;
    if (summaryHealKeyRef.current === key) return;
    summaryHealKeyRef.current = key;
    const sessionId = activeLiveSession.id;
    const charId = currentChar.id;
    void (async () => {
      const latest = liveSessionsRef.current.find(s => s.id === sessionId);
      if (!latest) return;
      const healed = await restoreMissingRoundSummaries(latest, charId);
      if (healed === latest) return;
      await rememberLiveSession(healed);
    })();
  }, [activeLiveSession, currentChar, rememberLiveSession]);

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
    extra?: {
      categoryLabel?: string;
      identityMode?: string;
      direction?: string;
    },
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
        direction: extra?.direction,
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

  // 分区推荐：一次给三个候选，方向可选；上一批用来提醒别重复
  const handleRecommendCategories = async (
    direction?: string,
    previous?: string,
  ): Promise<LiveCategorySuggestion[]> => {
    if (!currentChar) return [];
    try {
      const recentMsgs = await DB.getMessagesByCharId(currentChar.id);
      const list = await generateLiveCategorySuggestions({
        apiConfig,
        char: currentChar,
        userProfile,
        channel: activeChannel,
        recentMsgs,
        direction,
        previous,
      });
      if (!list.length) addToast('这次没想出新的分区，换个方向再点一次', 'info');
      return list;
    } catch (e: any) {
      addToast(e?.message || '分区没想出来，再点一次', 'error');
      return [];
    }
  };

  // ==================== TTS 语音合成与缓存（点击台词播放，长按菜单重试/下载） ====================

  const buildLiveVoiceChar = useCallback((channel?: StreamerChannelProfile) => {
    if (!currentChar) return null;
    const langOverride = channel?.voiceConfig?.language;
    const voiceIdOverride = channel?.voiceConfig?.overrideVoiceId;
    return {
      ...currentChar,
      voiceProfile: {
        ...(currentChar.voiceProfile || {}),
        ...(voiceIdOverride ? { voiceId: voiceIdOverride } : {}),
        ...(langOverride ? { languageBoost: langOverride } : {}),
      },
    };
  }, [currentChar]);

  const liveFishSpeed = (speed: number | undefined): number => (
    typeof speed === 'number' && speed > 0 ? speed : 0.9
  );

  /**
   * 同一段念稿的合成请求在飞时，别的地方（自动连播/预生成/手点）再要同一段就直接共用
   * 这一趟结果——电波里预生成和自动播会同时盯上同一拍，没有这一道闸会真的扣两次费
   * （Ann 2026-10-25 实测抓到过）。skipCache 的「重新合成」也共用在飞的那一趟：
   * 同一段字重合成一遍意义不大，钱省下来。
   */
  const liveSynthInflightRef = useRef<Map<string, Promise<{ url: string; timeline: SpeechTimeline | null }>>>(new Map());

  /**
   * 同一拍只做一次声音（Ann 2026-10-25 定的）：这一拍无论谁先发起合成，
   * 别处一律等那一趟或直接用它的结果，不再因为「文本不同」（原文 / 标注版）做第二遍。
   * 手动「重新合成语音」放行：那是 Ann 要重做，允许换新的一趟。
   */
  const voiceBeatJobsRef = useRef<Map<string, Promise<{ url: string; timeline: SpeechTimeline | null }>>>(new Map());

  /** 从本机资料库取出来播放时现生成的地址；同一拍再取就先把上一个放掉，别堆垃圾 */
  const beatAssetUrlsRef = useRef<Map<string, string>>(new Map());

  const synthesizeLiveBeatAudio = useCallback(
    async (
      text: string,
      channel: StreamerChannelProfile | undefined,
      skipCache?: boolean,
      /** 哪一拍的录音；传了就受「同一拍只做一次」约束 */
      beatId?: string,
    ): Promise<{ url: string; timeline: SpeechTimeline | null }> => {
      const tempChar = buildLiveVoiceChar(channel);
      if (!tempChar) throw new Error('没有角色');
      if (beatId && !skipCache) {
        const runningForBeat = voiceBeatJobsRef.current.get(beatId);
        if (runningForBeat) return runningForBeat;
      }
      const synthKey = [
        resolveTtsProvider(apiConfig),
        tempChar.id,
        channel?.voiceConfig?.overrideVoiceId || '',
        text,
      ].join('|');
      const running = liveSynthInflightRef.current.get(synthKey);
      if (running) return running;
      const job = (async (): Promise<{ url: string; timeline: SpeechTimeline | null }> => {
        if (resolveTtsProvider(apiConfig) === 'fishaudio') {
          const refs = resolveFishCallRefs(apiConfig, tempChar);
          if (refs.proxy && refs.apiKey && refs.referenceId) {
            const speed = liveFishSpeed(tempChar.voiceProfile?.speed);
            const stamped = await synthesizeFishWithTimestamp({
              text,
              referenceId: refs.referenceId,
              apiKey: refs.apiKey,
              model: refs.model,
              proxyBase: refs.proxy,
              speed,
            });
            if (stamped?.url && stamped.timeline?.segments?.length) {
              if (!skipCache && stamped.blob) {
                const key = fishTimestampCacheKey({
                  text,
                  referenceId: refs.referenceId,
                  model: refs.model,
                  speed,
                });
                if (key) saveCachedTts(key, stamped.blob).catch(() => { /* 缓存失败仍可先播这一次 */ });
              }
              // 录音本体存进本机资料库（照聊天同款）：刷新、关浏览器后还能取回来播
              if (beatId && stamped.blob) {
                void saveLiveBeatVoiceAsset(beatId, stamped.blob, stamped.timeline);
              }
              return { url: stamped.url, timeline: stamped.timeline };
            }
          }
        }
        const { url, blob } = await synthesizeSpeechDetailed(text, tempChar, apiConfig, { skipCache });
        if (beatId && blob) {
          void saveLiveBeatVoiceAsset(beatId, blob, null);
        }
        return { url, timeline: null };
      })();
      liveSynthInflightRef.current.set(synthKey, job);
      if (beatId) voiceBeatJobsRef.current.set(beatId, job);
      try {
        return await job;
      } finally {
        if (liveSynthInflightRef.current.get(synthKey) === job) {
          liveSynthInflightRef.current.delete(synthKey);
        }
        if (beatId && voiceBeatJobsRef.current.get(beatId) === job) {
          voiceBeatJobsRef.current.delete(beatId);
        }
      }
    },
    [apiConfig, buildLiveVoiceChar],
  );

  const readLiveTimestampCache = useCallback(async (text: string, channel?: StreamerChannelProfile) => {
    const tempChar = buildLiveVoiceChar(channel);
    if (!tempChar || resolveTtsProvider(apiConfig) !== 'fishaudio') return null;
    const refs = resolveFishCallRefs(apiConfig, tempChar);
    if (!refs.referenceId) return null;
    const key = fishTimestampCacheKey({
      text,
      referenceId: refs.referenceId,
      model: refs.model,
      speed: liveFishSpeed(tempChar.voiceProfile?.speed),
    });
    if (!key) return null;
    const blob = await getCachedTts(key);
    return blob ? URL.createObjectURL(blob) : null;
  }, [apiConfig, buildLiveVoiceChar]);

  const speakTextWithChannelConfig = useCallback(
    async (
      id: string,
      text: string,
      overrideChannel?: StreamerChannelProfile,
      options?: {
        skipCache?: boolean;
        fromAuto?: boolean;
        cachedUrl?: string;
        onAudioUrlReady?: (url: string, timeline?: SpeechTimeline | null) => void;
      },
    ) => {
      if (!currentChar || !text.trim()) return;
      const tap = liveVoiceTapAction({
        fromAuto: Boolean(options?.fromAuto),
        sameBeatPlaying: ttsPlayingBeatId === id && !options?.skipCache,
        sameBeatBusy: (ttsLoadingBeatId === id || voiceJobRef.current?.id === id) && !options?.skipCache,
      });
      if (tap === 'stop') {
        stopVoiceAudio();
        setTtsPlayingBeatId(null);
        if (voiceJobRef.current?.id === id) voiceJobRef.current = null;
        return;
      }
      if (tap === 'ignore') return;
      const token = {};
      voiceJobRef.current = { id, token };
      const stillThisJob = () => voiceJobRef.current?.token === token;
      try {
        const ch = overrideChannel || activeChannel;
        const tempChar = buildLiveVoiceChar(ch);
        if (!tempChar) return;

        // 这一拍的最新状态 + 等待后台标注（Ann 定的：自动读和手点台词走同一套等待机制）
        const findLatestBeat = () =>
          liveSessionsRef.current
            .flatMap(session => session.chunks)
            .flatMap(chunk => chunk.beats)
            .find(item => item.id === id);
        let latestBeat = findLatestBeat();
        if (loadLiveSpeechPerformEnabled() && latestBeat && !latestBeat.speechPerform) {
          const pendingPerform = performJobsRef.current.get(id);
          if (pendingPerform) {
            // 等的是在飞的那趟标注（不重发）；失败也会放行，回落干净原文
            await pendingPerform;
            if (!stillThisJob()) return;
            latestBeat = findLatestBeat();
          }
        }
        // 合成用念稿版（后台标注刚落地也算数）；没有标注回落干净原文
        let synthText = ((latestBeat?.speechPerform || latestBeat?.speechOriginal || text) || '').trim() || text;
        // 「重新合成语音」且这一拍还没有标注：先补一趟标注再合成（Ann 2026-10-25 定的）
        if (options?.skipCache && loadLiveSpeechPerformEnabled() && latestBeat && !latestBeat.speechPerform) {
          const freshPerform = await annotateSingleBeatForVoice(latestBeat, ch);
          if (!stillThisJob()) return;
          if (freshPerform) {
            // 存库后从最新场次再取一次念稿（万一同场别的拍也更新了）
            latestBeat = findLatestBeat();
            synthText = ((latestBeat?.speechPerform || freshPerform) || '').trim() || freshPerform;
          }
        }

        let storedPlay: StoredPlay = 'none';
        if (!options?.skipCache && options?.cachedUrl) {
          storedPlay = await playVoiceUrl(options.cachedUrl, id);
          if (!stillThisJob()) return;
        }

        // 这一拍存下来的录音本体（本机资料库，照聊天同款）：刷新、关浏览器后照样取回来播。
        // 老数据没有这一层 → 返回 null，继续走下面的老路子，不影响旧语音播放。
        let assetUrl: string | null = null;
        if (!options?.skipCache && storedPlay !== 'played' && storedPlay !== 'blocked' && storedPlay !== 'superseded') {
          const storedVoice = await loadLiveBeatVoiceAsset(id);
          if (!stillThisJob()) return;
          if (storedVoice?.blob) {
            const previous = beatAssetUrlsRef.current.get(id);
            if (previous) {
              try { URL.revokeObjectURL(previous); } catch { /* ignore */ }
            }
            assetUrl = URL.createObjectURL(storedVoice.blob);
            beatAssetUrlsRef.current.set(id, assetUrl);
          }
        }

        let timestampUrl: string | null = null;
        let speechUrl: string | null = null;
        if (
          !options?.skipCache
          && storedPlay !== 'played' && storedPlay !== 'blocked' && storedPlay !== 'superseded'
          && !assetUrl
        ) {
          timestampUrl = await readLiveTimestampCache(synthText, ch);
          if (!stillThisJob()) return;
          speechUrl = await readCachedSpeechUrl(synthText, tempChar, apiConfig);
          if (!stillThisJob()) return;
        }

        let source = chooseLiveReplaySource({
          skipCache: Boolean(options?.skipCache),
          storedPlay,
          timestampCacheHit: Boolean(timestampUrl),
          speechCacheHit: Boolean(speechUrl),
        });
        if (source === 'stored' || source === 'blocked') return;

        const playSaved = async (url: string, timeline: SpeechTimeline | null | undefined) => {
          options?.onAudioUrlReady?.(url, timeline);
          return playVoiceUrl(url, id);
        };
        // 本机资料库里存着这一拍的录音：直接播它（刷新/关浏览器后也在这条路上）
        if (assetUrl) {
          const played = await playSaved(assetUrl, undefined);
          if (!stillThisJob() || played === 'played' || played === 'blocked' || played === 'superseded') return;
        }
        if (source === 'timestamp-cache' && timestampUrl) {
          const played = await playSaved(timestampUrl, undefined);
          if (!stillThisJob() || played === 'played' || played === 'blocked' || played === 'superseded') return;
          source = speechUrl ? 'speech-cache' : 'synthesize';
        }
        if (source === 'speech-cache' && speechUrl) {
          const played = await playSaved(speechUrl, null);
          if (!stillThisJob() || played === 'played' || played === 'blocked' || played === 'superseded') return;
        }

        if (!stillThisJob()) return;
        // 合成前最后看一眼直播库里这一拍：预生成可能刚好把录音存好了，
        // 场次状态比渲染时的快照新——直接播存好的，别再扣一次费
        if (!options?.skipCache) {
          if (!latestBeat) latestBeat = findLatestBeat();
          if (latestBeat?.audioUrl) {
            const replayed = await playSaved(latestBeat.audioUrl, null);
            if (!stillThisJob()) return;
            if (replayed === 'played' || replayed === 'blocked' || replayed === 'superseded') return;
          }
        }
        setTtsLoadingBeatId(id);
        const made = await synthesizeLiveBeatAudio(synthText, ch, options?.skipCache, id);
        options?.onAudioUrlReady?.(made.url, made.timeline);
        if (!stillThisJob()) {
          setTtsLoadingBeatId(prev => (prev === id ? null : prev));
          return;
        }
        setTtsLoadingBeatId(null);
        const played = await playVoiceUrl(made.url, id);
        if (played !== 'played' && played !== 'superseded') {
          addToast('这句声音没播出来。再点一次「听这句」，或到「这一段的操作」里重新合成。', 'error');
        }
      } catch (err: any) {
        if (!stillThisJob()) return;
        setTtsLoadingBeatId(null);
        setTtsPlayingBeatId(null);
        setVoiceClock(null);
        addToast(err?.message || '语音合成失败，请检查设置里的语音', 'error');
      } finally {
        if (voiceJobRef.current?.token === token) voiceJobRef.current = null;
      }
    },
    [currentChar, activeChannel, apiConfig, ttsPlayingBeatId, ttsLoadingBeatId, addToast, playVoiceUrl, stopVoiceAudio, synthesizeLiveBeatAudio, buildLiveVoiceChar, readLiveTimestampCache],
  );

  const preGenerateBeatVoice = useCallback(
    async (beat: LiveBeat, sessionId: string) => {
      if (!currentChar) return;
      // 主路径（自动连播/手点台词）已经在合成这一拍了：让给它，别再来一趟扣两次费
      if (voiceJobRef.current?.id === beat.id) return;
      // 等后台标注落地再合成：不然先合成干净版、标注到了又得合成一遍，白扣一次费
      const latestBefore = liveSessionsRef.current.find(session => session.id === sessionId);
      const beforeBeat = latestBefore?.chunks.flatMap(chunk => chunk.beats).find(item => item.id === beat.id);
      if (loadLiveSpeechPerformEnabled() && beforeBeat && !beforeBeat.speechPerform) {
        const pendingPerform = performJobsRef.current.get(beat.id);
        if (pendingPerform) {
          try { await pendingPerform; } catch { /* 失败回落干净原文 */ }
        }
      }
      const latest = liveSessionsRef.current.find(session => session.id === sessionId);
      const latestBeat = latest?.chunks.flatMap(chunk => chunk.beats).find(item => item.id === beat.id);
      if (!latestBeat || latestBeat.audioUrl) return;
      // 合成用念稿版（后台标注刚落地也算数）；没有标注回落干净原文
      const performText = (latestBeat.speechPerform || latestBeat.speechOriginal || '').trim();
      if (!performText) return;
      try {
        const made = await synthesizeLiveBeatAudio(performText, activeChannel, undefined, beat.id);
        await persistBeatAudioUrl(sessionId, beat.id, made.url, made.timeline);
      } catch {
        // 静默预生成失败不打断直播；用户仍可点当前台词即时合成。
      }
    },
    [currentChar, activeChannel, persistBeatAudioUrl, synthesizeLiveBeatAudio],
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

  /**
   * 后台两件套（Ann 2026-10-25 定稿）：出字绝不等辅助活。
   * 存库之后这两件才开跑，一起后台：
   *   1) 对齐中文（喂同传字幕）：只挑本来就对不齐的拍（句数/结尾符号不一致），
   *      本来就对的绝不动；回来把中文写回那一拍，并原地更新主聊天里那张轮次卡
   *   2) 补语音标注（喂发音）：整轮开口台词打包一次辅助模型调用；回来把念稿写进那一拍
   *   落地前都核对：这一拍还在、台词没被 Ann 改过、念稿没被 Ann 手动写过，对得上才写。
   * 兜底上限统一一分钟（Ann 2026-10-25 定的）只在彻底卡死时轮到，轮到了结果照样落地。
   * 卡流检测已按 Ann 指示拆除（2026-10-25）：有的模型不支持流式输出，秒表会错杀。
   */
  const REPAIR_TRANSLATION_TIMEOUT_MS = 60_000;
  const LIVE_SPEECH_PERFORM_TIMEOUT_MS = 60_000;

  /** 等待点注册表：标注落地（含失败）之前，点台词让它发声会等这一趟，不重发不多扣钱 */
  const performJobsRef = useRef<Map<string, Promise<void>>>(new Map());

  /** 一个「放行把手」：整轮共用一个，标注跑完（含失败）时放行所有等它的人 */
  const createWaiter = () => {
    let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release };
  };

  const repairLiveSpeechTranslationsInBackground = async (
    sessionId: string,
    savedBeats: LiveBeat[],
    channel: StreamerChannelProfile,
  ): Promise<void> => {
    const lang = (channel.voiceConfig?.language || '').trim();
    if (!currentChar || !lang || lang === 'zh') return;
    // 只挑本来就需要修的拍；对得齐的根本不发请求（Ann 强调过：对的文本不用对齐）
    const targets = savedBeats
      .map(beat => ({
        beat,
        spoken: (beat.speechOriginal || '').trim(),
        zh: beat.speechTranslated || '',
      }))
      .filter(row => alignLiveSpeech(row.spoken, row.zh).needsRepair);
    if (targets.length === 0) return;

    // 并行修：几拍同时对不齐就一起发，总等待 = 最长那一趟
    const repaired = await Promise.all(targets.map(async row => {
      try {
        // 机械对齐（只重写中文不改原话）：辅助模型优先，没配/挂了自动回退主模型；
        // 一分钟兜底，谁也拖不死后台件
        const raw = await callAuxOrMainLlm({
          apiConfig,
          char: currentChar,
          messages: [{ role: 'user', content: buildLiveTranslationRepairPrompt(row.spoken, row.zh) }],
          temperature: 0.2,
          purpose: '对齐直播台词中文',
          timeoutMs: REPAIR_TRANSLATION_TIMEOUT_MS,
        });
        return { ...row, raw };
      } catch {
        // 这一拍中文对不齐就留原文。嘴里的话照常按秒换，中文整段跟着显示。
        return null;
      }
    }));

    // 落地：找最新场次逐拍核对（重 Roll / 改台词 / 删拍之后，旧结果不许乱写）
    const latest = liveSessionsRef.current.find(s => s.id === sessionId);
    if (!latest) return;
    let changed = false;
    let nextChunks = latest.chunks;
    for (const row of repaired) {
      if (!row) continue;
      nextChunks = nextChunks.map(chunk => ({
        ...chunk,
        beats: chunk.beats.map(beat => {
          if (beat.id !== row.beat.id) return beat;
          if ((beat.speechOriginal || '').trim() !== row.spoken) return beat; // 台词被改过：旧结果作废
          const accepted = acceptRepairedTranslation(row.spoken, beat.speechTranslated || row.zh, row.raw);
          if (accepted === (beat.speechTranslated || '')) return beat;
          changed = true;
          return { ...beat, speechTranslated: accepted };
        }),
      }));
    }
    if (!changed) return;
    const nextSession: LiveStreamSession = { ...latest, chunks: nextChunks };
    const saved = await rememberLiveSession(nextSession);
    if (!saved) return;
    // 中文变了：主聊天里那张轮次卡原地更新（卡被删了就不重建，摘要不受影响）
    for (const chunk of nextSession.chunks) {
      const touched = chunk.beats.some(beat => repaired.some(row => row && row.beat.id === beat.id));
      if (!touched || !chunk.dbMessageId || !currentChar) continue;
      void syncLiveChunkToDb({
        charId: currentChar.id,
        charName: currentChar.name,
        channel,
        session: nextSession,
        chunkIndex: chunk.index,
        beats: chunk.beats,
        existingDbMsgId: chunk.dbMessageId,
      }).catch(() => { /* 卡没更新上不影响字幕本身 */ });
    }
  };

  /**
   * 整轮语音表演标注（纯计算件，不写库）：这一轮所有开口台词打包**一次**辅助模型调用，
   * 按设置里当前语音服务商那套表演规范（自定义覆盖自动生效）补标注。
   * 严格校验：剥掉所有标注后必须和原文一字不差，动了字整段丢弃。
   * 没配辅助模型：返回原样，后台件也不会注册等待点，播报直接用干净原文。
   */
  const performLiveSpeechBeats = useCallback(async (
    beats: LiveBeat[],
    channel: StreamerChannelProfile,
  ): Promise<LiveBeat[]> => {
    if (!isSecondaryLlmReady(apiConfig.secondaryLlm)) return beats;
    const rows = beats
      .map((beat, i) => ({ i, text: (beat.speechOriginal || '').trim(), emotion: (beat.emotion || '').trim() }))
      .filter(row => row.text);
    if (rows.length === 0) return beats;

    const guide = resolveVoiceActingGuideFromApiConfig(apiConfig);
    const system = `你是广播剧语气标注员。台词已经全部写好，你只做一件事：在原有文字的标点之间插入语气标注符号，让配音有停顿、有呼吸、有情绪。你不是作家——不要润色，不要思考怎么写台词，这是机械插符号的活。

### 规范（照做即可；标注符号只许用这里列出的写法）
${guide}

### 铁律（违反任何一条、那一段作废）
1. 文字一个都不能动：不许增字、删字、改字、换同义词、调换位置、增删标点、拆句、并句、改大小写。
2. 标注只许用规范列出的写法，一个都不许自创格式，不许在标注里塞台词。
3. 有内容才加：情绪平的句子可以不加，宁少勿多，标注别堆满。
4. 直接输出严格 JSON 数组，不写任何解释文字：[{"n":编号,"perform":"标注后的整段台词"}]。「n」用输入行首的编号，每一段都要给，一段都不能漏。`;
    const user = `这是你要快速标注的台词（行首数字是编号；括号里是这一拍的参考情绪，仅供语气参考）：
${rows.map(row => `${row.i + 1}. ${row.text}${row.emotion ? `（参考情绪：${row.emotion}）` : ''}`).join('\n')}

最后强调：不要过度思考，不要复述规范，不要解释——看一句、插符号、直接给 JSON。快。`;

    try {
      const raw = await secondaryLlmCall({
        config: apiConfig.secondaryLlm!,
        purpose: '直播语音表演标注',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        featureOpts: { temperature: 0.3 },
        charId: channel.charId,
        timeoutMs: LIVE_SPEECH_PERFORM_TIMEOUT_MS,
        // 共用请求层不设默认，只在这一处写 8000（Ann 定：其他都 8000）
        maxTokens: 8000,
      });
      const cleaned = (raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start === -1 || end <= start) return beats;
      const list = JSON.parse(cleaned.slice(start, end + 1)) as Array<{ n?: number; perform?: string }>;
      if (!Array.isArray(list)) return beats;
      const next = beats.slice();
      for (const entry of list) {
        const idx = Number(entry?.n) - 1;
        const perform = typeof entry?.perform === 'string' ? entry.perform.trim() : '';
        if (!Number.isFinite(idx) || idx < 0 || idx >= next.length || !perform) continue;
        // B：严格校验——剥掉所有标注后必须和原文一字不差；
        // 模型动了字（增删改/换词/动标点）就整段丢弃，这一拍回落干净原文
        const sourceNet = stripPerformanceMarkup(next[idx].speechOriginal || '');
        const performNet = stripPerformanceMarkup(perform);
        if (!performNet || performNet !== sourceNet) continue;
        next[idx] = { ...next[idx], speechPerform: perform };
      }
      return next;
    } catch {
      // 超时/解析失败：这轮先不带标注，播放用干净原文兜底
      return beats;
    }
  }, [apiConfig]);

  /**
   * 补语音标注（后台件）：调用 + 落地 + 放行等它的人。
   * 等待点在**存库之前**就登记好了（Ann 的规矩：只用最终文本做声音）——
   * 所以任何播放（自动朗读 / 手点台词 / 静默提前合成）都会先等这一趟；
   * 失败也放行，回落干净原文。结果永远有人接，不会白花。
   */
  const performLiveSpeechBeatsInBackground = async (
    sessionId: string,
    savedBeats: LiveBeat[],
    channel: StreamerChannelProfile,
    waiter: { promise: Promise<void>; release: () => void },
  ): Promise<void> => {
    const speaking = savedBeats.filter(beat => (beat.speechOriginal || '').trim());
    if (speaking.length === 0) {
      waiter.release();
      return;
    }
    try {
      const annotated = await performLiveSpeechBeats(savedBeats, channel);
      // 落地：找最新场次逐拍核对（重 Roll / 改台词 / 手动标注之后，旧结果不许乱写）
      const latest = liveSessionsRef.current.find(s => s.id === sessionId);
      if (!latest) return;
      let changed = false;
      const nextChunks = latest.chunks.map(chunk => ({
        ...chunk,
        beats: chunk.beats.map(beat => {
          const nextPerform = annotated.find(item => item.id === beat.id)?.speechPerform;
          if (!nextPerform) return beat;
          // Ann 已经手动写过标注：她的优先，后台结果不盖
          if (beat.speechPerform) return beat;
          // 台词被改过：这拍不要旧标注（念稿对不上新词）
          const source = savedBeats.find(item => item.id === beat.id);
          if (!source || (beat.speechOriginal || '').trim() !== (source.speechOriginal || '').trim()) return beat;
          changed = true;
          return { ...beat, speechPerform: nextPerform };
        }),
      }));
      if (!changed) return;
      await rememberLiveSession({ ...latest, chunks: nextChunks });
    } finally {
      // 无论成败都放行等待者：失败的拍走干净原文，绝不让点台词无限等
      waiter.release();
      speaking.forEach(beat => performJobsRef.current.delete(beat.id));
    }
  };

  /** 存库之后才开跑：出字绝不等这两件（Ann 定的顺序），两件一起后台 */
  const runBackgroundLiveJobs = (
    sessionId: string,
    savedBeats: LiveBeat[],
    channel: StreamerChannelProfile,
    performWaiter: { promise: Promise<void>; release: () => void } | null,
  ) => {
    void repairLiveSpeechTranslationsInBackground(sessionId, savedBeats, channel);
    if (performWaiter) {
      void performLiveSpeechBeatsInBackground(sessionId, savedBeats, channel, performWaiter);
    }
  };

  /**
   * 单拍补标注（「重新合成语音」专用，Ann 2026-10-25 定的）：
   * 重新合成时这一拍还没有标注（旧场次记录 / 上次标注失败），就先补一趟再合成。
   * 补完落地存库（核对：这一拍还在、台词没被改过、念稿没被手动写过），下一播直接用。
   */
  const annotateSingleBeatForVoice = async (
    beat: LiveBeat,
    channel: StreamerChannelProfile,
  ): Promise<string | null> => {
    const annotated = await performLiveSpeechBeats([beat], channel);
    const perform = annotated[0]?.speechPerform;
    if (!perform) return null;
    const latest = liveSessionsRef.current.find(session =>
      session.chunks.some(chunk => chunk.beats.some(item => item.id === beat.id)),
    );
    if (!latest) return perform;
    let changed = false;
    const nextChunks = latest.chunks.map(chunk => ({
      ...chunk,
      beats: chunk.beats.map(item => {
        if (item.id !== beat.id) return item;
        if (item.speechPerform) return item; // Ann 手动写的优先
        if ((item.speechOriginal || '').trim() !== (beat.speechOriginal || '').trim()) return item;
        changed = true;
        return { ...item, speechPerform: perform };
      }),
    }));
    if (changed) {
      const saved = await rememberLiveSession({ ...latest, chunks: nextChunks });
      if (!saved) return perform;
    }
    return perform;
  };

  // 圈出来的弹幕只由「下一轮」回应一次；这一轮重 Roll 时要继续带着，到再下一轮才失效。
  // 例子：第 2 轮圈的 → 第 3 轮（含重 Roll）带上 → 第 4 轮生成时清掉。
  const pruneReplyRequests = (chunks: LiveChunk[], targetChunkIndex: number): LiveChunk[] => {
    const hasMark = chunks.some(chunk =>
      chunk.beats.some(beat => (beat.danmaku || []).some(d => d.replyRequested)),
    );
    if (!hasMark) return chunks;
    const keep = (d: LiveDanmakuItem) =>
      Boolean(d.replyRequested) && d.replyTargetChunkIndex === targetChunkIndex;
    return chunks.map(chunk => ({
      ...chunk,
      beats: chunk.beats.map(beat => ({
        ...beat,
        danmaku: (beat.danmaku || []).map(d =>
          d.replyRequested && !keep(d)
            ? { ...d, replyRequested: undefined, replyTargetChunkIndex: undefined }
            : d,
        ),
      })),
    }));
  };

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

      const promptChunks = session.chunks.filter(c => c.id !== options?.replaceChunkId);
      const sessionForPrompt: LiveStreamSession = { ...session, chunks: promptChunks };

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
        // 主内容放宽到 10000（Ann 定：主内容一万，其他 8000）
        maxTokens: 10000,
      });

      // 物理过滤：严禁 AI 生成用户名或任何用户小号名字的弹幕
      const forbiddenViewerNames = [
        userName,
        ...viewerPersonas.map(p => p.name),
      ].filter(Boolean);

      const priorDanmakuTexts = session.chunks.flatMap(chunk =>
        chunk.beats.flatMap(beat =>
          (beat.danmaku || []).flatMap(item => [item.text || '', item.translation || '', item.giftName || '']),
        ),
      );
      const parsedBeats = parseLiveBeatsResponse(
        rawText,
        session.id,
        targetChunkIndex,
        queuedInputs,
        forbiddenViewerNames,
        priorDanmakuTexts,
        // 打赏宽闸用开播时的在线人数算预算
        { viewerCount: session.viewerCount },
      );
      // 出字绝不等辅助活（Ann 2026-10-25 定稿）：对齐中文、补标注挪到存库之后后台跑
      const beats = parsedBeats;

      // 旧场次可能没有这两个字段（重建的场次、老数据），给个保底值再累加
      let peak = session.peakViewerCount ?? session.viewerCount;
      let currViewers = session.viewerCount;
      let scTotal = session.totalScRevenue ?? 0;
      let giftTotal = session.totalGiftRevenue ?? 0;
      // 重 Roll 只换内容，SC/礼物营收已经在第一次生成时加过，不能再加一遍
      if (!options?.replaceChunkId) {
        queuedInputs.forEach(inp => {
          if (inp.scAmount && inp.scAmount > 0) scTotal += inp.scAmount;
          if (inp.gift && inp.gift.price > 0) giftTotal += inp.gift.price;
        });
        beats.forEach(beat => {
          (beat.danmaku || []).forEach(item => {
            if (item.isUserMain || item.isUserAlt) return;
            if (item.scAmount && item.scAmount > 0) scTotal += item.scAmount;
            if (item.giftAmount && item.giftAmount > 0) {
              giftTotal += item.giftAmount * (item.giftCount && item.giftCount > 1 ? item.giftCount : 1);
            }
          });
        });
        currViewers = settleLiveViewerCount({
          current: currViewers,
          followers: channel.followerCount,
          beats,
        });
      }
      if (currViewers > peak) peak = currViewers;

      const existingChunk = options?.replaceChunkId
        ? session.chunks.find(c => c.id === options.replaceChunkId)
        : undefined;

      // 这一轮触发的用户弹幕/SC/礼物写进 chunk，重 Roll 时才能原样交回模型（队列生成后会被清空）
      const storedUserInputs: LiveDanmakuItem[] = (existingChunk?.userInputs?.length
        ? existingChunk.userInputs
        : queuedInputs.map((inp, idx) => {
            if (inp && typeof inp === 'object' && 'senderName' in (inp as object)) {
              return inp as unknown as LiveDanmakuItem;
            }
            const persona = inp.persona;
            return {
              id: inp.id || `dm_usr_${Date.now()}_${idx}`,
              senderName: persona.name,
              roleType: persona.isMain ? 'user_main' : 'user_alt',
              isUserMain: persona.isMain,
              isUserAlt: !persona.isMain,
              viewerPersonaId: persona.id,
              fanBadge: persona.badgeText,
              fanLevel: persona.fanLevel,
              text: inp.text,
              scAmount: inp.scAmount,
              scCurrency: inp.scAmount ? (inp.gift?.currencySymbol || '¥') : undefined,
              scColor: inp.scColor,
              giftId: inp.gift?.id,
              giftName: inp.gift?.name,
              giftEmoji: inp.gift?.emoji,
              giftAmount: inp.gift?.price,
              giftCurrency: inp.gift?.currencySymbol || '¥',
              timestamp: Date.now() + idx,
            } as LiveDanmakuItem;
          }));

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
        // 触发本轮的用户弹幕/SC/礼物：公屏可能已落在上一轮拍里，这里另存一份给重 Roll 回填提示词
        userInputs: storedUserInputs,
        dbMessageId: dbMsgId,
        createdAt: existingChunk?.createdAt ?? Date.now(),
      };

      // 生成要等模型，期间压缩可能已经写上摘要。落库必须叠在最新场次上，不能用开跑时的旧 chunks。
      const latestSession = liveSessionsRef.current.find(s => s.id === session.id) || session;
      const nextChunks = options?.replaceChunkId
        ? latestSession.chunks.map(c => (c.id === options.replaceChunkId ? newChunk : c))
        : [...latestSession.chunks, newChunk];

      const updatedSession: LiveStreamSession = {
        ...latestSession,
        chunks: pruneReplyRequests(nextChunks, targetChunkIndex),
        viewerCount: currViewers,
        peakViewerCount: peak,
        totalScRevenue: scTotal,
        totalGiftRevenue: giftTotal,
        // 新建一轮才清空引导；重 Roll 只换同一轮内容，别把还没轮到的导演引导吃掉
        // Ann 2026-10-24：导演指令不再随「推进一轮」自动消失——重 Roll 同一轮时还要用它。
        // 只有 Ann 在导演台手动删，才会没有。
        pendingGuidance: latestSession.pendingGuidance || [],
      };

      setPendingUserInputs([]);

      // Ann 的规矩：只用最终文本做声音。存库之前先把「这一拍在等标注」记下来——
      // 这样自动朗读 / 手点台词 / 静默提前合成，谁都得先等最终文本。
      // 开关关着、或没配辅助模型：不记等待，直接念原文。
      const performEnabled =
        loadLiveSpeechPerformEnabled() && isSecondaryLlmReady(apiConfig.secondaryLlm);
      const performWaiter = createWaiter();
      const speakingBeats = beats.filter(beat => (beat.speechOriginal || '').trim());
      if (performEnabled && speakingBeats.length > 0) {
        speakingBeats.forEach(beat => performJobsRef.current.set(beat.id, performWaiter.promise));
      }

      await rememberLiveSession(updatedSession);

      // 重 Roll：旧那一轮的拍已经换掉，把它们存下来的录音一并清掉（不清就是垃圾）
      if (existingChunk) {
        const keptIds = new Set(beats.map(beat => beat.id));
        void forgetLiveBeatVoices(
          existingChunk.beats.map(beat => beat.id).filter(id => !keptIds.has(id)),
        );
      }

      // 存库即出字；对齐中文、补标注从这里开始后台跑，谁也不挡出字
      runBackgroundLiveJobs(
        updatedSession.id,
        beats,
        channel,
        performEnabled && speakingBeats.length > 0 ? performWaiter : null,
      );

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
    const isCustomCategory = selectedPresetKey === 'custom';
    const preset = STREAM_PRESET_TEMPLATES.find(t => t.key === selectedPresetKey);
    const customZh = customCategoryName.trim().slice(0, 8);
    if (isCustomCategory && !customZh) {
      addToast('先给分区起个名字（8 个字以内）', 'info');
      return;
    }
    const customEn = customCategoryEn.trim();
    const categoryKey = isCustomCategory
      ? 'custom'
      : preset?.key || STREAM_PRESET_TEMPLATES[0].key;
    const categoryLabel = isCustomCategory
      ? customEn
        ? `${customZh} ${customEn}`
        : customZh
      : preset?.label || STREAM_PRESET_TEMPLATES[0].label;
    const categoryHint = isCustomCategory ? customCategoryHint.trim() : '';
    const title =
      customStreamTitle.trim() ||
      (isCustomCategory
        ? customZh
        : preset?.defaultTitle || STREAM_PRESET_TEMPLATES[0].defaultTitle);
    const topicNote =
      customStreamTopic.trim() ||
      // 预设把说明当今日走向；自定义不要重复写一遍（说明已经进场景基调了）
      (isCustomCategory ? '' : preset?.promptHint || '');

    const newSession: LiveStreamSession = {
      id: `live_${Date.now()}`,
      channelId: activeChannel.id,
      charId: currentChar.id,
      title,
      categoryKey,
      categoryLabel,
      categoryHint: categoryHint || undefined,
      categoryNameZh: isCustomCategory ? customZh : undefined,
      categoryNameEn: isCustomCategory && customEn ? customEn : undefined,
      // 生成提示词读的是 customTopic，这里和 topicNote 一起写，开播时填的走向才会生效
      customTopic: topicNote,
      topicNote,
      status: 'live',
      viewerCount: Math.floor(activeChannel.followerCount * 0.08) + 120,
      peakViewerCount: Math.floor(activeChannel.followerCount * 0.08) + 120,
      likeCount: 0,
      totalScRevenue: 0,
      totalGiftRevenue: 0,
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

    let sessionWithMarker = newSession;
    try {
      const markerMessageId = await createLiveSessionMarkerInDb({
        charId: currentChar.id,
        charName: currentChar.name,
        channel: activeChannel,
        session: newSession,
      });
      sessionWithMarker = { ...newSession, startMarkerMessageId: markerMessageId };
      // 状态卡在首轮生成前落进主聊天；后续下播只原位更新这条标记。
      await rememberLiveSession(sessionWithMarker);
    } catch (e: any) {
      const aborted: LiveStreamSession = { ...newSession, status: 'ended', endedAt: Date.now() };
      await rememberLiveSession(aborted);
      addToast(e?.message || '开播提醒卡没能写进私聊，本次没有开始生成直播', 'error');
      return;
    }
    setActiveLiveSessionId(newSession.id);
    setPendingUserInputs([]);

    await runGenerateLiveChunk(sessionWithMarker, activeChannel, []);
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
    scColor?: import('../utils/liveStreamTypes').LiveScColor | 'blue' | 'cyan' | 'amber' | 'magenta',
    triggerImmediateReply = true,
    gift?: StreamGiftOption,
    targetBeat?: { chunkId: string; beatId: string },
  ) => {
    if (!activeLiveSession || !activeChannel) return;
    const persona =
      viewerPersonas.find(p => p.id === activePersonaId) || viewerPersonas[0];
    const dmId = `udm_${Date.now()}`;
    const newItem = { id: dmId, text, persona, scAmount, scColor, gift };

    let updatedSession = activeLiveSession;
    let attachedToTimeline = false;
    const dmObj: LiveDanmakuItem = {
      id: dmId,
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
      giftAmount: gift?.price,
      giftCurrency: gift?.currencySymbol || '¥',
      timestamp: Date.now(),
    };
    const placement = appendLiveDanmakuToBeat(activeLiveSession.chunks, targetBeat, dmObj);
    if (placement.attached) {
      updatedSession = { ...activeLiveSession, chunks: placement.chunks };
      attachedToTimeline = placement.attached;
      void rememberLiveSession(updatedSession);
      // 这一轮还没压缩时，把刚发的弹幕也补进它那张卡；压过的轮次卡正文是摘要，不重写
      const target = placement.chunks[placement.chunkIndex];
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

    const nextQueue = [
      ...pendingUserInputs,
      { ...newItem, alreadyDisplayedInTimeline: attachedToTimeline },
    ];
    setPendingUserInputs(nextQueue);

    if (triggerImmediateReply && !isGenerating) {
      // 即时接话发生在指定拍：保留该拍及之前，丢弃后续预制拍/轮；回应作为新一轮生成，
      // 新建一张轮次卡，不拼进目标轮次。
      const targetIdx = targetBeat
        ? updatedSession.chunks.findIndex(c => c.id === targetBeat.chunkId)
        : -1;
      const targetChunk = targetIdx >= 0 ? updatedSession.chunks[targetIdx] : undefined;
      const truncatedTarget = targetChunk && targetBeat
        ? truncateLiveChunkAfterBeat(targetChunk, targetBeat.beatId)
        : null;
      if (targetChunk && truncatedTarget) {
        const dropped = updatedSession.chunks.slice(targetIdx + 1);
        const baseSession: LiveStreamSession = {
          ...updatedSession,
          chunks: [...updatedSession.chunks.slice(0, targetIdx), truncatedTarget],
          // 旧阶段摘要若跨过目标轮，里面也可能含有刚作废的后续内容。
          rollingSummaries: (updatedSession.rollingSummaries || []).filter(
            summary => summary.toChunkIndex <= truncatedTarget.index,
          ),
        };
        const dropIds = dropped
          .map(chunk => chunk.dbMessageId)
          .filter((id): id is number => typeof id === 'number' && id > 0);
        if (dropIds.length) {
          void DB.deleteMessages(dropIds).catch(() => {
            /* 本地轮次已截断；删聊天卡失败不阻断即时接话 */
          });
        }
        // 被截掉的那些拍，把它们的录音一并清掉
        {
          const keptIds = new Set(truncatedTarget.beats.map(beat => beat.id));
          const orphanIds = [
            ...targetChunk.beats.map(beat => beat.id),
            ...dropped.flatMap(chunk => chunk.beats.map(beat => beat.id)),
          ].filter(id => !keptIds.has(id));
          if (orphanIds.length) void forgetLiveBeatVoices(orphanIds);
        }
        void rememberLiveSession(baseSession);
        if (currentChar) {
          void syncLiveChunkToDb({
            charId: currentChar.id,
            charName: currentChar.name,
            channel: activeChannel,
            session: baseSession,
            chunkIndex: truncatedTarget.index,
            beats: truncatedTarget.beats,
            existingDbMsgId: truncatedTarget.dbMessageId,
          }).catch(() => {});
        }
        void runGenerateLiveChunk(baseSession, activeChannel, nextQueue);
      } else {
        void runGenerateLiveChunk(updatedSession, activeChannel, nextQueue);
      }
    }
  };

  // 改 / 删任意一条弹幕（Ann 2026-10-24：模型偶尔会把该回应的弹幕又发一遍，要能手动收拾）
  const mutateUserDanmaku = async (danmakuId: string, nextText: string | null) => {
    if (!activeLiveSession || !activeChannel || !currentChar) return;
    const chunkIndex = activeLiveSession.chunks.findIndex(chunk =>
      chunk.beats.some(beat => (beat.danmaku || []).some(item => item.id === danmakuId)),
    );
    if (chunkIndex < 0) return;
    const sourceChunk = activeLiveSession.chunks[chunkIndex];
    // 这一轮触发本轮生成时存下的「用户投喂」副本也要一起改 / 一起删，
    // 否则重 Roll 会把删掉的那条 SC / 弹幕又塞回提示词里。
    const nextUserInputs = (sourceChunk.userInputs || []).flatMap(item => {
      if (item.id !== danmakuId) return [item];
      if (nextText === null) return [];
      return [{ ...item, text: nextText }];
    });
    const beats = sourceChunk.beats.map(beat => ({
      ...beat,
      danmaku: (beat.danmaku || []).flatMap(item => {
        if (item.id !== danmakuId) return [item];
        if (nextText === null) return [];
        return [{ ...item, text: nextText }];
      }),
    }));
    // 摘要可能包含旧弹幕，修改后退回这一轮原文，避免摘要卡继续显示旧内容。
    const changedChunk: LiveChunk = {
      ...sourceChunk,
      beats,
      userInputs: nextUserInputs,
      roundSummary: undefined,
      summaryUpdatedAt: undefined,
    };
    const nextChunks = activeLiveSession.chunks.map((chunk, index) =>
      index === chunkIndex ? changedChunk : chunk,
    );

    const nextSession = { ...activeLiveSession, chunks: nextChunks };
    await rememberLiveSession(nextSession);
    setPendingUserInputs(prev => nextText === null
      ? prev.filter(item => item.id !== danmakuId)
      : prev.map(item => item.id === danmakuId ? { ...item, text: nextText } : item));
    try {
      await syncLiveChunkToDb({
        charId: currentChar.id,
        charName: currentChar.name,
        channel: activeChannel,
        session: nextSession,
        chunkIndex: changedChunk.index,
        beats: changedChunk.beats,
        existingDbMsgId: changedChunk.dbMessageId,
      });
    } catch (error: any) {
      addToast(error?.message || '弹幕已修改，但同步聊天记录失败', 'error');
    }
  };

  const handleEditUserDanmaku = (id: string, text: string) => {
    void mutateUserDanmaku(id, text.trim());
  };

  const handleDeleteUserDanmaku = (id: string) => {
    void mutateUserDanmaku(id, null);
  };

  // 导演引导：只写给模型看，不进公屏；生成一轮后由 runGenerateLiveChunk 清空
  const handleAddGuidance = (text: string) => {
    if (!activeLiveSession || !text.trim()) return;
    const next: LiveStreamSession = {
      ...activeLiveSession,
      pendingGuidance: [
        ...(activeLiveSession.pendingGuidance || []),
        { id: `lg_${Date.now()}`, text: text.trim(), createdAt: Date.now() },
      ],
    };
    void rememberLiveSession(next);
  };

  const handleRemoveGuidance = (id: string) => {
    if (!activeLiveSession) return;
    const next: LiveStreamSession = {
      ...activeLiveSession,
      pendingGuidance: (activeLiveSession.pendingGuidance || []).filter(g => g.id !== id),
    };
    void rememberLiveSession(next);
  };

  const handleEditGuidance = (id: string, text: string) => {
    const trimmed = text.trim();
    if (!activeLiveSession || !trimmed) return;
    const next: LiveStreamSession = {
      ...activeLiveSession,
      pendingGuidance: (activeLiveSession.pendingGuidance || []).map(g =>
        g.id === id ? { ...g, text: trimmed } : g,
      ),
    };
    void rememberLiveSession(next);
  };

  // 圈弹幕：标记写在「被圈的那条弹幕」上，同时记住该由第几轮来回应。
  // - 新增只认最新一轮生成的路人普通弹幕，最多 5 条；
  // - 取消不限轮次（已经用过、还留在导演台里的旧标记也要能撤）；
  // - 回应只做一次：第 3 轮生成时带上第 2 轮圈的，第 3 轮重 Roll 还带着，到第 4 轮才失效。
  const handleToggleDanmakuReply = (danmakuId: string) => {
    if (!activeLiveSession || !danmakuId) return;
    const session = liveSessionsRef.current.find(s => s.id === activeLiveSession.id) || activeLiveSession;
    const ownerIndex = session.chunks.findIndex(chunk =>
      chunk.beats.some(beat => (beat.danmaku || []).some(d => d.id === danmakuId)),
    );
    if (ownerIndex < 0) return;
    const found = session.chunks[ownerIndex].beats
      .flatMap(beat => beat.danmaku || [])
      .find(d => d.id === danmakuId);
    if (!found) return;

    const patch = (next: { replyRequested?: boolean; replyTargetChunkIndex?: number }) => {
      const chunks = session.chunks.map((chunk, chunkIndex) =>
        chunkIndex === ownerIndex
          ? {
              ...chunk,
              beats: chunk.beats.map(beat => ({
                ...beat,
                danmaku: (beat.danmaku || []).map(d =>
                  d.id === danmakuId ? { ...d, ...next } : d,
                ),
              })),
            }
          : chunk,
      );
      void rememberLiveSession({ ...session, chunks });
    };

    // 取消：任何已经圈过的都能撤
    if (found.replyRequested) {
      patch({ replyRequested: undefined, replyTargetChunkIndex: undefined });
      return;
    }

    if (ownerIndex !== session.chunks.length - 1) {
      addToast('只能圈本轮生成的弹幕', 'info');
      return;
    }
    if (found.isUserMain || found.isUserAlt) {
      addToast('自己发的弹幕不用圈，直接发就好', 'info');
      return;
    }
    if ((found.scAmount && found.scAmount > 0) || found.giftName) {
      addToast('打赏会按自己的节奏处理，不用圈', 'info');
      return;
    }
    // 只数「还没被回应过」的（下一轮要接的那批）
    const nextTarget = session.chunks.length;
    const pendingCount = session.chunks.reduce(
      (total, chunk) =>
        total +
        chunk.beats.reduce(
          (n, beat) =>
            n +
            (beat.danmaku || []).filter(
              d => d.replyRequested && d.replyTargetChunkIndex === nextTarget,
            ).length,
          0,
        ),
      0,
    );
    if (pendingCount >= 5) {
      addToast('这一轮最多圈 5 条', 'info');
      return;
    }
    patch({ replyRequested: true, replyTargetChunkIndex: ownerIndex + 1 });
  };

  // 重 Roll 某一段切片（传入旧台词防雷同 + 排除旧 DB 消息）
  // SC/礼物触发的那一轮：队列早已清空，要从 chunk.userInputs（或上一轮末拍用户弹幕）回填，否则模型会当没收到。
  const handleRerollChunk = async (chunkId: string) => {
    if (!activeLiveSession || !activeChannel || isGenerating) return;
    const oldChunk = activeLiveSession.chunks.find(c => c.id === chunkId);
    const rejectedDraftText = oldChunk
      ? oldChunk.beats
          .map(b => `画面：${b.screen} ｜ 台词：${b.speechOriginal}`)
          .join('\n')
      : undefined;

    const triggerItems: LiveDanmakuItem[] = (() => {
      if (!oldChunk) return [];
      if (oldChunk.userInputs && oldChunk.userInputs.length > 0) return oldChunk.userInputs;
      // 旧数据没写 userInputs：即时接话时 SC 落在上一轮末拍，从那里捞
      const prev = [...activeLiveSession.chunks]
        .filter(c => c.index < oldChunk.index)
        .sort((a, b) => b.index - a.index)[0];
      const lastBeat = prev?.beats[prev.beats.length - 1];
      return (lastBeat?.danmaku || []).filter(d => d.isUserMain || d.isUserAlt);
    })();

    const recoveredQueue = triggerItems.map(dm => ({
      id: dm.id,
      text: dm.text,
      persona: {
        id: dm.viewerPersonaId || (dm.isUserMain ? 'viewer_main_self' : 'viewer_alt'),
        name: dm.senderName,
        isMain: Boolean(dm.isUserMain),
        fanLevel: dm.fanLevel,
        badgeText: dm.fanBadge,
      } as ViewerPersona,
      scAmount: dm.scAmount,
      scColor: dm.scColor,
      gift: dm.giftName
        ? {
            id: dm.giftId || `gift_${dm.giftName}`,
            name: dm.giftName,
            emoji: dm.giftEmoji || '🎁',
            price: dm.giftAmount || 0,
            currencySymbol: dm.giftCurrency || '¥',
          }
        : undefined,
      alreadyDisplayedInTimeline: true,
    }));

    const recoveredIds = new Set(recoveredQueue.map(item => item.id).filter(Boolean));
    const queueForReroll = [
      ...recoveredQueue,
      ...pendingUserInputs.filter(item => !item.id || !recoveredIds.has(item.id)),
    ];

    await runGenerateLiveChunk(activeLiveSession, activeChannel, queueForReroll, {
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

    const speechChanged = targetChunk.beats.some(
      b => b.id === beatId && (b.speechOriginal || '') !== (nextSpeechOriginal || ''),
    );
    const nextBeats = targetChunk.beats.map(b => {
      if (b.id !== beatId) return b;
      const nextBeat: LiveBeat = {
        ...b,
        screen: nextScreen,
        speechOriginal: nextSpeechOriginal,
        speechTranslated: nextSpeechTranslated,
      };
      if ((b.speechOriginal || '') !== (nextSpeechOriginal || '')) {
        delete nextBeat.audioUrl;
        delete nextBeat.speechTimeline;
        // 台词改了，旧录音作废：连本机资料库里那一段一起清掉
        void forgetLiveBeatVoices([b.id]);
      }
      return nextBeat;
    });
    if (speechChanged && ttsPlayingBeatId === beatId) {
      stopVoiceAudio();
      setTtsPlayingBeatId(null);
    }

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

  /**
   * 手动改某一拍的语音表演标注（编辑弹窗里的「语音标注」框）。
   * Ann 2026-10-25 定的：改台词不重标、标注保留；手动改标注后旧的录音作废，
   * 下次播放按新念稿重新合成（缓存 key 跟着念稿文本走，天然不冲突）。
   */
  const handleEditBeatPerform = async (chunkId: string, beatId: string, nextPerform: string) => {
    if (!activeLiveSession || !activeChannel) return;
    const targetChunk = activeLiveSession.chunks.find(c => c.id === chunkId);
    if (!targetChunk) return;
    const trimmed = nextPerform.trim();
    const nextBeats = targetChunk.beats.map(b => {
      if (b.id !== beatId) return b;
      if ((b.speechPerform || '') === trimmed) return b;
      const nextBeat: LiveBeat = { ...b, speechPerform: trimmed || undefined };
      // 念稿变了，旧录音跟着作废（旧录音是按旧念稿合成的）
      if (b.speechPerform) {
        delete nextBeat.audioUrl;
        delete nextBeat.speechTimeline;
        // 连本机资料库里那一段一起清掉
        void forgetLiveBeatVoices([b.id]);
      }
      return nextBeat;
    });
    const changed = nextBeats.some((b, i) => b !== targetChunk.beats[i]);
    if (!changed) return;
    if (ttsPlayingBeatId === beatId) {
      stopVoiceAudio();
      setTtsPlayingBeatId(null);
    }
    // 标注只进直播库，不进记忆/聊天卡（卡里的正文从来不含标注）
    const nextSession: LiveStreamSession = {
      ...activeLiveSession,
      chunks: activeLiveSession.chunks.map(c =>
        c.id === chunkId ? { ...c, beats: nextBeats } : c,
      ),
    };
    const saved = await rememberLiveSession(nextSession);
    if (!saved) addToast('标注改好了，但没能存进本地数据库', 'error');
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
    const markerChannel = activeChannel || channels.find(channel => channel.id === ended.channelId);
    if (saved && markerChannel) {
      try {
        await updateLiveSessionMarkerInDb({
          messageId: ended.startMarkerMessageId,
          charId: ended.charId,
          charName: currentChar?.name,
          channel: markerChannel,
          session: ended,
        });
      } catch (e: any) {
        addToast(e?.message || '直播已下播，但状态标记没能更新', 'error');
      }
    }
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

  // 从直播播放界面的逐轮摘要列表，直接将 session 中保存的这一轮复制为私聊卡片。
  // 不查找原聊天卡，所以原卡即使被删除，仍可从直播记录重新发送；此处不触发模型。
  const handleForwardRoundToPrivate = async (chunkId: string) => {
    if (!currentChar || !activeChannel || !activeLiveSession) return;
    const chunk = activeLiveSession.chunks.find(item => item.id === chunkId);
    if (!chunk) return;
    const card = buildLiveRoundCard({
      charId: currentChar.id,
      charName: currentChar.name,
      channel: activeChannel,
      session: activeLiveSession,
      chunk,
    });
    await DB.saveMessage({
      charId: currentChar.id,
      role: 'user',
      type: 'score_card',
      content: JSON.stringify(card),
      metadata: {
        source: 'live_round',
        liveSessionId: activeLiveSession.id,
        liveChannelId: activeChannel.id,
        liveChunkIndex: chunk.index,
        manualForward: true,
        scoreCard: card,
      },
    });
    addToast(`第 ${chunk.index + 1} 轮直播卡已发到私聊`, 'success');
  };

  // 编辑本场直播信息：保存后写回 session，之后推进生成的提示词就用新标题/分区/走向。
  const handleSaveLiveSessionInfo = async (next: {
    title: string;
    categoryKey: string;
    categoryLabel: string;
    categoryHint: string;
    categoryNameZh: string;
    categoryNameEn: string;
    topicNote: string;
  }) => {
    const target = liveSessions.find(s => s.id === editingLiveSessionId);
    if (!target) {
      setEditingLiveSessionId(null);
      return;
    }
    const nextSession: LiveStreamSession = {
      ...target,
      title: next.title,
      categoryKey: next.categoryKey,
      categoryLabel: next.categoryLabel,
      categoryHint: next.categoryHint || undefined,
      categoryNameZh: next.categoryNameZh || undefined,
      categoryNameEn: next.categoryNameEn || undefined,
      customTopic: next.topicNote || undefined,
      topicNote: next.topicNote || undefined,
    };
    await rememberLiveSession(nextSession);
    const markerChannel = channels.find(channel => channel.id === nextSession.channelId);
    const markerChar = characters.find(character => character.id === nextSession.charId);
    if (markerChannel && nextSession.startMarkerMessageId) {
      void updateLiveSessionMarkerInDb({
        messageId: nextSession.startMarkerMessageId,
        charId: nextSession.charId,
        charName: markerChar?.name,
        channel: markerChannel,
        session: nextSession,
      }).catch(() => {});
    }
    setEditingLiveSessionId(null);
    addToast('这场直播的信息已更新，后面的推进按新信息走', 'success');
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
          voiceClock={voiceClock}
          onSeekVoice={seekVoiceSeconds}
          onNudgeVoice={nudgeVoiceSeconds}
          voiceEnd={voiceEnd}
          onBindAfterVoiceEnd={bindAfterVoiceEnd}
          onBindBack={fn => {
            screenBackRef.current = fn;
          }}
          onChangePlatformTheme={handleChangePlatformTheme}
          onSelectPersona={handleSelectViewerPersona}
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
          onEditBeatPerform={(chunkId, beatId, nextPerform) =>
            void handleEditBeatPerform(chunkId, beatId, nextPerform)
          }
          onPlayBeatVoice={(beat, opts) =>
            void speakTextWithChannelConfig(
              beat.id,
              (beat.speechPerform || beat.speechOriginal || '').trim(),
              activeChannel,
              {
                skipCache: opts?.skipCache,
                fromAuto: opts?.fromAuto,
                cachedUrl: beat.audioUrl,
                onAudioUrlReady: (url, timeline) => void persistBeatAudioUrl(activeLiveSession.id, beat.id, url, timeline),
              },
            )
          }
          onPreGenerateBeatVoice={preGenerateBeatVoice}
          onSendUserDanmaku={handleSendUserDanmaku}
          onEditUserDanmaku={handleEditUserDanmaku}
          onDeleteUserDanmaku={handleDeleteUserDanmaku}
          pendingGuidance={activeLiveSession.pendingGuidance || []}
          onAddGuidance={handleAddGuidance}
          onRemoveGuidance={handleRemoveGuidance}
          onEditGuidance={handleEditGuidance}
          onToggleDanmakuReply={handleToggleDanmakuReply}
          onUpdateCustomBackground={url => {
            void rememberLiveSession({ ...activeLiveSession, customBackgroundUrl: url });
            addToast('直播间背景已更新', 'success');
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
          onForwardRoundToPrivate={chunkId => void handleForwardRoundToPrivate(chunkId)}
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
          onSelect={handleSelectViewerPersona}
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
          onSelectPersona={handleSelectViewerPersona}
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
          onSelect={handleSelectViewerPersona}
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
        onEditLive={id => setEditingLiveSessionId(id)}
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
        customCategoryName={customCategoryName}
        onChangeCategoryName={setCustomCategoryName}
        customCategoryEn={customCategoryEn}
        onChangeCategoryEn={setCustomCategoryEn}
        customCategoryHint={customCategoryHint}
        onChangeCategoryHint={setCustomCategoryHint}
        onRecommendCategories={handleRecommendCategories}
        onAiStream={direction => {
          const preset = STREAM_PRESET_TEMPLATES.find(t => t.key === selectedPresetKey);
          const categoryLabelForAi =
            selectedPresetKey === 'custom'
              ? customCategoryName.trim() || undefined
              : preset?.label;
          void handleRequestAiField('live_title', {
            categoryLabel: categoryLabelForAi,
            direction,
          }).then(res => {
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
              onRequestAiGenerateGifts={(draft, direction, previousNames) =>
                generateStreamCustomGifts({
                  apiConfig,
                  char: currentChar,
                  channel: draft,
                  direction,
                  previousNames,
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
            onSelect={handleSelectViewerPersona}
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
      <LiveSessionInfoModal
        isOpen={Boolean(editingLiveSessionId)}
        initialTitle={liveSessions.find(s => s.id === editingLiveSessionId)?.title || ''}
        initialCategoryKey={liveSessions.find(s => s.id === editingLiveSessionId)?.categoryKey || ''}
        initialCategoryHint={
          liveSessions.find(s => s.id === editingLiveSessionId)?.categoryHint || ''
        }
        initialCategoryNameZh={
          liveSessions.find(s => s.id === editingLiveSessionId)?.categoryNameZh || ''
        }
        initialCategoryNameEn={
          liveSessions.find(s => s.id === editingLiveSessionId)?.categoryNameEn || ''
        }
        initialTopicNote={
          liveSessions.find(s => s.id === editingLiveSessionId)?.customTopic
          || liveSessions.find(s => s.id === editingLiveSessionId)?.topicNote
          || ''
        }
        onClose={() => setEditingLiveSessionId(null)}
        onSave={next => void handleSaveLiveSessionInfo(next)}
      />
    </>
  );
};

export default LiveStreamApp;
