import {expect,it} from 'vitest';
import {compactCssImages} from './cssImagePlaceholders';

it('keeps editing short while preserving full images and user changes on save',()=>{
    const image='data:image/png;base64,'+'a'.repeat(2_000_000);
    const css=`.avatar{background:url("${image}");left:50%}`;
    const editor=compactCssImages(css);
    expect(editor.text.length).toBeLessThan(100);
    expect(editor.expand(editor.text)).toBe(css);
    expect(editor.expand(editor.text.replace('50%','42%'))).toBe(css.replace('50%','42%'));
    expect(editor.expand('.avatar{background:none}')).toBe('.avatar{background:none}');
});
it('avoids collisions with existing text and expands multiple assets independently',()=>{
    const css='.a{content:"sully-embedded-image-1";background:url(data:image/png;base64,AAAA)}.b{background:url(data:image/webp;base64,BBBB)}';
    const editor=compactCssImages(css);
    expect(editor.count).toBe(2);
    expect(editor.expand(editor.text)).toBe(css);
});

it('compacts another paste into the same editing session without reusing the existing image name',()=>{
    const original='a{background:url(data:image/png;base64,AAAA)}';
    const pasted='b{background:url(data:image/png;base64,BBBB)}';
    const editor=compactCssImages(original);
    const extra=editor.compactMore(pasted,editor.text);
    expect(extra).not.toContain('data:image');
    expect(editor.expand(editor.text+'\n'+extra)).toBe(original+'\n'+pasted);
    expect(editor.expand(extra)).toBe(pasted);
});

it('keeps SVG data URLs short without altering CSS strings or comments',()=>{
    const image='data:image/svg+xml,%3Csvg%20viewBox=%220%200%2032%2032%22%3E%3C/svg%3E';
    const css=`/* url(${image}) */ .x{background:url("${image}");content:"${image}"}`;
    const editor=compactCssImages(css);
    expect(editor.count).toBe(1);
    expect(editor.text).toContain('background:url("sully-embedded-image-1")');
    expect(editor.expand(editor.text)).toBe(css);
});
