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

    it('日程关闭时，独立开启的情绪仍允许查看', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '有内容');
        const char = baseChar();
        char.scheduleFeatureEnabled = false;
        char.scheduleStyle = undefined;
        char.emotionFeatureEnabled = true;
        expect(canShowInnerStatePeek(char)).toBe(true);
    });

    it('独立关闭情绪时，即使日程开启也不允许查看', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '有内容');
        const char = baseChar();
        char.emotionFeatureEnabled = false;
        expect(canShowInnerStatePeek(char)).toBe(false);
    });

    it('allows peek when schedule on, emotion on, and text present', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '未说出口的话');
        const char = baseChar();
        expect(getInnerStateDisplayText(char)).toBe('未说出口的话');
        expect(canShowInnerStatePeek(char)).toBe(true);
    });

    it('旧角色未设置独立开关且未开启 emotionConfig 时不展示缓存', () => {
        localStorage.setItem(lastInnerStateKey('c1'), '旧缓存');
        const char = baseChar();
        char.emotionConfig = { api: { baseUrl: '', apiKey: '', model: '' } };
        expect(getInnerStateDisplayText(char)).toBe('');
    });

    it('empty storage → no peek even if emotion on', () => {
        expect(canShowInnerStatePeek(baseChar())).toBe(false);
    });
});
