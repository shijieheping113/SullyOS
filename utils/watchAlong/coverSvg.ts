/**
 * 模型交来的小封面，显示前洗一遍。
 *
 * 只留基本形状。事件、外链、script、文字都拿掉。
 * 洗完不像一张封面，或者太长，就当这间房没有封面，界面继续用渐变。
 */

const ALLOWED = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']);

/** 洗完还比这长，就丢掉整张 */
const MAX_LEN = 2500;
/** 形状太多也丢掉，刷新不用扛一张大图 */
const MAX_TAGS = 40;
/** 原文长到这还没洗，直接不当封面，免得正则被撑住 */
const MAX_RAW = 8000;

const DANGER =
  'script|image|foreignObject|use|text|tspan|textPath|style|iframe|object|embed|a|animate|animateTransform|animateMotion|set|mpath|title|desc|metadata|handler';

const escAttr = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 属性里只留画图要用的。事件、外链、style 里的 url( 都不留 */
function washAttrs(raw: string): string {
  const attrRe = /([:@a-zA-Z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw))) {
    const key = m[1];
    const val = m[3] ?? m[4] ?? m[5] ?? '';
    if (/^on/i.test(key)) continue;
    if (/href/i.test(key)) continue;
    if (/^(src|formaction)$/i.test(key)) continue;
    if (/javascript\s*:/i.test(val)) continue;
    if (/url\s*\(/i.test(val)) continue;
    if (/^\s*(https?:|\/\/|data:)/i.test(val)) continue;
    if (/^xmlns$/i.test(key)) {
      if (val === 'http://www.w3.org/2000/svg') out += ' xmlns="http://www.w3.org/2000/svg"';
      continue;
    }
    if (/^xmlns:/i.test(key)) continue;
    out += ` ${key}="${escAttr(val)}"`;
  }
  return out;
}

/**
 * 洗成能直接铺上去的 SVG。空字符串就是没有封面。
 * 同一段再洗一次还是同一张，不靠随机。
 */
export function washCoverSvg(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s || s.length > MAX_RAW) return '';
  s = s.replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```$/, '').trim();
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  s = s.replace(/<\?[\s\S]*?\?>/g, '');
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  const paired = new RegExp(`<\\s*(${DANGER})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, 'gi');
  for (let i = 0; i < 4; i++) {
    const next = s.replace(paired, '');
    if (next === s) break;
    s = next;
  }
  s = s.replace(new RegExp(`<\\s*(?:${DANGER})\\b[^>]*\\/?>`, 'gi'), '');

  const tagRe = /<\/?\s*([a-zA-Z][\w:-]*)\b([^>]*)\/?>|([^<]+)/g;
  const out: string[] = [];
  let count = 0;
  let sawShape = false;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    if (m[3]) continue;
    const name = m[1].toLowerCase();
    if (!ALLOWED.has(name)) continue;
    const isClose = m[0].startsWith('</');
    if (isClose) {
      out.push(`</${name}>`);
      continue;
    }
    count += 1;
    if (count > MAX_TAGS) return '';
    if (name !== 'svg' && name !== 'g') sawShape = true;
    let attrs = washAttrs((m[2] || '').replace(/\/\s*$/, ''));
    const self = /\/\s*>?\s*$/.test(m[2] || '') || /\/>\s*$/.test(m[0]);
    if (name === 'svg') {
      if (!/viewBox=/i.test(attrs)) attrs += ' viewBox="0 0 160 90"';
      if (!/preserveAspectRatio=/i.test(attrs)) attrs += ' preserveAspectRatio="xMidYMid slice"';
      out.push(`<svg${attrs}>`);
      continue;
    }
    out.push(`<${name}${attrs}${self ? ' />' : '>'}`);
  }

  if (!out.length || !out[0].startsWith('<svg')) return '';
  if (!sawShape) return '';
  const result = out.join('');
  if (result.length > MAX_LEN || result.length < 12) return '';
  return result;
}
