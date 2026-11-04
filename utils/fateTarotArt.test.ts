// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FateTarotArt, { FATE_ART_CATEGORIES, FateAstrolabe, fateArtCategory } from '../components/schedule/FateTarotArt';
import { BUILTIN_FATE_FACTORS } from './fateFactors';

describe('命运牌面图案', () => {
    it('20类分别绘制图案，覆盖真实内置分类', () => {
        expect(new Set(BUILTIN_FATE_FACTORS.map(factor => factor.category))).toEqual(new Set(FATE_ART_CATEGORIES));
        const drawings = FATE_ART_CATEGORIES.map(category => renderToStaticMarkup(React.createElement(FateTarotArt, { category })).replace(/data-fate-art="[^"]+"/, ''));
        expect(new Set(drawings).size).toBe(20);
    });
    it('没有分类的已存因子按id显示，不按主牌或副牌位置决定', () => {
        expect(fateArtCategory({ id: 'chance-opening' })).toBe('机会');
        const html = renderToStaticMarkup(React.createElement(FateTarotArt, { factor: { id: 'chance-opening' } }));
        expect(html).toContain('data-fate-art="机会"');
    });
    it('自定义分类与无因子的卡片均有独立牌面，绘图不带假数据或占卜结论', () => {
        expect(fateArtCategory({ id: 'custom' })).toBe('自定义');
        expect(renderToStaticMarkup(React.createElement(FateTarotArt))).toContain('<path');
        const astrolabe = renderToStaticMarkup(React.createElement(FateAstrolabe));
        expect(astrolabe).toContain('aria-hidden="true"');
        expect(astrolabe).not.toContain('<text');
    });
});
