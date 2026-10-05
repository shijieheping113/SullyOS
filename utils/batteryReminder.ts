/**
 * 手机电量提醒 · 判定和账本。
 *
 * 一轮里低电、插上电、充满各说一次。
 * 插上一次就安静，拔了再插不再说。
 * 充满也说一次就停。
 * 电量从 20% 或以上再掉到 20% 以下，两个勾清掉，才开新的一轮。
 *
 * 账本多记一个「充满报过」。设计说明只点了低电和插上电两个勾；
 * 充满要「说一次直到下一轮」，必须记住这一轮已经说过，否则会在 100% 附近再响。
 * 掉破 20% 时三个一起清掉。
 *
 * 这一轮带人设、记忆、最近的聊天记录。不带主聊天的语音、表情包、行为规范。
 */
import type { CharacterProfile, Message } from '../types';
import { SYSTEM_LOG_LEAD } from './block';
import { readableContextMemories } from './contextMemories';
import { normalizeMessageContent } from './messageFormat';
export type BatteryKind = 'plug' | 'low' | 'full';

export interface BatterySample {
    /** 0–100 的整数百分比 */
    level: number;
    charging: boolean;
}

export interface BatteryLedger {
    lowReported: boolean;
    plugReported: boolean;
    fullReported: boolean;
}

export const EMPTY_BATTERY_LEDGER: BatteryLedger = {
    lowReported: false,
    plugReported: false,
    fullReported: false,
};

export const BATTERY_KIND_COLOR: Record<BatteryKind, string> = {
    plug: '#E8A03C',
    low: '#E2657E',
    full: '#2FA98A',
};

const ENABLED_KEY = 'sully_battery_reminder_enabled';
const LEDGER_KEY = 'sully_battery_reminder_ledger';
const SAMPLE_KEY = 'sully_battery_reminder_sample';
const LAST_KEY = 'sully_battery_reminder_last';

export interface BatteryLastTrigger {
    kind: BatteryKind;
    at: number;
    systemFallback: boolean;
}

/** 账本和界面都用 0–100 的整数。浏览器接口的 0–1 要先乘 100，这里不再猜。 */
export function clampBatteryLevel(level: number): number {
    if (!Number.isFinite(level)) return 0;
    const pct = Math.round(level);
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
}

export function decideBatteryReminder(
    prev: BatterySample | null,
    next: BatterySample,
    ledger: BatteryLedger,
): { kind: BatteryKind | null; ledger: BatteryLedger } {
    const level = clampBatteryLevel(next.level);
    const charging = !!next.charging;
    const prevLevel = prev ? clampBatteryLevel(prev.level) : null;
    let nextLedger: BatteryLedger = {
        lowReported: !!ledger?.lowReported,
        plugReported: !!ledger?.plugReported,
        fullReported: !!ledger?.fullReported,
    };

    if (prevLevel != null && prevLevel >= 20 && level < 20) {
        nextLedger = { lowReported: false, plugReported: false, fullReported: false };
    }

    const hitFull = prevLevel != null && prevLevel < 100 && level >= 100;
    const plugged = !!prev && !prev.charging && charging;
    const lowNow = level < 20 && !charging;

    if (hitFull && !nextLedger.fullReported) {
        return {
            kind: 'full',
            ledger: { lowReported: true, plugReported: true, fullReported: true },
        };
    }
    if (plugged && !nextLedger.plugReported) {
        return { kind: 'plug', ledger: { ...nextLedger, plugReported: true } };
    }
    if (lowNow && !nextLedger.lowReported) {
        return { kind: 'low', ledger: { ...nextLedger, lowReported: true } };
    }
    return { kind: null, ledger: nextLedger };
}

export function batteryUserName(name: string | null | undefined): string {
    const trimmed = (name || '').trim();
    return trimmed || '你';
}

/** 电量这一轮的身份。人设决定口气。记忆和聊天记录由后面的消息另附，这里不写格式规矩。 */
export function batteryStandaloneSystem(charName: string, persona: string): string {
    const name = (charName || '').trim() || '角色';
    const who = (persona || '').trim();
    const identity = who
        ? `你是${name}。下面是你自己的人设，用来决定口气：\n${who}`
        : `你是${name}。`;
    return `${identity}\n\n后面会附上你记得的事，和你们最近的聊天记录。用它们记住你们是谁、刚才在说什么。这次不要当普通聊天。不要接着上一句往下聊。只用你的口气写一段电量提醒。`;
}

const HISTORY_TEXT_CAP = 1200;
const DATA_URI_RE = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+[;,]\S*/gi;
const ONLINE_FORMAT_TOKEN = /\[\[(?:SEND_EMOJI|ACTION|QUOTE):[\s\S]*?\]\]/g;

/** 聊天记录里的字留下。语音标签换成里面的话，表情包和动作暗号拿掉，转账这类记录留下。 */
export function batteryHistoryPlain(raw: string): string {
    let text = String(raw || '');
    text = text.replace(VOICE_BLOCK, block => voiceInner(block));
    text = text.replace(/<字幕>([\s\S]*?)<\/字幕>/g, (_all, inner) => String(inner || '').trim());
    text = text.replace(ONLINE_FORMAT_TOKEN, '');
    text = text.replace(DATA_URI_RE, '[媒体]');
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length <= HISTORY_TEXT_CAP) return text;
    return `${text.slice(0, HISTORY_TEXT_CAP)}…`;
}

/**
 * 删电量卡片时，把紧挨着的那条隐藏提示一起从聊天记录里拿走。
 * 不碰本地次数账本。账本记的是这一轮说过没有，跟聊天里还留不留这张卡是两回事。
 */
export function expandBatteryDeleteIds(messages: Message[], ids: number[]): number[] {
    const wanted = new Set(ids.filter(id => Number.isFinite(id)));
    const sorted = (messages || []).filter(message => message && !message.groupId).sort((a, b) => a.id - b.id);
    const indexById = new Map(sorted.map((message, index) => [message.id, index]));
    for (const id of [...wanted]) {
        const index = indexById.get(id);
        const message = index == null ? undefined : sorted[index];
        if (!message) continue;
        if (message.metadata?.batteryReminder) {
            for (let cursor = index - 1; cursor >= 0; cursor--) {
                const previous = sorted[cursor];
                if (previous.charId !== message.charId) continue;
                if (previous.metadata?.batteryReminder) break;
                if (previous.metadata?.batteryHint) {
                    wanted.add(previous.id);
                    break;
                }
            }
        }
        if (message.metadata?.batteryHint) {
            for (let cursor = index + 1; cursor < sorted.length; cursor++) {
                const next = sorted[cursor];
                if (next.charId !== message.charId) continue;
                if (next.metadata?.batteryHint) break;
                if (next.metadata?.batteryReminder) {
                    wanted.add(next.id);
                    break;
                }
            }
        }
    }
    return [...wanted];
}

/**
 * 卡片已经不在了、还留在库里的隐藏提示。
 * 刚写下去、卡片还没落库的那一条先留着，避免说到一半被清掉。
 */
export function orphanBatteryHintIds(messages: Message[], now = Date.now(), graceMs = 90_000): number[] {
    const sorted = (messages || []).filter(message => message && !message.groupId).sort((a, b) => a.id - b.id);
    const orphans: number[] = [];
    for (let index = 0; index < sorted.length; index++) {
        const message = sorted[index];
        if (!message.metadata?.batteryHint) continue;
        let paired = false;
        let hasLater = false;
        for (let cursor = index + 1; cursor < sorted.length; cursor++) {
            const next = sorted[cursor];
            if (next.charId !== message.charId) continue;
            hasLater = true;
            if (next.metadata?.batteryHint) break;
            if (next.metadata?.batteryReminder) {
                paired = true;
                break;
            }
        }
        if (paired) continue;
        const freshTail = !hasLater && now - (message.timestamp || 0) < graceMs;
        if (!freshTail) orphans.push(message.id);
    }
    return orphans;
}

/** 最近聊天。隐藏提示丢掉。电量卡片改成系统日志，免得模型以为那是自己说的。 */
export function batteryHistoryTurns(
    messages: Message[],
    charName: string,
    userName: string,
): { role: string; content: string }[] {
    const name = (charName || '').trim() || '角色';
    const who = batteryUserName(userName);
    const turns: { role: string; content: string }[] = [];
    for (const message of messages || []) {
        if (!message || message.groupId) continue;
        if (message.metadata?.batteryHint || message.metadata?.proactiveHint || message.metadata?.hidden) continue;
        if (message.metadata?.batteryReminder) {
            const line = batteryHistoryPlain(String(message.content || ''));
            if (!line) continue;
            turns.push({
                role: 'system',
                content: `${SYSTEM_LOG_LEAD} [电量提醒卡片，不是你说的话] ${line}`,
            });
            continue;
        }
        const text = batteryHistoryPlain(normalizeMessageContent(message, name, who));
        if (!text) continue;
        const role = message.role === 'assistant' || message.role === 'system' ? message.role : 'user';
        turns.push({ role, content: text });
    }
    return turns;
}

/**
 * 记忆正文。月度总结和当天激活的详细回忆一直带。
 * 门牌和宫殿召回只在宫殿开着时带，关掉后残留的旧注入不带。
 */
export function batteryMemoryBlock(char: Pick<
    CharacterProfile,
    'refinedMemories' | 'memories' | 'activeMemoryMonths' | 'memoryPalaceEnabled' | 'roomPlatesInjection' | 'memoryPalaceInjection'
>): string {
    const parts: string[] = [];
    const readable = readableContextMemories(char as CharacterProfile, true);
    if (readable.monthly.length || readable.daily.some(month => month.entries.length)) {
        let bank = '### 记忆系统\n';
        if (readable.monthly.length) {
            bank += '**长期核心记忆**:\n';
            readable.monthly.forEach(({ date, summary }) => {
                bank += `- [${date}]: ${summary}\n`;
            });
        }
        readable.daily.forEach(({ month, entries }) => {
            if (!entries.length) return;
            bank += `\n> 详细回忆 [${month}]:\n`;
            entries.forEach(entry => {
                bank += `  - ${entry.date} (${entry.mood || 'rec'}): ${entry.summary}\n`;
            });
        });
        parts.push(bank.trim());
    }
    if (char.memoryPalaceEnabled) {
        const plates = (char.roomPlatesInjection || '').trim();
        const recall = (char.memoryPalaceInjection || '').trim();
        if (plates) parts.push(plates);
        if (recall) parts.push(recall);
    }
    if (!parts.length) return '';
    return `下面是你记得的事。拿来决定口气和你知道的事，不要逐条复述。\n\n${parts.join('\n\n')}`;
}

/** 三段都只写这一次的事实，电量写在事实里。格式禁止和「自然一点」只出现这一次。 */
export function batteryHintText(kind: BatteryKind, userName: string, level: number): string {
    const name = batteryUserName(userName);
    const pct = kind === 'full' ? 100 : clampBatteryLevel(level);
    const fact = kind === 'plug'
        ? `${name}的手机刚接上充电器，电量大约 ${pct}%。`
        : kind === 'low'
            ? `${name}的手机电量大约 ${pct}%。`
            : `${name}的手机已经充满，电量 ${pct}%。`;
    return `[系统提示：这是手机状态，不是 ${name} 说的话。\n${fact}\n用你自己的口气，顺着你们刚才的聊天，给 ${name} 写一段提醒。\n不要加表情包，不要发语音，不要发 Spark，不要用 <语音>、<字幕>，不要用 [[SEND_EMOJI:]]、[[ACTION:]]、[[QUOTE:]]。\n说得自然一点，不要人机，不要生硬。]`;
}

const VOICE_BLOCK = /(?:<字幕>[\s\S]*?<\/字幕>\s*)?<[语語]音[^>]*>[\s\S]*?<\/\s*[语語]音\s*>(?:\s*<字幕>[\s\S]*?<\/字幕>)?/g;

const GREETING_ONLY = /^(?:在吗|在嘛|在不在|唔+|嗯+|啊+|哦+|喔+|喂+|嗨+|哈喽|hello|hi)[？?！!。.~～\s]*$/i;

function voiceInner(block: string): string {
    const subtitle = block.match(/<字幕>([\s\S]*?)<\/字幕>/);
    if (subtitle?.[1]?.trim()) return subtitle[1].trim();
    const spoken = block.match(/<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/);
    return (spoken?.[1] || '').trim();
}

/** 语音标签换成里面的话，暗号删掉，句子不要从中间切开。 */
export function stripBatteryOnlineFormats(raw: string): string {
    let text = String(raw || '');
    text = text.replace(/<(think|thinking|thought)>[\s\S]*?<\/\1>/gi, '');
    text = text.replace(/\[\[[\s\S]*?\]\]/g, '');
    text = text.replace(/\[表情[:：]\s*[^\]]+\]/gi, '');
    text = text.replace(VOICE_BLOCK, block => voiceInner(block));
    text = text.replace(/<字幕>([\s\S]*?)<\/字幕>/g, (_all, inner) => String(inner || '').trim());
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** 丢掉「在吗」「唔」这种招呼。留下真正提到电量的那句。一句都没提到，就交回固定文案。 */
export function pickBatterySentence(raw: string): string {
    const lines = stripBatteryOnlineFormats(raw)
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => line && !GREETING_ONLY.test(line));
    const unique: string[] = [];
    for (const line of lines) {
        if (unique[unique.length - 1] !== line) unique.push(line);
    }
    const about = unique.filter(line => /电|充|拔|插/.test(line));
    const chosen = (about.length ? about : unique).join('');
    if (!/电|充|拔|插/.test(chosen)) return '';
    return chosen;
}

export function batteryFallbackText(kind: BatteryKind, level: number): string {
    if (kind === 'plug') return '手机插上充电器了。';
    if (kind === 'full') return '手机充满电了。';
    return `手机只剩 ${clampBatteryLevel(level)}% 了，记得插上充电器。`;
}

export function batterySourceLine(kind: BatteryKind, systemFallback: boolean): string {
    const reason = kind === 'plug'
        ? '因手机插上充电器自动触发'
        : kind === 'low'
            ? '因手机电量低于 20% 自动触发'
            : '因手机电量充满自动触发';
    return systemFallback ? `系统提醒。${reason}` : reason;
}

export function batteryChipLabel(kind: BatteryKind, level: number): string {
    if (kind === 'plug') return '插上电了';
    if (kind === 'full') return '满啦';
    return `剩 ${clampBatteryLevel(level)}%`;
}

export function canReadBattery(): boolean {
    if (typeof navigator === 'undefined') return false;
    const getter = (navigator as Navigator & { getBattery?: unknown }).getBattery;
    return typeof getter === 'function';
}

function storage(): Storage | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch {
        return null;
    }
}

export function readBatteryReminderEnabled(): boolean {
    const raw = storage()?.getItem(ENABLED_KEY);
    if (raw == null) return true;
    return raw === '1';
}

export function writeBatteryReminderEnabled(on: boolean): void {
    storage()?.setItem(ENABLED_KEY, on ? '1' : '0');
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('battery-reminder-enabled-changed'));
    }
}

export function readBatteryLedger(): BatteryLedger {
    try {
        const raw = JSON.parse(storage()?.getItem(LEDGER_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return { ...EMPTY_BATTERY_LEDGER };
        return {
            lowReported: !!raw.lowReported,
            plugReported: !!raw.plugReported,
            fullReported: !!raw.fullReported,
        };
    } catch {
        return { ...EMPTY_BATTERY_LEDGER };
    }
}

export function writeBatteryLedger(ledger: BatteryLedger): void {
    storage()?.setItem(LEDGER_KEY, JSON.stringify({
        lowReported: !!ledger.lowReported,
        plugReported: !!ledger.plugReported,
        fullReported: !!ledger.fullReported,
    }));
}

export function readBatterySample(): BatterySample | null {
    try {
        const raw = JSON.parse(storage()?.getItem(SAMPLE_KEY) || 'null');
        if (!raw || typeof raw !== 'object' || !Number.isFinite(Number(raw.level))) return null;
        return { level: clampBatteryLevel(Number(raw.level)), charging: !!raw.charging };
    } catch {
        return null;
    }
}

export function writeBatterySample(sample: BatterySample): void {
    storage()?.setItem(SAMPLE_KEY, JSON.stringify({
        level: clampBatteryLevel(sample.level),
        charging: !!sample.charging,
    }));
}

export function readBatteryLastTrigger(): BatteryLastTrigger | null {
    try {
        const raw = JSON.parse(storage()?.getItem(LAST_KEY) || 'null');
        if (!raw || (raw.kind !== 'plug' && raw.kind !== 'low' && raw.kind !== 'full')) return null;
        return { kind: raw.kind, at: Number(raw.at) || 0, systemFallback: !!raw.systemFallback };
    } catch {
        return null;
    }
}

export function writeBatteryLastTrigger(last: BatteryLastTrigger): void {
    storage()?.setItem(LAST_KEY, JSON.stringify(last));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('battery-reminder-last-changed'));
    }
}
