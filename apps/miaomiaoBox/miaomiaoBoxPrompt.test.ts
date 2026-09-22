import { describe, expect, it } from 'vitest';
import { FISH_VOICE_ACTING_GUIDE } from '../../utils/fishAudioTts';
import { ELEVENLABS_STANDARD_VOICE_ACTING_GUIDE, ELEVENLABS_V3_VOICE_ACTING_GUIDE } from '../../utils/elevenLabsTts';
import { VOICE_ACTING_GUIDE } from '../../utils/minimaxTts';
import { buildMiaomiaoPlayPrompt } from './miaomiaoBoxPrompt';

const rules = [] as [];

describe('buildMiaomiaoPlayPrompt 只带当前 TTS 的语气指导', () => {
  it('MiniMax 只带 MiniMax，不带鱼声和 ElevenLabs', () => {
    const p = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'minimax' }, worldRules: rules, starter: 'box' });
    expect(p).toContain(VOICE_ACTING_GUIDE);
    expect(p).not.toContain(FISH_VOICE_ACTING_GUIDE);
    expect(p).not.toContain(ELEVENLABS_V3_VOICE_ACTING_GUIDE);
    expect(p).not.toContain(ELEVENLABS_STANDARD_VOICE_ACTING_GUIDE);
    expect(p).not.toContain('必须紧跟在 </语音> 后面');
  });

  it('鱼声只带鱼声', () => {
    const p = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'fishaudio' }, worldRules: rules, starter: 'box' });
    expect(p).toContain(FISH_VOICE_ACTING_GUIDE);
    expect(p).not.toContain(VOICE_ACTING_GUIDE);
    expect(p).not.toContain(ELEVENLABS_V3_VOICE_ACTING_GUIDE);
  });

  it('ElevenLabs 按模型只带对应一份', () => {
    const v3 = buildMiaomiaoPlayPrompt({
      apiConfig: { ttsProvider: 'elevenlabs', elevenLabsModel: 'eleven_v3' },
      worldRules: rules,
      starter: 'box',
    });
    expect(v3).toContain(ELEVENLABS_V3_VOICE_ACTING_GUIDE);
    expect(v3).not.toContain(ELEVENLABS_STANDARD_VOICE_ACTING_GUIDE);
    expect(v3).not.toContain(VOICE_ACTING_GUIDE);
    const std = buildMiaomiaoPlayPrompt({
      apiConfig: { ttsProvider: 'elevenlabs', elevenLabsModel: 'eleven_flash_v2_5' },
      worldRules: rules,
      starter: 'box',
    });
    expect(std).toContain(ELEVENLABS_STANDARD_VOICE_ACTING_GUIDE);
    expect(std).not.toContain(ELEVENLABS_V3_VOICE_ACTING_GUIDE);
  });

  it('填了自定义指南就不再附带内置那份', () => {
    const p = buildMiaomiaoPlayPrompt({
      apiConfig: { ttsProvider: 'fishaudio', voicePrompts: { fishaudio: 'ONLY_FISH_CUSTOM' } },
      worldRules: rules,
      starter: 'box',
    });
    expect(p).toContain('ONLY_FISH_CUSTOM');
    expect(p).not.toContain(FISH_VOICE_ACTING_GUIDE);
    expect(p).not.toContain(VOICE_ACTING_GUIDE);
  });
});
