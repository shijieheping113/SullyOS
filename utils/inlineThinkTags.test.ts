import { describe, expect, it } from 'vitest';
import { extractInlineThinkTags, peelInlineThinkTags, stripInlineThinkTags } from './inlineThinkTags';

describe('peelInlineThinkTags', () => {
  it('普通一对标签：思考进 chain，正文留下', () => {
    const out = peelInlineThinkTags('<thinking>心里一紧</thinking>\n你好');
    expect(out.thinking).toBe('心里一紧');
    expect(out.cleaned.trim()).toBe('你好');
  });

  it('正文里复述闭标签：配到最外层最后一个闭标签', () => {
    const raw = [
      '[THINK] Output <thinking>...BEFORE the reply, then </thinking> and the reply.',
      'Inside = the moment the message lands.',
      '· reach — reaching for Ann\'s sleeve.</thinking>',
      '对不起。',
    ].join('\n');
    const out = peelInlineThinkTags(raw);
    expect(out.thinking).toContain('then </thinking> and the reply');
    expect(out.thinking).toContain("Ann's sleeve");
    expect(out.thinking).not.toContain('对不起');
    // 开标签前的字会留下；开标签到最后一个闭标签之间整段进心象，不再漏进气泡
    expect(out.cleaned.replace(/\s+/g, ' ').trim()).toBe('[THINK] Output 对不起。');
    expect(out.cleaned).not.toContain('Ann\'s sleeve');
    expect(stripInlineThinkTags(raw)).not.toContain('the moment the message lands');
  });

  it('两段真实思考块：分别剥，中间正文保留', () => {
    const out = peelInlineThinkTags('<think>a</think>中间<think>b</think>尾');
    expect(out.thinking).toBe('a\n\nb');
    expect(out.cleaned).toBe('中间尾');
  });

  it('只有开没有闭：开标签后整段当思考', () => {
    const out = peelInlineThinkTags('前<thought>未写完');
    expect(out.thinking).toBe('未写完');
    expect(out.cleaned).toBe('前');
  });

  it('extract / strip 与 peel 一致', () => {
    const raw = '<thinking>x</thinking>y';
    expect(extractInlineThinkTags(raw)).toBe('x');
    expect(stripInlineThinkTags(raw)).toBe('y');
  });
});
