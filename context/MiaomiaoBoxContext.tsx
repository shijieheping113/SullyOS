import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from './OSContext';
import { AppID } from '../types';
import { DB } from '../utils/db';
import { extractHtmlBlocks } from '../utils/htmlPrompt';
import { synthesizeSpeech } from '../utils/ttsRouter';
import { playVoiceAudio } from '../utils/voicePlayback';
import { buildChatRequestPayload } from '../utils/chatRequestPayload';
import { MiaomiaoBoxDB } from '../apps/miaomiaoBox/miaomiaoBoxDb';
import {
  MIAOMIAO_FOLD_N_DEFAULT,
  STARTER_LABEL,
  type MiaomiaoArchiveMode,
  type MiaomiaoMessage,
  type MiaomiaoSession,
  type MiaomiaoSettings,
  type MiaomiaoStarter,
  type MiaomiaoWorldRule,
} from '../apps/miaomiaoBox/types';
import { applyFold, countUnfoldedRounds, formatBoxHistoryForModel, planFold } from '../apps/miaomiaoBox/foldSession';
import { materialsForArchive, packRawArchive, wrapArchiveBody } from '../apps/miaomiaoBox/archiveRewrite';
import {
  BOX_FOLD_PROMPT,
  BOX_FOLD_TEMPERATURE,
  BOX_REMEMBER_PROMPT,
  BOX_REMEMBER_TEMPERATURE,
  buildMiaomiaoPlayPrompt,
} from '../apps/miaomiaoBox/miaomiaoBoxPrompt';
import { callMainChatLlm, callSecondaryLlm } from '../apps/miaomiaoBox/boxLlm';
import { displayTextForBoxReply, spokenTextForBoxReply } from '../apps/miaomiaoBox/speakQuoted';

export type MiaomiaoShell = 'hidden' | 'float' | 'widget';
export type MiaomiaoPage = 'home' | 'play' | 'settings' | 'history';

type Ctx = {
  shell: MiaomiaoShell;
  page: MiaomiaoPage;
  session: MiaomiaoSession | null;
  messages: MiaomiaoMessage[];
  settings: MiaomiaoSettings | null;
  typing: boolean;
  error: string;
  unread: boolean;
  foldBusy: boolean;
  openForChar: (charId: string) => Promise<void>;
  collapseToWidget: () => void;
  expandFloat: () => void;
  setPage: (p: MiaomiaoPage) => void;
  startPlay: (starter: MiaomiaoStarter, text?: string) => Promise<void>;
  switchMode: (starter: MiaomiaoStarter) => Promise<void>;
  sendPlay: (text: string) => Promise<void>;
  leaveToChat: () => void;
  closeLid: (mode: MiaomiaoArchiveMode) => Promise<void>;
  saveSettings: (next: MiaomiaoSettings) => Promise<void>;
  playingForChar: (charId: string) => MiaomiaoSession | null;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteBoxMessage: (id: string) => Promise<void>;
  rerollMessage: (id: string) => Promise<void>;
  playBoxVoice: (id: string) => Promise<void>;
};

const MiaomiaoBoxContext = createContext<Ctx | null>(null);

export const useMiaomiaoBox = (): Ctx => {
  const ctx = useContext(MiaomiaoBoxContext);
  if (!ctx) throw new Error('useMiaomiaoBox');
  return ctx;
};

export const MIAOMIAO_RECORD_EVENT = 'miaomiao-box-record';

export const MiaomiaoBoxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const os = useOS();
  const [shell, setShell] = useState<MiaomiaoShell>('hidden');
  const [page, setPage] = useState<MiaomiaoPage>('home');
  const [session, setSession] = useState<MiaomiaoSession | null>(null);
  const [messages, setMessages] = useState<MiaomiaoMessage[]>([]);
  const [settings, setSettings] = useState<MiaomiaoSettings | null>(null);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(false);
  const [foldBusy, setFoldBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const persistSession = async (next: MiaomiaoSession) => {
    await MiaomiaoBoxDB.saveSession(next);
    setSession(next);
  };

  const loadSessionBundle = async (s: MiaomiaoSession) => {
    const [msgs, st] = await Promise.all([
      MiaomiaoBoxDB.listMessages(s.id),
      MiaomiaoBoxDB.getSettings(s.charId),
    ]);
    setSession(s);
    setMessages(msgs);
    setSettings(st);
  };

  const openForChar = useCallback(async (charId: string) => {
    const st = await MiaomiaoBoxDB.getSettings(charId);
    setSettings(st);
    const list = await MiaomiaoBoxDB.listSessionsByChar(charId);
    const live = list.find(s => s.status === 'playing' || s.status === 'paused');
    if (live) {
      await loadSessionBundle(live);
      setPage(live.status === 'playing' && (await MiaomiaoBoxDB.listMessages(live.id)).some(m => m.role !== 'summary') ? 'play' : 'home');
    } else {
      setSession(null);
      setMessages([]);
      setPage('home');
    }
    setError('');
    setUnread(false);
    setShell('float');
  }, []);

  useEffect(() => {
    if (shell === 'float' && os.activeApp !== AppID.Chat) setShell('widget');
  }, [os.activeApp, shell]);

  const collapseToWidget = () => {
    if (session) setShell('widget');
    else setShell('hidden');
  };

  const expandFloat = () => {
    if (!session) return;
    os.setActiveCharacterId(session.charId);
    os.openApp(AppID.Chat);
    setUnread(false);
    setShell('float');
  };

  const playingForChar = (charId: string) =>
    session && session.charId === charId && session.status === 'playing' ? session : null;

  const ensureSession = async (charId: string, starter: MiaomiaoStarter): Promise<MiaomiaoSession> => {
    const cur = sessionRef.current;
    if (cur && cur.charId === charId && (cur.status === 'playing' || cur.status === 'paused')) {
      if (cur.status === 'paused') {
        const resumed = { ...cur, status: 'playing' as const, updatedAt: Date.now() };
        await persistSession(resumed);
        return resumed;
      }
      return cur;
    }
    const st = settings || await MiaomiaoBoxDB.getSettings(charId);
    const s: MiaomiaoSession = {
      id: MiaomiaoBoxDB.newId('box'),
      charId,
      title: STARTER_LABEL[starter],
      starter,
      status: 'playing',
      foldN: st.foldN || MIAOMIAO_FOLD_N_DEFAULT,
      foldCount: 0,
      foldedRoundCount: 0,
      ttsAutoPlay: st.ttsAutoPlay,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worldRules: st.worldRules || [],
    };
    await persistSession(s);
    setMessages([]);
    return s;
  };

  const maybeFold = async (s: MiaomiaoSession, msgs: MiaomiaoMessage[]): Promise<MiaomiaoMessage[]> => {
    const plan = planFold(msgs, s.foldN || MIAOMIAO_FOLD_N_DEFAULT);
    if (!plan.shouldFold) return msgs;
    setFoldBusy(true);
    try {
      const existing = msgs.filter(m => m.role === 'summary').map(m => m.content).join('\n');
      const fresh = plan.toFold.map(m => displayTextForBoxReply(m.content)).join('\n');
      const body = await callSecondaryLlm({
        memoryPalaceConfig: os.memoryPalaceConfig,
        system: BOX_FOLD_PROMPT,
        user: `已有的摘要：\n${existing || '（空）'}\n\n这次要折进来的新内容：\n${fresh}`,
        temperature: BOX_FOLD_TEMPERATURE,
        purpose: '盒子滚动摘要',
      });
      const summary: MiaomiaoMessage = {
        id: MiaomiaoBoxDB.newId('sum'),
        sessionId: s.id,
        charId: s.charId,
        role: 'summary',
        content: body,
        timestamp: Date.now(),
        summaryRange: { fromRound: plan.foldFromRound, toRound: plan.foldToRound },
        originalSummary: body,
      };
      for (const row of plan.toFold) await MiaomiaoBoxDB.saveMessage({ ...row, folded: true });
      await MiaomiaoBoxDB.saveMessage(summary);
      const next = applyFold(msgs, new Set(plan.toFold.map(m => m.id)), summary);
      await persistSession({
        ...s,
        foldCount: s.foldCount + 1,
        foldedRoundCount: s.foldedRoundCount + (plan.foldToRound - plan.foldFromRound + 1),
        updatedAt: Date.now(),
      });
      return next;
    } finally {
      setFoldBusy(false);
    }
  };

  const speakIfNeeded = async (s: MiaomiaoSession, raw: string) => {
    if (!s.ttsAutoPlay) return;
    const char = os.characters.find(c => c.id === s.charId);
    if (!char) return;
    const { spoken, emotion } = spokenTextForBoxReply(raw);
    if (!spoken) return;
    try {
      const url = await synthesizeSpeech(spoken, char, os.apiConfig, { emotion });
      if (!audioRef.current) audioRef.current = new Audio();
      await playVoiceAudio(audioRef.current, url, {
        onPlaying: () => undefined,
        onStopped: () => undefined,
        onError: () => undefined,
      });
    } catch (e) {
      console.warn('[miaomiao] tts', e);
    }
  };

  const runTurn = async (s: MiaomiaoSession, userText: string, persistUser = true) => {
    const char = os.characters.find(c => c.id === s.charId);
    if (!char) throw new Error('找不到这个角色');
    const userMsg: MiaomiaoMessage = {
      id: MiaomiaoBoxDB.newId('u'),
      sessionId: s.id,
      charId: s.charId,
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    };
    if (persistUser && userText) {
      await MiaomiaoBoxDB.saveMessage(userMsg);
      setMessages(prev => [...prev, userMsg]);
    }
    const history = await DB.getRecentMessagesByCharId(char.id, 80);
    const prompt = buildMiaomiaoPlayPrompt({
      apiConfig: os.apiConfig,
      worldRules: s.worldRules,
      starter: s.starter,
    });
    const payload = await buildChatRequestPayload({
      char,
      userProfile: os.userProfile,
      groups: os.groups || [],
      emojis: [],
      categories: [],
      historyMsgs: history,
      contextLimit: 40,
      realtimeConfig: os.realtimeConfig,
      miaomiaoBoxPrompt: prompt,
      htmlMode: { enabled: false },
    } as any);
    const boxMsgs = await MiaomiaoBoxDB.listMessages(s.id);
    const extra = formatBoxHistoryForModel(boxMsgs);
    const last = extra[extra.length - 1];
    if (userText && (!last || last.role !== 'user' || last.content !== userText)) {
      extra.push({ role: 'user', content: userText });
    }
    const apiMessages = [
      { role: 'system', content: payload.systemPrompt },
      ...payload.cleanedApiMessages,
      ...extra,
    ];
    const raw = await callMainChatLlm({
      apiConfig: os.apiConfig,
      messages: apiMessages,
      temperature: os.apiConfig.temperature ?? 0.85,
      charId: char.id,
      charName: char.name,
    });
    const { blocks, cleanedContent } = extractHtmlBlocks(raw);
    const html = blocks[0];
    const assistant: MiaomiaoMessage = {
      id: MiaomiaoBoxDB.newId('a'),
      sessionId: s.id,
      charId: s.charId,
      role: 'assistant',
      content: cleanedContent || displayTextForBoxReply(raw) || raw,
      timestamp: Date.now(),
      htmlSource: html?.html,
      htmlTextPreview: html?.textPreview,
    };
    await MiaomiaoBoxDB.saveMessage(assistant);
    let nextMsgs = persistUser && userText
      ? [...boxMsgs.filter(m => m.id !== userMsg.id), userMsg, assistant]
      : [...boxMsgs, assistant];
    try {
      nextMsgs = await maybeFold(s, nextMsgs);
    } catch (e: any) {
      setError(e?.message || '摘要没做成，这轮先不折');
    }
    setMessages(nextMsgs);
    await persistSession({ ...s, status: 'playing', updatedAt: Date.now(), title: s.title || STARTER_LABEL[s.starter] });
    if (shell === 'widget') setUnread(true);
    await speakIfNeeded(s, raw);
  };

  const startPlay = async (starter: MiaomiaoStarter, text?: string) => {
    const charId = os.activeCharacterId;
    if (!charId) return;
    setError('');
    let s = await ensureSession(charId, starter);
    if (s.starter !== starter) {
      s = { ...s, starter, title: STARTER_LABEL[starter], updatedAt: Date.now() };
      await persistSession(s);
    }
    setPage('play');
    const t = (text || '').trim();
    if (!t) return;
    setTyping(true);
    try {
      await runTurn(s, t, true);
    } catch (e: any) {
      setError(e?.message || '这一轮没演成');
    } finally {
      setTyping(false);
    }
  };

  const switchMode = async (starter: MiaomiaoStarter) => {
    const cur = sessionRef.current;
    if (!cur) {
      await startPlay(starter);
      return;
    }
    await persistSession({ ...cur, starter, title: STARTER_LABEL[starter], updatedAt: Date.now() });
    setPage('play');
  };

  const leaveToChat = () => {
    const s = sessionRef.current;
    const inPlay = !!(s && s.status === 'playing' && messages.length > 0);
    if (inPlay) setShell('widget');
    else setShell('hidden');
  };

  const sendPlay = async (text: string) => {
    const s = sessionRef.current;
    if (!s || !text.trim()) return;
    setError('');
    setTyping(true);
    try {
      await runTurn(s, text.trim(), true);
    } catch (e: any) {
      setError(e?.message || '这一轮没演成');
    } finally {
      setTyping(false);
    }
  };

  const writeBoxRecord = async (s: MiaomiaoSession, mode: MiaomiaoArchiveMode, body: string) => {
    const continues = s.continuesMessageId;
    if (continues) {
      const old = await DB.getMessageById(continues);
      if (old) await DB.updateMessage(continues, old.content);
      await DB.updateMessageMetadata(continues, (prev: any) => ({ ...(prev || {}), superseded: true }));
    }
    const id = await DB.saveMessage({
      charId: s.charId,
      role: 'assistant',
      type: 'box_record',
      content: body,
      metadata: {
        title: s.title || STARTER_LABEL[s.starter],
        archiveMode: mode,
        source: 'miaomiao_box',
        sessionId: s.id,
        continuesId: continues,
        foldCount: s.foldCount,
        roundCount: countUnfoldedRounds(messages) + s.foldedRoundCount,
      },
    });
    if (mode === 'paused') {
      await persistSession({ ...s, status: 'paused', continuesMessageId: id, updatedAt: Date.now() });
    }
    window.dispatchEvent(new CustomEvent(MIAOMIAO_RECORD_EVENT, { detail: { charId: s.charId } }));
    return id;
  };

  const closeLid = async (mode: MiaomiaoArchiveMode) => {
    const s = sessionRef.current;
    if (!s) return;
    setError('');
    const msgs = await MiaomiaoBoxDB.listMessages(s.id);
    try {
      if (mode === 'remember') {
        const { summaries, remainder } = materialsForArchive(msgs);
        const body = await callSecondaryLlm({
          memoryPalaceConfig: os.memoryPalaceConfig,
          system: BOX_REMEMBER_PROMPT,
          user: `前面的滚动摘要：\n${summaries || '（空）'}\n\n还没折进去的原文：\n${remainder || '（空）'}`,
          temperature: BOX_REMEMBER_TEMPERATURE,
          purpose: '盒子记在心里',
        });
        await writeBoxRecord(s, mode, body.includes('【刚刚发生的事】') ? body : wrapArchiveBody(body, mode));
        await persistSession({ ...s, status: 'closed', updatedAt: Date.now() });
      } else if (mode === 'raw' || mode === 'paused') {
        await writeBoxRecord(s, mode, packRawArchive(msgs, mode));
        if (mode === 'raw') await persistSession({ ...s, status: 'closed', updatedAt: Date.now() });
      } else {
        await writeBoxRecord(s, 'forget', packRawArchive(msgs, 'forget'));
        await persistSession({ ...s, status: 'forgotten', updatedAt: Date.now() });
      }
    } catch (e: any) {
      setError(e?.message || '合盖没做成');
      return;
    }
    setShell('hidden');
    setPage('home');
    if (mode !== 'paused') {
      setSession(null);
      setMessages([]);
    }
  };

  const editMessage = async (id: string, content: string) => {
    const list = messagesRef.current;
    const m = list.find(x => x.id === id);
    if (!m) return;
    const next = { ...m, content };
    await MiaomiaoBoxDB.saveMessage(next);
    setMessages(list.map(x => x.id === id ? next : x));
  };

  const deleteBoxMessage = async (id: string) => {
    await MiaomiaoBoxDB.deleteMessage(id);
    setMessages(messagesRef.current.filter(x => x.id !== id));
  };

  const rerollMessage = async (id: string) => {
    const s = sessionRef.current;
    const list = messagesRef.current;
    if (!s) return;
    const idx = list.findIndex(m => m.id === id);
    if (idx < 0) return;
    const target = list[idx];
    const removeIds: string[] = [];
    let userText = '';
    if (target.role === 'assistant') {
      removeIds.push(target.id);
      const prev = [...list.slice(0, idx)].reverse().find(m => m.role === 'user');
      userText = prev?.content || '';
    } else {
      userText = target.content;
      const nextA = list.slice(idx + 1).find(m => m.role === 'assistant');
      if (nextA) removeIds.push(nextA.id);
    }
    for (const rid of removeIds) await MiaomiaoBoxDB.deleteMessage(rid);
    setMessages(list.filter(m => !removeIds.includes(m.id)));
    if (!userText) return;
    setTyping(true);
    try {
      await runTurn(s, userText, false);
    } catch (e: any) {
      setError(e?.message || '重roll 没做成');
    } finally {
      setTyping(false);
    }
  };

  const playBoxVoice = async (id: string) => {
    const s = sessionRef.current;
    const m = messagesRef.current.find(x => x.id === id);
    if (!s || !m) return;
    await speakIfNeeded(s, m.content);
  };

  const saveSettings = async (next: MiaomiaoSettings) => {
    await MiaomiaoBoxDB.saveSettings(next);
    setSettings(next);
    if (session && session.charId === next.charId) {
      await persistSession({
        ...session,
        foldN: next.foldN,
        ttsAutoPlay: next.ttsAutoPlay,
        worldRules: next.worldRules,
        updatedAt: Date.now(),
      });
    }
  };

  const value = useMemo<Ctx>(() => ({
    shell, page, session, messages, settings, typing, error, unread, foldBusy,
    openForChar, collapseToWidget, expandFloat, setPage, startPlay, switchMode, sendPlay, leaveToChat, closeLid, saveSettings, playingForChar,
    editMessage, deleteBoxMessage, rerollMessage, playBoxVoice,
  }), [shell, page, session, messages, settings, typing, error, unread, foldBusy, openForChar]);

  return <MiaomiaoBoxContext.Provider value={value}>{children}</MiaomiaoBoxContext.Provider>;
};
