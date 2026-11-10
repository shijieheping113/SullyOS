// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ theme: { storyAppearance: { preset: 'novel' } } as any }));
vi.mock('../context/OSContext', () => ({useOS:()=>({theme:state.theme,apiConfig:{},registerBackHandler:()=>()=>{},addToast:vi.fn(),updateCharacter:vi.fn()})}));
vi.mock('../components/date/DateSettings', () => ({default:()=>null}));
import DateSession from '../components/date/DateSession';
import {StoryOutput} from '../components/date/story/StoryTheaterSession';

it('novel view renders both speakers as prose without avatars and preserves text', () => {
    const messages = [
        {id:1,role:'user',content:'今天读到哪里了？'},
        {id:2,role:'assistant',content:'[happy] "刚好到这里。"\n[normal] 合上书。'},
    ].map(message=>({...message,charId:'c',type:'text',timestamp:1,metadata:{source:'date',dateEncounterId:'e'}}));
    const markup = renderToStaticMarkup(React.createElement(DateSession, {
        char:{id:'c',name:'角色',avatar:'/private-avatar.png',dateAppearance:{preset:'novel'},dateReadingShowAvatars:true},
        userProfile:{name:'用户'},messages,encounterId:'e',peekStatus:'',
        onSendMessage:async()=>'',onReroll:async()=>'',onExit:()=>{},onEditMessage:()=>{},onDeleteMessage:()=>{},onDeleteMessages:async()=>{},onSettings:()=>{},
    } as any));
    const host=document.createElement('div');host.innerHTML=markup;
    expect(host.querySelector('[data-reading-preset="novel"]')).toBeTruthy();
    expect(host.querySelectorAll('.meeting-prose')).toHaveLength(3);
    expect(host.querySelector('.meeting-reading-page')?.textContent).toContain('今天读到哪里了？');
    expect(host.querySelector('.meeting-reading-page')?.textContent).toContain('合上书。');
    expect(host.querySelector('img[src="/private-avatar.png"]')).toBeNull();
});

it('story novel mode keeps prose outside a collapsed supplement; none keeps the original layout', () => {
    const content='<scene_header>地点｜书店</scene_header><story_text>灯光落在书页上。</story_text>';
    const render=()=>renderToStaticMarkup(React.createElement(StoryOutput,{content,affinityInputs:[]}));
    const host=document.createElement('div');host.innerHTML=render();
    expect(host.querySelector('.meeting-prose')?.textContent).toContain('灯光落在书页上。');
    expect(host.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(host.querySelector('details')?.textContent).toContain('书店');
    state.theme={storyAppearance:{preset:'none'}};
    host.innerHTML=render();
    expect(host.querySelector('.meeting-prose')).toBeNull();
    expect(host.textContent).toContain('书店');
    expect(host.textContent).not.toContain('场景与补充');
});

it('reading stays inside the current encounter, prepends without jumping, and keeps scroll for new replies', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host), loadOlder = vi.fn(async () => {});
    const makeRows = (start: number, end: number) => Array.from({length:end-start+1},(_,i)=>({
        id:start+i, charId:'c', role:'assistant', type:'text', timestamp:1, content:`历史正文 ${start+i}`,
        metadata:{source:'date', dateEncounterId:'e1'},
    }));
    const props = {
        char:{id:'c',name:'角色',avatar:'',dateAppearance:{preset:'novel'}},userProfile:{name:'用户'},
        encounterId:'e1',peekStatus:'',onSendMessage:async()=>'',onReroll:async()=>'',onExit:()=>{},
        onEditMessage:()=>{},onDeleteMessage:()=>{},onDeleteMessages:async()=>{},onSettings:()=>{},
        onLoadMoreHistory:loadOlder, historyReachedEnd:false,
    };
    const height = vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockImplementation(function(this:HTMLElement){return this.querySelectorAll('[data-date-message-id]').length*100;});
    const viewport = vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(500);
    let beforePaint=0;
    function Reading({messages}:{messages:any[]}){
        React.useLayoutEffect(()=>{beforePaint=host.querySelector<HTMLDivElement>('.meeting-reading-page')?.scrollTop??0;});
        return React.createElement(DateSession,{...props,messages} as any);
    }
    try {
        await act(async () => root.render(React.createElement(Reading,{messages:[]})));
        await act(async () => root.render(React.createElement(Reading,{messages:makeRows(51,100)})));
        expect(beforePaint).toBe(5000);
        const page = host.querySelector('.meeting-reading-page') as HTMLDivElement;
        expect(page.querySelectorAll('[data-date-message-id]')).toHaveLength(50);
        expect(page.textContent).toContain('历史正文 51');
        page.scrollTop=200;
        await act(async()=>page.dispatchEvent(new Event('scroll')));
        page.scrollTop=40;
        await act(async()=>page.dispatchEvent(new Event('scroll')));
        expect(loadOlder).toHaveBeenCalledTimes(1);
        await act(async()=>root.render(React.createElement(Reading,{messages:makeRows(1,100)})));
        expect(page.querySelectorAll('[data-date-message-id]')).toHaveLength(100);
        expect(page.textContent).toContain('历史正文 1');
        expect(page.textContent).toContain('历史正文 100');
        const topAfterPrepend = page.scrollTop;
        await act(async()=>root.render(React.createElement(Reading,{messages:makeRows(1,101)})));
        // 本场追加新回复时，不应把读者拽回底部。
        expect(page.scrollTop).toBe(topAfterPrepend);
        expect(host.querySelector('button[title="重新生成"]')).toBeNull();
    } finally { await act(async()=>root.unmount()); host.remove(); height.mockRestore(); viewport.mockRestore(); }
});

it('reading hides other encounters even when they sit in the loaded history window', () => {
    const rows = [
        {id:1,role:'assistant',content:'旧场',metadata:{source:'date',dateEncounterId:'old'}},
        {id:2,role:'user',content:'本场问',metadata:{source:'date',dateEncounterId:'now'}},
        {id:3,role:'assistant',content:'本场答',metadata:{source:'date',dateEncounterId:'now'}},
        {id:4,role:'assistant',content:'无场次号旧文',metadata:{source:'date'}},
    ].map(message=>({...message,charId:'c',type:'text',timestamp:message.id}));
    const markup = renderToStaticMarkup(React.createElement(DateSession, {
        char:{id:'c',name:'角色',avatar:'',dateAppearance:{preset:'novel'}},
        userProfile:{name:'用户'},messages:rows,encounterId:'now',peekStatus:'',
        onSendMessage:async()=>'',onReroll:async()=>'',onExit:()=>{},onEditMessage:()=>{},onDeleteMessage:()=>{},onDeleteMessages:async()=>{},onSettings:()=>{},
        historyReachedEnd:false,
    } as any));
    const host=document.createElement('div');host.innerHTML=markup;
    const page = host.querySelector('.meeting-reading-page');
    expect(page?.textContent).toContain('本场问');
    expect(page?.textContent).toContain('本场答');
    expect(page?.textContent).not.toContain('旧场');
    expect(page?.textContent).not.toContain('无场次号旧文');
    expect(host.querySelectorAll('[data-date-message-id]')).toHaveLength(2);
});
