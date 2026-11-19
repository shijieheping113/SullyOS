import {findCssUrls} from './cssImageAssets';

/** Keep embedded images out of text layout without changing the saved CSS. */
export function compactCssImages(css: string) {
    const images = new Map<string, string>();
    const compactMore = (source: string, existingText = '') => {
        if (!/data:image\//i.test(source)) return source;
        const chunks: string[] = [];
        let start = 0;
        for (const url of findCssUrls(source)) {
            if (!/^data:image\/[\w.+-]+[;,]/i.test(url.value)) continue;
            let token = `sully-embedded-image-${images.size + 1}`;
            while (source.includes(token) || existingText.includes(token) || images.has(token)) token += '-asset';
            images.set(token, url.value);
            chunks.push(source.slice(start, url.start), token);
            start = url.end;
        }
        chunks.push(source.slice(start));
        return chunks.join('');
    };
    const text = compactMore(css);
    return {
        text,
        compactMore,
        count: images.size,
        expand: (edited: string) => edited.replace(/sully-embedded-image-\d+(?:-asset)*/g, token => images.get(token) ?? token),
    };
}
