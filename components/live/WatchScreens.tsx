/**
 * 视频页和陪看页。
 * YouTube：播放器、全文台词、评论按头像排。
 * ニコニコ：播放器、实况、评论三列。陪看时旁边的人单独成一段，不做成第二套皮肤。
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
import { Icon, IconButton, Sheet, Seek, LiveUiStyle, formatCount } from './platformChrome';

const ytFont = 'Roboto, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif';
const nicoFont = '"Yu Gothic UI", "Hiragino Sans", Meiryo, "PingFang SC", "Noto Sans SC", sans-serif';

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
  onPlayChapterVoice: (ch: VodChapterBeat, options?: { skipCache?: boolean }) => void;
  onEditChapter: (chapterId: string, nextScreen: string, nextSpeech: string, nextTrans?: string) => void;
  onAddComment: (text: string) => void;
  onTriggerStreamerReply: (comment: VodCommentItem) => void;
  onShareVodToChat: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showDanmaku, setShowDanmaku] = useState(props.platformTheme === 'niconico');
  const [showTranslation, setShowTranslation] = useState(true);
  const [comment, setComment] = useState('');
  const [phone, setPhone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<BeatActionSheetTarget | null>(null);
  const isNico = props.platformTheme === 'niconico';
  const chapter = props.vod.chapters[idx] || props.vod.chapters[0];
  const max = Math.max(0, props.vod.chapters.length - 1);
  const persona = props.viewerPersonas.find(p => p.id === props.activePersonaId) || props.viewerPersonas[0];
  const toggle184 = () => {
    const main = props.viewerPersonas.find(p => p.isMain);
    const alt = props.viewerPersonas.find(p => !p.isMain);
    if (!persona || persona.isMain) {
      if (alt) props.onSelectPersona(alt.id);
      else props.onOpenPersonaModal();
    } else if (main) props.onSelectPersona(main.id);
    else props.onOpenPersonaModal();
  };
  const avatar = props.channel.avatar || props.charAvatar;
  const trans = chapter?.speechTranslated?.replace(/^译[：:]\s*/, '').trim() || '';

  React.useEffect(() => {
    if (!playing || props.vod.chapters.length < 2) return;
    if (idx >= max) return;
    const t = window.setTimeout(() => setIdx(i => Math.min(max, i + 1)), 7000);
    return () => window.clearTimeout(t);
  }, [playing, idx, max, props.vod.chapters.length]);

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

  const picture = (fill: boolean) => (
    <div className={`relative bg-[#141414] overflow-hidden ${fill ? 'flex-1 min-h-[120px]' : 'aspect-video shrink-0'}`}>
      {props.vod.coverImageUrl ? (
        <TokenImg value={props.vod.coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Face src={avatar} name={props.channel.channelName} size={fill ? 88 : 64} />
        </div>
      )}
      {showDanmaku && isNico && chapter && (
        <FloatingDanmakuOverlay danmakuList={chapter.danmaku || []} showTranslation={showTranslation} visible platformTheme={props.platformTheme} />
      )}
      <span className="absolute right-2 bottom-2 h-5 px-1.5 bg-black/80 text-white text-[12px] inline-flex items-center">
        {chapter?.timestampLabel || props.vod.durationLabel}
      </span>
    </div>
  );

  const caption = chapter ? (
    <div className={`bg-white px-4 py-3 ${fullscreen ? 'max-h-[38%] overflow-y-auto' : ''}`}>
      <div className="text-[12px] text-[#606060]">{chapter.chapterTitle}</div>
      <p className="mt-1 text-[14px] leading-[22px] break-words">{chapter.screen}</p>
      {chapter.speechOriginal ? (
        <>
          <p className="mt-2 text-[15px] leading-6 font-medium break-words">{chapter.speechOriginal}</p>
          <button type="button" onClick={() => props.onPlayChapterVoice(chapter)} className="mt-1 h-11 inline-flex items-center gap-1.5 text-[14px] font-medium">
            <Icon name={props.ttsPlayingId === chapter.id ? 'pause' : 'play'} size={18} />
            {props.ttsPlayingId === chapter.id ? '正在念' : '听这一句'}
          </button>
        </>
      ) : null}
      {showTranslation && trans && trans !== chapter.speechOriginal ? (
        <p className="mt-2 text-[13px] leading-5 text-[#606060] break-words">{trans}</p>
      ) : null}
      <button type="button" onClick={() => openMenu(chapter, idx)} className="h-11 ml-4 text-[14px] underline">
        这一段的操作
      </button>
    </div>
  ) : (
    <p className="px-4 py-6 text-[14px] text-[#606060]">这条视频还没有分镜。</p>
  );

  const bar = (
    <div className={`shrink-0 flex items-center gap-1 px-1 ${isNico ? 'bg-[#141414] text-white' : 'bg-white'}`}>
      <IconButton label={playing ? '暂停' : '播放'} onClick={() => setPlaying(v => !v)}>
        <Icon name={playing ? 'pause' : 'play'} />
      </IconButton>
      <div className="flex-1">
        <Seek label="章节" min={0} max={max} value={Math.min(idx, max)} onChange={n => { setIdx(n); setPlaying(false); }} variant={isNico ? 'nico' : 'ytLight'} />
      </div>
      <IconButton label={fullscreen ? '退出全屏' : '全屏'} onClick={() => setFullscreen(v => !v)}>
        <Icon name={fullscreen ? 'collapse' : 'expand'} />
      </IconButton>
    </div>
  );

  return (
    <div className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]" style={{ fontFamily: isNico ? nicoFont : ytFont }}>
      <LiveUiStyle />
      {!fullscreen && (
        <header className="h-12 px-1 border-b border-[#eee] flex items-center shrink-0">
          <IconButton label="返回" onClick={props.onBack}><Icon name="back" /></IconButton>
          <div className="flex-1 min-w-0 text-[14px] font-medium truncate px-1">{props.vod.title}</div>
          <IconButton label="私聊" onClick={() => setPhone(true)}><Icon name="chat" /></IconButton>
          <IconButton label="更多" onClick={() => setMenu(true)}><Icon name="more" /></IconButton>
        </header>
      )}
      {fullscreen ? (
        <div className="flex-1 min-h-0 flex flex-col bg-black">
          {picture(true)}
          {caption}
          {bar}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {picture(false)}
          {isNico && bar}
          {caption}
          {!isNico && bar}
          <div className="px-4 pb-3">
            <h1 className="text-[16px] leading-6 font-medium break-words">{props.vod.title}</h1>
            <p className="mt-1 text-[12px] leading-5 text-[#606060] break-words">
              {formatCount(props.vod.viewsCount)} {isNico ? '再生' : '次观看'} · {props.vod.categoryLabel} · {props.channel.channelName}
            </p>
            {props.vod.streamerPinnedNote ? (
              <p className="mt-3 text-[14px] leading-[22px] break-words">{props.vod.streamerPinnedNote}</p>
            ) : null}
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {props.vod.chapters.map((ch, i) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => { setIdx(i); setPlaying(false); }}
                  className={`h-11 px-3 shrink-0 text-[13px] ${i === idx ? 'bg-[#111] text-white' : 'bg-[#f2f2f2] text-[#111]'}`}
                >
                  {ch.timestampLabel} {ch.chapterTitle}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-2 border-t border-[#eee] text-[14px] font-medium">
            {isNico ? `コメント ${props.vod.comments.length}` : `评论 ${props.vod.comments.length}`}
          </div>
          <ul>
            {props.vod.comments.map(c => (
              <li key={c.id} className="px-4 py-3 border-b border-[#f3f3f3]">
                <div className="flex gap-2">
                  <Face name={c.authorName} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium break-words">
                      {c.authorName}
                      {c.authorName === props.channel.channelName ? <span className="ml-1 text-[11px] text-[#606060]">{isNico ? '投稿者' : '创作者'}</span> : null}
                    </div>
                    <p className="text-[14px] leading-[22px] break-words">{c.content}</p>
                    {c.translation ? <p className="text-[12px] text-[#606060] break-words">{c.translation}</p> : null}
                    {c.authorName !== props.channel.channelName && (
                      <button
                        type="button"
                        disabled={props.isGeneratingReplyId === c.id}
                        onClick={() => props.onTriggerStreamerReply(c)}
                        className="h-11 text-[13px] underline disabled:opacity-40"
                      >
                        {props.isGeneratingReplyId === c.id ? '正在回复…' : isNico ? '投稿者に返事を頼む' : '请创作者回复'}
                      </button>
                    )}
                    {c.replies?.map(r => (
                      <div key={r.id} className="mt-2 pl-3 border-l border-[#e5e5e5]">
                        <div className="text-[12px] font-medium">{r.authorName}</div>
                        <p className="text-[14px] leading-[22px] break-words">{r.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        className="shrink-0 border-t border-[#eee] px-2 py-1.5 flex items-center gap-2 bg-white pb-[max(6px,env(safe-area-inset-bottom))]"
        onSubmit={e => { e.preventDefault(); send(); }}
      >
        {isNico && (
          <button
            type="button"
            onClick={toggle184}
            className={`h-11 px-2 text-[13px] font-bold shrink-0 border ${persona?.isMain !== false ? 'border-[#111] text-[#111]' : 'bg-[#111] text-white border-[#111]'}`}
          >
            {persona?.isMain === false ? '184' : 'なふだ'}
          </button>
        )}
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={isNico ? `コメント（${persona?.name || props.userName}）` : `以 ${persona?.name || props.userName} 的身份评论`}
          aria-label="评论"
          className={`flex-1 min-w-0 h-11 px-3 bg-[#f2f2f2] text-[14px] focus:outline-none ${isNico ? '' : 'rounded-full'}`}
        />
        <button type="submit" disabled={!comment.trim()} className={`h-11 px-3 text-white text-[14px] disabled:opacity-40 ${isNico ? 'bg-[#111]' : 'rounded-full bg-[#0f0f0f]'}`}>
          {isNico ? '投稿' : '发送'}
        </button>
      </form>

      <Sheet open={menu} title="这条视频" onClose={() => setMenu(false)}>
        <button type="button" className="w-full min-h-11 text-left text-[15px]" onClick={() => { setMenu(false); props.onShareVodToChat(); }}>发到私聊</button>
        <button type="button" className="w-full min-h-11 text-left text-[15px]" onClick={() => { setMenu(false); props.onOpenPersonaModal(); }}>观众身份：{persona?.name}</button>
        <button type="button" className="w-full min-h-11 text-left text-[15px]" onClick={() => setShowDanmaku(v => !v)}>{showDanmaku ? '画面飘字：开' : '画面飘字：关'}</button>
        <button type="button" className="w-full min-h-11 text-left text-[15px]" onClick={() => setShowTranslation(v => !v)}>{showTranslation ? '译文：开' : '译文：关'}</button>
        <button type="button" className="w-full min-h-11 text-left text-[15px]" onClick={() => props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico')}>
          {isNico ? '改成 YouTube 外观' : '改成ニコニコ外观'}
        </button>
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
  onAdvanceBeat: (userText?: string, mode?: 'whisper_char' | 'send_npc_danmaku') => void;
  onRerollCharReaction: (beat: NpcWatchBeat) => void;
  onPlayCharVoice: (beat: NpcWatchBeat, options?: { skipCache?: boolean }) => void;
  onShareNpcWatchToChat: () => void;
}) {
  const [idx, setIdx] = useState(Math.max(0, props.npcSession.beats.length - 1));
  const [mode, setMode] = useState<'whisper_char' | 'send_npc_danmaku'>('whisper_char');
  const [text, setText] = useState('');
  const [phone, setPhone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sheet, setSheet] = useState<BeatActionSheetTarget | null>(null);
  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();
  const isNico = props.platformTheme === 'niconico';

  React.useEffect(() => {
    if (props.npcSession.beats.length > 0) setIdx(props.npcSession.beats.length - 1);
  }, [props.npcSession.beats.length]);

  const beat = props.npcSession.beats[idx] || props.npcSession.beats[props.npcSession.beats.length - 1];
  const max = Math.max(0, props.npcSession.beats.length - 1);

  const openBeat = (b: NpcWatchBeat) => {
    setSheet({
      title: `${props.charName} 的反应`,
      screen: b.charReactionAction,
      speechOriginal: b.charReactionSpeech,
      audioUrl: b.charAudioUrl,
      canPlayVoice: Boolean(b.charReactionSpeech?.trim()),
      canRerollChunk: true,
      canShareClip: true,
      onPlayVoice: () => props.onPlayCharVoice(b),
      onRetryVoice: () => props.onPlayCharVoice(b, { skipCache: true }),
      onDownloadVoice: () => {
        if (b.charAudioUrl) void downloadVoiceAudioUrl(b.charAudioUrl, `${props.charName}_watch_${b.index + 1}`);
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

  const picture = (fill: boolean) => (
    <div className={`relative bg-[#141414] overflow-hidden ${fill ? 'flex-1 min-h-[120px]' : 'aspect-video shrink-0'}`}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <Face name={props.npcSession.npcStreamerName} size={64} light />
        <div className="mt-2 text-[14px]">{props.npcSession.npcStreamerName}</div>
      </div>
      <span className="absolute left-2 top-2 h-6 px-2 bg-[#c62828] text-white text-[12px] inline-flex items-center">LIVE</span>
      <span className="absolute right-2 top-2 h-6 px-2 bg-black/70 text-white text-[12px] inline-flex items-center">
        {formatCount(props.npcSession.viewerCount)}
      </span>
      {isNico && beat && (
        <FloatingDanmakuOverlay danmakuList={beat.npcDanmaku || []} visible platformTheme={props.platformTheme} />
      )}
    </div>
  );

  const body = beat ? (
    <div className={`bg-white ${fullscreen ? 'max-h-[42%] overflow-y-auto' : ''}`}>
      <div className="px-4 py-3">
        <div className="text-[12px] text-[#606060]">{isNico ? '画面' : '屏幕里'}</div>
        <p className="mt-1 text-[14px] leading-[22px] break-words">{beat.npcScreen}</p>
        <p className="mt-2 text-[15px] leading-6 font-medium break-words">{beat.npcSpeech}</p>
        {beat.npcSpeechTranslated ? <p className="mt-1 text-[13px] text-[#606060] break-words">{beat.npcSpeechTranslated}</p> : null}
      </div>
      <div
        className="px-4 py-3 border-t border-[#eee]"
        {...bindLongPress(() => openBeat(beat))}
        onClick={() => { if (!wasLongPressTriggered()) props.onPlayCharVoice(beat); }}
      >
        <div className="flex items-center gap-2">
          <Face src={props.charAvatar} name={props.charName} size={28} />
          <span className="text-[14px] font-medium">{props.charName}</span>
          <span className="text-[12px] text-[#606060]">{props.ttsPlayingId === beat.id ? '正在念' : '听这一句'}</span>
        </div>
        {beat.userActionNote ? <p className="mt-2 text-[13px] text-[#606060] break-words">你刚才{beat.userActionNote}</p> : null}
        <p className="mt-2 text-[14px] leading-[22px] break-words">{beat.charReactionAction}</p>
        <p className="mt-1 text-[15px] leading-6 font-medium break-words">
          {props.isRerollingBeatId === beat.id ? '正在重新说…' : beat.charReactionSpeech}
        </p>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); openBeat(beat); }}
          className="h-11 text-[14px] underline"
        >
          这一段的操作
        </button>
      </div>
      {!isNico && beat.npcDanmaku?.length > 0 && (
        <ul className="px-4 pb-3">
          {beat.npcDanmaku.map(dm => (
            <li key={dm.id} className="text-[13px] leading-5 py-1 break-words">
              <span className="font-medium">{dm.senderName}</span> {dm.text}
            </li>
          ))}
        </ul>
      )}
      {isNico && beat.npcDanmaku?.length > 0 && (
        <table className="w-full text-left">
          <tbody>
            {beat.npcDanmaku.map(dm => (
              <tr key={dm.id} className="border-t border-[#eee]">
                <td className="px-3 py-1.5 text-[13px] break-words">{dm.text}</td>
                <td className="w-[72px] px-2 py-1.5 text-[11px] text-[#888] text-right break-words">{dm.senderName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  ) : (
    <p className="px-4 py-10 text-[14px] text-[#606060]">正在进直播间…</p>
  );

  return (
    <div className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]" style={{ fontFamily: isNico ? nicoFont : ytFont }}>
      <LiveUiStyle />
      {!fullscreen && (
        <header className="h-12 px-1 border-b border-[#eee] flex items-center shrink-0">
          <IconButton label="返回" onClick={props.onBack}><Icon name="back" /></IconButton>
          <div className="flex-1 min-w-0 px-1">
            <div className="text-[14px] font-medium truncate">{props.npcSession.npcRoomTitle}</div>
            <div className="text-[11px] text-[#606060] truncate">{props.npcSession.npcStreamerName}</div>
          </div>
          <IconButton label="私聊" onClick={() => setPhone(true)}><Icon name="chat" /></IconButton>
          <IconButton label="更多" onClick={() => setMenu(true)}><Icon name="more" /></IconButton>
        </header>
      )}
      <div className={`flex-1 min-h-0 ${fullscreen ? 'flex flex-col bg-black' : 'overflow-y-auto'}`}>
        {picture(fullscreen)}
        {body}
      </div>
      <div className={`shrink-0 flex items-center gap-1 px-1 ${isNico ? 'bg-[#141414] text-white' : 'bg-white border-t border-[#eee]'}`}>
        <div className="flex-1">
          <Seek label="进度" min={0} max={max} value={Math.min(idx, max)} onChange={setIdx} variant={isNico ? 'nico' : 'ytLight'} />
        </div>
        <button
          type="button"
          disabled={props.isGenerating}
          onClick={() => props.onAdvanceBeat()}
          className={`h-11 px-3 text-[13px] font-medium text-white disabled:opacity-40 shrink-0 ${isNico ? 'bg-[#333]' : 'rounded-full bg-[#ff0000]'}`}
        >
          {props.isGenerating ? '正在演…' : isNico ? '次へ' : '继续看'}
        </button>
        <IconButton label={fullscreen ? '退出全屏' : '全屏'} onClick={() => setFullscreen(v => !v)}>
          <Icon name={fullscreen ? 'collapse' : 'expand'} />
        </IconButton>
      </div>
      <form
        className="shrink-0 bg-white border-t border-[#eee] px-2 py-1.5 flex items-center gap-1 pb-[max(6px,env(safe-area-inset-bottom))]"
        onSubmit={e => { e.preventDefault(); send(); }}
      >
        <button
          type="button"
          onClick={() => setMode(m => (m === 'whisper_char' ? 'send_npc_danmaku' : 'whisper_char'))}
          className="h-11 px-2 text-[13px] font-medium shrink-0 underline"
        >
          {mode === 'whisper_char' ? `对${props.charName}说` : '发弹幕'}
        </button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={mode === 'whisper_char' ? `跟 ${props.charName} 说` : `在 ${props.npcSession.npcStreamerName} 的直播间写`}
          aria-label={mode === 'whisper_char' ? '对身边的人说' : '发弹幕'}
          className="flex-1 min-w-0 h-11 px-3 bg-[#f2f2f2] text-[14px] focus:outline-none"
        />
        <button type="submit" disabled={!text.trim() || props.isGenerating} className="h-11 px-3 bg-[#111] text-white text-[14px] disabled:opacity-40">
          发送
        </button>
      </form>

      <Sheet open={menu} title="一起看" onClose={() => setMenu(false)}>
        <button type="button" className="w-full min-h-11 text-left text-[15px]" onClick={() => { setMenu(false); props.onShareNpcWatchToChat(); }}>发到私聊</button>
        <button type="button" className="w-full min-h-11 text-left text-[15px]" onClick={() => props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico')}>
          {isNico ? '改成 YouTube 外观' : '改成ニコニコ外观'}
        </button>
      </Sheet>
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

function Face({ src, name, size, light }: { src?: string; name: string; size: number; light?: boolean }) {
  if (src) {
    return <TokenImg value={src} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={`rounded-full inline-flex items-center justify-center font-medium ${light ? 'bg-white/20 text-white' : 'bg-[#e5e5e5] text-[#111]'}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.38) }}
    >
      {(name || '?').slice(0, 1)}
    </span>
  );
}
