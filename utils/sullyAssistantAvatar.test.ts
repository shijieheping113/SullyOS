import { describe, expect, it } from 'vitest';
import { GUIDE_SULLY_ID } from './firstUseGuide';
import { resolveSullyAssistantChibi, SULLY_ASSISTANT_DEFAULT_CHIBI } from './sullyAssistantAvatar';

describe('resolveSullyAssistantChibi', () => {
    it('无角色时用默认 S2', () => {
        const d = resolveSullyAssistantChibi([]);
        expect(d.img).toBe(SULLY_ASSISTANT_DEFAULT_CHIBI);
        expect(d.isFallback).toBe(true);
    });

    it('彼方 vr chibi 优先', () => {
        const d = resolveSullyAssistantChibi([{
            id: GUIDE_SULLY_ID,
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            vrState: { enabled: true, intervalMinutes: 0, chibi: { img: 'data:image/png;base64,xx', scale: 1 } },
        } as any]);
        expect(d.img).toContain('data:image');
        expect(d.isFallback).toBe(false);
    });
});
