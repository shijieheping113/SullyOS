import React, { useEffect, useState } from 'react';
import Modal from '../os/Modal';
import { DiceGlyph, HandGlyph } from './ChatGameCard';
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

function Switch({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40"
            style={{ background: on ? '#4EA6C8' : '#D3D1C7' }}
        >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
    );
}

function ArtTile({ plugin, size }: { plugin: ChatGamePlugin; size: 'card' | 'hero' }) {
    const glyph = size === 'hero' ? 42 : 28;
    const cls = size === 'hero' ? 'cgm-detail-art-tile' : 'cgm-card-art-tile';
    return (
        <span className={cls}>
            {plugin.face === 'die' ? <DiceGlyph size={glyph} /> : <HandGlyph name="rock" size={glyph} />}
        </span>
    );
}

const SERIES: Record<string, string> = {
    dice: 'CHAT · DICE',
    rps: 'CHAT · RPS',
};

/**
 * 加号 · 小游戏。
 * 大厅是竖版小卡；点进二级才是玩法 + 猫儿介绍 + 设置。
 */
const ChatGameMenu: React.FC<{
    open: boolean;
    onClose: () => void;
    onPlay: (gameId: string, value?: string) => void;
}> = ({ open, onClose, onPlay }) => {
    const [page, setPage] = useState<'home' | string>('home');
    const [settings, setSettings] = useState(() => readChatGameSettings());
    const plugins = listChatGamePlugins();

    useEffect(() => {
        if (open) {
            setPage('home');
            setSettings(readChatGameSettings());
        }
    }, [open]);

    useEffect(() => {
        const bump = () => setSettings(readChatGameSettings());
        window.addEventListener(CHAT_GAMES_CHANGED, bump);
        return () => window.removeEventListener(CHAT_GAMES_CHANGED, bump);
    }, []);

    const refresh = () => setSettings(readChatGameSettings());
    const detail = page === 'home' ? null : plugins.find((plugin) => plugin.id === page) || null;
    const masterOn = settings.master;
    const title = detail ? detail.name : '小游戏';
    const gameEnabled = (id: string) => masterOn && settings.games[id] !== false;
    const canPlay = (plugin: ChatGamePlugin) => gameEnabled(plugin.id);

    return (
        <Modal
            isOpen={open}
            title={title}
            onClose={onClose}
            footer={detail ? (
                <button
                    type="button"
                    onClick={() => setPage('home')}
                    className="w-full min-h-[44px] py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl active:scale-95 transition-transform"
                >
                    回到卡册
                </button>
            ) : undefined}
        >
            <div className="cgm-root">
                {detail ? (
                    <>
                        <button type="button" className="cgm-back" onClick={() => setPage('home')}>
                            <span aria-hidden="true">‹</span>
                            卡册
                        </button>

                        <div className="cgm-detail-card">
                            <div className="cgm-detail-inner">
                                <div className="cgm-detail-nameplate">
                                    <strong>{detail.name}</strong>
                                </div>
                                <div className={`cgm-detail-art cgm-detail-art--${detail.face}`}>
                                    <ArtTile plugin={detail} size="hero" />
                                </div>
                                <div className="cgm-detail-foot">
                                    <em>{SERIES[detail.id] || 'CHAT · GAME'}</em>
                                </div>
                            </div>
                        </div>

                        <p className="cgm-detail-story">{detail.settingStory}</p>

                        <section className="cgm-section">
                            <p className="cgm-section-label">玩一局</p>
                            {canPlay(detail) ? (
                                detail.choices?.length ? (
                                    <div className="cgm-choice-grid">
                                        {detail.choices.map((choice) => (
                                            <button
                                                key={choice.value}
                                                type="button"
                                                className="cgm-choice"
                                                onClick={() => onPlay(detail.id, choice.value)}
                                            >
                                                <HandGlyph name={choice.value} size={26} />
                                                {choice.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className="cgm-play-dice"
                                        onClick={() => onPlay(detail.id)}
                                    >
                                        摇一颗…
                                    </button>
                                )
                            ) : (
                                <p className="cgm-empty-play">
                                    {masterOn
                                        ? '唔…这款关着。打开下面…就可以玩了…'
                                        : '总开关还关着…先回卡册打开它…'}
                                </p>
                            )}
                        </section>

                        <section className="cgm-section">
                            <p className="cgm-section-label">设置</p>
                            <div className={`cgm-setting-row ${masterOn ? '' : 'is-dim'}`}>
                                <div className="cgm-setting-copy">
                                    <strong>启用这款</strong>
                                    <span>关掉后卡还在…只是暂时玩不了…</span>
                                </div>
                                <Switch
                                    on={settings.games[detail.id] !== false}
                                    label={`启用${detail.name}`}
                                    onClick={() => {
                                        writeChatGameEnabled(detail.id, settings.games[detail.id] === false);
                                        refresh();
                                    }}
                                />
                            </div>
                            {detail.id === 'rps' ? (
                                <div className={`cgm-setting-row ${gameEnabled('rps') ? '' : 'is-dim'}`}>
                                    <div className="cgm-setting-copy">
                                        <strong>角色自己出拳</strong>
                                        <span>打开后…他自己选。关掉就…让手机帮他出…</span>
                                    </div>
                                    <Switch
                                        on={settings.rpsFreeChoice === true}
                                        label="角色自己出拳"
                                        disabled={!gameEnabled('rps')}
                                        onClick={() => {
                                            if (!gameEnabled('rps')) return;
                                            writeRpsFreeChoice(!settings.rpsFreeChoice);
                                            refresh();
                                        }}
                                    />
                                </div>
                            ) : null}
                        </section>
                        <p className="cgm-rule">{detail.settingRule}</p>
                    </>
                ) : (
                    <>
                        <p className="cgm-home-tip">唔…点一张小卡…就能玩。开关也在卡里面…</p>
                        <div className="cgm-master">
                            <div className="cgm-master-copy">
                                <strong>总开关</strong>
                                <span>关掉的话…角色大概会忘掉这些玩法…</span>
                            </div>
                            <Switch
                                on={masterOn}
                                label="小游戏总开关"
                                onClick={() => {
                                    writeChatGameMaster(!masterOn);
                                    refresh();
                                }}
                            />
                        </div>
                        <div className="cgm-card-list">
                            {plugins.map((plugin) => {
                                const on = settings.games[plugin.id] !== false;
                                const live = masterOn && on;
                                return (
                                    <button
                                        key={plugin.id}
                                        type="button"
                                        className={`cgm-card ${live ? '' : 'is-off'}`}
                                        onClick={() => setPage(plugin.id)}
                                    >
                                        <span className="cgm-card-inner">
                                            <span className="cgm-card-nameplate">
                                                <strong>{plugin.name}</strong>
                                                <span className={`cgm-card-badge ${live ? 'is-on' : 'is-off'}`}>
                                                    {masterOn ? (on ? '开着' : '关着') : '总关'}
                                                </span>
                                            </span>
                                            <span className={`cgm-card-art cgm-card-art--${plugin.face}`}>
                                                <ArtTile plugin={plugin} size="card" />
                                            </span>
                                            <span className="cgm-card-footer">
                                                <small>{plugin.settingCardBlurb}</small>
                                                <em>{SERIES[plugin.id] || 'CHAT · GAME'}</em>
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default ChatGameMenu;
