const PREFS_KEY = 'sully_repair_prefs';
const USER_FORMAT_KEY = 'sully_assistant_user_format_rules';

export type SullyRepairPrefs = {
    temperature: number;
};

const DEFAULT_PREFS: SullyRepairPrefs = {
    temperature: 0.3,
};

export function loadSullyRepairPrefs(): SullyRepairPrefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return { ...DEFAULT_PREFS };
        const o = JSON.parse(raw) as Partial<SullyRepairPrefs>;
        const t = typeof o.temperature === 'number' ? o.temperature : DEFAULT_PREFS.temperature;
        return { temperature: Math.min(1.5, Math.max(0, t)) };
    } catch {
        return { ...DEFAULT_PREFS };
    }
}

export function saveSullyRepairPrefs(prefs: SullyRepairPrefs): void {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* quota */ }
}

export function loadSullyUserFormatRules(): string {
    try {
        return localStorage.getItem(USER_FORMAT_KEY) || '';
    } catch {
        return '';
    }
}

export function saveSullyUserFormatRules(text: string): void {
    try {
        localStorage.setItem(USER_FORMAT_KEY, text);
    } catch { /* quota */ }
}
