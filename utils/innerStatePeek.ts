import type { CharacterProfile } from '../types';
import { getLastInnerState } from './emotionApply';
import { isScheduleFeatureOn } from './scheduleFeature';

/** 读角色最近一次内心独白（已 trim，不含闸门） */
export function readInnerStateForChar(charId: string): string {
    return getLastInnerState(charId).trim();
}

/** 情绪 + 日程开，且本机有内心文案时才可展示 / 偷看 */
export function getInnerStateDisplayText(
    char: Pick<CharacterProfile, 'id' | 'scheduleFeatureEnabled' | 'scheduleStyle' | 'emotionConfig'> | null | undefined,
): string {
    if (!char) return '';
    if (!isScheduleFeatureOn(char)) return '';
    // 仅「显式关情绪」时挡住；日程开但 enabled 未写入时仍可能有评估缓存（与情绪面板「跟日程同步」一致）
    if (char.emotionConfig?.enabled === false) return '';
    return readInnerStateForChar(char.id);
}

export function canShowInnerStatePeek(
    char: Pick<CharacterProfile, 'id' | 'scheduleFeatureEnabled' | 'scheduleStyle' | 'emotionConfig'> | null | undefined,
): boolean {
    return getInnerStateDisplayText(char).length > 0;
}
