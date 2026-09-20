import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeFetchJson } from './safeApi';
import { SECONDARY_LLM_TIMEOUT_MS, secondaryLlmCall } from './secondaryLlmCall';

vi.mock('./safeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./safeApi')>();
  return { ...actual, safeFetchJson: vi.fn() };
});

const config = {
  enabled: true,
  baseUrl: 'https://sec.example.com/v1',
  apiKey: 'sk-sec',
  model: 'sec-model',
};

describe('secondaryLlmCall timeoutMs', () => {
  beforeEach(() => {
    vi.mocked(safeFetchJson).mockReset();
    vi.mocked(safeFetchJson).mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
    });
  });

  it('缺省仍用修格式 80 秒', async () => {
    await secondaryLlmCall({
      config,
      purpose: 'sully-format-repair',
      messages: [{ role: 'user', content: 'hi' }],
      featureOpts: { temperature: 0.7 },
    });
    expect(safeFetchJson).toHaveBeenCalledWith(
      'https://sec.example.com/v1/chat/completions',
      expect.any(Object),
      1,
      SECONDARY_LLM_TIMEOUT_MS,
      expect.objectContaining({ purpose: 'sully-format-repair', appId: 'chat' }),
      undefined,
    );
  });

  it('功能可传入更短超时', async () => {
    await secondaryLlmCall({
      config,
      purpose: 'chat-manual-voice-translate',
      messages: [{ role: 'user', content: 'hi' }],
      featureOpts: { temperature: 0.3 },
      timeoutMs: 60_000,
    });
    expect(safeFetchJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      1,
      60_000,
      expect.objectContaining({ purpose: 'chat-manual-voice-translate', appId: 'chat' }),
      undefined,
    );
    const init = vi.mocked(safeFetchJson).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(true);
    expect(body.temperature).toBe(0.3);
    expect(body.model).toBe('sec-model');
  });
});
