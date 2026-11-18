// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CharacterProfile, Message } from '../types';
import { DB } from './db';
import { runLocalAwayMessages, readLocalAwayAlarms, deliverLocalAwayNotification } from './awayMessage';
import { setChatNotifyEnabled } from './chatNotifySettings';
import { safeFetchJson } from './safeApi';
import { applyAssistantPostProcessing } from './applyAssistantPostProcessing';
import * as devDebug from './devDebug';

// Keep the actual context-range and chat-payload pipelines; only external generation/delivery is stubbed.
vi.mock('./activeMsgClient', () => ({ ActiveMsgClient: {} }));
vi.mock('../context/MusicContext', () => ({ loadMusicPlaybackSnapshot: () => null }));
vi.mock('./applyAssistantPostProcessing', () => ({ applyAssistantPostProcessing: vi.fn() }));
vi.mock('./safeApi', async importOriginal => ({ ...await importOriginal<typeof import('./safeApi')>(), safeFetchJson: vi.fn() }));

const NOW = Date.parse('2026-11-07T12:00:00Z');
let char: CharacterProfile;
let rows: Message[];
let serial = 0;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  char = { id: `away-integration-${serial++}`, name: '阿一', awayMessage: { enabled: true, delayMinutes: 90 },
    contextRangePolicyVersion: 1, contextRangeMode: 'manual', contextLimit: 10 } as CharacterProfile;
  rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, charId: char.id,
    role: i % 2 ? 'assistant' : 'user', type: 'text', timestamp: NOW - 6 * 60 * 60_000 + i * 1000,
    content: `HISTORY_${i + 1}_END`,
  }));
  vi.spyOn(DB, 'ensureHomeContextMessages').mockResolvedValue(undefined);
  vi.spyOn(DB, 'getRecentMessagesByCharId').mockImplementation(async (_id: string, limit: number) => rows.slice(-limit));
  vi.spyOn(DB, 'getMessagesFromId').mockImplementation(async (_id: string, fromId: number) => ({ messages: rows.filter(row => row.id >= fromId), totalCount: rows.length }));
  vi.spyOn(DB, 'getEmojis').mockResolvedValue([]);
  vi.spyOn(DB, 'getEmojiCategories').mockResolvedValue([]);
  vi.spyOn(DB, 'saveMessage');
  vi.mocked(safeFetchJson).mockResolvedValue({ choices: [{ message: { content: '刚看到一朵花\n[[NEXT]]\n又想起件事\n[[NEXT]]\n晚点聊' } }] });
  vi.mocked(applyAssistantPostProcessing).mockResolvedValue(undefined as any);
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

const generate = async () => {
  await runLocalAwayMessages(deps());
  expect(safeFetchJson).toHaveBeenCalledOnce();
  return JSON.parse(String(vi.mocked(safeFetchJson).mock.calls[0][1]?.body)).messages as Array<{ role: string; content: string }>;
};

const deps = () => ({
    getCharacters: () => [char],
    getApiConfig: () => ({ baseUrl: 'https://fixture.invalid/v1', apiKey: '', model: 'fixture' }),
    getUserProfile: () => ({ name: '小明' } as any), getGroups: () => [], getRealtimeConfig: () => ({} as any),
    isBusyWith: (_charId: string) => false,
});

it.each(['adaptive', 'full-window', 'breakpoint', 'fully-archived', 'merged-system'] as const)(
  'delivers the away instruction once through the real API payload with %s history boundaries', async (mode: string) => {
    let firstVisible = 3;
    if (mode === 'adaptive' || mode === 'fully-archived') {
      char.contextRangeMode = 'adaptive'; char.autoArchiveEnabled = true;
      localStorage.setItem(`mp_lastMsgId_${char.id}`, mode === 'fully-archived' ? '12' : '8');
      firstVisible = mode === 'fully-archived' ? 13 : 9;
    }
    if (mode === 'breakpoint') { char.contextUserStartMessageId = 8; firstVisible = 8; }
    if (mode === 'merged-system') vi.spyOn(devDebug, 'isSystemMessageMergeEnabled').mockReturnValue(true);
    const messages = await generate();
    const hints = messages.filter(m => m.content.includes('请把这 3 次按时间先后分别写出来'));
    expect(hints).toHaveLength(1);
    expect(hints[0].role).toBe('user');
    expect(hints[0].content).toContain('分享随手拍的照片');
    const allText = messages.map(m => m.content).join('\n');
    for (let id = 1; id <= 12; id++) {
      expect(allText.includes(`HISTORY_${id}_END`)).toBe(id >= firstVisible);
    }
    if (mode !== 'merged-system') expect(messages[messages.indexOf(hints[0]) + 1].role).toBe('system');
    expect(DB.saveMessage).not.toHaveBeenCalled();
    expect(applyAssistantPostProcessing).toHaveBeenCalledTimes(3);
    expect(vi.mocked(applyAssistantPostProcessing).mock.calls.map(([text]: [string, ...unknown[]]) => text)).toEqual(['刚看到一朵花', '又想起件事', '晚点聊']);
  },
);

it('recognizes a recent archived meeting without bringing excluded meeting prose back into the request', async () => {
  rows.push({ id: 13, charId: char.id, role: 'assistant', type: 'text', timestamp: NOW - 30 * 60_000,
    content: 'EXCLUDED_DATE_PROSE', metadata: { source: 'date' } });
  char.contextRangeMode = 'adaptive'; char.autoArchiveEnabled = true;
  localStorage.setItem(`mp_lastMsgId_${char.id}`, '13');
  const messages = await generate();
  const allText = messages.map(m => m.content).join('\n');
  expect(allText).toContain('刚刚在线下见过面，现在暂时分开了');
  expect(allText).not.toContain('EXCLUDED_DATE_PROSE');
  expect(DB.saveMessage).not.toHaveBeenCalled();
});

const useRealPersistence = async () => {
  const real = await vi.importActual<typeof import('./applyAssistantPostProcessing')>('./applyAssistantPostProcessing');
  vi.mocked(applyAssistantPostProcessing).mockImplementation(real.applyAssistantPostProcessing);
  vi.mocked(DB.saveMessage).mockImplementation(async (msg: Parameters<typeof DB.saveMessage>[0]) => {
    const row = { ...msg, id: rows.length + 1, timestamp: msg.timestamp ?? Date.now() } as Message;
    rows.push(row); return row.id;
  });
};

it('排期按真实开口+等待计算，隐藏提示不改期；关功能/忙碌时取消', async () => {
  rows = [{ ...rows[0], timestamp: NOW - 60_000 }];
  rows.push({ ...rows[0], id: 2, timestamp: NOW, metadata: { proactiveHint: true } });
  expect(await readLocalAwayAlarms(deps())).toEqual([{ charId: char.id, lastUserAt: NOW - 60_000, dueAt: NOW + 89 * 60_000 }]);
  expect(await readLocalAwayAlarms({ ...deps(), isBusyWith: () => true })).toEqual([]);
  char.awayMessage!.enabled = false;
  expect(await readLocalAwayAlarms(deps())).toEqual([]);
});

it('后台生成走真实后处理，完整正文保存后才发事件；一次离开只生成一轮，回复后重新计时', async () => {
  await useRealPersistence();
  const received = vi.fn(); window.addEventListener('active-msg-received', received);
  try {
    await generate();
    const saved = rows.filter(m => m.metadata?.awayMessage);
    expect(saved.map(m => m.content)).toEqual(['刚看到一朵花', '又想起件事', '晚点聊']);
    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0][0].detail).toMatchObject({ source: 'local-away', bodies: saved.map(m => m.content) });
    await runLocalAwayMessages(deps());
    expect(safeFetchJson).toHaveBeenCalledOnce();
    expect(await readLocalAwayAlarms(deps())).toEqual([]);
    rows.push({ id: 100, charId: char.id, role: 'user', type: 'text', content: '回来啦', timestamp: NOW });
    await runLocalAwayMessages(deps());
    expect(safeFetchJson).toHaveBeenCalledOnce();
    expect(await readLocalAwayAlarms(deps())).toEqual([{ charId: char.id, lastUserAt: NOW, dueAt: NOW + 90 * 60_000 }]);
  } finally { window.removeEventListener('active-msg-received', received); }
});

it('拉黑记录在上下文范围外时，away 仍使用冷战口气且真实落库带未送达', async () => {
  await useRealPersistence();
  rows.push({ id: 13, charId: char.id, role: 'system', type: 'system', content: 'BLOCK_OUTSIDE_RANGE',
    timestamp: NOW - 60_000, metadata: { source: 'block-status', blockStatus: '已拉黑' } });
  char.contextRangeMode = 'adaptive'; char.autoArchiveEnabled = true;
  localStorage.setItem(`mp_lastMsgId_${char.id}`, '13');
  const messages = await generate();
  expect(messages.map(m => m.content).join('\n')).toContain('看不见你发出的普通文字');
  expect(messages.map(m => m.content).join('\n')).not.toContain('BLOCK_OUTSIDE_RANGE');
  expect(rows.filter(m => m.metadata?.awayMessage).every(m => m.metadata?.blockSendFailed)).toBe(true);
  expect(rows.filter(m => m.metadata?.awayMessage)).toHaveLength(3);
});

it('BLOCK 已滑出最近 50 条且没有未送达兜底时，仍从 100 条近史识别冷战，不扩大 API 历史', async () => {
  await useRealPersistence();
  rows = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1, charId: char.id, role: i === 20 ? 'system' : i === 90 ? 'user' : 'assistant',
    type: i === 20 ? 'system' : 'text', timestamp: NOW - (240 - i) * 60_000,
    content: i === 20 ? 'BLOCK_BEYOND_50' : `RECENT_${i + 1}`,
    ...(i === 20 ? { metadata: { source: 'block-status', blockStatus: '已拉黑' } } : {}),
  }));
  expect(rows.slice(-50).every(m => !m.metadata?.blockSendFailed && m.metadata?.source !== 'block-status')).toBe(true);
  expect(await readLocalAwayAlarms(deps())).toHaveLength(1);
  const messages = await generate();
  const requestText = messages.map(m => m.content).join('\n');
  expect(requestText).toContain('看不见你发出的普通文字');
  expect(requestText).not.toContain('BLOCK_BEYOND_50');
  const saved = rows.filter(m => m.metadata?.awayMessage);
  expect(saved.length).toBeGreaterThan(0);
  expect(saved.every(m => m.metadata?.blockSendFailed)).toBe(true);
});

it.each(['reply', 'disable', 'delay'] as const)('生成过程中 %s 时，过时响应不保存也不通知', async (change: 'reply' | 'disable' | 'delay') => {
  await useRealPersistence();
  vi.mocked(safeFetchJson).mockImplementation(async () => {
    if (change === 'reply') rows.push({ ...rows[0], id: 30, timestamp: NOW, content: '回来了' });
    if (change === 'disable') char.awayMessage!.enabled = false;
    if (change === 'delay') char.awayMessage!.delayMinutes = 120;
    return { choices: [{ message: { content: '过时的消息' } }] };
  });
  const received = vi.fn(); window.addEventListener('active-msg-received', received);
  try {
    await generate();
    expect(DB.saveMessage).not.toHaveBeenCalled();
    expect(received).not.toHaveBeenCalled();
  } finally { window.removeEventListener('active-msg-received', received); }
});

it('空输出失败后十分钟内不反复请求，排期移到冷却结束', async () => {
  vi.mocked(safeFetchJson).mockResolvedValue({ choices: [{ message: { content: '' } }] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await generate(); await runLocalAwayMessages(deps());
  expect(safeFetchJson).toHaveBeenCalledOnce();
  expect((await readLocalAwayAlarms(deps()))[0].dueAt).toBe(NOW + 10 * 60_000);
});

it('后续分段失败仍通知已经保存的正文，不把未保存的句子当正文', async () => {
  await useRealPersistence();
  const persist = vi.mocked(applyAssistantPostProcessing).getMockImplementation()!;
  vi.mocked(applyAssistantPostProcessing).mockImplementationOnce(persist).mockRejectedValueOnce(new Error('fixture save failed'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const received = vi.fn(); window.addEventListener('active-msg-received', received);
  try {
    await generate();
    expect(rows.filter(m => m.metadata?.awayMessage).map(m => m.content)).toEqual(['刚看到一朵花']);
    expect(received.mock.calls[0][0].detail.bodies).toEqual(['刚看到一朵花']);
  } finally { window.removeEventListener('active-msg-received', received); }
});

it.each(['peek', 'friend'] as const)('拉黑中只发 %s 卡也照常解析、停止本段离开并提供真实卡片正文', async (kind: 'peek' | 'friend') => {
  await useRealPersistence();
  rows.push({ id: 13, charId: char.id, role: 'system', type: 'system', content: 'blocked',
    timestamp: NOW - 60_000, metadata: { source: 'block-status', blockStatus: '已拉黑' } });
  vi.mocked(safeFetchJson).mockResolvedValue({ choices: [{ message: { content: kind === 'peek'
    ? '[[ACTION:PEEK|想说的话]]\n刚才没讲完的话，想让你看看。\n[[/PEEK]]'
    : '[[ACTION:FRIEND_REQUEST|想再跟你说句话]]' } }] });
  const received = vi.fn(); window.addEventListener('active-msg-received', received);
  try {
    await generate();
    const saved = rows.filter(m => m.metadata?.awayMessage);
    expect(saved).toHaveLength(1);
    expect(saved[0].metadata?.source).toBe(kind === 'peek' ? 'peek-request' : 'friend-request');
    expect(received.mock.calls[0][0].detail.bodies).toEqual([kind === 'peek'
      ? '求看看：刚才没讲完的话，想让你看看。' : '好友申请：想再跟你说句话']);
    expect(await readLocalAwayAlarms(deps())).toEqual([]);
  } finally { window.removeEventListener('active-msg-received', received); }
});

it('本地 away 在后台停留于同一聊天也通过 chatNotify 发具体正文；前台聊天安静、别页只提示', async () => {
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const previousWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  vi.stubGlobal('Notification', { permission: 'granted' });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true,
    value: { ready: Promise.resolve({ showNotification }) } });
  const unread = vi.fn(), toast = vi.fn();
  const input = { charId: char.id, charName: char.name, bodies: ['刚看到一朵花', '晚点聊'],
    pageVisible: false, isChattingWithThisChar: true, unread, toast };
  try {
    await deliverLocalAwayNotification(input);
    expect(showNotification.mock.calls.map((call: any[]) => call[1].body)).toEqual(input.bodies);
    expect(showNotification.mock.calls[0][1].data.charId).toBe(char.id);
    expect(unread).toHaveBeenCalledOnce(); expect(toast).not.toHaveBeenCalled();
    showNotification.mockClear(); unread.mockClear();
    await deliverLocalAwayNotification({ ...input, pageVisible: true });
    expect(unread).not.toHaveBeenCalled(); expect(showNotification).not.toHaveBeenCalled();
    await deliverLocalAwayNotification({ ...input, pageVisible: true, isChattingWithThisChar: false });
    expect(toast).toHaveBeenCalledOnce(); expect(showNotification).not.toHaveBeenCalled();
    setChatNotifyEnabled(false);
    await deliverLocalAwayNotification({ ...input, bodies: ['关通知后的一句'] });
    expect(showNotification).not.toHaveBeenCalled(); expect(unread).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
    if (previousWorker) Object.defineProperty(navigator, 'serviceWorker', previousWorker);
    else delete (navigator as any).serviceWorker;
  }
});
