// 用户语音消息（STT）的正文回写工具。
//
// 背景：用户说话后，识别字现在以 `<语音>…</语音>` 标签形态落进正文（与 AI 语音消息
// 同一套标签），这样发给模型时模型能分出「这是条语音消息」，语气才对得上。
// 早期版本把识别字写成纯文本、靠 metadata.stt 记号区分，但模型侧完全看不出语音，
// 且同一份存档里两种写法并存。
//
// 为什么标签落进正文是安全的（已查证，非推测）：
//   · 备份导出对消息 content 原样打包（utils/backupFormat.ts 分片写 stores/*.json，
//     不对 content 做任何清洗）；全仓找不到剥 <语音> 标签的导出规则。
//   · AI 语音消息本来就带 <语音> 标签存记录、走备份、从原版导入，一路正常。
//   · 展示侧 MessageItem 用 hasVoiceTag 认标签渲染色条，与用户语音原路径一致。
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

/** 正文是否已经带着语音标签（已是目标形态，不用再包）。 */
export function hasVoiceShell(content?: string): boolean {
    return /<\s*[语語]音[^>]*>/.test(content || '');
}

/**
 * 把识别字包成与 AI 语音同款的标签形态。
 * 用户语音没有情绪属性（那是角色朗读才有的），所以只写裸 `<语音>`。
 */
export function wrapVoiceShell(text: string): string {
    const inner = (text || '').trim();
    if (!inner) return '';
    if (hasVoiceShell(inner)) return inner;
    return `<语音>${inner}</语音>`;
}

/**
 * 计算回写后的正文。没有可写的字返回 null（不动这条消息）。
 * 资产里的字优先（应用维护的权威转写），壳里兜底（原声丢失时壳里的字也救回来）。
 */
export function computeBackfillContent(input: { content?: string; assetText?: string | null }): string | null {
    const asset = (input.assetText || '').trim();
    if (asset) return asset;
    return voiceShellInnerText(input.content) || null;
}

/**
 * 计算写回数据库的正文形态：识别字包进 <语音> 标签。
 * 与 AI 语音消息同一套格式，模型侧不需要再区分两套写法。
 */
export function computeBackfillTaggedContent(input: { content?: string; assetText?: string | null }): string | null {
    const plain = computeBackfillContent(input);
    if (!plain) return null;
    return wrapVoiceShell(plain);
}
