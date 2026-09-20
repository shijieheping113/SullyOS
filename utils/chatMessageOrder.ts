import type { Message } from '../types';

export function compareChatMessages(a: Message, b: Message): number {
    const ta = a.timestamp ?? 0;
    const tb = b.timestamp ?? 0;
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
}

export function sortChatMessages<T extends Message>(messages: T[]): T[] {
    return [...messages].sort(compareChatMessages);
}
