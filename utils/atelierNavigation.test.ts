// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import AtelierNavigation from '../components/chat/appearance/AtelierNavigation';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it('animates only content, keeps navigation stable and cancels interrupted transitions',async()=>{
 const cancel=vi.fn();const animate=vi.fn(()=>({cancel}));
 vi.stubGlobal('matchMedia',()=>({matches:false}));
 const original=Element.prototype.animate;Element.prototype.animate=animate as any;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const onNavigate=vi.fn();
 try{
  const render=async(page:'role'|'components')=>act(async()=>root.render(React.createElement('div',null,React.createElement(AtelierNavigation,{page,onNavigate}),React.createElement('header',{className:'atelier-content-heading'}),React.createElement('section',{className:'atelier-role-preview'}))));
  await render('role');expect(animate).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.atelier-palette .atelier-icon')).toBeNull();
  expect(host.querySelector('.atelier-preferences-mark')).not.toBeNull();
  await render('components');expect(cancel).toHaveBeenCalledTimes(2);
  expect((animate.mock.calls as any[][]).every(call=>call[1]?.duration===180)).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();Element.prototype.animate=original;vi.unstubAllGlobals();}
});
it('respects reduced motion',async()=>{
 const animate=vi.fn();vi.stubGlobal('matchMedia',()=>({matches:true}));
 const original=Element.prototype.animate;Element.prototype.animate=animate;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(AtelierNavigation,{page:'role',onNavigate:()=>{}})));expect(animate).not.toHaveBeenCalled();}
 finally{await act(async()=>root.unmount());host.remove();Element.prototype.animate=original;vi.unstubAllGlobals();}
});
