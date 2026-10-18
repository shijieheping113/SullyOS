/**
 * 视频页和陪看页。
 * 画面只留两行字幕。全文在白底上。操作是字：听这句、全屏、上一句、下一句、再看一段。
 * 章节用下拉。陪看时旁边的人单独成一段。
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
import { Icon, IconButton, Sheet, DropDown, LiveUiStyle, formatCount } from './platformChrome';

const twoLines: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

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
  onBindBack: (fn: () => boolean) => void;
  onPlayChapterVoice: (ch: VodChapterBeat, options?: { skipCache?: boolean }) => void;
  onEditChapter: (chapterId: string, nextScreen: string, nextSpeech: string, nextTrans?: string) => void;
  onAddComment: (text: string) => void;
  onTriggerStreamerReply: (comment: VodCommentItem) => void;
  onShareVodToChat: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showDanmaku, setShowDanmaku] = useState(props.platformTheme === 'niconico');
  const [showTranslation, setShowTranslation] = useState(true);
  const [comment, setComment] = useState('');
  const [phone, setPhone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<BeatActionSheetTarget | null>(null);
  const isNico = props.platformTheme === 'niconico';
  const chapter = props.vod.chapters[idx] || props.vod.chapters[0];
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

  const picture = (fill: boolean) => (
    <div className={`relative bg-[#141414] overflow-hidden ${fill ? 'h-[46vh] shrink-0' : 'aspect-video shrink-0'}`}>
      {props.vod.coverImageUrl ? (
        <TokenImg value={props.vod.coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Face src={avatar} name={props.channel.channelName} size={fill ? 88 : 64} />
        </div>
      )}
      {showDanmaku && chapter && (
        <FloatingDanmakuOverlay danmakuList={chapter.danmaku || []} showTranslation={showTranslation} visible platformTheme={props.platformTheme} />
      )}
      {chapter?.speechOriginal ? (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 py-2 bg-black/80">
          <p className="text-[14px] leading-5 text-white break-words" style={twoLines}>{chapter.speechOriginal}</p>
        </div>
      ) : null}
    </div>
  );

  const caption = chapter ? (
    <article className="bg-white px-4 py-3">
      <p className="text-[12px] leading-5 text-[#606060]">{chapter.timestampLabel} · {chapter.chapterTitle}</p>
      <h2 className="mt-3 text-[12px] leading-4 text-[#606060]">画面</h2>
      <p className="mt-1 text-[15px] leading-7 text-[#0f0f0f] break-words">{chapter.screen || '这一段没有画面。'}</p>
      <h2 className="mt-4 text-[12px] leading-4 text-[#606060]">台词</h2>
      <p className="mt-1 text-[15px] leading-7 text-[#0f0f0f] break-words">{chapter.speechOriginal || '这一段没有说话。'}</p>
      {showTranslation && trans && trans !== chapter.speechOriginal ? (
        <p className="mt-3 text-[14px] leading-6 text-[#606060] break-words">{trans}</p>
      ) : null}
      <button type="button" onClick={() => openMenu(chapter, idx)} className="h-11 text-[14px] underline">
        这一段的操作
      </button>
    </article>
  ) : (
    <p className="px-4 py-6 text-[14px] text-[#606060]">这条视频还没有分镜。</p>
  );

  const bar = (
    <div className="shrink-0 flex gap-2 px-3 py-2 bg-white border-b border-[#eee]">
      <button
        type="button"
        disabled={!chapter?.speechOriginal}
        onClick={() => chapter && props.onPlayChapterVoice(chapter)}
        className="h-12 flex-1 border border-[#111] text-[15px] font-medium disabled:opacity-40"
      >
        {voiceOn ? '停止' : '听这句'}
      </button>
      <button
        type="button"
        onClick={() => setFullscreen(v => !v)}
        className="h-12 px-4 border border-[#111] text-[15px] font-medium"
      >
        {fullscreen ? '退出全屏' : '全屏'}
      </button>
    </div>
  );

  return (
    <div className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]" style={{ fontFamily: isNico ? nicoFont : ytFont }}>
      <LiveUiStyle />
      {!fullscreen && (
        <header className="h-12 px-1 border-b border-[#eee] flex items-center shrink-0">
          <IconButton label="返回" onClick={() => { if (!popInner()) props.onBack(); }}><Icon name="back" /></IconButton>
          <div className="flex-1 min-w-0 text-[14px] font-medium truncate px-1">{props.vod.title}</div>
          <IconButton label="私聊" onClick={() => setPhone(true)}><Icon name="chat" /></IconButton>
          <IconButton label="更多" onClick={() => setMenu(true)}><Icon name="more" /></IconButton>
        </header>
      )}
      {picture(fullscreen)}
      {bar}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {caption}
          <div className="px-4 pb-3">
            <h1 className="text-[16px] leading-6 font-medium break-words">{props.vod.title}</h1>
            <p className="mt-1 text-[12px] leading-5 text-[#606060] break-words">
              {formatCount(props.vod.viewsCount)} {isNico ? '再生' : '次观看'} · {props.vod.categoryLabel} · {props.channel.channelName}
            </p>
            {props.vod.streamerPinnedNote ? (
              <p className="mt-3 text-[14px] leading-[22px] break-words">{props.vod.streamerPinnedNote}</p>
            ) : null}
            <div className="mt-2">
              <DropDown
                label="章节"
                value={chapter?.id || ''}
                onChange={id => {
                  const next = props.vod.chapters.findIndex(ch => ch.id === id);
                  if (next >= 0) setIdx(next);
                }}
                options={props.vod.chapters.map(ch => ({ id: ch.id, label: `${ch.timestampLabel} ${ch.chapterTitle}` }))}
              />
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
        <p className="text-[12px] leading-5 text-[#606060] mb-2">点一行就做那一件。做完回到这条视频。</p>
        <button type="button" className="w-full min-h-11 py-2 text-left border-b border-[#f3f3f3]" onClick={() => { setMenu(false); props.onShareVodToChat(); }}>
          <span className="block text-[15px]">发到私聊</span>
          <span className="block text-[12px] text-[#606060]">把这条视频做成卡片，发进和主播的聊天。</span>
        </button>
        <button type="button" className="w-full min-h-11 py-2 text-left border-b border-[#f3f3f3]" onClick={() => { setMenu(false); props.onOpenPersonaModal(); }}>
          <span className="block text-[15px]">观众身份：{persona?.name}</span>
          <span className="block text-[12px] text-[#606060]">换一个名字再评论。换完回到这条视频。</span>
        </button>
        <button type="button" className="w-full min-h-11 py-2 text-left border-b border-[#f3f3f3]" onClick={() => setShowDanmaku(v => !v)}>
          <span className="block text-[15px]">{showDanmaku ? '画面飘字：开' : '画面飘字：关'}</span>
          <span className="block text-[12px] text-[#606060]">开着时，弹幕从画面上半飞过。</span>
        </button>
        <button type="button" className="w-full min-h-11 py-2 text-left border-b border-[#f3f3f3]" onClick={() => setShowTranslation(v => !v)}>
          <span className="block text-[15px]">{showTranslation ? '译文：开' : '译文：关'}</span>
          <span className="block text-[12px] text-[#606060]">开着时，外语句子下面多一行中文。</span>
        </button>
        <button type="button" className="w-full min-h-11 py-2 text-left" onClick={() => props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico')}>
          <span className="block text-[15px]">{isNico ? '改成 YouTube 外观' : '改成ニコニコ外观'}</span>
          <span className="block text-[12px] text-[#606060]">只换外壳，这条视频还在。</span>
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
  const voiceOn = Boolean(beat && props.ttsPlayingId === beat.id);
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
    <div className={`relative bg-[#141414] overflow-hidden ${fill ? 'h-[46vh] shrink-0' : 'aspect-video shrink-0'}`}>
      <div className="absolute inset-x-0 top-8 flex flex-col items-center text-white pointer-events-none">
        <Face name={props.npcSession.npcStreamerName} size={64} light />
        <div className="mt-2 text-[14px]">{props.npcSession.npcStreamerName}</div>
      </div>
      <span className="absolute left-2 top-2 h-6 px-2 bg-[#c62828] text-white text-[12px] inline-flex items-center">LIVE</span>
      <span className="absolute right-2 top-2 h-6 px-2 bg-black/70 text-white text-[12px] inline-flex items-center">
        {formatCount(props.npcSession.viewerCount)}
      </span>
      {beat && (
        <FloatingDanmakuOverlay danmakuList={beat.npcDanmaku || []} visible platformTheme={props.platformTheme} />
      )}
      {beat?.npcSpeech ? (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 py-2 bg-black/80">
          <p className="text-[14px] leading-5 text-white break-words" style={twoLines}>{beat.npcSpeech}</p>
        </div>
      ) : null}
    </div>
  );

  const body = beat ? (
    <div className="bg-white">
      <article className="px-4 py-3 border-b border-[#eee]">
        <p className="text-[12px] leading-5 text-[#606060]">{props.npcSession.npcStreamerName} · 现在这一句</p>
        <h2 className="mt-3 text-[12px] leading-4 text-[#606060]">画面</h2>
        <p className="mt-1 text-[15px] leading-7 break-words">{beat.npcScreen || '这一拍还没有画面。'}</p>
        <h2 className="mt-4 text-[12px] leading-4 text-[#606060]">台词</h2>
        <p className="mt-1 text-[15px] leading-7 break-words">{beat.npcSpeech || '这一拍没有说话。'}</p>
      </article>
      <div
        className="px-4 py-3 border-t border-[#eee]"
        {...bindLongPress(() => openBeat(beat))}
        onClick={() => { if (!wasLongPressTriggered()) props.onPlayCharVoice(beat); }}
      >
        <div className="flex items-center gap-2">
          <Face src={props.charAvatar} name={props.charName} size={28} />
          <span className="text-[14px] font-medium">{props.charName}</span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); props.onPlayCharVoice(beat); }}
            className="h-11 ml-auto px-2 text-[15px] font-medium"
          >
            {voiceOn ? '停止' : '听这句'}
          </button>
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
            <li key={dm.id} className="py-2.5 border-b border-[#f2f2f2]">
              <div className="text-[13px] font-medium text-[#606060]">{dm.senderName}</div>
              <p className="text-[15px] leading-6 break-words">{dm.text}</p>
            </li>
          ))}
        </ul>
      )}
      {isNico && beat.npcDanmaku?.length > 0 && (
        <table className="w-full text-left">
          <tbody>
            {beat.npcDanmaku.map(dm => (
              <tr key={dm.id} className="border-t border-[#eee]">
                <td className="px-3 py-2.5">
                  <div className="text-[12px] text-[#888]">{dm.senderName}</div>
                  <p className="text-[15px] leading-6 break-words">{dm.text}</p>
                </td>
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
          <IconButton label="返回" onClick={() => { if (!popInner()) props.onBack(); }}><Icon name="back" /></IconButton>
          <div className="flex-1 min-w-0 px-1">
            <div className="text-[14px] font-medium truncate">{props.npcSession.npcRoomTitle}</div>
            <div className="text-[11px] text-[#606060] truncate">{props.npcSession.npcStreamerName}</div>
          </div>
          <IconButton label="私聊" onClick={() => setPhone(true)}><Icon name="chat" /></IconButton>
          <IconButton label="更多" onClick={() => setMenu(true)}><Icon name="more" /></IconButton>
        </header>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {picture(fullscreen)}
        {body}
      </div>
      <div className="shrink-0 flex gap-2 px-3 py-2 bg-white border-t border-[#eee]">
        {idx > 0 && (
          <button type="button" onClick={() => setIdx(idx - 1)} className="h-12 px-3 border border-[#111] text-[15px] font-medium">
            上一句
          </button>
        )}
        {idx < max ? (
          <button type="button" onClick={() => setIdx(idx + 1)} className="h-12 flex-1 bg-[#111] text-white text-[15px] font-medium">
            下一句
          </button>
        ) : (
          <button
            type="button"
            disabled={props.isGenerating}
            onClick={() => props.onAdvanceBeat()}
            className="h-12 flex-1 text-[15px] font-medium text-white bg-[#ff0000] disabled:opacity-40"
          >
            {props.isGenerating ? '正在演…' : '再看一段'}
          </button>
        )}
        <button type="button" onClick={() => setFullscreen(v => !v)} className="h-12 px-3 border border-[#111] text-[15px] font-medium">
          {fullscreen ? '退出' : '全屏'}
        </button>
      </div>
      <form
        className="shrink-0 bg-white border-t border-[#eee] px-2 py-1.5 flex items-center gap-1 pb-[max(6px,env(safe-area-inset-bottom))]"
        onSubmit={e => { e.preventDefault(); send(); }}
      >
        <div className="w-[148px] shrink-0">
          <DropDown
            label=""
            value={mode}
            onChange={id => setMode(id as 'whisper_char' | 'send_npc_danmaku')}
            options={[
              { id: 'whisper_char', label: `对${props.charName}说` },
              { id: 'send_npc_danmaku', label: '发到直播间' },
            ]}
          />
        </div>
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
        <p className="text-[12px] leading-5 text-[#606060] mb-2">旁边的人是你自己的角色。屏幕里是别人的直播。</p>
        <button type="button" className="w-full min-h-11 py-2 text-left border-b border-[#f3f3f3]" onClick={() => { setMenu(false); props.onShareNpcWatchToChat(); }}>
          <span className="block text-[15px]">发到私聊</span>
          <span className="block text-[12px] text-[#606060]">把现在这一段做成卡片，发进聊天。</span>
        </button>
        <button type="button" className="w-full min-h-11 py-2 text-left" onClick={() => props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico')}>
          <span className="block text-[15px]">{isNico ? '改成 YouTube 外观' : '改成ニコニコ外观'}</span>
          <span className="block text-[12px] text-[#606060]">只换外壳。还是这一场陪看。</span>
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
