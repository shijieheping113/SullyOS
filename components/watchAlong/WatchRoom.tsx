/**
 * 陪看房间（照 v4 原型 02/03 屏施工）。
 *
 * 从上到下：顶栏 → 16:9 全幅直播画面（LIVE + 人数 + 字幕层）→ 主播行（含转发与下一段）
 * → 连麦席 → 公屏 → 底栏。一屏只做一件事：看。
 * 导演、本场信息、打赏、总结、设置全收在「更多」里，不跟画面挤。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  R_PILL,
  Sheet,
  SolidButton,
  W,
  WIco,
  formatCount,
} from './chrome';
import { WatchPet } from './WatchPet';
import TokenImg from '../os/TokenImg';
import { washCoverSvg } from '../../utils/watchAlong/coverSvg';
import type { WatchAlongSession, WatchSeqItem } from '../../utils/watchAlong/types';

/** 公屏能送的小礼物 */
export const WATCH_GIFTS = ['小鱼干', '小星星', '一杯奶茶', '小烟花', '醒目留言'];

/** 公屏上能长按改、删的一条 */
export type WatchPublicLineRef = {
  id: string;
  source: 'danmaku' | 'user' | 'char' | 'pending';
  beatId?: string;
  text: string;
  translated?: string;
};

/** 封面渐变拆成两个色，用在画面的两团光斑上 */
const gradientColors = (gradient: string): [string, string] => {
  const [a, b] = (gradient || '').split(',').map(s => s.trim());
  return [a || '#4A3F72', b || '#2B4C57'];
};

export function WatchRoom({
  session,
  charName,
  charAvatar,
  petSrc,
  busy,
  petGenerating,
  bubble,
  bubbleSeq,
  bubbleIsVoice,
  onTapBubble,
  onRevealBubble,
  onSendLiveLine,
  chatUnread,
  micPlaying,
  micLoading,
  onPlayMic,
  /** 桌宠气泡上那个小喇叭：只有语音消息才出现 */
  onPlayBubble,
  bubblePlaying,
  onBack,
  onAdvance,
  onRegenerate,
  onForward,
  onSendDanmaku,
  onSendGift,
  onMicToggle,
  onOpenChat,
  onOpenDirector,
  onOpenSummary,
  onOpenSettings,
  onOpenInfo,
  onRepairBeats,
  repairBusy,
  onEditPublic,
  onDeletePublic,
  onExit,
  onSummon,
  onHidePet,
  onShowPet,
}: {
  session: WatchAlongSession;
  charName: string;
  charAvatar?: string;
  /** 桌宠用的形象（彼方小人 → 小小窝 Q 版 → 头像） */
  petSrc?: string;
  /** 正在生成下一段 */
  busy: boolean;
  /** 小人正在等私聊回复：呼吸一下好认 */
  petGenerating?: boolean;
  bubble: string | null;
  /** 气泡换了一句就 +1，用来重置自动收起 */
  bubbleSeq?: number;
  /** 当前这条是不是语音（只有语音才给喇叭） */
  bubbleIsVoice?: boolean;
  /** 气泡已经亮着时，点一下换下一条 */
  onTapBubble?: () => void;
  /** 气泡收着时，单击先把它亮出来 */
  onRevealBubble?: () => void;
  /** 在直播画面上发一句，并让角色接话 */
  onSendLiveLine?: (text: string) => void;
  chatUnread: number;
  /** 麦上那句正在响 / 正在合成 */
  micPlaying?: boolean;
  micLoading?: boolean;
  onPlayMic: () => void;
  onPlayBubble?: () => void;
  bubblePlaying?: boolean;
  onBack: () => void;
  onAdvance: () => void;
  /** 长按画面：把这一段重新生成一遍（只有最新那一段能重来） */
  onRegenerate: (beatIndex?: number) => void;
  /** 把当前看着的这一幕转发进私聊 */
  onForward: (beatIndex?: number) => void;
  onSendDanmaku: (text: string) => void;
  /** 送个小礼物（公屏动作） */
  onSendGift: (giftName: string, amount: number) => void;
  onMicToggle: () => void;
  onOpenChat: () => void;
  onOpenDirector: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
  /** 本场直播信息：标题、主播人设、这一幕内容，都能手改。带上正在看的这一幕 */
  onOpenInfo: (beatIndex?: number) => void;
  /** 把选中的几段交给辅助模型补格式 */
  onRepairBeats: (indexes: number[]) => void;
  repairBusy?: boolean;
  onEditPublic: (line: WatchPublicLineRef, text: string) => void;
  onDeletePublic: (line: WatchPublicLineRef) => void;
  onExit: () => void;
  onSummon: () => void;
  onHidePet: () => void;
  onShowPet: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const danmakuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [liveDraft, setLiveDraft] = useState('');
  const [liveCompose, setLiveCompose] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** 长按画面出的小菜单：改这一幕 / 本场信息 / 重来 / 转给角色 */
  const [pressMenuOpen, setPressMenuOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairPick, setRepairPick] = useState<number[]>([]);
  const [lineMenu, setLineMenu] = useState<{ line: WatchPublicLineRef; top: number; left: number } | null>(null);
  const [lineEdit, setLineEdit] = useState<WatchPublicLineRef | null>(null);
  const [lineDraft, setLineDraft] = useState('');
  const linePress = useRef<number | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftName, setGiftName] = useState(WATCH_GIFTS[0]);
  const [giftCount, setGiftCount] = useState(1);
  /** 翻看第几幕：null = 跟着最新走；数字 = 停在那一幕（手册：能翻上一幕下一幕） */
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  const lastIndex = session.beats.length - 1;
  const last = session.beats[lastIndex];
  const isLatest = viewIdx === null || viewIdx >= lastIndex;
  const viewBeat = isLatest ? last : session.beats[viewIdx] ?? last;

  // 新一幕进来 / 换了一场，自动回到最新
  useEffect(() => {
    setViewIdx(null);
  }, [session.id, session.beats.length]);

  const charHere = session.cast.presence !== 'solo';
  const [c1, c2] = gradientColors(session.room.coverGradient);
  const cover = washCoverSvg(session.room.coverSvg);

  /** 麦上最后一句话（角色说的）；没有就是 undefined */
  const micLine = useMemo(() => {
    const pick = (b: (typeof session.beats)[number] | undefined): string | undefined => {
      if (!b) return undefined;
      if (b.charMicLine) return b.charMicLine;
      return [...b.charActions].reverse().find(a => a.kind === 'mic_line' && a.text)?.text;
    };
    // 翻到旧幕就看那一幕的连麦；看最新幕时往前找最近一条
    const own = pick(viewBeat);
    if (own) return own;
    if (!isLatest) return undefined;
    for (let i = session.beats.length - 1; i >= 0; i--) {
      const found = pick(session.beats[i]);
      if (found) return found;
    }
    return undefined;
  }, [session.beats, viewBeat, isLatest]);

  const myMicLines = useMemo(() => {
    const fromBeat = (b: (typeof session.beats)[number] | undefined): string[] => {
      if (!b) return [];
      const texts = (b.userActions ?? []).filter(a => a.kind === 'mic_line' && a.text).map(a => a.text as string);
      if (texts.length) return texts;
      if (b.userMicLine) return [b.userMicLine];
      return [];
    };
    const pending = (session.pendingPublic ?? [])
      .filter(a => a.kind === 'mic_line' && a.text)
      .map(a => a.text as string);
    const own = fromBeat(viewBeat);
    let beatLines: string[] = [];
    if (own.length) beatLines = own;
    else if (isLatest) {
      for (let i = session.beats.length - 1; i >= 0; i--) {
        const found = fromBeat(session.beats[i]);
        if (found.length) {
          beatLines = found;
          break;
        }
      }
    }
    const showPending = session.beats.length === 0 || isLatest || viewBeat?.index === 0;
    return showPending ? [...pending, ...beatLines] : beatLines;
  }, [session.beats, session.pendingPublic, viewBeat, isLatest]);

  /**
   * 公屏是累加的：上一轮的弹幕留在下面，新的一轮接在后面继续往上飘。
   * 2026-10-26 Ann 打回：原来每一段只有四条，看着不像直播间。
   * 翻旧段时只累加到那一段为止——看到哪儿就聊到哪儿。
   */
  const lines = useMemo(() => {
    const out: Array<WatchPublicLineRef & { author: string; mine: boolean; char: boolean; gift: boolean }> = [];
    const nickname = session.cast.userAccount.nickname;
    const pushUser = (
      a: (typeof session.beats)[number]['userActions'][number],
      source: 'user' | 'pending',
      beatId?: string,
    ) => {
      if (a.kind === 'mic_line') return;
      if (a.kind === 'danmaku' && a.text) {
        out.push({ id: a.id, source, beatId, author: nickname, text: a.text, translated: a.translated, mine: true, char: false, gift: false });
        return;
      }
      if (a.kind === 'danmaku') return;
      out.push({
        id: a.id,
        source,
        beatId,
        author: nickname,
        text:
          a.kind === 'gift'
            ? `${a.giftName || '礼物'} ×${a.giftAmount || 1}`
            : a.kind === 'mic_on'
              ? '申请上麦，接通了'
              : a.kind === 'mic_off'
                ? '下麦了'
                : a.text || '',
        mine: true,
        char: false,
        gift: a.kind === 'gift',
      });
    };
    // 开场前发出的话排在所有幕前面；第一幕的新弹幕接在它们后面
    (session.pendingPublic ?? []).forEach(a => pushUser(a, 'pending'));
    const upTo = viewBeat ? viewBeat.index : -1;
    session.beats.slice(0, upTo + 1).forEach(beat => {
      (beat.danmaku ?? []).forEach(d => {
        out.push({
          id: d.id,
          source: 'danmaku',
          beatId: beat.id,
          author: d.author,
          text: d.text,
          translated: d.translated || '',
          mine: false,
          char: false,
          gift: false,
        });
      });
      (beat.userActions ?? []).forEach(a => pushUser(a, 'user', beat.id));
      (beat.charActions ?? []).forEach(a => {
        if (a.kind === 'mic_line') return;
        out.push({
          id: a.id,
          source: 'char',
          beatId: beat.id,
          author: session.cast.charAccount.nickname,
          text:
            a.kind === 'gift'
              ? `${a.giftName || '礼物'} ×${a.giftAmount || 1}`
              : a.kind === 'mic_on'
                ? '上麦了'
                : a.kind === 'mic_off'
                  ? '下麦了'
                  : a.text || '',
          translated: a.kind === 'danmaku' ? a.translated || '' : '',
          mine: false,
          char: true,
          gift: a.kind === 'gift',
        });
      });
    });
    // 看一晚上会攒出很多条，只留最近的，界面上不会越滚越卡
    return out.filter(l => l.text).slice(-150);
  }, [viewBeat, session.beats, session.pendingPublic, session.cast.charAccount.nickname, session.cast.userAccount.nickname]);

  const lineKey = lines.map(l => l.id).join('\n');
  // 公屏有新字就贴到底。只盯幕 id / 幕数时，往当前幕加字不会滚。
  useEffect(() => {
    const el = danmakuRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [viewBeat?.id, session.beats.length, lineKey]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    // 发弹幕永远作用在最新一幕：先回到最新再送
    setViewIdx(null);
    onSendDanmaku(text);
  };

  const beatNo = Math.max(1, viewBeat ? viewBeat.index + 1 : 0);
  const totalBeats = Math.max(1, session.beats.length);
  const canBack = viewBeat ? viewBeat.index > 0 : false;
  const canForward = !isLatest;

  // ── 一段直播一条一条往外放 ──────────────────────────────
  // 主播在镜头前是「手上做一件事 → 说一句 → 再做事 → 再说」，所以这一段被切成若干条，
  // 屏幕上一次只放一条，点一下画面出下一条。放完再点一下才去生成新的一段（Ann 2026-10-26）。
  // 老记录里只有「一个画面 + 一句话」，这里读成两条，不会坏。
  const seq = useMemo<WatchSeqItem[]>(() => {
    if (!viewBeat) return [];
    if (viewBeat.seq && viewBeat.seq.length) return viewBeat.seq;
    return [
      ...(viewBeat.scene ? [{ kind: 'scene' as const, text: viewBeat.scene }] : []),
      ...(viewBeat.speech ? [{ kind: 'line' as const, text: viewBeat.speech }] : []),
    ];
  }, [viewBeat]);

  const [step, setStep] = useState(0);
  /** 往回翻到上一段时，落到那一段的最后一句；进下一段则从第一句开始 */
  const [landAtEnd, setLandAtEnd] = useState(false);
  const [placedBeatId, setPlacedBeatId] = useState(viewBeat?.id);
  if (placedBeatId !== viewBeat?.id) {
    setPlacedBeatId(viewBeat?.id);
    setStep(landAtEnd ? Math.max(0, seq.length - 1) : 0);
    if (landAtEnd) setLandAtEnd(false);
  }

  // 字幕层线性显示：点一下切一句，画面条显示画面、台词条显示台词。
  // 句位按真实下标记，0 到最后一句；落到上一段末尾时就是 seq.length - 1。
  const sentenceIndex = seq.length ? Math.min(Math.max(step, 0), seq.length - 1) : 0;
  const curItem = seq.length ? seq[sentenceIndex] : undefined;
  const curIsScene = curItem?.kind === 'scene';
  const curText = curItem?.text || '';
  /** 台词条的中文同传：外语直播才有；中文大字在上（主体位置），外语原声小字跟在下面 */
  const curTranslated = curIsScene ? '' : curItem?.translated || '';
  const atEnd = seq.length === 0 || sentenceIndex >= seq.length - 1;
  const sentenceLabel = seq.length ? `第 ${sentenceIndex + 1} 句 / 共 ${seq.length} 句` : '';

  const goBack = () => {
    if (!canBack) return;
    // 往回退要落在上一段的最后一句，接得上刚才看到哪儿
    setLandAtEnd(true);
    setViewIdx((viewBeat?.index ?? 1) - 1);
  };
  const goForward = () => {
    if (!canForward) return;
    const next = (viewIdx ?? lastIndex) + 1;
    setViewIdx(next >= lastIndex ? null : next);
  };
  /** 回最新：跟回这一场当前正在播的那一段 */
  const goLatest = () => setViewIdx(null);

  /**
   * 往下一句：段内一条一条走；看的是旧段就翻到下一段（这是翻看，不要钱）。
   * 最新一段走到最后一条就停住——生成新的一段必须按画面右下角那个明确的按钮，
   * 不能让「点屏幕看字幕」顺手触发一次模型调用（每一次都花 Ann 的钱）。
   */
  const stepNext = () => {
    if (!viewBeat || session.legacy) return;
    if (!atEnd) {
      setStep(sentenceIndex + 1);
      return;
    }
    if (!isLatest) goForward();
  };

  /** 往上一句：段内往回退；退到段首就翻回上一段的最后一条 */
  const stepPrev = () => {
    if (!viewBeat || session.legacy) return;
    if (sentenceIndex > 0) {
      setStep(sentenceIndex - 1);
      return;
    }
    goBack();
  };

  // 长按画面 = 出操作菜单（和原来直播 App 的长按菜单一个习惯：改这一幕、本场信息、重来、转发）
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const pressStart = () => {
    if (session.legacy) return;
    longPressed.current = false;
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      longPressed.current = true;
      setPressMenuOpen(true);
    }, 480);
  };
  const pressEnd = () => clearPress();

  /** 点画面：左边三分之一退回上一句，其余往下走一句（想找上一句就往左边点） */
  const stageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / Math.max(1, box.width);
    if (x < 0.32) stepPrev();
    else stepNext();
  };

  // 底边这条线说的是「整场看到哪儿了」，不是这一段的第几句——
  // 只有整场进度才看得出是不是已经到最后一段（Ann 2026-10-26）。
  // 段内走到第几句写在字幕下面那行小字里。
  const progress = totalBeats > 1 ? Math.round((beatNo / totalBeats) * 100) : 100;
  const wasRepair = useRef(false);
  useEffect(() => {
    if (wasRepair.current && !repairBusy) setRepairOpen(false);
    wasRepair.current = Boolean(repairBusy);
  }, [repairBusy]);

  const openRepair = () => {
    setRepairPick(viewBeat ? [viewBeat.index] : []);
    setRepairOpen(true);
  };
  const toggleRepair = (index: number) => {
    setRepairPick(prev => (prev.includes(index) ? prev.filter(n => n !== index) : [...prev, index]));
  };
  const startLinePress = (line: WatchPublicLineRef & { gift?: boolean }, el: HTMLElement) => {
    if (line.gift) return;
    if (linePress.current !== null) window.clearTimeout(linePress.current);
    linePress.current = window.setTimeout(() => {
      linePress.current = null;
      const root = rootRef.current;
      if (!root) return;
      const page = root.getBoundingClientRect();
      const row = el.getBoundingClientRect();
      const menuH = 88;
      let top = row.bottom - page.top + 6;
      if (top + menuH > page.height - 8) top = Math.max(8, row.top - page.top - menuH - 6);
      let left = row.left - page.left;
      if (left + 160 > page.width - 8) left = Math.max(8, page.width - 168);
      setLineMenu({ line, top, left });
    }, 420);
  };
  const endLinePress = () => {
    if (linePress.current !== null) {
      window.clearTimeout(linePress.current);
      linePress.current = null;
    }
  };

  return (
    <div ref={rootRef} className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: W.page, color: W.ink }}>
      {/* 顶栏：返回 / 主播 · 分区 / 叫角色 / 更多 */}
      <div
        className="flex min-h-[46px] shrink-0 items-center gap-0.5 pl-1.5 pr-2"
        style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          aria-label="返回大厅"
          onClick={onBack}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-[#F2F2F2]"
          style={{ color: W.ink }}
        >
          <WIco name="back" size={21} />
        </button>
        <div className="min-w-0 flex-1 truncate pl-0.5 text-[13.5px] font-medium">
          {session.room.streamerName} · {session.room.category}
        </div>

        {!charHere ? (
          <button
            type="button"
            onClick={onSummon}
            className="mr-1 inline-flex h-[30px] shrink-0 items-center gap-1 pl-2 pr-2.5 text-[11.5px]"
            style={{ borderRadius: R_PILL, border: `1px solid ${W.line}`, background: '#fff', color: W.ink }}
          >
            <WIco name="people" size={14} />
            叫{charName}
          </button>
        ) : !session.cast.petVisible ? (
          // 小人收起来之后，右上角留一个圆钮，点一下再放出来（原型的 petdot）
          <button
            type="button"
            aria-label={`把${charName}叫出来`}
            onClick={onShowPet}
            className="mr-1 inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={{ background: '#12141A', border: '1.5px solid rgba(255,255,255,.22)' }}
          >
            {petSrc ? (
              <TokenImg value={petSrc} alt={charName} className="h-full w-full object-cover" draggable={false} />
            ) : (
              <span className="text-[12px] font-semibold text-white/80">{(charName || '?').slice(0, 1)}</span>
            )}
          </button>
        ) : null}
      </div>

      {/* 直播画面：一整段切成一条一条，点一下出下一条；左边三分之一是回上一条，长按这一段重来 */}
      <div
        className="relative shrink-0 select-none overflow-hidden"
        style={{
          // 画面 : 弹幕 = 4 : 6（Ann 2026-10-26：弹幕跟直播画面是 6:4，画面不能窄成一条，
          // 也不能压过弹幕），两边都随屏幕伸缩
          flex: '4 1 0',
          minHeight: 170,
          background: '#0C0D10',
          cursor: session.legacy ? 'default' : 'pointer',
          touchAction: 'manipulation',
        }}
        onClick={stageTap}
        onPointerDown={pressStart}
        onPointerUp={pressEnd}
        onPointerCancel={pressEnd}
        onPointerLeave={pressEnd}
      >
        {cover ? (
          <div
            className="pointer-events-none absolute inset-0 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: cover }}
          />
        ) : (
          <>
            <span
              className="pointer-events-none absolute"
              style={{ width: 220, height: 220, left: '12%', top: -70, borderRadius: '50%', background: c1, opacity: 0.75, filter: 'blur(40px)' }}
            />
            <span
              className="pointer-events-none absolute"
              style={{ width: 180, height: 180, left: '56%', bottom: -70, borderRadius: '50%', background: c2, opacity: 0.6, filter: 'blur(40px)' }}
            />
          </>
        )}

        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span
            className="inline-flex h-[19px] items-center px-[6px] text-[9.5px] font-bold tracking-wide text-white"
            style={{ borderRadius: 4, background: W.red }}
          >
            LIVE
          </span>
          <span
            className="inline-flex h-[19px] items-center px-[6px] text-[10px] tabular-nums text-white"
            style={{ borderRadius: 4, background: 'rgba(0,0,0,.42)' }}
          >
            {formatCount(session.room.viewerCount)} 人在看
          </span>
        </div>

        {/* 当前这一条：线性显示，走到哪条显示哪条（画面条显示画面，台词条显示台词） */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-7"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,.86), rgba(0,0,0,.55) 55%, transparent)' }}
        >
          {busy && isLatest ? (
            <div className="text-[12px] text-white/70">正在接通下一段…</div>
          ) : (
            <>
              {curIsScene ? (
                <div
                  className="text-[12.5px] leading-[18px] text-white/75"
                  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {curText || (viewBeat ? '……' : '还没开始，点一下右侧开始看。')}
                </div>
              ) : (
                <>
                  <div
                    className="text-[14px] font-medium leading-[20px] text-white"
                    style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {curTranslated || curText || (viewBeat ? '……' : '还没开始，点一下右侧开始看。')}
                  </div>
                  {curTranslated ? (
                    <div
                      className="mt-[2px] text-[12px] leading-[17px] text-white/70"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {curText}
                    </div>
                  ) : null}
                </>
              )}
              {!session.legacy ? (
                <div className="mt-1 text-[9.5px] text-white/45">
                  {sentenceLabel
                    ? atEnd
                      ? isLatest
                        ? `${sentenceLabel} · 按「下一段」接着看`
                        : `${sentenceLabel} · 点右边往下翻`
                      : `点右边下一句 · 点左边上一句 · ${sentenceLabel}`
                    : atEnd
                      ? isLatest
                        ? '这一段播完了 · 按「下一段」接着看'
                        : '这段看完了 · 点右边往下翻'
                      : '点右边下一句 · 点左边上一句'}
                </div>
              ) : null}
            </>
          )}
        </div>

        <span className="absolute inset-x-2.5 bottom-0 block h-[2px]" style={{ background: 'rgba(255,255,255,.18)' }}>
          <i className="block h-full" style={{ width: `${progress}%`, background: 'rgba(255,255,255,.85)' }} />
        </span>
      </div>

      {/* 主播行：名字 + 第几段 + 标题 + 转发 + 下一段（原型 .rmeta：11px 16px 10px） */}
      <div className="flex shrink-0 items-start gap-2 px-4 pb-[10px] pt-[11px]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[13.5px] font-semibold">{session.room.streamerName}</span>
            {/* 翻段：这是明面上的入口，不能只靠点画面猜 */}
            <span className="inline-flex shrink-0 items-center" style={{ color: W.sub }}>
              <button
                type="button"
                aria-label="上一段"
                disabled={!canBack}
                onClick={goBack}
                className="inline-flex h-6 w-6 items-center justify-center disabled:opacity-25"
              >
                <WIco name="back" size={13} />
              </button>
              <span className="tabular-nums text-[11px]">
                {beatNo}/{totalBeats}
              </span>
              <button
                type="button"
                aria-label="下一段"
                disabled={!canForward}
                onClick={goForward}
                className="inline-flex h-6 w-6 items-center justify-center disabled:opacity-25"
              >
                <WIco name="next" size={13} />
              </button>
            </span>
            {!isLatest ? (
              <button
                type="button"
                onClick={goLatest}
                className="shrink-0 px-1.5 py-0.5 text-[10.5px]"
                style={{ borderRadius: R_PILL, background: W.fill, color: W.ink }}
              >
                回最新
              </button>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[12.5px]" style={{ color: W.sub }}>
            {session.room.title}
          </div>
        </div>
        <button
          type="button"
          aria-label={`把这一幕转给${charName}`}
          disabled={busy || session.legacy || !viewBeat}
          onClick={() => onForward(viewBeat?.index)}
          className="mt-[1px] inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: W.fill, color: W.ink }}
        >
          <WIco name="send" size={15} />
        </button>

        {/* 唯一会让模型干活（也就是花钱）的按钮：这一段播完才亮，点它才开新的一段 */}
        {isLatest && !session.legacy ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => (atEnd ? onAdvance() : stepNext())}
            className="mt-[1px] inline-flex h-[32px] shrink-0 items-center gap-[3px] pl-[11px] pr-[9px] text-[11.5px] font-medium text-white disabled:opacity-30"
            style={{ borderRadius: R_PILL, background: W.ink }}
          >
            {busy ? '接通中' : atEnd ? '下一段' : '下一句'}
            <WIco name="next" size={12} />
          </button>
        ) : null}
      </div>

      {/* 连麦席：麦上只有角色出声，我说的话是文字 */}
      {micLine || myMicLines.length ? (
        <div className="mx-4 shrink-0 px-3 py-2.5" style={{ borderRadius: 12, background: W.soft, border: `1px solid ${W.line}` }}>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex h-[16px] items-center px-[5px] text-[9px] font-bold text-white"
              style={{ borderRadius: 3, background: W.red }}
            >
              连麦
            </span>
            <span className="text-[10.5px]" style={{ color: W.sub }}>
              只有{charName}出声
            </span>
          </div>

          {micLine ? (
          <div className="mt-2 flex items-start gap-2">
            <Avatar src={charAvatar} name={charName} size={22} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  // 旧幕的麦上语音已经在缓存里，播放器只认最新一条，翻旧幕时不给按
                  if (isLatest) onPlayMic();
                }}
                disabled={!isLatest}
                className="flex max-w-full items-center gap-2 px-2.5 py-1.5 active:opacity-90 disabled:opacity-70"
                style={{ borderRadius: 12, background: W.ink, color: '#fff' }}
              >
                {micLoading ? (
                  <span className="flex items-center gap-[3px]">
                    {[0, 1, 2].map(i => (
                      <i
                        key={i}
                        className="block h-[4px] w-[4px] rounded-full"
                        style={{ background: 'currentColor', opacity: 0.55, animation: `roomDot 1s ${i * 0.16}s infinite ease-in-out` }}
                      />
                    ))}
                  </span>
                ) : (
                  <WIco name={micPlaying ? 'pause' : 'play'} size={11} />
                )}
                <span className="flex h-[12px] items-center gap-[2px]">
                  {[4, 9, 12, 6, 10, 5].map((h, i) => (
                    <i
                      key={i}
                      className="block w-[2px] rounded-[1px]"
                      style={{
                        height: h,
                        background: 'currentColor',
                        opacity: micPlaying ? 0.95 : 0.7,
                        animation: micPlaying ? `roomWave .9s ${i * 0.09}s infinite ease-in-out` : undefined,
                      }}
                    />
                  ))}
                </span>
                <span className="truncate text-[10.5px] opacity-70">{micPlaying ? '正在说…' : '点一下听'}</span>
              </button>
              <div className="mt-1 text-[11.5px] leading-[16px]">{micLine}</div>
            </div>
          </div>
          ) : null}

          {myMicLines.map((line, i) => (
            <div key={`${i}:${line}`} className="mt-2 flex justify-end">
              <div
                className="max-w-[78%] px-2.5 py-1.5 text-[11.5px] leading-[16px]"
                style={{ borderRadius: 12, background: '#fff', color: W.ink, border: `1px solid ${W.line}` }}
              >
                {line}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* 公屏 */}
      <div
        ref={danmakuRef}
        className="no-scrollbar min-h-0 overflow-y-auto px-4 pb-[6px] pt-[4px]"
        style={{
          flex: '6 1 0',
          borderTop: `1px solid ${W.line}`,
          marginTop: micLine || myMicLines.length ? 8 : 0,
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 18%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 18%)',
        }}
      >
        <div className="flex min-h-full flex-col justify-end">
        {session.legacy ? (
          <div className="pb-2 text-[11px]" style={{ color: W.sub }}>
            这是旧版陪看记录，只能翻看，不能再往下演。
          </div>
        ) : null}
        {lines.length === 0 ? (
          <div className="py-8 text-center text-[11.5px]" style={{ color: W.sub }}>
            公屏还很安静
          </div>
        ) : (
          lines.map(l => (
            <div
              key={l.id}
              className="mb-[9px] flex gap-[7px]"
              onPointerDown={e => startLinePress(l, e.currentTarget)}
              onPointerUp={endLinePress}
              onPointerCancel={endLinePress}
              onContextMenu={e => e.preventDefault()}
            >
              <span
                className="mt-[1px] inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full text-[9.5px]"
                style={{
                  background: l.mine ? W.ink : W.fill,
                  color: l.mine ? '#fff' : W.sub,
                }}
              >
                {(l.author || '?').slice(0, 1)}
              </span>
              <div className="min-w-0">
                <span className="block text-[10.5px] leading-[13px]" style={{ color: l.char ? W.ink : W.sub, fontWeight: l.char ? 600 : 400 }}>
                  {l.author}
                </span>
                {l.gift ? (
                  <span
                    className="mt-[2px] inline-flex h-[19px] items-center px-[7px] text-[10.5px]"
                    style={{ borderRadius: 4, background: '#FFF0F2', color: '#D40028' }}
                  >
                    {l.text}
                  </span>
                ) : (
                  <span className="block break-words text-[12px] leading-[17px]" style={{ color: W.ink }}>
                    {l.text}
                    {l.translated ? (
                      <span className="ml-1.5 text-[11px] leading-[16px]" style={{ color: W.faint }}>
                        {l.translated}
                      </span>
                    ) : null}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        </div>
      </div>

      {/* 底栏：私聊 / 弹幕 / 上麦 / 更多（原型 .bar：9px 12px 12px） */}
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-[9px]" style={{ borderTop: `1px solid ${W.line}` }}>
        <button
          type="button"
          aria-label="私聊"
          onClick={onOpenChat}
          className="relative inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full"
          style={{ background: W.fill, color: W.ink }}
        >
          <WIco name="chat" size={17} />
          {chatUnread > 0 ? (
            <i className="absolute right-[3px] top-[3px] block h-[7px] w-[7px] rounded-full" style={{ background: W.red }} />
          ) : null}
        </button>

        <div className="flex h-[36px] min-w-0 flex-1 items-center px-3.5" style={{ borderRadius: R_PILL, background: W.fill }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') send();
            }}
            placeholder={session.cast.mic === 'on' ? '在麦上说一句…' : '发条弹幕…'}
            aria-label="发弹幕"
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[#909090]"
            style={{ color: W.ink }}
          />
          {draft.trim() ? (
            <button type="button" aria-label="发送弹幕" onClick={send} disabled={busy} className="ml-1 shrink-0 disabled:opacity-40">
              <WIco name="send" size={17} style={{ color: W.ink }} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          aria-label={session.cast.mic === 'on' ? '下麦' : '上麦'}
          onClick={onMicToggle}
          className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full"
          style={{
            background: session.cast.mic === 'on' ? W.red : W.fill,
            color: session.cast.mic === 'on' ? '#fff' : W.ink,
          }}
        >
          <WIco name="mic" size={16} />
        </button>

        <button
          type="button"
          aria-label="更多"
          onClick={() => setMoreOpen(true)}
          className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full"
          style={{ background: W.fill, color: W.ink }}
        >
          <WIco name="more" size={17} />
        </button>
      </div>

      {/* 桌宠：整屏可拖 */}
      <WatchPet
        src={petSrc}
        name={charName}
        bubble={bubble}
        bubbleSeq={bubbleSeq}
        bubbleIsVoice={bubbleIsVoice}
        generating={petGenerating}
        onTapBubble={onTapBubble}
        onRevealBubble={onRevealBubble}
        onCompose={() => setLiveCompose(true)}
        hidden={!charHere || !session.cast.petVisible}
        containerRef={rootRef}
        onOpenChat={onOpenChat}
        onPlayVoice={onPlayBubble}
        voicePlaying={bubblePlaying}
      />

      {liveCompose ? (
        <>
        <button
          type="button"
          aria-label="关闭输入"
          className="absolute inset-0 z-40"
          onClick={() => setLiveCompose(false)}
        />
        <div
          className="absolute inset-x-3 z-40 flex items-center gap-2 px-3 py-2"
          style={{ bottom: 72, borderRadius: 16, background: '#fff', boxShadow: '0 10px 28px rgba(0,0,0,.18)' }}
          onPointerDown={e => e.stopPropagation()}
        >
          <input
            autoFocus
            value={liveDraft}
            onChange={e => setLiveDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              const text = liveDraft.trim();
              if (!text) return;
              setLiveDraft('');
              setLiveCompose(false);
              onSendLiveLine?.(text);
            }}
            placeholder={`跟${charName}说一句`}
            aria-label="直播画面上的私聊"
            className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: W.ink }}
          />
          <button
            type="button"
            disabled={!liveDraft.trim()}
            onClick={() => {
              const text = liveDraft.trim();
              if (!text) return;
              setLiveDraft('');
              setLiveCompose(false);
              onSendLiveLine?.(text);
            }}
            className="shrink-0 px-3 py-1.5 text-[12.5px] text-white disabled:opacity-40"
            style={{ borderRadius: R_PILL, background: W.ink }}
          >
            发送
          </button>
        </div>
        </>
      ) : null}

      {/* 长按画面出的小菜单 */}
      <Sheet open={pressMenuOpen} onClose={() => setPressMenuOpen(false)} title={`第 ${beatNo} / ${totalBeats} 段`}>
        <div className="pb-2">
          {[
            { label: '改这一幕', desc: '画面和台词，就地改', run: () => onOpenInfo(viewBeat?.index) },
            { label: '修复格式', desc: '选几段，让辅助模型补上缺少的中文', run: openRepair },
            { label: '本场信息', desc: '主播名、人设、房间标题、分区', run: () => onOpenInfo(viewBeat?.index) },
            {
              label: '这一段重来',
              desc: isLatest ? '换一种走向，重新写这一段' : '只有最新那一段能重来',
              run: () => {
                if (isLatest && !busy) onRegenerate(viewBeat?.index);
              },
            },
            { label: `转给${charName}`, desc: '把这一幕发进私聊', run: () => onForward(viewBeat?.index) },
          ].map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setPressMenuOpen(false);
                item.run();
              }}
              className="flex w-full items-center gap-3 px-4 py-[12px] text-left active:bg-[#F8F8F8]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px]" style={{ color: W.ink }}>
                  {item.label}
                </span>
                <span className="mt-[1px] block text-[11px]" style={{ color: W.sub }}>
                  {item.desc}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={repairOpen} onClose={() => !repairBusy && setRepairOpen(false)} title="修复格式">
        <div className="px-4 pb-2">
          <div className="mb-2 text-[11.5px]" style={{ color: W.sub }}>
            选要补格式的段。可以一次选好几段。
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {session.beats.map(beat => {
              const on = repairPick.includes(beat.index);
              return (
                <button
                  key={beat.id}
                  type="button"
                  onClick={() => toggleRepair(beat.index)}
                  className="flex w-full items-center gap-2 py-2 text-left"
                >
                  <span
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] text-white"
                    style={{ background: on ? W.ink : '#fff', border: `1px solid ${on ? W.ink : W.line}` }}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: W.ink }}>
                    第 {beat.index + 1} 段
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-4 pb-4">
          <SolidButton
            disabled={!repairPick.length || repairBusy}
            onClick={() => onRepairBeats([...repairPick].sort((a, b) => a - b))}
          >
            {repairBusy ? '修复中' : `修复选中的 ${repairPick.length} 段`}
          </SolidButton>
        </div>
      </Sheet>

      {lineMenu ? (
        <div className="absolute inset-0 z-40">
          <button type="button" aria-label="关闭菜单" onClick={() => setLineMenu(null)} className="absolute inset-0" />
          <div
            className="absolute w-[148px] overflow-hidden bg-white"
            style={{ top: lineMenu.top, left: lineMenu.left, borderRadius: 12, boxShadow: '0 10px 28px rgba(0,0,0,.18)' }}
          >
            <button
              type="button"
              className="block w-full px-3 py-2.5 text-left text-[13px]"
              style={{ color: W.ink }}
              onClick={() => {
                const line = lineMenu.line;
                setLineMenu(null);
                setLineEdit(line);
                setLineDraft(line.translated ? `${line.text} ▸ ${line.translated}` : line.text);
              }}
            >
              编辑
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2.5 text-left text-[13px]"
              style={{ color: W.red, borderTop: `1px solid ${W.line}` }}
              onClick={() => {
                const line = lineMenu.line;
                setLineMenu(null);
                onDeletePublic(line);
              }}
            >
              删除
            </button>
          </div>
        </div>
      ) : null}

      <Sheet open={Boolean(lineEdit)} onClose={() => setLineEdit(null)} title="改这条弹幕">
        <div className="px-4 pb-2">
          <div className="mt-2 flex px-3 py-2.5" style={{ borderRadius: 12, background: W.fill }}>
            <textarea
              value={lineDraft}
              onChange={e => setLineDraft(e.target.value)}
              rows={4}
              aria-label="弹幕内容"
              className="w-full resize-none bg-transparent text-[13px] leading-[19px] outline-none"
              style={{ color: W.ink }}
            />
          </div>
        </div>
        <div className="px-4 pb-4">
          <SolidButton
            disabled={!lineDraft.trim() || !lineEdit}
            onClick={() => {
              if (!lineEdit) return;
              onEditPublic(lineEdit, lineDraft.trim());
              setLineEdit(null);
            }}
          >
            记下
          </SolidButton>
        </div>
      </Sheet>

      {/* 更多 */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={session.room.title}>
        <div className="pb-2">
          {[
            { label: '导演一下', desc: '写下一轮台上和角色怎么走', icon: 'clap' as const, run: onOpenDirector },
            { label: '本场信息', desc: '标题、主播人设、这一幕内容都能改', icon: 'edit' as const, run: () => onOpenInfo(viewBeat?.index) },
            { label: '送个礼物', desc: '在公屏上给主播刷一个', icon: 'gift' as const, run: () => setGiftOpen(true) },
            { label: '看总结', desc: '整场回顾与阶段摘要', icon: 'clock' as const, run: onOpenSummary },
            { label: '陪看设置', desc: '角色、小号、语音、模型', icon: 'gear' as const, run: onOpenSettings },
            charHere
              ? session.cast.petVisible
                ? { label: '收起小人', desc: '桌宠先藏起来，人还在', icon: 'eye' as const, run: onHidePet }
                : { label: '放出小人', desc: '把 ta 放回屏幕上', icon: 'eye' as const, run: onShowPet }
              : { label: `叫${charName}进来`, desc: '叫进来一起看', icon: 'people' as const, run: onSummon },
            { label: '结束陪看', desc: '收场，写一段回顾', icon: 'close' as const, run: onExit },
          ].map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setMoreOpen(false);
                item.run();
              }}
              className="flex w-full items-center gap-3 px-4 py-[12px] text-left active:bg-[#F8F8F8]"
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: W.fill, color: W.ink }}
              >
                <WIco name={item.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px]" style={{ color: W.ink }}>
                  {item.label}
                </span>
                <span className="mt-[1px] block text-[11px]" style={{ color: W.sub }}>
                  {item.desc}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* 送礼 */}
      <Sheet
        open={giftOpen}
        title="送个礼物"
        onClose={() => setGiftOpen(false)}
        footer={
          <SolidButton
            onClick={() => {
              setGiftOpen(false);
              onSendGift(giftName, giftCount);
            }}
          >
            送出 {giftName} ×{giftCount}
          </SolidButton>
        }
      >
        <div className="px-4 pb-2">
          <div className="mt-1 flex flex-wrap gap-2">
            {WATCH_GIFTS.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGiftName(g)}
                className="h-[32px] px-3 text-[12px]"
                style={{
                  borderRadius: R_PILL,
                  background: giftName === g ? W.ink : W.fill,
                  color: giftName === g ? '#fff' : W.ink,
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12px]" style={{ color: W.sub }}>
              送几个
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="减少"
                onClick={() => setGiftCount(v => Math.max(1, v - 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[15px]"
                style={{ background: W.fill, color: W.ink }}
              >
                −
              </button>
              <span className="w-8 text-center text-[13px] tabular-nums">{giftCount}</span>
              <button
                type="button"
                aria-label="增加"
                onClick={() => setGiftCount(v => Math.min(99, v + 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[15px]"
                style={{ background: W.fill, color: W.ink }}
              >
                +
              </button>
            </div>
          </div>
          <div className="mt-3 text-[10.5px] leading-[16px]" style={{ color: W.faint }}>
            送礼会记在这一幕的公屏上，主播和网友都会当场接话。
          </div>
        </div>
      </Sheet>

      <style>{`
        @keyframes roomDot { 0%,100%{opacity:.28;transform:translateY(0)} 50%{opacity:1;transform:translateY(-2px)} }
        @keyframes roomWave { 0%,100%{transform:scaleY(.55)} 50%{transform:scaleY(1.15)} }
      `}</style>
    </div>
  );
}
