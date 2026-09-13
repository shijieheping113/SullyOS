import type { Message } from '../types';
import { DB } from './db';

/**
 * 拉黑（冷战玩法）——状态的事实源是聊天记录里的 [[记录:BLOCK|...]] 系统消息，
 * 角色人设/CharacterProfile 一概不动。代码和模型读同一份记录：
 *   拉黑  → metadata.source='block-status', blockStatus='已拉黑', blockCallsToo
 *   解除  → blockStatus='已解除'（解除即全部解除，电话不留尾巴）
 * 拉黑期间角色的每条回复照常落库进气泡，只是 metadata.blockSendFailed=true，
 * UI 挂「未送达」标记，拼上下文时带 [[记录:BLOCK_SEND|...|status=已拒收]]。
 * 字数限制（求看看/好友申请 15 字）是写给模型的玩法约束，代码只剥符号、不截字数。
 *
 * 兼容红线：无 lookbehind、无数字分隔符、无 ES2021+ 语法（旧 WebView 会崩）。
 */

export const BLOCK_SOURCE = 'block-status';
export const BLOCK_FRIEND_REQUEST_SOURCE = 'friend-request';
export const BLOCK_PEEK_SOURCE = 'peek-request';

export interface BlockState {
    blocked: boolean;
    blockCallsToo: boolean;
    /** 拉黑开始时间（ms）。未拉黑为 0 */
    since: number;
    /** 历史上第几次拉黑（数「已拉黑」记录条数） */
    count: number;
}

const EMPTY_STATE: BlockState = { blocked: false, blockCallsToo: false, since: 0, count: 0 };

type BlockMessageLike = Pick<Message, 'timestamp' | 'role' | 'metadata'>;

/** 纯函数：从消息数组判定当前拉黑状态（取最后一条 BLOCK 记录）。 */
export const getBlockStateFromMessages = (messages: BlockMessageLike[]): BlockState => {
    let blocked = false;
    let blockCallsToo = false;
    let since = 0;
    let count = 0;
    let sawBlockRecord = false;
    for (let i = 0; i < messages.length; i += 1) {
        const meta = messages[i].metadata || {};
        if (meta.source !== BLOCK_SOURCE) continue;
        sawBlockRecord = true;
        if (meta.blockStatus === '已拉黑') {
            blocked = true;
            blockCallsToo = !!meta.blockCallsToo;
            since = Number(messages[i].timestamp || 0);
            count += 1;
        } else if (meta.blockStatus === '已解除') {
            blocked = false;
            blockCallsToo = false;
            since = 0;
        }
    }
    if (!blocked && !sawBlockRecord) {
        // 只有窗口内完全没有 BLOCK 记录时才用拒收标记兜底；一旦出现解除记录，解除优先。
        // → 拉黑发生在窗口之前且之后没解除（解除记录必晚于最后一条带标记的消息，
        //   否则最后一条消息不会带标记），判定仍拉黑中。
        let lastAssistantFailed = false;
        let seenAssistant = false;
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].role !== 'assistant') continue;
            seenAssistant = true;
            lastAssistantFailed = !!(messages[i].metadata || {}).blockSendFailed;
            break;
        }
        if (seenAssistant && lastAssistantFailed) {
            blocked = true;
            blockCallsToo = false;
            since = 0;
        }
    }
    return { blocked, blockCallsToo, since, count };
};

/** 判定该角色当前拉黑状态。窗口取大，配合标记兜底，多次拉黑解除/上下文截断都不会乱。 */
export const getBlockStateForChar = async (charId: string): Promise<BlockState> => {
    try {
        const msgs = await DB.getRecentMessagesByCharId(charId, 500, true);
        return getBlockStateFromMessages(msgs);
    } catch (e) {
        console.warn('[Block] 读取拉黑状态失败，按未拉黑处理:', e);
        return { ...EMPTY_STATE };
    }
};

/** 拉黑挽回卡低频限制：已有待处理申请不重复发，求看看也要留出冷静时间。 */
export const canCreateBlockAction = async (charId: string, action: 'peek' | 'friend-request'): Promise<boolean> => {
    const messages = await DB.getRecentMessagesByCharId(charId, 80, true);
    const cards = messages.filter(message => {
        const source = message.metadata?.source;
        return source === BLOCK_PEEK_SOURCE || source === BLOCK_FRIEND_REQUEST_SOURCE;
    });
    if (action === 'friend-request') {
        const pending = cards.some(message => message.metadata?.source === BLOCK_FRIEND_REQUEST_SOURCE
            && (!message.metadata?.requestStatus || message.metadata.requestStatus === 'pending'));
        if (pending) return false;
        const latest = cards.filter(message => message.metadata?.source === BLOCK_FRIEND_REQUEST_SOURCE).pop();
        if (latest && Date.now() - Number(latest.timestamp || 0) < 24 * 60 * 60 * 1000) return false;
    } else {
        const latest = cards.filter(message => message.metadata?.source === BLOCK_PEEK_SOURCE).pop();
        if (latest && Date.now() - Number(latest.timestamp || 0) < 6 * 60 * 60 * 1000) return false;
    }
    return true;
};

/** 按历史 BLOCK 时间段恢复被误清掉的「未送达」标记。只恢复拉黑期间的角色消息，不碰解除后的消息。 */
export const restoreBlockDeliveryFlags = async (charId: string): Promise<void> => {
    const messages = await DB.getMessagesByCharId(charId, true);
    let blockedSince = 0;
    const restoreIds: number[] = [];
    for (let i = 0; i < messages.length; i += 1) {
        const message = messages[i];
        const meta = message.metadata || {};
        if (meta.source === BLOCK_SOURCE) {
            if (meta.blockStatus === '已拉黑') blockedSince = Number(message.timestamp || 0);
            else if (meta.blockStatus === '已解除') blockedSince = 0;
            continue;
        }
        if (blockedSince > 0 && message.role === 'assistant' && Number(message.timestamp || 0) >= blockedSince && !meta.blockSendFailed) {
            restoreIds.push(message.id);
        }
    }
    await Promise.all(restoreIds.map(id => DB.updateMessageMetadata(id, (prev: any) => ({ ...(prev || {}), blockSendFailed: true }))));
};

/** 历史里有没有拉黑玩法的痕迹（决定要不要教角色规则、要不要注入当前状态）。 */
export const hasBlockTrace = (messages: Array<Pick<Message, 'metadata'>>): boolean => {
    for (let i = 0; i < messages.length; i += 1) {
        const meta = messages[i].metadata || {};
        const src = meta.source;
        if (src === BLOCK_SOURCE || src === BLOCK_FRIEND_REQUEST_SOURCE || src === BLOCK_PEEK_SOURCE) return true;
        if (meta.blockSendFailed) return true;
    }
    return false;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** [[记录:BLOCK|at=2026-09-13 15:00|status=已拉黑|电话=是]] */
export const formatBlockRecord = (opts: { at: number; status: '已拉黑' | '已解除'; blockCallsToo?: boolean }): string => {
    const d = new Date(opts.at);
    const at = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const parts = [`at=${at}`, `status=${opts.status}`];
    if (opts.status === '已拉黑') parts.push(`电话=${opts.blockCallsToo ? '是' : '否'}`);
    return `[[记录:BLOCK|${parts.join('|')}]]`;
};

/** 落一条拉黑状态记录（拉黑/解除都走这里）。 */
export const saveBlockRecord = async (
    charId: string,
    status: '已拉黑' | '已解除',
    blockCallsToo?: boolean,
): Promise<number> => {
    return DB.saveMessage({
        charId,
        role: 'system',
        type: 'system',
        content: formatBlockRecord({ at: Date.now(), status, blockCallsToo }),
        metadata: {
            source: BLOCK_SOURCE,
            blockStatus: status,
            blockCallsToo: !!blockCallsToo,
        },
    });
};

/** 拒收记录（拼上下文时挂在角色被拒收的消息前，不落库）。 */
export const formatBlockSendFailedRecord = (at: number): string => {
    const d = new Date(at);
    const atStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return `[[记录:BLOCK_SEND|at=${atStr}|status=已拒收]]`;
};

/** 好友申请卡 → 上下文记录（读 live status，和转账回执同款：卡被处理过后状态跟着变）。 */
export const formatBlockFriendRequestRecord = (message: Pick<Message, 'timestamp' | 'metadata'>): string => {
    const meta = message.metadata || {};
    const d = new Date(Number(message.timestamp || Date.now()));
    const at = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const status = meta.requestStatus === 'accepted' ? '已通过' : meta.requestStatus === 'ignored' ? '已忽略' : '待处理';
    const line = sanitizeBlockActionLine(String(meta.requestText || ''));
    const parts = [`at=${at}`, `status=${status}`];
    if (line) parts.push(`line=${line}`);
    return `[[记录:FRIEND_REQUEST|${parts.join('|')}]]`;
};

/** 求看看卡 → 上下文记录（用户点过「看看」就是已看，角色知道自己被看到了）。 */
export const formatBlockPeekRecord = (message: Pick<Message, 'timestamp' | 'metadata'>): string => {
    const meta = message.metadata || {};
    const d = new Date(Number(message.timestamp || Date.now()));
    const at = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const status = meta.peekViewed ? '已看' : '未看';
    const line = sanitizeBlockActionLine(String(meta.peekText || ''));
    const parts = [`at=${at}`, `status=${status}`];
    if (line) parts.push(`line=${line}`);
    return `[[记录:PEEK|${parts.join('|')}]]`;
};

// ─── 暗号解析（CALL 同款：剥符号防解析错乱，字数交给提示词约束，代码不截） ───

const PEEK_TAG_RE = /\[\[ACTION:\s*PEEK(?:\s*[|｜]\s*([^\]]*?))?\]\]/gi;
const FRIEND_REQUEST_TAG_RE = /\[\[ACTION:\s*FRIEND_REQUEST(?:\s*[|｜]\s*([^\]]*?))?\]\]/gi;

export const sanitizeBlockActionLine = (raw: string): string => {
    const first = String(raw || '').split(/[|｜]/)[0] || '';
    return first.replace(/[\[\]|｜]/g, '').replace(/\s+/g, ' ').trim();
};

export const extractBlockPeekAction = (content: string): { text: string; line: string; consumed: boolean } => {
    let consumed = false;
    let line = '';
    const text = String(content || '').replace(PEEK_TAG_RE, (_all, rawLine?: string) => {
        if (!consumed) {
            consumed = true;
            line = sanitizeBlockActionLine(rawLine || '');
        }
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { text, line, consumed };
};

export const extractBlockFriendRequestAction = (content: string): { text: string; line: string; consumed: boolean } => {
    let consumed = false;
    let line = '';
    const text = String(content || '').replace(FRIEND_REQUEST_TAG_RE, (_all, rawLine?: string) => {
        if (!consumed) {
            consumed = true;
            line = sanitizeBlockActionLine(rawLine || '');
        }
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { text, line, consumed };
};

// ─── 注入文本（拼进 volatileTail，不落库；模型以它为当前状态准绳） ───

export const buildBlockStatusBlock = (state: BlockState, traced: boolean, userName: string): string => {
    if (state.blocked) {
        let sinceStr = '';
        if (state.since > 0) {
            const d = new Date(state.since);
            sinceStr = `，自${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}起`;
        }
        const phone = state.blockCallsToo ? '，连电话也打不通' : '（电话还通着）';
        return `\n\n[拉黑状态] ${userName}暂时不想接收你的普通消息${sinceStr}${phone}。你发出的文字不会到达${userName}那里，但你仍然可以像真人一样表达委屈、道歉、想念、试探，或者先安静一会儿。不要假装对方已经看见，也不要把系统提示当成对方说的话。挽回方式要克制：先用普通消息好好说话，只有真的合适时才单独发 [[ACTION:PEEK|15字内短句]] 或 [[ACTION:FRIEND_REQUEST|15字内附言]]；已有待处理卡片、刚被忽略或刚发过同类卡片时，不要重复递卡。卡片不是每轮必做的事。`;
    }
    if (traced) {
        return `\n\n[拉黑状态] ${userName}当前没有拉黑你，你们正常聊天。历史里的拉黑/拒收记录是已经过去的事，以当前状态为准。`;
    }
    return '';
};
