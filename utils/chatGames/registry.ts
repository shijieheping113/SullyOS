import { diceGame } from './dice';
import { rpsGame } from './rps';
import { isChatGameEnabled } from './settings';
import type { ChatGameChoice, ChatGamePlugin } from './types';

const PLUGINS: ChatGamePlugin[] = [diceGame, rpsGame];

export function listChatGamePlugins(): ChatGamePlugin[] {
    return PLUGINS.slice();
}

export function getChatGamePlugin(id: string): ChatGamePlugin | null {
    return PLUGINS.find(plugin => plugin.id === id) || null;
}

export function listEnabledChatGames(store?: Storage | null): ChatGamePlugin[] {
    return PLUGINS.filter(plugin => isChatGameEnabled(plugin.id, store));
}

export interface ChatGameMenuItem {
    id: string;
    name: string;
    blurb: string;
    choices: ChatGameChoice[] | null;
}

export function listChatGameMenu(store?: Storage | null): ChatGameMenuItem[] {
    return listEnabledChatGames(store).map(plugin => ({
        id: plugin.id,
        name: plugin.name,
        blurb: plugin.blurb,
        choices: plugin.choices,
    }));
}
