import { describe, expect, it } from 'vitest';
import { FISH_VOICE_ACTING_GUIDE } from './fishAudioTts';
import { VOICE_ACTING_GUIDE } from './minimaxTts';
import { resolveVoiceActingGuideFromApiConfig } from './voiceMessagePrompt';

describe('resolveVoiceActingGuideFromApiConfig', () => {
    it('优先用 apiConfig 里当前服务商的自定义指南', () => {
        const custom = '### 用户自己的 MiniMax 规则';
        const guide = resolveVoiceActingGuideFromApiConfig({
            ttsProvider: 'minimax',
            voicePrompts: { minimax: custom, fishaudio: 'fish' },
        });
        expect(guide).toBe(custom);
    });

    it('自定义留空时回退内置默认', () => {
        expect(resolveVoiceActingGuideFromApiConfig({
            ttsProvider: 'minimax',
            voicePrompts: { minimax: '   ' },
        })).toBe(VOICE_ACTING_GUIDE);
        expect(resolveVoiceActingGuideFromApiConfig({
            ttsProvider: 'fishaudio',
        })).toBe(FISH_VOICE_ACTING_GUIDE);
    });
});
