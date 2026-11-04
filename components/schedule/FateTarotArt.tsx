import React from 'react';
import { BUILTIN_FATE_FACTORS } from '../../utils/fateFactors';
import './FateTarotArt.css';

const categories = new Map(BUILTIN_FATE_FACTORS.map(factor => [factor.id, factor.category]));
export const FATE_ART_CATEGORIES = ['变化', '得失', '机会', '阻力', '关系', '距离', '认知', '表达', '行动', '节奏', '秩序', '身体感受', '资源', '责任', '欲望', '选择', '偶然与发现', '修复与积累', '恋爱与暧昧', '亲密与信任'] as const;
export function fateArtCategory(factor?: { id?: string; category?: string }): string {
    return factor?.category || categories.get(factor?.id || '') || '自定义';
}

/** 六种倾向以各自生命形态和轮廓区分，共用粉色细线与星环。 */
export function FatePatronArt({ tendencyId }: { tendencyId?: string }) {
    const categories: Record<string, string> = { career: '秩序', relations: '关系', discovery: '认知', pleasure: '欲望', life: '修复与积累', chance: '偶然与发现' };
    const kind = tendencyId || 'custom';
    const figures: Record<string, React.ReactNode> = {
        career: <><path d="m31 37-3-17 17 10h14l17-10-3 17c7 16 5 36-7 49H38c-13-13-14-33-7-49ZM31 40l20 8 22-8M51 48v12l-5-6 5-6 6 6-6 6M36 63l-14 19 16-6m30-13 14 19-16-6M39 86v9m9-9v9m9-9v9m9-9v9M32 97h41"/><circle cx="40" cy="46" r="8"/><circle cx="63" cy="46" r="8"/><circle cx="40" cy="46" r="2" fill="currentColor"/><circle cx="63" cy="46" r="2" fill="currentColor"/><circle cx="52" cy="72" r="9"/><path d="M52 65v7l5 3m-22-4-4-9m39 9 4-9M43 17l9-9 9 9M52 5v7"/></>,
        relations: <><path d="M51 38c-6-19-25-20-28-4-2 9 7 13 13 18 12 11 7 22-8 22-6 0-12-3-16-7 2 19 19 29 36 16m5-45c6-19 25-20 28-4 2 9-7 13-13 18-12 11-7 22 8 22 6 0 12-3 16-7-2 19-19 29-36 16M50 39l-6 5 7 2m3-7 6 5-7 2M31 34h1m40 0h1M23 78c8 0 14 1 20 6m38-6c-8 0-14 1-20 6"/><path d="M52 89C31 71 25 51 36 48m16 41c21-18 27-38 16-41M26 99c12-5 40-5 52 0M36 104h32M52 17v8m-4-4h8"/></>,
        discovery: <><path d="M36 59c-3-15 3-30 16-37 15 7 20 24 16 38M37 43c10-15 20-15 30 0M41 42l-1 14 11 10 12-10V42M44 47h5m8 0h4m-11 5 3 3M36 60 25 71l-8 32c18 5 42 6 60 0L66 70 62 60M36 66l16 10 11-12M52 76l-7 26M30 78l-4 21m39-22 5 22M72 39l6-8 6 8v13H72V39Zm6-8V21m-4 18h8m-4 1v8M78 52v14M84 25l9-4m-1 10 5 2"/><path d="M26 106h54m-55-9 11-8M78 66l-8 5"/></>,
        pleasure: <><path d="M27 57 23 31l19 15c7-3 15-3 22 0l17-15-4 28-24 17-26-19ZM31 41l6 7m35-7-5 7M35 56l9 3m18 0 8-4m-20 11h6l-3 4-3-4ZM39 70c-11 5-12 20-2 28 8 7 25 3 30-4M61 74c18-7 23-19 31-25 4 20-4 35-25 39m-2-6c17 1 26 8 28 18-18 5-26-1-29-8m-1-4c3 12-1 18-13 20-2-7 0-12 5-16M37 98l8-17m13 17-3-17M42 24l10-9 10 9M52 8v5M17 79l-4 5m6 5-5 2"/></>,
        life: <><path d="M22 80c5-24 48-24 58 0H22Zm2 0c0 9 9 15 25 15 17 0 29-5 29-15M78 78c8-10 18-8 18 1 0 6-7 9-15 7M27 90l-7 7h13l5-3m23 0 5 3h13l-7-7M22 81l-9 4 10 3M33 71l7 9-3 10m15-24-1 14 7 13m9-23-5 10 8 9M40 80h22M50 66V37m0 16c-19-1-26-13-22-23 15 0 24 10 22 23Zm1-8c18 0 25-12 21-21-15 0-23 9-21 21ZM49 39c-11-9-10-19 0-28 10 10 11 20 0 28ZM85 79h1M28 103h49"/></>,
        chance: <><ellipse cx="52" cy="58" rx="38" ry="16" transform="rotate(-35 52 58)"/><path d="M24 49c-1-21 25-31 44-17-24-4-26 18-12 21 14 4 18-10 30-6-4 14-13 29-30 30-24 3-34-10-40-6l10-15-2-7ZM68 32l15-9-3 17M31 50l-8-12M61 74l5 11 9-15M46 46c-7 2-8 9-3 14m5-28 2 7m-17 2 5 5"/><circle cx="67" cy="56" r="2" fill="currentColor"/><path d="m35 88 16-7 14 10-16 11-14-14Zm0 0 14 4 16-1m-16 1v10M52 10v10m-5-5h10M84 83l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/></>,
    };
    return <svg className="fate-patron-art" viewBox="0 0 104 112" fill="none" aria-hidden="true" data-fate-art={categories[kind] || '自定义'} data-fate-patron={kind}>
        <circle cx="52" cy="43" r="33" className="fate-patron-art__halo"/><circle cx="52" cy="43" r="28" className="fate-patron-art__halo"/>
        {figures[kind] || figures.chance}
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
