import { afterEach, describe, expect, it } from 'vitest';
import {
  isGlobalTranslateEnabled,
  setGlobalTranslateEnabled,
} from './globalTranslateSettings';

const KEY = 'sullyos.globalTranslate.enabled.v1';

describe('globalTranslateSettings', () => {
  afterEach(() => {
    localStorage.removeItem(KEY);
  });

  it('默认开', () => {
    expect(isGlobalTranslateEnabled()).toBe(true);
  });

  it('关掉再打开', () => {
    expect(setGlobalTranslateEnabled(false)).toBe(false);
    expect(isGlobalTranslateEnabled()).toBe(false);
    expect(setGlobalTranslateEnabled(true)).toBe(true);
    expect(isGlobalTranslateEnabled()).toBe(true);
  });
});
