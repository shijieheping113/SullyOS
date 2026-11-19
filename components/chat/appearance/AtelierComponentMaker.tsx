import React,{useMemo,useRef,useState} from 'react';
import {createAppPortal as createPortal} from '../../os/appPortal';
import BeautyConfirmDialog from '../../share/BeautyConfirmDialog';
import AtelierCssDraftInput,{type AtelierCssDraftHandle} from './AtelierCssDraftInput';
import AtelierDraftPreview from './AtelierDraftPreview';
import {useLocalBackHandler} from '../../../hooks/useLocalBackHandler';
import {ATELIER_CSS_COMPONENTS,ATELIER_COMPONENT_PROMPTS,readComposedCss,writeComposedCss,type AtelierCssComponent} from '../../../utils/atelierComponentCss';
import {remixOrigin,saveLibraryDecoration,type DecorationOrigin} from '../../../utils/decorationLibrary';
import type {DecorationPreset} from '../../../utils/chatDecoration';
import {checkWorkshopCss} from '../../../utils/decorationWorkshop';
import AtelierIcon from './AtelierIcon';
import {useAtelierSurface,ChatAppearanceModeSwitch} from './ChatAppearanceMode';

type Props={kind:AtelierCssComponent;preset?:DecorationPreset;origin:DecorationOrigin;originalKey?:string;onClose:()=>void;onSaved:(preset:DecorationPreset)=>void;localOnly?:boolean};

export default function AtelierComponentMaker({kind,preset,origin,originalKey,onClose,onSaved,localOnly=false}:Props){
    const surface=useAtelierSurface(),title=ATELIER_CSS_COMPONENTS.find(([id])=>id===kind)![1];
    const initialCss=useMemo(()=>readComposedCss(preset?.parts.css||'',kind),[preset?.parts.css,kind]);
    const mainInput=useRef<AtelierCssDraftHandle>(null),extraInput=useRef<AtelierCssDraftHandle>(null);
    const [name,setName]=useState(preset?.name||`我的${title}`);
    const [dirty,setDirty]=useState(false);
    const [preview,setPreview]=useState<DecorationPreset|null>(null);
    const [saving,setSaving]=useState(false),[update,setUpdate]=useState(false),[error,setError]=useState('');
    const [busy,setBusy]=useState(false),[leave,setLeave]=useState(false);
    const readCss=()=>[mainInput.current?.read()??initialCss,extraInput.current?.read()].filter(Boolean).join('\n');
    const readValue=():DecorationPreset=>({format:'sullyos-chat-decoration',version:1,name:name.trim(),parts:{css:writeComposedCss('',kind,readCss())}});
    const showPreview=()=>{
        setError('');
        try {
            if(document.activeElement instanceof HTMLTextAreaElement)document.activeElement.blur();
            setPreview({format:'sullyos-chat-decoration',version:1,name,parts:{...preset?.parts,css:writeComposedCss(preset?.parts.css||'',kind,readCss())}});
        } catch(e){setError(e instanceof Error?e.message:'无法打开预览');}
    };
    const completeLocal=()=>{
        setError('');
        try {const value=readValue();checkWorkshopCss('whitebox',value.parts.css||'');onSaved(value);}
        catch(e){setError(e instanceof Error?e.message:'样式检查未通过');}
    };
    const close=()=>dirty?setLeave(true):onClose();
    useLocalBackHandler(()=>{
        if(busy)return true;
        if(leave)setLeave(false);
        else if(saving)setSaving(false);
        else if(preview)setPreview(null);
        else close();
        return true;
    },35);
    return createPortal(<div {...surface} data-manual-preview={preview?'open':undefined} className="atelier-special-maker" role="dialog" aria-modal="true" aria-label={`编辑${title}`}>
        <header><button onClick={close} aria-label="返回">‹</button><h1>编辑{title}</h1><ChatAppearanceModeSwitch/>
            <button type="button" disabled={busy} onClick={showPreview}>预览</button>
            <button disabled={busy} onClick={()=>localOnly?completeLocal():setSaving(true)}>{localOnly?'完成':'保存'}</button>
        </header>
        <div className="atelier-special-preview"><aside className="atelier-special-sheet">
            <header><AtelierIcon kind="pencil"/><h2>{title}</h2></header>
            <div className="atelier-special-scroll">
                {kind==='motion'&&<p>编辑完成后，点预览查看消息动画。</p>}
                <section className="atelier-special-preset"><span><AtelierIcon kind={kind==='voice'?'sound':'clipboard'}/></span><div><small>当前作品</small><strong>{name}</strong></div></section>
                <section className="atelier-writing-paper"><header><h3>自定义样式</h3><button onClick={async()=>{
                    try{await navigator.clipboard.writeText(ATELIER_COMPONENT_PROMPTS[kind]);}catch{setError('复制失败，请重试。');}
                }}>制作提示词</button></header>
                    <AtelierCssDraftInput ref={mainInput} initialCss={initialCss} onEdit={()=>setDirty(true)} disabled={busy} aria-label="自定义样式"/>
                </section>
                <section className="atelier-attached-paper"><h3>追加样式</h3><AtelierCssDraftInput ref={extraInput} initialCss="" onEdit={()=>setDirty(true)} disabled={busy} aria-label="追加样式" placeholder="在原有样式后追加"/></section>
                {error&&<p role="alert">{error}</p>}
            </div>
        </aside></div>
        {preview&&<AtelierDraftPreview preset={preview} motion={kind==='motion'} onBack={()=>setPreview(null)}/>}
        {!localOnly&&saving&&<BeautyConfirmDialog title="保存作品" confirm="保存" onClose={()=>setSaving(false)} onConfirm={async()=>{
            setBusy(true);
            try{
                const value=readValue();checkWorkshopCss('whitebox',value.parts.css||'');
                if(!value.name)throw Error('请填写作品名称');
                await saveLibraryDecoration(value,remixOrigin(origin),update?originalKey:undefined);onSaved(value);
            }finally{setBusy(false);}
        }}>
            <label className="atelier-save-name">作品名称<input value={name} onChange={e=>setName(e.target.value)} maxLength={60}/></label>
            <div className="atelier-save-options"><label><input type="radio" checked={!update} onChange={()=>setUpdate(false)}/><span>另存一份作品<small>保留原作品，保存编辑后的版本。</small></span></label>
                {originalKey&&['self','remix'].includes(origin.kind)&&<label><input type="radio" checked={update} onChange={()=>setUpdate(true)}/><span>更新原作品</span></label>}
            </div><p>仅保存到共用收藏，不会自动应用或投稿。</p>
        </BeautyConfirmDialog>}
        {leave&&<BeautyConfirmDialog title="放弃未保存的修改？" confirm="放弃并返回" onClose={()=>setLeave(false)} onConfirm={async()=>onClose()}><p>本次未保存的样式会放弃，收藏原件与角色外观保持原样。</p></BeautyConfirmDialog>}
    </div>,document.body);
}
