import React, { useEffect, useState } from 'react';
import { DB } from '../../utils/db';

// 六改-3（2026-09-15 晚）：从 SocialApp.tsx 原样抽出、零逻辑改动——
// SocialApp（Spark 界面）与 MessageItem（聊天 social_card 卡片）共用，
// 避免聊天侧反向 import SocialApp 大组件。

// Convert a twemoji codepoint string (eg "1f388", "1f3d6-fe0f") to the actual emoji character.
// Falls back to the input if conversion fails, or to ✨ if input itself looks broken.
export const codepointToEmoji = (code: string): string => {
    if (!code) return '✨';
    // If it already contains non-hex (likely already a real emoji char), return as-is.
    if (!/^[0-9a-fA-F-]+$/.test(code)) return code;
    try {
        const points = code.split('-').map(c => parseInt(c, 16)).filter(n => Number.isFinite(n));
        if (points.length === 0) return '✨';
        return String.fromCodePoint(...points);
    } catch {
        return '✨';
    }
};

// 五修-5：Spark 用户帖图片——按 assetId 从 assets 表取压缩图渲染。
// 引用取不到（换设备导入备份后缓存不存在）→ 显示占位 emoji，文字和评论不受影响。
export const SparkPostImage: React.FC<{ assetId: string; imgClassName?: string; emojiClass: string }> = ({ assetId, imgClassName, emojiClass }) => {
    const [src, setSrc] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        let alive = true;
        setLoaded(false);
        DB.getAsset(assetId).then(data => {
            if (alive) { setSrc(data); setLoaded(true); }
        }).catch(() => { if (alive) setLoaded(true); });
        return () => { alive = false; };
    }, [assetId]);
    if (src) return <img src={src} className={imgClassName} alt="" />;
    if (loaded) {
        // 缓存里没有这张图（备份互通后图片不跟随备份）：低调占位，不打扰阅读
        return <div className={`${emojiClass} opacity-30`}>🖼️</div>;
    }
    return null;
};
