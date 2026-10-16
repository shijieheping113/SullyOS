import { describe, expect, it } from 'vitest';
import {
    buildJpHotLines,
    buildSocialModelFeed,
    buildXPackTeaching,
    clipJpSummary,
    findFirstXPackTag,
    formatReplyLine,
    isXUrl,
    jpHotCacheKey,
    jpHotInjectOn,
    parseXSearchArg,
    personLabel,
    personLabelShort,
    stripXPackTags,
    xLinkCardsOn,
    xPackOn,
    xPackShortRecord,
    xProfileOn,
    xSearchOn,
    xYahooDiscussOn,
    type XSocialCardData,
} from './xJpPack';

describe('门控公式', () => {
    it('日本热词只看自己的全局开关和角色开关', () => {
        expect(jpHotInjectOn({ jpHotEnabled: false }, { jpHotEnabled: true })).toBe(false);
        expect(jpHotInjectOn({ jpHotEnabled: true }, { jpHotEnabled: false })).toBe(false);
        expect(jpHotInjectOn({ jpHotEnabled: true }, {})).toBe(false);
        expect(jpHotInjectOn({ jpHotEnabled: true }, { jpHotEnabled: true })).toBe(true);
    });

    it('X：总开关或角色关着，分能力开着也不跑', () => {
        expect(xPackOn({ xToolsEnabled: false }, { xToolsEnabled: true })).toBe(false);
        expect(xPackOn({ xToolsEnabled: true }, { xToolsEnabled: false })).toBe(false);
        expect(xSearchOn({ xToolsEnabled: false, xFeatSearch: true }, { xToolsEnabled: true })).toBe(false);
        expect(xLinkCardsOn({ xToolsEnabled: true, xFeatLinkCards: true }, {})).toBe(false);
    });

    it('只开搜索时，主页和讨论都不跑', () => {
        const rc = { xToolsEnabled: true, xFeatSearch: true, xFeatProfile: false, xFeatLinkCards: false, xFeatYahooDiscuss: false, xFeatReadDeep: false };
        const char = { xToolsEnabled: true };
        expect(xSearchOn(rc, char)).toBe(true);
        expect(xProfileOn(rc, char)).toBe(false);
        expect(xYahooDiscussOn(rc, char)).toBe(false);
        expect(xLinkCardsOn(rc, char)).toBe(false);
    });
});

describe('主帖全名，回复短名', () => {
    it('主帖带（@handle），回复行不带', () => {
        expect(personLabel('小灯', 'akari')).toBe('小灯（@akari）');
        expect(personLabelShort('小灯', 'akari')).toBe('小灯');
        expect(personLabelShort('', 'akari')).toBe('@akari');
        const line = formatReplyLine({ name: '路人', handle: 'guest', text: '好看 https://x.com/a/status/1', replyToHandle: 'akari', replyToName: '小灯' }, 'akari', '小灯');
        expect(line).toBe('路人 回复 小灯：好看');
        expect(line.includes('（@')).toBe(false);
        expect(line.includes('http')).toBe(false);
    });

    it('喂模型的卡片没有原链接', () => {
        const card: XSocialCardData = {
            provider: 'fxtwitter',
            url: 'https://x.com/akari/status/1',
            authorName: '小灯',
            authorHandle: 'akari',
            text: '正文 https://t.co/abc',
            replies: [{ name: '路人', handle: 'guest', text: '回复', replyToName: '小灯', replyToHandle: 'akari' }],
        };
        const feed = buildSocialModelFeed('x', card);
        expect(feed.startsWith('[X帖子] 小灯（@akari）')).toBe(true);
        expect(feed.includes('路人 回复 小灯')).toBe(true);
        expect(feed.includes('http')).toBe(false);
        expect(feed.includes('x.com')).toBe(false);
    });
});

describe('贴链域名与热词缓存', () => {
    it('移动端 X 域名也算 X', () => {
        expect(isXUrl('https://mobile.twitter.com/user/status/12345678901')).toBe(true);
        expect(isXUrl('https://mobile.x.com/user/status/12345678901')).toBe(true);
        expect(isXUrl('https://m.twitter.com/user/status/12345678901')).toBe(true);
        expect(isXUrl('https://www.mobile.x.com/user/status/12345678901')).toBe(true);
        expect(isXUrl('https://example.com/mobile.x.com')).toBe(false);
    });

    it('缓存键带条数、兴趣、领域，源不同就不是同一条', () => {
        const trends = jpHotCacheKey('trends', '2026-10-16', 1, 4, 6, '1', 'anime,sports');
        const yahoo = jpHotCacheKey('yahoo', '2026-10-16', 1, 4, 6, '1', 'anime,sports');
        const fewer = jpHotCacheKey('trends', '2026-10-16', 1, 4, 3, '1', 'anime,sports');
        expect(trends).not.toBe(yahoo);
        expect(trends).not.toBe(fewer);
        expect(trends).toContain('sports');
        expect(trends).toContain('#6#');
    });
});

describe('来源标记、教学和热词句末', () => {
    it('分享进历史时带来源头，不把楼主原文当成用户自己说的', () => {
        const card: XSocialCardData = {
            provider: 'fxtwitter',
            authorName: '小灯',
            authorHandle: 'akari',
            text: '正文',
            replies: [],
        };
        const x = buildSocialModelFeed('x', card, 'Ann');
        const threads = buildSocialModelFeed('threads', { ...card, provider: 'threads-ssr' }, 'Ann');
        expect(x.startsWith('[X帖子] Ann分享了一条 X 帖。这是别人发在 X 上的帖子，不是Ann自己说的话。作者：小灯（@akari）')).toBe(true);
        expect(threads.startsWith('[Threads帖子] Ann分享了一条 Threads 帖。这是别人发在 Threads 上的帖子，不是Ann自己说的话。作者：小灯（@akari）')).toBe(true);
        const withLink = buildSocialModelFeed('x', { ...card, text: '正文\nhttps://example.com/extra' }, 'Ann');
        expect(withLink).not.toContain('example.com');
        expect(withLink).not.toContain('http');
        expect(x.includes('正文')).toBe(true);
    });

    it('搜索教学改成原生语言，并认 sort／replies', () => {
        const taught = buildXPackTeaching({ xToolsEnabled: true, xFeatSearch: true, xSearchFeed: 'latest', xSearchIncludeReplies: true }, { xToolsEnabled: true });
        expect(taught).toContain('原生语言');
        expect(taught).toContain('sort=top|latest');
        expect(taught).toContain('sort=latest');
        expect(taught).not.toContain('禁止中文');
        expect(parseXSearchArg('花澤香菜 | sort=latest | replies=1')).toEqual({ query: '花澤香菜', sort: 'latest', replies: true });
        expect(xPackShortRecord('X_SEARCH', '花澤香菜', true, '小灯', 3)).toBe('小灯在 X 搜索了「花澤香菜」，看了 3 条');
        expect(xPackShortRecord('X_SEARCH', '花澤香菜', false, '小灯')).toBe('');
        expect(xPackShortRecord('X_SEARCH', '花澤香菜', false, '小灯')).not.toContain('搜了');
    });
    it('超长摘要收到后面的句号，不在半截硬切', () => {
        const body = `${'あ'.repeat(190)}。${'い'.repeat(40)}`;
        const clipped = clipJpSummary(body, 200);
        expect(clipped.endsWith('。')).toBe(true);
        expect(clipped.includes('い')).toBe(false);
    });

    it('烂源摘要换成暂无可靠新闻', () => {
        const lines = buildJpHotLines([
            { query: '話題', domain_label: '热议', summary: 'someone on X said hi' },
            { query: '発表', domain_label: '明星', summary: '新しい映画の公開日が決まった。主演がコメントを出した。' },
        ]);
        expect(lines[0]).toBe('話題｜热议｜（暂无可靠新闻摘要）');
        expect(lines[1].startsWith('発表｜明星｜')).toBe(true);
        expect(lines[1].includes('（暂无')).toBe(false);
    });

    it('先认 XHS，再认精确的 X 标记', () => {
        const text = '看看 [[XHS_SEARCH: 猫]] 然后 [[X_SEARCH: 犬]]';
        expect(findFirstXPackTag(text)?.name).toBe('X_SEARCH');
        expect(findFirstXPackTag(text)?.arg).toBe('犬');
        expect(findFirstXPackTag('[[XHS_SEARCH: 猫]]')).toBeNull();
        expect(stripXPackTags(text)).toBe('看看 [[XHS_SEARCH: 猫]] 然后');
    });
});
