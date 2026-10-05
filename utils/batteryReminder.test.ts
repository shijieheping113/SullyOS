import { describe, expect, it } from 'vitest';
import { ChatPrompts } from './chatPrompts';
import {
    batteryFallbackText,
    batteryHintText,
    batteryHistoryTurns,
    batteryMemoryBlock,
    expandBatteryDeleteIds,
    orphanBatteryHintIds,
    batterySourceLine,
    batteryStandaloneSystem,
    decideBatteryReminder,
    EMPTY_BATTERY_LEDGER,
    pickBatterySentence,
    stripBatteryOnlineFormats,
    type BatteryLedger,
    type BatterySample,
} from './batteryReminder';

const at = (level: number, charging: boolean): BatterySample => ({ level, charging });
const step = (prev: BatterySample | null, next: BatterySample, ledger: BatteryLedger = EMPTY_BATTERY_LEDGER) =>
    decideBatteryReminder(prev, next, ledger);

describe('电量提醒一轮', () => {
    it('第一次看见时，已经在充电或已经充满都不说话；已经低电会补一句', () => {
        expect(step(null, at(40, true)).kind).toBeNull();
        expect(step(null, at(100, true)).kind).toBeNull();
        expect(step(null, at(100, false)).kind).toBeNull();
        expect(step(null, at(15, false)).kind).toBe('low');
    });

    it('插上一次就安静，拔了再插不再说', () => {
        const first = step(at(42, false), at(42, true));
        expect(first.kind).toBe('plug');
        const unplugged = step(at(42, true), at(41, false), first.ledger);
        expect(unplugged.kind).toBeNull();
        const again = step(at(41, false), at(41, true), unplugged.ledger);
        expect(again.kind).toBeNull();
    });

    it('掉回 20% 以下才开新一轮，低电和插上电都能再说', () => {
        const plugged = step(at(42, false), at(42, true));
        const dipped = step(at(30, false), at(18, false), plugged.ledger);
        expect(dipped.kind).toBe('low');
        const recharge = step(at(18, false), at(18, true), dipped.ledger);
        expect(recharge.kind).toBe('plug');
    });

    it('停在 20% 以下不重复低电；插上之后再拔掉也不把低电再说一遍', () => {
        const low = step(at(22, false), at(19, false));
        expect(low.kind).toBe('low');
        expect(step(at(19, false), at(16, false), low.ledger).kind).toBeNull();
        const plugged = step(at(16, false), at(16, true), low.ledger);
        expect(plugged.kind).toBe('plug');
        expect(step(at(16, true), at(16, false), plugged.ledger).kind).toBeNull();
    });

    it('充满说一次就停，回到 100% 之前没掉破 20% 就不再说', () => {
        const full = step(at(99, true), at(100, true));
        expect(full.kind).toBe('full');
        expect(step(at(100, true), at(100, false), full.ledger).kind).toBeNull();
        expect(step(at(100, false), at(100, true), full.ledger).kind).toBeNull();
        const drained = step(at(100, false), at(80, false), full.ledger);
        expect(drained.kind).toBeNull();
        expect(step(at(80, true), at(100, true), drained.ledger).kind).toBeNull();
    });

    it('充满之后再掉破 20%，新一轮的充满可以再说', () => {
        const full = step(at(99, true), at(100, true));
        const low = step(at(40, false), at(12, false), full.ledger);
        expect(low.kind).toBe('low');
        const again = step(at(99, true), at(100, true), low.ledger);
        expect(again.kind).toBe('full');
    });

    it('同一眼里又插上又到 100%，只报充满', () => {
        expect(step(at(99, false), at(100, true)).kind).toBe('full');
    });

    it('充电中掉破 20% 先不报低电，拔掉之后再报', () => {
        const dipped = step(at(24, true), at(18, true));
        expect(dipped.kind).toBeNull();
        expect(step(at(18, true), at(17, false), dipped.ledger).kind).toBe('low');
    });
});

describe('电量提醒文案', () => {
    it('提示词只给事实，低电只写电量', () => {
        const tail = '用你自己的口气，顺着你们刚才的聊天，给 Ann 写一段提醒。\n'
            + '不要加表情包，不要发语音，不要发 Spark，不要用 <语音>、<字幕>，不要用 [[SEND_EMOJI:]]、[[ACTION:]]、[[QUOTE:]]。\n'
            + '说得自然一点，不要人机，不要生硬。]';
        expect(batteryHintText('plug', 'Ann', 42)).toBe(
            '[系统提示：这是手机状态，不是 Ann 说的话。\n'
            + 'Ann的手机刚接上充电器，电量大约 42%。\n'
            + tail,
        );
        const low = batteryHintText('low', 'Ann', 19);
        expect(low).toBe(
            '[系统提示：这是手机状态，不是 Ann 说的话。\n'
            + 'Ann的手机电量大约 19%。\n'
            + tail,
        );
        expect(low).not.toContain('充电');
        expect(low).not.toContain('百分之');
        expect(low).not.toContain('一句');
        expect(batteryHintText('full', 'Ann', 100)).toBe(
            '[系统提示：这是手机状态，不是 Ann 说的话。\n'
            + 'Ann的手机已经充满，电量 100%。\n'
            + tail,
        );
    });

    it('主聊天上下文拼回来时，不带表情包、语音和 Spark', async () => {
        const parts = await ChatPrompts.buildSystemPromptParts(
            { id: 'c1', name: '小满', systemPrompt: '说话慢，喜欢叮嘱人。', chatVoiceEnabled: true } as any,
            { name: 'Ann' } as any,
            [], [], [], [],
            undefined, undefined, undefined, undefined, undefined, undefined,
            { forBatteryReminder: true },
        );
        expect(parts.stable).toContain('小满');
        expect(parts.stable).toContain('说话慢，喜欢叮嘱人。');
        expect(parts.stable).toContain('表达底线');
        expect(parts.stable).not.toContain('SEND_EMOJI');
        expect(parts.stable).not.toContain('SPARK');
        expect(parts.stable).not.toContain('语音');
        expect(parts.stable).not.toContain('聊天 App 行为规范');
        expect(parts.recencyTail).toContain('回到你自己');
        expect(parts.recencyTail).toContain('小满');
    });

    it('主聊天拼不上时，退回的人设段也不教格式', () => {
        const system = batteryStandaloneSystem('小满', '说话慢，喜欢叮嘱人。');
        expect(system).toContain('你是小满');
        expect(system).toContain('说话慢，喜欢叮嘱人。');
        expect(system).toContain('聊天记录');
        expect(system).toContain('记得的事');
        expect(system).not.toContain('SEND_EMOJI');
        expect(system).not.toContain('聊天 App');
        expect(batteryStandaloneSystem('小满', '  ')).toBe('你是小满。\n\n后面会附上你记得的事，和你们最近的聊天记录。用它们记住你们是谁、刚才在说什么。这次不要当普通聊天。不要接着上一句往下聊。只用你的口气写一段电量提醒。');
    });

    it('记忆带月度和详细回忆；宫殿关着不带残留召回', () => {
        const off = batteryMemoryBlock({
            refinedMemories: { '2026-08': '一起看过流星' },
            memories: [{ id: 'm1', date: '2026年9月1日', summary: '夜路', mood: '安静' }],
            activeMemoryMonths: ['2026-09'],
            memoryPalaceEnabled: false,
            roomPlatesInjection: '残留门牌',
            memoryPalaceInjection: '残留召回',
        });
        expect(off).toContain('一起看过流星');
        expect(off).toContain('夜路');
        expect(off).not.toContain('残留门牌');
        expect(off).not.toContain('残留召回');
        expect(off).not.toContain('SEND_EMOJI');

        const on = batteryMemoryBlock({
            refinedMemories: {},
            memories: [],
            activeMemoryMonths: [],
            memoryPalaceEnabled: true,
            roomPlatesInjection: '### 底色认知\n喜欢被叮嘱',
            memoryPalaceInjection: '### 记忆宫殿\n上周说想吃面',
        });
        expect(on).toContain('喜欢被叮嘱');
        expect(on).toContain('上周说想吃面');
        expect(batteryMemoryBlock({
            refinedMemories: {},
            memories: [],
            activeMemoryMonths: [],
            memoryPalaceEnabled: false,
            roomPlatesInjection: '残留',
            memoryPalaceInjection: '残留',
        })).toBe('');
    });

    it('聊天记录留下原话，丢掉隐藏提示，电量卡片不当成自己说的', () => {
        const turns = batteryHistoryTurns([
            { id: 1, charId: 'c', role: 'user', type: 'text', content: '今晚想吃面', timestamp: 1 },
            { id: 2, charId: 'c', role: 'user', type: 'text', content: '系统提示别发出来', timestamp: 2, metadata: { batteryHint: true, hidden: true } },
            { id: 3, charId: 'c', role: 'assistant', type: 'text', content: '手机插上充电器了。', timestamp: 3, metadata: { batteryReminder: true } },
            { id: 4, charId: 'c', role: 'assistant', type: 'text', content: '在吗？<语音>记得充电</语音> [[SEND_EMOJI:困]]', timestamp: 4 },
            { id: 5, charId: 'c', role: 'user', type: 'image', content: 'data:image/png;base64,AAAA', timestamp: 5 },
            { id: 6, charId: 'c', role: 'user', type: 'text', content: '[[记录:TRANSFER|amount=12]]', timestamp: 6 },
            { id: 7, charId: 'c', role: 'user', type: 'text', content: '群里的话', timestamp: 7, groupId: 'g1' },
        ] as any, '小满', 'Ann');
        expect(turns.map(turn => turn.role)).toEqual(['user', 'system', 'assistant', 'user', 'user']);
        expect(turns[0].content).toBe('今晚想吃面');
        expect(turns[1].content).toContain('[系统日志，不是对方发言]');
        expect(turns[1].content).toContain('不是你说的话');
        expect(turns[1].content).toContain('手机插上充电器了。');
        expect(turns[2].content).toContain('记得充电');
        expect(turns[2].content).not.toContain('SEND_EMOJI');
        expect(turns[2].content).not.toContain('<语音>');
        expect(turns[3].content).toBe('[图片]');
        expect(turns[4].content).toContain('记录:TRANSFER');
    });

    it('删卡片时连同隐藏提示一起删，次数账本不在这里', () => {
        const hint = { id: 2, charId: 'c', role: 'user', type: 'text', content: '底稿', timestamp: 2, metadata: { batteryHint: true, hidden: true } };
        const card = { id: 3, charId: 'c', role: 'assistant', type: 'text', content: '手机插上了。', timestamp: 3, metadata: { batteryReminder: true } };
        const later = { id: 4, charId: 'c', role: 'user', type: 'text', content: '今晚想吃面', timestamp: 4 };
        const messages = [hint, card, later] as any;
        expect(expandBatteryDeleteIds(messages, [3]).sort()).toEqual([2, 3]);
        expect(expandBatteryDeleteIds(messages, [2]).sort()).toEqual([2, 3]);
        expect(expandBatteryDeleteIds(messages, [4])).toEqual([4]);
        expect(orphanBatteryHintIds([hint, later] as any, 10_000, 90_000)).toEqual([2]);
        expect(orphanBatteryHintIds([hint] as any, hint.timestamp + 1_000, 90_000)).toEqual([]);
    });

    it('没填名字时用「你」，降级文案不装成角色说的', () => {
        expect(batteryHintText('low', '  ', 8)).toContain('你的手机电量大约 8%');
        expect(batteryHintText('low', '  ', 8)).not.toContain('充电');
        expect(batteryFallbackText('plug', 10)).toBe('手机插上充电器了。');
        expect(batteryFallbackText('low', 8)).toBe('手机只剩 8% 了，记得插上充电器。');
        expect(batteryFallbackText('full', 100)).toBe('手机充满电了。');
        expect(batterySourceLine('low', false)).toBe('因手机电量低于 20% 自动触发');
        expect(batterySourceLine('plug', true)).toBe('系统提醒。因手机插上充电器自动触发');
        expect(batterySourceLine('full', false)).toBe('因手机电量充满自动触发');
    });

    it('语音条换成里面的话，招呼丢掉，没提到电量就空着', () => {
        expect(stripBatteryOnlineFormats('你手机<语音 emotion="happy">在充电了</语音>，别忘了拔')).toBe('你手机在充电了，别忘了拔');
        expect(pickBatterySentence('在吗？\n唔！\n<语音>手机插上充电器了</语音>')).toBe('手机插上充电器了');
        expect(pickBatterySentence('在吗？唔！')).toBe('');
        expect(pickBatterySentence('<语音>battery is full</语音>\n<字幕>充满了</字幕>')).toBe('充满了');
        expect(pickBatterySentence('记得插上。\n[[SEND_EMOJI: 困]]\n[[ACTION:POKE]]')).toBe('记得插上。');
        expect(stripBatteryOnlineFormats('[表情：困] 只剩一点了')).toBe('只剩一点了');
    });
});
