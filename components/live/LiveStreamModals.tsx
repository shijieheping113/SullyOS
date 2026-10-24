/**
 * 电波 (OnAir) —— 明亮现代风格配置弹窗：
 * 1. ChannelEditorModal：主播频道设置（头像上传/恢复角色头像、全屏背景图设置、AI一键根据人设构思频道、AI定制直播间专属礼物、语种与音色设置）
 * 2. ViewerPersonaModal：观众大小号马甲管理（支持「✨ AI 帮我构思小号马甲」，物理隔离真名）
 * 3. EndStreamSummaryModal：下播全貌总结预览、编辑、重总结与落主聊天弹窗
 */
import React, { useState, useEffect, useRef } from 'react';
import { VOICE_LANGUAGE_OPTIONS } from '../../utils/voiceLanguage';
import TokenImg from '../os/TokenImg';
import { processImageToBlob } from '../../utils/file';
import { putImageBlobDeduped } from '../../utils/blobRef';
import {
  StreamerChannelProfile,
  ChannelIdentityMode,
  ViewerPersona,
  LiveArchiveDropMode,
  StreamGiftOption,
  STREAM_PRESET_TEMPLATES,
} from '../../utils/liveStreamTypes';

// ==================== 1. 频道新建/编辑弹窗（明亮白底 + 头像/背景设置 + AI 代写） ====================

interface ChannelEditorModalProps {
  isOpen: boolean;
  charId: string;
  charName: string;
  charAvatar?: string;
  initialChannel?: StreamerChannelProfile | null;
  aiGenerating?: boolean;
  onRequestAiFillChannel: (identityMode: ChannelIdentityMode) => Promise<Record<string, string>>;
  onRequestAiGenerateGifts: (
    channelDraft: StreamerChannelProfile,
    direction?: string,
    previousNames?: string[],
  ) => Promise<StreamGiftOption[]>;
  onClose: () => void;
  onSave: (channel: StreamerChannelProfile) => void;
  onDelete?: (channelId: string) => void;
}

export const ChannelEditorModal: React.FC<ChannelEditorModalProps> = ({
  isOpen,
  charId,
  charName,
  charAvatar,
  initialChannel,
  onRequestAiFillChannel,
  onRequestAiGenerateGifts,
  onClose,
  onSave,
  onDelete,
}) => {
  const [channelName, setChannelName] = useState('');
  const [handle, setHandle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [roomBackgroundUrl, setRoomBackgroundUrl] = useState('');
  const [identityMode, setIdentityMode] = useState<ChannelIdentityMode>('public_main');
  const [bio, setBio] = useState('');
  const [streamerPersonaPrompt, setStreamerPersonaPrompt] = useState('');
  const [fanBadgeName, setFanBadgeName] = useState('Member');
  const [followerCount, setFollowerCount] = useState(12800);
  const [danmakuWarmth, setDanmakuWarmth] = useState(50);
  const [language, setLanguage] = useState('');
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [autoPlayTts, setAutoPlayTts] = useState(false);
  const [overrideVoiceId, setOverrideVoiceId] = useState('');
  const [customGifts, setCustomGifts] = useState<StreamGiftOption[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [giftAiBusy, setGiftAiBusy] = useState(false);
  const [giftDirection, setGiftDirection] = useState('');

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialChannel) {
      setChannelName(initialChannel.channelName);
      setHandle(initialChannel.handle);
      setAvatarUrl(initialChannel.avatar || charAvatar || '');
      setRoomBackgroundUrl(initialChannel.roomBackgroundUrl || '');
      setIdentityMode(initialChannel.identityMode);
      setBio(initialChannel.bio);
      setStreamerPersonaPrompt(initialChannel.streamerPersonaPrompt);
      setFanBadgeName(initialChannel.fanBadgeName || 'Member');
      setFollowerCount(initialChannel.followerCount || 5000);
      setDanmakuWarmth(
        typeof initialChannel.danmakuWarmth === 'number' ? initialChannel.danmakuWarmth : 50,
      );
      setLanguage(initialChannel.voiceConfig?.language || '');
      setEnableTranslation(Boolean(initialChannel.voiceConfig?.enableTranslation));
      setAutoPlayTts(Boolean(initialChannel.voiceConfig?.autoPlayTts));
      setOverrideVoiceId(initialChannel.voiceConfig?.overrideVoiceId || '');
      setCustomGifts(
        initialChannel.customGifts || [
          { id: 'g1', name: 'Iced Coffee', emoji: '☕', price: 20, currencySymbol: '¥' },
          { id: 'g2', name: 'Glow Stick', emoji: '🪄', price: 50, currencySymbol: '¥' },
          { id: 'g3', name: 'Midnight Ramen', emoji: '🍜', price: 120, currencySymbol: '¥' },
          { id: 'g4', name: 'Champagne', emoji: '🥂', price: 520, currencySymbol: '¥' },
        ],
      );
    } else {
      setChannelName(`${charName} Official`);
      setHandle(`@${charName.replace(/\s+/g, '_').toLowerCase()}_live`);
      setAvatarUrl(charAvatar || '');
      setRoomBackgroundUrl('');
      setIdentityMode('public_main');
      setBio(`${charName} 的个人频道`);
      setStreamerPersonaPrompt('');
      setFanBadgeName('Member');
      setFollowerCount(6800);
      setDanmakuWarmth(50);
      setLanguage('');
      setEnableTranslation(false);
      setAutoPlayTts(false);
      setOverrideVoiceId('');
      setCustomGifts([
        { id: 'g1', name: 'Iced Coffee', emoji: '☕', price: 20, currencySymbol: '¥' },
        { id: 'g2', name: 'Glow Stick', emoji: '🪄', price: 50, currencySymbol: '¥' },
        { id: 'g3', name: 'Midnight Ramen', emoji: '🍜', price: 120, currencySymbol: '¥' },
        { id: 'g4', name: 'Champagne', emoji: '🥂', price: 520, currencySymbol: '¥' },
      ]);
    }
  }, [isOpen, initialChannel, charName, charAvatar]);

  if (!isOpen) return null;

  /**
   * 上传图片：先按用途压缩，再存进图片库换成一个 blobref 令牌。
   * 以前是 readAsDataURL 直接塞进记录里，一张手机大图就能把整个存储写满。
   * 压缩失败时退回原图直读，至少不让用户选完图没反应（代价是这一张会占空间）。
   */
  const handleFileUpload = async (
    file: File | undefined,
    onLoaded: (value: string) => void,
    options: { maxWidth: number; quality: number; forceJpeg?: boolean },
  ) => {
    if (!file) return;
    try {
      const blob = await processImageToBlob(file, options);
      const { token } = await putImageBlobDeduped(blob);
      onLoaded(token);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') onLoaded(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const buildCurrentChannelObject = (): StreamerChannelProfile => ({
    id: initialChannel?.id || `ch_${charId}_${Date.now()}`,
    charId,
    channelName: channelName.trim() || `${charName} Channel`,
    handle: handle.trim() || `@${charName}_ch`,
    avatar: avatarUrl.trim() || charAvatar,
    roomBackgroundUrl: roomBackgroundUrl.trim(),
    bannerGradient:
      initialChannel?.bannerGradient ||
      STREAM_PRESET_TEMPLATES[Math.floor(Math.random() * STREAM_PRESET_TEMPLATES.length)].bannerGradient,
    identityMode,
    bio: bio.trim(),
    streamerPersonaPrompt: streamerPersonaPrompt.trim(),
    followerCount: Number(followerCount) || 1000,
    danmakuWarmth: Math.max(0, Math.min(100, Math.round(danmakuWarmth))),
    fanBadgeName: fanBadgeName.trim() || 'Member',
    defaultCategory: initialChannel?.defaultCategory || 'just_chatting',
    voiceConfig: {
      language,
      enableTranslation: language && language !== 'zh' ? enableTranslation : false,
      autoPlayTts,
      overrideVoiceId: overrideVoiceId.trim(),
    },
    customGifts,
    createdAt: initialChannel?.createdAt || Date.now(),
    updatedAt: Date.now(),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl bg-white text-slate-800 border border-slate-200 p-4 shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {initialChannel ? '编辑主播频道设置' : `为 ${charName} 新建频道`}
            </h3>
            <p className="text-[11px] text-slate-500">支持自定义主播头像、舞台背景图与 AI 人设构思</p>
          </div>
          <button
            disabled={aiBusy}
            onClick={async () => {
              setAiBusy(true);
              try {
                const res = await onRequestAiFillChannel(identityMode);
                if (res.channelName) setChannelName(res.channelName);
                if (res.handle) setHandle(res.handle);
                if (res.fanBadgeName) setFanBadgeName(res.fanBadgeName);
                if (res.bio) setBio(res.bio);
                if (res.streamerPersonaPrompt) setStreamerPersonaPrompt(res.streamerPersonaPrompt);
              } finally {
                setAiBusy(false);
              }
            }}
            className="px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-500 to-violet-600 text-white text-xs font-bold shadow-sm disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {aiBusy ? '✨ 构思中…' : '✨ 辅助模型填频道'}
          </button>
        </div>

        {/* 1. 头像与全屏舞台背景图设置 */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="text-xs font-bold text-slate-700">1. 主播头像与直播间背景（融入画面设计）</div>
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-rose-500 shadow shrink-0 bg-slate-200">
              {avatarUrl || charAvatar ? (
                <TokenImg value={avatarUrl || charAvatar || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-slate-600">
                  {charName[0]}
                </div>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    void handleFileUpload(e.target.files?.[0], setAvatarUrl, {
                      maxWidth: 512,
                      quality: 0.9,
                    });
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  上传主播头像
                </button>
                {charAvatar && (
                  <button
                    onClick={() => setAvatarUrl(charAvatar)}
                    className="px-2.5 py-1 rounded-lg bg-slate-200/70 text-[11px] text-slate-600 hover:bg-slate-200"
                  >
                    用角色默认头像
                  </button>
                )}
              </div>
              <input
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                placeholder="或粘贴主播头像图片 URL…"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] text-slate-700"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/70 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-600">
                全屏/取景框背景图（留空默认用主播头像氛围背景）
              </span>
              <div className="flex gap-1.5">
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    void handleFileUpload(e.target.files?.[0], setRoomBackgroundUrl, {
                      maxWidth: 1600,
                      quality: 0.82,
                      forceJpeg: true,
                    });
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => bgInputRef.current?.click()}
                  className="text-rose-600 font-bold hover:underline"
                >
                  上传背景图
                </button>
                {roomBackgroundUrl && (
                  <button
                    onClick={() => setRoomBackgroundUrl('')}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    恢复默认头像背景
                  </button>
                )}
              </div>
            </div>
            <input
              value={roomBackgroundUrl}
              onChange={e => setRoomBackgroundUrl(e.target.value)}
              placeholder="可选：粘贴直播间自定义背景图 URL（留空则直接展示主播头像海报）"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700"
            />
          </div>
        </div>

        {/* 2. 频道身份模式 */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">2. 频道身份定位</label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { key: 'public_main', label: '公开主频道', desc: '本人实名营业' },
              { key: 'secret_alt', label: '匿名小号', desc: '不露脸反差马甲' },
              { key: 'vtuber', label: '虚拟皮套 V', desc: 'Live2D 虚拟形象' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setIdentityMode(item.key as ChannelIdentityMode)}
                className={`p-2 rounded-xl border text-left transition ${
                  identityMode === item.key
                    ? 'border-rose-500 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <div className="font-bold">{item.label}</div>
                <div className="text-[10px] opacity-75 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 3. 名称、Handle、会员铭牌與简介 */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-600">频道名称</label>
              <input
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
                className="w-full mt-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Handle (@ID)</label>
              <input
                value={handle}
                onChange={e => setHandle(e.target.value)}
                className="w-full mt-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-600">
                会员徽章名 (YouTube/Nico)
              </label>
              <input
                value={fanBadgeName}
                onChange={e => setFanBadgeName(e.target.value)}
                placeholder="如 Member / 常連 / Club"
                className="w-full mt-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">订阅者数量 (Subscribers)</label>
              <input
                type="number"
                value={followerCount}
                onChange={e => setFollowerCount(Number(e.target.value) || 0)}
                className="w-full mt-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-600">弹幕风格 · 叛逆度</label>
              <span className="text-[11px] font-bold text-slate-700">{danmakuWarmth}</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              越低越叛逆：吐槽、对抗、施压，抵触主播有伴侣和私联，甚至恶评。越高越友好溺爱，狂热粉极少出现。
            </p>
            <input
              type="range"
              min={0}
              max={100}
              value={danmakuWarmth}
              aria-label="弹幕叛逆度"
              onChange={e => setDanmakuWarmth(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>叛逆对抗</span>
              <span>友好溺爱</span>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600">频道简介 (Bio)</label>
            <input
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="w-full mt-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600">
              镜头前状态与反差人设（可点右上角「✨ 交给 AI 填写」）
            </label>
            <textarea
              value={streamerPersonaPrompt}
              onChange={e => setStreamerPersonaPrompt(e.target.value)}
              rows={2}
              placeholder="例如：平时高冷，在这个深夜匿名频道打游戏却很容易破防嘴硬…"
              className="w-full mt-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
            />
          </div>
        </div>

        {/* 4. 直播间专属礼物定制（由 AI 随人设生成） */}
        <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900">🎁 频道专属礼物（区别于纯金额 SC）</span>
            <button
              disabled={giftAiBusy}
              onClick={async () => {
                setGiftAiBusy(true);
                try {
                  const generated = await onRequestAiGenerateGifts(
                    buildCurrentChannelObject(),
                    giftDirection.trim() || undefined,
                    customGifts.map(item => item.name),
                  );
                  setCustomGifts(generated);
                } finally {
                  setGiftAiBusy(false);
                }
              }}
              className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold shadow-sm disabled:opacity-50"
            >
              {giftAiBusy
                ? '✨ 设计中…'
                : customGifts.length
                ? '✨ 换一批'
                : '✨ AI 根据人设生成礼物'}
            </button>
          </div>
          {customGifts.length > 0 ? (
            <input
              value={giftDirection}
              onChange={e => setGiftDirection(e.target.value)}
              placeholder="想加点什么梗？（可不填）"
              className="w-full h-8 rounded-lg border border-amber-200 bg-white/80 px-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          ) : null}
          <div className="grid grid-cols-1 gap-1.5">
            {customGifts.map((g, idx) => (
              <div
                key={g.id || idx}
                className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-2 py-2 text-xs"
              >
                <input
                  value={g.emoji}
                  onChange={e => {
                    const next = [...customGifts];
                    next[idx] = { ...g, emoji: e.target.value };
                    setCustomGifts(next);
                  }}
                  className="w-7 shrink-0 text-center bg-slate-50 rounded py-0.5"
                />
                <input
                  value={g.name}
                  onChange={e => {
                    const next = [...customGifts];
                    next[idx] = { ...g, name: e.target.value };
                    setCustomGifts(next);
                  }}
                  placeholder="礼物名称"
                  className="flex-1 min-w-0 bg-transparent font-semibold text-slate-800 text-[12px] leading-tight py-0.5"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[11px] font-bold text-amber-700">{g.currencySymbol || '¥'}</span>
                  <input
                    type="number"
                    value={g.price}
                    onChange={e => {
                      const next = [...customGifts];
                      next[idx] = { ...g, price: Number(e.target.value) || 10 };
                      setCustomGifts(next);
                    }}
                    className="w-14 text-right bg-slate-50 rounded px-1 py-0.5 text-[11px] font-bold text-amber-700"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. 语音语种与同传设置 */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
          <div className="text-xs font-bold text-slate-700">🔊 配信语种、同传翻译与 TTS 音色</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500">配信原声语种</label>
              <select
                value={language}
                onChange={e => {
                  const val = e.target.value;
                  setLanguage(val);
                  if (val && val !== 'zh') setEnableTranslation(true);
                }}
                className="w-full mt-1 rounded-xl bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
              >
                {VOICE_LANGUAGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500">覆盖音色 ID（留空用角色默认）</label>
              <input
                value={overrideVoiceId}
                onChange={e => setOverrideVoiceId(e.target.value)}
                placeholder="可选专属音色 ID"
                className="w-full mt-1 rounded-xl bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>

          {language && language !== 'zh' && (
            <label className="flex items-center justify-between text-xs text-slate-700 pt-1">
              <span>开启双语同传字幕与弹幕翻译（无“译：”前缀）</span>
              <input
                type="checkbox"
                checked={enableTranslation}
                onChange={e => setEnableTranslation(e.target.checked)}
                className="accent-rose-600"
              />
            </label>
          )}

          <label className="flex items-center justify-between text-xs text-slate-700 pt-1">
            <span>切到新一拍时自动合成并播放主播语音</span>
            <input
              type="checkbox"
              checked={autoPlayTts}
              onChange={e => setAutoPlayTts(e.target.checked)}
              className="accent-rose-600"
            />
          </label>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-2">
          {initialChannel && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete(initialChannel.id);
                onClose();
              }}
              className="text-xs text-red-500 hover:underline px-2 py-1"
            >
              删除频道
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(buildCurrentChannelObject());
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-rose-600 text-xs font-bold text-white shadow-md hover:bg-rose-500"
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 2. 观众大小号马甲管理弹窗（支持 AI 构思小号 + 物理防穿帮） ====================

interface ViewerPersonaModalProps {
  isOpen: boolean;
  personas: ViewerPersona[];
  activePersonaId: string;
  aiGenerating?: boolean;
  onSelect: (id: string) => void;
  onSavePersonas?: (next: ViewerPersona[]) => void;
  onSaveAll?: (next: ViewerPersona[]) => void;
  onRequestAiAltPersona?: () => Promise<Record<string, string>>;
  onRequestAiPersona?: () => Promise<Record<string, string>>;
  onClose: () => void;
}

export const ViewerPersonaModal: React.FC<ViewerPersonaModalProps> = ({
  isOpen,
  personas,
  activePersonaId,
  onSelect,
  onSavePersonas,
  onSaveAll,
  onRequestAiAltPersona,
  onRequestAiPersona,
  onClose,
}) => {
  const [newName, setNewName] = useState('');
  const [newBadge, setNewBadge] = useState('Member');
  const [newNote, setNewNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  // 已有账户（含本尊大号）也能改昵称/徽章/备注
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBadge, setEditBadge] = useState('');
  const [editNote, setEditNote] = useState('');

  if (!isOpen) return null;

  const commitPersonas = (next: ViewerPersona[]) => {
    if (onSavePersonas) onSavePersonas(next);
    if (onSaveAll) onSaveAll(next);
  };

  const startEditPersona = (p: ViewerPersona) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditBadge(p.badgeText || '');
    setEditNote(p.note || '');
  };

  const saveEditPersona = () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    commitPersonas(
      personas.map(p =>
        p.id === editingId
          ? { ...p, name: trimmed, badgeText: editBadge.trim() || undefined, note: editNote.trim() || undefined }
          : p,
      ),
    );
    setEditingId(null);
  };

  const handleAddAlt = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const alt: ViewerPersona = {
      id: `viewer_alt_${Date.now()}`,
      name: trimmed,
      isMain: false,
      fanLevel: Math.floor(Math.random() * 15) + 1,
      badgeText: newBadge.trim() || 'Member',
      note: newNote.trim() || '匿名小号（主播不知道是我的马甲）',
    };
    const next = [...personas, alt];
    commitPersonas(next);
    onSelect(alt.id);
    setNewName('');
    setNewNote('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white text-slate-800 border border-slate-200 p-4 shadow-2xl space-y-3.5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="text-base font-bold text-slate-900">切换观看身份（本尊大号 / 匿名小号）</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              用小号发言时，系统物理隔离你的真名，主播绝不会未卜先知认出你，也不会替你的小号乱发弹幕。
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm px-2 shrink-0">
            ✕
          </button>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {personas.map(p => {
            const active = p.id === activePersonaId;
            if (editingId === p.id) {
              return (
                <div key={p.id} className="p-3 rounded-2xl border border-rose-300 bg-white space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="昵称"
                      className="col-span-2 rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
                    />
                    <input
                      value={editBadge}
                      onChange={e => setEditBadge(e.target.value)}
                      placeholder="徽章"
                      className="rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <input
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    placeholder="人设备注（可选）"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={!editName.trim()}
                      onClick={saveEditPersona}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
                    >
                      保存
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  onClose();
                }}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  active
                    ? 'border-rose-500 bg-rose-50/70'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0 ${
                        p.isMain ? 'bg-emerald-600 text-white' : 'bg-violet-600 text-white'
                      }`}
                    >
                      {p.isMain ? '本尊大号' : '匿名马甲'}
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate">{p.name}</span>
                    {p.badgeText && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-medium whitespace-nowrap shrink-0">
                        {p.badgeText}
                      </span>
                    )}
                  </div>
                  {p.note && <div className="text-[11px] text-slate-500 mt-1">{p.note}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      startEditPersona(p);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-800 px-1.5 whitespace-nowrap"
                  >
                    编辑
                  </button>
                  {!p.isMain && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        const next = personas.filter(x => x.id !== p.id);
                        commitPersonas(next);
                        if (activePersonaId === p.id && next[0]) onSelect(next[0].id);
                      }}
                      className="text-xs text-slate-400 hover:text-red-500 px-1.5 whitespace-nowrap"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700">+ 新增匿名小号马甲</span>
            <button
              disabled={aiBusy}
              onClick={async () => {
                setAiBusy(true);
                try {
                  const fn = onRequestAiAltPersona || onRequestAiPersona;
                  if (fn) {
                    const res = await fn();
                    if (res.name) setNewName(res.name);
                    if (res.badgeText) setNewBadge(res.badgeText);
                    if (res.note) setNewNote(res.note);
                  }
                } finally {
                  setAiBusy(false);
                }
              }}
              className="px-2.5 py-1 rounded-full bg-violet-600 text-white text-[11px] font-bold disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {aiBusy ? '✨ 构思中…' : '✨ 辅助模型构思小号'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="小号昵称"
              className="col-span-2 rounded-xl bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            />
            <input
              value={newBadge}
              onChange={e => setNewBadge(e.target.value)}
              placeholder="徽章(VIP)"
              className="rounded-xl bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="小号人设备注（可选）"
              className="flex-1 rounded-xl bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            />
            <button
              type="button"
              onClick={handleAddAlt}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0 whitespace-nowrap"
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 3. 下播全貌总结预览与落主聊天弹窗 ====================

interface EndStreamSummaryModalProps {
  isOpen: boolean;
  sessionTitle: string;
  channelName?: string;
  summaryText?: string;
  initialSummary?: string;
  isSummarizing?: boolean;
  isGenerating?: boolean;
  onChangeSummaryText?: (text: string) => void;
  onRegenerateSummary?: () => void;
  onRegenerate?: () => void;
  onConfirmDrop?: (mode: LiveArchiveDropMode) => void;
  onConfirm?: (text: string, mode: LiveArchiveDropMode) => void;
  onClose: () => void;
}

export const EndStreamSummaryModal: React.FC<EndStreamSummaryModalProps> = ({
  isOpen,
  sessionTitle,
  summaryText,
  initialSummary,
  isSummarizing,
  isGenerating,
  onChangeSummaryText,
  onRegenerateSummary,
  onRegenerate,
  onConfirmDrop,
  onConfirm,
  onClose,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState('');

  const externalText = summaryText ?? initialSummary ?? '';
  const busy = Boolean(isSummarizing || isGenerating);

  useEffect(() => {
    setLocalText(externalText);
  }, [externalText, isOpen]);

  if (!isOpen) return null;

  const handleTextChange = (val: string) => {
    setLocalText(val);
    if (onChangeSummaryText) onChangeSummaryText(val);
  };

  const triggerConfirm = (mode: LiveArchiveDropMode) => {
    if (onConfirm) onConfirm(localText, mode);
    else if (onConfirmDrop) onConfirmDrop(mode);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl bg-white text-slate-800 border border-slate-200 p-4 shadow-2xl space-y-3.5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">🎬 下播归档 · 本场全貌纪要</h3>
            <p className="text-[11px] text-slate-500 truncate">《{sessionTitle}》</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => setIsEditing(v => !v)}
              className="px-2.5 py-1 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap"
            >
              {isEditing ? '完成编辑' : '✏️ 编辑'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (onRegenerateSummary) onRegenerateSummary();
                else if (onRegenerate) onRegenerate();
              }}
              className="px-2.5 py-1 rounded-xl bg-slate-100 text-xs font-semibold text-rose-600 disabled:opacity-40 whitespace-nowrap"
            >
              {busy ? '生成中…' : '🔄 重总结'}
            </button>
          </div>
        </div>

        {busy ? (
          <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
            正在由辅助模型提炼本场直播名场面、Super Chat 台账与私聊互动细节…
          </div>
        ) : isEditing ? (
          <textarea
            value={localText}
            onChange={e => handleTextChange(e.target.value)}
            rows={10}
            className="w-full rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-800 leading-relaxed"
          />
        ) : (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {localText || '暂无总结内容，可点击右上角重总结或手动填写。'}
          </div>
        )}

        <div className="space-y-2 pt-1">
          <div className="text-[11px] text-slate-500">
            选择下播后如何处理（会自动折叠顶替过程碎片，防止主聊天爆 Token）：
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => triggerConfirm('card_and_memory')}
            className="w-full py-2.5 px-3 rounded-2xl bg-rose-600 text-white text-xs font-bold shadow-md hover:bg-rose-500 text-left flex items-center justify-between"
          >
            <span>💌 记在心里 + 发「下播纪念卡」到主聊天（推荐）</span>
            <span>→</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => triggerConfirm('silent_memory')}
              className="py-2 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 whitespace-nowrap"
            >
              🤫 静默记在心里
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => triggerConfirm('forget')}
              className="py-2 px-3 rounded-xl bg-slate-100 text-slate-500 text-xs hover:text-red-500 whitespace-nowrap"
            >
              🗑️ 本场忘掉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 4. 本场直播信息编辑弹窗（标题 / 分区 / 今日走向） ====================

interface LiveSessionInfoModalProps {
  isOpen: boolean;
  initialTitle: string;
  initialCategoryKey: string;
  initialCategoryHint: string;
  initialCategoryNameZh: string;
  initialCategoryNameEn: string;
  initialTopicNote: string;
  onClose: () => void;
  onSave: (next: {
    title: string;
    categoryKey: string;
    categoryLabel: string;
    categoryHint: string;
    categoryNameZh: string;
    categoryNameEn: string;
    topicNote: string;
  }) => void;
}

export const LiveSessionInfoModal: React.FC<LiveSessionInfoModalProps> = ({
  isOpen,
  initialTitle,
  initialCategoryKey,
  initialCategoryHint,
  initialCategoryNameZh,
  initialCategoryNameEn,
  initialTopicNote,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [categoryKey, setCategoryKey] = useState(initialCategoryKey);
  const [categoryNameZh, setCategoryNameZh] = useState(initialCategoryNameZh);
  const [categoryNameEn, setCategoryNameEn] = useState(initialCategoryNameEn);
  const [categoryHint, setCategoryHint] = useState(initialCategoryHint);
  const [topicNote, setTopicNote] = useState(initialTopicNote);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setCategoryKey(initialCategoryKey);
    setCategoryNameZh(initialCategoryNameZh);
    setCategoryNameEn(initialCategoryNameEn);
    setCategoryHint(initialCategoryHint);
    setTopicNote(initialTopicNote);
  }, [
    isOpen,
    initialTitle,
    initialCategoryKey,
    initialCategoryHint,
    initialCategoryNameZh,
    initialCategoryNameEn,
    initialTopicNote,
  ]);

  if (!isOpen) return null;

  const preset = STREAM_PRESET_TEMPLATES.find(t => t.key === categoryKey);

  const save = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    if (categoryKey === 'custom') {
      const zh = categoryNameZh.trim().slice(0, 8);
      if (!zh) return;
      const en = categoryNameEn.trim();
      onSave({
        title: nextTitle,
        categoryKey: 'custom',
        categoryLabel: en ? `${zh} ${en}` : zh,
        categoryHint: categoryHint.trim(),
        categoryNameZh: zh,
        categoryNameEn: en,
        topicNote: topicNote.trim(),
      });
      return;
    }
    const chosen =
      STREAM_PRESET_TEMPLATES.find(t => t.key === categoryKey) || STREAM_PRESET_TEMPLATES[0];
    onSave({
      title: nextTitle,
      categoryKey: chosen.key,
      categoryLabel: chosen.label,
      categoryHint: '',
      categoryNameZh: '',
      categoryNameEn: '',
      topicNote: topicNote.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl bg-white text-slate-800 border border-slate-200 p-4 shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">编辑这场直播的信息</h3>
          <p className="text-[11px] text-slate-500">改完保存后，后面推进的直播会按新信息继续。</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">直播标题</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="这一场的标题"
            className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">分区类型</label>
          <div className="grid grid-cols-2 gap-2">
            {STREAM_PRESET_TEMPLATES.map(t => {
              const on = t.key === categoryKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setCategoryKey(t.key)}
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left transition ${
                    on
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setCategoryKey('custom')}
            className={`mt-2 w-full rounded-xl px-2.5 py-2 text-left text-xs font-bold transition ${
              categoryKey === 'custom'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            自定义分区
          </button>
          {categoryKey === 'custom' ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={categoryNameZh}
                  onChange={e => setCategoryNameZh(e.target.value.slice(0, 8))}
                  maxLength={8}
                  placeholder="分区名字，最多 8 个字"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
                {categoryNameEn ? (
                  <span className="shrink-0 text-[11px] text-slate-400">{categoryNameEn}</span>
                ) : null}
              </div>
              <textarea
                value={categoryHint}
                onChange={e => setCategoryHint(e.target.value)}
                rows={2}
                placeholder="一句分区介绍（可不填）：这一类直播的画面和氛围"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">今日走向 / 附加设定</label>
          <textarea
            value={topicNote}
            onChange={e => setTopicNote(e.target.value)}
            rows={3}
            placeholder={preset?.promptHint || '这一场想怎么进行'}
            className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-400"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!title.trim() || (categoryKey === 'custom' && !categoryNameZh.trim())}
            onClick={save}
            className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-sm disabled:opacity-40"
          >
            保存并用于后续直播
          </button>
        </div>
      </div>
    </div>
  );
};
