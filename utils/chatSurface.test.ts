import {describe,expect,it} from 'vitest';
import {chatSurface} from './chatSurface';

describe('shared live and preview chat surface',()=>{
 it('keeps plain background in a class so existing decoration CSS can override it',()=>{
  expect(chatSurface({})).toEqual({className:expect.stringContaining('bg-[#f1f5f9]'),style:{backgroundImage:'none'}});
  expect(chatSurface({chatChromeStyle:'flat'}).className).toContain('bg-white');
  expect(chatSurface({chatChromeStyle:'floating'}).className).toContain('bg-[#eef2ff]');
 });
 it('retains grid, paper and mesh backgrounds from the live conversation',()=>{
  expect(chatSurface({chatChromeStyle:'pixel',chatBackgroundStyle:'grid'}).style).toMatchObject({backgroundColor:'#efe1cf',backgroundSize:'20px 20px'});
  expect(chatSurface({chatBackgroundStyle:'paper'}).style).toMatchObject({backgroundColor:'#f9f7f2',backgroundSize:'16px 16px'});
  expect(chatSurface({chatBackgroundStyle:'mesh'}).style.backgroundImage).toContain('rgba(45,212,191,0.18)');
 });
 it('gives a configured image priority over a pattern',()=>{
  expect(chatSurface({chatBackgroundStyle:'grid'},'data:image/png;base64,abc').style).toEqual({backgroundImage:'url("data:image/png;base64,abc")',backgroundSize:'cover',backgroundPosition:'center'});
 });
});
