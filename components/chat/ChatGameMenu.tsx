import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listChatGamePlugins } from '../../utils/chatGames/registry';
import type { ChatGamePlugin } from '../../utils/chatGames/types';
import {
    CHAT_GAMES_CHANGED,
    readChatGameSettings,
    writeChatGameEnabled,
    writeChatGameMaster,
    writeRpsFreeChoice,
} from '../../utils/chatGames/settings';
import './chatGameMenu.css';

function Switch({ on, label, onClick, disabled, text }: { on: boolean; label: string; onClick: () => void; disabled?: boolean; text?: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="cgm-switch-label"
        >
            {text && <span>{text}</span>}
            <span className="cgm-switch" aria-hidden="true"><i /></span>
        </button>
    );
}

/** Menu-only artwork: message card artwork and colours stay unchanged. */
function GameGlyph({ name }: { name: string }) {
    return (
        <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {name === 'die' ? (
                <>
                    <rect className="cgm-glyph-fill" x="7" y="7" width="26" height="26" rx="7" transform="rotate(-10 20 20)" />
                    {[[13, 14], [25, 12], [20, 20], [15, 27], [27, 25]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill="currentColor" stroke="none" />)}
                </>
            ) : name === 'scissors' ? (
                <>
                    <path className="cgm-glyph-fill" d="m16 22-6-14a3 3 0 0 1 5-3l7 15 4-14a3 3 0 0 1 6 2l-3 15h3a3 3 0 0 1 3 3v3l-7 7H17L7 26a3 3 0 0 1 4-4l6 5" />
                    <path d="M17 22h10v7H17" />
                </>
            ) : name === 'paper' ? (
                <path className="cgm-glyph-fill" d="M13 23V11a2.5 2.5 0 0 1 5 0v9V7a2.5 2.5 0 0 1 5 0v13V9a2.5 2.5 0 0 1 5 0v12V14a2.5 2.5 0 0 1 5 0v12l-6 10H16L6 24a3 3 0 0 1 5-3l7 7" />
            ) : (
                <>
                    <path className="cgm-glyph-fill" d="M10 24V16a3 3 0 0 1 6 0v-3a3 3 0 0 1 6 0v1a3 3 0 0 1 6 1v2a3 3 0 0 1 6 1v8l-5 9H16L7 26a3 3 0 0 1 4-4l5 4" />
                    <path d="M16 16v4m6-6v6m6-3v4" />
                </>
            )}
        </svg>
    );
}

/** 加号 · 游戏盒。换卡、游玩和开关在同一页，沿用现有的发送路径。 */
const ChatGameMenu: React.FC<{
    open: boolean;
    onClose: () => void;
    onPlay: (gameId: string, value?: string) => void;
}> = ({ open, onClose, onPlay }) => {
    const [selectedId, setSelectedId] = useState('dice');
    const [settings, setSettings] = useState(() => readChatGameSettings());
    const plugins = listChatGamePlugins();
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        setSettings(readChatGameSettings());
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialogRef.current?.focus();
        return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
    }, [open]);

    useEffect(() => {
        const bump = () => setSettings(readChatGameSettings());
        window.addEventListener(CHAT_GAMES_CHANGED, bump);
        return () => window.removeEventListener(CHAT_GAMES_CHANGED, bump);
    }, []);

    const refresh = () => setSettings(readChatGameSettings());
    const detail = plugins.find((plugin) => plugin.id === selectedId) || plugins[0];
    const masterOn = settings.master;
    const gameEnabled = (id: string) => masterOn && settings.games[id] !== false;
    const live = detail && gameEnabled(detail.id);
    const toggleGame = (plugin: ChatGamePlugin) => {
        writeChatGameEnabled(plugin.id, settings.games[plugin.id] === false);
        refresh();
    };
    const play = (value?: string) => {
        if (detail && gameEnabled(detail.id)) onPlay(detail.id, value);
    };

    if (!open || !detail) return null;

    return createPortal(
        <div
            className="cgm-overlay"
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose();
                }
                if (event.key !== 'Tab') return;
                const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary');
                if (!controls?.length) return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
                    event.preventDefault();
                    first.focus();
                }
            }}
        >
            <div ref={dialogRef} className="cgm-root" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
                <header className="cgm-head">
                    <div className="cgm-brand">
                        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M7 14 5 6l8 5m12 3 2-8-8 5M5 17c0-7 22-7 22 0v5c0 9-22 9-22 0Z" />
                            <path d="M10 21h4m-2-2v4" />
                            <circle cx="22" cy="20" r="1" fill="currentColor" /><circle cx="19" cy="23" r="1" fill="currentColor" />
                        </svg>
                        <h2 id={titleId}>游戏盒</h2>
                    </div>
                    <div className="cgm-tools">
                        <button type="button" className="cgm-master" role="switch" aria-label="小游戏总开关" aria-checked={masterOn} onClick={() => { writeChatGameMaster(!masterOn); refresh(); }}>
                            <span className="cgm-led" aria-hidden="true" />
                            <span>总开关 {masterOn ? '开' : '关'}</span>
                        </button>
                        <button type="button" className="cgm-close" aria-label="关闭游戏盒" onClick={onClose}>×</button>
                    </div>
                </header>
                <p className="cgm-intro">挑一张小卡，陪角色玩一会儿……</p>

                <div className="cgm-collection" role="group" aria-label="选择游戏卡带">
                    {plugins.map((plugin) => {
                        const selected = plugin.id === detail.id;
                        const enabled = gameEnabled(plugin.id);
                        return (
                            <button key={plugin.id} type="button" className={`cgm-pick cgm-pick--${plugin.face}${enabled ? '' : ' is-off'}`} aria-label={`选择${plugin.name}`} aria-pressed={selected} onClick={() => setSelectedId(plugin.id)}>
                                <span className="cgm-cartridge">
                                    <span className="cgm-grip" />
                                    <span className="cgm-sticker">
                                        <span className="cgm-band"><span>小游戏</span><span aria-hidden="true">{enabled ? '●' : '○'}</span></span>
                                        <span className="cgm-illustration"><GameGlyph name={plugin.face === 'die' ? 'die' : 'scissors'} /></span>
                                        <span className="cgm-cart-title">{plugin.name}</span>
                                    </span>
                                    <span className="cgm-contacts" aria-hidden="true">{[0, 1, 2, 3, 4].map(pin => <i key={pin} />)}</span>
                                </span>
                                <span className="cgm-pick-note">{!masterOn ? '总开关关着' : settings.games[plugin.id] === false ? '暂时停用' : selected ? '已选中 ·' : '点一下换卡'}</span>
                            </button>
                        );
                    })}
                </div>

                <section aria-label={`${detail.name}操作`}>
                    <div className="cgm-game-head">
                        <div>
                            <h3>{detail.name}</h3>
                            <p>{detail.face === 'die' ? '1 到 6 点，交给一点点运气' : '石头、剪刀、布，先扣在手心'}</p>
                        </div>
                        <Switch on={settings.games[detail.id] !== false} label={`启用${detail.name}`} text={settings.games[detail.id] !== false ? '已启用' : '已停用'} onClick={() => toggleGame(detail)} />
                    </div>
                    <p className="cgm-lore">{detail.face === 'die' ? '唔……骰子会自己滚，哪一面朝上，猫儿也说不准……' : '先选一手，出完盖好……等双方都出拳，再一起翻开。'}</p>

                    {detail.choices?.length ? (
                        <>
                            <div className="cgm-hands">
                                {detail.choices.map(choice => (
                                    <button key={choice.value} type="button" className="cgm-hand" aria-label={`出${choice.label}`} disabled={!live} onClick={() => play(choice.value)}>
                                        <GameGlyph name={choice.value} /><span>{choice.label}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="cgm-small-note">点选一手，直接发到私聊</p>
                        </>
                    ) : (
                        <button type="button" className="cgm-main-action" disabled={!live} onClick={() => play()}>
                            <GameGlyph name={detail.face} />
                            <span>{live ? '摇一颗……' : !masterOn ? '先打开小游戏总开关' : `${detail.name}已停用`}</span>
                        </button>
                    )}

                    {detail.id === 'rps' && (
                        <div className="cgm-free">
                            <div>
                                <strong>角色自己出拳</strong>
                                <p>{settings.rpsFreeChoice ? '开着时，角色自己选择出哪一手' : '关着时，由系统随机替角色出拳'}</p>
                            </div>
                            <Switch on={settings.rpsFreeChoice === true} label="角色自己出拳" disabled={!live} onClick={() => { if (!gameEnabled('rps')) return; writeRpsFreeChoice(!settings.rpsFreeChoice); refresh(); }} />
                        </div>
                    )}

                    {!live && (
                        <div className="cgm-status" role="status">
                            {!masterOn ? '总开关关着，用户和角色都暂时不能玩。' : '游戏卡还在，启用后就能继续玩。'}
                            <button type="button" onClick={() => { if (!masterOn) { writeChatGameMaster(true); refresh(); } else toggleGame(detail); }}>
                                {!masterOn ? '打开总开关' : '启用游戏'}
                            </button>
                        </div>
                    )}

                    <details key={detail.id} className="cgm-rule">
                        <summary>怎么玩</summary>
                        <p>{detail.settingRule}{detail.choices?.length ? '发送后返回私聊，不会自动触发角色回复。' : ''}</p>
                    </details>
                </section>
            </div>
        </div>,
        document.body,
    );
};

export default ChatGameMenu;
