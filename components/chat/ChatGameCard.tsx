import React from 'react';
import type { Message } from '../../types';
import { CHAT_GAME_INK, DIE_PIPS, HAND_PATH } from './chatGameArt';
import { getChatGamePlugin } from '../../utils/chatGames/registry';
import { chatGameIsSealed, plainChatGameClause, readChatGame } from '../../utils/chatGames/text';
import type { ChatGameRecord } from '../../utils/chatGames/types';
import './chatGameCard.css';

export function HandGlyph({ name, size = 28 }: { name: string; size?: number }) {
    const hand = HAND_PATH[name];
    if (!hand) return null;
    return (
        <svg height={size} viewBox={hand.viewBox} fill={CHAT_GAME_INK} role="img" aria-label={hand.label}>
            <path d={hand.d} />
        </svg>
    );
}

export function DiceGlyph({ size = 24 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" stroke={CHAT_GAME_INK} strokeWidth="1.8" />
            <circle cx="8" cy="8" r="1.5" fill={CHAT_GAME_INK} />
            <circle cx="16" cy="8" r="1.5" fill={CHAT_GAME_INK} />
            <circle cx="12" cy="12" r="1.5" fill={CHAT_GAME_INK} />
            <circle cx="8" cy="16" r="1.5" fill={CHAT_GAME_INK} />
            <circle cx="16" cy="16" r="1.5" fill={CHAT_GAME_INK} />
        </svg>
    );
}

function Die({ value }: { value: number }) {
    const pips = DIE_PIPS[value] || DIE_PIPS[1];
    return (
        <div className="sully-die-flat roll" role="img" aria-label={`${value} 点`}>
            {pips.map((on, index) => <b key={index} className={on ? '' : 'off'} />)}
        </div>
    );
}

function Face({ record, value }: { record: ChatGameRecord; value: number | string }) {
    const plugin = getChatGamePlugin(record.game);
    if (!plugin) return <div className="sully-game-face"><span>{String(value)}</span></div>;
    if (plugin.face === 'die') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 6) return <div className="sully-game-face"><span>?</span></div>;
        return <Die value={n} />;
    }
    if (!HAND_PATH[String(value)]) return <div className="sully-game-face"><span>?</span></div>;
    return <div className="sully-game-face"><HandGlyph name={String(value)} size={36} /></div>;
}

function Side({ record, value, who }: { record: ChatGameRecord; value: number | string; who: string }) {
    const plugin = getChatGamePlugin(record.game);
    const spoken = plugin ? plugin.clause('', value) : null;
    const detail = spoken ? spoken.replace(/^出了|^掷出了 /, '') : '';
    return (
        <div className="sully-game-side">
            <Face record={record} value={value} />
            <div className="n">{detail ? `${who} · ${detail}` : who}</div>
        </div>
    );
}

export function ChatGameCard({ message, charName, revealed = false, duelUser, duelAi }: {
    message: Message;
    charName: string;
    revealed?: boolean;
    duelUser?: number | string;
    duelAi?: number | string;
}) {
    const record = readChatGame(message.metadata);
    if (!record) return null;
    const plugin = getChatGamePlugin(record.game);
    const who = record.by === 'user' ? '你' : (charName || '对方');
    const duel = duelUser != null && duelAi != null;
    const sealed = !duel && !revealed && chatGameIsSealed(record);
    const clause = plainChatGameClause(record, charName);
    const when = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return (
        <div className="sully-game-card" data-chat-game={record.game} data-chat-game-by={record.by} data-chat-game-duel={duel ? '1' : undefined}>
            <div className="hd">
                <b>{duel ? (plugin?.name || '小游戏') : who}</b>
                {duel ? null : <span>{plugin?.name || '小游戏'}</span>}
                <span className="time">{when}</span>
            </div>
            {sealed ? (
                <>
                    <div className="sully-game-back" role="img" aria-label={`${plugin?.name || '小游戏'}，还盖着，等你出`} />
                    <p className="sully-game-wait">{plugin?.name || '小游戏'} · 等你出</p>
                </>
            ) : duel && duelUser != null && duelAi != null ? (
                <div className="sully-game-plays">
                    <Side record={record} value={duelUser} who="你" />
                    <Side record={record} value={duelAi} who={charName || '对方'} />
                </div>
            ) : (
                <div className="sully-game-plays">
                    <Side record={record} value={record.value} who={record.by === 'user' ? '你' : (charName || '对方')} />
                    {record.by === 'user' && record.withAi != null && (
                        <Side record={record} value={record.withAi} who={charName || '对方'} />
                    )}
                </div>
            )}
            {!sealed && clause ? <span className="sr-only">{clause}</span> : null}
        </div>
    );
}
