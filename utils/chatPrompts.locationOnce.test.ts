import { describe, expect, it } from 'vitest';
import { shouldAppendUserLocationBesideRealtime } from './chatPrompts';

const location = '用户大概在上海';

describe('位置不要和日本热词段重复', () => {
    it('只开日本热词、实时段里已有位置时，不再追加', () => {
        const realtime = `🇯🇵 【日本热议】\n${location}`;
        expect(shouldAppendUserLocationBesideRealtime(false, false, false, realtime, true)).toBe(false);
    });

    it('天气和国内热点都关、也没有日本热词段时，位置仍然单独补上', () => {
        expect(shouldAppendUserLocationBesideRealtime(false, false, false, '', false)).toBe(true);
    });
});
