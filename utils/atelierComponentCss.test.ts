import {expect,it} from 'vitest';
import {readComposedCss,writeComposedCss,composedCssOnly,hasFileOnlyComponents} from './atelierComponentCss';
import {decorationPatches} from './chatDecoration';
import {decorationCategories,decorationContents} from './beautyCategories';
import {resetChatDecoration} from './decorationReset';
import {createWardrobeUsageReader} from './wardrobeUsage';
it('replaces one marked component while preserving unrelated CSS and other components',()=>{
 const base=writeComposedCss('.sully-chat-header{color:red}','voice','.sully-voice-bar{color:blue}');
 const next=writeComposedCss(base,'transfer','.sully-chat-transfer-card{color:green}');
 expect(readComposedCss(next,'voice')).toBe('.sully-voice-bar{color:blue}');expect(next).toContain('.sully-chat-header{color:red}');expect(composedCssOnly(next)).toBe(false);expect(composedCssOnly(writeComposedCss('','voice','a{color:red}'))).toBe(true);
});
it('classifies marked components, restricts cloud submission and resets just the selected part',()=>{
 const css=writeComposedCss(writeComposedCss('','voice','.sully-voice-bar{color:blue}'),'transfer','.sully-chat-transfer-card{color:green}');
 const preset={format:'sullyos-chat-decoration' as const,version:1 as const,name:'组件',parts:{css}};
 expect(decorationCategories(preset)).toEqual(['chat','transfer','voice']);
 expect(decorationContents(preset)).toBe('转账卡组 · 语音消息');
 expect(hasFileOnlyComponents(preset)).toBe(true);expect(hasFileOnlyComponents({parts:{css:'.sully-chat-header{color:red}'}})).toBe(false);
 const result=resetChatDecoration('transfer',{chromeCustomCss:css} as any,{} as any,{} as any);
 expect(readComposedCss(result.character.chromeCustomCss||'','transfer')).toBe('');expect(readComposedCss(result.character.chromeCustomCss||'','voice')).toContain('color:blue');
});
it('applies standalone transfer appearance without discarding whitebox, background or voice',async()=>{
 const old=writeComposedCss(writeComposedCss('.sully-chat-header{color:red}','background','.sully-chat-root{background:pink}'),'voice','.sully-voice-bar{color:blue}');
 const preset={format:'sullyos-chat-decoration' as const,version:1 as const,name:'转账',parts:{css:writeComposedCss('','transfer','.sully-chat-transfer-card{color:green}')}};
 const result=await decorationPatches(preset,['css'],'character',{id:'a',chromeCustomCss:old} as any,{} as any);
 expect(result.character.chromeCustomCss).toContain('.sully-chat-header{color:red}');expect(result.character.chromeCustomCss).toContain('background:pink');expect(result.character.chromeCustomCss).toContain('color:blue');expect(result.character.chromeCustomCss).toContain('color:green');expect(result.character.chatDecorationCssIsolated).toBeUndefined();
});
it('reports standalone component use while unrelated whitebox styles remain installed',async()=>{
 const part=writeComposedCss('','transfer','.sully-chat-transfer-card{color:green}');
 const read=createWardrobeUsageReader({} as any,{chromeCustomCss:'.sully-chat-header{color:red}\n'+part} as any,{user:{},ai:{}} as any,{});
 expect(await read({format:'sullyos-chat-decoration',parts:{css:part}})).toBe('当前使用中');
});
