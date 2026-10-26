/**
 * 本场直播信息（可手改）。
 *
 * 房间里唯一能改「台上那一路底细」的地方：房间标题、主播网名与账号，以及
 * 结构化主播档案八个字段（年龄、身份定位、语言、画面形态、分区、体量、完整人设、
 * 开播动机），还有当前这一幕的画面和台词。改完就地生效——台上那一路下一轮读到的
 * 就是新的，已经生成的幕不重写，当前这一幕的文字立刻换掉。
 */
import React, { useEffect, useState } from 'react';
import { Sheet, SolidButton, W } from './chrome';
import {
  defaultStreamerProfile,
  type WatchAlongSession,
  type WatchRoom,
  type WatchStreamerLanguage,
  type WatchStreamerScreenForm,
  type WatchStreamerTier,
} from '../../utils/watchAlong/types';

const Field = ({
  label,
  hint,
  value,
  onChange,
  multiline,
  rows = 3,
  placeholder,
  mono,
  numeric,
  options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
  /** 数字输入：手机上弹数字键盘（年龄这种） */
  numeric?: boolean;
  /** 有它就渲染下拉，没有就按多行/单行输入框渲染 */
  options?: { value: string; label: string }[];
}) => (
  <div className="mt-3">
    <div className="mb-1 flex items-baseline gap-1.5">
      <span className="text-[11px]" style={{ color: W.sub }}>
        {label}
      </span>
      {hint ? (
        <span className="text-[9.5px]" style={{ color: W.faint }}>
          {hint}
        </span>
      ) : null}
    </div>
    {options ? (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="h-[34px] w-full px-3 text-[12.5px] outline-none"
        style={{ borderRadius: 10, background: W.fill, color: W.ink }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ) : multiline ? (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={label}
        className="w-full resize-none px-3 py-2 text-[12.5px] leading-[18px] outline-none placeholder:text-[#ADADAD]"
        style={{ borderRadius: 10, background: W.fill, color: W.ink }}
      />
    ) : (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        inputMode={numeric ? 'numeric' : undefined}
        className="h-[34px] w-full px-3 text-[12.5px] outline-none placeholder:text-[#ADADAD]"
        style={{
          borderRadius: 10,
          background: W.fill,
          color: W.ink,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        }}
      />
    )}
  </div>
);

const LANGUAGE_OPTIONS: { value: WatchStreamerLanguage; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日语' },
  { value: 'en', label: '英语' },
  { value: 'other', label: '其他' },
];

const SCREEN_FORM_OPTIONS: { value: WatchStreamerScreenForm; label: string }[] = [
  { value: 'game', label: '纯游戏或软件画面' },
  { value: 'vtuber', label: '虚拟形象' },
  { value: 'workbench', label: '桌面工作台' },
  { value: 'live', label: '真人出镜' },
  { value: 'outdoor', label: '户外移动' },
  { value: 'pet', label: '宠物' },
];

const TIER_OPTIONS: { value: WatchStreamerTier; label: string }[] = [
  { value: 'tiny', label: '个位数' },
  { value: 'mid', label: '几十到几百' },
  { value: 'big', label: '上万人' },
];

export function WatchInfo({
  open,
  session,
  onClose,
  onSave,
}: {
  open: boolean;
  session: WatchAlongSession;
  onClose: () => void;
  onSave: (next: { room: WatchRoom; scene: string; speech: string }) => void;
}) {
  const last = session.beats[session.beats.length - 1];
  const p = session.room.profile || defaultStreamerProfile();
  const [name, setName] = useState(session.room.streamerName);
  const [handle, setHandle] = useState(session.room.streamerHandle);
  const [category, setCategory] = useState(session.room.category);
  const [title, setTitle] = useState(session.room.title);
  const [bio, setBio] = useState(session.room.bio);
  const [ageBand, setAgeBand] = useState(String(p.ageBand ?? ''));
  const [identity, setIdentity] = useState(p.identity);
  const [language, setLanguage] = useState<WatchStreamerLanguage>(p.language);
  const [screenForm, setScreenForm] = useState<WatchStreamerScreenForm>(p.screenForm);
  const [tier, setTier] = useState<WatchStreamerTier>(p.tier);
  const [speechStyle, setSpeechStyle] = useState(p.speechStyle);
  const [motive, setMotive] = useState(p.motive);
  const [scene, setScene] = useState(last?.scene || '');
  const [speech, setSpeech] = useState(last?.speech || '');

  // 每次打开 / 换一场，都把表单对齐到本场当前的值
  useEffect(() => {
    if (!open) return;
    const cur = session.room.profile || defaultStreamerProfile();
    setName(session.room.streamerName);
    setHandle(session.room.streamerHandle);
    setCategory(session.room.category);
    setTitle(session.room.title);
    setBio(session.room.bio);
    setAgeBand(String(cur.ageBand ?? ''));
    setIdentity(cur.identity);
    setLanguage(cur.language);
    setScreenForm(cur.screenForm);
    setTier(cur.tier);
    setSpeechStyle(cur.speechStyle);
    setMotive(cur.motive);
    setScene(last?.scene || '');
    setSpeech(last?.speech || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session.id, last?.id]);

  return (
    <Sheet
      open={open}
      title="本场直播"
      onClose={onClose}
      footer={
        <SolidButton
          disabled={!name.trim() || !title.trim()}
          onClick={() =>
            onSave({
              room: {
                ...session.room,
                streamerName: name.trim().slice(0, 20),
                streamerHandle: handle.trim().slice(0, 24) || session.room.streamerHandle,
                category: category.trim().slice(0, 12) || '闲聊',
                title: title.trim().slice(0, 100),
                bio: bio.trim().slice(0, 1000),
                profile: {
                  ageBand: Number(ageBand.trim()) || ageBand.trim(),
                  identity: identity.trim(),
                  language,
                  screenForm,
                  category: category.trim().slice(0, 12) || '闲聊',
                  tier,
                  speechStyle: speechStyle.trim(),
                  motive: motive.trim(),
                },
              },
              scene: scene.trim(),
              speech: speech.trim(),
            })
          }
        >
          保存
        </SolidButton>
      }
    >
      <div className="px-4 pb-3">
        <div className="pt-1 text-[10.5px] leading-[16px]" style={{ color: W.faint }}>
          这些是台上那一路的底细，改完下一轮就按新的演。
        </div>

        <Field label="主播网名" value={name} onChange={setName} placeholder="主播叫什么" />
        <Field label="账号标识" value={handle} onChange={setHandle} placeholder="@handle" />
        <Field label="房间标题" value={title} onChange={setTitle} placeholder="主播随口写的一句话" />
        <Field label="年龄" value={ageBand} onChange={setAgeBand} numeric placeholder="比如 23" />
        <Field label="身份定位" value={identity} onChange={setIdentity} placeholder="比如 游戏主播、萌宠主播" />
        <Field
          label="语言"
          value={language}
          onChange={v => setLanguage(v as WatchStreamerLanguage)}
          options={LANGUAGE_OPTIONS}
        />
        <Field
          label="画面形态"
          value={screenForm}
          onChange={v => setScreenForm(v as WatchStreamerScreenForm)}
          options={SCREEN_FORM_OPTIONS}
        />
        <Field label="分区" value={category} onChange={setCategory} placeholder="比如 深夜塔罗" />
        <Field
          label="体量"
          value={tier}
          onChange={v => setTier(v as WatchStreamerTier)}
          options={TIER_OPTIONS}
        />
        <Field
          label="完整人设"
          value={speechStyle}
          onChange={setSpeechStyle}
          multiline
          rows={3}
          placeholder="身份性格与说话调性，比如 嘴硬心软、疯狂吐槽、社恐晚期"
        />
        <Field
          label="开播动机"
          value={motive}
          onChange={setMotive}
          multiline
          rows={3}
          placeholder="今晚为什么开播"
        />
        <Field
          label="主播人设与玩法"
          hint="脾气、手艺、跟观众怎么互动"
          value={bio}
          onChange={setBio}
          multiline
          rows={3}
          placeholder="手上活儿很稳，说话慢，观众能点单…"
        />

        <div className="mt-4 text-[11px] font-medium" style={{ color: W.ink }}>
          当前这一幕（第 {Math.max(1, last ? last.index + 1 : 1)} 幕）
        </div>
        <Field label="画面" value={scene} onChange={setScene} multiline rows={3} placeholder="画面里发生了什么" />
        <Field label="主播台词" value={speech} onChange={setSpeech} multiline rows={3} placeholder="主播说的这一句" />

        <div className="mt-3 rounded-[10px] px-3 py-2 text-[10.5px] leading-[16px]" style={{ background: W.soft, color: W.sub }}>
          只改当前这一幕的文字，不动已经生成的公屏弹幕；想整幕重来就用房间里的「下一幕」。
        </div>
      </div>
    </Sheet>
  );
}
