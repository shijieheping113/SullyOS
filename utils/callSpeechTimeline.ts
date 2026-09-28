// 电话逐句跟读：把鱼声返回的「逐字时间」对到「显示用的行」。
//
// 背景（实测确认）：鱼声 `with-timestamp` 接口对中文是**逐字**给时间段的
// （"嗯"0–0.4 / "今"1.44–1.6 / "天"1.6–1.84 …），而且**不包含标点**
// （"嗯"结束 0.4，下一个字 1.44，中间 1 秒就是句号和换行的停顿）。
// 所以不能拿「字数占比」去猜了——真数据摆在这里。
//
// 但界面仍然是**按行**滚、按行高亮（用户明确要求，不做逐字高亮）。
// 这个文件只干一件事：**把逐字时间归并成「每行的起始时间」**。
//
// 对不上的情况一律退回调用方的估算（返回 null），不硬凑：
//   · 拿不到时间轴（老音频 / MiniMax / ElevenLabs / 没接时间轴接口）
//   · 字符对不上（模型改写、清洗过台词、标签没剥干净）
//   · 命中率过低（低于一半的行没对上，视为不可信）
//
// ⚠️ 旧内核友好：不使用 lookbehind，不用可选链之外的新语法。

/** 标点（中英文）——鱼声不给它们时间，我们也不参与配对。 */
const PUNCT_RE = /[.,!?;:"'()\[\]{}\-—–_/\\|@#$%^&*+=~`。，、；：？！…‥・《》「」『』（）【】〔〕]/;
/** 表情/舞台记号标签（[excited] / [sighing] / [pause] …）整体跳过。 */
const TAG_RE = /^\[[^\[\]]{1,40}\]$/;

/** 这一个字符要不要参与「字↔时间」配对。 */
const isMatchableChar = (ch: string): boolean => {
  if (!ch) return false;
  if (/\s/.test(ch)) return false;      // 空格 / 换行 / 全角空格
  if (PUNCT_RE.test(ch)) return false;  // 标点
  return true;
};

/**
 * 把显示用的行拆成「参与配对的字符流」：逐行扫描，剥掉 [xxx] 标签、空格和标点，
 * 其余字符按顺序排成一条流，并记住每个字符属于第几行。
 * 这是「鱼声给的字」和「界面显示的字」之间唯一的对齐依据。
 */
export function buildMatchableStream(lines: string[]): { chars: string[]; lineOf: number[] } {
  const chars: string[] = [];
  const lineOf: number[] = [];
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li] || '';
    // 先整块剥掉 [xxx] 标签（鱼声会把 cue 演绎掉但不一定回时间，所以不参与配对）。
    const withoutTags = line.replace(/\[[^\[\]]{1,40}\]/g, '');
    for (const ch of withoutTags) {
      if (!isMatchableChar(ch)) continue;
      chars.push(ch);
      lineOf.push(li);
    }
  }
  return { chars, lineOf };
}

export type SpeechTimelineSegment = { text: string; start: number; end: number };
export type SpeechTimeline = { segments: SpeechTimelineSegment[]; durationSec?: number };

/** 每行起始时间；对不上的行是 null。整体不可信时返回 null（调用方退回估算）。 */
export type LineTimings = (number | null)[];

/**
 * 把逐字时间归并成每行起始时间：**每行的开始时间 = 这一行第一个对上的字的 start**。
 *
 * 匹配规则：字符流与 segments 顺序对读；相等就记下行起始时间，不等就跳过这一个字继续
 * （容忍模型加的 [cue]、清洗差异等）。全部走完仍一行没对上 → null。
 */
export function buildLineTimings(lines: string[], timeline?: SpeechTimeline | null): LineTimings | null {
  if (!lines.length) return null;
  const segs = timeline?.segments;
  if (!segs || !segs.length) return null;

  const { chars, lineOf } = buildMatchableStream(lines);
  if (!chars.length) return null;

  const starts: LineTimings = new Array(lines.length).fill(null);
  let ci = 0; // 字符流游标
  for (const seg of segs || []) {
    const text = (seg && typeof seg.text === 'string') ? seg.text : '';
    if (!text) continue;
    const start = typeof seg.start === 'number' ? seg.start : NaN;
    for (const ch of text) {
      // 逐字符推进：鱼声中文逐字、英文可能整词，都按字符走游标。
      if (ci >= chars.length) break;
      if (chars[ci] === ch) {
        const li = lineOf[ci];
        if (starts[li] === null && Number.isFinite(start)) starts[li] = start;
        ci += 1;
      }
      // 不相等：不推进游标（下一段再试），容忍中间多出的标签/符号。
    }
  }

  const hit = starts.filter((s) => s !== null).length;
  if (hit === 0) return null;
  // 命中率过低 → 视为对不上，退回估算（宁可猜，也别用错的时间轴）。
  if (hit * 2 < lines.length) return null;
  return starts;
}

/**
 * 播放到 currentSec（秒）时该高亮哪一行。
 * 规则：取「最后一个起始时间 ≤ 当前时间」的行；对不上的行自动跳过。
 * 当前时间早于第一行 → 第一行。
 */
export function resolveLineIndexByTimeline(timings: LineTimings | null, currentSec: number): number {
  if (!timings || !timings.length) return -1;
  if (!Number.isFinite(currentSec)) return -1;
  let active = -1;
  for (let i = 0; i < timings.length; i += 1) {
    const t = timings[i];
    if (t === null || !Number.isFinite(t as number)) continue;
    if (currentSec >= (t as number)) active = i;
    else break;   // 起始时间单调递增，后面的只会更晚
  }
  return active < 0 ? 0 : active;
}
