/**
 * 陪看界面的共享原子。
 *
 * 只提供「一块砖」：颜色、图标、状态栏、返回栏、胶囊、开关、底部弹层、空态。
 * 页面组合在各自文件里，原子不掺业务。
 *
 * 视觉基准是 YouTube 白：白底、黑字、灰块、红只做 LIVE 与引用条。
 */
import React from 'react';
import TokenImg from '../os/TokenImg';

// ==================== 颜色与圆角 ====================

export const W = {
  ink: '#0F0F0F',
  sub: '#606060',
  faint: '#909090',
  fill: '#F2F2F2',
  fillDeep: '#EFEFEF',
  line: '#EBEBEB',
  red: '#FF0033',
  page: '#FFFFFF',
  soft: '#F8F8F8',
} as const;

/** 胶囊（搜索框、分类、按钮）圆角 */
export const R_PILL = 999;
/** 封面圆角 */
export const R_COVER = 12;

// ==================== 图标 ====================

export type WIcoName =
  | 'back'
  | 'search'
  | 'clock'
  | 'gear'
  | 'send'
  | 'plus'
  | 'emoji'
  | 'mic'
  | 'next'
  | 'close'
  | 'edit'
  | 'rewrite'
  | 'trash'
  | 'quote'
  | 'translate'
  | 'play'
  | 'pause'
  | 'people'
  | 'gift'
  | 'more'
  | 'check'
  | 'clap'
  | 'eye'
  | 'drag'
  | 'chat';

const PATHS: Record<WIcoName, React.ReactNode> = {
  back: <path d="M15 5 L8 12 L15 19" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="M15.6 15.6 L20 20" />
    </>
  ),
  clock: (
    <>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1" />
      <path d="M3.2 4.6v4.2h4.2" />
      <path d="M12 8v4.4l3 1.8" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.4v2.2M12 18.4v2.2M4.9 7.9l1.9 1.1M17.2 15l1.9 1.1M4.9 16.1l1.9-1.1M17.2 9l1.9-1.1" />
    </>
  ),
  send: <path d="M4.4 11.7 19.6 5.2 13.6 20 11 13.6 4.4 11.7 Z" />,
  plus: <path d="M12 5.4v13.2M5.4 12h13.2" />,
  emoji: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="9.3" cy="10.2" r=".9" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="10.2" r=".9" fill="currentColor" stroke="none" />
      <path d="M8.8 14.2a4 4 0 0 0 6.4 0" />
    </>
  ),
  mic: (
    <>
      <rect x="9.2" y="3.4" width="5.6" height="10" rx="2.8" />
      <path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0M12 17.6V20.4" />
    </>
  ),
  next: <path d="M9 5.6 15.4 12 9 18.4" />,
  close: <path d="M6.8 6.8 17.2 17.2M17.2 6.8 6.8 17.2" />,
  edit: (
    <>
      <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10v3Z" />
      <path d="M14.4 7.6 16.9 10" />
    </>
  ),
  rewrite: (
    <>
      <path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1" />
      <path d="M20.8 4.6v4.2h-4.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.8 7.2h14.4M9.6 7.2V5.4h4.8v1.8" />
      <path d="M6.6 7.2l.9 11.4h9l.9-11.4" />
      <path d="M10.4 10.8v4.8M13.6 10.8v4.8" />
    </>
  ),
  quote: (
    <>
      <path d="M9.4 6.4c-2.6.8-4.2 3-4.2 5.6v5.6h5v-5.6H7.4c0-1.9.9-3.2 2.6-3.9Z" />
      <path d="M18.6 6.4c-2.6.8-4.2 3-4.2 5.6v5.6h5v-5.6h-2.8c0-1.9.9-3.2 2.6-3.9Z" />
    </>
  ),
  translate: (
    <>
      <path d="M3.6 6.4h8M7.6 4.2v2.2M9.6 6.4c-.6 3.6-2.6 6-5.6 7.6" />
      <path d="M5 11.2c1.4 1.9 3.2 3 5.4 3.4" />
      <path d="M12.6 19.8l3.6-9.2 3.6 9.2M13.9 16.8h4.7" />
    </>
  ),
  play: <path d="M8.4 5.6 18.4 12 8.4 18.4 Z" />,
  pause: <path d="M9 5.6v12.8M15 5.6v12.8" strokeWidth={2.4} />,
  people: (
    <>
      <circle cx="9.2" cy="8.4" r="3.4" />
      <path d="M3.4 19.4c0-3 2.6-5.2 5.8-5.2s5.8 2.2 5.8 5.2" />
      <path d="M16.2 5.6a3.1 3.1 0 0 1 0 5.8M17.4 14.6c2 .5 3.4 2.2 3.4 4.4" />
    </>
  ),
  gift: (
    <>
      <path d="M4.4 9.4h15.2v3.2H4.4zM5.6 12.6v7.2h12.8v-7.2M12 9.4v10.4" />
      <path d="M12 9.4C10.6 6 8.8 5.2 7.6 5.8c-1.4.8-1 3.6 4.4 3.6ZM12 9.4c1.4-3.4 3.2-4.2 4.4-3.6 1.4.8 1 3.6-4.4 3.6Z" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.8" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.2" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M5.4 12.6 9.8 17 18.6 7.4" />,
  clap: (
    <>
      <path d="M8.4 12.6 12 9l3.6 3.6-3.6 3.6z" />
      <path d="M12 3.4v2.4M12 18.2v2.4M3.4 12h2.4M18.2 12h2.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12c2.4-4 5.4-6 9.2-6s6.8 2 9.2 6c-2.4 4-5.4 6-9.2 6s-6.8-2-9.2-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  drag: (
    <>
      <circle cx="9" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="17" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  chat: (
    <>
      <path d="M20.4 11.6c0 3.7-3.8 6.7-8.4 6.7-1 0-2-.14-2.9-.4L4.6 19.4l1.3-3.4c-1.1-1.2-1.8-2.7-1.8-4.4 0-3.7 3.8-6.7 8.4-6.7s7.9 3 7.9 6.7Z" />
    </>
  ),
};

export function WIco({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
  style,
}: {
  name: WIcoName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

// ==================== 状态栏与返回栏 ====================

/** 电波里每个页面顶部都有这一条，缺了会显得比其他页面少一截 */
export function StatusBar() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <div
      className="flex h-[34px] shrink-0 items-center justify-between px-5 text-[12px] font-semibold"
      style={{ color: W.ink }}
    >
      <span>{`${hh}:${mm}`}</span>
      <span className="flex items-center gap-[5px]">
        <span className="flex items-end gap-[2px]">
          {[3, 5, 7, 9].map((h, i) => (
            <i key={i} className="block w-[2px] rounded-sm" style={{ height: h, background: W.ink }} />
          ))}
        </span>
        <span
          className="relative inline-block h-[10px] w-[20px] rounded-[3px]"
          style={{ border: `1px solid ${W.ink}` }}
        >
          <i
            className="absolute inset-[1.5px] block rounded-[1px]"
            style={{ background: W.ink, width: '70%' }}
          />
        </span>
      </span>
    </div>
  );
}

/** 一级页的顶栏：左边返回（可选），中间标题，右边动作 */
export function TopBar({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 px-2" style={{ background: W.page }}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-[#F2F2F2]"
          style={{ color: W.ink }}
        >
          <WIco name="back" size={22} />
        </button>
      ) : (
        <span className="w-2 shrink-0" />
      )}
      <div className="min-w-0 flex-1" style={{ paddingLeft: onBack ? 0 : 6 }}>
        <div className="truncate text-[16px] font-semibold" style={{ color: W.ink }}>
          {title}
        </div>
        {subtitle ? (
          <div className="truncate text-[11px] leading-[14px]" style={{ color: W.sub }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">{right}</div>
    </div>
  );
}

/** 圆形图标按钮（顶栏动作） */
export function RoundIconButton({
  name,
  label,
  onClick,
  disabled,
  badge,
}: {
  name: WIcoName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full active:bg-[#F2F2F2] disabled:opacity-40"
      style={{ color: W.ink }}
    >
      <WIco name={name} size={21} />
      {badge ? (
        <i
          className="absolute right-[9px] top-[9px] block h-[6px] w-[6px] rounded-full"
          style={{ background: W.red }}
        />
      ) : null}
    </button>
  );
}

// ==================== 胶囊与开关 ====================

export function Pill({
  children,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-[32px] shrink-0 items-center whitespace-nowrap px-[13px] text-[12.5px] disabled:opacity-40"
      style={{
        borderRadius: R_PILL,
        background: active ? W.ink : W.fill,
        color: active ? '#FFFFFF' : W.ink,
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

/** 主按钮（黑胶囊） */
export function SolidButton({
  children,
  onClick,
  disabled,
  tone = 'ink',
  thin,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'ink' | 'red' | 'fill';
  thin?: boolean;
}) {
  const bg = tone === 'red' ? W.red : tone === 'fill' ? W.fill : W.ink;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center gap-1.5 text-[14px] font-medium disabled:opacity-40 ${
        thin ? 'h-[38px]' : 'h-[44px]'
      }`}
      style={{ borderRadius: R_PILL, background: bg, color: tone === 'fill' ? W.ink : '#FFFFFF' }}
    >
      {children}
    </button>
  );
}

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full transition-colors"
      style={{ background: on ? W.ink : '#D9D9D9' }}
    >
      <i
        className="absolute block h-[18px] w-[18px] rounded-full bg-white transition-all"
        style={{ left: on ? 21 : 3, boxShadow: '0 1px 2px rgba(0,0,0,.18)' }}
      />
    </button>
  );
}

/** 设置里的一行：左边标题与说明，右边控件 */
export function SettingRow({
  title,
  desc,
  right,
  onClick,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className="flex w-full items-center gap-3 px-4 py-[13px] text-left active:bg-[#F8F8F8]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px]" style={{ color: W.ink }}>
          {title}
        </div>
        {desc ? (
          <div className="mt-[2px] text-[11.5px] leading-[16px]" style={{ color: W.sub }}>
            {desc}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">{right}</div>
    </Tag>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-4 pb-1 pt-4 text-[11.5px] font-medium tracking-wide"
      style={{ color: W.sub }}
    >
      {children}
    </div>
  );
}

// ==================== 底部弹层 ====================

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  const Panel = (
    <div className="flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-[16px] bg-white">
      {title ? (
        <div className="flex h-[48px] shrink-0 items-center px-4">
          <span className="flex-1 text-[14px] font-semibold" style={{ color: W.ink }}>
            {title}
          </span>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full active:bg-[#F2F2F2]"
            style={{ color: W.sub }}
          >
            <WIco name="close" size={19} />
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer ? <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: W.line }}>{footer}</div> : null}
    </div>
  );
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,15,15,0.28)]"
      />
      <div className="relative">{Panel}</div>
    </div>
  );
}

// ==================== 其它 ====================

export function Avatar({
  src,
  name,
  size = 32,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  const hasImg = Boolean(src);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: W.fill, color: W.sub, fontSize: size * 0.42 }}
    >
      {hasImg ? (
        <TokenImg value={src || undefined} alt={name} className="h-full w-full object-cover" />
      ) : (
        (name || '?').slice(0, 1)
      )}
    </span>
  );
}

export function EmptyState({
  text,
  hint,
  action,
  onAction,
}: {
  text: string;
  hint?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="text-[13.5px]" style={{ color: W.ink }}>
        {text}
      </div>
      {hint ? (
        <div className="text-[11.5px] leading-[17px]" style={{ color: W.sub }}>
          {hint}
        </div>
      ) : null}
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex h-[36px] items-center px-[18px] text-[12.5px] font-medium"
          style={{ borderRadius: R_PILL, background: W.ink, color: '#fff' }}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

/** 人数：1234 → 1.2K */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`;
}

/** 相对时间：刚刚 / 3 分钟前 / 昨天 / 10月20日 */
export function timeAgo(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 172_800_000) return '昨天';
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 输入框（陪看自己的，不走主聊天那套） */
export function WatchInput({
  value,
  onChange,
  placeholder,
  onSend,
  disabled,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSend?: () => void;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const common = {
    value,
    placeholder,
    disabled,
    'aria-label': placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: 'w-full bg-transparent text-[13.5px] outline-none placeholder:text-[#909090]',
    style: { color: W.ink } as React.CSSProperties,
  };
  return multiline ? (
    <textarea {...common} rows={1} className={`${common.className} resize-none leading-[20px]`} />
  ) : (
    <input {...common} onKeyDown={e => { if (e.key === 'Enter' && onSend) onSend(); }} />
  );
}
