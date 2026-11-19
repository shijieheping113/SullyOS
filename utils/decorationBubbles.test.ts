import {expect,it} from 'vitest';
import {cloneDecorationBubbles} from './decorationBubbles';
import type {ChatTheme} from '../types';

it('allows changing an avatar style without touching the original theme',()=>{
    const style={textColor:'#000',backgroundColor:'#fff',borderRadius:10,opacity:1};
    const original:ChatTheme={id:'sample',name:'sample',type:'custom',user:style,ai:{...style}};
    const copy=cloneDecorationBubbles(original);
    copy.user.avatarDecoration='blobref:preview';
    copy.ai.borderRadius=4;
    expect(original.user.avatarDecoration).toBeUndefined();
    expect(original.ai.borderRadius).toBe(10);
});
