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

/** 角色这一轮还没被用户插话时，找它刚掷的那一条。 */
export function findAiGameInOpenTurn(messages: Message[], gameId: string): Message | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === 'user') return null;
        const record = readChatGame(message.metadata);
        if (message.role === 'assistant' && record && record.game === gameId && record.by === 'ai') {
            return message;
        }
    }
    return null;
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
export function formatChatGameForModel(msg: { metadata?: any }, charName: string): string | null {
    const record = readChatGame(msg.metadata);
    if (!record) return null;
    const plugin = getChatGamePlugin(record.game);
    if (!plugin) return null;
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

/** 删掉一把时，把同一把的角色卡和用户卡一起从记录里拿走，避免删了一条、模型还读着另一条。 */
export function expandChatGameDeleteIds(messages: Message[], ids: number[]): number[] {
    const wanted = new Set(ids.filter(id => Number.isFinite(id)));
    const sorted = (messages || []).filter(message => message && !message.groupId).sort((a, b) => a.id - b.id);
    const indexById = new Map(sorted.map((message, index) => [message.id, index]));
    for (const id of [...wanted]) {
        const index = indexById.get(id);
        const message = index == null ? undefined : sorted[index];
        const record = message ? readChatGame(message.metadata) : null;
        if (!message || !record) continue;
        if (record.by === 'user') {
            for (let cursor = index - 1; cursor >= 0; cursor--) {
                const previous = sorted[cursor];
                if (previous.charId !== message.charId) continue;
                const earlier = readChatGame(previous.metadata);
                if (earlier?.by === 'user' && earlier.game === record.game) break;
                if (earlier?.by === 'ai' && earlier.game === record.game && (record.withAi == null || earlier.value === record.withAi)) {
                    wanted.add(previous.id);
                    break;
                }
            }
            continue;
        }
        for (let cursor = index + 1; cursor < sorted.length; cursor++) {
            const next = sorted[cursor];
            if (next.charId !== message.charId) continue;
            const later = readChatGame(next.metadata);
            if (later?.by === 'ai' && later.game === record.game) break;
            if (later?.by === 'user' && later.game === record.game && (later.withAi == null || later.withAi === record.value)) {
                wanted.add(next.id);
                break;
            }
        }
    }
    return [...wanted];
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
        lines.push(plugin.aiAlone
            ? '  你自己也能拿来决定事情，不用问用户。'
            : '  必须用户也出一只手才成立，你不能自己单方面玩。');
    });
    lines.push('');
    lines.push('怎么用：');
    lines.push('- 想跟用户玩的时候，先问一句要不要玩。用户答应了，你再在之后某一轮发起；');
    lines.push('  用户没答应就不要发起。');
    lines.push('- 用户问你要不要玩，你如果答应，这一轮只说话，不要输出 [[GAME:dice]] 或 [[GAME:rps]]。');
    lines.push('- 什么时候扔由你决定。只有你决定现在就扔的那一轮，才写记号。');
    lines.push('  记号一出来系统马上摇，你改不了时机，不要提前写。');
    lines.push('- 拿到结果之后你自己看着办：拿骰子决定事情、跟用户比大小、还是纯粹好玩，');
    lines.push('  都随你，你平时怎么说话就怎么说。');
    lines.push('- 不要自己编点数或手势——系统没给，就是还没摇。');
    return `\n${lines.join('\n')}\n`;
}

export function gameFollowUpNote(rolls: Array<{ id: string; value: number | string }>): string {
    return rolls.map((roll) => {
        const plugin = getChatGamePlugin(roll.id);
        if (!plugin) return '';
        const clause = plugin.clause('你', roll.value);
        if (!clause) return '';
        if (plugin.needUser) {
            return `[系统: ${clause}。这一手是你出的，不是用户出的。已经封存，用户还没出，界面上先盖着。请接一句请对方出。先不要说出你出的是什么。不要再输出 [[GAME:${plugin.id}]]。]`;
        }
        return `[系统: ${clause}。这一手是你掷的，不是用户掷的。这是系统摇的，已经定死。请用你自己的口气接着说。不要改口换成别的结果，不要再输出 [[GAME:${plugin.id}]]。]`;
    }).filter(Boolean).join('\n');
}

export function isKnownEnabledGame(id: string, store?: Storage | null): boolean {
    return !!getChatGamePlugin(id) && isChatGameEnabled(id, store);
}
