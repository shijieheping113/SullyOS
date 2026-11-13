import { beforeEach, describe, expect, it } from 'vitest';
import { dataUrlToBlob, putImageBlob } from './blobRef';
import {
    blobRefSessionCacheSizeForTest,
    clearBlobRefSessionCache,
    getCachedBlobRefUrl,
    loadBlobRefUrl,
    warmBlobRefUrls,
} from './blobRefSessionCache';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('blobRefSessionCache', () => {
    beforeEach(() => {
        clearBlobRefSessionCache();
    });

    it('同令牌第二次同步命中缓存，不另建 URL', async () => {
        const ref = await putImageBlob(dataUrlToBlob(TINY_PNG));
        const first = await loadBlobRefUrl(ref);
        expect(first).toMatch(/^blob:/);
        expect(getCachedBlobRefUrl(ref)).toBe(first);

        const second = await loadBlobRefUrl(ref);
        expect(second).toBe(first);
        expect(blobRefSessionCacheSizeForTest()).toBe(1);
    });

    it('warmBlobRefUrls 写入会话缓存后可同步取出', async () => {
        const a = await putImageBlob(dataUrlToBlob(TINY_PNG));
        // 另一张 1×1 JPEG，避免字节去重后令牌撞成同一个
        const tinyJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z';
        const b = await putImageBlob(dataUrlToBlob(tinyJpeg));
        await warmBlobRefUrls([a, b, a, 'data:image/png;base64,AAAA', null]);
        expect(getCachedBlobRefUrl(a)).toMatch(/^blob:/);
        expect(getCachedBlobRefUrl(b)).toMatch(/^blob:/);
        expect(a).not.toBe(b);
        expect(blobRefSessionCacheSizeForTest()).toBeGreaterThanOrEqual(2);
    });

    it('非令牌直接跳过', async () => {
        expect(await loadBlobRefUrl('https://example.com/x.png')).toBeUndefined();
        expect(blobRefSessionCacheSizeForTest()).toBe(0);
    });
});
