/**
 * 直播与视频平台（OnAir / 电波）弹窗组件集：
 * 1. 频道新建/编辑弹窗（支持本尊号/匿名小号/皮套人、TTS语种、音色覆盖、野生同传开关）
 * 2. 大小号马甲管理弹窗（支持本尊大号 + 多个物理隔离真名的匿名马甲）
 * 3. 下播全貌总结预览弹窗（支持辅助模型重总结、原位手动编辑、三选一落入主聊天方式）
 */
import React, { useState, useEffect } from 'react';
import { VOICE_LANGUAGE_OPTIONS } from '../../utils/voiceLanguage';
import {
  StreamerChannelProfile,
  ChannelIdentityMode,
  ViewerPersona,
  LiveArchiveDropMode,
  STREAM_PRESET_TEMPLATES,
} from '../../utils/liveStreamTypes';

// ==================== 1. 频道新建 / 编辑弹窗 ====================

export const ChannelEditorModal: React.FC<{
  isOpen: boolean;
  charId: string;
  charName: string;
  charAvatar?: string;
  initialChannel?: StreamerChannelProfile | null;
  onClose: () => void;
  onSave: (channel: StreamerChannelProfile) => void;
  onDelete?: (channelId: string) => void;
}> = ({ isOpen, charId, charName, charAvatar, initialChannel, onClose, onSave, onDelete }) => {
  const [channelName, setChannelName] = useState('');
  const [handle, setHandle] = useState('');
  const [identityMode, setIdentityMode] = useState<ChannelIdentityMode>('public_main');
  const [fanBadgeName, setFanBadgeName] = useState('');
  const [followerCount, setFollowerCount] = useState(12800);
  const [bio, setBio] = useState('');
  const [personaPrompt, setPersonaPrompt] = useState('');
  const [language, setLanguage] = useState('');
  const [translationEnabled, setTranslationEnabled] = useState(true);
  const [autoPlayTts, setAutoPlayTts] = useState(true);
  const [overrideVoiceId, setOverrideVoiceId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (initialChannel) {
      setChannelName(initialChannel.channelName);
      setHandle(initialChannel.handle);
      setIdentityMode(initialChannel.identityMode);
      setFanBadgeName(initialChannel.fanBadgeName);
      setFollowerCount(initialChannel.followerCount);
      setBio(initialChannel.bio);
      setPersonaPrompt(initialChannel.personaPrompt);
      setLanguage(initialChannel.voiceConfig?.language || '');
      setTranslationEnabled(initialChannel.voiceConfig?.translationEnabled ?? true);
      setAutoPlayTts(initialChannel.voiceConfig?.autoPlayTts ?? true);
      setOverrideVoiceId(initialChannel.voiceConfig?.overrideVoiceId || '');
    } else {
      setChannelName(`${charName}的深夜电波`);
      setHandle(`@${charName.toLowerCase().replace(/\s+/g, '_')}_alt`);
      setIdentityMode('secret_alt');
      setFanBadgeName('夜猫');
      setFollowerCount(3600);
      setBio('不露脸随缘开播，别扒马甲。');
      setPersonaPrompt('表面装作高冷神秘的不露脸技术/电台博主，遇到损友弹幕容易破功嘴硬。');
      setLanguage('');
      setTranslationEnabled(true);
      setAutoPlayTts(true);
      setOverrideVoiceId('');
    }
  }, [isOpen, initialChannel, charName]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!channelName.trim()) return;
    const saved: StreamerChannelProfile = {
      id: initialChannel?.id || `ch_${charId}_${Date.now()}`,
      charId,
      channelName: channelName.trim(),
      handle: handle.trim() || `@channel_${Date.now().toString().slice(-4)}`,
      avatar: initialChannel?.avatar || charAvatar,
      coverGradient: initialChannel?.coverGradient || STREAM_PRESET_TEMPLATES[Math.floor(Math.random() * STREAM_PRESET_TEMPLATES.length)].coverGradient,
      bio: bio.trim() || `${charName}的直播频道`,
      identityMode,
      fanBadgeName: fanBadgeName.trim() || '铁粉',
      followerCount: Number(followerCount) || 1000,
      personaPrompt: personaPrompt.trim() || '自然松弛的真实直播状态。',
      voiceConfig: {
        language,
        translationEnabled: !!language ? translationEnabled : false,
        autoPlayTts,
        overrideVoiceId: overrideVoiceId.trim() || undefined,
      },
      createdAt: initialChannel?.createdAt || Date.now(),
    };
    onSave(saved);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 text-zinc-100 max-h-[88vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-base font-bold">{initialChannel ? '编辑频道与语音设定' : `为 ${charName} 新建频道`}</h3>
          <button onClick={onClose} className="text-xs text-zinc-400 px-2 py-1 rounded-lg bg-zinc-800">关闭</button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-zinc-400 mb-1">频道身份性质（支持一人多号）</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'public_main', label: '公开本尊号', desc: '熟人皆知' },
                { id: 'secret_alt', label: '匿名小号/马甲', desc: '不露脸防掉马' },
                { id: 'vtuber', label: '虚拟皮套人', desc: '中之人反差' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setIdentityMode(opt.id)}
                  className={`p-2 rounded-xl border text-left transition ${
                    identityMode === opt.id
                      ? 'border-rose-500 bg-rose-500/15 text-white'
                      : 'border-zinc-800 bg-zinc-800/60 text-zinc-400'
                  }`}
                >
                  <div className="font-bold">{opt.label}</div>
                  <div className="text-[10px] opacity-75">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 mb-1">频道名称</label>
              <input
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
                placeholder="例如：夜猫电台"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">粉丝牌名称（≤4字）</label>
              <input
                value={fanBadgeName}
                onChange={e => setFanBadgeName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
                placeholder="如：夜猫"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 mb-1">账号 Handle</label>
              <input
                value={handle}
                onChange={e => setHandle(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">粉丝数量</label>
              <input
                type="number"
                value={followerCount}
                onChange={e => setFollowerCount(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">频道简介</label>
            <input
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">镜头前营业人设 & 台上台下反差</label>
            <textarea
              rows={2}
              value={personaPrompt}
              onChange={e => setPersonaPrompt(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
              placeholder="描写TA在这个号直播时的口吻、小习惯或伪装设定"
            />
          </div>

          {/* 语音与多语种同传翻译设置 */}
          <div className="p-3 rounded-2xl bg-zinc-800/70 border border-zinc-700/80 space-y-2.5">
            <div className="font-bold text-rose-400 flex items-center justify-between">
              <span>语音合成（TTS）与外语同传模式</span>
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 font-normal cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPlayTts}
                  onChange={e => setAutoPlayTts(e.target.checked)}
                />
                自动朗读台词
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-zinc-400 mb-1">主播配信语种</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-white"
                >
                  {VOICE_LANGUAGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value === '' ? '中文（默认）' : `${opt.label} (${opt.value})`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">单独覆盖音色 ID（可选）</label>
                <input
                  value={overrideVoiceId}
                  onChange={e => setOverrideVoiceId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-white"
                  placeholder="留空则用角色默认音色"
                />
              </div>
            </div>

            {language !== '' && (
              <label className="flex items-center justify-between pt-1 text-zinc-200 cursor-pointer">
                <span>开启「外语原声 + 中文野生同传 + 多国弹幕翻译」</span>
                <input
                  type="checkbox"
                  checked={translationEnabled}
                  onChange={e => setTranslationEnabled(e.target.checked)}
                />
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 gap-2">
          {initialChannel && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete(initialChannel.id);
                onClose();
              }}
              className="px-3 py-2.5 rounded-xl bg-red-950/80 text-red-300 text-xs font-semibold"
            >
              删除频道
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs">取消</button>
            <button onClick={handleSubmit} className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold">保存频道</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 2. 大小号马甲管理弹窗 ====================

export const ViewerPersonaModal: React.FC<{
  isOpen: boolean;
  personas: ViewerPersona[];
  activePersonaId: string;
  onSelect: (id: string) => void;
  onSavePersonas: (next: ViewerPersona[]) => void;
  onClose: () => void;
}> = ({ isOpen, personas, activePersonaId, onSelect, onSavePersonas, onClose }) => {
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState(15);
  const [newBadge, setNewBadge] = useState('舰长');
  const [newNote, setNewNote] = useState('');

  if (!isOpen) return null;

  const handleAddAlt = () => {
    if (!newName.trim()) return;
    const alt: ViewerPersona = {
      id: `viewer_alt_${Date.now()}`,
      isMain: false,
      name: newName.trim(),
      fanLevel: Number(newLevel) || 10,
      badgeText: newBadge.trim() || '粉丝',
      note: newNote.trim() || '自定义匿名小号（物理隔离真名，Char 认不出是你）',
    };
    const next = [...personas, alt];
    onSavePersonas(next);
    onSelect(alt.id);
    setNewName('');
    setNewNote('');
  };

  const handleDeleteAlt = (id: string) => {
    const next = personas.filter(p => p.id !== id || p.isMain);
    onSavePersonas(next);
    if (activePersonaId === id && next[0]) {
      onSelect(next[0].id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 text-zinc-100 max-h-[85vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-base font-bold">切换观众身份（大号 / 匿名小号马甲）</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              用小号发言时，系统在底层物理屏蔽你的真名，Char 只会把你当成对应 ID 的陌生网友或榜一老板。
            </p>
          </div>
          <button onClick={onClose} className="text-xs text-zinc-400 px-2 py-1 rounded-lg bg-zinc-800 shrink-0">关闭</button>
        </div>

        <div className="space-y-2">
          {personas.map(p => {
            const active = p.id === activePersonaId;
            return (
              <div
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  onClose();
                }}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  active
                    ? 'border-rose-500 bg-rose-500/15'
                    : 'border-zinc-800 bg-zinc-800/50 hover:bg-zinc-800'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.isMain ? 'bg-emerald-600 text-white' : 'bg-violet-600 text-white'}`}>
                      {p.isMain ? '本尊大号' : '匿名小号'}
                    </span>
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-amber-300">
                      Lv.{p.fanLevel} {p.badgeText || '粉'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1 truncate">{p.note}</div>
                </div>
                {!p.isMain && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteAlt(p.id);
                    }}
                    className="ml-2 text-[11px] text-zinc-500 hover:text-red-400 px-2 py-1"
                  >
                    删除
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 新增小号马甲 */}
        <div className="p-3 rounded-2xl bg-zinc-800/60 border border-zinc-700/70 space-y-2.5 text-xs">
          <div className="font-bold text-zinc-200">+ 新建匿名小号马甲</div>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="小号昵称（如：榜一富婆）"
              className="col-span-2 bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white"
            />
            <input
              type="number"
              value={newLevel}
              onChange={e => setNewLevel(Number(e.target.value))}
              placeholder="等级"
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={newBadge}
              onChange={e => setNewBadge(e.target.value)}
              placeholder="头衔（如：总督/黑粉）"
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white"
            />
            <input
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="人设备注（仅自己可见）"
              className="col-span-2 bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-white"
            />
          </div>
          <button
            type="button"
            onClick={handleAddAlt}
            className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold"
          >
            添加并切换至该小号
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== 3. 下播全貌总结预览 · 编辑 · 重总结 · 主聊天落库弹窗 ====================

export const EndStreamSummaryModal: React.FC<{
  isOpen: boolean;
  sessionTitle: string;
  summaryText: string;
  isSummarizing: boolean;
  onChangeSummaryText: (val: string) => void;
  onRegenerateSummary: () => void;
  onConfirmDrop: (mode: LiveArchiveDropMode) => void;
  onClose: () => void;
}> = ({
  isOpen,
  sessionTitle,
  summaryText,
  isSummarizing,
  onChangeSummaryText,
  onRegenerateSummary,
  onConfirmDrop,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 text-zinc-100 max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-base font-bold">下播全貌总结 & 落入主聊天</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              由辅助模型提炼四栏保真细节，落库后自动顶替散碎过程记录，防止主聊天 Token 爆炸。
            </p>
          </div>
          <button onClick={onClose} className="text-xs text-zinc-400 px-2 py-1 rounded-lg bg-zinc-800">返回直播</button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold">《{sessionTitle}》全貌纪要（可直接手改编辑）：</span>
            <button
              type="button"
              disabled={isSummarizing}
              onClick={onRegenerateSummary}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[11px] disabled:opacity-40"
            >
              {isSummarizing ? '辅助模型总结中…' : '🔄 重新总结'}
            </button>
          </div>

          <textarea
            rows={8}
            value={summaryText}
            onChange={e => onChangeSummaryText(e.target.value)}
            disabled={isSummarizing}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl p-3 text-xs text-zinc-100 leading-relaxed"
            placeholder="正在使用辅助模型汇总本场直播主线、名场面、SC台账、微信捣乱反差与未完Flag…"
          />
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={isSummarizing || !summaryText.trim()}
            onClick={() => onConfirmDrop('card_and_memory')}
            className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold text-left flex items-center justify-between disabled:opacity-40"
          >
            <div>
              <div>1. 记在心里 + 发「下播纪念卡」到主聊天（推荐）</div>
              <div className="text-[10px] opacity-80 font-normal">顶替散碎过程并进记忆宫殿，同时在微信聊天气泡落下可编辑的下播卡片</div>
            </div>
            <span>→</span>
          </button>

          <button
            type="button"
            disabled={isSummarizing || !summaryText.trim()}
            onClick={() => onConfirmDrop('silent_memory')}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold text-left flex items-center justify-between disabled:opacity-40"
          >
            <div>
              <div>2. 静默记在心里（不在主聊天弹卡片）</div>
              <div className="text-[10px] text-zinc-400 font-normal">后台记住本场完整纪要供后续聊天提起，微信界面保持安静</div>
            </div>
            <span>→</span>
          </button>

          <button
            type="button"
            disabled={isSummarizing}
            onClick={() => onConfirmDrop('forget')}
            className="w-full py-2 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-300 text-xs text-left flex items-center justify-between"
          >
            <div>
              <div>3. 本场忘掉（不进主聊天与记忆）</div>
              <div className="text-[10px] text-zinc-500">清理本场后台临时记录，当作纯整活测试局</div>
            </div>
            <span>×</span>
          </button>
        </div>
      </div>
    </div>
  );
};
