// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindLockScreenMedia, LOCK_NOTICE_PREVIEW_LIMIT } from '../components/lockscreen/lockScreenMedia';
import type { LockNotice } from '../components/lockscreen/lockScreenMedia';
import markup from '../components/lockscreen/lockScreen.html?raw';

const cleanups: (() => void)[] = [];
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  vi.restoreAllMocks(); vi.useRealTimers();
});

function setup(options: { reduced?: boolean; animate?: boolean } = {}) {
  vi.useFakeTimers();
  let hidden = false, rest = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => hidden ? 'hidden' : 'visible');
  const root = document.createElement('div');
  root.innerHTML = markup;
  document.body.appendChild(root);
  cleanups.push(() => root.remove());
  const entries: { key: string | undefined; frames: Keyframe[]; timing: KeyframeAnimationOptions }[] = [];
  if (options.animate !== false) Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: vi.fn(function(this: HTMLElement, frames: Keyframe[] | PropertyIndexedKeyframes | null, timing?: number | KeyframeAnimationOptions) {
    if (this.id === 'notice') entries.push({ key: this.dataset.noticeKey, frames: frames as Keyframe[], timing: timing as KeyframeAnimationOptions });
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation;
  }) });
  const open = vi.fn();
  const media = bindLockScreenMedia(root, { atRest: () => rest, reducedMotion: () => !!options.reduced, openNotice: open, updateMusicRing() {} });
  cleanups.push(() => { media.dispose(); root.remove(); });
  return {
    root, media, entries, open,
    notice: root.querySelector<HTMLButtonElement>('#notice')!,
    text: () => root.querySelector('#noticeText')!.textContent,
    stack: root.querySelector<HTMLElement>('#noticeStack')!,
    rest: (value: boolean) => { rest = value; },
    hidden: (value: boolean) => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

const row = (id: number, extra: Partial<LockNotice> = {}): LockNotice => ({
  key: 'a:' + id, charId: 'a', name: '猫儿', text: '消息' + id, avatar: '', timestamp: id * 1000, count: 3, ...extra,
});

describe('lock notice arrival sequence', () => {
  it('lands messages in order, grows the stack, and leaves the full unread count accurate throughout', () => {
    const s = setup();
    s.media.setNotices([row(1), row(2), row(3)], 3);
    expect(s.text()).toBe('消息1');
    expect(s.stack.hidden).toBe(true);
    expect(s.root.querySelector('#noticeCount')!.textContent).toBe('3 条未读');
    vi.advanceTimersByTime(999);
    expect(s.text()).toBe('消息1');
    vi.advanceTimersByTime(1);
    expect(s.text()).toBe('消息2');
    expect(s.stack.dataset.layers).toBe('1');
    const departing = s.root.querySelector<HTMLElement>('[data-notice-departing]')!;
    expect(departing.getAttribute('aria-hidden')).toBe('true');
    expect(departing.hasAttribute('inert')).toBe(true);
    expect(departing.querySelector('[id]')).toBeNull();
    expect(s.root.querySelectorAll('#notice')).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(s.text()).toBe('消息2');
    vi.advanceTimersByTime(1);
    expect(s.text()).toBe('消息3');
    expect(s.stack.dataset.layers).toBe('2');
    expect(s.entries.map(entry => entry.key)).toEqual(['a:1', 'a:2', 'a:3']);
    expect(s.entries.every(entry => entry.timing.duration === 580)).toBe(true);
    expect(s.entries.every(entry => entry.timing.easing === 'cubic-bezier(.32,.72,0,1)')).toBe(true);
    expect(s.entries[0].frames[0].transform).toBe('translateY(20px) scale(0.96)');
    expect(s.entries[0].frames[1].transform).toBe('translateY(-1.5px) scale(1)');
    expect(s.root.querySelectorAll('[data-notice-departing]')).toHaveLength(1);
    vi.runOnlyPendingTimers();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a handoff for messages arriving mid-animation and never replays on avatar or count updates', () => {
    const s = setup();
    s.media.setNotices([row(1)], 1);
    vi.advanceTimersByTime(60);
    s.media.setNotices([row(1), row(2)], 2);
    s.media.setNotices([row(1, { avatar: '/cat.png' }), row(2)], 2);
    expect(s.text()).toBe('消息1');
    expect(s.entries).toHaveLength(1);
    vi.advanceTimersByTime(939);
    expect(s.text()).toBe('消息1');
    vi.advanceTimersByTime(1);
    expect(s.text()).toBe('消息2');
    s.media.setNotices([row(1), row(2, { avatar: '/cat.png' })], 2);
    vi.runAllTimers();
    expect(s.entries.map(entry => entry.key)).toEqual(['a:1', 'a:2']);
  });

  it('preserves the visible target while dragging and resumes without waiting or replaying the first card', () => {
    const s = setup();
    s.media.setNotices([row(1), row(2, { charId: 'b' })], 2);
    s.notice.click();
    expect(s.open).toHaveBeenCalledWith('a');
    s.rest(false); s.media.setMoving(true);
    vi.advanceTimersByTime(2000);
    expect(s.text()).toBe('消息1');
    expect(s.media.noticeTarget()).toBe('a');
    expect(vi.getTimerCount()).toBe(0);
    s.rest(true); s.media.setMoving(false);
    expect(s.text()).toBe('消息2');
    s.notice.click();
    expect(s.open).toHaveBeenLastCalledWith('b');
    expect(s.entries.map(entry => entry.key)).toEqual(['a:1', 'a:2']);
  });

  it('pauses in background and cancels all remaining arrivals on disposal', () => {
    const s = setup();
    s.media.setNotices([row(1), row(2), row(3)], 3);
    s.hidden(true); vi.advanceTimersByTime(3000);
    expect(s.text()).toBe('消息1');
    expect(vi.getTimerCount()).toBe(0);
    s.hidden(false);
    expect(s.text()).toBe('消息2');
    s.media.dispose();
    expect(s.root.querySelector('[data-notice-departing]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    s.hidden(true); s.hidden(false); vi.advanceTimersByTime(3000);
    expect(s.text()).toBe('消息2');
    expect(s.entries).toHaveLength(2);
  });

  it('prunes removed messages from the queue and clearing unread prevents later arrivals', () => {
    const s = setup();
    s.media.setNotices([row(1), row(2), row(3)], 3);
    s.media.setNotices([row(1), row(3)], 2);
    vi.advanceTimersByTime(1000);
    expect(s.text()).toBe('消息3');
    s.media.setNotice(null);
    expect(s.notice.tabIndex).toBe(-1);
    expect(s.stack.hidden).toBe(true);
    s.hidden(true); s.hidden(false);
    expect(s.notice.hidden).toBe(true);
    vi.runAllTimers();
    expect(s.entries.filter(entry => entry.key === 'a:2')).toHaveLength(0);
  });

  it('shows the latest immediately with opacity only for reduced motion', () => {
    const s = setup({ reduced: true });
    s.media.setNotices([row(1), row(2), row(3)], 3);
    expect(s.text()).toBe('消息3');
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].timing.duration).toBe(140);
    expect(s.entries[0].frames.every(frame => !frame.transform)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(s.root.querySelector('[data-notice-departing]')).toBeNull();
  });

  it('falls back to the latest static card without WAAPI and bounds a large backlog', () => {
    const fallback = setup({ animate: false });
    fallback.media.setNotices([row(1), row(2)], 2);
    expect(fallback.text()).toBe('消息2');
    expect(vi.getTimerCount()).toBe(0);
    fallback.media.dispose();
    const s = setup();
    s.media.setNotices(Array.from({ length: 30 }, (_, i) => row(i + 1)), 30);
    expect(s.text()).toBe('消息' + (31 - LOCK_NOTICE_PREVIEW_LIMIT));
    for (let id = 24; id <= 30; id += 1) {
      vi.advanceTimersByTime(999);
      expect(s.text()).toBe('消息' + (id - 1));
      vi.advanceTimersByTime(1);
      expect(s.text()).toBe('消息' + id);
    }
    vi.runAllTimers();
    expect(s.text()).toBe('消息30');
    expect(s.entries).toHaveLength(LOCK_NOTICE_PREVIEW_LIMIT);
    expect(s.root.querySelector('#noticeCount')!.textContent).toBe('30 条未读');
  });
});
