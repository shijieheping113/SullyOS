/**
 * 二改：头像对齐 / 垂直微调样式。
 * 必须挂在白框自定义 CSS 之后——社区美化常写 transform:none / top:0，
 * 若跟作者细节微调一样提前注入，垂直拉条改了数头像也不动。
 */

import type { ChatFineTuneFields } from '../types';

const AI_BESIDE_AVATAR = '.sully-chat-root .sully-chat-message-ai > .sully-chat-message-avatar-slot';
const USER_BESIDE_AVATAR = '.sully-chat-root .sully-chat-message-user > .sully-chat-message-avatar-slot';

/** 仅生成头像对齐 + 垂直微调；无改动时返回空串。 */
export function buildAtelierAvatarTuneCss(theme: ChatFineTuneFields): string {
    if ((theme.chatAvatarPlacement || 'beside') === 'above_group') return '';
    const align = theme.chatAvatarAlign || 'bottom';
    const offY = theme.chatAvatarOffsetY || 0;
    if (align === 'bottom' && offY === 0) return '';
    const both = `${AI_BESIDE_AVATAR}, ${USER_BESIDE_AVATAR}`;
    let rule = '';
    if (align === 'top') {
        rule = `${both} { bottom: auto !important; top: -0.5rem !important;${offY ? ` transform: translateY(${offY}px) !important;` : ''} }`;
    } else if (align === 'center') {
        rule = `${both} { bottom: auto !important; top: 50% !important; transform: translateY(calc(-50% + ${offY}px)) !important; }`;
    } else {
        rule = `${both} { transform: translateY(${offY}px) !important; }`;
    }
    return `/* 二改：头像垂直微调（压在白框 CSS 后） */\n${rule}`;
}
