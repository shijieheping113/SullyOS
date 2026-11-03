/**
 * 心象「思考强度」：budget 固定 4000；档位只决定要不要传 reasoning_effort。
 * 旧角色没存字段 → 当 medium（与改前线上一致）。
 */

export type ThinkingChainEffort = 'default' | 'low' | 'medium' | 'high';

export const THINKING_BUDGET_TOKENS = 4000;

export const THINKING_EFFORT_OPTIONS: ReadonlyArray<{
  id: ThinkingChainEffort;
  label: string;
  hint: string;
}> = [
  { id: 'default', label: '默认', hint: '不指定强度，交给模型' },
  { id: 'low', label: '轻', hint: '少想一点' },
  { id: 'medium', label: '中', hint: '现在一直在用的' },
  { id: 'high', label: '重', hint: '多想一点' },
];

/** 未写字段的旧角色按 medium，避免无声变成「默认」。 */
export const normalizeThinkingChainEffort = (raw: unknown): ThinkingChainEffort => {
  if (raw === 'default' || raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return 'medium';
};

export const maybeSuffixClaudeThinkingModel = (model: string): string => {
  const m = String(model || '');
  if (/^claude-/i.test(m) && !/-thinking$/i.test(m)) return `${m}-thinking`;
  return m;
};

/**
 * 写入 thinking 三件套（或默认档少传 reasoning_effort），并去掉采样参数。
 * 调用方已用 shouldSendThinkingParams / 等价门控确认「这一轮该发」。
 */
export const applyThinkingParams = (
  body: Record<string, any>,
  effortRaw: unknown,
): void => {
  const effort = normalizeThinkingChainEffort(effortRaw);
  const thinking = { type: 'enabled' as const, budget_tokens: THINKING_BUDGET_TOKENS };
  if (body.model) body.model = maybeSuffixClaudeThinkingModel(String(body.model));
  body.thinking = thinking;
  body.extra_body = { ...(body.extra_body || {}), thinking };
  if (effort === 'default') {
    delete body.reasoning_effort;
  } else {
    body.reasoning_effort = effort;
  }
  delete body.temperature;
  delete body.top_p;
};
