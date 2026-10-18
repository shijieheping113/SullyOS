/**
 * 电波两套外壳。
 * YouTube：白底、Roboto 节奏、红标、底栏五键、全宽封面、圆头像聊天。
 * ニコニコ生放送：白页、黑字、播放器黑槽、评论三列、方按钮。两套不共用骨架。
 */
import React from 'react';

export type IconName =
  | 'back'
  | 'search'
  | 'close'
  | 'more'
  | 'home'
  | 'video'
  | 'plus'
  | 'people'
  | 'person'
  | 'send'
  | 'play'
  | 'pause'
  | 'expand'
  | 'collapse'
  | 'chat'
  | 'gift'
  | 'yen'
  | 'gear'
  | 'check'
  | 'skipBack'
  | 'skipForward';

const PATHS: Record<IconName, React.ReactNode> = {
  back: <path d="M15 5 L8 12 L15 19" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16 L20 20" />
    </>
  ),
  close: (
    <>
      <path d="M7 7 L17 17" />
      <path d="M17 7 L7 17" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 L12 4 L20 11" />
      <path d="M7 10.5 V20 H17 V10.5" />
    </>
  ),
  video: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M10 9.5 L15 12 L10 14.5 Z" fill="currentColor" stroke="none" />
    </>
  ),
  plus: (
    <>
      <path d="M12 6 V18" />
      <path d="M6 12 H18" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="2.4" />
      <path d="M4.5 18.5 C4.8 15.2 6.6 13.6 9 13.6 C11.4 13.6 13.2 15.2 13.5 18.5" />
      <circle cx="16" cy="9.2" r="2" />
      <path d="M14.2 18.5 C14.6 15.8 15.8 14.4 17.6 14.2 C19 14.4 20 15.6 20.2 18.5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.5" r="3" />
      <path d="M5.5 19.5 C6.2 15.4 8.6 13.4 12 13.4 C15.4 13.4 17.8 15.4 18.5 19.5" />
    </>
  ),
  send: <path d="M4 12 L20 5 L13 20 L11 13 Z" />,
  play: <path d="M8 5.5 L19 12 L8 18.5 Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M8 6 V18" />
      <path d="M16 6 V18" />
    </>
  ),
  expand: (
    <>
      <path d="M9 4 H4 V9" />
      <path d="M15 4 H20 V9" />
      <path d="M20 15 V20 H15" />
      <path d="M4 15 V20 H9" />
    </>
  ),
  collapse: (
    <>
      <path d="M4 9 H9 V4" />
      <path d="M20 9 H15 V4" />
      <path d="M15 20 V15 H20" />
      <path d="M9 20 V15 H4" />
    </>
  ),
  chat: (
    <>
      <path d="M5 6 H19 V16 H9 L5 19 Z" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="10" width="16" height="9" rx="1" />
      <path d="M4 14 H20" />
      <path d="M12 10 V19" />
      <path d="M12 10 C10 6 6 6.5 7.2 9.2 C8 11 12 10 12 10 Z" />
      <path d="M12 10 C14 6 18 6.5 16.8 9.2 C16 11 12 10 12 10 Z" />
    </>
  ),
  yen: (
    <>
      <path d="M7 5 L12 12 L17 5" />
      <path d="M12 12 V19" />
      <path d="M8 13 H16" />
      <path d="M8 16 H16" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5 V6 M12 18 V20.5 M3.5 12 H6 M18 12 H20.5 M5.8 5.8 L7.6 7.6 M16.4 16.4 L18.2 18.2 M18.2 5.8 L16.4 7.6 M7.6 16.4 L5.8 18.2" />
    </>
  ),
  check: <path d="M5 12.5 L10 17.5 L19 7" />,
  skipBack: <path d="M16 6 L8 12 L16 18 Z M7 6 V18" fill="currentColor" stroke="none" />,
  skipForward: <path d="M8 6 L16 12 L8 18 Z M17 6 V18" fill="currentColor" stroke="none" />,
};

export function Icon({
  name,
  size = 24,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function YtMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#0f0f0f]">
      <span className="relative w-7 h-5 rounded-[5px] bg-[#ff0000] inline-flex items-center justify-center shrink-0">
        <span
          className="block w-0 h-0"
          style={{
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderLeft: '7px solid #fff',
            marginLeft: 1,
          }}
        />
      </span>
      <span className="text-[18px] leading-none font-medium tracking-[-0.04em]">YouTube</span>
    </span>
  );
}

export function NicoMark() {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0 text-[#111]">
      <span className="text-[18px] leading-none font-bold tracking-[-0.05em]">niconico</span>
      <span className="text-[10px] leading-none font-medium border border-[#111] px-1 py-[2px] shrink-0">
        生放送
      </span>
    </span>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  disabled,
  dot,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="relative w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full text-inherit active:bg-black/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]"
    >
      {children}
      {dot ? (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#ff0000]" />
      ) : null}
    </button>
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[80] flex flex-col justify-end">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-white text-[#0f0f0f] rounded-t-2xl max-h-[86%] flex flex-col shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-center justify-between px-2 h-12 shrink-0 border-b border-[#ececec]">
          <div className="w-11" />
          <h2 className="text-[15px] font-medium truncate px-2">{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <Icon name="close" size={22} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-4 py-3 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] leading-4 text-[#606060] mb-1">{children}</label>;
}

/** 下拉，不用横滑芯片。手机上会打开系统清单。 */
export function DropDown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 min-h-11 w-full">
      <span className="text-[13px] text-[#606060] shrink-0">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 h-11 px-3 bg-[#f2f2f2] text-[14px] text-[#0f0f0f] focus:outline-none"
      >
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-11 px-3 rounded-lg bg-[#f2f2f2] text-[15px] leading-5 text-[#0f0f0f] placeholder:text-[#909090] focus:outline-none focus:ring-2 focus:ring-[#0f0f0f] ${props.className || ''}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-[#f2f2f2] text-[15px] leading-6 text-[#0f0f0f] placeholder:text-[#909090] focus:outline-none focus:ring-2 focus:ring-[#0f0f0f] ${props.className || ''}`}
    />
  );
}

export function Seek({
  min,
  max,
  value,
  onChange,
  variant,
  label,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  variant: 'yt' | 'nico' | 'ytLight';
  label: string;
}) {
  const thumb = variant === 'nico' ? '#0080ff' : '#FF0033';
  const baseTrack = variant === 'ytLight' ? '#e2e8f0' : 'rgba(255,255,255,0.28)';
  const span = Math.max(1, max - min);
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  const trackBg = `linear-gradient(to right, ${thumb} 0%, ${thumb} ${pct}%, ${baseTrack} ${pct}%, ${baseTrack} 100%)`;
  return (
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="live-seek"
      style={{ ['--seek-thumb' as string]: thumb, ['--seek-track' as string]: trackBg }}
    />
  );
}

export function LiveUiStyle() {
  return (
    <style>{`
      .live-seek {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 18px;
        background: transparent;
        margin: 0;
        cursor: pointer;
      }
      .live-seek:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .live-seek::-webkit-slider-runnable-track {
        height: 4px;
        background: var(--seek-track);
        border-radius: 99px;
      }
      .live-seek::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 99px;
        background: var(--seek-thumb);
        margin-top: -4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      }
      @media (prefers-reduced-motion: reduce) {
        .live-ui *:not(.danmaku-fly) { animation: none !important; transition: none !important; }
      }
    `}</style>
  );
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 10000) {
    const v = n / 10000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}万`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}千`;
  }
  return String(Math.round(n));
}

export function clockFromIndex(idx: number): string {
  const total = Math.max(0, idx) * 18 + 12;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
