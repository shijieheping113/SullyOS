// 电话逐句跟读的时长估算（纯计算，无 DOM / 无 React）。
//
// 为什么不用字数：原来 lineIndex 拿「句子字数占比」当播放进度，可 TTS 的真实时长
// 和字数几乎不成正比——一句「嗯」念完要停顿那么久，一句 20 字的抱怨却连读带过；
// 标点后的停顿、英文单词（1 个词念半秒）也完全没被算进去。于是字幕推进有时候快、
// 有时候慢，老对不上正在念的那句。
//
// 这里改成按「预计念多久」给每句加权：正文按字符估，标点按停顿加时，拉丁词按音节
// 估，最后按用户调过的语速系数整体缩放。仍是估算（真 TTS 不会报时间轴给前端），
// 但比纯字数贴近得多，用户还能手调。
//
// ⚠️ 旧内核友好：不使用后行断言 (?<=...)、不使用 lookbehind、不使用可选链之外的新语法。

/** 停顿加时表（毫秒）。句末停顿最久，逗号类短一些。 */
const PAUSE_MS: { [key: string]: number } = {
  '。': 320, '.': 300, '！': 320, '!': 300,
  '？': 340, '?': 320, '；': 280, ';': 260,
  '，': 170, ',': 160, '、': 120, '：': 160, ':': 150,
  '—': 160, '…': 260, '~': 60, '～': 140,
  '\n': 240,
};

/** 词内停顿：逗号类已在 PAUSE_MS 记过，这里只补词与词之间。 */
const CLAUSE_PAUSE_MS = 90;

/** 单个拉丁字母/音节的大致念法耗时（毫秒）。中文一字约等于一个音节。 */
const LATIN_SYLLABLE_MS = 170;
/** 标点之外可发声字符的基准耗时（毫秒），中文按字、其余按音节。 */
const BASE_CHAR_MS = 185;

/** 估算一个拉丁单词的音节数：按元音簇数，尾静音 e 不算音节。 */
export function countLatinSyllables(word: string): number {
  const w = (word || '').toLowerCase();
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  if (count > 1 && /[^aeiouy]e$/.test(w)) count -= 1;
  return Math.max(1, count);
}

/**
 * 估算一句话念完需要的毫秒数。
 * 数字/字母连成的词按音节估，中文按字估，标点按停顿加时，词间补一点换气。
 */
export function estimateLineMs(line: string): number {
  const text = line || '';
  if (!text.trim()) return 0;
  let ms = 0;
  let pendingLatin = '';
  const flushLatin = () => {
    if (!pendingLatin) return;
    ms += countLatinSyllables(pendingLatin) * LATIN_SYLLABLE_MS;
    pendingLatin = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (/[A-Za-z']/.test(ch)) {
      pendingLatin += ch;
      continue;
    }
    flushLatin();
    if (PAUSE_MS[ch] !== undefined) {
      ms += PAUSE_MS[ch];
      continue;
    }
    if (/\s/.test(ch)) {
      // 空格：只在前后都有内容时算换气，句首缩进不计。
      const prev = text.charAt(i - 1);
      if (prev && !/\s/.test(prev)) ms += CLAUSE_PAUSE_MS;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      ms += 150; // 数字逐位念，比字母慢一点
      continue;
    }
    if (/[぀-ヿ一-鿿가-힯]/.test(ch)) {
      ms += BASE_CHAR_MS; // CJK 一字一音节
      continue;
    }
    ms += 90; // 其他符号（括号、箭头、舞台记号）几乎不念
  }
  flushLatin();
  return Math.max(1, ms);
}

/** 一组句子的预计总时长（毫秒）。 */
export function estimateLinesTotalMs(lines: string[]): number {
  let total = 0;
  for (let i = 0; i < lines.length; i += 1) total += estimateLineMs(lines[i]);
  return total;
}

/**
 * 播放进度 p（0~1）落在第几句。
 * 按每句的「预计时长」累加定位，而不是按字数占比。
 *
 * offset（-0.24 ~ +0.24）是用户的「字幕偏移」：直接加在进度上。
 *   正数 ＝ 字幕往前（跟得更早），负数 ＝ 字幕往后（跟得更晚）。
 * ⚠️ 这里**绝不能**拿 offset 去缩放每句权重再求比值——所有句子一起除以同一个数，
 * 彼此的比例不变，定位结果也完全不变（等于没调）。偏移必须作用在**进度**上。
 */
export function resolveSpeakingLineIndex(lines: string[], p: number, offset = 0): number {
  const n = lines.length;
  if (!n) return -1;
  // 偏移先作用在进度上，再钳到 0~1。
  const shifted = Math.max(0, Math.min(1, p + (Number.isFinite(offset) ? offset : 0)));
  // 进度越界时钳到首/末句，跟原来的行为一致。
  if (!(shifted > 0)) return 0;
  if (shifted >= 1) return n - 1;
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const w = Math.max(1, estimateLineMs(lines[i]));
    weights.push(w);
    total += w;
  }
  if (total <= 0) return n - 1;
  const target = shifted * total;
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += weights[i];
    if (target < acc) return i;
  }
  return n - 1;
}
