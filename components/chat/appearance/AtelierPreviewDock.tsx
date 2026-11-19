import React,{useState} from 'react';
import AtelierIcon from './AtelierIcon';
import type {ChatPreviewScene} from '../../../utils/chatPreviewFixtures';

const groups=[
 {id:'all',label:'全部预览',scenes:['all']},
 {id:'conversation',label:'普通消息',scenes:['conversation']},
 {id:'transfer',label:'转账卡组',scenes:['transfer','transfer-accepted','transfer-returned']},
 {id:'voice',label:'语音消息',scenes:['voice','voice-loading','voice-playing']},
 {id:'psyche',label:'心象',scenes:['psyche','psyche-open']},
 {id:'music',label:'音乐分享',scenes:['music_card']},
 {id:'collaboration_file',label:'文件附件',scenes:['collaboration_file']},
];
interface Props {
  scenes: ChatPreviewScene[];
  scene: string;
  onScene: (id: string) => void;
  onReplay: () => void;
  sound?: React.ReactNode;
  action?: React.ReactNode;
}

export default function AtelierPreviewDock({scenes,scene,onScene,onReplay,sound,action}:Props) {
  const [menu,setMenu]=useState<'group'|'state'|null>(null);
  const main=groups.filter(group=>group.scenes.some(id=>scenes.some(item=>item.id===id)));
  const extra=scenes.filter(item=>!groups.some(group=>group.scenes.includes(item.id)));
  const group=main.find(item=>item.scenes.includes(scene));
  const states=group?scenes.filter(item=>group.scenes.includes(item.id)):[];
  const selected=scenes.find(item=>item.id===scene);
  const groupChoices=main.map(item=>({id:scenes.find(s=>item.scenes.includes(s.id))!.id,label:item.label})).concat(extra);
  const choose=(id:string)=>{onScene(id);setMenu(null);};

  return <footer className="atelier-preview-dock">
    <div className="atelier-preview-selector">
      {scenes.length>1?<button type="button" aria-label="选择预览组" aria-expanded={menu==='group'} onClick={()=>setMenu(menu==='group'?null:'group')}>
        <AtelierIcon kind={group?.id==='all'?'room':group?.id==='collaboration_file'?'library':'palette'}/>
        <span>{group?.label||selected?.label||'全部预览'}</span><span aria-hidden="true"/>
      </button>:<span className="atelier-preview-scene-label">{selected?.label}</span>}
      {states.length>1&&<button type="button" aria-label="选择预览状态" aria-expanded={menu==='state'} onClick={()=>setMenu(menu==='state'?null:'state')}>
        <span>{selected?.label.replace(/^(心象|语音|转账)\s*·?\s*/,'')}</span><span aria-hidden="true"/>
      </button>}
    </div>
    <span className="atelier-dock-divider"/>
    <button type="button" className="atelier-replay" onClick={onReplay} aria-label="重播效果">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/></svg>重播
    </button>
    {sound}{action}
    {menu&&<div className="atelier-scene-menu" role="dialog" aria-label={menu==='group'?'预览组':'预览状态'}>
      <header><strong>{menu==='group'?'预览内容':'预览状态'}</strong><button type="button" aria-label="关闭预览选择" onClick={()=>setMenu(null)}>×</button></header>
      <div>{(menu==='state'?states:groupChoices).map(item=><button key={item.id} type="button" aria-pressed={item.id===scene} onClick={()=>choose(item.id)}>{item.label}</button>)}</div>
    </div>}
  </footer>;
}
