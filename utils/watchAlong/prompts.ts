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
 * 台上这一路的规矩（系统提示）。
 *
 * 2026-10-27 Ann 定稿（施工单第八节「五」）：整份换成新的一版，原话照抄。
 * 原来单独那一段 STAGE_FORMAT（画面 / 台词 / 弹幕的格式与禁忌）并进了这一份里，
 * 不再留成第二个常量。
 */
export const STAGE_RULES = `# 任务
这是一个直播间实况生成器。每一轮照这个直播间的档案，写出这一小段直播里画面在发生什么、主播嘴里说出什么原话、公屏上滚过哪些网友弹幕。

这一场由你自己导，档案给的是底子，怎么接梗、怎么救场全由你定。标准只有一句：看的人忍不住想发一条弹幕。

# 不许改的
1. 语言、画面形态、体量、分区、身份、说话调性、开播动机，全部照档案来，不许另外发明一个主播。
2. 主播就叫档案里的网名，不另起名字。
3. 一个主播一个说法，不许越写越像通用播报腔。
4. 这是正在播的直播，不是视频、不是录播、不是回放。
5. 不写画面外面的事：不写日期、天气、新闻、真实地名。

# 推进
每一段都要把本场的直播进度往前推一格，不能原地打转。

# 打赏
收到打赏要感谢。档案里开播图的是钱的，更要把感谢说到位。

# 回复格式
一行一条，照下面这四个名字起头，别写 JSON，别用代码块，别加解释。

- 画：此刻直播画面里发生的事。画面只写中文。
- 话：主播台词。档案语言是日语时，主播台词必须写成「日语 ▸ 中文」，日语和中文必须写在同一行。档案语言是英语时，主播台词必须写成「英语 ▸ 中文」，英语和中文必须写在同一行。档案语言是中文时，主播台词只写中文。
- 弹幕：观众弹幕。档案语言是日语时，观众弹幕必须写成「网名｜日语 ▸ 中文」，日语和中文必须写在同一行。档案语言是英语时，观众弹幕必须写成「网名｜英语 ▸ 中文」，英语和中文必须写在同一行。档案语言是中文时，观众弹幕写成「网名｜中文」。
- 点名：是 或者 否。

# 画面
1. 画的是主播此刻在播什么、有什么反应、接下来要什么。
2. 用一两句话把这件事说清楚，不是把一个动作拆成好几格。
3. 采用第三人称，主播用网名；白描，口语化小说化；句子通顺逻辑连贯，把这一段连续讲下来。不用第一人称、第二人称。
4. 不许写无意义的碎片化细节动作；不许写无意义的精细数值，比如抬起来十来秒、三个网名、拍了三下、绕了半圈；不许写情绪、心里怎么想、镜头语言。
5. 画面只写中文，不做双语。
6. 按这一场的画面形态写画面主体：
   - 纯游戏或软件：游戏或软件窗口里正在发生的事。
   - 虚拟形象：皮套和它此刻的样子。
   - 桌面工作台：主播正在做的那样东西，和它做到哪一步了。
   - 真人出镜：镜头里的人，和他正在表演或做的事。
   - 户外移动：镜头跟着人走到的地方，和眼前看到的东西。
   - 宠物：那只动物和它正在干的事。

# 台词
主播嘴里蹦出来的原话，第一人称口语，不是「他说……」这种转述。可以连着写两三句，不必每条都配一条画面。

# 弹幕
1. 每一行都写成「作者｜他发的那条」。上面写了要几条，就按那个数写。
2. 弹幕语言跟着档案走。中文直播间这一行写中文。日语或英语直播间，这一行里原话和中文都写全。
3. 不许写说明、思考、你正在做什么、条数统计。

# 直播间里的翻译
直播间有即时翻译。主播看得懂公屏上的外语，外语弹幕照样进得了对话，能接着聊。主播自己嘴里的话用档案里的语言。

档案语言是日语时，主播台词必须写成「日语 ▸ 中文」，观众弹幕必须写成「网名｜日语 ▸ 中文」。日语和中文必须写在同一行。
档案语言是英语时，主播台词必须写成「英语 ▸ 中文」，观众弹幕必须写成「网名｜英语 ▸ 中文」。英语和中文必须写在同一行。
档案语言是中文时，主播台词只写中文，观众弹幕写成「网名｜中文」。
画面只写中文。

中文直播间不加译文，「话」和「弹幕」用中文写。

译文通顺自然，像真人随口说的中文。

# 台词禁令
1. 不许出现：欢迎来到直播间、家人们、谁懂啊、宝子们、感谢某某送的礼物、今天给大家带来、让我们一起、接下来我们、话不多说、老铁、双击、刷起来、有兴趣的可以看一下。
2. 不许把台词写成对着某一个提问的人作答；不许一问一答来回三轮；不许每句都在等观众回应；不许总结、不许升华、不许排比。
3. 台词通顺自然，像真人随口说的话，一句接一句说下去。不许堆语气词，不许嗯呢啊啊哎哎哎，不许「这个那个」这种口水垫词。

# 平台名词禁令
不许出现平台名和平台专名：抖音、B站、快手、小红书、YouTube、NicoNico、Twitch、舰长、提督、总督、上舰、灯牌、小黄车。

# 禁用AI八股
这些词和写法，一个都不许出现：

**句式和结构**
1. 「不是……而是……」这类对照句。
2. 「首先、其次、再次、最后」「第一、第二、第三」这种排号写法。
3. 「综上所述、总的来说、说白了、值得一提的是」这种收尾套话。
4. 三句一组的排比。
5. 结尾硬拔高：「彰显了、体现了、象征着、见证了」。

**假人味**
6. 「我认了」「认」「接住」「不躲」「就在这里」这类装腔的词，包括它们的变体。
7. 「其实吧」「说白了」「说实话」「家人们」「宝子们」「懂的都懂」这种假装亲热。
8. 故意堆口头禅、故意加错别字去装人味。
9. 「你觉得呢？评论区聊聊」这种假互动结尾。

**描写**
10. 拿身体反应代替情绪：胸口发紧、冷汗顺着脊背、喉咙发干、呼吸一滞这类。
11. 把动作拆成一格一格慢慢放。
12. 堆无意义的数值：抬起来十来秒、三个网名、拍了三下、绕了半圈。`;

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

const castNames = (session: WatchAlongSession): { user: string; char: string } => ({
  user: (session.cast?.userAccount?.nickname || '').trim(),
  char: (session.cast?.charAccount?.nickname || '').trim(),
});

/** 台词、弹幕回灌时带上已经有的中文：原话 ▸ 中文 */
const withChinese = (text: string, translated?: string): string => {
  const zh = (translated || '').trim();
  return zh ? `${text} ▸ ${zh}` : text;
};

const actionPhrase = (a: WatchBeat['userActions'][number]): string => {
  if (a.kind === 'gift') return `打赏 ${a.giftName || '小礼物'}${a.giftAmount ? ` ${a.giftAmount}` : ''}`;
  if (a.kind === 'mic_on') return '申请上麦';
  if (a.kind === 'mic_off') return '下麦';
  if (a.kind === 'mic_line') return `连麦说「${a.text || ''}」`;
  return `发弹幕「${a.text || ''}」`;
};

const beatLines = (
  beat: WatchBeat,
  withFollowUp = true,
  names?: { user: string; char: string },
): string => {
  // 回灌的格式必须跟要它写的格式一模一样，否则每轮都在教它写回旧格式（嵌套冒号）。
  const dm = beat.danmaku
    .map(d => `弹幕：${d.author}｜${withChinese(d.text, d.translated)}`)
    .join('\n');
  const named = (who: string, line: string) => (who ? `${who} ${line}` : line);
  const acts = [
    ...(beat.userActions || []).map(a => named(names?.user || '', actionPhrase(a))),
    ...(beat.charActions || []).map(a => named(names?.char || '', actionPhrase(a))),
  ].join('；');
  // 有交替条目就按原来的节奏喂回去：主播接着往下演的时候，能接住上一段的呼吸，
  // 而不是看到「一大块画面 + 一大块台词」那种剧本。
  // 话已经有中文的，写成「话：原话 ▸ 中文」，别把译文丢在半路。
  const body =
    beat.seq && beat.seq.length
      ? beat.seq.map(s =>
          s.kind === 'scene' ? `画：${s.text}` : `话：${withChinese(s.text, s.translated)}`,
        )
      : [`画面：${beat.scene}`, `主播：${beat.speech}`];
  const lines = [
    `【第 ${beat.index + 1} 段】`,
    ...body,
    dm,
    acts ? `台下动作：${acts}` : '',
  ];
  if (withFollowUp && beat.followUp) {
    if (beat.followUp.seq && beat.followUp.seq.length) {
      lines.push(
        ...beat.followUp.seq.map(s =>
          s.kind === 'scene' ? `画：${s.text}` : `话：${withChinese(s.text, s.translated)}`,
        ),
      );
    } else {
      lines.push(`画：${beat.followUp.scene}`, `话：${beat.followUp.speech}`);
    }
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
 * 2026-10-26 批次二下半截：原来这里只塞了 room.bio 那一句话，profile 字段一个字都没读。
 * 有档案就按字段列，没有档案（旧记录、按行兜底刷出来的房间）才退回那一句话的简介。
 * 2026-10-27：档案改成八个字段（年龄、身份定位、语言、画面形态、分区、体量、完整人设、开播动机），
 * 原来的「本场正在推进的事」「观众能立刻参与的抓手」两项去掉。
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
    `- ageBand（年龄）：${p.ageBand || '（没写）'}`,
    `- identity（身份定位）：${p.identity || '（没写）'}`,
    `- language（语言）：${LANG_TEXT[p.language] || LANG_TEXT.zh}`,
    `- screenForm（画面形态）：${p.screenForm || 'live'}`,
    `- category（分区）：${p.category || room.category || '（没写）'}`,
    `- tier（体量）：${TIER_TEXT[p.tier] || TIER_TEXT.mid}`,
    `- speechStyle（完整人设）：${p.speechStyle || '（没写）'}`,
    `- motive（开播动机）：${p.motive || '（没写）'}`,
    ``,
  ];
};

/** 这一场画面里到底是什么，单独写一句，模型不用猜 */
const formLine = (room: WatchRoom): string => {
  if (!room.profile) return '';
  return `【这一场画面里是什么】\n${FORM_TEXT[room.profile.screenForm] || FORM_TEXT.live}。\n`;
};

/**
 * 档案语言怎么进模型。
 * 日语、英语：话和弹幕同一行里原话和中文都写全。中文：不加译文。
 */
const stageLanguageLine = (room: WatchRoom): string => {
  const lang = room.profile?.language;
  if (lang === 'ja') {
    return '直播间有即时翻译，主播看得懂公屏上的外语。主播台词必须写成「日语 ▸ 中文」，日语和中文必须写在同一行。观众弹幕必须写成「网名｜日语 ▸ 中文」，日语和中文必须写在同一行。画面只写中文。';
  }
  if (lang === 'en') {
    return '直播间有即时翻译，主播看得懂公屏上的外语。主播台词必须写成「英语 ▸ 中文」，英语和中文必须写在同一行。观众弹幕必须写成「网名｜英语 ▸ 中文」，英语和中文必须写在同一行。画面只写中文。';
  }
  if (lang === 'zh') {
    return '主播台词只写中文。观众弹幕写成「网名｜中文」。画面只写中文。';
  }
  return '直播间有即时翻译，主播看得懂公屏上的外语。主播台词使用档案里的语言。画面只写中文。';
};

/** 辅助模型修格式时用的规矩。按这场直播的语言写明，不用「这句」「那一句」。 */
export function buildFormatRepairRules(language: WatchStreamerLanguage | undefined): string {
  const speech =
    language === 'en'
      ? '主播台词必须写成「英语 ▸ 中文」，英语和中文必须写在同一行。观众弹幕必须写成「网名｜英语 ▸ 中文」，英语和中文必须写在同一行。'
      : language === 'zh'
        ? '主播台词只写中文。观众弹幕写成「网名｜中文」。'
        : '主播台词必须写成「日语 ▸ 中文」，日语和中文必须写在同一行。观众弹幕必须写成「网名｜日语 ▸ 中文」，日语和中文必须写在同一行。';
  return `你在修复已经写好的直播记录。发生过的事保持不变，只把格式补全。
画面只写中文。画面里的外语改写成中文，意思保持不变。
${speech}
输出一行一条。每一段用「【第 N 段】」起头，N 用材料里的段号。段里面用「画：」「话：」「弹幕：」起头。`;
}

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
  const count = opts.danmakuPerBeat ?? 6;
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
    `档案里的话一个字都不改：语言、画面形态、体量、分区、身份、说话调性、开播动机，全部从这里来，不许另外发明一个主播。`,
    ``,
    formLine(room),
    stageLanguageLine(room),
    `【现在】`,
    `此刻房间里有 ${room.viewerCount} 个人在看。`,
    mic,
    `台下的人看不见脸，只看得见一个个网名。有人说话的时候，那句话已经自己出现在公屏上了；没人理的时候，就自己播自己的。`,
    `公屏上的弹幕也要写出来。同一个号可以反复出现，熟客会一来再来，不用每条都是新人。`,
    `没搭过话的号，一个都不认识，别猜是谁。`,
    ownLine,
    ``,
    digest ? `【本场前情】\n${digest}\n` : '',
    recent.length ? `【刚才播过的】\n${recent.map(b => beatLines(b, true, castNames(session))).join('\n\n')}\n` : '',
    opts.latest ? `【这一轮台下刚发生】\n${opts.latest}\n` : '',
    cue ? `【本场导演要这么走】\n${cue}\n（这一轮顺着兑现，别把"导演"两个字说出来）\n` : '',
    `【这一轮要写的】`,
    `紧接上一段往下播一小段。这一轮 3 到 10 段，画面和台词合计。这一幕写出 ${count + 2} 条观众弹幕。`,
    ``,
    STAGE_RULES,
    stageLanguageLine(room),
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
  const count = opts.danmakuPerBeat ?? 6;
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
    `档案里的话一个字都不改：语言、画面形态、体量、分区、身份、说话调性、开播动机，全部从这里来。`,
    ``,
    formLine(session.room),
    stageLanguageLine(session.room),
    `【现在】`,
    opts.micOn ? '正在连麦。' : '没在连麦。',
    `台下坐着几个看客，看不见脸，只看得见网名。`,
    `弹幕照写，同一个号可以反复出现，熟客会一来再来。${ownLine ? ` ${ownLine}` : ''}`,
    ``,
    last ? `【当前这一段】\n${beatLines(last, false, castNames(session))}\n` : '',
    `【刚刚台下出的动静】\n${opts.actionText}`,
    ``,
    `【这一轮要写的】`,
    `刚有人在公屏上说了句话。已经播过的那段不用回头改，接着把这场直播往下推一小段。这一轮 3 到 10 段，画面和台词合计。这一幕写出 ${count + 2} 条观众弹幕。`,
    `那个人不认识，只看得见一个网名。要不要理、要不要念他这条，按主播自己的脾气来，不理也是可以的。`,
    ``,
    STAGE_RULES,
    stageLanguageLine(session.room),
  ].join('\n');
}

// ==================== 台下：沙盒角色引擎 ====================

/**
 * 直播间里多出来的动作。私聊正文、语音、表情都按主聊天已经教过的格式写，这里不另写一套。
 */
export const CHAR_FORMAT = `直播间里的动作另起一行，用下面这些名字起头。私聊就按平时发消息那样写。

公屏：发送的公屏弹幕
打赏：礼物名 数字
上麦：
麦上：上麦后要说的话
下麦：
转账：收 或者 退
安静：一句话说明为什么不出声

公屏、打赏、上麦、麦上、下麦是你用自己的账号进这个直播间。想做才写，不想做就别写这些行。
转账只在对方向你转了钱、还没处理时写：收下写「收」，退回写「退」。
什么都不想做，就只写一行「安静：」加上理由。`;

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

${CHAR_FORMAT}

发送公屏弹幕的语言必须要使用你平时跟用户发消息的语言来写。
你平时跟用户说中文，就必须写中文。
平时跟用户说其他语言（以日语举例），就必须写成「日语 ▸ 中文」，必须写在一行上。`;
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
      text = `[${c.from === 'char' ? '你' : '用户'} 发送了表情包: ${c.sticker}]`;
    } else {
      text = c.text || '';
      if (c.sticker) {
        text = `${text}\n[${c.from === 'char' ? '你' : '用户'} 发送了表情包: ${c.sticker}]`.trim();
      }
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
  /** 这一轮加号开了「语音回你」，并且角色自己开着语音消息 */
  voiceReply?: boolean;
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
    opts.voiceReply ? '【这一轮的说法】这一轮用语音消息回。台词你自己写，按系统里已经教过的语音消息来。' : '',
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

export const ROOM_POOL_RULES = `# 角色与任务
你是一个现实流媒体平台的直播间生成引擎。请生成 5 到 7 个风格各异、真实感极强的年轻化直播间对象。

# 核心约束（严禁违规）
1. **纯粹的 JSON 输出**：只返回一个纯 JSON 数组，严禁使用任何 markdown 代码块（如 \`\`\`json）、严禁任何前后解释、废话或标头。
2. **去 AI 味与文学化**：严禁生成诗意、拟人、意义不明的伪直播标题（如“猫把键盘当床睡”）。标题必须符合现实年轻人在各大流媒体平台的真实说话习惯、带梗、接地气或直奔主题。
3. **全员年轻人**：主播年龄段必须在 18~35 岁之间。严禁出现中老年人设（如老头木工、非遗传承、养生讲堂、中老年带货等）。
4. **平台名词禁令**：严禁出现以下平台名或专有名词：抖音、B站、快手、小红书、YouTube、NicoNico、Twitch、舰长、提督、总督、上舰、灯牌、小黄车、福袋、UP主、わこつ、ギフト。仅可使用：会员、礼物、打赏、SC、点关注、连麦。
5. **内容互斥**：每批生成的 5~7 个房间，其内容类型、分区、玩法、主播风格必须**互不重复**。
6. **语言要求**：至少有一个主播说日语或英语（\`language\` 填 \`ja\` 或 \`en\`），标题按对应语言习惯书写，并必须在 \`titleTranslated\` 字段提供中文译题。其余中文直播的 \`titleTranslated\` 填空字符串 \`""\`。

# 封面
每间房在同一份回复里带一张小封面，画的就是这间直播正在发生的事。散步是街道和大厦，做饭是厨房。具体画什么由这间房的标题和分区决定，每间房各自不同。色彩按这间房的光线来，天空、地面、灯光都可以是亮色。

\`coverSvg\` 是一段很小的 SVG：
- viewBox 用 \`0 0 160 90\`，形状铺到边缘，填满整张，不留白边。
- 只用这些标签：\`svg\` \`g\` \`rect\` \`circle\` \`ellipse\` \`path\` \`polygon\` \`polyline\` \`line\`。
- 元素控在 40 个以内，整段控在 2500 字以内。
- 质感示例（禁止照抄）：散步可以是傍晚街道、两幢玻璃大厦、一个背影。别的房间按自己正在播的事另画。

不要用 \`script\`、\`image\`、\`foreignObject\`、\`use\`、文字、外链、事件属性。

---

# JSON 字段结构要求
每个房间对象必须严格包含以下字段，名称和类型绝对不能改动或省去：

- **streamerName** (string): 真实感的网名（如英文+数字、叠字、小动物、假名等）。
- **streamerHandle** (string): 以 \`@\` 开头的账号 ID。
- **title** (string): 直播标题。必须直白、写清主题，读完立刻知道在播什么。
- **titleTranslated** (string): 中文译题。非中文字幕填翻译，中文直播填 \`""\`。
- **bio** (string): 直播简介，30 字以内，点明本次直播的核心目的。
- **viewerCount** (integer): 纯数字在线观看人数。
- **styleTag** (string): 两个字的风格标签（如：整活、唠嗑、技术、日常等）。
- **coverSvg** (string): 上面说的那段小封面。没有就填空字符串。
- **profile** (object): 包含以下 8 个子字段：
  - **ageBand** (integer): 主播年龄（如 23、28，必须是年轻人）。
  - **identity** (string): 身份定位，例如：\`游戏主播\`, \`带货主播\`, \`萌宠主播\`, \`虚拟主播\`, \`普通人\`，不仅限于此。
  - **language** (string): 语言，只能是 \`zh\`, \`ja\`, \`en\`, \`other\` 之一。
  - **screenForm** (string): 画面形式，只能是 \`game\`, \`vtuber\`, \`workbench\`, \`live\`, \`outdoor\`, \`pet\` 之一。
  - **category** (string): 平台分区，从下方清单中随机挑选一个原样填写。
  - **tier** (string): 主播体量，只能是 \`tiny\`, \`mid\`, \`big\` 之一。
    - \`tiny\`: 见谁抓谁聊、自问自答、偶尔尴尬。
    - \`mid\`: 认得熟客、主动互动、弹幕一条条挑着念。
    - \`big\`: 只挑有节目效果的念、几百条挑一条、不追着某个人聊。
  - **speechStyle** (string): 完整的主播人设：身份性格与说话调性（名字就用 streamerName 那个网名，不许另起一个名字）。例如：嘴硬心软、疯狂吐槽、社恐晚期、极度亢奋、温温柔柔、中二病等，绝不能敷衍。
  - **motive** (string): 开播真实动机（例如：冲粉丝数量、冲同接数、赚钱、纯消遣解闷、找乐子、纯粹分享日常等）。


# 去模板化
 不得反复使用相同的标题句式、主题类型、场景套路和互动桥段。避免刻意追求猎奇、可爱或幽默。优先考虑现实中可能发生的事情，允许平凡、具体、临时起意的直播，也允许有明确目标、连续进展或特殊事件的直播。所有生成内容必须自然、合理、可理解，不能为了显得有创意而牺牲逻辑。直播间描述应交代实际直播内容、主播正在进行的活动，以及有意义的现场细节。细节必须服务于直播主题，而不是单纯堆砌可爱动作、物品状态、无关比喻或刻意搞笑的描述。禁止将普通行为强行包装成直播主题，禁止生成只有画面感却没有实际内容的句子。

---

# 分区与主题参考清单（每间房必须各不相同）
游戏实况、虚拟主播、声音与点唱、闲聊、宠物日常、做饭吃播、手作潮玩、拆卡盲盒、绘画赶稿、户外旅拍、助眠、连麦整活、观赛解说、学习自习、健身打卡、音乐演奏、探店、一起看剧、陪聊电台、购物带货。

# 优秀标题参考（现实感，请模仿其语感，严禁照抄）：
- 原声打包100r慢回弹直播间自选配货📦
- 兔兔糯米滋新品！直播间满300任选赠品 宝宝们还想要什么形状的糯米滋在评论区告诉主播哦~❤️
- 【VALORANT】主播代打猛猛上分！送礼物排队！
- 斯普拉遁3一点都不好玩！
- 【人狼村之谜一周目】禁止给主播剧透！
- 一人一猫游戏日常
- 我再打两把怎么了！连败哥复活赛
- 【助眠】你好，这里可以睡觉
- 甜甜的~进来听歌咯，点歌扣1
- 【青叔音】女性向音声主播不为人知的一面（接定制）
- 新手咕盘🌈入门分享||永远喜欢花里kalaiso的花哨东西
- えちえちコスで流しそうめんたべる 初流しそうめん`;

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
      : `【这人的口味】没特别说，那就从下面的分区与主题参考清单里挑 ${opts.count} 个反差开的。`,
    opts.exclude.length ? `【这批不要再用这些主播】${opts.exclude.slice(0, 24).join('、')}` : '',
    `【这一轮的任务】刷出 ${opts.count} 个此刻正在开播的直播间，每一个的内容类型都不一样；至少有一个主播说日语或英语。`,
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
  return [`【台上的这几幕】`, beats.map(b => beatLines(b, true, castNames(session))).join('\n\n'), `【台下这段时间】`, chat || '（没说话）'].join('\n');
}

export const RECAP_RULES = `两人刚结束一场陪看。根据本场阶段摘要与最后几幕实况，写一段放进主聊天时间线的陪看回顾，150 到 250 字。

客观自然地记下：今天一起看了哪个路人主播的什么节目、中间有哪些好笑或高能的互动、连麦时发生了什么、两人私下聊了什么。用第三人称叙述这场陪看，不要写成日记体，不要写评价性的空话。只输出这段正文。`;

export function buildRecapTask(session: WatchAlongSession): string {
  const digest = session.digests.map(d => d.text).join('\n');
  const last = session.beats.slice(-3).map(b => beatLines(b, true, castNames(session))).join('\n\n');
  return [
    `【主播】${session.room.streamerName} · ${session.room.category} ·《${session.room.title}》`,
    digest ? `【本场摘要】\n${digest}` : '',
    last ? `【最后几幕】\n${last}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
