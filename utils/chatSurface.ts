import type {CSSProperties} from 'react';
import type {OSTheme} from '../types';

/** Base surface shared by the live conversation and appearance preview. */
export function chatSurface(theme:Pick<OSTheme,'chatChromeStyle'|'chatBackgroundStyle'>,image?:string|null):{className:string;style:CSSProperties}{
 const chrome=theme.chatChromeStyle||'soft';
 const style:CSSProperties={};
 if(image)Object.assign(style,{backgroundImage:`url(${JSON.stringify(image)})`,backgroundSize:'cover',backgroundPosition:'center'});
 else if(theme.chatBackgroundStyle==='grid')Object.assign(style,{backgroundColor:chrome==='pixel'?'#efe1cf':'#f8fafc',backgroundImage:'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',backgroundSize:'20px 20px'});
 else if(theme.chatBackgroundStyle==='paper')Object.assign(style,{backgroundColor:chrome==='pixel'?'#f4e8d9':'#f9f7f2',backgroundImage:'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.12) 1px, transparent 0)',backgroundSize:'16px 16px'});
 else if(theme.chatBackgroundStyle==='mesh')Object.assign(style,{backgroundColor:'#f8fafc',backgroundImage:'radial-gradient(circle at 15% 20%, rgba(59,130,246,0.18), transparent 28%), radial-gradient(circle at 85% 15%, rgba(244,114,182,0.18), transparent 24%), radial-gradient(circle at 60% 75%, rgba(45,212,191,0.18), transparent 26%)'});
 else style.backgroundImage='none';
 const backgroundClass=chrome==='pixel'?'bg-[#efe1cf]':chrome==='flat'?'bg-white':chrome==='floating'?'bg-[#eef2ff]':'bg-[#f1f5f9]';
 return {className:`flex flex-col h-full ${backgroundClass} overflow-hidden relative font-sans transition-[background-image,background-color] duration-500`,style};
}
