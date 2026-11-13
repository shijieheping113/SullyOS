export const ATELIER_CSS_COMPONENTS=[['motion','消息动画'],['transfer','转账卡组'],['voice','语音消息']] as const;
export type AtelierCssComponent=typeof ATELIER_CSS_COMPONENTS[number][0];
export type ComposedCssComponent='avatar'|'background'|AtelierCssComponent;
export const COMPOSED_CSS_KINDS='avatar|background|motion|transfer|voice';
export const composedCssBlock=(kind:ComposedCssComponent)=>new RegExp(`/\\* sully-composer:${kind} \\*/\\n?([\\s\\S]*?)/\\* end-sully-composer:${kind} \\*/`,'g');
export function readComposedCss(css:string,kind:ComposedCssComponent){return [...css.matchAll(composedCssBlock(kind))].map(match=>match[1].trim()).join('\n');}
export function writeComposedCss(base:string,kind:ComposedCssComponent,value:string){return [base.replace(composedCssBlock(kind),'').trim(),value.trim()?`/* sully-composer:${kind} */\n${value}\n/* end-sully-composer:${kind} */`:''].filter(Boolean).join('\n');}
export function composedCssOnly(css:string){return !!css.trim()&&!css.replace(new RegExp(`/\\* sully-composer:(${COMPOSED_CSS_KINDS}) \\*/[\\s\\S]*?/\\* end-sully-composer:\\1 \\*/`,'g'),'').trim();}
export function hasFileOnlyComponents(value:unknown):boolean{
 const css=(value as {parts?:{css?:unknown}})?.parts?.css;
 return typeof css==='string'&&ATELIER_CSS_COMPONENTS.some(([kind])=>css.includes(`/* sully-composer:${kind} */`));
}
export const ATELIER_COMPONENT_PROMPTS:Record<AtelierCssComponent,string>={
 motion:'为 SullyOS 聊天消息制作出现动画。作用于 .sully-chat-message，兼顾用户与角色消息。动画使用 transform 和 opacity，提供 prefers-reduced-motion 的静止版本，保留所有消息和操作。只输出 CSS。',
 transfer:'为 SullyOS 转账卡组制作完整 CSS，包含主卡与收款回执，兼顾待接收、已接收、已退回状态。选择器使用 .sully-chat-transfer-*，保留金额、状态和操作可读可用。只输出 CSS。',
 voice:'为 SullyOS 独立语音消息制作 CSS，选择器使用 .sully-voice-bar、.sully-voice-bar-button、.sully-voice-bar-wave-segment 及相关子元素。兼顾未播放、播放、加载与字幕，保留播放操作和文字。只输出 CSS。',
};
