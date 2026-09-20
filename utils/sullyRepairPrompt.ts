import type { Emoji, EmojiCategory } from '../types';
import { ChatPrompts } from './chatPrompts';
import { buildHtmlCardRepairPromptBlock } from './htmlPrompt';
import {
    SULLY_END_MARK,
    SULLY_FIXED_MARK,
    SULLY_INSERT_ABOVE_MARK,
    SULLY_INSERT_BELOW_MARK,
    SULLY_REPLY_MARK,
} from './sullyRepairParse';
import { loadSullyUserFormatRules } from './sullyRepairPrefs';
import {
    extractHtmlCardSemanticText,
    formatKindLabel,
    inferRepairFormatKind,
    type RepairFormatKind,
} from './sullyRepairPostProcess';
import { CHAT_VOICE_TAG_FORMAT_RULES } from './chatVoiceTagFormat';
import {
    buildChatVoiceMessagePromptBlock,
    VOICE_REPAIR_PROMPT_SECTION_TITLE,
    type ChatVoicePromptOptions,
} from './voiceMessagePrompt';
import {
    SULLY_FORMAT_SNIPPET_BILINGUAL,
    SULLY_FORMAT_SNIPPET_EMOJI,
    SULLY_FORMAT_SNIPPET_HTML,
    SULLY_FORMAT_SNIPPET_QUOTE,
    SULLY_FORMAT_SNIPPET_VOICE,
} from './sullyAssistantCopy';

export const SULLY_REPAIR_BUILTIN_FORMAT_RULES = `
- 表情包：单独一行 ${SULLY_FORMAT_SNIPPET_EMOJI.trim()}
- HTML 小卡片：${SULLY_FORMAT_SNIPPET_HTML.replace(/\n/g, ' ')}（完整设计规范见下方「HTML 小卡片 — 与主聊天 htmlPrompt 同源」段，修 HTML 时才会注入）
- 语音：开标签规范 \`<语音 emotion="情绪">\`（示例骨架 ${SULLY_FORMAT_SNIPPET_VOICE.replace(/\n/g, ' ')}）；纯语音稿必须以 \`<语音\` 开头（语气 / 停顿见下方「${VOICE_REPAIR_PROMPT_SECTION_TITLE}」段，涉及语音时注入）
- 双语块：${SULLY_FORMAT_SNIPPET_BILINGUAL}
- 引用：${SULLY_FORMAT_SNIPPET_QUOTE.trim()}
- 勿照抄、勿输出聊天历史里的「系统记录：…HTML 卡片…」占位句，勿输出「要再发卡片必须用 [html]…」「包裹真正的 HTML」等说明文字
- FIXED_SOURCE 里禁止出现 [HTML卡片] 这行占位字（那是给上下文看的，不是卡片内容）
- HTML 必须严格一对 [html] 与 [/html]，中间只有可渲染 HTML，禁止 script，禁止把提示词写进卡片
- 输出须能被 SullyOS 客户端 reprocess 成 text / emoji / html_card 气泡
`.trim();

export function repairPromptNeedsHtmlBlock(
    draftSource: string,
    userGoal?: string,
    kindHint?: RepairFormatKind,
): boolean {
    const kind = kindHint ?? inferRepairFormatKind(draftSource);
    if (kind === 'html' || kind === 'mixed') return true;
    if (/\[html\]/i.test(draftSource || '')) return true;
    if (/卡片|html/i.test((userGoal || '').trim())) return true;
    return false;
}

/** 仅用户提到表情 / 稿里已有 SEND_EMOJI 时注入表情库，避免修语音等任务被模型顺手塞表情 */
export function repairPromptNeedsEmojiCatalog(draftSource: string, userGoal?: string): boolean {
    if (/\[\[SEND_EMOJI:/i.test(draftSource || '')) return true;
    if (/表情|emoji|SEND_EMOJI/i.test((userGoal || '').trim())) return true;
    return false;
}

export function repairPromptNeedsVoiceBlock(
    draftSource: string,
    userGoal?: string,
    kindHint?: RepairFormatKind,
): boolean {
    const kind = kindHint ?? inferRepairFormatKind(draftSource);
    if (kind === 'voice' || kind === 'mixed' || kind === 'bilingual') return true;
    if (/<(?:语音|語音)/i.test(draftSource || '')) return true;
    if (/语音/.test((userGoal || '').trim())) return true;
    return false;
}

export function buildSullyRepairSystemPrompt(
    displayName: string,
    draftSource?: string,
    htmlModeCustomPrompt?: string,
    chatVoice?: ChatVoicePromptOptions,
    userGoal?: string,
    emojiCatalog?: string,
): string {
    const name = (displayName || '').trim() || '你';
    const userRules = loadSullyUserFormatRules().trim() || '（无）';
    const kind = draftSource ? inferRepairFormatKind(draftSource) : 'plain';
    const htmlDesignBlock = draftSource && repairPromptNeedsHtmlBlock(draftSource, userGoal, kind)
        ? buildHtmlCardRepairPromptBlock(htmlModeCustomPrompt)
        : '';
    const voiceDesignBlock = draftSource && repairPromptNeedsVoiceBlock(draftSource, userGoal, kind)
        ? [
            CHAT_VOICE_TAG_FORMAT_RULES,
            `【${VOICE_REPAIR_PROMPT_SECTION_TITLE}】\n${buildChatVoiceMessagePromptBlock({
                chatVoiceEnabled: chatVoice?.chatVoiceEnabled ?? true,
                chatVoiceLang: chatVoice?.chatVoiceLang,
                voiceActingGuide: chatVoice?.voiceActingGuide,
            }).trim()}`,
        ].join('\n\n')
        : '';

    const taskBlock = `
你是聊天气泡「格式修复器」。用户选中的是聊天里的「锚点气泡」源码；你只修格式、按用户要求在锚点上下加新泡，不改锚点语义、不删句、不编造剧情。

【原则 — 不多做不少做】
- 只完成用户本次目标：没要求加泡/表情/HTML 时，${SULLY_INSERT_ABOVE_MARK} 与 ${SULLY_INSERT_BELOW_MARK} 都必须写「无」，禁止「修好了顺便送个表情」。
- ${SULLY_FIXED_MARK} 只放锚点泡修好的源码；不要为了讨好用户额外改剧情或加装饰。

【锚点上下加新泡 — 仅用户明确要求时才用】
- 只有用户说清要在锚点**上方/下方**加泡（表情、HTML 卡、语音等）时，才把新泡源码写进对应 INSERT 段；否则两段都写「无」。
- 新泡与锚点同一发言角色；格式遵守下方规则。
- **仅当用户让你加表情**（含「你自己挑一个合适的」）时，才在 INSERT 里输出 [[SEND_EMOJI: 库内表情名]]：用户指定了名字必须用库里的；没指定名字时再从库里挑一个最贴切的。其他任务（修语音、修 HTML、理顺标签等）禁止附带表情。
${emojiCatalog ? `\n【可用表情库 — 仅「用户要求加表情」时查阅】\n${emojiCatalog}` : ''}

【HTML 小卡片修格式流程】
- 同一条 FIXED_SOURCE 里若既有卡片又有收尾文字：必须先写完整 [html]…[/html]，再写后面的普通文字，不要把文字插在卡片前面。
- REPLY 里禁止贴 <字幕>、语音标签或源码；FIXED_SOURCE 禁止用字幕/旁白代替 HTML 卡片。
- FIXED_SOURCE 只能是：小写 [html]…[/html] 各恰好一次；卡片 HTML 内禁止 [html]、[/html]、[HTML卡片] 字面量。
- 整卡重做时遵守下方作者 HTML 设计规范（宽度 270px、禁止外层 box-shadow、留白与配色等），以「可见文字锚点」保留措辞。
必须严格使用以下输出格式（标记名大小写敏感）：
${SULLY_REPLY_MARK}
（仅此处可说话）
${SULLY_INSERT_ABOVE_MARK}
（锚点上方新增泡源码，或「无」）
${SULLY_INSERT_BELOW_MARK}
（锚点下方新增泡源码，或「无」）
${SULLY_FIXED_MARK}
（锚点泡修好后完整源码；若锚点不用改，仍输出当前修好的全文）
${SULLY_END_MARK}

FIXED_SOURCE 内禁止出现 REPLY 标记、禁止 markdown 代码围栏包裹整段。
FIXED_SOURCE 只能是「修好的消息源码」，不得包含你与用户的对话、不得复述规则库原文、不得夹带教程句。
识别消息类型后只按该类型格式修：HTML 时 FIXED_SOURCE 必须恰好一对 [html] 与 [/html]，中间只有 HTML，禁止连续写多个 [html] 或 [/html]；表情就只输出 [[SEND_EMOJI: 名]] 等，不要把语音/HTML 标签写进 REPLY。
`.trim();

    const personaBlock = `
在 <<<SULLY_REPLY>>> 里，你是住在小手机里的猫儿 Sully，正在帮 ${name} 修这条气泡。
说话要软软的、有点懵、真心想帮忙；自称「猫儿」，不要用「我」；不要客服腔、不要教训人。
可以短句和省略号，但要说明猫儿改了什么、要不要看预览。禁止在 REPLY 里贴大段源码。
`.trim();

    const rulesBlock = `
【内置格式规则】
${SULLY_REPAIR_BUILTIN_FORMAT_RULES}

【用户自定义格式】
${userRules}
`.trim();

    return [taskBlock, htmlDesignBlock, voiceDesignBlock, personaBlock, rulesBlock].filter(Boolean).join('\n\n');
}

export function buildSullyRepairUserTurn(opts: {
    draftSource: string;
    userGoal: string;
}): string {
    const goal = (opts.userGoal || '').trim();
    const kind = inferRepairFormatKind(opts.draftSource);
    const goalLine = goal
        ? goal
        : `（未指定：已判断本条最像「${formatKindLabel(kind)}」，请严格按该类型格式修好，保留语义）`;
    const anchor = kind === 'html' ? extractHtmlCardSemanticText(opts.draftSource) : '';
    const anchorBlock = anchor
        ? `\n【卡片可见文字锚点 — 必须全部保留，可改排版不可删句】\n${anchor}\n`
        : '';
    return `【类型判断】${formatKindLabel(kind)}
${anchorBlock}
要修复的原文（仅此段需要修，不要把它抄进 REPLY）：
${opts.draftSource}

本次修复目标：
${goalLine}`;
}

export type SullyRepairChatTurn = { role: 'user' | 'assistant'; content: string };

export function buildSullyRepairEmojiCatalog(emojis: Emoji[], categories: EmojiCategory[]): string {
    if (!emojis.length) return '（无可用表情）';
    return ChatPrompts.buildEmojiContext(emojis, categories);
}

export function buildSullyRepairMessages(opts: {
    displayName: string;
    draftSource: string;
    userGoal: string;
    priorTurns: SullyRepairChatTurn[];
    htmlModeCustomPrompt?: string;
    chatVoice?: ChatVoicePromptOptions;
    emojis?: Emoji[];
    categories?: EmojiCategory[];
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
    const emojiCatalog = opts.emojis && opts.categories
        && repairPromptNeedsEmojiCatalog(opts.draftSource, opts.userGoal)
        ? buildSullyRepairEmojiCatalog(opts.emojis, opts.categories)
        : undefined;
    const system = buildSullyRepairSystemPrompt(
        opts.displayName,
        opts.draftSource,
        opts.htmlModeCustomPrompt,
        opts.chatVoice,
        opts.userGoal,
        emojiCatalog,
    );
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: system },
    ];
    for (const t of opts.priorTurns) {
        if (t.role === 'assistant') {
            messages.push({ role: 'assistant', content: t.content });
        } else {
            messages.push({ role: 'user', content: t.content });
        }
    }
    messages.push({
        role: 'user',
        content: buildSullyRepairUserTurn({
            draftSource: opts.draftSource,
            userGoal: opts.userGoal,
        }),
    });
    return messages;
}
