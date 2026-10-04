import { describe, expect, it } from 'vitest';
import { dockMicOnArm, dockMicOnCancel, dockMicOnDown, dockMicOnLeave, dockMicOnUp } from './dockMicHold';

describe('全屏语音按住录音', () => {
  it('手指还按着时滑出按钮，不会取消长按计时', () => {
    const pending = dockMicOnDown('idle');
    expect(dockMicOnLeave(pending)).toBe('pending');
    expect(dockMicOnArm(dockMicOnLeave(pending))).toBe('recording');
  });

  it('系统把触摸判成取消时，已经开始的录音不丢', () => {
    const recording = dockMicOnArm(dockMicOnDown('idle'));
    expect(dockMicOnCancel(recording)).toEqual({ phase: 'recording', action: 'none' });
    expect(dockMicOnUp('recording').action).toBe('send');
  });

  it('还没到点就被系统取消，不会当成松手去打开发言框', () => {
    expect(dockMicOnCancel('pending')).toEqual({ phase: 'idle', action: 'drop-pending' });
    expect(dockMicOnUp('idle').action).toBe('none');
  });

  it('短按松手打开发言，长按松手发送', () => {
    expect(dockMicOnUp('pending')).toEqual({ phase: 'idle', action: 'open-sheet' });
    expect(dockMicOnUp('recording')).toEqual({ phase: 'idle', action: 'send' });
  });

  it('录音还在时再按一下，不会把这一次当成新的短按', () => {
    expect(dockMicOnDown('recording')).toBe('recording');
  });
});
