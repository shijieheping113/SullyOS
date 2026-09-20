import { VALID_EMOTIONS } from './minimaxTts';

/** 与主聊天 / minimaxTts.parseVoiceOutput / chatPrompts 一致的语音开标签 */

export const CHAT_VOICE_EMOTION_VALUES =
    'happy、sad、angry、fearful、disgusted、surprised、calm、fluent';

/** 从口白里的方括号记号认作者那 8 个情绪；excited 当成 happy。认不到就空。 */
export function inferChatVoiceEmotionFromSpoken(text: string): string | undefined {
    const re = /\[([^\[\]]{1,40})\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text || ''))) {
        const raw = (m[1] || '').trim().toLowerCase();
        const mapped = raw === 'excited' ? 'happy' : raw;
        if (VALID_EMOTIONS.has(mapped)) return mapped;
    }
    return undefined;
}

/** 规范开标签：`<语音 emotion="calm">`；无情绪时用 `<语音>` */
export function formatChatVoiceOpenTag(emotion?: string): string {
    const e = (emotion || '').trim();
    if (e) return `<语音 emotion="${e}">`;
    return '<语音>';
}

export const CHAT_VOICE_SNIPPET_MONO = `${formatChatVoiceOpenTag('calm')}\n</语音>`;

export const CHAT_VOICE_SNIPPET_WITH_SUBTITLE =
    `${formatChatVoiceOpenTag('calm')}\n</语音>\n<字幕></字幕>`;

/** 长按外语语音：模型只出口语，中文原文由程序当字幕。与作者 AI 语音泡同一对标签。 */
export function wrapSpokenWithOriginalChinese(
    spoken: string,
    chinese: string,
    emotion?: string,
): string {
    const inner = (spoken || '').trim();
    const subtitle = (chinese || '').trim();
    return `${formatChatVoiceOpenTag(emotion)}${inner}</语音>\n<字幕>${subtitle}</字幕>`;
}

/** 猫儿修格式 / 手改模板注入：与 chatPrompts 语音段同一套开标签规则 */
export const CHAT_VOICE_TAG_FORMAT_RULES = `
【语音开标签 — 与主聊天一致，修语音时必须遵守】
- 口播正文只写在 \`<语音 …>…</语音>\` 内；规范开标签是 \`<语音 emotion="情绪">\`（情绪取 ${CHAT_VOICE_EMOTION_VALUES}，不明显可省略属性写 \`<语音>\`）。
- 纯语音泡（没有伴生打字）时，整条源码必须以 \`<语音\` 开头，禁止先把台词写在标签外面。
- 外语语音：\`</语音>\` 后紧跟 \`<字幕>中文对照</字幕>\`，字幕块在语音块后面。
- 简写 \`<语音=calm>\` 可理解，但输出请写成 \`<语音 emotion="calm">\`；禁止用 \`[happy]\` 代替开标签（方括号是标签内语气 cue，不是语音开标签）。
`.trim();
