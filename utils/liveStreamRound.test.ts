import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DB, openDB } from './db';
import {
  STORE_LIVE_CHANNELS,
  STORE_LIVE_KV,
  STORE_LIVE_NPC_WATCHES,
  STORE_LIVE_SESSIONS,
  STORE_LIVE_VODS,
} from './liveStreamDb';
import { __resetLiveMigrationCache } from './liveStreamMigration';
import {
  applyRoundSummary,
  buildNpcRoundCard,
  formatRoundBody,
  liveRoundSignature,
  loadOnAirRealtimeSettings,
  pickRoundToFold,
  saveOnAirRealtimeSettings,
  createLiveSessionMarkerInDb,
  syncLiveChunkToDb,
  syncNpcBeatToDb,
  updateLiveSessionMarkerInDb,
  updateLiveRoundCardSummary,
  loadActiveViewerPersonaId,
  saveActiveViewerPersonaId,
} from './liveStreamStorage';
import { isVisibleChatMessage } from './chatMessageVisibility';
import type {
  LiveBeat,
  LiveChunk,
  LiveDanmakuItem,
  LiveStreamSession,
  LivestreamChatCardPayload,
  NpcWatchBeat,
  NpcWatchSession,
  StreamerChannelProfile,
  ViewerPersona,
} from './liveStreamTypes';
import { DEFAULT_ONAIR_REALTIME_SETTINGS } from './liveStreamTypes';

// 这组用例钉住「逐轮时间线」的几条生死线：
//   1. 四轮一压、一次只压最早一轮，最新 3 轮永远留原文，绝不把两轮合并成一条；
//   2. 每一轮在聊天里就是一条卡，摘要/编辑/重 Roll 都只改这一条，ID 与时间戳不动；
//   3. 卡被用户删了就是删了，后续再算摘要也不许把它重建出来；
//   4. 摘要覆盖本轮全部公屏弹幕，普通路人也在，不是只留 SC 和熟人；
//   5. 陪看每一拍一条卡，重 Roll 那拍原地改；
//   6. 电波「实时背景」开关存在 live_kv 里，刷新后还在。

const CHAR_ID = 'char_round_test';
const CHANNEL_ID = 'ch_round_test';

async function clearStores(names: string[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    names.forEach(n => tx.objectStore(n).clear());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function makeChannel(): StreamerChannelProfile {
  return {
    id: CHANNEL_ID,
    charId: CHAR_ID,
    channelName: '苏栗 Official',
    handle: '@suli',
    bannerGradient: 'from-sky-300 to-indigo-400',
    identityMode: 'public_main',
    bio: '',
    streamerPersonaPrompt: '',
    followerCount: 1200,
    fanBadgeName: '常連',
    defaultCategory: '雑談',
    voiceConfig: { language: '', enableTranslation: false, autoPlayTts: false },
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeSession(chunkCount = 0): LiveStreamSession {
  return {
    id: 'sess_round_test',
    channelId: CHANNEL_ID,
    charId: CHAR_ID,
    title: '深夜雑談',
    categoryKey: 'talk',
    categoryLabel: '雑談',
    status: 'live',
    viewerCount: 321,
    likeCount: 0,
    chunks: Array.from({ length: chunkCount }, (_, i) => makeChunk(i)),
    rollingSummaries: [],
    pendingDanmakuQueue: [],
    foldEveryNChunks: 4,
    foldKeepRecentChunks: 3,
    startedAt: 1,
  };
}

function dm(senderName: string, text: string, extra: Partial<LiveDanmakuItem> = {}): LiveDanmakuItem {
  return { id: `dm_${senderName}_${text}`, senderName, text, timestamp: 1, ...extra };
}

function makeBeat(index: number, chunkId = 'c0'): LiveBeat {
  return {
    id: `beat_${index}`,
    chunkId,
    index,
    screen: `画面 ${index}`,
    speechOriginal: `台词 ${index}`,
    danmaku: [
      dm('路人甲', `普通弹幕 ${index}`),
      dm('常連さん', `会员弹幕 ${index}`, { fanBadge: '常連' }),
      dm('老板', `SC 弹幕 ${index}`, { scAmount: 30 }),
    ],
  };
}

function makeChunk(index: number, overrides: Partial<LiveChunk> = {}): LiveChunk {
  const id = `chunk_${index}`;
  return {
    id,
    index,
    createdAt: 1000 + index,
    beats: [makeBeat(index * 2, id), makeBeat(index * 2 + 1, id)],
    userInputs: [dm('你', `我发的弹幕 ${index}`, { isUserMain: true })],
    ...overrides,
  };
}

function makeNpcSession(): NpcWatchSession {
  return {
    id: 'npc_sess_test',
    charId: CHAR_ID,
    npcStreamerName: '小海豹',
    npcCategoryLabel: 'ゲーム',
    npcRoomTitle: '海豹突击',
    npcBio: '',
    coverGradient: 'from-teal-300 to-cyan-400',
    viewerCount: 88,
    beats: [],
    createdAt: 1,
  };
}

function makeNpcBeat(index: number): NpcWatchBeat {
  return {
    id: `npc_beat_${index}`,
    index,
    npcScreen: `NPC 画面 ${index}`,
    npcSpeech: `NPC 台词 ${index}`,
    npcDanmaku: [dm('观众X', `NPC 弹幕 ${index}`)],
    charReactionAction: '歪头',
    charReactionSpeech: `反应 ${index}`,
    userActionNote: index === 0 ? '丢了颗糖' : undefined,
  };
}

async function allMessages(charId = CHAR_ID) {
  return DB.getMessagesByCharId(charId, true);
}

/** 轮次卡的正文就是这条消息的 content（JSON），直接解出来看 */
function cardOf(msg: { content: string }): LivestreamChatCardPayload | null {
  try {
    const parsed = JSON.parse(msg.content);
    return parsed?.type === 'livestream_card' ? (parsed as LivestreamChatCardPayload) : null;
  } catch {
    return null;
  }
}

beforeEach(async () => {
  __resetLiveMigrationCache();
  await clearStores([
    STORE_LIVE_CHANNELS,
    STORE_LIVE_SESSIONS,
    STORE_LIVE_VODS,
    STORE_LIVE_NPC_WATCHES,
    STORE_LIVE_KV,
    'messages',
    'characters',
  ]);
  localStorage.clear();
});

// ==================== 1. 四轮一压 ====================

describe('四轮一压：一次只压最早一轮', () => {
  it('前三轮不压，第 4 轮才触发第 1 轮', () => {
    const session = makeSession(3);
    expect(pickRoundToFold(session.chunks)).toBeNull();

    session.chunks.push(makeChunk(3));
    expect(pickRoundToFold(session.chunks)?.index).toBe(0);
  });

  it('压完第 1 轮后停手，最新 3 轮（第 2~4 轮）仍是原文', () => {
    let session = makeSession(4);
    const target = pickRoundToFold(session.chunks)!;
    session = applyRoundSummary(session, target.id, '第一轮摘要');

    expect(session.chunks[0].roundSummary).toBe('第一轮摘要');
    expect(session.chunks.slice(1).every(c => !c.roundSummary)).toBe(true);
    expect(pickRoundToFold(session.chunks)).toBeNull();
  });

  it('第 5 轮完成后只压第 2 轮，摘要不会把两轮合成一条', () => {
    let session = makeSession(4);
    session = applyRoundSummary(session, pickRoundToFold(session.chunks)!.id, '第一轮摘要');

    session.chunks.push(makeChunk(4));
    const target = pickRoundToFold(session.chunks)!;
    expect(target.index).toBe(1);

    session = applyRoundSummary(session, target.id, '第二轮摘要');
    const summarized = session.chunks.filter(c => c.roundSummary);
    expect(summarized.map(c => c.index)).toEqual([0, 1]);
    expect(session.chunks.filter(c => !c.roundSummary).map(c => c.index)).toEqual([2, 3, 4]);
    // 摘要条目数 = 被压的轮数，没有一条吞掉两轮
    expect(summarized).toHaveLength(2);
    expect(summarized[0].roundSummary).not.toContain('第二轮');
  });

  it('chunks 顺序被打乱时仍按轮次先后挑', () => {
    const session = makeSession(4);
    session.chunks = [session.chunks[2], session.chunks[0], session.chunks[3], session.chunks[1]];
    expect(pickRoundToFold(session.chunks)?.index).toBe(0);
  });

  it('applyRoundSummary 不增删轮次，其余轮次原样返回', () => {
    const session = makeSession(4);
    const before = session.chunks.map(c => ({ ...c }));
    const next = applyRoundSummary(session, 'chunk_2', '第三轮摘要');

    expect(next.chunks).toHaveLength(4);
    expect(next.chunks[2].roundSummary).toBe('第三轮摘要');
    expect(next.chunks[2].summaryUpdatedAt).toBeTypeOf('number');
    expect(next.chunks[0]).toEqual(before[0]);
    expect(next.chunks[1]).toEqual(before[1]);
    expect(next.chunks[3]).toEqual(before[3]);
    // 原对象不动，避免就地改 state
    expect(session.chunks[2].roundSummary).toBeUndefined();
  });
});

// ==================== 2. 一轮一条卡，原位更新 ====================

describe('聊天时间线上的轮次卡', () => {
  it('一组原文卡：只落一条可见消息，来源是 live_round', async () => {
    const channel = makeChannel();
    const session = makeSession(1);
    const chunk = session.chunks[0];

    const id = await syncLiveChunkToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunkIndex: chunk.index,
      beats: chunk.beats,
    });

    const msgs = await allMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe(id);
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].metadata?.source).toBe('live_round');
    expect(isVisibleChatMessage(msgs[0])).toBe(true);

    const card = cardOf(msgs[0]);
    expect(card?.cardKind).toBe('live_round');
    expect(card?.roundIndex).toBe(1);
    expect(card?.isCompressed).toBe(false);
    expect(card?.body).toContain('「台词 0」');
  });

  it('本轮全部公屏弹幕都进正文（普通路人 / 会员 / SC 都在）', async () => {
    const channel = makeChannel();
    const session = makeSession(1);
    const body = formatRoundBody(channel, session, session.chunks[0]);

    expect(body).toContain('路人甲');
    expect(body).toContain('常連さん');
    expect(body).toContain('SC ¥30');
  });

  it('重 Roll 同一条：ID 与时间戳不变，消息不增加', async () => {
    const channel = makeChannel();
    const session = makeSession(1);
    const first = await syncLiveChunkToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunkIndex: 0,
      beats: session.chunks[0].beats,
    });
    const before = await DB.getMessageById(first);

    const rerolled = [makeBeat(0, 'chunk_0'), makeBeat(1, 'chunk_0')];
    rerolled[0].speechOriginal = '重 Roll 后的台词';
    const again = await syncLiveChunkToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunkIndex: 0,
      beats: rerolled,
      existingDbMsgId: first,
    });

    const msgs = await allMessages();
    expect(again).toBe(first);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe(first);
    expect(msgs[0].timestamp).toBe(before!.timestamp);
    expect(msgs[0].content).toContain('重 Roll 后的台词');
  });

  it('压缩后仍只改这一条，并且不会另发一张总结卡', async () => {
    const channel = makeChannel();
    const session = makeSession(1);
    const chunk = session.chunks[0];
    const id = await syncLiveChunkToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunkIndex: 0,
      beats: chunk.beats,
    });
    const before = await DB.getMessageById(id);

    const compressedChunk: LiveChunk = { ...chunk, roundSummary: '这一轮聊了很冷的笑话', dbMessageId: id };
    const ok = await updateLiveRoundCardSummary({
      messageId: id,
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunk: compressedChunk,
      summary: '这一轮聊了很冷的笑话',
    });

    const msgs = await allMessages();
    expect(ok).toBe(true);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe(id);
    expect(msgs[0].timestamp).toBe(before!.timestamp);

    const card = cardOf(msgs[0]);
    expect(card?.isCompressed).toBe(true);
    expect(card?.body).toBe('这一轮聊了很冷的笑话');
    expect(card?.preview).toContain('很冷的笑话');
    expect(card?.cardKind).toBe('live_round');
    // 没有留下旧式整场总结卡
    expect(msgs.filter(m => cardOf(m)?.cardKind === 'live_summary')).toHaveLength(0);
  });

  it('卡被删掉后再算摘要：返回 false，绝不重建', async () => {
    const channel = makeChannel();
    const session = makeSession(1);
    const chunk = session.chunks[0];
    const id = await syncLiveChunkToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunkIndex: 0,
      beats: chunk.beats,
    });

    await DB.deleteMessage(id);
    expect(await allMessages()).toHaveLength(0);

    const ok = await updateLiveRoundCardSummary({
      messageId: id,
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunk: { ...chunk, roundSummary: '摘要' },
      summary: '摘要',
    });
    expect(ok).toBe(false);
    expect(await allMessages()).toHaveLength(0);
  });

  it('卡被删掉后再同步这一轮：也不重建、不另发一条', async () => {
    const channel = makeChannel();
    const session = makeSession(1);
    const chunk = session.chunks[0];
    const id = await syncLiveChunkToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunkIndex: 0,
      beats: chunk.beats,
    });
    await DB.deleteMessage(id);

    await syncLiveChunkToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
      chunkIndex: 0,
      beats: chunk.beats,
      existingDbMsgId: id,
    });
    expect(await allMessages()).toHaveLength(0);
  });

  it('写卡失败要抛出来，不假装成功', async () => {
    const channel = makeChannel();
    const session = makeSession(1);
    const spy = vi.spyOn(DB, 'saveMessage').mockRejectedValueOnce(new Error('QuotaExceededError'));
    await expect(
      syncLiveChunkToDb({
        charId: CHAR_ID,
        charName: '苏栗',
        channel,
        session,
        chunkIndex: 0,
        beats: session.chunks[0].beats,
      }),
    ).rejects.toThrow('QuotaExceededError');
    spy.mockRestore();
    expect(await allMessages()).toHaveLength(0);
  });

  it('多轮各写各的卡：4 轮就是 4 条，互不吞并', async () => {
    const channel = makeChannel();
    const session = makeSession(4);
    const ids: number[] = [];
    for (const chunk of session.chunks) {
      ids.push(
        await syncLiveChunkToDb({
          charId: CHAR_ID,
          charName: '苏栗',
          channel,
          session,
          chunkIndex: chunk.index,
          beats: chunk.beats,
        }),
      );
    }
    const msgs = await allMessages();
    expect(msgs).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    const cards = msgs.map(m => cardOf(m)!);
    expect(cards.map(c => c.roundIndex)).toEqual([1, 2, 3, 4]);
  });
});

describe('开播状态标记', () => {
  it('开播时在时间线上写一条“尚未下播”标记，下播时原位更新同一条', async () => {
    const channel = makeChannel();
    const session = makeSession(0);
    const messageId = await createLiveSessionMarkerInDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel,
      session,
    });
    const startedMessage = await DB.getMessageById(messageId);
    expect(startedMessage).toMatchObject({
      id: messageId,
      role: 'system',
      type: 'score_card',
      timestamp: session.startedAt,
      metadata: { source: 'live_session_marker', liveSessionId: session.id },
    });
    const startedCard = cardOf(startedMessage!);
    expect(startedCard?.cardKind).toBe('live_session_marker');
    expect(startedCard?.sessionStatus).toBe('live');
    expect(startedCard?.body).toContain('直播还没有结束');
    expect(isVisibleChatMessage(startedMessage!, true)).toBe(true);

    const endedSession: LiveStreamSession = { ...session, status: 'ended', endedAt: 2000, startMarkerMessageId: messageId };
    expect(await updateLiveSessionMarkerInDb({ messageId, charId: CHAR_ID, charName: '苏栗', channel, session: endedSession })).toBe(true);

    const endedMessage = await DB.getMessageById(messageId);
    const endedCard = cardOf(endedMessage!);
    expect(endedMessage?.id).toBe(startedMessage?.id);
    expect(endedMessage?.timestamp).toBe(startedMessage?.timestamp);
    expect(endedCard?.sessionStatus).toBe('ended');
    expect(endedCard?.body).toContain('这场直播已经下播');
    expect((await allMessages()).filter(message => message.metadata?.source === 'live_session_marker')).toHaveLength(1);
  });

  it('开播状态卡是独立可见的系统卡，不伪装成角色的聊天回复', async () => {
    const messageId = await createLiveSessionMarkerInDb({
      charId: CHAR_ID,
      charName: '苏栗',
      channel: makeChannel(),
      session: makeSession(0),
    });
    const marker = await DB.getMessageById(messageId);
    expect(marker?.role).toBe('system');
    expect(marker?.type).toBe('score_card');
    expect(isVisibleChatMessage(marker!, true)).toBe(true);
    expect(cardOf(marker!)?.sessionStatus).toBe('live');
  });

  it('标记被用户删除后，下播更新不会重新创建它', async () => {
    const channel = makeChannel();
    const session = makeSession(0);
    const messageId = await createLiveSessionMarkerInDb({ charId: CHAR_ID, channel, session });
    await DB.deleteMessage(messageId);

    const endedSession: LiveStreamSession = { ...session, status: 'ended', endedAt: 2000, startMarkerMessageId: messageId };
    expect(await updateLiveSessionMarkerInDb({ messageId, charId: CHAR_ID, channel, session: endedSession })).toBe(false);
    expect((await allMessages()).filter(message => message.metadata?.source === 'live_session_marker')).toHaveLength(0);
  });
});

// ==================== 3. 陪看一拍一条 ====================

describe('陪看轮次卡', () => {
  it('每一拍落一条卡，正文含 NPC 台词、弹幕与角色反应', async () => {
    const session = makeNpcSession();
    const beat = makeNpcBeat(0);
    const id = await syncNpcBeatToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      session,
      beat,
    });

    const msgs = await allMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe(id);
    expect(msgs[0].metadata?.source).toBe('live_npc_round');
    expect(isVisibleChatMessage(msgs[0])).toBe(true);

    const card = cardOf(msgs[0])!;
    expect(card.cardKind).toBe('npc_watch_round');
    expect(card.roundLabel).toBe('第 1 拍');
    expect(card.body).toContain('NPC 台词 0');
    expect(card.body).toContain('观众X');
    expect(card.body).toContain('反应 0');
  });

  it('重 Roll 那一拍：原地改这一条，不新增', async () => {
    const session = makeNpcSession();
    const beat = makeNpcBeat(0);
    const id = await syncNpcBeatToDb({ charId: CHAR_ID, charName: '苏栗', session, beat });
    const before = await DB.getMessageById(id);

    const rerolled: NpcWatchBeat = { ...beat, charReactionSpeech: '重 Roll 的反应' };
    await syncNpcBeatToDb({
      charId: CHAR_ID,
      charName: '苏栗',
      session,
      beat: rerolled,
      existingDbMsgId: id,
    });

    const msgs = await allMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].timestamp).toBe(before!.timestamp);
    expect(msgs[0].content).toContain('重 Roll 的反应');
  });

  it('两拍就是两条，按拍次各占一行', async () => {
    const session = makeNpcSession();
    await syncNpcBeatToDb({ charId: CHAR_ID, charName: '苏栗', session, beat: makeNpcBeat(0) });
    await syncNpcBeatToDb({ charId: CHAR_ID, charName: '苏栗', session, beat: makeNpcBeat(1) });

    const cards = (await allMessages()).map(m => cardOf(m)!);
    expect(cards).toHaveLength(2);
    expect(cards.map(c => c.roundIndex)).toEqual([1, 2]);
  });

  it('buildNpcRoundCard 不写库，正文与卡片用的是同一份', () => {
    const session = makeNpcSession();
    const beat = makeNpcBeat(1);
    const card = buildNpcRoundCard({ charId: CHAR_ID, charName: '苏栗', session, beat });
    expect(card.isCompressed).toBe(false);
    expect(card.body).toContain('第 2 拍');
  });
});

// ==================== 4. 实时背景开关 ====================

describe('电波「实时背景」开关', () => {
  it('没存过的时候是默认全开', async () => {
    const settings = await loadOnAirRealtimeSettings();
    expect(settings).toEqual(DEFAULT_ONAIR_REALTIME_SETTINGS);
    expect(settings.enabled).toBe(true);
  });

  it('关掉新闻和定位，刷新后仍然关着', async () => {
    await saveOnAirRealtimeSettings({
      enabled: true,
      weather: true,
      news: false,
      jpHot: true,
      time: true,
      location: false,
    });

    const reloaded = await loadOnAirRealtimeSettings();
    expect(reloaded.news).toBe(false);
    expect(reloaded.location).toBe(false);
    expect(reloaded.weather).toBe(true);
  });

  it('总开关关掉后读回来还是关着（不被默认值顶掉）', async () => {
    await saveOnAirRealtimeSettings({ ...DEFAULT_ONAIR_REALTIME_SETTINGS, enabled: false });
    expect((await loadOnAirRealtimeSettings()).enabled).toBe(false);
  });

  it('旧数据缺字段时按默认补齐，不整份丢掉', async () => {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_LIVE_KV], 'readwrite');
      tx.objectStore(STORE_LIVE_KV).put({ id: 'onair_realtime', value: { enabled: true, news: false } });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const settings = await loadOnAirRealtimeSettings();
    expect(settings.news).toBe(false);
    expect(settings.weather).toBe(true);
    expect(settings.location).toBe(true);
  });
});

describe('上次选择的观众身份', () => {
  const personas: ViewerPersona[] = [
    { id: 'viewer_main_self', name: '用户本尊', isMain: true, fanLevel: 24, badgeText: 'Member', note: '' },
    { id: 'viewer_alt_test', name: '匿名观众', isMain: false, fanLevel: 3, badgeText: 'New', note: '' },
  ];

  it('重新进入电波时恢复上次选择的小号，不回到本尊', async () => {
    await saveActiveViewerPersonaId('viewer_alt_test', personas);
    expect(await loadActiveViewerPersonaId(personas)).toBe('viewer_alt_test');
  });

  it('上次选择的身份已被删除时回退本尊并更新保存值', async () => {
    await saveActiveViewerPersonaId('viewer_alt_test', personas);
    expect(await loadActiveViewerPersonaId([personas[0]])).toBe('viewer_main_self');
    expect(await loadActiveViewerPersonaId(personas)).toBe('viewer_main_self');
  });
});

// ==================== 5. 压缩竞态指纹 ====================

describe('压缩指纹', () => {
  it('内容没变指纹一样', () => {
    const a = makeChunk(0);
    const b = makeChunk(0);
    expect(liveRoundSignature(a)).toBe(liveRoundSignature(b));
  });

  it('重 Roll 改台词后指纹变了，晚到的旧摘要会被丢掉', () => {
    const before = makeChunk(0);
    const after = makeChunk(0);
    after.beats[0].speechOriginal = '重 Roll 的台词';
    expect(liveRoundSignature(before)).not.toBe(liveRoundSignature(after));
  });

  it('只是多了一条弹幕也要算变（这轮内容确实不同了）', () => {
    const before = makeChunk(0);
    const after = makeChunk(0);
    after.beats[0].danmaku.push(dm('新观众', '刚进来'));
    expect(liveRoundSignature(before)).not.toBe(liveRoundSignature(after));
  });
});
