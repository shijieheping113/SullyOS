/**
 * blobref 会话级 objectURL 缓存。
 * 同一会话内同令牌只读库一次、共用一份 URL；不在中途 revoke（头像/图标数量有限）。
 * 开机预热走 warmBlobRefUrls，必须在 boot 完成之后、空闲时调用，不得挡住开机动画。
 */
import { blobStore } from './blobStore';

const cache = new Map<string, string>();
const loads = new Map<string, Promise<string | undefined>>();

export function getCachedBlobRefUrl(ref: string): string | undefined {
    return cache.get(ref);
}

export function loadBlobRefUrl(ref: string): Promise<string | undefined> {
    if (!blobStore.isRef(ref)) return Promise.resolve(undefined);
    const hit = cache.get(ref);
    if (hit) return Promise.resolve(hit);
    const pending = loads.get(ref);
    if (pending) return pending;

    const load = blobStore.get(ref).then((blob) => {
        loads.delete(ref);
        if (!blob) return undefined;
        const existing = cache.get(ref);
        if (existing) return existing;
        const url = URL.createObjectURL(blob);
        cache.set(ref, url);
        return url;
    }, () => {
        loads.delete(ref);
        return undefined;
    });
    loads.set(ref, load);
    return load;
}

/** 分批预热；每解几张让出主线程，避免拖死滑动和点击。 */
export async function warmBlobRefUrls(
    refs: Iterable<string | null | undefined>,
    options?: { yieldEvery?: number },
): Promise<void> {
    const yieldEvery = options?.yieldEvery ?? 3;
    const list = [...new Set(
        [...refs].filter((ref): ref is string => typeof ref === 'string' && blobStore.isRef(ref)),
    )];
    for (let index = 0; index < list.length; index++) {
        await loadBlobRefUrl(list[index]);
        if (yieldEvery > 0 && index % yieldEvery === yieldEvery - 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
    }
}

/** 测试用 */
export function clearBlobRefSessionCache(): void {
    for (const url of cache.values()) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    cache.clear();
    loads.clear();
}

export function blobRefSessionCacheSizeForTest(): number {
    return cache.size;
}
