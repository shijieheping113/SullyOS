import { describe, expect, it } from 'vitest';
import {
  buildThinkingChainSystemSection,
  expandThinkingPromptMacros,
  normalizeThinkingChainPromptMode,
  normalizeThinkingChainPromptPlacement,
  shouldPlaceThinkingPromptAtBack,
} from './thinkingChainPrompt';

describe('normalizeThinkingChainPromptMode', () => {
  it('未写与乱值都按 default', () => {
    expect(normalizeThinkingChainPromptMode(undefined)).toBe('default');
    expect(normalizeThinkingChainPromptMode('append')).toBe('default');
  });
  it('认 custom', () => {
    expect(normalizeThinkingChainPromptMode('custom')).toBe('custom');
  });
});

describe('normalizeThinkingChainPromptPlacement / shouldPlaceThinkingPromptAtBack', () => {
  it('未写按 front', () => {
    expect(normalizeThinkingChainPromptPlacement(undefined)).toBe('front');
    expect(normalizeThinkingChainPromptPlacement('side')).toBe('front');
  });
  it('认 back', () => {
    expect(normalizeThinkingChainPromptPlacement('back')).toBe('back');
  });
  it('仅 custom + 非空正文 + back 才靠后；拆掉任一项回原来靠前', () => {
    const base = { mode: 'custom', customPrompt: '规则正文', placement: 'back' as const };
    expect(shouldPlaceThinkingPromptAtBack(base)).toBe(true);
    expect(shouldPlaceThinkingPromptAtBack({ ...base, placement: 'front' })).toBe(false);
    expect(shouldPlaceThinkingPromptAtBack({ ...base, mode: 'default' })).toBe(false);
    expect(shouldPlaceThinkingPromptAtBack({ ...base, customPrompt: '  ' })).toBe(false);
    expect(shouldPlaceThinkingPromptAtBack({ mode: 'custom', customPrompt: 'x' })).toBe(false);
  });
});

describe('expandThinkingPromptMacros', () => {
  it('展开 user / char 及 Name 别名', () => {
    const out = expandThinkingPromptMacros(
      '{{user}} 对 {{char}}；{{userName}} / {{charName}}',
      { userName: 'Ann', charName: '糯' },
    );
    expect(out).toBe('Ann 对 糯；Ann / 糯');
  });
});

describe('buildThinkingChainSystemSection', () => {
  it('default 含内置语言铁律，可追加', () => {
    const out = buildThinkingChainSystemSection({
      charName: '糯',
      userName: 'Ann',
      mode: 'default',
      customPrompt: '多写感官',
    });
    expect(out).toContain('语言铁律');
    expect(out).toContain('用户对内心独白的额外要求');
    expect(out).toContain('多写感官');
  });

  it('custom 不注入内置心象，带外壳与宏', () => {
    const out = buildThinkingChainSystemSection({
      charName: '糯',
      userName: 'Ann',
      mode: 'custom',
      customPrompt: '<thinking_rules>\n{{char}} sees {{user}}\n</thinking_rules>',
    });
    expect(out).not.toContain('语言铁律');
    expect(out).not.toContain('Claude');
    expect(out).not.toContain('Gemini');
    expect(out).not.toContain('第一人称');
    expect(out).toContain('【用户思考规则】');
    expect(out).toContain('糯 sees Ann');
    expect(out).toContain('<thinking_rules>');
  });

  it('custom 但正文为空 → 退回 default', () => {
    const out = buildThinkingChainSystemSection({
      charName: '糯',
      userName: 'Ann',
      mode: 'custom',
      customPrompt: '   ',
    });
    expect(out).toContain('语言铁律');
    expect(out).not.toContain('【用户思考规则】');
  });
});
