import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ChatInnerStatePeek, { EmotionNoteList, shouldPeekFlip } from '../components/chat/ChatInnerStatePeek';
import { pickDecorationLayout } from './chatDecoration';
import type { CharacterBuff } from '../types';

const shy: CharacterBuff = { id: 'shy', name: 'shy', label: '害羞', intensity: 2, emoji: '😳', description: '耳朵热' };

describe('心里话里的情绪清单', () => {
    it('不传情绪时仍是原来的心里话，没有清单', () => {
        const html = renderToStaticMarkup(React.createElement(ChatInnerStatePeek, {
            open: true, onClose: () => undefined, text: '想你', charName: '阿年',
        }));
        expect(html).toContain('想你');
        expect(html).toContain('收起');
        expect(html).not.toContain('退出');
        expect(html).not.toContain('data-emotion-notes');
    });

    it('心里话模式先只显示内心想法，清单不叠在下面', () => {
        const html = renderToStaticMarkup(React.createElement(ChatInnerStatePeek, {
            open: true, onClose: () => undefined, text: '想你', charName: '阿年', emotions: [shy],
        }));
        expect(html).toContain('想你');
        expect(html).toContain('阿年 的心里话');
        expect(html).toContain('退出');
        expect(html).not.toContain('data-emotion-notes');
        expect(html).not.toContain('收起');
    });

    it('情绪清单用小字，长说明可以换行', () => {
        const html = renderToStaticMarkup(React.createElement(EmotionNoteList, { emotions: [shy] }));
        expect(html).toContain('data-emotion-notes');
        expect(html).toContain('害羞');
        expect(html).toContain('耳朵热');
        expect(html).toContain('中等');
        expect(html).toContain('text-[12px]');
        expect(html).toContain('break-words');
        expect(html).not.toContain('text-[17px]');
        expect(html).not.toContain('text-[20px]');
    });

    it('点一下翻面，滑动和紧接着的第二下都不翻', () => {
        expect(shouldPeekFlip(false, 1000, 0, false)).toBe(true);
        expect(shouldPeekFlip(true, 1000, 0, false)).toBe(false);
        expect(shouldPeekFlip(false, 1000, 1500, false)).toBe(false);
        expect(shouldPeekFlip(false, 1600, 1500, false)).toBe(true);
        expect(shouldPeekFlip(false, 1600, 0, true)).toBe(false);
    });

    it('旧装扮没有这个字段时不当成心里话', () => {
        expect(pickDecorationLayout({ chatHideHeaderBuffs: false }).chatEmotionView).toBeUndefined();
        expect(pickDecorationLayout({ chatEmotionView: 'peek' }).chatEmotionView).toBe('peek');
        expect(() => pickDecorationLayout({ chatEmotionView: 'capsule' })).toThrow('布局选项无效');
    });
});
