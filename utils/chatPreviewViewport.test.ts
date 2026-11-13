import {expect,it} from 'vitest';
import {fitChatPreviewViewport} from './chatPreviewViewport';

it('uses the preview surface for authored screen-relative positions',()=>{
 expect(fitChatPreviewViewport('.a{left:50vw;height:100dvh;width:20vmin;top:calc(10px + 5vh)}',398,674)).toBe('.a{left:199px;height:674px;width:79.6px;top:calc(10px + 33.7px)}');
});
it('keeps text, comments and embedded image URLs unchanged',()=>{
 const css='/* 100vw */ .a{content:"50vw";background:url(data:image/svg+xml;base64,100vw);width:100svw}';
 expect(fitChatPreviewViewport(css,398,674)).toBe(css.replace('width:100svw','width:398px'));
});
