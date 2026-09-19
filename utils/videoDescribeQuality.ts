/** 提取【画面过程】段正文（无标签则退回全文）。 */
export function extractVideoProcessSection(description: string): string {
  const text = (description || '').trim();
  const m = text.match(/【画面过程】\s*([\s\S]*?)(?=\n\s*【|$)/);
  return (m?.[1] ?? text).trim();
}

/**
 * 启发式：描述像在片段中途用括号「总结」收尾，或过程段相对时长过短。
 */
export function isVideoDescriptionLikelyTruncated(description: string, durationSec: number): boolean {
  const process = extractVideoProcessSection(description);
  if (!process) return false;

  const metaEnding = /（[^）]{8,}(?:即为|暗示|说明|总结|情绪从)[^）]*）\s*$/;
  if (metaEnding.test(process.trim())) return true;

  const tail = process.slice(-120);
  if (/（[^）]{0,40}(?:即为|暗示)/.test(tail)) {
    return true;
  }

  if (!/【画面过程】/.test(description) && description.length > 400) {
    return true;
  }

  return false;
}

export function isVideoCompletionNearMaxTokens(
  completionTokens: number,
  maxTokens: number,
): boolean {
  if (!maxTokens || maxTokens <= 0) return false;
  if (!completionTokens || completionTokens <= 0) return false;
  return completionTokens >= maxTokens * 0.92;
}

export function bumpVideoDescriptionMaxTokens(current: number): number {
  if (current < 6000) return 8000;
  if (current < 8000) return 10_000;
  return 12_000;
}
