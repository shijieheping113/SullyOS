/**
 * 发视频前的标题/备注清洗：支持纯文本、小红书/抖音分享糊贴。
 * 只解析粘贴文案，不联网。
 */

const URL_RE = /https?:\/\/[^\s，。！？；、'"」』）】]+/gi;
const XHS_AD_LINE = /复制这段文字[，,]?\s*打开【小红书】[^\n]*/i;
const DOUYIN_PREFIX = /^\s*\d+(?:\.\d+)?\s*/;
const DOUYIN_OPEN = /复制打开抖音[，,]?/gi;
const DOUYIN_LOOK = /看看【[^】]*】/g;
const DOUYIN_TAIL口令 = /\s+xSl:\/[^\n]*/i;

export type VideoShareNoteSource = 'text' | 'xhs' | 'douyin';

export interface ParsedVideoShareNote {
  title: string;
  source: VideoShareNoteSource;
}

function stripUrls(text: string): string {
  return text.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim();
}

function isXhsPaste(text: string): boolean {
  return /xhslink\.(com|cn)/i.test(text)
    || /xiaohongshu\.com|rednote\.com/i.test(text)
    || XHS_AD_LINE.test(text)
    || /去【小红书】/i.test(text);
}

function isDouyinPaste(text: string): boolean {
  return /v\.douyin\.com|douyin\.com/i.test(text) || /复制打开抖音/i.test(text);
}

/** 从小红书分享糊贴提取标题（仅首行正文，不拼营销句）。 */
function parseXhsSharePaste(raw: string): string {
  const lines = raw.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let head = stripUrls(lines[0] || raw.trim());
  if (!head && lines.length > 1) {
    head = stripUrls(lines[1]);
  }
  head = head.replace(XHS_AD_LINE, '').trim();
  head = head.replace(/^小红书(?=\S)/, '').trim();
  return head.trim();
}

/** 从抖音分享糊贴提取标题 + 完整 tag（Ann 定稿例）。 */
function parseDouyinSharePaste(raw: string): string {
  let text = raw.trim();
  text = text.replace(DOUYIN_PREFIX, '');
  text = text.replace(DOUYIN_OPEN, '');
  text = text.replace(DOUYIN_LOOK, '');
  const urlMatch = text.match(URL_RE);
  if (urlMatch?.[0]) {
    const idx = text.indexOf(urlMatch[0]);
    text = text.slice(0, idx);
  }
  text = text.replace(DOUYIN_TAIL口令, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** 解析粘贴框文案为发视频用的标题（保留 #tag）。 */
export function parseVideoShareNote(raw: string, fallbackFileName?: string): ParsedVideoShareNote {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    const fromFile = fallbackFileName
      ? fallbackFileName.replace(/\.[^.]+$/, '').trim()
      : '';
    return { title: fromFile, source: 'text' };
  }
  if (isDouyinPaste(trimmed)) {
    const title = parseDouyinSharePaste(trimmed);
    if (title) return { title, source: 'douyin' };
  }
  if (isXhsPaste(trimmed)) {
    const title = parseXhsSharePaste(trimmed);
    if (title) return { title, source: 'xhs' };
  }
  return { title: trimmed, source: 'text' };
}

/** 「补全标题」：只洗当前输入框固定分享文案，不联网。 */
export function fillVideoTitleFromPaste(raw: string): string {
  return parseVideoShareNote(raw).title;
}

export const VIDEO_MODEL_INSTRUCTION = `你的任务：为「完全看不到这段视频」的角色扮演型写说明，让它能听懂这个视频在讲什么。

请严格按下面三段输出（保留行首标签，段内写正文）：

【视频类型】根据画面判断类型（如：生活记录、视频说、游戏/界面录屏、快剪种草、教程步骤、搞笑梗串等）；若明显是快剪/多镜头切换，必须写明。

【主线概括】用 1～3 句说明：主角/主体是谁、整条视频在讲什么事、情绪或笑点/信息落点是什么。让没看过画面的人也能抓住「这条视频想表达什么」。

【画面过程】按时间顺序写看得见的内容（主体、场景、动作、声音/台词、字幕或界面文字）。若镜头频繁切换，请按「片段1 / 片段2…」或明显转场分段，写清每段发生了什么及与主线的关系；不要当成一张静图连续描写，也不要漏掉关键字幕。须覆盖从开头到最后一镜的全程，不得只写前半段。

禁止用括号内的「画面即为…」「暗示…」「情绪从…转为…」等总结句代替尚未写出的镜头；相册翻页、揭晓、结尾字幕等必须在后续片段里按顺序写出来。【画面过程】的最后一条必须是最后一镜可见内容或最后一句字幕，不得以总结性旁白或括号总括结束。

用户提供的标题仅作主题参考，不要复述标题，不要猜测画面外信息。直接输出正文，禁止寒暄、禁止对话式开头，禁止输出标签以外的多余段落。`;

export function buildVideoModelUserText(title: string): string {
  const t = title.trim();
  if (!t) return VIDEO_MODEL_INSTRUCTION;
  return `（主题参考，勿逐字复述）${t}\n\n${VIDEO_MODEL_INSTRUCTION}`;
}
