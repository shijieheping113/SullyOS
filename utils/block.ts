import type { Message } from '../types';
import { DB } from './db';

/**
 * 拉黑（冷战玩法）——状态的事实源是聊天记录里的 [[记录:BLOCK|...]] 系统消息，
 * 角色人设/CharacterProfile 一概不动。代码和模型读同一份记录：
 *   拉黑  → metadata.source='block-status', blockStatus='已拉黑', blockCallsToo
 *   解除  → blockStatus='已解除'（解除即全部解除，电话不留尾巴）
 * 拉黑期间角色的每条回复照常落库进气泡，只是 metadata.blockSendFailed=true，
 * UI 挂「未送达」标记，拼上下文时带 [[记录:BLOCK_SEND|...|status=已拒收]]。
 * 求看看是一封信，正文保留换行，代码不截字。好友申请附言仍压成一行。
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

/**
 * 给模型看的拉黑记录。电话这一格只写结论：可以打 / 打不通。
 * 不要写「是 / 否」。「是」会被读成电话能打，旧代码里它却表示电话也被拒了。
 * 没开主动来电，或者勾了连电话一起拒，都是打不通。
 * 开了主动来电，并且没有拒电话，才是可以打。
 * 来电闸门只看 metadata.blockCallsToo，不解析这几个字。
 */
export const formatBlockRecord = (opts: {
    at: number;
    status: '已拉黑' | '已解除';
    blockCallsToo?: boolean;
    allowProactiveCall?: boolean;
}): string => {
    const d = new Date(opts.at);
    const at = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const parts = [`at=${at}`, `status=${opts.status}`];
    if (opts.status === '已拉黑') {
        const canReach = opts.allowProactiveCall === true && !opts.blockCallsToo;
        parts.push(`电话=${canReach ? '可以打' : '打不通'}`);
    }
    return `[[记录:BLOCK|${parts.join('|')}]]`;
};

/** 落一条拉黑状态记录（拉黑/解除/事后补选电话都走这里）。 */
export const saveBlockRecord = async (
    charId: string,
    status: '已拉黑' | '已解除',
    blockCallsToo?: boolean,
    extra?: { patchedCalls?: boolean; relaxedCalls?: boolean; allowProactiveCall?: boolean },
): Promise<number> => {
    return DB.saveMessage({
        charId,
        role: 'system',
        type: 'system',
        content: formatBlockRecord({
            at: Date.now(),
            status,
            blockCallsToo,
            allowProactiveCall: extra?.allowProactiveCall,
        }),
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
export type PeekRecordStatus = '看过' | '没看' | '扔掉';

/**
 * 角色看见的求看看只有三种。偷偷看不把真相写进记录：
 * 察觉了是看过，没察觉是没看。原文另记，不靠这个状态决定留不留。
 */
export const peekRecordStatus = (meta?: Message['metadata']): PeekRecordStatus => {
    const outcome = String(meta?.peekOutcome || '');
    if (outcome === 'reveal') return '看过';
    if (outcome === 'discard') return '扔掉';
    if (outcome === 'secret') return meta?.peekCharacterKnows ? '看过' : '没看';
    if (meta?.peekViewed) return '看过';
    return '没看';
};

export const rollSecretPeekKnows = (): boolean => Math.random() < 0.5;

/** 求看看正文：留换行和竖线。只收掉行尾空白，避免信被压成一句。 */
export const normalizePeekLetter = (raw: string): string => (
    String(raw || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
);

/** 求看看卡 → 上下文记录。全文始终在，状态只写看过 / 没看 / 扔掉。 */
export const formatBlockPeekRecord = (message: Pick<Message, 'timestamp' | 'metadata'>): string => {
    const meta = message.metadata || {};
    const d = new Date(Number(message.timestamp || Date.now()));
    const at = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const status = peekRecordStatus(meta);
    const headline = String(meta.peekHeadline || '').replace(/\s+/g, ' ').trim();
    const line = normalizePeekLetter(String(meta.peekText || ''));
    const head = headline ? `起头：${headline}\n` : '';
    return `【求看看记录】${at}\n对方：${status}\n${head}你写下的：\n${line}`;
};

/** 块正文的第一行是起头，空行之后是信。只有一行时整段仍是信，不另造标题。 */
export const splitPeekLetter = (raw: string): { headline: string; line: string } => {
    const text = normalizePeekLetter(raw);
    const nl = text.indexOf('\n');
    if (nl < 0) return { headline: '', line: text };
    const headline = text.slice(0, nl).replace(/\s+/g, ' ').trim();
    const line = normalizePeekLetter(text.slice(nl + 1));
    if (!headline || !line) return { headline: '', line: text };
    return { headline, line };
};

// ─── 暗号解析（CALL 同款：剥符号防解析错乱。求看看不截字、不压换行） ───

const FRIEND_REQUEST_TAG_RE = /\[\[ACTION:\s*FRIEND_REQUEST(?:\s*[|｜]\s*([^\]]*?))?\]\]/gi;

export const sanitizeBlockActionLine = (raw: string): string => {
    const first = String(raw || '').split(/[|｜]/)[0] || '';
    return first.replace(/[\[\]|｜]/g, '').replace(/\s+/g, ' ').trim();
};

export const extractBlockPeekAction = (content: string): { text: string; line: string; headline: string; consumed: boolean; found: boolean } => {
    let src = String(content || '');
    let found = false;
    let chosenHeadline = '';
    let chosenLine = '';
    // 每次新建，避免全局正则的 lastIndex 在旧 WebView 里串到下一次。不用后行断言。
    const openRe = /\[\[\s*ACTION:\s*PEEK\s*(?:[|｜]\s*([\s\S]*?))?\s*\]\]/i;
    const closeRe = /\[\[\s*\/\s*(?:ACTION:\s*)?PEEK\s*\]\]/i;
    for (let guard = 0; guard < 6; guard += 1) {
        const open = openRe.exec(src);
        if (!open) break;
        found = true;
        const openEnd = open.index + open[0].length;
        const after = src.slice(openEnd);
        const close = closeRe.exec(after);
        const pipeLetter = normalizePeekLetter(String(open[1] || ''));
        const pipeHeadline = pipeLetter.replace(/\s+/g, ' ').trim();
        let end = openEnd;
        let headline = '';
        let line = '';
        if (close) {
            line = normalizePeekLetter(after.slice(0, close.index));
            end = openEnd + close.index + close[0].length;
            if (pipeHeadline && line) {
                headline = pipeHeadline;
            } else if (!line && pipeLetter) {
                line = pipeLetter;
            } else if (line) {
                const split = splitPeekLetter(line);
                headline = split.headline;
                line = split.line;
            }
        } else if (pipeLetter) {
            const next = after.search(/\[\[/);
            const rest = normalizePeekLetter(next >= 0 ? after.slice(0, next) : after);
            if (rest) {
                headline = pipeHeadline;
                line = rest;
                end = openEnd + (next >= 0 ? next : after.length);
            } else {
                line = pipeLetter;
            }
        }
        src = src.slice(0, open.index) + src.slice(end);
        if (!chosenLine && line) {
            chosenHeadline = headline;
            chosenLine = line;
        }
    }
    return {
        text: src.replace(/\n{3,}/g, '\n\n').trim(),
        line: chosenLine,
        headline: chosenHeadline,
        consumed: !!chosenLine,
        found,
    };
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
        const voice = opts?.canVoice ? '和语音' : '';
        const callSection = canCall
            ? `三、打电话
对方手机真的会响，接了才算通话。
单独一行：
[[ACTION:CALL]]
或
[[ACTION:CALL|附言]]
打不打也读空气，不是每句话都要打。`
            : `三、打电话
电话现在打不通。那是没打出去，不是已经在通话里。`;
        return `\n\n${SYSTEM_LOG_LEAD} 你被${userName}拒收了。${sinceStr}现在仍在拒收，这一条是当前状态，不是旧事。

【对方看不见】
你发的每一句普通文字${voice}，对方一条都看不到。
这些话可以写，那是你还在自己这边。对方没有收到。
**你仍然可以发消息${voice}。但是你要知道：这些，对方都没有收到。**

【你现在有的能力】

一、求看看
把你此刻真想让对方看见的话交给对方。
这是一封信，不是一条聊天气泡。聊天的短气泡规则管不到这封信里面。
长短由这封信自己决定。可以是一句。你要道歉、把一件事说清楚时，写成真诚的小作文，好几段都正常，写到这番话写完为止。**没有「最多一段」。**
起头和信写在一起。起头放进标签，跟好友申请同一套写法。信放在两个标签中间：
[[ACTION:PEEK|起头写在这里]]
信写在这里。
要分几段，段和段之间空一行。
[[/PEEK]]
**竖线后面、两个标签中间，都换成这一次真想说的话。不要原样照抄上面两句。**
起头是卡片标题，单独一句，不要写成第二封信，也不要抄上一封的起头。
两个地方都要有字。竖线后面空着，或两个标签中间没有信，就不要发这张卡。
最后一行必须是 [[/PEEK]]。
**写给这一次。不要抄记录里上一封，不要把同一封再贴一遍。**
没有此刻真想让对方看见的内容，就不要发。
读空气的例子，不是每次都要照做：
- 上一封还是没看，信还在。此刻再写一封，可能是往上堆。
- 上一封是看过，对方已经拿到了。可以顺着这个反应走，不必把同一封再递。
- 上一封是扔掉，这封被拒绝了。你记得自己写过什么，不必马上重写同一封。
- 空气变了以后，另一封不同的信仍然可以写。

二、好友申请
请求对方重新接收你的消息，恢复正常聊天。**发不发，看空气。**
要用时单独一行：
[[ACTION:FRIEND_REQUEST|一句附言]]
附言是这句请求，不是另一封小作文。
例子，不是禁令：
- 刚刚被拒绝，下一句就再求，对方会烦。
- **被拒绝不是以后都不许再求。** 隔了一段，对方看过你后来的话，或者空气已经不是刚才那一下，你仍想让对方重新接收你，可以再试。附言写这一次的，不要把上次那句再贴一遍。
- 连着被拒绝、空气没有变，这一阵可以先不求。这是现在先停，不是以后永远不再开口。
- 一次都没用过，就只能等对方自己解除拉黑。该开口时要肯开口。
- 用得太勤、没有新的空隙，对方会烦。
- 对方一直不看、不点，也是一种空气，由你判断还要不要再发。

${callSection}

【记住】
上面的情形是例子，帮你感觉空气，不是行为清单。
不要照抄，也不要每句都套同一个做法。
被拉黑以后，先看记录里真实发生的事：
- 求看看是看过、没看，还是扔掉。你写下的原文都在。
- 好友申请是待处理、已通过，还是已忽略。
- 这些事隔了多久。
然后自己想这一次怎么做。
**想，比套例子重要。**`;
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
    const seen = opts?.canVoice ? '普通文字和语音' : '普通文字';
    const send = opts?.canVoice ? '发消息和语音' : '发消息';
    return `\n\n【此刻仍被拒收】
${userName}看不见你的${seen}。
**你仍然可以${send}。但是你要知道：这些，对方都没有收到。**
**读空气。** 上面的情形是例子。自己想这一次该怎么做，不要照抄，也不要僵。`;
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
