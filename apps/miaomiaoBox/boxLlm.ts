import { extractContent, safeFetchJson } from '../../utils/safeApi';
import type { APIConfig, SecondaryLlmApiConfig } from '../../types';
import { isSecondaryLlmReady } from '../../utils/secondaryLlmApi';
import { SecondaryLlmNotConfiguredError } from '../../utils/secondaryLlmCall';

function messageText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(messageText).join('');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return messageText(record.text ?? record.content ?? '');
  }
  return '';
}

/** 思维链标签：think / thinking / thought。开标签允许带属性，大小写随意。 */
const THINK_TAG = '(?:thinking|thought|think)';

/**
 * 正文和思维链分开。思维链不进下一轮上下文。
 *
 * 只认标签，认三种写法：
 * 1. 配对的 <think>…</think>
 * 2. 只有开标签没收尾的（标签之后的都算思考）
 * 3. 只有收尾标签没开头的（收尾之前的都算思考）
 * 没有标签的一律不猜——不按「列出」「1.」「禁令」这类词去切，免得把剧情当成思考吃掉。
 */
export function splitBoxThinking(contentRaw: unknown, reasoningRaw: unknown): { content: string; thinking: string } {
  const src = messageText(contentRaw);
  const blocks: string[] = [];
  // 1. 配对标签（开标签可带属性：<think type="x">）
  let rest = src.replace(new RegExp(`<${THINK_TAG}\\b[^>]*>([\\s\\S]*?)<\\/${THINK_TAG}\\s*>`, 'gi'), (_all, body) => {
    const text = String(body || '').trim();
    if (text) blocks.push(text);
    return '';
  });
  // 2. 只有开标签没收尾：标签之后的全算思考
  const open = rest.match(new RegExp(`<${THINK_TAG}\\b[^>]*>([\\s\\S]*)$`, 'i'));
  if (open && open.index != null) rest = rest.slice(0, open.index).trim();
  // 3. 只有收尾标签没开头：收尾之前、从上一次切口到这儿的，全算思考
  let content = rest;
  const closeAt = rest.search(new RegExp(`<\\/${THINK_TAG}\\s*>`, 'i'));
  if (closeAt >= 0) {
    const head = rest.slice(0, closeAt).trim();
    if (head) blocks.push(head);
    content = rest.slice(closeAt).replace(new RegExp(`<\\/${THINK_TAG}\\s*>`, 'gi'), '').trim();
  }
  const thinking = [messageText(reasoningRaw).trim(), ...blocks, open?.[1]?.trim() || ''].filter(Boolean).join('\n\n').trim();
  return { content: content.trim(), thinking };
}

/**
 * 参数被模型拒绝（400/422，含请求体问题）时，只回退一次：改回主 API 自己的设置
 * （主设置的温度、主设置的流式，不带盒子的惩罚项和思考三件套），并把「回退了」回报给界面。
 * 不做多次重试：按次计费的模型多试一次就多扣一次钱。
 */
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
}): Promise<{ content: string; thinking: string; fellBack: boolean }> {
  const baseUrl = (opts.apiConfig.baseUrl || '').replace(/\/+$/, '');
  const buildBox = () => {
    let model = opts.apiConfig.model || '';
    const thinkingOn = opts.thinking === true;
    if (thinkingOn && /^claude-/i.test(model) && !/-thinking$/i.test(model)) {
      model = `${model}-thinking`;
    }
    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: thinkingOn && /^claude-/i.test(model) ? 1 : opts.temperature,
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
    return body;
  };
  const buildFallback = () => ({
    model: opts.apiConfig.model || '',
    messages: opts.messages,
    temperature: typeof opts.apiConfig.temperature === 'number' ? opts.apiConfig.temperature : 0.85,
    stream: opts.apiConfig.stream === true,
  });

  const send = async (body: Record<string, unknown>, stream: boolean) => safeFetchJson(
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
    stream ? {
      onDelta: (_delta, fullText) => opts.onDelta?.(fullText),
      onReasoningDelta: (_delta, fullReasoning) => opts.onThinking?.(fullReasoning),
    } : undefined,
  );
  const readOut = (data: any, fellBack: boolean) => {
    const msg = data?.choices?.[0]?.message;
    return { ...splitBoxThinking(msg?.content, msg?.reasoning_content ?? msg?.reasoning ?? msg?.thinking), fellBack };
  };

  try {
    return readOut(await send(buildBox(), opts.stream === true), false);
  } catch (e) {
    const text = String((e as Error)?.message || '');
    if (!/API Error (400|422)/.test(text)) throw e;
    return readOut(await send(buildFallback(), opts.apiConfig.stream === true), true);
  }
}

function temperatureRejected(message: string): boolean {
  return message.toLowerCase().includes('temperature');
}

/** 喵喵盒后台总结只走设置里的辅助 API。没配好就报错，不改打别的线路。 */
export async function callSecondaryLlm(opts: {
  secondaryLlm?: SecondaryLlmApiConfig | null;
  system: string;
  user: string;
  temperature: number;
  purpose: string;
}): Promise<string> {
  const llm = opts.secondaryLlm;
  if (!llm || !isSecondaryLlmReady(llm)) {
    throw new SecondaryLlmNotConfiguredError();
  }
  const baseUrl = llm.baseUrl.replace(/\/+$/, '');
  const send = (includeTemperature: boolean) => safeFetchJson(
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
        ...(includeTemperature ? { temperature: opts.temperature } : {}),
        stream: false,
      }),
    },
    2,
    60_000,
    { appName: '喵喵盒', purpose: opts.purpose },
  );
  try {
    return (extractContent(await send(true)) || '').trim();
  } catch (e) {
    const text = String((e as Error)?.message || '');
    if (!temperatureRejected(text)) throw e;
    return (extractContent(await send(false)) || '').trim();
  }
}
