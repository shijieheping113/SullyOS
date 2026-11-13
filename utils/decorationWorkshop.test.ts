import {expect,it} from 'vitest';
import {makeWorkshopPreset,projectWorkshopPreset,replaceWorkshopCss,workshopPreview,checkWorkshopCss} from './decorationWorkshop';
import {PRESET_THEMES} from '../components/chat/ChatConstants';
import {validateDecoration} from './chatDecoration';
import {decorationPatches} from './chatDecoration';
import {decorationCategories} from './beautyCategories';

it('category makers export only their own content and never clear unrelated CSS',async()=>{
 const preset=makeWorkshopPreset('background');preset.parts.css='.sully-chat-header{color:red}';
 const isolated=projectWorkshopPreset(preset,'background');
 expect(isolated.parts.css).toBeUndefined();expect(decorationCategories(isolated)).toEqual(['chat','background']);
 const patch=await decorationPatches(isolated,['background'],'character',{id:'a',chromeCustomCss:'keep'} as any,{} as any);
 expect(patch.character.chromeCustomCss).toBeUndefined();
});
it('applying an avatar frame preserves the existing whitebox and background CSS',async()=>{
 const old=replaceWorkshopCss('.sully-chat-header{color:red}','background','.sully-chat-root{background:pink}');
 const preset=makeWorkshopPreset('avatar');preset.parts.css=replaceWorkshopCss('','avatar','.sully-chat-avatar-wrap::after{border:1px solid red}');
 expect(decorationCategories(preset)).toEqual(['chat','avatar']);
 const patch=await decorationPatches(preset,['css'],'character',{id:'a',chromeCustomCss:old} as any,{} as any);
 expect(patch.character.chromeCustomCss).toContain('.sully-chat-header');expect(patch.character.chromeCustomCss).toContain('background:pink');expect(patch.character.chromeCustomCss).toContain('avatar-wrap::after');
 expect(patch.character.chatDecorationCssIsolated).toBeUndefined();
 expect(()=>checkWorkshopCss('psyche','.sully-chat-header{color:red}')).toThrow();
 expect(()=>checkWorkshopCss('psyche','.sully-psyche-card{color:red}')).not.toThrow();
});

it('keeps legacy whitebox CSS unchanged while specialized makers remain scoped',()=>{
 const css=String.raw`/* 旧版白框 */
.flex.justify-center.my-6.px-10.w-full { color: purple; }
.fixed.inset-0.bg-slate-900\/45 { background: #3338; }
:root { --old-accent: purple; }
@media (max-width: 600px) { .flex.items-center { padding: 5px; } }
.sully-chat-message:is(.user, .assistant)::after { content: "}"; }
@keyframes old-pulse { from { opacity: 0; } to { opacity: 1; } }`;
 expect(checkWorkshopCss('whitebox',css)).toBe(css);
 expect(()=>checkWorkshopCss('bubbles',css)).toThrow();
 expect(()=>checkWorkshopCss('psyche','.sully-psyche-card:is(.a, .b)::after {content:"}"}')).not.toThrow();
 expect(()=>checkWorkshopCss('whitebox','.flex {color:red')).toThrow('未闭合');
});

it('summarizes repeated validation problems instead of flooding the editor',()=>{
 const css=Array.from({length:30},(_,i)=>`.outside-${i}{color:red}`).join('\n');
 try{checkWorkshopCss('avatar',css);throw Error('expected rejection');}catch(e){
  expect((e as Error).message).toContain('30 处');
  expect((e as Error).message.split('超出限定范围')).toHaveLength(4);
  expect((e as Error).message).toContain('其余提示已收起');
 }
});
it('shows an empty avatar editor without saving the preview fallback',()=>{
 const empty=projectWorkshopPreset(makeWorkshopPreset('avatar'),'avatar');
 expect(empty.parts).toEqual({});
 expect(()=>validateDecoration(workshopPreview(empty,'avatar'))).not.toThrow();
 expect(empty.parts).toEqual({});
});
it('previews every empty standalone maker without writing invented content into its preset',()=>{
 for(const category of ['whitebox','avatar','background','psyche','sound','bubbles','collaboration','date','story','schedule','journal'] as const){
  const preset=projectWorkshopPreset(makeWorkshopPreset(category),category),before=JSON.stringify(preset);
  expect(()=>validateDecoration(workshopPreview(preset,category))).not.toThrow();
  expect(JSON.stringify(preset)).toBe(before);
 }
});
it('preserves existing image avatar frames and previews them on the current outfit',()=>{
 const current=makeWorkshopPreset('whitebox');current.parts.bubbles=structuredClone(PRESET_THEMES.default);
 current.parts.bubbles.ai.avatarDecoration='data:image/png;base64,AA==';current.parts.bubbles.ai.avatarDecorationScale=1.2;
 current.parts.css='.sully-chat-header{color:red}';current.parts.background={image:null,style:'plain'};
 const isolated=projectWorkshopPreset(current,'avatar');
 expect(isolated.parts.bubbles?.ai.avatarDecoration).toBe('data:image/png;base64,AA==');
 expect(isolated.parts.css).toBeUndefined();
 const preview=workshopPreview(isolated,'avatar',current);
 expect(preview.parts.css).toContain('color:red');expect(preview.parts.background).toEqual(current.parts.background);
 current.parts.bubbles.user.backgroundColor='#123456';
 expect(workshopPreview(isolated,'avatar',current).parts.bubbles?.user.backgroundColor).toBe('#123456');
 expect(isolated.parts.background).toBeUndefined();
});
