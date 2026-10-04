/** 全屏语音底部麦克风的按住阶段。滑出按钮、或系统先丢一次触摸，都不能把还按着的录音掐掉。 */
export type DockMicPhase = 'idle' | 'pending' | 'recording';

export function dockMicOnDown(phase: DockMicPhase): DockMicPhase {
  if (phase === 'recording') return 'recording';
  return 'pending';
}

/** 手指还按着时，按钮挪动或滑出都会来一次 leave。这一下什么都不改。 */
export function dockMicOnLeave(phase: DockMicPhase): DockMicPhase {
  return phase;
}

export function dockMicOnArm(phase: DockMicPhase): DockMicPhase {
  return phase === 'pending' ? 'recording' : phase;
}

export function dockMicOnUp(phase: DockMicPhase): { phase: 'idle'; action: 'send' | 'open-sheet' | 'none' } {
  if (phase === 'recording') return { phase: 'idle', action: 'send' };
  if (phase === 'pending') return { phase: 'idle', action: 'open-sheet' };
  return { phase: 'idle', action: 'none' };
}

/**
 * 系统取消：长按菜单、按钮被挤开、第一次开麦克风，都会在手指还按着时先来一次。
 * 还没录上的，只作废这一次长按，不要顺手打开键盘。
 * 已经录上的，留下，等真正松手再发送。
 */
export function dockMicOnCancel(phase: DockMicPhase): { phase: DockMicPhase; action: 'drop-pending' | 'none' } {
  if (phase === 'pending') return { phase: 'idle', action: 'drop-pending' };
  return { phase, action: 'none' };
}
