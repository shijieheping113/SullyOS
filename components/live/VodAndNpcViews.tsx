/**
 * VOD 视频详情页（分段进度条 + 飘屏弹幕 + 楼层评论翻牌 + 编辑/重Roll）
 * 与 NPC 陪看双人房视图（上屏辅助模型演奇葩 NPC + 下屏主模型演 Char 吐槽咬耳朵）
 */
import React, { useState } from 'react';
import {
  StreamerChannelProfile,
  ViewerPersona,
  VodVideoPost,
  VodCommentItem,
  NpcWatchSession,
  DanmakuTranslateMode,
} from '../../utils/liveStreamTypes';

export const VodDetailView: React.FC<{
  vod: VodVideoPost;
  channel: StreamerChannelProfile;
  activePersona: ViewerPersona;
  translateMode: DanmakuTranslateMode;
  busy: boolean;
  onBack: () => void;
  onPlayTts: (text: string) => void;
  onOpenPersonaModal: () => void;
  onUpdateVod: (next: VodVideoPost) => void;
  onRequestStreamerReply: (comment: VodCommentItem) => void;
  onShareToChat: () => void;
}> = ({
  vod,
  channel,
  activePersona,
  translateMode,
  busy,
  onBack,
  onPlayTts,
  onOpenPersonaModal,
  onUpdateVod,
  onRequestStreamerReply,
  onShareToChat,
}) => {
  const [chapterIdx, setChapterIdx] = useState(0);
  const [commentInput, setCommentInput] = useState('');
  const [editingChapter, setEditingChapter] = useState(false);
  const [editScreen, setEditScreen] = useState('');
  const [editSpeech, setEditSpeech] = useState('');
  const [editTrans, setEditTrans] = useState('');

  const curChapter = vod.chapters[chapterIdx] || vod.chapters[0];

  const startEditChapter = () => {
    if (!curChapter) return;
    setEditScreen(curChapter.screen);
    setEditSpeech(curChapter.speechOriginal);
    setEditTrans(curChapter.speechTranslated || '');
    setEditingChapter(true);
  };

  const saveEditChapter = () => {
    if (!curChapter) return;
    const nextChapters = vod.chapters.map((c, i) =>
      i === chapterIdx
        ? { ...c, screen: editScreen.trim(), speechOriginal: editSpeech.trim(), speechTranslated: editTrans.trim() || undefined }
        : c,
    );
    onUpdateVod({ ...vod, chapters: nextChapters });
    setEditingChapter(false);
  };

  const handleSendComment = () => {
    if (!commentInput.trim()) return;
    const newComment: VodCommentItem = {
      id: `vcm_u_${Date.now()}`,
      authorName: activePersona.name,
      viewerPersonaId: activePersona.id,
      isUserMain: activePersona.isMain,
      isUserAlt: !activePersona.isMain,
      fanBadge: activePersona.badgeText || channel.fanBadgeName,
      fanLevel: activePersona.fanLevel,
      content: commentInput.trim(),
      likes: 1,
      replies: [],
      timestamp: Date.now(),
    };
    const nextVod = { ...vod, comments: [newComment, ...vod.comments] };
    onUpdateVod(nextVod);
    setCommentInput('');
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-900 border-b border-zinc-800">
        <button onClick={onBack} className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300">← 返回</button>
        <div className="text-xs font-bold truncate max-w-[180px]">{vod.title}</div>
        <button onClick={onShareToChat} className="text-xs px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/30">
          转发私聊
        </button>
      </div>

      {/* 16:9 视频分镜取景框 */}
      {curChapter && (
        <div className="relative p-4 border-b border-zinc-800" style={{ background: vod.coverGradient }}>
          <div className="flex items-center justify-between text-[11px] text-white/80 mb-2">
            <span className="px-2 py-0.5 rounded bg-black/40 font-mono">
              {curChapter.timestampLabel} · {curChapter.chapterTitle}
            </span>
            <div className="flex items-center gap-1.5">
              {curChapter.speechOriginal && (
                <button
                  onClick={() => onPlayTts(curChapter.speechOriginal)}
                  className="px-2 py-0.5 rounded bg-black/50 hover:bg-black/70 text-emerald-300"
                >
                  🔊 听原声
                </button>
              )}
              <button onClick={startEditChapter} className="px-2 py-0.5 rounded bg-black/50 text-zinc-200">
                ✏️ 编辑本段
              </button>
            </div>
          </div>

          {/* 飘屏弹幕 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(curChapter.danmaku || []).map(d => (
              <span key={d.id} className="text-[11px] px-2 py-0.5 rounded-full bg-black/45 text-white/90 backdrop-blur-xs">
                {translateMode === 'zh_only' && d.translation ? d.translation : d.text}
                {translateMode === 'bilingual' && d.translation ? ` (${d.translation})` : ''}
              </span>
            ))}
          </div>

          {editingChapter ? (
            <div className="space-y-2 bg-black/60 p-3 rounded-xl text-xs">
              <textarea
                rows={2}
                value={editScreen}
                onChange={e => setEditScreen(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                placeholder="分镜画面描写"
              />
              <input
                value={editSpeech}
                onChange={e => setEditSpeech(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                placeholder="主播原声台词"
              />
              <input
                value={editTrans}
                onChange={e => setEditTrans(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-amber-200"
                placeholder="同传译文（可选）"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingChapter(false)} className="px-3 py-1 rounded bg-zinc-800">取消</button>
                <button onClick={saveEditChapter} className="px-3 py-1 rounded bg-rose-600 text-white font-bold">保存</button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-100/95 bg-black/35 rounded-xl p-3 leading-relaxed">
                <span className="text-rose-300 font-bold mr-1">[画面]</span>
                {curChapter.screen}
              </div>
              {curChapter.speechOriginal && (
                <div className="mt-2.5 bg-black/65 rounded-xl px-3 py-2 border-l-2 border-rose-500">
                  <div className="text-xs font-medium text-white">「{curChapter.speechOriginal}」</div>
                  {curChapter.speechTranslated && translateMode !== 'original_only' && (
                    <div className="text-[11px] text-amber-300/95 mt-0.5">
                      【同传字幕】{curChapter.speechTranslated}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 时间轴章节切换条 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-3 mt-2">
            {vod.chapters.map((ch, idx) => (
              <button
                key={ch.id}
                onClick={() => setChapterIdx(idx)}
                className={`px-2.5 py-1 rounded-lg text-[11px] shrink-0 transition ${
                  idx === chapterIdx ? 'bg-rose-600 text-white font-bold' : 'bg-black/45 text-zinc-300'
                }`}
              >
                {ch.timestampLabel} {ch.chapterTitle}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 评论区与盖楼 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
            <span>UP主：{channel.channelName} · 播放 {vod.viewsCount} · 硬币 {vod.coinsCount}</span>
            <span className="text-rose-400 font-semibold">置顶碎碎念</span>
          </div>
          <div className="text-zinc-200">{vod.streamerPinNote}</div>
        </div>

        <div className="text-xs font-bold text-zinc-400">评论区（{vod.comments.length}）</div>

        {vod.comments.map(c => (
          <div key={c.id} className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-zinc-200">{c.authorName}</span>
                {c.isUserMain && <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-600/30 text-emerald-300">我的大号</span>}
                {c.isUserAlt && <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-600/30 text-violet-300">我的小号马甲</span>}
                {c.likedByStreamer && <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">UP主觉得很赞</span>}
              </div>
              <button
                disabled={busy}
                onClick={() => onRequestStreamerReply(c)}
                className="text-[11px] text-amber-400 hover:underline disabled:opacity-40"
              >
                {c.replies.length > 0 ? '🔄 重Roll翻牌' : '✨ 让UP主翻牌回复'}
              </button>
            </div>

            <div className="text-zinc-100">{c.content}</div>
            {c.translation && translateMode !== 'original_only' && (
              <div className="text-[11px] text-zinc-400">译：{c.translation}</div>
            )}

            {c.replies.map(r => (
              <div key={r.id} className="mt-2 pl-2.5 border-l-2 border-rose-500/60 bg-zinc-950/60 p-2 rounded-lg">
                <span className="text-rose-400 font-bold">{r.authorName} (UP主)：</span>
                <span className="text-zinc-200">{r.content}</span>
                {r.translation && <div className="text-[11px] text-amber-300/90 mt-0.5">同传：{r.translation}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 底部发评论栏 */}
      <div className="p-2.5 bg-zinc-900 border-t border-zinc-800 flex items-center gap-2">
        <button
          onClick={onOpenPersonaModal}
          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 ${
            activePersona.isMain ? 'bg-emerald-600 text-white' : 'bg-violet-600 text-white'
          }`}
        >
          {activePersona.isMain ? '大号' : '马甲'}: {activePersona.name.slice(0, 4)}
        </button>
        <input
          value={commentInput}
          onChange={e => setCommentInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSendComment()}
          placeholder={`以「${activePersona.name}」发评论盖楼…`}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
        />
        <button onClick={handleSendComment} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold">
          发送
        </button>
      </div>
    </div>
  );
};

// ==================== NPC 陪看双人房视图 ====================

export const NpcWatchRoomView: React.FC<{
  npcSession: NpcWatchSession;
  charName: string;
  busy: boolean;
  onBack: () => void;
  onSwitchNextNpc: () => void;
  onNextNpcBeat: (text?: string, mode?: 'whisper_to_char' | 'send_npc_danmaku') => void;
  onRerollCharOnly: (beatIdx: number) => void;
  onPlayCharTts: (text: string) => void;
  onShareToChat: () => void;
}> = ({
  npcSession,
  charName,
  busy,
  onBack,
  onSwitchNextNpc,
  onNextNpcBeat,
  onRerollCharOnly,
  onPlayCharTts,
  onShareToChat,
}) => {
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState<'whisper_to_char' | 'send_npc_danmaku'>('whisper_to_char');

  const latestBeat = npcSession.beats[npcSession.beats.length - 1];

  const handleSend = () => {
    const t = inputText.trim();
    setInputText('');
    onNextNpcBeat(t || undefined, inputMode);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-900 border-b border-zinc-800">
        <button onClick={onBack} className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300">← 退出陪看</button>
        <div className="text-xs font-bold truncate">与 {charName} 陪看：{npcSession.npcStreamerName}</div>
        <div className="flex gap-1.5">
          <button onClick={onSwitchNextNpc} className="text-xs px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300">
            换一间刷
          </button>
          <button onClick={onShareToChat} className="text-xs px-2 py-1 rounded-lg bg-rose-600/20 text-rose-300">
            分享私聊
          </button>
        </div>
      </div>

      {/* 上半屏：辅助模型演的奇葩 NPC 直播画面 */}
      <div className="p-4 border-b border-zinc-800 space-y-2.5" style={{ background: npcSession.coverGradient }}>
        <div className="flex items-center justify-between text-[11px]">
          <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold">
            NPC LIVE · {npcSession.npcCategoryLabel}
          </span>
          <span className="text-zinc-200">{npcSession.npcRoomTitle}</span>
        </div>

        {latestBeat ? (
          <>
            <div className="text-xs bg-black/45 rounded-xl p-3 text-zinc-100 leading-relaxed">
              <span className="text-amber-300 font-bold mr-1">[NPC画面]</span>
              {latestBeat.npcScreen}
            </div>
            <div className="text-xs bg-black/65 rounded-xl px-3 py-2 text-white font-medium">
              {npcSession.npcStreamerName}：「{latestBeat.npcSpeech}」
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {latestBeat.npcDanmaku.map((dm, idx) => (
                <span key={idx} className="text-[11px] px-2 py-0.5 rounded-full bg-black/45 text-zinc-200">
                  {dm}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-xs text-zinc-300 py-6 text-center">点击下方「继续看下一拍」开始刷这个直播间</div>
        )}
      </div>

      {/* 下半屏：双人陪看沙发席（主模型演的 Char 实时吐槽与历史） */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-rose-400">🛋️ 身边 {charName} 的实时反应（主副模型双擎解耦）</span>
          <button
            disabled={busy}
            onClick={() => onNextNpcBeat()}
            className="text-xs px-3 py-1 rounded-lg bg-rose-600 text-white font-bold disabled:opacity-40"
          >
            {busy ? '推进中…' : '▶ 继续看下一拍'}
          </button>
        </div>

        {npcSession.beats.map((b, idx) => (
          <div key={b.id} className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs">
            {b.userActionNote && (
              <div className="text-[11px] text-emerald-300 bg-emerald-950/40 px-2.5 py-1 rounded-lg">
                你：{b.userActionNote}
              </div>
            )}
            <div className="text-zinc-400 italic">{b.charReactionAction}</div>
            <div className="flex items-center justify-between gap-2 bg-zinc-950 p-2.5 rounded-xl border-l-2 border-rose-500">
              <span className="text-zinc-100 font-medium">{charName}：「{b.charReactionSpeech}」</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onPlayCharTts(b.charReactionSpeech)}
                  className="px-2 py-0.5 rounded bg-zinc-800 text-emerald-300 text-[11px]"
                >
                  🔊
                </button>
                <button
                  disabled={busy}
                  onClick={() => onRerollCharOnly(idx)}
                  className="px-2 py-0.5 rounded bg-zinc-800 text-amber-300 text-[11px]"
                  title="只重Roll身边Char的吐槽反应"
                >
                  🔄 重Roll反应
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 底部互动栏 */}
      <div className="p-2.5 bg-zinc-900 border-t border-zinc-800 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setInputMode(m => (m === 'whisper_to_char' ? 'send_npc_danmaku' : 'whisper_to_char'))}
          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 ${
            inputMode === 'whisper_to_char' ? 'bg-pink-600 text-white' : 'bg-amber-600 text-white'
          }`}
        >
          {inputMode === 'whisper_to_char' ? `跟${charName.slice(0, 2)}咬耳朵` : '发NPC弹幕搞事'}
        </button>
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={
            inputMode === 'whisper_to_char'
              ? `凑近 ${charName} 小声吐槽这个主播…`
              : '在 NPC 直播间公屏发弹幕整活…'
          }
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
        />
        <button
          disabled={busy}
          onClick={handleSend}
          className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  );
};
