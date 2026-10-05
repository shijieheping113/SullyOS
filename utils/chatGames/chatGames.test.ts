import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types';
import { ChatPrompts } from '../chatPrompts';
import { normalizeMessageContent } from '../messageFormat';
import { randomInt } from '../random';
import { persistGameTagsFromText } from './commit';
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
    findAiGameInOpenTurn,
    expandChatGameDeleteIds,
    formatChatGameForModel,
    gameFollowUpNote,
    planGameTags,
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
        expect(guide).toContain('不能自己单方面玩');
        expect(guide).toContain('怎么用：');
        expect(guide).toContain('这一轮只说话，不要输出 [[GAME:dice]] 或 [[GAME:rps]]');
        expect(guide).toContain('什么时候扔由你决定');
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
        expect(rps).toContain('封存');
        expect(rps).toContain('你出了剪刀');
        expect(rps).toContain('不是用户出的');
        expect(rps).toContain('先不要说出你出的是什么');
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

    it('用户插过话之后，不再配先前那一局', () => {
        const earlier = message({ id: 1, metadata: { chatGame: { game: 'dice', by: 'ai', value: 2 } } });
        const user = message({ id: 2, role: 'user', type: 'text', content: '好' });
        const later = message({ id: 4, metadata: { chatGame: { game: 'rps', by: 'ai', value: 'paper' } } });
        expect(findAiGameInOpenTurn([earlier, user], 'dice')).toBeNull();
        expect(findAiGameInOpenTurn([user, later, message({ id: 5, type: 'text', content: '来' })], 'rps')).toBe(later);
    });

    it('删掉一把时，角色那张和用户那张一起走', () => {
        const ai = message({ id: 4, metadata: { chatGame: { game: 'rps', by: 'ai', value: 'scissors' } } });
        const user = message({
            id: 6,
            role: 'user',
            metadata: { chatGame: { game: 'rps', by: 'user', value: 'rock', withAi: 'scissors' } },
        });
        const other = message({ id: 8, role: 'user', type: 'text', content: '今晚你洗碗' });
        expect(expandChatGameDeleteIds([ai, user, other], [6]).sort()).toEqual([4, 6]);
        expect(expandChatGameDeleteIds([ai, user, other], [4]).sort()).toEqual([4, 6]);
        expect(expandChatGameDeleteIds([ai, user, other], [8])).toEqual([8]);
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
