import { describe, expect, it } from 'vitest';
import { FISH_VOICE_ACTING_GUIDE } from '../../utils/fishAudioTts';
import { ELEVENLABS_STANDARD_VOICE_ACTING_GUIDE, ELEVENLABS_V3_VOICE_ACTING_GUIDE } from '../../utils/elevenLabsTts';
import { VOICE_ACTING_GUIDE } from '../../utils/minimaxTts';
import { BOX_FOLD_PROMPT, BOX_TURN_BAN, buildMiaomiaoPlayPrompt } from './miaomiaoBoxPrompt';

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

  it('鱼声只带鱼声，不再另加鱼声记号', () => {
    const p = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'fishaudio' }, worldRules: rules, starter: 'box' });
    expect(p).toContain(FISH_VOICE_ACTING_GUIDE);
    expect(p).toContain('鱼声方括号写在引号里面，例如：「[excited] 你终于回了」。不要写 emotion 属性。');
    expect(p).not.toContain('【鱼声记号】');
    expect(p).not.toContain('平静的句子可以不标');
    expect(p).not.toContain(VOICE_ACTING_GUIDE);
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

  it('有世界规则时，这段放在整份提示词最后', () => {
    const p = buildMiaomiaoPlayPrompt({
      apiConfig: { ttsProvider: 'minimax' },
      worldRules: [{ id: 'r', title: '不许看病', body: '这一盒里不能出现医院', enabled: true }],
      starter: 'box',
    });
    expect(p.endsWith('1. 不许看病：这一盒里不能出现医院')).toBe(true);
    expect(p).toContain('写了就必须遵守');
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
    expect(p).not.toContain('【鱼声记号】');
    expect(p).not.toContain('这一盒怎么用上面的记号');
  });

  it('抓娃娃、出门、扒拉只改掉和主聊天打架的那一句', () => {
    const claw = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'minimax' }, worldRules: rules, starter: 'claw' });
    expect(claw).toContain('默认卖家是一个几乎不说话的神秘宇宙商人');
    expect(claw).toContain('商人依然少说话');
    expect(claw).toContain('主聊天里发生过的事照常记得');
    expect(claw).not.toContain('不是接着聊天里的当下');
    expect(claw).not.toContain('不要顺着上文剧情往下写');
    const walk = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'minimax' }, worldRules: rules, starter: 'walk' });
    expect(walk).toContain('默认带路的是一个几乎不说话的路口');
    expect(walk).toContain('路口依然少说话');
    const random = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'minimax' }, worldRules: rules, starter: 'random' });
    expect(random).toContain('默认动手的是一只几乎不说话的扒拉爪');
    expect(random).toContain('扒拉爪依然少说话');
    const dream = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'minimax' }, worldRules: rules, starter: 'dream' });
    expect(dream).toContain('把已经发生过的事推翻重演');
    const story = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'minimax' }, worldRules: rules, starter: 'story' });
    expect(story).toContain('不是跟你本人对话');
    const box = buildMiaomiaoPlayPrompt({ apiConfig: { ttsProvider: 'minimax' }, worldRules: rules, starter: 'box' });
    expect(box).toContain('用户会直接说想干什么，按她说的开始发展。');
  });

  it('禁止事项和折叠要求按约定写', () => {
    expect(BOX_TURN_BAN).toBe(`【禁止】
角色本人开口时，引号里要有语气标记，方括号放在引号里面。旁白不用标。
禁止停在同一个场景里打转，这一轮要有新的动作、信息或状况。
禁止 OOC：角色说的话要像这个人。`);
    expect(BOX_FOLD_PROMPT).toContain('只写这次新折进来的那一截');
    expect(BOX_FOLD_PROMPT).toContain('不要把已有摘要再写一遍');
  });
});
