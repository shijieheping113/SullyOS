import { randomInt } from '../random';
import type { ChatGamePlugin } from './types';

const HANDS = ['rock', 'scissors', 'paper'] as const;
const LABEL: Record<string, string> = { rock: '石头', scissors: '剪刀', paper: '布' };
const FROM_LABEL: Record<string, typeof HANDS[number]> = {
    rock: 'rock', scissors: 'scissors', paper: 'paper',
    '石头': 'rock', '剪刀': 'scissors', '布': 'paper',
};

export type RpsHand = typeof HANDS[number];

export function rpsLabel(value: number | string): string | null {
    return LABEL[String(value)] || null;
}

/** 认英文 value 或中文名。认不出返回空。 */
export function resolveRpsChoice(raw: string | null | undefined): RpsHand | null {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return null;
    if ((HANDS as readonly string[]).includes(key)) return key as RpsHand;
    return FROM_LABEL[String(raw || '').trim()] || FROM_LABEL[key] || null;
}

export const rpsGame: ChatGamePlugin = {
    id: 'rps',
    name: '猜拳',
    blurb: '石头 剪刀 布',
    settingCardBlurb: '先盖着…再一起翻…嘿嘿',
    settingStory: '唔…石头、剪刀、布。出完先扣在手心…\n想让角色自己动脑筋…就打开「角色自己出拳」…\n也可以先聊两句…猫儿有点迷糊…',
    settingRule: '石头胜剪刀、剪刀胜布、布胜石头；一样算平手。谁赢系统不判。',
    playLine: '· 猜拳 [[GAME:rps]] —— 想玩就用这个记号出招。',
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
