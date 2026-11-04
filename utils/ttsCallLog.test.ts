import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiCallAmbientContext } from './apiCallLog';
import { mergeTtsCallMeta, recordTtsCall, summarizeTtsCallLog, type TtsCallLogEntry } from './ttsCallLog';

const appendTtsCallLog = vi.fn(async () => {});
const clearTtsCallLog = vi.fn(async () => {});
const getTtsCallLog = vi.fn(async () => [] as TtsCallLogEntry[]);

vi.mock('./db', () => ({
  DB: {
    appendTtsCallLog: (...args: unknown[]) => appendTtsCallLog(...args),
    clearTtsCallLog: (...args: unknown[]) => clearTtsCallLog(...args),
    getTtsCallLog: (...args: unknown[]) => getTtsCallLog(...args),
  },
}));

describe('mergeTtsCallMeta', () => {
  it('后层非空字段覆盖前层，空字段不盖掉 App / 用途', () => {
    expect(mergeTtsCallMeta(
      { appId: 'chat', appName: '消息', charId: 'a', charName: '旧名' },
      { charId: 'b', charName: '新名' },
      { purpose: '聊天语音' },
    )).toEqual({
      appId: 'chat',
      appName: '消息',
      charId: 'b',
      charName: '新名',
      purpose: '聊天语音',
    });
  });
});

describe('summarizeTtsCallLog', () => {
  it('计费汇总排除缓存命中', () => {
    const entries: TtsCallLogEntry[] = [
      {
        id: '1',
        timestamp: 1,
        provider: 'minimax',
        textChars: 10,
        ok: true,
      },
      {
        id: '2',
        timestamp: 2,
        provider: 'minimax',
        textChars: 99,
        ok: true,
        cached: true,
      },
      {
        id: '3',
        timestamp: 3,
        provider: 'fishaudio',
        textChars: 5,
        ok: false,
      },
    ];
    const summary = summarizeTtsCallLog(entries);
    expect(summary.billableCount).toBe(2);
    expect(summary.billableChars).toBe(15);
    expect(summary.cachedCount).toBe(1);
    expect(summary.byProvider.minimax).toEqual({ count: 1, chars: 10 });
    expect(summary.byProvider.fishaudio).toEqual({ count: 1, chars: 5 });
  });
});

describe('recordTtsCall', () => {
  beforeEach(() => {
    appendTtsCallLog.mockClear();
  });

  it('写入一条语音调用记录，并保留 ambient 的 App', async () => {
    setApiCallAmbientContext({ appId: 'chat', appName: '消息', charId: 'ambient', charName: '环境角色' });
    recordTtsCall({
      provider: 'elevenlabs',
      model: 'eleven_v3',
      textChars: 12,
      ok: true,
      durationMs: 40,
      meta: { charName: '测试', purpose: '试听' },
    });
    await vi.waitFor(() => expect(appendTtsCallLog).toHaveBeenCalledTimes(1));
    const entry = appendTtsCallLog.mock.calls[0][0] as TtsCallLogEntry;
    expect(entry.provider).toBe('elevenlabs');
    expect(entry.model).toBe('eleven_v3');
    expect(entry.textChars).toBe(12);
    expect(entry.ok).toBe(true);
    expect(entry.appId).toBe('chat');
    expect(entry.appName).toBe('消息');
    expect(entry.charName).toBe('测试');
    expect(entry.purpose).toBe('试听');
    expect(entry.cached).toBeUndefined();
  });

  it('缓存命中带 cached 标记', async () => {
    recordTtsCall({
      provider: 'minimax',
      textChars: 8,
      ok: true,
      cached: true,
    });
    await vi.waitFor(() => expect(appendTtsCallLog).toHaveBeenCalledTimes(1));
    const entry = appendTtsCallLog.mock.calls[0][0] as TtsCallLogEntry;
    expect(entry.cached).toBe(true);
  });

  it('清空走 DB.clearTtsCallLog', async () => {
    const { DB } = await import('./db');
    await DB.clearTtsCallLog();
    expect(clearTtsCallLog).toHaveBeenCalledTimes(1);
  });
});
