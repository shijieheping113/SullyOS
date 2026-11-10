/**
 * 见面「继续上次」：只在当前 AI 上下文原文范围内找见面记录，
 * 解析最近一场并铺轻量播放状态（不停 savedDateState 快照）。
 */
import type { DateObserveCustomField, DateState, DialogueItem, Message } from '../types';
import { extractObservation, hasObservation } from './datePrompts';
import { splitDateEncounters } from './dateHistory';

const VOICE_EMOTION_TAG_RE = /\[v:\s*([a-zA-Z]+)\s*\]/i;

const isContextNoise = (line: string) => {
    const l = line.trim().toLowerCase();
    if (l.startsWith('(') && l.endsWith(')')) {
        if (l.includes('in person') || l.includes('face-to-face') || l.includes('location') || l.includes('time')) return true;
    }
    if (l.startsWith('[system') || l.startsWith('(system')) return true;
    return false;
};

/** 与 DateSession.parseDialogue 同规则：立绘 [emotion] + 可选 [v:xxx]，供续场铺末轮。 */
export const parseDateDialogueForResume = (fullText: string, initialEmotion = 'normal'): DialogueItem[] => {
    if (!fullText) return [];
    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const results: DialogueItem[] = [];
    let currentEmotion = initialEmotion;

    for (const rawLine of lines) {
        if (isContextNoise(rawLine)) continue;
        let voiceEmotion: string | undefined;
        const withoutVoice = rawLine.replace(VOICE_EMOTION_TAG_RE, (_m, e: string) => {
            const k = (e || '').toLowerCase();
            if (k) voiceEmotion = k;
            return '';
        }).trim();
        if (!withoutVoice) continue;
        const tagMatch = withoutVoice.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.*)/);
        let content = withoutVoice;
        if (tagMatch) {
            currentEmotion = tagMatch[1].toLowerCase();
            content = tagMatch[2];
        } else {
            const standaloneTag = withoutVoice.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
            if (standaloneTag) {
                currentEmotion = standaloneTag[1].toLowerCase();
                continue;
            }
        }
        if (content) results.push({ text: content, emotion: currentEmotion, voiceEmotion });
    }
    return results;
};

export const isDateSourceMessage = (message: Message): boolean =>
    !message.groupId && message.metadata?.source === 'date';

export const dateMessagesInContext = (contextMessages: Message[]): Message[] =>
    contextMessages.filter(isDateSourceMessage);

const assistantDisplayText = (message: Message): string => {
    const surface = message.metadata?.sarModuleSurface?.surface;
    if (typeof surface === 'string' && surface.trim()) return surface.trim();
    return message.content || '';
};

export const buildDateResumeState = (
    lastAssistant: Message,
    opts?: { custom?: DateObserveCustomField[]; lenientObserve?: boolean },
): DateState => {
    const raw = assistantDisplayText(lastAssistant);
    const { observation, rest } = extractObservation(raw, {
        lenient: opts?.lenientObserve === true,
        custom: opts?.custom,
    });
    const items = parseDateDialogueForResume(rest || raw, 'normal');
    const last = items[items.length - 1];
    return {
        dialogueBatch: items,
        dialogueQueue: [],
        currentText: last?.text || (rest || raw).trim() || '',
        currentSpriteKey: last?.emotion || 'normal',
        isNovelMode: false,
        timestamp: lastAssistant.timestamp || Date.now(),
        peekStatus: '',
        ...(hasObservation(observation) ? { observation } : {}),
    };
};

export interface DateContinuePlan {
    /** 有场次号则沿用；旧数据没有时为 undefined，由调用方新开 UUID。 */
    encounterId?: string;
    initialState: DateState;
    /** 用于测试/调试：该场末条助手消息。 */
    lastAssistant?: Message;
}

/**
 * 从「当前上下文原文」解析是否可继续上次见面。
 * 仅看范围内的 source=date；取时间上最近一场。
 */
export const resolveDateContinueFromContext = (
    contextMessages: Message[],
    opts?: { custom?: DateObserveCustomField[]; lenientObserve?: boolean },
): DateContinuePlan | null => {
    const dateMsgs = dateMessagesInContext(contextMessages);
    if (dateMsgs.length === 0) return null;

    const groups = splitDateEncounters(dateMsgs);
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup.messages.length === 0) return null;

    let encounterId: string | undefined;
    for (const message of lastGroup.messages) {
        const id = message.metadata?.dateEncounterId;
        if (typeof id === 'string' && id) {
            encounterId = id;
            break;
        }
    }

    let lastAssistant: Message | undefined;
    for (let i = lastGroup.messages.length - 1; i >= 0; i--) {
        if (lastGroup.messages[i].role === 'assistant') {
            lastAssistant = lastGroup.messages[i];
            break;
        }
    }

    const initialState = lastAssistant
        ? buildDateResumeState(lastAssistant, opts)
        : {
            dialogueBatch: [],
            dialogueQueue: [],
            currentText: '',
            currentSpriteKey: 'normal',
            isNovelMode: false,
            timestamp: Date.now(),
            peekStatus: '',
        };

    return { encounterId, initialState, lastAssistant };
};
