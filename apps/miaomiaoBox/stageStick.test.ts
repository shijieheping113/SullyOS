import { describe, expect, it } from 'vitest';
import { decideStick, shouldFollowBottom } from './stageStick';

describe('喵喵盒贴底', () => {
  it('还在最底时继续贴着', () => {
    expect(decideStick(true, 0)).toBe('keep');
    expect(decideStick(true, 4)).toBe('keep');
  });

  it('往上离开一点点就松开，不再被拽回底部', () => {
    expect(decideStick(true, 5)).toBe('release');
    expect(decideStick(true, 40)).toBe('release');
    expect(decideStick(true, 119)).toBe('release');
  });

  it('已经松开时，停在半截保持松开', () => {
    expect(decideStick(false, 40)).toBe('keep');
    expect(decideStick(false, 5)).toBe('keep');
  });

  it('自己滑回最底才重新贴上', () => {
    expect(decideStick(false, 4)).toBe('resume');
    expect(decideStick(false, 0)).toBe('resume');
  });
});

describe('喵喵盒追底会不会把人拽回去', () => {
  const pinned = { stuck: true, touching: false, scrollTop: 800, scrollHeight: 1200, seenTop: 800, seenHeight: 1200 };

  it('还钉在上次的最底，继续跟', () => {
    expect(shouldFollowBottom(pinned)).toBe(true);
  });

  it('手指按着时不跟', () => {
    expect(shouldFollowBottom({ ...pinned, touching: true, scrollTop: 760 })).toBe(false);
  });

  it('轻轻往上滑、内容高度没变，不跟', () => {
    expect(shouldFollowBottom({ ...pinned, scrollTop: 760 })).toBe(false);
    expect(shouldFollowBottom({ ...pinned, scrollTop: 795 })).toBe(false);
  });

  it('出字或图片把内容撑高，还贴着底就继续跟', () => {
    expect(shouldFollowBottom({ ...pinned, scrollHeight: 1400 })).toBe(true);
  });

  it('还没钉过位置时先跟一次', () => {
    expect(shouldFollowBottom({ ...pinned, seenTop: 0, seenHeight: 0, scrollTop: 0 })).toBe(true);
  });

  it('已经松开就不再跟', () => {
    expect(shouldFollowBottom({ ...pinned, stuck: false, scrollTop: 400 })).toBe(false);
  });
});
