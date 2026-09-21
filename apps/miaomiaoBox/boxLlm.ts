import { extractContent, safeFetchJson } from '../../utils/safeApi';
import type { APIConfig } from '../../types';

type LightLlmBag = { lightLLM?: { baseUrl?: string; apiKey?: string; model?: string } };

export async function callMainChatLlm(opts: {
  apiConfig: APIConfig;
  messages: { role: string; content: string }[];
  temperature: number;
  charId?: string;
  charName?: string;
}): Promise<string> {
  const baseUrl = (opts.apiConfig.baseUrl || '').replace(/\/+$/, '');
  const data = await safeFetchJson(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.apiConfig.model,
        messages: opts.messages,
        temperature: opts.temperature,
        stream: false,
      }),
    },
    2,
    0,
    { appName: '喵喵盒', charId: opts.charId, charName: opts.charName, purpose: '盒子演出' },
  );
  return (extractContent(data) || '').trim();
}

export async function callSecondaryLlm(opts: {
  memoryPalaceConfig: LightLlmBag;
  system: string;
  user: string;
  temperature: number;
  purpose: string;
}): Promise<string> {
  const llm = opts.memoryPalaceConfig?.lightLLM;
  if (!llm?.baseUrl || !llm.apiKey || !llm.model) {
    throw new Error('副 API 还没配好，摘要/转写先做不了');
  }
  const baseUrl = llm.baseUrl.replace(/\/+$/, '');
  const data = await safeFetchJson(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        temperature: opts.temperature,
        stream: false,
      }),
    },
    2,
    60_000,
    { appName: '喵喵盒', purpose: opts.purpose },
  );
  return (extractContent(data) || '').trim();
}
