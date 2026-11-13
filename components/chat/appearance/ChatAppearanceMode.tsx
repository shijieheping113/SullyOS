import React, {createContext, useContext, useState} from 'react';

export type ChatAppearanceMode = 'classic' | 'atelier';
export type AtelierPalette = 'rose' | 'stone';
const MODE_KEY = 'sully-chat-appearance-page-v1';
const PALETTE_KEY = 'sully-chat-appearance-palette-v1';
export function readChatAppearanceMode(): ChatAppearanceMode {
  try { return localStorage.getItem(MODE_KEY) === 'atelier' ? 'atelier' : 'classic'; } catch { return 'classic'; }
}
export function saveChatAppearanceMode(mode: ChatAppearanceMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* The page still switches when device storage is unavailable. */ }
}
const AppearanceContext = createContext<{mode: ChatAppearanceMode; palette: AtelierPalette; togglePalette: () => void; switchMode?:(mode:ChatAppearanceMode)=>void}>({mode:'classic',palette:'rose',togglePalette:()=>{}});
export function ChatAppearanceProvider({mode,onModeChange,children}:{mode:ChatAppearanceMode;onModeChange?:(mode:ChatAppearanceMode)=>void;children:React.ReactNode}) {
  const [palette,setPalette] = useState<AtelierPalette>(()=>{try{return localStorage.getItem(PALETTE_KEY)==='stone'?'stone':'rose';}catch{return 'rose';}});
  const togglePalette = () => setPalette(value=>{const next=value==='rose'?'stone':'rose';try{localStorage.setItem(PALETTE_KEY,next);}catch{}return next;});
  return <AppearanceContext.Provider value={{mode,palette,togglePalette,switchMode:onModeChange}}>{mode==='atelier'&&<><link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=sentient@300,400&display=swap"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500&display=swap"/></>}{children}</AppearanceContext.Provider>;
}
export function useChatAppearance() { return useContext(AppearanceContext); }
export function useAtelierSurface() {
  const {mode,palette}=useChatAppearance();
  return {'data-atelier':mode==='atelier'?palette:undefined};
}
export function ChatAppearanceModeSwitch(){
 const {mode,switchMode}=useChatAppearance();
 return mode==='classic'&&switchMode?<button className="chat-appearance-open-atelier" onClick={()=>switchMode('atelier')}>装修间</button>:null;
}
