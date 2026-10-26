/**
 * 导演。
 *
 * 只写下一轮，推进后自动清空。分两栏：给台上主播的、给角色的。
 * 私聊和直播同一个入口，写下的东西两边都吃。
 */
import React, { useEffect, useState } from 'react';
import { R_PILL, Sheet, SolidButton, W, WIco } from './chrome';

const STAGE_CHIPS = ['让主播当场翻车', '点名台下', '开个盘口', '准备下播', '加个突发状况'];
const CHAR_CHIPS = ['评评这幕', '去公屏发条弹幕', '申请上麦', '下麦', '别理主播'];

export function WatchDirector({
  open,
  charName,
  stageCue,
  charCue,
  disabled,
  onClose,
  onApply,
}: {
  open: boolean;
  charName: string;
  stageCue: string;
  charCue: string;
  /** 旧记录不能导 */
  disabled?: boolean;
  onClose: () => void;
  onApply: (next: { stageCue: string; charCue: string }) => void;
}) {
  const [stage, setStage] = useState(stageCue);
  const [role, setRole] = useState(charCue);

  useEffect(() => {
    if (!open) return;
    setStage(stageCue);
    setRole(charCue);
  }, [open, stageCue, charCue]);

  const append = (current: string, chip: string, set: (v: string) => void) => {
    const parts = current
      .split(/[；;]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.includes(chip)) {
      set(parts.filter(p => p !== chip).join('；'));
      return;
    }
    set([...parts, chip].join('；'));
  };

  return (
    <Sheet
      open={open}
      title="导演"
      onClose={onClose}
      footer={
        <SolidButton
          disabled={disabled}
          onClick={() => {
            onApply({ stageCue: stage.trim(), charCue: role.trim() });
          }}
        >
          下一轮照这个走
        </SolidButton>
      }
    >
      <div className="px-4 pb-6">
        <div className="pt-1 text-[11px] leading-[16px]" style={{ color: W.sub }}>
          只管下一轮。推进之后自动清空，不用自己删。
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          <WIco name="clap" size={14} style={{ color: W.ink }} />
          <span className="text-[12.5px] font-medium" style={{ color: W.ink }}>
            台上
          </span>
        </div>
        <textarea
          value={stage}
          onChange={e => setStage(e.target.value)}
          rows={2}
          aria-label="给台上的方向"
          placeholder="比如：让主播当场翻车，被台下揭穿之后不服气，开始乱猜。"
          className="mt-2 w-full resize-none px-3 py-2.5 text-[13px] leading-[19px] outline-none placeholder:text-[#ADADAD]"
          style={{ borderRadius: 12, background: W.fill, color: W.ink }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {STAGE_CHIPS.map(c => {
            const on = stage.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => append(stage, c, setStage)}
                className="h-[28px] shrink-0 px-[11px] text-[11.5px]"
                style={{ borderRadius: R_PILL, background: on ? W.ink : W.fill, color: on ? '#fff' : W.ink }}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-1.5">
          <WIco name="people" size={14} style={{ color: W.ink }} />
          <span className="text-[12.5px] font-medium" style={{ color: W.ink }}>
            {charName}
          </span>
        </div>
        <textarea
          value={role}
          onChange={e => setRole(e.target.value)}
          rows={2}
          aria-label="给角色的方向"
          placeholder="比如：忍不住要上麦拆台，但上去又有点怂。"
          className="mt-2 w-full resize-none px-3 py-2.5 text-[13px] leading-[19px] outline-none placeholder:text-[#ADADAD]"
          style={{ borderRadius: 12, background: W.fill, color: W.ink }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {CHAR_CHIPS.map(c => {
            const on = role.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => append(role, c, setRole)}
                className="h-[28px] shrink-0 px-[11px] text-[11.5px]"
                style={{ borderRadius: R_PILL, background: on ? W.ink : W.fill, color: on ? '#fff' : W.ink }}
              >
                {c}
              </button>
            );
          })}
        </div>

        {stage.trim() || role.trim() ? (
          <button
            type="button"
            onClick={() => {
              setStage('');
              setRole('');
            }}
            className="mt-4 text-[11.5px]"
            style={{ color: W.sub }}
          >
            清空这两栏
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
