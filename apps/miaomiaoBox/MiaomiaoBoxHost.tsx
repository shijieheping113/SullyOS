import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise, ArrowsCounterClockwise, CaretLeft, Clock, CopySimple, DotsThree, DownloadSimple, GearSix, House, Moon, PaperPlaneTilt, PencilSimple, Plus, SpeakerHigh, Sun, Trash,
} from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { AppID } from '../../types';
import { useMiaomiaoBox } from '../../context/MiaomiaoBoxContext';
import { MiaomiaoBoxCat } from './MiaomiaoBoxCat';
import HtmlCard from '../../components/chat/HtmlCard';
import { MIAOMIAO_BIG_FOLD_DEFAULT, MIAOMIAO_FOLD_KEEP_DEFAULT, MIAOMIAO_FOLD_N_DEFAULT, STARTER_HINT, STARTER_LABEL, type MiaomiaoArchiveMode, type MiaomiaoMessage, type MiaomiaoQuoteStyle, type MiaomiaoSettings, type MiaomiaoStarter } from './types';
import { getChibi } from '../../utils/vrWorld/chibi';
import { countUnfoldedRounds, relocateSummaries } from './foldSession';
import { decideStick, shouldFollowBottom } from './stageStick';
import { splitIntoBubbles } from './speakQuoted';
import { MiaomiaoBoxDB } from './miaomiaoBoxDb';
import TokenImg from '../../components/os/TokenImg';
import { IcoMinus, STARTER_ICO } from './miaoIcons';
import './miaomiao-box.css';

function ThinkFold({ text, open }: { text: string; open?: boolean }) {
  return (
    <details className="thinkfold" open={open}>
      <summary />
      <pre>{text}</pre>
    </details>
  );
}
function DialogueAvatar({ charId }: { charId?: string }) {
  const os = useOS();
  const ch = os.characters.find(c => c.id === charId);
  const img = ch ? getChibi(ch).img : '';
  return (
    <span className="av">
      {img ? <TokenImg value={img} alt="" /> : <MiaomiaoBoxCat lid="open" tail="out" cls="mini" />}
    </span>
  );
}

function fitTextarea(el: HTMLTextAreaElement | null, min: number) {
  if (!el) return;
  const max = Math.round(window.innerHeight * 0.45);
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.style.height = 'auto';
  el.style.height = Math.min(Math.max(el.scrollHeight, min), max) + 'px';
  if (document.activeElement === el) {
    try { el.setSelectionRange(start, end); } catch { /* ignore */ }
  }
}

function RuleFields({ title, body, onCommit }: { title: string; body: string; onCommit: (title: string, body: string) => void }) {
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { fitTextarea(bodyRef.current, 72); }, [b]);
  return (
    <div className="editbig" onBlur={e => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      onCommit(t, b);
    }}>
      <div className="ti">标题</div>
      <input className="tinput" value={t} onChange={e => setT(e.target.value)} />
      <div className="ti" style={{ marginTop: 6 }}>正文</div>
      <textarea ref={bodyRef} className="tarea" value={b} onChange={e => { setB(e.target.value); fitTextarea(e.target, 72); }} />
    </div>
  );
}

/**
 * 盒内小组件：先落在本地，失焦（或这份设置被卸载）时才把改动交出去。
 * 直接受控怼 saveSettings 等于每敲一个字写一次库，打字快过落库就会掉字。
 * 归属角色跟着挂载那一次走：卸载补存时如果人已经换到别的盒子，字就不写过去。
 */
function DraftField({
  value, ownerId, onCommit, multiline, className, style, placeholder, autoGrow,
}: {
  value: string;
  ownerId?: string;
  onCommit: (v: string, ownerId?: string) => void;
  multiline?: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  autoGrow?: number;
}) {
  const [local, setLocal] = useState(value);
  const localRef = useRef(local);
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  const elRef = useRef<HTMLTextAreaElement | null>(null);
  // 只认挂载这一次拿到的回调与归属，卸载补存不会打到别人头上。
  const commitRef = useRef(onCommit);
  const ownerRef = useRef(ownerId);
  localRef.current = local;

  useEffect(() => {
    if (autoGrow == null) return;
    fitTextarea(elRef.current, autoGrow);
  }, [local, autoGrow]);

  // 外部值变了（切角色、重开设置）：框不在焦点上就同步回本地。
  useEffect(() => {
    if (focusedRef.current) return;
    if (value === localRef.current) return;
    localRef.current = value;
    committedRef.current = value;
    setLocal(value);
  }, [value]);

  const flush = () => {
    if (localRef.current === committedRef.current) return;
    committedRef.current = localRef.current;
    commitRef.current(localRef.current, ownerRef.current);
  };

  // 打完直接关盒子、切页、切角色：还有没交出去的改动，补存一次。
  useEffect(() => () => flush(), []);

  const onFocus = () => { focusedRef.current = true; };
  const onBlur = () => { focusedRef.current = false; flush(); };

  if (multiline) {
    return (
      <textarea
        ref={elRef}
        className={className}
        style={style}
        placeholder={placeholder}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }
  return (
    <input
      className={className}
      style={style}
      placeholder={placeholder}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

/**
 * 数字框：输入时先留在本地（否则打「-」会被当成非法值弹回去），
 * 失焦或卸载时才夹进范围交出去；空着或打成乱码就退回上一次的值。
 */
function NumberField({
  value, min, max, step, ownerId, onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  ownerId?: string;
  onCommit: (v: number, ownerId?: string) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const localRef = useRef(local);
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  const commitRef = useRef(onCommit);
  const ownerRef = useRef(ownerId);
  localRef.current = local;

  useEffect(() => {
    if (focusedRef.current) return;
    if (value === committedRef.current) return;
    committedRef.current = value;
    localRef.current = String(value);
    setLocal(String(value));
  }, [value]);

  const clampParsed = (): number | null => {
    const raw = localRef.current.trim();
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  };

  const flush = () => {
    const n = clampParsed();
    if (n == null) {
      setLocal(String(committedRef.current));
      return;
    }
    setLocal(String(n));
    if (n === committedRef.current) return;
    committedRef.current = n;
    commitRef.current(n, ownerRef.current);
  };

  // 卸载时半截输入（空、乱码）直接丢掉；已经成型但没失焦的，补存一次。
  useEffect(() => () => {
    const n = clampParsed();
    if (n == null || n === committedRef.current) return;
    committedRef.current = n;
    commitRef.current(n, ownerRef.current);
  }, []);

  return (
    <input
      className="tinput"
      type="number"
      min={min}
      max={max}
      step={step}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; flush(); }}
    />
  );
}

const STARTERS: MiaomiaoStarter[] = ['box', 'story', 'claw', 'walk', 'dream', 'random'];
const ARCHIVE_LABEL: Record<MiaomiaoArchiveMode, string> = {
  remember: '记在心里',
  raw: '原样收进',
  forget: '抖抖毛，忘掉',
  paused: '暂停',
};

function tidyBoxDisplay(text: string): string {
  return (text || '')
    .replace(/```[a-zA-Z0-9_-]*[ \t]*\n?/g, '')
    .replace(/^\s*[*_`-]{2,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderBoxText(text: string): React.ReactNode {
  const cleaned = tidyBoxDisplay(text)
    .replace(/!\(https?:\/\/[^)\s]+\)_?\d*/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\s*\/?\s*voice\b[^>]*>/gi, '')
    .replace(/<\s*\/?\s*subtitles?\b[^>]*>/gi, '')
    .replace(/<\/?[语語]音[^>]*>/g, '')
    .replace(/<\/?字幕>/g, '');
  const re = /\*\(([^)]*)\)\*|\*\*([^*]+)\*\*|\*([^*\n]+)\*|（[^）]*）|\([^)]*\)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(cleaned))) {
    if (m.index > last) parts.push(cleaned.slice(last, m.index));
    const inner = m[1] != null ? `（${m[1]}）` : m[2] != null ? m[2] : m[3] != null ? m[3] : m[0];
    parts.push(<span key={k++} className="narr">{inner}</span>);
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) parts.push(cleaned.slice(last));
  return parts.length ? parts : cleaned;
}

function visualRows(m: MiaomiaoMessage): { key: string; kind: 'text' | 'voice' | 'html'; content: string; htmlSource?: string }[] {
  if (m.kind === 'html') return [{ key: m.id, kind: 'html', content: '', htmlSource: m.htmlSource }];
  if (m.kind === 'voice') {
    const content = tidyBoxDisplay(m.content);
    return content ? [{ key: m.id, kind: 'voice', content }] : [];
  }
  if (m.kind === 'text') {
    const content = tidyBoxDisplay(m.content);
    if (!content && m.htmlSource) return [{ key: m.id, kind: 'html', content: '', htmlSource: m.htmlSource }];
    return content ? [{ key: m.id, kind: 'text', content, htmlSource: m.htmlSource }] : [];
  }
  const segs = splitIntoBubbles(m.content || '');
  if (!segs.length) {
    if (m.htmlSource) return [{ key: m.id, kind: 'html', content: '', htmlSource: m.htmlSource }];
    const content = tidyBoxDisplay(m.content);
    return content ? [{ key: m.id, kind: 'text', content }] : [];
  }
  const rows = segs.map((s, i) => ({
    key: `${m.id}-${i}`,
    kind: s.kind as 'text' | 'voice',
    content: tidyBoxDisplay(s.content),
    htmlSource: undefined as string | undefined,
  })).filter(r => r.content);
  if (m.htmlSource) rows.push({ key: `${m.id}-html`, kind: 'html', content: '', htmlSource: m.htmlSource });
  return rows;
}
const THEME_KEY = 'miaomiao-box-theme';
const POS_KEY = 'miaomiao-box-pos';

const MiaomiaoBoxHost: React.FC = () => {
  const os = useOS();
  const box = useMiaomiaoBox();
  const boxRef = useRef(box);
  boxRef.current = box;
  const [draft, setDraft] = useState('');
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const [sheet, setSheet] = useState(false);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* ignore */ }
    return os.theme?.darkMode ? 'dark' : 'light';
  });
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { x: 0, y: 0 };
  });
  const posRef = useRef(pos);
  posRef.current = pos;
  const floatRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ kind: 'float' | 'widget'; x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const [widgetPos, setWidgetPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem('miaomiao-box-widget-pos');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { x: 0, y: 0 };
  });
  const widgetPosRef = useRef(widgetPos);
  widgetPosRef.current = widgetPos;
  const [lpId, setLpId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const holdTimer = useRef<number | null>(null);
  // 按住那一刻手指落在哪。用来判断「手指是不是真的滑走了」——
  // 手机手指按下去本来就会抖一两像素，没有这个基准就分不清「抖」和「滑」。
  const holdStart = useRef({ x: 0, y: 0 });
  const [lpPos, setLpPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [openAnim, setOpenAnim] = useState(false);
  const [rerollOpen, setRerollOpen] = useState(false);
  const [readId, setReadId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // 长按之后浏览器还会补发一下「点击」，那一下要整笔吞掉：
  // 不然松手会顺势关掉菜单，也会顺势把语音泡点成播放。
  const suppressClick = useRef(false);
  // 手指落下的位置（换算成盒子内的坐标），菜单以它当锚点摆。
  const lpAnchor = useRef({ x: 0, y: 0 });
  const [themeEdit, setThemeEdit] = useState(false);
  const [themeDraft, setThemeDraft] = useState('');
  const themeHold = useRef<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    fitTextarea(el, 56);
  }, [draft]);

  const showFloat = box.shell === 'float' && os.activeApp === AppID.Chat && (!box.session || box.session.charId === os.activeCharacterId);
  const showWidget = box.shell === 'widget';
  const hasShow = !!(box.session && (box.session.status === 'playing' || box.session.status === 'paused') && box.messages.length > 0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const pinningRef = useRef(false);
  const touchingRef = useRef(false);
  const fingerEndRef = useRef<(() => void) | null>(null);
  // 上次程序钉住时的位置。用来分辨「人往上翻了」和「内容变高了」。
  const seenTop = useRef(0);
  const seenHeight = useRef(0);
  const pinTimer = useRef<number | null>(null);
  const pinObserver = useRef<ResizeObserver | null>(null);
  const pinRaf = useRef<number | null>(null);
  const pinRelease = useRef<number | null>(null);

  const stopChase = () => {
    pinningRef.current = false;
    if (pinTimer.current) {
      window.clearInterval(pinTimer.current);
      pinTimer.current = null;
    }
    if (pinObserver.current) {
      pinObserver.current.disconnect();
      pinObserver.current = null;
    }
    if (pinRaf.current) {
      window.cancelAnimationFrame(pinRaf.current);
      pinRaf.current = null;
    }
    if (pinRelease.current) {
      window.cancelAnimationFrame(pinRelease.current);
      pinRelease.current = null;
    }
  };

  const pinToEnd = () => {
    const el = stageRef.current;
    if (!el || !stickToBottom.current) {
      if (!stickToBottom.current) stopChase();
      return;
    }
    const follow = shouldFollowBottom({
      stuck: stickToBottom.current,
      touching: touchingRef.current,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      seenTop: seenTop.current,
      seenHeight: seenHeight.current,
    });
    if (!follow) {
      // 手指还按着：先别跟，也先别松开，等滚动事件自己判断。
      // 手指已经松开、人却停在更上面：立刻停止贴底，别再按回最底。
      if (!touchingRef.current) {
        stickToBottom.current = false;
        stopChase();
      }
      return;
    }
    pinningRef.current = true;
    el.scrollTop = el.scrollHeight;
    seenTop.current = el.scrollTop;
    seenHeight.current = el.scrollHeight;
    if (pinRelease.current) window.cancelAnimationFrame(pinRelease.current);
    pinRelease.current = window.requestAnimationFrame(() => {
      pinRelease.current = null;
      pinningRef.current = false;
    });
  };

  const gapFromBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight;

  // 内容变高用 ResizeObserver 跟着走，定时只是短保险。
  // 人已经往上离开几像素时，pinToEnd 会自己停下，不再按回最底。
  const chaseBottom = (retryIfEmpty = true) => {
    const el = stageRef.current;
    if (!el) {
      if (!retryIfEmpty) return;
      if (pinRaf.current) window.cancelAnimationFrame(pinRaf.current);
      pinRaf.current = window.requestAnimationFrame(() => {
        pinRaf.current = null;
        chaseBottom(false);
      });
      return;
    }
    if (pinTimer.current) {
      window.clearInterval(pinTimer.current);
      pinTimer.current = null;
    }
    if (pinObserver.current) {
      pinObserver.current.disconnect();
      pinObserver.current = null;
    }
    pinToEnd();
    if (!stickToBottom.current) return;
    const watched = listRef.current || el;
    const observer = new ResizeObserver(() => {
      if (!stickToBottom.current) {
        stopChase();
        return;
      }
      pinToEnd();
    });
    observer.observe(watched);
    pinObserver.current = observer;
    let left = 4000;
    pinTimer.current = window.setInterval(() => {
      if (!stickToBottom.current) {
        stopChase();
        return;
      }
      pinToEnd();
      left -= 120;
      if (left <= 0 && pinTimer.current) {
        window.clearInterval(pinTimer.current);
        pinTimer.current = null;
      }
    }, 120);
  };

  const applyStick = (gap: number) => {
    const action = decideStick(stickToBottom.current, gap);
    if (action === 'release') {
      stickToBottom.current = false;
      stopChase();
    } else if (action === 'resume') {
      stickToBottom.current = true;
      chaseBottom();
    }
  };

  const noteFingerDown = () => {
    if (touchingRef.current) return;
    touchingRef.current = true;
    const end = () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (fingerEndRef.current === end) fingerEndRef.current = null;
      touchingRef.current = false;
      const el = stageRef.current;
      if (!el || pinningRef.current) return;
      applyStick(gapFromBottom(el));
    };
    fingerEndRef.current = end;
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // 进对话、换一场、或从小窗点开回浮窗：画出来之前先钉在最底，避免首帧停在半截。
  // showFloat 也要看进来：缩成小窗时对话区整个被拿掉、点开才重新画出来，
  // 而那一下 page 和这一场都没变，光靠原来两个依赖这段根本不会重跑，
  // 新画出来的对话区就停在最上面（这就是「小窗点开停在旧地方」的根）。
  useLayoutEffect(() => {
    if (box.page !== 'play' || !showFloat) {
      stopChase();
      return;
    }
    stickToBottom.current = true;
    const el = stageRef.current;
    if (el) {
      pinningRef.current = true;
      el.scrollTop = el.scrollHeight;
      seenTop.current = el.scrollTop;
      seenHeight.current = el.scrollHeight;
    }
    chaseBottom();
    return () => stopChase();
  }, [box.page, box.session?.id, showFloat]);

  // 新消息、出字、思维链、盒内总结提醒：还贴着底才跟；往上翻了就不抢。
  useEffect(() => {
    if (box.page !== 'play' || !stickToBottom.current) return;
    chaseBottom();
  }, [box.messages, box.liveText, box.liveThinking, box.typing, box.foldNote, box.foldBusy, box.page]);

  useEffect(() => () => {
    stopChase();
    const end = fingerEndRef.current;
    if (!end) return;
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    fingerEndRef.current = null;
    touchingRef.current = false;
  }, []);
  useEffect(() => {
    if (!showFloat || !hasShow) return;
    setOpenAnim(true);
    const t = window.setTimeout(() => setOpenAnim(false), 700);
    return () => window.clearTimeout(t);
  }, [showFloat, hasShow]);

  // ⚠️ 下面这几个 hook 必须留在这句提前 return 之前。
  // 盒子没开时（showFloat / showWidget 都为假）会从下面直接 return，
  // hook 要是写在 return 后面，盒子关着就少走几个、一开就多出几个，
  // 前后两次 render 的 hook 数量对不上，React 会把整棵子树炸掉——盒子就打不开了。

  // 把屏幕上的手指位置换算成盒子里的坐标。
  const toBoxPoint = (clientX: number, clientY: number) => {
    const r = floatRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left || 0), y: clientY - (r?.top || 0) };
  };

  // 菜单量出真实宽高之后再摆位：手指上方放不下就翻到下方，左右都收在盒子边里。
  // （原来这里按写死的「宽 220」算，而语音那排五个按钮实际约 320，右端会被盒子裁掉。）
  const placeMenu = () => {
    const el = menuRef.current;
    const boxEl = floatRef.current;
    if (!el || !boxEl) return;
    const br = boxEl.getBoundingClientRect();
    const a = lpAnchor.current;
    const pad = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = a.x;
    let y = a.y - h - 10;
    if (x + w > br.width - pad) x = br.width - w - pad;
    if (x < pad) x = pad;
    if (y < pad) y = a.y + 22;
    if (y + h > br.height - pad) y = Math.max(pad, br.height - h - pad);
    setLpPos(prev => (prev.x === x && prev.y === y ? prev : { x, y }));
  };

  // 手指每按一下，都算新的一笔：把那面「吞掉下一次点击」的小旗子先放下。
  // 长按是「按住不放」，中途不会再按下去，所以旗子能一直立到松手那一下。
  useEffect(() => {
    const reset = () => { suppressClick.current = false; };
    document.addEventListener('pointerdown', reset, true);
    return () => document.removeEventListener('pointerdown', reset, true);
  }, []);

  // 菜单开着时，手指一按到别处就关（按在菜单自己身上不算）。
  // 听的是「按下去」而不是「点一下」：长按后松手补发的那下点击发生在菜单出来之前，
  // 于是不会再把自己的菜单关掉（这就是「很容易误触关闭」的根）。
  //
  // 顺带要把「松手那一下点击」也吞掉：按下的时候菜单已经关了，手指抬起来
  // 浏览器照样补发一记 click，它会落到菜单下面那条气泡上——语音泡一看
  // lpId 已经空了（`lpId !== m.id`），就顺手播了。所以这里跟长按那条路一样，
  // 立起「吞掉下一次点击」的小旗子，交给 .stage 的 onClickCapture 吃掉。
  // （顺序没问题：放下旗子的常驻监听是本组件挂载时就注册的，比这个晚注册的关菜单监听先跑。）
  useEffect(() => {
    if (!lpId) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (menuRef.current && t && menuRef.current.contains(t)) return;
      suppressClick.current = true;
      setLpId(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [lpId]);

  // 菜单刚挂上还没量过宽度，绘制前先量一次摆正（useLayoutEffect 在绘制前跑，看不见跳动）。
  useLayoutEffect(() => {
    if (lpId) placeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lpId]);

  if (!showFloat && !showWidget) return null;

  const sub = box.pendingStarter
    ? `新的一场 · ${STARTER_LABEL[box.pendingStarter]}`
    : box.session
      ? (box.session.status === 'playing' ? `开演中 · 第 ${Math.max(0, countUnfoldedRounds(box.messages) + (box.session.foldedRoundCount || 0))} 轮` : '还没开演')
      : '还没开演';

  const onGrabDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { kind: 'float', x: posRef.current.x, y: posRef.current.y, px: e.clientX, py: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.kind !== 'float') return;
    const nx = d.x + (e.clientX - d.px);
    const ny = d.y + (e.clientY - d.py);
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 3) d.moved = true;
    posRef.current = { x: nx, y: ny };
    if (floatRef.current) floatRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
  };
  const onGrabUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== 'float') return;
    setPos(posRef.current);
    try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ }
  };

  const onWidgetDown = (e: React.PointerEvent) => {
    drag.current = { kind: 'widget', x: widgetPosRef.current.x, y: widgetPosRef.current.y, px: e.clientX, py: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onWidgetMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.kind !== 'widget') return;
    const nx = d.x + (e.clientX - d.px);
    const ny = d.y + (e.clientY - d.py);
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) d.moved = true;
    widgetPosRef.current = { x: nx, y: ny };
    if (widgetRef.current) widgetRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
  };
  const onWidgetUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== 'widget') return;
    setWidgetPos(widgetPosRef.current);
    try { localStorage.setItem('miaomiao-box-widget-pos', JSON.stringify(widgetPosRef.current)); } catch { /* ignore */ }
    if (!d.moved) box.expandFloat();
  };

  // 画面卡右上角那个「⋯」走这里：拿点击的位置当锚点，开同一张菜单。
  const openMenuAt = (id: string, clientX: number, clientY: number) => {
    lpAnchor.current = toBoxPoint(clientX, clientY);
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setLpId(id);
  };

  const startHold = (id: string, e?: React.PointerEvent) => {
    if (e) {
      lpAnchor.current = toBoxPoint(e.clientX, e.clientY);
      holdStart.current = { x: e.clientX, y: e.clientY };
    }
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      // 这一笔已经算「长按过了」：浏览器随后补发的那下点击要整笔吞掉，
      // 免得松手顺手关掉菜单、或把语音泡点成播放。
      suppressClick.current = true;
      setLpId(id);
    }, 420);
  };
  const cancelHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  // 只有「真的滑走」才取消长按：气泡上以前是任何一点 pointermove 就取消，
  // 手指按下去抖一两个像素菜单就出不来。给个 10 像素容差，跟私聊那处一致。
  // 反过来，手指是往下滑列表的，滑超容差就取消——不能让滚动把菜单滚出来。
  const holdMove = (e: React.PointerEvent) => {
    if (!holdTimer.current) return;
    const dx = Math.abs(e.clientX - holdStart.current.x);
    const dy = Math.abs(e.clientY - holdStart.current.y);
    if (dx > 10 || dy > 10) cancelHold();
  };

  const onHomeLeft = () => {
    if (box.page === 'history' && readId) {
      setReadId(null);
      return;
    }
    if (box.pendingStarter) box.cancelPending();
    if (box.page === 'home') box.leaveToChat();
    else box.setPage('home');
  };

  // 设置项交出去时永远基于最新那份 settings 拼，别拿陈旧快照覆盖别的字段；
  // 落款跟着输入框挂载时那一盒走，人换到别的盒子了也不把字记到别人头上。
  const commitBoxSetting = (ownerId: string | undefined, patch: Record<string, unknown>) => {
    const st = boxRef.current.settings;
    if (!ownerId || (st && st.charId === ownerId)) {
      if (!st) return;
      void boxRef.current.saveSettings({ ...st, ...patch } as MiaomiaoSettings);
      return;
    }
    // 这是上一个盒子没交完的字：直接补回它自己那一格，当下界面的设置一点不动。
    void (async () => {
      const own = await MiaomiaoBoxDB.getSettings(ownerId);
      await MiaomiaoBoxDB.saveSettings({ ...own, ...patch } as MiaomiaoSettings);
    })();
  };
  const others = box.liveSessions.filter(s => s.id !== box.session?.id && (s.status === 'playing' || s.status === 'paused'));
  const reading = box.historySessions.find(s => s.id === readId) || null;

  return (
    <div className="miaomiao-root" data-theme={theme} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 80 }}>
      {showFloat && (
        <div
          ref={floatRef}
          className="floatw"
          style={{ pointerEvents: 'auto', left: 8, right: 8, top: 44, bottom: 10, position: 'absolute', transform: `translate(${pos.x}px, ${pos.y}px)` }}
        >
          <div className="grab" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}>
            <span className="handle" />
            <button className="collapse" type="button" aria-label="收成挂件" onClick={box.collapseToWidget}><IcoMinus /></button>
          </div>
          <div className="topbar">
            <button className="iconbtn" aria-label={box.page === 'home' ? '返回聊天' : '返回主页面'} onClick={onHomeLeft}>
              {box.page === 'home' ? <CaretLeft size={18} /> : <House size={18} />}
            </button>
            <span className="boxmark"><MiaomiaoBoxCat lid={hasShow ? (openAnim ? 'open' : 'behind') : 'on'} tail={hasShow ? 'out' : 'in'} cls={`mini${openAnim ? ' hop pop' : ''}`} /></span>
            <div className="titles">
              {themeEdit && box.page === 'play' ? (
                <input
                  className="themein"
                  value={themeDraft}
                  autoFocus
                  aria-label="修改章节名"
                  onChange={e => setThemeDraft(e.target.value)}
                  onBlur={() => { void box.renameTheme(themeDraft); setThemeEdit(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              ) : (
                <h2
                  onPointerDown={() => {
                    if (box.page !== 'play' || !box.session) return;
                    if (themeHold.current) window.clearTimeout(themeHold.current);
                    themeHold.current = window.setTimeout(() => {
                      setThemeDraft((box.session?.theme || '').trim());
                      setThemeEdit(true);
                    }, 550);
                  }}
                  onPointerUp={() => { if (themeHold.current) window.clearTimeout(themeHold.current); }}
                  onPointerCancel={() => { if (themeHold.current) window.clearTimeout(themeHold.current); }}
                  onPointerLeave={() => { if (themeHold.current) window.clearTimeout(themeHold.current); }}
                >{box.page === 'settings' ? '盒子设置' : box.page === 'history' ? '历史原文' : box.page === 'play' ? ((box.session?.theme || '').trim() || '喵喵盒') : '喵喵盒'}</h2>
              )}
              <p>{box.page === 'settings' ? '只影响盒子里' : sub}</p>
            </div>
            <div className="acts">
              {box.page === 'home' && (
                <button className="iconbtn" aria-label="看历史原文" onClick={() => { setReadId(null); box.setPage('history'); }}><Clock size={18} /></button>
              )}
              {box.page === 'settings' && (
                <button className="iconbtn" aria-label="切换亮暗" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              )}
              <button className="iconbtn" type="button" aria-label="收成挂件" onClick={box.collapseToWidget}><IcoMinus /></button>
              {box.page !== 'settings' && box.page !== 'history' && (
                <button className="pill" onClick={() => setSheet(true)}>合上箱盖</button>
              )}
            </div>
          </div>

          {box.page === 'home' && (
            <div className="home">
              <div className="hero">
                <span className="sp" style={{ left: 12, top: 10 }}>✦</span>
                <span className="sp" style={{ right: 16, top: 14, opacity: 0.8 }}>✦</span>
                <span className="bigbox"><MiaomiaoBoxCat lid={hasShow ? 'open' : 'on'} tail={hasShow ? 'out' : 'in'} /></span>
                <div className="txt">
                  <h3>喵喵盒</h3>
                  <p>猫看见箱子就想钻进去，<br />钻进去就是另一个世界🐾</p>
                </div>
              </div>
              {box.session && (box.session.status === 'playing' || box.session.status === 'paused') && box.messages.length > 0 && (
                <div className={others.length ? 'contcard multi' : 'contcard'}>
                  <div className="mini">{(() => {
                    const ch = os.characters.find(c => c.id === box.session?.charId);
                    const img = ch?.vrState?.chibi?.img || ch?.avatar;
                    return img ? <TokenImg value={img} alt="" /> : <MiaomiaoBoxCat lid={hasShow ? 'open' : 'on'} tail={hasShow ? 'out' : 'in'} cls="mini" />;
                  })()}</div>
                  <div className="t"><b>{box.session.title}</b><span>{(box.session.theme || '').trim() || STARTER_LABEL[box.session.starter]} · 接着演</span></div>
                  <button className="go" onClick={() => { box.cancelPending(); box.setPage('play'); }}>接着 ▸</button>
                  {others.length > 0 && (
                    <div className="contmore">
                      {others.map(s => (
                        <button key={s.id} type="button" className="otherchip" onClick={() => void box.openLive(s.id)}>
                          {(s.theme || '').trim() || STARTER_LABEL[s.starter]} {new Date(s.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="startbig">
                <div className="seclabel"><span className="bar" /><span className="tx"><b>挑个箱子演出吧</b><i>START A BOX</i></span></div>
                <div className="grid">
                  {STARTERS.map(id => {
                    const Ico = STARTER_ICO[id];
                    return (
                      <button key={id} className="schip" onClick={() => void box.pickHomeStarter(id)}>
                        <Ico />
                        <span className="lab"><b>{STARTER_LABEL[id]}</b><i>{STARTER_HINT[id]}</i></span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="setrow" onClick={() => box.setPage('settings')}>
                <span className="l"><GearSix size={18} />盒子设置<span style={{ fontSize: 10.5, color: 'var(--miao-lilac)' }}>世界规则 · 总结设置 · 对话 · 语音</span></span>
                <span className="chev">›</span>
              </div>
            </div>
          )}

          {box.page === 'play' && (
            <>
              <div
                className="stage"
                ref={stageRef}
                onPointerDown={noteFingerDown}
                onScroll={e => {
                  const el = e.currentTarget;
                  const gap = gapFromBottom(el);
                  // 程序自己钉底时，离底几乎是 0。真被手挪开就停，哪怕这一下和钉底撞在同一帧。
                  if (pinningRef.current && decideStick(true, gap) !== 'release') return;
                  // 手指还在划时只松开、不重新贴上，避免划到一半被拉回最底。
                  if (touchingRef.current) {
                    if (decideStick(stickToBottom.current, gap) === 'release') {
                      stickToBottom.current = false;
                      stopChase();
                    }
                    return;
                  }
                  applyStick(gap);
                }}
                onClickCapture={e => {
                  // 长按松手后浏览器补发的那下点击：整笔吞掉，
                  // 免得它顺手关掉刚开出来的菜单，或把语音泡点成播放。
                  if (!suppressClick.current) return;
                  suppressClick.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <div className="stage-list" ref={listRef}>
                {box.pendingStarter && <div className="daysep">新的一场 · {STARTER_LABEL[box.pendingStarter]}</div>}
                {(box.pendingStarter ? [] : relocateSummaries(box.messages).messages.filter(m => !m.folded)).map(m => m.role === 'summary' ? (
                  editId === m.id ? (
                    <div key={m.id} className="sumcard editing" onClick={e => e.stopPropagation()}>
                      <div className="shd"><b>{m.summaryKind === 'big' ? '箱子里的大前情' : '箱子里的前情'}</b><span className="stag">自动总结 · 第 {m.summaryRange?.fromRound}–{m.summaryRange?.toRound} 轮</span></div>
                      <textarea className="sarea" value={editDraft} onChange={e => setEditDraft(e.target.value)} />
                      <div className="sbtns">
                        <button type="button" className="ok" onClick={() => { void box.editMessage(m.id, editDraft); setEditId(null); }}>保存</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className="sumcard"
                      onPointerDown={e => startHold(m.id, e)}
                      onPointerUp={cancelHold}
                      onPointerCancel={cancelHold}
                      onPointerMove={holdMove}
                    >
                      <div className="shd"><b>{m.summaryKind === 'big' ? '箱子里的大前情' : '箱子里的前情'}</b><span className="stag">自动总结 · 第 {m.summaryRange?.fromRound}–{m.summaryRange?.toRound} 轮</span></div>
                      <div className="sbd">{m.content}</div>
                      <div className="sft">
                        <span>摘要 · 原文留着，随时能翻</span>
                        <button
                          type="button"
                          className="sflink"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); void box.dissolveSummary(m.id); }}
                        >解散</button>
                      </div>
                    </div>
                  )
                ) : editId === m.id ? (
                  <div className={m.role === 'user' ? 'row me' : 'row'} style={{ position: 'relative' }}>
                    {m.role !== 'user' && <DialogueAvatar charId={m.charId} />}
                    <div className="editpane" onClick={e => e.stopPropagation()}>
                      <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} />
                      <span className="splithint">回车另起一条。有引号的是要念的，旁边的字单独一行。</span>
                      <button type="button" className="savebtn" onClick={() => { void box.editMessage(m.id, editDraft); setEditId(null); }}>保存</button>
                    </div>
                  </div>
                ) : (
                  <React.Fragment key={m.id}>
                  {visualRows(m).map((row, idx) => (
                  <React.Fragment key={row.key}>
                    {row.kind !== 'html' && (
                    <div className={m.role === 'user' ? 'row me' : 'row'} style={{ position: 'relative' }}>
                      {m.role !== 'user' && <DialogueAvatar charId={m.charId} />}
                      <div className="bcol">
                        {idx === 0 && m.thinkingText?.trim() ? <ThinkFold text={m.thinkingText} /> : null}
                        <div
                          className={`bub ${row.kind === 'voice' ? 'voice' : ''} ${lpId === m.id ? 'press' : ''}`}
                          onPointerDown={e => startHold(m.id, e)}
                          onPointerUp={cancelHold}
                          onPointerCancel={cancelHold}
                          onPointerMove={holdMove}
                          onClick={() => { if (row.kind === 'voice' && lpId !== m.id) void box.playBoxVoice(m.id); }}
                        >
                          <span className={row.kind === 'voice' ? 'voice-line' : 'narr-block'}>{renderBoxText(row.content)}</span>
                          {row.kind === 'voice' && (
                            <span className={
                              box.voiceLoadingId === m.id ? 'vmark load'
                              : box.playingVoiceId === m.id ? 'vmark on' : 'vmark'
                            } aria-hidden>
                              {box.voiceLoadingId === m.id ? <span className="vdots">…</span> : <><i /><i /><i /></>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    )}
                    {row.htmlSource && (
                      <>
                        {row.kind === 'html' && m.thinkingText?.trim() ? (
                          <div className="row">
                            <DialogueAvatar charId={m.charId} />
                            <div className="bcol"><ThinkFold text={m.thinkingText} /></div>
                          </div>
                        ) : null}
                        <div
                          className="htmlcard"
                          onPointerDown={e => { e.stopPropagation(); startHold(m.id, e); }}
                          onPointerUp={cancelHold}
                          onPointerCancel={cancelHold}
                        >
                          {/* 画面卡自己是一层独立小窗（iframe），手指按上去事件传不出来，
                              长按永远开不了菜单。就在卡角放一个小「⋯」，点它开同一张菜单。 */}
                          <button
                            type="button"
                            className="htmlmore"
                            aria-label="画面卡操作"
                            title="画面卡操作"
                            onPointerDown={e => {
                              e.stopPropagation();
                              if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
                            }}
                            onClick={e => { e.stopPropagation(); openMenuAt(m.id, e.clientX, e.clientY); }}
                          ><DotsThree size={15} weight="bold" /></button>
                          <HtmlCard wide allowScripts html={row.htmlSource} onOptionText={text => setDraft(prev => prev ? `${prev}${text}` : text)} />
                        </div>
                      </>
                    )}
                  </React.Fragment>
                  ))}
                  </React.Fragment>
                ))}
                {box.typing && (
                  <div className="row"><DialogueAvatar charId={box.session?.charId} />
                    <div className="livecol">
                      {box.liveThinking?.trim() ? <ThinkFold text={box.liveThinking} /> : null}
                      {box.liveText
                        ? <div className="bub"><span className="narr-block">{box.liveText}</span></div>
                        : <div className="bub"><span className="typing"><i /><i /><i /></span></div>}
                    </div>
                  </div>
                )}
                {box.paramNote && <div className="daysep">{box.paramNote}</div>}
                {box.foldBusy && <div className="daysep busy">喵喵正在总结前情…</div>}
                {box.foldNote && <div className="daysep">{box.foldNote}</div>}
                {box.error && (
                  <div className="daysep errnote">
                    <span>{box.error}</span>
                    <button type="button" className="errx" aria-label="关掉这条报错" onClick={() => box.dismissError()}>×</button>
                  </div>
                )}
                </div>
              </div>
              <div className="minichips">
                {STARTERS.map(id => {
                  const Ico = STARTER_ICO[id];
                  return (
                    <button
                      key={id}
                      className="minichip"
                      aria-label={STARTER_LABEL[id]}
                      title={STARTER_LABEL[id]}
                      aria-pressed={(box.pendingStarter || box.session?.starter) === id}
                      onClick={() => box.switchMode(id)}
                    ><Ico /></button>
                  );
                })}
                <div className="gearwrap">
                  {rerollOpen && (
                    <button
                      type="button"
                      className="minichip rerollpop"
                      aria-label="重roll"
                      onClick={() => { setRerollOpen(false); void box.rerollLastTurn(); }}
                    ><ArrowsClockwise size={17} /></button>
                  )}
                  <button className="minichip gearchip" aria-label="盒子设置" aria-pressed={rerollOpen} onClick={() => {
                    if (rerollOpen) {
                      setRerollOpen(false);
                      box.setPage('settings');
                    } else {
                      setRerollOpen(true);
                    }
                  }}><GearSix size={17} /></button>
                </div>
              </div>
            </>
          )}

          {box.page === 'settings' && box.settings && (
            <div className="home setpage">
              <div className="setsec">
                <div className="sh"><b>世界规则</b><span>默认折叠 · 点编辑才展开</span></div>
                {box.settings.worldRules.map(rule => (
                  <div key={rule.id} className="ruleitem">
                    <div className="r1">
                      <b>{rule.title}</b>
                      <button className="switch" aria-checked={rule.enabled} onClick={() => box.saveSettings({
                        ...box.settings!,
                        worldRules: box.settings!.worldRules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r),
                      })}><i /></button>
                      <button className="mini" onClick={() => setEditingRule(editingRule === rule.id ? null : rule.id)}><PencilSimple size={15} /></button>
                      <button className="mini danger" onClick={() => box.saveSettings({
                        ...box.settings!,
                        worldRules: box.settings!.worldRules.filter(r => r.id !== rule.id),
                      })}><Trash size={15} /></button>
                    </div>
                    {editingRule === rule.id && (
                      <RuleFields
                        key={rule.id}
                        title={rule.title}
                        body={rule.body}
                        onCommit={(title, body) => box.saveSettings({
                          ...box.settings!,
                          worldRules: box.settings!.worldRules.map(r => r.id === rule.id ? { ...r, title, body } : r),
                        })}
                      />
                    )}
                  </div>
                ))}
                <button className="schip" style={{ justifyContent: 'center' }} onClick={() => box.saveSettings({
                  ...box.settings!,
                  worldRules: [...box.settings!.worldRules, MiaomiaoBoxDB.newRule()],
                })}><Plus size={16} />再加一条规则</button>
              </div>
              <div className="setsec">
                <div className="sh"><b>总结设置</b><span>盒子自己卷，不碰别处</span></div>
                <div className="stepper">
                  <button onClick={() => box.saveSettings({ ...box.settings!, foldN: Math.max(1, (box.settings!.foldN || MIAOMIAO_FOLD_N_DEFAULT) - 1) })}>−</button>
                  <span className="val">{box.settings.foldN || MIAOMIAO_FOLD_N_DEFAULT}</span>
                  <button onClick={() => box.saveSettings({ ...box.settings!, foldN: (box.settings!.foldN || MIAOMIAO_FOLD_N_DEFAULT) + 1 })}>+</button>
                  <span className="unit">轮收成一条滚动总结</span>
                </div>
                <div className="stepper">
                  <button onClick={() => box.saveSettings({ ...box.settings!, foldKeep: Math.max(1, (box.settings!.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT) - 1) })}>−</button>
                  <span className="val">{box.settings.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT}</span>
                  <button onClick={() => box.saveSettings({ ...box.settings!, foldKeep: (box.settings!.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT) + 1 })}>+</button>
                  <span className="unit">轮留着不总结</span>
                </div>
                <div className="meta">凑满 {(box.settings.foldN || MIAOMIAO_FOLD_N_DEFAULT) + (box.settings.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT)} 轮才总结一次：收前 {box.settings.foldN || MIAOMIAO_FOLD_N_DEFAULT} 轮，留下后 {box.settings.foldKeep ?? MIAOMIAO_FOLD_KEEP_DEFAULT} 轮。</div>
                <div className="stepper">
                  <button onClick={() => box.saveSettings({ ...box.settings!, bigFoldEvery: Math.max(0, (box.settings!.bigFoldEvery ?? MIAOMIAO_BIG_FOLD_DEFAULT) - 1) })}>−</button>
                  <span className="val">{box.settings.bigFoldEvery ?? MIAOMIAO_BIG_FOLD_DEFAULT}</span>
                  <button onClick={() => box.saveSettings({ ...box.settings!, bigFoldEvery: (box.settings!.bigFoldEvery ?? MIAOMIAO_BIG_FOLD_DEFAULT) + 1 })}>+</button>
                  <span className="unit">条滚动总结亮着，回复一轮后就压成大总结</span>
                </div>
                <div className="meta">0 表示不做大总结。总结过 {box.session?.foldCount || 0} 次 · 卷起 {box.session?.foldedRoundCount || 0} 轮 · 原文全部留着，随时能翻</div>
              </div>
              <div className="setsec">
                <div className="sh"><b>对话</b><span>只改这一盒怎么说，总结不动</span></div>
                {([
                  ['温度', 'temperature', box.settings.temperature ?? 1, 0, 2, 0.05],
                  ['候选范围', 'topP', box.settings.topP ?? 1, 0, 1, 0.01],
                  ['重复惩罚', 'frequencyPenalty', box.settings.frequencyPenalty ?? 0, -2, 2, 0.05],
                  ['话题惩罚', 'presencePenalty', box.settings.presencePenalty ?? 0, -2, 2, 0.05],
                ] as [string, 'temperature' | 'topP' | 'frequencyPenalty' | 'presencePenalty', number, number, number, number][]).map(([label, key, value, min, max, step]) => (
                  <label key={key} className="dlgfield">
                    <span>{label}</span>
                    <NumberField
                      key={`miao-num-${key}-${box.settings!.charId}`}
                      value={value}
                      min={min}
                      max={max}
                      step={step}
                      ownerId={box.settings!.charId}
                      onCommit={(n, owner) => commitBoxSetting(owner, { [key]: n })}
                    />
                  </label>
                ))}
                <div className="ruleitem">
                  <div className="r1">
                    <b>流式</b>
                    <button className="switch" aria-checked={box.settings.stream === true} onClick={() => box.saveSettings({ ...box.settings!, stream: box.settings!.stream !== true })}><i /></button>
                  </div>
                </div>
                <div className="ruleitem">
                  <div className="r1">
                    <b>思考</b>
                    <button className="switch" aria-checked={box.settings.thinking === true} onClick={() => box.saveSettings({ ...box.settings!, thinking: box.settings!.thinking !== true })}><i /></button>
                  </div>
                </div>
                {box.settings.thinking === true && (
                  <div className="dlgfield">
                    <span>思考方式（只在这一盒用）</span>
                    <DraftField
                      key={`miao-guide-${box.settings.charId}`}
                      multiline
                      className="tarea"
                      placeholder="留空就不写思考引导。填了就只按这里写的来。"
                      value={box.settings.thinkingGuide || ''}
                      ownerId={box.settings.charId}
                      onCommit={(v, owner) => commitBoxSetting(owner, { thinkingGuide: v })}
                    />
                    <span className="hintline">没填的时候，不另加思考步骤。填了才发给模型，只在这一盒生效。</span>
                  </div>
                )}
              </div>
              <div className="setsec">
                <div className="sh"><b>语音</b><span>开启后只生成，要点才播</span></div>
                <div className="ruleitem">
                  <div className="r1">
                    <b>语音是否开启</b>
                    <button className="switch" aria-checked={box.settings.ttsEnabled !== false} onClick={() => box.saveSettings({ ...box.settings!, ttsEnabled: box.settings!.ttsEnabled === false, ttsAutoPlay: box.settings!.ttsEnabled === false })}><i /></button>
                  </div>
                </div>
              </div>
              <div className="setsec">
                <div className="sh"><b>语音识别规范</b><span>只读引号里要念的那一段</span></div>
                <div className="startbig">
                  <div className="grid">
                    {([
                      ['dq-ascii', '" "'],
                      ['dq-curly', '“ ”'],
                      ['corner', '「」'],
                      ['corner-paren', '「文本1（文本2）」'],
                      ['custom', '自定义'],
                    ] as [MiaomiaoQuoteStyle, string][]).map(([id, lab]) => (
                      <button
                        key={id}
                        type="button"
                        className={`schip${id === 'corner-paren' ? ' wide' : ''}`}
                        aria-pressed={(box.settings!.voiceQuoteStyle || 'corner') === id}
                        onClick={() => box.saveSettings({ ...box.settings!, voiceQuoteStyle: id })}
                      >{lab}</button>
                    ))}
                  </div>
                </div>
                {box.settings.voiceQuoteStyle === 'custom' && (
                  <DraftField
                    key={`miao-quote-${box.settings.charId}`}
                    className="tinput"
                    style={{ marginTop: 8, width: '100%' }}
                    placeholder="自定义成对符号，比如 『』"
                    value={box.settings.voiceQuoteCustom || ''}
                    ownerId={box.settings.charId}
                    onCommit={(v, owner) => commitBoxSetting(owner, { voiceQuoteCustom: v })}
                  />
                )}
              </div>
            </div>
          )}

          {box.page === 'history' && (
            <div className="home histpage">
              {reading?.archive ? (
                <div className="read">
                  <button type="button" className="readback" onClick={() => setReadId(null)}>‹ 返回列表</button>
                  <div className="readhd">
                    <b>{(reading.theme || '').trim() || reading.title || STARTER_LABEL[reading.starter]}</b>
                    <span>{(reading.status === 'playing' ? '进行中' : reading.status === 'paused' ? '暂停' : ARCHIVE_LABEL[reading.archive.mode])} · {reading.archive.lines.length} 条原文</span>
                  </div>
                  {reading.archive.lines.map(line => {
                    const raw = line.kind === 'html'
                      ? (line.htmlTextPreview || line.content || '（一张画面卡）')
                      : (line.kind === 'voice' ? (line.voiceSourceText || line.content) : (line.content || line.voiceSourceText || ''));
                    const text = line.kind === 'html'
                      ? (raw.split('\n').map(s => s.trim()).filter(Boolean).join('\n') || '（一张画面卡）')
                      : raw;
                    return (
                      <div key={line.id} className={line.role === 'user' ? 'readrow me' : 'readrow'}>
                        <div className="who">{line.role === 'user' ? '你' : (os.characters.find(c => c.id === reading.charId)?.name || 'Ta')}</div>
                        <div className="readbub">{line.kind === 'html' ? text : renderBoxText(text)}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="hhint">保存或暂停过的原文会留在这里。不压缩，也不拿去接着演。</div>
                  {box.historySessions.length === 0 && <div className="hhint">还没有。</div>}
                  {box.historySessions.map(s => (
                    <div key={s.id} className="hrow" onClick={() => setReadId(s.id)}>
                      <div className="hmain">
                        <b>{(s.theme || '').trim() || s.title || STARTER_LABEL[s.starter]}</b>
                        <span>{(s.status === 'playing' ? '进行中' : s.status === 'paused' ? '暂停' : (s.archive ? ARCHIVE_LABEL[s.archive.mode] : ''))} · {s.archive?.lines.length || 0} 条 · {new Date(s.archive?.savedAt || s.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <button type="button" className="mini danger" aria-label="删除这场原文" onClick={e => { e.stopPropagation(); void box.deleteHistory(s.id); }}><Trash size={15} /></button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {(box.page === 'home' || box.page === 'play') && (
            <div className="composer">
              <div className="editbox">
                <textarea
                  ref={draftRef}
                  placeholder={box.pendingStarter ? '这场是新的，先说一句…' : box.page === 'home' ? '想让猫儿演什么？直接说——' : '接着往下演，或者点上面的小图标换个起手式…'}
                  value={draft}
                  onChange={e => { setDraft(e.target.value); fitTextarea(e.target, 56); }}
                />
                <div className="side">
                  <button className="sendbtn" aria-label="发送" onClick={() => {
                    const t = draft.trim();
                    if (!t) return;
                    if (box.page === 'play' || (hasShow && box.session)) void box.sendPlay(t);
                    else void box.startPlay(box.session?.starter || 'box', t);
                    setDraft('');
                  }}><PaperPlaneTilt size={18} weight="fill" /></button>
                </div>
              </div>
            </div>
          )}

          {lpId && (() => {
            const lpMsg = box.messages.find(x => x.id === lpId);
            const isHtml = lpMsg?.kind === 'html';
            const isUser = lpMsg?.role === 'user';
            const isSummary = lpMsg?.role === 'summary';
            const isVoice = !isSummary && !isUser && !isHtml && (lpMsg?.kind === 'voice' || !!lpMsg?.voiceSourceText || /<[语語]音/.test(lpMsg?.content || '') || !lpMsg?.kind);
            return (
            <div
              ref={menuRef}
              className="lpmenu fixed"
              style={{ left: lpPos.x, top: lpPos.y }}
              onClick={e => e.stopPropagation()}
            >
              {!isHtml && <button type="button" onClick={() => { if (lpMsg) { setEditId(lpMsg.id); setEditDraft(lpMsg.voiceSourceText || lpMsg.content); } setLpId(null); }}><PencilSimple size={15} />编辑</button>}
              {!isHtml && <button type="button" onClick={() => {
                if (lpMsg) void navigator.clipboard.writeText(lpMsg.content);
                setLpId(null);
              }}><CopySimple size={15} />复制</button>}
              {isSummary && <button type="button" onClick={() => { const id = lpId; setLpId(null); if (id) void box.dissolveSummary(id); }}><ArrowsCounterClockwise size={15} />解散</button>}
              {isVoice && !isUser && <button type="button" onClick={() => { const id = lpId; setLpId(null); if (id) void box.playBoxVoice(id); }}><SpeakerHigh size={15} />播放语音</button>}
              {isVoice && !isUser && <button type="button" onClick={() => { const id = lpId; setLpId(null); if (id) void box.downloadBoxVoice(id); }}><DownloadSimple size={15} />语音下载</button>}
              <button type="button" className="danger full" onClick={() => { const id = lpId; setLpId(null); if (id) void box.deleteBoxMessage(id); }}><Trash size={15} />删除</button>
            </div>
            );
          })()}

          {sheet && (
            <div className="sheetmask" onClick={() => setSheet(false)}>
              <div className="sheet" onClick={e => e.stopPropagation()}>
                <div className="hd">
                  <span className="bx"><MiaomiaoBoxCat lid="behind" tail="out" cls="mini" /></span>
                  <div><h3>要把这一段收进哪里？</h3><p>合上箱盖之前，先挑一个</p></div>
                </div>
                {box.error ? <p className="sub">{box.error}</p> : null}
                {([
                  ['remember', '记在心里', '猫儿把这事记成一段真实发生的事，以后聊天里想得起来。'],
                  ['raw', '原样收进', '不做大总结，把摘要和话原样收进聊天，也一样记得住。'],
                  ['forget', '抖抖毛，忘掉', '不进正文，猫儿不记得。盒子历史里还翻得到。'],
                  ['paused', '暂停', '先撤出箱子回去聊天，落一张「未完待续」，下次接着演。'],
                ] as [MiaomiaoArchiveMode, string, string][]).map(([mode, title, desc]) => (
                  <button key={mode} className={mode === 'paused' ? 'opt pause' : mode === 'remember' ? 'opt emph' : 'opt'} onClick={() => { setSheet(false); box.closeLid(mode); }}>
                    <span><b>{title}</b><span>{desc}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showWidget && (
        <div
          ref={widgetRef}
          className="widget"
          style={{ pointerEvents: 'auto', transform: `translate(${widgetPos.x}px, ${widgetPos.y}px)` }}
          onPointerDown={onWidgetDown}
          onPointerMove={onWidgetMove}
          onPointerUp={onWidgetUp}
          onPointerCancel={onWidgetUp}
          aria-label="回到喵喵盒"
        >
          <MiaomiaoBoxCat lid={hasShow ? 'open' : 'on'} tail={hasShow ? 'out' : 'in'} cls="mini" />
          {box.unread && <span className="dot">✦</span>}
        </div>
      )}
    </div>
  );
};

export default MiaomiaoBoxHost;
