import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGtxTranslateUrl,
  parseGtxTranslateResponse,
  webGoogleTranslate,
} from './webGoogleTranslate';

describe('buildGtxTranslateUrl', () => {
  it('拼出 gtx 查询参数', () => {
    const url = buildGtxTranslateUrl('こんにちは', 'zh-CN');
    expect(url).toContain('translate.googleapis.com/translate_a/single');
    expect(url).toContain('client=gtx');
    expect(url).toContain('sl=auto');
    expect(url).toContain('tl=zh-CN');
    expect(url).toContain('dt=t');
    expect(url).toContain(encodeURIComponent('こんにちは'));
  });
});

describe('parseGtxTranslateResponse', () => {
  it('拼接分段译文', () => {
    expect(parseGtxTranslateResponse([[['你好', 'hello'], ['世界', 'world']], null, 'en']))
      .toBe('你好世界');
  });

  it('空或怪格式抛错', () => {
    expect(() => parseGtxTranslateResponse(null)).toThrow(/格式/);
    expect(() => parseGtxTranslateResponse([[], null])).toThrow(/没有译文/);
  });
});

describe('webGoogleTranslate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('直连谷歌 gtx；失败重试一次', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: { get: () => 'text/plain' },
        text: async () => 'bad gateway',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify([[['译好了', 'hello']]]),
      });
    vi.stubGlobal('fetch', fetchMock);

    const text = await webGoogleTranslate('hello', { timeoutMs: 5000 });
    expect(text).toBe('译好了');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('translate.googleapis.com');
    expect(String(fetchMock.mock.calls[0][0])).toContain('client=gtx');
  });

  it('空文本直接拒绝', async () => {
    await expect(webGoogleTranslate('  ')).rejects.toThrow(/没有可翻译/);
  });
});
