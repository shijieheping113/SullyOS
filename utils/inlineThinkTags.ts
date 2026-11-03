/**
 * 正文里的 `<think>` / `<thinking>` / `<thought>` 剥取。
 *
 * 规则（最外层）：
 * - 找到一处开标签后，若后面没有同名的第二个开标签 → 配到**最后一个**同名闭标签
 *   （正文里复述 `</thinking>` 不会提前截断）
 * - 若后面还有同名开标签 → 配到**第一个**闭标签，再继续扫剩余（两段真实块不糊成一块）
 * - 只有开、没有闭 → 开标签后整段当思考
 */

export type PeeledInlineThink = {
  /** 各块思考正文，非空块用 \n\n 拼接 */
  thinking: string;
  /** 去掉思考块后的可见正文 */
  cleaned: string;
};

const OPEN_RE = /<(think|thinking|thought)\b[^>]*>/gi;

const closeReFor = (tag: string): RegExp => new RegExp(`</${tag}\\s*>`, 'gi');

const furtherOpenReFor = (tag: string): RegExp => new RegExp(`<${tag}\\b[^>]*>`, 'gi');

export function peelInlineThinkTags(text: string): PeeledInlineThink {
  if (!text) return { thinking: '', cleaned: '' };

  const blocks: string[] = [];
  let cleaned = '';
  let rest = text;

  while (rest.length) {
    OPEN_RE.lastIndex = 0;
    const open = OPEN_RE.exec(rest);
    if (!open || open.index === undefined) {
      cleaned += rest;
      break;
    }

    const tag = open[1];
    const before = rest.slice(0, open.index);
    const afterOpen = rest.slice(open.index + open[0].length);
    const closes = [...afterOpen.matchAll(closeReFor(tag))];

    if (closes.length === 0) {
      cleaned += before;
      const body = afterOpen.trim();
      if (body) blocks.push(body);
      break;
    }

    const furtherOpens = [...afterOpen.matchAll(furtherOpenReFor(tag))];
    const closeMatch = furtherOpens.length === 0 ? closes[closes.length - 1]! : closes[0]!;
    const body = afterOpen.slice(0, closeMatch.index!).trim();
    if (body) blocks.push(body);
    cleaned += before;
    rest = afterOpen.slice(closeMatch.index! + closeMatch[0].length);
  }

  return { thinking: blocks.join('\n\n'), cleaned };
}

export function stripInlineThinkTags(text: string): string {
  return peelInlineThinkTags(text).cleaned;
}

export function extractInlineThinkTags(text: string): string {
  return peelInlineThinkTags(text).thinking;
}
