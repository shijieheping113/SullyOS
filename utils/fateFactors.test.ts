import { describe, expect, it } from 'vitest';
import { BUILTIN_FATE_FACTORS } from './fateFactors';
import type { FateFactor } from './fateFactors';

describe('内置命运因子库', () => {
  it('提供至少三百个实际条目', () => {
    const factors: FateFactor[] = BUILTIN_FATE_FACTORS;
    expect(factors.length).toBeGreaterThanOrEqual(300);
  });

  it('每个编号和名称都唯一', () => {
    expect(new Set(BUILTIN_FATE_FACTORS.map(factor => factor.id)).size)
      .toBe(BUILTIN_FATE_FACTORS.length);
    expect(new Set(BUILTIN_FATE_FACTORS.map(factor => factor.name)).size)
      .toBe(BUILTIN_FATE_FACTORS.length);
  });

  it('编号、名称、含义和分类都不是空白，含义不重复', () => {
    for (const factor of BUILTIN_FATE_FACTORS) {
      expect(factor.id.trim()).not.toBe('');
      expect(factor.name.trim()).not.toBe('');
      expect(factor.meaning.trim()).not.toBe('');
      expect(factor.category.trim()).not.toBe('');
    }
    expect(new Set(BUILTIN_FATE_FACTORS.map(factor => factor.meaning)).size)
      .toBe(BUILTIN_FATE_FACTORS.length);
  });

  it('覆盖生活变化、关系、身体与长期积累等不同领域', () => {
    const categories = new Set(BUILTIN_FATE_FACTORS.map(factor => factor.category));
    for (const category of [
      '变化', '得失', '机会', '阻力', '关系', '距离', '认知', '表达', '行动',
      '节奏', '秩序', '身体感受', '资源', '责任', '欲望', '选择', '偶然与发现',
      '修复与积累', '恋爱与暧昧', '亲密与信任',
    ]) {
      expect(categories.has(category)).toBe(true);
    }
  });

  it('恋爱、亲密、欲望与身体感受各有足量独立因子', () => {
    for (const category of ['恋爱与暧昧', '亲密与信任', '欲望', '身体感受']) {
      const factors = BUILTIN_FATE_FACTORS.filter(factor => factor.category === category);
      expect(factors.length).toBeGreaterThanOrEqual(16);
    }
    const names = new Set(BUILTIN_FATE_FACTORS.map(factor => factor.name));
    for (const name of ['心动', '暧昧', '气质吸引', '情欲吸引', '温存', '身体自在']) {
      expect(names.has(name)).toBe(true);
    }
  });

  it('亲密方向保留双方意愿、舒适程度与停止的空间', () => {
    const byId = new Map(BUILTIN_FATE_FACTORS.map(factor => [factor.id, factor]));
    expect(byId.get('intimacy-mutual-consent')?.meaning).toContain('双方清楚且持续愿意');
    expect(byId.get('intimacy-boundary-respect')?.meaning).toContain('放慢或停止');
    expect(byId.get('intimacy-touch-comfort')?.meaning).toContain('舒适');
    expect(byId.get('desire-changing')?.meaning).toContain('当下意愿');
  });

  it('不提供死亡因子', () => {
    for (const factor of BUILTIN_FATE_FACTORS) {
      expect(`${factor.name}${factor.meaning}${factor.category}`).not.toMatch(/死亡|死别|丧命|逝世/);
    }
  });
});
