import { useLayoutEffect, type RefObject } from 'react';

/** 聊天底栏：大约 5～6 行，不抢消息区太多。 */
export const CHAT_TEXTAREA_MAX_PX = 160;
/** 电话输入条：大约 4 行，底栏要紧凑。 */
export const CALL_TEXTAREA_MAX_PX = 120;

/**
 * 按内容把 textarea 调到合适高度，封顶 maxPx，超出在框内滚。
 * 用内联 style，不改 className（美化钩子类名不动）。
 * 部分美化会用更高优先级选择器 + !important 锁死 max-height / 外层高度，
 * 普通 inline 盖不过，字就会「高度不变」或溢到框外。
 *
 * 只动 textarea 自身 + composer；不动 `.sully-chat-input-wrap`
 *（有的美化把 wrap 高度写死当造型，强行放开会变丑，留给作者自己调）。
 */
export function fitTextareaHeight(
  el: HTMLTextAreaElement | null | undefined,
  maxPx: number,
): void {
  if (!el) return;
  const cap = Math.max(24, maxPx);
  const wrap = el.closest('.sully-chat-input-wrap') as HTMLElement | null;
  const composer = el.closest('.sully-chat-composer') as HTMLElement | null;
  // 若上一版误给 wrap 写过内联高度，清掉，把造型交回美化
  if (wrap) {
    wrap.style.removeProperty('height');
    wrap.style.removeProperty('min-height');
    wrap.style.removeProperty('max-height');
  }
  // 先放开测量：美化的 max-height:!important 会让 scrollHeight 量不准
  el.style.setProperty('max-height', 'none', 'important');
  el.style.setProperty('height', '0px', 'important');
  const rawScroll = el.scrollHeight;
  const next = Math.min(rawScroll, cap);
  el.style.setProperty('height', `${next}px`, 'important');
  el.style.setProperty('max-height', `${cap}px`, 'important');
  el.style.setProperty('overflow-y', rawScroll > cap ? 'auto' : 'hidden', 'important');
  // 外层 composer 若被锁死，放开一点，避免字画出整条底栏
  if (composer) {
    composer.style.setProperty('height', 'auto', 'important');
    composer.style.setProperty('min-height', '0px', 'important');
    composer.style.setProperty('max-height', 'none', 'important');
  }
}

/** value 变化或挂载时自动长高。 */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx: number,
): void {
  useLayoutEffect(() => {
    fitTextareaHeight(ref.current, maxPx);
  }, [ref, value, maxPx]);
}
