// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import BlobRefStyle from '../components/chat/BlobRefStyle';
import BeautyPresetPreview from '../components/share/BeautyPresetPreview';

const session = vi.hoisted(() => {
    const map = new Map<string, string>();
    const created: string[] = [];
    return {
        map,
        created,
        getCachedBlobRefUrl: (ref: string) => map.get(ref),
        loadBlobRefUrl: async (ref: string) => {
            const hit = map.get(ref);
            if (hit) return hit;
            const url = 'blob:test-' + created.length;
            created.push(url);
            map.set(ref, url);
            return url;
        },
        reset() {
            map.clear();
            created.length = 0;
        },
    };
});

vi.mock('./blobRefSessionCache', () => ({
    getCachedBlobRefUrl: (ref: string) => session.getCachedBlobRefUrl(ref),
    loadBlobRefUrl: (ref: string) => session.loadBlobRefUrl(ref),
    clearBlobRefSessionCache: () => session.reset(),
    warmBlobRefUrls: async () => {},
    blobRefSessionCacheSizeForTest: () => session.map.size,
}));
vi.mock('../components/chat/ChatDecorationSample', () => ({renderChatDecorationSample:(data:any) => ({markup:'<main class="sully-chat-root">preview</main>',css:data.parts.css})}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const source = (id:string) => `.sully-chat-avatar-wrap::after{background:url("blobref:${id}")}`;

beforeEach(() => {
    session.reset();
    vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
});
afterEach(() => {vi.unstubAllGlobals(); document.body.replaceChildren();});

it('renders local frames in chat CSS and reuses session URLs across remounts', async () => {
    const host=document.createElement('div'); document.body.appendChild(host); const root=createRoot(host);
    await act(async () => root.render(React.createElement(BlobRefStyle,{css:source('first')})));
    expect(host.querySelector('style')!.sheet!.cssRules[0].cssText).toContain('blob:test-0');
    await act(async () => root.render(React.createElement(BlobRefStyle,{css:source('second')})));
    expect(host.querySelector('style')!.sheet!.cssRules[0].cssText).toContain('blob:test-1');
    expect(session.created).toEqual(['blob:test-0', 'blob:test-1']);
    await act(async () => root.unmount());
    const host2=document.createElement('div'); document.body.appendChild(host2); const root2=createRoot(host2);
    await act(async () => root2.render(React.createElement(BlobRefStyle,{css:source('second')})));
    expect(host2.querySelector('style')!.sheet!.cssRules[0].cssText).toContain('blob:test-1');
    expect(session.created).toEqual(['blob:test-0', 'blob:test-1']);
    await act(async () => root2.unmount());
});

it('renders preview CSS through object URLs without dropping session cache on close', async () => {
    const host=document.createElement('div'); document.body.appendChild(host); const root=createRoot(host);
    const data={format:'sullyos-chat-decoration',version:1,name:'头像框',parts:{css:source('preview')}};
    await act(async () => root.render(React.createElement(BeautyPresetPreview,{data})));
    const shadow=host.querySelector('[data-beauty-preview-source]')!.shadowRoot!;
    expect(shadow.querySelector('style')!.textContent).toContain('blob:test-0');
    expect(host.querySelector('[role=alert]')).toBeNull();
    await act(async () => root.unmount());
    expect(session.map.get('blobref:preview')).toBe('blob:test-0');
});

it('keeps a late preview load available after the preview was closed', async () => {
    let finish!:(url:string|undefined)=>void;
    const original = session.loadBlobRefUrl;
    session.loadBlobRefUrl = () => new Promise(resolve => {finish=resolve;});
    const host=document.createElement('div'); document.body.appendChild(host); const root=createRoot(host);
    const data={format:'sullyos-chat-decoration',version:1,name:'头像框',parts:{css:source('late-preview')}};
    await act(async () => root.render(React.createElement(BeautyPresetPreview,{data})));
    await act(async () => root.unmount());
    await act(async () => {
        session.map.set('blobref:late-preview', 'blob:late');
        finish('blob:late');
    });
    session.loadBlobRefUrl = original;
    expect(session.map.get('blobref:late-preview')).toBe('blob:late');
});

// Slow image reads must not tear down the font declaration already being used.
it('patches only local image properties, retaining font rule identity and nested priorities', async () => {
    let finish!:(url:string|undefined)=>void;
    const original = session.loadBlobRefUrl;
    session.loadBlobRefUrl = (ref: string) => new Promise(resolve => {
        finish = (url) => {
            if (url) session.map.set(ref, url);
            resolve(url);
        };
    });
    const host=document.createElement('div'); document.body.appendChild(host); const root=createRoot(host);
    const css = '@font-face{font-family:Beauty;src:url(https://example.com/font.woff2)}'
        + '@media(min-width:0px){.sully-chat-inputbar{background:url("blobref:frame") !important;color:pink;content:"blobref:frame"}}';
    await act(async () => root.render(React.createElement(BlobRefStyle,{css})));
    const style=host.querySelector('style')!; const sheet=style.sheet!; const font=sheet.cssRules[0];
    const changes=vi.fn(); const observer=new MutationObserver(changes); observer.observe(style,{childList:true,subtree:true,characterData:true});
    await act(async () => finish('blob:test-0'));
    expect(style.sheet).toBe(sheet); expect(sheet.cssRules[0]).toBe(font);
    const declaration=(sheet.cssRules[1] as CSSMediaRule).cssRules[0] as CSSStyleRule;
    expect(declaration.style.background).toContain('blob:test-0');
    expect(declaration.style.getPropertyPriority('background')).toBe('important');
    expect(declaration.style.color).toBe('pink'); expect(declaration.style.content).toBe('"blobref:frame"');
    expect(changes).not.toHaveBeenCalled();
    observer.disconnect();
    session.loadBlobRefUrl = original;
    await act(async () => root.unmount());
});

it('starts at most four image reads and surfaces a failed concurrent read', async () => {
    const pending:Array<{ref:string;resolve:(url:string|undefined)=>void}>=[];
    session.loadBlobRefUrl = (ref: string) => new Promise(resolve => {
        pending.push({ref, resolve: (url) => {
            if (url) session.map.set(ref, url);
            resolve(url);
        }});
    });
    const {resolveCssImageUrls}=await import('./cssImageAssets');
    const css=Array.from({length:5},(_,i)=>source('parallel-'+i)).join('');
    const result=resolveCssImageUrls(css);
    const rejected=expect(result).rejects.toThrow('丢失');
    expect(pending).toHaveLength(4);
    pending[0].resolve('blob:first'); await Promise.resolve(); await Promise.resolve();
    expect(pending).toHaveLength(5);
    pending[1].resolve(undefined); pending[2].resolve('blob:third');
    pending[3].resolve('blob:fourth'); pending[4].resolve('blob:fifth');
    await rejected;
});
