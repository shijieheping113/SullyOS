/** 猫儿小助手 — 用户可见文案（软语气，像「猫儿帮你捋一捋」那条副标题） */

import { CHAT_VOICE_SNIPPET_WITH_SUBTITLE } from './chatVoiceTagFormat';

export const SULLY_ASSISTANT_MENU_SUBTITLE = '气泡掉格式了……可以找猫儿';

export function sullyAssistantGreeting(displayName?: string): string {
    const name = (displayName || '').trim();
    if (name) return `${name}，猫儿在这儿，要猫儿帮什么？`;
    return '猫儿在这儿，要猫儿帮什么？';
}

export type SullyAssistantFeatureId = 'edit-rerender' | 'bubble-ops';

export const SULLY_ASSISTANT_FEATURE_EDIT_TITLE = '把气泡理顺';
export const SULLY_ASSISTANT_FEATURE_EDIT_SUB =
    '语音、小卡片、表情包……乱掉了，猫儿帮你捋一捋';

export const SULLY_ASSISTANT_FEATURE_BUBBLE_TITLE = '在旁边加减气泡';
export const SULLY_ASSISTANT_FEATURE_BUBBLE_SUB =
    '锚点上下多一条泡、或跟邻居并成一条，猫儿帮你挪好';

export const SULLY_ASSISTANT_FEATURE_FORMAT_TITLE = SULLY_ASSISTANT_FEATURE_EDIT_TITLE;
export const SULLY_ASSISTANT_FEATURE_FORMAT_SUB = SULLY_ASSISTANT_FEATURE_EDIT_SUB;

export const SULLY_FORMAT_PICK_HINT_EDIT = '点要理顺的气泡，可以多选（拆成好几条的语音也行）';
export const SULLY_FORMAT_PICK_HINT_AI_REPAIR = '点要一起修的气泡，可以多选';
export const SULLY_FORMAT_PICK_HINT_BUBBLE = '点一下锚点那条，猫儿才知道加在哪旁边';
export const SULLY_FORMAT_PICK_CONFIRM = '选好了，猫儿开工';
export const SULLY_FORMAT_PICK_CANCEL = '先不修了';

export const SULLY_FORMAT_PICK_REJECT =
    '这条猫儿还捋不动……换一条文字或表情试试？';

export const SULLY_BUBBLE_OPS_ADD_ABOVE = '在上方加一条';
export const SULLY_BUBBLE_OPS_ADD_BELOW = '在下方加一条';
export const SULLY_BUBBLE_OPS_MERGE_ABOVE = '和上面那条并成一条';
export const SULLY_BUBBLE_OPS_MERGE_BELOW = '和下面那条并成一条';
export const SULLY_BUBBLE_OPS_NO_NEIGHBOR_ABOVE = '上面没有邻居了';
export const SULLY_BUBBLE_OPS_NO_NEIGHBOR_BELOW = '下面没有邻居了';

export const SULLY_BUBBLE_COMPOSE_TITLE_ABOVE = '在上方加一条新泡';
export const SULLY_BUBBLE_COMPOSE_TITLE_BELOW = '在下方加一条新泡';
export const SULLY_BUBBLE_COMPOSE_PLACEHOLDER_PLAIN = '写想说的话就好……';
export const SULLY_BUBBLE_COMPOSE_CONFIRM = '嗯，加在这里';
export const SULLY_BUBBLE_COMPOSE_CANCEL = '先不加';
export const SULLY_BUBBLE_COMPOSE_CLOSE = '关闭';
export const SULLY_BUBBLE_COMPOSE_SAVE_OK = '新泡加好了，预览对得上就行';
export const SULLY_BUBBLE_MERGE_OK = '两条并成一条了';
export const SULLY_BUBBLE_COMPOSE_MORE_FORMATS = '更多格式';
export const SULLY_BUBBLE_COMPOSE_PICK_EMOJI = '点一张表情';

export const SULLY_FORMAT_TIDY_OK = '呜……标签理顺了一点，预览里对得上再保存哦';
export const SULLY_FORMAT_TIDY_NOOP = '这条……这个钮暂时修不动，换「一键理顺」或手改源码试试';
export const SULLY_FORMAT_SAVE_OK = '好了……按气泡拆好了，预览对得上再关也行';
export const SULLY_FORMAT_UNDO_STEP = '刚才那步不算……猫儿退回去了';
export const SULLY_FORMAT_UNDO_SAVE = '嗯……猫儿把那条气泡撤回来了';
export const SULLY_FORMAT_UNDO_DISMISS = '就这样';
export const SULLY_FORMAT_UNDO_BAR = '刚动过气泡，要撤回来吗？';
export const SULLY_AI_REPAIR_POST_SAVE_BAR = '猫儿刚帮你保存并渲染了，还要再改吗？';
export const SULLY_AI_REPAIR_UNDO_BTN = '撤销';
export const SULLY_AI_REPAIR_RESUME_EDIT_BTN = '重新编辑';
export const SULLY_AI_REPAIR_DONE_BTN = '保存';

export const SULLY_FORMAT_SNIPPET_EMOJI = '[[SEND_EMOJI: 表情名]]';
export const SULLY_FORMAT_SNIPPET_HTML = '[html]\n<div></div>\n[/html]';
export const SULLY_FORMAT_SNIPPET_VOICE = CHAT_VOICE_SNIPPET_WITH_SUBTITLE;
export const SULLY_FORMAT_SNIPPET_BILINGUAL =
    '<翻译><原文></原文><译文></译文></翻译>';
export const SULLY_FORMAT_SNIPPET_QUOTE = '[[QUOTE: 引用原话片段]]';

export const SULLY_FORMAT_SNIPPETS_TITLE = '常用格式（点一下插进源码）';
export const SULLY_FORMAT_EMOJI_MISSING =
    '这个表情名在库里找不到……先改成 [[SEND_EMOJI: 已有名字]] 试试？';

export const SULLY_FORMAT_EDITOR_TITLE = '猫儿在理顺气泡';
export const SULLY_FORMAT_EDITOR_SAVE = '保存并重渲染';
export const SULLY_FORMAT_EDITOR_CANCEL = '先不保存';
export const SULLY_FORMAT_EDITOR_CLOSE = '关闭';
export const SULLY_FORMAT_TIDY_ALL = '一键理顺';

export type SullyComposeKind = 'plain' | 'emoji' | 'voice' | 'html' | 'bilingual';

export type SullyQuickComposeTemplate = {
    id: string;
    label: string;
    composeKind: SullyComposeKind;
    prefill: string;
    placeholder?: string;
};

/** @deprecated 用 buildQuickComposeTemplates(translationEnabled) */
export const SULLY_QUICK_COMPOSE_TEMPLATES: SullyQuickComposeTemplate[] = [];

export const SULLY_ASSISTANT_TAP_CAT_HINT = '……点一下猫儿？去聊天里选要修的泡';
export const SULLY_AI_REPAIR_MERGED_LABEL = (n: number) => `已合并 ${n} 个泡`;
export const SULLY_AI_REPAIR_PICK_EMPTY = '还没选泡……点聊天里的气泡勾选';
export const SULLY_AI_REPAIR_PICK_ROLE_MISMATCH = '选中的泡要同一边……都是角色发的，或都是你发的';

export function pickSullyAiRepairClickLine(displayName?: string): string {
    const name = (displayName || '').trim();
    const who = name || '你';
    const lines = [
        `${who}……猫儿揉揉眼睛……这条交给猫儿修好不好`,
        `唔……格式掉地上去了……猫儿捡起来试试`,
        `${who}等等……猫儿闻到了乱掉的标签味……`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
}

export const SULLY_AI_REPAIR_TITLE = '猫儿帮你修这条泡';
export const SULLY_AI_REPAIR_INPUT_PLACEHOLDER = '跟猫儿说这次要修什么……留空也行';
export const SULLY_AI_REPAIR_SEND = '交给猫儿';
export const SULLY_AI_REPAIR_CLOSE = '先不修';
export const SULLY_AI_REPAIR_SAVE = '保存并重渲染';
export const SULLY_AI_REPAIR_CANCEL = '先不保存';
/** 打开 SullyFormatEditorModal 手改源码，不走模型 */
export const SULLY_AI_REPAIR_MANUAL_EDIT = '打开源码编辑器手改';
/** 本地 sullyFormatTidy 规则理顺，不调用辅助 API */
export const SULLY_AI_REPAIR_RULE_TIDY = '本地规则理顺（不调模型）';
export const SULLY_AI_REPAIR_PREFS_TITLE = '修格式的小规矩';
export const SULLY_AI_REPAIR_PREFS_TEMP = '修格式时的温度';
export const SULLY_AI_REPAIR_PREFS_CUSTOM = '你家自定义格式（只给猫儿修格式用）';
export const SULLY_AI_REPAIR_PREFS_API_HINT = '连接要走设置里的「辅助 API」';
export const SULLY_AI_REPAIR_PREFS_OPEN_SETTINGS = '去填辅助 API';
export const SULLY_AI_REPAIR_NO_SEED = '先长按一条消息再找猫儿呀……';
export const SULLY_AI_REPAIR_NO_API = '辅助 API 还没填好……猫儿够不着模型';
export const SULLY_AI_REPAIR_PARSE_FAIL = '猫儿交稿格式歪了……你再骂她一句试试';
export const SULLY_AI_REPAIR_WORKING = '爪爪忙起来了……在帮你修格式';
export const SULLY_AI_REPAIR_STREAM_WAIT = '正在连辅助 API……';
export const SULLY_AI_REPAIR_STREAM_OK = '连上了，猫儿在写……';
export const SULLY_AI_REPAIR_SHEET_PREFS_LINK = '修格式的小规矩';

export const SULLY_ADVANCED_SNIPPETS: { label: string; text: string }[] = [
    { label: '表情包', text: SULLY_FORMAT_SNIPPET_EMOJI },
    { label: 'HTML 卡', text: SULLY_FORMAT_SNIPPET_HTML },
    { label: '语音+字幕', text: SULLY_FORMAT_SNIPPET_VOICE },
    { label: '双语块', text: SULLY_FORMAT_SNIPPET_BILINGUAL },
    { label: '引用', text: SULLY_FORMAT_SNIPPET_QUOTE },
];
