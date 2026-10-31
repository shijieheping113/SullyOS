import React, { useState } from 'react';
import Modal from '../os/Modal';
import type { CharacterProfile } from '../../types';

export const memorySelfCheckKey = (id: string) => `memory-context-self-check:v1:${id}`;
export const activeLegacyMonths = (char: Pick<CharacterProfile, 'memoryPalaceEnabled' | 'activeMemoryMonths'>) =>
    char.memoryPalaceEnabled ? [...new Set(char.activeMemoryMonths || [])].sort() : [];
export const activeLegacyDays = (char: Pick<CharacterProfile, 'memoryPalaceEnabled' | 'activeMemoryDays'>) =>
    char.memoryPalaceEnabled ? [...new Set(char.activeMemoryDays || [])].sort() : [];

export default function MemoryContextSelfCheck({ character, active, onDisable }: {
    character: CharacterProfile;
    active: boolean;
    onDisable: (payload: { months: string[]; days: string[] }) => void;
}) {
    const [answered, setAnswered] = useState(() => {
        try { return localStorage.getItem(memorySelfCheckKey(character.id)) === 'done'; } catch { return false; }
    });
    const [help, setHelp] = useState(false);
    const months = activeLegacyMonths(character);
    const days = activeLegacyDays(character);
    const finish = () => {
        setAnswered(true);
        try { localStorage.setItem(memorySelfCheckKey(character.id), 'done'); } catch { /* Keep the session decision if storage is unavailable. */ }
    };
    const monthLabel = months.map(month => {
        const match = /^(\d{4})-(\d{2})$/.exec(month);
        return match ? `${match[1]}年${Number(match[2])}月` : month;
    }).join('、');
    const dayLabel = days.length <= 8
        ? days.join('、')
        : `${days.slice(0, 8).join('、')} 等 ${days.length} 天`;
    const parts: string[] = [];
    if (monthLabel) parts.push(`${monthLabel}整月`);
    if (dayLabel) parts.push(dayLabel);
    const label = parts.join('，以及');
    const hasDetail = months.length > 0 || days.length > 0;
    return <>
        <Modal isOpen={active && !answered && hasDetail} title="请自查" onClose={finish} footer={
            <div className="flex w-full flex-col gap-2">
                <button type="button" className="w-full py-3 rounded-2xl bg-primary text-white font-bold" onClick={() => { onDisable({ months, days }); finish(); }}>是</button>
                <button type="button" className="w-full py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold" onClick={() => { finish(); setHelp(true); }}>我看不懂</button>
                <button type="button" className="w-full py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold" onClick={finish}>否</button>
            </div>
        }>
            <p className="text-sm leading-relaxed text-slate-700 break-words">检测到{character.name}已启用记忆宫殿，而神经链接中目前打开了{label}的全局记忆进入上下文，是否需要关闭？</p>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">神经链接中的旧版总结可按月份或具体某几天加入上下文；记忆宫殿会按需召回已成功归档的记忆，通常覆盖启用后整理的内容，但不保证包含启用前的记录。例如 10 月才开启宫殿，10 月以前的经历可能仍需依靠神经链接，因此这里只提醒您自查，不会自动关闭。</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">选择“是”只关闭上述月份小眼睛和按天亮开的日子，不删除记忆；月度精炼总结仍会保留在上下文中。以后可在神经链接中重新开启。</p>
        </Modal>
        <Modal isOpen={active && help} title="暂时无需处理" onClose={() => setHelp(false)} footer={<button type="button" className="w-full py-3 rounded-2xl bg-primary text-white font-bold" onClick={() => setHelp(false)}>确定</button>}>
            <p className="text-sm leading-relaxed text-slate-600">暂时无需处理，有疑问时欢迎在 DC 社区反馈。</p>
        </Modal>
    </>;
}
