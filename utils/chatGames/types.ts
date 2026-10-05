export type ChatGameFace = 'die' | 'hand';

export interface ChatGameChoice {
    value: string;
    label: string;
}

/** 一款小游戏自带的全部。框架只认这份清单。 */
export interface ChatGamePlugin {
    id: string;
    name: string;
    /** 加号列表里那一行小字 */
    blurb: string;
    /** 设置页里给用户看的规则 */
    settingRule: string;
    /** 提示词里「是什么」那一行，含 [[GAME:id]] */
    playLine: string;
    /** 提示词里「怎么算」。模型本来就会的可以空着。 */
    ruleLines: string[];
    /** 角色能不能自己单方面用 */
    aiAlone: boolean;
    /** 为真时，用户出手前角色那一份盖着 */
    needUser: boolean;
    face: ChatGameFace;
    /** 空表示点一下就由系统摇。有选项则用户自己选。 */
    choices: ChatGameChoice[] | null;
    roll: () => number | string;
    /** 说人话。非法结果返回空。 */
    clause: (who: string, value: number | string) => string | null;
}

export interface ChatGameRecord {
    game: string;
    by: 'ai' | 'user';
    value: number | string;
    withAi?: number | string;
    /** 仅 needUser 的角色那一条：用户出手后写成 true，卡片才翻开 */
    opened?: boolean;
}
