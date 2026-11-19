import React,{useEffect,useState} from 'react';
import {loadBlobRefUrl} from '../../../utils/blobRefSessionCache';
import {resolveBuiltinRoomAssetUrl} from '../../../utils/roomTemplateAssets';

export default function DecorationWallpaperPreview({image}:{image:string|null|undefined}) {
    const [local,setLocal]=useState<{ref:string;url?:string}>();
    const [failed,setFailed]=useState<string>();
    const token=image?.startsWith('blobref:')?image:undefined;
    useEffect(()=>{
        if(!token)return;
        let alive=true;
        void loadBlobRefUrl(token).then(url=>{if(alive)setLocal({ref:token,url});});
        return()=>{alive=false;};
    },[token]);
    if(!image)return <p className="atelier-wallpaper-preview">当前没有图片壁纸。自定义背景 CSS 可在聊天预览查看。</p>;
    if(token&&local?.ref!==token)return <p className="atelier-wallpaper-preview" role="status">正在读取壁纸…</p>;
    const url=token?local?.url:resolveBuiltinRoomAssetUrl(image);
    if(!url||failed===url)return <p className="atelier-wallpaper-preview" role="status">壁纸读不到，可以重新选择图片。</p>;
    return <figure className="atelier-wallpaper-preview">
        <img src={url} alt="当前壁纸原图" decoding="async" onError={()=>setFailed(url)}/>
        <figcaption>当前壁纸 · 聊天效果见预览</figcaption>
    </figure>;
}
