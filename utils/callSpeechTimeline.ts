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
 * 送 TTS 前会被删掉的全角括号内容（舞台指示）。这条规则**和音频那边是同一条**：
 * 上限 80，`utils/fishAudioTts.ts` 的 `（[^）]{0,80}）`、ElevenLabs 也是 80
 * （MiniMax 那边是 48，但 MiniMax 没有时间轴，两边不会碰面）。
 * ⚠️ 两边的数字必须一致（有测试钉着）：音频删了、字表还留着 → 字表比音频多字 → 游标卡住 → 整段退回估算。
 * 只在调用方传了清洗函数时才用；不传 = 完全保持从前的行为。
 */
const SPEECH_PAREN_RE = /（[^）]{0,80}）/g;

/**
 * 把显示用的行拆成「参与配对的字符流」：逐行扫描，剥掉 [xxx] 标签、空格和标点，
 * 其余字符按顺序排成一条流，并记住每个字符属于第几行。
 * 这是「鱼声给的字」和「界面显示的字」之间唯一的对齐依据。
 *
 * 传了 `cleanLine`（送 TTS 前那套清洗，由调用方按当前服务商给）时：
 *   · **逐行**先清洗一遍 —— 逐行不会改变行数，每个字属于第几行照旧；
 *   · 再把**跨行**的全角括号也剔掉 —— 音频那边是拿**整条文本**清洗的，括号能跨行删
 *     （切句只看标点，不管括号闭没闭，「（丸まって。受話器を持つ）」会被切成两行各剩半括号），
 *     只按行删就漏；一漏，字表就比音频多字，游标卡住 → 整段退回估算。
 * 显示不受影响：屏幕上照样显示括号原样（这里只管「对号用的字表」）。
 */
export function buildMatchableStream(
  lines: string[],
  cleanLine?: (text: string) => string,
): { chars: string[]; lineOf: number[] } {
  const cleaned = lines.map(line => {
    const raw = line || '';
    // 先整块剥掉 [xxx] 标签（鱼声会把 cue 演绎掉但不一定回时间，所以不参与配对）。
    return (cleanLine ? cleanLine(raw) : raw).replace(/\[[^\[\]]{1,40}\]/g, '');
  });

  const chars: string[] = [];
  const lineOf: number[] = [];
  if (!cleanLine) {
    for (let li = 0; li < cleaned.length; li += 1) {
      for (const ch of cleaned[li]) {
        if (!isMatchableChar(ch)) continue;
        chars.push(ch);
        lineOf.push(li);
      }
    }
    return { chars, lineOf };
  }

  // 接回一整条（行间补一个换行，作用只是让括号规则能跨行匹配；换行本身不参与配对）。
  const joinedChars: string[] = [];
  const joinedLine: number[] = [];
  for (let li = 0; li < cleaned.length; li += 1) {
    if (li > 0) { joinedChars.push('\n'); joinedLine.push(li); }
    for (const ch of cleaned[li]) { joinedChars.push(ch); joinedLine.push(li); }
  }
  const joined = joinedChars.join('');
  const doomed = new Array<boolean>(joined.length).fill(false);
  SPEECH_PAREN_RE.lastIndex = 0;
  let m = SPEECH_PAREN_RE.exec(joined);
  while (m) {
    for (let i = m.index; i < m.index + m[0].length; i += 1) doomed[i] = true;
    if (m.index === SPEECH_PAREN_RE.lastIndex) SPEECH_PAREN_RE.lastIndex += 1; // 防零宽死循环
    m = SPEECH_PAREN_RE.exec(joined);
  }
  for (let i = 0; i < joined.length; i += 1) {
    if (doomed[i]) continue;
    const ch = joined[i];
    if (!isMatchableChar(ch)) continue;
    chars.push(ch);
    lineOf.push(joinedLine[i]);
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
export function buildLineTimings(
  lines: string[],
  timeline?: SpeechTimeline | null,
  cleanLine?: (text: string) => string,
): LineTimings | null {
  if (!lines.length) return null;
  const segs = timeline?.segments;
  if (!segs || !segs.length) return null;

  const { chars, lineOf } = buildMatchableStream(lines, cleanLine);
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
 * 双语「摊行」：把**原文**的行号摊到**字幕**的行号上。
 *
 * 场景：声音念的是日语 3 句，屏幕上的中文字幕 10 句（一句译文摊成了好几句）。
 * 以前两边句数不同就整个放弃真时间轴、拿中文字数硬猜 → 字幕整段偏慢、越到后面越对不上。
 * 现在把原文第 index 句摊到它管的字幕区间 [index*M/N, (index+1)*M/N) 上，
 * ratio（这一句念到几成，0~1）在区间里插值——字幕跟着声音连续往前走，不会一句卡死再猛跳。
 *
 * 句数相同直接原样返回：单语、以及两边句数一致的路径一个字不变。
 */
export function mapLineAcross(index: number, fromCount: number, toCount: number, ratio: number): number {
  if (!Number.isFinite(index) || fromCount <= 0 || toCount <= 0) return 0;
  const from = Math.floor(fromCount);
  const to = Math.floor(toCount);
  if (from === to) return Math.max(0, Math.min(to - 1, Math.floor(index)));
  const start = (index * to) / from;
  const span = to / from;
  const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 1;
  return Math.max(0, Math.min(to - 1, Math.floor(start + span * r)));
}

/**
 * 原文这一句念到几成了（0~1）。终点取「下一句的起始时间」；
 * 最后一句没有下一句，就用整段总时长；都没有就按「念完了」算。
 */
export function lineProgressAt(
  timings: LineTimings | null,
  index: number,
  currentSec: number,
  durationSec?: number,
): number {
  if (!timings || index < 0 || index >= timings.length) return 1;
  if (!Number.isFinite(currentSec)) return 0;
  const start = timings[index];
  if (start === null || !Number.isFinite(start as number)) return 1;
  let end: number | null = null;
  for (let i = index + 1; i < timings.length; i += 1) {
    const t = timings[i];
    if (t !== null && Number.isFinite(t as number)) { end = t as number; break; }
  }
  if (end === null && durationSec !== undefined && Number.isFinite(durationSec) && durationSec > (start as number)) {
    end = durationSec;
  }
  if (end === null || end <= (start as number)) return 1;
  return Math.max(0, Math.min(1, (currentSec - (start as number)) / (end - (start as number))));
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
