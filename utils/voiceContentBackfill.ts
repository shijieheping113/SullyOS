// 用户语音消息（STT）的正文回写工具。
//
// 背景：旧版把识别字包进 <语音>…</语音> 标记、或只存在本机原声资产里。语音壳会被
// 展示/导出侧的清洗规则连字一起吃掉，存档导出后这段字就丢了。
// 目标：识别字一律落成正文纯文本（原版导出/外部程序可读），界面仍由 metadata.stt
// 记号 + 原声资产驱动成同一条语音气泡（见 MessageItem 的 hasUserSttMarker）。
//
// 只处理「用户消息」；AI 的 TTS 语音条（AI 消息 + 语音壳）一律不碰。

// 与展示侧同款清洗口径（见 components/chat/MessageItem.tsx 的语音壳清洗）：
// 配对壳整体剥掉；未闭合壳（历史坏数据）剥到末尾。
const VOICE_SHELL_GLOBAL_RE = /<\s*[语語]音[^>]*>[\s\S]*?<\/\s*[语語]音\s*>|<\s*[语語]音[^>]*>[\s\S]*$/g;

/** 剥掉语音壳后剩下的「壳外文字」。用户语音消息的正确形状是整条一个壳，壳外不该有字。 */
export function stripVoiceShells(content: string): string {
    return (content || '').replace(VOICE_SHELL_GLOBAL_RE, '');
}

/**
 * 这条用户消息的正文是否需要回写识别字：
 * 壳外没有有效文字（空正文 / 只有语音壳，壳里有没有字都算）→ 需要。
 */
export function needsVoiceBackfill(content?: string): boolean {
    return !stripVoiceShells(content || '').trim();
}

/** 取语音壳里包的字（配对优先，未闭合取开标签之后的全部；无壳返回空串）。 */
export function voiceShellInnerText(content?: string): string {
    const t = content || '';
    const paired = t.match(/<\s*[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/);
    if (paired && paired[1] !== undefined) return paired[1].trim();
    const unclosed = t.match(/<\s*[语語][^>]*>([\s\S]*)$/);
    return unclosed && unclosed[1] !== undefined ? unclosed[1].trim() : '';
}

/**
 * 计算回写后的正文（纯文本）。没有可写的字返回 null（不动这条消息）。
 * 资产里的字优先（应用维护的权威转写），壳里兜底（原声丢失时壳里的字也救回来）。
 */
export function computeBackfillContent(input: { content?: string; assetText?: string | null }): string | null {
    const asset = (input.assetText || '').trim();
    if (asset) return asset;
    return voiceShellInnerText(input.content) || null;
}
