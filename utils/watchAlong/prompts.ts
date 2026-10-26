/**
 * 陪看的三段提示词与材料拼装。
 *
 * 只负责「话怎么说」，不做任何调用。调用在 engine.ts。
 * 内容以设计文档《电波陪看-功能单子》第七节「初版提示词」为准，只做两处工程处理：
 * 1. 输出改成「一行一条、用名字起头」，模型才写得稳（JSON 十次八次写坏）；
 * 2. 台上那一路明令不许把直播间写成视频合集/录播/教程（刷出来全是视频主题的老毛病）。
 */

import type {
  WatchAlongSession,
  WatchBeat,
  WatchClip,
  WatchRoom,
  WatchStreamerLanguage,
  WatchStreamerScreenForm,
  WatchStreamerTier,
} from './types';

// ==================== 台上：路人主播引擎 ====================

/**
 * 这一段直播的回报格式：一行一条，以标签起头（模型对 JSON 太容易写坏）。
 *
 * 2026-10-26 Ann 第三次打回：这里原来放了一段「修收音机」的内容做示范，
 * 结果模型照着抄味道，刷出来的主播全在老北京味修东西。**格式示例只给标签，不给内容**——
 * 内容必须是它按档案、按分区、按这一批的口味自己长出来的。
 *
 * 2026-10-26 批次二下半截重写：不再要求画面与台词逐条穿插。那条硬规矩逼着模型为凑数写画面，
 * 写出来全是托下巴喝水。改成画面只在内容真有进展时出现。
 */
export const STAGE_FORMAT = `怎么回：一行一条，照下面的名字起头。别写 JSON，别用代码块，别加解释。

画：此刻直播画面里发生的事。只在内容真有进展时才写，一段一到两条。

直播实况的白描口语：采用第三人称，主播用网名；写作手法使用白描，口语化小说化；句子通顺逻辑连贯，把这段直播画面发生的事完整的连着讲下来。不要出现第一人称口吻，第二人称口吻。

不许写托下巴、喝水、眨眼这种无意义的碎片化细节动作，所有画面都应该服务于直播主题。
话：主播嘴里蹦出来的原话。可以连着写两三句，不必每条都配一条画面。
弹幕：作者｜他发的那条。条数照上面说的来，是这一片看客各自的反应；熟客可以反复出现，不用每条都是新面孔。
每一行弹幕都必须写成「作者｜他发的那条」。不许写任何说明、思考、你正在做什么、这条弹幕的作用、条数统计。弹幕里不出现英文。
点名：是 或者 否

画面写什么，按这一场的画面形态：
- 纯游戏或软件画面：只写战斗、关卡、抽卡、操作结果、界面变化、翻车或高光瞬间。画面里不出现真人。
- 虚拟形象：只写皮套表情切换、杂谈板、歌单、惩罚转盘、贴脸放大。画面里不出现真人。
- 桌面工作台：只写与这场主题直接相关的工序（取料、调色、入模、脱模、裹粉、按压展示、拆包剪袋看卡、勾线铺色）。不拍脸，没有神态。
- 真人出镜：只写才艺表演本身，或者镜头里真正发生的事。
- 户外移动：只写走动、街景、招牌、现场突发。
- 宠物：画面里只有动物和它正在干的事，没有人。

也不许写情绪、心里怎么想、镜头语言（露出无奈的笑、看起来很累、眼神有点失落、镜头缓缓推近、特写低垂的眼睫）。画面只写看得见的内容进展。

不许把公屏、投票、打赏、连麦写成游戏里或画面里的界面。直播间的东西只出现在「话」和「弹幕」两行里，画面里只发生这场直播本身那件事。

画面那一行只写中文，不做双语：画面里不许出现日语假名、不许出现英文单词，也不许中英日混着写。就算这一场主播说日语或英语，画面也还是中文。只有「话」和「弹幕」这两行才写外语原话。

主播说日语或英语时：「话」那一行写成「原话 ▸ 中文同传」，弹幕那一行写成「作者｜原话 ▸ 中文译文」，都用 ▸ 隔开，同一行。中文直播间不用译文。译文保留语气词和破防的劲儿，不许翻成书面语。`;

/**
 * 台上这一路的规矩（系统提示）。
 *
 * 只写「直播这件事是怎么成立的」，不写性格、不写语气风格、不写任何范例台词。
 * 2026-10-26 Ann 打回四次攒下的几条结论：镜头本身会动，不能写死；模型本来就会说话，
 * 不必叮嘱它别停嘴；不能教它重复同一句；要的是口语，不是小说腔；动作菜单会被照抄，不许写。
 *
 * 2026-10-26 批次二下半截重写：原来通篇是第二人称扮演指令，模型一看到扮演就滑成
 * 一对一客服腔，出口全是 AI 八股。现在换成第三人称的「直播间实况生成器」：
 * 照这个直播间的档案，写出画面、主播原话、公屏弹幕。
 */
export const STAGE_RULES = `这是一个直播间实况生成器。任务：照这个直播间的档案，写出此刻这一小段直播里画面在发生什么、主播嘴里说出什么原话、公屏上滚过哪些网友弹幕。

它是这一场的导演兼编剧，不是照着清单念稿的人。档案给的是底子；怎么抖包袱、怎么接梗、怎么把冷场救回来、怎么钓人发弹幕，全由它自己决定。

标准只有一句：看的人忍不住想发一条弹幕。字段填满不算数。

「话」里写的是主播嘴里蹦出来的原话，第一人称口语，不是「他说……」这种转述。念着不像张嘴就说，就删了重写。句子可以碎、可以改口、可以自我打断、可以重复一句短指令。

四条不许让的底子：档案里定下的语言、画面形态、体量、分区不许改；本场立下的旗子不许中途换掉；主播的身份与口癖不许跑偏；一个主播一个说法，不许越写越像通用播报腔。

讲话节奏：八成精力推进手头正在播的那件事，一两成顺手挑一两条有节目效果的弹幕念半句，再转回手上的事。弹幕不逐条答。

每一段都要把本场立下的旗子往前推一格（输了唱一首、翻车就抽人、凑够礼物下播、扣 1 扣 2 投票审判、赌出不出隐藏款）。五段都在原地碎碎念就是没做到。

禁的是结构，不是字面。不许把台词写成对着某一个提问的人作答；不许一问一答来回三轮；不许每句都在等观众回应；不许总结、不许升华、不许排比。「你们看这个」「你猜怎么着」「你看这颜色」是正常直播口语，必须留着。

只有整场第一段可以打招呼、报今天播什么。从第二段起是接着刚才那件事往下做，不许重新自我介绍、不许重新欢迎人、不许重新报主题。

收到打赏最多一句「谢了啊」，不许念礼物名、金额、出资人的全名。

主播台词里一句都不许出现：欢迎来到直播间、家人们、谁懂啊、宝子们、感谢某某送的礼物、今天给大家带来、让我们一起、接下来我们、话不多说、老铁、双击、刷起来、有兴趣的可以看一下。

不许出现任何平台名和平台专名：抖音、B站、快手、小红书、YouTube、NicoNico、Twitch、舰长、提督、总督、上舰、灯牌、小黄车、福袋、UP主、わこつ、ギフト。只能说会员、礼物、打赏、SC、点关注、连麦。

不写画面外面的事，不写日期、天气、新闻、真实地名。`;

/** 导演给台上的方向：新记录读 stageCue，老记录退回 director */
const stageDirection = (session: WatchAlongSession): string =>
  (session.stageCue || '').trim() || (session.director || '').trim();

/** 导演给角色的方向 */
const charDirection = (session: WatchAlongSession): string =>
  (session.charCue || '').trim() || (session.director || '').trim();

/**
 * 本场里出现过话的自家账号（用户 / 角色）。
 *
 * 2026-10-26 批次二下半截修的一个真 bug：原来只扫这一轮刚发生的事（opts.latest），
 * 前面几段发过弹幕的号扫不到，模型就把他们当普通网友，替他们生成新的公屏互动——抢了他们的嘴。
 * 现在扫本场全部历史：任意一段的公屏里有这个昵称、任意一段有用户/角色的动作、任意一段有麦上发言，
 * 都算这个号在本场出现过。这一轮刚发生、还没落进历史的动作也一并算上。
 *
 * 从没出现过的号，一个字都不提——提了就等于告诉台上「有这么个人在」，反而容易被点名。
 */
const accountsSpoke = (session: WatchAlongSession, material = ''): string[] => {
  const user = (session.cast?.userAccount?.nickname || '').trim();
  const char = (session.cast?.charAccount?.nickname || '').trim();
  const beats = session.beats || [];
  const authors = new Set(beats.flatMap(b => (b.danmaku || []).map(d => (d.author || '').trim())));
  const hasUserAct = beats.some(b => (b.userActions || []).length > 0);
  const hasCharAct = beats.some(b => (b.charActions || []).length > 0);
  const hasUserMic = beats.some(b => (b.userMicLine || '').trim());
  const hasCharMic = beats.some(b => (b.charMicLine || '').trim());

  const out: string[] = [];
  if (user && (authors.has(user) || hasUserAct || hasUserMic || material.includes(user))) out.push(user);
  if (char && (authors.has(char) || hasCharAct || hasCharMic || material.includes(char))) out.push(char);
  return Array.from(new Set(out));
};

/**
 * 本场出现过话的自家账号不归台上写。
 *
 * 只禁这两三个号，**不禁弹幕本身**——台上这一路就是要写公屏的，
 * 写成「不许替弹幕说话」会直接把弹幕生成掐死。
 */
const ownBanLine = (spoken: string[]): string => {
  const names = spoken.map(n => `「${n}」`).join('、');
  const them = spoken.length > 1 ? '他们' : '这个号';
  return `${names} 不归你写：不替${them}发弹幕，也不替${them}接下一句。`;
};

const beatLines = (beat: WatchBeat, withFollowUp = true): string => {
  // 回灌的格式必须跟要它写的格式一模一样，否则每轮都在教它写回旧格式（嵌套冒号）。
  const dm = beat.danmaku.map(d => `弹幕：${d.author}｜${d.text}`).join('\n');
  const acts = [...beat.userActions, ...beat.charActions]
    .map(a => {
      if (a.kind === 'gift') return `打赏 ${a.giftName || '小礼物'}${a.giftAmount ? ` ${a.giftAmount}` : ''}`;
      if (a.kind === 'mic_on') return '申请上麦';
      if (a.kind === 'mic_off') return '下麦';
      if (a.kind === 'mic_line') return `连麦说「${a.text || ''}」`;
      return `发弹幕「${a.text || ''}」`;
    })
    .join('；');
  // 有交替条目就按原来的节奏喂回去：主播接着往下演的时候，能接住上一段的呼吸，
  // 而不是看到「一大块画面 + 一大块台词」那种剧本。
  const body =
    beat.seq && beat.seq.length
      ? beat.seq.map(s => `${s.kind === 'scene' ? '画' : '话'}：${s.text}`)
      : [`画面：${beat.scene}`, `主播：${beat.speech}`];
  const lines = [
    `【第 ${beat.index + 1} 段】`,
    ...body,
    dm,
    acts ? `台下动作：${acts}` : '',
  ];
  if (withFollowUp && beat.followUp) {
    lines.push(`画：${beat.followUp.scene}`, `话：${beat.followUp.speech}`);
  }
  return lines.filter(Boolean).join('\n');
};

/** 画面形态说人话：直接告诉模型这一场画面里是什么，让它不用猜 */
const FORM_TEXT: Record<WatchStreamerScreenForm, string> = {
  game: '纯游戏或软件画面：画面里只有游戏或软件窗口，没有真人',
  vtuber: '虚拟形象：画面里是皮套，没有真人',
  workbench: '桌面工作台：俯拍桌面，只拍手和工序，不拍脸',
  live: '真人出镜：有摄像头对着人',
  outdoor: '户外移动：镜头跟着人走，拍街景',
  pet: '宠物：画面里只有动物和它正在干的事，没有人',
};

/** 体量决定怎么说话，写档案时一并交代清楚 */
const TIER_TEXT: Record<WatchStreamerTier, string> = {
  tiny: '个位数小透明：见谁抓谁聊，自问自答，为了留住人多说两句，偶尔有点尴尬',
  mid: '几十到几百：认得熟客，主动要互动，弹幕一条条挑着念',
  big: '上万人大主播：只挑有节目效果的念，几百条里挑一条，节奏快，不追着某个人聊',
};

const LANG_TEXT: Record<WatchStreamerLanguage, string> = {
  zh: '中文',
  ja: '日语',
  en: '英语',
  other: '其他语言',
};

/**
 * 主播档案逐项列出。
 *
 * 2026-10-26 批次二下半截：原来这里只塞了 room.bio 那一句话，profile 十个字段一个字都没读。
 * 有档案就按字段列，没有档案（旧记录、按行兜底刷出来的房间）才退回那一句话的简介。
 */
const profileLines = (room: WatchRoom): string[] => {
  const p = room.profile;
  if (!p) {
    return [
      `【主播档案】`,
      room.bio || '（这个房间没写档案，按分区和标题自己认一个具体的人来播，别演成通用主播。）',
      ``,
    ];
  }
  return [
    `【主播档案】`,
    `- ageBand（年龄段）：${p.ageBand || '（没写）'}`,
    `- identity（身份定位）：${p.identity || '（没写）'}`,
    `- language（语言）：${LANG_TEXT[p.language] || LANG_TEXT.zh}`,
    `- screenForm（画面形态）：${p.screenForm || 'live'}`,
    `- category（分区）：${p.category || room.category || '（没写）'}`,
    `- tier（体量）：${TIER_TEXT[p.tier] || TIER_TEXT.mid}`,
    `- speechStyle（说话风格与口癖）：${p.speechStyle || '（没写）'}`,
    `- motive（本场图什么）：${p.motive || '（没写）'}`,
    `- mainline（本场正在推进的事与立下的规矩）：${p.mainline || '（没写）'}`,
    `- hook（观众能立刻参与的抓手）：${p.hook || '（没写）'}`,
    ``,
  ];
};

/** 这一场画面里到底是什么，单独写一句，模型不用猜 */
const formLine = (room: WatchRoom): string => {
  if (!room.profile) return '';
  return `【这一场画面里是什么】\n${FORM_TEXT[room.profile.screenForm] || FORM_TEXT.live}。\n`;
};

/** 台上这一轮的材料：主播档案 + 前情 + 上一幕 + 本轮台下的互动 + 导演引导 */
export function buildStageTask(opts: {
  session: WatchAlongSession;
  /** 本轮台下送进来的最新互动，没有就留空 */
  latest: string;
  /** 是否已经在连麦 */
  micOn: boolean;
  /** 这一幕要几条公屏弹幕 */
  danmakuPerBeat?: number;
}): string {
  const { session } = opts;
  const { room } = session;
  const recent = session.beats.slice(-2);
  const digest = session.digests.slice(-2).map(d => d.text).join('\n');
  const mic = opts.micOn
    ? '连麦中：麦上有人，这一小段必须直接回应麦上的发言。'
    : '还没连麦：只有台下的公屏。';
  const cue = stageDirection(session);
  const count = opts.danmakuPerBeat ?? 4;
  // 公屏弹幕是台上这一路要写的东西，绝不写成「不许替弹幕说话」——那会直接不生成。
  // 只有**本场出现过话**的自家两个号不归台上写；没出现过的人，台上不该知道他们存在
  // （Ann 2026-10-26：不能在用户和角色没出现的时候知道他们）。
  const spoken = accountsSpoke(session, opts.latest);
  const ownLine = spoken.length ? ownBanLine(spoken) : '';

  return [
    `【这个直播间】`,
    `主播网名：${room.streamerName}`,
    `账号：${room.streamerHandle}`,
    `分区：${room.category}`,
    `房间标题：《${room.title}》`,
    ``,
    ...profileLines(room),
    `档案里的话一个字都不改：语言、画面形态、体量、分区、身份、口癖、本场立下的旗子，全部从这里来，不许另外发明一个主播。`,
    ``,
    formLine(room),
    `【现在】`,
    `此刻房间里有 ${room.viewerCount} 个人在看。`,
    mic,
    `台下的人看不见脸，只看得见一个个网名。有人说话的时候，那句话已经自己出现在公屏上了；没人理的时候，就自己播自己的。`,
    `公屏上的弹幕也要写出来。同一个号可以反复出现，熟客会一来再来，不用每条都是新人。`,
    `没搭过话的号，一个都不认识，别猜是谁。`,
    ownLine,
    ``,
    digest ? `【本场前情】\n${digest}\n` : '',
    recent.length ? `【刚才播过的】\n${recent.map(b => beatLines(b)).join('\n\n')}\n` : '',
    opts.latest ? `【这一轮台下刚发生】\n${opts.latest}\n` : '',
    cue ? `【本场导演要这么走】\n${cue}\n（这一轮顺着兑现，别把"导演"两个字说出来）\n` : '',
    `【这一轮要写的】`,
    `紧接上一段往下播一小段，再写台下 ${count} 条观众的反应。这是正在播的直播，不是视频、不是录播、不是回放。`,
    `这一段要把本场立的旗子往前推一步，并写清推了哪一步：又输了一局、又凑够一件、投票结果出来了、赌的那件事有了答案。`,
    ``,
    STAGE_FORMAT,
  ]
    .filter(s => s !== '')
    .join('\n');
}

/** 角色刚在公屏或麦上搞了事，让台上和网友当场接招（同一轮，不换幕） */
export function buildStageCounterTask(opts: {
  session: WatchAlongSession;
  actionText: string;
  micOn: boolean;
  danmakuPerBeat?: number;
}): string {
  const { session } = opts;
  const last = session.beats[session.beats.length - 1];
  const count = opts.danmakuPerBeat ?? 4;
  // 刚搞事那个号的话是他自己说的：不生成他的弹幕、不替他接下一句。
  // 同样只点本场出现过话的人。
  const spoken = accountsSpoke(session, opts.actionText);
  const ownLine = spoken.length ? ownBanLine(spoken) : '';
  return [
    `【这个直播间】`,
    `主播网名：${session.room.streamerName}`,
    `账号：${session.room.streamerHandle}`,
    `分区：${session.room.category}`,
    `房间标题：《${session.room.title}》`,
    ``,
    ...profileLines(session.room),
    `档案里的话一个字都不改：语言、画面形态、体量、分区、身份、口癖、本场立下的旗子，全部从这里来。`,
    ``,
    formLine(session.room),
    `【现在】`,
    opts.micOn ? '正在连麦。' : '没在连麦。',
    `台下坐着几个看客，看不见脸，只看得见网名。`,
    `弹幕照写，同一个号可以反复出现，熟客会一来再来。${ownLine ? ` ${ownLine}` : ''}`,
    ``,
    last ? `【当前这一段】\n${beatLines(last, false)}\n` : '',
    `【刚刚台下出的动静】\n${opts.actionText}`,
    ``,
    `【这一轮要写的】`,
    `刚有人在公屏上说了句话。已经播过的那段不用回头改，接着把这场直播往下推一小段：画面只在内容真有进展时写，一段里一到两条就够，公屏 ${count} 条。`,
    `那个人不认识，只看得见一个网名。要不要理、要不要念他这条，按主播自己的脾气来，不理也是可以的。`,
    ``,
    STAGE_FORMAT,
  ].join('\n');
}

// ==================== 台下：沙盒角色引擎 ====================

/** 角色的回报格式：一行一条，不用 JSON（写在 buildCharRules 里，它要引用） */
export const CHAR_FORMAT = `怎么回：一行一条，照下面的名字起头。别写 JSON，别用代码块，别加解释。

私聊：要说的话
私聊：想再说一句就再写一行（最多三行）
表情：表情包名字（只想发表情就写这行）
公屏：想飘上去的那一句
打赏：礼物名 数字
上麦：
麦上：上麦后要说的话
下麦：
转账：收 或者 退
安静：一句话说明为什么不出声

规矩：
- 私聊最多三行，按你说话的先后排。
- 表情只能填给你的表情包名字里的一个；只发表情不发字，就只写「表情：」那一行，不要写私聊。
- 公屏、打赏、上麦、麦上、下麦都是你用自己的账号进直播间里掺一脚，不想去就一行都别写。
- 转账只在对方向你转了钱、还没被处理时写：收下写「收」，退回写「退」，没这回事就别写这行。
- 什么都不想做，就只写一行「安静：」加一句理由。`;

/**
 * 陪看这一路补在后面的那一段。
 *
 * 只交代**处境和这个世界里多出来的动作**：你在跟谁发消息、你手上还有一个直播平台的号、
 * 除了聊天你还能在直播间做什么。
 *
 * 不写语气、不写性格、不写"该怎么发弹幕"、不给可供照抄的句式。
 * 2026-10-26 Ann 点名两次：一、人设是角色自己的，不许在这里另写一套；
 * 二、凡是写成"具体要怎么做"的要求，模型会原样照抄，话就假了。
 * 「怎么说话」一律交给角色本人的人设，这里一个字都不碰。
 */
export const buildCharRules = (opts: { charName: string; userName: string }): string => {
  const you = opts.charName || '你';
  const other = opts.userName || '对方';
  return `### 你现在在做什么
你在跟 ${other} 发消息。你手上也开着同一个直播间，看得见画面也看得见公屏。

### 你在那个平台上有个号
你在那个直播平台有自己的账号，公屏说话、送礼物、连麦都用它。主播和整屋观众只认这个号，不认你别的身份。

### 私聊就是发消息
私聊是你跟 ${other} 说话，不是把画面讲给她听。

### 这一段多出来的动作
除了平时聊天那些，这一段你还能：在公屏发一条弹幕、送一个礼物、上麦、在麦上说话、下麦。
做不做、做哪个，你自己看着来；一个都不想做就不写这些行。

${CHAR_FORMAT}`;
};

/**
 * 把陪看私聊转成真正的对话轮次。
 *
 * 只把私聊塞进状态块的一段文字里，模型不知道自己上一句是什么语气，
 * 回着回着就漂成另一个人——这是「不像角色」的另一半原因。
 * 这里让它以 user / assistant 的轮次出现在历史后面，语气才连得上。
 */
export function buildSessionTurns(session: WatchAlongSession): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const c of session.chat.slice(-10)) {
    if (c.from === 'action') continue;
    let text = '';
    if (c.from === 'clip') {
      text = `（对方转发了一段直播给你看）第 ${(c.clip?.beatIndex ?? 0) + 1} 幕：${c.clip?.speech || ''}`;
    } else if (c.transfer) {
      text = `（${c.from === 'char' ? '你' : '对方'}转了 ${c.transfer.amount}${c.transfer.note ? `，备注「${c.transfer.note}」` : ''}）`;
    } else if (c.sticker && !c.text) {
      text = `（发了个表情：${c.sticker}）`;
    } else {
      text = c.text || '';
      if (c.voiceId || c.wantVoice) text = `（语音）${text}`;
    }
    if (!text.trim()) continue;
    const role: 'user' | 'assistant' = c.from === 'char' ? 'assistant' : 'user';
    // 同一个人的连续几条并成一条：有些接口不接受连续同角色，语气也不该被打断
    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.content += `\n${text}`;
    } else {
      out.push({ role, content: text });
    }
  }
  return out;
}

/** 陪着看的时候，两人之间的状态与最近实况 */
export function buildCharStateBlock(opts: {
  session: WatchAlongSession;
  trigger: 'stage' | 'chat' | 'assign' | 'manual';
  /** 这一轮台上发生的事（advance 之后） */
  stageLine?: string;
  /** 对方刚说的话 */
  userLine?: string;
  /** 对方转发的片段 */
  clip?: WatchClip;
  /** 对方指的活 */
  assign?: string;
  /** 这个角色能发的表情包名字 */
  stickers?: string[];
}): string {
  const { session } = opts;
  const { room, cast } = session;
  const digest = session.digests.slice(-2).map(d => d.text).join('\n');
  // 台上只给最近这一幕的骨架：画面截短、主播原话、几条公屏。
  // 三幕全文塞进来会把模型的注意力拽到「描述画面」上，说话就变成解说词。
  const lastBeat = session.beats[session.beats.length - 1];
  const onStage = lastBeat
    ? [
        `第 ${lastBeat.index + 1} 幕｜画面：${lastBeat.scene.length > 48 ? `${lastBeat.scene.slice(0, 48)}…` : lastBeat.scene}`,
        `主播刚说：${lastBeat.speech}`,
        lastBeat.danmaku.length ? `公屏在刷：${lastBeat.danmaku.slice(0, 4).map(d => `${d.author}：${d.text}`).join('；')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const pendingPay = [...session.chat].reverse().find(c => c.transfer && c.transfer.status === 'pending');
  const now = new Date();
  const clock = `${now.getMonth() + 1} 月 ${now.getDate()} 日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const lines = [
    `【现在几点】${clock}（你自己知道大概时间就行，不用报出来）`,
    `【你在做什么】${cast.presence === 'side' ? '你也开着这个直播间在看，画面和公屏都看得见' : '你没在看画面，只看到对方转过来的片段'}`,
    `【直播间】${room.streamerName}（${room.streamerHandle}）· ${room.category} · 《${room.title}》`,
    `主播人设与玩法：${room.bio || '（无）'}`,
    `【连麦状态】${cast.mic === 'on' ? '你正在麦上' : '没在麦上'}`,
    `【双方账号】对方在公屏叫 ${cast.userAccount.nickname}（#${cast.userAccount.number}）；你在公屏叫 ${cast.charAccount.nickname}（#${cast.charAccount.number}）。这是你在直播平台的普通账号，主播和网友只认得这个号。`,
    digest ? `【本场前情】\n${digest}` : '',
    onStage ? `【台上现在】\n${onStage}` : '',
    pendingPay
      ? `【还没处理的转账】对方转了 ${pendingPay.transfer!.amount}${pendingPay.transfer!.note ? `，备注「${pendingPay.transfer!.note}」` : ''}，要收下就转账填「收」，要退回就填「退」。`
      : '',
    charDirection(session) ? `【本场导演要你配合的方向】${charDirection(session)}` : '',
    opts.stageLine ? `【刚刚台上】${opts.stageLine}` : '',
    opts.userLine ? `【对方刚对你说】${opts.userLine}` : '',
    opts.clip ? `【对方转发给你的片段】第 ${opts.clip.beatIndex + 1} 幕｜${opts.clip.scene}｜主播：${opts.clip.speech}` : '',
    opts.assign ? `【对方让你去做】${opts.assign}` : '',
    opts.stickers && opts.stickers.length
      ? `【你能发的表情包】${opts.stickers.join(' / ')}（表情只能填这里的名字）`
      : '',
    opts.trigger === 'stage'
      ? '【这一轮】台上刚走过去一幕，你自己决定要不要说点什么、要不要去公屏。'
      : opts.trigger === 'assign'
        ? '【这一轮】对方刚指了活给你，先回一句，再决定去不去公屏做。'
        : opts.trigger === 'manual'
          ? '【这一轮】对方刚点了一下，让你接着说。接着刚才的话头说，别从头再来一遍。'
          : '【这一轮】对方刚跟你说话了，先接住对方。',
    ``,
    CHAR_FORMAT,
  ];
  return lines.filter(Boolean).join('\n');
}

// ==================== 大厅：刷新房间池 ====================

export const ROOM_POOL_RULES = `你在给陪看大厅刷一批此刻正在开播的直播间，供人挑着进去逛。

一个房间是一个对象。每个对象严格照这些字段填，一个都不许省、不许改名：

- streamerName：主播网名。像真网名，英文加数字、叠字、小动物、假名都行。
- streamerHandle：@ 开头的账号。
- title：房间标题，用主播自己的语言写。
- titleTranslated：中文译题。中文直播填空字符串。
- bio：一句话简介，30 字内，口语，像主播自己在频道简介里随手打的。
- viewerCount：纯数字。
- styleTag：两个字的风格标签。
- coverStart：封面起始色，写成 #rrggbb。
- coverEnd：封面结束色，写成 #rrggbb。
- profile：对象，含下面十个字段。

profile 的十个字段，一个都不许省：

- ageBand：年龄段，写成「二十出头」这种。必须落在年轻人里。
- identity：身份定位。学生、刚工作没几年、二次元、手作党、游戏党这类。
- language：只能是 zh、ja、en、other 之一。
- screenForm：只能是 game、vtuber、workbench、live、outdoor、pet 之一。pet 是宠物 —— 画面里只有动物和它正在干的事，没有人。
- category：分区，从下面那份内容清单里挑一个，照原样写。
- tier：只能是 tiny、mid、big 之一。tiny 见谁抓谁聊、自问自答、偶尔有点尴尬；mid 认得熟客、主动要互动、弹幕一条条挑着念；big 只挑有节目效果的念、几百条里挑一条、不追着某个人聊。
- speechStyle：语速、填充词、口头禅、破防反应。
- motive：今晚开播图什么。
- mainline：本场正在推进的那件事，加上自己立下的规矩。
- hook：观众能立刻参与的抓手，扣数字上车、点材料配色、投票押输赢、申请连麦。

一批 5 到 7 个房间，每一个的内容类型都不一样，从下面那份清单里随机抽。

- 至少有一个主播说日语或英语，language 写 ja 或 en，标题按那门语言的习惯写，同时给出中文译题。

直播间常见这些内容，不是全部：
游戏实况、虚拟主播、声音与点唱、闲聊、宠物、做饭吃播、手作潮玩、拆卡盲盒、绘画赶稿、户外旅拍、助眠、连麦整活、观赛、学习自习、健身、音乐演奏、探店、一起看剧、陪聊电台、购物。

每批的房间内容类型都不一样，分区也跟着不同。

真实的直播标题长这样，只让你知道真实标题是什么质感：长短不一、口气各异、有的带 emoji、有的就是随口一句。

原声打包100r慢回弹直播间自选配货📦
兔兔糯米滋新品！直播间满300任选赠品 宝宝们还想要什么形状的糯米滋在评论区告诉主播哦~❤️
【VALORANT】主播代打猛猛上分！送礼物排队！
斯普拉遁3一点都不好玩！
【人狼村之谜一周目】禁止给主播剧透！
一人一猫游戏日常
我再打两把怎么了！
你好，这里可以睡觉
甜甜的~进来听歌咯
【青叔音】女性向音声主播不为人知的一面（接定制）
新手咕盘🌈入门分享||永远喜欢花里胡哨的东西
老实枯燥，很赚钱吧
えちえちコスで流しそうめんたべる 初流しそうめん
深夜畅聊局🌙和畅宝宝一起唠嗑到天亮
来睡觉

不许照抄，也不许套用其中任何一句的句式。写出来的每一条都要和上面任何一条都不一样。

不许出现任何平台名和平台专名：抖音、B站、快手、小红书、YouTube、NicoNico、Twitch、舰长、提督、总督、上舰、灯牌、小黄车、福袋、UP主、わこつ、ギフト。只能说会员、礼物、打赏、SC、点关注、连麦。

不许写视频：视频合集、录播、回放、教程、测评、Vlog、第几期、上下集、剪辑、搬运。

没有现实感知：不写具体日期、热搜、新闻、真实地名、真人。

每个房间都要有观众能立刻插进去的地方：连麦、点歌、扣数字、投票、点材料、递话题。不要干聊。

名字、分区、玩法互不重复，也别和已经刷过的重复。

颜色给两个深色十六进制，用在封面渐变上。

只回一个 JSON 数组，不要代码块，不要解释，不要前后废话。`;

export function buildRoomPoolTask(opts: {
  charName: string;
  userName: string;
  /** 用户写下的偏好，没有就空 */
  customRule: string;
  /** 要几个房间 */
  count: number;
  /** 已经刷过的名字，避免重复 */
  exclude: string[];
}): string {
  return [
    `【这次要几个】${opts.count} 个正在开播的房间`,
    opts.customRule
      ? `【这人的口味】${opts.customRule}`
      : `【这人的口味】没特别说，那就从上面那份内容清单里挑 ${opts.count} 个反差开的。`,
    opts.exclude.length ? `【这批不要再用这些主播】${opts.exclude.slice(0, 24).join('、')}` : '',
    `【这一轮的任务】刷出 ${opts.count} 个此刻正在开播的直播间，每一个的内容类型都不一样；必须有一个说日语或英语的主播。每个都要有观众能立刻参与进去的抓手。`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** 「帮我想一个口味」：用户不想自己写时，让辅助模型代笔一句 */
export const TASTE_RULES = `你在帮一个人写「他想看什么样的直播」这一句话。

要求：
1. 一句话，8 到 30 字，口语，像自己随口跟人说的。
2. 写具体想看的内容和气氛，不要写"有趣的""好看的"这种空词。
3. 只写这一句，不要引号，不要解释，不要分点。`;

export function buildTasteTask(opts: { userName: string; current: string }): string {
  return [
    `【给谁写】${opts.userName}`,
    opts.current ? `【手里这句是旧的】${opts.current}（换一句不一样的）` : '',
    `【这一轮的任务】写一句他想看的直播口味。`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ==================== 账号：给陪看小号起名 ====================

export const ACCOUNT_NAME_RULES = `你在给一个直播平台账号起名字。就是这个人在这平台上用的号，公屏发言、打赏、连麦都顶着它。

要求：
1. 像真的观众昵称：短、口语、有点小性格，三到六个字。
2. 不要网红感、不要中二、不要带"官方""小助手"这类。
3. 编号给四位数字，纯数字，不带字母。

怎么回：只写两行，别写 JSON，别加解释：
昵称：三到六个字
编号：4821`;

export function buildAccountNameTask(opts: {
  charName: string;
  userName: string;
  /** user 给我自己起，char 给角色起 */
  target: 'user' | 'char';
  /** 已有昵称，尽量别重样 */
  current: string;
}): string {
  return [
    opts.target === 'user'
      ? `【给谁起】给 ${opts.userName} 的直播平台账号起一个昵称`
      : `【给谁起】给 ${opts.charName} 的直播平台账号起一个昵称`,
    opts.current ? `【现在叫什么】${opts.current}（换一个不一样的）` : '',
    `【这一轮的任务】起一个昵称 + 一个四位编号。`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ==================== 私聊：翻译一条 ====================

export const TRANSLATE_RULES = `把给你的这句话翻成中文。要求：
1. 翻得像人话，保留原来的语气、口癖和骂人的劲儿，不要翻成书面语。
2. 本来就是中文的话，就翻成英文，语气照样口语。
3. 只输出译文本身，不要引号、不要解释、不要标注语言。`;

export function buildTranslateTask(text: string, charName: string): string {
  return [`【谁说的一句】${charName}`, `【这句】${text}`, '【任务】按规则给出译文。'].join('\n');
}

// ==================== 后台：滚动总结与退房回顾 ====================
export const DIGEST_RULES = `请把下面这几幕路人直播实况，以及台下两人的私聊、公屏弹幕、打赏、连麦互动，提炼成一段紧凑的阶段摘要，不超过 200 字。

必须留住：主播演了什么关键进展、两人私下聊了什么梗或打了什么赌、角色用自己的号在公屏或麦上干了什么、主播怎么接的招。
不要写套话，不要写"他们度过了一段美好的时光"这种。只输出这一段摘要正文，不要标题，不要 JSON。`;

export function buildDigestTask(session: WatchAlongSession, beats: WatchBeat[]): string {
  const chat = session.chat
    .filter(c => c.from !== 'action')
    .slice(-16)
    .map(c => `${c.from === 'char' ? '角色' : c.from === 'clip' ? '（转发片段）' : '用户'}：${c.text || c.clip?.speech || ''}`)
    .join('\n');
  return [`【台上的这几幕】`, beats.map(b => beatLines(b)).join('\n\n'), `【台下这段时间】`, chat || '（没说话）'].join('\n');
}

export const RECAP_RULES = `两人刚结束一场陪看。根据本场阶段摘要与最后几幕实况，写一段放进主聊天时间线的陪看回顾，150 到 250 字。

客观自然地记下：今天一起看了哪个路人主播的什么节目、中间有哪些好笑或高能的互动、连麦时发生了什么、两人私下聊了什么。用第三人称叙述这场陪看，不要写成日记体，不要写评价性的空话。只输出这段正文。`;

export function buildRecapTask(session: WatchAlongSession): string {
  const digest = session.digests.map(d => d.text).join('\n');
  const last = session.beats.slice(-3).map(b => beatLines(b)).join('\n\n');
  return [
    `【主播】${session.room.streamerName} · ${session.room.category} ·《${session.room.title}》`,
    digest ? `【本场摘要】\n${digest}` : '',
    last ? `【最后几幕】\n${last}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
