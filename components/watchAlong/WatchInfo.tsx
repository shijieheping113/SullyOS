/**
 * 本场直播信息（可手改）。
 *
 * 手册里没有明写，但房间里必须有一个地方能改：主播名、分区、房间标题、主播人设，
 * 以及当前这一幕的画面和台词。改完就地生效——台上那一路下一轮读到的就是新的，
 * 当前这一幕的文字也立刻换掉，不用重 roll 一整幕。
 */
import React, { useEffect, useState } from 'react';
import { Sheet, SolidButton, W } from './chrome';
import type { WatchAlongSession, WatchRoom } from '../../utils/watchAlong/types';

const Field = ({
  label,
  hint,
  value,
  onChange,
  multiline,
  rows = 3,
  placeholder,
  mono,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
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
    {multiline ? (
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
  const [name, setName] = useState(session.room.streamerName);
  const [handle, setHandle] = useState(session.room.streamerHandle);
  const [category, setCategory] = useState(session.room.category);
  const [title, setTitle] = useState(session.room.title);
  const [bio, setBio] = useState(session.room.bio);
  const [scene, setScene] = useState(last?.scene || '');
  const [speech, setSpeech] = useState(last?.speech || '');

  // 每次打开 / 换一场，都把表单对齐到本场当前的值
  useEffect(() => {
    if (!open) return;
    setName(session.room.streamerName);
    setHandle(session.room.streamerHandle);
    setCategory(session.room.category);
    setTitle(session.room.title);
    setBio(session.room.bio);
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
                title: title.trim().slice(0, 40),
                bio: bio.trim().slice(0, 200),
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

        <div className="mt-1 grid grid-cols-2 gap-2">
          <Field label="主播名" value={name} onChange={setName} placeholder="主播叫什么" />
          <Field label="分区" value={category} onChange={setCategory} placeholder="比如 深夜塔罗" />
        </div>
        <Field label="账号标识" value={handle} onChange={setHandle} placeholder="@handle" />
        <Field label="房间标题" value={title} onChange={setTitle} placeholder="主播随口写的一句话" />
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
