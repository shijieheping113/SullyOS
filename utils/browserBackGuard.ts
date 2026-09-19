export const BROWSER_BACK_GUARD_KEY = '__sullyOSBrowserBackGuardV1';

type HistoryStateRecord = Record<string, unknown>;

const asHistoryStateRecord = (state: unknown): HistoryStateRecord => (
    state !== null && typeof state === 'object' && !Array.isArray(state)
        ? state as HistoryStateRecord
        : {}
);

export const isBrowserBackGuardState = (state: unknown): boolean => (
    asHistoryStateRecord(state)[BROWSER_BACK_GUARD_KEY] === true
);

export const makeBrowserBackGuardState = (state: unknown): HistoryStateRecord => ({
    ...asHistoryStateRecord(state),
    [BROWSER_BACK_GUARD_KEY]: true,
});

/** 只摘掉守卫标记，其它历史字段留下。回桌面用这个，不要 history.back()。 */
export const stripBrowserBackGuardState = (state: unknown): HistoryStateRecord => {
    const rest: HistoryStateRecord = {};
    for (const [k, v] of Object.entries(asHistoryStateRecord(state))) {
        if (k !== BROWSER_BACK_GUARD_KEY) rest[k] = v;
    }
    return rest;
};
