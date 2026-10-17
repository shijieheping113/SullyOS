import React, { useState } from 'react';
import { cleanFeedText, personLabelShort, type XSocialCardData } from '../../utils/xJpPack';

/** 转帖、引用、喜欢、回复、浏览量同一套：满一千就写成 K，不再换别的单位。 */
const compactCount = (raw: string): string => {
    const n = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return Number.isFinite(n) ? '' : raw;
    if (n < 1000) return String(Math.round(n));
    const value = n / 1000;
    const text = value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
    return `${text}K`;
};

const rawStatNumber = (line: string, labels: string[]): number => {
    for (const label of labels) {
        const hit = line.match(new RegExp(`${label}\\s*([\\d,]+)`));
        if (hit) {
            const n = Number(String(hit[1]).replace(/,/g, ''));
            if (Number.isFinite(n)) return n;
        }
    }
    return 0;
};

const stat = (line: string, labels: string[]): string => {
    for (const label of labels) {
        const hit = line.match(new RegExp(`${label}\\s*([\\d,]+)`));
        if (hit) return compactCount(hit[1]);
    }
    return '';
};

const Face: React.FC<{ url?: string | null; label: string; size: number; wash: string; ink: string; badge?: React.ReactNode }> = ({ url, label, size, wash, ink, badge }) => {
    const [broken, setBroken] = useState(false);
    const letter = (label || '?').trim().slice(0, 1) || '?';
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            {url && !broken ? (
                <img
                    src={url}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setBroken(true)}
                    className="block rounded-full object-cover ring-1 ring-black/5"
                    style={{ width: size, height: size, minWidth: size, minHeight: size, background: wash }}
                />
            ) : (
                <div
                    className="grid place-items-center rounded-full font-bold ring-1 ring-black/5"
                    style={{ width: size, height: size, minWidth: size, minHeight: size, background: wash, color: ink, fontSize: Math.round(size * 0.4) }}
                >
                    {letter}
                </div>
            )}
            {badge}
        </div>
    );
};

const XLogo: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#0f1419' }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
        <path
            fill={color}
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.726-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        />
    </svg>
);

const ThreadsLogo: React.FC<{ size?: number; color?: string }> = ({ size = 15, color = '#000000' }) => (
    <svg viewBox="0 0 192 192" width={size} height={size} aria-hidden="true" className="shrink-0" fill={color}>
        <path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.35-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.195 47.292 9.642 32.788 28.08 19.882 44.485 13.224 67.315 13.001 95.932L13 96v.067c.224 28.617 6.882 51.447 19.788 67.854C47.292 182.358 68.882 191.805 96.957 192h.113c24.96-.173 42.554-6.708 57.048-21.19 18.963-18.944 18.392-42.691 12.142-57.27-4.484-10.454-13.033-18.945-24.723-24.552zm-43.096 40.519c-10.44.588-21.286-4.098-21.82-14.135-.397-7.442 5.296-15.746 22.461-16.735 1.966-.113 3.895-.169 5.79-.169 6.235 0 12.068.604 17.371 1.765-1.978 24.702-13.58 28.713-23.802 29.274z" />
    </svg>
);

/** X 官方互动图标 */
const ReplySvg: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
    </svg>
);

const RepostSvg: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
    </svg>
);

const HeartSvg: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
    </svg>
);

const BookmarkSvg: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z" />
    </svg>
);

const ShareSvg: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
    </svg>
);

/** X 官方浏览量图标（四柱 analytics 图标） */
const ViewsSvg: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z" />
    </svg>
);

/** Threads 专属圆润描边图标（喜欢、评论、转发、纸飞机分享） */
const ThreadsHeartSvg: React.FC<{ size?: number }> = ({ size = 15 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
);

const ThreadsCommentSvg: React.FC<{ size?: number }> = ({ size = 15 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" />
    </svg>
);

const ThreadsRepostSvg: React.FC<{ size?: number }> = ({ size = 15 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
);

const ThreadsSendSvg: React.FC<{ size?: number }> = ({ size = 15 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const ActionBtn: React.FC<{
    icon: React.ReactNode;
    count: string;
    baseColor: string;
    activeColor: string;
    activeBg: string;
    onClick?: (e: React.MouseEvent) => void;
    title?: string;
}> = ({ icon, count, baseColor, activeColor, activeBg, onClick, title }) => {
    const [hover, setHover] = useState(false);
    return (
        <span
            title={title}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="inline-flex items-center gap-1 select-none transition-colors"
            style={{ color: hover ? activeColor : baseColor, cursor: onClick ? 'pointer' : 'default' }}
        >
            <span
                className="grid place-items-center rounded-full p-1 -m-1 transition-colors"
                style={{ background: hover ? activeBg : 'transparent' }}
            >
                {icon}
            </span>
            {count ? <span className="text-[11px] font-medium leading-none tabular-nums">{count}</span> : null}
        </span>
    );
};

/** 正文里的 @昵称 / #话题 走重点色 */
const BodyText: React.FC<{ text: string; accent: string; underlineTag?: boolean }> = ({ text, accent, underlineTag }) => {
    const parts = text.split(/(@[A-Za-z0-9_]{2,}|#[^\s#]{2,})/g);
    return (
        <>
            {parts.map((part, i) => (
                part.startsWith('@') || part.startsWith('#')
                    ? (
                        <span
                            key={i}
                            className={underlineTag ? 'font-medium' : 'font-normal'}
                            style={{ color: accent }}
                        >
                            {part}
                        </span>
                    )
                    : <React.Fragment key={i}>{part}</React.Fragment>
            ))}
        </>
    );
};

/**
 * Threads 专属卡片：
 * 还原真实 Threads 视觉——左列头像（右下角带黑色加号小徽章）+ 贯穿主帖正文左侧的 #e0e0e0 竖轨，
 * 右列顶部粗体 username（及灰色副名）+ 右上角黑色 @ 徽标，正文紧凑排在右列，
 * 正文下方紧跟心形 / 评论气泡 / 转发 / 纸飞机四枚圆润描边图标及数字，
 * 底部是带时间线连接轨的回复流。
 */
const ThreadsCardView: React.FC<{ card: XSocialCardData }> = ({ card }) => {
    const ink = '#000000';
    const muted = '#999999';
    const border = '#e5e5e5';
    const subtleLine = '#f0f0f0';
    const rail = '#d8d8d8';
    const wash = '#efefef';

    const name = (card.authorName || '').trim();
    const handle = (card.authorHandle || '').replace(/^@+/, '');
    const primaryLabel = handle || name || '?';
    const subLabel = handle && name && name !== handle ? name : '';
    const body = cleanFeedText(card.text);
    const extras = (card.threadTexts || []).map(cleanFeedText).filter(Boolean);
    const replies = card.replies || [];
    const statsLine = card.statsLine || '';

    const likes = stat(statsLine, ['赞']);
    const reposts = stat(statsLine, ['转发', '转']);
    const comments = stat(statsLine, ['回复', '评']);

    const openOriginal = (e: React.MouseEvent) => {
        if (!card.url) return;
        e.stopPropagation();
        window.open(card.url, '_blank', 'noopener,noreferrer');
    };

    const hasSpine = extras.length > 0 || replies.length > 0;

    return (
        <div
            onClick={card.url ? openOriginal : undefined}
            className={`w-[258px] max-w-full rounded-2xl border bg-white px-3.5 py-2.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] ${card.url ? 'cursor-pointer' : ''}`}
            style={{
                borderColor: border,
                color: ink,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            }}
        >
            {/* 主帖区：左列头像+竖轨，右列用户名+正文+操作栏 */}
            <div className="flex items-stretch gap-2.5">
                <div className="flex w-[34px] shrink-0 flex-col items-center">
                    <Face
                        url={card.avatar}
                        label={name || primaryLabel}
                        size={34}
                        wash={wash}
                        ink={ink}
                        badge={
                            <span
                                className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-black text-[10px] font-bold leading-none text-white ring-[1.5px] ring-white"
                                aria-hidden="true"
                            >
                                +
                            </span>
                        }
                    />
                    {hasSpine && (
                        <div className="mt-1.5 mb-0.5 w-[1.8px] flex-1 rounded-full" style={{ background: rail }} />
                    )}
                </div>

                <div className="min-w-0 flex-1 pb-0.5">
                    {/* 顶部作者行 + 右上角 Threads 徽标 */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 leading-tight">
                            <div className="flex items-baseline gap-1.5 truncate">
                                <span className="truncate text-[13px] font-semibold tracking-[-0.01em]" style={{ color: ink }}>
                                    {primaryLabel}
                                </span>
                                {subLabel ? (
                                    <span className="truncate text-[11.5px] font-normal" style={{ color: muted }}>
                                        {subLabel}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <div
                            className="flex shrink-0 items-center justify-center rounded-full p-0.5 transition-colors hover:bg-neutral-100"
                            title={card.url ? '在 Threads 上查看原帖' : undefined}
                        >
                            <ThreadsLogo size={16} color="#000000" />
                        </div>
                    </div>

                    {/* 主帖正文 */}
                    {body ? (
                        <div className="mt-1 whitespace-pre-wrap break-words text-[13px] font-normal leading-[1.4]" style={{ color: ink }}>
                            <BodyText text={body} accent="#0095f6" underlineTag />
                        </div>
                    ) : null}

                    {/* 楼主串帖补充 */}
                    {extras.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                            {extras.map((text, i) => (
                                <div key={i} className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.38]" style={{ color: ink }}>
                                    <BodyText text={text} accent="#0095f6" underlineTag />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Threads 紧贴正文底部的四枚圆润图标栏 */}
                    <div className="mt-2.5 flex items-center gap-4">
                        <ActionBtn
                            icon={<ThreadsHeartSvg size={15} />}
                            count={likes}
                            baseColor={ink}
                            activeColor="#ff3040"
                            activeBg="rgba(255,48,64,0.08)"
                            title="赞"
                        />
                        <ActionBtn
                            icon={<ThreadsCommentSvg size={15} />}
                            count={comments}
                            baseColor={ink}
                            activeColor={ink}
                            activeBg="rgba(0,0,0,0.05)"
                            title="回复"
                        />
                        <ActionBtn
                            icon={<ThreadsRepostSvg size={15} />}
                            count={reposts}
                            baseColor={ink}
                            activeColor="#00ba7c"
                            activeBg="rgba(0,186,124,0.08)"
                            title="转发"
                        />
                        <ActionBtn
                            icon={<ThreadsSendSvg size={15} />}
                            count=""
                            baseColor={ink}
                            activeColor={ink}
                            activeBg="rgba(0,0,0,0.05)"
                            onClick={card.url ? openOriginal : undefined}
                            title={card.url ? '打开原帖' : '分享'}
                        />
                    </div>
                </div>
            </div>

            {/* 回复区：延续左侧串线质感 */}
            {replies.length > 0 && (
                <div className="mt-2 border-t pt-2" style={{ borderColor: subtleLine }}>
                    <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-medium" style={{ color: muted }}>
                        <span>
                            回复 · {replies.length}{card.totalReplies && card.totalReplies > replies.length ? ` / ${compactCount(String(card.totalReplies))}` : ''}
                        </span>
                    </div>
                    <div
                        onClick={e => e.stopPropagation()}
                        className="max-h-[168px] overflow-y-auto pr-1 cursor-default"
                    >
                        <div className="relative space-y-2.5">
                            {replies.map((reply, i) => {
                                const replyHandle = (reply.handle || '').replace(/^@+/, '');
                                const replyName = (reply.name || '').trim();
                                const who = replyHandle || replyName || '?';
                                const whoSub = replyHandle && replyName && replyName !== replyHandle ? replyName : '';
                                const target = personLabelShort(reply.replyToName, reply.replyToHandle);
                                const last = i === replies.length - 1;
                                return (
                                    <div key={i} className="relative flex items-start gap-2">
                                        {!last && (
                                            <div
                                                className="pointer-events-none absolute w-[1.6px] rounded-full"
                                                style={{ left: 13, top: 28, bottom: -8, background: rail }}
                                            />
                                        )}
                                        <div className="flex w-7 shrink-0 justify-center">
                                            <Face url={reply.avatar} label={replyName || who} size={24} wash={wash} ink={ink} />
                                        </div>
                                        <div className="min-w-0 flex-1 text-[12px] leading-[1.34]">
                                            <div className="flex items-baseline gap-1 truncate">
                                                <span className="truncate font-semibold" style={{ color: ink }}>{who}</span>
                                                {whoSub ? (
                                                    <span className="truncate text-[10.5px]" style={{ color: muted }}>{whoSub}</span>
                                                ) : null}
                                            </div>
                                            {target && target !== '?' && (
                                                <div className="text-[10.5px]" style={{ color: muted }}>
                                                    回复 <span style={{ color: '#0095f6' }}>@{target.replace(/^@+/, '')}</span>
                                                </div>
                                            )}
                                            <div className="mt-0.5 whitespace-pre-wrap break-words" style={{ color: ink }}>
                                                <BodyText text={cleanFeedText(reply.text)} accent="#0095f6" underlineTag />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * X / Threads 贴链卡片。
 * - kind === 'threads' 走专属 ThreadsCardView；
 * - kind === 'x' 走等比缩小后的精致 X 详情页卡片（258px 宽，与小红书 256px 卡片协调一致）。
 */
export const XSocialCard: React.FC<{ card: XSocialCardData; kind: 'x' | 'threads' }> = ({ card, kind }) => {
    if (kind === 'threads') {
        return <ThreadsCardView card={card} />;
    }

    const ink = '#0f1419';
    const muted = '#536471';
    const border = '#cfd9de';
    const subtleLine = '#eff3f4';
    const wash = '#e7e9ea';
    const accent = '#1d9bf0';

    const name = (card.authorName || '').trim();
    const handle = (card.authorHandle || '').replace(/^@+/, '');
    const label = name || (handle ? `@${handle}` : '?');
    const body = cleanFeedText(card.text);
    const extras = (card.threadTexts || []).map(cleanFeedText).filter(Boolean);
    const replies = card.replies || [];
    const statsLine = card.statsLine || '';

    const likes = stat(statsLine, ['赞']);
    const reposts = stat(statsLine, ['转发', '转']);
    const comments = stat(statsLine, ['回复', '评']);
    const quotes = stat(statsLine, ['引用']);
    const views = stat(statsLine, ['浏览', '阅', '查看']);

    const likesNum = rawStatNumber(statsLine, ['赞']);
    const repostsNum = rawStatNumber(statsLine, ['转发', '转']);
    const quotesNum = rawStatNumber(statsLine, ['引用']);
    const viewsNum = rawStatNumber(statsLine, ['浏览', '阅', '查看']);

    const openOriginal = (e: React.MouseEvent) => {
        if (!card.url) return;
        e.stopPropagation();
        window.open(card.url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div
            onClick={card.url ? openOriginal : undefined}
            className={`w-[258px] max-w-full rounded-2xl border bg-white px-3.5 py-2.5 text-left shadow-[0_2px_10px_rgba(15,20,25,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(15,20,25,0.09)] ${card.url ? 'cursor-pointer' : ''}`}
            style={{
                borderColor: border,
                color: ink,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            }}
        >
            {/* 顶部作者栏 + 品牌标识 */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Face url={card.avatar} label={label} size={34} wash={wash} ink={ink} />
                    <div className="min-w-0 leading-tight">
                        <div className="flex items-center gap-1">
                            <span className="truncate text-[13.5px] font-bold tracking-[-0.01em]" style={{ color: ink }}>
                                {name || label}
                            </span>
                        </div>
                        {handle ? (
                            <div className="truncate text-[11.5px] font-normal" style={{ color: muted }}>
                                @{handle}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div
                    className="flex shrink-0 items-center justify-center rounded-full p-1 transition-colors hover:bg-slate-100"
                    title={card.url ? '在 X 上查看原帖' : undefined}
                >
                    <XLogo size={15} color="#0f1419" />
                </div>
            </div>

            {/* 主帖正文：通栏展示，紧凑利落 */}
            {body ? (
                <div
                    className="mt-2 whitespace-pre-wrap break-words text-[13px] font-normal leading-[1.4]"
                    style={{ color: ink }}
                >
                    <BodyText text={body} accent={accent} />
                </div>
            ) : null}

            {/* 楼主连发 Thread */}
            {extras.length > 0 && (
                <div className="mt-2 space-y-1.5 border-l-2 pl-2.5" style={{ borderColor: '#cfd9de' }}>
                    {extras.map((text, i) => (
                        <div key={i} className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.36]" style={{ color: ink }}>
                            <BodyText text={text} accent={accent} />
                        </div>
                    ))}
                </div>
            )}

            {/* 互动数字摘要条 */}
            {(repostsNum > 0 || quotesNum > 0 || likesNum > 0 || viewsNum > 0) && (
                <div
                    className="mt-2 flex flex-nowrap items-center gap-x-1.5 border-t pt-2 text-[10px] leading-none"
                    style={{ borderColor: subtleLine, color: muted }}
                >
                    {repostsNum > 0 && (
                        <span className="whitespace-nowrap">
                            <strong className="font-bold tabular-nums" style={{ color: ink }}>{reposts}</strong> 转帖
                        </span>
                    )}
                    {quotesNum > 0 && (
                        <span className="whitespace-nowrap">
                            <strong className="font-bold tabular-nums" style={{ color: ink }}>{quotes}</strong> 引用
                        </span>
                    )}
                    {likesNum > 0 && (
                        <span className="whitespace-nowrap">
                            <strong className="font-bold tabular-nums" style={{ color: ink }}>{likes}</strong> 喜欢
                        </span>
                    )}
                    {viewsNum > 0 && (
                        <span className="whitespace-nowrap">
                            <strong className="font-bold tabular-nums" style={{ color: ink }}>{views}</strong> 查看
                        </span>
                    )}
                </div>
            )}

            {/* 底部动作图标栏（还原真实 X：回复、转帖、喜欢、浏览量四组主数据 + 右侧书签/分享） */}
            <div
                className="mt-2 flex items-center justify-between border-t pt-2"
                style={{ borderColor: subtleLine }}
            >
                <ActionBtn
                    icon={<ReplySvg size={13.5} />}
                    count={comments}
                    baseColor={muted}
                    activeColor="#1d9bf0"
                    activeBg="rgba(29,155,240,0.1)"
                    title="回复"
                />
                <ActionBtn
                    icon={<RepostSvg size={13.5} />}
                    count={reposts}
                    baseColor={muted}
                    activeColor="#00ba7c"
                    activeBg="rgba(0,186,124,0.1)"
                    title="转帖"
                />
                <ActionBtn
                    icon={<HeartSvg size={13.5} />}
                    count={likes}
                    baseColor={muted}
                    activeColor="#f91880"
                    activeBg="rgba(249,24,128,0.1)"
                    title="喜欢"
                />
                <ActionBtn
                    icon={<ViewsSvg size={13.5} />}
                    count={views}
                    baseColor={muted}
                    activeColor="#1d9bf0"
                    activeBg="rgba(29,155,240,0.1)"
                    title="查看"
                />
                <div className="flex items-center gap-2">
                    <ActionBtn
                        icon={<BookmarkSvg size={13.5} />}
                        count=""
                        baseColor={muted}
                        activeColor="#1d9bf0"
                        activeBg="rgba(29,155,240,0.1)"
                        title="书签"
                    />
                    <ActionBtn
                        icon={<ShareSvg size={13.5} />}
                        count=""
                        baseColor={muted}
                        activeColor="#1d9bf0"
                        activeBg="rgba(29,155,240,0.1)"
                        onClick={card.url ? openOriginal : undefined}
                        title={card.url ? '打开原帖' : '分享'}
                    />
                </div>
            </div>

            {/* 回复区：带左侧时间线连接轨 */}
            {replies.length > 0 && (
                <div className="mt-2 border-t pt-2" style={{ borderColor: subtleLine }}>
                    <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-medium" style={{ color: muted }}>
                        <span>
                            回复（{replies.length}{card.totalReplies && card.totalReplies > replies.length ? ` / 共 ${compactCount(String(card.totalReplies))}` : ''}）
                        </span>
                    </div>
                    <div
                        onClick={e => e.stopPropagation()}
                        className="max-h-[168px] overflow-y-auto pr-1 cursor-default"
                    >
                        <div className="relative space-y-2.5">
                            {replies.map((reply, i) => {
                                const who = personLabelShort(reply.name, reply.handle);
                                const target = personLabelShort(reply.replyToName, reply.replyToHandle);
                                const replyHandle = (reply.handle || '').replace(/^@+/, '');
                                const last = i === replies.length - 1;
                                return (
                                    <div key={i} className="relative flex items-start gap-2">
                                        {!last && (
                                            <div
                                                className="pointer-events-none absolute w-[1.5px] rounded-full"
                                                style={{ left: 13, top: 28, bottom: -8, background: '#cfd9de' }}
                                            />
                                        )}
                                        <div className="flex w-7 shrink-0 justify-center">
                                            <Face url={reply.avatar} label={who} size={24} wash={wash} ink={ink} />
                                        </div>
                                        <div className="min-w-0 flex-1 text-[12px] leading-[1.34]">
                                            <div className="flex items-baseline gap-1 truncate">
                                                <span className="truncate font-bold" style={{ color: ink }}>{who}</span>
                                                {replyHandle ? (
                                                    <span className="truncate text-[11.5px]" style={{ color: muted }}>@{replyHandle}</span>
                                                ) : null}
                                            </div>
                                            {target && target !== '?' && (
                                                <div className="text-[10.5px]" style={{ color: muted }}>
                                                    回复 <span style={{ color: accent }}>@{target.replace(/^@+/, '')}</span>
                                                </div>
                                            )}
                                            <div className="mt-0.5 whitespace-pre-wrap break-words" style={{ color: ink }}>
                                                <BodyText text={cleanFeedText(reply.text)} accent={accent} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
