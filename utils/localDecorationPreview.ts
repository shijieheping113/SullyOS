import {loadBlobRefUrl} from './blobRefSessionCache';
import {resolveBuiltinRoomAssetUrl} from './roomTemplateAssets';
import type {DecorationPreset} from './chatDecoration';

/** Resolve display copies; a missing image never changes the editable draft. */
export async function resolveLocalDecorationPreview(preset: DecorationPreset) {
    const parts = {...preset.parts};
    let missing = false;
    const imageUrl = async (value: string | null | undefined) => {
        if (!value) return undefined;
        if (value.startsWith('blobref:')) {
            const url = await loadBlobRefUrl(value);
            if (!url) missing = true;
            return url;
        }
        return resolveBuiltinRoomAssetUrl(value) || undefined;
    };
    const background = parts.background;
    const bubbles = parts.bubbles;
    const sound = parts.sound;
    await Promise.all([
        background && imageUrl(background.image).then(image => {
            parts.background = {...background, image: image || null};
        }),
        bubbles && Promise.all((['user', 'ai'] as const).map(async side => {
            const style = {...bubbles[side]};
            for (const key of ['backgroundImage', 'decoration', 'avatarDecoration'] as const) {
                if (style[key]) style[key] = await imageUrl(style[key]);
            }
            return style;
        })).then(([user, ai]) => { parts.bubbles = {...bubbles, user, ai}; }),
        sound?.src.startsWith('blobref:') && imageUrl(sound.src).then(src => {
            parts.sound = src ? {...sound, src} : null;
        }),
    ]);
    return {preset: {...preset, parts}, missing};
}
