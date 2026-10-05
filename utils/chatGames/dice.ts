import { randomInt } from '../random';
import type { ChatGamePlugin } from './types';

function asFace(value: number | string): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 6) return null;
    return n;
}

export const diceGame: ChatGamePlugin = {
    id: 'dice',
    name: '掷骰子',
    blurb: '1 到 6 点',
    settingRule: '摇 1 到 6 点。点数怎么用，角色自己决定。',
    playLine: '· 骰子 [[GAME:dice]] —— 摇 1 到 6 点。',
    ruleLines: [],
    aiAlone: true,
    needUser: false,
    face: 'die',
    choices: null,
    roll: () => 1 + randomInt(6),
    clause: (who, value) => {
        const face = asFace(value);
        if (face == null) return null;
        return `${who}掷出了 ${face} 点`;
    },
};
