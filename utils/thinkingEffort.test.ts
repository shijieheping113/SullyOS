import { describe, expect, it } from 'vitest';
import {
  THINKING_BUDGET_TOKENS,
  applyThinkingParams,
  maybeSuffixClaudeThinkingModel,
  normalizeThinkingChainEffort,
} from './thinkingEffort';

describe('normalizeThinkingChainEffort', () => {
  it('合法四档原样返回', () => {
    expect(normalizeThinkingChainEffort('default')).toBe('default');
    expect(normalizeThinkingChainEffort('low')).toBe('low');
    expect(normalizeThinkingChainEffort('medium')).toBe('medium');
    expect(normalizeThinkingChainEffort('high')).toBe('high');
  });

  it('未写或非法 → medium（旧角色体感）', () => {
    expect(normalizeThinkingChainEffort(undefined)).toBe('medium');
    expect(normalizeThinkingChainEffort(null)).toBe('medium');
    expect(normalizeThinkingChainEffort('')).toBe('medium');
    expect(normalizeThinkingChainEffort('extreme')).toBe('medium');
  });
});

describe('applyThinkingParams', () => {
  it('四档 budget 都是 4000', () => {
    for (const effort of ['default', 'low', 'medium', 'high'] as const) {
      const body: Record<string, any> = { model: 'gpt-test', temperature: 0.85, top_p: 0.9 };
      applyThinkingParams(body, effort);
      expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: THINKING_BUDGET_TOKENS });
      expect(body.extra_body.thinking).toEqual({ type: 'enabled', budget_tokens: THINKING_BUDGET_TOKENS });
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
    }
  });

  it('默认不传 reasoning_effort', () => {
    const body: Record<string, any> = { model: 'gpt-test', reasoning_effort: 'stale' };
    applyThinkingParams(body, 'default');
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('轻中重分别传 low/medium/high', () => {
    const low: Record<string, any> = { model: 'x' };
    applyThinkingParams(low, 'low');
    expect(low.reasoning_effort).toBe('low');

    const mid: Record<string, any> = { model: 'x' };
    applyThinkingParams(mid, 'medium');
    expect(mid.reasoning_effort).toBe('medium');

    const high: Record<string, any> = { model: 'x' };
    applyThinkingParams(high, 'high');
    expect(high.reasoning_effort).toBe('high');
  });

  it('claude 模型补 -thinking 后缀', () => {
    expect(maybeSuffixClaudeThinkingModel('claude-sonnet-4')).toBe('claude-sonnet-4-thinking');
    expect(maybeSuffixClaudeThinkingModel('claude-sonnet-4-thinking')).toBe('claude-sonnet-4-thinking');
    const body: Record<string, any> = { model: 'claude-3-5-sonnet' };
    applyThinkingParams(body, 'medium');
    expect(body.model).toBe('claude-3-5-sonnet-thinking');
  });
});
