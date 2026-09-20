import type { APIConfig } from '../types';
import { resolveVoiceActingGuideFromApiConfig, type ChatVoicePromptOptions } from './voiceMessagePrompt';
import { isSecondaryLlmReady } from './secondaryLlmApi';
import { SecondaryLlmNotConfiguredError, secondaryLlmCall } from './secondaryLlmCall';
import { loadSullyRepairPrefs } from './sullyRepairPrefs';
import {
    buildSullyRepairMessages,
    type SullyRepairChatTurn,
} from './sullyRepairPrompt';
import { parseSullyRepairResponse, type SullyRepairParseResult } from './sullyRepairParse';
import {
    inferRepairFormatKind,
    postProcessRepairedSource,
    sanitizeRepairReplyForDisplay,
} from './sullyRepairPostProcess';

export type SullyRepairStreamPhase = 'idle' | 'waiting' | 'streaming';

export type SullyRepairRoundInput = {
    apiConfig: APIConfig;
    displayName: string;
    draftSource: string;
    userGoal: string;
    priorTurns: SullyRepairChatTurn[];
    charId?: string;
    htmlModeCustomPrompt?: string;
    chatVoice?: ChatVoicePromptOptions;
    emojis?: import('../types').Emoji[];
    categories?: import('../types').EmojiCategory[];
    onStreamPhase?: (phase: SullyRepairStreamPhase) => void;
};

export type SullyRepairRoundResult = SullyRepairParseResult & {
    raw: string;
};

export async function runSullyRepairRound(input: SullyRepairRoundInput): Promise<SullyRepairRoundResult> {
    const secondary = input.apiConfig.secondaryLlm;
    if (!isSecondaryLlmReady(secondary)) {
        throw new SecondaryLlmNotConfiguredError();
    }
    const prefs = loadSullyRepairPrefs();
    const voiceActingGuide = resolveVoiceActingGuideFromApiConfig(input.apiConfig);
    const messages = buildSullyRepairMessages({
        displayName: input.displayName,
        draftSource: input.draftSource,
        userGoal: input.userGoal,
        priorTurns: input.priorTurns,
        htmlModeCustomPrompt: input.htmlModeCustomPrompt,
        chatVoice: {
            ...input.chatVoice,
            voiceActingGuide,
        },
        emojis: input.emojis,
        categories: input.categories,
    });
    input.onStreamPhase?.('waiting');
    let sawDelta = false;
    const raw = await secondaryLlmCall({
        config: secondary!,
        purpose: 'sully-format-repair',
        messages,
        featureOpts: { temperature: prefs.temperature },
        charId: input.charId,
        streamHooks: {
            onDelta: () => {
                if (!sawDelta) {
                    sawDelta = true;
                    input.onStreamPhase?.('streaming');
                }
            },
        },
    });
    input.onStreamPhase?.('idle');
    const parsed = parseSullyRepairResponse(raw);
    const anchorKind = inferRepairFormatKind(input.draftSource);
    const reply = sanitizeRepairReplyForDisplay(parsed.reply);
    const fixedRaw = parsed.fixedSource.trim() || input.draftSource;
    const fixedSource = postProcessRepairedSource(fixedRaw, anchorKind, { userGoal: input.userGoal });
    const insertAbove = parsed.insertAbove
        ? postProcessRepairedSource(parsed.insertAbove, inferRepairFormatKind(parsed.insertAbove), { userGoal: input.userGoal })
        : '';
    const insertBelow = parsed.insertBelow
        ? postProcessRepairedSource(parsed.insertBelow, inferRepairFormatKind(parsed.insertBelow), { userGoal: input.userGoal })
        : '';
    return {
        ...parsed,
        reply,
        fixedSource,
        insertAbove,
        insertBelow,
        raw,
    };
}
