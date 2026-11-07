import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSLATE_GRACE_MS,
  TRANSLATE_KEEP_WINDOW,
  registerTranslateHolder,
  resetTranslateSession,
  setTranslateSessionClock,
  setTranslateWindow,
  translateHolderCount,
} from './translateSession';

/** 造一个登记项，clear 用 spy 记下有没有被清。 */
function holder(messageId: number) {
  const clear = vi.fn();
  const unregister = registerTranslateHolder({ messageId, clear });
  return { clear, unregister };
}

const ids = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

describe('translateSession', () => {
  beforeEach(() => {
    resetTranslateSession();
  });

  it('窗口内（正好 30 条）不动手', () => {
    setTranslateWindow(ids(30));
    const first = holder(1);
    expect(setTranslateWindow(ids(30))).toBe(0);
    expect(first.clear).not.toHaveBeenCalled();
    expect(translateHolderCount()).toBe(1);
  });

  it('第 31 条一来，最老那条就被清', () => {
    setTranslateWindow(ids(30));
    const first = holder(1);
    const second = holder(2);
    expect(setTranslateWindow(ids(31))).toBe(1);
    expect(first.clear).toHaveBeenCalledTimes(1);
    expect(second.clear).not.toHaveBeenCalled();
    expect(translateHolderCount()).toBe(1);
  });

  it('窗口里翻的滑出窗口就走，没有宽限', () => {
    let clock = 1_000;
    setTranslateSessionClock(() => clock);
    setTranslateWindow(ids(30));
    const fresh = holder(1);
    clock += 1;
    expect(setTranslateWindow(ids(31))).toBe(1);
    expect(fresh.clear).toHaveBeenCalledTimes(1);
  });

  it('翻旧账（登记时已在窗口外）有宽限，宽限内不动', () => {
    let clock = 1_000;
    setTranslateSessionClock(() => clock);
    setTranslateWindow(ids(80));
    // 第 3 条本来就远在窗口外，属于「往上翻旧消息再点译」。
    const old = holder(3);
    expect(setTranslateWindow(ids(80))).toBe(0);
    expect(old.clear).not.toHaveBeenCalled();
  });

  it('宽限过了照常清', () => {
    let clock = 1_000;
    setTranslateSessionClock(() => clock);
    setTranslateWindow(ids(80));
    const old = holder(3);
    clock += TRANSLATE_GRACE_MS;
    expect(setTranslateWindow(ids(80))).toBe(1);
    expect(old.clear).toHaveBeenCalledTimes(1);
  });

  it('已经不在列表里的（删了 / 换角色）立刻丢掉', () => {
    setTranslateWindow([1, 2, 3]);
    const gone = holder(999);
    setTranslateWindow([1, 2, 3]);
    expect(gone.clear).toHaveBeenCalledTimes(1);
  });

  it('还没发布过窗口时清空列表也不动手', () => {
    const fresh = holder(1);
    expect(setTranslateWindow([])).toBe(0);
    expect(fresh.clear).not.toHaveBeenCalled();
  });

  it('注销之后不再被清', () => {
    setTranslateWindow(ids(30));
    const first = holder(1);
    first.unregister();
    setTranslateWindow(ids(40));
    expect(first.clear).not.toHaveBeenCalled();
    expect(translateHolderCount()).toBe(0);
  });

  it('重启后窗口重新算，旧窗口不残留', () => {
    setTranslateWindow(ids(40));
    resetTranslateSession();
    // 清空后新登记的一律不判出窗口，不会被上一条长列表误伤。
    const fresh = holder(1);
    expect(setTranslateWindow([1])).toBe(0);
    expect(fresh.clear).not.toHaveBeenCalled();
  });

  it('窗口是 30、宽限是两分钟', () => {
    expect(TRANSLATE_KEEP_WINDOW).toBe(30);
    expect(TRANSLATE_GRACE_MS).toBe(120_000);
  });
});
