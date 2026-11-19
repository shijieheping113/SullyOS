import type {ChatTheme} from '../types';

/** Bubble presets consist of plain data; these are the nested styles editors modify. */
export function cloneDecorationBubbles(bubbles: ChatTheme): ChatTheme {
    return {...bubbles, user:{...bubbles.user}, ai:{...bubbles.ai}};
}
