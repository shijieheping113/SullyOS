/** 加密随机整数，范围 [0, span)。不使用 Math.random。 */

export function randomInt(span: number, draw?: () => number): number {
    if (!Number.isInteger(span) || span <= 0) {
        throw new Error('randomInt 需要正整数');
    }
    if (draw) {
        const n = Math.floor(draw() * span);
        if (n >= 0 && n < span) return n;
        throw new Error('randomInt 注入的随机源超出范围');
    }
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
        throw new Error('crypto.getRandomValues 不可用');
    }
    const limit = Math.floor(0x100000000 / span) * span;
    const buf = new Uint32Array(1);
    for (let i = 0; i < 8; i++) {
        cryptoObj.getRandomValues(buf);
        if (buf[0] < limit) return buf[0] % span;
    }
    return buf[0] % span;
}
