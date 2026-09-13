import { BUILTIN_SOUNDS, isCustomAudioSrc, playWhiteboxSound, unlockWhiteboxAudio, type WhiteboxSound } from './whiteboxSound';

let loopTimer: number | null = null;
let customAudio: HTMLAudioElement | null = null;

const clampVolume = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 0.6;
    return Math.min(1, Math.max(0, n));
};

export const stopIncomingCallRingtone = (): void => {
    if (loopTimer != null) {
        window.clearInterval(loopTimer);
        loopTimer = null;
    }
    if (customAudio) {
        try {
            customAudio.pause();
            customAudio.loop = false;
            customAudio.removeAttribute('src');
            customAudio.load();
        } catch { /* ignore */ }
        customAudio = null;
    }
};

export const startIncomingCallRingtone = (sound?: WhiteboxSound | null): void => {
    stopIncomingCallRingtone();
    if (!sound?.src || sound.src === 'none') return;
    unlockWhiteboxAudio();
    const volume = clampVolume(sound.volume);

    if (isCustomAudioSrc(sound.src) && typeof Audio !== 'undefined') {
        try {
            const el = new Audio(sound.src);
            el.loop = true;
            el.volume = volume;
            customAudio = el;
            void el.play().catch(() => undefined);
        } catch { /* 铃声失败不挡来电 */ }
        return;
    }

    if (BUILTIN_SOUNDS[sound.src]) {
        playWhiteboxSound(sound);
        loopTimer = window.setInterval(() => playWhiteboxSound(sound), 2800);
    }
};
