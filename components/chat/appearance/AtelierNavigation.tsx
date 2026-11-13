import React from 'react';
import AtelierIcon from './AtelierIcon';
import {useChatAppearance} from './ChatAppearanceMode';
export type AtelierPage='role'|'components'|'rooms'|'author'|'work';
export default function AtelierNavigation({page,onNavigate,disabled=false}:{page:AtelierPage;onNavigate:(page:AtelierPage)=>void;disabled?:boolean}){
  const {palette,togglePalette,switchMode}=useChatAppearance();
  const [settings,setSettings]=React.useState(false);
  React.useEffect(()=>{
    if(typeof Element.prototype.animate!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const parent=Array.from(document.querySelectorAll('.atelier-masthead')).at(-1)?.parentElement;
    const contents=parent?.querySelectorAll(':scope > .atelier-content-heading, :scope > .atelier-category-heading, :scope > .atelier-catalogue-scroll');
    const animations=Array.from(contents||[]).map(element=>element.animate([{opacity:.45,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)'}));
    const preview=parent?.querySelector(':scope > .atelier-role-preview');
    if(preview)animations.push(preview.animate([{opacity:.6},{opacity:1}],{duration:180,easing:'ease-out'}));
    return()=>animations.forEach(animation=>animation.cancel());
  },[page]);
  return <header className="atelier-masthead"><span className="atelier-wordmark">Sully.</span><nav aria-label="装修间页面">{([['role','装修间','room'],['components','组件','library'],['rooms','样板间','room'],['author','作者库','author'],['work','功能美化','palette']] as const).map(([id,label,icon])=><button key={id} disabled={disabled} aria-pressed={page===id} onClick={()=>onNavigate(id)}><AtelierIcon kind={icon}/><span>{label}</span></button>)}</nav><button className="atelier-palette" aria-label="装修间配色与页面设置" aria-expanded={settings} onClick={()=>setSettings(!settings)}><svg className="atelier-preferences-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true"><path d="M7 4v16M17 4v16"/><circle cx="7" cy="9" r="2.4"/><circle cx="17" cy="15" r="2.4"/></svg></button>{settings&&<div className="atelier-page-menu"><button onClick={()=>{togglePalette();setSettings(false);}}>切换配色 · {palette==='rose'?'雪松玫瑰':'灰蓝象牙'}</button>{switchMode&&<button disabled={disabled} onClick={()=>{switchMode('classic');setSettings(false);}}>切换现有版</button>}<button onClick={()=>setSettings(false)}>关闭</button></div>}</header>;
}
