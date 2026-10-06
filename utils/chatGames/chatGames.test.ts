import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types';
import { ChatPrompts } from '../chatPrompts';
import { normalizeMessageContent } from '../messageFormat';
import { randomInt } from '../random';
import { persistGameTagsFromText } from './commit';
import { diceGame } from './dice';
import { rpsGame } from './rps';
import { canRerollGameTurn, rerollTrailingAiGames } from './reroll';
import { hasRerunTags, stripRerunTags } from './tags';
import { DB } from '../db';
import {
    CHAT_GAMES_STORAGE_KEY,
    isChatGameEnabled,
    readChatGameSettings,
    writeChatGameEnabled,
    writeChatGameMaster,
} from './settings';
import {
    buildChatGamesGuide,
    chatGameIsSealed,
    pairedDuelCards,
    findAiGameInOpenTurn,
    expandChatGameDeleteIds,
    formatChatGameForModel,
    followUpRolls,
    gameFollowUpNote,
    planGameTags,
    shouldRequestGameFollowUp,
    stripGameTags,
} from './text';

function memoryStorage(initial: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key)! : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: (key) => { map.delete(key); },
        clear: () => map.clear(),
        key: (index) => [...map.keys()][index] ?? null,
        get length() { return map.size; },
    };
}

function message(over: Partial<Message>): Message {
    return {
        id: 1,
        charId: 'c',
        role: 'assistant',
        type: 'interaction',
        content: '',
        timestamp: 1,
        ...over,
    };
}

describe('随机', () => {
    it('只接受注入源给出的范围内整数', () => {
        expect(randomInt(6, () => 0)).toBe(0);
        expect(randomInt(6, () => 0.999)).toBe(5);
        expect(() => randomInt(0)).toThrow();
        expect(() => randomInt(6, () => 2)).toThrow();
    });

    it('退回取模时 6 点落在偏少的那一侧', () => {
        const span = 6;
        const limit = Math.floor(0x100000000 / span) * span;
        expect(limit % span).toBe(0);
        expect(0x100000000 % span).toBe(4);
        const extra = [0, 0, 0, 0, 0, 0];
        for (let n = limit; n < 0x100000000; n++) extra[n % span] += 1;
        expect(extra).toEqual([1, 1, 1, 1, 0, 0]);
    });
});

describe('开关', () => {
    it('没写过的键默认开，总开关关掉才整组关掉', () => {
        const store = memoryStorage();
        expect(readChatGameSettings(store).master).toBe(true);
        expect(isChatGameEnabled('dice', store)).toBe(true);
        expect(isChatGameEnabled('rps', store)).toBe(true);

        writeChatGameEnabled('rps', false, store);
        expect(isChatGameEnabled('dice', store)).toBe(true);
        expect(isChatGameEnabled('rps', store)).toBe(false);

        writeChatGameMaster(false, store);
        expect(isChatGameEnabled('dice', store)).toBe(false);
        expect(readChatGameSettings(store).games.rps).toBe(false);
    });

    it('坏掉的记录按全开处理', () => {
        const store = memoryStorage({ [CHAT_GAMES_STORAGE_KEY]: '{' });
        expect(readChatGameSettings(store)).toEqual({ master: true, games: {} });
        expect(isChatGameEnabled('dice', store)).toBe(true);
    });
});

describe('提示词', () => {
    it('两款都开时照设计说明拼，不写谁赢', () => {
        const guide = buildChatGamesGuide(memoryStorage());
        expect(guide).toContain('【小游戏】');
        expect(guide).toContain('现在有两种玩法');
        expect(guide).toContain('· 骰子 [[GAME:dice]] —— 摇 1 到 6 点。');
        expect(guide).toContain('你自己也能拿来决定事情，不用问用户。');
        expect(guide).toContain('· 猜拳 [[GAME:rps]] —— 你出一只手，石头、剪刀、布。');
        expect(guide).toContain('石头胜剪刀、剪刀胜布、布胜石头；一样算平手。');
        expect(guide).not.toContain('不能自己单方面玩');
        expect(guide).not.toContain('这一轮只说话');
        expect(guide).toContain('怎么用：');
        expect(guide).toContain('用户让你扔、让你出拳，或者你自己想现在就玩，这一轮就写对应记号。');
        expect(guide).not.toContain('你赢了');
    });

    it('关掉猜拳就不再教猜拳', () => {
        const store = memoryStorage();
        writeChatGameEnabled('rps', false, store);
        const guide = buildChatGamesGuide(store);
        expect(guide).toContain('现在有一种玩法');
        expect(guide).toContain('[[GAME:dice]]');
        expect(guide).not.toContain('猜拳');
        expect(guide).not.toContain('不能自己单方面玩');
    });

    it('总开关关掉就整段不插', () => {
        const store = memoryStorage();
        writeChatGameMaster(false, store);
        expect(buildChatGamesGuide(store)).toBe('');
    });
});

describe('给模型看的句子', () => {
    it('只报结果，不判输赢', () => {
        expect(formatChatGameForModel({ metadata: { chatGame: { game: 'dice', by: 'ai', value: 3 } } }, '江野'))
            .toBe('[系统: 你（江野）掷出了 3 点]');
        expect(formatChatGameForModel({ metadata: { chatGame: { game: 'dice', by: 'user', value: 5 } } }, '江野'))
            .toBe('[系统: 用户掷出了 5 点]');
        expect(formatChatGameForModel({ metadata: { chatGame: { game: 'dice', by: 'user', value: 5, withAi: 3 } } }, '江野'))
            .toBe('[系统: 用户掷出了 5 点，你（江野）掷出了 3 点]');
        expect(formatChatGameForModel({ metadata: { chatGame: { game: 'rps', by: 'ai', value: 'scissors' } } }, '江野'))
            .toBe('[系统: 你出了猜拳，还盖着。用户还没出。不要说出你出的是什么，不要再输出 [[GAME:rps]]。]');
        expect(formatChatGameForModel({ metadata: { chatGame: { game: 'rps', by: 'ai', value: 'scissors', opened: true } } }, '江野'))
            .toBe('[系统: 你（江野）出了剪刀]');
        expect(formatChatGameForModel({ metadata: { chatGame: { game: 'rps', by: 'user', value: 'rock', withAi: 'scissors' } } }, '江野'))
            .toBe('[系统: 用户出了石头，你（江野）出了剪刀]');
        expect(formatChatGameForModel({ metadata: {} }, '江野')).toBeNull();
    });

    it('历史里的小游戏不再被说成戳一戳', () => {
        const game = message({
            content: '江野掷出了 3 点',
            metadata: { chatGame: { game: 'dice', by: 'ai', value: 3 } },
        });
        const poke = message({ id: 2, content: '[戳一戳]', metadata: {} });
        expect(normalizeMessageContent(game, '江野', '安安')).toBe('[系统: 你（江野）掷出了 3 点]');
        expect(normalizeMessageContent(poke, '江野', '安安')).toBe('[系统: 安安戳了江野一下]');

        const char = { id: 'game-hist', name: '江野' } as any;
        const user = { name: '安安' } as any;
        const gameHistory = ChatPrompts.buildMessageHistory([game], 10, char, user, []).apiMessages;
        const pokeHistory = ChatPrompts.buildMessageHistory([poke], 10, char, user, []).apiMessages;
        expect(String(gameHistory[0]?.content)).toContain('[系统: 你（江野）掷出了 3 点]');
        expect(String(gameHistory[0]?.content)).not.toContain('戳了');
        expect(String(pokeHistory[0]?.content)).toContain('[系统: 用户戳了你一下]');
    });

    it('接话时告诉角色真实结果，猜拳先不要说出手势', () => {
        const rps = gameFollowUpNote([{ id: 'rps', value: 'scissors' }]);
        const dice = gameFollowUpNote([{ id: 'dice', value: 4 }]);
        expect(rps).toContain('还盖着');
        expect(rps).not.toMatch(/石头|剪刀|布/);
        expect(rps).toContain('不是用户出的');
        expect(rps).toContain('不要说出你出的是什么');
        expect(dice).toContain('定死');
        expect(dice).toContain('你掷出了 4 点');
        expect(rps + dice).not.toContain('你赢了');
        expect(rps + dice).not.toContain('赢');
    });
});

describe('记号', () => {
    it('不认识的、关掉的都删掉，同一款只留一次', () => {
        const planned = planGameTags('来\n[[GAME:dice]]\n[[GAME:nope]]\n[[GAME:DICE]]\n[[GAME:rps]]', (id) => id === 'dice');
        expect(planned.ids).toEqual(['dice']);
        expect(planned.content).toBe('来');
        expect(stripGameTags('看看[[GAME:dice]]\n[[SEARCH: 猫]]')).toBe('看看\n[[SEARCH: 猫]]');
    });

    it('中间说的话不打断猜拳，已经出过的那一局不再配', () => {
        const earlier = message({ id: 1, metadata: { chatGame: { game: 'dice', by: 'ai', value: 2 } } });
        const chatter = message({ id: 2, role: 'user', type: 'text', content: '好！我来了！！' });
        const played = message({
            id: 3,
            role: 'user',
            metadata: { chatGame: { game: 'dice', by: 'user', value: 6 } },
        });
        const later = message({ id: 4, metadata: { chatGame: { game: 'rps', by: 'ai', value: 'paper' } } });
        expect(findAiGameInOpenTurn([earlier, chatter], 'dice')).toBe(earlier);
        expect(findAiGameInOpenTurn([earlier, played, chatter], 'dice')).toBeNull();
        expect(findAiGameInOpenTurn([chatter, later, message({ id: 5, type: 'text', content: '来' })], 'rps')).toBe(later);
        const ai = message({ id: 7, content: '猜拳 · 等你出', metadata: { chatGame: { game: 'rps', by: 'ai', value: 'scissors' } } });
        const talk = message({ id: 8, type: 'text', content: '呼噜' });
        const mine = message({
            id: 10,
            role: 'user',
            content: '你出了石头',
            metadata: { chatGame: { game: 'rps', by: 'user', value: 'rock' } },
        });
        expect(pairedDuelCards([ai, talk, chatter, mine])).toEqual([{
            aiId: 7, userId: 10, hostId: 10, hiddenId: 7, userValue: 'rock', aiValue: 'scissors',
        }]);
        expect(ai.content).toBe('猜拳 · 等你出');
        expect(formatChatGameForModel(ai, '江野')).not.toMatch(/石头|剪刀|布/);
        expect(formatChatGameForModel(ai, '江野', true)).toContain('剪刀');
    });

    it('删除只动点到的那条，合并不连带另一张', () => {
        const ai = message({ id: 4, content: '猜拳 · 等你出', metadata: { chatGame: { game: 'rps', by: 'ai', value: 'scissors' } } });
        const user = message({
            id: 6,
            role: 'user',
            content: '你出了石头',
            metadata: { chatGame: { game: 'rps', by: 'user', value: 'rock', withAi: 'scissors' } },
        });
        expect(expandChatGameDeleteIds([ai, user], [6])).toEqual([6]);
        expect(expandChatGameDeleteIds([ai, user], [4])).toEqual([4]);
        expect(ai.content).toBe('猜拳 · 等你出');
        expect(user.content).toBe('你出了石头');
    });

    it('对决只配对画面，不改两边原来的句子', () => {
        const ai = message({ id: 4, content: '江野掷出了 3 点', metadata: { chatGame: { game: 'dice', by: 'ai', value: 3 } } });
        const talk = message({ id: 5, type: 'text', content: '你来' });
        const user = message({
            id: 6,
            role: 'user',
            content: '你掷出了 5 点，江野掷出了 3 点',
            metadata: { chatGame: { game: 'dice', by: 'user', value: 5, withAi: 3 } },
        });
        const alone = message({
            id: 8,
            role: 'user',
            content: '你出了石头',
            metadata: { chatGame: { game: 'rps', by: 'user', value: 'rock' } },
        });
        expect(pairedDuelCards([ai, talk, user, alone])).toEqual([{
            aiId: 4, userId: 6, hostId: 6, hiddenId: 4, userValue: 5, aiValue: 3,
        }]);
        const mine = message({
            id: 1,
            role: 'user',
            content: '你掷出了 6 点',
            metadata: { chatGame: { game: 'dice', by: 'user', value: 6 } },
        });
        const theirs = message({ id: 2, content: '江野掷出了 2 点', metadata: { chatGame: { game: 'dice', by: 'ai', value: 2 } } });
        expect(pairedDuelCards([mine, theirs])).toEqual([{
            aiId: 2, userId: 1, hostId: 2, hiddenId: 1, userValue: 6, aiValue: 2,
        }]);
        expect(ai.content).toBe('江野掷出了 3 点');
        expect(user.content).toBe('你掷出了 5 点，江野掷出了 3 点');
        expect(mine.content).toBe('你掷出了 6 点');
        const again = message({
            id: 9,
            role: 'user',
            content: '你掷出了 1 点',
            metadata: { chatGame: { game: 'dice', by: 'user', value: 1 } },
        });
        const said = message({ id: 8, role: 'user', type: 'text', content: '再来' });
        expect(pairedDuelCards([mine, theirs, said, again])).toEqual([{
            aiId: 2, userId: 1, hostId: 2, hiddenId: 1, userValue: 6, aiValue: 2,
        }]);
        expect(findAiGameInOpenTurn([mine, theirs, said], 'dice')).toBeNull();
    });

    it('猜拳在用户出之前盖着，骰子不盖', () => {
        expect(chatGameIsSealed({ game: 'rps', by: 'ai', value: 'rock' })).toBe(true);
        expect(chatGameIsSealed({ game: 'rps', by: 'ai', value: 'rock', opened: true })).toBe(false);
        expect(chatGameIsSealed({ game: 'dice', by: 'ai', value: 6 })).toBe(false);
    });
});

describe('落卡', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('同一轮重试不重摇，不认识的记号只删掉', async () => {
        const saved: Array<Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }> = [];
        const recent = [message({
            metadata: {
                activeMsg2: { messageId: 'm1' },
                chatGame: { game: 'dice', by: 'ai', value: 6 },
            },
        })];
        const again = await persistGameTagsFromText({
            content: '来[[GAME:dice]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { saved.push(msg); },
            inheritMeta: { activeMsg2: { messageId: 'm1' } },
            loadRecent: async () => recent,
        });
        expect(again.rolls).toEqual([]);
        expect(again.content).toBe('');
        expect(again.speechSaved).toBe(false);
        expect(saved).toHaveLength(0);

        const fresh = await persistGameTagsFromText({
            content: '[[GAME:dice]][[GAME:nope]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { saved.push(msg); },
            saveBare: async (msg) => { saved.push(msg); },
            inheritMeta: { activeMsg2: { messageId: 'm2' } },
            loadRecent: async () => [],
        });
        expect(saved).toHaveLength(1);
        expect(saved[0].type).toBe('interaction');
        expect(saved[0].role).toBe('assistant');
        expect(saved[0].metadata.activeMsg2).toBeUndefined();
        expect(saved[0].metadata.chatGame.turnKey).toBe('m2');
        expect(saved[0].metadata.chatGame).toMatchObject({ game: 'dice', by: 'ai' });
        expect(saved[0].metadata.chatGame.value).toBeGreaterThanOrEqual(1);
        expect(saved[0].metadata.chatGame.value).toBeLessThanOrEqual(6);
        expect(saved[0].content).toBe(`江野掷出了 ${saved[0].metadata.chatGame.value} 点`);
        expect(fresh.content).toBe('');
        expect(fresh.speechSaved).toBe(false);
        expect(fresh.rolls).toEqual([{ id: 'dice', value: saved[0].metadata.chatGame.value }]);

        const sealed: Array<Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }> = [];
        await persistGameTagsFromText({
            content: '[[GAME:rps]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { sealed.push(msg); },
            saveBare: async (msg) => { sealed.push(msg); },
        });
        expect(sealed[0].content).toBe('猜拳 · 等你出');
        expect(sealed[0].content).not.toMatch(/石头|剪刀|布/);
        expect(sealed[0].metadata.chatGame.value).toMatch(/^(rock|scissors|paper)$/);
    });

    it('这一款关着就不出卡', async () => {
        const store = memoryStorage();
        writeChatGameEnabled('dice', false, store);
        vi.stubGlobal('localStorage', store);
        const saved: unknown[] = [];
        const result = await persistGameTagsFromText({
            content: '[[GAME:dice]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { saved.push(msg); },
        });
        expect(saved).toHaveLength(0);
        expect(result.rolls).toEqual([]);
        expect(result.content).toBe('');
    });

    it('话在记号前面先落，卡片不挂在当轮回复上', async () => {
        const saved: Array<Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }> = [];
        const result = await persistGameTagsFromText({
            content: '先说[[GAME:dice]]再说',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { saved.push(msg); },
            saveBare: async (msg) => { saved.push(msg); },
            inheritMeta: { source: 'active_msg_2', activeMsg2: { messageId: 'm9' } },
            loadRecent: async () => [],
        });
        expect(saved.map((msg) => (msg.type === 'interaction' ? 'card' : msg.content))).toEqual(['先说', 'card', '再说']);
        expect(saved[0].metadata.activeMsg2.messageId).toBe('m9');
        expect(saved[1].metadata.activeMsg2).toBeUndefined();
        expect(saved[1].metadata.source).toBeUndefined();
        expect(saved[1].metadata.chatGame.turnKey).toBe('m9');
        expect(result.content).toBe('');
        expect(result.speechSaved).toBe(true);
        expect(result.spoken).toBe('先说\n再说');
        expect(result.rolls).toHaveLength(1);
    });

    it('卡片自己的 turnKey 也能认出这一轮已经摇过', async () => {
        const saved: unknown[] = [];
        const recent = [message({
            metadata: { chatGame: { game: 'dice', by: 'ai', value: 4, turnKey: 'm3' } },
        })];
        const again = await persistGameTagsFromText({
            content: '又[[GAME:dice]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { saved.push(msg); },
            saveBare: async (msg) => { saved.push(msg); },
            inheritMeta: { activeMsg2: { messageId: 'm3' } },
            loadRecent: async () => recent,
        });
        expect(again.rolls).toEqual([]);
        expect(again.content).toBe('');
        expect(saved).toHaveLength(0);
    });

    it('重试时已经摇过的卡不重摇，但回戳还要交回去', async () => {
        const saved: unknown[] = [];
        const recent = [message({
            metadata: { chatGame: { game: 'dice', by: 'ai', value: 2, turnKey: 'm8' } },
        })];
        const again = await persistGameTagsFromText({
            content: '来[[ACTION:POKE]][[GAME:dice]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { saved.push(msg); },
            saveBare: async (msg) => { saved.push(msg); },
            inheritMeta: { activeMsg2: { messageId: 'm8' } },
            loadRecent: async () => recent,
        });
        expect(saved).toHaveLength(0);
        expect(again.rolls).toEqual([]);
        expect(again.content).toBe('[[ACTION:POKE]]');
        expect(again.rerunPending).toBe(false);
    });

    it('表情、引用和骰子按原顺序落，并且要接话', async () => {
        const order: string[] = [];
        const result = await persistGameTagsFromText({
            content: '[[SEND_EMOJI: 开心]]\n[[QUOTE: 你好]]来玩[[GAME:dice]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { order.push(msg.content); },
            saveBare: async (msg) => { order.push(msg.type === 'interaction' ? 'card' : msg.content); },
        });
        expect(order[0]).toContain('[[SEND_EMOJI: 开心]]');
        expect(order[0]).toContain('[[QUOTE: 你好]]');
        expect(order[0]).toContain('来玩');
        expect(order[0].indexOf('[[SEND_EMOJI: 开心]]')).toBeLessThan(order[0].indexOf('[[QUOTE: 你好]]'));
        expect(order[0].indexOf('[[QUOTE: 你好]]')).toBeLessThan(order[0].indexOf('来玩'));
        expect(order[1]).toBe('card');
        expect(result.rerunPending).toBe(false);
        expect(result.rolls.map((roll) => roll.id)).toEqual(['dice']);
        expect(shouldRequestGameFollowUp(result.rolls, result.rerunPending)).toBe(true);
        expect(gameFollowUpNote(followUpRolls(result.rolls))).toContain('掷出了');
    });

    it('回戳和骰子：回戳交还执行，并且要接话', async () => {
        const order: string[] = [];
        const result = await persistGameTagsFromText({
            content: '[[ACTION:POKE]]\n来[[GAME:dice]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { order.push(msg.content); },
            saveBare: async (msg) => { order.push('card'); },
        });
        expect(order).toEqual(['来', 'card']);
        expect(result.content).toBe('[[ACTION:POKE]]');
        expect(result.pendingDisplay).toBe('');
        expect(shouldRequestGameFollowUp(result.rolls, result.rerunPending)).toBe(true);
    });

    it('表情和猜拳按顺序落卡，不接话', async () => {
        const order: string[] = [];
        const result = await persistGameTagsFromText({
            content: '[[SEND_EMOJI: 开心]]\n[[GAME:rps]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { order.push(msg.content); },
            saveBare: async (msg) => { order.push(msg.content); },
        });
        expect(order[0]).toContain('[[SEND_EMOJI: 开心]]');
        expect(order[1]).toBe('猜拳 · 等你出');
        expect(result.rolls.map((roll) => roll.id)).toEqual(['rps']);
        expect(shouldRequestGameFollowUp(result.rolls, result.rerunPending)).toBe(false);
        expect(followUpRolls(result.rolls)).toEqual([]);
    });

    it('骰子和猜拳一起出时，两张卡都在，只按骰子接话', async () => {
        const order: string[] = [];
        const result = await persistGameTagsFromText({
            content: '[[GAME:dice]][[GAME:rps]]',
            charId: 'c',
            charName: '江野',
            persist: async () => {},
            saveBare: async (msg) => { order.push(msg.content); },
        });
        expect(order[0]).toMatch(/掷出了 \d 点/);
        expect(order[1]).toBe('猜拳 · 等你出');
        expect(followUpRolls(result.rolls).map((roll) => roll.id)).toEqual(['dice']);
        expect(shouldRequestGameFollowUp(result.rolls, result.rerunPending)).toBe(true);
        expect(gameFollowUpNote(followUpRolls(result.rolls))).not.toContain('石头');
        expect(gameFollowUpNote(followUpRolls(result.rolls))).not.toContain('剪刀');
        expect(gameFollowUpNote(followUpRolls(result.rolls))).not.toContain('布');
    });

    it('搜索和骰子不接话，结果说明留给下一轮', async () => {
        const saved: string[] = [];
        const result = await persistGameTagsFromText({
            content: '先看看[[SEARCH: 猫]]\n[[GAME:dice]]',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { saved.push(msg.content); },
            saveBare: async () => { saved.push('card'); },
        });
        expect(saved).toEqual(['card']);
        expect(result.speechSaved).toBe(false);
        expect(result.rerunPending).toBe(true);
        expect(result.content).toContain('[[SEARCH: 猫]]');
        expect(result.content).toContain('先看看');
        expect(shouldRequestGameFollowUp(result.rolls, result.rerunPending)).toBe(false);
        const facts = gameFollowUpNote(followUpRolls(result.rolls)).replace(/不要再输出 \[\[GAME:[^\]]*\]\]。/g, '');
        expect(facts).toContain('掷出了');
        expect(hasRerunTags(result.content)).toBe(true);
    });

    it('骰子前单独一行引用不丢，并到后面那句上', async () => {
        const order: string[] = [];
        const result = await persistGameTagsFromText({
            content: '[[QUOTE: 你好]]\n[[GAME:dice]]\n后面',
            charId: 'c',
            charName: '江野',
            persist: async (msg) => { order.push(msg.content); },
            saveBare: async () => { order.push('card'); },
        });
        expect(order[0]).toBe('card');
        expect(order[1]).toContain('[[QUOTE: 你好]]');
        expect(order[1]).toContain('后面');
        expect(result.pendingDisplay).toBe('');
        expect(shouldRequestGameFollowUp(result.rolls, result.rerunPending)).toBe(true);
    });

    it('接话里再冒出搜索记号时剥掉', () => {
        expect(stripRerunTags('好呀\n[[SEARCH: 猫]]\n就这样')).toBe('好呀\n就这样');
        expect(hasRerunTags('[[ACTION:POKE]]')).toBe(false);
        expect(hasRerunTags('[[SEND_EMOJI: 开心]]')).toBe(false);
    });
});

describe('重摇', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('重 roll 只拿掉末尾的角色消息，游戏卡也算，用户的不动', async () => {
        const user = message({
            id: 1,
            role: 'user',
            type: 'text',
            content: '来',
            timestamp: 1,
        });
        const opened = message({
            id: 2,
            content: '猜拳 · 等你出',
            timestamp: 2,
            metadata: { chatGame: { game: 'rps', by: 'ai', value: 'paper', opened: true } },
        });
        const talk = message({ id: 4, type: 'text', content: '四！', timestamp: 4 });
        const system = message({ id: 9, role: 'system', type: 'text', content: '记录', timestamp: 3 });
        const dice = message({
            id: 3,
            content: '江野掷出了 4 点',
            timestamp: 5,
            metadata: { chatGame: { game: 'dice', by: 'ai', value: 4 } },
        });
        expect(canRerollGameTurn([user, opened, system, talk, dice])).toBe(true);
        expect(canRerollGameTurn([opened, { ...user, timestamp: 9 }])).toBe(false);
        const outcome = await rerollTrailingAiGames([user, opened, system, talk, dice]);
        expect(outcome.deleteIds).toEqual([2, 4, 3]);
        expect(outcome.rolls).toEqual([]);
        expect(outcome.updates).toEqual([]);
        expect(opened.content).toBe('猜拳 · 等你出');
        expect(user.content).toBe('来');
    });

    it('骰子六点、猜拳三手大致均匀', () => {
        const faces = [0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 12000; i++) faces[diceGame.roll()] += 1;
        for (let face = 1; face <= 6; face++) {
            expect(faces[face]).toBeGreaterThan(1700);
            expect(faces[face]).toBeLessThan(2300);
        }
        const hands: Record<string, number> = { rock: 0, scissors: 0, paper: 0 };
        for (let i = 0; i < 9000; i++) hands[String(rpsGame.roll())] += 1;
        for (const count of Object.values(hands)) {
            expect(count).toBeGreaterThan(2500);
            expect(count).toBeLessThan(3500);
        }
    });
});

describe('私聊提示词插不插', () => {
    const build = (options?: { forFirePack?: boolean; forBatteryReminder?: boolean }) => ChatPrompts.buildSystemPromptParts(
        { id: 'game-prompt', name: '江野', systemPrompt: '说话短。' } as any,
        { name: '安安' } as any,
        [], [], [], [],
        undefined, undefined, undefined, undefined, undefined, undefined,
        options,
    );

    it('平时的私聊带上小游戏', async () => {
        const parts = await build();
        expect(parts.stable).toContain('【小游戏】');
        expect(parts.stable).toContain('[[GAME:dice]]');
        expect(parts.stable).toContain('[[GAME:rps]]');
    });

    it('主动消息打包和电量提醒不教小游戏', async () => {
        const packed = await build({ forFirePack: true });
        const battery = await build({ forBatteryReminder: true });
        expect(packed.stable).not.toContain('【小游戏】');
        expect(packed.stable).not.toContain('[[GAME:dice]]');
        expect(battery.stable).not.toContain('【小游戏】');
        expect(battery.stable).not.toContain('聊天 App 行为规范');
    });
});
