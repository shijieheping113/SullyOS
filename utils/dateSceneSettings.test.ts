import { describe, expect, it } from 'vitest';
import type { CharacterProfile } from '../types';
import { datePoseFor, datePoseKey, dateReplyRequest, enabledDateEntries, parseDateReply, planDateSpriteBatch } from './dateSceneSettings';

const character = { id: 'date', name: '角色' } as CharacterProfile;
const request = { model: 'model', messages: [{ role: 'system', content: '见面' }], temperature: .85, stream: true };

describe('见面场景配置', () => {
    it('keeps old request defaults, and applies options only where configured', () => {
        expect(dateReplyRequest(character, '用户', request)).toEqual({
            model: 'model', messages: request.messages, temperature: .85, stream: true, max_tokens: 8000,
        });
        expect(dateReplyRequest({ ...character, dateReplySettings: { temperature: 0, topP: .7, maxTokens: 2000, stream: false } }, '用户', request))
            .toMatchObject({ temperature: 0, top_p: .7, max_tokens: 2000, stream: false });
    });

    it('adds only enabled custom thinking steps in order and leaves room for the reply', () => {
        const steps = [
            { id: '1', title: '观察', body: '先看场景', enabled: true },
            { id: '2', title: '忽略我', body: '', enabled: false },
            { id: '3', title: '', body: '再决定如何回应', enabled: true },
        ];
        expect(enabledDateEntries(steps)).toEqual(['观察：先看场景', '再决定如何回应']);
        const body = dateReplyRequest({ ...character, dateReplySettings: { thinking: true, thinkingMode: 'custom', steps,
            maxTokens: 2000, effort: 'low' } }, '用户', request);
        expect(body).toMatchObject({ thinking: { budget_tokens: 1999 }, reasoning_effort: 'low' });
        expect(body.messages[0].content).toContain('1. 观察：先看场景\n2. 再决定如何回应');
        expect(body.messages[0].content).not.toContain('忽略我');
    });

    it('keeps the dialogue separate from native and inline thinking, including the legacy fallback', () => {
        const data = { choices: [{ message: { reasoning_content: '幕后想法', content: '<think>幕后想法</think>[normal] 正文' } }] };
        expect(parseDateReply(data, true)).toEqual({ content: '[normal] 正文', thinkingChain: '幕后想法' });
        expect(parseDateReply(data, false)).toEqual({ content: '[normal] 正文', thinkingChain: undefined });
        expect(parseDateReply({ choices: [{ message: { reasoning_content: '正文' } }] }, true)).toEqual({ content: '正文', thinkingChain: undefined });
    });

    it('preserves populated slots and preserves every newly imported file', () => {
        const result = planDateSpriteBatch([
            { name: '角色_开心.png', src: 'happy' }, { name: 'normal.png', src: 'copy' },
            { name: 'special.png', src: 'other' }, { name: 'special.jpg', src: 'duplicate' },
        ], { normal: 'original' }, ['special']);
        expect(result).toEqual({
            sprites: { normal: 'original', happy: 'happy', normal_2: 'copy', special: 'other', special_2: 'duplicate' },
            customEmotions: ['special', 'normal_2', 'special_2'],
        });
    });

    it('keeps position independent for the same emotion across skins', () => {
        const pose = { scale: 1.5, x: 7, y: -10 };
        const withPose = { ...character, datePortraitPoses: { [datePoseKey('skin', 'normal')]: pose } };
        expect(datePoseFor(withPose, 'normal', 'skin')).toEqual(pose);
        expect(datePoseFor(withPose, 'normal')).toBeUndefined();
    });
});
