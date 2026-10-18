/**
 * 直播间。
 * YouTube：黑槽播放器贴顶，标题和台词在白底上全文展开，聊天是名字加正文，不是气泡。
 * ニコニコ：播放器下是黑控制条，再下面是实况全文，再下面是时间 / 评论 / 名字三列。
 */
import React from 'react';
import TokenImg from '../os/TokenImg';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  LiveBeat,
  LiveChunk,
  LiveDanmakuItem,
  LiveRollingSummary,
  StreamGiftOption,
  LivePlatformTheme,
  SC_TIER_OPTIONS,
} from '../../utils/liveStreamTypes';
import {
  FloatingDanmakuOverlay,
  SuperChatHighlightCard,
  LiveFloatingPhone,
  BeatLongPressSheet,
  BeatActionSheetTarget,
} from './LiveSharedWidgets';
import {
  Icon,
  IconButton,
  Sheet,
  Seek,
  LiveUiStyle,
  formatCount,
  clockFromIndex,
} from './platformChrome';

type TimelineItem = { chunkId: string; chunkIndex: number; beat: LiveBeat; globalIdx: number };

export function LiveWatchScreen(props: {
  charId: string;
  charName: string;
  userName: string;
  channel: StreamerChannelProfile;
  session: LiveStreamSession;
  viewerPersonas: ViewerPersona[];
  activePersona: ViewerPersona;
  platformTheme: LivePlatformTheme;
  isGenerating: boolean;
  isSummarizing: boolean;
  ttsPlayingBeatId: string | null;
  ttsLoadingBeatId: string | null;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  showPlayerControls: boolean;
  setShowPlayerControls: React.Dispatch<React.SetStateAction<boolean>>;
  autoPlayStep: boolean;
  setAutoPlayStep: React.Dispatch<React.SetStateAction<boolean>>;
  showDanmakuOverlay: boolean;
  setShowDanmakuOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  showTranslation: boolean;
  setShowTranslation: React.Dispatch<React.SetStateAction<boolean>>;
  lowerTab: 'chat' | 'script';
  setLowerTab: (t: 'chat' | 'script') => void;
  danmakuInput: string;
  setDanmakuInput: (v: string) => void;
  activeBottomDrawer: 'none' | 'sc' | 'gift';
  setActiveBottomDrawer: (v: 'none' | 'sc' | 'gift') => void;
  selectedScTierIdx: number;
  setSelectedScTierIdx: (n: number) => void;
  immediateReplyOnSend: boolean;
  setImmediateReplyOnSend: React.Dispatch<React.SetStateAction<boolean>>;
  showFloatingPhone: boolean;
  setShowFloatingPhone: (v: boolean) => void;
  phoneUnread: boolean;
  onPhoneUnread: (unread: boolean) => void;
  actionSheetTarget: BeatActionSheetTarget | null;
  setActionSheetTarget: (t: BeatActionSheetTarget | null) => void;
  editingSummaryId: string | null;
  setEditingSummaryId: (id: string | null) => void;
  summaryDraft: string;
  setSummaryDraft: (v: string) => void;
  bgFileInputRef: React.RefObject<HTMLInputElement | null>;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  currentGlobalBeatIdx: number;
  setCurrentGlobalBeatIdx: (n: number) => void;
  allTimelineBeats: TimelineItem[];
  unfoldedChunks: LiveChunk[];
  visibleDanmakuFeed: LiveDanmakuItem[];
  displayAvatar?: string;
  displayBackgroundUrl: string;
  activeGifts: StreamGiftOption[];
  openBeatMenu: (chunkId: string, beat: LiveBeat, labelPrefix: string) => void;
  handleSendSubmit: () => void;
  handleSendGift: (gift: StreamGiftOption) => void;
  handleUploadBgFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onChangePlatformTheme: (theme: LivePlatformTheme) => void;
  onSelectPersona: (id: string) => void;
  onOpenPersonaModal: () => void;
  onOpenChannelSettings: () => void;
  onBackToLobby: () => void;
  onGenerateNextChunk: () => void;
  onPlayBeatVoice: (beat: LiveBeat, options?: { skipCache?: boolean }) => void;
  onRequestRefreshGifts: () => void;
  onManualFoldChunks: () => void;
  onEditRollingSummary: (summaryId: string, nextText: string) => void;
  onRegenerateRollingSummary: (summary: LiveRollingSummary) => void;
  onDissolveRollingSummary: (summaryId: string) => void;
  onEndStreamClick: () => void;
}) {
  const {
    channel,
    session,
    platformTheme,
    currentGlobalBeatIdx,
    allTimelineBeats,
    visibleDanmakuFeed,
    activePersona,
  } = props;
  const isNico = platformTheme === 'niconico';
  const [menuOpen, setMenuOpen] = React.useState(false);
  const item = allTimelineBeats[currentGlobalBeatIdx] || allTimelineBeats[allTimelineBeats.length - 1];
  const beat = item?.beat;
  const atEnd = allTimelineBeats.length === 0 || currentGlobalBeatIdx >= allTimelineBeats.length - 1;
  const ended = session.status === 'ended';
  const trans = beat?.speechTranslated ? beat.speechTranslated.replace(/^译[：:]\s*/, '').trim() : '';
  const maxIdx = Math.max(0, allTimelineBeats.length - 1);
  const font = isNico
    ? '"Yu Gothic UI", "Hiragino Sans", Meiryo, "PingFang SC", "Noto Sans SC", sans-serif'
    : 'Roboto, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif';

  const seek = (n: number) => {
    props.setCurrentGlobalBeatIdx(Math.max(0, Math.min(maxIdx, n)));
    if (n < maxIdx) props.setAutoPlayStep(false);
  };

  const toggle184 = () => {
    const main = props.viewerPersonas.find(p => p.isMain);
    const alt = props.viewerPersonas.find(p => !p.isMain);
    if (activePersona.isMain) {
      if (alt) props.onSelectPersona(alt.id);
      else props.onOpenPersonaModal();
    } else if (main) props.onSelectPersona(main.id);
    else props.onOpenPersonaModal();
  };

  const picture = (fill: boolean) => (
    <div
      className={`relative overflow-hidden ${fill ? 'flex-1 min-h-[120px]' : 'aspect-video shrink-0'}`}
      style={{ background: props.displayBackgroundUrl ? '#111' : '#141414' }}
      onClick={() => props.setShowPlayerControls(v => !v)}
    >
      {props.displayBackgroundUrl ? (
        <TokenImg value={props.displayBackgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Avatar src={props.displayAvatar} name={channel.channelName} size={fill ? 96 : 72} />
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 h-6 px-2 bg-[#ff0000] text-white text-[12px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
        {ended ? (isNico ? 'タイムシフト' : '回放') : isNico ? 'LIVE' : '直播'}
      </div>
      <div className="pointer-events-none absolute right-3 top-3 h-6 px-2 inline-flex items-center bg-black/70 text-white text-[12px]">
        {isNico ? `${formatCount(session.viewerCount)}来場` : `${formatCount(session.viewerCount)} 人正在看`}
      </div>
      {props.showDanmakuOverlay && isNico && (
        <FloatingDanmakuOverlay
          danmakuList={beat?.danmaku || []}
          showTranslation={props.showTranslation}
          visible
          platformTheme={platformTheme}
        />
      )}
      {props.showPlayerControls && !isNico && (
        <button
          type="button"
          aria-label={props.autoPlayStep ? '暂停' : '播放'}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/55 text-white inline-flex items-center justify-center"
          onClick={e => {
            e.stopPropagation();
            props.setAutoPlayStep(v => !v);
          }}
        >
          <Icon name={props.autoPlayStep ? 'pause' : 'play'} />
        </button>
      )}
    </div>
  );

  const caption = (
    <div className={`${props.isFullscreen ? 'max-h-[38%] overflow-y-auto' : ''} bg-white px-4 py-3`}>
      <div className="text-[12px] leading-4 text-[#606060]">{isNico ? '実況' : '这一幕'}</div>
      <p className="mt-1 text-[14px] leading-[22px] text-[#111] break-words">
        {beat?.screen || (props.isGenerating ? '正在接这一拍…' : '这一拍还没有画面。')}
      </p>
      {beat?.speechOriginal ? (
        <>
          <div className="mt-3 text-[12px] leading-4 text-[#606060]">{isNico ? '発言' : '台词'}</div>
          <p className="mt-1 text-[15px] leading-6 font-medium text-[#111] break-words">{beat.speechOriginal}</p>
          <button
            type="button"
            onClick={() => props.onPlayBeatVoice(beat)}
            className="mt-1 h-11 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#0f0f0f]"
          >
            <Icon name={props.ttsPlayingBeatId === beat.id ? 'pause' : 'play'} size={18} />
            {props.ttsPlayingBeatId === beat.id ? '正在念' : props.ttsLoadingBeatId === beat.id ? '正在合成' : '听这一句'}
          </button>
        </>
      ) : (
        <p className="mt-3 text-[14px] leading-[22px] text-[#606060]">这一拍没有说话。</p>
      )}
      {props.showTranslation && trans && trans !== beat?.speechOriginal ? (
        <p className="mt-2 text-[13px] leading-5 text-[#606060] break-words">{trans}</p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => beat && item && props.openBeatMenu(item.chunkId, beat, isNico ? 'この場面' : '这一段')}
          className="h-11 px-3 text-[14px] font-medium underline"
        >
          {isNico ? 'この場面の操作' : '这一段的操作'}
        </button>
      </div>
    </div>
  );

  const transport = (
    <div className={`shrink-0 flex items-center gap-1 px-1 ${isNico ? 'bg-[#141414] text-white' : 'bg-white text-[#0f0f0f]'}`}>
      <IconButton label={props.autoPlayStep ? '暂停' : '播放'} onClick={() => props.setAutoPlayStep(v => !v)}>
        <Icon name={props.autoPlayStep ? 'pause' : 'play'} />
      </IconButton>
      <IconButton label="上一段" onClick={() => seek(currentGlobalBeatIdx - 1)} disabled={currentGlobalBeatIdx <= 0}>
        <Icon name="skipBack" />
      </IconButton>
      <div className="flex-1 min-w-0">
        <Seek
          label="播放进度"
          min={0}
          max={maxIdx}
          value={Math.min(currentGlobalBeatIdx, maxIdx)}
          onChange={seek}
          variant={isNico ? 'nico' : 'ytLight'}
        />
      </div>
      <span className="text-[12px] tabular-nums shrink-0 pr-1">
        {clockFromIndex(currentGlobalBeatIdx)}
      </span>
      {!atEnd && (
        <button type="button" onClick={() => seek(maxIdx)} className="h-11 px-2 text-[12px] font-medium text-[#ff0000] shrink-0">
          {isNico ? 'LIVEへ' : '回到直播'}
        </button>
      )}
      <IconButton label={props.isFullscreen ? '退出全屏' : '全屏'} onClick={() => props.setIsFullscreen(!props.isFullscreen)}>
        <Icon name={props.isFullscreen ? 'collapse' : 'expand'} />
      </IconButton>
    </div>
  );

  const chatRows = (
    <div>
      {props.lowerTab === 'script' ? (
        <ScriptList {...props} />
      ) : isNico ? (
        <NicoCommentTable
          items={visibleDanmakuFeed}
          showTranslation={props.showTranslation}
        />
      ) : (
        <YtChat items={visibleDanmakuFeed} showTranslation={props.showTranslation} />
      )}
    </div>
  );

  const composer = (
    <form
      className="shrink-0 bg-white border-t border-[#e6e6e6] px-2 py-1.5 flex items-center gap-1 pb-[max(6px,env(safe-area-inset-bottom))]"
      onSubmit={e => {
        e.preventDefault();
        props.handleSendSubmit();
      }}
    >
      {isNico ? (
        <button
          type="button"
          onClick={toggle184}
          className={`h-11 px-2 text-[13px] font-bold shrink-0 border ${activePersona.isMain ? 'border-[#111] text-[#111]' : 'bg-[#111] text-white border-[#111]'}`}
        >
          {activePersona.isMain ? 'なふだ' : '184'}
        </button>
      ) : (
        <Avatar src={undefined} name={activePersona.name} size={28} />
      )}
      <input
        value={props.danmakuInput}
        onChange={e => props.setDanmakuInput(e.target.value)}
        placeholder={isNico ? `コメント（${activePersona.name}）` : `以 ${activePersona.name} 的身份聊天`}
        aria-label={isNico ? '评论' : '聊天'}
        className={`flex-1 min-w-0 h-11 px-3 text-[14px] bg-[#f2f2f2] focus:outline-none ${isNico ? '' : 'rounded-full'}`}
      />
      <IconButton
        label={isNico ? '礼物' : '礼物'}
        onClick={() => props.setActiveBottomDrawer(props.activeBottomDrawer === 'gift' ? 'none' : 'gift')}
      >
        <Icon name="gift" size={22} />
      </IconButton>
      <IconButton
        label={isNico ? '付费评论' : '醒目留言'}
        onClick={() => props.setActiveBottomDrawer(props.activeBottomDrawer === 'sc' ? 'none' : 'sc')}
      >
        <Icon name="yen" size={22} />
      </IconButton>
      <button
        type="submit"
        disabled={!props.danmakuInput.trim()}
        aria-label={isNico ? '投稿' : '发送'}
        className={`h-11 px-3 text-[14px] font-medium text-white disabled:opacity-40 shrink-0 ${isNico ? 'bg-[#111]' : 'rounded-full bg-[#0f0f0f]'}`}
      >
        {isNico ? '投稿' : '发送'}
      </button>
    </form>
  );

  const caughtUp =
    atEnd && !ended ? (
      <div className="px-4 py-2 bg-white">
        <button
          type="button"
          disabled={props.isGenerating}
          onClick={props.onGenerateNextChunk}
          className={`w-full h-12 text-[15px] font-medium text-white disabled:opacity-40 ${isNico ? 'bg-[#111]' : 'rounded-full bg-[#ff0000]'}`}
        >
          {props.isGenerating ? (isNico ? '放送をつないでいます…' : '正在往下演…') : isNico ? '放送を続ける' : '继续这场直播'}
        </button>
      </div>
    ) : null;

  return (
    <div className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]" style={{ fontFamily: font }}>
      <LiveUiStyle />
      <input ref={props.bgFileInputRef as React.Ref<HTMLInputElement>} type="file" accept="image/*" className="hidden" onChange={props.handleUploadBgFile} />

      {!props.isFullscreen && (
        <header className={`h-12 px-1 flex items-center shrink-0 border-b border-[#eee] ${isNico ? 'bg-white' : 'bg-white'}`}>
          <IconButton label="返回" onClick={props.onBackToLobby}>
            <Icon name="back" />
          </IconButton>
          <div className="flex-1 min-w-0 px-1">
            <div className="text-[14px] font-medium truncate">{session.title}</div>
            <div className="text-[11px] text-[#606060] truncate">{channel.channelName}</div>
          </div>
          <IconButton label="私聊" onClick={() => props.setShowFloatingPhone(true)} dot={props.phoneUnread}>
            <Icon name="chat" />
          </IconButton>
          <IconButton label="更多" onClick={() => setMenuOpen(true)}>
            <Icon name="more" />
          </IconButton>
        </header>
      )}

      {props.isFullscreen ? (
        <div className="flex-1 min-h-0 flex flex-col bg-black">
          <div className="relative flex-1 min-h-0 flex flex-col">
            {picture(true)}
            <div className="absolute top-1 left-1 z-20" onClick={e => e.stopPropagation()}>
              <IconButton label="退出全屏" onClick={() => props.setIsFullscreen(false)}>
                <span className="text-white"><Icon name="collapse" /></span>
              </IconButton>
            </div>
          </div>
          {caption}
          {transport}
          {caughtUp}
          {composer}
        </div>
      ) : (
        <>
          {picture(false)}
          {transport}
          {caughtUp}
          <div className="shrink-0 max-h-[220px] overflow-y-auto bg-white">
            {caption}
          </div>
          <div className="shrink-0">
            {!isNico && (
              <button
                type="button"
                onClick={props.onOpenChannelSettings}
                className="w-full min-h-11 px-4 py-2 text-left text-[12px] leading-5 text-[#606060] break-words"
              >
                {ended ? '回放' : `${formatCount(session.viewerCount)} 人正在看`}
                {' · '}
                {session.categoryLabel}
                {' · '}
                {channel.channelName}
                {' · 频道设置'}
              </button>
            )}
            {isNico && (
              <div className="px-3 py-2 bg-[#f6f6f6] text-[12px] leading-5 text-[#333] border-y border-[#e6e6e6] break-words">
                {ended ? 'タイムシフト' : '放送中'}
                {' · '}
                {formatCount(session.viewerCount)}来場
                {' · '}
                コメント {visibleDanmakuFeed.length}
                {' · '}
                {channel.channelName}
              </div>
            )}
          </div>
          <div className="flex border-b border-[#eee] bg-white shrink-0">
            {(
              [
                ['chat', isNico ? 'コメント' : '聊天'],
                ['script', isNico ? 'タイムシフト' : '分镜'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => props.setLowerTab(id)}
                className={`flex-1 h-11 text-[14px] font-medium border-b-2 ${
                  props.lowerTab === id ? 'border-[#111] text-[#111]' : 'border-transparent text-[#767676]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div ref={props.chatScrollRef as React.Ref<HTMLDivElement>} className="flex-1 min-h-0 overflow-y-auto">
            {chatRows}
          </div>
          {props.lowerTab === 'chat' && composer}
        </>
      )}

      {props.isGenerating && !props.isFullscreen && (
        <div className="pointer-events-none absolute left-3 bottom-24 z-30 h-8 px-3 inline-flex items-center bg-black/75 text-white text-[12px]">
          {isNico ? '反応を生成中' : '主播正在接话'}
        </div>
      )}

      <Sheet open={menuOpen} title="这场直播" onClose={() => setMenuOpen(false)}>
        <Row label="私聊" onClick={() => { setMenuOpen(false); props.setShowFloatingPhone(true); }} />
        <Row label={`观众身份：${activePersona.name}`} hint={activePersona.isMain ? '名牌' : '匿名'} onClick={() => { setMenuOpen(false); props.onOpenPersonaModal(); }} />
        <Row label="频道和语音" onClick={() => { setMenuOpen(false); props.onOpenChannelSettings(); }} />
        <Row label="更换画面背景" onClick={() => { setMenuOpen(false); props.bgFileInputRef.current?.click(); }} />
        <Row label="重新生成本场礼物" onClick={() => { setMenuOpen(false); props.onRequestRefreshGifts(); }} />
        <Row
          label={props.immediateReplyOnSend ? '发出后马上让主播接：开' : '发出后马上让主播接：关'}
          onClick={() => props.setImmediateReplyOnSend(v => !v)}
        />
        <Row
          label={props.showDanmakuOverlay ? '画面飘字：开' : '画面飘字：关'}
          onClick={() => props.setShowDanmakuOverlay(v => !v)}
        />
        <Row
          label={props.showTranslation ? '同传译文：开' : '同传译文：关'}
          onClick={() => props.setShowTranslation(v => !v)}
        />
        <Row
          label={props.unfoldedChunks.length >= 2 ? (props.isSummarizing ? '正在整理早期切片…' : '把早期切片收成摘要') : '早期切片还不够，先不用收'}
          onClick={() => {
            if (props.unfoldedChunks.length < 2 || props.isSummarizing) return;
            setMenuOpen(false);
            props.onManualFoldChunks();
          }}
        />
        {!ended && <Row label="结束直播" danger onClick={() => { setMenuOpen(false); props.onEndStreamClick(); }} />}
        <Row
          label={isNico ? '改成 YouTube 外观' : '改成ニコニコ生放送外观'}
          onClick={() => {
            setMenuOpen(false);
            props.onChangePlatformTheme(isNico ? 'youtube' : 'niconico');
          }}
        />
      </Sheet>

      <Sheet
        open={props.activeBottomDrawer === 'sc'}
        title={isNico ? 'ニコニ広告' : '醒目留言'}
        onClose={() => props.setActiveBottomDrawer('none')}
      >
        <p className="text-[13px] leading-5 text-[#606060] mb-2">先在底部写好留言，再选一档金额。发送后会置顶。</p>
        <ul>
          {SC_TIER_OPTIONS.map((tier, idx) => (
            <li key={tier.amount}>
              <button
                type="button"
                onClick={() => props.setSelectedScTierIdx(idx)}
                className="w-full min-h-11 py-2 flex items-center gap-3 text-left"
              >
                <span className="w-1.5 h-8 shrink-0" style={{ background: tier.headerBg }} />
                <span className="flex-1">
                  <span className="block text-[15px] font-medium">{tier.label}</span>
                  <span className="block text-[12px] text-[#606060]">{tier.pinDurationLabel}</span>
                </span>
                {props.selectedScTierIdx === idx ? <Icon name="check" size={18} /> : null}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={!props.danmakuInput.trim()}
          onClick={props.handleSendSubmit}
          className="mt-3 w-full h-12 bg-[#ff0000] text-white text-[15px] font-medium disabled:opacity-40"
        >
          发送这一档
        </button>
      </Sheet>

      <Sheet open={props.activeBottomDrawer === 'gift'} title="礼物" onClose={() => props.setActiveBottomDrawer('none')}>
        {props.activeGifts.length === 0 ? (
          <div>
            <p className="text-[14px] text-[#606060]">这场还没有专属礼物。</p>
            <button type="button" onClick={props.onRequestRefreshGifts} className="mt-3 h-11 px-4 bg-[#111] text-white text-[14px]">
              让辅助模型生一组
            </button>
          </div>
        ) : (
          <ul>
            {props.activeGifts.map(gift => (
              <li key={gift.id} className="flex items-center gap-3 min-h-12 border-b border-[#f2f2f2]">
                <span className="text-[20px] w-8 text-center" aria-hidden="true">{gift.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] break-words">{gift.name}</span>
                  <span className="block text-[12px] text-[#606060]">{gift.currencySymbol}{gift.price}</span>
                </span>
                <button type="button" onClick={() => props.handleSendGift(gift)} className="h-11 px-3 bg-[#111] text-white text-[13px]">
                  送出
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <LiveFloatingPhone
        isOpen={props.showFloatingPhone}
        characterId={props.charId}
        charName={props.charName}
        contextDescription={`【直播间手机私聊】此刻你正在直播间《${session.title}》（频道：${channel.channelName}）开着直播，镜头正对着你。${props.userName} 正在台下用手机给你发私聊消息；你在直播间隙低头看手机回复TA，沿用正常私聊的交流方式。`}
        onClose={() => props.setShowFloatingPhone(false)}
        onUnreadChange={props.onPhoneUnread}
      />

      <BeatLongPressSheet
        target={props.actionSheetTarget}
        ttsLoading={Boolean(props.ttsLoadingBeatId)}
        onClose={() => props.setActionSheetTarget(null)}
      />
    </div>
  );
}

function YtChat({ items, showTranslation }: { items: LiveDanmakuItem[]; showTranslation: boolean }) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-[14px] text-[#606060]">聊天还是空的。在下面写一句，主播会看见。</p>;
  }
  return (
    <ul className="px-3 py-2">
      {items.map(dm => {
        const paid = Boolean(dm.scAmount && dm.scAmount > 0);
        const trans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
        if (paid) {
          return (
            <li key={dm.id} className="my-2">
              <SuperChatHighlightCard item={dm} showTranslation={showTranslation} />
            </li>
          );
        }
        return (
          <li key={dm.id} className="py-1.5 flex gap-2">
            <Avatar src={undefined} name={dm.senderName} size={28} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-5 break-words">
                <span className="font-medium text-[#0f0f0f]">{dm.senderName}</span>
                {dm.fanBadge ? <span className="ml-1 text-[11px] text-[#606060]">{dm.fanBadge}</span> : null}
                {dm.giftName ? <span className="ml-1 text-[12px] text-[#606060]">{dm.giftEmoji} {dm.giftName}</span> : null}
                <span className="text-[#0f0f0f]"> {dm.text}</span>
              </div>
              {showTranslation && trans && trans !== dm.text ? (
                <div className="text-[12px] leading-4 text-[#606060] break-words">{trans}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function NicoCommentTable({ items, showTranslation }: { items: LiveDanmakuItem[]; showTranslation: boolean }) {
  if (items.length === 0) {
    return <p className="px-3 py-8 text-[13px] text-[#767676]">コメントはまだありません。</p>;
  }
  return (
    <table className="w-full text-left border-collapse">
      <tbody>
        {items.map((dm, i) => {
          const paid = Boolean((dm.scAmount && dm.scAmount > 0) || dm.giftName);
          const trans = dm.translation ? dm.translation.replace(/^译[：:]\s*/, '').trim() : '';
          const t = new Date(dm.timestamp || Date.now());
          const hh = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
          return (
            <tr key={dm.id || i} className={`border-b border-[#eee] align-top ${paid ? 'bg-[#fff8e1]' : ''}`}>
              <td className="w-12 px-2 py-1.5 text-[11px] text-[#999] tabular-nums">{hh}</td>
              <td className="px-1 py-1.5 text-[13px] leading-[18px] text-[#222] break-words">
                {dm.scAmount ? <span className="mr-1 font-medium">¥{dm.scAmount}</span> : null}
                {dm.giftName ? <span className="mr-1">{dm.giftEmoji}{dm.giftName}</span> : null}
                {dm.text}
                {showTranslation && trans && trans !== dm.text ? (
                  <span className="block text-[12px] text-[#767676]">{trans}</span>
                ) : null}
              </td>
              <td className="w-[72px] px-2 py-1.5 text-[11px] text-[#888] text-right break-words">{dm.senderName}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScriptList(props: {
  allTimelineBeats: TimelineItem[];
  currentGlobalBeatIdx: number;
  setCurrentGlobalBeatIdx: (n: number) => void;
  session: LiveStreamSession;
  openBeatMenu: (chunkId: string, beat: LiveBeat, labelPrefix: string) => void;
  editingSummaryId: string | null;
  setEditingSummaryId: (id: string | null) => void;
  summaryDraft: string;
  setSummaryDraft: (v: string) => void;
  onEditRollingSummary: (summaryId: string, nextText: string) => void;
  onRegenerateRollingSummary: (summary: LiveRollingSummary) => void;
  onDissolveRollingSummary: (summaryId: string) => void;
  isSummarizing: boolean;
}) {
  return (
    <div>
      {props.session.rollingSummaries.map(sum => (
        <div key={sum.id} className="px-4 py-3 border-b border-[#eee] bg-[#fafafa]">
          <div className="text-[12px] text-[#606060]">第 {sum.fromChunkIndex + 1}–{sum.toChunkIndex + 1} 段摘要</div>
          {props.editingSummaryId === sum.id ? (
            <>
              <textarea
                value={props.summaryDraft}
                onChange={e => props.setSummaryDraft(e.target.value)}
                rows={4}
                className="mt-2 w-full p-2 text-[14px] leading-6 border border-[#ddd] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  props.onEditRollingSummary(sum.id, props.summaryDraft);
                  props.setEditingSummaryId(null);
                }}
                className="h-11 text-[14px] font-medium underline"
              >
                保存
              </button>
            </>
          ) : (
            <p className="mt-1 text-[14px] leading-6 break-words">{sum.content}</p>
          )}
          <div className="flex flex-wrap gap-x-4">
            <button
              type="button"
              onClick={() => {
                props.setEditingSummaryId(sum.id);
                props.setSummaryDraft(sum.content);
              }}
              className="h-11 text-[13px] underline"
            >
              修改
            </button>
            <button type="button" disabled={props.isSummarizing} onClick={() => props.onRegenerateRollingSummary(sum)} className="h-11 text-[13px] underline disabled:opacity-40">
              重新总结
            </button>
            <button type="button" onClick={() => props.onDissolveRollingSummary(sum.id)} className="h-11 text-[13px] underline">
              拆开摘要
            </button>
          </div>
        </div>
      ))}
      <ul>
        {props.allTimelineBeats.map(row => {
          const on = row.globalIdx === props.currentGlobalBeatIdx;
          return (
            <li key={row.beat.id} className={on ? 'bg-[#f6f6f6]' : ''}>
              <button
                type="button"
                onClick={() => props.setCurrentGlobalBeatIdx(row.globalIdx)}
                className="w-full px-4 py-3 text-left"
              >
                <span className="text-[12px] text-[#606060] tabular-nums">{clockFromIndex(row.globalIdx)}</span>
                <span className="block text-[14px] leading-[22px] break-words mt-0.5">{row.beat.speechOriginal || row.beat.screen}</span>
              </button>
              <div className="px-4 pb-2">
                <button type="button" onClick={() => props.openBeatMenu(row.chunkId, row.beat, '这一段')} className="h-8 text-[13px] underline">
                  操作
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ label, hint, onClick, danger }: { label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`w-full min-h-11 py-2 flex items-center justify-between text-left border-b border-[#f3f3f3] ${danger ? 'text-[#c62828]' : ''}`}>
      <span className="text-[15px] leading-5 pr-3">{label}</span>
      {hint ? <span className="text-[12px] text-[#606060] shrink-0">{hint}</span> : null}
    </button>
  );
}

function Avatar({ src, name, size }: { src?: string; name: string; size: number }) {
  if (src) {
    return <TokenImg value={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="rounded-full bg-[#e5e5e5] text-[#111] inline-flex items-center justify-center shrink-0 font-medium"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
    >
      {(name || '?').slice(0, 1)}
    </span>
  );
}
