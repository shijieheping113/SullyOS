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
    insertAbove: string;
    insertBelow: string;
    lastUserGoal: string;
};
