import { randomInt } from '../random';
import type { ChatGamePlugin } from './types';

const HANDS = ['rock', 'scissors', 'paper'] as const;
const LABEL: Record<string, string> = { rock: '石头', scissors: '剪刀', paper: '布' };

export function rpsLabel(value: number | string): string | null {
    return LABEL[String(value)] || null;
}

export const rpsGame: ChatGamePlugin = {
    id: 'rps',
    name: '猜拳',
    blurb: '石头 剪刀 布',
    settingRule: '石头胜剪刀、剪刀胜布、布胜石头；一样算平手。谁赢系统不判。',
    playLine: '· 猜拳 [[GAME:rps]] —— 你出一只手，石头、剪刀、布。',
    ruleLines: ['  石头胜剪刀、剪刀胜布、布胜石头；一样算平手。'],
    aiAlone: false,
    needUser: true,
    face: 'hand',
    choices: [
        { value: 'rock', label: '石头' },
        { value: 'scissors', label: '剪刀' },
        { value: 'paper', label: '布' },
    ],
    roll: () => HANDS[randomInt(3)],
    clause: (who, value) => {
        const label = rpsLabel(value);
        if (!label) return null;
        return `${who}出了${label}`;
    },
};
