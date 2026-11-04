import React from 'react';
import { BUILTIN_FATE_FACTORS } from '../../utils/fateFactors';
import './FateTarotArt.css';

const categories = new Map(BUILTIN_FATE_FACTORS.map(factor => [factor.id, factor.category]));
export const FATE_ART_CATEGORIES = ['变化', '得失', '机会', '阻力', '关系', '距离', '认知', '表达', '行动', '节奏', '秩序', '身体感受', '资源', '责任', '欲望', '选择', '偶然与发现', '修复与积累', '恋爱与暧昧', '亲密与信任'] as const;
export function fateArtCategory(factor?: { id?: string; category?: string }): string {
    return factor?.category || categories.get(factor?.id || '') || '自定义';
}

/** 六种倾向共享稳定身份标记，各有独立姿态与服饰轮廓。 */
export function FatePatronArt({ tendencyId }: { tendencyId?: string }) {
    const categories: Record<string, string> = { career: '秩序', relations: '关系', discovery: '认知', pleasure: '欲望', life: '修复与积累', chance: '偶然与发现' };
    const kind = tendencyId || 'custom';
    const objects: Record<string, React.ReactNode> = {
        career: <><path d="M32 78c8-3 14-3 20 0v16c-7-3-13-3-20 0V78Zm20 0c8-3 14-3 20 0v16c-7-3-13-3-20 0M52 78v16"/><path d="M52 10v9m-4-4h8M33 20l5 6 14-12 14 12 5-6"/></>,
        relations: <><path d="M52 94C23 76 39 64 52 77c13-13 29-1 0 17Z"/><path d="M24 29c-6-10 2-17 9-9m47 9c6-10-2-17-9-9M23 27l8 8m50-8-8 8"/></>,
        discovery: <><path d="M31 83c13-15 29-15 42 0-13 15-29 15-42 0Z"/><circle cx="52" cy="83" r="7"/><path d="M52 10v10m-5-5h10M32 21l-4-5m44 5 4-5"/></>,
        pleasure: <><path d="M52 95c-17-2-18-14-10-23 0 8 7 7 10 13 7-9 1-12 2-18 12 13 17 26-2 28Z"/><path d="M29 24c6-13 15-7 23-14 8 7 17 1 23 14M30 23l7 7m37-7-7 7"/></>,
        life: <><path d="M52 95V72m0 12c-15 0-20-11-17-16 11 0 19 5 17 16Zm0 6c14-1 19-10 16-16-11 0-17 6-16 16Z"/><path d="M37 23c-7-6-4-12 0-15m30 15c7-6 4-12 0-15M43 17l9-9 9 9"/></>,
        chance: <><path d="m39 72 23-3 8 21-24 5-7-23Zm0 0 8 8 23 10m-23-10-1 15m1-15 15-11"/><circle cx="52" cy="86" r="1.5"/><circle cx="60" cy="80" r="1.5"/><path d="M38 15c4 7 9 6 14 0 5 6 10 7 14 0M29 22l8 7m38-7-8 7"/></>,
    };
    const figures: Record<string, React.ReactNode> = {
        career: <><path d="M37 34c0-16 30-16 30 0v15c0 9-7 16-15 16s-15-7-15-16V34Zm0 3h30M42 46h5m10 0h5m-10 4v6h4m-9 4h10M43 63v6l9 9 9-9v-6M43 67 27 73l-6 30c20 8 42 8 62 0l-6-30-16-6M43 69l-7 9-3 20m28-29 7 9 3 20M27 77l4 20m46-20-4 20M33 100l10-3m28 3-10-3"/><path d="M23 75V61h10m48 14V61H71M23 102v7m58-7v7"/></>,
        relations: <><path d="M33 58c-12-18-3-34 16-34 18 0 29 14 22 31-5 12 8 12 3 22M35 41c-6 20-17 17-12 33m41-36c0 15-4 25-15 25-10 0-16-9-16-19m0-2c11-1 20-7 24-13 0 8 4 12 10 13M39 47l5 2m11-2 5-1M46 55c3 3 6 3 9 0M43 62v6m13-7 3 7M43 67c-14 4-18 18-20 36 18 6 40 7 60-1-3-18-8-31-24-35M43 68l9 10 7-10M31 83l9 11m33-11-9 11M37 99l8-5m23 5-9-5"/><path d="M23 40c-5 3-6 8-3 13m56-21c8 1 12 6 10 12M26 102l7-8m42 8-5-7"/></>,
        discovery: <><path d="M36 58V39c0-20 29-22 33-1l-3 22M38 41l6-12c4 6 10 7 20 7M40 39v12c0 9 6 15 13 15 8 0 13-7 13-16V38M44 46h4m9 0h4M52 49l-2 6 5 1m-6 5h8M45 65l-7 6 15 15 13-15-7-7M38 71l-14 8-5 25 22 4h26l18-5-7-25-12-7M39 74l-5 10 8 5-3 18m26-33 5 10-8 5 3 18M53 86v18M27 85l3 16 11-4m35-12-3 16-11-4"/></>,
        pleasure: <><path d="M32 63c-13-13-7-35 12-37 12-7 27 2 28 14 15 10 3 22 11 30M36 37c7 4 16-2 22-8 0 8 6 12 11 13M38 40c-2 12 2 23 12 24 9 1 15-7 16-18M41 46l5 2m10-1 5-3m-13 12 8 1M45 64l-4 8m15-8 7 8M41 71c-12 4-17 17-23 31 20-2 40 9 69 2-11-11-14-27-24-32M33 77c3 11 8 18 11 24m22-25c-2 10-3 18-6 26M27 86l10 9m39-10-12 12"/><path d="M29 43c-7 9 6 15 1 23m43-21c8 7-2 14 6 21M20 107l8-2m50 3 9-4"/></>,
        life: <><path d="M38 35c-10-17 22-24 26-7M34 43c-2-24 35-25 34 1M36 39c8-1 16-5 21-10 1 7 4 10 9 12M37 43v8c0 9 6 16 14 16 9 0 14-8 14-17v-8M42 48h5m10 0h4m-10 5 4 3m-9 4c3 2 7 2 10 0M44 66l-7 7m21-8 8 9M37 72c-11 7-13 19-16 29l18 7h35l12-8c-5-14-10-23-20-27M38 75l6 18m20-17-6 17M28 85l10 13 11-3m27-10L64 99l-8-4M37 73c10 9 21 9 29 0M30 104l12-4m32 4-12-3"/></>,
        chance: <><path d="M29 40c2-15 17-24 30-18l16 18-12-4M29 40l11-7 23 3M39 36v16c0 9 5 14 13 14 7 0 12-6 12-15V37M43 46h5m9-2 4 2m-10 5 4 4m-9 4 9 1M43 66 31 72l-13 29 16 5 7-15m19-26 13 8 15 26-17 7-7-14M31 73l22 18 20-18M41 83l-6 23m27-22 7 22M38 71l-7 14 12 4m19-18 9 14-9 4"/><path d="M77 49l7-5 5 4-5 48M79 98l8 3M29 31l-7 5m51-11 6-6"/></>,
    };
    return <svg className="fate-patron-art" viewBox="0 0 104 112" fill="none" aria-hidden="true" data-fate-art={categories[kind] || '自定义'} data-fate-patron={kind}>
        <circle cx="52" cy="43" r="33" className="fate-patron-art__halo"/><circle cx="52" cy="43" r="28" className="fate-patron-art__halo"/>
        {figures[kind] || figures.chance}
        {objects[kind] || <><path d="m52 73 4 8 9 2-7 7 1 9-7-4-7 4 1-9-7-7 9-2 4-8ZM52 9v10m-5-5h10"/></>}
        <path d="M14 49v8m-4-4h8m72-19v8m-4-4h8M30 107h14m16 0h14m-25 0 3-3 3 3-3 3-3-3Z"/>
    </svg>;
}

/** 一类一幅寓意画；旧记录仅有id时也使用相同的画，不改变记录内容。 */
export default function FateTarotArt({ factor, category, className = '' }: { factor?: { id?: string; category?: string }; category?: string; className?: string }) {
    const kind = category || fateArtCategory(factor);
    const pictures: Record<string, React.ReactNode> = {
        '变化': <><path d="M42 70C18 47 22 28 35 34c4 2 6 8 7 12 2-12 10-19 17-14 10 8 0 25-17 38ZM42 43v29M24 28l-4-6m40 6 4-6"/><path d="M26 48c6 0 11 6 16 12m16-12c-6 0-11 6-16 12M34 77h16"/></>,
        '得失': <><path d="M42 26v49m-18 1h36M18 39h48M22 39 12 59h20L22 39Zm40 0L52 59h20L62 39ZM12 59c3 10 17 10 20 0m20 0c3 10 17 10 20 0"/><circle cx="42" cy="28" r="5"/><path d="m36 20 6-6 6 6"/></>,
        '机会': <><path d="M23 75V38c0-24 38-24 38 0v37M31 75V39c0-16 22-16 22 0v36M42 74V40l11-4M18 77h48"/><circle cx="47" cy="57" r="1.5"/><path d="m66 25 2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM13 44h5m-2-3v6"/></>,
        '阻力': <><path d="m15 72 17-33 13 23 10-15 16 25H15ZM32 39l5-12 8 15M26 49l6 7 5-7M20 79h45"/><path d="M24 26c-4-10 11-14 15-7 12-5 20 1 18 7H24Z"/></>,
        '关系': <><path d="M19 55c-11-18 7-31 22-14 16-18 35-3 22 15M21 60l12 9 9-7 9 7 14-10M14 64l11 10 9-5m36-5L59 76l-8-7M29 54l13-9 14 10-14 7-9-3"/><path d="M42 21v8m-4-4h8M17 35l-5-4m55 4 5-4M29 81h26"/></>,
        '距离': <><path d="M10 74c4-21 15-27 24-24m16 0c11-3 21 8 24 24M12 78h21m18 0h21M31 45c9-17 17-17 25 0"/><circle cx="24" cy="35" r="6"/><circle cx="62" cy="35" r="6"/><path d="M39 57h7m-3-4v8M32 24l-3-3m23 3 3-3"/></>,
        '认知': <><path d="M11 49c18-25 44-25 62 0-18 25-44 25-62 0Z"/><circle cx="42" cy="49" r="13"/><circle cx="42" cy="49" r="5"/><path d="M42 16v9m-18 1-5-7m41 7 5-7M25 76h34m-25 5h16"/></>,
        '表达': <><path d="M26 72c-7-26 11-40 34-45 1 23-9 39-32 43m0 0 25-34M37 58l-3-13m8 7 13 1M23 76c15 7 24-6 39 0"/><path d="M18 41v8m-4-4h8m41-24 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/></>,
        '行动': <><path d="m26 73 8-15 15-31 13 5-11 35-15 10-10-4Zm8-15 17 9M49 27l6-11 12 5-5 11M36 77l-3 6m18-16 4 11M23 53l-7 3m8-15-9-3"/><circle cx="48" cy="46" r="5"/></>,
        '节奏': <><path d="M23 23h38M23 76h38M28 24c0 19 3 20 14 26-11 6-14 11-14 25m28-51c0 19-3 20-14 26 11 6 14 11 14 25M32 69l10-9 10 9H32Z"/><path d="M34 34h16l-8 10-8-10ZM15 46v8m-4-4h8m48 0h5"/></>,
        '秩序': <><path d="M19 75h47M23 68h39M27 66V36m9 30V36m12 30V36m10 30V36M21 35h43L42 21 21 35Zm0 0v5h43v-5M42 13v-5m-4 4h8"/></>,
        '身体感受': <><path d="M19 66c-8-13-3-30 6-32 4-1 7 2 7 7V28c0-7 8-7 8 0v10-16c0-7 8-7 8 0v16-12c0-7 8-7 8 0v23c6-6 14-1 9 6L52 75H28L19 66Z"/><path d="m34 52 5 4 9-9M29 81h24"/></>,
        '资源': <><path d="M24 36h37l-5 39H29L24 36Zm5 0c-3-10 1-17 8-18m12 18c-1-12 3-17 10-20M35 36c-1-12 2-16 7-18"/><path d="m27 46 31 20m-29-5 30-16M21 79h43"/></>,
        '责任': <><path d="M42 24c9 8 17 9 25 10v20c0 13-12 23-25 28-14-5-25-15-25-28V34c10-1 18-4 25-10Z"/><path d="m30 52 8 8 17-20M42 14V7m-3 4h6"/></>,
        '欲望': <><path d="M42 19c4 17 25 23 23 39-2 23-43 25-46 2-2-13 7-20 12-26-1 15 9 15 11 23 7-12-3-17 0-38Z"/><path d="M42 59c10 9 8 17 0 18-10-2-10-9 0-18ZM20 81h44"/></>,
        '选择': <><path d="M42 78V53c0-12-12-14-20-25m20 24c0-13 12-14 20-24M17 35l4-12 13 2m16 0 13-2 4 12M35 78h14"/><circle cx="42" cy="24" r="3"/><path d="M42 9v5m-3-2h6"/></>,
        '偶然与发现': <><circle cx="38" cy="44" r="21"/><circle cx="38" cy="44" r="15"/><path d="m54 60 15 16-6 5-15-16M24 42l8 4 6-14 7 15 8-5M16 20h7m-3-4v8M63 26v7m-4-3h8"/></>,
        '修复与积累': <><path d="M42 78V39m0 14C23 51 21 40 24 33c14 0 21 7 18 20Zm0 12c17-1 23-12 20-19-12-1-22 8-20 19ZM20 80h44M35 30l7-13 7 13-7 8-7-8Z"/><path d="M14 55v8m-4-4h8m47-29h6"/></>,
        '恋爱与暧昧': <><path d="M42 66C10 48 20 25 34 33l8 7 8-7c15-8 24 15-8 33Z"/><path d="M24 69c-6 10 25 13 39-2M18 43l-6-3m54 3 6-3M42 18v7m-4-3h8"/><circle cx="59" cy="21" r="2"/></>,
        '亲密与信任': <><path d="M31 41v-9c0-18 24-18 24 0v9M25 41h36v30c-8 9-28 9-36 0V41Z"/><path d="M45 58v8"/><circle cx="45" cy="54" r="4"/><path d="m15 34 2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM66 25v8m-4-4h8M27 82h32"/></>,
    };
    return <svg className={`fate-tarot-art ${className}`} viewBox="0 0 84 96" fill="none" aria-hidden="true" data-fate-art={kind}>
        <path className="fate-tarot-art__arch" d="M8 85V42a34 34 0 0 1 68 0v43M12 85V42a30 30 0 0 1 60 0v43" />
        {pictures[kind] || <><circle cx="42" cy="48" r="22"/><path d="m42 24 6 18 18 6-18 6-6 18-6-18-18-6 18-6 6-18ZM24 80h36"/></>}
        <path className="fate-tarot-art__base" d="M8 89h24m20 0h24m-38 0 4-4 4 4-4 4-4-4Z" />
    </svg>;
}

export function FateAstrolabe() {
    return <svg className="fate-astrolabe" viewBox="0 0 240 240" fill="none" aria-hidden="true">
        <circle cx="120" cy="120" r="103"/><circle cx="120" cy="120" r="96"/><circle cx="120" cy="120" r="73"/><circle cx="120" cy="120" r="53"/>
        {Array.from({ length: 12 }, (_, index) => <g key={index} transform={`rotate(${index * 30} 120 120)`}><path d="M120 17v30M120 47v12"/><circle cx="120" cy="35" r="2"/></g>)}
        <path d="m120 43 67 116H53l67-116Zm0 154L53 81h134l-67 116Z" opacity=".35"/>
        <path d="M135 87c-30 6-36 49-4 65-46 7-58-53-20-66 8-3 16-2 24 1Z"/>
        <path d="m145 106 3 9 9 3-9 3-3 9-3-9-9-3 9-3ZM157 83v8m-4-4h8M92 158v7m-3-4h6"/>
    </svg>;
}
