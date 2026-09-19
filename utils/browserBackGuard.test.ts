import { describe, expect, it } from 'vitest';
import {
    BROWSER_BACK_GUARD_KEY,
    isBrowserBackGuardState,
    makeBrowserBackGuardState,
    stripBrowserBackGuardState,
} from './browserBackGuard';

describe('browser back guard history state', () => {
    it('preserves existing nested-view history markers', () => {
        const state = makeBrowserBackGuardState({ storyAppearancePanel: true });

        expect(state).toEqual({
            storyAppearancePanel: true,
            [BROWSER_BACK_GUARD_KEY]: true,
        });
        expect(isBrowserBackGuardState(state)).toBe(true);
    });

    it('normalizes unusable history states before adding the guard', () => {
        expect(makeBrowserBackGuardState(null)).toEqual({ [BROWSER_BACK_GUARD_KEY]: true });
        expect(makeBrowserBackGuardState('legacy-state')).toEqual({ [BROWSER_BACK_GUARD_KEY]: true });
        expect(isBrowserBackGuardState({ [BROWSER_BACK_GUARD_KEY]: false })).toBe(false);
    });

    it('strips the guard without moving other nested-view markers', () => {
        const stripped = stripBrowserBackGuardState({
            storyAppearancePanel: true,
            [BROWSER_BACK_GUARD_KEY]: true,
        });

        expect(stripped).toEqual({ storyAppearancePanel: true });
        expect(isBrowserBackGuardState(stripped)).toBe(false);
        expect(stripBrowserBackGuardState(null)).toEqual({});
    });
});
