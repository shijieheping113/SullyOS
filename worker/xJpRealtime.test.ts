import { describe, expect, it } from 'vitest';
// @ts-expect-error 中心代理这段是纯 JS
import { parseGtrendsPage, parseThreadsHtml, parseYahooDiscuss, parseYahooNextData, filterHotPool, yahooSearchTitles, pickGoogleNewsBlurb } from './xJpRealtime.js';

describe('worker 解析对齐工作台', () => {
    it('雅虎急上昇从 __NEXT_DATA__ 取出词', () => {
        const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: { pageProps: { pageData: { buzzTrend: { items: [{ query: '試験', genre: 'エンタメ', childBuzz: [] }] } } } },
        })}</script>`;
        const data = parseYahooNextData(html);
        expect(data.props.pageProps.pageData.buzzTrend.items[0].query).toBe('試験');
    });

    it('雅虎讨论读 timeline', () => {
        const html = `<script id="__NEXT_DATA__">${JSON.stringify({
            props: { pageProps: { pageData: { timeline: { entry: [{ id: '1', name: '灯', screenName: 'akari', displayText: 'たのしい' }] } } } },
        })}</script>`;
        const items = parseYahooDiscuss(html, '試験', 8);
        expect(items).toEqual([{ id: '1', handle: 'akari', name: '灯', text: 'たのしい' }]);
    });

    it('Threads 主帖全名数据在，回复单独列出', () => {
        const post = {
            code: 'ABC',
            user: { username: 'demo', full_name: '示例', profile_pic_url: 'https://cdn.example/demo.jpg' },
            text_post_app_info: { text_fragments: { plaintext: '你好' }, direct_reply_count: 1 },
            like_count: 3,
        };
        const reply = {
            code: 'DEF',
            user: { username: 'guest', full_name: '路人' },
            text_post_app_info: { text_fragments: { plaintext: '在呢' }, is_reply: true, reply_to_author: { username: 'demo', full_name: '示例' } },
        };
        const html = `<script type="application/json">${JSON.stringify({ post, reply })}</script>`;
        const card = parseThreadsHtml(html, 'ABC');
        expect(card.username).toBe('demo');
        expect(card.full_name).toBe('示例');
        expect(card.profile_pic_url).toBe('https://cdn.example/demo.jpg');
        expect(card.text).toBe('你好');
        expect(card.replies[0].full_name).toBe('路人');
        expect(card.replies[0].reply_to_author).toBe('demo');
    });

    it('Trends 网页嵌入认 ds:0，兴趣零命中不灌全榜', () => {
        const row = ['花澤香菜', null, null, [1], null, null, 1000, null, null, ['声優']];
        const html = `AF_initDataCallback({key: 'ds:0', hash: '1', data:${JSON.stringify([null, [row]])}, sideChannel: {}});`;
        const items = parseGtrendsPage(html, 4);
        expect(items[0].query).toBe('花澤香菜');
        expect(items[0].domain).not.toBe('');
        const empty = filterHotPool(items, true, ['sports']);
        expect(empty.mode === 'empty' || empty.pool.every((it: { domain: string }) => it.domain === 'sports')).toBe(true);
        if (empty.mode === 'empty') expect(empty.pool).toEqual([]);
        expect(empty.note).toContain('兴趣');
    });

    it('Google 新闻先取命中词的那篇，不取更长的无关稿', () => {
        const picked = pickGoogleNewsBlurb([
            { title: 'まったく関係ない長い記事の見出しです', desc: 'あ'.repeat(180), source: '某社' },
            { title: '大谷翔平がドジャースで本塁打', desc: 'ドジャースタジアムで大谷翔平が３ランを放ち、会場が沸いた。', source: '日刊スポーツ' },
        ], 'ドジャース');
        expect(picked).toContain('ドジャース');
        expect(picked).toContain('日刊スポーツ');
        expect(picked).not.toContain('まったく関係ない');
    });

    it('雅虎搜索页标题嵌在链接里面也能取到', () => {
        const html = '<a href="https://news.yahoo.co.jp/articles/1c78206cde783ebfd92b8382e61467542d8cae46" class="x"><div><span>まさか4点リードがひっくり返された</span></div></a>';
        expect(yahooSearchTitles(html)).toEqual(['まさか4点リードがひっくり返された']);
    });

    it('标题里夹命中词高亮时，取完整标题而不是半句', () => {
        const html = '<a href="https://news.yahoo.co.jp/articles/662599e46461c571bfd6ddd0fc7b387526c72fb9" class="x"><div class="t">石川県に<em class="hit">緊急地震速報</em>、取り消し</div><div class="d">　16日午後0時38分ごろ、石川県を含む広い地域に<em class="hit">緊急地震速報</em>が発表され、その後、取り消された。 　…</div></a>';
        expect(yahooSearchTitles(html)[0]).toBe('石川県に緊急地震速報、取り消し');
    });
});
