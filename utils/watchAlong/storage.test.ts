import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectVoiceIds,
  createSession,
  deleteWatchSession,
  loadWatchGlobals,
  loadWatchSessions,
  normalizeSession,
  saveWatchGlobals,
  saveWatchSession,
} from './storage';
import { defaultCast, defaultGlobals, defaultWatchSettings } from './types';
import type { WatchAlongSession, WatchRoom } from './types';

// 这组钉住期二骨架的三条生死线：
//   1. 旧版陪看记录（没有房间结构、没有双人账号、没有私聊列表）点开不能崩，台词与角色吐槽还看得见；
//   2. 新记录存进去再读出来，幕、私聊、摘要一格不少；
//   3. 删除时能把该场的语音缓存编号交出去，好让调用方清干净录音。

const CHAR_ID = 'char_test';

function newSession(): WatchAlongSession {
  const room: WatchRoom = {
    streamerName: '阿茶',
    streamerHandle: '@acha_live',
    category: '深夜塔罗',
    title: '半夜给你抽一张',
    titleTranslated: '',
    bio: '抽牌只说实话',
    profile: {
      ageBand: 23,
      identity: '普通人',
      language: 'zh',
      screenForm: 'live',
      category: '深夜塔罗',
      tier: 'mid',
      speechStyle: '嘴硬心软，爱说「那个」',
      motive: '今晚把塔罗牌讲完',
    },
    viewerCount: 3210,
    customRule: '',
    coverGradient: '#101820',
  };
  return {
    id: 'watch_new_1',
    charId: CHAR_ID,
    status: 'watching',
    createdAt: 1000,
    updatedAt: 1000,
    room,
    cast: { ...defaultCast('阿猫'), presence: 'backstage', autoReact: false },
    beats: [
      {
        id: 'b1',
        index: 0,
        scene: '她把牌推到镜头前，桌角的水杯晃了一下',
        speech: '这位同学今晚心里有人',
        seq: [
          { kind: 'line', text: '这位同学今晚心里有人' },
          { kind: 'scene', text: '她把牌推到镜头前' },
        ],
        danmaku: [{ id: 'd1', author: '夜猫', text: '准！', translated: '' }],
        hot: true,
        userActions: [{ id: 'ua1', kind: 'danmaku', text: '哈哈哈哈' }],
        charActions: [{ id: 'ca1', kind: 'gift', giftName: '小鱼干', giftAmount: 6 }],
        charMicLine: '你别乱说啊',
        charMicVoiceId: 'voice_mic_1',
        at: 1100,
      },
    ],
    chat: [
      { id: 'c1', from: 'user', text: '她在唬人吧', beatIndex: 0, at: 1200 },
      { id: 'c2', from: 'char', text: '你不懂', voiceId: 'voice_chat_1', beatIndex: 0, at: 1300 },
      {
        id: 'c3',
        from: 'clip',
        clip: { beatIndex: 0, streamerName: '阿茶', scene: '画面', speech: '台词', danmaku: ['准！'] },
        at: 1400,
      },
    ],
    digests: [{ id: 'g1', fromBeat: 0, toBeat: 0, text: '抽了一张牌', at: 1500 }],
    director: '让主播翻车',
  };
}

beforeEach(async () => {
  // 每例从空表开始
  const { liveNpcWatchDb, liveKvDb } = await import('../liveStreamDb');
  const rows = await liveNpcWatchDb.getAll();
  for (const row of rows) await liveNpcWatchDb.delete(String(row.id));
  await liveKvDb.delete('watch_along_globals_v1');
});

describe('旧版记录打开不崩', () => {
  it('旧字段翻译进新结构，台词与角色吐槽都还在', async () => {
    const legacy = {
      id: 'npcw_old_1',
      charId: CHAR_ID,
      npcStreamerName: '路人甲',
      npcHandle: '@old',
      npcCategoryLabel: '看相',
      npcRoomTitle: '给你看手相',
      npcBio: '不收钱',
      viewerCount: 88,
      createdAt: 500,
      beats: [
        {
          id: 'oldb1',
          index: 0,
          npcScreen: '他摊开手掌',
          npcSpeech: '你这条线断过',
          npcDanmaku: ['怕了', { id: 'x', senderName: '老王', text: '真准' }],
          charReactionAction: '在台下小声嘀咕',
          charReactionSpeech: '这套路太老了吧',
          userActionNote: '我笑出声',
        },
      ],
    };

    const s = normalizeSession(legacy, '阿猫');
    expect(s.legacy).toBe(true);
    expect(s.status).toBe('watching');
    expect(s.room.streamerName).toBe('路人甲');
    expect(s.room.title).toBe('给你看手相');
    expect(s.beats[0].scene).toBe('他摊开手掌');
    expect(s.beats[0].danmaku.map(d => d.text)).toEqual(['怕了', '真准']);
    // 旧记录的角色吐槽与用户动作转成私聊，点开还看得见
    expect(s.chat.map(c => c.from)).toEqual(['action', 'char', 'user']);
    expect(s.chat.some(c => c.text === '这套路太老了吧')).toBe(true);
    expect(s.cast.userAccount.nickname).toBeTruthy();
    // 旧记录只有一句话 bio、没有档案：bio 自己照旧当简介显示；档案给空值，不报错也不空白
    expect(s.room.bio).toBe('不收钱');
    expect(s.room.profile?.ageBand).toBe('');
    expect(s.room.profile?.language).toBe('zh');
    expect(s.room.profile?.screenForm).toBe('live');
    expect(s.room.profile?.tier).toBe('mid');

    await saveWatchSession(s);
    const loaded = await loadWatchSessions('阿猫');
    expect(loaded.length).toBe(1);
    expect(loaded[0].beats[0].speech).toBe('你这条线断过');
    expect(loaded[0].legacy).toBe(true);
  });
});

describe('新记录原样往返', () => {
  it('幕、私聊、摘要一格不少', async () => {
    await saveWatchSession(newSession());
    const [s] = await loadWatchSessions('阿猫');

    expect(s.room.streamerName).toBe('阿茶');
    expect(s.cast.presence).toBe('backstage');
    expect(s.cast.autoReact).toBe(false);
    expect(s.beats[0].hot).toBe(true);
    expect(s.beats[0].charActions[0].kind).toBe('gift');
    expect(s.beats[0].charMicLine).toBe('你别乱说啊');
    expect(s.chat.map(c => c.from)).toEqual(['user', 'char', 'clip']);
    expect(s.chat[2].clip?.speech).toBe('台词');
    expect(s.digests[0].text).toBe('抽了一张牌');
    expect(s.director).toBe('让主播翻车');
    expect(s.legacy).toBe(false);
    // 新字段一起存回表里、读出来还在
    expect(s.room.profile?.tier).toBe('mid');
    expect(s.room.profile?.ageBand).toBe(23);
    expect(s.room.profile?.speechStyle).toBe('嘴硬心软，爱说「那个」');
    expect(s.room.titleTranslated).toBe('');
    expect(s.beats[0].seq?.length).toBe(2);
    expect(s.beats[0].seq?.[0].kind).toBe('line');
    expect(s.beats[0].seq?.[0].translated).toBe('');
    expect(s.beats[0].danmaku[0].translated).toBe('');
  });
});

describe('外语直播的新字段能存能取', () => {
  it('档案、译题、台词译文、弹幕译文往返不丢', async () => {
    const s = newSession();
    s.room.profile = {
      ageBand: 28,
      identity: '虚拟主播',
      language: 'ja',
      screenForm: 'vtuber',
      category: '杂谈',
      tier: 'big',
      speechStyle: '社恐晚期，爱说「えっと」',
      motive: '今晚冲十万关注',
    };
    s.room.titleTranslated = '今晚把歌单唱完';
    s.beats[0].seq = [
      { kind: 'line', text: 'はい、次の曲いきます', translated: '好，下一首来了' },
      { kind: 'scene', text: '皮套切到唱歌表情' },
    ];
    s.beats[0].danmaku = [{ id: 'd1', author: '通りすがり', text: 'うまい', translated: '好听' }];

    await saveWatchSession(s);
    const [loaded] = await loadWatchSessions('阿猫');

    expect(loaded.room.profile?.language).toBe('ja');
    expect(loaded.room.profile?.screenForm).toBe('vtuber');
    expect(loaded.room.profile?.tier).toBe('big');
    expect(loaded.room.titleTranslated).toBe('今晚把歌单唱完');
    expect(loaded.beats[0].seq?.[0].translated).toBe('好，下一首来了');
    expect(loaded.beats[0].seq?.[1].translated).toBe('');
    expect(loaded.beats[0].danmaku[0].translated).toBe('好听');
  });
});

describe('删除要把录音交出来', () => {
  it('删掉后返回该场记录，语音编号能收全', async () => {
    const s = newSession();
    await saveWatchSession(s);

    const removed = await deleteWatchSession(s.id);
    expect(removed?.id).toBe(s.id);
    expect(removed && collectVoiceIds(removed).sort()).toEqual(['voice_chat_1', 'voice_mic_1']);

    expect(await loadWatchSessions()).toEqual([]);
  });
});

describe('全局杂项', () => {
  it('房间池、规则、默认账号能存能取', async () => {
    const base = defaultGlobals('阿猫');
    const next = {
      ...base,
      customRule: '多看塔罗和鉴宝',
      pool: [
        {
          id: 'room_1',
          styleTag: '神秘',
          streamerName: '阿茶',
          streamerHandle: '@acha',
          category: '塔罗',
          title: '抽一张',
          bio: '只说真话',
          viewerCount: 120,
          customRule: '',
          coverGradient: '#000',
        },
      ],
    };
    await saveWatchGlobals(next);

    const loaded = await loadWatchGlobals('阿猫');
    expect(loaded.customRule).toBe('多看塔罗和鉴宝');
    expect(loaded.pool.length).toBe(1);
    expect(loaded.pool[0].streamerName).toBe('阿茶');
  });
});

describe('封面跟着房间走', () => {
  it('进房再读档，coverSvg 还在', async () => {
    const svg =
      '<svg viewBox="0 0 160 90"><rect width="160" height="90" fill="#f6e7c1"/><circle cx="80" cy="70" r="16" fill="#e07a3d"/></svg>';
    const session = createSession({
      charId: CHAR_ID,
      charName: '阿猫',
      settings: defaultWatchSettings(),
      room: {
        id: 'room_cover',
        styleTag: '日常',
        streamerName: '晚风',
        streamerHandle: '@wind',
        category: '做饭吃播',
        title: '今晚做一锅汤',
        bio: '厨房',
        viewerCount: 80,
        customRule: '',
        coverGradient: '#e7d5c0,#c4a484',
        coverSvg: svg,
      },
    });
    expect(session.room.coverSvg).toContain('<rect');
    await saveWatchSession(session);
    const [loaded] = await loadWatchSessions('阿猫');
    expect(loaded.room.coverSvg).toContain('<rect');
    expect(loaded.room.coverSvg).not.toMatch(/<script/i);
    expect(loaded.room.coverGradient).toBe('#e7d5c0,#c4a484');
  });
});
