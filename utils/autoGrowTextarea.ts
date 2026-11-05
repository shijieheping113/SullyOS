
import { useLayoutEffect, useState, type RefObject } from 'react';

/** 聊天底栏：大约 5～6 行，不抢消息区太多。 */
export const CHAT_TEXTAREA_MAX_PX = 160;
/** 电话输入条：大约 4 行，底栏要紧凑。 */
export const CALL_TEXTAREA_MAX_PX = 120;

export type FitTextareaResult = {
  /** 内容明显高于单行：底栏图标应贴底（items-end），否则与文字共水平中线（items-center）。 */
  isMulti: boolean;
};

/**
 * 按内容把 textarea 调到合适高度，封顶 maxPx，超出在框内滚。
 * 用内联 style，不改 className（美化钩子类名不动）。
 * 部分美化会用更高优先级选择器 + !important 锁死 max-height / 外层高度，
 * 普通 inline 盖不过，字就会「高度不变」或溢到框外。
 *
 * 只动 textarea 自身 + composer；不动 `.sully-chat-input-wrap` 的高度
 *（有的美化把 wrap 高度写死当造型，强行放开会变丑，留给作者自己调）。
 *
 * 单行时用对称 padding 把字光学居中（textarea 天生顶对齐），多行清掉以免抢排版。
 * 美化若用更高优先级锁死 padding，则以美化为准。
 */
export function fitTextareaHeight(
  el: HTMLTextAreaElement | null | undefined,
  maxPx: number,
): FitTextareaResult {
  if (!el) return { isMulti: false };
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
  el.style.removeProperty('padding-top');
  el.style.removeProperty('padding-bottom');
  el.style.setProperty('max-height', 'none', 'important');
  el.style.setProperty('height', '0px', 'important');
  const rawScroll = el.scrollHeight;
  const next = Math.min(rawScroll, cap);
  const lhRaw = parseFloat(getComputedStyle(el).lineHeight);
  const line = Number.isFinite(lhRaw) && lhRaw > 0 ? lhRaw : 21;
  const isMulti = rawScroll > line * 1.55 || /\n/.test(el.value || '');

  el.style.setProperty('height', `${next}px`, 'important');
  el.style.setProperty('max-height', `${cap}px`, 'important');
  el.style.setProperty('overflow-y', rawScroll > cap ? 'auto' : 'hidden', 'important');

  // 单行且框比行高：border-box 内对称垫高，让「Message...」和图标共水平中线
  if (!isMulti && next > line + 0.5) {
    const vPad = Math.max(0, (next - line) / 2);
    el.style.setProperty('padding-top', `${vPad}px`, 'important');
    el.style.setProperty('padding-bottom', `${vPad}px`, 'important');
  } else {
    el.style.removeProperty('padding-top');
    el.style.removeProperty('padding-bottom');
  }

  // 外层 composer 若被锁死，放开一点，避免字画出整条底栏
  if (composer) {
    composer.style.setProperty('height', 'auto', 'important');
    composer.style.setProperty('min-height', '0px', 'important');
    composer.style.setProperty('max-height', 'none', 'important');
  }

  return { isMulti };
}

/** value 变化或挂载时自动长高；返回是否多行（供底栏 items-end / items-center）。 */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx: number,
): boolean {
  const [isMulti, setIsMulti] = useState(false);
  useLayoutEffect(() => {
    const result = fitTextareaHeight(ref.current, maxPx);
    setIsMulti(result.isMulti);
  }, [ref, value, maxPx]);
  return isMulti;
}
