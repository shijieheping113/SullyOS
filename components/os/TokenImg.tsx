import React from 'react';
import { useBlobRefUrl } from '../../utils/blobRef';

/**
 * 图片改存 Blob 后的通用渲染组件（见 utils/blobRef.ts）。
 * 把「blobref 令牌 / 旧 data: / http(s)」统一解析成可直接用的 url 再喂给 <img>，
 * 令牌解析出的 objectURL 会在卸载 / value 变化时自动回收，不泄漏。
 * 非令牌值原样透传，行为与普通 <img> 一致。
 * 令牌尚未解析完时不挂空 src 的 <img>（避免浏览器破图图标），改用同 class/style 占位。
 */
const TokenImg: React.FC<{ value?: string | null } & React.ImgHTMLAttributes<HTMLImageElement>> = ({
    value,
    className,
    style,
    alt,
    ...rest
}) => {
    const src = useBlobRefUrl(value ?? undefined);
    if (!src) {
        return (
            <span
                className={className}
                style={style}
                role={alt ? 'img' : undefined}
                aria-label={alt || undefined}
                aria-hidden={alt ? undefined : true}
            />
        );
    }
    return <img src={src} className={className} style={style} alt={alt} {...rest} />;
};

export default TokenImg;
