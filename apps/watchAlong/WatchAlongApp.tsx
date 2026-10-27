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
import { parseVoiceOutput } from '../../utils/minimaxTts';
import { canSynthesizeSpeech } from '../../utils/ttsRouter';
import { playVoiceAudio, shouldAutoGenerateVoice, stopVoiceAudio, voicePlaybackErrorMessage } from '../../utils/voicePlayback';
import { cardMessageContent } from '../../utils/liveStreamStorage';
import type { LivestreamChatCardPayload } from '../../utils/liveStreamTypes';
import type {
  CharacterProfile,
  Emoji,
  EmojiCategory,
  UserProfile,
} from '../../types';
import { WatchLobby } from '../../components/watchAlong/WatchLobby';
import { WatchRoom, type WatchPublicLineRef } from '../../components/watchAlong/WatchRoom';
import { WatchChat } from '../../components/watchAlong/WatchChat';
import { WatchDirector } from '../../components/watchAlong/WatchDirector';
import { WatchHistory } from '../../components/watchAlong/WatchHistory';
import { WatchSummary } from '../../components/watchAlong/WatchSummary';
import { WatchSettings } from '../../components/watchAlong/WatchSettings';
import { WatchExit } from '../../components/watchAlong/WatchExit';
import { WatchInfo } from '../../components/watchAlong/WatchInfo';
import {
  Sheet,
  SolidButton,
  W,
  WIco,
} from '../../components/watchAlong/chrome';
import {
  advanceRound,
  appendLivePublic,
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
  repairWatchBeats,
  suggestAccountName,
  suggestTaste,
} from '../../utils/watchAlong/engine';
import {
  applyDigestEdit,
  applyRecapEdit,
  collectVoiceIds,
  createSession,
  deleteWatchSession,
  loadCharWatchAccount,
  loadWatchGlobals,
  loadWatchSessions,
  removeDigest,
  saveCharWatchAccount,
  saveWatchGlobals,
  saveWatchSession,
} from '../../utils/watchAlong/storage';
import {
  downloadWatchVoice,
  forgetWatchVoices,
  loadWatchVoiceUrl,
  shownWatchText,
  synthesizeWatchVoice,
  watchLineIsVoice,
} from '../../utils/watchAlong/voice';
import type {
  WatchAccount,
  WatchAlongSession,
  WatchChatMessage,
  WatchGlobals,
  WatchPublicAction,
  WatchRoomCard,
  WatchSeqItem,
  WatchSettings as WatchSettingsType,
} from '../../utils/watchAlong/types';
import { defaultGlobals, watchId } from '../../utils/watchAlong/types';

type Page = 'lobby' | 'room' | 'chat' | 'history' | 'settings' | 'summary';

/**
 * 手改的画面和台词写回屏幕正在读的 seq。
 * 台词里有 ▸，左边是原话、右边是中文。没有 ▸，就按改完的这句显示，不再挂旧译文。
 */
function seqFromEdited(scene: string, speech: string): WatchSeqItem[] {
  const scenes = scene
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(text => ({ kind: 'scene' as const, text }));
  const lines = speech
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(raw => {
      const at = raw.indexOf('▸');
      if (at < 0) return { kind: 'line' as const, text: raw };
      const left = raw.slice(0, at).trim();
      const right = raw.slice(at + 1).trim();
      if (!left) return { kind: 'line' as const, text: right };
      if (!right) return { kind: 'line' as const, text: left };
      return { kind: 'line' as const, text: left, translated: right };
    });
  return [...scenes, ...lines];
}

/** 一次生成中用来挡住重复点按 */
type Busy =
  | null
  | 'advance'
  | 'chat'
  | 'repair'
  | 'pool'
  | 'recap'
  | 'digest'
  | 'account';

/**
 * 最近一次角色回复：上一条用户消息或片段之后，到下一条用户消息或片段之前。
 * 没有角色消息时返回空。
 */
function lastCharReplySpan(chat: WatchChatMessage[]): { start: number; end: number } | null {
  let lastChar = -1;
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i].from === 'char') {
      lastChar = i;
      break;
    }
  }
  if (lastChar < 0) return null;
  let start = lastChar;
  while (start > 0 && chat[start - 1].from !== 'user' && chat[start - 1].from !== 'clip') start -= 1;
  let end = lastChar;
  while (end + 1 < chat.length && chat[end + 1].from !== 'user' && chat[end + 1].from !== 'clip') end += 1;
  return { start, end };
}

export default function WatchAlongApp({
  char: charProp,
  onClose,
}: {
  /** 从电波带进来的角色，只当默认值；大厅里可以换成别的角色 */
  char: CharacterProfile;
  /** 退出陪看，回到电波大厅 */
  onClose: () => void;
}) {
  const { apiConfig, apiPresets, userProfile, characters, addToast, registerBackHandler } = useOS();

  // 陪你看的是谁：先按电波带进来的这个，大厅里能换
  const [companionId, setCompanionId] = useState(charProp.id);
  const char = useMemo(
    () => characters.find(c => c.id === companionId) || charProp,
    [characters, companionId, charProp],
  );
  const companions = useMemo(
    () => (characters.length ? characters : [charProp]),
    [characters, charProp],
  );

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
  const [infoOpen, setInfoOpen] = useState(false);
  /** 打开本场信息时，正在看的是哪一幕 */
  const [infoBeatIndex, setInfoBeatIndex] = useState<number | undefined>(undefined);
  const [tasteBusy, setTasteBusy] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState('');
  /** 这次口味确认之后：换掉整批，还是接在现有房间后面 */
  const [poolMode, setPoolMode] = useState<'replace' | 'append'>('replace');
  /** 再刷一批成功才 +1，大厅据此滚到新内容那一头 */
  const [tailToken, setTailToken] = useState(0);
  const [accountBusy, setAccountBusy] = useState<'user' | 'char' | null>(null);

  // 大厅长按卡片：就地改这一场的直播信息
  const [editingRoom, setEditingRoom] = useState<WatchRoomCard | null>(null);
  const [roomDraft, setRoomDraft] = useState({
    streamerName: '',
    streamerHandle: '',
    category: '',
    title: '',
    bio: '',
  });

  // 声音：一条通道，key 是「谁的哪一条」，播新的先把旧的停掉
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const sessionRef = useRef<WatchAlongSession | null>(null);
  sessionRef.current = session;
  const settings = globals.settings;
  const voiceReady = useMemo(() => canSynthesizeSpeech(char, apiConfig), [char, apiConfig]);

  // 刷台闸门：同一批不重复刷，换角色时放开
  const refreshPoolRef = useRef(false);

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
        // 角色的陪看号跟着角色走：换个角色就换成他自己那一份
        const charAccount = await loadCharWatchAccount(char.id, char.name, g.charAccount);
        if (!alive) return;
        setGlobals({ ...g, charAccount });
        const mine = list.filter(s => s.charId === char.id);
        setSessions(mine);
        // 进陪看先落在大厅（Ann 2026-10-26：点陪看进的是陪看主页）。
        // 没退房的那场接回来，等在大厅「还在看」横条里，点它才进房间。
        const live = mine.find(s => s.status === 'watching');
        if (live) setSession(live);
        // 换了个角色就把「刷台闸门」放开，新角色这边也刷一批
        refreshPoolRef.current = false;
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
        if (infoOpen) {
          setInfoOpen(false);
          return true;
        }
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
    [infoOpen, directorOpen, exitOpen, ruleOpen, page, session, registerBackHandler],
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

  const refreshPool = useCallback(async (ruleOverride?: string, mode: 'replace' | 'append' = 'replace') => {
    if (busy) return;
    setBusy('pool');
    // 追加时用这一下调用里的池子做底。生成的那几秒里不要把已经在的房间丢掉。
    const basePool = globals.pool;
    const rule = ruleOverride ?? globals.customRule;
    try {
      const rooms = await generateRoomPool({
        apiConfig,
        char,
        userName: userProfile?.name || '你',
        // 刚在口味面板里写的一句要立刻用上：保存和刷新是两个先后动作，
        // 刷新拿不到刚存进 state 的新值，所以由调用方把新口味直接传进来。
        customRule: rule,
        count: 6,
        exclude: basePool.map(r => r.streamerName),
      });
      if (!rooms.length) throw new Error('这次一个房间都没刷出来，再点一次试试');
      let pool = rooms;
      let added = rooms.length;
      if (mode === 'append') {
        const names = new Set(basePool.map(r => r.streamerName));
        const extra = rooms.filter(r => r.streamerName && !names.has(r.streamerName));
        pool = [...basePool, ...extra];
        added = extra.length;
      }
      const next = { ...globals, customRule: rule, pool };
      setGlobals(next);
      await saveWatchGlobals(next);
      if (mode === 'append' && added > 0) setTailToken(n => n + 1);
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

  // ==================== 大厅长按卡片 ====================

  /** 点「编辑本场信息」：把卡片现在的值填进草稿 */
  const openPoolEdit = useCallback((room: WatchRoomCard) => {
    setEditingRoom(room);
    setRoomDraft({
      streamerName: room.streamerName,
      streamerHandle: room.streamerHandle,
      category: room.category,
      title: room.title,
      bio: room.bio,
    });
  }, []);

  /** 草稿存回去：大厅卡片改掉，这一场要是正开着，房间里那份也跟着改 */
  const savePoolRoom = useCallback(
    async (room: WatchRoomCard, draft: typeof roomDraft) => {
      const patch = {
        streamerName: draft.streamerName.trim().slice(0, 20) || '主播',
        streamerHandle: draft.streamerHandle.trim().slice(0, 24),
        category: draft.category.trim().slice(0, 12),
        title: draft.title.trim().slice(0, 40),
        bio: draft.bio.trim().slice(0, 160),
      };
      await saveGlobals({
        ...globals,
        pool: globals.pool.map(r => (r.id === room.id ? { ...r, ...patch } : r)),
      });
      // 会话里的 room 没有 id，按改之前的账号对上
      const live = sessions.find(
        s => s.status === 'watching' && !s.legacy && s.room.streamerHandle === room.streamerHandle,
      );
      if (live) {
        await persist({ ...live, room: { ...live.room, ...patch }, updatedAt: Date.now() });
      }
    },
    [globals, saveGlobals, sessions, persist],
  );

  /** 点「从列表里删掉」：只是不在大厅出现，看过的那场还在历史里 */
  const removeRoomFromPool = useCallback(
    async (roomId: string) => {
      await saveGlobals({
        ...globals,
        pool: globals.pool.filter(r => r.id !== roomId),
      });
    },
    [globals, saveGlobals],
  );

  const startRoom = useCallback(
    async (room: WatchRoomCard) => {
      if (busy) return;
      // 这个房间本来就有一场还在看的：直接接着看，不重开一场、不重刷第一幕。
      // 只认「还在看」的那场——已经结束的和老记录都不算，否则点一个新房间会把旧场接回来。
      const live = sessions.find(
        s => s.status === 'watching' && !s.legacy && s.room.streamerHandle === room.streamerHandle,
      );
      if (live) {
        setSession(live);
        setPage('room');
        setUnread(0);
        return;
      }
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
    [
      busy,
      char.id,
      char.name,
      settings,
      globals.userAccount,
      globals.charAccount,
      sessions,
      persist,
      buildCtx,
      addToast,
    ],
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
        if (r.failed) addToast('这一幕没接通，再点一次「下一幕」', 'error');
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

  /**
   * 长按画面：把最新这一段重新生成一遍。
   * 只允许最新那一段——旧段重来会让它后面所有段的内容对不上。
   */
  const runRegenerate = useCallback(
    async (beatIndex?: number) => {
      const cur = sessionRef.current;
      if (!cur || busy) return;
      if (cur.legacy) {
        addToast('这是旧版记录，只能翻看', 'info');
        return;
      }
      const lastIdx = cur.beats.length - 1;
      if (lastIdx < 0) return;
      if (typeof beatIndex === 'number' && beatIndex !== lastIdx) {
        addToast('只能重来最新那一段，往右点回到最新再长按', 'info');
        return;
      }
      // 把这一段拿掉重新播一遍；这一段里我在公屏做的事留着，不然我刚才说的话就没了
      const lastBeat = cur.beats[lastIdx];
      const trimmed: WatchAlongSession = { ...cur, beats: cur.beats.slice(0, lastIdx) };
      setBusy('advance');
      try {
        const ctx = await buildCtx();
        const r = await advanceRound({ ...ctx, session: trimmed, myActions: lastBeat.userActions });
        let next = r.session;
        try {
          next = await maybeDigest({ ...ctx, session: next });
        } catch {
          /* 压不动不影响这一轮 */
        }
        await persist(next);
        if (r.failed) addToast('这一段没接通，再长按一次', 'error');
        if (r.bubble) setBubble(r.bubble);
      } catch (e: any) {
        addToast(e?.message || '这一段没接通', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, buildCtx, persist, addToast],
  );

  /** 公屏输入：连麦中就当麦上说话（文字），没连麦就是弹幕。先留在当前幕，不为此开新段。 */
  const sendPublic = useCallback(
    (text: string) => {
      const cur = sessionRef.current;
      if (!cur) return;
      if (cur.legacy) {
        addToast('这是旧版记录，只能翻看，不能再往下演', 'info');
        return;
      }
      const kind: WatchPublicAction['kind'] = cur.cast.mic === 'on' ? 'mic_line' : 'danmaku';
      void persist(appendLivePublic(cur, { id: watchId('act'), kind, text }));
    },
    [persist, addToast],
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

  /** 收起之后再放出来（人一直还在，只是刚才藏了） */
  const showPet = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    await persist({ ...cur, cast: { ...cur.cast, petVisible: true }, updatedAt: Date.now() });
  }, [persist]);

  // ==================== 私聊 ====================

  const sendingRef = useRef(false);
  const sendChat = useCallback(
    async (payload: {
      text?: string;
      sticker?: string;
      quote?: WatchChatMessage['quote'];
      transfer?: WatchChatMessage['transfer'];
    }) => {
      const cur = sessionRef.current;
      if (!cur || busy || sendingRef.current) return;
      if (cur.legacy) return;
      // 只把这句落进记录。不要亮「正在回复」的头像，角色等用户点「触发」才回。
      sendingRef.current = true;
      try {
        const ctx = await buildCtx();
        const r = await chatRound({
          ...ctx,
          session: cur,
          ...payload,
          logOnly: true,
          onLogged: next => persist(next),
        });
        await persist(r.session);
      } catch (e: any) {
        addToast(e?.message || '这条没发出去', 'error');
      } finally {
        sendingRef.current = false;
      }
    },
    [busy, buildCtx, persist, addToast],
  );

  /** 手动触发：不新加我的消息，只让角色接着往下说 */
  const triggerReaction = useCallback(
    async (assign?: string) => {
      const cur = sessionRef.current;
      if (!cur || busy) return;
      if (cur.legacy) {
        addToast('这是旧版记录，只能翻看', 'info');
        return;
      }
      if (cur.cast.presence === 'solo') {
        addToast(`先把${char.name}叫进来，ta 才接得上话`, 'info');
        return;
      }
      setBusy('chat');
      try {
        const ctx = await buildCtx();
        const r = await chatRound({ ...ctx, session: cur, manual: !assign, assign });
        let next = r.session;
        try {
          next = await maybeDigest({ ...ctx, session: next });
        } catch {
          /* 压不动不影响这一轮 */
        }
        await persist(next);
        if (r.failed) addToast(`${char.name}这条没接上，再触发一次`, 'error');
        if (r.bubble) setBubble(r.bubble);
      } catch (e: any) {
        addToast(e?.message || '这条没回上来', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, buildCtx, persist, addToast, char.name],
  );

  /** 先从界面拿掉角色最近一次回复，再按「触发」那条路重写 */
  const regenerateLastReply = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || busy) return;
    if (cur.legacy) {
      addToast('这是旧版记录，只能翻看', 'info');
      return;
    }
    if (cur.cast.presence === 'solo') {
      addToast(`先把${char.name}叫进来，ta 才接得上话`, 'info');
      return;
    }
    const span = lastCharReplySpan(cur.chat);
    if (!span) return;
    const removed = cur.chat.slice(span.start, span.end + 1);
    const keptBefore = cur.chat.slice(0, span.start);
    const keptAfter = cur.chat.slice(span.end + 1);
    const base: WatchAlongSession = {
      ...cur,
      chat: [...keptBefore, ...keptAfter],
      updatedAt: Date.now(),
    };
    setBusy('chat');
    const voiceIds = removed.map(m => m.voiceId).filter((id): id is string => Boolean(id));
    if (voiceIds.length) void forgetWatchVoices(voiceIds);
    try {
      await persist(base);
      const ctx = await buildCtx();
      const r = await chatRound({ ...ctx, session: base, manual: true });
      if (r.failed) {
        addToast(`${char.name}这条没接上，再重来一次`, 'error');
        return;
      }
      let next: WatchAlongSession = {
        ...r.session,
        updatedAt: Date.now(),
      };
      try {
        next = await maybeDigest({ ...ctx, session: next });
      } catch {
        /* 压不动不影响这一轮 */
      }
      await persist(next);
      if (r.bubble) setBubble(r.bubble);
    } catch (e: any) {
      addToast(e?.message || '没重写出来', 'error');
    } finally {
      setBusy(null);
    }
  }, [busy, buildCtx, persist, addToast, char.name]);

  /** 公屏送个小礼物 */
  const sendGift = useCallback(
    (giftName: string, amount: number) => {
      const cur = sessionRef.current;
      if (!cur) return;
      void runAdvance([{ id: watchId('act'), kind: 'gift', giftName, giftAmount: amount }]);
    },
    [runAdvance],
  );

  /** 同屏陪看 ↔ 仅后台私聊 */
  const togglePresence = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    const side = cur.cast.presence === 'side';
    await persist({
      ...cur,
      cast: { ...cur.cast, presence: side ? 'backstage' : 'side', petVisible: side ? false : true },
      updatedAt: Date.now(),
    });
    addToast(side ? `${char.name}退回后台，只在私聊里跟你说话` : `${char.name}凑过来了`, 'success');
  }, [persist, char.name, addToast]);

  /** 本场自己开 / 关自主反应 */
  const toggleAutoReact = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    const on = !cur.cast.autoReact;
    await persist({ ...cur, cast: { ...cur.cast, autoReact: on }, updatedAt: Date.now() });
    addToast(on ? '开了自主反应，ta 会自己开口' : '关了自主反应，只看你叫不叫 ta', 'success');
  }, [persist, addToast]);

  /** 手改本场直播信息与正在看的这一幕 */
  const saveInfo = useCallback(
    async (next: { room: WatchAlongSession['room']; scene: string; speech: string; beatIndex?: number }) => {
      const cur = sessionRef.current;
      if (!cur) return;
      const target =
        typeof next.beatIndex === 'number'
          ? cur.beats.findIndex(b => b.index === next.beatIndex)
          : cur.beats.length - 1;
      const idx = target >= 0 ? target : cur.beats.length - 1;
      const beats = cur.beats.map((b, i) => {
        if (i !== idx) return b;
        const scene = next.scene || b.scene;
        const seq = seqFromEdited(scene, next.speech);
        const sceneText = seq.filter(s => s.kind === 'scene').map(s => s.text).join('\n');
        const speechText = seq.filter(s => s.kind === 'line').map(s => s.text).join('\n');
        return {
          ...b,
          scene: sceneText || scene,
          speech: speechText,
          seq: seq.length ? seq : undefined,
        };
      });
      await persist({ ...cur, room: next.room, beats, updatedAt: Date.now() });
      setInfoOpen(false);
      addToast('本场信息改好了', 'success');
    },
    [persist, addToast],
  );

  const splitPublicEdit = (raw: string): { text: string; translated?: string } => {
    const at = raw.indexOf('▸');
    if (at < 0) return { text: raw.trim() };
    const text = raw.slice(0, at).trim();
    const translated = raw.slice(at + 1).trim();
    if (!text) return { text: translated };
    return { text, translated: translated || undefined };
  };

  const editPublicLine = useCallback(
    async (line: WatchPublicLineRef, raw: string) => {
      const cur = sessionRef.current;
      if (!cur) return;
      const next = splitPublicEdit(raw);
      if (!next.text) return;
      const patchAction = <T extends { id: string; text?: string; translated?: string }>(list: T[]) =>
        list.map(item => (item.id === line.id ? { ...item, text: next.text, translated: next.translated } : item));
      let pendingPublic = cur.pendingPublic;
      let beats = cur.beats;
      if (line.source === 'pending') {
        pendingPublic = patchAction(cur.pendingPublic ?? []);
      } else if (line.source === 'danmaku') {
        beats = cur.beats.map(b => (b.id === line.beatId ? { ...b, danmaku: patchAction(b.danmaku) } : b));
      } else if (line.source === 'user') {
        beats = cur.beats.map(b => (b.id === line.beatId ? { ...b, userActions: patchAction(b.userActions) } : b));
      } else {
        beats = cur.beats.map(b => (b.id === line.beatId ? { ...b, charActions: patchAction(b.charActions) } : b));
      }
      await persist({ ...cur, pendingPublic, beats, updatedAt: Date.now() });
    },
    [persist],
  );

  const deletePublicLine = useCallback(
    async (line: WatchPublicLineRef) => {
      const cur = sessionRef.current;
      if (!cur) return;
      const drop = <T extends { id: string }>(list: T[]) => list.filter(item => item.id !== line.id);
      let pendingPublic = cur.pendingPublic;
      let beats = cur.beats;
      if (line.source === 'pending') pendingPublic = drop(cur.pendingPublic ?? []);
      else if (line.source === 'danmaku') beats = cur.beats.map(b => (b.id === line.beatId ? { ...b, danmaku: drop(b.danmaku) } : b));
      else if (line.source === 'user') beats = cur.beats.map(b => (b.id === line.beatId ? { ...b, userActions: drop(b.userActions) } : b));
      else beats = cur.beats.map(b => (b.id === line.beatId ? { ...b, charActions: drop(b.charActions) } : b));
      await persist({ ...cur, pendingPublic, beats, updatedAt: Date.now() });
    },
    [persist],
  );

  const repairBeats = useCallback(
    async (indexes: number[]) => {
      const cur = sessionRef.current;
      if (!cur || !indexes.length || busy) return;
      setBusy('repair');
      try {
        const picked = cur.beats.filter(b => indexes.includes(b.index));
        const fixed = await repairWatchBeats({
          apiConfig,
          char,
          language: cur.room.profile?.language,
          beats: picked,
        });
        const byId = new Map(fixed.map(b => [b.id, b]));
        await persist({
          ...cur,
          beats: cur.beats.map(b => byId.get(b.id) || b),
          updatedAt: Date.now(),
        });
        addToast('选中的段已经按格式补过', 'success');
      } catch (e: any) {
        addToast(e?.message || '格式没补上', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, apiConfig, char, persist, addToast],
  );

  /** 大厅里让辅助模型代笔一句口味 */
  const suggestTasteNow = useCallback(async () => {
    if (tasteBusy) return;
    setTasteBusy(true);
    try {
      const text = await suggestTaste({
        apiConfig,
        char,
        userName: userProfile?.name || '你',
        current: ruleDraft,
      });
      if (text) setRuleDraft(text);
    } catch (e: any) {
      addToast(e?.message || '没想出来，自己写一句也行', 'error');
    } finally {
      setTasteBusy(false);
    }
  }, [tasteBusy, apiConfig, char, userProfile?.name, ruleDraft, addToast]);

  /** 把当前这一幕作为片段转发进私聊，并让角色接一句 */
  const forwardBeat = useCallback(async (beatIndex?: number) => {
    const cur = sessionRef.current;
    if (!cur) return;
    // 翻到哪一幕就转哪一幕；没指定就转最新
    const beat =
      typeof beatIndex === 'number'
        ? cur.beats.find(b => b.index === beatIndex) || cur.beats[cur.beats.length - 1]
        : cur.beats[cur.beats.length - 1];
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
        logOnly: true,
        onLogged: next => persist(next),
      });
      await persist(r.session);
      if (page !== 'chat') setUnread(u => u + 1);
      addToast('转进私聊了，点「触发」让 ta 接一句', 'success');
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

  // 浮窗只放最新一轮：上一条用户消息之后，角色发出的那些，按说话顺序。
  const charBubbleMsgs = useMemo(() => {
    const chat = session?.chat ?? [];
    let boundary = -1;
    for (let i = chat.length - 1; i >= 0; i -= 1) {
      if (chat[i].from === 'user' || chat[i].from === 'clip') {
        boundary = i;
        break;
      }
    }
    return chat.slice(boundary + 1).filter(m => m.from === 'char' && (m.text || m.sticker || m.voiceId || m.wantVoice));
  }, [session?.chat]);
  const [bubblePick, setBubblePick] = useState(0);
  const [bubbleSeq, setBubbleSeq] = useState(0);
  // 新的一轮进来，从第一句开始
  useEffect(() => {
    setBubblePick(0);
    setBubbleSeq(n => n + 1);
  }, [session?.chat.length]);

  const bubbleMsg = charBubbleMsgs[bubblePick] ?? null;
  const bubbleIsVoice = Boolean(
    bubbleMsg && watchLineIsVoice(bubbleMsg.text, { wantVoice: bubbleMsg.wantVoice, voiceId: bubbleMsg.voiceId }),
  );
  const petBubbleText = bubbleMsg
    ? shownWatchText(bubbleMsg.text, apiConfig) || bubbleMsg.sticker || null
    : null;

  const playBubbleVoice = useCallback(() => {
    if (!bubbleMsg) return;
    void playMessageVoice(bubbleMsg);
  }, [bubbleMsg, playMessageVoice]);

  const revealBubble = useCallback(() => {
    setBubbleSeq(n => n + 1);
  }, []);

  const tapBubble = useCallback(() => {
    if (charBubbleMsgs.length < 2) {
      setBubbleSeq(n => n + 1);
      return;
    }
    setBubblePick(i => (i + 1) % charBubbleMsgs.length);
    setBubbleSeq(n => n + 1);
  }, [charBubbleMsgs.length]);

  const sendLiveLine = useCallback(
    async (text: string) => {
      const cur = sessionRef.current;
      const line = text.trim();
      if (!cur || !line || busy) return;
      if (cur.legacy) {
        addToast('这是旧版记录，只能翻看', 'info');
        return;
      }
      if (cur.cast.presence === 'solo') {
        addToast(`先把${char.name}叫进来，ta 才接得上话`, 'info');
        return;
      }
      setBusy('chat');
      try {
        const ctx = await buildCtx();
        const r = await chatRound({
          ...ctx,
          session: cur,
          text: line,
          onLogged: next => persist(next),
        });
        let next = r.session;
        try {
          next = await maybeDigest({ ...ctx, session: next });
        } catch {
          /* 压不动不影响这一轮 */
        }
        await persist(next);
        if (r.failed) addToast(`${char.name}这条没接上`, 'error');
        if (r.bubble) setBubble(r.bubble);
      } catch (e: any) {
        addToast(e?.message || '这条没发出去', 'error');
      } finally {
        setBusy(null);
      }
    },
    [busy, buildCtx, persist, addToast, char.name],
  );

  // 角色开了「收到就自动播放」：语音条自己合成并念。关着就只留条，等用户点。
  const autoVoiceRef = useRef<Set<string>>(new Set());
  const autoVoiceSig = (session?.chat ?? [])
    .filter(m => m.from === 'char')
    .map(m => `${m.id}|${m.voiceId || ''}|${m.wantVoice ? 1 : 0}|${m.text || ''}`)
    .join('\n');
  useEffect(() => {
    const cur = session;
    if (!cur || !voiceReady) return;
    if (!shouldAutoGenerateVoice({ autoPlayEnabled: char.chatVoiceAutoPlay })) return;
    const msg = [...cur.chat].reverse().find(
      m => m.from === 'char' && m.text && !m.voiceId && watchLineIsVoice(m.text, { wantVoice: m.wantVoice, voiceId: m.voiceId }),
    );
    if (!msg) return;
    const stamp = `${msg.id}:${msg.text || ''}`;
    if (autoVoiceRef.current.has(stamp)) return;
    autoVoiceRef.current.add(stamp);
    void playMessageVoice(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVoiceSig, char.chatVoiceAutoPlay, voiceReady]);

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

  const editMessage = useCallback(
    async (msg: WatchChatMessage, text: string) => {
      const cur = sessionRef.current;
      if (!cur) return;
      const nextText = text.trim();
      if (!nextText || nextText === (msg.text || '').trim()) return;
      const wasVoice = watchLineIsVoice(msg.text, { wantVoice: msg.wantVoice, voiceId: msg.voiceId });
      const stillVoice = parseVoiceOutput(nextText).hasVoiceTag;
      const audioKey = `msg:${msg.id}`;
      if (playingKey === audioKey || loadingKey === audioKey) {
        const audio = audioRef.current;
        if (audio) stopVoiceAudio(audio);
        if (playingKey === audioKey) setPlayingKey(null);
        if (loadingKey === audioKey) setLoadingKey(null);
      }
      if (wasVoice || stillVoice) {
        const keys = [...new Set([msg.id, msg.voiceId].filter((id): id is string => Boolean(id)))];
        if (keys.length) await forgetWatchVoices(keys);
      }
      // 保存只改字并清掉旧录音。合成留到用户点这条；先占住记号，开着自动播放也不要自己念。
      if (stillVoice) autoVoiceRef.current.add(`${msg.id}:${nextText}`);
      const latest = sessionRef.current;
      if (!latest) return;
      const chat = latest.chat.map(item => {
        if (item.id !== msg.id) return item;
        const copy: WatchChatMessage = { ...item, text: nextText };
        delete copy.translation;
        if (stillVoice) {
          copy.wantVoice = true;
          delete copy.voiceId;
        } else if (wasVoice) {
          delete copy.wantVoice;
          delete copy.voiceId;
        }
        return copy;
      });
      await persist({ ...latest, chat, updatedAt: Date.now() });
    },
    [persist, playingKey, loadingKey],
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

  /** 大厅里换个人陪你看：换这一册，人留在当前这一页 */
  const switchCompanion = useCallback(
    (id: string) => {
      if (id === companionId) return;
      setCompanionId(id);
      setSession(null);
      setUnread(0);
    },
    [companionId],
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
      // 这个角色的号只写他自己那一份，换角色不会串
      await saveCharWatchAccount(char.id, next);
      await saveGlobals({ ...globals, charAccount: next });
      const cur = sessionRef.current;
      if (cur) await persist({ ...cur, cast: { ...cur.cast, charAccount: next }, updatedAt: Date.now() });
    },
    [char.id, globals, saveGlobals, persist],
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
  // 桌宠形象：彼方捏的小人 → 小小窝 Q 版 → 圆头像（手册·雷点四）
  const petSrc = useMemo(() => {
    const chibi = (char as CharacterProfile & { vrState?: { chibi?: { img?: string } } }).vrState?.chibi?.img;
    if (chibi) return chibi;
    const sprite = char.sprites?.chibi;
    if (sprite) return sprite;
    return char.avatar;
  }, [char]);
  const chatBusy = busy === 'chat';
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

  // 设置 / 历史不依赖「有没有开着的场次」，必须排在大厅前面
  if (page === 'settings') {
    return (
      <WatchSettings
        settings={settings}
        companions={companions}
        companionId={char.id}
        userAccount={globals.userAccount}
        charAccount={globals.charAccount}
        charName={char.name}
        presets={apiPresets}
        busyAccount={accountBusy}
        onBack={() => setPage('lobby')}
        onPickCompanion={switchCompanion}
        onChangeSettings={next => void saveSettings(next)}
        onChangeUserAccount={next => void changeUserAccount(next)}
        onChangeCharAccount={next => void changeCharAccount(next)}
        onSuggestAccount={target => void suggestAccount(target)}
      />
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

  if (page === 'lobby' || !session) {
    return (
      <>
        <WatchLobby
          userName={userProfile?.name || '你'}
          pool={globals.pool}
          customRule={globals.customRule}
          busy={busy === 'pool'}
          busyEdge={poolMode}
          sessions={sessions}
          onBack={onClose}
          tailToken={tailToken}
          onAskRefresh={mode => {
            if (busy === 'pool') return;
            setPoolMode(mode);
            setRuleDraft(globals.customRule);
            setRuleOpen(true);
          }}
          onStart={room => void startRoom(room)}
          onEditRoom={openPoolEdit}
          onRemoveRoom={roomId => void removeRoomFromPool(roomId)}
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
                const nextRule = ruleDraft.trim();
                void refreshPool(nextRule, poolMode);
              }}
            >
              {poolMode === 'append' ? '再刷一批' : '换一批'}
            </SolidButton>
          }
        >
          <div className="px-4 pb-3">
            <div className="flex items-start justify-between gap-2 pt-1">
              <div className="text-[11.5px] leading-[17px]" style={{ color: W.sub }}>
                写一句就行，比如「深夜看相、情感连线，越离谱越好」。
              </div>
              <button
                type="button"
                disabled={tasteBusy}
                onClick={() => void suggestTasteNow()}
                className="inline-flex h-[26px] shrink-0 items-center gap-1 px-2.5 text-[11px] disabled:opacity-40"
                style={{ borderRadius: 999, background: W.fill, color: W.ink }}
              >
                <WIco name="rewrite" size={11} />
                {tasteBusy ? '想着…' : '帮我想'}
              </button>
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

        <Sheet
          open={Boolean(editingRoom)}
          title="改这一场"
          onClose={() => setEditingRoom(null)}
          footer={
            <SolidButton
              onClick={() => {
                const target = editingRoom;
                setEditingRoom(null);
                if (target) void savePoolRoom(target, roomDraft);
              }}
            >
              记住
            </SolidButton>
          }
        >
          <div className="px-4 pb-3">
            {/* 人设排在最前面：主播每一句话都是从这一段长出来的，空着它就只会说场面话 */}
            <label className="mb-4 block">
              <span className="mb-1 block text-[11.5px]" style={{ color: W.sub }}>
                主播人设
              </span>
              <textarea
                value={roomDraft.bio}
                maxLength={160}
                rows={5}
                placeholder="他是谁、说话什么调、播多久了、这一场图什么、自己立的规矩、怕什么——六样用「；」隔开，90 到 140 字。"
                onChange={e => setRoomDraft(prev => ({ ...prev, bio: e.target.value }))}
                className="w-full resize-none px-3 py-2.5 text-[13px] leading-[19px] outline-none placeholder:text-[#ADADAD]"
                style={{ borderRadius: 12, background: W.fill, color: W.ink }}
              />
              <span className="mt-1 block text-[10.5px] leading-[15px]" style={{ color: W.faint }}>
                刷台时这一段就是「人设」那一格；空着，主播只会说场面话。
              </span>
            </label>
            {(
              [
                { key: 'streamerName', label: '主播名', max: 20 },
                { key: 'streamerHandle', label: '账号', max: 24 },
                { key: 'category', label: '分区', max: 12 },
              ] as const
            ).map(f => (
              <label key={f.key} className="mb-3 block">
                <span className="mb-1 block text-[11.5px]" style={{ color: W.sub }}>
                  {f.label}
                </span>
                <input
                  value={roomDraft[f.key]}
                  maxLength={f.max}
                  onChange={e => setRoomDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 text-[13px] outline-none"
                  style={{ borderRadius: 12, background: W.fill, color: W.ink }}
                />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-[11.5px]" style={{ color: W.sub }}>
                房间标题
              </span>
              <input
                value={roomDraft.title}
                maxLength={40}
                onChange={e => setRoomDraft(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 text-[13px] outline-none"
                style={{ borderRadius: 12, background: W.fill, color: W.ink }}
              />
            </label>
          </div>
        </Sheet>
      </>
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
          charId={char.id}
          charName={char.name}
          charAvatar={charAvatar}
          apiConfig={apiConfig}
          busy={chatBusy}
          emojis={emojis}
          categories={categories}
          playingId={listeningMsgId}
          loadingId={loadingMsgId}
          voiceReady={voiceReady}
          onBack={() => setPage('room')}
          onOpenRoom={() => setPage('room')}
          onOpenDirector={() => setDirectorOpen(true)}
          onTrigger={() => void triggerReaction()}
          onTogglePresence={() => void togglePresence()}
          onToggleAutoReact={() => void toggleAutoReact()}
          onSend={payload => void sendChat(payload)}
          onPlayVoice={msg => void playMessageVoice(msg)}
          onDownloadVoice={msg => void downloadVoice(msg)}
          onEdit={(msg, text) => void editMessage(msg, text)}
          onDelete={msg => void deleteMessage(msg)}
          onRedo={() => void regenerateLastReply()}
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
        <WatchInfo
          open={infoOpen}
          session={session}
          beatIndex={infoBeatIndex}
          onClose={() => setInfoOpen(false)}
          onSave={next => void saveInfo(next)}
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
        petSrc={petSrc}
        busy={busy === 'advance'}
        petGenerating={busy === 'chat'}
        bubble={petBubbleText}
        bubbleSeq={bubbleSeq}
        bubbleIsVoice={bubbleIsVoice}
        onTapBubble={tapBubble}
        onRevealBubble={revealBubble}
        onSendLiveLine={text => void sendLiveLine(text)}
        chatUnread={unread}
        micPlaying={listeningMic}
        micLoading={loadingKey?.startsWith('mic:') === true}
        onPlayMic={() => void playMicLine()}
        onPlayBubble={playBubbleVoice}
        bubblePlaying={Boolean(bubbleMsg && playingKey === `msg:${bubbleMsg.id}`)}
        onBack={() => {
          setSession(null);
          setPage('lobby');
        }}
        onAdvance={() => void runAdvance()}
        onRegenerate={idx => void runRegenerate(idx)}
        onForward={idx => void forwardBeat(idx)}
        onSendDanmaku={sendPublic}
        onSendGift={sendGift}
        onMicToggle={toggleMic}
        onOpenChat={() => {
          setUnread(0);
          setPage('chat');
        }}
        onOpenDirector={() => setDirectorOpen(true)}
        onOpenSummary={() => setPage('summary')}
        onOpenSettings={() => setPage('settings')}
        onOpenInfo={beatIndex => {
          setInfoBeatIndex(beatIndex);
          setInfoOpen(true);
        }}
        onRepairBeats={indexes => void repairBeats(indexes)}
        repairBusy={busy === 'repair'}
        onEditPublic={(line, text) => void editPublicLine(line, text)}
        onDeletePublic={line => void deletePublicLine(line)}
        onExit={() => void openExit()}
        onSummon={() => void summon()}
        onHidePet={() => void hidePet()}
        onShowPet={() => void showPet()}
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

      <WatchInfo
        open={infoOpen}
        session={session}
        beatIndex={infoBeatIndex}
        onClose={() => setInfoOpen(false)}
        onSave={next => void saveInfo(next)}
      />

      <WatchExit
        open={exitOpen}
        session={session}
        charName={char.name}
        busy={busy === 'recap'}
        onClose={() => setExitOpen(false)}
        onRewrite={() => void rewriteSummary()}
        onLeave={opts => void leaveRoom(opts)}
      />
    </>
  );
}
