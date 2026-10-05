/**
 * 电量提醒的说话链路：隐藏提示 → 主 API → 辅助 API → 固定文案 → 写入聊天。
 * 辅助失败就停，不再回头打主 API。
 * 这一层不读、不写「来回账本」。账本由监听电量的那边维护，测试台因此不会把真的一轮提前用掉。
 *
 * 请求里有人设、记忆、最近聊天记录，和电量那一句。
 * 不走主聊天那套提示词，所以没有语音格式、表情包清单、行为规范。
 */
import type { APIConfig, CharacterProfile, GroupProfile, Message, RealtimeConfig, UserProfile } from '../types';
import { DB } from './db';
import { ChatParser } from './chatParser';
import { loadCharacterContextRange } from './chatContextRange';
import { extractContent, safeFetchJson } from './safeApi';
import { isSecondaryLlmReady } from './secondaryLlmApi';
import { secondaryLlmCall } from './secondaryLlmCall';
import { injectMemoryPalace } from './memoryPalace/pipeline';
import { getChibi } from './vrWorld/chibi';
import {
    BATTERY_PLAIN_RULE,
    batteryFallbackText,
    batteryHintText,
    batteryHistoryTurns,
    batteryMemoryBlock,
    batterySourceLine,
    batteryStandaloneSystem,
    batteryUserName,
    clampBatteryLevel,
    pickBatterySentence,
    writeBatteryLastTrigger,
    type BatteryKind,
} from './batteryReminder';

export interface BatterySpeech {
    charId: string;
    charName: string;
    chibi: string;
    text: string;
    kind: BatteryKind;
    level: number;
    systemFallback: boolean;
}

type ChatTurn = { role: string; content: unknown };

const tidyReply = (raw: string): string => ChatParser.sanitize(pickBatterySentence(raw)).trim();

const withPlainRule = (messages: ChatTurn[]): ChatTurn[] => ([
    ...messages,
    { role: 'system', content: `[系统提示：${BATTERY_PLAIN_RULE}]` },
]);

const asTextTurns = (messages: ChatTurn[]): { role: string; content: string }[] => (
    messages.map(message => ({
        role: message.role,
        content: typeof message.content === 'string' ? message.content : '',
    })).filter(message => message.role && message.content.trim())
);

const callMain = async (
    apiConfig: APIConfig,
    messages: ChatTurn[],
    char: CharacterProfile,
): Promise<string> => {
    if (!apiConfig?.baseUrl?.trim()) throw new Error('main-api-missing');
    const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
    const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiConfig.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify({
            model: apiConfig.model,
            messages,
            temperature: typeof apiConfig.temperature === 'number' ? apiConfig.temperature : 0.85,
            stream: false,
        }),
    }, 1, 45_000, {
        appName: '消息',
        charId: char.id,
        charName: char.name,
        purpose: '电量提醒',
    });
    const text = tidyReply(extractContent(data));
    if (!text) throw new Error('main-api-empty');
    return text;
};

const callAux = async (
    apiConfig: APIConfig,
    messages: ChatTurn[],
    char: CharacterProfile,
): Promise<string> => {
    if (!isSecondaryLlmReady(apiConfig.secondaryLlm)) throw new Error('aux-not-configured');
    const text = tidyReply(await secondaryLlmCall({
        config: apiConfig.secondaryLlm!,
        purpose: '电量提醒',
        messages: asTextTurns(messages),
        charId: char.id,
        featureOpts: { temperature: 0.85 },
        timeoutMs: 45_000,
    }));
    if (!text) throw new Error('aux-empty');
    return text;
};

/** 跟主聊天同一个阅读范围。读不到就当没有记录，提醒本身还是要发。 */
const loadBatteryHistory = async (char: CharacterProfile): Promise<Message[]> => {
    try {
        return (await loadCharacterContextRange(char)).messages;
    } catch (error) {
        console.error('[电量提醒] 聊天记录没读到', error);
        return [];
    }
};

/** 宫殿开着才现召回一次。关着不动角色身上残留的旧注入。 */
const refreshBatteryMemory = async (
    char: CharacterProfile,
    history: Message[],
    userName: string,
): Promise<void> => {
    if (!char.memoryPalaceEnabled) return;
    try {
        await injectMemoryPalace(char, history, '手机电量', userName, { entryPoint: 'chat_payload' });
    } catch (error) {
        console.error('[电量提醒] 记忆没召回到，用已经在的那份', error);
    }
};

export async function pickLatestChattedCharacter(characters: CharacterProfile[]): Promise<CharacterProfile | null> {
    let best: { char: CharacterProfile; ts: number } | null = null;
    for (const char of characters) {
        if (!char?.id) continue;
        const messages = await DB.getRecentMessagesByCharId(char.id, 20, true);
        let lastTs = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.groupId) continue;
            if (message.metadata?.batteryHint || message.metadata?.proactiveHint || message.metadata?.hidden) continue;
            lastTs = message.timestamp || 0;
            break;
        }
        if (!lastTs) continue;
        if (!best || lastTs > best.ts) best = { char, ts: lastTs };
    }
    return best?.char ?? null;
}

export async function runBatteryReminder(opts: {
    kind: BatteryKind;
    level: number;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: APIConfig;
    groups: GroupProfile[];
    realtimeConfig?: RealtimeConfig;
    forceFallback?: boolean;
}): Promise<BatterySpeech | null> {
    const char = await pickLatestChattedCharacter(opts.characters);
    if (!char) return null;

    const kind = opts.kind;
    const level = kind === 'full' ? 100 : clampBatteryLevel(opts.level);
    const userName = batteryUserName(opts.userProfile?.name);
    const hint = batteryHintText(kind, userName, level);
    const chibi = getChibi(char).img || '';
    let text = '';
    let systemFallback = false;

    if (opts.forceFallback) {
        text = batteryFallbackText(kind, level);
        systemFallback = true;
    } else {
        const historyMessages = await loadBatteryHistory(char);
        await refreshBatteryMemory(char, historyMessages, userName);
        const memoryText = batteryMemoryBlock(char);
        const historyTurns = batteryHistoryTurns(historyMessages, char.name || '角色', userName);
        let messages: ChatTurn[] = withPlainRule([
            { role: 'system', content: batteryStandaloneSystem(char.name, char.systemPrompt || char.description || '') },
            ...(memoryText ? [{ role: 'system', content: memoryText }] : []),
            ...historyTurns,
            { role: 'user', content: hint },
        ]);
        try {
            await DB.saveMessage({
                charId: char.id,
                role: 'user',
                type: 'text',
                content: hint,
                metadata: { batteryHint: true, hidden: true },
            });
        } catch (error) {
            console.error('[电量提醒] 隐藏提示没记下', error);
        }

        try {
            text = await callMain(opts.apiConfig, messages, char);
        } catch (error) {
            console.error('[电量提醒] 主 API 没说出来', error);
            text = '';
        }

        if (!text) {
            if (isSecondaryLlmReady(opts.apiConfig?.secondaryLlm)) {
                try {
                    text = await callAux(opts.apiConfig, messages, char);
                } catch (error) {
                    console.error('[电量提醒] 辅助 API 没说出来，停在这里', error);
                    text = '';
                }
            }
        }

        if (!text) {
            text = batteryFallbackText(kind, level);
            systemFallback = true;
        }
    }

    await DB.saveMessage({
        charId: char.id,
        role: 'assistant',
        type: 'text',
        content: text,
        metadata: {
            batteryReminder: true,
            batteryKind: kind,
            batteryLevel: level,
            batterySource: batterySourceLine(kind, systemFallback),
            batteryChibi: chibi,
            ...(systemFallback ? { batterySystemFallback: true } : {}),
        },
    });

    writeBatteryLastTrigger({ kind, at: Date.now(), systemFallback });
    const speech: BatterySpeech = {
        charId: char.id,
        charName: char.name || '角色',
        chibi,
        text,
        kind,
        level,
        systemFallback,
    };
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('battery-reminder-landed', { detail: { charId: char.id } }));
        window.dispatchEvent(new CustomEvent('battery-reminder-show', { detail: speech }));
    }
    return speech;
}
