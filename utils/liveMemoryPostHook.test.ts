import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetLiveMemoryPostHook, runLiveMemoryPostHook } from './liveMemoryPostHook';

const m = vi.hoisted(() => ({
  getChar: vi.fn(),
  getRecent: vi.fn(),
  process: vi.fn(),
  count: vi.fn(),
  digest: vi.fn(),
}));

vi.mock('./db', () => ({
  DB: { getCharacter: m.getChar, getRecentMessagesByCharId: m.getRecent },
}));
vi.mock('./memoryPalace/autoArchive', () => ({ processNewMessagesWithAutoArchive: m.process }));
vi.mock('./memoryPalace/digestion', () => ({ incrementDigestRound: m.count, runCognitiveDigestion: m.digest }));

const config: any = { embedding: { baseUrl: 'emb', apiKey: 'key' }, lightLLM: { baseUrl: 'light', model: 'model' } };
const char = (over: any = {}) => ({ id: 'live-1', name: '苏栗', memoryPalaceEnabled: true, ...over });
const call = (over: any = {}) => runLiveMemoryPostHook({
  roundKey: 'sess-1:0',
  charId: 'live-1',
  config,
  api: { baseUrl: 'main', apiKey: 'k', model: 'm' } as any,
  userName: 'Ann',
  ...over,
});

describe('runLiveMemoryPostHook · 每一轮落库后叫一次宫殿整理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetLiveMemoryPostHook();
    m.getChar.mockResolvedValue(char());
    m.getRecent.mockResolvedValue([{ id: 1 }]);
    m.process.mockResolvedValue({ stored: 0, skipped: 0, batches: [], memories: [] });
    m.count.mockReturnValue(false);
    m.digest.mockResolvedValue(null);
  });

  it('叫的是现成那套管线：最近 50 条 + 角色名 + 宫殿两份配置；没新记忆就不弹窗', async () => {
    const onResult = vi.fn();
    await call({ onResult });

    expect(m.process).toHaveBeenCalledWith(
      [{ id: 1 }], 'live-1', '苏栗', config.embedding, config.lightLLM, 'Ann', false, expect.any(Function),
    );
    expect(onResult).not.toHaveBeenCalled();
    expect(m.count).toHaveBeenCalledWith('live-1');
    expect(m.digest).not.toHaveBeenCalled();
  });

  it('整理出新记忆就弹窗；满 50 轮再跑一次认知消化', async () => {
    const onResult = vi.fn();
    const stored = { stored: 2, skipped: 1, batches: [], memories: [{ content: 'x' }] };
    m.process.mockResolvedValue(stored);
    m.count.mockReturnValue(true);
    await call({ onResult });

    expect(onResult).toHaveBeenCalledWith(stored);
    expect(m.digest).toHaveBeenCalledWith('live-1', '苏栗', '', config.lightLLM, false, 'Ann', config.embedding, expect.any(Function));
  });

  it('同一轮只算一次（重 Roll / 重复触发不再叫一遍）', async () => {
    await call();
    await call();
    expect(m.process).toHaveBeenCalledTimes(1);
  });

  it('宫殿开关关着、或向量没配：一声都不叫', async () => {
    m.getChar.mockResolvedValue(char({ memoryPalaceEnabled: false }));
    await call();
    expect(m.process).not.toHaveBeenCalled();

    __resetLiveMemoryPostHook();
    m.getChar.mockResolvedValue(char());
    await call({ config: { lightLLM: config.lightLLM } });
    expect(m.process).not.toHaveBeenCalled();
  });

  it('轻量模型没配就回落主聊天 API', async () => {
    await call({ config: { embedding: config.embedding } });
    expect(m.process).toHaveBeenCalledWith(
      [{ id: 1 }], 'live-1', '苏栗', config.embedding, { baseUrl: 'main', apiKey: 'k', model: 'm' }, 'Ann', false, expect.any(Function),
    );
  });

  it('管线跑完发现宫殿被关掉：不弹窗、不消化', async () => {
    const onResult = vi.fn();
    m.getChar.mockResolvedValueOnce(char()).mockResolvedValue(char({ memoryPalaceEnabled: false }));
    m.process.mockResolvedValue({ stored: 3, skipped: 0, batches: [], memories: [] });
    m.count.mockReturnValue(true);
    await call({ onResult });

    expect(onResult).not.toHaveBeenCalled();
    expect(m.count).not.toHaveBeenCalled();
    expect(m.digest).not.toHaveBeenCalled();
  });

  it('出错就回报给调用方（界面弹失败提示）', async () => {
    const onError = vi.fn();
    m.process.mockRejectedValue(new Error('boom'));
    await call({ onError });
    expect(onError).toHaveBeenCalled();
  });
});
