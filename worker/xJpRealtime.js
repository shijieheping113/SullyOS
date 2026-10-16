/**
 * 中心代理上的日本热词、雅虎讨论、Threads 读帖。
 * X 的 Fx / x.md 不走这里，手机直连。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BROWSER_HTML_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const DOMAIN_LABEL = {
  anime: '二次元', seiyuu: '声优', tokusatsu: '特撮', celebrity: '明星', trending: '热议',
  local_social: '地方社会', game: '游戏', sports: '体育', other: '其它',
};

const GENRE_TO_DOMAIN = {
  'エンタメ': 'celebrity',
  'ニュース': 'local_social',
  'アニメ・ゲーム': 'anime',
  'スポーツ': 'sports',
  'グルメ': 'other',
};

const HINTS = {
  seiyuu: ['声優', 'せいゆう', '配音', '声优', '花澤', '神谷', '宮野', '釘宮', '悠木', '水瀬', '雨宮'],
  tokusatsu: ['特撮', '仮面ライダー', 'スーパー戦隊', 'ウルトラマン', 'ライダー', '戦隊', 'ゴジラ'],
  anime: ['アニメ', '漫画', 'マンガ', '二次元', 'オタク', '同人', 'コスプレ', '劇場版', 'アニメ化', 'ワンピース', '呪術', '鬼滅', 'VTuber', 'ホロライブ', 'にじさんじ'],
  celebrity: ['俳優', '女優', 'タレント', 'アイドル', '歌手', '主演', '出演', '乃木坂', '櫻坂', '日向坂', '映画', 'ドラマ', '舞台'],
  game: ['ゲーム', '任天堂', 'PlayStation', 'スイッチ', 'ソシャゲ', '原神', 'ポケモン', 'モンハン', 'Steam'],
  sports: ['野球', 'サッカー', 'ホームラン', '優勝', '大谷', 'プロ野球', 'Jリーグ', '五輪', 'テニス', 'バスケ', '相撲', 'MLB'],
  local_social: ['県', '市', '地方', '消防', '警察', '事故', '災害', '地震', '台風', '選挙', '首相', '内閣'],
};

const hitHints = (blob, list) => list.some(h => blob.includes(h));

export const classifyDomain = (query, genre, extra) => {
  const blob = `${query || ''} ${extra || ''}`;
  let primary = 'trending';
  if (hitHints(blob, HINTS.tokusatsu)) primary = 'tokusatsu';
  else if (hitHints(blob, HINTS.seiyuu)) primary = 'seiyuu';
  else if (hitHints(blob, HINTS.anime)) primary = 'anime';
  else if (hitHints(blob, HINTS.celebrity)) primary = 'celebrity';
  else if (hitHints(blob, HINTS.game)) primary = 'game';
  else if (hitHints(blob, HINTS.sports) || genre === 'スポーツ') primary = 'sports';
  else if (hitHints(blob, HINTS.local_social) || genre === 'ニュース') primary = 'local_social';
  else primary = GENRE_TO_DOMAIN[genre || ''] || 'trending';
  return { domain: primary, domain_label: DOMAIN_LABEL[primary] || '其它' };
};

const softFail = (reason, detail) => ({ ok: false, reason, detail: detail || '' });

const capN = (raw) => {
  const n = parseInt(String(raw || '6'), 10);
  if (!Number.isFinite(n)) return 6;
  return Math.max(1, Math.min(12, n));
};

const readText = async (res, max) => {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return await res.text();
  const chunks = [];
  let total = 0;
  const limit = max || 1500000;
  while (total < limit) {
    const step = await reader.read();
    if (step.done) break;
    if (step.value) {
      total += step.value.length;
      chunks.push(step.value);
    }
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  const merged = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, merged.length - offset);
    if (take <= 0) break;
    merged.set(c.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
};

const fetchText = async (url, ms, maxBytes, headers) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: headers || BROWSER_HTML_HEADERS, redirect: 'follow', signal: ctrl.signal });
    const text = await readText(res, maxBytes || 1500000);
    return { ok: res.ok, status: res.status, text, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
};

export const parseYahooNextData = (html) => {
  const m = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

const childKeywords = (cb) => {
  if (!Array.isArray(cb)) return '';
  return cb.map(x => String(x || '').trim()).filter(Boolean).slice(0, 6).join('／');
};

const itemsFromYahoo = (data) => {
  const page = (((data || {}).props || {}).pageProps || {}).pageData || {};
  const buzz = page.buzzTrend || {};
  const raw = [].concat(buzz.items || [], buzz.otherItems || []);
  for (const hb of ((page.hotBuzz || {}).items || [])) {
    if (hb && hb.query && !raw.some(x => x && x.query === hb.query)) raw.push(hb);
  }
  const seen = new Set();
  const items = [];
  for (const it of raw) {
    const q = String((it && it.query) || '').trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    const genre = it.genre || '';
    const cb = it.childBuzz || [];
    const dom = classifyDomain(q, genre, childKeywords(cb));
    items.push({
      query: q,
      genre,
      domain: dom.domain,
      domain_label: dom.domain_label,
      keywords: childKeywords(cb),
      summary: null,
    });
  }
  return items;
};

const decodeXml = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ');

const stripTags = (s) => decodeXml(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const parseGoogleNewsRss = (xml, q) => {
  const items = [];
  const blocks = String(xml || '').split(/<item\b/i).slice(1, 11);
  for (const block of blocks) {
    const titleRaw = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    if (!titleRaw || titleRaw === 'Google ニュース' || titleRaw === 'Google News') continue;
    let title = titleRaw;
    let source = '';
    const cut = titleRaw.lastIndexOf(' - ');
    if (cut > 0) {
      title = titleRaw.slice(0, cut).trim();
      source = titleRaw.slice(cut + 3).trim();
    }
    const srcL = source.toLowerCase();
    if (srcL.includes('howl') || srcL.includes('hackernoon') || srcL.includes('youtube')) continue;
    let desc = stripTags((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '');
    if (desc.startsWith(title)) desc = desc.slice(title.length).replace(/^[\s\-|｜]+/, '');
    if (source && desc.startsWith(source)) desc = desc.slice(source.length).replace(/^[\s\-|｜]+/, '');
    items.push({ title, source, desc, q });
  }
  return items;
};

/** Bing 新闻 RSS（CF 出口稳定可达）：标题在 title，媒体名在 News:Source。 */
export const parseBingNewsRss = (xml, q) => {
  const items = [];
  const blocks = String(xml || '').split(/<item\b/i).slice(1, 11);
  for (const block of blocks) {
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    if (!title) continue;
    const source = stripTags((block.match(/<(?:News:|news:)?Source[^>]*>([\s\S]*?)<\/(?:News:|news:)?Source>/i) || [])[1] || '');
    let desc = stripTags((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '');
    desc = desc.replace(/(?:\s|\.|…)+$/, '').trim();
    if (desc.startsWith(title)) desc = desc.slice(title.length).replace(/^[\s\-|｜]+/, '');
    if (source && desc.startsWith(source)) desc = desc.slice(source.length).replace(/^[\s\-|｜]+/, '');
    if (!newsSourceOk(source)) continue;
    items.push({ title, source, desc, q });
  }
  return items;
};

const SNS_FLUFF_HINTS = [
  'ホロライブ', 'おやつはホテル', '切り抜き', 'キリヌキ', 'スパチャ', '配信枠',
  'youtube.com', 'youtu.be', '@youtube', 'チャンネル登録', '高評価', '草草草',
  'マジで草', '誰かまとめて', 'それな', 'ガチャ', '天井到達', 'ファンアート',
  'howl.link', 'Howl.link', 'hackernoon', 'HackerNoon',
];
const NEWSY_WORDS = ['発表', '決定', '配信', '発売', '選出', '流出', '結婚', '死去', 'リコール', '不正', 'アップデート', '開幕', '当選', '就任', '辞任', '逮捕', '勝利', '敗退', '引退', 'リリース', '公開', '出演'];
const BAD_NEWS_SOURCES = ['howl.link', 'howl', 'hackernoon', 'youtube', 'youtu.be'];

const newsSourceOk = (source) => {
  const s = String(source || '').trim().toLowerCase();
  if (!s) return true;
  return !BAD_NEWS_SOURCES.some(b => s.includes(b));
};

const NO_NEWS = '（暂无可靠新闻摘要）';
const DOMAIN_RELAX = {
  anime: ['seiyuu', 'game', 'celebrity', 'trending'],
  seiyuu: ['anime', 'celebrity', 'trending'],
  tokusatsu: ['anime', 'celebrity', 'trending'],
  celebrity: ['anime', 'trending', 'seiyuu'],
  trending: ['celebrity', 'local_social', 'anime', 'other'],
  local_social: ['trending', 'other'],
  game: ['anime', 'trending'],
  sports: ['trending', 'other'],
  other: ['trending'],
  entertainment: ['celebrity', 'trending', 'anime'],
  social: ['local_social', 'trending'],
};

const clipSummary = (raw, maxChars = 280) => {
  let s = String(raw || '').replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const soft = Math.max(maxChars, 280);
  const ends = ['。', '！', '？', '…'];
  const complete = ['。', '！', '？', '…', '）', ')', '」', '』', '】', '》'];
  const pick = (window, floor) => {
    let best = -1;
    for (const ch of ends) {
      const i = window.lastIndexOf(ch);
      if (i >= floor && i > best) best = i;
    }
    return best;
  };
  if (s.length <= maxChars && complete.some(ch => s.endsWith(ch))) return s;
  const cut = pick(s.slice(0, soft), 36);
  if (cut >= 0) return s.slice(0, cut + 1).trim();
  return s.length <= soft ? s : `${s.slice(0, soft - 1).trim()}…`;
};

const looksLikeSnsFluff = (text) => {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.startsWith('（暂无')) return false;
  if (t.length < 12) return true;
  const tl = t.toLowerCase();
  if (tl.includes('howl') || tl.includes('hackernoon')) return true;
  if (/\bon\s*X\b/i.test(t) || t.includes(' on Twitter')) return true;
  const emoji = t.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];
  if (emoji.length >= 4 && emoji.length * 3 >= Math.max(1, Math.floor(t.length / 4))) return true;
  const newsy = NEWSY_WORDS.some(word => t.includes(word));
  for (const hint of SNS_FLUFF_HINTS) {
    const hit = hint.charCodeAt(0) < 128 ? tl.includes(hint.toLowerCase()) : t.includes(hint);
    if (hit && !newsy) return true;
  }
  if ((t.match(/#/g) || []).length >= 3 || (t.match(/@/g) || []).length >= 2) return true;
  if (t.includes('热议关键词') || t.startsWith('関連：')) return true;
  return false;
};

/** 和工作台 google_news_blurb 同一套排序：有导语、命中词、更长导语优先，不拿最长的无关稿。 */
export const pickGoogleNewsBlurb = (items, q, maxChars = 280) => {
  const toks = String(q || '').split(/[^\w\u3040-\u30ff\u4e00-\u9fff]+/).filter(t => t.length >= 2);
  const ranked = (items || []).map(it => {
    const title = it.title || '';
    const desc = it.desc || '';
    const fluff = looksLikeSnsFluff(title) ? 1 : 0;
    const hasDesc = desc.length >= 24 ? 1 : 0;
    const hit = toks.reduce((n, tok) => n + ((title.includes(tok) || desc.includes(tok)) ? 1 : 0), 0);
    return { it, key: [fluff, -hasDesc, -hit, -desc.length, -title.length] };
  }).sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    return 0;
  });
  let best = null;
  for (const row of ranked) {
    if (looksLikeSnsFluff(row.it.title)) continue;
    if (!newsSourceOk(row.it.source)) continue;
    best = row.it;
    break;
  }
  if (!best) return null;
  const title = best.title;
  const source = best.source || '';
  const desc = best.desc || '';
  const parts = [title];
  if (desc.length >= 20 && !looksLikeSnsFluff(desc) && !title.includes(desc.slice(0, 12))) parts.push(clipSummary(desc, 160));
  let blurb = clipSummary(parts.join('。'), maxChars);
  if (source && !blurb.includes(source) && blurb.length + source.length + 3 <= maxChars) {
    blurb = clipSummary(`${blurb}（${source}）`, maxChars);
  }
  if (!blurb || looksLikeSnsFluff(blurb) || blurb.trim().length < 36) return null;
  return blurb;
};

const itemMatches = (item, selected) => {
  const tags = new Set(item.domain_tags || []);
  if (item.domain) tags.add(item.domain);
  if (selected.has('entertainment')) tags.add('celebrity');
  if (selected.has('social')) tags.add('local_social');
  if (selected.has('celebrity')) tags.add('entertainment');
  if (selected.has('local_social')) tags.add('social');
  for (const tag of tags) if (selected.has(tag)) return true;
  return false;
};

export const filterHotPool = (items, interestOn, domains) => {
  const selected = new Set(domains || []);
  if (!interestOn) return { pool: items.slice(), mode: 'off', note: '兴趣筛选关 → 原榜顺序' };
  if (!selected.size) return { pool: items.slice(), mode: 'off_empty_chips', note: '兴趣筛选开着但未选具体兴趣＝不筛选（原榜顺序）' };
  const strict = items.filter(it => itemMatches(it, selected));
  if (strict.length) {
    return { pool: strict, mode: 'strict', note: `兴趣筛选：${[...selected].sort().join(',')} → ${strict.length} 条` };
  }
  const relaxed = new Set(selected);
  for (const key of selected) (DOMAIN_RELAX[key] || []).forEach(extra => relaxed.add(extra));
  let soft = items.filter(it => itemMatches(it, relaxed));
  if (!selected.has('sports')) soft = soft.filter(it => it.domain !== 'sports' && !(it.domain_tags || []).includes('sports'));
  if (soft.length) {
    return { pool: soft, mode: 'relaxed', note: `兴趣 ${[...selected].sort().join(',')} 无严格命中；已放宽邻近 → ${soft.length} 条` };
  }
  return { pool: [], mode: 'empty', note: `兴趣 ${[...selected].sort().join(',')} 本轮没有匹配。下面不是筛选后的榜，是空的。` };
};

const RSS_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
  'Accept-Language': 'ja,en;q=0.8',
};

const googleNewsBlurb = async (q, deadline, trace) => {
  if (Date.now() > deadline) return null;
  const pull = async (query) => {
    if (Date.now() > deadline) return [];
    const url = `https://news.google.com/rss/search?${new URLSearchParams({ q: query, hl: 'ja', gl: 'JP', ceid: 'JP:ja' })}`;
    const got = await fetchText(url, Math.min(4500, Math.max(1500, deadline - Date.now())), 800000, RSS_HEADERS);
    return parseGoogleNewsRss(got.text, q).filter(it => !looksLikeSnsFluff(it.title) && !looksLikeSnsFluff(`${it.title}（${it.source || ''}）`) && newsSourceOk(it.source));
  };
  // Google 对 CF 出口间歇 503：原地重试两次（第一次隔 1.5s，第二次隔 2s），全空才认输。
  const RETRY_WAITS = [1500, 2000];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, RETRY_WAITS[attempt - 1]));
    if (trace) trace.attempts++;
    let news = await pull(`${q} when:1d`);
    if (!news.length) news = await pull(q);
    if (news.length) {
      if (trace && attempt > 0) { trace.retried++; trace.lastRetryWaitMs = RETRY_WAITS[attempt - 1]; }
      return pickGoogleNewsBlurb(news, q, 280);
    }
    if (Date.now() > deadline) break;
  }
  if (trace) trace.exhausted++;
  return null;
};

/**
 * Bing 新闻首页的「Bing のトレンド」轮播：一页就是当日日本趋势，标题即热点本身。
 * 只认这一段之后的卡片，前面「トップ記事」不算，免得把头条混进来。
 */
export const parseBingTrendTitles = (html) => {
  const text = String(html || '');
  const mark = text.indexOf('Bing のトレンド');
  const seg = mark >= 0 ? text.slice(mark) : text;
  const titles = [];
  const seen = new Set();
  const re = /class="tobitem_title">([^<]{4,200})</g;
  let m;
  while ((m = re.exec(seg))) {
    const title = stripTags(m[1]);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
};

/** 第三条路：Bing 新闻 RSS。CF 出口稳过，格式和工作台一样是「标题（媒体名）」。 */
export const bingNewsBlurb = async (q, deadline) => {
  if (Date.now() > deadline) return null;
  const url = `https://www.bing.com/news/search?${new URLSearchParams({ q, format: 'RSS', setlang: 'ja', cc: 'JP' })}`;
  const got = await fetchText(url, Math.min(4500, Math.max(1500, deadline - Date.now())), 800000, RSS_HEADERS);
  const news = parseBingNewsRss(got.text, q)
    .filter(it => !looksLikeSnsFluff(it.title) && !looksLikeSnsFluff(`${it.title}（${it.source || ''}）`));
  return pickGoogleNewsBlurb(news, q, 280);
};

export const yahooSearchTitles = (html) => {
  const titles = [];
  const re = /href="https:\/\/news\.yahoo\.co\.jp\/articles\/[a-f0-9]+"/gi;
  let m;
  while ((m = re.exec(html)) && titles.length < 3) {
    const window = html.slice(m.index, m.index + 1800);
    // 标题里常插 <em> 命中词高亮，先摘掉再取文本节点，否则被切成半句。
    const flat = window.replace(/<\/?em[^>]*>/gi, '');
    const bits = flat.match(/>([^<]{6,160})</g) || [];
    for (const bit of bits) {
      const title = stripTags(bit.slice(1, -1));
      if (!title || /yahoo/i.test(title) || /^\d{1,2}\/\d{1,2}/.test(title)) continue;
      // 搜索页里链接后面第一段常是摘要残句（以「ごろ」「…」结尾、带省略号），不是标题；跳过它。
      if (/…$/.test(title) || /(ごろ|によると|ということです)$/.test(title)) continue;
      if (title.length < 8) continue;
      if (!titles.includes(title)) titles.push(title);
      break;
    }
  }
  return titles;
};

/** 和工作台 _yahoo_blurb_from_parts 同一套：标题 + 导语，短的不要。 */
const yahooBlurbFromParts = (title, lead) => {
  const parts = [];
  const t = stripTags(title || '');
  const l = stripTags(lead || '');
  if (t) parts.push(t);
  if (l) parts.push(l);
  if (!parts.length) return null;
  if (parts.length === 2) {
    const joined = parts[0].includes(parts[1]) || parts[1].startsWith(parts[0].slice(0, 10))
      ? parts[1]
      : `${parts[0]}。${parts[1]}`;
    const clipped = clipSummary(joined, 280);
    return clipped.length >= 40 ? clipped : null;
  }
  const clipped = clipSummary(parts[0], 280);
  return clipped.length >= 40 ? clipped : null;
};

/** 和工作台 _blurb_relevant 同一套：整词在，或每个分词都在。 */
const blurbRelevant = (q, blurb) => {
  const b = String(blurb || '');
  const query = String(q || '').trim();
  if (!b || !query) return false;
  if (b.includes(query)) return true;
  const toks = query.split(/[^\w\u3040-\u30ff\u4e00-\u9fff]+/).filter(t => t.length >= 2);
  return toks.length > 0 && toks.every(tok => b.includes(tok));
};

const yahooNewsBlurb = async (q, deadline) => {
  if (Date.now() > deadline) return null;
  const url = `https://news.yahoo.co.jp/search?${new URLSearchParams({ p: q })}`;
  const got = await fetchText(url, Math.min(4500, Math.max(1500, deadline - Date.now())));
  const html = got.text || '';
  const titles = yahooSearchTitles(html);
  const fast = titles.length ? yahooBlurbFromParts(titles[0], '') : null;
  let blurb = fast;
  const article = html.match(/href="(https:\/\/news\.yahoo\.co\.jp\/articles\/[a-f0-9]+)"/i);
  if (article && deadline - Date.now() > 1200) {
    try {
      const art = await fetchText(article[1], Math.min(2800, deadline - Date.now()));
      const tm = String(art.text || '').match(/<title>([^<]+)<\/title>/i);
      const desc = String(art.text || '').match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
        || String(art.text || '').match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
      const title = tm ? stripTags(tm[1]).replace(/\s*[-|｜].*$/, '').replace(/（[^）]*）\s*$/, '').trim() : (titles[0] || '');
      const lead = desc ? stripTags(desc[1]) : '';
      const fromArticle = yahooBlurbFromParts(title, lead);
      if (fromArticle) blurb = fromArticle;
    } catch { /* 搜索页标题也行 */ }
  }
  if (!blurb || looksLikeSnsFluff(blurb)) return null;
  return clipSummary(blurb, 280);
};

/** 和工作台 _blurb_ok 同一套：真文本、不是社媒碎嘴、够长。 */
const blurbOk = (blurb, minLen = 36) => !!blurb && !looksLikeSnsFluff(blurb) && !String(blurb).includes('热议关键词') && String(blurb).trim().length >= minLen;

const enrichOne = async (item, deadline, preferYahoo, source, trace) => {
  if (item.summary && (looksLikeSnsFluff(item.summary) || String(item.summary).startsWith('関連：'))) item.summary = null;
  // 种子：Trends RSS 自带的新闻标题，先垫一条，后面真新闻再覆盖。
  if (!item.summary && Array.isArray(item.news_titles) && item.news_titles.length) {
    const seeded = clipSummary(item.news_titles.slice(0, 2).join('。'), 280);
    if (blurbOk(seeded)) item.summary = seeded;
  }
  const good = () => blurbOk(item.summary, 50);
  /** 和工作台 _accept 一样：够长就收，更长才换掉旧的。 */
  const accept = (blurb, minLen = 36) => {
    if (!blurbOk(blurb, minLen)) return false;
    if (!item.summary || blurb.length > String(item.summary).length) {
      item.summary = blurb;
      return true;
    }
    return false;
  };
  if (preferYahoo && deadline - Date.now() >= 2500) {
    const pair = await Promise.all([
      yahooNewsBlurb(item.query, deadline).catch(() => null),
      googleNewsBlurb(item.query, deadline, trace).catch(() => null),
    ]);
    const yb = pair[0];
    const gb = pair[1];
    // 雅虎先：命中热词、或者本身就够长，才算数；否则退回 Google 新闻。
    if (blurbOk(yb, 40) && (blurbRelevant(item.query, yb) || String(yb).length >= 60)) item.summary = yb;
    else if (blurbOk(gb, 36)) item.summary = gb;
    else {
      accept(yb, 40);
      if (!good()) accept(gb, 36);
    }
  } else if (preferYahoo) {
    if (!good()) accept(await yahooNewsBlurb(item.query, deadline).catch(() => null), 40);
    if (!good()) accept(await googleNewsBlurb(item.query, deadline, trace).catch(() => null), 36);
    if (!good()) accept(await bingNewsBlurb(item.query, deadline).catch(() => null), 36);
  } else if (source === 'bing') {
    // Bing 源：摘要也先走 Bing（词是从 Bing 首页热榜来的，两边同一家更对得上），
    // 拿不到再退回 Google 新闻。
    if (!good()) accept(await bingNewsBlurb(item.query, deadline).catch(() => null), 36);
    if (!good()) accept(await googleNewsBlurb(item.query, deadline, trace).catch(() => null), 36);
  } else {
    if (!good()) accept(await googleNewsBlurb(item.query, deadline, trace).catch(() => null), 36);
    if (!good()) accept(await bingNewsBlurb(item.query, deadline).catch(() => null), 36);
    if (!good()) accept(await yahooNewsBlurb(item.query, deadline).catch(() => null), 40);
  }
  const related = (Array.isArray(item.related) ? item.related : []).filter(x => typeof x === 'string' && x && x !== item.query).slice(0, 2);
  if (item.summary && related.length && String(item.summary).length < 100 && !looksLikeSnsFluff(item.summary)) {
    const extra = related.join('／');
    if (extra && !String(item.summary).includes(extra)) item.summary = clipSummary(`${item.summary}（関連：${extra}）`, 280);
  }
  if (!blurbOk(item.summary)) item.summary = null;
  else item.summary = clipSummary(item.summary, 280);
  return item;
};

const finishHot = async (source, items, n, interestOn, domains, extra) => {
  const filtered = filterHotPool(items, interestOn, domains);
  const shown = filtered.pool.slice(0, n);
  const deadline = Date.now() + 14000;
  const trace = { attempts: 0, retried: 0, exhausted: 0, lastRetryWaitMs: 0 };
  if (shown.length) await mapLimit(shown, 5, it => enrichOne(it, deadline, source === 'yahoo', source, trace));
  const lines = shown.map(it => {
    let summary = it.summary;
    if (!summary || looksLikeSnsFluff(summary) || String(summary).startsWith('関連：')) summary = NO_NEWS;
    return `${it.query}｜${it.domain_label || '其它'}｜${summary}`;
  });
  const header = source === 'yahoo'
    ? '【日本热词｜雅虎】'
    : source === 'bing'
      ? '【日本热词｜Bing】'
      : '【日本热词｜Google Trends】';
  let modelFeed = lines.length ? `${header}\n${lines.map(line => `- ${line}`).join('\n')}` : header;
  if (filtered.mode === 'relaxed' || filtered.mode === 'empty') modelFeed += `\n（说明：${filtered.note}）`;
  if (extra && extra.honest) modelFeed += `\n（说明：${extra.honest}）`;
  return {
    ok: true,
    source,
    source_mode: extra && extra.sourceMode ? extra.sourceMode : (source === 'yahoo' ? 'yahoo_ssr' : 'page'),
    source_total: items.length,
    filter_mode: filtered.mode,
    filter_note: filtered.note,
    honest_limit: extra && extra.honest ? extra.honest : null,
    hours: extra && extra.hours,
    n,
    items: shown.map(it => ({
      query: it.query,
      domain: it.domain,
      domain_label: it.domain_label,
      summary: it.summary || null,
    })),
    lines,
    model_feed: modelFeed,
    google_news: {
      attempts: trace.attempts,
      retried: trace.retried,
      exhausted: trace.exhausted,
      retry_waits_ms: [1500, 2000],
      last_retry_wait_ms: trace.lastRetryWaitMs,
      note: trace.retried
        ? `Google 新闻第一次没通，重试后拿到（间隔 ${trace.lastRetryWaitMs}ms）`
        : trace.exhausted
          ? 'Google 新闻重试两次仍没通，已交给别的源'
          : 'Google 新闻一次就通',
    },
  };
};

const parseQs = (url) => {
  const interestRaw = (url.searchParams.get('interest') || '0').toLowerCase();
  const interestOn = interestRaw === '1' || interestRaw === 'true' || interestRaw === 'on';
  const domains = (url.searchParams.get('domains') || '').split(',').map(s => s.trim()).filter(Boolean);
  const hours = url.searchParams.get('hours') === '24' ? 24 : 4;
  return { n: capN(url.searchParams.get('n') || url.searchParams.get('limit')), interestOn, domains, hours };
};

export const parseGtrendsPage = (html, hours) => {
  const m = String(html || '').match(/AF_initDataCallback\(\{key:\s*['"]ds:0['"][\s\S]*?data:(\[[\s\S]*?),\s*sideChannel/);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  const sportsEn = ['cricket', 'mlb', 'nba', 'nfl', 'fifa', 'premier league', 'f1', 'formula'];
  const items = [];
  for (const row of data[1]) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !row[0].trim()) continue;
    const title = row[0].trim();
    const related = (Array.isArray(row[9]) ? row[9] : []).filter(x => typeof x === 'string' && x.trim() && x !== title).slice(0, 8);
    const dom = classifyDomain(title, '', related.slice(0, 4).join(' '));
    const blob = `${title} ${related.join(' ')}`.toLowerCase();
    if (sportsEn.some(word => blob.includes(word)) || blob.includes(' vs ')) {
      dom.domain = 'sports';
      dom.domain_label = '体育';
    }
    items.push({
      query: title,
      domain: dom.domain,
      domain_label: dom.domain_label,
      related,
      news_titles: [],
      summary: null,
      keywords: related.slice(0, 4).join('／') || null,
    });
  }
  return items;
};

export const parseGtrendsRss = (xml) => {
  const items = [];
  const blocks = String(xml || '').split(/<item\b/i).slice(1);
  for (const block of blocks) {
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    if (!title) continue;
    const newsTitles = [];
    const re = /news_item_title[^>]*>([\s\S]*?)<\/[\w:]*news_item_title>/gi;
    let m;
    while ((m = re.exec(block))) {
      const t = stripTags(m[1]);
      if (t) newsTitles.push(t);
    }
    const dom = classifyDomain(title, '', newsTitles.slice(0, 4).join(' '));
    items.push({
      query: title,
      domain: dom.domain,
      domain_label: dom.domain_label,
      summary: newsTitles.length ? newsTitles.slice(0, 2).join('。') : null,
      news_titles: newsTitles,
    });
  }
  return items;
};

const TRENDS_HEADERS = {
  ...BROWSER_HTML_HEADERS,
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  Referer: 'https://trends.google.com/trending?geo=JP',
};

const apiGtrends = async (url) => {
  const qs = parseQs(url);
  const pageUrl = `https://trends.google.com/trending?geo=JP&hours=${qs.hours}&hl=ja`;
  let items = [];
  let sourceMode = 'page';
  let honest = '';
  try {
    // 和工作台 _fetch_gtrends_page 同参数：同样的 Referer、同样的 18 秒。
    const got = await fetchText(pageUrl, 18000, 3500000, TRENDS_HEADERS);
    items = parseGtrendsPage(got.text, qs.hours);
  } catch {
    items = [];
  }
  if (!items.length) {
    sourceMode = 'rss_fallback';
    honest = '网页全量嵌入本次不可用，已降级 RSS（通常约 10 条，远少于网页数百条）。';
    try {
      const got = await fetchText('https://trends.google.com/trending/rss?geo=JP', 10000);
      items = parseGtrendsRss(got.text);
    } catch (e) {
      return softFail('unreachable', `Trends 网页抓取失败｜RSS 兜底：${String((e && e.message) || e)}`);
    }
    if (!items.length) return softFail('no_results', 'Trends 网页无列表，RSS 也是空的');
  }
  return finishHot('trends', items, qs.n, qs.interestOn, qs.domains, { sourceMode, honest, hours: qs.hours });
};

/** Workers 一次能同时开着的出站连接有限，多出来的会排队；排队时超时计时已经在跑，
 *  排在后面的就会白白超时。雅虎这条路一条要打两次请求，所以一次最多放 5 条。 */
const mapLimit = async (items, limit, fn) => {
  const list = Array.from(items);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      await fn(list[index], index);
    }
  });
  await Promise.all(workers);
  return list;
};

const apiYahooHot = async (url) => {
  const qs = parseQs(url);
  try {
    const got = await fetchText('https://search.yahoo.co.jp/realtime', 8000);
    const data = parseYahooNextData(got.text);
    if (!data) return softFail('parse_error', '未找到 __NEXT_DATA__');
    const items = itemsFromYahoo(data);
    if (!items.length) return softFail('no_results', '急上昇列表为空');
    return finishHot('yahoo', items, qs.n, qs.interestOn, qs.domains, { sourceMode: 'yahoo_ssr', hours: qs.hours });
  } catch (e) {
    return softFail('unreachable', String((e && e.message) || e));
  }
};

const cleanYahoo = (s) => String(s || '').replace(/\tSTART\t/g, '').replace(/\tEND\t/g, '').replace(/\s+/g, ' ').trim();

/** Bing 源：词来自 Bing 新闻首页「Bing のトレンド」，和 Trends／雅虎并列，不是谁的兜底。 */
const apiBingHot = async (url) => {
  const qs = parseQs(url);
  try {
    const got = await fetchText('https://www.bing.com/news?cc=JP&setlang=ja', 12000, 1500000, {
      ...BROWSER_HTML_HEADERS,
      'Accept-Language': 'ja,JP;q=0.9,ja;q=0.8,en;q=0.7',
    });
    const titles = parseBingTrendTitles(got.text);
    if (!titles.length) return softFail('no_results', 'Bing 首页没有趋势卡片');
    const items = titles.map(title => {
      const dom = classifyDomain(title, '', '');
      return {
        query: title,
        domain: dom.domain,
        domain_label: dom.domain_label,
        summary: null,
        news_titles: [],
      };
    });
    return finishHot('bing', items, qs.n, qs.interestOn, qs.domains, { sourceMode: 'bing_news_home', hours: qs.hours });
  } catch (e) {
    return softFail('unreachable', String((e && e.message) || e));
  }
};

export const parseYahooDiscuss = (html, q, limit) => {
  const data = parseYahooNextData(html);
  if (!data) return null;
  const page = (((data.props || {}).pageProps || {}).pageData || {});
  const entries = ((page.timeline || {}).entry) || [];
  return entries.slice(0, limit).map(e => ({
    id: e.id,
    handle: e.screenName || '',
    name: e.name || '',
    text: cleanYahoo(e.displayTextBody || e.displayText || ''),
  }));
};

const apiYahooDiscuss = async (url) => {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return softFail('parse_error', '请提供关键词 q');
  const limit = Math.max(1, Math.min(8, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
  const target = `https://search.yahoo.co.jp/realtime/search?${new URLSearchParams({ p: q, ei: 'UTF-8' })}`;
  try {
    const got = await fetchText(target, 12000);
    const items = parseYahooDiscuss(got.text, q, limit);
    if (!items) return softFail('parse_error', '未找到 __NEXT_DATA__');
    if (!items.length) return softFail('no_results', '没有讨论');
    return { ok: true, query: q, items };
  } catch (e) {
    return softFail('unreachable', String((e && e.message) || e));
  }
};

const threadsPic = (user) => {
  if (!user || typeof user !== 'object') return '';
  const hd = user.hd_profile_pic_url_info;
  return user.profile_pic_url || user.profile_pic_url_hd || (hd && hd.url) || '';
};

const threadsText = (obj) => {
  const info = obj.text_post_app_info || {};
  const tf = info.text_fragments || obj.text_fragments || {};
  if (tf && tf.plaintext) return tf.plaintext;
  const cap = obj.caption;
  if (cap && typeof cap === 'object' && cap.text) return cap.text;
  if (typeof cap === 'string') return cap;
  return null;
};

const walk = (obj, fn) => {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach(v => walk(v, fn));
    return;
  }
  fn(obj);
  Object.keys(obj).forEach(k => walk(obj[k], fn));
};

export const parseThreadsHtml = (html, code) => {
  const blobs = [];
  const reJson = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  const reSjs = /<script[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const take = (raw) => {
    let s = String(raw || '').trim();
    if (s.startsWith('<!--') && s.endsWith('-->')) s = s.slice(4, -3);
    try { blobs.push(JSON.parse(s)); } catch { /* skip */ }
  };
  while ((m = reJson.exec(html))) take(m[1]);
  while ((m = reSjs.exec(html))) take(m[1]);
  const collected = [];
  const consider = (obj) => {
    if (!obj || typeof obj.code !== 'string' || !obj.user || typeof obj.user !== 'object') return;
    const text = threadsText(obj);
    const info = obj.text_post_app_info && typeof obj.text_post_app_info === 'object' ? obj.text_post_app_info : {};
    if (text == null && obj.like_count == null && !info) return;
    const rta = info.reply_to_author;
    collected.push({
      code: obj.code,
      text: text || '',
      username: obj.user.username || '',
      full_name: obj.user.full_name || '',
      profile_pic_url: threadsPic(obj.user),
      like_count: obj.like_count,
      reply_count: info.direct_reply_count,
      repost_count: obj.repost_count || info.repost_count,
      is_reply: !!info.is_reply,
      reply_to_author: rta && rta.username,
      reply_to_full_name: rta && rta.full_name,
    });
  };
  blobs.forEach(b => walk(b, consider));
  const byCode = {};
  for (const p of collected) {
    const prev = byCode[p.code];
    if (!prev || (!prev.text && p.text)) byCode[p.code] = p;
  }
  const main = byCode[code];
  if (!main) return null;
  const replies = Object.keys(byCode)
    .filter(c => c !== code)
    .map(c => byCode[c])
    .filter(p => p.is_reply || p.reply_to_author);
  const visible = replies.length ? replies : Object.keys(byCode).filter(c => c !== code).map(c => byCode[c]).slice(0, 20);
  return {
    code: main.code,
    text: main.text || '',
    username: main.username,
    full_name: main.full_name,
    like_count: main.like_count,
    reply_count: main.reply_count,
    repost_count: main.repost_count,
    profile_pic_url: main.profile_pic_url || '',
    url: main.username ? `https://www.threads.com/@${main.username}/post/${main.code}` : '',
    replies: visible.map(r => ({
      text: r.text || '',
      username: r.username,
      full_name: r.full_name,
      profile_pic_url: r.profile_pic_url || '',
      reply_to_author: r.reply_to_author || main.username,
      reply_to_full_name: r.reply_to_full_name || main.full_name,
    })),
  };
};

const extractThreadsCode = (url, html) => {
  const blob = `${url}\n${String(html || '').slice(0, 8000)}`;
  const at = blob.match(/threads\.(?:com|net)\/@([^/?#]+)\/post\/([^/?#]+)/i);
  if (at) return { username: at[1], code: at[2] };
  const t = blob.match(/threads\.(?:com|net)\/t\/([^/?#]+)/i);
  if (t) return { username: '', code: t[1] };
  const share = blob.match(/threads\.(?:com|net)\/share\/([^/?#]+)/i);
  if (share) return { username: '', code: share[1] };
  return null;
};

const apiThreads = async (url) => {
  let raw = (url.searchParams.get('url') || url.searchParams.get('code') || '').trim();
  if (!raw) return softFail('parse_error', '请提供 Threads 链接');
  if (!/^https?:/i.test(raw)) raw = `https://www.threads.com/share/${raw}/`;
  try {
    let got = await fetchText(raw, 20000);
    let found = extractThreadsCode(got.finalUrl || raw, got.text);
    if (!found) {
      const og = String(got.text || '').match(/property=["']og:url["'][^>]*content=["']([^"']+)["']/i)
        || String(got.text || '').match(/content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
      if (og && og[1] && og[1] !== raw) {
        got = await fetchText(og[1], 15000);
        found = extractThreadsCode(got.finalUrl || og[1], got.text);
      }
    }
    if (!found) return softFail('parse_error', '无法抽出帖短码');
    const card = parseThreadsHtml(got.text, found.code);
    if (!card) return softFail('parse_error', '页面里没有主帖');
    if (!card.username && found.username) card.username = found.username;
    return { ok: true, threads_card: card, final_url: got.finalUrl };
  } catch (e) {
    return softFail('unreachable', String((e && e.message) || e));
  }
};

export const handleXJpRequest = async (url) => {
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/gtrends/jp') return apiGtrends(url);
  if (path === '/yahoo-realtime/hot') return apiYahooHot(url);
  if (path === '/bing/jp') return apiBingHot(url);
  if (path === '/yahoo-realtime/discuss') return apiYahooDiscuss(url);
  if (path === '/threads/post') return apiThreads(url);
  return null;
};
