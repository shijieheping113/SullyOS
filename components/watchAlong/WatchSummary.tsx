/**
 * 看总结。
 *
 * 上面是整场回顾（退房要写进主聊天的那段），下面是一段段阶段摘要。
 * 每一段都能改、能重写、能删；删掉的会被后续滚动总结重新压一遍。
 */
import React, { useEffect, useState } from 'react';
import { R_PILL, SolidButton, TopBar, W, WIco } from './chrome';
import type { WatchAlongSession } from '../../utils/watchAlong/types';

export function WatchSummary({
  session,
  keepRecent,
  busy,
  onBack,
  onRewriteRecap,
  onEditRecap,
  onRewriteDigest,
  onEditDigest,
  onDeleteDigest,
  onForceDigest,
}: {
  session: WatchAlongSession;
  /** 最近几幕留原文，不压进摘要 */
  keepRecent: number;
  /** 正在跟模型说话 */
  busy: string | null;
  onBack: () => void;
  onRewriteRecap: () => void;
  onEditRecap: (text: string) => void;
  onRewriteDigest: (id: string) => void;
  onEditDigest: (id: string, text: string) => void;
  onDeleteDigest: (id: string) => void;
  onForceDigest: () => void;
}) {
  const [recapDraft, setRecapDraft] = useState<string | null>(null);
  const [digestEdit, setDigestEdit] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    setRecapDraft(null);
    setDigestEdit(null);
  }, [session.id]);

  return (
    <div className="flex h-full w-full flex-col" style={{ background: W.page, color: W.ink }}>
      <TopBar title="看总结" subtitle={`${session.room.streamerName} · 第 ${Math.max(1, session.beats.length)} 幕`} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {/* 整场回顾 */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px]" style={{ color: W.sub }}>
            整场回顾
          </span>
          <span className="flex items-center gap-3">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={onRewriteRecap}
              className="inline-flex items-center gap-1 text-[11.5px] disabled:opacity-40"
              style={{ color: W.ink }}
            >
              <WIco name="rewrite" size={13} />
              {busy === 'recap' ? '重写中…' : '重写'}
            </button>
            <button
              type="button"
              onClick={() => setRecapDraft(session.recap || '')}
              className="inline-flex items-center gap-1 text-[11.5px]"
              style={{ color: W.ink }}
            >
              <WIco name="edit" size={13} />
              改
            </button>
          </span>
        </div>

        {recapDraft !== null ? (
          <div className="mt-2">
            <textarea
              value={recapDraft}
              onChange={e => setRecapDraft(e.target.value)}
              rows={6}
              aria-label="整场回顾"
              className="w-full resize-none px-3 py-2.5 text-[13px] leading-[20px] outline-none"
              style={{ borderRadius: 12, background: W.fill, color: W.ink }}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onEditRecap(recapDraft.trim());
                  setRecapDraft(null);
                }}
                className="h-[34px] flex-1 text-[12.5px] font-medium text-white"
                style={{ borderRadius: R_PILL, background: W.ink }}
              >
                存下来
              </button>
              <button
                type="button"
                onClick={() => setRecapDraft(null)}
                className="h-[34px] px-4 text-[12.5px]"
                style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
              >
                算了
              </button>
            </div>
          </div>
        ) : (
          <div
            className="mt-2 px-3 py-3 text-[13px] leading-[20px]"
            style={{ borderRadius: 12, background: W.soft, color: session.recap ? W.ink : W.sub }}
          >
            {session.recap || '还没写。退房的时候会写一段，或者现在点「重写」先要一段。'}
            {session.recapEdited ? (
              <span className="mt-1 block text-[10.5px]" style={{ color: W.faint }}>
                这段是你手改过的
              </span>
            ) : null}
          </div>
        )}

        {/* 阶段摘要 */}
        <div className="mt-6 flex items-center justify-between">
          <span className="text-[12px]" style={{ color: W.sub }}>
            阶段摘要 · {session.digests.length} 段
          </span>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={onForceDigest}
            className="inline-flex items-center gap-1 text-[11.5px] disabled:opacity-40"
            style={{ color: W.ink }}
          >
            <WIco name="rewrite" size={13} />
            {busy === 'digest' ? '压着呢…' : '再压一段'}
          </button>
        </div>

        {session.digests.length === 0 ? (
          <div className="mt-2 px-3 py-3 text-[12px] leading-[18px]" style={{ borderRadius: 12, background: W.soft, color: W.sub }}>
            还没压过。攒够幕数会自动压一段；也可以现在手动压一段，最近 {keepRecent} 幕会留原文。
          </div>
        ) : (
          session.digests.map(d => (
            <div key={d.id} className="mt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px]" style={{ color: W.faint }}>
                  第 {d.fromBeat + 1} – {d.toBeat + 1} 幕{d.edited ? ' · 你改过' : ''}
                </span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => onRewriteDigest(d.id)}
                    className="inline-flex items-center gap-1 text-[11px] disabled:opacity-40"
                    style={{ color: W.ink }}
                  >
                    <WIco name="rewrite" size={12} />
                    {busy === d.id ? '重写中…' : '重写'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDigestEdit({ id: d.id, text: d.text })}
                    className="inline-flex items-center gap-1 text-[11px]"
                    style={{ color: W.ink }}
                  >
                    <WIco name="edit" size={12} />
                    改
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDigest(d.id)}
                    aria-label="删掉这段"
                    style={{ color: W.faint }}
                  >
                    <WIco name="trash" size={12} />
                  </button>
                </span>
              </div>

              {digestEdit?.id === d.id ? (
                <div className="mt-1.5">
                  <textarea
                    value={digestEdit.text}
                    onChange={e => setDigestEdit({ id: d.id, text: e.target.value })}
                    rows={4}
                    aria-label="阶段摘要"
                    className="w-full resize-none px-3 py-2.5 text-[12.5px] leading-[19px] outline-none"
                    style={{ borderRadius: 12, background: W.fill, color: W.ink }}
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onEditDigest(d.id, digestEdit.text.trim());
                        setDigestEdit(null);
                      }}
                      className="h-[32px] flex-1 text-[12px] font-medium text-white"
                      style={{ borderRadius: R_PILL, background: W.ink }}
                    >
                      存下来
                    </button>
                    <button
                      type="button"
                      onClick={() => setDigestEdit(null)}
                      className="h-[32px] px-4 text-[12px]"
                      style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
                    >
                      算了
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 px-3 py-2.5 text-[12.5px] leading-[19px]" style={{ borderRadius: 12, background: W.soft, color: W.ink }}>
                  {d.text}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 px-4 pb-3">
        <SolidButton
          tone="fill"
          thin
          onClick={() => {
            if (recapDraft !== null) onEditRecap(recapDraft.trim());
            onBack();
          }}
        >
          收起
        </SolidButton>
      </div>
    </div>
  );
}
