/**
 * 日本热词：先 Trends，失败再雅虎。同一时段用同一份，失败就用上一槽。
 */

import { getXJpProxyBase } from './proxyWorker';
import { getHotNewsSlot } from './realtimeWorldCore';
import {
    buildJpHotLines,
    buildJpHotModelFeed,
    clampJpHotCount,
    jpHotCacheKey,
    jpHotHoursOf,
    type JpHotItem,
    type XJpRealtimeFlags,
} from './xJpPack';

const CACHE_ID = 'sully_jp_hot_cache_v1';
const LAST_ID = 'sully_jp_hot_last_v1';

interface CacheRow { key: string; feed: string; at: number }

const memory = new Map<string, string>();

const readStore = (id: string): string | null => {
    if (memory.has(id)) return memory.get(id) || null;
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(id);
    } catch {
        return null;
    }
};

const writeStore = (id: string, value: string) => {
    memory.set(id, value);
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(id, value);
    } catch { /* worker / 隐私模式 */ }
};

const readRow = (id: string): CacheRow | null => {
    const raw = readStore(id);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.feed === 'string' && typeof parsed.key === 'string') return parsed;
    } catch { /* ignore */ }
    return null;
};

const pull = async (path: string): Promise<{ source: 'trends' | 'yahoo'; items: JpHotItem[]; feed: string; sourceMode: string } | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 26000);
    try {
        const res = await fetch(`${getXJpProxyBase()}${path}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => null);
        if (!data || data.ok !== true) return null;
        const source = data.source === 'yahoo' ? 'yahoo' : 'trends';
        const items = Array.isArray(data.items) ? data.items as JpHotItem[] : [];
        const feed = typeof data.model_feed === 'string' ? data.model_feed.trim() : '';
        if (!feed && !items.length) return null;
        return { source, items, feed, sourceMode: typeof data.source_mode === 'string' ? data.source_mode : '' };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
};

const feedFromGot = (
    got: { source: 'trends' | 'yahoo'; items: JpHotItem[]; feed: string },
    n: number,
): string => {
    if (got.feed) return got.feed.replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ').replace(/[ \t]{2,}/g, ' ');
    const lines = buildJpHotLines(got.items).slice(0, n);
    return buildJpHotModelFeed(lines, got.source);
};

export const peekJpHotRefreshedAt = (): number | null => {
    const row = readRow(LAST_ID);
    return row?.at || null;
};

export const formatJpHotRefreshLabel = (at: number | null): string => {
    if (!at) return '尚未刷新';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(at));
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
    return `上次刷新：${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
};

export const fetchJpHotFeed = async (
    config: XJpRealtimeFlags,
    now: Date = new Date(),
    options?: { force?: boolean },
): Promise<string> => {
    const sourcePref = config.jpHotSource === 'yahoo' ? 'yahoo' : 'trends';
    const hours = jpHotHoursOf(config.jpHotHours);
    const n = clampJpHotCount(config.jpHotPickCount);
    const slot = getHotNewsSlot({ tz: 'Asia/Tokyo', now });
    const interest = config.jpHotInterestEnabled ? '1' : '0';
    const domains = (config.jpHotInterestEnabled ? [...(config.jpHotDomains || [])] : []).filter(Boolean).sort().join(',');
    const cacheKey = (source: string) => jpHotCacheKey(source, slot.date, slot.slot, hours, n, interest, domains);
    const key = cacheKey(sourcePref);
    if (!options?.force) {
        const hit = readRow(CACHE_ID);
        if (hit && hit.key === key && hit.feed) return hit.feed;
    }

    const q = `n=${n}&hours=${hours}&interest=${interest}&domains=${encodeURIComponent(domains)}`;
    let got = sourcePref === 'trends' ? await pull(`/gtrends/jp?${q}`) : null;
    if (!got) got = await pull(`/yahoo-realtime/hot?${q}`);
    const feed = got ? feedFromGot(got, n) : '';
    if (!got || !feed) {
        const last = readRow(LAST_ID);
        return last?.feed || '';
    }
    const row = JSON.stringify({ key: cacheKey(got.source), feed, at: Date.now(), sourceMode: got.sourceMode });
    writeStore(CACHE_ID, row);
    writeStore(LAST_ID, row);
    return feed;
};
