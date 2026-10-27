/**
 * 陪看设置（跨场次共用，存在 live_kv）。
 *
 * 五块：陪你看的是谁、小号、功能（含语音）、总结、模型。
 * 模型那两块默认关着——关着就用主模型，开了才整路换过去，两边互不影响；
 * 开的时候从「设置里的 API 预设」里挑一条，不用再手抄地址和密钥。
 */
import React, { useRef, useState } from 'react';
import Modal from '../os/Modal';
import ModelPicker from '../settings/ModelPicker';
import {
  Avatar,
  R_PILL,
  SectionLabel,
  SettingRow,
  Switch,
  TopBar,
  W,
  WIco,
} from './chrome';
import type { ApiPreset, CharacterProfile } from '../../types';
import { normalizeApiBaseUrl, normalizeApiCredential } from '../../utils/apiConfigNormalize';
import { extractModelIds } from '../../utils/modelList';
import { safeResponseJson } from '../../utils/safeApi';
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
  presets,
  onChange,
}: {
  title: string;
  desc: string;
  slot: WatchModelSlot;
  presets: ApiPreset[];
  onChange: (next: WatchModelSlot) => void;
}) => {
  const [manual, setManual] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelFetchHint, setModelFetchHint] = useState<string | null>(null);
  const [showModelModal, setShowModelModal] = useState(false);
  const [pickerModel, setPickerModel] = useState('');
  const modelBeforePickerRef = useRef('');

  const picked = presets.find(p => p.config.baseUrl === slot.baseUrl && p.config.model === slot.model);
  const ready = Boolean(slot.baseUrl.trim() && slot.model.trim());

  const openModelPicker = () => {
    modelBeforePickerRef.current = slot.model;
    setPickerModel(slot.model);
    setShowModelModal(true);
  };

  const cancelModelPicker = () => {
    setPickerModel(modelBeforePickerRef.current);
    setShowModelModal(false);
  };

  const confirmModelPicker = (model: string) => {
    onChange({ ...slot, model });
    setShowModelModal(false);
  };

  const applyPreset = (p: ApiPreset) => {
    onChange({
      ...slot,
      baseUrl: p.config.baseUrl,
      apiKey: p.config.apiKey,
      model: p.config.model,
      temperature:
        typeof p.config.temperature === 'number' ? p.config.temperature : slot.temperature,
    });
    setPresetOpen(false);
  };

  const fetchModels = async () => {
    const baseUrl = normalizeApiBaseUrl(slot.baseUrl);
    const apiKey = normalizeApiCredential(slot.apiKey);
    if (!baseUrl) {
      setModelFetchHint('先填接口地址');
      return;
    }
    setModelFetchHint(null);
    setIsFetchingModels(true);
    try {
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await safeResponseJson(response);
      const models = extractModelIds(data);
      if (models.length > 0) {
        setFetchedModels(models);
        setModelFetchHint(null);
        openModelPicker();
      } else {
        setFetchedModels([]);
        setModelFetchHint('没拉到模型');
      }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      setFetchedModels([]);
      setModelFetchHint(`拉取失败${reason ? `：${reason}` : ''}`);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const presetRowPrimary = picked ? picked.name : slot.model.trim() || '还没选';
  const presetRowSecondary = picked ? picked.config.model || '没填模型' : null;

  return (
    <div className="mx-4 mt-2 overflow-hidden" style={{ borderRadius: 12, background: W.soft }}>
      <SettingRow
        title={title}
        desc={slot.enabled ? (ready ? `用 ${slot.model}` : '还没选模型，暂时还走主模型') : desc}
        right={<Switch on={slot.enabled} onChange={v => onChange({ ...slot, enabled: v })} label={title} />}
      />

      {slot.enabled ? (
        <div className="px-3 pb-3">
          <div className="mb-1.5 text-[10.5px]" style={{ color: W.sub }}>
            用哪一条
          </div>
          {presets.length ? (
            <div>
              <button
                type="button"
                onClick={() => setPresetOpen(v => !v)}
                className="flex w-full items-center gap-2 px-2.5 py-[7px] text-left"
                style={{ borderRadius: 9, background: '#fff', color: W.ink }}
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium leading-[14px]">{presetRowPrimary}</span>
                  {presetRowSecondary ? (
                    <span className="mt-[1px] block truncate text-[9.5px] leading-[12px]" style={{ color: W.faint }}>
                      {presetRowSecondary}
                    </span>
                  ) : null}
                </div>
                <WIco
                  name="next"
                  size={11}
                  style={{
                    flexShrink: 0,
                    color: W.faint,
                    transform: presetOpen ? 'rotate(90deg)' : 'none',
                    transition: 'transform .16s ease',
                  }}
                />
              </button>
              {presetOpen ? (
                <div
                  className="mt-1 overflow-y-auto"
                  style={{ maxHeight: 180, borderRadius: 9, background: '#fff' }}
                >
                  {presets.map(p => {
                    const on = picked?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="w-full px-2.5 py-[7px] text-left"
                        style={{
                          background: on ? W.ink : 'transparent',
                          color: on ? '#fff' : W.ink,
                        }}
                      >
                        <span className="block text-[11.5px] font-medium leading-[14px]">{p.name}</span>
                        <span
                          className="mt-[1px] block truncate text-[9.5px] leading-[12px]"
                          style={{ color: on ? 'rgba(255,255,255,.62)' : W.faint }}
                        >
                          {p.config.model || '没填模型'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-[10.5px] leading-[16px]" style={{ color: W.faint }}>
              设置里还没有存过 API 预设，先手填一次。
            </div>
          )}

          <button
            type="button"
            onClick={() => setManual(v => !v)}
            className="mt-2 flex items-center gap-1 text-[10.5px]"
            style={{ color: W.sub }}
          >
            <WIco
              name="next"
              size={11}
              style={{ transform: manual ? 'rotate(90deg)' : 'none', transition: 'transform .16s ease' }}
            />
            {manual ? '收起手填' : '手填地址和模型'}
          </button>

          {manual ? (
            <div className="mt-1.5">
              {[
                { key: 'baseUrl' as const, label: '接口地址', placeholder: 'https://…/v1' },
                { key: 'apiKey' as const, label: '密钥', placeholder: 'sk-…' },
              ].map(field => (
                <div key={field.key} className="mt-1.5">
                  <div className="mb-1 text-[10px]" style={{ color: W.sub }}>
                    {field.label}
                  </div>
                  <input
                    value={slot[field.key]}
                    onChange={e => onChange({ ...slot, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    aria-label={`${title}${field.label}`}
                    className="h-[32px] w-full px-3 text-[11.5px] outline-none"
                    style={{ borderRadius: 8, background: '#fff', color: W.ink }}
                  />
                </div>
              ))}
              <div className="mt-1.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px]" style={{ color: W.sub }}>
                    模型名
                  </span>
                  <button
                    type="button"
                    disabled={isFetchingModels}
                    onClick={() => void fetchModels()}
                    className="shrink-0 text-[10px] disabled:opacity-40"
                    style={{ color: W.ink }}
                  >
                    {isFetchingModels ? '拉取中' : '拉取模型'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={openModelPicker}
                  className="flex w-full items-center gap-2 px-2.5 py-[7px] text-left"
                  style={{ borderRadius: 9, background: '#fff', color: W.ink }}
                  aria-label={`${title}选择模型`}
                >
                  <span className="min-w-0 flex-1 truncate text-[11.5px]">
                    {slot.model.trim() || '还没选'}
                  </span>
                  <WIco
                    name="next"
                    size={11}
                    style={{ flexShrink: 0, color: W.faint, transform: 'rotate(90deg)' }}
                  />
                </button>
                {modelFetchHint ? (
                  <div className="mt-1 text-[10px] leading-[14px]" style={{ color: W.faint }}>
                    {modelFetchHint}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

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

      <Modal
        isOpen={showModelModal}
        title="选择模型"
        onClose={cancelModelPicker}
        zIndexClass="z-[260]"
      >
        <ModelPicker
          availableModels={fetchedModels}
          localModel={pickerModel}
          setLocalModel={setPickerModel}
          confirmModelPicker={confirmModelPicker}
        />
      </Modal>
    </div>
  );
};

export function WatchSettings({
  settings,
  companions,
  companionId,
  userAccount,
  charAccount,
  charName,
  presets,
  busyAccount,
  onBack,
  onPickCompanion,
  onChangeSettings,
  onChangeUserAccount,
  onChangeCharAccount,
  onSuggestAccount,
}: {
  settings: WatchSettings;
  /** 可以一起看的角色 */
  companions: CharacterProfile[];
  companionId: string;
  userAccount: WatchAccount;
  charAccount: WatchAccount;
  charName: string;
  /** 设置里存过的 API 预设 */
  presets: ApiPreset[];
  /** 正在给哪个号起名 */
  busyAccount: 'user' | 'char' | null;
  onBack: () => void;
  onPickCompanion: (id: string) => void;
  onChangeSettings: (next: WatchSettings) => void;
  onChangeUserAccount: (next: WatchAccount) => void;
  onChangeCharAccount: (next: WatchAccount) => void;
  onSuggestAccount: (target: 'user' | 'char') => void;
}) {
  const patch = (part: Partial<WatchSettings>) => onChangeSettings({ ...settings, ...part });

  return (
    <div className="flex h-full w-full flex-col" style={{ background: W.page, color: W.ink }}>
      <TopBar title="陪看设置" subtitle="这些设置所有场次一起用" onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <SectionLabel>陪你看的是谁</SectionLabel>
        <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto px-4">
          {companions.map(c => {
            const on = c.id === companionId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPickCompanion(c.id)}
                className="inline-flex shrink-0 flex-col items-center gap-1.5 px-2 py-2"
                style={{ borderRadius: 12, background: on ? W.ink : W.soft, minWidth: 68 }}
              >
                <Avatar src={c.avatar} name={c.name} size={34} />
                <span
                  className="max-w-[62px] truncate text-[11px]"
                  style={{ color: on ? '#fff' : W.sub, fontWeight: on ? 600 : 400 }}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="px-4 pt-1.5 text-[10.5px] leading-[16px]" style={{ color: W.sub }}>
          换人相当于换一本陪看记录：新角色的历史、小号、场次都跟着换，不会串。
        </div>

        <SectionLabel>直播平台上的账号</SectionLabel>
        <AccountCard
          title="我的账号"
          hint="公屏上就顶着这个名字，主播和网友只认它。"
          account={userAccount}
          canSuggest
          busy={busyAccount === 'user'}
          onChange={onChangeUserAccount}
          onSuggest={() => onSuggestAccount('user')}
        />
        <AccountCard
          title={`${charName}的账号`}
          hint={`${charName}在直播平台的号。公屏说话、打赏、上麦都用它。`}
          account={charAccount}
          canSuggest
          busy={busyAccount === 'char'}
          onChange={onChangeCharAccount}
          onSuggest={() => onSuggestAccount('char')}
        />

        <SectionLabel>功能</SectionLabel>
        <SettingRow
          title="进房就带着一起看"
          desc={`关着就自己先单看，进房后点右上角叫${charName}。`}
          right={<Switch on={settings.enterWithChar} onChange={v => patch({ enterWithChar: v })} label="进房带角色" />}
        />
        <SettingRow
          title="进房就开着自主反应"
          desc={`关掉的话，${charName}只在你去找、或者场面够高能时才动。`}
          right={<Switch on={settings.autoReact} onChange={v => patch({ autoReact: v })} label="自主反应" />}
        />
        <SettingRow
          title="进房就把小人放出来"
          desc="收起也能在房间里再叫出来。"
          right={<Switch on={settings.petVisible} onChange={v => patch({ petVisible: v })} label="桌宠" />}
        />
        <SettingRow
          title="语音自动念出来"
          desc={`开着的话，${charName}发语音条会自己合成并播放；关着就点一下才响。`}
          right={<Switch on={settings.voiceAuto} onChange={v => patch({ voiceAuto: v })} label="语音自动播放" />}
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
          不打开就都走主模型。打开哪一路，就只换那一路，从下面几条预设里挑。
        </div>
        <ModelBlock
          title="台上主播"
          desc="演直播的那一路"
          slot={settings.stageModel}
          presets={presets}
          onChange={v => patch({ stageModel: v })}
        />
        <ModelBlock
          title={charName}
          desc="陪你看的那一路"
          slot={settings.charModel}
          presets={presets}
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
