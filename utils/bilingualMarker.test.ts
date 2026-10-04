import { describe, expect, it } from 'vitest';
import { visibleVoiceSubtitle } from './bilingualMarker';

const CN = '能看到，就是每次消息前面系统塞的那一坨';
const JP = '見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ';

describe('visibleVoiceSubtitle', () => {
    it('字幕里同一句写两行只留一行', () => {
        expect(visibleVoiceSubtitle(`${CN}\n${CN}`, JP)).toBe(CN);
    });

    it('字幕里再抄一口播时，口播那行不露在字幕上', () => {
        expect(visibleVoiceSubtitle(`${CN}\n${JP}`, JP)).toBe(CN);
    });

    it('口播和字幕是同一句长中文时，不另做一条字幕', () => {
        expect(visibleVoiceSubtitle(CN, CN)).toBe('');
    });
});
