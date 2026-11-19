/** Fired only after the message transaction commits; never carries message content. */
export const CHAT_MESSAGES_COMMITTED = 'sully-chat-messages-committed';
export const CHAT_READ_CHANGED = 'sully-chat-read-changed';

export function announceChatMessagesCommitted(charId?: string) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHAT_MESSAGES_COMMITTED, { detail: { charId } }));
    }
}
