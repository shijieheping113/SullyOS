import { describe, expect, it } from 'vitest';
import type { MountedWorldbook, Worldbook } from '../types';
import {
    compareWorldbooksBySendOrder,
    groupWorldbooksByCategory,
    groupWorldbooksBySendPosition,
    injectWorldbookDepthEntries,
    isWorldbookEntryActive,
    parseStandardWorldbook,
    resolveWorldbookEntries,
    serializeStandardWorldbook,
    sortWorldbooksBySendOrder,
    splitWorldbookSections,
    toMountedWorldbook,
    upsertMountedWorldbooks,
} from './worldbook';

const book = (overrides: Partial<MountedWorldbook> = {}): MountedWorldbook => ({
    id: 'book-1',
    title: '测试条目',
    content: '{{char}} 在 {{user}} 提到月亮时会想起故乡。',
    category: '测试',
    ...overrides,
});

describe('worldbook activation', () => {
    it('keeps legacy entries constantly active after character definitions', () => {
        const resolved = resolveWorldbookEntries([book()], [], '阿澈', '小雨');
        expect(resolved).toHaveLength(1);
        expect(resolved[0].position).toBe(1);
        expect(resolved[0].content).toContain('阿澈 在 小雨');
    });

    it('activates keyword entries only when the recent scan buffer matches', () => {
        const keywordBook = book({ constant: false, key: ['月亮'], scanDepth: 2 });
        expect(isWorldbookEntryActive(keywordBook, [{ content: '今晚有月亮' }])).toBe(true);
        expect(isWorldbookEntryActive(keywordBook, [{ content: '今晚下雨' }])).toBe(false);
    });

    it('respects secondary keyword logic and disabled state', () => {
        const selectiveBook = book({
            constant: false,
            key: ['学校'],
            keysecondary: ['老师', '同学'],
            selective: true,
            selectiveLogic: 3,
        });
        expect(isWorldbookEntryActive(selectiveBook, [{ content: '学校里的老师和同学' }])).toBe(true);
        expect(isWorldbookEntryActive(selectiveBook, [{ content: '学校里的老师' }])).toBe(false);
        expect(isWorldbookEntryActive({ ...selectiveBook, disable: true }, [{ content: '学校里的老师和同学' }])).toBe(false);
    });
});

describe('worldbook positions', () => {
    it('splits standard positions and injects at-depth entries using their role', () => {
        const resolved = resolveWorldbookEntries([
            book({ id: 'before', position: 0 }),
            book({ id: 'depth', position: 4, depth: 1, role: 1 }),
        ]);
        const sections = splitWorldbookSections(resolved);
        expect(sections.beforeCharacter.map(entry => entry.book.id)).toEqual(['before']);

        const messages = injectWorldbookDepthEntries(
            [{ role: 'user', content: '一' }, { role: 'assistant', content: '二' }],
            sections.atDepth,
        );
        expect(messages.map(message => message.role)).toEqual(['user', 'user', 'assistant']);
        expect(messages[1].content).toContain('{{char}}');
    });
});

describe('standard worldbook import', () => {
    it('converts entries into a SullyOS category without losing activation metadata', () => {
        const imported = parseStandardWorldbook(JSON.stringify({
            entries: {
                0: {
                    uid: 7,
                    comment: '月亮设定',
                    content: '月亮是蓝色的。',
                    key: ['月亮'],
                    keysecondary: [],
                    constant: false,
                    selective: false,
                    order: 120,
                    position: 4,
                    depth: 2,
                    role: 0,
                    disable: false,
                    probability: 80,
                    useProbability: true,
                },
            },
        }), '导入测试', 1234);

        expect(imported).toHaveLength(1);
        expect(imported[0]).toMatchObject({
            title: '月亮设定',
            category: '导入测试',
            key: ['月亮'],
            constant: false,
            position: 4,
            depth: 2,
            role: 0,
            order: 120,
            probability: 80,
            useProbability: true,
            sourceUid: 7,
        });
    });

    it('exports a whole group as a standard worldbook that can be imported again', () => {
        const source = [{
            ...book({
                id: 'export-1',
                title: '导出条目',
                content: '导出内容',
                constant: false,
                key: ['导出'],
                position: 4,
                depth: 3,
                role: 2,
            }),
            category: '导出组',
            createdAt: 1,
            updatedAt: 1,
        }];

        const json = serializeStandardWorldbook(source);
        const raw = JSON.parse(json);
        expect(raw.entries['0']).toMatchObject({
            comment: '导出条目',
            key: ['导出'],
            position: 4,
            depth: 3,
            role: 2,
        });

        const imported = parseStandardWorldbook(json, '重新导入', 2);
        expect(imported[0]).toMatchObject({
            title: '导出条目',
            content: '导出内容',
            key: ['导出'],
            position: 4,
            depth: 3,
            role: 2,
        });
    });
});

describe('mounted worldbook synchronization', () => {
    it('copies edited activation and injection settings into the character mount cache', () => {
        const mounted = toMountedWorldbook({
            ...book({
                constant: false,
                key: ['月亮'],
                keysecondary: ['夜晚'],
                selective: true,
                selectiveLogic: 0,
                position: 4,
                depth: 2,
                role: 1,
                disable: true,
                order: 180,
                scanDepth: 6,
                useProbability: true,
                probability: 75,
            }),
            category: '同步测试',
            createdAt: 1,
            updatedAt: 2,
        });

        expect(mounted).toMatchObject({
            constant: false,
            key: ['月亮'],
            keysecondary: ['夜晚'],
            selective: true,
            position: 4,
            depth: 2,
            role: 1,
            disable: true,
            order: 180,
            scanDepth: 6,
            useProbability: true,
            probability: 75,
        });
        expect(mounted).not.toHaveProperty('createdAt');
        expect(mounted).not.toHaveProperty('updatedAt');
    });

    it('mounts a complete generated group without duplicates and keeps it injectable', () => {
        const now = Date.now();
        const generated: Worldbook[] = [
            { ...book({ id: 'generated-1', title: '常驻校规', content: '午夜后禁止离开宿舍。', constant: true, order: 10, position: 1 }), category: '学院', createdAt: now, updatedAt: now },
            { ...book({ id: 'generated-2', title: '雨夜钟楼', content: '钟楼会在雨夜开放。', constant: false, key: ['钟楼'], scanDepth: 4, order: 20, position: 1 }), category: '学院', createdAt: now, updatedAt: now },
        ];
        const mounted = upsertMountedWorldbooks([book({ id: 'existing', title: '已有条目', order: 300 })], generated);
        const retried = upsertMountedWorldbooks(mounted, generated);

        expect(retried.map(entry => entry.id)).toEqual(['existing', 'generated-1', 'generated-2']);
        expect(retried.filter(entry => entry.category === '学院')).toHaveLength(2);
        expect(resolveWorldbookEntries(retried, [{ content: '我们去钟楼看看' }]).map(entry => entry.book.id)).toEqual(['generated-1', 'generated-2', 'existing']);
    });
});

describe('worldbook send-order display', () => {
    it('sorts by position then order, keeping mount index for ties', () => {
        const books = [
            book({ id: 'late-mount', position: 1, order: 100 }),
            book({ id: 'before', position: 0, order: 200 }),
            book({ id: 'early-mount', position: 1, order: 100 }),
            book({ id: 'after-low', position: 1, order: 50 }),
        ];
        expect(sortWorldbooksBySendOrder(books).map(entry => entry.id)).toEqual([
            'before',
            'after-low',
            'late-mount',
            'early-mount',
        ]);
        expect(compareWorldbooksBySendOrder(books[0], books[2], 0, 2)).toBeLessThan(0);
    });

    it('groups by injection position for the character mounted list', () => {
        const groups = groupWorldbooksBySendPosition([
            book({ id: 'a', position: 1, order: 20, category: '乙' }),
            book({ id: 'b', position: 0, order: 10, category: '甲' }),
            book({ id: 'c', position: 1, order: 10, category: '甲' }),
        ]);
        expect(groups.map(group => [group.position, group.books.map(entry => entry.id)])).toEqual([
            [0, ['b']],
            [1, ['c', 'a']],
        ]);
    });

    it('keeps category discovery order but sorts inside each category', () => {
        const groups = groupWorldbooksByCategory([
            book({ id: '乙-后', category: '乙', position: 1, order: 20 }),
            book({ id: '甲', category: '甲', position: 0, order: 1 }),
            book({ id: '乙-前', category: '乙', position: 1, order: 5 }),
        ]);
        expect(groups.map(group => group.category)).toEqual(['乙', '甲']);
        expect(groups[0].books.map(entry => entry.id)).toEqual(['乙-前', '乙-后']);
    });
});
