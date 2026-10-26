/**
 * 陪看解析层：模型写歪了也得接住。
 *
 * 这批用例全部来自「模型真的会这么写」的样本——带序号、带星号、
 * 裹代码块、只写一段话、昵称里带冒号，全都要能认出来。
 */
import { describe, expect, it } from 'vitest';
import { __parseChar, __parseRooms, __parseStage } from './engine';
import { buildStageTask } from './prompts';
import type { WatchAlongSession, WatchStreamerProfile } from './types';

describe('台上这一幕的解析', () => {
  it('标准写法', () => {
    const r = __parseStage(`画面：老陈把烙铁放回架子上，吹了下手指。
台词：这管子比我岁数还大，烫一下认个亲。
公屏：夜班司机：老陈你别吹了，我刚以为要起火
公屏：豆子：认亲笑死
高能：是`);
    expect(r.scene).toContain('烙铁');
    expect(r.speech).toContain('认个亲');
    expect(r.danmaku).toHaveLength(2);
    expect(r.danmaku[0]).toEqual({ id: expect.any(String), author: '夜班司机', text: '老陈你别吹了，我刚以为要起火' });
    expect(r.hot).toBe(true);
  });

  it('带序号、星号、代码块也能认', () => {
    const r = __parseStage('```\n1. **画面**：镜头推到一锅冒烟的粥。\n2. 台词：糊了糊了。\n```');
    expect(r.scene).toContain('冒烟的粥');
    expect(r.speech).toContain('糊了糊了');
  });

  it('弹幕用竖线隔开也认', () => {
    const r = __parseStage('画面：他把猫抱起来。\n台词：你踩我键盘。\n公屏：路人甲｜猫比你会播');
    expect(r.danmaku[0].author).toBe('路人甲');
    expect(r.danmaku[0].text).toBe('猫比你会播');
  });

  it('完全没按格式写：整段当画面，不让主播念旁白', () => {
    const r = __parseStage('他把手在裤子上擦了擦，说这台机器今天不听话。');
    expect(r.scene).toContain('擦');
    expect(r.speech).toBe('');
    expect(r.danmaku).toHaveLength(0);
  });

  it('整段里带引号：引号内当台词，引号外当画面', () => {
    const r = __parseStage('他凑近主机听了一下，说「这台是不是风扇卡住了」，然后又敲了两下外壳。');
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line', 'scene']);
    expect(r.speech).toContain('风扇卡住');
    expect(r.scene).toContain('凑近主机');
  });

  it('挤成一整行：行内标签要能切开，弹幕不许丢', () => {
    // 2026-10-26 真实故障：模型把整段写在一行里，屏幕上只显示半截、弹幕一条都没有
    const r = __parseStage(
      '画：伸手拨了一下头发 话：今天还是老样子 弹幕：小明：哈哈哈哈；阿七：这也行 点名：是',
    );
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line']);
    expect(r.seq[0].text).toContain('拨了一下头发');
    expect(r.seq[1].text).toContain('老样子');
    expect(r.danmaku).toHaveLength(2);
    expect(r.danmaku[0].author).toBe('小明');
    expect(r.hot).toBe(true);
  });

  it('弹幕写在标签下一行：要吸上来，不能整批丢', () => {
    const r = __parseStage(`画：锅里油热了
话：下锅下锅
弹幕：
小明：哈哈哈哈
阿七：这也行
点名：否`);
    expect(r.danmaku).toHaveLength(2);
    expect(r.danmaku.map(d => d.author)).toEqual(['小明', '阿七']);
    // 画和话还在，不能被弹幕吞掉
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line']);
  });

  it('整行认不出作者：直接丢掉，不许兜底成「路人」搬上公屏', () => {
    // 2026-10-26 实测：模型把自己的话整行吐出来，旧逻辑兜底成「路人」直接上了公屏
    const r = __parseStage('画：他敲了敲外壳\n话：应该没事\n弹幕：他刚才那句真的绝了：哈哈哈哈哈');
    expect(r.danmaku).toHaveLength(0);
  });

  it('模型把英文思考和自我说明当弹幕吐出来：整批丢掉（2026-10-26 实测事故）', () => {
    const r = __parseStage(`画：镜头对着桌上的模具
话：这个色再调一下
弹幕：路人｜Hmm 弹幕需要反映投票结果。Let me order
弹幕：order｜前两条是投票的余波，后面是反应。
点名：否`);
    expect(r.danmaku).toHaveLength(0);
  });

  it('超过 60 字的弹幕不是弹幕，是模型把正文挤了进来：丢掉', () => {
    const long = '3号'.repeat(35);
    const r = __parseStage(`画：他把模具翻过来
话：脱模了脱模了
弹幕：阿吉不吃姜｜${long}
点名：否`);
    expect(r.danmaku).toHaveLength(0);
  });

  it('正常的「作者｜内容」弹幕照旧保留', () => {
    const r = __parseStage(`画：他把模具翻过来
话：脱模了脱模了
弹幕：阿吉不吃姜｜3号3号3号
点名：否`);
    expect(r.danmaku).toHaveLength(1);
    expect(r.danmaku[0]).toEqual({ id: expect.any(String), author: '阿吉不吃姜', text: '3号3号3号' });
  });

  it('画面飘成日语中英日混排：整条丢掉，不报错（2026-10-26 实测）', () => {
    const r = __parseStage(`画：ルーレットの盤が回り続けて、数字のところでゆっくり止まる。皮套の表情が固まる。
话：あーもう、もう一回！
弹幕：みかん箱｜8きたああああ8来了啊啊啊啊
点名：否`);
    expect(r.seq.some(s => s.kind === 'scene')).toBe(false);
    expect(r.seq.every(s => s.kind === 'line')).toBe(true);
    expect(r.scene).toBe('');
    expect(r.speech).toContain('もう一回');
  });

  it('中文画面里夹数字和工序词：照旧保留', () => {
    const r = __parseStage('画：手把3号色精滴管伸进量杯，颜色发灰。');
    expect(r.seq).toHaveLength(1);
    expect(r.seq[0].kind).toBe('scene');
    expect(r.seq[0].text).toContain('量杯');
  });

  it('中文画面里夹一个英文词：不算外语画面，照旧保留', () => {
    const r = __parseStage('画：游戏窗口里血条掉到 5%，Boss 进了二阶段。');
    expect(r.seq).toHaveLength(1);
    expect(r.seq[0].kind).toBe('scene');
    expect(r.seq[0].text).toContain('二阶段');
  });

  it('模型把「这条弹幕是什么」写进公屏：丢掉', () => {
    const r = __parseStage(`画：他把转盘按住
话：停停停
弹幕：作者｜原话中文译文. Original in Japanese.
弹幕：Names｜no English. OK.
点名：否`);
    expect(r.danmaku).toHaveLength(0);
  });

  it('正常日语弹幕照旧保留', () => {
    const r = __parseStage(`话：はい、次いこ
弹幕：みかん箱｜8きたああああ8来了啊啊啊啊
点名：否`);
    expect(r.danmaku).toHaveLength(1);
    expect(r.danmaku[0]).toEqual({ id: expect.any(String), author: 'みかん箱', text: '8きたああああ8来了啊啊啊啊' });
  });

  it('一条太长：按句切开，拼回去一个字都不丢', () => {
    const body =
      '他把整箱零件倒在地上一件件分开，先按大小摆成一排，再把有锈的挑出来放右边，剩下的挨个用布擦干净。' +
      '旁边那台老机器已经拆到只剩骨架，螺丝按顺序摆在纸片上，一颗都没有混。' +
      '他说这台得慢慢来，急不得，急一次就要重新排一遍，一晚上就过去了。' +
      '窗台上还摆着几颗刚换下来的螺丝，按大小排成一列。';
    const r = __parseStage(`画：${body}`);
    expect(r.seq.length).toBeGreaterThan(1);
    for (const s of r.seq) expect(s.text.length).toBeLessThanOrEqual(120);
    // 切开之后拼回来必须还是原来那段话（只允许丢空白）
    expect(r.seq.map(s => s.text).join('').replace(/\s/g, '')).toBe(body.replace(/\s/g, ''));
  });

  it('塌成一整段又没有弹幕：就地切碎收下，绝不偷偷再问一遍（一次调用就是一次钱）', () => {
    const junk = '画：' + '他把镜头挪了挪又挪了挪。'.repeat(24);
    const r = __parseStage(junk);
    expect(r.seq.length).toBeGreaterThan(1);
    expect(r.seq.every(s => s.text.length <= 120)).toBe(true);
    expect(r.danmaku).toHaveLength(0);
  });

  it('画和话交替：按先后收成一串，屏幕上一条一条放', () => {
    const r = __parseStage(`画：他把手机往支架上一夹，人往后靠
话：来了来了，今天还是这台。
画：他翻过后盖，指着一个角
话：你们看这个角，摔过。
弹幕：啃瓜群众：我这个也摔过
话：对对对，没声。你这个也是？
点名：否`);
    expect(r.seq.map(s => s.kind)).toEqual(['scene', 'line', 'scene', 'line', 'line']);
    expect(r.seq[0].text).toContain('支架');
    expect(r.seq[1].text).toContain('来了来了');
    expect(r.seq[4].text).toContain('你这个也是');
    expect(r.danmaku).toHaveLength(1);
    expect(r.hot).toBe(false);
    // 合并出来的 scene / speech 仍要完整，后台摘要和角色材料读的是这两个
    expect(r.scene).toContain('支架');
    expect(r.scene).toContain('后盖');
    expect(r.speech).toContain('来了来了');
    expect(r.speech).toContain('你这个也是');
  });

  it('老写法（一整块画面 + 一整块台词）读成两条，不会坏', () => {
    const r = __parseStage('画面：镜头里一锅冒烟的粥。\n台词：糊了糊了。');
    expect(r.seq).toHaveLength(2);
    expect(r.seq[0].kind).toBe('scene');
    expect(r.seq[0].text).toContain('粥');
    expect(r.seq[1].kind).toBe('line');
    expect(r.seq[1].text).toContain('糊了');
  });

  it('只有话、没有画的一段照样收下，scene 是空的', () => {
    const r = __parseStage(`话：来了来了，今天还是这台。
话：先看一下昨天那把。
弹幕：啃瓜群众｜又来了
点名：否`);
    expect(r.seq.map(s => s.kind)).toEqual(['line', 'line']);
    expect(r.scene).toBe('');
    expect(r.speech).toContain('来了来了');
    expect(r.speech).toContain('昨天那把');
    expect(r.danmaku).toHaveLength(1);
  });

  it('外语双语：话和弹幕都按 ▸ 拆成原话 + 译文', () => {
    const r = __parseStage(`话：あーもう、これ無理だって ▸ 啊——不行了这个真打不过
弹幕：ゆき｜うぽつ ▸ 感谢开播
点名：否`);
    expect(r.seq[0]).toEqual({
      kind: 'line',
      text: 'あーもう、これ無理だって',
      translated: '啊——不行了这个真打不过',
    });
    expect(r.danmaku[0]).toMatchObject({ author: 'ゆき', text: 'うぽつ', translated: '感谢开播' });
  });
});

/** 台上提示词的材料：造一条最小可用的陪看记录 */
const makeStageSession = (opts: {
  user?: string;
  char?: string;
  profile?: WatchStreamerProfile;
  bio?: string;
  beatDanmaku?: Array<{ author: string; text: string }>;
}): WatchAlongSession => ({
  id: 's1',
  charId: 'c1',
  status: 'watching',
  createdAt: 0,
  updatedAt: 0,
  room: {
    streamerName: '阿七',
    streamerHandle: '@aqi',
    category: '游戏实况',
    title: '今晚冲一波排位',
    bio: opts.bio ?? '',
    profile: opts.profile,
    viewerCount: 120,
    customRule: '',
    coverGradient: '#000000,#111111',
  },
  cast: {
    userAccount: { nickname: opts.user ?? '路过的人', number: 'N-0001' },
    charAccount: { nickname: opts.char ?? '阿猫', number: 'N-0002' },
    presence: 'side',
    autoReact: true,
    petVisible: true,
    mic: 'off',
  },
  beats: opts.beatDanmaku
    ? [
        {
          id: 'b1',
          index: 0,
          scene: '',
          speech: '开了',
          danmaku: opts.beatDanmaku.map((d, i) => ({ id: `d${i}`, author: d.author, text: d.text })),
          hot: false,
          userActions: [],
          charActions: [],
          at: 0,
        },
      ]
    : [],
  chat: [],
  digests: [],
  director: '',
});

describe('台上提示词：不抢话与主播档案', () => {
  const profile: WatchStreamerProfile = {
    ageBand: 23,
    identity: '虚拟主播',
    language: 'ja',
    screenForm: 'vtuber',
    category: '虚拟主播',
    tier: 'mid',
    speechStyle: '嘴硬心软，句尾带ね',
    motive: '睡前找人说话',
  };

  it('历史里发过弹幕的号进禁止名单；从没出现过的号一个字都不提', () => {
    const s = makeStageSession({
      user: '夜班司机',
      char: '阿猫',
      beatDanmaku: [{ author: '夜班司机', text: '来了' }],
    });
    const task = buildStageTask({ session: s, latest: '', micOn: false });
    expect(task).toContain('「夜班司机」');
    expect(task).toContain('不归你写');
    // 阿猫从没在本场出现过：连禁止名单都不给，一个字都不许出现
    expect(task).not.toContain('阿猫');
  });

  it('历史里有角色的公屏动作，也算这个号在本场出现过', () => {
    const s = makeStageSession({ char: '阿猫' });
    s.beats = [
      {
        id: 'b1',
        index: 0,
        scene: '',
        speech: '开了',
        danmaku: [],
        hot: false,
        userActions: [],
        charActions: [{ id: 'a1', kind: 'danmaku', text: '这波稳' }],
        at: 0,
      },
    ];
    const task = buildStageTask({ session: s, latest: '', micOn: false });
    expect(task).toContain('「阿猫」');
  });

  it('有档案就逐项列出八个字段，不再只塞那一句 bio', () => {
    const s = makeStageSession({ profile, bio: '睡前唠两句' });
    const task = buildStageTask({ session: s, latest: '', micOn: false });
    for (const key of [
      'ageBand',
      'identity',
      'language',
      'screenForm',
      'category',
      'tier',
      'speechStyle',
      'motive',
    ]) {
      expect(task).toContain(key);
    }
    expect(task).toContain('23');
    expect(task).toContain('睡前找人说话');
    expect(task).toContain('虚拟形象');
    expect(task).not.toContain('睡前唠两句');
    // 取消的两个字段不许再出现在档案里
    expect(task).not.toContain('mainline');
    expect(task).not.toContain('hook');
  });

  it('没有档案（旧记录、按行兜底刷出来的房间）才退回那一句 bio', () => {
    const s = makeStageSession({ bio: '睡前唠两句' });
    const task = buildStageTask({ session: s, latest: '', micOn: false });
    expect(task).toContain('睡前唠两句');
  });

  it('提示词里不再有第二人称扮演指令', () => {
    const s = makeStageSession({ profile });
    const task = buildStageTask({ session: s, latest: '', micOn: false });
    expect(task).not.toContain('【你是谁】');
    expect(task).not.toContain('你在开一场直播');
  });
});

describe('角色这一轮的解析', () => {
  it('私聊多行 + 公屏 + 转账', () => {
    const r = __parseChar(`私聊：这主播手上的活儿是假的
私聊：别给他打赏了
公屏：这修法我奶奶都会
转账：收`);
    expect(r.chat).toHaveLength(2);
    expect(r.chat[0].text).toContain('活儿是假的');
    expect(r.public[0]).toMatchObject({ kind: 'danmaku', text: '这修法我奶奶都会' });
    expect(r.transfer).toBe('accept');
    expect(r.wentPublic).toBe(true);
  });

  it('角色公屏不带作者：兜底收下，不许丢（陪看核心玩法）', () => {
    // CHAR_FORMAT 写的就是「公屏：一句话」，没有作者名；这一路必须兜底，否则角色在公屏说的话全消失
    const r = __parseChar('公屏：这修法我奶奶都会');
    expect(r.public).toHaveLength(1);
    expect(r.public[0]).toMatchObject({ kind: 'danmaku', text: '这修法我奶奶都会' });
    expect(r.wentPublic).toBe(true);
  });

  it('角色公屏兜底作者不许成为脏数据后门：模型自我说明照样丢', () => {
    const r = __parseChar('公屏：Hmm 弹幕需要反映投票结果');
    expect(r.public).toHaveLength(0);
    expect(r.wentPublic).toBe(false);
  });

  it('只发一个表情', () => {
    const r = __parseChar('表情：「翻白眼」');
    expect(r.chat).toHaveLength(1);
    expect(r.chat[0].sticker).toBe('翻白眼');
    expect(r.chat[0].text).toBe('');
  });

  it('上麦、麦上说话、打赏', () => {
    const r = __parseChar('上麦：\n麦上：老陈，这管子接线反了\n打赏：小火星 3');
    const kinds = r.public.map(p => p.kind);
    expect(kinds).toContain('mic_on');
    expect(kinds).toContain('mic_line');
    expect(kinds).toContain('gift');
    const gift = r.public.find(p => p.kind === 'gift');
    expect(gift).toMatchObject({ giftName: '小火星', giftAmount: 3 });
  });

  it('安静看：一个泡都不冒，但不算失败', () => {
    const r = __parseChar('安静：这幕没什么好说的');
    expect(r.chat).toHaveLength(0);
    expect(r.public).toHaveLength(0);
    expect(r.wentPublic).toBe(false);
  });

  it('一句标签都没有：抛错，让上层重问一遍', () => {
    expect(() => __parseChar('嗯……这段我没看明白。')).toThrow();
  });

  it('模型还照老习惯写 JSON：能捡回来', () => {
    const r = __parseChar('{"chat":[{"text":"这主播有点意思"}],"public":[],"transfer":"return"}');
    expect(r.chat[0].text).toBe('这主播有点意思');
    expect(r.transfer).toBe('return');
  });

  it('空 JSON：不报错，就是什么都没说', () => {
    const r = __parseChar('{"chat":[]}');
    expect(r.chat).toHaveLength(0);
    expect(r.public).toHaveLength(0);
  });
});

describe('大厅刷台的解析', () => {
  it('一行一个房间', () => {
    const rooms = __parseRooms(`kite.exe | @kite_exe | 游戏实况 | 今晚冲一波排位 | 越菜越爱玩，卡关会自言自语 | 1840 | 手残 | #1b2430 #3a2a44
1. 捏捏不圆 | @nienienie | 手作潮玩 | 捏捏打包中 | 手上很稳，说话慢 | 2.3万 | 慢手 | #12232b #20404a`);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].streamerName).toBe('kite.exe');
    expect(rooms[0].coverGradient).toBe('#1b2430,#3a2a44');
    expect(rooms[1].viewerCount).toBe(23000);
  });

  it('回成 JSON 也能捡回来', () => {
    const rooms = __parseRooms(
      '{"rooms":[{"streamerName":"阿朱","title":"捏捏打包中","category":"手作潮玩","viewerCount":30}]}',
    );
    expect(rooms[0].streamerName).toBe('阿朱');
    expect(rooms[0].viewerCount).toBe(30);
  });

  it('分区只写在 profile 里：顶层 category 要取 profile.category，不是「闲聊」', () => {
    const rooms = __parseRooms(
      '[{"streamerName":"こむぎこ","title":"【歌枠】","viewerCount":900,"profile":{"category":"歌回点唱","language":"ja","screenForm":"vtuber","tier":"mid"}}]',
    );
    expect(rooms[0].category).toBe('歌回点唱');
  });

  it('代码块包着、前后带废话的 JSON 数组：读得出，profile 和译题都带进来', () => {
    const rooms = __parseRooms(`好的，这是这批房间：
\`\`\`json
[
  {
    "streamerName": "ゆきの",
    "streamerHandle": "@yukino_ch",
    "title": "【雑談】おやすみ前にお話ししよ",
    "titleTranslated": "【杂谈】睡前聊两句",
    "bio": "睡前来唠两句",
    "viewerCount": 512,
    "styleTag": "软糯",
    "coverStart": "#1a2028",
    "coverEnd": "#2b2438",
    "profile": {
      "ageBand": 23,
      "identity": "虚拟主播",
      "language": "ja",
      "screenForm": "vtuber",
      "category": "虚拟主播",
      "tier": "mid",
      "speechStyle": "嘴硬心软，句尾带ね",
      "motive": "睡前找人说话"
    }
  }
]
\`\`\`
就这些。`);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].streamerName).toBe('ゆきの');
    expect(rooms[0].titleTranslated).toBe('【杂谈】睡前聊两句');
    expect(rooms[0].coverGradient).toBe('#1a2028,#2b2438');
    expect(rooms[0].profile).toMatchObject({
      language: 'ja',
      screenForm: 'vtuber',
      tier: 'mid',
      ageBand: 23,
      speechStyle: '嘴硬心软，句尾带ね',
    });
  });

  it('单个对象而不是数组：也当一间房收下', () => {
    const rooms = __parseRooms('{"streamerName":"豆子","title":"手残挑战第 90 天","viewerCount":8}');
    expect(rooms).toHaveLength(1);
    expect(rooms[0].streamerName).toBe('豆子');
  });

  it('缺字段和一条坏数据：缺的补空、坏数据跳过，整批不崩', () => {
    const rooms = __parseRooms(`[
      {"streamerName":"阿七","title":"上来就送","viewerCount":1200},
      null,
      "这条不是房间",
      {"streamerName":"小满","title":"捏捏打包中","profile":{"language":"乱写","screenForm":"乱写","tier":"乱写"}}
    ]`);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].streamerName).toBe('阿七');
    expect(rooms[0].profile).toMatchObject({ language: 'zh', screenForm: 'live', tier: 'mid', ageBand: '' });
    expect(rooms[0].titleTranslated).toBe('');
    expect(rooms[1].streamerName).toBe('小满');
    // 缺人数给 320 起的兜底，跟老写法一致
    expect(rooms[1].viewerCount).toBeGreaterThanOrEqual(320);
  });

  it('坏 JSON 读不出来：退回按行兜底，日语方头括号不许被吃掉', () => {
    const rooms = __parseRooms(
      'ゆきの | @yukino_ch | 虚拟主播 | 【雑談】おやすみ前にお話ししよ | 睡前来唠两句 | 512 | 软糯 | #1a2028 #2b2438',
    );
    expect(rooms).toHaveLength(1);
    expect(rooms[0].title).toBe('【雑談】おやすみ前にお話ししよ');
  });

  it('什么都没认出来就抛错（界面会提示换一批）', () => {
    expect(() => __parseRooms('今天想不出来。')).toThrow();
  });
});
