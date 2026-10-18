/**
 * 直播间。
 * 上屏是一块够高的画面：背景、居中头像、最上沿小弹幕、台词只写在画面里。
 * 点台词出声，长按出台词菜单。画面下是进度条和「推进」「总结」。
 * 下屏弹幕一行一条，名字贴着内容。分镜和阶段总结在下拉里。
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
  useLongPressMenu,
} from './LiveSharedWidgets';
import {
  Icon,
  IconButton,
  Sheet,
  Seek,
  DropDown,
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
  onBindBack: (fn: () => boolean) => void;
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
  const { bindLongPress, wasLongPressTriggered } = useLongPressMenu();
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
  };

  const voiceOn = Boolean(beat && props.ttsPlayingBeatId === beat.id);
  const voiceBusy = Boolean(beat && props.ttsLoadingBeatId === beat.id);

  const toggleVoice = () => {
    if (!beat?.speechOriginal?.trim() || voiceBusy) return;
    props.onPlayBeatVoice(beat);
  };

  const popInner = () => {
    if (props.actionSheetTarget) {
      props.setActionSheetTarget(null);
      return true;
    }
    if (props.activeBottomDrawer !== 'none') {
      props.setActiveBottomDrawer('none');
      return true;
    }
    if (menuOpen) {
      setMenuOpen(false);
      return true;
    }
    if (props.showFloatingPhone) {
      props.setShowFloatingPhone(false);
      return true;
    }
    if (props.isFullscreen) {
      props.setIsFullscreen(false);
      return true;
    }
    return false;
  };
  props.onBindBack(() => {
    if (popInner()) return true;
    props.onBackToLobby();
    return true;
  });

  const toggle184 = () => {
    const main = props.viewerPersonas.find(p => p.isMain);
    const alt = props.viewerPersonas.find(p => !p.isMain);
    if (activePersona.isMain) {
      if (alt) props.onSelectPersona(alt.id);
      else props.onOpenPersonaModal();
    } else if (main) props.onSelectPersona(main.id);
    else props.onOpenPersonaModal();
  };

  const speechLines = splitLines(beat?.speechOriginal || '');

  const advance = () => {
    if (!atEnd) {
      seek(currentGlobalBeatIdx + 1);
      return;
    }
    if (!ended && !props.isGenerating) props.onGenerateNextChunk();
  };

  const openThisBeat = () => {
    if (beat && item) props.openBeatMenu(item.chunkId, beat, '这一段');
  };

  const stage = (fill: boolean) => (
    <div className={`relative overflow-hidden bg-[#141414] ${fill ? 'flex-1 min-h-0' : 'h-[46vh] min-h-[300px] shrink-0'}`}>
      {props.displayBackgroundUrl ? (
        <TokenImg value={props.displayBackgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[46%] flex items-center justify-center">
        <Avatar src={props.displayAvatar} name={channel.channelName} size={fill ? 112 : 96} />
      </div>
      <div className="pointer-events-none absolute left-2 top-2 z-20 inline-flex items-center gap-1.5 h-6 px-2 bg-[#ff0000] text-white text-[12px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
        {ended ? '回放' : '直播'}
      </div>
      <div className="pointer-events-none absolute right-2 top-2 z-20 h-6 max-w-[42%] px-2 inline-flex items-center bg-black/70 text-white text-[12px] truncate">
        {formatCount(session.viewerCount)} 在看
      </div>
      {props.showDanmakuOverlay && (
        <FloatingDanmakuOverlay
          danmakuList={visibleDanmakuFeed}
          showTranslation={props.showTranslation}
          visible
          platformTheme={platformTheme}
        />
      )}
      <div
        className="absolute inset-x-0 bottom-0 z-20 max-h-[52%] overflow-y-auto px-3 py-2 bg-black/80 text-white"
        {...bindLongPress(openThisBeat)}
        onClick={() => {
          if (wasLongPressTriggered()) return;
          toggleVoice();
        }}
      >
        <p className="text-[12px] leading-4 text-white/70">
          {voiceOn ? '正在念' : voiceBusy ? '正在合成' : '点台词听这句，长按出菜单'}
          {allTimelineBeats.length ? ` · ${currentGlobalBeatIdx + 1}/${allTimelineBeats.length}` : ''}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-white/85 break-words">
          {beat?.screen || (props.isGenerating ? '正在接这一拍…' : '这一拍还没有画面。')}
        </p>
        {beat?.speechOriginal ? (
          speechLines.map((line, i) => (
            <p key={`${beat.id}-${i}`} className="mt-1.5 text-[15px] leading-6 font-medium break-words">{line}</p>
          ))
        ) : (
          <p className="mt-1.5 text-[14px] leading-5 text-white/70">这一拍没有说话。</p>
        )}
        {props.showTranslation && trans && trans !== beat?.speechOriginal ? (
          <p className="mt-1 text-[13px] leading-5 text-white/70 break-words">{trans}</p>
        ) : null}
      </div>
    </div>
  );

  const transport = (
    <div className="shrink-0 bg-[#0f0f0f] text-white">
      <div className="px-3 pt-1">
        <Seek
          label="这场进度"
          min={0}
          max={maxIdx}
          value={Math.min(currentGlobalBeatIdx, maxIdx)}
          onChange={seek}
          variant={isNico ? 'nico' : 'yt'}
        />
      </div>
      <div className="h-11 px-1 flex items-center">
        <span className="px-2 text-[12px] tabular-nums text-white/80">
          {clockFromIndex(currentGlobalBeatIdx)} · {currentGlobalBeatIdx + 1}/{allTimelineBeats.length || 0}
        </span>
        <button
          type="button"
          onClick={advance}
          disabled={(ended && atEnd) || props.isGenerating}
          className="h-11 px-3 inline-flex items-center gap-1 text-[14px] font-medium disabled:opacity-40"
        >
          <Icon name="skipForward" size={18} />
          推进
        </button>
        <button
          type="button"
          onClick={props.onEndStreamClick}
          className="h-11 px-3 text-[14px] font-medium"
        >
          总结
        </button>
        <button
          type="button"
          onClick={() => props.setIsFullscreen(!props.isFullscreen)}
          className="ml-auto h-11 px-3 inline-flex items-center"
          aria-label={props.isFullscreen ? '退出全屏' : '全屏'}
        >
          <Icon name={props.isFullscreen ? 'collapse' : 'expand'} size={20} />
        </button>
      </div>
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
      <button
        type="button"
        onClick={() => props.setActiveBottomDrawer(props.activeBottomDrawer === 'gift' ? 'none' : 'gift')}
        className="h-11 px-2 text-[14px] shrink-0"
      >
        礼物
      </button>
      <button
        type="button"
        onClick={() => props.setActiveBottomDrawer(props.activeBottomDrawer === 'sc' ? 'none' : 'sc')}
        className="h-11 px-2 text-[14px] shrink-0"
      >
        {isNico ? '广告' : '醒目'}
      </button>
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

  return (
    <div className="live-ui relative h-full w-full flex flex-col overflow-hidden bg-white text-[#111]" style={{ fontFamily: font }}>
      <LiveUiStyle />
      <input ref={props.bgFileInputRef as React.Ref<HTMLInputElement>} type="file" accept="image/*" className="hidden" onChange={props.handleUploadBgFile} />

      {!props.isFullscreen && (
        <header className="h-12 px-1 flex items-center shrink-0 border-b border-[#eee] bg-white">
          <IconButton label="返回上一层" onClick={() => { if (!popInner()) props.onBackToLobby(); }}>
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
          <div className="relative flex-1 min-h-0">
            {stage(true)}
            <button
              type="button"
              onClick={() => props.setIsFullscreen(false)}
              className="absolute top-2 left-2 z-30 h-11 px-3 bg-black/75 text-white text-[14px]"
            >
              退出全屏
            </button>
          </div>
          {transport}
          {composer}
        </div>
      ) : (
        <>
          {stage(false)}
          {transport}
          <div className="shrink-0 px-3 bg-white border-b border-[#eee]">
            <DropDown
              label="下面"
              value={props.lowerTab}
              onChange={id => props.setLowerTab(id as 'chat' | 'script')}
              options={[
                { id: 'chat', label: `弹幕 ${visibleDanmakuFeed.length}` },
                { id: 'script', label: '分镜和阶段总结' },
              ]}
            />
          </div>
          <div ref={props.chatScrollRef as React.Ref<HTMLDivElement>} className="flex-1 min-h-0 overflow-y-auto">
            {chatRows}
          </div>
          {props.lowerTab === 'chat' && composer}
        </>
      )}

      {props.isGenerating && !props.isFullscreen && (
        <div className="pointer-events-none absolute left-3 bottom-24 z-30 h-8 px-3 inline-flex items-center bg-black/75 text-white text-[12px]">
          主播正在接话
        </div>
      )}

      <Sheet open={menuOpen} title="这场直播" onClose={() => setMenuOpen(false)}>
        <p className="text-[12px] leading-5 text-[#606060] mb-2">点一行就做那一件事。做完这个单子会关上，回到直播间。</p>
        <Row label="从头看" detail="回到第一句。想看最后一句，再点「跳到最新」。" onClick={() => { setMenuOpen(false); seek(0); }} />
        {currentGlobalBeatIdx > 0 && (
          <Row label="上一句" detail="回到刚才那一句。" onClick={() => { setMenuOpen(false); seek(currentGlobalBeatIdx - 1); }} />
        )}
        {!atEnd && (
          <Row label="跳到最新" detail="直接看到最后一句。最后一句旁边才是「往下演一段」。" onClick={() => { setMenuOpen(false); seek(maxIdx); }} />
        )}
        <Row label="全屏看画面" detail="画面铺满。全文在退出全屏之后。" onClick={() => { setMenuOpen(false); props.setIsFullscreen(true); }} />
        <Row
          label={props.autoPlayStep ? '播完自动下一句：开' : '播完自动下一句：关'}
          detail="开了之后，这句念完会跳到已经写好的下一句。不会自己去请模型写新的。"
          onClick={() => props.setAutoPlayStep(v => !v)}
        />
        <Row label="私聊" detail="打开旁边的手机，跟主播私下说话。" onClick={() => { setMenuOpen(false); props.setShowFloatingPhone(true); }} />
        <Row label={`观众身份：${activePersona.name}`} detail={activePersona.isMain ? '现在是名牌。点开可以换成匿名小号。' : '现在是匿名。点开可以换回名牌。'} onClick={() => { setMenuOpen(false); props.onOpenPersonaModal(); }} />
        <Row label="频道和语音" detail="改频道名字、声音和同传。改完回到这场直播。" onClick={() => { setMenuOpen(false); props.onOpenChannelSettings(); }} />
        <Row label="更换画面背景" detail="选一张图，铺满上面的视频。" onClick={() => { setMenuOpen(false); props.bgFileInputRef.current?.click(); }} />
        <Row label="重新生成本场礼物" detail="请辅助模型换一组礼物。会用到接口。" onClick={() => { setMenuOpen(false); props.onRequestRefreshGifts(); }} />
        <Row
          label={props.immediateReplyOnSend ? '发弹幕后让主播接：开' : '发弹幕后让主播接：关'}
          detail="开着时，你一发弹幕就会请模型写主播的反应。"
          onClick={() => props.setImmediateReplyOnSend(v => !v)}
        />
        <Row
          label={props.showDanmakuOverlay ? '画面飘字：开' : '画面飘字：关'}
          detail="开着时，小字从画面最上沿飞过，不盖住下面的台词。"
          onClick={() => props.setShowDanmakuOverlay(v => !v)}
        />
        <Row
          label={props.showTranslation ? '同传译文：开' : '同传译文：关'}
          detail="开着时，外语句子下面多一行中文。"
          onClick={() => props.setShowTranslation(v => !v)}
        />
        <Row
          label={props.unfoldedChunks.length >= 2 ? (props.isSummarizing ? '正在整理早期切片…' : '把早期切片收成摘要') : '早期切片还不够'}
          detail="收成摘要后，最早的几段会折起来，给后面的内容腾地方。"
          onClick={() => {
            if (props.unfoldedChunks.length < 2 || props.isSummarizing) return;
            setMenuOpen(false);
            props.onManualFoldChunks();
          }}
        />
        {!ended && <Row label="结束直播" detail="先给你看总结，确认后这场才结束。" danger onClick={() => { setMenuOpen(false); props.onEndStreamClick(); }} />}
        <Row
          label={isNico ? '改成 YouTube 外观' : '改成ニコニコ生放送外观'}
          detail="只换这层壳。直播内容还是这一场。"
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
    <ul className="px-3 py-1">
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
          <li key={dm.id} className="py-0.5 leading-[18px]">
            <span className="text-[12px] font-medium text-[#606060]">{dm.senderName}</span>
            {dm.fanBadge ? <span className="ml-1 text-[11px] text-[#909090]">{dm.fanBadge}</span> : null}
            {dm.giftName ? <span className="ml-1 text-[12px]">{dm.giftEmoji}{dm.giftName}</span> : null}
            <span className="ml-1.5 text-[13px] leading-[18px] text-[#0f0f0f] break-words">{dm.text}</span>
            {showTranslation && trans && trans !== dm.text ? (
              <span className="ml-1 text-[12px] text-[#606060]">{trans}</span>
            ) : null}
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
              <td className="px-3 py-0.5 leading-[18px]">
                <span className="text-[11px] text-[#888]">{hh}</span>
                <span className="ml-1.5 text-[12px] text-[#555]">{dm.senderName}</span>
                {dm.scAmount ? <span className="ml-1 text-[12px] font-medium text-[#111]">¥{dm.scAmount}</span> : null}
                {dm.giftName ? <span className="ml-1 text-[12px]">{dm.giftEmoji}{dm.giftName}</span> : null}
                <span className="ml-1.5 text-[13px] leading-[18px] text-[#222] break-words">{dm.text}</span>
                {showTranslation && trans && trans !== dm.text ? (
                  <span className="ml-1 text-[12px] text-[#767676]">{trans}</span>
                ) : null}
              </td>
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

function Row({ label, detail, onClick, danger }: { label: string; detail?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`w-full min-h-11 py-2 text-left border-b border-[#f3f3f3] ${danger ? 'text-[#c62828]' : ''}`}>
      <span className="block text-[15px] leading-5">{label}</span>
      {detail ? <span className="block text-[12px] leading-5 text-[#606060] mt-0.5">{detail}</span> : null}
    </button>
  );
}

function splitLines(text: string): string[] {
  const parts = text
    .split(/(?<=[。！？!?…])\s*/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : text.trim() ? [text.trim()] : [];
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
