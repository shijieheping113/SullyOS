import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MessageItem from '../components/chat/MessageItem';
import { plainLinesWithInlineTime } from '../components/chat/BubbleInlineTime';
import { pickDecorationLayout } from './chatDecoration';
import type { Message } from '../types';

const activeTheme = { id: 'test-theme', name: 'Test', user: {}, ai: {} } as any;
const text = (content: string): Message => ({
    id: 1,
    charId: 'char-1',
    role: 'assistant',
    type: 'text',
    content,
    timestamp: Date.parse('2026-10-14T09:05:00'),
});

const markup = (
    msg: Message,
    showTimestamp: 'always' | 'hover' | 'never' | 'every_message',
    timestampPlacement: 'outside' | 'inside',
    isLastInGroup: boolean,
) => renderToStaticMarkup(React.createElement(MessageItem, {
    msg,
    isFirstInGroup: true,
    isLastInGroup,
    activeTheme,
    charAvatar: 'https://example.com/char.png',
    charName: '角色',
    userAvatar: 'https://example.com/user.png',
    onLongPress: vi.fn(),
    onReply: vi.fn(),
    selectionMode: false,
    isSelected: false,
    onToggleSelect: vi.fn(),
    showTimestamp,
    timestampPlacement,
    messageSpacing: 'default',
}));

describe('bubble inline timestamp', () => {
    it('puts the spacer and the visible time on the last text line', () => {
        const html = markup(text('上一行\n末行好'), 'always', 'inside', true);
        expect(html).toContain('invisible inline-block');
        expect(html).toContain('absolute bottom-0 right-0');
        expect(html).not.toContain('top-full');
        const first = html.indexOf('上一行');
        const time = html.indexOf('invisible inline-block');
        const last = html.indexOf('末行');
        expect(first).toBeGreaterThan(-1);
        expect(last).toBeGreaterThan(first);
        expect(time).toBeGreaterThan(last);
        expect(html.slice(first, last)).not.toContain('invisible');
    });

    it('keeps a long last line glued to the time instead of a time-only row', () => {
        const html = markup(text('甲乙丙丁戊己庚辛'), 'every_message', 'inside', false);
        expect(html).toContain('whitespace-nowrap');
        expect(html).toContain('invisible inline-block');
        expect(html.indexOf('辛')).toBeLessThan(html.indexOf('invisible inline-block'));
        expect(html).not.toContain('data-bubble-time-corner');
    });

    it('outside has no inline trailing', () => {
        const html = markup(text('就这一句'), 'always', 'outside', true);
        expect(html).toContain('top-full');
        expect(html).not.toContain('invisible inline-block');
        expect(html).not.toContain('data-inline-time');
    });

    it('never shows no time even if placement is inside', () => {
        const html = markup(text('就这一句'), 'never', 'inside', true);
        expect(html).not.toContain('top-full');
        expect(html).not.toContain('invisible inline-block');
        expect(html).not.toContain('absolute bottom-0 right-0');
        expect(html).not.toContain('data-bubble-time-corner');
    });

    it('falls back to a corner line when the last block is code', () => {
        const html = markup(text('```\nconst a = 1\n```'), 'always', 'inside', true);
        expect(html).toContain('data-bubble-time-corner');
        expect(html).not.toContain('data-inline-time');
        expect(html).not.toContain('top-full');
    });

    it('accepts inside and still accepts old layouts without the field', () => {
        expect(pickDecorationLayout({ chatTimestampPlacement: 'inside' }).chatTimestampPlacement).toBe('inside');
        expect(pickDecorationLayout({ chatShowTimestamp: 'always' }).chatTimestampPlacement).toBeUndefined();
        expect(pickDecorationLayout({ chatShowTimestamp: 'every_message' }).chatShowTimestamp).toBe('every_message');
        expect(() => pickDecorationLayout({ chatTimestampPlacement: 'beside' })).toThrow('布局选项无效');
    });

    it('group plain text attaches the time only on the last non-empty line', () => {
        const html = renderToStaticMarkup(plainLinesWithInlineTime('第一\n\n第二', React.createElement('i', null, '09:05')).nodes as React.ReactElement);
        expect(html.match(/data-inline-time/g)?.length).toBe(1);
        expect(html.indexOf('第一')).toBeLessThan(html.indexOf('data-inline-time'));
        expect(html.indexOf('第二')).toBeLessThan(html.indexOf('09:05'));
    });
});
