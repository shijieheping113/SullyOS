// 双语通话的切句：把一段台词切成屏幕上一行行（原文一份、字幕一份）。
// 从 components/call/VoicePhoneB.tsx 原样搬出来的（纯计算，无 DOM，方便上测试）。
//
// 规则：
//   · 断句符号 ＝ 。！？!? 和省略号 …（**分号不算**——它不是句末）
//   · 连着写的一串符号（……。 ／ ！？ ／ 。……）算一处，只在最后一个符号后面切
//   · 只有符号、没有实字的碎片**不单独占一行、也不丢**：攒着挂到**下一句前面**一起显示。
//     「首字就是标点」（上来一个「！」「……」）＝切句不管它、显示照原句连在一起，免得屏幕上多一行空白；
//     落单在结尾的纯符号则贴回上一句。**只影响切句，不影响显示内容。**
//   · [breathy] / [sighing] 这类演出标记**不算字**：一小截只有「标记 + 标点」时，
//     同样挂到下一句（否则界面上就孤零零剩一个「……」）。
// 单语 / 视频仍走 CallApp 那套老切法，与这里无关。
//
// ⚠️⚠️ 中文圆括号的上限必须是 **80**，和下面两个地方**同一个数**：
//     · 送 TTS 前的清洗：utils/fishAudioTts.ts 的 `（[^）]{0,80}）`
//     · 电话对号用的字表：utils/callSpeechTimeline.ts 的 SPEECH_PAREN_RE
//   三个数一旦不一样，原文和字幕就会被切成**不同行数**，两边整体错开一行
//   —— 表现就是字幕一直早一点 / 晚一点，怎么调都对不上。
//   （2026-09-30 Ann 报的「字幕快了一点」就是这个：那句舞台指示 57 字，这里当时写死 40 没被删掉，
//    原文切成 6 行、中文字幕切成 5 行 ⇒ 摊行时整体错开一行。有测试钉住。）
//   英文圆括号 (laughs) 那一支仍是 40 —— 鱼声 / MiniMax 的英文括号规则本来就是 1,40。

const SENTENCE_CUT_RE = /[。！？!?…]/;
const HAS_REAL_CHAR_RE = /[^。！？!?\s…]/;

/**
 * 演出标记不算「字」。三种形状都是本仓已有的约定（见 utils/fishAudioTts.ts / utils/minimaxTts.ts）：
 *   · 方括号 cue       [breathy]  [sighing]
 *   · 英文圆括号语气    (laughs)  (sighs)      ← MiniMax 官方标签
 *   · 中文舞台指示      （小声）  （笑）        ← 一律删除、不朗读
 * 方括号这条和 utils/callSpeechTimeline.ts 剥标签的形状一致（配对时本来就会被跳过）。
 */
const SPEECH_TAG_RE = /\[[^\[\]]{1,40}\]|\([^()]{1,40}\)|（[^（）]{1,80}）/g;

/** 这一小截里有没有真字：**演出标记和标点都不算**。
 *  「[breathy] ……」这种只有标记+标点的开头，要和「……え？」一样挂到下一句去。 */
export const hasRealChar = (s: string): boolean =>
  HAS_REAL_CHAR_RE.test((s || '').replace(SPEECH_TAG_RE, ''));

/** 把一段台词切成一行行。只切句、不改显示内容（纯符号碎片并到下一句）。 */
export const splitBilingualLines = (text: string): string[] => {
  const src = (text || '').replace(/[\r\n]+/g, '');
  const out: string[] = [];
  let buf = '';
  let pending = '';   // 攒着的「只有符号」碎片，等下一句来了拼到它前面
  const flush = () => {
    const piece = buf.trim();
    buf = '';
    if (!piece) return;
    if (!hasRealChar(piece)) {
      pending += piece;   // 只有标记/标点：留一手，不单独成行
      return;
    }
    out.push((pending + piece).trim());
    pending = '';
  };
  for (let i = 0; i < src.length; i += 1) {
    buf += src.charAt(i);
    if (!SENTENCE_CUT_RE.test(src.charAt(i))) continue;
    while (i + 1 < src.length && SENTENCE_CUT_RE.test(src.charAt(i + 1))) {
      i += 1;
      buf += src.charAt(i);
    }
    flush();
  }
  flush();
  const leftover = pending.trim();
  if (leftover) {
    if (out.length) out[out.length - 1] += leftover;   // 结尾落单的纯符号：贴回上一句
    else out.push(leftover);                          // 整段没有实字：至少别丢
  }
  if (out.length) return out;
  const fallback = src.trim();
  return fallback ? [fallback] : [];
};
