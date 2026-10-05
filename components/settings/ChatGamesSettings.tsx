import React, { useState } from 'react';
import { listChatGamePlugins } from '../../utils/chatGames/registry';
import {
    readChatGameSettings,
    writeChatGameEnabled,
    writeChatGameMaster,
} from '../../utils/chatGames/settings';

function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onClick}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            style={{ background: on ? '#4EA6C8' : '#D3D1C7' }}
        >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
    );
}

/** 设置里的小游戏开关。总开关和每一款分开记，关了也能再打开。 */
const ChatGamesSettings: React.FC = () => {
    const [settings, setSettings] = useState(() => readChatGameSettings());
    const plugins = listChatGamePlugins();
    const refresh = () => setSettings(readChatGameSettings());
    return (
        <div>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
                聊天里可以掷骰子、猜拳。点数和手势由手机摇，角色只负责接话。谁赢谁输不记在系统里。开关只留在这台手机上，不进备份。
            </p>
            <div className="flex items-center gap-3 py-3 border-b border-slate-100">
                <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-700">总开关</div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 leading-relaxed">关掉后，这里点不了，角色也不再知道有这些玩法。已经掷出的还在。加号里的入口还在，方便再打开。</div>
                </div>
                <Switch
                    on={settings.master}
                    label="小游戏总开关"
                    onClick={() => { writeChatGameMaster(!settings.master); refresh(); }}
                />
            </div>
            {plugins.map((plugin) => {
                const savedOn = settings.games[plugin.id] !== false;
                return (
                    <div key={plugin.id} className={`flex items-center gap-3 py-3 border-b border-slate-100 last:border-b-0 ${settings.master ? '' : 'opacity-45'}`}>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-slate-700">{plugin.name}</div>
                            <div className="text-[10.5px] text-slate-400 mt-0.5">{plugin.blurb}</div>
                            <div className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">{plugin.settingRule}</div>
                        </div>
                        <Switch
                            on={savedOn}
                            label={plugin.name}
                            onClick={() => { writeChatGameEnabled(plugin.id, !savedOn); refresh(); }}
                        />
                    </div>
                );
            })}
        </div>
    );
};

export default ChatGamesSettings;
