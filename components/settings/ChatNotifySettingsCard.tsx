import React, { useCallback, useEffect, useState } from 'react';
import { runNotifySelfCheck } from '../../utils/chatNotify';
import { isChatNotifyEnabled, setChatNotifyEnabled, subscribeChatNotifyEnabled } from '../../utils/chatNotifySettings';

/**
 * 设置里的「私聊回复通知」卡片。
 *
 * 两块：一个开关（要不要弹）、一个自检按钮（哪一环没通）。
 * 自检放在设置里而不是只藏在调试台里——调试台要先连点版本号才出得来，
 * 手机上看不到控制台的人，没别的地方能问出「到底是权限、通道，还是我关掉了」。
 */
const ChatNotifySettingsCard: React.FC = () => {
    const [enabled, setEnabled] = useState(() => isChatNotifyEnabled());
    const [running, setRunning] = useState(false);
    const [lines, setLines] = useState<string[] | null>(null);

    // 别的标签页 / 别处改了开关，这里跟着变，别让界面和实际状态对不上。
    useEffect(() => subscribeChatNotifyEnabled(setEnabled), []);

    const toggle = useCallback(() => {
        setEnabled(setChatNotifyEnabled(!enabled));
    }, [enabled]);

    const runCheck = useCallback(async () => {
        if (running) return;
        setRunning(true);
        setLines(null);
        try {
            setLines(await runNotifySelfCheck());
        } catch (error) {
            setLines([`自检本身出错了：${error instanceof Error ? error.message : String(error)}`]);
        } finally {
            setRunning(false);
        }
    }, [running]);

    return (
        <section className="bg-[#fffefe] rounded-3xl p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-sky-100/60 rounded-xl text-sky-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                        </svg>
                    </div>
                    <h2 className="text-sm font-semibold text-slate-600 tracking-wider">私聊回复通知</h2>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${enabled ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
                    {enabled ? '已打开' : '已关闭'}
                </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-3">
                角色回消息的时候，手机锁屏着、或者你退到桌面了，也弹一条系统通知，跟微信一样。点通知能直接回到那个角色的聊天。
                只管私聊——群聊、见面、打电话都不弹；表情、图片、语音条也不弹。
            </p>

            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                <div>
                    <p className="text-[11px] text-slate-600 font-medium">弹通知</p>
                    <p className="text-[10px] text-slate-400">关掉之后只在聊天里显示，不再打扰你</p>
                </div>
                <button
                    type="button"
                    onClick={toggle}
                    aria-pressed={enabled}
                    className={`w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-sky-500' : 'bg-slate-300'}`}
                >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
            </div>

            <button
                type="button"
                onClick={runCheck}
                disabled={running}
                className="mt-3 w-full rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
            >
                <span className="block text-xs font-semibold text-sky-700">{running ? '正在检查…' : '测一下现在通不通'}</span>
                <span className="mt-1 block text-[11px] text-slate-500">
                    会真的发一条测试通知，然后把权限、后台通道、上一次回复为什么没弹，逐条列出来。
                </span>
            </button>

            {lines && (
                <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 px-3.5 py-3 text-[11px] leading-relaxed text-slate-600 space-y-1.5">
                    {lines.map((line, index) => (
                        <p key={index}>{line}</p>
                    ))}
                </div>
            )}
        </section>
    );
};

export default ChatNotifySettingsCard;
