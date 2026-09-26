import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from './OSContext';
import { AppID } from '../types';
import { DB } from '../utils/db';
import { extractHtmlBlocks } from '../utils/htmlPrompt';
import { synthesizeSpeech } from '../utils/ttsRouter';
import { playVoiceAudio } from '../utils/voicePlayback';
import { buildChatRequestPayload } from '../utils/chatRequestPayload';
import { loadCharacterContextMessages } from '../utils/chatContextRange';
import { MiaomiaoBoxDB } from '../apps/miaomiaoBox/miaomiaoBoxDb';
import {
  MIAOMIAO_BIG_FOLD_DEFAULT,
  MIAOMIAO_FOLD_KEEP_DEFAULT,
  MIAOMIAO_FOLD_N_DEFAULT,
  STARTER_LABEL,
  type MiaomiaoArchive,
  type MiaomiaoArchiveLine,
  type MiaomiaoArchiveMode,
  type MiaomiaoMessage,
  type MiaomiaoSession,
  type MiaomiaoSettings,
  type MiaomiaoStarter,
  type MiaomiaoWorldRule,
} from '../apps/miaomiaoBox/types';
import { applyBigFold, applyFold, countUnfoldedRounds, dissolveSummary as dissolveSummaryCard, formatBoxHistoryForModel, planAfterReply, planFold, relocateSummaries } from '../apps/miaomiaoBox/foldSession';
import { materialsForArchive, packRawArchive, withPerspective, wrapArchiveBody } from '../apps/miaomiaoBox/archiveRewrite';
import {
  BOX_BIG_FOLD_PROMPT,
  BOX_FOLD_PROMPT,
  BOX_THEME_PROMPT,
  BOX_FOLD_TEMPERATURE,
  BOX_NOW_GUIDE,
  BOX_PAST_GUIDE,
  BOX_REMEMBER_PROMPT,
  BOX_REMEMBER_TEMPERATURE,
  BOX_TURN_BAN,
  buildBoxThinkingPrompt,
  buildMiaomiaoPlayPrompt,
} from '../apps/miaomiaoBox/miaomiaoBoxPrompt';
import { callMainChatLlm, callSecondaryLlm, splitBoxThinking } from '../apps/miaomiaoBox/boxLlm';
import { SecondaryLlmNotConfiguredError } from '../utils/secondaryLlmCall';
import { applyQuoteStyle, cleanShown, displayTextForBoxReply, normalizeEditBreaks, spokenTextForBoxReply, splitIntoBubbles } from '../apps/miaomiaoBox/speakQuoted';

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
  dissolveSummary: (id: string) => Promise<void>;
  rerollMessage: (id: string) => Promise<void>;
  rerollLastTurn: () => Promise<void>;
  playingVoiceId: string | null;
  voiceLoadingId: string | null;
  playBoxVoice: (id: string) => Promise<void>;
  downloadBoxVoice: (id: string) => Promise<void>;
  pendingStarter: MiaomiaoStarter | null;
  liveSessions: MiaomiaoSession[];
  historySessions: MiaomiaoSession[];
  pickHomeStarter: (starter: MiaomiaoStarter) => Promise<void>;
  cancelPending: () => void;
  openLive: (id: string) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  renameTheme: (theme: string) => Promise<void>;
  liveText: string;
  liveThinking: string;
  paramNote: string;
  foldNote: string;
  dismissError: () => void;
};

const toArchiveLines = (msgs: MiaomiaoMessage[]): MiaomiaoArchiveLine[] => {
  const lines: MiaomiaoArchiveLine[] = [];
  for (const m of msgs) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    lines.push({
      id: m.id,
      role: m.role,
      kind: m.kind,
      content: m.content || '',
      voiceSourceText: m.voiceSourceText,
      htmlSource: m.htmlSource,
      htmlTextPreview: m.htmlTextPreview,
      timestamp: m.timestamp,
    });
  }
  lines.sort((a, b) => a.timestamp - b.timestamp);
  return lines;
};

const archiveOf = (mode: MiaomiaoArchiveMode, msgs: MiaomiaoMessage[], savedAt = Date.now()): MiaomiaoArchive => ({
  savedAt,
  mode,
  lines: toArchiveLines(msgs),
});

const MiaomiaoBoxContext = createContext<Ctx | null>(null);

export const useMiaomiaoBox = (): Ctx => {
  const ctx = useContext(MiaomiaoBoxContext);
  if (!ctx) throw new Error('useMiaomiaoBox');
  return ctx;
};

export const MIAOMIAO_RECORD_EVENT = 'miaomiao-box-record';

function tidyBoxTheme(raw: string): string {
  const line = (raw || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  return line
    .replace(/^第[0-9０-９一二三四五六七八九十百千]+[章节回部]\s*/, '')
    .replace(/[「」"'“”《》#]/g, '')
    .replace(/[。！？.!?\s]+$/g, '')
    .trim()
    .slice(0, 20);
}

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
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceLoadingId, setVoiceLoadingId] = useState<string | null>(null);
  const [pendingStarter, setPendingStarter] = useState<MiaomiaoStarter | null>(null);
  const [liveSessions, setLiveSessions] = useState<MiaomiaoSession[]>([]);
  const [historySessions, setHistorySessions] = useState<MiaomiaoSession[]>([]);
  const [liveText, setLiveText] = useState('');
  const [liveThinking, setLiveThinking] = useState('');
  const [paramNote, setParamNote] = useState('');
  const [foldNote, setFoldNote] = useState('');
  const pendingRef = useRef<MiaomiaoStarter | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceMem = useRef(new Map<string, { voiceUrl: string; voiceSynthText?: string }>());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const setPending = (starter: MiaomiaoStarter | null) => {
    pendingRef.current = starter;
    setPendingStarter(starter);
  };

  const sessionHasLines = async (id: string) => {
    if (sessionRef.current?.id === id) {
      return messagesRef.current.some(m => m.role === 'user' || m.role === 'assistant');
    }
    const msgs = await MiaomiaoBoxDB.listMessages(id);
    return msgs.some(m => m.role === 'user' || m.role === 'assistant');
  };

  const refreshLists = async (charId: string) => {
    const list = await MiaomiaoBoxDB.listSessionsByChar(charId);
    const hist: MiaomiaoSession[] = [];
    const merged: MiaomiaoSession[] = [];
    for (const row of list) {
      if (row.archive?.lines?.length) {
        hist.push(row);
        merged.push(row);
        continue;
      }
      if (row.status === 'playing') {
        merged.push(row);
        continue;
      }
      const msgs = await MiaomiaoBoxDB.listMessages(row.id);
      const lines = toArchiveLines(msgs);
      if (!lines.length) {
        merged.push(row);
        continue;
      }
      const mode: MiaomiaoArchiveMode = row.status === 'paused' ? 'paused' : row.status === 'forgotten' ? 'forget' : 'raw';
      const saved: MiaomiaoSession = { ...row, archive: { savedAt: row.updatedAt, mode, lines } };
      await MiaomiaoBoxDB.saveSession(saved);
      if (sessionRef.current?.id === saved.id) setSession(saved);
      hist.push(saved);
      merged.push(saved);
    }
    hist.sort((a, b) => (b.archive?.savedAt || 0) - (a.archive?.savedAt || 0));
    setHistorySessions(hist);
    setLiveSessions(merged.filter(s => s.status === 'playing' || s.status === 'paused'));
  };

  const persistSession = async (next: MiaomiaoSession) => {
    await MiaomiaoBoxDB.saveSession(next);
    setSession(next);
  };

  const explodeCombinedAssistant = async (msgs: MiaomiaoMessage[], st?: MiaomiaoSettings | null): Promise<MiaomiaoMessage[]> => {
    const out: MiaomiaoMessage[] = [];
    const style = st?.voiceQuoteStyle;
    const custom = st?.voiceQuoteCustom;
    for (const m of msgs) {
      if (m.role !== 'assistant' || m.kind === 'html' || m.kind === 'voice') {
        out.push(m);
        continue;
      }
      const raw = m.content || '';
      const looksCombined = !!m.htmlSource || /<[语語]音|<voice\b|<字幕>|\[html\]/i.test(raw);
      if (!looksCombined) {
        out.push({ ...m, kind: m.kind || 'text' });
        continue;
      }
      const segs = splitIntoBubbles(raw, style, custom);
      const needSplit = segs.length > 1 || !!m.htmlSource;
      if (!needSplit) {
        out.push({ ...m, kind: segs[0]?.kind || 'text' });
        continue;
      }
      await MiaomiaoBoxDB.deleteMessage(m.id);
      let ts = m.timestamp;
      for (const seg of segs) {
        const row: MiaomiaoMessage = {
          id: MiaomiaoBoxDB.newId('a'),
          sessionId: m.sessionId,
          charId: m.charId,
          role: 'assistant',
          kind: seg.kind,
          content: seg.content,
          voiceSourceText: seg.voiceSourceText,
          timestamp: ts++,
          folded: m.folded,
        };
        await MiaomiaoBoxDB.saveMessage(row);
        out.push(row);
      }
      if (m.htmlSource) {
        const htmlRow: MiaomiaoMessage = {
          id: MiaomiaoBoxDB.newId('a'),
          sessionId: m.sessionId,
          charId: m.charId,
          role: 'assistant',
          kind: 'html',
          content: m.htmlTextPreview || '',
          htmlSource: m.htmlSource,
          htmlTextPreview: m.htmlTextPreview,
          timestamp: ts++,
          folded: m.folded,
        };
        await MiaomiaoBoxDB.saveMessage(htmlRow);
        out.push(htmlRow);
      }
    }
    return out;
  };

  const loadSessionBundle = async (s: MiaomiaoSession) => {
    const [listed, st] = await Promise.all([
      MiaomiaoBoxDB.listMessages(s.id),
      MiaomiaoBoxDB.getSettings(s.charId),
    ]);
    const relocated = relocateSummaries(listed);
    for (const row of relocated.moved) await MiaomiaoBoxDB.saveMessage(row);
    setSession(s);
    setMessages(keepVoices(await explodeCombinedAssistant(relocated.messages, st)));
    setSettings(st);
  };

  const openForChar = useCallback(async (charId: string) => {
    const st = await MiaomiaoBoxDB.getSettings(charId);
    setSettings(st);
    await refreshLists(charId);
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

  useEffect(() => {
    const s = sessionRef.current;
    if (shell === 'float' && s && os.activeCharacterId && s.charId !== os.activeCharacterId) {
      setPending(null);
      setShell('widget');
    }
  }, [os.activeCharacterId, shell, session?.charId]);

  const collapseToWidget = () => {
    setPending(null);
    if (session) setShell('widget');
    else setShell('hidden');
  };

  const expandFloat = () => {
    const s = sessionRef.current;
    if (!s) return;
    os.setActiveCharacterId(s.charId);
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
      foldKeep: st.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT,
      bigFoldEvery: st.bigFoldEvery ?? MIAOMIAO_BIG_FOLD_DEFAULT,
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

  const toastSummaryFailure = (e: unknown, failText: string) => {
    if (e instanceof SecondaryLlmNotConfiguredError) {
      os.addToast('请先在设置里打开并填好辅助 API，喵喵盒总结才能用', 'error');
      return;
    }
    if (failText) os.addToast(failText, 'error');
  };

  const maybeFold = async (s: MiaomiaoSession, msgs: MiaomiaoMessage[]): Promise<{ messages: MiaomiaoMessage[]; session: MiaomiaoSession; note: string }> => {
    const foldN = s.foldN || MIAOMIAO_FOLD_N_DEFAULT;
    const foldKeep = s.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT;
    const bigEvery = s.bigFoldEvery ?? MIAOMIAO_BIG_FOLD_DEFAULT;
    const gates = planAfterReply(msgs, foldN, foldKeep, bigEvery);
    if (!gates.bigBatch.length && !gates.roll.shouldFold) return { messages: msgs, session: s, note: '' };
    setFoldBusy(true);
    const notes: string[] = [];
    let curMsgs = msgs;
    let curSession = s;
    try {
      const batch = gates.bigBatch;
      if (batch.length) {
        try {
          const packed = batch.map(m => `第 ${m.summaryRange?.fromRound ?? '?'}–${m.summaryRange?.toRound ?? '?'} 轮：\n${m.content}`).join('\n\n');
          os.addToast('正在压大前情…', 'info');
          setFoldNote('正在压大前情…');
          await Promise.resolve();
          const body = (await callSecondaryLlm({
            secondaryLlm: os.apiConfig.secondaryLlm,
            system: BOX_BIG_FOLD_PROMPT,
            user: packed,
            temperature: BOX_FOLD_TEMPERATURE,
            purpose: '盒子滚动大总结',
          })).trim();
          if (!body) throw new Error('大总结是空的');
          const first = batch[0];
          const last = batch[batch.length - 1];
          const big: MiaomiaoMessage = {
            id: MiaomiaoBoxDB.newId('big'),
            sessionId: s.id,
            charId: s.charId,
            role: 'summary',
            summaryKind: 'big',
            content: body,
            timestamp: Date.now(),
            summaryRange: {
              fromRound: first.summaryRange?.fromRound ?? 1,
              toRound: last.summaryRange?.toRound ?? first.summaryRange?.fromRound ?? 1,
            },
            originalSummary: body,
          };
          curMsgs = applyBigFold(curMsgs, new Set(batch.map(m => m.id)), big);
          const placedBig = curMsgs.find(m => m.id === big.id) || big;
          for (const row of batch) await MiaomiaoBoxDB.saveMessage({ ...row, folded: true });
          await MiaomiaoBoxDB.saveMessage(placedBig);
        } catch (e) {
          notes.push('滚动大总结没做成，原来的几条前情先留着');
          toastSummaryFailure(e, '大前情没压成，原来的几条前情先留着');
          console.warn('[miaomiao] big fold skipped', e);
        }
      }
      const planNow = planFold(curMsgs, foldN, foldKeep);
      if (!planNow.shouldFold) return { messages: curMsgs, session: curSession, note: notes.join(' · ') };
      try {
        const existing = curMsgs.filter(m => m.role === 'summary' && !m.folded).map(m => m.content).join('\n');
        const fresh = planNow.toFold.map(m => displayTextForBoxReply(m.content)).join('\n');
        os.addToast('正在写滚动前情…', 'info');
        setFoldNote('正在写滚动前情…');
        await Promise.resolve();
        const body = (await callSecondaryLlm({
          secondaryLlm: os.apiConfig.secondaryLlm,
          system: BOX_FOLD_PROMPT,
          user: `已有的摘要：\n${existing || '（空）'}\n\n这次要折进来的新内容：\n${fresh}`,
          temperature: BOX_FOLD_TEMPERATURE,
          purpose: '盒子滚动摘要',
        })).trim();
        if (!body) throw new Error('滚动总结是空的');
        const summary: MiaomiaoMessage = {
          id: MiaomiaoBoxDB.newId('sum'),
          sessionId: s.id,
          charId: s.charId,
          role: 'summary',
          summaryKind: 'roll',
          content: body,
          timestamp: Date.now(),
          summaryRange: { fromRound: planNow.foldFromRound, toRound: planNow.foldToRound },
          originalSummary: body,
        };
        curMsgs = applyFold(curMsgs, new Set(planNow.toFold.map(m => m.id)), summary);
        const placed = curMsgs.find(m => m.id === summary.id) || summary;
        for (const row of planNow.toFold) await MiaomiaoBoxDB.saveMessage({ ...row, folded: true });
        await MiaomiaoBoxDB.saveMessage(placed);
        curSession = {
          ...curSession,
          foldCount: curSession.foldCount + 1,
          foldedRoundCount: curSession.foldedRoundCount + (planNow.foldToRound - planNow.foldFromRound + 1),
          updatedAt: Date.now(),
        };
        await persistSession(curSession);
      } catch (e) {
        notes.push('这一轮滚动总结没做成，这几轮原文先留着');
        toastSummaryFailure(e, '这一轮滚动前情没写成，原文先留着');
        console.warn('[miaomiao] fold skipped', e);
      }
      return { messages: curMsgs, session: curSession, note: notes.join(' · ') };
    } finally {
      setFoldBusy(false);
    }
  };

  const ensureTheme = async (s: MiaomiaoSession, msgs: MiaomiaoMessage[]): Promise<{ session: MiaomiaoSession; note: string }> => {
    if ((s.theme || '').trim()) return { session: s, note: '' };
    const sample = msgs
      .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.folded)
      .slice(-8)
      .map(m => displayTextForBoxReply(m.content))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!sample) return { session: s, note: '' };
    try {
      const raw = await callSecondaryLlm({
        secondaryLlm: os.apiConfig.secondaryLlm,
        system: BOX_THEME_PROMPT,
        user: sample.slice(0, 2000),
        temperature: 0.7,
        purpose: '盒子章节名',
      });
      const theme = tidyBoxTheme(raw);
      if (!theme) throw new Error('章节名是空的');
      const next = { ...s, theme, updatedAt: Date.now() };
      await persistSession(next);
      await refreshLists(next.charId);
      return { session: next, note: '' };
    } catch (e) {
      if (e instanceof SecondaryLlmNotConfiguredError) toastSummaryFailure(e, '');
      console.warn('[miaomiao] theme skipped', e);
      return { session: s, note: '章节名没起成，下次再试' };
    }
  };

  const ttsOn = () => {
    const st = settings;
    if (st?.ttsEnabled !== undefined) return st.ttsEnabled;
    return st?.ttsAutoPlay !== false;
  };

  const keepVoices = (rows: MiaomiaoMessage[]) => rows.map(m => {
    const live = voiceMem.current.get(m.id);
    if (!live) return { ...m, voiceUrl: undefined, voiceSynthText: undefined };
    return { ...m, voiceUrl: live.voiceUrl, voiceSynthText: live.voiceSynthText };
  });

  const playSavedUrl = async (id: string, url: string) => {
    if (!audioRef.current) audioRef.current = new Audio();
    setPlayingVoiceId(id);
    await playVoiceAudio(audioRef.current, url, {
      onPlaying: () => setPlayingVoiceId(id),
      onStopped: () => setPlayingVoiceId(cur => cur === id ? null : cur),
      onError: () => setPlayingVoiceId(cur => cur === id ? null : cur),
    });
  };

  const ttsPayloadOf = (m: MiaomiaoMessage) => {
    const st = settings;
    const raw = (m.voiceSourceText || m.content || '').trim();
    const { spoken, emotion } = spokenTextForBoxReply(raw, st?.voiceQuoteStyle, st?.voiceQuoteCustom);
    const text = (spoken || cleanShown(raw)).trim();
    return { text, emotion };
  };

  const synthToMessage = async (s: MiaomiaoSession, m: MiaomiaoMessage, play: boolean) => {
    const char = os.characters.find(c => c.id === s.charId);
    if (!char) return m;
    const { text, emotion } = ttsPayloadOf(m);
    if (!text) return m;
    const cached = voiceMem.current.get(m.id);
    if (cached?.voiceUrl && cached.voiceSynthText === text) {
      const live = { ...m, voiceUrl: cached.voiceUrl, voiceSynthText: cached.voiceSynthText };
      setMessages(prev => prev.map(x => x.id === m.id ? live : x));
      if (play) await playSavedUrl(m.id, cached.voiceUrl);
      return live;
    }
    setVoiceLoadingId(m.id);
    try {
      const url = await synthesizeSpeech(text, char, os.apiConfig, {
        emotion,
        languageBoost: char.chatVoiceLang || undefined,
        groupId: os.apiConfig.minimaxGroupId || undefined,
        skipCache: true,
      });
      const next = { ...m, voiceUrl: url, voiceSynthText: text };
      voiceMem.current.set(m.id, { voiceUrl: url, voiceSynthText: text });
      await MiaomiaoBoxDB.saveMessage(next);
      setMessages(prev => prev.map(x => x.id === m.id ? next : x));
      if (play) await playSavedUrl(m.id, url);
      return next;
    } finally {
      setVoiceLoadingId(cur => cur === m.id ? null : cur);
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
    const history = await loadCharacterContextMessages(char);
    const prompt = buildMiaomiaoPlayPrompt({
      apiConfig: os.apiConfig,
      worldRules: s.worldRules,
      starter: s.starter,
      quoteStyle: settings?.voiceQuoteStyle,
    });
    const payload = await buildChatRequestPayload({
      char,
      userProfile: os.userProfile,
      groups: os.groups || [],
      emojis: [],
      categories: [],
      historyMsgs: history,
      contextLimit: Math.max(1, history.length),
      realtimeConfig: os.realtimeConfig,
      miaomiaoBoxPrompt: prompt,
      htmlMode: { enabled: false },
    } as any);
    const listed = await MiaomiaoBoxDB.listMessages(s.id);
    const relocated = relocateSummaries(listed);
    for (const row of relocated.moved) await MiaomiaoBoxDB.saveMessage(row);
    const boxMsgs = relocated.messages;
    const extra = formatBoxHistoryForModel(boxMsgs);
    const last = extra[extra.length - 1];
    if (userText && (!last || last.role !== 'user' || last.content !== userText)) {
      extra.push({ role: 'user', content: userText });
    }
    const apiMessages: { role: string; content: string }[] = [
      { role: 'system', content: `${payload.systemPrompt}\n\n${BOX_PAST_GUIDE}` },
      ...payload.cleanedApiMessages,
      { role: 'system', content: BOX_NOW_GUIDE },
      ...extra,
    ];
    const firstCut: Partial<Record<MiaomiaoStarter, string>> = {
      claw: '【本场开口】抓娃娃这一轮按抓娃娃起手式开场，改成卖货。这一轮不要用角色本人的身份开场。主聊天里发生过的事照常记得。',
      walk: '【本场开口】出门逛逛这一轮按出门逛逛起手式开场，改成出门。这一轮不要用角色本人的身份开场。主聊天里发生过的事照常记得。',
      random: '【本场开口】爪爪扒拉这一轮按爪爪扒拉起手式开场，另起一个场面。这一轮不要用角色本人的身份开场。主聊天里发生过的事照常记得。',
    };
    const cut = firstCut[s.starter];
    if (cut && !boxMsgs.some(m => m.role === 'assistant')) {
      apiMessages.push({ role: 'system', content: cut });
    }
    if (settings?.thinking === true) {
      const guide = buildBoxThinkingPrompt(settings.thinkingGuide);
      if (guide) apiMessages.push({ role: 'system', content: guide });
    }
    apiMessages.push({ role: 'system', content: BOX_TURN_BAN });
    let streamedReasoning = '';
    setLiveText('');
    setLiveThinking('');
    setParamNote('');
    const reply = await callMainChatLlm({
      apiConfig: os.apiConfig,
      messages: apiMessages,
      temperature: settings?.temperature ?? 1,
      topP: settings?.topP ?? 1,
      frequencyPenalty: settings?.frequencyPenalty ?? 0,
      presencePenalty: settings?.presencePenalty ?? 0,
      stream: settings?.stream === true,
      thinking: settings?.thinking === true,
      charId: char.id,
      charName: char.name,
      onDelta: full => {
        const split = splitBoxThinking(full, streamedReasoning);
        setLiveText(split.content);
        setLiveThinking(split.thinking);
      },
      onThinking: full => {
        streamedReasoning = full;
        setLiveThinking(full);
      },
    });
    const raw = reply.content;
    const notes: string[] = [];
    if (reply.fellBack) notes.push('这一轮参数被模型拒绝了，已经回退到主 API 的设置重发');
    if (settings?.thinking === true && !reply.fellBack && !reply.thinking) notes.push('开了思考，但这一轮模型没返回思维链');
    if (!raw.trim() && reply.thinking) notes.push('这一轮只想了没写剧情');
    setParamNote(notes.join(' · '));
    const { blocks, cleanedContent } = extractHtmlBlocks(raw);
    const html = blocks[0];
    const segs = splitIntoBubbles(cleanedContent || raw, settings?.voiceQuoteStyle, settings?.voiceQuoteCustom);
    const created: MiaomiaoMessage[] = [];
    let ts = Date.now();
    for (const seg of segs) {
      const row: MiaomiaoMessage = {
        id: MiaomiaoBoxDB.newId('a'),
        sessionId: s.id,
        charId: s.charId,
        role: 'assistant',
        kind: seg.kind,
        content: seg.content,
        voiceSourceText: seg.voiceSourceText,
        timestamp: ts++,
      };
      created.push(row);
    }
    if (html) {
      created.push({
        id: MiaomiaoBoxDB.newId('a'),
        sessionId: s.id,
        charId: s.charId,
        role: 'assistant',
        kind: 'html',
        content: html.textPreview || '',
        htmlSource: html.html,
        htmlTextPreview: html.textPreview,
        timestamp: ts++,
      });
    }
    if (reply.thinking?.trim() && created[0]) created[0].thinkingText = reply.thinking.trim();
    for (const row of created) await MiaomiaoBoxDB.saveMessage(row);
    let nextMsgs = persistUser && userText
      ? [...boxMsgs.filter(m => m.id !== userMsg.id), userMsg, ...created]
      : [...boxMsgs, ...created];
    setMessages(keepVoices(nextMsgs));
    setLiveText('');
    setLiveThinking('');
    setTyping(false);
    let cur = s;
    const foldNotes: string[] = [];
    try {
      const folded = await maybeFold(cur, nextMsgs);
      nextMsgs = folded.messages;
      cur = folded.session;
      if (folded.note) foldNotes.push(folded.note);
    } catch (e: any) {
      console.warn('[miaomiao] fold skipped this round', e);
      foldNotes.push('这一轮滚动总结没做成，这几轮原文先留着');
    }
    try {
      const named = await ensureTheme(cur, nextMsgs);
      cur = named.session;
      if (named.note) foldNotes.push(named.note);
    } catch (e: any) {
      console.warn('[miaomiao] theme skipped', e);
      foldNotes.push('章节名没起成，下次再试');
    }
    setFoldNote(foldNotes.join(' · '));
    setMessages(keepVoices(nextMsgs));
    const continued = cur.archive
      ? { ...cur.archive, lines: toArchiveLines(nextMsgs), savedAt: Date.now() }
      : undefined;
    await persistSession({
      ...cur,
      status: 'playing',
      updatedAt: Date.now(),
      title: cur.title || STARTER_LABEL[cur.starter],
      ...(continued ? { archive: continued } : {}),
    });
    if (continued) await refreshLists(s.charId);
    if (shell === 'widget') setUnread(true);
    if (ttsOn()) {
      for (const row of created.filter(r => r.kind === 'voice')) {
        try { await synthToMessage(s, row, false); } catch (e) { console.warn('[miaomiao] tts', e); }
      }
    }
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
      setLiveText('');
      setLiveThinking('');
    }
  };

  const switchMode = async (starter: MiaomiaoStarter) => {
    if (pendingRef.current) {
      setPending(starter);
      setPage('play');
      return;
    }
    const cur = sessionRef.current;
    if (!cur) {
      await startPlay(starter);
      return;
    }
    await persistSession({ ...cur, starter, title: STARTER_LABEL[starter], updatedAt: Date.now() });
    setPage('play');
    await refreshLists(cur.charId);
  };

  const cancelPending = () => setPending(null);

  const pickHomeStarter = async (starter: MiaomiaoStarter) => {
    const charId = os.activeCharacterId;
    if (!charId) return;
    const list = await MiaomiaoBoxDB.listSessionsByChar(charId);
    let exists = false;
    for (const row of list) {
      if (row.status !== 'playing' && row.status !== 'paused') continue;
      if (await sessionHasLines(row.id)) { exists = true; break; }
    }
    if (!exists) {
      setPending(null);
      await startPlay(starter);
      return;
    }
    setPending(starter);
    setError('');
    setPage('play');
  };

  const commitPending = async (text: string) => {
    const starter = pendingRef.current;
    const charId = os.activeCharacterId;
    const t = text.trim();
    if (!starter || !charId || !t) return;
    setPending(null);
    setError('');
    const st = settings || await MiaomiaoBoxDB.getSettings(charId);
    const s: MiaomiaoSession = {
      id: MiaomiaoBoxDB.newId('box'),
      charId,
      title: STARTER_LABEL[starter],
      starter,
      status: 'playing',
      foldN: st.foldN || MIAOMIAO_FOLD_N_DEFAULT,
      foldKeep: st.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT,
      bigFoldEvery: st.bigFoldEvery ?? MIAOMIAO_BIG_FOLD_DEFAULT,
      foldCount: 0,
      foldedRoundCount: 0,
      ttsAutoPlay: st.ttsAutoPlay,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worldRules: st.worldRules || [],
    };
    await persistSession(s);
    setMessages([]);
    setPage('play');
    setTyping(true);
    try {
      await runTurn(s, t, true);
      await refreshLists(charId);
    } catch (e: any) {
      setError(e?.message || '这一轮没演成');
    } finally {
      setTyping(false);
      setLiveText('');
      setLiveThinking('');
    }
  };

  const openLive = async (id: string) => {
    setPending(null);
    const s = await MiaomiaoBoxDB.getSession(id);
    if (!s) return;
    await loadSessionBundle(s);
    setPage('play');
    setError('');
  };

  const leaveToChat = () => {
    const s = sessionRef.current;
    const inPlay = !!(s && s.status === 'playing' && messages.length > 0);
    if (inPlay) setShell('widget');
    else setShell('hidden');
  };

  const sendPlay = async (text: string) => {
    if (pendingRef.current) {
      await commitPending(text);
      return;
    }
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
      setLiveText('');
      setLiveThinking('');
    }
  };

  const writeBoxRecord = async (s: MiaomiaoSession, mode: MiaomiaoArchiveMode, body: string) => {
    const continues = s.continuesMessageId;
    if (continues) {
      const old = await DB.getMessageById(continues);
      if (old) {
        await DB.updateMessageMetadata(continues, (prev: any) => ({ ...(prev || {}), superseded: true }));
      }
    }
    const boxMsgs = await MiaomiaoBoxDB.listMessages(s.id);
    const id = await DB.saveMessage({
      charId: s.charId,
      role: 'assistant',
      type: 'box_record',
      content: mode === 'forget' ? body : withPerspective(body),
      metadata: {
        title: s.title || STARTER_LABEL[s.starter],
        archiveMode: mode,
        source: 'miaomiao_box',
        sessionId: s.id,
        continuesId: continues,
        foldCount: s.foldCount,
        roundCount: countUnfoldedRounds(boxMsgs) + s.foldedRoundCount,
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
    if (!s) {
      setError('箱子里还没有这场戏');
      return;
    }
    setError('');
    const msgs = await MiaomiaoBoxDB.listMessages(s.id);
    const base: MiaomiaoSession = { ...s, archive: archiveOf(mode, msgs) };
    try {
      if (mode === 'remember') {
        const { summaries, remainder } = materialsForArchive(msgs);
        const body = await callSecondaryLlm({
          secondaryLlm: os.apiConfig.secondaryLlm,
          system: BOX_REMEMBER_PROMPT,
          user: `前面的滚动摘要：\n${summaries || '（空）'}\n\n还没折进去的原文：\n${remainder || '（空）'}`,
          temperature: BOX_REMEMBER_TEMPERATURE,
          purpose: '盒子记在心里',
        });
        await writeBoxRecord(base, mode, body.includes('【刚刚发生的事】') ? body : wrapArchiveBody(body, mode));
        await persistSession({ ...base, status: 'closed', updatedAt: Date.now() });
      } else if (mode === 'raw' || mode === 'paused') {
        await writeBoxRecord(base, mode, packRawArchive(msgs, mode));
        if (mode === 'raw') await persistSession({ ...base, status: 'closed', updatedAt: Date.now() });
      } else {
        await writeBoxRecord(base, 'forget', packRawArchive(msgs, 'forget'));
        await persistSession({ ...base, status: 'forgotten', updatedAt: Date.now() });
      }
    } catch (e: any) {
      if (e instanceof SecondaryLlmNotConfiguredError) {
        toastSummaryFailure(e, '');
        setError('请先在设置里打开并填好辅助 API，喵喵盒总结才能用');
      } else {
        setError(e?.message || '合盖没做成');
      }
      return;
    }
    setPending(null);
    await refreshLists(s.charId);
    setShell('hidden');
    setPage('home');
    if (mode !== 'paused') {
      setSession(null);
      setMessages([]);
    }
  };

  const deleteHistory = async (id: string) => {
    const row = historySessions.find(s => s.id === id) || await MiaomiaoBoxDB.getSession(id);
    const charId = row?.charId || sessionRef.current?.charId || os.activeCharacterId;
    await MiaomiaoBoxDB.deleteSessionBundle(id);
    if (sessionRef.current?.id === id) {
      setSession(null);
      setMessages([]);
      setPage('home');
    }
    if (charId) await refreshLists(charId);
  };

  const editMessage = async (id: string, content: string) => {
    const list = messagesRef.current;
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return;
    const m = list[idx];
    if (m.role === 'summary') {
      const next = { ...m, content };
      await MiaomiaoBoxDB.saveMessage(next);
      setMessages(keepVoices(list.map(x => x.id === id ? next : x)));
      return;
    }
    voiceMem.current.delete(id);
    const segs = splitIntoBubbles(normalizeEditBreaks(content), settings?.voiceQuoteStyle, settings?.voiceQuoteCustom);
    const toRows = (raw: string, kind: 'text' | 'voice' | undefined, ts: number, keepId?: string): MiaomiaoMessage => ({
      ...m,
      id: keepId || MiaomiaoBoxDB.newId(m.role === 'user' ? 'u' : 'a'),
      kind: m.role === 'user' ? m.kind : kind,
      content: kind === 'voice' && m.role !== 'user' ? cleanShown(raw) : raw,
      voiceSourceText: kind === 'voice' && m.role !== 'user' ? raw : undefined,
      timestamp: ts,
      voiceUrl: undefined,
      voiceSynthText: undefined,
      htmlSource: keepId ? m.htmlSource : undefined,
      htmlTextPreview: keepId ? m.htmlTextPreview : undefined,
    });
    if (segs.length <= 1) {
      const raw = (segs[0]?.raw || normalizeEditBreaks(content)).trim();
      const kind = m.role === 'user' ? undefined : (segs[0]?.kind || 'text');
      const next = toRows(kind === 'voice' ? raw : (segs[0]?.content || raw), kind === 'voice' ? 'voice' : 'text', m.timestamp, m.id);
      await MiaomiaoBoxDB.saveMessage(next);
      setMessages(keepVoices(list.map(x => x.id === id ? next : x)));
      return;
    }
    const shift = segs.length - 1;
    const after = list.slice(idx + 1).map(x => ({ ...x, timestamp: x.timestamp + shift }));
    const created = segs.map((seg, i) => toRows(
      m.role === 'user' ? seg.content : (seg.kind === 'voice' ? seg.raw : seg.content),
      m.role === 'user' ? 'text' : seg.kind,
      m.timestamp + i,
      i === 0 ? m.id : undefined,
    ));
    for (const row of after) await MiaomiaoBoxDB.saveMessage(row);
    for (const row of created) await MiaomiaoBoxDB.saveMessage(row);
    setMessages(keepVoices([...list.slice(0, idx), ...created, ...after]));
  };

  const deleteBoxMessage = async (id: string) => {
    await MiaomiaoBoxDB.deleteMessage(id);
    setMessages(messagesRef.current.filter(x => x.id !== id));
  };

  const dissolveSummary = async (id: string) => {
    const s = sessionRef.current;
    if (!s) return;
    const list = messagesRef.current;
    const undone = dissolveSummaryCard(list, id);
    if (!undone.removedId) return;
    for (const row of undone.restored) await MiaomiaoBoxDB.saveMessage(row);
    await MiaomiaoBoxDB.deleteMessage(undone.removedId);
    const nextSession = {
      ...s,
      foldCount: Math.max(0, (s.foldCount || 0) - undone.undoneFolds),
      foldedRoundCount: Math.max(0, (s.foldedRoundCount || 0) - undone.restoredRounds),
      updatedAt: Date.now(),
    };
    await persistSession(nextSession);
    setMessages(keepVoices(undone.messages));
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
      let prevUserIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (list[i].role === 'user') { prevUserIdx = i; break; }
      }
      userText = prevUserIdx >= 0 ? list[prevUserIdx].content : '';
      const from = prevUserIdx + 1;
      for (let i = from; i < list.length; i++) {
        if (list[i].role === 'user') break;
        if (list[i].role === 'assistant') removeIds.push(list[i].id);
      }
    } else {
      userText = target.content;
      for (let i = idx + 1; i < list.length; i++) {
        if (list[i].role === 'user') break;
        if (list[i].role === 'assistant') removeIds.push(list[i].id);
      }
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
      setLiveText('');
      setLiveThinking('');
    }
  };

  const rerollLastTurn = async () => {
    const list = messagesRef.current;
    const lastUser = [...list].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    await rerollMessage(lastUser.id);
  };

  const playBoxVoice = async (id: string) => {
    const s = sessionRef.current;
    const m = messagesRef.current.find(x => x.id === id);
    if (!s || !m) return;
    if (m.role === 'user' || m.kind === 'html') return;
    if (m.kind === 'text' && !m.voiceSourceText && !/<[语語]音/.test(m.content || '')) return;
    try {
      await synthToMessage(s, m, true);
    } catch (e) {
      console.warn('[miaomiao] play', e);
    }
  };

  const downloadBoxVoice = async (id: string) => {
    const s = sessionRef.current;
    const m = messagesRef.current.find(x => x.id === id);
    if (!s || !m) return;
    if (m.kind && m.kind !== 'voice') return;
    try {
      const next = await synthToMessage(s, m, false);
      const url = next.voiceUrl;
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      const charName = (os.characters.find(c => c.id === s.charId)?.name || '角色').replace(/[\\/:*?"<>|]/g, '').trim() || '角色';
      let n = 1;
      try {
        n = Number(localStorage.getItem('miaomiao-voice-seq') || '0') + 1;
        if (!Number.isFinite(n) || n < 1) n = 1;
        localStorage.setItem('miaomiao-voice-seq', String(n));
      } catch { /* ignore */ }
      a.download = `${charName}-${String(n).padStart(3, '0')}.mp3`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.warn('[miaomiao] download', e);
    }
  };

  const dismissError = () => setError('');

  const renameTheme = async (theme: string) => {
    const s = sessionRef.current;
    if (!s) return;
    const next = { ...s, theme: theme.replace(/\s+/g, ' ').trim().slice(0, 24), updatedAt: Date.now() };
    await persistSession(next);
    await refreshLists(s.charId);
  };

  const saveSettings = async (next: MiaomiaoSettings) => {
    await MiaomiaoBoxDB.saveSettings(next);
    setSettings(next);
    if (session && session.charId === next.charId) {
      await persistSession({
        ...session,
        foldN: next.foldN,
        foldKeep: next.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT,
        bigFoldEvery: next.bigFoldEvery ?? MIAOMIAO_BIG_FOLD_DEFAULT,
        ttsAutoPlay: next.ttsEnabled !== false,
        worldRules: next.worldRules,
        updatedAt: Date.now(),
      });
    }
  };

  const value = useMemo<Ctx>(() => ({
    shell, page, session, messages, settings, typing, error, unread, foldBusy,
    openForChar, collapseToWidget, expandFloat, setPage, startPlay, switchMode, sendPlay, leaveToChat, closeLid, saveSettings, playingForChar,
    editMessage, deleteBoxMessage, dissolveSummary, rerollMessage, rerollLastTurn, playingVoiceId, voiceLoadingId, playBoxVoice, downloadBoxVoice,
    pendingStarter, liveSessions, historySessions, pickHomeStarter, cancelPending, openLive, deleteHistory, renameTheme,
    liveText, liveThinking, paramNote, foldNote, dismissError,
  }), [shell, page, session, messages, settings, typing, error, unread, foldBusy, openForChar, pendingStarter, liveSessions, historySessions, playingVoiceId, voiceLoadingId, liveText, liveThinking, paramNote, foldNote]);

  return <MiaomiaoBoxContext.Provider value={value}>{children}</MiaomiaoBoxContext.Provider>;
};
