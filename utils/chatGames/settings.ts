/** 小游戏开关。记在本机，不进备份。缺的键默认开。 */

export const CHAT_GAMES_STORAGE_KEY = 'sullyos.chatGames.v1';
export const CHAT_GAMES_CHANGED = 'chat-games-settings-changed';

export interface ChatGameSettings {
    master: boolean;
    games: Record<string, boolean>;
    /** 猜拳：角色自己选石头剪刀布，系统不随机。默认关。 */
    rpsFreeChoice: boolean;
}

function browserStorage(): Storage | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch {
        return null;
    }
}

const EMPTY_SETTINGS: ChatGameSettings = { master: true, games: {}, rpsFreeChoice: false };

function readRaw(store: Storage | null): ChatGameSettings {
    if (!store) return { ...EMPTY_SETTINGS, games: {} };
    try {
        const parsed = JSON.parse(store.getItem(CHAT_GAMES_STORAGE_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') return { ...EMPTY_SETTINGS, games: {} };
        const games: Record<string, boolean> = {};
        Object.keys(parsed).forEach((key) => {
            if (key === 'master' || key === 'rpsFreeChoice') return;
            if (typeof parsed[key] === 'boolean') games[key] = parsed[key];
        });
        return {
            master: parsed.master !== false,
            games,
            rpsFreeChoice: parsed.rpsFreeChoice === true,
        };
    } catch {
        return { ...EMPTY_SETTINGS, games: {} };
    }
}

export function readChatGameSettings(store?: Storage | null): ChatGameSettings {
    return readRaw(store === undefined ? browserStorage() : store);
}

function writeRaw(next: ChatGameSettings, store?: Storage | null): void {
    const target = store === undefined ? browserStorage() : store;
    if (!target) return;
    const flat: Record<string, boolean> = {
        master: next.master,
        ...next.games,
        ...(next.rpsFreeChoice ? { rpsFreeChoice: true } : {}),
    };
    target.setItem(CHAT_GAMES_STORAGE_KEY, JSON.stringify(flat));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHAT_GAMES_CHANGED));
    }
}

export function writeChatGameMaster(on: boolean, store?: Storage | null): void {
    const current = readChatGameSettings(store);
    writeRaw({ ...current, master: on }, store);
}

export function writeChatGameEnabled(id: string, on: boolean, store?: Storage | null): void {
    const current = readChatGameSettings(store);
    writeRaw({ ...current, games: { ...current.games, [id]: on } }, store);
}

/** 总开关关掉，或这一款写明关掉，才算关。没写过的款默认开。 */
export function isChatGameEnabled(id: string, store?: Storage | null): boolean {
    const current = readChatGameSettings(store);
    if (!current.master) return false;
    return current.games[id] !== false;
}

/** 猜拳角色自控：开着且猜拳本身开着才算。默认关，走系统随机。 */
export function isRpsFreeChoiceEnabled(store?: Storage | null): boolean {
    const current = readChatGameSettings(store);
    return current.rpsFreeChoice === true && isChatGameEnabled('rps', store);
}

export function writeRpsFreeChoice(on: boolean, store?: Storage | null): void {
    const current = readChatGameSettings(store);
    writeRaw({ ...current, rpsFreeChoice: on }, store);
}
