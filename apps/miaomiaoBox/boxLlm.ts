import { extractContent, safeFetchJson } from '../../utils/safeApi';
import type { APIConfig } from '../../types';

type LightLlmBag = { lightLLM?: { baseUrl?: string; apiKey?: string; model?: string } };

function messageText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(messageText).join('');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return messageText(record.text ?? record.content ?? '');
  }
  return '';
}

/** 正文和思维链分开。思维链不进下一轮上下文。 */
export function splitBoxThinking(contentRaw: unknown, reasoningRaw: unknown): { content: string; thinking: string } {
  const src = messageText(contentRaw);
  const blocks: string[] = [];
  const rest = src.replace(/<(think|thinking|thought)>([\s\S]*?)<\/\1>/gi, (_all, _tag, body) => {
    const text = String(body || '').trim();
    if (text) blocks.push(text);
    return '';
  });
  const open = rest.match(/<(?:think|thinking|thought)>([\s\S]*)$/i);
  const content = rest.replace(/<(?:think|thinking|thought)>[\s\S]*$/i, '').trim();
  const thinking = [messageText(reasoningRaw).trim(), ...blocks, open?.[1]?.trim() || ''].filter(Boolean).join('\n\n').trim();
  return { content, thinking };
}

export async function callMainChatLlm(opts: {
  apiConfig: APIConfig;
  messages: { role: string; content: string }[];
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  stream: boolean;
  thinking: boolean;
  charId?: string;
  charName?: string;
  onDelta?: (fullText: string) => void;
  onThinking?: (fullThinking: string) => void;
}): Promise<{ content: string; thinking: string }> {
  const baseUrl = (opts.apiConfig.baseUrl || '').replace(/\/+$/, '');
  let model = opts.apiConfig.model || '';
  let temperature = opts.temperature;
  const thinkingOn = opts.thinking === true;
  if (thinkingOn && /^claude-/i.test(model) && !/-thinking$/i.test(model)) {
    model = `${model}-thinking`;
  }
  if (thinkingOn && /^claude-/i.test(model)) temperature = 1;
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature,
    top_p: opts.topP,
    frequency_penalty: opts.frequencyPenalty,
    presence_penalty: opts.presencePenalty,
    stream: opts.stream === true,
  };
  if (thinkingOn) {
    const thinking = { type: 'enabled', budget_tokens: 4000 };
    body.thinking = thinking;
    body.reasoning_effort = 'medium';
    body.extra_body = { thinking };
  }
  const data = await safeFetchJson(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    },
    2,
    0,
    { appName: '喵喵盒', charId: opts.charId, charName: opts.charName, purpose: '盒子演出' },
    opts.stream ? {
      onDelta: (_delta, fullText) => opts.onDelta?.(fullText),
      onReasoningDelta: (_delta, fullReasoning) => opts.onThinking?.(fullReasoning),
    } : undefined,
  );
  const msg = data?.choices?.[0]?.message;
  return splitBoxThinking(msg?.content, msg?.reasoning_content ?? msg?.reasoning ?? msg?.thinking);
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
