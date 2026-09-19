import React, { useEffect, useState } from 'react';
import { X, FilmStrip } from '@phosphor-icons/react';
import { extractVideoCoverDataUrl, readVideoDurationSec } from '../../utils/videoCoverFrame';

interface Props {
  file: File;
  open: boolean;
  onClose: () => void;
  onSend: (noteRaw: string) => void;
}

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const ChatVideoSendSheet: React.FC<Props> = ({ file, open, onClose, onSend }) => {
  const [note, setNote] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setNote('');
    setCover(null);
    setDurationSec(null);
    extractVideoCoverDataUrl(file).then(setCover).catch(() => setCover(null));
    readVideoDurationSec(file).then(setDurationSec).catch(() => setDurationSec(null));
  }, [file, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-700">
            <FilmStrip className="w-5 h-5 text-violet-500" weight="bold" />
            <span className="font-bold text-sm">发视频</span>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex gap-3">
            <div className="w-24 h-32 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
              {cover ? (
                <img src={cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 px-2 text-center">封面预览</div>
              )}
            </div>
            <div className="text-[11px] text-slate-500 space-y-1 pt-1 min-w-0">
              <p className="font-medium text-slate-700 truncate" title={file.name}>{file.name}</p>
              <p>{formatMb(file.size)}{durationSec != null ? ` · 约 ${Math.round(durationSec)} 秒` : ''}</p>
              <p className="text-slate-400 leading-relaxed">发送后回到聊天识别；可把小红书/抖音分享文案贴到下面，会自动洗标题。</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">分享文案（可选）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="粘贴分享标题/文案，或留空用文件名"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm leading-relaxed focus:bg-white focus:border-violet-200 outline-none resize-none"
            />
          </div>
        </div>

        <div className="px-5 pb-6 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onSend(note)}
            className="w-full py-3 rounded-2xl bg-violet-500 text-white font-bold text-sm shadow-lg shadow-violet-200 active:scale-[0.98] transition-transform"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatVideoSendSheet;
