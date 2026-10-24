/**
 * 电波大厅。
 * YouTube：顶栏标志 + 搜索，底栏 首页 / 视频 / 创建 / 陪看 / 你的。封面全宽，没有描边卡片。
 * ニコニコ：顶部分段（生放送 / 動画 / ミラー），双列节目表，底部一个方按钮开播。
 */
import React, { useMemo, useState } from 'react';
import TokenImg from '../os/TokenImg';
import {
  StreamerChannelProfile,
  ViewerPersona,
  LiveStreamSession,
  VodVideoPost,
  NpcWatchSession,
  NpcStreamerChannelCard,
  LivePlatformTheme,
  OnAirRealtimeSettings,
  STREAM_PRESET_TEMPLATES,
} from '../../utils/liveStreamTypes';
import type { LiveCategorySuggestion } from '../../utils/liveStreamAiHelpers';
import {
  Icon,
  IconButton,
  YtMark,
  NicoMark,
  Sheet,
  FieldLabel,
  TextInput,
  TextArea,
  DropDown,
  LiveUiStyle,
  formatCount,
} from './platformChrome';

type CharLite = { id: string; name: string; avatar?: string };
type MenuTarget =
  | { kind: 'live'; id: string; title: string }
  | { kind: 'vod'; id: string; title: string }
  | null;

export function LiveLobby({
  platformTheme,
  onChangePlatformTheme,
  closeApp,
  onBindBack,
  characters,
  currentChar,
  onSelectChar,
  channels,
  activeChannel,
  onSelectChannel,
  onCreateChannel,
  onEditChannel,
  viewerPersonas,
  activePersonaId,
  onOpenPersonas,
  liveSessions,
  onOpenLive,
  onEditLive,
  onDeleteLive,
  vodPosts,
  onOpenVod,
  onDeleteVod,
  npcPool,
  npcSessions,
  onStartNpc,
  onOpenNpcSession,
  npcCustomRule,
  onChangeNpcRule,
  onAiNpcRule,
  onRefreshNpcPool,
  showNpcRule,
  onToggleNpcRule,
  selectedPresetKey,
  onSelectPreset,
  customStreamTitle,
  onChangeStreamTitle,
  customStreamTopic,
  onChangeStreamTopic,
  customCategoryName,
  onChangeCategoryName,
  customCategoryEn,
  onChangeCategoryEn,
  customCategoryHint,
  onChangeCategoryHint,
  onRecommendCategories,
  onAiStream,
  onStartStream,
  customVodTitle,
  onChangeVodTitle,
  customVodCategory,
  onChangeVodCategory,
  onAiVod,
  onCreateVod,
  isGenerating,
  aiHelperBusy,
  onOpenPhone,
  onAirRealtime,
  onChangeOnAirRealtime,
  channelModal,
  personaModal,
}: {
  platformTheme: LivePlatformTheme;
  onChangePlatformTheme: (t: LivePlatformTheme) => void;
  closeApp: () => void;
  onBindBack: (fn: () => boolean) => void;
  characters: CharLite[];
  currentChar?: CharLite;
  onSelectChar: (id: string) => void;
  channels: StreamerChannelProfile[];
  activeChannel?: StreamerChannelProfile;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
  onEditChannel: () => void;
  viewerPersonas: ViewerPersona[];
  activePersonaId: string;
  onOpenPersonas: () => void;
  liveSessions: LiveStreamSession[];
  onOpenLive: (id: string) => void;
  onEditLive: (id: string) => void;
  onDeleteLive: (id: string) => void;
  vodPosts: VodVideoPost[];
  onOpenVod: (id: string) => void;
  onDeleteVod: (id: string) => void;
  npcPool: NpcStreamerChannelCard[];
  npcSessions: NpcWatchSession[];
  onStartNpc: (card: NpcStreamerChannelCard) => void;
  onOpenNpcSession: (id: string) => void;
  npcCustomRule: string;
  onChangeNpcRule: (v: string) => void;
  onAiNpcRule: () => void;
  onRefreshNpcPool: () => void;
  showNpcRule: boolean;
  onToggleNpcRule: () => void;
  selectedPresetKey: string;
  onSelectPreset: (key: string) => void;
  customStreamTitle: string;
  onChangeStreamTitle: (v: string) => void;
  customStreamTopic: string;
  onChangeStreamTopic: (v: string) => void;
  customCategoryName: string;
  onChangeCategoryName: (v: string) => void;
  customCategoryEn: string;
  onChangeCategoryEn: (v: string) => void;
  customCategoryHint: string;
  onChangeCategoryHint: (v: string) => void;
  onRecommendCategories: (direction?: string, previous?: string) => Promise<LiveCategorySuggestion[]>;
  onAiStream: (direction?: string) => void;
  onStartStream: () => void;
  customVodTitle: string;
  onChangeVodTitle: (v: string) => void;
  customVodCategory: string;
  onChangeVodCategory: (v: string) => void;
  onAiVod: () => void;
  onCreateVod: () => void;
  isGenerating: boolean;
  aiHelperBusy: boolean;
  onOpenPhone: () => void;
  /** 电波总控 · 实时背景开关（只影响电波生成请求） */
  onAirRealtime: OnAirRealtimeSettings;
  onChangeOnAirRealtime: (next: OnAirRealtimeSettings) => void;
  channelModal: React.ReactNode;
  personaModal: React.ReactNode;
}) {
  const isNico = platformTheme === 'niconico';
  const [tab, setTab] = useState<'live' | 'vod' | 'together' | 'you'>('live');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<'none' | 'create' | 'goLive' | 'upload' | 'accounts' | 'settings'>('none');
  const [menu, setMenu] = useState<MenuTarget>(null);
  const [liveFilter, setLiveFilter] = useState<'all' | 'live' | 'replay'>('all');

  // 自定义分区推荐：候选和方向只在开播弹窗里用，不存频道
  const [categorySuggestions, setCategorySuggestions] = useState<LiveCategorySuggestion[]>([]);
  const [categoryDirection, setCategoryDirection] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [pickedCategoryLabel, setPickedCategoryLabel] = useState('');
  const [streamAiDirection, setStreamAiDirection] = useState('');
  // 「今天播什么」是可选项，默认收起，避免把分区挤到下面
  const [topicOpen, setTopicOpen] = useState(false);

  const recommendCategories = async () => {
    if (categoryBusy) return;
    setCategoryBusy(true);
    try {
      const previous = categorySuggestions.map(item => item.label).join('、');
      const next = await onRecommendCategories(
        categoryDirection.trim() || undefined,
        previous || undefined,
      );
      if (next.length) setCategorySuggestions(next);
    } finally {
      setCategoryBusy(false);
    }
  };

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const openCategoryPicker = () => {
    setCategoryPickerOpen(true);
    if (!categorySuggestions.length) void recommendCategories();
  };

  const persona = viewerPersonas.find(p => p.id === activePersonaId) || viewerPersonas[0];
  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const lives = useMemo(() => {
    return liveSessions.filter(s => {
      if (!match(s.title)) return false;
      if (liveFilter === 'live') return s.status === 'live';
      if (liveFilter === 'replay') return s.status !== 'live';
      return true;
    });
  }, [liveSessions, q, liveFilter]);

  const vods = vodPosts.filter(v => match(v.title));
  const npcs = npcPool.filter(c => match(`${c.roomTitle} ${c.npcName}`));
  const history = npcSessions.filter(s => match(s.npcRoomTitle));

  /**
   * 大厅卡片的背景：这场自己换过就用它的，没换过退回所属频道的背景。
   * 新建直播不再复制频道背景（那会让存储翻倍），所以这里必须补同样的退回逻辑。
   */
  const backgroundFor = (sess: LiveStreamSession): string | undefined =>
    sess.customBackgroundUrl ||
    channels.find(c => c.id === sess.channelId)?.roomBackgroundUrl ||
    undefined;

  const openGoLive = () => setSheet('goLive');
  const openUpload = () => setSheet('upload');

  const popInner = () => {
    if (sheet !== 'none') {
      setSheet('none');
      return true;
    }
    if (menu) {
      setMenu(null);
      return true;
    }
    if (searchOpen) {
      setSearchOpen(false);
      setQuery('');
      return true;
    }
    if (showNpcRule) {
      onToggleNpcRule();
      return true;
    }
    if (tab !== 'live') {
      setTab('live');
      return true;
    }
    return false;
  };
  onBindBack(() => popInner());
  const stepBack = () => {
    if (!popInner()) closeApp();
  };

  const youPage = (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center gap-3">
        <Avatar src={activeChannel?.avatar || currentChar?.avatar} name={activeChannel?.channelName || currentChar?.name || '频道'} size={64} />
        <div className="min-w-0">
          <div className="text-[20px] leading-6 font-medium text-[#0f0f0f] break-words">
            {activeChannel?.channelName || '还没有频道'}
          </div>
          <div className="text-[12px] leading-4 text-[#606060] mt-1 break-words">
            {activeChannel
              ? `${activeChannel.handle} · ${formatCount(activeChannel.followerCount)} 位订阅者`
              : '先建一个频道再开播'}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onEditChannel}
          disabled={!activeChannel}
          className="h-11 px-4 rounded-full bg-[#0f0f0f] text-white text-[14px] font-medium disabled:opacity-40"
        >
          管理频道
        </button>
        <button
          type="button"
          onClick={onCreateChannel}
          className="h-11 px-4 rounded-full bg-[#f2f2f2] text-[#0f0f0f] text-[14px] font-medium"
        >
          新建频道
        </button>
      </div>

      <SectionTitle>这个角色的频道</SectionTitle>
      {channels.length === 0 ? (
        <p className="text-[14px] text-[#606060]">还没有频道。</p>
      ) : (
        <ul>
          {channels.map(ch => (
            <li key={ch.id}>
              <button
                type="button"
                onClick={() => onSelectChannel(ch.id)}
                className="w-full min-h-11 py-2 flex items-center gap-3 text-left active:bg-[#f2f2f2]"
              >
                <Avatar src={ch.avatar || currentChar?.avatar} name={ch.channelName} size={36} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] text-[#0f0f0f] break-words">{ch.channelName}</span>
                  <span className="block text-[12px] text-[#606060]">
                    {ch.identityMode === 'secret_alt' ? '小号' : ch.identityMode === 'vtuber' ? '皮套' : '本尊'}
                    {' · '}
                    {formatCount(ch.followerCount)} 位订阅者
                  </span>
                </span>
                {ch.id === activeChannel?.id ? <Icon name="check" size={20} /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>观众身份</SectionTitle>
      <button type="button" onClick={onOpenPersonas} className="w-full min-h-11 flex items-center justify-between text-left">
        <span className="text-[14px]">
          现在用「{persona?.name || '我'}」{persona?.isMain ? '（名牌）' : '（匿名）'}
        </span>
        <Icon name="more" size={18} />
      </button>

      <SectionTitle>外观</SectionTitle>
      <ThemeRows theme={platformTheme} onChange={onChangePlatformTheme} />

      <SectionTitle>角色</SectionTitle>
      <CharList characters={characters} currentId={currentChar?.id} onSelect={onSelectChar} />
    </div>
  );

  const ytFeed = (
    <div>
      {tab === 'you' ? (
        youPage
      ) : tab === 'live' ? (
        <>
          <div className="px-3 py-2">
            <DropDown
              label="显示"
              value={liveFilter}
              onChange={id => setLiveFilter(id as 'all' | 'live' | 'replay')}
              options={[
                { id: 'all', label: '全部' },
                { id: 'live', label: '正在直播' },
                { id: 'replay', label: '回放' },
              ]}
            />
          </div>
          {lives.length === 0 ? (
            <Empty
              text={q ? '没有符合的直播' : '还没有直播'}
              action={q ? undefined : '开始直播'}
              onAction={q ? undefined : openGoLive}
            />
          ) : (
            lives.map(sess => (
              <YtRow
                key={sess.id}
                title={sess.title}
                meta={`${activeChannel?.channelName || ''} · ${sess.categoryLabel} · ${
                  sess.status === 'live' ? `${formatCount(sess.viewerCount)} 人正在看` : '回放'
                }`}
                badge={sess.status === 'live' ? '直播' : undefined}
                time={sess.status === 'live' ? undefined : `${sess.chunks.length} 段`}
                image={backgroundFor(sess)}
                rebuilt={Boolean(sess.rebuiltFromMessagesAt)}
                avatar={activeChannel?.avatar || currentChar?.avatar}
                avatarName={activeChannel?.channelName || ''}
                onOpen={() => onOpenLive(sess.id)}
                onAvatar={onEditChannel}
                onMore={() => setMenu({ kind: 'live', id: sess.id, title: sess.title })}
              />
            ))
          )}
        </>
      ) : tab === 'vod' ? (
        vods.length === 0 ? (
          <Empty text={q ? '没有符合的视频' : '还没有视频'} action={q ? undefined : '发布视频'} onAction={q ? undefined : openUpload} />
        ) : (
          vods.map(vod => (
            <YtRow
              key={vod.id}
              title={vod.title}
              meta={`${activeChannel?.channelName || ''} · ${formatCount(vod.viewsCount)} 次观看 · ${vod.comments.length} 条评论`}
              time={vod.durationLabel}
              image={vod.coverImageUrl}
              avatar={activeChannel?.avatar || currentChar?.avatar}
              avatarName={activeChannel?.channelName || ''}
              onOpen={() => onOpenVod(vod.id)}
              onAvatar={onEditChannel}
              onMore={() => setMenu({ kind: 'vod', id: vod.id, title: vod.title })}
            />
          ))
        )
      ) : (
        <TogetherList
          charName={currentChar?.name || ''}
          npcs={npcs}
          history={history}
          showRule={showNpcRule}
          rule={npcCustomRule}
          onToggleRule={onToggleNpcRule}
          onChangeRule={onChangeNpcRule}
          onAiRule={onAiNpcRule}
          onRefresh={onRefreshNpcPool}
          busy={aiHelperBusy}
          onStart={onStartNpc}
          onOpenHistory={onOpenNpcSession}
          layout="yt"
        />
      )}
    </div>
  );

  const nicoBody = (
    <div className="px-2 pt-2 pb-4">
      {tab === 'you' ? (
        <div className="bg-white px-3 py-2">{youPage}</div>
      ) : tab === 'live' ? (
        lives.length === 0 ? (
          <Empty text={q ? '該当する番組がありません' : 'まだ番組がありません'} action={q ? undefined : '番組を作る'} onAction={q ? undefined : openGoLive} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {lives.map(sess => (
              <NicoCell
                key={sess.id}
                title={sess.title}
                sub={`${sess.status === 'live' ? 'LIVE' : 'TS'} · ${formatCount(sess.viewerCount)}来場`}
                image={backgroundFor(sess)}
                rebuilt={Boolean(sess.rebuiltFromMessagesAt)}
                live={sess.status === 'live'}
                onOpen={() => onOpenLive(sess.id)}
                onMore={() => setMenu({ kind: 'live', id: sess.id, title: sess.title })}
              />
            ))}
          </div>
        )
      ) : tab === 'vod' ? (
        vods.length === 0 ? (
          <Empty text={q ? '該当する動画がありません' : 'まだ動画がありません'} action={q ? undefined : '動画を投稿'} onAction={q ? undefined : openUpload} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {vods.map(vod => (
              <NicoCell
                key={vod.id}
                title={vod.title}
                sub={`${vod.durationLabel} · ${formatCount(vod.viewsCount)}再生`}
                image={vod.coverImageUrl}
                onOpen={() => onOpenVod(vod.id)}
                onMore={() => setMenu({ kind: 'vod', id: vod.id, title: vod.title })}
              />
            ))}
          </div>
        )
      ) : (
        <TogetherList
          charName={currentChar?.name || ''}
          npcs={npcs}
          history={history}
          showRule={showNpcRule}
          rule={npcCustomRule}
          onToggleRule={onToggleNpcRule}
          onChangeRule={onChangeNpcRule}
          onAiRule={onAiNpcRule}
          onRefresh={onRefreshNpcPool}
          busy={aiHelperBusy}
          onStart={onStartNpc}
          onOpenHistory={onOpenNpcSession}
          layout="nico"
        />
      )}
    </div>
  );

  return (
    <div className={`live-ui relative h-full w-full flex flex-col overflow-hidden ${isNico ? 'bg-[#f6f6f6] text-[#222]' : 'bg-white text-[#0f0f0f]'}`} style={{ fontFamily: isNico ? nicoFont : ytFont }}>
      <LiveUiStyle />
      {isNico ? (
        <header className="h-12 px-1 bg-white border-b border-[#e6e6e6] flex items-center shrink-0">
          <IconButton label="返回" onClick={stepBack}>
            <Icon name="back" />
          </IconButton>
          <NicoMark />
          <div className="flex-1" />
          <IconButton label="搜索" onClick={() => setSearchOpen(v => !v)}>
            <Icon name="search" />
          </IconButton>
          <IconButton label="私聊" onClick={onOpenPhone}>
            <Icon name="chat" />
          </IconButton>
          <IconButton label="设置" onClick={() => setSheet('settings')}>
            <Icon name="gear" />
          </IconButton>
        </header>
      ) : (
        <header className="h-12 px-1 bg-white flex items-center shrink-0">
          <IconButton label="返回" onClick={stepBack}>
            <Icon name="back" />
          </IconButton>
          {searchOpen ? (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索直播和视频"
              aria-label="搜索"
              className="flex-1 min-w-0 h-9 px-3 rounded-full bg-[#f2f2f2] text-[14px] focus:outline-none"
            />
          ) : (
            <>
              <YtMark />
              <div className="flex-1" />
            </>
          )}
          <IconButton label={searchOpen ? '关闭搜索' : '搜索'} onClick={() => { setSearchOpen(v => !v); if (searchOpen) setQuery(''); }}>
            <Icon name={searchOpen ? 'close' : 'search'} />
          </IconButton>
          <IconButton label="私聊" onClick={onOpenPhone}>
            <Icon name="chat" />
          </IconButton>
          <button
            type="button"
            aria-label="账号"
            onClick={() => setSheet('accounts')}
            className="w-11 h-11 inline-flex items-center justify-center"
          >
            <Avatar src={currentChar?.avatar} name={currentChar?.name || ''} size={28} />
          </button>
        </header>
      )}

      {isNico && searchOpen && (
        <div className="bg-white px-3 py-2 border-b border-[#e6e6e6] shrink-0">
          <TextInput
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="番組・動画を検索"
            aria-label="搜索"
          />
        </div>
      )}

      {isNico && (
        <div className="bg-white border-b border-[#e6e6e6] flex shrink-0">
          {(
            [
              ['live', '生放送'],
              ['vod', '動画'],
              ['together', 'ミラー'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 h-11 text-[14px] font-medium border-b-2 ${
                tab === id ? 'border-[#111] text-[#111]' : 'border-transparent text-[#767676]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">{isNico ? nicoBody : ytFeed}</div>

      {isNico ? (
        <div className="shrink-0 bg-white border-t border-[#e6e6e6] px-3 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          {tab === 'together' ? (
            <div className="flex gap-2">
              <button type="button" onClick={onToggleNpcRule} className="flex-1 h-12 border border-[#111] text-[14px] font-medium">
                好み
              </button>
              <button type="button" disabled={aiHelperBusy} onClick={onRefreshNpcPool} className="flex-1 h-12 bg-[#111] text-white text-[14px] font-medium disabled:opacity-40">
                {aiHelperBusy ? '入替中…' : '別の番組'}
              </button>
            </div>
          ) : tab === 'you' ? null : (
            <button
              type="button"
              onClick={tab === 'vod' ? openUpload : openGoLive}
              className="w-full h-12 bg-[#111] text-white text-[15px] font-medium"
            >
              {tab === 'vod' ? '動画を投稿' : '番組を作る'}
            </button>
          )}
        </div>
      ) : (
        <nav className="shrink-0 h-14 border-t border-[#e5e5e5] bg-white flex pb-[env(safe-area-inset-bottom)]" aria-label="主导航">
          <NavItem label="首页" icon="home" active={tab === 'live'} onClick={() => setTab('live')} />
          <NavItem label="视频" icon="video" active={tab === 'vod'} onClick={() => setTab('vod')} />
          <NavItem label="创建" icon="plus" active={false} onClick={() => setSheet('create')} />
          <NavItem label="陪看" icon="people" active={tab === 'together'} onClick={() => setTab('together')} />
          <NavItem label="你的" icon="person" active={tab === 'you'} onClick={() => setTab('you')} />
        </nav>
      )}

      <Sheet open={sheet === 'create'} title="创建" onClose={() => setSheet('none')}>
        <MenuRow label="开始直播" hint="用当前频道开一场" onClick={openGoLive} />
        <MenuRow label="发布视频" hint="做一条投稿" onClick={openUpload} />
      </Sheet>

      <Sheet
        open={sheet === 'goLive'}
        title={isNico ? '番組を作る' : '开始直播'}
        onClose={() => setSheet('none')}
        footer={
          <button
            type="button"
            disabled={isGenerating || !activeChannel}
            onClick={onStartStream}
            className={`w-full h-12 text-white text-[15px] font-medium disabled:opacity-40 ${isNico ? 'bg-[#111]' : 'bg-[#ff0000] rounded-full'}`}
          >
            {isGenerating ? '正在接通…' : isNico ? '放送開始' : '开始直播'}
          </button>
        }
      >
        <FieldLabel>分区</FieldLabel>
        <label className="flex h-11 items-center rounded-lg bg-[#f2f2f2] px-3">
          <select
            aria-label="分区"
            value={selectedPresetKey}
            onChange={e => onSelectPreset(e.target.value)}
            className="min-w-0 flex-1 appearance-none bg-transparent text-[14px] text-[#0f0f0f] focus:outline-none"
          >
            {STREAM_PRESET_TEMPLATES.map(tpl => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.label}
              </option>
            ))}
            <option value="custom">自定义</option>
          </select>
          <span aria-hidden="true" className="ml-2 shrink-0 text-[10px] text-[#909090]">
            ▾
          </span>
        </label>
        {selectedPresetKey === 'custom' ? (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#0f0f0f]">自定义分区</span>
              <button
                type="button"
                onClick={openCategoryPicker}
                className="h-8 rounded-full bg-[#f2f2f2] px-3 text-[11px] font-medium text-[#0f0f0f]"
              >
                ✨ 推荐三个 ›
              </button>
            </div>
            <div className="mt-2 text-[11px] text-[#606060]">分区名</div>
            <div className="mt-1 flex h-11 items-center rounded-lg bg-[#f2f2f2] px-3">
              <input
                value={customCategoryName}
                onChange={e => {
                  const next = e.target.value;
                  onChangeCategoryName(next);
                  // 手打的字就不带英文尾巴；英文只跟着推荐走
                  if (next !== pickedCategoryLabel) {
                    setPickedCategoryLabel('');
                    onChangeCategoryEn('');
                  }
                }}
                maxLength={8}
                placeholder="例如：深夜厨房"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-[#0f0f0f] placeholder:text-[#909090] focus:outline-none"
              />
              {customCategoryEn ? (
                <span className="ml-2 max-w-[45%] shrink-0 truncate text-[11px] text-[#909090]">
                  {customCategoryEn}
                </span>
              ) : null}
            </div>
            <div className="mt-3 text-[11px] text-[#606060]">分区介绍（可不填）</div>
            <textarea
              rows={2}
              value={customCategoryHint}
              onChange={e => onChangeCategoryHint(e.target.value)}
              placeholder="这一类直播的画面和氛围"
              className="mt-1 w-full resize-none rounded-lg bg-[#f2f2f2] px-3 py-2 text-[12px] leading-5 text-[#0f0f0f] placeholder:text-[#909090] focus:outline-none"
            />
          </div>
        ) : null}
        <div className="mt-5 flex items-end justify-between">
          <FieldLabel>标题</FieldLabel>
          {!(customStreamTitle.trim() || customStreamTopic.trim()) ? (
            <button
              type="button"
              disabled={aiHelperBusy}
              onClick={() => onAiStream(streamAiDirection)}
              className="mb-1.5 h-8 rounded-full bg-[#f2f2f2] px-3 text-[11px] font-medium text-[#0f0f0f] disabled:opacity-40"
            >
              {aiHelperBusy ? '正在写…' : '让辅助模型写标题'}
            </button>
          ) : null}
        </div>
        <TextInput
          value={customStreamTitle}
          onChange={e => onChangeStreamTitle(e.target.value)}
          placeholder={
            selectedPresetKey === 'custom'
              ? '不填就用分区名当标题'
              : '不填就用这个分类的默认标题'
          }
        />
        <div className="h-3" />
        {topicOpen || customStreamTopic.trim() ? (
          <>
            <FieldLabel>今天播什么</FieldLabel>
            <TextArea
              rows={2}
              value={customStreamTopic}
              onChange={e => onChangeStreamTopic(e.target.value)}
              placeholder="想聊的事、临时插曲。可以空着。"
              className="resize-none"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setTopicOpen(true)}
            className="text-[11px] font-medium text-[#606060] underline underline-offset-2"
          >
            + 今天播什么（可选）
          </button>
        )}
        {customStreamTitle.trim() || customStreamTopic.trim() ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={streamAiDirection}
              onChange={e => setStreamAiDirection(e.target.value)}
              aria-label="标题想往哪个方向写"
              placeholder="标题想往哪个方向写？"
              className="h-9 min-w-0 flex-1 rounded-lg bg-[#f2f2f2] px-3 text-[12px] text-[#0f0f0f] placeholder:text-[#909090] focus:outline-none"
            />
            <button
              type="button"
              disabled={aiHelperBusy}
              onClick={() => onAiStream(streamAiDirection)}
              className="h-8 shrink-0 rounded-full bg-[#f2f2f2] px-3 text-[11px] font-medium text-[#0f0f0f] disabled:opacity-40"
            >
              {aiHelperBusy ? '正在写…' : '换一版'}
            </button>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={sheet === 'upload'} title={isNico ? '動画を投稿' : '发布视频'} onClose={() => setSheet('none')}>
        <FieldLabel>分区</FieldLabel>
        <TextInput value={customVodCategory} onChange={e => onChangeVodCategory(e.target.value)} placeholder="例如日常" />
        <div className="h-3" />
        <FieldLabel>标题</FieldLabel>
        <TextInput value={customVodTitle} onChange={e => onChangeVodTitle(e.target.value)} placeholder="视频标题" />
        <div className="mt-2">
          <button type="button" disabled={aiHelperBusy} onClick={onAiVod} className="h-11 text-[14px] font-medium underline disabled:opacity-40">
            {aiHelperBusy ? '正在写…' : '让辅助模型写选题'}
          </button>
        </div>
        <button
          type="button"
          disabled={isGenerating || !activeChannel}
          onClick={onCreateVod}
          className={`mt-4 w-full h-12 text-white text-[15px] font-medium disabled:opacity-40 ${isNico ? 'bg-[#111]' : 'bg-[#0f0f0f] rounded-full'}`}
        >
          {isGenerating ? '正在做分镜…' : '发布'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'accounts'} title="账号" onClose={() => setSheet('none')}>
        <CharList characters={characters} currentId={currentChar?.id} onSelect={id => { onSelectChar(id); setSheet('none'); }} />
        <div className="h-3" />
        <MenuRow label="你的频道和外观" onClick={() => { setSheet('none'); setTab('you'); }} />
      </Sheet>

      <Sheet open={sheet === 'settings'} title="設定" onClose={() => setSheet('none')}>
        <MenuRow label="チャンネル" hint={activeChannel?.channelName} onClick={() => { setSheet('none'); setTab('you'); }} />
        <MenuRow label="視聴者名" hint={persona?.name} onClick={() => { setSheet('none'); onOpenPersonas(); }} />
        <MenuRow label="私聊" onClick={() => { setSheet('none'); onOpenPhone(); }} />
        <div className="h-2" />
        <div className="pt-2 pb-1 px-1 text-[11px] font-bold tracking-[0.1em] text-[#a3a3a3]">リアルタイム背景</div>
        <RealtimeToggleRow
          label="实时背景（总开关）"
          detail="关掉后直播和陪看不再读天气、新闻和时间"
          checked={onAirRealtime.enabled}
          onChange={next => onChangeOnAirRealtime({ ...onAirRealtime, enabled: next })}
        />
        {onAirRealtime.enabled && (
          <>
            <RealtimeToggleRow
              label="天气"
              checked={onAirRealtime.weather}
              onChange={next => onChangeOnAirRealtime({ ...onAirRealtime, weather: next })}
            />
            <RealtimeToggleRow
              label="新闻 / 热点"
              checked={onAirRealtime.news}
              onChange={next => onChangeOnAirRealtime({ ...onAirRealtime, news: next })}
            />
            <RealtimeToggleRow
              label="日本热点"
              checked={onAirRealtime.jpHot}
              onChange={next => onChangeOnAirRealtime({ ...onAirRealtime, jpHot: next })}
            />
            <RealtimeToggleRow
              label="当前时间 / 节日"
              checked={onAirRealtime.time}
              onChange={next => onChangeOnAirRealtime({ ...onAirRealtime, time: next })}
            />
            <RealtimeToggleRow
              label="真实定位"
              detail="只给角色自己看，不进公屏，也不会给第三方主播"
              checked={onAirRealtime.location}
              onChange={next => onChangeOnAirRealtime({ ...onAirRealtime, location: next })}
            />
          </>
        )}
        <p className="px-1 pb-2 text-[11px] leading-relaxed text-[#909090]">
          这些只作用于电波里的生成，不会改系统「实时感知」设置；系统那边关着的时候，这里打开也不会绕过。
        </p>
        <div className="h-2" />
        <FieldLabel>見た目</FieldLabel>
        <ThemeRows theme={platformTheme} onChange={onChangePlatformTheme} />
        <SectionTitle>キャラ</SectionTitle>
        <CharList characters={characters} currentId={currentChar?.id} onSelect={onSelectChar} />
      </Sheet>

      <Sheet open={Boolean(menu)} title={menu?.title || '操作'} onClose={() => setMenu(null)}>
        <MenuRow
          label="打开"
          detail="进入这一场，停在最新一句。"
          onClick={() => {
            if (!menu) return;
            if (menu.kind === 'live') onOpenLive(menu.id);
            else onOpenVod(menu.id);
            setMenu(null);
          }}
        />
        {menu?.kind === 'live' && (
          <MenuRow
            label="编辑这场直播的信息"
            detail="改标题、分区和今日走向；后面推进的直播按新信息继续。"
            onClick={() => {
              if (!menu) return;
              onEditLive(menu.id);
              setMenu(null);
            }}
          />
        )}
        <MenuRow
          label="删除这条记录"
          detail="从手机里删掉。删了就没有了。"
          danger
          onClick={() => {
            if (!menu) return;
            if (menu.kind === 'live') onDeleteLive(menu.id);
            else onDeleteVod(menu.id);
            setMenu(null);
          }}
        />
      </Sheet>

      {categoryPickerOpen ? (
        <div className="absolute inset-0 z-[90] flex flex-col justify-end">
          <button
            type="button"
            aria-label="关闭推荐"
            className="absolute inset-0 bg-black/20"
            onClick={() => setCategoryPickerOpen(false)}
          />
          <div className="relative max-h-[80%] rounded-t-2xl bg-[#f7f7f7] px-4 pt-4 pb-[max(32px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-medium text-[#0f0f0f]">推荐分区</h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setCategoryPickerOpen(false)}
                className="h-9 w-9 text-[18px] leading-none text-[#606060]"
              >
                ×
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={categoryDirection}
                onChange={e => setCategoryDirection(e.target.value)}
                aria-label="分区想换个方向"
                placeholder="分区想换个方向？可不填"
                className="h-10 min-w-0 flex-1 rounded-lg bg-white px-3 text-[12px] text-[#0f0f0f] placeholder:text-[#909090] focus:outline-none"
              />
              <button
                type="button"
                disabled={categoryBusy}
                onClick={() => void recommendCategories()}
                className="h-10 shrink-0 rounded-full bg-[#ececec] px-4 text-[12px] font-medium text-[#0f0f0f] disabled:opacity-40"
              >
                {categoryBusy ? '正在想…' : '换一批'}
              </button>
            </div>
            <div className="mt-5 max-h-[52vh] space-y-2.5 overflow-y-auto">
              {categorySuggestions.map(item => (
                <button
                  key={`${item.label}-${item.labelEn}`}
                  type="button"
                  onClick={() => {
                    onSelectPreset('custom');
                    onChangeCategoryName(item.label);
                    onChangeCategoryEn(item.labelEn);
                    onChangeCategoryHint(item.hint);
                    setPickedCategoryLabel(item.label);
                    setCategoryPickerOpen(false);
                  }}
                  className="w-full rounded-xl bg-white px-3 py-3.5 text-left active:bg-[#fafafa]"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-medium text-[#0f0f0f]">{item.label}</span>
                    {item.labelEn ? (
                      <span className="min-w-0 truncate text-[11px] text-[#909090]">
                        {item.labelEn}
                      </span>
                    ) : null}
                  </div>
                  {item.hint ? (
                    <p className="mt-1 text-[11.5px] leading-5 text-[#606060]">{item.hint}</p>
                  ) : null}
                </button>
              ))}
              {!categorySuggestions.length && !categoryBusy ? (
                <p className="py-8 text-center text-[12px] text-[#909090]">
                  这次没想出像分区的，点「换一批」再试
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {channelModal}
      {personaModal}
    </div>
  );
}

const ytFont = 'Roboto, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif';
const nicoFont = '"Yu Gothic UI", "Hiragino Sans", Meiryo, "PingFang SC", "Noto Sans SC", sans-serif';

function RealtimeToggleRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full min-h-12 px-1 py-2 flex items-center justify-between gap-3 text-left active:bg-[#fafafa]"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-[#0f0f0f]">{label}</span>
        {detail ? <span className="block text-[11px] text-[#909090] leading-snug mt-0.5">{detail}</span> : null}
      </span>
      <span
        className="shrink-0 w-11 h-6 rounded-full relative transition-colors"
        style={{ background: checked ? '#0f0f0f' : '#d4d4d4' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
          style={{ left: checked ? 22 : 2 }}
        />
      </span>
    </button>
  );
}

function Avatar({ src, name, size }: { src?: string; name: string; size: number }) {
  if (src) {
    return <TokenImg value={src} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="rounded-full bg-[#e5e5e5] text-[#0f0f0f] inline-flex items-center justify-center font-medium shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.38) }}
    >
      {(name || '?').slice(0, 1)}
    </span>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: 'home' | 'video' | 'plus' | 'people' | 'person';
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-14 inline-flex flex-col items-center justify-center gap-0.5 ${active ? 'text-[#0f0f0f]' : 'text-[#606060]'}`}
    >
      <Icon name={icon} size={22} />
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  );
}

function YtRow({
  title,
  meta,
  badge,
  time,
  image,
  avatar,
  avatarName,
  rebuilt,
  onOpen,
  onAvatar,
  onMore,
}: {
  title: string;
  meta: string;
  badge?: string;
  time?: string;
  image?: string;
  avatar?: string;
  avatarName: string;
  rebuilt?: boolean;
  onOpen: () => void;
  onAvatar: () => void;
  onMore?: () => void;
}) {
  return (
    <article className="pb-4">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="relative block aspect-video bg-[#141414]">
          {image ? (
            <TokenImg value={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-white">
              <Avatar src={avatar} name={avatarName || title} size={56} />
            </span>
          )}
          {badge ? (
            <span className="absolute left-2 bottom-2 h-5 px-1.5 inline-flex items-center bg-[#ff0000] text-white text-[12px] font-medium">
              {badge}
            </span>
          ) : null}
          {time ? (
            <span className="absolute right-2 bottom-2 h-5 px-1.5 inline-flex items-center bg-black/80 text-white text-[12px] rounded-sm">
              {time}
            </span>
          ) : null}
          {rebuilt ? (
            <span className="absolute right-2 top-2 h-5 px-1.5 inline-flex items-center bg-white/90 text-[#606060] text-[11px] rounded-sm">
              已重建
            </span>
          ) : null}
        </span>
      </button>
      <div className="flex items-start gap-3 px-3 pt-3">
        <button type="button" aria-label="频道设置" onClick={onAvatar} className="mt-0.5">
          <Avatar src={avatar} name={avatarName} size={36} />
        </button>
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
          <span className="block text-[14px] leading-5 font-medium text-[#0f0f0f] line-clamp-2">{title}</span>
          <span className="block text-[12px] leading-4 text-[#606060] mt-1 break-words">{meta}</span>
        </button>
        {onMore ? (
          <IconButton label="更多操作" onClick={onMore}>
            <Icon name="more" size={20} />
          </IconButton>
        ) : (
          <span className="w-11" />
        )}
      </div>
    </article>
  );
}

function NicoCell({
  title,
  sub,
  image,
  live,
  rebuilt,
  onOpen,
  onMore,
}: {
  title: string;
  sub: string;
  image?: string;
  live?: boolean;
  rebuilt?: boolean;
  onOpen: () => void;
  onMore?: () => void;
}) {
  return (
    <article className="bg-white">
      <div className="relative">
        <button type="button" onClick={onOpen} className="block w-full text-left">
          <span className="relative block aspect-video bg-[#141414]">
            {image ? (
              <TokenImg value={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-white/90">
                <Icon name="play" size={28} />
              </span>
            )}
            {live ? (
              <span className="absolute left-1 top-1 h-4 px-1 inline-flex items-center bg-[#c62828] text-white text-[10px] font-bold">
                LIVE
              </span>
            ) : null}
            {rebuilt ? (
              <span className="absolute left-1 bottom-1 h-4 px-1 inline-flex items-center bg-black/70 text-white text-[10px]">
                已重建
              </span>
            ) : null}
          </span>
        </button>
        {onMore ? (
          <span className="absolute top-0 right-0 text-white">
            <IconButton label="更多操作" onClick={onMore}>
              <Icon name="more" size={18} />
            </IconButton>
          </span>
        ) : null}
      </div>
      <button type="button" onClick={onOpen} className="block w-full text-left px-1.5 py-1.5">
        <span className="block text-[13px] leading-[18px] text-[#222] break-words">{title}</span>
        <span className="block text-[11px] leading-4 text-[#767676] mt-0.5 break-words">{sub}</span>
      </button>
    </article>
  );
}

function TogetherList(props: {
  charName: string;
  npcs: NpcStreamerChannelCard[];
  history: NpcWatchSession[];
  showRule: boolean;
  rule: string;
  onToggleRule: () => void;
  onChangeRule: (v: string) => void;
  onAiRule: () => void;
  onRefresh: () => void;
  busy: boolean;
  onStart: (c: NpcStreamerChannelCard) => void;
  onOpenHistory: (id: string) => void;
  layout: 'yt' | 'nico';
}) {
  const yt = props.layout === 'yt';
  return (
    <div>
      <div className={`px-3 pt-3 pb-1 ${yt ? '' : 'bg-white'}`}>
        <div className="text-[16px] font-medium break-words">和 {props.charName} 一起看</div>
        <div className="text-[12px] text-[#606060] mt-1 leading-5">路人主播在播，{props.charName} 坐在旁边跟你说话。</div>
        {yt && (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={props.onToggleRule} className="h-11 px-4 rounded-full bg-[#f2f2f2] text-[14px] font-medium">
              想看的类型
            </button>
            <button type="button" disabled={props.busy} onClick={props.onRefresh} className="h-11 px-4 rounded-full bg-[#0f0f0f] text-white text-[14px] font-medium disabled:opacity-40">
              {props.busy ? '正在换…' : '换一批'}
            </button>
          </div>
        )}
        {props.showRule && (
          <div className="mt-3">
            <FieldLabel>想刷到什么样的直播</FieldLabel>
            <TextInput
              value={props.rule}
              onChange={e => props.onChangeRule(e.target.value)}
              placeholder="例如深夜散步、排练室、做饭翻车"
            />
            <button type="button" disabled={props.busy} onClick={props.onAiRule} className="h-11 text-[14px] underline disabled:opacity-40">
              {props.busy ? '正在写…' : '让辅助模型写这条规则'}
            </button>
          </div>
        )}
      </div>
      {props.npcs.length === 0 ? (
        <Empty text="现在没有可看的直播" action="换一批" onAction={props.onRefresh} />
      ) : yt ? (
        props.npcs.map(card => (
          <YtRow
            key={card.id}
            title={card.roomTitle}
            meta={`${card.npcName} · ${card.categoryLabel} · ${formatCount(card.viewerCount)} 人正在看`}
            badge="直播"
            avatarName={card.npcName}
            onOpen={() => props.onStart(card)}
            onAvatar={() => props.onStart(card)}
          />
        ))
      ) : (
        <div className="grid grid-cols-2 gap-2 px-2 pt-2">
          {props.npcs.map(card => (
            <NicoCell
              key={card.id}
              title={card.roomTitle}
              sub={`${card.npcName} · ${formatCount(card.viewerCount)}来場`}
              live
              onOpen={() => props.onStart(card)}
            />
          ))}
        </div>
      )}
      {props.history.length > 0 && (
        <div className="px-3 pt-4">
          <div className="text-[12px] text-[#606060] mb-1">{yt ? '看过的' : '見た番組'}</div>
          <ul>
            {props.history.map(sess => (
              <li key={sess.id}>
                <button
                  type="button"
                  onClick={() => props.onOpenHistory(sess.id)}
                  className="w-full min-h-11 py-2 text-left border-b border-[#eee]"
                >
                  <span className="block text-[14px] leading-5 break-words">{sess.npcRoomTitle}</span>
                  <span className="block text-[12px] text-[#606060] mt-0.5">
                    {sess.npcStreamerName} · {sess.beats.length} 拍
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Empty({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[14px] leading-6 text-[#606060]">{text}</p>
      {action && onAction ? (
        <button type="button" onClick={onAction} className="mt-4 h-11 px-5 rounded-full bg-[#0f0f0f] text-white text-[14px] font-medium">
          {action}
        </button>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 mb-2 text-[12px] font-medium text-[#606060]">{children}</h3>;
}

function MenuRow({
  label,
  hint,
  detail,
  onClick,
  danger,
}: {
  label: string;
  hint?: string;
  detail?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-11 py-2 text-left border-b border-[#f0f0f0] ${danger ? 'text-[#c62828]' : ''}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[15px]">{label}</span>
        {hint ? <span className="text-[12px] text-[#606060] truncate max-w-[50%]">{hint}</span> : null}
      </span>
      {detail ? <span className="block text-[12px] leading-5 text-[#606060] mt-0.5">{detail}</span> : null}
    </button>
  );
}

function ThemeRows({
  theme,
  onChange,
}: {
  theme: LivePlatformTheme;
  onChange: (t: LivePlatformTheme) => void;
}) {
  return (
    <ul>
      {(
        [
          ['youtube', 'YouTube'],
          ['niconico', 'ニコニコ生放送'],
        ] as const
      ).map(([id, label]) => (
        <li key={id}>
          <button type="button" onClick={() => onChange(id)} className="w-full min-h-11 flex items-center justify-between text-left">
            <span className="text-[15px]">{label}</span>
            {theme === id ? <Icon name="check" size={20} /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CharList({
  characters,
  currentId,
  onSelect,
}: {
  characters: CharLite[];
  currentId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul>
      {characters.map(c => (
        <li key={c.id}>
          <button type="button" onClick={() => onSelect(c.id)} className="w-full min-h-11 py-1.5 flex items-center gap-3 text-left">
            <Avatar src={c.avatar} name={c.name} size={32} />
            <span className="flex-1 text-[15px] break-words">{c.name}</span>
            {c.id === currentId ? <Icon name="check" size={18} /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
