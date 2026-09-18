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
export const BLOCK_NOTICE_SOURCE = 'block-notice';
export const SYSTEM_LOG_LEAD = '[系统日志，不是对方发言]';

export const isBlockSystemSource = (source?: string): boolean => (
    source === BLOCK_SOURCE
    || source === BLOCK_FRIEND_REQUEST_SOURCE
    || source === BLOCK_PEEK_SOURCE
    || source === 'incoming-call'
    || source === 'block-call-hangup'
);

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
            if (!blocked) since = Number(messages[i].timestamp || 0);
            blocked = true;
            blockCallsToo = !!meta.blockCallsToo;
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

/** 落一条拉黑状态记录（拉黑/解除/事后补选电话都走这里）。 */
export const saveBlockRecord = async (
    charId: string,
    status: '已拉黑' | '已解除',
    blockCallsToo?: boolean,
    extra?: { patchedCalls?: boolean; relaxedCalls?: boolean },
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
            blockCallsPatched: !!extra?.patchedCalls,
            blockCallsRelaxed: !!extra?.relaxedCalls,
        },
    });
};

/** 聊天里给人看的句子。方括号记录仍写在 content 里给代码用，界面不照抄。 */
export const blockRecordDisplayText = (meta?: Message['metadata']): string => {
    if (!meta || meta.blockStatus === '已解除') return '你重新接收 ta 的消息了';
    if (meta.blockCallsRelaxed) return '你重新接收电话了';
    if (meta.blockCallsPatched) return '你把电话也拒了';
    if (meta.blockCallsToo) return '你拒收了 ta 的消息和电话';
    return '你拒收了 ta 的消息';
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

export type PeekOutcome = 'pending' | 'discard' | 'secret' | 'reveal';

/** 角色看到的求看看结果：偷偷看 50% 当成已看，50% 当成扔掉。 */
export const peekRecordStatus = (meta?: Message['metadata']): '已看' | '扔掉' | '未看' => {
    const outcome = String(meta?.peekOutcome || '');
    if (outcome === 'reveal') return '已看';
    if (outcome === 'discard') return '扔掉';
    if (outcome === 'secret') return meta?.peekCharacterKnows ? '已看' : '扔掉';
    if (meta?.peekViewed) return '已看';
    return '未看';
};

export const rollSecretPeekKnows = (): boolean => Math.random() < 0.5;

/** 求看看卡 → 上下文记录。偷偷看的概率结果写在 metadata.peekCharacterKnows，刷新不重掷。 */
export const formatBlockPeekRecord = (message: Pick<Message, 'timestamp' | 'metadata'>): string => {
    const meta = message.metadata || {};
    const d = new Date(Number(message.timestamp || Date.now()));
    const at = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const status = peekRecordStatus(meta);
    const line = sanitizeBlockActionLine(String(meta.peekText || ''));
    const parts = [`at=${at}`, `status=${status}`];
    if (line && status === '已看') parts.push(`line=${line}`);
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

export interface BlockPromptOpts {
    canCall?: boolean;
    canVoice?: boolean;
}

export const buildBlockStatusBlock = (
    state: BlockState,
    traced: boolean,
    userName: string,
    opts?: BlockPromptOpts,
): string => {
    if (state.blocked) {
        let sinceStr = '';
        if (state.since > 0) {
            const d = new Date(state.since);
            sinceStr = `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())} 起，`;
        }
        const canCall = !!opts?.canCall && !state.blockCallsToo;
        const reach: string[] = [
            '- 求看看卡：单独一行 `[[ACTION:PEEK|短句]]`',
            '- 好友申请：单独一行 `[[ACTION:FRIEND_REQUEST|附言]]`',
        ];
        if (canCall) {
            reach.push('- 打电话：单独一行 `[[ACTION:CALL]]` 或 `[[ACTION:CALL|附言]]`。对方手机真的会响，接了才算通话');
        } else {
            reach.push('- 电话现在打不通。那是没打出去，不是已经在通话里');
        }
        return `\n\n${SYSTEM_LOG_LEAD} 你被${userName}拒收了。${sinceStr}现在仍在拒收，这一条是当前状态，不是旧事。
【对方看不见】你发的每一句普通文字${opts?.canVoice ? '和语音' : ''}，对方一条都看不到。发再多也等于没发出去。不要再把聊天当沟通，也不要以为对方正在读你的气泡。你刚才想说的话，对方没有收到。
【对方能看见的只有这些】
${reach.join('\n')}
普通字可以打，但那只是你对着屏幕自言自语。想让对方看见，必须用求看看卡、好友申请${canCall ? '或电话' : ''}。想靠近就换办法，不要句句复读对不起。记录里能看到求看看看没看、申请过了没过、电话打没打通。`;
    }
    if (traced) {
        return `\n\n${SYSTEM_LOG_LEAD} ${userName}现在收得到你的消息。以前拒收过的还在记录里，那是过去的事。`;
    }
    return '';
};

/** 焊在「回到你自己」后面：开口前最后一眼仍是拒收。不加历史前缀。 */
export const buildBlockRecencyStamp = (
    state: BlockState,
    userName: string,
    opts?: BlockPromptOpts,
): string => {
    if (!state.blocked) return '';
    const canCall = !!opts?.canCall && !state.blockCallsToo;
    const ways = canCall ? '求看看卡、好友申请或打电话' : '求看看卡或好友申请';
    return `\n\n【此刻仍被拒收】${userName}现在看不见你的普通文字。想被看见只能发${ways}。`;
};

export type BlockNoticeKind =
    | 'peek-discard'
    | 'peek-reveal'
    | 'peek-secret-hidden'
    | 'peek-secret-known'
    | 'request-accept'
    | 'request-ignore'
    | 'call-hangup';

export const blockNoticeText = (kind: BlockNoticeKind): string => {
    if (kind === 'peek-discard') return '你扔掉了这条求看看';
    if (kind === 'peek-reveal') return '你看了这条求看看';
    if (kind === 'peek-secret-hidden') return '你偷偷看了一下，对方没察觉';
    if (kind === 'peek-secret-known') return '你偷偷看了一下，对方察觉了';
    if (kind === 'request-accept') return '你通过了这条好友申请';
    if (kind === 'request-ignore') return '你忽略了这条好友申请';
    return '你挂断了电话，ta 因此发来一条消息';
};

export const peekCardStatusText = (meta?: Message['metadata']): string => {
    const outcome = String(meta?.peekOutcome || (meta?.peekViewed ? 'reveal' : ''));
    if (outcome === 'discard') return blockNoticeText('peek-discard');
    if (outcome === 'reveal') return blockNoticeText('peek-reveal');
    if (outcome === 'secret') return blockNoticeText(meta?.peekCharacterKnows ? 'peek-secret-known' : 'peek-secret-hidden');
    return '选一种回应……猫儿会记住';
};

export const peekNoticeKind = (action: 'peek-viewed' | 'peek-discard' | 'peek-secret', knows: boolean): BlockNoticeKind => {
    if (action === 'peek-discard') return 'peek-discard';
    if (action === 'peek-viewed') return 'peek-reveal';
    return knows ? 'peek-secret-known' : 'peek-secret-hidden';
};

export const saveBlockNotice = async (charId: string, kind: BlockNoticeKind): Promise<number> => {
    return DB.saveMessage({
        charId,
        role: 'system',
        type: 'system',
        content: blockNoticeText(kind),
        metadata: { source: BLOCK_NOTICE_SOURCE, blockNoticeKind: kind },
    });
};
