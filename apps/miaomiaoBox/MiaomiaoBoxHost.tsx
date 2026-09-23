import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise, ArrowsCounterClockwise, CaretLeft, Clock, CopySimple, DownloadSimple, GearSix, House, Moon, PaperPlaneTilt, PencilSimple, Plus, SpeakerHigh, Sun, Trash,
} from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { AppID } from '../../types';
import { useMiaomiaoBox } from '../../context/MiaomiaoBoxContext';
import { MiaomiaoBoxCat } from './MiaomiaoBoxCat';
import HtmlCard from '../../components/chat/HtmlCard';
import { MIAOMIAO_BIG_FOLD_DEFAULT, MIAOMIAO_FOLD_KEEP_DEFAULT, MIAOMIAO_FOLD_N_DEFAULT, STARTER_HINT, STARTER_LABEL, type MiaomiaoArchiveMode, type MiaomiaoMessage, type MiaomiaoQuoteStyle, type MiaomiaoStarter } from './types';
import { getChibi } from '../../utils/vrWorld/chibi';
import { countUnfoldedRounds, relocateSummaries } from './foldSession';
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
  const [lpPos, setLpPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [openAnim, setOpenAnim] = useState(false);
  const [rerollOpen, setRerollOpen] = useState(false);
  const [readId, setReadId] = useState<string | null>(null);
  const lpOpenedAt = useRef(0);
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
  const stickToBottom = useRef(true);
  const pinTimer = useRef<number | null>(null);

  // 卡片 iframe 是加载完才撑高的，撑高会把最新那条顶下去。所以贴底不是一次性的，
  // 要在一小段时间里持续追。用户自己往上翻（stickToBottom=false）就立刻停手。
  const chaseBottom = (ms: number) => {
    const el = stageRef.current;
    if (!el) return;
    if (pinTimer.current) window.clearInterval(pinTimer.current);
    const pin = () => { if (stickToBottom.current) el.scrollTop = el.scrollHeight; };
    pin();
    let left = ms;
    pinTimer.current = window.setInterval(() => {
      pin();
      left -= 120;
      if (left <= 0 && pinTimer.current) {
        window.clearInterval(pinTimer.current);
        pinTimer.current = null;
      }
    }, 120);
  };

  // 进对话页：直接落到最新一条，不用自己往下滑。
  useEffect(() => {
    stickToBottom.current = true;
    chaseBottom(1500);
  }, [box.page, box.session?.id]);

  // 新消息、出字、思维链、盒内总结提醒：只要还贴着底就继续跟着走；往上翻了就不抢。
  useEffect(() => {
    if (box.page !== 'play') return;
    chaseBottom(1200);
  }, [box.messages, box.liveText, box.liveThinking, box.typing, box.foldNote, box.foldBusy, box.page]);

  useEffect(() => () => {
    if (pinTimer.current) window.clearInterval(pinTimer.current);
  }, []);
  useEffect(() => {
    if (!showFloat || !hasShow) return;
    setOpenAnim(true);
    const t = window.setTimeout(() => setOpenAnim(false), 700);
    return () => window.clearTimeout(t);
  }, [showFloat, hasShow]);
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

  const startHold = (id: string, e?: React.PointerEvent) => {
    if (e) {
      const boxEl = floatRef.current;
      const r = boxEl ? boxEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const pad = 8;
      const menuH = 40;
      let x = e.clientX - r.left;
      let y = (e.clientY - r.top) - menuH - 10;
      if (x + 220 > r.width - pad) x = Math.max(pad, r.width - 220 - pad);
      if (x < pad) x = pad;
      if (y < pad) y = Math.min(r.height - menuH - pad, (e.clientY - r.top) + 22);
      setLpPos({ x, y });
    }
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      lpOpenedAt.current = Date.now();
      setLpId(id);
    }, 420);
  };
  const cancelHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
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

  const justOpenedMenu = () => Date.now() - lpOpenedAt.current < 500;
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
                onScroll={e => {
                  const el = e.currentTarget;
                  stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                }}
                onClick={() => { if (justOpenedMenu()) return; setLpId(null); }}
              >
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
                      onPointerMove={cancelHold}
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
                          onPointerMove={cancelHold}
                          onClick={() => { if (justOpenedMenu()) return; if (row.kind === 'voice' && lpId !== m.id) void box.playBoxVoice(m.id); }}
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
                        ><HtmlCard wide allowScripts html={row.htmlSource} onOptionText={text => setDraft(prev => prev ? `${prev}${text}` : text)} /></div>
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
                    <input
                      className="tinput"
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      value={value}
                      onChange={e => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        box.saveSettings({ ...box.settings!, [key]: Math.min(max, Math.max(min, n)) });
                      }}
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
                    <textarea
                      className="tarea"
                      value={box.settings.thinkingGuide || ''}
                      placeholder="留空就不写思考引导。填了就只按这里写的来。"
                      onChange={e => box.saveSettings({ ...box.settings!, thinkingGuide: e.target.value })}
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
                  <input
                    className="tinput"
                    style={{ marginTop: 8, width: '100%' }}
                    placeholder="自定义成对符号，比如 『』"
                    value={box.settings.voiceQuoteCustom || ''}
                    onChange={e => box.saveSettings({ ...box.settings!, voiceQuoteCustom: e.target.value })}
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
              className="lpmenu fixed"
              style={{ left: lpPos.x, top: lpPos.y }}
              onClick={e => e.stopPropagation()}
              onClickCapture={e => { if (justOpenedMenu()) { e.preventDefault(); e.stopPropagation(); } }}
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
