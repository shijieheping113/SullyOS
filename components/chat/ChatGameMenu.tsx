import React, { useEffect, useState } from 'react';
import Modal from '../os/Modal';
import ChatGamesSettings from '../settings/ChatGamesSettings';
import type { ChatGameMenuItem } from '../../utils/chatGames/registry';
import { DiceGlyph, HandGlyph } from './ChatGameCard';

/** 加号里的小游戏。样式跟转账、日程用的是同一个弹出层。开关只放在这里。 */
const ChatGameMenu: React.FC<{
    open: boolean;
    games: ChatGameMenuItem[];
    onClose: () => void;
    onPlay: (gameId: string, value?: string) => void;
}> = ({ open, games, onClose, onPlay }) => {
    const [page, setPage] = useState<'list' | string>('list');
    useEffect(() => {
        if (open) setPage('list');
    }, [open]);
    const picking = page === 'list' ? null : games.find((game) => game.id === page) || null;
    useEffect(() => {
        if (page !== 'list' && !games.some((game) => game.id === page)) setPage('list');
    }, [games, page]);
    const title = picking ? picking.name : '小游戏';
    return (
        <Modal
            isOpen={open}
            title={title}
            onClose={onClose}
            footer={picking ? (
                <button type="button" onClick={() => setPage('list')} className="w-full min-h-[44px] py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl active:scale-95 transition-transform">
                    返回
                </button>
            ) : undefined}
        >
            {picking ? (
                <div className="grid grid-cols-3 gap-3">
                    {(picking.choices || []).map((choice) => (
                        <button
                            key={choice.value}
                            type="button"
                            onClick={() => onPlay(picking.id, choice.value)}
                            className="min-h-[72px] rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
                        >
                            <HandGlyph name={choice.value} size={28} />
                            <span className="text-[13px] font-semibold text-slate-700">{choice.label}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div>
                    {games.length === 0 ? (
                        <p className="text-sm text-slate-500 leading-relaxed">现在都关着。打开下面的开关就能玩。</p>
                    ) : (
                        <div className="space-y-2">
                            {games.map((game) => (
                                <button
                                    key={game.id}
                                    type="button"
                                    onClick={() => {
                                        if (game.choices?.length) setPage(game.id);
                                        else onPlay(game.id);
                                    }}
                                    className="w-full min-h-[44px] flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-left active:scale-[0.99] transition-transform"
                                >
                                    <span className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                                        {game.choices?.length ? <HandGlyph name="rock" size={22} /> : <DiceGlyph size={22} />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[15px] font-semibold text-slate-800">{game.name}</span>
                                        <span className="block text-[12px] text-slate-500 mt-0.5">{game.blurb}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="mt-5 pt-4 border-t border-slate-100">
                        <ChatGamesSettings />
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default ChatGameMenu;
