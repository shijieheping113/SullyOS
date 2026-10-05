/** 小游戏开关。记在本机，不进备份。缺的键默认开。 */

export const CHAT_GAMES_STORAGE_KEY = 'sullyos.chatGames.v1';
export const CHAT_GAMES_CHANGED = 'chat-games-settings-changed';

export interface ChatGameSettings {
    master: boolean;
    games: Record<string, boolean>;
}

function browserStorage(): Storage | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch {
        return null;
    }
}

function readRaw(store: Storage | null): ChatGameSettings {
    if (!store) return { master: true, games: {} };
    try {
        const parsed = JSON.parse(store.getItem(CHAT_GAMES_STORAGE_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') return { master: true, games: {} };
        const games: Record<string, boolean> = {};
        Object.keys(parsed).forEach((key) => {
            if (key === 'master') return;
            if (typeof parsed[key] === 'boolean') games[key] = parsed[key];
        });
        return { master: parsed.master !== false, games };
    } catch {
        return { master: true, games: {} };
    }
}

export function readChatGameSettings(store?: Storage | null): ChatGameSettings {
    return readRaw(store === undefined ? browserStorage() : store);
}

function writeRaw(next: ChatGameSettings, store?: Storage | null): void {
    const target = store === undefined ? browserStorage() : store;
    if (!target) return;
    const flat: Record<string, boolean> = { master: next.master, ...next.games };
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
