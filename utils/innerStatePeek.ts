import type { CharacterProfile } from '../types';
import { getLastInnerState } from './emotionApply';
import { isEmotionFeatureOn } from './scheduleFeature';

/** 读角色最近一次内心独白（已 trim，不含闸门） */
export function readInnerStateForChar(charId: string): string {
    return getLastInnerState(charId).trim();
}

/** 情绪 + 日程开，且本机有内心文案时才可展示 / 偷看 */
export function getInnerStateDisplayText(
    char: Pick<CharacterProfile, 'id' | 'emotionFeatureEnabled' | 'emotionConfig'> | null | undefined,
): string {
    if (!char) return '';
    if (!isEmotionFeatureOn(char)) return '';
    return readInnerStateForChar(char.id);
}

export function canShowInnerStatePeek(
    char: Pick<CharacterProfile, 'id' | 'emotionFeatureEnabled' | 'emotionConfig'> | null | undefined,
): boolean {
    return getInnerStateDisplayText(char).length > 0;
}
