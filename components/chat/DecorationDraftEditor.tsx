import {COLLABORATION_UI_THEMES} from '../../features/collaboration/appearance';
import {useChatAppearance,useAtelierSurface,ChatAppearanceModeSwitch} from './appearance/ChatAppearanceMode';
import AtelierIcon from './appearance/AtelierIcon';
import AtelierNavigation,{type AtelierPage} from './appearance/AtelierNavigation';
import type {WardrobeUsageReader} from '../../utils/wardrobeUsage';
import { useLocalBackHandler } from '../../hooks/useLocalBackHandler';
import {MEETING_APPEARANCES} from '../../utils/meetingAppearance';
import CssCodeEditor from './CssCodeEditor';
import AvatarFrameImageEditor from './AvatarFrameImageEditor';
import {trackBeauty} from '../../utils/beautyAnalytics';
import OutfitCollection from './OutfitCollection';
import {usePreviewDraft} from '../../hooks/usePreviewDraft';
import {JOURNAL_APPEARANCE_PRESETS} from '../../utils/journalAppearance';
import {SCHEDULE_CARD_PRESETS} from '../../utils/scheduleAppearance';
import React,{useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {type DecorationPreset,LAYOUT_DEFAULTS,validateDecoration} from '../../utils/chatDecoration';
import {canEditDecoration,remixOrigin,readDecorationOrigin,saveLibraryDecoration,deleteLibraryDecoration,combineDecorationOrigins,type DecorationOrigin} from '../../utils/decorationLibrary';
import BeautyConfirmDialog from '../share/BeautyConfirmDialog';
import BeautyPresetPreview from '../share/BeautyPresetPreview';
import type {WardrobeEntry} from '../appearance/BeautyWardrobe';
import ChatLayoutSettings from './ChatLayoutSettings';
import {WHITEBOX_AI_PROMPT} from '../../utils/chatWhitebox';
import {PRESET_THEMES} from './ChatConstants';
import {PSYCHE_STYLE_LIST} from '../../utils/psycheStyleCatalog';
import WhiteboxSoundEditor from './WhiteboxSoundEditor';
import DecorationPresetThumb,{DecorationMiniPreview} from './DecorationPresetThumb';
import type {OSTheme} from '../../types';
import './DecorationDraftEditor.css';
import {DECORATION_WORKSHOPS,workshopCss,replaceWorkshopCss,projectWorkshopPreset,workshopPreview,checkWorkshopCss,workshopPrompt,type DecorationWorkshop} from '../../utils/decorationWorkshop';
import {ATELIER_CSS_COMPONENTS,readComposedCss,writeComposedCss,type AtelierCssComponent} from '../../utils/atelierComponentCss';
import AtelierComponentMaker from './appearance/AtelierComponentMaker';
const BubbleMaker=React.lazy(()=>import('./BubbleMaker'));
type Shelf=DecorationWorkshop|AtelierCssComponent;
const allShelves=[...DECORATION_WORKSHOPS,...ATELIER_CSS_COMPONENTS];
interface Props {getUsage?:WardrobeUsageReader;outfits?:WardrobeEntry[];onOutfitsChange?:()=>Promise<void>;preset:DecorationPreset;origin:DecorationOrigin;originalKey?:string;theme:OSTheme;sources:WardrobeEntry[];onOpenWorkshop:()=>void;onClose:()=>void;onSaved:(preset:DecorationPreset)=>void;onShareSaved?:(id:string)=>Promise<void>;maker?:DecorationWorkshop;characterName?:string;onApply?:(preset:DecorationPreset,origin:DecorationOrigin)=>void|Promise<void>;onAtelierNavigate?:(page:AtelierPage)=>void;localOnly?:boolean}
export default function DecorationDraftEditor({getUsage,outfits=[],onOutfitsChange,preset,origin,originalKey,theme,sources,onOpenWorkshop,onClose,onSaved,onShareSaved,maker,characterName,onApply,onAtelierNavigate,previewContext,localOnly=false}:Props & {previewContext?:DecorationPreset}){
  const {mode}=useChatAppearance();const atelierSurface=useAtelierSurface();const atelier=mode==='atelier';
  const shelves=atelier?allShelves:DECORATION_WORKSHOPS;
 const [controlsOpen,setControlsOpen]=useState(true);
  const [makerSaveOpen,setMakerSaveOpen]=useState(false);
  const [leaving,setLeaving]=useState<{page?:AtelierPage}|null>(null);
 const [layoutGroup,setLayoutGroup]=useState('内置布局');
 const [draft,setDraft]=useState(()=>structuredClone(preset));
 const [extraCss,setExtraCss]=useState('');
 const [origins,setOrigins]=useState<Record<string,DecorationOrigin>>(()=>Object.fromEntries(Object.keys(preset.parts).map(key=>[key,origin])));
 const [labels,setLabels]=useState<Partial<Record<Shelf,string>>>({});
 const [outfitOpen,setOutfitOpen]=useState(false);const [deleteOutfit,setDeleteOutfit]=useState<WardrobeEntry|null>(null);
  const [sideOpen,setSideOpen]=useState(atelier);const [saveOpen,setSaveOpen]=useState(false);
 const [layoutOpen,setLayoutOpen]=useState(false);
  const [editCurrentPsyche,setEditCurrentPsyche]=useState(false);
  const [editPart,setEditPart]=useState<Shelf|null>(null);
  const nestedNavigate=(page:AtelierPage)=>{setEditPart(null);requestClose(page);};
  const [category,setCategory]=useState<DecorationWorkshop>(maker||'whitebox');
 const [shelf,setShelf]=useState<Shelf|null>(null);
 const [query,setQuery]=useState('');const [page,setPage]=useState(0);
 const [update,setUpdate]=useState(!!originalKey&&['self','remix'].includes(origin.kind));const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const combinedOrigin=useMemo(()=>combineDecorationOrigins(Object.values(origins)),[origins]);
  const requestClose=(page?:AtelierPage)=>{if(atelier&&(JSON.stringify(draft)!==JSON.stringify(preset)||extraCss.trim()))setLeaving({page});else if(page)onAtelierNavigate?.(page);else onClose();};
 useLocalBackHandler(()=>{
   if(busy)return true;
    if(leaving)setLeaving(null);
    else if(editPart)setEditPart(null);
    else if(editCurrentPsyche)setEditCurrentPsyche(false);
    else if(makerSaveOpen)setMakerSaveOpen(false);
    else if(saveOpen)setSaveOpen(false);
   else if(layoutOpen)setLayoutOpen(false);
   else if(outfitOpen)setOutfitOpen(false);
   else if(sideOpen)setSideOpen(false);
   else if(shelf)setShelf(null);
    else requestClose();
   return true;
 }, 30);
 const locked=!canEditDecoration(combinedOrigin);
 const backgroundBlock=/\/\* sully-composer:background \*\/\n?([\s\S]*?)\/\* end-sully-composer:background \*\//;
 const categoryCss=workshopCss(draft,category);
 const setCategoryCss=(css:string)=>setDraft(old=>{
   if(category==='date'||category==='story')return {...old,parts:{[category]:{preset:'novel',...old.parts[category],customCss:css}}};
   if(category==='collaboration')return {...old,parts:{collaboration:{uiTheme:'sully',avatarMode:'theme',avatarStyle:'circle',...old.parts.collaboration,customCss:css}}};
   if(category==='journal')return {...old,parts:{...old.parts,journal:{...old.parts.journal,customCss:css}}};
   if(category==='schedule')return {...old,parts:{...old.parts,schedule:{...old.parts.schedule,customCss:css}}};
   if(category==='bubbles')return {...old,parts:{...old.parts,bubbles:{...(old.parts.bubbles||structuredClone(PRESET_THEMES.default)),customCss:css}}};
   if(category==='psyche')return {...old,parts:{...old.parts,psyche:{styleId:'echo',...old.parts.psyche,customCss:css}}};
   if(category==='background'||category==='avatar')return {...old,parts:{...old.parts,css:replaceWorkshopCss(old.parts.css||'',category,css)}};
   return {...old,parts:{...old.parts,css}};
 });
  const preview=useMemo(()=>{if(!extraCss.trim())return draft;if(atelier&&maker&&maker!=='whitebox'){const css=[workshopCss(draft,maker),extraCss].filter(Boolean).join('\n');if(maker==='avatar'||maker==='background')return {...draft,parts:{...draft.parts,css:replaceWorkshopCss(draft.parts.css||'',maker,css)}};if(maker!=='sound')return {...draft,parts:{...draft.parts,[maker]:{...draft.parts[maker],customCss:css}}} as DecorationPreset;}return {...draft,parts:{...draft.parts,css:[draft.parts.css,extraCss].filter(Boolean).join('\n')}};},[draft,extraCss,atelier,maker]);
  const fullPreview=useMemo(()=>atelier?workshopPreview(preview,maker,previewContext):preview,[preview,maker,previewContext,atelier]);
  const settledPreview=usePreviewDraft(fullPreview,!!maker);
 const renderedPreview=settledPreview;
   const save=async(apply=false,share=false)=>{if(busy)return;setBusy(true);setError('');try{
   if(!canEditDecoration(combinedOrigin))throw Error('作者禁止二改');
   if(share&&combinedOrigin.allowRedistribute===false)throw Error('作者禁止二次传播，这份作品不能投稿分享');
   if(!draft.name.trim())throw Error('请填写预设名称');
    const checkedCss=maker?checkWorkshopCss(maker,maker==='whitebox'?preview.parts.css||'':workshopCss(preview,maker)):undefined;
   if(maker==='avatar'&&!categoryCss.trim()&&!draft.parts.bubbles?.user.avatarDecoration&&!draft.parts.bubbles?.ai.avatarDecoration)throw Error('请先选择头像框图片或填写头像框 CSS');
   const result=maker?projectWorkshopPreset({...preview,name:draft.name.trim()},maker):{...preview,name:draft.name.trim()};
   if(maker==='whitebox')result.parts.css=checkedCss;
   if(apply&&onApply){await onApply(result,combinedOrigin);return;}
   const id=await saveLibraryDecoration(result,remixOrigin(combinedOrigin),update?originalKey:undefined,maker?undefined:'outfit');
   trackBeauty('save',maker||'outfit');
   if(share&&onShareSaved)await onShareSaved(id);else onSaved(result);
  }catch(e){setError(e instanceof Error?e.message:'保存失败');if(atelier&&makerSaveOpen)throw e;}finally{setBusy(false);}};
  const saveLocal=async()=>{if(busy)return;setBusy(true);setError('');try{
   if(!canEditDecoration(combinedOrigin))throw Error('作者禁止二改');
   const checkedCss=maker?checkWorkshopCss(maker,maker==='whitebox'?preview.parts.css||'':workshopCss(preview,maker)):undefined;
   if(maker==='avatar'&&!categoryCss.trim()&&!draft.parts.bubbles?.user.avatarDecoration&&!draft.parts.bubbles?.ai.avatarDecoration)throw Error('请先选择头像框图片或填写头像框 CSS');
   const result=maker?projectWorkshopPreset({...preview,name:(draft.name||labels[maker]||'当前搭配').trim()},maker):{...preview,name:draft.name.trim()};
   if(maker==='whitebox')result.parts.css=checkedCss;
   onSaved(result);
  }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}};
 const choose=async(entry:WardrobeEntry)=>{if(!shelf)return;setBusy(true);setError('');try{
   const nextOrigin=await readDecorationOrigin(await entry.attributionKey());
   if(!canEditDecoration(nextOrigin))throw Error('作者禁止二改，请回到装扮库整套应用这份作品。');
   const next=validateDecoration(await (entry.readLocal || entry.read)());
    if(shelf==='motion'||shelf==='transfer'||shelf==='voice'){
      const css=readComposedCss(next.parts.css||'',shelf);if(!css.trim())throw Error('作品没有对应组件样式');
      setDraft(old=>({...old,parts:{...old.parts,css:writeComposedCss(old.parts.css||'',shelf,css)}}));
    }
    else if(shelf==='whitebox'){setDraft(old=>({...old,parts:{...old.parts,...next.parts}}));}
   else if(shelf==='avatar'){
    const css=workshopCss(next,'avatar');
    const fields=['avatarDecoration','avatarDecorationX','avatarDecorationY','avatarDecorationScale','avatarDecorationRotate'] as const;
    setDraft(old=>{const bubbles=structuredClone(old.parts.bubbles||PRESET_THEMES.default);if(next.parts.bubbles)for(const side of ['user','ai'] as const)for(const field of fields)(bubbles[side] as any)[field]=next.parts.bubbles[side][field];return {...old,parts:{...old.parts,...(next.parts.bubbles?{bubbles}:{}),css:replaceWorkshopCss(old.parts.css||'','avatar',css)}};});
   }
   else if(shelf==='background'){
    const cssBlock=(next.parts.css||'').match(backgroundBlock)?.[0];
    if(!next.parts.background&&!cssBlock)throw Error('这份预设没有聊天背景');
    setDraft(old=>({...old,parts:{...old.parts,...(next.parts.background?{background:next.parts.background}:{}),css:[(old.parts.css||'').replace(backgroundBlock,'').trim(),cssBlock].filter(Boolean).join('\n')}}));
   }
   else {const part=next.parts[shelf];if(part===undefined)throw Error('这份预设没有对应内容');setDraft(old=>({...old,parts:{...old.parts,[shelf]:part}}));}
   setOrigins(old=>({...old,...Object.fromEntries((shelf==='whitebox'?Object.keys(next.parts):[shelf]).map(key=>[key,nextOrigin]))}));setLabels(old=>({...old,[shelf]:entry.name}));setShelf(null);setNotice('已加入搭配');setSideOpen(false);
 }catch(e){setError(e instanceof Error?e.message:'无法读取预设');}finally{setBusy(false);}};
 const matches=sources.filter(entry=>entry.kind==='chat-decoration'&&(!shelf||entry.categories?.includes(shelf))&&entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const pageCount=Math.max(1,Math.ceil(matches.length/8));const currentPage=Math.min(page,pageCount-1);
  const loadOutfit=async(entry:WardrobeEntry)=>{setBusy(true);setError('');try{const nextOrigin=await readDecorationOrigin(await entry.attributionKey());if(!canEditDecoration(nextOrigin))throw Error('作者禁止二改');const next=validateDecoration(await (entry.readLocal || entry.read)());setDraft(next);setExtraCss('');setOrigins(Object.fromEntries(Object.keys(next.parts).map(key=>[key,nextOrigin])));setLabels({});setSideOpen(false);setOutfitOpen(false);setNotice('已载入搭配，点击应用搭配后才会更改角色。');}catch(e){setError(e instanceof Error?e.message:'读取失败');}finally{setBusy(false);}};
   const acceptEditedPart=(next:DecorationPreset)=>{if(!editPart)return;const part=editPart;setDraft(old=>{let parts={...old.parts};if(part==='whitebox')parts={...parts,...next.parts};else if(part==='avatar'||part==='background'||part==='motion'||part==='transfer'||part==='voice'){
    if(next.parts.background)parts.background=next.parts.background;
    parts.css=writeComposedCss(parts.css||'',part,readComposedCss(next.parts.css||'',part));
    if(part==='avatar'&&next.parts.bubbles){const bubbles=structuredClone(parts.bubbles||PRESET_THEMES.default);for(const side of ['user','ai'] as const)for(const field of ['avatarDecoration','avatarDecorationX','avatarDecorationY','avatarDecorationScale','avatarDecorationRotate'] as const){const value=next.parts.bubbles[side][field];if(value!==undefined)(bubbles[side] as any)[field]=value;else delete (bubbles[side] as any)[field];}parts.bubbles=bubbles;}
   }else parts={...parts,[part]:next.parts[part]};return {...old,parts};});setOrigins(old=>({...old,[part]:remixOrigin(combinedOrigin)}));setLabels(old=>({...old,[part]:next.name}));setEditPart(null);void onOutfitsChange?.();setNotice('编辑已加入装修单，应用到角色后生效。');};
  return createPortal(<div {...atelierSurface} data-dress-guide={!maker?'outfit':undefined} className={`decoration-draft ${maker?'decoration-maker':'decoration-current'}`} role="dialog" aria-modal="true" aria-label={maker?`${shelves.find(([id])=>id===maker)?.[1]}制作器`:'我的搭配'}>
   {atelier&&onAtelierNavigate&&<AtelierNavigation page={maker?['collaboration','date','story'].includes(maker)?'work':characterName?'role':'components':'role'} disabled={busy} onNavigate={page=>requestClose(page)}/>}
   <header className={atelier?'atelier-draft-topline':undefined}><button data-dress-guide={!maker?'outfit-back':undefined} disabled={busy} onClick={()=>requestClose()} aria-label="返回">‹{!atelier&&' 返回'}</button><strong>{maker?atelier?`编辑${shelves.find(([id])=>id===maker)?.[1]}`:`${shelves.find(([id])=>id===maker)?.[1]}制作器`:atelier?characterName||draft.name:'我的搭配'}</strong><ChatAppearanceModeSwitch/>{(maker||!atelier)&&<button disabled={busy||locked} onClick={()=>atelier&&maker?(localOnly?void saveLocal():setMakerSaveOpen(true)):void save(!maker)}>{busy?'保存中…':maker?atelier?(localOnly?'完成':'保存'):'保存预设':'应用搭配'}</button>}</header>
   <div className="decoration-composer-body"><div className="decoration-composer-preview">
   <BeautyPresetPreview data={renderedPreview} sceneScope={!maker||maker==='whitebox'?'all':'preset'}/>
   {(!maker||maker==='whitebox')&&<button className="decoration-layout-orb" disabled={busy||locked} aria-label="调整布局" aria-expanded={layoutOpen} onClick={()=>setLayoutOpen(!layoutOpen)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 7h16M4 17h16"/><rect x="7" y="4" width="4" height="6" rx="2"/><rect x="14" y="14" width="4" height="6" rx="2"/></svg><span>布局</span></button>}
    {layoutOpen&&<aside className="decoration-layout-popover" aria-label="布局浮窗"><header><div><strong>布局微调</strong><small>边调整，边看效果</small></div><button aria-label="收起布局浮窗" onClick={()=>setLayoutOpen(false)}>×</button></header>{atelier&&<label className="atelier-layout-group-picker">设置分组<select value={layoutGroup} onChange={e=>setLayoutGroup(e.target.value)}>{['内置布局','界面风格','头部与在线状态','气泡与头像','细节微调','表情包与输入栏'].map(group=><option key={group}>{group}</option>)}</select></label>}<div className="decoration-layout-fields"><ChatLayoutSettings group={atelier?layoutGroup:undefined} theme={{...theme,...LAYOUT_DEFAULTS,...draft.parts.layout}} updateTheme={patch=>setDraft(old=>({...old,parts:{...old.parts,layout:{...old.parts.layout,...patch}}}))}/></div></aside>}
  </div>
   {!maker&&<button className="decoration-side-toggle" aria-expanded={sideOpen} onClick={()=>setSideOpen(!sideOpen)}>{atelier?<><AtelierIcon kind="clipboard"/><span>装修单</span></>:<>搭配 <span aria-hidden="true">☷</span></>}</button>}
  {!maker&&<button className="decoration-outfit-toggle" aria-label="打开搭配收藏" aria-expanded={outfitOpen} onClick={()=>{setSideOpen(false);setLayoutOpen(false);setError('');setOutfitOpen(true);}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 4h14v17l-7-4-7 4z"/><path d="M9 8h6"/></svg><span>收藏</span></button>}
  {!maker&&sideOpen&&<button className="decoration-side-scrim" aria-label="收起搭配侧栏" onClick={()=>setSideOpen(false)}/>}
   {atelier&&maker&&<button className="atelier-editor-return" aria-expanded={controlsOpen} onClick={()=>setControlsOpen(!controlsOpen)}><AtelierIcon kind="pencil"/>编辑</button>}
    <aside className="decoration-composer-controls" data-open={sideOpen} data-atelier-open={controlsOpen}>{atelier&&!maker&&<button className="atelier-board-clip" aria-label="点击夹子收起装修单" onClick={()=>setSideOpen(false)}><span/></button>}{atelier&&maker&&<header className="atelier-editor-heading"><AtelierIcon kind="pencil"/><strong>{shelves.find(([id])=>id===maker)?.[1]}</strong><button aria-label="收起编辑" onClick={()=>setControlsOpen(false)}>⌄</button></header>}{!maker&&<header className="decoration-side-header">{atelier&&<AtelierIcon kind="clipboard"/>}<strong>{atelier?'装修单':'我的选择'}</strong>{!atelier&&<button aria-label="关闭搭配侧栏" onClick={()=>setSideOpen(false)}>×</button>}</header>}{locked&&<p role="status">当前搭配包含禁止二改的作品，已锁定编辑；可以返回装扮库更换作品。</p>}
    {!maker&&(atelier?<><div className="atelier-sheet-title"><span>Décoration</span><svg viewBox="0 0 180 24" fill="none" stroke="currentColor" strokeWidth=".8" aria-hidden="true"><path d="M4 13c24-18 47 16 71 0s6-17 0-8 15 22 30 8 47-5 71 0M22 14c14-7 27 7 43 0m50 0c16 7 29-7 43 0"/></svg><strong>装 修 单</strong></div><div className="atelier-sheet-signature"><span>装修对象</span><em>{characterName||'角色'}</em><i/><span>搭配</span><b>{draft.name||'当前搭配'}</b></div><div className="atelier-sheet-details"><em>Details</em><small>点名称挑选 · 点笔编辑</small></div></>:<p className="decoration-current-character">当前角色：{characterName||'当前角色'} · 点选预设搭配</p>)}
     {maker&&!atelier&&<label className="decoration-name">名称<input disabled={busy} value={draft.name} maxLength={60} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>}
   {(maker==='story'||maker==='date')&&onShareSaved&&<div><button className="decoration-save-outfit" disabled={busy||locked||combinedOrigin.allowRedistribute===false} onClick={()=>void save(false,true)}>保存并投稿云端</button><p>先保存到本机，再确认作品、署名和使用规范。人工审核通过后获得分享码；公开展示需另行勾选。</p></div>}
    {!atelier&&originalKey&&['self','remix'].includes(origin.kind)&&<label><input disabled={busy} type="checkbox" checked={update} onChange={e=>setUpdate(e.target.checked)}/>更新原预设，否则另存一份</label>}
    {!maker&&!atelier&&<button className="decoration-save-outfit" disabled={busy||locked} onClick={()=>setSaveOpen(true)}>保存当前搭配</button>}
    {!maker&&<div className="decoration-current-grid">{shelves.filter(([id])=>!['schedule','journal','date','story','collaboration'].includes(id)).map(([id,label])=><div className="atelier-component-row" key={id}><button disabled={busy||locked} onClick={()=>{setShelf(id);setQuery('');setPage(0);setError('');}}><span className="decoration-current-image">{atelier?<AtelierIcon kind={id}/>:<DecorationMiniPreview preset={renderedPreview} category={id}/>}</span><small>{labels[id]||'当前使用'}</small><strong>{label}</strong>{atelier&&<span className="atelier-row-pick">挑选 ›</span>}</button>{atelier&&<button className="atelier-row-edit" aria-label={`编辑${label}`} disabled={busy||locked} onClick={()=>setEditPart(id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="m15 4 5 5M4 20l2-6L17 3l4 4-11 11-6 2Z"/></svg></button>}</div>)}</div>}
    {atelier&&maker&&category==='avatar'&&<div className="atelier-avatar-actions"><button disabled={busy} onClick={()=>{setShelf('avatar');setQuery('');setPage(0);setError('');}}>挑选头像框</button><button disabled={busy} onClick={event=>event.currentTarget.closest('aside')?.querySelector<HTMLInputElement>('input[type="file"]')?.click()}>＋ 选择图片</button></div>}
    {maker&&<div key={category} className="decoration-category-panel" data-fixed-avatar-actions={atelier&&category==='avatar'?true:undefined} aria-label={`${shelves.find(([id])=>id===category)?.[1]}设置`}>
      <details open className="decoration-composer-section" onToggle={event=>{if(atelier&&!event.currentTarget.open)event.currentTarget.open=true;}}><summary onClick={event=>{if(atelier)event.preventDefault();}}>选择预设</summary><button className="decoration-preset-choice" disabled={busy} onClick={()=>{setShelf(category);setQuery('');setPage(0);setError('');}}><span className="decoration-selected-thumb"><DecorationMiniPreview preset={renderedPreview} category={category}/></span><span className="decoration-selected-copy"><small>{atelier?'当前预设':labels[category]?'当前搭配':'效果预览'}</small><strong>{labels[category]||(atelier?category==='psyche'?PSYCHE_STYLE_LIST.find(item=>item.id===draft.parts.psyche?.styleId)?.name||draft.name:draft.name:`选择${shelves.find(([id])=>id===category)?.[1]}预设`)}</strong><em>{atelier?'看效果，挑选预设':'点开挑选更多款式'}</em></span><span className="decoration-choice-arrow" aria-hidden="true">›</span></button></details>
      <details open className="decoration-composer-section atelier-style-section" onToggle={event=>{if(atelier&&!event.currentTarget.open)event.currentTarget.open=true;}}><summary onClick={event=>{if(atelier)event.preventDefault();}}>{category==='date'||category==='story'?'阅读样式':category==='sound'?'制作提示音':atelier?'自定义样式':`${shelves.find(([id])=>id===category)?.[1]} CSS`}</summary>
      <div className={atelier?'atelier-edit-materials':undefined}>
      {category==='collaboration'&&<><p>全局协同工作外观，不含任务记录、上传文件或 API 配置。</p><label>基础主题<select value={draft.parts.collaboration?.uiTheme||'sully'} onChange={e=>setDraft(old=>({...old,parts:{collaboration:{customCss:'',avatarMode:'theme',avatarStyle:'circle',...old.parts.collaboration,uiTheme:e.target.value as any}}}))}>{COLLABORATION_UI_THEMES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label></>}
      {category==='collaboration'&&<><label>头像显示<select value={draft.parts.collaboration?.avatarMode||'theme'} onChange={e=>setDraft(old=>({...old,parts:{collaboration:{uiTheme:'sully',customCss:'',avatarStyle:'circle',...old.parts.collaboration,avatarMode:e.target.value as any}}}))}>{[['theme','跟随风格'],['both','双方'],['character','只角色'],['user','只自己'],['none','不显示']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>头像形状<select value={draft.parts.collaboration?.avatarStyle||'circle'} onChange={e=>setDraft(old=>({...old,parts:{collaboration:{uiTheme:'sully',customCss:'',avatarMode:'theme',...old.parts.collaboration,avatarStyle:e.target.value as any}}}))}>{[['circle','圆形'],['rounded','圆角'],['portrait','半身卡面']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></>}
      {category==='psyche'&&atelier&&draft.parts.psyche?.styleId==='custom'&&(['bg','accent','text'] as const).map((key,index)=><label key={key}>{['背景','点缀','正文'][index]}<input aria-label={`心象${key}颜色`} value={draft.parts.psyche?.customColors?.[key]||''} onChange={e=>setDraft(old=>({...old,parts:{...old.parts,psyche:{styleId:'custom',...old.parts.psyche,customColors:{...old.parts.psyche?.customColors,[key]:e.target.value}}}}))}/></label>)}
     {category==='journal'&&<label>日记主题<select aria-label="日记主题" value={draft.parts.journal?.preset||'original'} onChange={e=>setDraft(old=>({...old,parts:{...old.parts,journal:{...old.parts.journal,preset:e.target.value as any}}}))}>{JOURNAL_APPEARANCE_PRESETS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
     {category==='schedule'&&<div><p>全局样式：同步桌面组件与聊天日程表，不更改日程内容。</p><label>日程配色<select aria-label="日程配色" value={draft.parts.schedule?.preset||'original'} onChange={e=>setDraft(old=>({...old,parts:{...old.parts,schedule:{...old.parts.schedule,preset:e.target.value as any}}}))}>{SCHEDULE_CARD_PRESETS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}<option value="custom">自定义配色</option></select></label>{draft.parts.schedule?.preset==='custom'&&(['background','textColor','accentColor'] as const).map((key,index)=><label key={key}>{['背景（颜色或渐变）','文字颜色','强调色'][index]}<input value={draft.parts.schedule?.[key]||''} onChange={e=>setDraft(old=>({...old,parts:{...old.parts,schedule:{...old.parts.schedule,[key]:e.target.value}}}))}/></label>)}</div>}
     {(category==='date'||category==='story')&&<label>阅读样式<select value={draft.parts[category]?.preset||'none'} onChange={e=>setDraft(old=>({...old,parts:{[category]:{...old.parts[category],preset:e.target.value}}} as DecorationPreset))}>{MEETING_APPEARANCES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>选择阅读底稿后，可在下方编写 CSS；「无」恢复原界面。</small></label>}
     {category==='sound'&&<WhiteboxSoundEditor sound={draft.parts.sound||null} bound={false} showBind={false} onChangeSound={sound=>setDraft(old=>({...old,parts:{...old.parts,sound}}))} onChangeBound={()=>{}}/>}
      {category==='avatar'&&<AvatarFrameImageEditor css={categoryCss} disabled={busy} onChange={setCategoryCss} onBusy={setBusy} onError={setError}/>}
       {category==='background'&&<label className={atelier?'atelier-material-upload':undefined}>{atelier?<><AtelierIcon kind="background"/><span>背景图片</span><span className="atelier-material-action">＋ 选择图片</span></>:'选择壁纸'}<input aria-label="选择壁纸" type="file" accept="image/*" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>12*1024*1024)throw Error('请选择 12 MB 以内的图片');const {blobToDataUrl}=await import('../../utils/blobRef');const image=await blobToDataUrl(file);setDraft(old=>({...old,parts:{...old.parts,background:{image,style:old.parts.background?.style||'plain'}}}));}catch(e){setError(e instanceof Error?e.message:'图片读取失败');}}}/></label>}
      </div>
     {category!=='sound'&&<section className={atelier?'atelier-main-paper':undefined}>
      {atelier&&<header><h3>自定义样式</h3><button className="atelier-prompt-link" onClick={async()=>{try{await navigator.clipboard.writeText(workshopPrompt(category));setNotice('已复制当前分类提示词');}catch{setError('复制失败');}}}>制作提示词</button></header>}
      {!atelier&&<button onClick={async()=>{try{await navigator.clipboard.writeText(workshopPrompt(category));setNotice('已复制当前分类提示词');}catch{setError('复制失败');}}}>复制 AI 提示词</button>}
       <CssCodeEditor className={atelier?'atelier-manuscript-input':undefined} disabled={busy} aria-label={`${shelves.find(([id])=>id===category)?.[1]} CSS`} spellCheck={false} value={categoryCss} onChange={setCategoryCss} placeholder={atelier?'编写或粘贴样式':category==='psyche'?'.sully-psyche-card { }':category==='background'?'.sully-chat-root { background: #f5f5f5; }':'在这里编写或粘贴 CSS'}/>
       {atelier&&<small className="atelier-manuscript-caption">当前作品的主要样式</small>}
       {category==='whitebox'&&!atelier&&<label>追加 CSS<textarea disabled={busy} aria-label="追加 CSS" spellCheck={false} value={extraCss} onChange={e=>setExtraCss(e.target.value)}/></label>}
     </section>}
    </details>
    {atelier&&category!=='sound'&&<section className="atelier-editor-append"><h3>追加样式</h3><textarea disabled={busy} aria-label="追加样式" spellCheck={false} value={extraCss} onChange={e=>setExtraCss(e.target.value)} placeholder="在原有样式后追加"/><small>保留主要样式，接着补充细节。</small></section>}
    </div>}

    {!maker&&atelier&&<footer className="atelier-board-footer"><section className="atelier-board-status"><em>Prepared for {characterName||'you'}</em><span>{JSON.stringify(draft)===JSON.stringify(preset)?'已应用':'修改未应用'}</span></section><div><button disabled={busy||locked} onClick={()=>setSaveOpen(true)}>存为搭配</button><button disabled={busy||locked} onClick={()=>void save(true)}>应用到角色</button></div><section className="atelier-sheet-endnote"><span>共九项 · 清单可滚动</span><button disabled={busy} onClick={()=>{setDraft(structuredClone(preset));setExtraCss('');setLabels({});setOrigins(Object.fromEntries(Object.keys(preset.parts).map(key=>[key,origin])));}}>放弃修改</button></section></footer>}
    {combinedOrigin.credit&&<p>来源署名：{combinedOrigin.credit}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </aside></div>
  {!maker&&outfitOpen&&<OutfitCollection getUsage={getUsage} entries={outfits} busy={busy} error={error} onClose={()=>setOutfitOpen(false)} onChoose={entry=>void loadOutfit(entry)} onDelete={setDeleteOutfit} onSave={()=>setSaveOpen(true)}/> }
   {deleteOutfit&&<BeautyConfirmDialog title="删除这套搭配？" confirm="删除" danger onClose={()=>setDeleteOutfit(null)} onConfirm={async()=>{await deleteLibraryDecoration(deleteOutfit.id);await onOutfitsChange?.();}}><p>只移除搭配收藏，已应用的效果和各部件原件会保留。</p></BeautyConfirmDialog>}
   {makerSaveOpen&&!localOnly&&<BeautyConfirmDialog title="保存作品" confirm="保存" onClose={()=>setMakerSaveOpen(false)} onConfirm={()=>save()}><label className="atelier-save-name">作品名称<input aria-label="作品名称" value={draft.name} maxLength={60} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><div className="atelier-save-options"><label><input type="radio" name="atelier-save-mode" checked={!update} onChange={()=>setUpdate(false)}/><span>另存一份作品<small>保留原作品，保存编辑后的版本。</small></span></label>{originalKey&&['self','remix'].includes(origin.kind)&&<label><input type="radio" name="atelier-save-mode" checked={update} onChange={()=>setUpdate(true)}/><span>更新原作品<small>用编辑结果替换原作品内容。</small></span></label>}</div><p>保存到组件库，保存不等于应用。</p>{error&&<p role="alert">{error}</p>}</BeautyConfirmDialog>}
  {saveOpen&&<BeautyConfirmDialog title="保存当前搭配" confirm="保存到搭配栏" onClose={()=>setSaveOpen(false)} onConfirm={async()=>{if(!canEditDecoration(combinedOrigin))throw Error("作者禁止二改");if(!draft.name.trim())throw Error("请填写搭配名称");const result={...preview,name:draft.name.trim()};await saveLibraryDecoration(result,remixOrigin(combinedOrigin),undefined,'outfit');trackBeauty('save','outfit');await onOutfitsChange?.();setNotice('已保存到搭配栏');}}><p>保存这次组合，下次可以整套应用。</p><label>搭配名称<input aria-label="搭配名称" maxLength={60} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label></BeautyConfirmDialog>}
   {editCurrentPsyche&&<DecorationDraftEditor preset={projectWorkshopPreset({...draft,name:'当前心象'},'psyche')} origin={combinedOrigin} theme={theme} sources={sources} maker="psyche" onOpenWorkshop={onOpenWorkshop} onClose={()=>setEditCurrentPsyche(false)} onSaved={next=>{setDraft(old=>({...old,parts:{...old.parts,psyche:next.parts.psyche}}));setEditCurrentPsyche(false);setShelf(null);void onOutfitsChange?.().catch(()=>setError('心象已保存，预设库刷新失败，请重新打开。'));setNotice('心象已保存到预设库；应用搭配后更新角色。');}}/>}
  {shelf&&<div className="decoration-shelf-overlay"><section role="dialog" aria-modal="true" aria-label="选择搭配预设"><header><strong>{shelves.find(([id])=>id===shelf)?.[1]}</strong><button disabled={busy} onClick={()=>setShelf(null)}>关闭</button></header>{!maker&&shelf==='psyche'&&<button disabled={busy||locked} onClick={()=>setEditCurrentPsyche(true)}>编辑并另存当前心象</button>}<input type="search" aria-label="搜索搭配预设" placeholder="搜索预设名称" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><div className="decoration-shelf-results decoration-shelf-grid">{matches.slice(currentPage*8,currentPage*8+8).map(entry=><DecorationPresetThumb getUsage={getUsage} key={entry.id} entry={entry} category={shelf} disabled={busy} onChoose={()=>{void choose(entry);}}/>)}{!matches.length&&<p>暂无对应预设，请先在装扮库导入或保存。</p>}</div>{error&&<p role="alert">{error}</p>}<footer><button disabled={busy||currentPage===0} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage+1} / {pageCount}</span><button disabled={busy||currentPage+1>=pageCount} onClick={()=>setPage(currentPage+1)}>下一页</button></footer></section></div>}
   {editPart&&(editPart==='bubbles'?<div className="decoration-bubble-maker" {...atelierSurface}><React.Suspense fallback={<p role="status">正在打开气泡制作器…</p>}><BubbleMaker embedded initialTheme={draft.parts.bubbles} onClose={()=>setEditPart(null)} onSaveTheme={async bubbles=>{const next={format:'sullyos-chat-decoration' as const,version:1 as const,name:bubbles.name,parts:{bubbles}};acceptEditedPart(next);}}/></React.Suspense></div>:editPart==='motion'||editPart==='transfer'||editPart==='voice'?<AtelierComponentMaker kind={editPart} localOnly preset={{...draft,name:labels[editPart]||shelves.find(([id])=>id===editPart)![1]}} origin={combinedOrigin} onClose={()=>setEditPart(null)} onSaved={acceptEditedPart}/>:<DecorationDraftEditor previewContext={draft} characterName={characterName} preset={projectWorkshopPreset({...draft,name:labels[editPart]||shelves.find(([id])=>id===editPart)![1]},editPart)} origin={combinedOrigin} theme={theme} sources={sources} maker={editPart} localOnly onAtelierNavigate={nestedNavigate} onOpenWorkshop={onOpenWorkshop} onClose={()=>setEditPart(null)} onSaved={acceptEditedPart}/>)}
  {leaving&&<BeautyConfirmDialog title="放弃未保存的修改？" confirm="放弃并返回" onClose={()=>setLeaving(null)} onConfirm={async()=>{if(leaving.page)onAtelierNavigate?.(leaving.page);else onClose();}}><p>未保存的编辑会放弃，已保存的收藏与角色外观保持不变。</p></BeautyConfirmDialog>}
  </div>,document.body);
}
