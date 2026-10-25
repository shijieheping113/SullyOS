/**
 * 陪看设置（跨场次共用，存在 live_kv）。
 *
 * 四块：小号、功能、总结、模型。
 * 模型那两块默认关着——关着就用主模型，开了才整路换过去，两边互不影响。
 */
import React, { useState } from 'react';
import {
  R_PILL,
  SectionLabel,
  SettingRow,
  StatusBar,
  Switch,
  TopBar,
  W,
  WIco,
} from './chrome';
import type {
  WatchAccount,
  WatchModelSlot,
  WatchSettings,
} from '../../utils/watchAlong/types';

const NumberStepper = ({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      aria-label={`${label}减`}
      onClick={() => onChange(Math.max(min, value - 1))}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[15px]"
      style={{ background: W.fill, color: W.ink }}
    >
      −
    </button>
    <span className="w-7 text-center text-[12.5px] tabular-nums" style={{ color: W.ink }}>
      {value}
    </span>
    <button
      type="button"
      aria-label={`${label}加`}
      onClick={() => onChange(Math.min(max, value + 1))}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[15px]"
      style={{ background: W.fill, color: W.ink }}
    >
      +
    </button>
  </div>
);

const AccountCard = ({
  title,
  hint,
  account,
  canSuggest,
  busy,
  onChange,
  onSuggest,
}: {
  title: string;
  hint: string;
  account: WatchAccount;
  canSuggest: boolean;
  busy: boolean;
  onChange: (next: WatchAccount) => void;
  onSuggest: () => void;
}) => (
  <div className="mx-4 mt-2 px-3 py-3" style={{ borderRadius: 12, background: W.soft }}>
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] font-medium" style={{ color: W.ink }}>
        {title}
      </span>
      {canSuggest ? (
        <button
          type="button"
          disabled={busy}
          onClick={onSuggest}
          className="inline-flex items-center gap-1 text-[11px] disabled:opacity-40"
          style={{ color: W.ink }}
        >
          <WIco name="rewrite" size={12} />
          {busy ? '起名中…' : '换个号'}
        </button>
      ) : null}
    </div>
    <div className="mt-2 flex gap-2">
      <input
        value={account.nickname}
        onChange={e => onChange({ ...account, nickname: e.target.value.slice(0, 12) })}
        aria-label={`${title}昵称`}
        placeholder="昵称"
        className="h-[34px] min-w-0 flex-1 px-3 text-[12.5px] outline-none"
        style={{ borderRadius: 9, background: '#fff', color: W.ink }}
      />
      <input
        value={account.number}
        onChange={e => onChange({ ...account, number: e.target.value.replace(/[^\d]/g, '').slice(0, 6) })}
        aria-label={`${title}编号`}
        placeholder="编号"
        className="h-[34px] w-[74px] shrink-0 px-3 text-[12.5px] tabular-nums outline-none"
        style={{ borderRadius: 9, background: '#fff', color: W.ink }}
      />
    </div>
    <div className="mt-1.5 text-[10.5px] leading-[15px]" style={{ color: W.sub }}>
      {hint}
    </div>
  </div>
);

const ModelBlock = ({
  title,
  desc,
  slot,
  onChange,
}: {
  title: string;
  desc: string;
  slot: WatchModelSlot;
  onChange: (next: WatchModelSlot) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ready = Boolean(slot.baseUrl.trim() && slot.model.trim());
  return (
    <div className="mx-4 mt-2 overflow-hidden" style={{ borderRadius: 12, background: W.soft }}>
      <SettingRow
        title={title}
        desc={slot.enabled ? (ready ? `用 ${slot.model}` : '还没填完整，暂时还是走主模型') : desc}
        right={<Switch on={slot.enabled} onChange={v => onChange({ ...slot, enabled: v })} label={title} />}
      />
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-1 px-4 pb-2.5 text-left text-[11px]"
        style={{ color: W.sub }}
      >
        <WIco name={open ? 'next' : 'next'} size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .16s ease' }} />
        {open ? '收起这几栏' : '填接口地址和模型名'}
      </button>
      {open ? (
        <div className="px-3 pb-3">
          {[
            { key: 'baseUrl' as const, label: '接口地址', placeholder: 'https://…/v1' },
            { key: 'apiKey' as const, label: '密钥', placeholder: 'sk-…' },
            { key: 'model' as const, label: '模型名', placeholder: '比如 gpt-4o-mini' },
          ].map(field => (
            <div key={field.key} className="mt-1.5">
              <div className="mb-1 text-[10.5px]" style={{ color: W.sub }}>
                {field.label}
              </div>
              <input
                value={slot[field.key]}
                onChange={e => onChange({ ...slot, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                aria-label={`${title}${field.label}`}
                className="h-[34px] w-full px-3 text-[12px] outline-none"
                style={{ borderRadius: 9, background: '#fff', color: W.ink }}
              />
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10.5px]" style={{ color: W.sub }}>
              温度 {(slot.temperature ?? 0.9).toFixed(1)}
            </span>
            <input
              type="range"
              min={0.2}
              max={1.4}
              step={0.1}
              value={slot.temperature ?? 0.9}
              onChange={e => onChange({ ...slot, temperature: Number(e.target.value) })}
              aria-label={`${title}温度`}
              className="w-[130px]"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export function WatchSettings({
  settings,
  userAccount,
  charAccount,
  charName,
  busyAccount,
  onBack,
  onChangeSettings,
  onChangeUserAccount,
  onChangeCharAccount,
  onSuggestAccount,
}: {
  settings: WatchSettings;
  userAccount: WatchAccount;
  charAccount: WatchAccount;
  charName: string;
  /** 正在给哪个号起名 */
  busyAccount: 'user' | 'char' | null;
  onBack: () => void;
  onChangeSettings: (next: WatchSettings) => void;
  onChangeUserAccount: (next: WatchAccount) => void;
  onChangeCharAccount: (next: WatchAccount) => void;
  onSuggestAccount: (target: 'user' | 'char') => void;
}) {
  const patch = (part: Partial<WatchSettings>) => onChangeSettings({ ...settings, ...part });

  return (
    <div className="flex h-full w-full flex-col" style={{ background: W.page, color: W.ink }}>
      <StatusBar />
      <TopBar title="陪看设置" subtitle="这些设置所有场次一起用" onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <SectionLabel>看直播用的小号</SectionLabel>
        <AccountCard
          title="我的陪看号"
          hint="公屏上就顶着这个名字，主播和网友只认它。"
          account={userAccount}
          canSuggest
          busy={busyAccount === 'user'}
          onChange={onChangeUserAccount}
          onSuggest={() => onSuggestAccount('user')}
        />
        <AccountCard
          title={`${charName}的陪看号`}
          hint="她自己起的名字，谁都不知道是本尊。"
          account={charAccount}
          canSuggest
          busy={busyAccount === 'char'}
          onChange={onChangeCharAccount}
          onSuggest={() => onSuggestAccount('char')}
        />

        <SectionLabel>功能</SectionLabel>
        <SettingRow
          title="进房就开着自主反应"
          desc="关掉的话，她只在你去找她、或者场面够高能时才动。"
          right={<Switch on={settings.autoReact} onChange={v => patch({ autoReact: v })} label="自主反应" />}
        />
        <SettingRow
          title="进房就把小人放出来"
          desc="收起也能在房间里再叫出来。"
          right={<Switch on={settings.petVisible} onChange={v => patch({ petVisible: v })} label="桌宠" />}
        />
        <SettingRow
          title="每幕公屏几条弹幕"
          desc="弹幕越多越热闹，也越费一点字数。"
          right={
            <NumberStepper
              label="弹幕条数"
              value={settings.danmakuPerBeat}
              min={2}
              max={6}
              onChange={v => patch({ danmakuPerBeat: v })}
            />
          }
        />

        <SectionLabel>总结</SectionLabel>
        <SettingRow
          title="自动压阶段摘要"
          desc="攒够幕数就在后台压一段，防止长局把字数撑爆。"
          right={<Switch on={settings.summaryAuto} onChange={v => patch({ summaryAuto: v })} label="自动总结" />}
        />
        <SettingRow
          title="攒够几幕压一次"
          right={
            <NumberStepper
              label="水位"
              value={settings.summaryBeatWaterline}
              min={3}
              max={20}
              onChange={v => patch({ summaryBeatWaterline: v })}
            />
          }
        />
        <SettingRow
          title="最近几幕留原文"
          desc="太近的几幕还没聊完，压了就记不清了。"
          right={
            <NumberStepper
              label="保留幕数"
              value={settings.summaryKeepRecent}
              min={2}
              max={10}
              onChange={v => patch({ summaryKeepRecent: v })}
            />
          }
        />
        <SettingRow
          title="退房自动写回顾"
          desc="关掉的话，退房时先空着，你可以自己写或再点重写。"
          right={<Switch on={settings.recapAuto} onChange={v => patch({ recapAuto: v })} label="自动回顾" />}
        />

        <SectionLabel>模型</SectionLabel>
        <div className="px-4 text-[10.5px] leading-[16px]" style={{ color: W.sub }}>
          不打开就都走主模型。打开哪一路，就只换那一路。
        </div>
        <ModelBlock
          title="台上主播"
          desc="演直播的那一路"
          slot={settings.stageModel}
          onChange={v => patch({ stageModel: v })}
        />
        <ModelBlock
          title={`${charName}`}
          desc="陪你看的那一路"
          slot={settings.charModel}
          onChange={v => patch({ charModel: v })}
        />

        <div className="mx-4 mt-5 rounded-[12px] px-3 py-2.5 text-[10.5px] leading-[16px]" style={{ background: W.soft, color: W.sub }}>
          总结与翻译固定走设置里的辅助模型；没配辅助模型时自动退回主模型。
        </div>
      </div>

      <div className="shrink-0 px-4 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="h-[42px] w-full text-[13.5px] font-medium"
          style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
        >
          好了
        </button>
      </div>
    </div>
  );
}
