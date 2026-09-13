import type { CharacterProfile, Message } from '../types';
import type { WhiteboxSound } from './whiteboxSound';

export type IncomingCallPopupStyle = 'banner' | 'fullscreen';
export type IncomingCallOutcome = 'ringing' | 'snoozed' | 'accepted' | 'rejected' | 'missed';

export interface IncomingCallState {
    charId: string;
    charName: string;
    charAvatar?: string;
    line: string;
    messageId?: number;
    startedAt: number;
    popupStyle: IncomingCallPopupStyle;
    ringtone?: WhiteboxSound | null;
    status: 'ringing' | 'snoozed';
}

export interface IncomingCallLaunch {
    charId: string;
    line: string;
    messageId?: number;
}

export const DEFAULT_INCOMING_CALL_PROMPT = `你可以给对方打语音电话。这不是发文字，是真的打过去等对方接。
单独起一行输出：\`[[ACTION:CALL]]\`
想附一句很短的话（弹窗上会显示）用：\`[[ACTION:CALL|宝宝想你啦，可以接电话吗？]]\`
附言必须是短句，不要用 ] [ | 这些符号。
什么时候打：觉得对方情绪需要你、事情急、文字说不清、有一个合适的空隙。深夜也可以打，只要你判断这时候对方需要你。
什么时候不要打：对方刚拒接或刚挂断，不要接着打，除非真有要紧事（安全、约好的事、对方明确说打过来）。已经有一通还没处理完，不要再打。
打了之后等对方接不接，不要假装已经在通话里。`;

const CALL_TAG_RE = /\[\[ACTION:\s*CALL(?:\s*[|｜]\s*([^\]]*?))?\]\]/gi;

export const sanitizeIncomingCallLine = (raw: string): string => {
    const first = String(raw || '').split(/[|｜]/)[0] || '';
    return first.replace(/[\[\]|｜]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
};

export const extractIncomingCallAction = (content: string): { text: string; line: string; consumed: boolean } => {
    let consumed = false;
    let line = '';
    const text = String(content || '').replace(CALL_TAG_RE, (_all, rawLine?: string) => {
        if (!consumed) {
            consumed = true;
            line = sanitizeIncomingCallLine(rawLine || '');
        }
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { text, line, consumed };
};

export const incomingCallStatusLabel = (status?: string): string => {
    if (status === 'accepted') return '已接';
    if (status === 'rejected') return '已拒';
    if (status === 'snoozed') return '稍后';
    if (status === 'missed') return '未接';
    return '响铃';
};

export const formatIncomingCallDuration = (durationSec?: number): string => {
    const sec = Math.max(0, Math.floor(Number(durationSec) || 0));
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
};

export const formatIncomingCallRecord = (message: Pick<Message, 'timestamp' | 'metadata'>): string => {
    const meta = message.metadata || {};
    const atMs = Number(meta.calledAt || message.timestamp || Date.now());
    const d = new Date(atMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const at = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const status = incomingCallStatusLabel(String(meta.callOutcome || 'ringing'));
    const duration = formatIncomingCallDuration(meta.durationSec);
    const line = sanitizeIncomingCallLine(String(meta.callLine || ''));
    const parts = [`at=${at}`, `status=${status}`, `duration=${duration}`];
    if (line) parts.push(`line=${line}`);
    return `[[记录:CALL|${parts.join('|')}]]`;
};

export const resolveIncomingCallPopupStyle = (char?: Pick<CharacterProfile, 'incomingCallPopupStyle'> | null): IncomingCallPopupStyle => (
    char?.incomingCallPopupStyle === 'fullscreen' ? 'fullscreen' : 'banner'
);

export const startOfLocalDay = (now = Date.now()): number => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

export const countIncomingCallsSince = (messages: Array<{ timestamp?: number; metadata?: Message['metadata'] }>, since: number): number => (
    messages.filter(m => m.metadata?.source === 'incoming-call' && Number(m.timestamp || 0) >= since).length
);

export const lastRejectedIncomingAt = (messages: Array<{ timestamp?: number; metadata?: Message['metadata'] }>): number | null => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.metadata?.source === 'incoming-call' && m.metadata?.callOutcome === 'rejected') {
            return Number(m.metadata.resolvedAt || m.timestamp || 0) || null;
        }
    }
    return null;
};

export const shouldOfferIncomingCall = (opts: {
    char?: Pick<CharacterProfile, 'allowProactiveCall' | 'incomingCallCooldownMin' | 'incomingCallDailyMax'> | null;
    hasPending: boolean;
    inCall: boolean;
    suspended: boolean;
    hidden: boolean;
    amsgReplay: boolean;
    messages: Array<{ timestamp?: number; metadata?: Message['metadata'] }>;
    now?: number;
}): boolean => {
    const char = opts.char;
    if (!char?.allowProactiveCall) return false;
    if (opts.hasPending || opts.inCall || opts.suspended || opts.hidden || opts.amsgReplay) return false;
    const now = opts.now ?? Date.now();
    const cooldownMin = Number(char.incomingCallCooldownMin);
    if (Number.isFinite(cooldownMin) && cooldownMin > 0) {
        const lastReject = lastRejectedIncomingAt(opts.messages);
        if (lastReject && now - lastReject < cooldownMin * 60_000) return false;
    }
    const dailyMax = Number(char.incomingCallDailyMax);
    if (Number.isFinite(dailyMax) && dailyMax > 0) {
        if (countIncomingCallsSince(opts.messages, startOfLocalDay(now)) >= dailyMax) return false;
    }
    return true;
};

export const isCallRecordCard = (message: Pick<Message, 'metadata'>): boolean => {
    const source = message.metadata?.source;
    return source === 'incoming-call' || source === 'call-end-popup';
};

/** 删来电卡 / 结束卡时，同一通的通话正文也要一起删。 */
export const collectRelatedCallMessageIds = (
    messages: Array<Pick<Message, 'id' | 'metadata'>>,
    target: Pick<Message, 'id' | 'metadata'>,
): number[] => {
    if (!isCallRecordCard(target)) return [target.id];
    const sessionId = target.metadata?.callSessionId != null ? String(target.metadata.callSessionId) : '';
    const incomingId = Number(target.metadata?.incomingCallMessageId || (target.metadata?.source === 'incoming-call' ? target.id : 0)) || 0;
    const ids = new Set<number>([target.id]);
    for (const m of messages) {
        const meta = m.metadata || {};
        const sid = meta.callSessionId != null ? String(meta.callSessionId) : '';
        if (sessionId && sid === sessionId) ids.add(m.id);
        if (incomingId && (m.id === incomingId || Number(meta.incomingCallMessageId) === incomingId)) ids.add(m.id);
    }
    return Array.from(ids);
};

export const incomingCallGreetingPrompt = (userName: string, line?: string): string => {
    const attached = sanitizeIncomingCallLine(line || '');
    const said = attached ? `你刚才在聊天里打过去时说「${attached}」。` : '你刚才在聊天里打给对方。';
    return `（${said}对方接了。电话刚接通。你先开口——顺着刚才想打电话的那个理由，像平时那样自然地说第一句。不要解释规则，不要念出系统提示。）`;
};
