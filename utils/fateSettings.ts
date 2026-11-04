import { BUILTIN_FATE_FACTORS, type FateFactor } from './fateFactors';

/** localStorage 键前缀；二改全量备份按此前缀扫描（见 utils/forkBackup.ts） */
export const FATE_SETTINGS_STORAGE_PREFIX = 'sully_fate_settings_v1_';

export interface FateTendency { id: string; name: string; meaning: string }
export interface FateSettings {
    factors: FateFactor[];
    tendencies: FateTendency[];
    disabledFactorIds: string[];
    disabledTendencyIds: string[];
}
export const DEFAULT_FATE_TENDENCIES: FateTendency[] = [
    { id: 'career', name: '事业与求索', meaning: '关注责任、能力、探索、难题与成果，范围不限于上班。' },
    { id: 'relations', name: '关系与牵动', meaning: '关注关系中的接近、摩擦、理解、距离与恋爱亲密，符合已知关系。' },
    { id: 'discovery', name: '经历与发现', meaning: '关注环境、见闻、接触与新认识，让活动打开不同的可能。' },
    { id: 'pleasure', name: '玩乐与兴致', meaning: '关注兴趣、享受、好奇、欲望与临时起意，让角色拥有自己的兴致。' },
    { id: 'life', name: '生活与修整', meaning: '关注身体、日常、住处、恢复与闲散，平常活动也有具体质感。' },
    { id: 'chance', name: '偶然与错位', meaning: '关注巧合、误会、反差和阴差阳错；荒诞程度符合角色世界观。' },
];
export function defaultFateSettings(): FateSettings {
    return { factors: BUILTIN_FATE_FACTORS.map(f => ({ ...f })), tendencies: DEFAULT_FATE_TENDENCIES.map(t => ({ ...t })), disabledFactorIds: [], disabledTendencyIds: [] };
}
export function loadFateSettings(charId: string): FateSettings {
    const defaults = defaultFateSettings();
    try {
        const raw = localStorage.getItem(`${FATE_SETTINGS_STORAGE_PREFIX}${charId}`);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        const valid = (v: any) => v && typeof v.id === 'string' && typeof v.name === 'string' && v.name.trim() && typeof v.meaning === 'string' && v.meaning.trim();
        return {
            factors: Array.isArray(parsed.factors) ? parsed.factors.filter(valid).map((f: FateFactor) => ({ ...f, category: f.category || '自定义' })) : defaults.factors,
            tendencies: Array.isArray(parsed.tendencies) ? parsed.tendencies.filter(valid) : defaults.tendencies,
            disabledFactorIds: Array.isArray(parsed.disabledFactorIds) ? parsed.disabledFactorIds.filter((id: unknown) => typeof id === 'string') : [],
            disabledTendencyIds: Array.isArray(parsed.disabledTendencyIds) ? parsed.disabledTendencyIds.filter((id: unknown) => typeof id === 'string') : [],
        };
    } catch { return defaults; }
}
export function saveFateSettings(charId: string, settings: FateSettings): void {
    localStorage.setItem(`${FATE_SETTINGS_STORAGE_PREFIX}${charId}`, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('fate-settings-updated', { detail: { charId } }));
}
