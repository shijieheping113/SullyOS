import React, {useEffect, useState, type ComponentProps} from 'react';
import {createPortal} from 'react-dom';
import {useOS} from '../../context/OSContext';
import BeautyShareChannel from '../appearance/BeautyShareChannel';
import ChatDecorationPanel from './ChatDecorationPanel';
import {exportDecoration} from '../../utils/chatDecoration';
import {ChatAppearanceProvider,readChatAppearanceMode,saveChatAppearanceMode,type ChatAppearanceMode} from './appearance/ChatAppearanceMode';
import './appearance/ChatAppearanceAtelier.css';

/** Chat and Appearance share one library; only the application target differs. */
export default function ChatAppearanceWardrobe(props: ComponentProps<typeof ChatDecorationPanel>) {
  const {appearancePresets, exportAppearancePreset, importAppearancePreset} = useOS();
  const [busy, setBusy] = useState(false);
  const [mode,setMode]=useState<ChatAppearanceMode>(readChatAppearanceMode);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsClosing,setSettingsClosing]=useState(false);
  const closeSettings=()=>{
    if(settingsClosing)return;
    setSettingsClosing(true);
    window.setTimeout(()=>{setSettingsOpen(false);setSettingsClosing(false);},180);
  };
  const switchMode=(next:ChatAppearanceMode)=>{setMode(next);saveChatAppearanceMode(next);};
  useEffect(()=>{
    if(!settingsOpen)return;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')closeSettings();};
    window.addEventListener('keydown',closeOnEscape);
    return()=>window.removeEventListener('keydown',closeOnEscape);
  },[settingsOpen,settingsClosing]);
  return createPortal(<ChatAppearanceProvider mode={mode} onModeChange={switchMode}><div className="chat-appearance-wardrobe chat-appearance-switchable" role="dialog" aria-modal="true" aria-label={`给 ${props.character.name} 换装`} onKeyDown={event => {if(event.key === 'Escape' && !busy && event.target === event.currentTarget){event.stopPropagation();props.onClose();}}}>
    <BeautyShareChannel presets={appearancePresets} onExport={exportAppearancePreset} onImport={importAppearancePreset} onOpenWorkshop={props.onOpenWorkshop}
      targetCharacterId={props.character.id} onCustomize={mode==='atelier'?()=>setSettingsOpen(true):undefined} onBusyChange={setBusy} onBack={props.onClose} onApplied={props.onClose} createDraft={()=>exportDecoration('我的聊天装扮',props.theme,props.character,props.themes.find(item=>item.id===(props.character.bubbleStyle||props.theme.chatDefaultBubbleStyle))||props.themes[0])}/>
    {settingsOpen&&createPortal(<><div className={`atelier-panel-scrim ${settingsClosing?'is-closing':''}`} onClick={closeSettings}/>{<ChatDecorationPanel {...props} initialTab="layout" closing={settingsClosing} onClose={closeSettings}/>}</>, document.body)}
  </div></ChatAppearanceProvider>, document.body);
}
