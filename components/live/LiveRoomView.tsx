/**
 * Char 直播间核心视图（LiveRoomView）
 * 支持：
 * 1. 上下分屏取景框模式 ↔ 全屏竖屏沉浸模式 一键切换
 * 2. 自动逐拍播放（每隔约 4 秒推进一拍并自动触发 TTS） ↔ 手动推进
 * 3. 外语原声 + 中文野生同传双轨字幕 & 弹幕三态翻译切换
 * 4. 单拍原位编辑 / 从当前拍重演 / 整段重 Roll
 * 5. 阶段滚动总结卡（防爆 Token）：支持编辑、重总结、解散还原
 * 6. 内嵌「偷偷发微信捣乱」实时抽屉（与主聊天实时互通）
 */
import React, { useState } from 'react';
import type { Message } from '../../types';
import {
  StreamerChannelProfile,
  LiveStreamSession,
  LiveBeat,
  LiveDanmakuItem,
  LiveRollingSummary,
  ViewerPersona,
  DanmakuTranslateMode,
  SC_TIER_OPTIONS,
} from '../../utils/liveStreamTypes';

export const LiveRoomView: React.FC<{
  session: LiveStreamSession;
  channel: StreamerChannelProfile;
  charName: string;
  activePersona: ViewerPersona;
  currentChunkIdx: number;
  currentBeatIdx: number;
  autoPlayBeats: boolean;
  translateMode: DanmakuTranslateMode;
  busy: boolean;
  foldingBusy: boolean;
  recentWechatMsgs: Message[];
  onBack: () => void;
  onToggleAutoPlay: () => void;
  onChangeTranslateMode: (m: DanmakuTranslateMode) => void;
  onStepNextBeatOrGenerate: () => void;
  onSelectBeatPosition: (cIdx: number, bIdx: number) => void;
  onRerollCurrentChunk: () => void;
  onSaveEditedBeat: (cIdx: number, bIdx: number, nextBeat: LiveBeat) => void;
  onSendDanmakuOrSc: (text: string, scTier?: typeof SC_TIER_OPTIONS[number]) => void;
  onSendSneakyWechat: (text: string) => Promise<void>;
  onTriggerRollingFold: () => void;
  onEditRollingSummary: (sumId: string, newContent: string) => void;
  onRegenerateRollingSummary: (sum: LiveRollingSummary) => void;
  onDissolveRollingSummary: (sum: LiveRollingSummary) => void;
  onOpenPersonaModal: () => void;
  onOpenChannelModal: () => void;
  onOpenEndSummaryModal: () => void;
  onShareClipToChat: (beat: LiveBeat) => void;
  onPlayTts: (text: string, emotion?: string) => void;
}> = ({
  session,
  channel,
  charName,
  activePersona,
  currentChunkIdx,
  currentBeatIdx,
  autoPlayBeats,
  translateMode,
  busy,
  foldingBusy,
  recentWechatMsgs,
  onBack,
  onToggleAutoPlay,
  onChangeTranslateMode,
  onStepNextBeatOrGenerate,
  onSelectBeatPosition,
  onRerollCurrentChunk,
  onSaveEditedBeat,
  onSendDanmakuOrSc,
  onSendSneakyWechat,
  onTriggerRollingFold,
  onEditRollingSummary,
  onRegenerateRollingSummary,
  onDissolveRollingSummary,
  onOpenPersonaModal,
  onOpenChannelModal,
  onOpenEndSummaryModal,
  onShareClipToChat,
  onPlayTts,
}) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'danmaku' | 'timeline' | 'wechat'>('danmaku');
  const [danmakuInput, setDanmakuInput] = useState('');
  const [selectedScIdx, setSelectedScIdx] = useState<number | null>(null);
  const [wechatInput, setWechatInput] = useState('');
  const [wechatSending, setWechatSending] = useState(false);

  // 编辑当前拍状态
  const [isEditingBeat, setIsEditingBeat] = useState(false);
  const [editScreen, setEditScreen] = useState('');
  const [editSpeech, setEditSpeech] = useState('');
  const [editTrans, setEditTrans] = useState('');

  // 编辑阶段滚动摘要状态
  const [editingSumId, setEditingSumId] = useState<string | null>(null);
  const [editingSumText, setEditingSumText] = useState('');

  const curChunk = session.chunks[currentChunkIdx] || session.chunks[session.chunks.length - 1];
  const curBeat = curChunk?.beats[currentBeatIdx] || curChunk?.beats[0];

  // 收集本场到当前位置的所有可见弹幕与 SC
  const visibleDanmaku: LiveDanmakuItem[] = [];
  session.chunks.slice(0, currentChunkIdx + 1).forEach((ch, ci) => {
    const maxB = ci === currentChunkIdx ? currentBeatIdx + 1 : ch.beats.length;
    ch.beats.slice(0, maxB).forEach(b => {
      visibleDanmaku.push(...(b.danmaku || []));
    });
  });
  // 加上已发在等待队列里的弹幕
  visibleDanmaku.push(...(session.pendingDanmakuQueue || []));

  const scItems = visibleDanmaku.filter(d => d.scAmount && d.scAmount > 0);

  const startEditBeat = () => {
    if (!curBeat) return;
    setEditScreen(curBeat.screen);
    setEditSpeech(curBeat.speechOriginal);
    setEditTrans(curBeat.speechTranslated || '');
    setIsEditingBeat(true);
  };

  const commitEditBeat = () => {
    if (!curBeat) return;
    onSaveEditedBeat(currentChunkIdx, currentBeatIdx, {
      ...curBeat,
      screen: editScreen.trim(),
      speechOriginal: editSpeech.trim(),
      speechTranslated: editTrans.trim() || undefined,
    });
    setIsEditingBeat(false);
  };

  const handleSendBottomDanmaku = () => {
    if (!danmakuInput.trim()) return;
    const scTier = selectedScIdx !== null ? SC_TIER_OPTIONS[selectedScIdx] : undefined;
    onSendDanmakuOrSc(danmakuInput.trim(), scTier);
    setDanmakuInput('');
    setSelectedScIdx(null);
  };

  const handleSendWechat = async () => {
    if (!wechatInput.trim() || wechatSending) return;
    const t = wechatInput.trim();
    setWechatInput('');
    setWechatSending(true);
    try {
      await onSendSneakyWechat(t);
    } finally {
      setWechatSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/95 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300">←</button>
          <div onClick={onOpenChannelModal} className="min-w-0 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs font-bold truncate">{channel.channelName}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                {channel.identityMode === 'secret_alt' ? '匿名马甲' : channel.identityMode === 'vtuber' ? '皮套人' : '本尊'}
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 truncate">
              在线 {session.viewerCount} · 《{session.title}》
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {channel.voiceConfig?.language && (
            <button
              onClick={() =>
                onChangeTranslateMode(
                  translateMode === 'bilingual' ? 'zh_only' : translateMode === 'zh_only' ? 'original_only' : 'bilingual',
                )
              }
              className="text-[10px] px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30"
            >
              {translateMode === 'bilingual' ? '同传:双语' : translateMode === 'zh_only' ? '同传:仅中文' : '同传:仅原文'}
            </button>
          )}
          <button
            onClick={() => setFullscreen(f => !f)}
            className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-200"
          >
            {fullscreen ? '退出全屏' : '全屏沉浸'}
          </button>
          <button
            onClick={onOpenEndSummaryModal}
            className="text-[10px] px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold"
          >
            下播总结
          </button>
        </div>
      </div>

      {/* 镜头取景框（分屏时占上半屏，全屏时占满） */}
      <div
        className={`relative flex flex-col justify-between p-3.5 border-b border-zinc-800 transition-all ${
          fullscreen ? 'flex-1' : 'min-h-[215px]'
        }`}
        style={{ background: channel.coverGradient }}
      >
        {/* 顶部飘屏弹幕与快捷操作 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="px-2 py-0.5 rounded bg-black/50 text-white/90 font-mono">
              第 {(curChunk?.index ?? 0) + 1} 段 · 拍 {(curBeat?.index ?? 0) + 1}/{curChunk?.beats.length || 1}
            </span>
            {curBeat && (
              <div className="flex items-center gap-1">
                {curBeat.speechOriginal && (
                  <button
                    onClick={() => onPlayTts(curBeat.speechOriginal, curBeat.emotion)}
                    className="px-2 py-0.5 rounded bg-black/55 text-emerald-300"
                  >
                    🔊 播语音
                  </button>
                )}
                <button onClick={startEditBeat} className="px-2 py-0.5 rounded bg-black/55 text-zinc-200">
                  ✏️ 编辑
                </button>
                <button
                  onClick={() => onShareClipToChat(curBeat)}
                  className="px-2 py-0.5 rounded bg-black/55 text-rose-300"
                >
                  转发切片
                </button>
              </div>
            )}
          </div>

          {/* 飘屏弹幕 */}
          {curBeat && (
            <div className="flex flex-wrap gap-1.5 max-h-14 overflow-hidden">
              {(curBeat.danmaku || []).slice(0, 5).map(dm => (
                <span
                  key={dm.id}
                  className={`text-[11px] px-2 py-0.5 rounded-full backdrop-blur-xs ${
                    dm.scAmount
                      ? 'bg-amber-500/85 text-black font-bold'
                      : dm.isUserMain || dm.isUserAlt
                        ? 'bg-rose-600/80 text-white font-semibold'
                        : 'bg-black/45 text-white/90'
                  }`}
                >
                  {translateMode === 'zh_only' && dm.translation ? dm.translation : dm.text}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 中央分镜画面描写 + 底部双语同传字幕条 */}
        {curBeat ? (
          isEditingBeat ? (
            <div className="bg-black/75 p-3 rounded-2xl space-y-2 text-xs my-2">
              <textarea
                rows={2}
                value={editScreen}
                onChange={e => setEditScreen(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                placeholder="镜头动作与画面细节"
              />
              <input
                value={editSpeech}
                onChange={e => setEditSpeech(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-white"
                placeholder="主播原声台词（留空代表专注不说话）"
              />
              <input
                value={editTrans}
                onChange={e => setEditTrans(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-amber-200"
                placeholder="中文野生同传字幕（可选）"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsEditingBeat(false)} className="px-3 py-1 rounded bg-zinc-800">取消</button>
                <button onClick={commitEditBeat} className="px-3 py-1 rounded bg-rose-600 text-white font-bold">保存修改</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              <div className="bg-black/45 backdrop-blur-xs rounded-2xl p-3 text-xs text-zinc-100 leading-relaxed border border-white/10">
                <span className="text-rose-400 font-bold mr-1.5">[镜头]</span>
                {curBeat.screen}
              </div>

              <div className="bg-black/75 rounded-2xl px-3.5 py-2.5 border-l-3 border-rose-500">
                {curBeat.speechOriginal ? (
                  <>
                    <div className="text-xs font-semibold text-white leading-snug">
                      {charName}：「{curBeat.speechOriginal}」
                    </div>
                    {curBeat.speechTranslated && translateMode !== 'original_only' && (
                      <div className="text-[11px] text-amber-300 mt-1">
                        【野生同传】{curBeat.speechTranslated}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-zinc-400 italic">（本拍主播专注动作/留白，未开口说话）</div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-8 text-xs text-white/80">
            {busy ? '正在生成直播切片演出…' : '点击下方「推进下一拍 / 生成下一段」开始直播'}
          </div>
        )}
      </div>

      {/* 中腰播放与重 Roll 控制条 */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleAutoPlay}
            className={`px-2.5 py-1 rounded-lg font-semibold ${
              autoPlayBeats ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {autoPlayBeats ? '⏸ 自动播中' : '▶ 自动逐拍'}
          </button>
          <button
            disabled={busy}
            onClick={onStepNextBeatOrGenerate}
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold disabled:opacity-40"
          >
            {busy
              ? '生成中…'
              : curChunk && currentBeatIdx < curChunk.beats.length - 1
                ? '下一拍 ⏭'
                : '✨ 生成下一段切片'}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            disabled={busy || session.chunks.length === 0}
            onClick={onRerollCurrentChunk}
            className="px-2 py-1 rounded-lg bg-zinc-800 text-amber-300 disabled:opacity-40"
            title="重Roll当前整段切片"
          >
            🔄 重演本段
          </button>
          <button
            disabled={foldingBusy || session.chunks.filter(c => !c.folded).length < 2}
            onClick={onTriggerRollingFold}
            className="px-2 py-1 rounded-lg bg-zinc-800 text-violet-300 disabled:opacity-40"
            title="用辅助模型将前几段切片折叠为阶段总结，防爆Token"
          >
            {foldingBusy ? '折叠中…' : '📝 阶段总结'}
          </button>
        </div>
      </div>

      {/* 下半屏三合一工作台（非全屏时展示） */}
      {!fullscreen && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* 工作台 Tab 切换 */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/60 text-xs shrink-0">
            <button
              onClick={() => setActiveBottomTab('danmaku')}
              className={`flex-1 py-2 font-bold border-b-2 ${
                activeBottomTab === 'danmaku' ? 'border-rose-500 text-white' : 'border-transparent text-zinc-400'
              }`}
            >
              公屏弹幕 & SC ({visibleDanmaku.length})
            </button>
            <button
              onClick={() => setActiveBottomTab('timeline')}
              className={`flex-1 py-2 font-bold border-b-2 ${
                activeBottomTab === 'timeline' ? 'border-rose-500 text-white' : 'border-transparent text-zinc-400'
              }`}
            >
              切片与阶段总结 ({session.rollingSummaries.length})
            </button>
            <button
              onClick={() => setActiveBottomTab('wechat')}
              className={`flex-1 py-2 font-bold border-b-2 ${
                activeBottomTab === 'wechat' ? 'border-emerald-500 text-emerald-300' : 'border-transparent text-zinc-400'
              }`}
            >
              💬 偷偷发微信捣乱
            </button>
          </div>

          {/* Tab 内容区 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeBottomTab === 'danmaku' && (
              <>
                {/* 顶部常驻 SC 醒目留言墙 */}
                {scItems.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1.5">
                    {scItems.map(sc => (
                      <div
                        key={sc.id}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600/90 to-amber-600/90 text-white text-xs shrink-0 max-w-[240px]"
                      >
                        <div className="font-bold flex items-center justify-between gap-2 text-[11px]">
                          <span>{sc.senderName}</span>
                          <span>¥{sc.scAmount} {sc.giftName || 'SC'}</span>
                        </div>
                        <div className="truncate mt-0.5">{sc.text}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 滚屏弹幕列表 */}
                {visibleDanmaku.slice(-40).map(d => (
                  <div key={d.id} className="text-xs leading-relaxed flex items-baseline gap-1.5">
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded shrink-0 ${
                        d.isUserMain
                          ? 'bg-emerald-600 text-white font-bold'
                          : d.isUserAlt
                            ? 'bg-violet-600 text-white font-bold'
                            : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {d.isUserMain ? '我的大号' : d.isUserAlt ? '我的马甲' : `Lv.${d.fanLevel || 6}`}
                    </span>
                    <span className="text-zinc-400 font-semibold shrink-0">{d.senderName}：</span>
                    <span className={d.scAmount ? 'text-amber-300 font-bold' : 'text-zinc-100'}>
                      {translateMode === 'zh_only' && d.translation ? d.translation : d.text}
                      {translateMode === 'bilingual' && d.translation ? (
                        <span className="text-zinc-400 text-[11px] ml-1">（译：{d.translation}）</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </>
            )}

            {activeBottomTab === 'timeline' && (
              <div className="space-y-3">
                {/* 阶段滚动摘要卡（支持编辑 / 重总结 / 解散） */}
                {session.rollingSummaries.map((sum, idx) => (
                  <div key={sum.id} className="p-3 rounded-2xl bg-violet-950/35 border border-violet-500/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-violet-300">
                        📑 阶段滚动摘要 #{idx + 1}（已折叠第 {sum.fromChunkIndex + 1}~{sum.toChunkIndex + 1} 段）
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <button
                          onClick={() => {
                            setEditingSumId(sum.id);
                            setEditingSumText(sum.content);
                          }}
                          className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200"
                        >
                          ✏️ 编辑
                        </button>
                        <button
                          disabled={foldingBusy}
                          onClick={() => onRegenerateRollingSummary(sum)}
                          className="px-2 py-0.5 rounded bg-zinc-800 text-amber-300"
                        >
                          🔄 重总结
                        </button>
                        <button
                          onClick={() => onDissolveRollingSummary(sum)}
                          className="px-2 py-0.5 rounded bg-zinc-800 text-rose-300"
                        >
                          📂 解散
                        </button>
                      </div>
                    </div>

                    {editingSumId === sum.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={4}
                          value={editingSumText}
                          onChange={e => setEditingSumText(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2 text-white"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingSumId(null)} className="px-3 py-1 rounded bg-zinc-800">取消</button>
                          <button
                            onClick={() => {
                              onEditRollingSummary(sum.id, editingSumText.trim());
                              setEditingSumId(null);
                            }}
                            className="px-3 py-1 rounded bg-violet-600 text-white font-bold"
                          >
                            保存摘要
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-zinc-200 whitespace-pre-wrap leading-relaxed">{sum.content}</div>
                    )}
                  </div>
                ))}

                {/* 历史切片与节拍跳转 */}
                {session.chunks.map((ch, ci) => (
                  <div
                    key={ch.id}
                    className={`p-2.5 rounded-xl border text-xs ${
                      ch.folded ? 'bg-zinc-900/40 border-zinc-800/60 opacity-65' : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-zinc-300">
                        第 {ci + 1} 段切片 {ch.folded ? '（已折叠进阶段摘要，不占模型Token）' : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ch.beats.map((b, bi) => (
                        <button
                          key={b.id}
                          onClick={() => onSelectBeatPosition(ci, bi)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] ${
                            ci === currentChunkIdx && bi === currentBeatIdx
                              ? 'bg-rose-600 text-white font-bold'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          拍 {bi + 1}: {(b.speechOriginal || b.screen).slice(0, 10)}…
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeBottomTab === 'wechat' && (
              <div className="space-y-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-emerald-950/35 border border-emerald-500/30 text-emerald-200 text-[11px]">
                  💡 这里发的微信消息会真实写入你们的微信私聊（Message App），且正在直播的 {charName} 会在桌下偷偷回你微信，并在下一段直播镜头前露出微表情反差！
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {recentWechatMsgs.slice(-6).map(m => (
                    <div
                      key={m.id}
                      className={`p-2 rounded-xl max-w-[85%] ${
                        m.role === 'user' ? 'ml-auto bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-100'
                      }`}
                    >
                      <div className="text-[10px] opacity-75 mb-0.5">{m.role === 'user' ? '我 (微信私聊)' : `${charName} (台下偷偷回微信)`}</div>
                      <div>{m.content}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    value={wechatInput}
                    onChange={e => setWechatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void handleSendWechat()}
                    placeholder={`在微信私聊偷偷逗正在直播的 ${charName}…`}
                    className="flex-1 bg-zinc-900 border border-emerald-600/50 rounded-xl px-3 py-1.5 text-white"
                  />
                  <button
                    disabled={wechatSending}
                    onClick={() => void handleSendWechat()}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-40"
                  >
                    {wechatSending ? '发送中…' : '发微信'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 底部弹幕与 SC 打赏栏 */}
      <div className="p-2.5 bg-zinc-900 border-t border-zinc-800 space-y-2 shrink-0">
        {/* SC 档位快捷选择条 */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
          <span className="text-zinc-400 shrink-0">SC打赏:</span>
          {SC_TIER_OPTIONS.map((tier, idx) => (
            <button
              key={tier.amount}
              type="button"
              onClick={() => setSelectedScIdx(prev => (prev === idx ? null : idx))}
              className={`px-2 py-0.5 rounded-lg border shrink-0 transition ${
                selectedScIdx === idx
                  ? `${tier.bgClass} ${tier.borderClass} text-white font-bold`
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}
            >
              ¥{tier.amount} {tier.giftName}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenPersonaModal}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 ${
              activePersona.isMain ? 'bg-emerald-600 text-white' : 'bg-violet-600 text-white'
            }`}
            title="点击切换大号或匿名小号马甲"
          >
            {activePersona.isMain ? '大号' : '马甲'}: {activePersona.name.slice(0, 4)}
          </button>

          <input
            value={danmakuInput}
            onChange={e => setDanmakuInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendBottomDanmaku()}
            placeholder={
              selectedScIdx !== null
                ? `以「${activePersona.name}」发送 ¥${SC_TIER_OPTIONS[selectedScIdx].amount} 醒目留言 SC…`
                : `以「${activePersona.name}」发弹幕（${activePersona.isMain ? 'TA认得出你' : '物理匿名马甲'}）…`
            }
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
          />

          <button
            type="button"
            onClick={handleSendBottomDanmaku}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0"
          >
            {selectedScIdx !== null ? '投喂SC' : '发弹幕'}
          </button>
        </div>
      </div>
    </div>
  );
};
