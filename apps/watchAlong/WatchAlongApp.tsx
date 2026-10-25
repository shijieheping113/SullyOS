/**
 * 陪看的宿主。
 *
 * 只做三件事：把页面串起来、把引擎的返回值落库、把该响的声音放出来。
 * 界面细节都在 components/watchAlong，生成细节都在 utils/watchAlong。
 *
 * 规矩：全程只在 live_npc_watches 这份沙盒里读写；只有退房选了「写进主聊天」
 * 才往主聊天塞那唯一一张汇总卡，而且不触发记忆整理。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { ChatPrompts } from '../../utils/chatPrompts';
import { loadCharacterContextMessages } from '../../utils/chatContextRange';
import { canSynthesizeSpeech } from '../../utils/ttsRouter';
import { playVoiceAudio, stopVoiceAudio, voicePlaybackErrorMessage } from '../../utils/voicePlayback';
import { cardMessageContent } from '../../utils/liveStreamStorage';
import type { LivestreamChatCardPayload } from '../../utils/liveStreamTypes';
import type {
  CharacterProfile,
  Emoji,
  EmojiCategory,
  UserProfile,
} from '../../types';
import { WatchLobby } from '../../components/watchAlong/WatchLobby';
import { WatchRoom } from '../../components/watchAlong/WatchRoom';
import { WatchChat } from '../../components/watchAlong/WatchChat';
import { WatchDirector } from '../../components/watchAlong/WatchDirector';
import { WatchHistory } from '../../components/watchAlong/WatchHistory';
import { WatchSummary } from '../../components/watchAlong/WatchSummary';
import { WatchSettings } from '../../components/watchAlong/WatchSettings';
import { WatchExit } from '../../components/watchAlong/WatchExit';
import {
  Sheet,
  SolidButton,
  W,
} from '../../components/watchAlong/chrome';
import {
  advanceRound,
  chatRound,
  finishSession,
  forceDigest,
  maybeDigest,
  rewriteDigest,
  rewriteRecap,
  type RoundContext,
} from '../../utils/watchAlong/round';
import {
  generateRoomPool,
  suggestAccountName,
  translateWatchText,
} from '../../utils/watchAlong/engine';
import {
  applyDigestEdit,
  applyRecapEdit,
  collectVoiceIds,
  createSession,
  deleteWatchSession,
  loadWatchGlobals,
  loadWatchSessions,
  removeDigest,
  saveWatchGlobals,
  saveWatchSession,
} from '../../utils/watchAlong/storage';
import {
  downloadWatchVoice,
  forgetWatchVoices,
  loadWatchVoiceUrl,
  synthesizeWatchVoice,
} from '../../utils/watchAlong/voice';
import type {
  WatchAccount,
  WatchAlongSession,
  WatchChatMessage,
  WatchGlobals,
  WatchPublicAction,
  WatchRoomCard,
  WatchSettings as WatchSettingsType,
} from '../../utils/watchAlong/types';
import { defaultGlobals, watchId } from '../../utils/watchAlong/types';

type Page = 'lobby' | 'room' | 'chat' | 'history' | 'settings' | 'summary';

/** 一次生成中用来挡住重复点按 */
type Busy =
  | null
  | 'advance'
  | 'chat'
  | 'pool'
  | 'recap'
  | 'digest'
  | 'translate'
  | 'account';

export default function WatchAlongApp({
  char,
  onClose,
}: {
  char: CharacterProfile;
  /** 退出陪看，回到电波大厅 */
  onClose: () => void;
}) {
  const { apiConfig, userProfile, addToast, registerBackHandler } = useOS();

  const [globals, setGlobals] = useState<WatchGlobals>(() => defaultGlobals(char.name));
  const [sessions, setSessions] = useState<WatchAlongSession[]>([]);
  const [session, setSession] = useState<WatchAlongSession | null>(null);
  const [page, setPage] = useState<Page>('lobby');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [categories, setCategories] = useState<EmojiCategory[]>([]);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState('');
  const [accountBusy, setAccountBusy] = useState<'user' | 'char' | null>(null);

  // 声音：一条通道，key 是「谁的哪一条」，播新的先把旧的停掉
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const sessionRef = useRef<WatchAlongSession | null>(null);
  sessionRef.current = session;
  const settings = globals.settings;
  const voiceReady = useMemo(() => canSynthesizeSpeech(char, apiConfig), [char, apiConfig]);

  // ==================== 启动 ====================

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [g, list] = await Promise.all([
          loadWatchGlobals(char.name),
          loadWatchSessions(char.name),
        ]);
        if (!alive) return;
        setGlobals(g);
        setSessions(list.filter(s => !s.charId || s.charId === char.id));
      } catch {
        /* 读不到就走出厂值 */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [char.id, char.name]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await DB.initializeEmojiData();
        const [es, cats] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
        if (!alive) return;
        const visible = ChatPrompts.filterVisibleEmojis(es, cats, char.id);
        setEmojis(visible.emojis);
        setCategories(visible.categories);
      } catch {
        /* 表情读不到就不显示面板，不影响别的 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [char.id]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    return () => {
      stopVoiceAudio(audio);
      audioRef.current = null;
    };
  }, []);

  // 第一次进来还没有房间就刷一批（只在本地池空着时跑）
  const refreshPoolRef = useRef(false);
  useEffect(() => {
    if (!ready || refreshPoolRef.current) return;
    if (globals.pool.length > 0) return;
    refreshPoolRef.current = true;
    void refreshPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, globals.pool.length]);

  // 返回键：先在陪看里退层，退到大厅就交给外层（关电波）
  useEffect(
    () =>
      registerBackHandler(() => {
        if (directorOpen) {
          setDirectorOpen(false);
          return true;
        }
        if (exitOpen) {
          setExitOpen(false);
          return true;
        }
        if (ruleOpen) {
          setRuleOpen(false);
          return true;
        }
        if (page !== 'lobby') {
          setPage(session ? 'room' : 'lobby');
          return true;
        }
        return false;
      }),
    [directorOpen, exitOpen, ruleOpen, page, session, registerBackHandler],
  );

  // ==================== 底座 ====================

  const buildCtx = useCallback(async (): Promise<RoundContext> => {
    const historyMessages = await loadCharacterContextMessages(char).catch(() => []);
    return {
      apiConfig,
      char,
      userProfile: userProfile as UserProfile,
      historyMessages,
      emojis,
      categories,
      settings,
    };
  }, [apiConfig, char, userProfile, emojis, categories, settings]);

  const persist = useCallback(async (next: WatchAlongSession) => {
    setSession(next);
    setSessions(prev => [next, ...prev.filter(s => s.id !== next.id)].sort((a, b) => b.updatedAt - a.updatedAt));
    await saveWatchSession(next);
  }, []);

  /** 只改一条私聊消息（不整场重排） */
  const patchChat = useCallback(async (id: string, patch: Partial<WatchChatMessage>) => {
    const cur = sessionRef.current;
    if (!cur) return;
    const next: WatchAlongSession = {
      ...cur,
      chat: cur.chat.map(c => (c.id === id ? { ...c, ...patch } : c)),
      updatedAt: Date.now(),
    };
    await persist(next);
  }, [persist]);

  const dropChat = useCallback(async (id: string) => {
    const cur = sessionRef.current;
    if (!cur) return;
    await persist({ ...cur, chat: cur.chat.filter(c => c.id !== id), updatedAt: Date.now() });
  }, [persist]);

  const playUrl = useCallback(
    async (audioKey: string, url: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      stopVoiceAudio(audio);
      await playVoiceAudio(audio, url, {
        onPlaying: () => {
          setPlayingKey(audioKey);
          setLoadingKey(null);
        },
        onStopped: () => setPlayingKey(cur => (cur === audioKey ? null : cur)),
        onError: error => {
          setPlayingKey(cur => (cur === audioKey ? null : cur));
          setLoadingKey(null);
          addToast(voicePlaybackErrorMessage(error), 'error');
        },
      });
    },
    [addToast],
  );

  // ==================== 大厅 ====================

  const refreshPool = useCallback(async () => {
    if (busy) return;
    setBusy('pool');
    try {
      const rooms = await generateRoomPool({
        apiConfig,
        char,
        userName: userProfile?.name || '你',
        customRule: globals.customRule,
        count: 6,
        exclude: globals.pool.map(r => r.streamerName),
      });
      if (!rooms.length) throw new Error('这次一个房间都没刷出来，再点一次试试');
      const next = { ...globals, pool: rooms };
      setGlobals(next);
      await saveWatchGlobals(next);
    } catch (e: any) {
      addToast(e?.message || '刷台没成', 'error');
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiConfig, char, globals, userProfile?.name, addToast, busy]);

  const saveGlobals = useCallback(async (next: WatchGlobals) => {
    setGlobals(next);
    await saveWatchGlobals(next);
  }, []);

  const startRoom = useCallback(
    async (room: WatchRoomCard) => {
      if (busy) return;
      const fresh = createSession({
        charId: char.id,
        charName: char.name,
        room,
        settings,
        userAccount: globals.userAccount,
        charAccount: globals.charAccount,
      });
      await persist(fresh);
      setPage('room');
      setUnread(0);
      setBusy('advance');
      try {
        const ctx = await buildCtx();
        const r = await advanceRound({ ...ctx, session: fresh });
        await persist(r.session);
        if (r.bubble) setBubble(r.bubble);
      } catch (e: any) {
        addToast(e?.message || '第一幕没接通，点「下一幕」再试', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, char.id, char.name, settings, globals.userAccount, globals.charAccount, persist, buildCtx, addToast],
  );

  // ==================== 房间 ====================

  const runAdvance = useCallback(
    async (myActions?: WatchPublicAction[]) => {
      const cur = sessionRef.current;
      if (!cur || busy) return;
      if (cur.legacy) {
        addToast('这是旧版记录，只能翻看，不能再往下演', 'info');
        return;
      }
      setBusy('advance');
      try {
        const ctx = await buildCtx();
        const r = await advanceRound({ ...ctx, session: cur, myActions });
        let next = r.session;
        try {
          next = await maybeDigest({ ...ctx, session: next });
        } catch {
          /* 压不动不影响这一轮 */
        }
        await persist(next);
        if (r.bubble) {
          setBubble(r.bubble);
          if (page !== 'chat') setUnread(u => u + 1);
        }
      } catch (e: any) {
        addToast(e?.message || '这一幕没接通', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, buildCtx, persist, addToast, page],
  );

  /** 公屏输入：连麦中就当麦上说话（文字），没连麦就是弹幕 */
  const sendPublic = useCallback(
    (text: string) => {
      const cur = sessionRef.current;
      if (!cur) return;
      const kind: WatchPublicAction['kind'] = cur.cast.mic === 'on' ? 'mic_line' : 'danmaku';
      void runAdvance([{ id: watchId('act'), kind, text }]);
    },
    [runAdvance],
  );

  const toggleMic = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    const on = cur.cast.mic === 'on';
    void runAdvance([{ id: watchId('act'), kind: on ? 'mic_off' : 'mic_on' }]);
  }, [runAdvance]);

  const summon = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    await persist({ ...cur, cast: { ...cur.cast, presence: 'side', petVisible: true }, updatedAt: Date.now() });
    addToast(`${char.name}进来了`, 'success');
  }, [persist, char.name, addToast]);

  const hidePet = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    await persist({ ...cur, cast: { ...cur.cast, petVisible: false }, updatedAt: Date.now() });
  }, [persist]);

  // ==================== 私聊 ====================

  const sendChat = useCallback(
    async (payload: {
      text?: string;
      sticker?: string;
      quote?: WatchChatMessage['quote'];
      transfer?: WatchChatMessage['transfer'];
    }) => {
      const cur = sessionRef.current;
      if (!cur || busy) return;
      if (cur.legacy) return;
      setBusy('chat');
      try {
        const ctx = await buildCtx();
        const r = await chatRound({ ...ctx, session: cur, ...payload });
        let next = r.session;
        try {
          next = await maybeDigest({ ...ctx, session: next });
        } catch {
          /* 同上 */
        }
        await persist(next);
        if (r.bubble) setBubble(r.bubble);
      } catch (e: any) {
        addToast(e?.message || '她这条没回上来', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, buildCtx, persist, addToast],
  );

  /** 把当前这一幕作为片段转发进私聊，并让她接一句 */
  const forwardBeat = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    const beat = cur.beats[cur.beats.length - 1];
    if (!beat) {
      addToast('还没有画面可以转', 'info');
      return;
    }
    if (busy) return;
    setBusy('chat');
    try {
      const ctx = await buildCtx();
      const r = await chatRound({
        ...ctx,
        session: cur,
        clip: {
          beatIndex: beat.index,
          streamerName: cur.room.streamerName,
          scene: beat.scene,
          speech: beat.speech,
          danmaku: beat.danmaku.map(d => `${d.author}：${d.text}`),
        },
      });
      let next = r.session;
      try {
        next = await maybeDigest({ ...ctx, session: next });
      } catch {
        /* 转发不因为总结失败而失败 */
      }
      await persist(next);
      if (r.bubble) setBubble(r.bubble);
      if (page !== 'chat') setUnread(u => u + 1);
      addToast('转进私聊了', 'success');
    } catch (e: any) {
      addToast(e?.message || '没转过去', 'error');
    } finally {
      setBusy(null);
    }
  }, [busy, buildCtx, persist, addToast, page]);

  const playMessageVoice = useCallback(
    async (msg: WatchChatMessage) => {
      if (!voiceReady) {
        addToast('这个角色还没配好语音，先去角色里挑个声音', 'info');
        return;
      }
      const audioKey = `msg:${msg.id}`;
      if (playingKey === audioKey) {
        const audio = audioRef.current;
        if (audio) stopVoiceAudio(audio);
        setPlayingKey(null);
        return;
      }
      setLoadingKey(audioKey);
      try {
        let url = await loadWatchVoiceUrl(msg.id);
        if (!url) {
          url = await synthesizeWatchVoice({
            key: msg.id,
            text: msg.text || '',
            char,
            apiConfig,
          });
          if (!msg.voiceId) await patchChat(msg.id, { voiceId: msg.id });
        }
        await playUrl(audioKey, url);
      } catch (e: any) {
        setLoadingKey(null);
        addToast(e?.message || '这条语音没合成出来', 'error');
      }
    },
    [voiceReady, playingKey, char, apiConfig, patchChat, playUrl, addToast],
  );

  const resendAsVoice = useCallback(
    async (msg: WatchChatMessage) => {
      await patchChat(msg.id, { wantVoice: true });
      await playMessageVoice({ ...msg, wantVoice: true });
    },
    [patchChat, playMessageVoice],
  );

  const downloadVoice = useCallback(
    async (msg: WatchChatMessage) => {
      if (!voiceReady) return;
      try {
        await downloadWatchVoice({
          key: msg.id,
          text: msg.text || '',
          char,
          apiConfig,
          name: `${char.name}_voice`,
        });
      } catch (e: any) {
        addToast(e?.message || '语音没下载成', 'error');
      }
    },
    [voiceReady, char, apiConfig, addToast],
  );

  const translateMessage = useCallback(
    async (msg: WatchChatMessage) => {
      if (!msg.text || busy) return;
      setBusy('translate');
      try {
        const text = await translateWatchText({ apiConfig, char, text: msg.text });
        if (!text) throw new Error('这句翻不出来');
        await patchChat(msg.id, { translation: text });
      } catch (e: any) {
        addToast(e?.message || '翻译没成', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, apiConfig, char, patchChat, addToast],
  );

  // ==================== 麦上语音：只在角色说话时出声 ====================

  const micAutoRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const cur = session;
    if (!cur || cur.cast.presence === 'solo' || !voiceReady) return;
    const beat = [...cur.beats].reverse().find(b => b.charMicLine);
    if (!beat?.charMicLine) return;
    if (beat.charMicVoiceId || micAutoRef.current.has(beat.id)) return;
    micAutoRef.current.add(beat.id);
    const text = beat.charMicLine;
    void (async () => {
      setLoadingKey(`mic:${beat.id}`);
      try {
        const url = await synthesizeWatchVoice({ key: beat.id, text, char, apiConfig });
        const live = sessionRef.current;
        if (live) {
          await persist({
            ...live,
            beats: live.beats.map(b => (b.id === beat.id ? { ...b, charMicVoiceId: beat.id } : b)),
            updatedAt: Date.now(),
          });
        }
        await playUrl(`mic:${beat.id}`, url);
      } catch {
        setLoadingKey(null);
        /* 语音合成不出来就只留文字，不影响这条麦上发言 */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.beats.length, session?.cast.mic, voiceReady]);

  const playMicLine = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || !voiceReady) {
      if (!voiceReady) addToast('这个角色还没配好语音', 'info');
      return;
    }
    const beat = [...cur.beats].reverse().find(b => b.charMicLine);
    if (!beat?.charMicLine) return;
    const key = `mic:${beat.id}`;
    if (playingKey === key) {
      const audio = audioRef.current;
      if (audio) stopVoiceAudio(audio);
      setPlayingKey(null);
      return;
    }
    setLoadingKey(key);
    try {
      let url = await loadWatchVoiceUrl(beat.id);
      if (!url) {
        url = await synthesizeWatchVoice({ key: beat.id, text: beat.charMicLine, char, apiConfig });
        if (!beat.charMicVoiceId) {
          await persist({
            ...cur,
            beats: cur.beats.map(b => (b.id === beat.id ? { ...b, charMicVoiceId: beat.id } : b)),
            updatedAt: Date.now(),
          });
        }
      }
      await playUrl(key, url);
    } catch (e: any) {
      setLoadingKey(null);
      addToast(e?.message || '麦上那句没合成出来', 'error');
    }
  }, [voiceReady, playingKey, char, apiConfig, persist, playUrl, addToast]);

  // ==================== 导演 / 总结 / 退房 ====================

  const applyDirector = useCallback(
    async (next: { stageCue: string; charCue: string }) => {
      const cur = sessionRef.current;
      if (!cur) return;
      setDirectorOpen(false);
      await persist({
        ...cur,
        stageCue: next.stageCue || undefined,
        charCue: next.charCue || undefined,
        director: '',
        updatedAt: Date.now(),
      });
      addToast(next.stageCue || next.charCue ? '记下了，下一轮照这个走' : '导演栏清空了', 'success');
    },
    [persist, addToast],
  );

  const rewriteSummary = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || busy) return;
    setBusy('recap');
    try {
      const ctx = await buildCtx();
      const r = await rewriteRecap({ ...ctx, session: cur });
      await persist(r.session);
    } catch (e: any) {
      addToast(e?.message || '重写没成', 'error');
    } finally {
      setBusy(null);
    }
  }, [busy, buildCtx, persist, addToast]);

  const forceDigestNow = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || busy) return;
    setBusy('digest');
    try {
      const ctx = await buildCtx();
      const next = await forceDigest({ ...ctx, session: cur });
      if (next.digests.length === cur.digests.length) {
        addToast(`除了最近 ${settings.summaryKeepRecent} 幕，没有可压的了`, 'info');
      }
      await persist(next);
    } catch (e: any) {
      addToast(e?.message || '压不出来', 'error');
    } finally {
      setBusy(null);
    }
  }, [busy, buildCtx, persist, settings.summaryKeepRecent, addToast]);

  const rewriteOneDigest = useCallback(
    async (digestId: string) => {
      const cur = sessionRef.current;
      if (!cur || busy) return;
      setBusy('digest');
      try {
        const ctx = await buildCtx();
        const next = await rewriteDigest({ ...ctx, session: cur, digestId });
        await persist(next);
      } catch (e: any) {
        addToast(e?.message || '这段重写没成', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, buildCtx, persist, addToast],
  );

  const openExit = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    setExitOpen(true);
    if (!cur.recap && settings.recapAuto && !busy) {
      setBusy('recap');
      try {
        const ctx = await buildCtx();
        const r = await rewriteRecap({ ...ctx, session: cur });
        await persist(r.session);
      } catch {
        /* 写不出来就让用户自己写 */
      } finally {
        setBusy(null);
      }
    }
  }, [settings.recapAuto, busy, buildCtx, persist]);

  const leaveRoom = useCallback(
    async (opts: { recap: string; intoChat: boolean }) => {
      const cur = sessionRef.current;
      if (!cur) return;
      setExitOpen(false);
      try {
        // 回顾被手改过就记下来，以后自动重写不覆盖
        const edited = opts.recap && opts.recap !== (cur.recap || '');
        let next: WatchAlongSession = {
          ...cur,
          status: 'ended',
          endedAt: Date.now(),
          recap: opts.recap || cur.recap || undefined,
          recapEdited: edited ? true : cur.recapEdited,
          updatedAt: Date.now(),
        };
        try {
          const ctx = await buildCtx();
          const r = await finishSession({ ...ctx, session: next });
          next = { ...r.session, recap: opts.recap || r.recap || r.session.recap };
          if (edited) next.recapEdited = true;
        } catch {
          /* 结束流程里的自动回顾失败也不拦退房 */
        }

        if (opts.intoChat && next.recap) {
          const card: LivestreamChatCardPayload = {
            type: 'livestream_card',
            cardKind: 'npc_watch',
            sessionId: next.id,
            charId: next.charId,
            charName: char.name,
            channelName: `${next.room.streamerName} · ${next.room.category}`,
            title: `陪看 · ${next.room.title}`,
            categoryLabel: next.room.category,
            npcStreamerName: next.room.streamerName,
            npcRoomTitle: next.room.title,
            viewerCount: next.room.viewerCount,
            summary: next.recap,
            createdAt: Date.now(),
          };
          await DB.saveMessage({
            charId: char.id,
            role: 'assistant',
            type: 'score_card',
            content: cardMessageContent(card),
            metadata: { source: 'watch_along', scoreCard: card },
          });
        }

        await persist(next);
        setSession(null);
        setPage('lobby');
        setUnread(0);
        addToast(opts.intoChat ? '收场了，回顾写进主聊天了' : '收场了，只留在陪看历史', 'success');
      } catch (e: any) {
        addToast(e?.message || '退房没成，记录还在', 'error');
      }
    },
    [char.id, char.name, buildCtx, persist, addToast],
  );

  // ==================== 历史 / 设置 ====================

  const openSession = useCallback(async (target: WatchAlongSession) => {
    setSession(target);
    setUnread(0);
    setPage(target.status === 'ended' ? 'summary' : 'room');
  }, []);

  const removeSession = useCallback(
    async (target: WatchAlongSession) => {
      await deleteWatchSession(target.id);
      await forgetWatchVoices(collectVoiceIds(target));
      setSessions(prev => prev.filter(s => s.id !== target.id));
      if (sessionRef.current?.id === target.id) {
        setSession(null);
        setPage('lobby');
      }
      addToast('这条陪看记录删了', 'success');
    },
    [addToast],
  );

  const saveSettings = useCallback(
    async (next: WatchSettingsType) => {
      await saveGlobals({ ...globals, settings: next });
    },
    [globals, saveGlobals],
  );

  const changeUserAccount = useCallback(
    async (next: WatchAccount) => {
      await saveGlobals({ ...globals, userAccount: next });
      const cur = sessionRef.current;
      if (cur) await persist({ ...cur, cast: { ...cur.cast, userAccount: next }, updatedAt: Date.now() });
    },
    [globals, saveGlobals, persist],
  );

  const changeCharAccount = useCallback(
    async (next: WatchAccount) => {
      await saveGlobals({ ...globals, charAccount: next });
      const cur = sessionRef.current;
      if (cur) await persist({ ...cur, cast: { ...cur.cast, charAccount: next }, updatedAt: Date.now() });
    },
    [globals, saveGlobals, persist],
  );

  const suggestAccount = useCallback(
    async (target: 'user' | 'char') => {
      setAccountBusy(target);
      try {
        const res = await suggestAccountName({
          apiConfig,
          char,
          userName: userProfile?.name || '你',
          target,
          current: target === 'user' ? globals.userAccount.nickname : globals.charAccount.nickname,
        });
        const next: WatchAccount = {
          ...(target === 'user' ? globals.userAccount : globals.charAccount),
          nickname: res.nickname,
          number: res.number,
        };
        if (target === 'user') await changeUserAccount(next);
        else await changeCharAccount(next);
      } catch (e: any) {
        addToast(e?.message || '起名没成，自己填也行', 'error');
      } finally {
        setAccountBusy(null);
      }
    },
    [apiConfig, char, userProfile?.name, globals.userAccount, globals.charAccount, changeUserAccount, changeCharAccount, addToast],
  );

  /** 私聊里长按「删除」/ 麦上或私聊里的动作，都走这里 */
  const deleteMessage = useCallback(
    async (msg: WatchChatMessage) => {
      await dropChat(msg.id);
      if (msg.voiceId) void forgetWatchVoices([msg.voiceId]);
    },
    [dropChat],
  );

  const charAvatar = char.avatar;
  const chatBusy = busy === 'chat' || busy === 'translate';
  const listeningMic = playingKey?.startsWith('mic:') === true;
  const listeningMsgId = playingKey?.startsWith('msg:') ? playingKey.slice(4) : null;
  const loadingMsgId = loadingKey?.startsWith('msg:') ? loadingKey.slice(4) : null;

  // ==================== 渲染 ====================

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[13px]" style={{ background: W.page, color: W.sub }}>
        正在翻陪看记录…
      </div>
    );
  }

  if (page === 'lobby' || !session) {
    return (
      <>
        <WatchLobby
          userName={userProfile?.name || '你'}
          pool={globals.pool}
          customRule={globals.customRule}
          busy={busy === 'pool'}
          sessions={sessions}
          onRefresh={() => void refreshPool()}
          onEditRule={() => {
            setRuleDraft(globals.customRule);
            setRuleOpen(true);
          }}
          onStart={room => void startRoom(room)}
          onOpenSession={id => {
            const target = sessions.find(s => s.id === id);
            if (target) void openSession(target);
          }}
          onOpenHistory={() => setPage('history')}
          onOpenSettings={() => setPage('settings')}
        />

        <Sheet
          open={ruleOpen}
          title="想看点什么样的"
          onClose={() => setRuleOpen(false)}
          footer={
            <SolidButton
              onClick={() => {
                setRuleOpen(false);
                void saveGlobals({ ...globals, customRule: ruleDraft.trim() }).then(() => refreshPool());
              }}
            >
              照这个换一批
            </SolidButton>
          }
        >
          <div className="px-4 pb-3">
            <div className="pt-1 text-[11.5px] leading-[17px]" style={{ color: W.sub }}>
              写一句就行，比如「深夜看相、情感连线，越离谱越好」。
            </div>
            <textarea
              value={ruleDraft}
              onChange={e => setRuleDraft(e.target.value)}
              rows={4}
              aria-label="看播口味"
              placeholder="想看的类型、气氛、离谱程度…"
              className="mt-2 w-full resize-none px-3 py-2.5 text-[13px] leading-[19px] outline-none placeholder:text-[#ADADAD]"
              style={{ borderRadius: 12, background: W.fill, color: W.ink }}
            />
          </div>
        </Sheet>
      </>
    );
  }

  if (page === 'history') {
    return (
      <WatchHistory
        sessions={sessions}
        onBack={() => setPage(session ? 'room' : 'lobby')}
        onOpen={target => void openSession(target)}
        onOpenRecap={target => void openSession(target)}
        onDelete={target => void removeSession(target)}
      />
    );
  }

  if (page === 'settings') {
    return (
      <WatchSettings
        settings={settings}
        userAccount={globals.userAccount}
        charAccount={globals.charAccount}
        charName={char.name}
        busyAccount={accountBusy}
        onBack={() => setPage(session ? 'room' : 'lobby')}
        onChangeSettings={next => void saveSettings(next)}
        onChangeUserAccount={next => void changeUserAccount(next)}
        onChangeCharAccount={next => void changeCharAccount(next)}
        onSuggestAccount={target => void suggestAccount(target)}
      />
    );
  }

  if (page === 'summary') {
    return (
      <WatchSummary
        session={session}
        keepRecent={settings.summaryKeepRecent}
        busy={busy === 'recap' ? 'recap' : busy === 'digest' ? 'digest' : null}
        onBack={() => setPage(session.status === 'ended' ? 'history' : 'room')}
        onRewriteRecap={() => void rewriteSummary()}
        onEditRecap={text => void persist(applyRecapEdit(session, text))}
        onRewriteDigest={id => void rewriteOneDigest(id)}
        onEditDigest={(id, text) => void persist(applyDigestEdit(session, id, text))}
        onDeleteDigest={id => void persist(removeDigest(session, id))}
        onForceDigest={() => void forceDigestNow()}
      />
    );
  }

  if (page === 'chat') {
    return (
      <>
        <WatchChat
          session={session}
          charName={char.name}
          charAvatar={charAvatar}
          busy={chatBusy}
          emojis={emojis}
          categories={categories}
          playingId={listeningMsgId}
          loadingId={loadingMsgId}
          voiceReady={voiceReady}
          onBack={() => setPage('room')}
          onOpenRoom={() => setPage('room')}
          onOpenDirector={() => setDirectorOpen(true)}
          onSend={payload => void sendChat(payload)}
          onPlayVoice={msg => void playMessageVoice(msg)}
          onDownloadVoice={msg => void downloadVoice(msg)}
          onTranslate={msg => void translateMessage(msg)}
          onDelete={msg => void deleteMessage(msg)}
          onToggleVoiceReply={on => {
            void persist({ ...session, cast: { ...session.cast, voiceReply: on }, updatedAt: Date.now() });
          }}
          onResendAsVoice={msg => void resendAsVoice(msg)}
        />
        <WatchDirector
          open={directorOpen}
          charName={char.name}
          stageCue={session.stageCue || ''}
          charCue={session.charCue || ''}
          disabled={session.legacy}
          onClose={() => setDirectorOpen(false)}
          onApply={next => void applyDirector(next)}
        />
      </>
    );
  }

  return (
    <>
      <WatchRoom
        session={session}
        charName={char.name}
        charAvatar={charAvatar}
        busy={busy === 'advance'}
        bubble={bubble}
        chatUnread={unread}
        micPlaying={listeningMic}
        micLoading={loadingKey?.startsWith('mic:') === true}
        onPlayMic={() => void playMicLine()}
        onBack={() => {
          setSession(null);
          setPage('lobby');
        }}
        onAdvance={() => void runAdvance()}
        onForward={() => void forwardBeat()}
        onSendDanmaku={sendPublic}
        onMicToggle={toggleMic}
        onOpenChat={() => {
          setUnread(0);
          setPage('chat');
        }}
        onOpenDirector={() => setDirectorOpen(true)}
        onOpenSummary={() => setPage('summary')}
        onOpenSettings={() => setPage('settings')}
        onExit={() => void openExit()}
        onSummon={() => void summon()}
        onHidePet={() => void hidePet()}
      />

      <WatchDirector
        open={directorOpen}
        charName={char.name}
        stageCue={session.stageCue || ''}
        charCue={session.charCue || ''}
        disabled={session.legacy}
        onClose={() => setDirectorOpen(false)}
        onApply={next => void applyDirector(next)}
      />

      <WatchExit
        open={exitOpen}
        session={session}
        busy={busy === 'recap'}
        onClose={() => setExitOpen(false)}
        onRewrite={() => void rewriteSummary()}
        onLeave={opts => void leaveRoom(opts)}
      />
    </>
  );
}
