/**
 * 电波 (OnAir) —— 真实 YouTube & 真实 ニコニコ動画/生放送 的 VOD 视频页与双人陪看视图
 *
 * 彻底解决：
 * 1. 明亮通透的 16:9 播放器 + 点击画面显隐控制层 + 可自由拖动的时间轴进度条（绝不压死按键）。
 * 2. 画面描写与台词完整显示在播放器下方独立面板，绝不截断（无 line-clamp）。
 * 3. 长按菜单（BeatLongPressSheet）：点击台词直接播语音；长按任意章节或角色陪看反应弹出底部菜单（重新生成语音、下载 .mp3、编辑、重 Roll、转发卡片）。
 * 4. 内置真·私聊小窗（LiveFloatingPhone），随时切出原汁原味的私聊窗口。
 */
import React, { useState } from 'react';
import TokenImg from '../os/TokenImg';
import {
  StreamerChannelProfile,
  ViewerPersona,
  VodVideoPost,
  VodChapterBeat,
  VodCommentItem,
  NpcWatchSession,
  NpcWatchBeat,
  LivePlatformTheme,
} from '../../utils/liveStreamTypes';
import {
  normalizeBrightGradient,
  downloadVoiceAudioUrl,
} from '../../utils/liveStreamStorage';
import {
  FloatingDanmakuOverlay,
  LiveFloatingPhone,
  BeatLongPressSheet,
  BeatActionSheetTarget,
  useLongPressMenu,
} from './LiveSharedWidgets';

// ==================== 1. VOD 视频详情页（YouTube Watch Page / ニコニコ動画） ====================

interface VodDetailViewProps {
  charId: string;
  charName: string;
  charAvatar?: string;
  userName: string;
  channel: StreamerChannelProfile;
  vod: VodVideoPost;
  viewerPersonas: ViewerPersona[];
  activePersonaId: string;
  platformTheme: LivePlatformTheme;
  isGeneratingReplyId: string | null;
  ttsPlayingId: string | null;
  onChangePlatformTheme: (theme: LivePlatformTheme) => void;
  onSelectPersona: (id: string) => void;
  onOpenPersonaModal: () => void;
  onBack: () => void;
  onPlayChapterVoice: (ch: VodChapterBeat, options?: { skipCache?: boolean }) => void;
  onEditChapter: (
    chapterId: string,
    nextScreen: string,
    nextSpeech: string,
    nextTrans?: string,
  ) => void;
  onAddComment: (text: string) => void;
  onTriggerStreamerReply: (comment: VodCommentItem) => void;
  onShareVodToChat: () => void;
}

export const VodDetailView: React.FC<VodDetailViewProps> = ({
  charId,
  charName,
  charAvatar,
  userName,
  channel,
  vod,
  viewerPersonas,
  activePersonaId,
  platformTheme,
  isGeneratingReplyId,
  ttsPlayingId,
  onChangePlatformTheme,
  onOpenPersonaModal,
  onBack,
  onPlayChapterVoice,
  onEditChapter,
  onAddComment,
  onTriggerStreamerReply,
  onShareVodToChat,
}) => {
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [showPlayerControls, setShowPlayerControls] = useState(false);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [commentInput, setCommentInput] = useState('');
  const [showFloatingPhone, setShowFloatingPhone] = useState(false);
  const [actionSheetTarget, setActionSheetTarget] = useState<BeatActionSheetTarget | null>(null);
  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();

  const currentChapter: VodChapterBeat | undefined =
    vod.chapters[activeChapterIdx] || vod.chapters[0];
  const activePersona =
    viewerPersonas.find(p => p.id === activePersonaId) || viewerPersonas[0];
  const displayAvatar = channel.avatar || charAvatar;
  const brightGradient = normalizeBrightGradient(vod.coverGradient || channel.bannerGradient);
  const isNico = platformTheme === 'niconico';

  const openChapterMenu = (ch: VodChapterBeat, idx: number) => {
    setActionSheetTarget({
      title: `章节 ${idx + 1} (${ch.timestampLabel}) · ${ch.chapterTitle}`,
      screen: ch.screen,
      speechOriginal: ch.speechOriginal,
      speechTranslated: ch.speechTranslated,
      audioUrl: ch.audioUrl,
      canPlayVoice: Boolean(ch.speechOriginal?.trim()),
      canEdit: true,
      canShareClip: true,
      onPlayVoice: () => onPlayChapterVoice(ch),
      onRetryVoice: () => onPlayChapterVoice(ch, { skipCache: true }),
      onDownloadVoice: () => {
        if (ch.audioUrl) {
          void downloadVoiceAudioUrl(ch.audioUrl, `${vod.title}_ch${idx + 1}`);
        } else {
          onPlayChapterVoice(ch);
        }
      },
      onSaveEdit: (nextScreen, nextSpeech, nextTrans) => {
        onEditChapter(ch.id, nextScreen, nextSpeech, nextTrans);
      },
      onShareClip: onShareVodToChat,
    });
  };

  const cleanTrans = currentChapter?.speechTranslated
    ? currentChapter.speechTranslated.replace(/^译[：:]\s*/, '').trim()
    : '';

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden ${isNico ? 'bg-[#f4f4f4]' : 'bg-white'}`}>
      {/* 顶栏 */}
      {isNico ? (
        <header className="h-11 px-3 bg-[#252525] text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="px-2 py-1 rounded bg-[#383838] text-xs font-bold whitespace-nowrap shrink-0"
            >
              ← 戻る
            </button>
            <span className="text-xs font-bold truncate">📺 ニコニコ動画 · {vod.title}</span>
          </div>
          <button
            type="button"
            onClick={() => onChangePlatformTheme('youtube')}
            className="px-2 py-1 rounded bg-[#383838] text-[11px] font-bold whitespace-nowrap shrink-0"
          >
            切 YouTube
          </button>
        </header>
      ) : (
        <header className="h-11 px-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 font-bold shrink-0"
            >
              ←
            </button>
            <span className="text-xs font-bold text-[#0f0f0f] truncate">{vod.title}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowFloatingPhone(true)}
              className="px-2.5 py-1 rounded-full bg-[#f2f2f2] text-[#0f0f0f] text-[11px] font-bold whitespace-nowrap"
            >
              📱 私聊
            </button>
            <button
              type="button"
              onClick={() => onChangePlatformTheme('niconico')}
              className="px-2.5 py-1 rounded-full bg-[#f2f2f2] text-[#0f0f0f] text-[11px] font-bold whitespace-nowrap"
            >
              📺 切 NicoNico
            </button>
          </div>
        </header>
      )}

      {/* 16:9 明亮视频舞台（点击显隐控制层） */}
      <div
        className="relative w-full aspect-video shrink-0 overflow-hidden select-none"
        style={{
          background: vod.coverImageUrl || channel.roomBackgroundUrl ? '#f8fafc' : brightGradient,
        }}
        onClick={() => setShowPlayerControls(v => !v)}
      >
        {(vod.coverImageUrl || channel.roomBackgroundUrl) ? (
          <img
            src={vod.coverImageUrl || channel.roomBackgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {displayAvatar ? (
              <TokenImg
                src={displayAvatar}
                alt={channel.channelName}
                className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-xl"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white text-slate-800 flex items-center justify-center text-2xl font-extrabold shadow-xl">
                {channel.channelName.slice(0, 1)}
              </div>
            )}
          </div>
        )}

        {/* 左上角章节角标 */}
        <div className="pointer-events-none absolute top-2.5 left-3 right-3 flex items-center justify-between z-[14]">
          <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-bold">
            {currentChapter?.timestampLabel || '00:00'} · {currentChapter?.chapterTitle}
          </span>
          <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-mono">
            {vod.durationLabel}
          </span>
        </div>

        {/* 上半区无底色飘屏弹幕 */}
        <FloatingDanmakuOverlay
          danmakuList={currentChapter?.danmaku || []}
          showTranslation={showTranslation}
          visible={showDanmaku}
          platformTheme={platformTheme}
        />

        {/* 点击画面浮现的播放控制层 */}
        {showPlayerControls && (
          <div
            className="absolute inset-0 z-[20] bg-black/35 flex flex-col justify-between p-3"
            onClick={() => setShowPlayerControls(false)}
          >
            <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setShowDanmaku(v => !v)}
                className="px-2.5 py-1 rounded-full bg-white text-slate-900 text-xs font-bold whitespace-nowrap"
              >
                {showDanmaku ? '弹幕 ON' : '弹幕 OFF'}
              </button>
              <button
                type="button"
                onClick={() => setShowTranslation(v => !v)}
                className="px-2.5 py-1 rounded-full bg-white text-slate-900 text-xs font-bold whitespace-nowrap"
              >
                CC 译文
              </button>
            </div>

            <div className="flex items-center justify-center gap-6" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                disabled={activeChapterIdx <= 0}
                onClick={() => setActiveChapterIdx(i => Math.max(0, i - 1))}
                className="w-10 h-10 rounded-full bg-black/65 text-white flex items-center justify-center text-base font-bold disabled:opacity-35"
              >
                ⏮
              </button>
              <button
                type="button"
                onClick={() => currentChapter && onPlayChapterVoice(currentChapter)}
                className="w-12 h-12 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center text-base font-extrabold"
              >
                🔊
              </button>
              <button
                type="button"
                disabled={activeChapterIdx >= vod.chapters.length - 1}
                onClick={() => setActiveChapterIdx(i => Math.min(vod.chapters.length - 1, i + 1))}
                className="w-10 h-10 rounded-full bg-black/65 text-white flex items-center justify-center text-base font-bold disabled:opacity-35"
              >
                ⏭
              </button>
            </div>

            <div className="text-xs text-white font-bold">
              章节 {activeChapterIdx + 1} / {vod.chapters.length}
            </div>
          </div>
        )}
      </div>

      {/* 可拖动章节进度条 + 章节胶囊条 */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 shrink-0 space-y-1.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
            {currentChapter?.timestampLabel || '00:00'}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, vod.chapters.length - 1)}
            value={activeChapterIdx}
            onChange={e => setActiveChapterIdx(Number(e.target.value))}
            className="flex-1 h-1.5 rounded-lg cursor-pointer"
            style={{ accentColor: isNico ? '#0080ff' : '#ff0033' }}
          />
          <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
            {vod.durationLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {vod.chapters.map((ch, idx) => (
            <button
              type="button"
              key={ch.id}
              onClick={() => setActiveChapterIdx(idx)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition ${
                idx === activeChapterIdx
                  ? isNico
                    ? 'bg-[#0080ff] text-white'
                    : 'bg-[#0f0f0f] text-white'
                  : 'bg-[#f2f2f2] text-slate-700 hover:bg-slate-200'
              }`}
            >
              {ch.timestampLabel} {ch.chapterTitle}
            </button>
          ))}
        </div>
      </div>

      {/* 当前章节完整画面与台词卡片（点按播语音，长按弹操作菜单） */}
      {currentChapter && (
        <div
          {...bindLongPress(() => openChapterMenu(currentChapter, activeChapterIdx))}
          onClick={() => {
            if (wasLongPressTriggered()) return;
            if (currentChapter.speechOriginal?.trim()) {
              onPlayChapterVoice(currentChapter);
            }
          }}
          className="bg-slate-50 border-b border-slate-200 px-4 py-3 cursor-pointer shrink-0"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[13px] text-slate-600 leading-relaxed break-words">
                <span className="font-bold text-slate-800 mr-1.5">
                  🎬 分镜 {activeChapterIdx + 1}：
                </span>
                {currentChapter.screen}
              </div>
              {currentChapter.speechOriginal && (
                <div className="text-[14px] font-bold text-slate-900 leading-relaxed break-words">
                  <span className="inline-block px-1.5 py-0.5 mr-1.5 rounded bg-slate-200 text-slate-700 text-[10px]">
                    {ttsPlayingId === currentChapter.id ? '🔊 朗读中' : '🔊 点按听语音'}
                  </span>
                  「{currentChapter.speechOriginal}」
                </div>
              )}
              {showTranslation && cleanTrans && cleanTrans !== currentChapter.speechOriginal && (
                <div className="text-xs text-sky-700">{cleanTrans}</div>
              )}
            </div>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChapterMenu(currentChapter, activeChapterIdx);
              }}
              className="w-7 h-7 rounded-full hover:bg-slate-200 text-slate-500 flex items-center justify-center text-base font-bold shrink-0"
            >
              ⋮
            </button>
          </div>
        </div>
      )}

      {/* 下方评论区列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-white p-3.5 space-y-3">
        {/* 视频标题与创作者置顶说明 */}
        <div className="pb-2.5 border-b border-slate-100 space-y-1.5">
          <h1 className="text-[15px] font-bold text-[#0f0f0f] leading-snug break-words">
            {vod.title}
          </h1>
          <div className="flex items-center justify-between text-xs text-[#606060]">
            <span>
              {vod.viewsCount.toLocaleString()} views · 👍 {vod.likesCount.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={onShareVodToChat}
              className="px-2.5 py-1 rounded-full bg-[#f2f2f2] text-[#0f0f0f] font-bold whitespace-nowrap"
            >
              📤 分享到私聊
            </button>
          </div>
          {vod.streamerPinnedNote && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <span className="font-bold text-slate-900 mr-1">📌 {channel.channelName} 置顶：</span>
              {vod.streamerPinnedNote}
            </div>
          )}
        </div>

        {/* 评论列表 */}
        <div className="space-y-3">
          <div className="text-xs font-extrabold text-slate-800">
            Comments ({vod.comments.length})
          </div>
          {vod.comments.map(cm => (
            <div key={cm.id} className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">
                    {cm.authorName.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{cm.authorName}</span>
                  {cm.fanBadge && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[10px]">
                      {cm.fanBadge}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isGeneratingReplyId === cm.id}
                  onClick={() => onTriggerStreamerReply(cm)}
                  className="text-[11px] font-bold text-red-600 hover:underline whitespace-nowrap"
                >
                  {isGeneratingReplyId === cm.id
                    ? '创作者回复中…'
                    : cm.replies.length > 0
                    ? '🎲 重Roll创作者回复'
                    : '💬 让创作者翻牌回复'}
                </button>
              </div>

              <div className="text-[13px] text-slate-800 leading-relaxed break-words">
                {cm.content}
              </div>

              {cm.replies.map(rp => (
                <div
                  key={rp.id}
                  className="ml-3 pl-3 border-l-2 border-red-400 py-1 space-y-0.5 text-xs bg-white rounded-r-xl pr-2"
                >
                  <div className="font-bold text-red-600">
                    {rp.authorName} <span className="px-1 rounded bg-red-50 text-[10px]">Creator</span>
                  </div>
                  <div className="text-slate-800 leading-relaxed">{rp.content}</div>
                  {rp.translation && (
                    <div className="text-sky-700 text-[11px]">
                      {rp.translation.replace(/^译[：:]\s*/, '')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 底部写评论栏 */}
      <div className="px-3 py-2 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenPersonaModal}
          className="px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold whitespace-nowrap shrink-0"
        >
          {activePersona?.isMain ? '本尊' : '小号'} · {activePersona?.name}
        </button>
        <input
          value={commentInput}
          onChange={e => setCommentInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && commentInput.trim()) {
              onAddComment(commentInput.trim());
              setCommentInput('');
            }
          }}
          placeholder="Add a comment…"
          className="flex-1 min-w-0 px-3.5 py-2 rounded-full bg-[#f2f2f2] text-sm text-[#0f0f0f] focus:outline-none"
        />
        <button
          type="button"
          disabled={!commentInput.trim()}
          onClick={() => {
            if (!commentInput.trim()) return;
            onAddComment(commentInput.trim());
            setCommentInput('');
          }}
          className="px-3.5 py-2 rounded-full bg-[#0f0f0f] text-white text-xs font-bold whitespace-nowrap disabled:opacity-40"
        >
          评论
        </button>
      </div>

      <LiveFloatingPhone
        isOpen={showFloatingPhone}
        characterId={charId}
        charName={charName}
        contextDescription={`【看视频私聊】此刻 ${userName} 正在观看你的视频投稿《${vod.title}》，并用手机私聊找你聊天。`}
        onClose={() => setShowFloatingPhone(false)}
      />
      <BeatLongPressSheet
        target={actionSheetTarget}
        onClose={() => setActionSheetTarget(null)}
      />
    </div>
  );
};

// ==================== 2. 双人陪刷其他 NPC 主播视图（Watch Together / ミラー視聴） ====================

interface NpcWatchRoomViewProps {
  charId: string;
  charName: string;
  charAvatar?: string;
  userName: string;
  npcSession: NpcWatchSession;
  platformTheme: LivePlatformTheme;
  isGenerating: boolean;
  isRerollingBeatId: string | null;
  ttsPlayingId: string | null;
  onChangePlatformTheme: (theme: LivePlatformTheme) => void;
  onBack: () => void;
  onAdvanceBeat: (userText?: string, mode?: 'whisper_char' | 'send_npc_danmaku') => void;
  onRerollCharReaction: (beat: NpcWatchBeat) => void;
  onPlayCharVoice: (beat: NpcWatchBeat, options?: { skipCache?: boolean }) => void;
  onShareNpcWatchToChat: () => void;
}

export const NpcWatchRoomView: React.FC<NpcWatchRoomViewProps> = ({
  charId,
  charName,
  charAvatar,
  userName,
  npcSession,
  platformTheme,
  isGenerating,
  isRerollingBeatId,
  ttsPlayingId,
  onChangePlatformTheme,
  onBack,
  onAdvanceBeat,
  onRerollCharReaction,
  onPlayCharVoice,
  onShareNpcWatchToChat,
}) => {
  const [currentBeatIdx, setCurrentBeatIdx] = useState(
    Math.max(0, npcSession.beats.length - 1),
  );
  const [inputMode, setInputMode] = useState<'whisper_char' | 'send_npc_danmaku'>('whisper_char');
  const [inputText, setInputText] = useState('');
  const [showFloatingPhone, setShowFloatingPhone] = useState(false);
  const [actionSheetTarget, setActionSheetTarget] = useState<BeatActionSheetTarget | null>(null);
  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();

  // 当新拍生成时跳到最新拍
  React.useEffect(() => {
    if (npcSession.beats.length > 0) {
      setCurrentBeatIdx(npcSession.beats.length - 1);
    }
  }, [npcSession.beats.length]);

  const currentBeat: NpcWatchBeat | undefined =
    npcSession.beats[currentBeatIdx] || npcSession.beats[npcSession.beats.length - 1];
  const brightGradient = normalizeBrightGradient(npcSession.coverGradient);
  const isNico = platformTheme === 'niconico';

  const openNpcBeatMenu = (beat: NpcWatchBeat) => {
    setActionSheetTarget({
      title: `${charName} 的陪看反应 (#${beat.index + 1})`,
      screen: beat.charReactionAction,
      speechOriginal: beat.charReactionSpeech,
      audioUrl: beat.charAudioUrl,
      canPlayVoice: Boolean(beat.charReactionSpeech?.trim()),
      canRerollChunk: true,
      canShareClip: true,
      onPlayVoice: () => onPlayCharVoice(beat),
      onRetryVoice: () => onPlayCharVoice(beat, { skipCache: true }),
      onDownloadVoice: () => {
        if (beat.charAudioUrl) {
          void downloadVoiceAudioUrl(beat.charAudioUrl, `${charName}_watch_${beat.index + 1}`);
        } else {
          onPlayCharVoice(beat);
        }
      },
      onRerollChunk: () => onRerollCharReaction(beat),
      onShareClip: onShareNpcWatchToChat,
    });
  };

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden ${isNico ? 'bg-[#f4f4f4]' : 'bg-white'}`}>
      {/* 顶栏 */}
      <header
        className={`h-11 px-3 flex items-center justify-between gap-2 shrink-0 border-b ${
          isNico ? 'bg-[#252525] border-[#333] text-white' : 'bg-white border-slate-200 text-[#0f0f0f]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="px-2 py-1 rounded text-xs font-bold whitespace-nowrap shrink-0"
          >
            ← 返回
          </button>
          <span className="text-xs font-bold truncate">
            🛋️ 与 {charName} 陪看：{npcSession.npcRoomTitle}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowFloatingPhone(true)}
            className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold whitespace-nowrap"
          >
            📱 私聊
          </button>
          <button
            type="button"
            onClick={() => onChangePlatformTheme(isNico ? 'youtube' : 'niconico')}
            className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold whitespace-nowrap"
          >
            {isNico ? '切 YouTube' : '切 Nico'}
          </button>
        </div>
      </header>

      {/* 16:9 明亮 NPC 直播舞台 */}
      <div
        className="relative w-full aspect-video shrink-0 overflow-hidden select-none flex flex-col items-center justify-center"
        style={{ background: brightGradient }}
      >
        <div className="pointer-events-none absolute top-2.5 left-3 right-3 flex items-center justify-between z-[14]">
          <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-bold">
            LIVE · {npcSession.npcStreamerName} ({npcSession.npcCategoryLabel})
          </span>
          <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[11px]">
            👁 {npcSession.viewerCount}
          </span>
        </div>

        <div className="w-16 h-16 rounded-full bg-white/90 border-4 border-white shadow-lg flex items-center justify-center text-xl font-extrabold text-slate-800">
          {npcSession.npcStreamerName.slice(0, 1)}
        </div>
        <div className="mt-1.5 px-3 py-0.5 rounded-full bg-white/80 text-slate-800 text-xs font-bold">
          {npcSession.npcStreamerName}
        </div>

        <FloatingDanmakuOverlay
          danmakuList={currentBeat?.npcDanmaku || []}
          visible={true}
          platformTheme={platformTheme}
        />
      </div>

      {/* 进度条与下一拍按钮 */}
      <div className="px-3 py-1.5 bg-white border-b border-slate-200 flex items-center gap-2.5 shrink-0">
        <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
          {npcSession.beats.length > 0 ? currentBeatIdx + 1 : 0}/{npcSession.beats.length}拍
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, npcSession.beats.length - 1)}
          value={currentBeatIdx}
          onChange={e => setCurrentBeatIdx(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-lg cursor-pointer accent-[#ff0033]"
        />
        <button
          type="button"
          disabled={isGenerating}
          onClick={() => onAdvanceBeat()}
          className="px-3 py-1 rounded-full bg-[#ff0033] text-white text-xs font-bold whitespace-nowrap disabled:opacity-50"
        >
          {isGenerating ? '生成中…' : '✨ 继续看下一拍'}
        </button>
      </div>

      {/* 主内容区：屏幕里的 NPC 实况 + 身边 Char 的陪看吐槽 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 bg-slate-50/50">
        {currentBeat ? (
          <>
            {/* 1. 屏幕里的 NPC 主播正在演什么 */}
            <div className="rounded-2xl bg-white border border-slate-200 p-3.5 space-y-1.5 shadow-sm">
              <div className="text-xs font-bold text-slate-400">
                📺 屏幕里的主播「{npcSession.npcStreamerName}」
              </div>
              <div className="text-[13px] text-slate-600 leading-relaxed break-words">
                {currentBeat.npcScreen}
              </div>
              <div className="text-[14px] font-bold text-slate-900 leading-relaxed break-words">
                「{currentBeat.npcSpeech}」
              </div>
            </div>

            {/* 2. 身边 Char 的陪看反应（点击播语音，长按弹菜单重Roll/下载语音） */}
            <div
              {...bindLongPress(() => openNpcBeatMenu(currentBeat))}
              onClick={() => {
                if (wasLongPressTriggered()) return;
                onPlayCharVoice(currentBeat);
              }}
              className="rounded-2xl bg-white border-2 border-red-200 p-3.5 space-y-2 shadow-sm cursor-pointer transition hover:border-red-300"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {charAvatar ? (
                    <TokenImg
                      src={charAvatar}
                      alt={charName}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {charName.slice(0, 1)}
                    </div>
                  )}
                  <span className="text-xs font-extrabold text-slate-900 truncate">
                    身边陪看的 {charName}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-bold whitespace-nowrap">
                    {ttsPlayingId === currentBeat.id ? '🔊 朗读中' : '🔊 点按听语音'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    openNpcBeatMenu(currentBeat);
                  }}
                  className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center text-base font-bold shrink-0"
                  title="长按或点击打开操作菜单"
                >
                  ⋮
                </button>
              </div>

              {currentBeat.userActionNote && (
                <div className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-600">
                  你刚才{currentBeat.userActionNote}
                </div>
              )}

              <div className="text-[13px] text-slate-600 leading-relaxed break-words">
                {currentBeat.charReactionAction}
              </div>

              <div className="text-[14px] font-bold text-slate-900 leading-relaxed break-words">
                {isRerollingBeatId === currentBeat.id
                  ? '正在重新生成反应…'
                  : `「${currentBeat.charReactionSpeech}」`}
              </div>
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs">
            正在进入直播间…
          </div>
        )}
      </div>

      {/* 底部互动栏：跟身边角色咬耳朵 vs 往直播间发弹幕 */}
      <div className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() =>
            setInputMode(m => (m === 'whisper_char' ? 'send_npc_danmaku' : 'whisper_char'))
          }
          className={`px-2.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
            inputMode === 'whisper_char'
              ? 'bg-slate-900 text-white'
              : 'bg-sky-100 text-sky-800'
          }`}
        >
          {inputMode === 'whisper_char' ? `💬 对${charName}说` : '📺 发弹幕'}
        </button>

        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && inputText.trim() && !isGenerating) {
              onAdvanceBeat(inputText.trim(), inputMode);
              setInputText('');
            }
          }}
          placeholder={
            inputMode === 'whisper_char'
              ? `凑过去跟 ${charName} 吐槽…`
              : `在 ${npcSession.npcStreamerName} 直播间发弹幕…`
          }
          className="flex-1 min-w-0 px-3.5 py-2 rounded-full bg-[#f2f2f2] text-sm text-[#0f0f0f] focus:outline-none"
        />

        <button
          type="button"
          disabled={!inputText.trim() || isGenerating}
          onClick={() => {
            if (!inputText.trim()) return;
            onAdvanceBeat(inputText.trim(), inputMode);
            setInputText('');
          }}
          className="px-3.5 py-2 rounded-full bg-[#0f0f0f] text-white text-xs font-bold whitespace-nowrap disabled:opacity-40"
        >
          发送
        </button>
      </div>

      <LiveFloatingPhone
        isOpen={showFloatingPhone}
        characterId={charId}
        charName={charName}
        contextDescription={`【陪看直播手机私聊】此刻你正和 ${userName} 一起看第三方主播「${npcSession.npcStreamerName}」的直播《${npcSession.npcRoomTitle}》，你们正在用手机私聊发信息。`}
        onClose={() => setShowFloatingPhone(false)}
      />
      <BeatLongPressSheet
        target={actionSheetTarget}
        onClose={() => setActionSheetTarget(null)}
      />
    </div>
  );
};
