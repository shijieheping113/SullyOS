// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {replayDecorationMessages} from './decorationPreviewMotion';
import {decorationPreviewScenes} from './decorationPreviewScenes';

it('keeps scroll demonstration messages separate from the ordinary chat preview',()=>{
    const [scene]=decorationPreviewScenes({},'motion');
    expect(scene.id).toBe('motion');
    expect(scene.messages.length).toBeGreaterThan(10);
    expect(new Set(scene.messages.map(message=>message.role))).toEqual(new Set(['user','assistant']));
    expect(decorationPreviewScenes({},'all').some(item=>item.id==='motion')).toBe(false);
});

it('only starts each message when it reaches the visible scroll region and resets on replay',()=>{
    const frames:FrameRequestCallback[]=[];
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame',()=>{});
    const body=document.createElement('div');
    body.innerHTML='<div class="sample-messages"><div data-preview-message></div><div data-preview-message></div></div>';
    const list=body.firstElementChild as HTMLElement;
    const [first,second]=Array.from(list.children) as HTMLElement[];
    const bounds=(top:number,height:number)=>({top,bottom:top+height,height}) as DOMRect;
    list.getBoundingClientRect=()=>bounds(0,100);
    first.getBoundingClientRect=()=>bounds(2-list.scrollTop,24);
    second.getBoundingClientRect=()=>bounds(120-list.scrollTop,24);
    const flush=()=>{while(frames.length)frames.shift()!(0);};
    try {
        const stop=replayDecorationMessages(body);
        flush();
        expect(first.classList.contains('animate-fade-in')).toBe(true);
        expect(second.hasAttribute('data-preview-entered')).toBe(false);
        list.scrollTop=80;
        list.dispatchEvent(new Event('scroll'));
        flush();
        expect(second.classList.contains('animate-fade-in')).toBe(true);
        stop();
        const repeat=replayDecorationMessages(body);
        flush();
        expect(list.scrollTop).toBe(0);
        expect(second.hasAttribute('data-preview-entered')).toBe(false);
        repeat();
    }finally{vi.unstubAllGlobals();}
});
