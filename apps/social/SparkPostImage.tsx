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
    if (!/^[0-9a-fA-F-]+$/.test(code)) {
        // 真 emoji 字符直通；混着 ASCII 字母/数字的垃圾串（如 "OPCOR"）→ 兜底 ✨
        return /[0-9A-Za-z]/.test(code) ? '✨' : code;
    }
    try {
        const points = code.split('-').map(c => parseInt(c, 16)).filter(n => Number.isFinite(n));
        if (points.length === 0) return '✨';
        return String.fromCodePoint(...points);
    } catch {
        return '✨';
    }
};

/** 关注发帖封面贴纸：跟 Spark 发帖面板同一套，AI 从这里面选一个 */
export const SPARK_STICKER_CHARS = ['✨', '🎈', '🎨', '📷', '🎵', '🎮', '🍔', '🏖️', '💤', '💡'] as const;

const SPARK_POST_BGS = [
    'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 99%, #FECFEF 100%)',
    'linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)',
    'linear-gradient(to top, #fff1eb 0%, #ace0f9 100%)',
    'linear-gradient(to top, #30cfd0 0%, #330867 100%)',
    'linear-gradient(to top, #f43b47 0%, #453a94 100%)',
    'linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)',
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
];

export function pickSparkPostBg(): string {
    return SPARK_POST_BGS[Math.floor(Math.random() * SPARK_POST_BGS.length)];
}

/** 把模型写的封面收成贴纸字符；不在名单里就 ✨ */
export function normalizeSparkSticker(raw: string): string {
    const token = (raw || '').trim();
    if (!token) return '✨';
    const asEmoji = codepointToEmoji(token);
    return (SPARK_STICKER_CHARS as readonly string[]).includes(asEmoji) ? asEmoji : '✨';
}

/** 发现页推荐流封面：模型自选任意 emoji，不锁发帖面板那 10 个；空/垃圾串/说明文字 → ✨ */
export function pickSparkFeedEmoji(raw: unknown): string {
    const tokens = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    for (const t of tokens) {
        const s = String(t ?? '').trim();
        if (!s) continue;
        // 模型把说明句子抄进字段：太长就不是封面（真 emoji / ZWJ 组合一般很短）
        if (Array.from(s).length > 12) continue;
        const asEmoji = codepointToEmoji(s);
        if (asEmoji && asEmoji !== '✨') return asEmoji;
        if (s === '✨' || s.toLowerCase() === '2728') return '✨';
    }
    return '✨';
}

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
