import React,{useState} from 'react';
import type {CharacterProfile} from '../../../types';
import type {DecorationPreset} from '../../../utils/chatDecoration';
import {BEAUTY_CATEGORIES,type BeautyCategory} from '../../../utils/beautyCategories';
import BeautyWardrobe,{type WardrobeEntry} from '../../appearance/BeautyWardrobe';
import type {WardrobeUsageReader} from '../../../utils/wardrobeUsage';
import BeautyPresetPreview from '../../share/BeautyPresetPreview';
import AtelierNavigation,{type AtelierPage} from './AtelierNavigation';
import AtelierIcon from './AtelierIcon';
import {ATELIER_CSS_COMPONENTS,type AtelierCssComponent} from '../../../utils/atelierComponentCss';

interface Props{
 page:AtelierPage;category:BeautyCategory;onNavigate:(page:AtelierPage)=>void;onCategory:(value:BeautyCategory)=>void;
 characters:CharacterProfile[];target:string;onTarget:(id:string)=>void;current?:DecorationPreset;busy:boolean;
 entries:WardrobeEntry[];builtins:WardrobeEntry[];outfits:WardrobeEntry[];getUsage:WardrobeUsageReader;
 onEdit:(entry:WardrobeEntry)=>void;onApply:(entry:WardrobeEntry)=>void;onExport:(entry:WardrobeEntry)=>void;onShare:(entry:WardrobeEntry)=>void;onDelete:(entry:WardrobeEntry)=>void;onUpdate:(entry:WardrobeEntry)=>void;
 onImport:()=>void;onNew:(category:BeautyCategory)=>void;onCustomize:()=>void;onSettings?:()=>void;onNewOutfit:()=>void;onOutfit:(entry:WardrobeEntry)=>void;onReset:()=>void;
 onNewSpecial:(kind:AtelierCssComponent)=>void;onBack:()=>void;
}
export default function AtelierLibraryView(props:Props){
 const [picker,setPicker]=useState<'category'|'new'|null>(null),[search,setSearch]=useState(false);
 const [pickerClosing,setPickerClosing]=useState(false);
 const closePicker=()=>{if(pickerClosing)return;setPickerClosing(true);window.setTimeout(()=>{setPicker(null);setPickerClosing(false);},160);};
 const [sort,setSort]=useState('recent');
 const functional=['collaboration','date','story'];
  const categories:readonly (readonly [BeautyCategory,string])[]=props.page==='work'?BEAUTY_CATEGORIES.filter(([id])=>functional.includes(id)):[...BEAUTY_CATEGORIES.filter(([id])=>['all','whitebox','bubbles','avatar','background','psyche','sound'].includes(id)),...ATELIER_CSS_COMPONENTS];
  const label=categories.find(([id])=>id===props.category)?.[1]||'全部';
 const title=props.page==='role'?props.characters.find(c=>c.id===props.target)?.name||'装修间':props.page==='work'?'功能美化':props.page==='rooms'?'样板间':'本机组件';
  const actions={getUsage:props.getUsage,onEdit:props.onEdit,onApply:props.onApply,onExport:props.onExport,onShare:props.onShare,onDelete:props.onDelete,onUpdate:props.onUpdate};
  const chooseCategory=(id:BeautyCategory)=>{if(picker!=='new')props.onCategory(id);else if(ATELIER_CSS_COMPONENTS.some(([kind])=>kind===id))props.onNewSpecial(id as AtelierCssComponent);else props.onNew(id);closePicker();};
  return <div className="atelier-library-view"><AtelierNavigation page={props.page} onNavigate={props.onNavigate} disabled={props.busy}/><header className="atelier-content-heading">{props.page==='role'?<><button className="atelier-back-chat" aria-label="返回聊天" onClick={props.onBack}>‹</button><label className="atelier-role-name"><select aria-label="当前角色" value={props.target} onChange={e=>props.onTarget(e.target.value)} disabled={props.busy}>{props.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>:<h1>{title}</h1>}{props.page==='role'?<button className="atelier-settings-button" aria-label="打开角色全局样式" onClick={props.onSettings}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 7h16M4 17h16"/><rect x="7" y="4" width="4" height="6" rx="2"/><rect x="14" y="14" width="4" height="6" rx="2"/></svg></button>:<div className="atelier-catalogue-tools"><button aria-label="搜索作品" onClick={()=>setSearch(!search)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg></button><button onClick={props.onImport}><AtelierIcon kind="library"/>导入</button><button onClick={()=>props.page==='rooms'?props.onNewOutfit():setPicker('new')}><AtelierIcon kind="pencil"/>新建</button></div>}</header>
 {props.page==='role'?<section className="atelier-role-preview">{props.current?<BeautyPresetPreview data={props.current} sceneScope="all" fitPhone/>:<p role="status">正在读取当前装扮…</p>}<button className="atelier-clipboard" onClick={props.onCustomize} disabled={!props.current||props.busy}><AtelierIcon kind="clipboard"/><span>装修单</span></button></section>:<>{props.page!=='rooms'&&<div className="atelier-category-heading"><button onClick={()=>setPicker('category')}>{label} <span>⌄</span></button>{props.page==='work'?<span>独立编辑与应用</span>:<label className="atelier-sort"><span>{props.entries.length} 个组件</span><select aria-label="组件排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">最近保存</option><option value="name">按名称</option></select></label>}</div>}<div className="atelier-catalogue-scroll">{props.page==='rooms'?<BeautyWardrobe {...actions} title="搭配收藏" entries={props.outfits} searchOpen={search} onApply={props.onOutfit} onEdit={props.onOutfit}/>:<>{props.builtins.length>0&&<BeautyWardrobe {...actions} title="内置预设" entries={props.builtins} searchOpen={search}/>}<BeautyWardrobe {...actions} title="保存的作品" entries={sort==='name'?[...props.entries].sort((a,b)=>a.name.localeCompare(b.name,'zh')):props.entries} searchOpen={search}/><button className="atelier-reset" onClick={props.onReset} disabled={props.busy||props.category==='all'}>恢复默认外观</button></>}</div></>}
  {picker&&<div className={`atelier-picker-backdrop ${pickerClosing?'is-closing':''}`} onClick={closePicker}><section className="atelier-category-picker" onClick={event=>event.stopPropagation()} role="dialog" aria-modal="true" aria-label={picker==='new'?'新建组件':'选择分类'}><header><AtelierIcon kind={picker==='new'?'pencil':'library'}/><h2>{picker==='new'?'新建作品':'选择分类'}</h2><button aria-label="关闭分类" onClick={closePicker}>×</button></header><div>{categories.filter(([id])=>picker!=='new'||id!=='all').map(([id,name])=><button key={id} aria-pressed={props.category===id} onClick={()=>chooseCategory(id)}><AtelierIcon kind={id==='voice'?'sound':id}/>{name}</button>)}</div></section></div>}
 </div>;
}
