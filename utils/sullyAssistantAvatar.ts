import type { CharacterProfile } from '../types';
import { GUIDE_SULLY_ID } from './firstUseGuide';
import { getChibi, type ChibiDisplay } from './vrWorld/chibi';

export const SULLY_ASSISTANT_DEFAULT_CHIBI =
    'https://cdn.jsdelivr.net/gh/qegj567-cloud/SullyOS-assets@main/bgm/SULLY/S2.png';

export function findSullyCharacter(characters: CharacterProfile[]): CharacterProfile | undefined {
    return characters.find(c => c.id === GUIDE_SULLY_ID)
        || characters.find(c => c.name.trim().toLowerCase() === 'sully');
}

/** 猫儿小助手贴图：彼方 vr 槽 chibi → 小小窝 sprites → 内置 S2 */
export function resolveSullyAssistantChibi(characters: CharacterProfile[]): ChibiDisplay {
    const sully = findSullyCharacter(characters);
    if (!sully) {
        return {
            img: SULLY_ASSISTANT_DEFAULT_CHIBI,
            scale: 1,
            offsetY: 0,
            flip: false,
            isFallback: true,
        };
    }
    const chibi = getChibi(sully);
    if (!chibi.img) {
        return {
            img: SULLY_ASSISTANT_DEFAULT_CHIBI,
            scale: 1,
            offsetY: 0,
            flip: false,
            isFallback: true,
        };
    }
    return chibi;
}
