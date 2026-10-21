/**
 * 直播画面上的一对台词。外文在上，中文在下。
 * 「前一对」「后一对」自己处理点击，不靠白带的空白或文字区域。
 */
import React from 'react';

export function LiveSpeechPair(props: {
  spokenLine: string;
  translatedLine: string;
  showTranslation: boolean;
  spokenStyle: React.CSSProperties;
  translatedStyle: React.CSSProperties;
  showButtons: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const showZh = Boolean(
    props.showTranslation && props.translatedLine && props.translatedLine !== props.spokenLine,
  );
  const hold = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  return (
    <div className="min-w-0 flex-1 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="break-words" style={props.spokenStyle}>{props.spokenLine}</p>
        {showZh && (
          <p className="break-words mt-[3px]" style={props.translatedStyle}>{props.translatedLine}</p>
        )}
      </div>
      {props.showButtons && (
        <div className="shrink-0 flex flex-col gap-1" onPointerDown={hold} onClick={hold}>
          <PairButton label="前一对" disabled={!props.canPrev} onClick={props.onPrev} />
          <PairButton label="后一对" disabled={!props.canNext} onClick={props.onNext} />
        </div>
      )}
    </div>
  );
}

function PairButton(props: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        if (!props.disabled) props.onClick();
      }}
      className="h-6 px-1.5 rounded-full border text-[10px] font-bold leading-none disabled:opacity-40"
      style={{ borderColor: '#e4e4e7', color: '#3f4a58', backgroundColor: '#fff' }}
    >
      {props.label}
    </button>
  );
}
