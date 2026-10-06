import type { Message } from '../../types';
import { getChatGamePlugin, listEnabledChatGames } from './registry';
import { isChatGameEnabled } from './settings';
import type { ChatGameRecord } from './types';

const GAME_TAG = /\[\[GAME:([^\]]*)\]\]/gi;

export function normalizeGameId(raw: string): string | null {
    const id = String(raw || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(id)) return null;
    return id;
}

export function readChatGame(metadata: any): ChatGameRecord | null {
    const raw = metadata?.chatGame;
    if (!raw || typeof raw !== 'object') return null;
    const game = normalizeGameId(raw.game);
    if (!game) return null;
    if (raw.by !== 'ai' && raw.by !== 'user') return null;
    if (typeof raw.value !== 'number' && typeof raw.value !== 'string') return null;
    const record: ChatGameRecord = { game, by: raw.by, value: raw.value };
    if (typeof raw.withAi === 'number' || typeof raw.withAi === 'string') record.withAi = raw.withAi;
    if (raw.opened === true) record.opened = true;
    return record;
}

export interface DuelPair {
    aiId: number;
    userId: number;
    /** 后出的那张实际卡。合并只画在这张上。 */
    hostId: number;
    /** 先出的那张。画面上不另画，记录还在。 */
    hiddenId: number;
    userValue: number | string;
    aiValue: number | string;
}

function readPlay(message: Message): ChatGameRecord | null {
    const record = readChatGame(message.metadata);
    if (!record) return null;
    if (record.by === 'user' && message.role !== 'user') return null;
    if (record.by === 'ai' && message.role !== 'assistant') return null;
    return record;
}

/**
 * 骰子可以自己玩。中间又过了这么多轮，那把旧点数就算玩完了，不再跟后面新扔的配。
 * 一轮 = 你说完（可以连说好几句）、角色再回一次。不是按你发了几条算。
 * 猜拳要等你出，不按这个过期。
 */
const ALONE_GAME_STALE_ROUNDS = 3;

function dialogueRoundsBetween(messages: Message[], earlier: number, later: number): number {
    let rounds = 0;
    let userSpoke = false;
    for (let index = earlier + 1; index < later; index++) {
        const role = messages[index]?.role;
        if (role === 'user') {
            userSpoke = true;
            continue;
        }
        if (role === 'assistant' && userSpoke) {
            rounds += 1;
            userSpoke = false;
        }
    }
    return rounds;
}

function aloneHandWentStale(
    messages: Message[],
    waitingIndex: number,
    index: number,
    gameId: string,
): boolean {
    const plugin = getChatGamePlugin(gameId);
    if (!plugin?.aiAlone) return false;
    return dialogueRoundsBetween(messages, waitingIndex, index) >= ALONE_GAME_STALE_ROUNDS;
}

/**
 * 一轮里先出的那只手还空着，后出的对手才配成对决。
 * 两边都出过之后这一轮就关上。下一轮有人先出、对手还没出，不跟上一轮拼。
 * 骰子隔了三轮对话，旧的那把不再配。合并只画在后出的那张上。正文不改。
 */
export function pairedDuelCards(messages: Message[]): DuelPair[] {
    const pairs: DuelPair[] = [];
    const open = new Map<string, { message: Message; index: number; record: ChatGameRecord }>();
    (messages || []).forEach((message, index) => {
        const record = readPlay(message);
        if (!record) return;
        const waiting = open.get(record.game);
        if (waiting && waiting.record.by !== record.by) {
            if (aloneHandWentStale(messages, waiting.index, index, record.game)) {
                open.set(record.game, { message, index, record });
                return;
            }
            const aiIsNew = record.by === 'ai';
            const ai = aiIsNew ? message : waiting.message;
            const user = aiIsNew ? waiting.message : message;
            const aiIndex = aiIsNew ? index : waiting.index;
            const userIndex = aiIsNew ? waiting.index : index;
            const aiRecord = aiIsNew ? record : waiting.record;
            const userRecord = aiIsNew ? waiting.record : record;
            const hostIsUser = userIndex > aiIndex;
            pairs.push({
                aiId: ai.id,
                userId: user.id,
                hostId: hostIsUser ? user.id : ai.id,
                hiddenId: hostIsUser ? ai.id : user.id,
                userValue: userRecord.value,
                aiValue: aiRecord.value,
            });
            open.delete(record.game);
            return;
        }
        open.set(record.game, { message, index, record });
    });
    return pairs;
}

/** 这一轮角色已经出了、你还没出时，返回那张角色卡。上一轮已经配过的不返回。 */
export function findAiGameInOpenTurn(messages: Message[], gameId: string): Message | null {
    const list = messages || [];
    const open = new Map<string, { message: Message; index: number }>();
    list.forEach((message, index) => {
        const record = readPlay(message);
        if (!record || record.game !== gameId) return;
        const waiting = open.get(gameId);
        const waitingRecord = waiting ? readPlay(waiting.message) : null;
        if (waiting && waitingRecord && waitingRecord.by !== record.by) {
            if (aloneHandWentStale(list, waiting.index, index, gameId)) {
                open.set(gameId, { message, index });
                return;
            }
            open.delete(gameId);
            return;
        }
        open.set(gameId, { message, index });
    });
    const waiting = open.get(gameId);
    const record = waiting ? readPlay(waiting.message) : null;
    if (!waiting || record?.by !== 'ai') return null;
    if (aloneHandWentStale(list, waiting.index, list.length, gameId)) return null;
    return waiting.message;
}

export function plainChatGameClause(record: ChatGameRecord, charName: string): string | null {
    const plugin = getChatGamePlugin(record.game);
    if (!plugin) return null;
    if (record.by === 'user') {
        const mine = plugin.clause('你', record.value);
        if (!mine) return null;
        if (record.withAi == null) return mine;
        const theirs = plugin.clause(charName || '对方', record.withAi);
        return theirs ? `${mine}，${theirs}` : mine;
    }
    return plugin.clause(charName || '对方', record.value);
}

/**
 * 给模型看的一句。
 * 提示词里的「你」是角色自己。用户那一手必须写「用户」，不能再写「你」，
 * 不然角色会把用户出的当成自己出的。
 * 没有小游戏记录时返回空，调用方继续走原来的戳一戳句子。
 */
export function formatChatGameForModel(msg: { metadata?: any }, charName: string, reveal = false): string | null {
    const record = readChatGame(msg.metadata);
    if (!record) return null;
    if (reveal) record.opened = true;
    const plugin = getChatGamePlugin(record.game);
    if (!plugin) return null;
    if (chatGameIsSealed(record)) {
        return `[系统: 你出了猜拳，还盖着。用户还没出。不要说出你出的是什么，不要再输出 [[GAME:${record.game}]]。]`;
    }
    const self = charName ? `你（${charName}）` : '你';
    const actor = record.by === 'user' ? '用户' : self;
    const mine = plugin.clause(actor, record.value);
    if (!mine) return null;
    if (record.by === 'user' && record.withAi != null) {
        const theirs = plugin.clause(self, record.withAi);
        return theirs ? `[系统: ${mine}，${theirs}]` : `[系统: ${mine}]`;
    }
    return `[系统: ${mine}]`;
}

/** 合并只是画面，删除按点到的那条消息走，不连带另一张。 */
export function expandChatGameDeleteIds(_messages: Message[], ids: number[]): number[] {
    return ids.filter(id => Number.isFinite(id));
}

export function chatGameIsSealed(record: ChatGameRecord): boolean {
    const plugin = getChatGamePlugin(record.game);
    return !!plugin?.needUser && record.by === 'ai' && record.opened !== true;
}

export function planGameTags(content: string, enabled: (id: string) => boolean): { ids: string[]; content: string } {
    const ids: string[] = [];
    const seen = new Set<string>();
    const source = String(content || '');
    let match: RegExpExecArray | null;
    const re = new RegExp(GAME_TAG.source, 'gi');
    while ((match = re.exec(source))) {
        const id = normalizeGameId(match[1]);
        if (!id || seen.has(id) || !enabled(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    const stripped = source.replace(/\[\[GAME:[^\]]*\]\]/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { ids, content: stripped };
}

export function stripGameTags(content: string): string {
    return planGameTags(content, () => false).content;
}

/** 照当前开着的插件拼。一款都没开就返回空，调用方整段不插。 */
export function buildChatGamesGuide(store?: Storage | null): string {
    const plugins = listEnabledChatGames(store);
    if (!plugins.length) return '';
    const countWord = plugins.length === 1 ? '一' : plugins.length === 2 ? '两' : String(plugins.length);
    const lines: string[] = ['【小游戏】', `现在有${countWord}种玩法：`, ''];
    plugins.forEach((plugin) => {
        lines.push(plugin.playLine);
        plugin.ruleLines.forEach(line => lines.push(line));
        if (plugin.aiAlone) lines.push('  你自己也能拿来决定事情，不用问用户。');
    });
    lines.push('');
    lines.push('怎么用：');
    lines.push('- 用户让你扔、让你出拳，或者你自己想现在就玩，这一轮就写对应记号。');
    lines.push('- 记号一出来系统马上摇。点数和手势是系统摇的，你改不了，不要自己编。');
    lines.push('- 拿到结果之后你自己看着办，你平时怎么说话就怎么说。');
    lines.push('- 系统没给结果，就是还没摇，不要自己编点数或手势。');
    return `\n${lines.join('\n')}\n`;
}

/** 只有不需要等用户出手的玩法才接话。猜拳要保密到手势揭开，不进接话。 */
export function followUpRolls<T extends { id: string }>(rolls: T[]): T[] {
    return rolls.filter((roll) => {
        const plugin = getChatGamePlugin(roll.id);
        return !!plugin && !plugin.needUser;
    });
}

export function shouldRequestGameFollowUp(rolls: Array<{ id: string }>, rerunPending: boolean): boolean {
    return !rerunPending && followUpRolls(rolls).length > 0;
}

export function gameFollowUpNote(rolls: Array<{ id: string; value: number | string }>): string {
    return rolls.map((roll) => {
        const plugin = getChatGamePlugin(roll.id);
        if (!plugin) return '';
        const clause = plugin.clause('你', roll.value);
        if (!clause) return '';
        if (plugin.needUser) {
            return `[系统: 你出了${plugin.name}，还盖着。这一手是你出的，不是用户出的。用户还没出。不要说出你出的是什么。不要再输出 [[GAME:${plugin.id}]]。]`;
        }
        return `[系统: ${clause}。这一手是你掷的，不是用户掷的。这是系统摇的，已经定死。请用你自己的口气接着说。不要改口换成别的结果，不要再输出 [[GAME:${plugin.id}]]。]`;
    }).filter(Boolean).join('\n');
}

export function isKnownEnabledGame(id: string, store?: Storage | null): boolean {
    return !!getChatGamePlugin(id) && isChatGameEnabled(id, store);
}
