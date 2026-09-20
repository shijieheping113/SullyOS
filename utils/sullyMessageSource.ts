import type { Emoji, Message } from '../types';
import { stickerNameFromUrl } from './messageFormat';

/** 把库里一条消息还原成可编辑的「源文本」 */
export function messageToEditSource(msg: Message, emojis: Emoji[]): string {
    if (msg.type === 'html_card') {
        const html = typeof msg.metadata?.htmlSource === 'string' ? msg.metadata.htmlSource : '';
        if (html) return `[html]${html}[/html]`;
        return msg.content || '';
    }
    if (msg.type === 'emoji') {
        const name = stickerNameFromUrl(emojis, msg.content);
        if (name !== '未知表情') return `[[SEND_EMOJI: ${name}]]`;
        return msg.content || '';
    }
    return msg.content || '';
}
