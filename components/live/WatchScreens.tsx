/**
 * 视频投稿观看页 (VOD) 与 双人陪看第三方直播页 (NPC Watch) —— 商业级双平台视图
 *
 * 重做要点：
 * 1. 告别全屏/播放器死黑屏：无封面图时自动渲染主播头像高斯模糊光晕 + 频道主题色渐变舞台。
 * 2. 告别简陋下拉框：VOD 章节采用横向时间轴胶囊条（Chapter Pills）一键点选，并支持上一章/下一章直达。
 * 3. 正文完整展开：画面描写、原声台词、同传译文、以及陪看席里 Char 的贴耳小动作与吐槽全部采用清晰分栏卡片展示，绝不折叠截断。
 * 4. 真实双平台细节：YouTube 现代流媒体布局 vs ニコニコ動画/生放送 极客黑顶栏 + 184匿名切换 + 经典评论列表。
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
import { downloadVoiceAudioUrl } from '../../utils/liveStreamStorage';
import {
  FloatingDanmakuOverlay,
  LiveFloatingPhone,
  BeatLongPressSheet,
  BeatActionSheetTarget,
  useLongPressMenu,
} from './LiveSharedWidgets';
import { Icon, Sheet, LiveUiStyle, formatCount } from './platformChrome';

const ytFont = 'Roboto, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif';
const nicoFont = '"Yu Gothic UI", "Hiragino Sans", Meiryo, "PingFang SC", "Noto Sans SC", sans-serif';

// ==================== 1. 视频投稿详情页 (VOD Watch Page) ====================

export function VodDetailView(props: {
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
  onBindBack: (fn: () => boolean) => void;
  onPlayChapterVoice: (ch: VodChapterBeat, options?: { skipCache?: boolean }) => void;
  onEditChapter: (chapterId: string, nextScreen: string, nextSpeech: string, nextTrans?: string) => void;
  onAddComment: (text: string) => void;
  onTriggerStreamerReply: (comment: VodCommentItem) => void;
  onShareVodToChat: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [comment, setComment] = useState('');
  const [phone, setPhone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<BeatActionSheetTarget | null>(null);

  const isNico = props.platformTheme === 'niconico';
  const chapters = props.vod.chapters || [];
  const chapter = chapters[idx] || chapters[0];
  const maxIdx = Math.max(0, chapters.length - 1);
  const persona =
    props.viewerPersonas.find(p => p.id === props.activePersonaId) || props.viewerPersonas[0];

  const cyclePersona = () => {
    if (props.viewerPersonas.length <= 1) {
      props.onOpenPersonaModal();
      return;
    }
    const cur = props.viewerPersonas.findIndex(p => p.id === persona?.id);
    const next = props.viewerPersonas[(cur + 1) % props.viewerPersonas.length];
    if (next) props.onSelectPersona(next.id);
  };

  const avatar = props.channel.avatar || props.charAvatar;
  const trans = chapter?.speechTranslated?.replace(/^译[：:]\s*/, '').trim() || '';
  const voiceOn = Boolean(chapter && props.ttsPlayingId === chapter.id);

  const popInner = () => {
    if (sheet) {
      setSheet(null);
      return true;
    }
    if (menu) {
      setMenu(false);
      return true;
    }
    if (phone) {
      setPhone(false);
      return true;
    }
    if (fullscreen) {
      setFullscreen(false);
      return true;
    }
    return false;
  };
  props.onBindBack(() => {
    if (popInner()) return true;
    props.onBack();
    return true;
  });

  const openMenu = (ch: VodChapterBeat, i: number) => {
    setSheet({
      title: `${ch.timestampLabel} ${ch.chapterTitle}`,
      screen: ch.screen,
      speechOriginal: ch.speechOriginal,
      speechTranslated: ch.speechTranslated,
      audioUrl: ch.audioUrl,
      canPlayVoice: Boolean(ch.speechOriginal?.trim()),
      canEdit: true,
      canShareClip: true,
      onPlayVoice: () => props.onPlayChapterVoice(ch),
      onRetryVoice: () => props.onPlayChapterVoice(ch, { skipCache: true }),
      onDownloadVoice: () => {
        if (ch.audioUrl) void downloadVoiceAudioUrl(ch.audioUrl, `${props.vod.title}_${i + 1}`);
        else props.onPlayChapterVoice(ch);
      },
      onSaveEdit: (screen, speech, tr) => props.onEditChapter(ch.id, screen, speech, tr),
      onShareClip: props.onShareVodToChat,
    });
  };

  const send = () => {
    const text = comment.trim();
    if (!text) return;
    props.onAddComment(text);
    setComment('');
  };

  const renderPicture = (fill: boolean) => (
    <div
      className={`relative overflow-hidden select-none ${
        fill ? 'flex-1 min-h-0' : 'h-[204px] shrink-0'
      }`}
    >
      {/* 氛围背景 */}
      {props.vod.coverImageUrl ? (
        <>
          <TokenImg
            value={props.vod.coverImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-black/65" />
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                props.vod.coverGradient ||
                'linear-gradient(135deg, #1e293b 0%, #334155 55%, #0f172a 100%)',
            }}
          />
          {avatar && (
            <TokenImg
              value={avatar}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-55"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-900/40 to-slate-950/80" />
        </>
      )}

      {/* 顶部角标与操作 */}
      <div className="absolute inset-x-0 top-0 z-20 px-3 pt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {fill && (
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="h-7 px-2.5 rounded-full bg-black/60 text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <Icon name="back" size={14} />
              退出全屏
            </button>
          )}
          <span className="h-6 px-2 rounded bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold inline-flex items-center">
            🎬 {chapter?.timestampLabel || '00:00'} · {chapter?.chapterTitle || '正片'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowDanmaku(v => !v)}
            className={`h-7 px-2 rounded text-[11px] font-bold border ${
              showDanmaku
                ? 'bg-white/20 text-white border-white/30'
                : 'bg-black/45 text-white/50 border-white/10 line-through'
            }`}
          >
            {isNico ? 'コメ' : '弹幕'}
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(v => !v)}
            className="w-7 h-7 rounded bg-black/45 text-white flex items-center justify-center border border-white/15"
          >
            <Icon name={fill ? 'collapse' : 'expand'} size={15} />
          </button>
        </div>
      </div>

      {/* 多轨防截断飘屏弹幕 */}
      {showDanmaku && chapter && (
        <FloatingDanmakuOverlay
          danmakuList={chapter.danmaku || []}
          showTranslation={showTranslation}
          visible
          platformTheme={props.platformTheme}
        />
      )}

      {/* 中央头像与发声状态 */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-3">
        <div className="rounded-full p-1 bg-white/20 backdrop-blur-md shadow-xl border border-white/30">
          <Face src={avatar} name={props.channel.channelName} size={fill ? 96 : 68} />
        </div>
        {voiceOn && (
          <span className="mt-1.5 px-2.5 py-0.5 rounded-full bg-[#ff0000] text-white text-[10px] font-bold">
            🔊 正在朗读本节
          </span>
        )}
      </div>

      {fill && chapter && (
        <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 p-4 text-white max-h-[46%] overflow-y-auto">
          <p className="text-xs text-amber-300 font-bold mb-1">
            {chapter.timestampLabel} · {chapter.chapterTitle}
          </p>
          <p className="text-xs text-slate-200 mb-2">🎥 {chapter.screen}</p>
          <p className="text-base font-bold text-white">「{chapter.speechOriginal}」</p>
          {showTranslation && trans && trans !== chapter.speechOriginal && (
            <p className="mt-1 text-xs text-sky-300">🌐 {trans}</p>
          )}
        </div>
      )}
    </div>
  );

  const renderChapterBar = () => (
    <div className="shrink-0 bg-[#0f0f0f] text-white px-3 py-2 flex items-center gap-2 border-b border-[#222]">
      <button
        type="button"
        disabled={idx <= 0}
        onClick={() => setIdx(Math.max(0, idx - 1))}
        className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xs font-bold shrink-0"
      >
        ◀ 上一章
      </button>

      {/* 章节时间轴胶囊横滑 */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {chapters.map((ch, i) => (
          <button
            type="button"
            key={ch.id}
            onClick={() => setIdx(i)}
            className={`h-7 px-2.5 rounded-full text-[11px] font-bold shrink-0 transition ${
              i === idx
                ? isNico
                  ? 'bg-[#0080ff] text-white'
                  : 'bg-[#ff0000] text-white'
                : 'bg-white/10 text-white/75 hover:bg-white/20'
            }`}
          >
            {ch.timestampLabel} {ch.chapterTitle}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!chapter?.speechOriginal}
        onClick={() => chapter && props.onPlayChapterVoice(chapter)}
        className={`h-8 px-2.5 rounded-lg text-xs font-bold shrink-0 ${
          voiceOn ? 'bg-amber-500 text-black' : 'bg-white/10 text-white disabled:opacity-30'
        }`}
      >
        🔊 {voiceOn ? '播音中' : '听这章'}
      </button>

      <button
        type="button"
        disabled={idx >= maxIdx}
        onClick={() => setIdx(Math.min(maxIdx, idx + 1))}
        className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xs font-bold shrink-0"
      >
        下一章 ▶
      </button>
    </div>
  );

  return (
    <div
      className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]"
      style={{ fontFamily: isNico ? nicoFont : ytFont }}
    >
      <LiveUiStyle />
      {!fullscreen && (
        <header
          className={`h-12 px-2 border-b flex items-center justify-between gap-2 shrink-0 ${
            isNico ? 'bg-[#252525] text-white border-[#111]' : 'bg-white text-[#111] border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (!popInner()) props.onBack();
              }}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0"
            >
              <Icon name="back" size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold truncate">{props.vod.title}</div>
              <div className={`text-[11px] truncate ${isNico ? 'text-white/65' : 'text-slate-500'}`}>
                {props.channel.channelName} · {formatCount(props.vod.viewsCount)}{isNico ? ' 再生' : ' 次观看'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setPhone(true)}
              className="h-8 px-2.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold"
            >
              💬 私聊
            </button>
            <button
              type="button"
              onClick={props.onShareVodToChat}
              className="h-8 px-2.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold"
            >
              📤 转发
            </button>
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="w-8 h-8 rounded-full inline-flex items-center justify-center"
            >
              <Icon name="gear" size={18} />
            </button>
          </div>
        </header>
      )}

      {fullscreen ? (
        <div className="flex-1 min-h-0 flex flex-col bg-black">
          {renderPicture(true)}
          {renderChapterBar()}
        </div>
      ) : (
        <>
          {renderPicture(false)}
          {renderChapterBar()}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* 当前章节完整画面与台词卡片 */}
            {chapter && (
              <article className="mx-3 my-2.5 rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800">
                    📍 {chapter.timestampLabel} · {chapter.chapterTitle}（第 {idx + 1}/{chapters.length} 章）
                  </span>
                  <button
                    type="button"
                    onClick={() => openMenu(chapter, idx)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700"
                  >
                    ✏️ 编辑本章 / 语音
                  </button>
                </div>

                <div className="flex items-start gap-2 text-[13.5px] leading-relaxed text-slate-600">
                  <span className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                    画面
                  </span>
                  <p className="flex-1 break-words">{chapter.screen || '暂无画面描写'}</p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">
                    台词
                  </span>
                  <div className="flex-1">
                    <p className="text-[15px] leading-relaxed font-bold text-slate-900 break-words">
                      「{chapter.speechOriginal || '（无台词）'}」
                    </p>
                    {showTranslation && trans && trans !== chapter.speechOriginal && (
                      <p className="mt-1 text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1">
                        【同传】{trans}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            )}

            {/* UP主置顶简介 */}
            {props.vod.streamerPinnedNote && (
              <div className="mx-3 mb-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs leading-relaxed text-slate-800">
                <span className="font-extrabold text-amber-900 mr-1.5">
                  📌 {props.channel.channelName} 置顶留言：
                </span>
                {props.vod.streamerPinnedNote}
              </div>
            )}

            {/* 评论区标题 */}
            <div className="px-4 py-2 bg-slate-100/80 border-y border-slate-200 flex items-center justify-between text-xs font-extrabold text-slate-700">
              <span>💬 评论区 ({props.vod.comments.length})</span>
              <span className="text-[11px] font-normal text-slate-500">
                点击「求翻牌」可让 UP 主亲自回复该楼层
              </span>
            </div>

            {/* 评论列表 */}
            <ul className="divide-y divide-slate-100">
              {props.vod.comments.map(c => (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex gap-2.5">
                    <Face name={c.authorName} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold text-slate-800">
                          {c.authorName}
                          {c.isUserMain && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[10px]">
                              我·本尊
                            </span>
                          )}
                          {c.isUserAlt && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded bg-violet-600 text-white text-[10px]">
                              我的马甲
                            </span>
                          )}
                        </div>
                        {c.authorName !== props.channel.channelName && (
                          <button
                            type="button"
                            disabled={props.isGeneratingReplyId === c.id}
                            onClick={() => props.onTriggerStreamerReply(c)}
                            className="px-2 py-0.5 rounded-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold disabled:opacity-40"
                          >
                            {props.isGeneratingReplyId === c.id ? '⏳ 翻牌中…' : '💌 求UP主翻牌'}
                          </button>
                        )}
                      </div>

                      <p className="mt-1 text-[13.5px] leading-relaxed text-slate-900 break-words">
                        {c.content}
                      </p>
                      {c.translation && (
                        <p className="text-xs text-sky-700 mt-0.5">🌐 {c.translation}</p>
                      )}

                      {c.replies?.map(r => (
                        <div
                          key={r.id}
                          className="mt-2 pl-3 py-1.5 pr-2.5 rounded-lg bg-slate-50 border-l-2 border-red-500"
                        >
                          <div className="text-xs font-bold text-red-700">
                            {r.authorName}
                            {r.isStreamer && (
                              <span className="ml-1 px-1.5 py-0.2 rounded bg-red-600 text-white text-[10px]">
                                UP主
                              </span>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-slate-800 mt-0.5 break-words">
                            {r.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 底部写评论栏 */}
          <form
            className="shrink-0 border-t border-slate-200 px-2.5 py-2 flex items-center gap-1.5 bg-white pb-[max(8px,env(safe-area-inset-bottom))]"
            onSubmit={e => {
              e.preventDefault();
              send();
            }}
          >
            <button
              type="button"
              onClick={cyclePersona}
              className="h-9 px-2.5 rounded-full bg-slate-100 border border-slate-300 text-xs font-bold shrink-0"
            >
              🎭 {persona?.name?.slice(0, 5) || props.userName}
            </button>
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={`以「${persona?.name || props.userName}」发表视频评论…`}
              className="flex-1 min-w-0 h-9 px-3.5 rounded-full bg-slate-100 text-sm focus:outline-none"
            />
            <button
              type="submit"
              disabled={!comment.trim()}
              className="h-9 px-4 rounded-full bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
            >
              评论
            </button>
          </form>
        </>
      )}

      <Sheet open={menu} title="视频选项" onClose={() => setMenu(false)}>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              props.onOpenPersonaModal();
            }}
            className="w-full p-3 rounded-xl border border-slate-200 text-left text-sm font-bold"
          >
            🎭 切换/管理评论马甲（当前：{persona?.name}）
          </button>
          <button
            type="button"
            onClick={() =>
              props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico')
            }
            className="w-full p-3 rounded-xl border border-slate-200 text-left text-sm font-bold"
          >
            🎨 切换平台外观（当前：{isNico ? 'ニコニコ動画' : 'YouTube'}）
          </button>
        </div>
      </Sheet>

      <LiveFloatingPhone
        isOpen={phone}
        characterId={props.charId}
        charName={props.charName}
        contextDescription={`【看视频私聊】此刻 ${props.userName} 正在观看你的视频投稿《${props.vod.title}》，并用手机私聊找你聊天。`}
        onClose={() => setPhone(false)}
      />
      <BeatLongPressSheet target={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

// ==================== 2. 双人陪看第三方 NPC 直播间 (Watch Party View) ====================

export function NpcWatchRoomView(props: {
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
  onBindBack: (fn: () => boolean) => void;
  onAdvanceBeat: (userText?: string, mode?: 'whisper_char' | 'send_npc_danmaku') => void;
  onRerollCharReaction: (beat: NpcWatchBeat) => void;
  onPlayCharVoice: (beat: NpcWatchBeat, options?: { skipCache?: boolean }) => void;
  onShareNpcWatchToChat: () => void;
}) {
  const [idx, setIdx] = useState(Math.max(0, props.npcSession.beats.length - 1));
  const [mode, setMode] = useState<'whisper_char' | 'send_npc_danmaku'>('whisper_char');
  const [text, setText] = useState('');
  const [phone, setPhone] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sheet, setSheet] = useState<BeatActionSheetTarget | null>(null);
  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();
  const isNico = props.platformTheme === 'niconico';

  React.useEffect(() => {
    if (props.npcSession.beats.length > 0) setIdx(props.npcSession.beats.length - 1);
  }, [props.npcSession.beats.length]);

  const beat =
    props.npcSession.beats[idx] ||
    props.npcSession.beats[props.npcSession.beats.length - 1];
  const max = Math.max(0, props.npcSession.beats.length - 1);
  const voiceOn = Boolean(beat && props.ttsPlayingId === beat.id);

  const popInner = () => {
    if (sheet) {
      setSheet(null);
      return true;
    }
    if (phone) {
      setPhone(false);
      return true;
    }
    if (fullscreen) {
      setFullscreen(false);
      return true;
    }
    return false;
  };
  props.onBindBack(() => {
    if (popInner()) return true;
    props.onBack();
    return true;
  });

  const openBeat = (b: NpcWatchBeat) => {
    setSheet({
      title: `${props.charName} 的陪看反应`,
      screen: b.charReactionAction,
      speechOriginal: b.charReactionSpeech,
      audioUrl: b.charAudioUrl,
      canPlayVoice: Boolean(b.charReactionSpeech?.trim()),
      canRerollChunk: true,
      canShareClip: true,
      onPlayVoice: () => props.onPlayCharVoice(b),
      onRetryVoice: () => props.onPlayCharVoice(b, { skipCache: true }),
      onDownloadVoice: () => {
        if (b.charAudioUrl)
          void downloadVoiceAudioUrl(
            b.charAudioUrl,
            `${props.charName}_watch_${b.index + 1}`,
          );
        else props.onPlayCharVoice(b);
      },
      onRerollChunk: () => props.onRerollCharReaction(b),
      onShareClip: props.onShareNpcWatchToChat,
    });
  };

  const send = () => {
    const value = text.trim();
    if (!value || props.isGenerating) return;
    props.onAdvanceBeat(value, mode);
    setText('');
  };

  return (
    <div
      className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]"
      style={{ fontFamily: isNico ? nicoFont : ytFont }}
    >
      <LiveUiStyle />

      {/* 顶栏 */}
      {!fullscreen && (
        <header
          className={`h-12 px-2 border-b flex items-center justify-between gap-2 shrink-0 ${
            isNico ? 'bg-[#252525] text-white border-[#111]' : 'bg-white text-[#111] border-slate-200'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (!popInner()) props.onBack();
              }}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0"
            >
              <Icon name="back" size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold truncate">
                🍿 与 {props.charName} 一起看：{props.npcSession.npcRoomTitle}
              </div>
              <div className={`text-[11px] truncate ${isNico ? 'text-white/65' : 'text-slate-500'}`}>
                台上主播：{props.npcSession.npcStreamerName} · 👁️ {formatCount(props.npcSession.viewerCount)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setPhone(true)}
              className="h-8 px-2.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold"
            >
              💬 私聊
            </button>
            <button
              type="button"
              onClick={props.onShareNpcWatchToChat}
              className="h-8 px-2.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold"
            >
              📤 分享
            </button>
          </div>
        </header>
      )}

      {/* 顶部 NPC 舞台（柔和渐变防黑屏 + 飘屏弹幕） */}
      <div
        className={`relative overflow-hidden select-none ${
          fullscreen ? 'h-[42vh] shrink-0' : 'h-[188px] shrink-0'
        }`}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              props.npcSession.coverGradient ||
              'linear-gradient(135deg, #312e81 0%, #1e1b4b 50%, #0f172a 100%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-900/40 to-slate-950/80" />

        <div className="absolute inset-x-0 top-2.5 z-20 px-3 flex items-center justify-between">
          <span className="h-6 px-2.5 rounded bg-[#ff0000] text-white text-[11px] font-bold inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            NPC LIVE · {props.npcSession.npcCategoryLabel}
          </span>
          <button
            type="button"
            onClick={() => setFullscreen(v => !v)}
            className="w-7 h-7 rounded bg-black/50 text-white flex items-center justify-center"
          >
            <Icon name={fullscreen ? 'collapse' : 'expand'} size={15} />
          </button>
        </div>

        {beat && (
          <FloatingDanmakuOverlay
            danmakuList={beat.npcDanmaku || []}
            visible
            platformTheme={props.platformTheme}
          />
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2 text-white">
          <Face name={props.npcSession.npcStreamerName} size={62} light />
          <div className="mt-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-black/45">
            {props.npcSession.npcStreamerName}
          </div>
        </div>
      </div>

      {/* 拍数推进控制栏 */}
      <div className="shrink-0 bg-[#0f0f0f] text-white px-3 py-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={idx <= 0}
          onClick={() => setIdx(Math.max(0, idx - 1))}
          className="h-8 px-2.5 rounded-lg bg-white/10 disabled:opacity-30 text-xs font-bold"
        >
          ◀ 上一幕
        </button>

        <span className="text-xs font-mono text-white/80">
          第 {idx + 1} / {props.npcSession.beats.length || 1} 幕
        </span>

        {idx < max ? (
          <button
            type="button"
            onClick={() => setIdx(idx + 1)}
            className="h-8 px-3.5 rounded-lg bg-emerald-500 text-white text-xs font-extrabold"
          >
            下一幕 ▶
          </button>
        ) : (
          <button
            type="button"
            disabled={props.isGenerating}
            onClick={() => props.onAdvanceBeat()}
            className="h-8 px-3.5 rounded-lg bg-[#ff0000] text-white text-xs font-extrabold disabled:opacity-40"
          >
            {props.isGenerating ? '⏳ 演播中…' : '✨ 继续看下一幕'}
          </button>
        )}
      </div>

      {/* 中间滚动主体：台上 NPC 实况卡 + 身边 Char 陪看吐槽卡 + 直播间沙雕网友弹幕 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-slate-50/60">
        {beat ? (
          <>
            {/* 1. 屏幕里 NPC 主播演播内容 */}
            <section className="rounded-2xl bg-white border border-slate-200 p-3.5 shadow-2xs space-y-1.5">
              <div className="text-xs font-extrabold text-slate-500">
                📺 屏幕里 · 主播「{props.npcSession.npcStreamerName}」正在整活：
              </div>
              <p className="text-[13.5px] leading-relaxed text-slate-600 break-words">
                🎥 {beat.npcScreen}
              </p>
              {beat.npcSpeech && (
                <p className="text-[14.5px] leading-relaxed font-bold text-slate-900 break-words">
                  「{beat.npcSpeech}」
                </p>
              )}
            </section>

            {/* 2. 坐在你身边的 Char 反应与吐槽（重点高亮） */}
            <section
              className="rounded-2xl bg-gradient-to-br from-rose-50/90 via-white to-amber-50/70 border-2 border-rose-200 p-3.5 shadow-sm space-y-2 cursor-pointer"
              {...bindLongPress(() => openBeat(beat))}
              onClick={() => {
                if (!wasLongPressTriggered()) props.onPlayCharVoice(beat);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Face src={props.charAvatar} name={props.charName} size={30} />
                  <div>
                    <div className="text-xs font-extrabold text-rose-950">
                      🛋️ 身边的 {props.charName}
                    </div>
                    <div className="text-[10px] text-rose-600">
                      点击听 TA 说话 · 长按重Roll反应
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => props.onPlayCharVoice(beat)}
                    className={`h-7 px-2.5 rounded-lg text-xs font-bold ${
                      voiceOn
                        ? 'bg-rose-600 text-white'
                        : 'bg-white border border-rose-200 text-rose-800'
                    }`}
                  >
                    🔊 {voiceOn ? '播音中' : '听TA说'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBeat(beat)}
                    className="h-7 px-2.5 rounded-lg bg-white border border-rose-200 text-rose-800 text-xs font-bold"
                  >
                    🎲 重Roll
                  </button>
                </div>
              </div>

              {beat.userActionNote && (
                <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                  你刚才：{beat.userActionNote}
                </div>
              )}

              <p className="text-[13.5px] leading-relaxed text-slate-700 break-words">
                ✨ {beat.charReactionAction}
              </p>
              <p className="text-[15px] leading-relaxed font-extrabold text-slate-900 break-words">
                {props.isRerollingBeatId === beat.id
                  ? '⏳ 正在重新生成反应…'
                  : `「${beat.charReactionSpeech}」`}
              </p>
            </section>

            {/* 3. 该直播间的沙雕网友弹幕列表 */}
            {beat.npcDanmaku?.length > 0 && (
              <section className="rounded-2xl bg-white border border-slate-200 p-3 space-y-1.5">
                <div className="text-xs font-bold text-slate-500">
                  💬 直播间网友弹幕 ({beat.npcDanmaku.length})
                </div>
                <ul className="space-y-1">
                  {beat.npcDanmaku.map(dm => (
                    <li key={dm.id} className="text-xs leading-relaxed">
                      <span className="font-bold text-slate-500 mr-1.5">{dm.senderName}:</span>
                      <span className="text-slate-800">{dm.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="py-12 text-center text-xs text-slate-400">正在进入陪看直播间…</p>
        )}
      </div>

      {/* 底部双模式互动栏（直接按钮切换「凑过去跟 Char 咬耳朵」vs「发弹幕去调戏台上主播」） */}
      <form
        className="shrink-0 bg-white border-t border-slate-200 px-2.5 py-2 space-y-1.5 pb-[max(8px,env(safe-area-inset-bottom))]"
        onSubmit={e => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('whisper_char')}
            className={`h-7 px-3 rounded-full text-xs font-bold transition ${
              mode === 'whisper_char'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            🛋️ 凑过去跟 {props.charName} 说话
          </button>
          <button
            type="button"
            onClick={() => setMode('send_npc_danmaku')}
            className={`h-7 px-3 rounded-full text-xs font-bold transition ${
              mode === 'send_npc_danmaku'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            📺 在直播间发弹幕起哄
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              mode === 'whisper_char'
                ? `小声跟身边的 ${props.charName} 吐槽…`
                : `在 ${props.npcSession.npcStreamerName} 的公屏发弹幕…`
            }
            className="flex-1 min-w-0 h-9 px-3.5 rounded-full bg-slate-100 text-sm focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || props.isGenerating}
            className="h-9 px-4 rounded-full bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </form>

      <LiveFloatingPhone
        isOpen={phone}
        characterId={props.charId}
        charName={props.charName}
        contextDescription={`【陪看直播手机私聊】此刻你正和 ${props.userName} 一起看第三方主播「${props.npcSession.npcStreamerName}」的直播《${props.npcSession.npcRoomTitle}》，你们正在用手机私聊发信息。`}
        onClose={() => setPhone(false)}
      />
      <BeatLongPressSheet target={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

function Face({
  src,
  name,
  size,
  light,
}: {
  src?: string;
  name: string;
  size: number;
  light?: boolean;
}) {
  if (src) {
    return (
      <TokenImg
        value={src}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`rounded-full inline-flex items-center justify-center font-bold shrink-0 ${
        light ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'
      }`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
