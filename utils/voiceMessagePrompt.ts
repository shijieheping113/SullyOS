import { VOICE_ACTING_GUIDE } from './minimaxTts';
import { FISH_VOICE_ACTING_GUIDE } from './fishAudioTts';
import { getElevenLabsVoiceActingGuide } from './elevenLabsTts';
import type { APIConfig } from '../types';
import {
    getElevenLabsModel,
    getTtsProvider,
    getVoicePromptOverride,
    resolveTtsProvider,
} from './ttsProvider';
import { voiceLanguagePromptLabel } from './voiceLanguage';

function builtinVoiceActingGuide(provider: ReturnType<typeof resolveTtsProvider>, elevenLabsModel?: string): string {
    if (provider === 'fishaudio') return FISH_VOICE_ACTING_GUIDE;
    if (provider === 'elevenlabs') {
        return getElevenLabsVoiceActingGuide(elevenLabsModel || getElevenLabsModel());
    }
    return VOICE_ACTING_GUIDE;
}

/**
 * 从 apiConfig 直接解析语音表演指南（不依赖 OSContext 单例）。
 * 猫儿修格式等走副 API 的路径应优先用这份，确保设置里自定义的规范一定进提示词。
 */
export function resolveVoiceActingGuideFromApiConfig(
    apiConfig?: Pick<APIConfig, 'ttsProvider' | 'voicePrompts' | 'elevenLabsModel'> | null,
): string {
    const provider = resolveTtsProvider(apiConfig);
    const raw = apiConfig?.voicePrompts?.[provider];
    const custom = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
    if (custom) return custom;
    return builtinVoiceActingGuide(provider, apiConfig?.elevenLabsModel);
}

/** 与主聊天 `chatPrompts` 同源：按当前 TTS 服务商 + 用户自定义语音提示词（读模块单例） */
export function getVoiceActingGuideForPrompt(): string {
    const provider = getTtsProvider();
    const custom = getVoicePromptOverride(provider);
    if (custom) return custom;
    return builtinVoiceActingGuide(provider);
}

export type ChatVoicePromptOptions = {
    chatVoiceEnabled?: boolean;
    chatVoiceLang?: string;
    /** 显式传入时优先（如猫儿修格式从 apiConfig 解析） */
    voiceActingGuide?: string;
};

/**
 * 主聊天 system prompt 里的「语音消息功能」整段（含标签规则 + 语气表演指南）。
 * 语音未开启时返回与 chatPrompts 一致的禁用说明。
 */
export function buildChatVoiceMessagePromptBlock(opts: ChatVoicePromptOptions): string {
    if (!opts.chatVoiceEnabled) {
        return `\n\n[系统提示: 语音消息功能当前未开启。严禁使用 <语音>...</语音> 和 <字幕>...</字幕> 标签。所有回复必须是纯文字消息。]`;
    }

    const voiceLang = (opts.chatVoiceLang || '').trim();
    const langLabel = voiceLang ? voiceLanguagePromptLabel(voiceLang) : '';
    const acting = opts.voiceActingGuide?.trim() || getVoiceActingGuideForPrompt();

    if (voiceLang) {
        return `\n\n### 🎤 语音消息功能

用户开启了语音消息功能，语音语种为：${langLabel}（${voiceLang}）。

**你可以发送语音消息！** 就像真人用微信一样，你可以选择打字或者发语音。整轮只回复一次，不要让文字和语音各自回答一遍同一条用户消息。
发语音用两个标签成对写：\`<语音>${langLabel}台词</语音>\` 紧跟 \`<字幕>中文字幕</字幕>\`。
<语音> 里是真正被朗读的${langLabel}，<字幕> 里是同一段话的中文——语音条的「转文字」面板会直接用它当对照翻译，用户对着中文听${langLabel}。

规则：
1. \`<语音>\` 里写${langLabel}——只写会被朗读的文字。可选 emotion 属性标整条情绪：\`<语音 emotion="happy">…</语音>\`，emotion 只能取 happy/sad/angry/fearful/disgusted/surprised/calm/fluent（情绪不强就别加）
2. \`<字幕>\` 里写这条语音的中文版，内容和${langLabel}一致、逐段对齐（${langLabel}分几段中文就分几段）。**<字幕> 必须紧跟在 </语音> 后面，永远成对出现，不能单独用**
3. 标签外可以照常发普通中文短消息（正常闲聊打字），它们显示成普通气泡，和语音内容互相独立、不要复读

示例：
你说真的假的？
<语音 emotion="surprised">Wait... are you serious?</语音>
<字幕>等等……你是认真的？</字幕>

<语音 emotion="sad">I don't wanna move anymore... (sighs)</语音>
<字幕>啊不想动了……（叹气）</字幕>

要求：
- <语音> 里的${langLabel}要自然口语化，符合你的性格，不要机翻味
- <语音> 里想要笑、叹气等真实语气用官方英文标签 (laughs)/(sighs)/(chuckle)/(gasps) 等，**不要写中文（轻笑）这类舞台指示**（中文括号会被直接删掉、不朗读）
- 每条消息最多一个 <语音> + <字幕> 组合
- 不是每条消息都要发语音！像真人一样，有时候打字，有时候发语音，自然切换
- 比较适合发语音的场景：撒娇、吐槽、语气很重的话、懒得打字的时候
- 比较适合打字的场景：发链接、正经讨论、很短的回复如"嗯"、"好"

${acting}`;
    }

    return `\n\n### 🎤 语音消息功能

用户开启了语音消息功能。
整轮回复只构思一次：语音是这轮消息中的一种气泡，不是额外再独立回复一遍。先决定每句话用文字还是语音，同一个信息只发一次；语音已有内置转文字，无需在标签外抄写或改写语音内容。

**你可以发送语音消息！** 就像真人用微信一样，你可以选择打字或者发语音。
用 \`<语音>要说的话</语音>\` 标签来发送语音。标签里的内容会被转成真正的语音条显示给用户。
可选地用 emotion 属性设定整条语音的情绪：\`<语音 emotion="happy">…</语音>\`，emotion 只能取 happy/sad/angry/fearful/disgusted/surprised/calm/fluent（情绪不强就别加）。

示例：
<语音 emotion="happy">哎你今天干嘛去了啊？</语音>

我看到一个好搞笑的视频
<语音>你快去看！就那个什么……(chuckle)啊我忘了叫什么了，反正超搞笑的</语音>

要求：
- <语音> 里只写会被朗读的文字，不要写中文舞台指示/括号动作；想要笑、叹气等真实语气，用官方英文标签 (laughs)/(sighs)/(chuckle)/(gasps) 等（中文括号会被直接删掉、不朗读）
- 每条消息最多一个 <语音> 标签
- 不是每条消息都要发语音！像真人一样，有时候打字，有时候发语音，自然切换
- 比较适合发语音的场景：撒娇、吐槽、语气很重的话、懒得打字的时候、想让对方听到你语气的时候
- 比较适合打字的场景：发链接、正经讨论、很短的回复如"嗯"、"好"
- 标签外的文字会正常显示为文本消息
- **【重要】语音和文字是两种不同的表达方式，不要复读！** 如果你同时发了文字和语音，语音的内容不能是文字的重复或复述。要么单独发语音（不带文字），要么文字和语音表达不同的内容（比如文字聊正事，语音补一句吐槽/撒娇；或者文字发完一段话后，语音单独补充一个新的想法）。你不会打完字又发一条语音把同样的话再说一遍的——那很奇怪。

${acting}`;
}

/** 猫儿修格式：与主聊天同源的语音段标题，便于在 system 里定位 */
export const VOICE_REPAIR_PROMPT_SECTION_TITLE = '语音消息 — 与主聊天 chatPrompts 同源';
