import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    loadSparkCircles, saveSparkCircles, loadActiveCircleId, saveActiveCircleId,
    filterPostsByCircle, SPARK_CIRCLE_ALL, SPARK_CIRCLES_KEY, SPARK_ACTIVE_CIRCLE_KEY,
} from './sparkCircles';
import type { SocialPost, SparkCircle } from '../types';

// vitest 跑在 node 环境，没有 localStorage —— 用内存 stub
const storage = new Map<string, string>();
const localStorageStub = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
};

beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', localStorageStub);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const circle = (id: string, name: string, memberCharIds: string[] = []): SparkCircle =>
    ({ id, name, worldPrompt: '', memberCharIds, createdAt: 1 });

const post = (id: string, circleId?: string): SocialPost => ({
    id, authorName: 'a', authorAvatar: 'a', title: 't', content: 'c', images: [],
    likes: 0, isCollected: false, isLiked: false, comments: [], timestamp: 0, tags: [],
    circleId,
});

describe('filterPostsByCircle', () => {
    const posts = [
        post('old'),                 // 旧帖（无圈子标记）
        post('c1-a', 'circle-1'),
        post('c1-b', 'circle-1'),
        post('c2-a', 'circle-2'),
        post('orphan', 'deleted'),   // 孤儿帖：圈子已删
    ];

    it('「全部」只显示无圈子帖和孤儿帖（圈子帖隔离，不互通）', () => {
        const valid = new Set(['circle-1', 'circle-2']);
        const ids = filterPostsByCircle(posts, SPARK_CIRCLE_ALL, valid).map(p => p.id);
        expect(ids).toEqual(['old', 'orphan']);
        expect(ids).not.toContain('c1-a'); // 圈子帖不进「全部」
        expect(ids).not.toContain('c2-a');
        // 空串同样视为全部
        expect(filterPostsByCircle(posts, '', valid).map(p => p.id)).toEqual(['old', 'orphan']);
    });

    it('「全部」不传 validCircleIds 时只显示无圈子帖', () => {
        const ids = filterPostsByCircle(posts, SPARK_CIRCLE_ALL).map(p => p.id);
        expect(ids).toEqual(['old']);
    });

    it('指定圈子只返回该圈子的帖子', () => {
        const result = filterPostsByCircle(posts, 'circle-1');
        expect(result.map(p => p.id)).toEqual(['c1-a', 'c1-b']);
    });

    it('旧帖与孤儿帖不在具体圈子里出现', () => {
        const ids = filterPostsByCircle(posts, 'circle-2').map(p => p.id);
        expect(ids).toEqual(['c2-a']);
        expect(ids).not.toContain('old');
        expect(ids).not.toContain('orphan');
    });
});

describe('circles persistence (localStorage)', () => {
    it('save → load 往返一致', () => {
        const data = [
            circle('circle-1', '古代世界', ['char-a', 'char-b']),
            { ...circle('circle-2', '现代世界', ['char-c']), worldPrompt: '有手机和网络' },
        ];
        saveSparkCircles(data);
        expect(loadSparkCircles()).toEqual(data);
    });

    it('脏数据（非数组 / 缺字段）被丢弃，不抛异常', () => {
        localStorage.setItem(SPARK_CIRCLES_KEY, '{"not":"array"}');
        expect(loadSparkCircles()).toEqual([]);
        localStorage.setItem(SPARK_CIRCLES_KEY, '[{"name":"缺id"}, {"id":"ok","name":"ok","memberCharIds":[]}]');
        const loaded = loadSparkCircles();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe('ok');
        expect(typeof loaded[0].worldPrompt).toBe('string');
    });

    it('无数据时返回空数组', () => {
        expect(loadSparkCircles()).toEqual([]);
    });

    it('activeCircleId 默认「全部」，保存后可读回', () => {
        expect(loadActiveCircleId()).toBe(SPARK_CIRCLE_ALL);
        saveActiveCircleId('circle-1');
        expect(localStorage.getItem(SPARK_ACTIVE_CIRCLE_KEY)).toBe('circle-1');
        expect(loadActiveCircleId()).toBe('circle-1');
        saveActiveCircleId(''); // 空值写回时归一为「全部」
        expect(localStorage.getItem(SPARK_ACTIVE_CIRCLE_KEY)).toBe(SPARK_CIRCLE_ALL);
    });
});

describe('空 id 圈子的存量迁移', () => {
    it('空 id 圈子按数组顺序补发 circle-legacy-N，且写回存储', () => {
        localStorage.setItem(SPARK_CIRCLES_KEY, JSON.stringify([
            circle('', '武侠世界', ['char-a']),
            circle('real-id', '现代世界', ['char-b']),
            circle('', '太空世界', ['char-c']),
        ]));
        const loaded = loadSparkCircles();
        expect(loaded.map(c => c.id)).toEqual(['circle-legacy-0', 'real-id', 'circle-legacy-1']);
        // 写回后存储里已无空 id → 再 load 幂等，id 不再变
        const again = loadSparkCircles();
        expect(again.map(c => c.id)).toEqual(loaded.map(c => c.id));
        // 其它字段原样保留
        expect(loaded[0].name).toBe('武侠世界');
        expect(loaded[0].memberCharIds).toEqual(['char-a']);
    });

    it('全部圈子都有真实 id 时不做任何重写', () => {
        const data = [circle('circle-1', 'A'), circle('circle-2', 'B')];
        saveSparkCircles(data);
        expect(loadSparkCircles()).toEqual(data);
    });
});
