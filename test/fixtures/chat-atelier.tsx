import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OSPreviewProvider} from '../../context/OSContext';
import ChatAppearanceWardrobe from '../../components/chat/ChatAppearanceWardrobe';
import {PRESET_THEMES} from '../../components/chat/ChatConstants';
import type {CharacterProfile,OSTheme,ChatTheme} from '../../types';
function App(){
 const [character,setCharacter]=useState({id:'atelier-qa-only',name:'安安',avatar:'',systemPrompt:'',bubbleStyle:'default'} as CharacterProfile);
 const [theme,setTheme]=useState({} as OSTheme);const [themes,setThemes]=useState<ChatTheme[]>([]);const [open,setOpen]=useState(true);
 const [writes,setWrites]=useState(0);
 const updateCharacter=async(_id:string,patch:Partial<CharacterProfile>)=>{setWrites(n=>n+1);setCharacter(c=>({...c,...patch}));};
 const updateTheme=async(patch:Partial<OSTheme>)=>{setWrites(n=>n+1);setTheme(t=>({...t,...patch}));};
 const os={characters:[character],theme,activeCharacterId:character.id,appearancePresets:[],customThemes:themes,customIcons:{},userProfile:{name:'Ann'},updateCharacter,updateTheme,addCustomTheme:async(value:ChatTheme)=>setThemes(items=>[...items.filter(x=>x.id!==value.id),value]),removeCustomTheme:async()=>{},setCustomIcon:async()=>{},setActiveCharacterId:()=>{},openApp:()=>{},closeApp:()=>setOpen(false),exportAppearancePreset:async()=>new Blob(),importAppearancePreset:async()=>'',registerBackHandler:()=>()=>{}} as any;
 (window as any).atelierQA={character,theme,writes};
 return <OSPreviewProvider value={os}>{open?<ChatAppearanceWardrobe character={character} theme={theme} themes={[...Object.values(PRESET_THEMES),...themes]} updateCharacter={patch=>updateCharacter(character.id,patch)} updateTheme={updateTheme} onSaveBubble={os.addCustomTheme} onBgUpload={()=>{}} onOpenWorkshop={()=>{}} onClose={()=>setOpen(false)}/>:<button onClick={()=>setOpen(true)}>打开聊天装扮</button>}</OSPreviewProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
