const displayed = new Map<symbol, string>();

/** A mounted route alone is insufficient: Chat registers only after its content is shown. */
export function registerDisplayedChat(charId: string): () => void {
    const key = Symbol('displayed-chat');
    displayed.set(key, charId);
    return () => { displayed.delete(key); };
}

export function isChatDisplayed(charId: string): boolean {
    return Array.from(displayed.values()).includes(charId);
}

export function canConfirmChatRead(input: {
    visible: boolean; locked: boolean; displayed: boolean; active: boolean;
}): boolean {
    return input.visible && !input.locked && input.displayed && input.active;
}
