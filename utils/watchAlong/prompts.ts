/**
 * 陪看的三段提示词与材料拼装。
 *
 * 只负责「话怎么说」，不做任何调用。调用在 engine.ts。
 * 内容以设计文档《电波陪看-功能单子》第七节「初版提示词」为准，只做两处工程处理：
 * 1. 输出改成「一行一条、用名字起头」，模型才写得稳（JSON 十次八次写坏）；
 * 2. 台上那一路明令不许把直播间写成视频合集/录播/教程（刷出来全是视频主题的老毛病）。
 */

import type { WatchAlongSession, WatchBeat, WatchClip } from './types';

// ==================== 台上：路人主播引擎 ====================

/**
 * 这一段直播的回报格式：一行一条，画和话交替（模型对 JSON 太容易写坏）。
 *
 * 2026-10-26 Ann 第三次打回：这里原来放了一段「修收音机」的内容做示范，
 * 结果模型照着抄味道，刷出来的主播全在老北京味修东西。**格式示例只给标签，不给内容**——
 * 内容必须是它按人设、按分区、按这一批的口味自己长出来的。
 */
export const STAGE_FORMAT = `怎么回：一行一条，照下面的名字起头。别写 JSON，别用代码块，别加解释。

画：镜头里看得见的一件事（手上在做什么、人往哪动、周围东西变了什么）
话：你随口说的一句（可以是半句，可以说到一半改口）
画：下一件事
话：再说一句
（「画」和「话」这样交替，写 3 到 5 个来回，不要一口气写完画面再一口气说完话）
弹幕：网友昵称：他发的那条
（4 到 6 条，昵称各不一样）
点名：是 或者 否`;

/**
 * 主播这一路的规矩。
 *
 * 这里**只写直播这件事本身的规律**（一个机位、嘴不停、挑着念公屏、句子是碎的），
 * 不写性格、不写语气风格、不写范例台词——那些全部由房间里的人设和分区决定。
 * 2026-10-26 Ann 打回两次：「不要自己再写这种老北京味的修东西」「具体要求也不能写，模型会照抄」。
 * 下面的规律全部来自抖音、B站、小红书真实直播间的实际形态（素材见 notes/直播素材-调研.md）。
 */
export const STAGE_RULES = `你现在在开一场直播。镜头就架在你面前，看的人都在公屏上，没有剧本，也没有人给你提词。

直播是这样运转的：
· **机位不动**。手机或者摄像头架在支架上、桌上、三脚架上，不推近、不拉远、不换镜头。观众永远只看得见你面前那一小块，你看不见的地方就不存在。
· **嘴几乎不停**。你在做手上的事，嘴里同时说着；手上的事停一下，话不一定停。喝水、挪东西、看屏幕、低头翻找，这些也发生在镜头里，也算你要写的东西。
· **大部分时间是你自己在说**，公屏上的话是插进来的。你挑着念——挑那条能接下去的、能吵起来的、有意思的，没什么可接的就跳过，也没人怪你。念错昵称、只念一半、念完自己接一句，都正常。
· **同一句话你会说很多遍**。招呼、报人数、说今天播什么、谢送礼、让人点关注、喊人扣个数——这些一场要说几十遍，你是在干活，不是在演讲。
· **句子是碎的**。说到一半改口、重复一遍、突然跑题、话没说完就去做别的。中间全是"哎""行""那个""不是""你懂吧""就""然后"这种没意义的词。不用完整，不用工整，不用每句都有用。
· **没人说话你也能自己往下讲**。直播间常常是安静的，你一个人对着空气说话是常态。
· 如果这会儿有人跟你连麦，你必须真的在跟他一来一回，不能自己往下演自己的。

这些是你在镜头前真正能做的事（具体做哪些由你的人设和分区决定，不是每样都做）：
· 干你正在干的活，边干边讲
· 念公屏、回公屏、怼公屏，点名让某个人扣个数字
· 谢礼物、报今天有什么福利、报现在多少人在看
· 立个目标、立个惩罚、说到做不到就认
· 连麦、挂人、跟对面杠
· 突然不说话了，去处理手边的事

不许做的：
· 不写镜头怎么动，不写你心里在想什么（观众看不见，人也不会这样播）
· 不写镜头外面发生的事
· 不写日期、天气、新闻、真实地名、真实人名
· 不要每句都金句，不要每句都好笑，不要给这一段编一个完整的起承转合

这一段要写的是：紧接上一段往下播一小段。另外判断这一小段里有没有点名某个观众、当场出错、抽人连麦、或者向台下提问。

公屏上的网友是各说各的：有人接话、有人刷无关的、有人抬杠、有人只顾自己聊。每一条都在夸你，就不像直播间了。`;

/** 导演给台上的方向：新记录读 stageCue，老记录退回 director */
const stageDirection = (session: WatchAlongSession): string =>
  (session.stageCue || '').trim() || (session.director || '').trim();

/** 导演给角色的方向 */
const charDirection = (session: WatchAlongSession): string =>
  (session.charCue || '').trim() || (session.director || '').trim();

const beatLines = (beat: WatchBeat, withFollowUp = true): string => {
  const dm = beat.danmaku.map(d => `${d.author}：${d.text}`).join('；');
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
    dm ? `公屏：${dm}` : '',
    acts ? `台下动作：${acts}` : '',
  ];
  if (withFollowUp && beat.followUp) {
    lines.push(`接招画面：${beat.followUp.scene}`, `接招台词：${beat.followUp.speech}`);
  }
  return lines.filter(Boolean).join('\n');
};

/** 台上这一轮的材料：主播资料 + 前情 + 上一幕 + 本轮台下的互动 + 导演引导 */
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
  const { room, cast } = session;
  const recent = session.beats.slice(-2);
  const digest = session.digests.slice(-2).map(d => d.text).join('\n');
  const mic = opts.micOn ? '连麦中：麦上有人，你必须直接回应麦上的发言。' : '还没连麦：只有台下的公屏。';
  const cue = stageDirection(session);
  const count = opts.danmakuPerBeat ?? 4;

  return [
    `【你是谁】`,
    `你是「${room.streamerName}」，在这个平台上的号是 ${room.streamerHandle}，在「${room.category}」分区开播。`,
    ``,
    `【你的人设】`,
    room.bio || '（这个房间没写人设，按分区和标题自己认一个具体的人来演，别演成通用主播。）',
    `上面这些就是你本人，一个字都不要改。你说话的口气、爱说什么、在意什么、烦什么、多大年纪、什么来历，全部从这一段里来，不要另外发明一个主播。`,
    ``,
    `【你现在】`,
    `房间标题：《${room.title}》`,
    `此刻房间里有 ${room.viewerCount} 个人在看。`,
    mic,
    ``,
    digest ? `【本场前情】\n${digest}\n` : '',
    recent.length ? `【刚才播过的】\n${recent.map(b => beatLines(b)).join('\n\n')}\n` : '',
    opts.latest ? `【这一轮台下刚发生】\n${opts.latest}\n` : '',
    cue ? `【本场导演要你这么走】\n${cue}\n（这一轮顺着兑现，别把"导演"两个字说出来）\n` : '',
    `【你可以做的】`,
    `你在「${room.category}」分区直播，能做的就是这一行里该有的那些事：干活、说话、念公屏、谢礼、立目标、连麦——按你的人设和分区自己挑，不要每样都凑一遍，也不要做你这个人不会做的事。`,
    ``,
    `【这一轮要你写的】`,
    `紧接上一段往下播一小段：画和话交替 3 到 5 个来回，公屏 ${count} 条。这是正在播的直播，不是视频、不是录播、不是回放。`,
    ``,
    STAGE_FORMAT,
  ]
    .filter(s => s !== '')
    .join('\n');
}

/** 角色刚在公屏或麦上搞了事，让主播和网友当场接招（同一轮，不换幕） */
export function buildStageCounterTask(opts: {
  session: WatchAlongSession;
  actionText: string;
  micOn: boolean;
  danmakuPerBeat?: number;
}): string {
  const { session } = opts;
  const last = session.beats[session.beats.length - 1];
  const count = opts.danmakuPerBeat ?? 4;
  return [
    `【你是谁】`,
    `你是「${session.room.streamerName}」，在这个平台上的号是 ${session.room.streamerHandle}，在「${session.room.category}」分区开播。`,
    ``,
    `【你的人设】`,
    session.room.bio || '（这个房间没写人设，按分区和标题自己认一个具体的人来演，别演成通用主播。）',
    `上面这些就是你本人，一个字都不要改，口气和在意的事都从这一段里来。`,
    ``,
    `【你现在】`,
    `房间标题：《${session.room.title}》`,
    opts.micOn ? '你正在连麦。' : '你没在连麦。',
    ``,
    last ? `【当前这一段】\n${beatLines(last, false)}\n` : '',
    `【刚刚台下出的动静】\n${opts.actionText}`,
    ``,
    `【这一轮要你写的】`,
    `刚有人在公屏上说了句话。已经播过的那段不用回头改，你接着往下播一小段：画和话交替 3 到 5 个来回，公屏 ${count} 条。`,
    `那个人你不认识，只看得见一个网名。你要不要理他、要不要念他这条，按你自己的脾气来，不理也是可以的。`,
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

export const ROOM_POOL_RULES = `你在给电波陪看大厅刷一批**正在开播**的直播间，供用户和身边陪着的人一起逛、一起互动、或者上麦搞事。

先分清一件事：这是**直播**，不是视频网站。
· 每个房间此刻正在播，主播在镜头前说话做事，观众可以在公屏接话、可以连麦——这是它唯一成立的样子；
· 不要写视频合集、录播、回放、教程、测评、Vlog、第几期、上下集、剪辑、字幕组、搬运；
· 不要写纪录片式的冷门手艺、深夜修老物件、讲故事换酒这一路——没人拿这个当直播看。

**房间标题照真实直播间那样写**：主播开播时随手打的一行字，不是栏目名，也不是广告语。
· 长度：4 到 16 个字，越短越像真的；带货房间可以到 20 字。
· 常见就这几路，照着这个语气写：
  报人数/报目标/报惩罚（「100 人就下播」「满星之前不睡」「冲 3000 分今天」）；
  自嘲（「新人第亿次直播」「赔电费主播」「播了三年还是三十人」）；
  报今天干什么（「今天把这堆衣服清完」「接着看昨天那部」）；
  挑衅/钓人进来（「睡不着就进来坐会儿」「你敢问我就敢答」）。
· 不要写「XX 教程」「XX 合集」「十分钟看懂 XX」「带你了解 XX」这种视频标题。
· 手工、绘画、学习这几个分区也要是「人在镜头前做这件事」，不是解说这门手艺的来历和门道。
· 下面标了「例」的只是让你看清长短和语气，一个字都别直接用。

**分区必须从下面这份名单里选一个，照原样写，不许自己造**：
游戏｜英雄联盟、王者荣耀、和平精英、第五人格、原神、崩坏星穹铁道、绝区零、主机游戏、单机游戏、手游、棋牌
娱乐｜聊天、颜值、虚拟主播、唱见、舞见、团播、电台
生活｜学习、手工、绘画、户外、美食、萌宠、助眠、健身
带货｜服饰、美妆、家居、数码、食品

**主播人设要写成一个具体的人**，60 到 110 字，必须写到这几样里的至少四样：
多大年纪、白天干什么营生、播了多久、什么脾气、说话什么习惯（快慢、爱不爱笑、有没有口癖）、图什么（涨粉、混口饭、卖货、就是找个人说话）、有没有自己给自己立的规矩（比如输了唱歌、只在半夜播、说到几点就下）。

必须守住：
1. **风格要拉开**：这一批里年纪、营生、脾气、说话习惯都不一样，不要全是元气少女，也不要全是技术宅。
2. **每个房间都要有观众能插进去的地方**：能连麦、能报情况让人判断、能点歌打分、能砍价、能扣数字、能递话题让他接——不要干聊。
3. **主播名像真的网名**：英文+数字、叠字、小动物、带年份的，都行；不要「XX 官方」「XX 工作室」。
4. **不要重复**：这一批里名字、分区、玩法互不重复，也别和已经刷过的重复。
5. **没有现实感知**：不写具体日期、热搜、新闻事件、真实地名或真人。

怎么回：一个房间一行，用竖线隔开八样，一行都别多写，别写 JSON：

主播名 | @handle | 分区 | 房间标题 | 主播人设与当前玩法（60 到 110 字） | 在看人数 | 风格两字 | #起始色 #结束色

两行例（只示范八样怎么排，里面这两个人一个都别用）：
小鹿不乱撞 | @xiaolu_233 | 聊天 | 睡不着就进来坐会儿 | 24 岁，白天在便利店站班，晚上十点开播，说话慢，爱笑，被人叫姐姐会不好意思，图的不是钱是有人陪她说说话，一场下来有一半时间在念公屏 | 812 | 软话 | #2a1e2e #4a2338
两点还在打 | @liangdianzz | 第五人格 | 满星之前不下播 | 21 岁男生，嘴快手也快，输了先骂自己再骂对面，爱把公屏上挑刺的念出来怼回去，说好满星就下播，掉星就加播，一播到天亮 | 3400 | 嘴快 | #131a24 #1f3140

颜色给两个深色十六进制，用在封面渐变上。人数写纯数字。`;

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
    `【谁在看】${opts.userName}${opts.charName ? ` 和 ${opts.charName}` : ''} 一起刷直播间，随便看看打发时间`,
    opts.customRule
      ? `【这人的口味】${opts.customRule}`
      : `【这人的口味】没特别说，那就四个风格反差开：一个能连麦的、一个能听故事的、一个能押真假的、一个能看手艺或砍价的`,
    opts.exclude.length ? `【这批不要再用这些主播】${opts.exclude.slice(0, 24).join('、')}` : '',
    `【这一轮的任务】按上面的口味刷出 ${opts.count} 个此刻正在开播的直播间。每个都要有观众能立刻参与进去的抓手。`,
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
