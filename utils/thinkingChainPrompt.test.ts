import { describe, expect, it } from 'vitest';
import {
  buildThinkingChainSystemSection,
  expandThinkingPromptMacros,
  migrateThinkingChainPromptFields,
  normalizeThinkingChainPromptMode,
  normalizeThinkingChainPromptPlacement,
  resolveThinkingChainUserPrompt,
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
  it('仅 custom + 非空全文 + back 才靠后；拆掉任一项回原来靠前', () => {
    const base = { mode: 'custom', customPrompt: '规则正文', placement: 'back' as const };
    expect(shouldPlaceThinkingPromptAtBack(base)).toBe(true);
    expect(shouldPlaceThinkingPromptAtBack({ ...base, placement: 'front' })).toBe(false);
    expect(shouldPlaceThinkingPromptAtBack({ ...base, mode: 'default' })).toBe(false);
    expect(shouldPlaceThinkingPromptAtBack({ ...base, customPrompt: '  ' })).toBe(false);
    expect(shouldPlaceThinkingPromptAtBack({ mode: 'custom', customPrompt: 'x' })).toBe(false);
  });
  it('靠后只看 custom 全文，不看 append', () => {
    expect(shouldPlaceThinkingPromptAtBack({
      mode: 'custom',
      appendPrompt: '追加不该算',
      customPrompt: '',
      fieldsSplit: true,
      placement: 'back',
    })).toBe(false);
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

describe('resolveThinkingChainUserPrompt', () => {
  it('default 只用 append，忽略 custom 全文', () => {
    expect(resolveThinkingChainUserPrompt({
      mode: 'default',
      appendPrompt: '追加A',
      customPrompt: '全文B',
      fieldsSplit: true,
    })).toBe('追加A');
  });
  it('custom 只用 custom，忽略 append', () => {
    expect(resolveThinkingChainUserPrompt({
      mode: 'custom',
      appendPrompt: '追加A',
      customPrompt: '全文B',
      fieldsSplit: true,
    })).toBe('全文B');
  });
  it('未分字段时 default 可暂读旧共享框 customPrompt', () => {
    expect(resolveThinkingChainUserPrompt({
      mode: 'default',
      appendPrompt: '',
      customPrompt: '旧追加',
      fieldsSplit: false,
    })).toBe('旧追加');
  });
  it('已分字段后 default 不再误读 custom', () => {
    expect(resolveThinkingChainUserPrompt({
      mode: 'default',
      appendPrompt: '',
      customPrompt: '自定义全文',
      fieldsSplit: true,
    })).toBe('');
  });
});

describe('migrateThinkingChainPromptFields', () => {
  it('default + 仅 customPrompt 有字 → 搬到 append 并清空 custom', () => {
    const out = migrateThinkingChainPromptFields({
      mode: 'default',
      appendPrompt: '',
      customPrompt: '旧追加内容',
      fieldsSplit: false,
    });
    expect(out.changed).toBe(true);
    expect(out.thinkingChainAppendPrompt).toBe('旧追加内容');
    expect(out.thinkingChainCustomPrompt).toBe('');
    expect(out.thinkingChainPromptFieldsSplit).toBe(true);
  });
  it('custom 模式不搬错：字留在 custom', () => {
    const out = migrateThinkingChainPromptFields({
      mode: 'custom',
      appendPrompt: '',
      customPrompt: '全文规则',
      fieldsSplit: false,
    });
    expect(out.changed).toBe(true);
    expect(out.thinkingChainAppendPrompt).toBe('');
    expect(out.thinkingChainCustomPrompt).toBe('全文规则');
  });
  it('已分字段第二次不再搬', () => {
    const out = migrateThinkingChainPromptFields({
      mode: 'default',
      appendPrompt: '追加',
      customPrompt: '全文',
      fieldsSplit: true,
    });
    expect(out.changed).toBe(false);
    expect(out.thinkingChainAppendPrompt).toBe('追加');
    expect(out.thinkingChainCustomPrompt).toBe('全文');
  });
});

describe('buildThinkingChainSystemSection', () => {
  it('default 含内置语言铁律，用 append 追加', () => {
    const out = buildThinkingChainSystemSection({
      charName: '糯',
      userName: 'Ann',
      mode: 'default',
      appendPrompt: '多写感官',
      customPrompt: '不该出现的全文',
      fieldsSplit: true,
    });
    expect(out).toContain('语言铁律');
    expect(out).toContain('用户对内心独白的额外要求');
    expect(out).toContain('多写感官');
    expect(out).not.toContain('不该出现的全文');
  });

  it('custom 不注入内置心象，带外壳与宏；忽略 append', () => {
    const out = buildThinkingChainSystemSection({
      charName: '糯',
      userName: 'Ann',
      mode: 'custom',
      appendPrompt: '追加不该进',
      customPrompt: '<thinking_rules>\n{{char}} sees {{user}}\n</thinking_rules>',
      fieldsSplit: true,
    });
    expect(out).not.toContain('语言铁律');
    expect(out).not.toContain('Claude');
    expect(out).not.toContain('Gemini');
    expect(out).not.toContain('第一人称');
    expect(out).not.toContain('追加不该进');
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
      fieldsSplit: true,
    });
    expect(out).toContain('语言铁律');
    expect(out).not.toContain('【用户思考规则】');
  });
});
