import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise, CaretLeft, Clock, CopySimple, DownloadSimple, GearSix, House, Moon, PaperPlaneTilt, PencilSimple, Plus, SpeakerHigh, Sun, Trash,
} from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { AppID } from '../../types';
import { useMiaomiaoBox } from '../../context/MiaomiaoBoxContext';
import { MiaomiaoBoxCat } from './MiaomiaoBoxCat';
import HtmlCard from '../../components/chat/HtmlCard';
import { MIAOMIAO_FOLD_N_DEFAULT, STARTER_HINT, STARTER_LABEL, type MiaomiaoArchiveMode, type MiaomiaoMessage, type MiaomiaoQuoteStyle, type MiaomiaoStarter } from './types';
import { countUnfoldedRounds } from './foldSession';
import { displayTextForBoxReply, splitIntoBubbles } from './speakQuoted';
import { MiaomiaoBoxDB } from './miaomiaoBoxDb';
import TokenImg from '../../components/os/TokenImg';
import { IcoMinus, STARTER_ICO } from './miaoIcons';
import './miaomiao-box.css';

const STARTERS: MiaomiaoStarter[] = ['box', 'story', 'claw', 'walk', 'dream', 'random'];

function visualRows(m: MiaomiaoMessage): { key: string; kind: 'text' | 'voice' | 'html'; content: string; htmlSource?: string }[] {
  if (m.kind === 'html') return [{ key: m.id, kind: 'html', content: '', htmlSource: m.htmlSource }];
  if (m.kind === 'voice') return [{ key: m.id, kind: 'voice', content: m.content }];
  if (m.kind === 'text') return [{ key: m.id, kind: 'text', content: m.content, htmlSource: m.htmlSource }];
  const segs = splitIntoBubbles(m.content || '');
  if (!segs.length) {
    if (m.htmlSource) return [{ key: m.id, kind: 'html', content: '', htmlSource: m.htmlSource }];
    return m.content ? [{ key: m.id, kind: 'text', content: m.content }] : [];
  }
  const rows = segs.map((s, i) => ({
    key: `${m.id}-${i}`,
    kind: s.kind as 'text' | 'voice',
    content: s.content,
    htmlSource: undefined as string | undefined,
  }));
  if (m.htmlSource) rows.push({ key: `${m.id}-html`, kind: 'html', content: '', htmlSource: m.htmlSource });
  return rows;
}
const THEME_KEY = 'miaomiao-box-theme';
const POS_KEY = 'miaomiao-box-pos';

const MiaomiaoBoxHost: React.FC = () => {
  const os = useOS();
  const box = useMiaomiaoBox();
  const [draft, setDraft] = useState('');
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

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const showFloat = box.shell === 'float' && os.activeApp === AppID.Chat && (!box.session || box.session.charId === os.activeCharacterId);
  const showWidget = box.shell === 'widget';
  const hasShow = !!(box.session && (box.session.status === 'playing' || box.session.status === 'paused') && box.messages.length > 0);
  useEffect(() => {
    if (!showFloat || !hasShow) return;
    setOpenAnim(true);
    const t = window.setTimeout(() => setOpenAnim(false), 700);
    return () => window.clearTimeout(t);
  }, [showFloat, hasShow]);
  if (!showFloat && !showWidget) return null;

  const sub = box.session
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
      let x = e.clientX - r.left;
      let y = e.clientY - r.top;
      if (x + 196 > r.width - pad) x = Math.max(pad, r.width - 196 - pad);
      if (y + 180 > r.height - pad) y = Math.max(pad, r.height - 180 - pad);
      if (x < pad) x = pad;
      if (y < pad) y = pad;
      setLpPos({ x, y });
    }
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setLpId(id), 420);
  };
  const cancelHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const onHomeLeft = () => {
    if (box.page === 'home') box.leaveToChat();
    else box.setPage('home');
  };

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
              <h2>{box.page === 'settings' ? '盒子设置' : box.page === 'history' ? '历史原文' : '喵喵盒'}</h2>
              <p>{box.page === 'settings' ? '只影响盒子里' : sub}</p>
            </div>
            <div className="acts">
              {box.page === 'home' && (
                <button className="iconbtn" aria-label="看历史原文" onClick={() => box.setPage('history')}><Clock size={18} /></button>
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
                <div className="contcard">
                  <div className="mini">{(() => {
                    const ch = os.characters.find(c => c.id === box.session?.charId);
                    const img = ch?.vrState?.chibi?.img || ch?.avatar;
                    return img ? <TokenImg value={img} alt="" /> : <MiaomiaoBoxCat lid={hasShow ? 'open' : 'on'} tail={hasShow ? 'out' : 'in'} cls="mini" />;
                  })()}</div>
                  <div className="t"><b>{box.session.title}</b><span>{STARTER_LABEL[box.session.starter]} · 接着演</span></div>
                  <button className="go" onClick={() => box.setPage('play')}>接着 ▸</button>
                </div>
              )}
              <div className="startbig">
                <div className="seclabel"><span className="bar" /><span className="tx"><b>挑个箱子演出吧</b><i>START A BOX</i></span></div>
                <div className="grid">
                  {STARTERS.map(id => {
                    const Ico = STARTER_ICO[id];
                    return (
                      <button key={id} className="schip" onClick={() => box.startPlay(id)}>
                        <Ico />
                        <span className="lab"><b>{STARTER_LABEL[id]}</b><i>{STARTER_HINT[id]}</i></span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="setrow" onClick={() => box.setPage('settings')}>
                <span className="l"><GearSix size={18} />盒子设置<span style={{ fontSize: 10.5, color: 'var(--miao-lilac)' }}>世界规则 · 总结设置 · 语音</span></span>
                <span className="chev">›</span>
              </div>
            </div>
          )}

          {box.page === 'play' && (
            <>
              <div className="stage" onClick={() => setLpId(null)}>
                {box.messages.map(m => m.role === 'summary' ? (
                  <div key={m.id} className="sumcard">
                    <div className="shd"><b>箱子里的前情</b><span className="stag">自动总结 · 第 {m.summaryRange?.fromRound}–{m.summaryRange?.toRound} 轮</span></div>
                    <div className="sbd">{m.content}</div>
                    <div className="sft"><span>摘要 · 原文留着，随时能翻</span></div>
                  </div>
                ) : (
                  visualRows(m).map(row => (
                  <React.Fragment key={row.key}>
                    {row.kind !== 'html' && (
                    <div className={m.role === 'user' ? 'row me' : 'row'} style={{ position: 'relative' }}>
                      {m.role !== 'user' && <span className="av"><MiaomiaoBoxCat lid={hasShow ? 'open' : 'on'} tail={hasShow ? 'out' : 'in'} cls="mini" /></span>}
                      {editId === m.id ? (
                        <div className="editpane" onClick={e => e.stopPropagation()}>
                          <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} />
                          <button type="button" className="savebtn" onClick={() => { void box.editMessage(m.id, editDraft); setEditId(null); }}>保存</button>
                        </div>
                      ) : (
                          <div
                            className={`bub ${row.kind === 'voice' ? 'voice' : ''} ${lpId === m.id ? 'press' : ''}`}
                            onPointerDown={e => startHold(m.id, e)}
                            onPointerUp={cancelHold}
                            onPointerCancel={cancelHold}
                            onPointerMove={cancelHold}
                            onClick={() => { if (row.kind === 'voice' && lpId !== m.id) void box.playBoxVoice(m.id); }}
                          >
                            <span className={row.kind === 'voice' ? 'voice-line' : 'narr-block'}>{row.content}</span>
                          </div>
                      )}
                    </div>
                    )}
                    {row.htmlSource && (
                      <div
                        className="htmlcard"
                        onPointerDown={e => { e.stopPropagation(); startHold(m.id, e); }}
                        onPointerUp={cancelHold}
                        onPointerCancel={cancelHold}
                      ><HtmlCard html={row.htmlSource} /></div>
                    )}
                  </React.Fragment>
                  ))
                ))}
                {box.typing && (
                  <div className="row"><span className="av"><MiaomiaoBoxCat lid={hasShow ? 'open' : 'on'} tail={hasShow ? 'out' : 'in'} cls="mini" /></span>
                    <div className="bub"><span className="typing"><i /><i /><i /></span></div>
                  </div>
                )}
                {box.error && <div className="daysep">{box.error}</div>}
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
                      aria-pressed={box.session?.starter === id}
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
                      <div className="editbig">
                        <div className="ti">标题</div>
                        <input className="tinput" value={rule.title} onChange={e => box.saveSettings({
                          ...box.settings!,
                          worldRules: box.settings!.worldRules.map(r => r.id === rule.id ? { ...r, title: e.target.value } : r),
                        })} />
                        <div className="ti" style={{ marginTop: 6 }}>正文</div>
                        <textarea className="tarea" value={rule.body} onChange={e => box.saveSettings({
                          ...box.settings!,
                          worldRules: box.settings!.worldRules.map(r => r.id === rule.id ? { ...r, body: e.target.value } : r),
                        })} />
                      </div>
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
                  <span className="unit">轮之后，把前面的卷成摘要</span>
                </div>
                <div className="meta">总结过 {box.session?.foldCount || 0} 次 · 卷起 {box.session?.foldedRoundCount || 0} 轮 · 原文全部留着，随时能翻</div>
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
            <div className="home">
              <div className="hhint">总结只是把话卷起来省地方，原文一直留着，随时能翻。</div>
              {box.messages.filter(m => m.role === 'summary').map(sum => (
                <div key={sum.id} className="hcard">
                  <div className="hsum"><span className="htag">摘要</span>{sum.content}</div>
                  <div className="hsep"><span>原文</span></div>
                  <div className="hraw">
                    {box.messages.filter(m => m.folded && m.role !== 'summary').slice(0, 6).map(m => (
                      <div key={m.id} className={m.role === 'user' ? 'hrrow me' : 'hrrow'}>
                        <div className="hrbub">{displayTextForBoxReply(m.content)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="hft"><span>原文只读，改不了</span></div>
                </div>
              ))}
            </div>
          )}

          {(box.page === 'home' || box.page === 'play') && (
            <div className="composer">
              <div className="editbox">
                <textarea
                  placeholder={box.page === 'home' ? '想让猫儿演什么？直接说——' : '接着往下演，或者点上面的小图标换个起手式…'}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
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
            const isVoice = !isUser && !isHtml && (lpMsg?.kind === 'voice' || !!lpMsg?.voiceSourceText || /<[语語]音/.test(lpMsg?.content || '') || !lpMsg?.kind);
            return (
            <div className="lpmenu fixed" style={{ left: lpPos.x, top: lpPos.y }} onClick={e => e.stopPropagation()}>
              {!isHtml && <button type="button" onClick={() => { if (lpMsg) { setEditId(lpMsg.id); setEditDraft(lpMsg.voiceSourceText || lpMsg.content); } setLpId(null); }}><PencilSimple size={15} />编辑</button>}
              {!isHtml && <button type="button" onClick={() => {
                if (lpMsg) void navigator.clipboard.writeText(lpMsg.content);
                setLpId(null);
              }}><CopySimple size={15} />复制</button>}
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
