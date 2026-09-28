export interface CallPreferences {
  characterInitiative: boolean;
  voiceAutoPlay: boolean;
  /** 通话进行中长时间无人说话时，是否允许角色主动接话。显式按需开启。 */
  idleNudgeEnabled: boolean;
}

export const CALL_PREFERENCES_KEY = 'sully-call-preferences-v1';
export const CALL_UPDATE_ANNOUNCEMENT_KEY = 'sully-call-update-preferences-2026-08-v2';

export const DEFAULT_CALL_PREFERENCES: CallPreferences = {
  characterInitiative: true,
  voiceAutoPlay: true,
  idleNudgeEnabled: false,
};

export const parseCallPreferences = (raw: string | null | undefined): CallPreferences => {
  if (!raw) return { ...DEFAULT_CALL_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<CallPreferences> | null;
    return {
      characterInitiative: parsed?.characterInitiative !== false,
      voiceAutoPlay: parsed?.voiceAutoPlay !== false,
      idleNudgeEnabled: parsed?.idleNudgeEnabled === true,
    };
  } catch {
    return { ...DEFAULT_CALL_PREFERENCES };
  }
};

export const loadCallPreferences = (): CallPreferences => {
  try {
    return parseCallPreferences(localStorage.getItem(CALL_PREFERENCES_KEY));
  } catch {
    return { ...DEFAULT_CALL_PREFERENCES };
  }
};

export const saveCallPreferences = (preferences: CallPreferences): void => {
  try {
    localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Safari private mode and embedded WebViews may reject localStorage writes.
  }
};

// ── 电话专用音量增益（dB）──
// 鱼声的 prosody.volume 是 dB，0 = 不变。**只有电话这一处会读它**；
// 聊天语音条 / 约会语音 / 语音设计器都不读（它们也不传 volumeDb 给共享适配器）。
// 存本机 localStorage，刷新后还在。
const CALL_VOLUME_KEY = 'sully-call-volume-db-v1';
/** 可选档位。0=不变、4/6/8/10 逐级更响。写成固定档而不是连续滑杆，手机上更好点。 */
export const CALL_VOLUME_STEPS = [0, 4, 6, 8, 10];
export const DEFAULT_CALL_VOLUME_DB = 6;
export const parseCallVolumeDb = (raw: string | null | undefined): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CALL_VOLUME_DB;
  const clamped = Math.max(0, Math.min(12, Math.round(n)));
  return CALL_VOLUME_STEPS.includes(clamped) ? clamped : DEFAULT_CALL_VOLUME_DB;
};
export const loadCallVolumeDb = (): number => {
  try {
    return parseCallVolumeDb(localStorage.getItem(CALL_VOLUME_KEY));
  } catch {
    return DEFAULT_CALL_VOLUME_DB;
  }
};
export const saveCallVolumeDb = (db: number): void => {
  try {
    localStorage.setItem(CALL_VOLUME_KEY, String(db));
  } catch {
    // Safari private mode / 内嵌 WebView 可能拒绝写入：忽略，音量退回默认。
  }
};

export const shouldShowCallUpdateAnnouncement = (): boolean => {
  try {
    return localStorage.getItem(CALL_UPDATE_ANNOUNCEMENT_KEY) !== 'seen';
  } catch {
    return true;
  }
};

export const markCallUpdateAnnouncementSeen = (): void => {
  try {
    localStorage.setItem(CALL_UPDATE_ANNOUNCEMENT_KEY, 'seen');
  } catch {
    // If storage is unavailable, showing the notice again is safer than hiding it forever.
  }
};
