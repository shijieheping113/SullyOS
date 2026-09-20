import React from 'react';

type Props = {
    charName?: string;
    onOpen: () => void;
};

/** 列表底部入口：点一次即开；样式贴近时间戳/系统灰字，不抢聊天视线 */
const ChatInnerStatePeekEntry: React.FC<Props> = ({ onOpen }) => (
    <div className="flex justify-center px-4 pt-2 pb-5">
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onOpen();
            }}
            className="text-[10px] leading-relaxed text-slate-400/55 font-normal tracking-wide
                active:text-slate-500/70 transition-colors"
        >
            有些话没说出口 · 轻触
        </button>
    </div>
);

export default ChatInnerStatePeekEntry;
