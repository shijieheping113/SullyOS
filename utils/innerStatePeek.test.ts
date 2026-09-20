import { describe, expect, it, beforeEach } from 'vitest';
import type { CharacterProfile } from '../types';
import { lastInnerStateKey } from './emotionApply';
import { canShowInnerStatePeek, getInnerStateDisplayText, readInnerStateForChar } from './innerStatePeek';

const baseChar = (): CharacterProfile => ({
    id: 'c1',
    name: 'Test',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    mesExample: '',
    avatar: '',
    scheduleFeatureEnabled: true,
    emotionConfig: { enabled: true, api: { baseUrl: '', apiKey: '', model: '' } },
} as CharacterProfile);

describe('innerStatePeek', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('readInnerStateForChar trims storage', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '  心声  ');
        expect(readInnerStateForChar('c1')).toBe('心声');
    });

    it('gates off when emotion disabled', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '有内容');
        const char = baseChar();
        char.emotionConfig!.enabled = false;
        expect(getInnerStateDisplayText(char)).toBe('');
        expect(canShowInnerStatePeek(char)).toBe(false);
    });

    it('gates off when schedule feature off', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '有内容');
        const char = baseChar();
        char.scheduleFeatureEnabled = false;
        char.scheduleStyle = undefined;
        expect(canShowInnerStatePeek(char)).toBe(false);
    });

    it('allows peek when schedule on, emotion on, and text present', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '未说出口的话');
        const char = baseChar();
        expect(getInnerStateDisplayText(char)).toBe('未说出口的话');
        expect(canShowInnerStatePeek(char)).toBe(true);
    });

    it('schedule on + 有缓存时，enabled 未写入也允许看（未显式关情绪）', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '旧缓存');
        const char = baseChar();
        char.emotionConfig = { api: { baseUrl: '', apiKey: '', model: '' } };
        expect(getInnerStateDisplayText(char)).toBe('旧缓存');
    });

    it('empty storage → no peek even if emotion on', () => {
        expect(canShowInnerStatePeek(baseChar())).toBe(false);
    });
});
