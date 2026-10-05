import type { Message } from '../../types';
import { DB } from '../db';
import { getChatGamePlugin } from './registry';
import { isChatGameEnabled } from './settings';
import { normalizeGameId, plainChatGameClause, planGameTags, readChatGame } from './text';
import type { ChatGameRecord } from './types';

export function gameTurnKey(metadata: any): string {
    const own = metadata?.chatGame?.turnKey;
    if (typeof own === 'string' && own.trim()) return own.trim();
    const id = metadata?.activeMsg2?.messageId;
    if (typeof id === 'string' && id.trim()) return id.trim();
    if (typeof id === 'number' && Number.isFinite(id)) return String(id);
    return '';
}

function alreadyRolled(recent: Message[], gameId: string, turnKey: string): boolean {
    if (!turnKey) return false;
    return recent.some((message) => {
        if (message.role !== 'assistant') return false;
        const record = readChatGame(message.metadata);
        if (!record || record.game !== gameId || record.by !== 'ai') return false;
        return gameTurnKey(message.metadata) === turnKey;
    });
}

export interface GameRollResult {
    id: string;
    value: number | string;
}

type GamePart = { kind: 'text'; text: string } | { kind: 'game'; id: string };

function splitGameParts(content: string, enabled: (id: string) => boolean): GamePart[] {
    const parts: GamePart[] = [];
    const seen = new Set<string>();
    const source = String(content || '');
    const re = /\[\[GAME:([^\]]*)\]\]/gi;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
        const before = source.slice(last, match.index);
        if (before) parts.push({ kind: 'text', text: before });
        const id = normalizeGameId(match[1]);
        if (id && !seen.has(id) && enabled(id)) {
            seen.add(id);
            parts.push({ kind: 'game', id });
        }
        last = match.index + match[0].length;
    }
    const tail = source.slice(last);
    if (tail) parts.push({ kind: 'text', text: tail });
    return parts;
}

function cleanGameText(raw: string): string {
    return raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function hasOtherTags(content: string): boolean {
    const blocking = content.replace(/\[\[INNER_STATE:\s*[\s\S]*?\]\]/gi, '');
    return /\[\[/.test(blocking);
}

export interface GamePersistResult {
    content: string;
    rolls: GameRollResult[];
    /** 记号前后的话已经按顺序落过库。调用方不要再存一遍。 */
    speechSaved: boolean;
    /** 已经落过库的那些话，给接话模型当上文。 */
    spoken: string;
}

/**
 * 把正文里的 [[GAME:id]] 换成已经掷好的卡片。
 * 关着的、不认识的记号只删掉，不报错，也不出空消息。
 * 同一次云端重试靠 turnKey 认上次那张卡，不再重摇。
 * 卡片单独落库，不继承当轮回复的 activeMsg2。话在记号前面的先落，卡在中间，后面的话再落。
 */
export async function persistGameTagsFromText(args: {
    content: string;
    charId: string;
    charName: string;
    persist: (msg: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }) => Promise<unknown>;
    inheritMeta?: Record<string, any>;
    loadRecent?: () => Promise<Message[]>;
    timestamp?: number;
    /** 卡片走这里，避开会把 inheritMeta 铺回去的那层。 */
    saveBare?: (msg: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }) => Promise<unknown>;
    /** 有的话，记号前后的正文交给它。没有就用 persist 存成普通文字。 */
    persistText?: (text: string) => Promise<void>;
}): Promise<GamePersistResult> {
    const enabled = (id: string) => isChatGameEnabled(id) && !!getChatGamePlugin(id);
    const planned = planGameTags(args.content, enabled);
    if (!/\[\[GAME:/i.test(args.content || '')) {
        return { content: args.content, rolls: [], speechSaved: false, spoken: '' };
    }
    if (!planned.ids.length) {
        return { content: planned.content, rolls: [], speechSaved: false, spoken: '' };
    }
    const turnKey = gameTurnKey(args.inheritMeta);
    const recent = turnKey && args.loadRecent ? await args.loadRecent() : [];
    const otherTags = hasOtherTags(planned.content);
    if (!otherTags && turnKey && planned.ids.every((id) => alreadyRolled(recent, id, turnKey))) {
        return { content: '', rolls: [], speechSaved: false, spoken: '' };
    }
    const saveCard = args.saveBare ?? ((msg) => DB.saveMessage(msg));
    const rolls: GameRollResult[] = [];
    const spokenParts: string[] = [];
    const parts = splitGameParts(args.content, enabled);
    for (const part of parts) {
        if (part.kind === 'text') {
            if (otherTags) continue;
            const text = cleanGameText(part.text);
            if (!text) continue;
            spokenParts.push(text);
            if (args.persistText) await args.persistText(text);
            else {
                await args.persist({
                    charId: args.charId,
                    role: 'assistant',
                    type: 'text',
                    content: text,
                    ...(args.timestamp != null ? { timestamp: args.timestamp } : {}),
                    metadata: { ...(args.inheritMeta || {}) },
                });
            }
            continue;
        }
        if (alreadyRolled(recent, part.id, turnKey)) continue;
        const plugin = getChatGamePlugin(part.id);
        if (!plugin) continue;
        let value: number | string;
        try {
            value = plugin.roll();
        } catch (error) {
            console.warn('[chat-game] 摇不了', part.id, error);
            continue;
        }
        const record: ChatGameRecord = { game: part.id, by: 'ai', value };
        const clause = plainChatGameClause(record, args.charName);
        if (!clause) continue;
        const content = plugin.needUser ? `${plugin.name} · 等你出` : clause;
        const chatGame = turnKey ? { ...record, turnKey } : record;
        await saveCard({
            charId: args.charId,
            role: 'assistant',
            type: 'interaction',
            content,
            timestamp: args.timestamp ?? Date.now(),
            metadata: { chatGame },
        });
        rolls.push({ id: part.id, value });
    }
    if (otherTags) {
        return { content: planned.content, rolls, speechSaved: false, spoken: '' };
    }
    return { content: '', rolls, speechSaved: spokenParts.length > 0, spoken: spokenParts.join('\n') };
}

export async function loadRecentForGameDedupe(charId: string): Promise<Message[]> {
    return DB.getRecentMessagesByCharId(charId, 40, true);
}
