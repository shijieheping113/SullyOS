/** A contained preview uses its own visible surface, not the surrounding editor's screen. */
export function fitChatPreviewViewport(css:string,width:number,height:number):string{
 return css.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\((?:\\.|[^)])*\)|(-?(?:\d*\.)?\d+)(dvw|svw|lvw|vw|dvh|svh|lvh|vh|vmin|vmax)\b/gi,(token,value,unit)=>{
  if(value===undefined)return token;
  const size=unit.toLowerCase();
  const basis=size==='vmin'?Math.min(width,height):size==='vmax'?Math.max(width,height):size.endsWith('vw')?width:height;
  return `${Math.round(Number(value)*basis*1000/100)/1000}px`;
 });
}
