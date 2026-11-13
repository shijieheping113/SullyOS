// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {ChatAppearanceProvider,ChatAppearanceModeSwitch,readChatAppearanceMode,saveChatAppearanceMode,useAtelierSurface,type ChatAppearanceMode} from '../components/chat/appearance/ChatAppearanceMode';
import AtelierNavigation from '../components/chat/appearance/AtelierNavigation';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it('defaults safely and stores only the page preference',()=>{
 expect(readChatAppearanceMode()).toBe('classic');localStorage.setItem('character-test','unchanged');saveChatAppearanceMode('atelier');expect(readChatAppearanceMode()).toBe('atelier');expect(localStorage.getItem('character-test')).toBe('unchanged');saveChatAppearanceMode('classic');expect(readChatAppearanceMode()).toBe('classic');
});
it('switches page styling without remounting editor state or writing appearance data',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const mounted=vi.fn();
 function Editor(){const [text,setText]=useState('draft');const surface=useAtelierSurface();React.useEffect(()=>{mounted();},[]);return React.createElement('section',surface,React.createElement(ChatAppearanceModeSwitch),React.createElement('input',{'aria-label':'draft',value:text,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setText(e.target.value)}));}
  function App(){const [mode,setMode]=useState<ChatAppearanceMode>('classic');return React.createElement(ChatAppearanceProvider,{mode,onModeChange:setMode,children:React.createElement(React.Fragment,null,React.createElement(Editor),React.createElement(AtelierNavigation,{page:'role',onNavigate:()=>{}}))});}
  try{await act(async()=>root.render(React.createElement(App)));expect(host.querySelector('[data-atelier]')).toBeNull();await act(async()=>host.querySelector<HTMLButtonElement>('.chat-appearance-open-atelier')!.click());expect(host.querySelector('[data-atelier=rose]')).not.toBeNull();expect(host.querySelector('input')?.value).toBe('draft');await act(async()=>host.querySelector<HTMLButtonElement>('.atelier-palette')!.click());await act(async()=>[...host.querySelectorAll('button')].find(e=>e.textContent==='切换现有版')!.click());expect(host.querySelector('[data-atelier]')).toBeNull();expect(mounted).toHaveBeenCalledTimes(1);expect(localStorage.length).toBe(0);}finally{await act(async()=>root.unmount());host.remove();}
});
