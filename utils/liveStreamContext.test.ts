import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, RealtimeConfig, UserProfile } from '../types';

// 这两个假模型把「发出去的提示词」抓下来给用例检查，不真的联网。
const llmCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
let llmQueue: string[] = [];
const buildPayloadCalls: any[] = [];

vi.mock('./safeApi', () => ({
  safeFetchJson: vi.fn(async (_url: string, init: any) => {
    llmCalls.push({ messages: JSON.parse(init.body).messages });
    return {};
  }),
  extractContent: vi.fn(() => llmQueue.shift() ?? ''),
}));

vi.mock('./liveStreamContext', () => ({
  buildLiveGenerationPayload: vi.fn(async (opts: any) => {
    buildPayloadCalls.push(opts);
    return [
      { role: 'system', content: opts.rules },
      { role: 'user', content: opts.task },
    ];
  }),
}));

import { buildSessionHistoryBlock, buildLiveChunkGenerationMessages } from './liveStreamPrompts';
import { generateLiveRoundSummary } from './liveStreamAiHelpers';
import type {
  LiveBeat,
  LiveChunk,
  LiveDanmakuItem,
  LiveStreamSession,
  StreamerChannelProfile,
} from './liveStreamTypes';

// 这组钉住「上下文怎么拼」：
//   1. 本场前情按轮展开，最新 3 轮原文、更早的逐轮摘要，不再有「最近 6 条 / 160 字」那种截断；
//   2. 本轮摘要的输入是整轮公屏（普通路人、礼物、SC、用户弹幕全在）；
//   3. 直播生成不带情绪 buff / 日程，但保留人设 + 记忆 + 实时背景。

const CHAR_ID = 'char_ctx_test';

function makeChar(): CharacterProfile {
  return {
    id: CHAR_ID,
    name: '苏栗',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    greeting: '',
    systemPrompt: '',
  } as any;
}

function makeUser(): UserProfile {
  return { id: 'u1', name: 'Ann' } as any;
}

function makeChannel(): StreamerChannelProfile {
  return {
    id: 'ch1',
    charId: CHAR_ID,
    channelName: '苏栗 Official',
    handle: '@suli',
    bannerGradient: '',
    identityMode: 'public_main',
    bio: '',
    streamerPersonaPrompt: '',
    followerCount: 1,
    fanBadgeName: '常連',
    defaultCategory: '雑談',
    voiceConfig: { language: '', enableTranslation: false, autoPlayTts: false },
    createdAt: 1,
    updatedAt: 1,
  };
}

function dm(senderName: string, text: string, extra: Partial<LiveDanmakuItem> = {}): LiveDanmakuItem {
  return { id: `d_${senderName}_${text}`, senderName, text, timestamp: 1, ...extra };
}

function makeBeat(index: number): LiveBeat {
  return {
    id: `b_${index}`,
    chunkId: 'c',
    index,
    screen: `画面 ${index}`,
    speechOriginal: `台词 ${index}`,
    danmaku: [dm('路人甲', `路人弹幕 ${index}`)],
  };
}

function makeChunk(index: number, overrides: Partial<LiveChunk> = {}): LiveChunk {
  return {
    id: `chunk_${index}`,
    index,
    createdAt: 1,
    beats: [makeBeat(index * 2), makeBeat(index * 2 + 1)],
    userInputs: [],
    ...overrides,
  };
}

function makeSession(chunks: LiveChunk[]): LiveStreamSession {
  return {
    id: 'sess1',
    channelId: 'ch1',
    charId: CHAR_ID,
    title: '深夜雑談',
    categoryKey: 'talk',
    categoryLabel: '雑談',
    status: 'live',
    viewerCount: 10,
    likeCount: 0,
    chunks,
    rollingSummaries: [],
    pendingDanmakuQueue: [],
    foldEveryNChunks: 4,
    foldKeepRecentChunks: 3,
    startedAt: 1,
  };
}

beforeEach(() => {
  llmCalls.length = 0;
  buildPayloadCalls.length = 0;
  llmQueue = [];
});

describe('本场前情：按轮展开，不做旧式截断', () => {
  it('没有轮次时是空的（交给调用方写「第 1 轮」提示）', () => {
    expect(buildSessionHistoryBlock(makeSession([]))).toBe('');
  });

  it('最新 3 轮出原文，更早的轮次出逐轮摘要', () => {
    const chunks = [
      makeChunk(0, { roundSummary: '第 1 轮摘要：聊了天气' }),
      makeChunk(1, { roundSummary: '第 2 轮摘要：唱了首歌' }),
      makeChunk(2),
      makeChunk(3),
      makeChunk(4),
    ];
    const block = buildSessionHistoryBlock(makeSession(chunks));

    expect(block).toContain('【第 1 轮 · 逐轮摘要】');
    expect(block).toContain('第 1 轮摘要：聊了天气');
    expect(block).toContain('【第 2 轮 · 逐轮摘要】');
    // 最新 3 轮（第 3、4、5 轮）是原文
    expect(block).toContain('【第 3 轮 · 原文】');
    expect(block).toContain('【第 4 轮 · 原文】');
    expect(block).toContain('【第 5 轮 · 原文】');
    // 已压缩的轮次不再重复贴原文
    expect(block).not.toContain('【第 1 轮 · 原文】');
  });

  it('轮次多了也不砍：10 轮就是 10 段前情', () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      i < 7 ? makeChunk(i, { roundSummary: `第 ${i + 1} 轮摘要` }) : makeChunk(i),
    );
    const block = buildSessionHistoryBlock(makeSession(chunks));
    for (let i = 1; i <= 10; i++) {
      expect(block).toContain(`第 ${i} 轮`);
    }
  });

  it('chunks 顺序乱了也按轮次先后排', () => {
    const chunks = [makeChunk(2), makeChunk(0), makeChunk(1)];
    const block = buildSessionHistoryBlock(makeSession(chunks));
    expect(block.indexOf('【第 1 轮 · 原文】')).toBeLessThan(block.indexOf('【第 2 轮 · 原文】'));
    expect(block.indexOf('【第 2 轮 · 原文】')).toBeLessThan(block.indexOf('【第 3 轮 · 原文】'));
  });

  it('旧场次的阶段摘要还能读到（只做兼容）', () => {
    const session = makeSession([makeChunk(0), makeChunk(1)]);
    session.rollingSummaries = [
      { id: 'r1', fromChunkIndex: 0, toChunkIndex: 1, content: '旧阶段摘要内容', createdAt: 1 },
    ];
    const block = buildSessionHistoryBlock(session);
    expect(block).toContain('旧阶段摘要内容');
  });
});

describe('本轮摘要的输入', () => {
  it('整轮公屏全量进摘要：路人、会员、SC、用户自己的弹幕都在', async () => {
    llmQueue = ['第 1 轮摘要'];
    const chunk = makeChunk(0);
    chunk.beats[0].danmaku = [
      dm('路人甲', '只是路过'),
      dm('常連さん', '会员发话', { fanBadge: '常連' }),
      dm('老板', '打赏了', { scAmount: 30 }),
      dm('Ann', '我来了', { isUserMain: true }),
      dm('粉丝', '送了个礼物', { giftName: '小鱼干', giftEmoji: '🐟' }),
    ];

    const summary = await generateLiveRoundSummary({
      apiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' } as any,
      char: makeChar(),
      channel: makeChannel(),
      session: makeSession([chunk]),
      chunk,
    });

    const prompt = llmCalls[0].messages[0].content;
    expect(prompt).toContain('只是路过');
    expect(prompt).toContain('会员发话');
    expect(prompt).toContain('Super Chat 付费留言 ¥30');
    expect(prompt).toContain('我来了');
    expect(prompt).toContain('小鱼干');
    expect(prompt).toContain('熟人本尊');
    // 只压这一轮
    expect(prompt).toContain('第 1 轮');
    // 明确不许提私聊
    expect(prompt).toContain('不编造、不提及私聊');
    expect(prompt).toContain('约 150~260 字');
    expect(prompt).toContain('每次严格按下面四项、顺序和标题输出');
    expect(prompt).toContain('【直播内容】');
    expect(prompt).toContain('【关键细节】');
    expect(prompt).toContain('【公屏互动】');
    expect(prompt).toContain('【本轮收尾】');
    expect(prompt).not.toContain('不设字数上限');
    expect(prompt).not.toContain('每个原始拍都单独列出');
    expect(summary).toBe('第 1 轮摘要');
  });

  it('摘要请求只带这一轮的记录，不带别的轮次', async () => {
    llmQueue = ['摘要'];
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2)];
    await generateLiveRoundSummary({
      apiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' } as any,
      char: makeChar(),
      channel: makeChannel(),
      session: makeSession(chunks),
      chunk: chunks[1],
    });
    const prompt = llmCalls[0].messages[0].content;
    expect(prompt).toContain('第 2 轮');
    expect(prompt).toContain('台词 2'); // 第 2 轮的拍
    expect(prompt).not.toContain('台词 0');
    expect(prompt).not.toContain('台词 4');
  });

  it('小号的身份只给模型看：名单列全、禁口令写死，弹幕行里不带熟人小号', async () => {
    llmQueue = ['摘要'];
    const chunk = makeChunk(0);
    chunk.beats[0].danmaku = [
      dm('Ann', '我来了', { isUserMain: true }),
      dm('momo_8921', '录像准备www', { isUserAlt: true }),
      dm('夜里跑的小号', '又来了', { isUserAlt: true }),
      dm('路人甲', '只是路过'),
    ];

    await generateLiveRoundSummary({
      apiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' } as any,
      char: makeChar(),
      channel: makeChannel(),
      session: makeSession([chunk]),
      chunk,
      // app 传的名单（可能有好几个小号）
      userAltNames: ['momo_8921', '夜里跑的小号', '第三个号'],
    });

    const prompt = llmCalls[0].messages[0].content;
    // 身份说明只给模型看：名单列全（app 的名单 + 这一轮弹幕里带标记的名字）
    expect(prompt).toContain('身份说明（只给你看，一个字都不许写进摘要）');
    expect(prompt).toContain('momo_8921、夜里跑的小号、第三个号');
    expect(prompt).toContain('TA 们的留言必须写进【公屏互动】');
    expect(prompt).toContain('严禁在摘要任何位置写出或暗示这是用户的小号');
    // 弹幕行里不再写身份标记；本尊的还留着
    expect(prompt).toContain('Ann（熟人本尊）');
    expect(prompt).not.toContain('熟人小号');
    // 要求里不再提马甲
    expect(prompt).not.toContain('用户/马甲留言');
    expect(prompt).toContain('用户留言、Super Chat 内容与金额、礼物名与金额不能漏');
    // 小号的弹幕本身照样在记录里（只是不带身份）
    expect(prompt).toContain('momo_8921：录像准备www');
  });

  it('没有小号时不留身份说明那一段', async () => {
    llmQueue = ['摘要'];
    const chunk = makeChunk(0);
    chunk.beats[0].danmaku = [dm('路人甲', '只是路过')];
    await generateLiveRoundSummary({
      apiConfig: { baseUrl: 'http://x', apiKey: 'k', model: 'm' } as any,
      char: makeChar(),
      channel: makeChannel(),
      session: makeSession([chunk]),
      chunk,
    });
    const prompt = llmCalls[0].messages[0].content;
    expect(prompt).not.toContain('身份说明');
  });
});

describe('直播切片请求的上下文范围', () => {
  it('前情跟着整场走，没有「最近 6 条 / 160 字」的私聊截断段', async () => {
    const chunks = Array.from({ length: 5 }, (_, i) =>
      i < 2 ? makeChunk(i, { roundSummary: `第 ${i + 1} 轮摘要` }) : makeChunk(i),
    );
    const task = (
      await buildLiveChunkGenerationMessages({
        char: makeChar(),
        userProfile: makeUser(),
        channel: makeChannel(),
        session: makeSession(chunks),
        historyMessages: [],
      })
    ).find(m => m.role === 'user')!.content;

    expect(task).toContain('第 5 轮');
    expect(task).not.toContain('场外私聊互动');
    // 来源边界还在：私聊不是公屏
    expect(task).toContain('来源边界');
    expect(task).toContain('不得擅自公开念出来');
    const rules = buildPayloadCalls[0].rules as string;
    expect(rules).toContain('老会员（Member）');
    expect(rules).toContain('起哄损友（抓主播口误');
    expect(rules).toContain('复读、吐槽、问号海');
    expect(rules).toContain('随直播类型与当拍节奏变调');
    expect(rules).toContain('多视角分流（拒绝纯夸夸群）');
    expect(rules).toContain('拒绝机械排班与同质复刻');
    expect(rules).toContain('观众是来作客的');
    expect(rules).toContain('不要写成固定夸或固定骂');
  });

  it('聊天历史原样交给共用管线，交给它自己按上下文范围裁', async () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      charId: CHAR_ID,
      role: i % 2 === 0 ? 'user' : 'assistant',
      type: 'text',
      content: `私聊第 ${i + 1} 句`,
      timestamp: i,
    })) as any[];

    await buildLiveChunkGenerationMessages({
      char: makeChar(),
      userProfile: makeUser(),
      channel: makeChannel(),
      session: makeSession([makeChunk(0)]),
      historyMessages: history,
    });

    expect(buildPayloadCalls).toHaveLength(1);
    // 没有在直播这一侧再砍一刀
    expect(buildPayloadCalls[0].historyMessages).toHaveLength(30);
    // 走的是共用的那套组装（pipeline 会带记忆召回 / 关情绪 / 关日程）
    expect(buildPayloadCalls[0].realtimeConfig).toBeDefined;
  });

  it('关掉定位就不去取定位', async () => {
    await buildLiveChunkGenerationMessages({
      char: makeChar(),
      userProfile: makeUser(),
      channel: makeChannel(),
      session: makeSession([makeChunk(0)]),
      historyMessages: [],
      includeUserLocation: false,
    });
    const task = buildPayloadCalls[0].task as string;
    expect(task).not.toContain('所在位置');
  });
});

