import {playWhiteboxSound,unlockWhiteboxAudio} from '../../utils/whiteboxSound';
import {useChatAppearance} from '../chat/appearance/ChatAppearanceMode';
import AtelierPreviewDock from '../chat/appearance/AtelierPreviewDock';
import {readComposedCss} from '../../utils/atelierComponentCss';
import {workshopPreview} from '../../utils/decorationWorkshop';
import {fitChatPreviewViewport} from '../../utils/chatPreviewViewport';
import {resolveCssImageUrls} from '../../utils/cssImageAssets';
import {decorationPreviewScenes,decorationThumbnailPart,type DecorationThumbnailPart} from '../../utils/decorationPreviewScenes';
import React, { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {embedBeautyCaptureImages} from '../../utils/beautyCaptureAssets';
import {renderIsolatedBeautyCapture, waitForBeautyCapture, waitForBeautyCaptureFonts} from '../../utils/beautyCaptureWait';
import {enqueuePreviewBuild} from '../../utils/previewRenderQueue';
import { beautyPreviewDocument, PREVIEW_WIDTH, PREVIEW_HEIGHT } from '../../utils/beautyPreview';
import {bindDecorationPreview,type DecorationPreviewState} from '../../utils/decorationPreviewInteraction';

export interface BeautyPreviewHandle { capture: () => Promise<HTMLCanvasElement> }
interface Props { data: unknown; compact?: boolean; sceneScope?: 'preset'|'all'; thumbnailPart?:DecorationThumbnailPart|'full'; /** 仅角色页：按真机比例缩进白壳。装修单/制作器不要开，会把编辑页挤变形。 */ fitPhone?: boolean }
function copyPaint(element: Element, scrolls: Array<[HTMLElement,number,number]>): HTMLElement {
  const clone = (element instanceof HTMLTextAreaElement ? document.createElement('div') : element.cloneNode(false)) as HTMLElement;
  const computed = getComputedStyle(element);
  for (const key of Array.from(computed)) clone.style.setProperty(key, computed.getPropertyValue(key));
  // Freeze pseudo-element appearance without copying the author's CSS selectors.
  const pseudo = (name: string) => {
    const css = getComputedStyle(element, name);
    if (!css.content || css.content === 'none' || css.content === 'normal' || css.display === 'none') return;
    const part = document.createElement('span');
    for (const key of Array.from(css)) part.style.setProperty(key, css.getPropertyValue(key));
    if (/^["']/.test(css.content)) part.textContent = css.content.slice(1, -1);
    clone.append(part);
  };
  if (element instanceof HTMLTextAreaElement) {
    clone.textContent = element.value || element.placeholder;
    if (!element.value) clone.style.color = getComputedStyle(element, '::placeholder').color;
    return clone;
  }
  pseudo('::before');
  for (const node of Array.from(element.childNodes)) {
    if (node instanceof Element && node.tagName !== 'STYLE') clone.append(copyPaint(node,scrolls));
    else if (node.nodeType === Node.TEXT_NODE) clone.append(node.cloneNode());
  }
  pseudo('::after');
  if(element instanceof HTMLElement && (element.scrollTop||element.scrollLeft))scrolls.push([clone,element.scrollTop,element.scrollLeft]);
  return clone;
}
export default memo(forwardRef<BeautyPreviewHandle, Props>(function BeautyPresetPreview({ data, compact = false, sceneScope = 'preset', thumbnailPart, fitPhone = false }, ref) {
   const {mode}=useChatAppearance();
   const [availableHeight,setAvailableHeight]=useState(0);
   const [replay,setReplay]=useState(0);
  const host = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const activeCapture = useRef<AbortController|null>(null);
  useEffect(() => () => activeCapture.current?.abort(), []);
  const [width, setWidth] = useState(PREVIEW_WIDTH);
  const [desktopPage, setDesktopPage] = useState(0);
  const [desktopPages, setDesktopPages] = useState(1);
  useEffect(() => { setDesktopPage(0); setDesktopPages(1); }, [data]);
  const isChat = (data as any)?.format === 'sullyos-chat-decoration';
  const soundOnly=compact&&isChat&&Object.keys((data as any).parts||{}).length===1&&Object.prototype.hasOwnProperty.call((data as any).parts,'sound');
  const part = compact && isChat && thumbnailPart!=='full' ? thumbnailPart||decorationThumbnailPart(data) : undefined;
  // 真机比例缩放只给角色页（fitPhone）。装修单走原编辑页尺寸，避免整页变形。
  const fittedChat=mode==='atelier'&&!compact&&isChat&&fitPhone;
  const [previewSurface,setPreviewSurface]=useState<'role'|'composer'|'other'>('other');
  const [phoneSize,setPhoneSize]=useState(()=>({w:PREVIEW_WIDTH,h:PREVIEW_HEIGHT}));
  useEffect(()=>{
    if(!fittedChat||typeof window==='undefined')return;
    const readPhoneChatSize=()=>{
      const chat=document.querySelector('.sully-chat-root') as HTMLElement|null;
      if(chat&&chat.clientWidth>120&&chat.clientHeight>200)return{w:Math.round(chat.clientWidth),h:Math.round(chat.clientHeight)};
      const vv=window.visualViewport;
      return{w:Math.max(280,Math.round(vv?.width||window.innerWidth)),h:Math.max(480,Math.round(vv?.height||window.innerHeight))};
    };
    const update=()=>setPhoneSize(readPhoneChatSize());
    update();
    window.visualViewport?.addEventListener('resize',update);
    window.addEventListener('resize',update);
    return()=>{window.visualViewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);};
  },[fittedChat]);
  const phoneFallbackHeight = typeof window !== 'undefined'
    ? Math.max(180, Math.floor(((window.visualViewport?.height || window.innerHeight) - 160) * 0.72))
    : PREVIEW_HEIGHT;
  // 白手机壳边框 + 底栏，缩放时先扣掉。
  const shellPadX=fittedChat?9:0;
  const shellPadTop=fittedChat?12:0;
  const dockReserve=fittedChat?44:0;
  const availH=fittedChat?(availableHeight>120?Math.max(120,Math.floor(availableHeight)):phoneFallbackHeight):0;
  const availW=fittedChat?Math.max(120,Math.floor(width||PREVIEW_WIDTH)):PREVIEW_WIDTH;
  const slotH=fittedChat?Math.max(120,availH-shellPadTop-dockReserve):0;
  const slotW=fittedChat?Math.max(120,availW-shellPadX*2):PREVIEW_WIDTH;
  const phoneScale=fittedChat?Math.min(slotW/phoneSize.w,slotH/phoneSize.h,1):1;
  const scaledW=fittedChat?Math.max(1,Math.round(phoneSize.w*phoneScale)):slotW;
  const scaledH=fittedChat?Math.max(1,Math.round(phoneSize.h*phoneScale)):PREVIEW_HEIGHT;
  const frameW=fittedChat?scaledW+shellPadX*2:scaledW;
  const frameH=fittedChat?shellPadTop+scaledH+dockReserve:scaledH;
  const height = part==='psyche' ? 180 : part ? PREVIEW_WIDTH : isChat
    ? (fittedChat ? phoneSize.h : PREVIEW_HEIGHT)
    : 720;
  const renderWidth=fittedChat?phoneSize.w:PREVIEW_WIDTH;
   const [scene, setScene] = useState(()=>(data as any)?.parts?.psyche && Object.keys((data as any).parts).length===1 ? 'psyche' : 'conversation');
  const scenes = decorationPreviewScenes(data,sceneScope);
  const sceneId = !compact && scenes.some(item=>item.id===scene) ? scene : scenes[0].id;
  const sceneIndex=scenes.findIndex(item=>item.id===sceneId);
  const [interaction,setInteraction]=useState<{data:unknown;scene:string;state:DecorationPreviewState}|null>(null);
  const liveState=interaction&&interaction.data===data&&interaction.scene===sceneId?interaction.state:undefined;
  useEffect(()=>setInteraction(null),[data,sceneId]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [visible,setVisible]=useState(!compact);
  useEffect(()=>{
    if(!compact||typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(items=>setVisible(items.some(item=>item.isIntersecting)),{rootMargin:'80px'});
    if(container.current)observer.observe(container.current);
    return()=>observer.disconnect();
  },[compact]);
  useEffect(() => {
    if(!visible||soundOnly)return;
    setReady(false); setError('');
    let alive = true;let cleanup:undefined|(()=>void);let releaseImages:undefined|(()=>void);
    const build = async () => { try {
      const sample = isChat
        ? await import('../chat/ChatDecorationSample').then(module=>alive?module.renderChatDecorationSample(mode==='atelier'?workshopPreview(data as any,undefined):data,sceneId,part,liveState,{entrance:mode==='atelier'&&!compact&&replay>0}):null)
        : await import('./DesktopDecorationSample').then(module=>alive?module.renderDesktopDecorationSample(data,compact ? 0 : desktopPage):null);
      if (!alive || !host.current) return;
      const shadow = host.current.shadowRoot || host.current.attachShadow({ mode: 'open' });
       const previousMessages=shadow.querySelector('.sample-messages');
       const scrollTop=previousMessages?.scrollTop||0;
      const focusAction=shadow.activeElement?.getAttribute('data-preview-action');
      const parsed = new DOMParser().parseFromString(sample ? sample.markup : beautyPreviewDocument(data), 'text/html');
      if (!isChat) setDesktopPages(Math.max(1, parsed.querySelector('.launcher-pages')?.children.length || 1));
      const style = document.createElement('style');
      // Only text CSS and our own escaped sample markup cross this boundary, never scripts.
      shadow.adoptedStyleSheets=[];
       style.textContent = sample ? sample.css+'\n*{animation:none!important;transition:none!important;pointer-events:none!important}.sample-messages,.no-scrollbar{pointer-events:auto!important}'+(!compact?'[data-preview-action],[data-preview-action] *,[data-preview-backdrop],.sully-chat-transfer-dialog{pointer-events:auto!important}[data-preview-action]:focus-visible{outline:2px solid #8a72ad!important;outline-offset:2px}':'') : (parsed.querySelector('style')?.textContent || '').replace('html,body{', '.beauty-preview-body{').replace('body{background:', '.beauty-preview-body{background:');
       if(sample&&isChat)style.textContent=style.textContent.replace(/:root\b/g,':host');
      // 真机画布尺寸（不是预览格）；安全区跟真聊天一致，布局再用 scale 缩进格子。
      const nativeW=fittedChat?phoneSize.w:renderWidth;
      const nativeH=fittedChat?phoneSize.h:height;
      const liveChrome=getComputedStyle(document.querySelector('.sully-chat-root')||document.documentElement);
      const liveSafeTop=(liveChrome.getPropertyValue('--safe-top').trim()||'0px');
      const liveSafeBottom=(liveChrome.getPropertyValue('--safe-bottom').trim()||'0px');
      const liveChromeTop=(liveChrome.getPropertyValue('--chrome-top').trim()||liveSafeTop||'0px');
      if(fittedChat&&sample)style.textContent=fitChatPreviewViewport(style.textContent,nativeW,nativeH);
      if(fittedChat&&sample)style.textContent+=`\n:host,.beauty-preview-body{--safe-top:${liveSafeTop}!important;--safe-bottom:${liveSafeBottom}!important;--chrome-top:${liveChromeTop}!important}.beauty-preview-body,.sample-chat{height:${nativeH}px!important;width:${nativeW}px!important;max-width:none!important}.sample-chat{min-height:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}.sample-chat>.sample-messages{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;touch-action:pan-y;overscroll-behavior:contain;pointer-events:auto!important}.sample-chat>.sticky,.sample-chat .sully-chat-header{flex-shrink:0!important;box-sizing:border-box!important;max-width:100%!important}.sample-chat>.sully-chat-inputbar,.sample-chat .sully-chat-inputbar{flex-shrink:0!important;box-sizing:border-box!important;max-width:100%!important;width:100%!important;left:auto!important;right:auto!important;position:relative!important}.sample-chat .sully-chat-textarea{min-width:0!important;max-width:100%!important}.sample-chat .sully-chat-inputbar>div{box-sizing:border-box;max-width:100%;min-width:0}`;
      // 装修间：有 motion 块，或点了重播时，放开 animation，否则消息入场永远 animation:none。
      const hasMotion=!!readComposedCss((data as any)?.parts?.css||'','motion');
      const allowAnim=mode==='atelier'&&!compact&&isChat&&(hasMotion||replay>0);
      if(allowAnim)style.textContent=style.textContent.replace('*{animation:none!important;transition:none!important;pointer-events:none!important}','*{pointer-events:none!important}');
      const images = await resolveCssImageUrls(style.textContent || '');
      if (!alive) {images.dispose(); return;}
      releaseImages = images.dispose; style.textContent = images.css;
      const body = document.createElement('div'); body.className = 'beauty-preview-body';
      for (const child of Array.from(parsed.body.children)) body.append(child.cloneNode(true));
       shadow.replaceChildren(style, body);
       if(fittedChat){
        body.style.fontSize=liveChrome.fontSize;
        body.style.fontFamily=liveChrome.fontFamily;
        body.style.color=liveChrome.color;
       }
       if(sample&&isChat&&!compact){
        cleanup=bindDecorationPreview(body,liveState||{},!!scenes.find(item=>item.id===sceneId)?.expanded,state=>setInteraction({data,scene:sceneId,state}));
          const messages=body.querySelector('.sample-messages');
          if(messages){
            // 重播从顶部再播入场；平时保留滚动位置。
            if(replay>0) messages.scrollTop=0;
            else messages.scrollTop=scrollTop;
          }
          if(fittedChat&&messages&&!previousMessages&&replay===0)messages.scrollTop=messages.scrollHeight;
        if(focusAction)Array.from(body.querySelectorAll<HTMLElement>('[data-preview-action]')).find(el=>el.getAttribute('data-preview-action')===focusAction)?.focus({preventScroll:true});
      }
      // Preset :host selectors cannot resize, position or expose the host outside its clip.
      if(fittedChat){
        for (const [key, value] of Object.entries({ width: `${nativeW}px`, height: `${nativeH}px`, display: 'block', position: 'absolute', left: '0', top: '0', overflow: 'hidden', contain: 'strict', transform: `scale(${phoneScale})`, 'transform-origin': 'top left', 'pointer-events': compact ? 'none' : 'auto' })) host.current.style.setProperty(key, value, 'important');
      }else{
        for (const [key, value] of Object.entries({ width: `${renderWidth}px`, height: `${height}px`, display: 'block', position: 'relative', overflow: 'hidden', contain: 'strict', 'pointer-events': compact ? 'none' : 'auto' })) host.current.style.setProperty(key, value, 'important');
      }
      setReady(true);
    } catch (e) { releaseImages?.(); if(alive)setError(e instanceof Error ? e.message : '预览失败'); } };
    const cancel=compact?enqueuePreviewBuild(build):undefined;
    if(!compact)void build();
    return () => {alive=false;cancel?.();cleanup?.();releaseImages?.();};
  }, [data,sceneId,isChat,compact,part,height,liveState,desktopPage,visible,soundOnly,mode,replay,renderWidth,phoneSize.w,phoneSize.h,phoneScale,scaledW,scaledH,slotW,slotH]);
  useEffect(() => {
    if (!container.current) return;
    const measure = () => {
      const node = container.current;
      if (!node) return;
      // 角色页量 atelier-role-preview；编辑态量 decoration-composer-preview。
      const role = node.closest('.atelier-role-preview') as HTMLElement | null;
      const composer = node.closest('.decoration-composer-preview') as HTMLElement | null;
      const box = role || composer;
      const surface = role ? 'role' : composer ? 'composer' : 'other';
      const boxW = fittedChat ? (box?.clientWidth || node.parentElement?.clientWidth || node.clientWidth) : node.clientWidth;
      const boxH = fittedChat ? (box?.clientHeight || node.parentElement?.clientHeight || node.clientHeight) : node.clientHeight;
      const nextW = fittedChat ? boxW : Math.min(PREVIEW_WIDTH, boxW || PREVIEW_WIDTH);
      const nextH = fittedChat ? boxH : boxH;
      if(fittedChat && (surface==='other' || nextW<120 || nextH<120))return;
      setPreviewSurface(surface);
      setWidth(nextW);
      setAvailableHeight(nextH);
    };
    const observer = new ResizeObserver(() => measure());
    const role = container.current.closest('.atelier-role-preview');
    const composer = container.current.closest('.decoration-composer-preview');
    if (role) observer.observe(role);
    else if (composer) observer.observe(composer);
    else observer.observe(container.current);
    measure();
    return () => observer.disconnect();
  }, [fittedChat,phoneSize.w,phoneSize.h,scaledW,scaledH,frameW,frameH,phoneScale,slotW,slotH]);
  useImperativeHandle(ref, () => ({
    capture: async () => {
      const element = host.current;
      if (!ready || !element?.shadowRoot) throw Error('预览尚未加载完成，请稍后再试');
      const body = element.shadowRoot.querySelector<HTMLElement>('.beauty-preview-body');
      if (!body) throw Error('预览内容尚未就绪');
      activeCapture.current?.abort();
      const controller = new AbortController(); activeCapture.current = controller;
      let stage = '预览字体加载';
      const timeout = window.setTimeout(() => controller.abort(Error(`${stage}超时，请检查网络后重试；不会提交未完成的封面。`)), 30000);
      try {
        await waitForBeautyCaptureFonts(body, controller.signal);
        const scrolls:Array<[HTMLElement,number,number]>=[];
        const snapshot = copyPaint(body,scrolls);
        stage = '封面图片加载';
        await waitForBeautyCapture(embedBeautyCaptureImages(snapshot, controller.signal), controller.signal);
        stage = '封面绘制';
        return await renderIsolatedBeautyCapture(snapshot, PREVIEW_WIDTH, height, controller.signal, scrolls);
      } finally {
        clearTimeout(timeout);
        if (activeCapture.current === controller) activeCapture.current = null;
      }
    },
  }), [ready,height]);
  if(soundOnly)return <div className="beauty-preset-preview" data-thumbnail-part="sound" style={{display:'grid',placeItems:'center',aspectRatio:'1',color:'#8b829a',background:'#efedf4'}}><svg aria-hidden="true" viewBox="0 0 80 48" width="60%" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="M8 21v6m10-12v18m11-23v28m11-34v40m11-32v24m11-19v14m10-10v6"/></svg><small>{(data as any).parts.sound?.src && (data as any).parts.sound.src!=='none'?'提示音 · 点开试听':'静音'}</small></div>;
  const shellStyle=fittedChat
    ?{width:'100%',maxWidth:'100%',maxHeight:'100%',height:'100%',flex:'1 1 auto' as const,alignSelf:'stretch',margin:0,boxSizing:'border-box' as const,display:'flex',flexDirection:'column' as const}
    :undefined;
  return <div className="beauty-preset-preview" data-atelier-preview={mode==='atelier'&&!compact?'true':undefined} data-atelier-surface={fittedChat?previewSurface:undefined} data-thumbnail-part={part} ref={container} style={shellStyle}>
    {!isChat && !compact && desktopPages > 1 && <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,marginBottom:10}}>
      <button type="button" aria-label="上一页桌面" title="上一页桌面" disabled={desktopPage === 0} onClick={() => setDesktopPage(p => p - 1)}>←</button>
      <select aria-label="预览桌面页" value={desktopPage} onChange={e => setDesktopPage(Number(e.target.value))}>{Array.from({length:desktopPages},(_,i)=><option key={i} value={i}>第 {i + 1} / {desktopPages} 页</option>)}</select>
      <button type="button" aria-label="下一页桌面" title="下一页桌面" disabled={desktopPage >= desktopPages - 1} onClick={() => setDesktopPage(p => p + 1)}>→</button>
    </div>}
    {isChat && !compact && scenes.length>1 && mode!=='atelier' && <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:10,fontSize:12,color:'#666'}}><select aria-label="预览聊天内容" value={sceneId} onChange={event=>setScene(event.target.value)} style={{flex:1,minWidth:0,padding:'8px 10px',borderRadius:8,background:'#f2f2f2',color:'#333'}}>{scenes.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select><button type="button" aria-label="上一条预览" title="上一条预览" disabled={sceneIndex<=0} onClick={()=>setScene(scenes[sceneIndex-1].id)} style={{padding:0,width:32,minHeight:36,flexShrink:0}}>↑</button><button type="button" aria-label="下一条预览" title="下一条预览" disabled={sceneIndex>=scenes.length-1} onClick={()=>setScene(scenes[sceneIndex+1].id)} style={{padding:0,width:32,minHeight:36,flexShrink:0}}>↓</button></div>}
    {error && <p role="alert">{error}</p>}
    <div className={fittedChat?'atelier-preview-viewport':undefined} style={fittedChat?{flex:'1 1 auto',minHeight:0,width:'100%',overflow:'hidden',borderRadius:18,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}:{height:height * width / PREVIEW_WIDTH,width,margin:'auto',overflow:'hidden',borderRadius:20}}>
      {fittedChat?<div style={{width:scaledW,height:scaledH,overflow:'hidden',position:'relative',flex:'none',borderRadius:18}}>
        <div ref={host} data-beauty-preview-source role={isChat&&!compact?'group':'img'} aria-label="美化预设搭配预览"/>
      </div>:<div ref={host} data-beauty-preview-source role={isChat&&!compact?'group':'img'} aria-label="美化预设搭配预览" style={{width:renderWidth,height,transform:`scale(${width / PREVIEW_WIDTH})`,transformOrigin:'top left'}}/>}
    </div>
    {!compact&&isChat&&mode!=='atelier' && (data as any)?.parts?.sound?.src && (data as any).parts.sound.src!=='none' && <button type="button" onClick={()=>{unlockWhiteboxAudio();playWhiteboxSound((data as any).parts.sound);}}>试听提示音</button>}
    {!compact&&isChat&&mode==='atelier'&&<AtelierPreviewDock scenes={scenes} scene={sceneId} onScene={setScene} sound={(data as any)?.parts?.sound?.src && (data as any).parts.sound.src!=='none' ? <button className="atelier-preview-sound" type="button" title="试听提示音" onClick={()=>{unlockWhiteboxAudio();playWhiteboxSound((data as any).parts.sound);}}>试听</button> : undefined} onReplay={()=>{setInteraction(null);setReplay(value=>value+1);}}/>}
    {!compact && mode!=='atelier' && <p className="beauty-preview-caption">{isChat && sceneId==='collaboration'?'协同工作样式预览 · 仅使用示例任务与文件，不读取真实内容。':isChat && (sceneId==='date-reading'||sceneId==='story-reading')?'阅读界面样式预览 · 仅使用虚构文字。':isChat && sceneId==='journal-app'?'交换日记样式预览 · 示例日记本，不读取真实内容。':isChat && sceneId==='schedule-card' ? '日程表样式预览 · 示例日程，不读取真实安排。' : isChat ? <>试着点击心象、转账卡或聊天加号 · 仅演示，不影响真实聊天。 <button type="button" onClick={()=>setInteraction(null)}>重置演示</button></> : desktopPages > 1 ? '桌面预览 · 示例角色与消息，未应用到本机。' : '特殊皮肤示意预览 · 不代表实际桌面布局。'}</p>}
  </div>;
}));
