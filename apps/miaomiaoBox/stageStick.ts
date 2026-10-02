/** 离开底部超过这么多像素，就当成手在往上翻，立刻停止贴底。 */
export const STICK_RELEASE_PX = 4;

export type StickAction = 'keep' | 'release' | 'resume';

/**
 * gapPx：列表离最底还有多少像素。stuck：现在是否还在追底。
 * 松开之后停在半截要保持松开；只有自己回到最底附近才重新贴上。
 */
export function decideStick(stuck: boolean, gapPx: number): StickAction {
  if (gapPx > STICK_RELEASE_PX) return stuck ? 'release' : 'keep';
  if (!stuck) return 'resume';
  return 'keep';
}

export type FollowBottomMetrics = {
  stuck: boolean;
  touching: boolean;
  scrollTop: number;
  scrollHeight: number;
  /** 上次程序钉住时的 scrollTop。0 表示还没钉过。 */
  seenTop: number;
  /** 上次程序钉住时的 scrollHeight。0 表示还没钉过。 */
  seenHeight: number;
};

/**
 * 要不要把列表再按回最底。
 * 手指按着时不按。高度没变、人已经往上挪开时也不按。
 * 内容变高（出字、图片撑开）时仍要跟着，否则新消息会停在屏幕外面。
 */
export function shouldFollowBottom(m: FollowBottomMetrics): boolean {
  if (!m.stuck || m.touching) return false;
  if (m.seenHeight <= 0) return true;
  const userMovedUp = m.scrollTop < m.seenTop - STICK_RELEASE_PX;
  const heightSame = m.scrollHeight <= m.seenHeight + 1;
  if (userMovedUp && heightSame) return false;
  return true;
}
