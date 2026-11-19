import {expect,it,vi} from 'vitest';
import type {DecorationPreset} from './chatDecoration';
import {resolveLocalDecorationPreview} from './localDecorationPreview';

vi.mock('./blobRefSessionCache',()=>({
    loadBlobRefUrl:async(ref:string)=>ref==='blobref:wallpaper'?'blob:https://local.invalid/wallpaper':undefined,
}));

it('shows the available wallpaper even if the avatar image is missing, without editing the original refs',async()=>{
    const preset={
        format:'sullyos-chat-decoration',version:1,name:'Current',
        parts:{
            css:'.sully-chat-root{color:red}',
            background:{image:'blobref:wallpaper',style:'plain'},
            bubbles:{name:'Local',user:{avatarDecoration:'blobref:missing'},ai:{}},
        },
    } as DecorationPreset;
    const result=await resolveLocalDecorationPreview(preset);
    expect(result.missing).toBe(true);
    expect(result.preset.parts.background?.image).toBe('blob:https://local.invalid/wallpaper');
    expect(result.preset.parts.bubbles?.user.avatarDecoration).toBeUndefined();
    expect(result.preset.parts.css).toBe(preset.parts.css);
    expect(preset.parts.bubbles?.user.avatarDecoration).toBe('blobref:missing');
    expect(preset.parts.background?.image).toBe('blobref:wallpaper');
});
