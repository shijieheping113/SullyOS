import React, { useState } from 'react';
import { cleanFeedText, personLabelShort, type XSocialCardData } from '../../utils/xJpPack';

const compactCount = (raw: string): string => {
    const n = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n)) return raw;
    if (n < 10000) return String(n);
    if (n < 1_000_000) {
        const v = n / 1000;
        return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}K`;
    }
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
};

const stat = (line: string, labels: string[]): string => {
    for (const label of labels) {
        const hit = line.match(new RegExp(`${label}\\s*([\\d,]+)`));
        if (hit) return compactCount(hit[1]);
    }
    return '';
};

const Face: React.FC<{ url?: string | null; label: string; size: number; wash: string; ink: string }> = ({ url, label, size, wash, ink }) => {
    const [broken, setBroken] = useState(false);
    const letter = (label || '?').trim().slice(0, 1) || '?';
    if (url && !broken) {
        return (
            <img
                src={url}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setBroken(true)}
                className="shrink-0 rounded-full object-cover"
                style={{ width: size, height: size, background: wash }}
            />
        );
    }
    return (
        <div
            className="grid shrink-0 place-items-center rounded-full font-semibold"
            style={{ width: size, height: size, background: wash, color: ink, fontSize: Math.round(size * 0.38) }}
        >
            {letter}
        </div>
    );
};

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 18 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
    </svg>
);

const replyPath = 'M21 11.5a8.4 8.4 0 0 1-8.5 8.3c-1.2 0-2.3-.2-3.4-.7L4 21.2l1.2-4.2A8.4 8.4 0 1 1 21 11.5z';
const repostPath = 'M4 7h11.5M15.5 4 19 7l-3.5 3M20 17H8.5M8.5 20 5 17l3.5-3';
const heartPath = 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z';
const sharePath = 'M12 16V4M8 8l4-4 4 4M5 20h14';
const viewsPath = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';

const Action: React.FC<{ icon: React.ReactNode; count: string; color: string }> = ({ icon, count, color }) => (
    <span className="inline-flex items-center gap-1.5" style={{ color }}>
        {icon}
        {count ? <span className="text-[13px] leading-none tabular-nums">{count}</span> : null}
    </span>
);

/** 日间贴链卡。X 按现在的白底时间线，Threads 按白底帖子流，两套分开。 */
export const XSocialCard: React.FC<{ card: XSocialCardData; kind: 'x' | 'threads' }> = ({ card, kind }) => {
    const threads = kind === 'threads';
    const ink = threads ? '#000000' : '#0f1419';
    const muted = threads ? '#999999' : '#536471';
    const line = threads ? '#efefef' : '#eff3f4';
    const wash = threads ? '#efefef' : '#cfd9de';
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
    const inset = threads ? 48 : 52;
    return (
        <div className="w-[300px] max-w-full rounded-2xl border bg-white px-4 py-3.5 text-left" style={{ borderColor: threads ? '#dbdbdb' : '#eff3f4', color: ink }}>
            <div className="flex items-start gap-3">
                <Face url={card.avatar} label={label} size={threads ? 36 : 40} wash={wash} ink={ink} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="truncate text-[15px] font-semibold leading-5">{name || label}</div>
                            {handle ? <div className="truncate text-[13px] leading-4" style={{ color: muted }}>@{handle}</div> : null}
                        </div>
                        <div className="shrink-0 pt-0.5 text-[13px] font-semibold leading-none" style={{ color: threads ? '#000000' : '#0f1419' }}>
                            {threads ? 'Threads' : (
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                    <path fill={ink} d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.726-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {body ? <div className="mt-2 whitespace-pre-wrap text-[15px] leading-5" style={{ paddingLeft: inset }}>{body}</div> : null}
            {extras.length > 0 && (
                <div className="mt-2 space-y-2" style={{ paddingLeft: inset }}>
                    {extras.map((line, i) => (
                        <div key={i} className="whitespace-pre-wrap border-l-2 pl-3 text-[15px] leading-5" style={{ borderColor: threads ? '#000000' : '#cfd9de' }}>{line}</div>
                    ))}
                </div>
            )}
            <div className="mt-3 flex items-center justify-between pr-1" style={{ paddingLeft: inset }}>
                <Action color={muted} count={comments} icon={<Icon d={replyPath} />} />
                <Action color={muted} count={reposts} icon={<Icon d={repostPath} />} />
                <Action color={muted} count={likes} icon={<Icon d={heartPath} />} />
                {threads ? (
                    <Action color={muted} count="" icon={<Icon d={sharePath} />} />
                ) : (
                    <Action color={muted} count={quotes} icon={<Icon d={viewsPath} />} />
                )}
            </div>
            {replies.length > 0 && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: line }}>
                    <div className="max-h-[calc(9*1.35rem)] space-y-3 overflow-y-auto pr-1">
                        {replies.map((reply, i) => {
                            const who = personLabelShort(reply.name, reply.handle);
                            const target = personLabelShort(reply.replyToName, reply.replyToHandle);
                            const replyHandle = (reply.handle || '').replace(/^@+/, '');
                            return (
                                <div key={i} className="flex items-start gap-2.5">
                                    <div className="flex flex-col items-center">
                                        <Face url={reply.avatar} label={who} size={28} wash={wash} ink={ink} />
                                        {i < replies.length - 1 ? <div className="mt-1 w-px flex-1" style={{ background: threads ? '#dbdbdb' : '#cfd9de', minHeight: 12 }} /> : null}
                                    </div>
                                    <div className="min-w-0 text-[13px] leading-[1.35rem]">
                                        <div className="truncate">
                                            <span className="font-semibold">{who}</span>
                                            {replyHandle ? <span style={{ color: muted }}> @{replyHandle}</span> : null}
                                        </div>
                                        {target && target !== '?' ? <div style={{ color: muted }}>回复 {target}</div> : null}
                                        <div className="whitespace-pre-wrap">{cleanFeedText(reply.text)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
