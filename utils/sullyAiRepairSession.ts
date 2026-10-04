import type { SullyRepairChatTurn } from './sullyRepairPrompt';

export type SullyAiRepairUiBubble = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
};

/** 保存并渲染后「重新编辑」时恢复的猫儿修格式会话 */
export type SullyAiRepairResumeSession = {
    charId: string;
    anchorMessageId: number;
    priorTurns: SullyRepairChatTurn[];
    uiBubbles: SullyAiRepairUiBubble[];
    draftSource: string;
    /** 多条一起修时，每条自己的稿。旧会话没有这个字段。 */
    slotSources?: { id: number | 'new'; source: string }[];
    insertAbove: string;
    insertBelow: string;
    lastUserGoal: string;
};
