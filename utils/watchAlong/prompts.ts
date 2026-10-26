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

画：这场直播正在播的那件事，此刻是什么样子
话：你随口说的一句
（「画」和「话」这样交替，写 3 到 5 个来回，不要一口气写完画面再一口气说完话）
自查一句：这句话换成任何一个别的主播也说得通，就删掉。你本人的日常小动作不算直播内容，除非这个动作正是这场在播的东西。

弹幕：台下某个人｜他发的那条
（条数照上面说的来，是这一片看客各自的反应；熟客可以反复出现，不用每条都是新面孔）
点名：是 或者 否`;

/**
 * 主播这一路的规矩。
 *
 * 这里**只写直播这件事本身的规律**（一个机位、嘴不停、挑着念公屏、句子是碎的），
 * 不写性格、不写语气风格、不写范例台词——那些全部由房间里的人设和分区决定。
 * 2026-10-26 Ann 打回两次：「不要自己再写这种老北京味的修东西」「具体要求也不能写，模型会照抄」。
 * 下面的规律全部来自抖音、B站、小红书真实直播间的实际形态（素材见 notes/直播素材-调研.md）。
 */
/**
 * 主播这一路的规矩。
 *
 * 原则：只写「直播这件事是怎么成立的」，不写性格、不写语气风格、不写任何范例台词。
 * 2026-10-26 Ann 打回四次的结论：
 * 1. 原来写「机位不动」是错的——探店、旅行、逛街这些直播镜头本身就在动；
 * 2. 「嘴几乎不停」「大部分时间你自己说」「没人说话你也能往下讲」是多余的，模型本来就会说话；
 * 3. 「同一句话你会说很多遍」写成这样等于教它重复、过拟合，删掉；
 * 4. 「句子是碎的」说得不对，要的是「口语，不是写小说」；
 * 5. 动作菜单（喝水、挪东西…）会被照抄，删掉；
 * 6. 真正该写的是：**一场直播有一个正在推进的主题**，以及**这个主播为什么想播**。
 */
export const STAGE_RULES = `你在开一场直播。看的人只看得见画面里的那一块：画面里有什么，他们就只看得见什么。画面里可能只有你，可能只有你在打的那局游戏，也可能是个虚拟形象，取决于这场播的是什么。画面可能一直没变，也可能跟着你走。

一场直播有一个正在推进的主题。你开播的时候心里有一件正在做的事，这一段就是那件事往前走的一小步，不是随便换个话题接着说。

你开这场是有目的的，人设里写着图什么。想被人看见、想挣点钱、想找个人说话、想把这件拖了很久的事做完——这个目的会让你有劲、会上头、会急、也会突然泄气。

你说话是嘴里蹦出来的，不是写出来的。写成作文就假了：不用书面词，不用工整的长句，不排比，不总结，不把一段话说得头尾俱全。真人一句话常常就几个字，说一半拐弯、一个词翻来覆去抓、话说一半先去管公屏，都是常态。自查：你的「话」要是念出来不像张嘴就说，删了重写。

房间里有人。气氛是你和他们一起弄出来的：你抛一句，他们接或者不接，你再接回去。人少的时候你是在跟具体的几个人说话，人多的时候你是在对一片人说话。

这一段要写的是：紧接上一段，把这场直播往下推一小步。另外判断这一小段里有没有点名某个观众、当场出错、抽人连麦、或者向台下提问。

不许做的：不用摄影行话（只写看的人看得见的东西）、不写你心里怎么想（看的人看不见）、不写画面外面的事、不写日期天气新闻真实地名、不要给这一段编一个完整的起承转合。`;

/** 导演给台上的方向：新记录读 stageCue，老记录退回 director */
const stageDirection = (session: WatchAlongSession): string =>
  (session.stageCue || '').trim() || (session.director || '').trim();

/** 导演给角色的方向 */
const charDirection = (session: WatchAlongSession): string =>
  (session.charCue || '').trim() || (session.director || '').trim();

/**
 * 这一轮真的开过口的自家账号（用户 / 角色）。
 *
 * 只有他们这一轮说过话，主播才该知道有这么两个号；没出现的，一个字都不提——
 * 提了就等于告诉主播「有这么个人在」，还容易被它拿去点名。
 */
const accountsSpoke = (session: WatchAlongSession, material: string): string[] => {
  if (!material) return [];
  const names = [session.cast?.userAccount?.nickname, session.cast?.charAccount?.nickname]
    .map(n => (n || '').trim())
    .filter(Boolean);
  return Array.from(new Set(names.filter(n => material.includes(n))));
};

/**
 * 这一轮开过口的自家账号不归主播写。
 *
 * 只禁这两三个号，**不禁弹幕本身**——主播这一路就是要写公屏的，
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
  const { room } = session;
  const recent = session.beats.slice(-2);
  const digest = session.digests.slice(-2).map(d => d.text).join('\n');
  const mic = opts.micOn ? '连麦中：麦上有人，你必须直接回应麦上的发言。' : '还没连麦：只有台下的公屏。';
  const cue = stageDirection(session);
  const count = opts.danmakuPerBeat ?? 4;
  // 公屏弹幕是主播这一路要写的东西，绝不写成「不许替弹幕说话」——那会直接不生成。
  // 只有**这一轮真的开过口**的自家两个号不归主播写；没出现的人，主播不该知道他们存在
  // （Ann 2026-10-26：不能在用户和角色没出现的时候知道他们）。
  const spoken = accountsSpoke(session, opts.latest);
  const ownLine = spoken.length ? ownBanLine(spoken) : '';

  return [
    `【你是谁】`,
    `你是「${room.streamerName}」，在这个平台上的号是 ${room.streamerHandle}，在「${room.category}」直播。`,
    ``,
    `【你的人设】`,
    room.bio || '（这个房间没写人设，按分区和标题自己认一个具体的人来演，别演成通用主播。）',
    `上面这些就是你本人，一个字都不要改：你是谁、什么脾气、说话的调子、图什么，全部从这里来，不要另外发明一个主播。`,
    ``,
    `【你说什么语言】`,
    `人设里写了你说什么语言，就用那个语言的原话写你的台词；没写就说中文。`,
    ``,
    `【你现在】`,
    `房间标题：《${room.title}》`,
    `此刻房间里有 ${room.viewerCount} 个人在看。`,
    mic,
    `台下的人你看不见脸，只看得见一个个网名。有人跟你说话的时候，那句话已经自己出现在公屏上了；没人理你的时候，你就自己播自己的。`,
    `台下是一群看客，公屏上的反应由你写。同一个号可以反复出现，熟客会一来再来，不用每条都是新人。`,
    `没跟你搭过话的号，你一个都不认识，别猜他是谁。`,
    ownLine,
    ``,
    digest ? `【本场前情】\n${digest}\n` : '',
    recent.length ? `【刚才播过的】\n${recent.map(b => beatLines(b)).join('\n\n')}\n` : '',
    opts.latest ? `【这一轮台下刚发生】\n${opts.latest}\n` : '',
    cue ? `【本场导演要你这么走】\n${cue}\n（这一轮顺着兑现，别把"导演"两个字说出来）\n` : '',
    `【你可以做的】`,
    `这一场要推进的那件事就在你的人设里，这一段让它往前走一点。`,
    ``,
    `【这一轮要你写的】`,
    `紧接上一段往下播一小段，再写台下 ${count} 条观众的反应。这是正在播的直播，不是视频、不是录播、不是回放。`,
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
  // 刚搞事那个号的话是他自己说的：不生成他的弹幕、不替他接下一句。
  // 同样只点这一轮真开过口的人。
  const spoken = accountsSpoke(session, opts.actionText);
  const ownLine = spoken.length ? ownBanLine(spoken) : '';
  return [
    `【你是谁】`,
    `你是「${session.room.streamerName}」，在这个平台上的号是 ${session.room.streamerHandle}，在「${session.room.category}」直播。`,
    ``,
    `【你的人设】`,
    session.room.bio || '（这个房间没写人设，按分区和标题自己认一个具体的人来演，别演成通用主播。）',
    `上面这些就是你本人，一个字都不要改：你是谁、什么脾气、说话的调子、图什么，全部从这里来。`,
    ``,
    `【你说什么语言】`,
    `人设里写了你说什么语言，就用那个语言的原话写你的台词；没写就说中文。`,
    ``,
    `【你现在】`,
    `房间标题：《${session.room.title}》`,
    opts.micOn ? '你正在连麦。' : '你没在连麦。',
    `台下坐着几个看客，你看不见脸，只看得见网名。`,
    `弹幕照写，同一个号可以反复出现，熟客会一来再来。${ownLine ? ` ${ownLine}` : ''}`,
    ``,
    last ? `【当前这一段】\n${beatLines(last, false)}\n` : '',
    `【刚刚台下出的动静】\n${opts.actionText}`,
    ``,
    `【这一轮要你写的】`,
    `刚有人在公屏上说了句话。已经播过的那段不用回头改，你接着把这场直播往下推一小段：画和话交替 3 到 5 个来回，公屏 ${count} 条。`,
    `那个人你不认识，只看得见一个网名。要不要理、要不要念他这条，按你自己的脾气来，不理也是可以的。`,
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

export const ROOM_POOL_RULES = `你在给陪看大厅刷一批**正在开播**的直播间，供用户和身边陪着的人一起逛、一起互动、或者上麦搞事。

这是**直播**，不是视频网站：每个房间此刻正在播，主播在画面里说话做事，看的人可以在公屏接话、可以连麦。不要写视频合集、录播、回放、教程、测评、Vlog、第几期、上下集、剪辑、搬运；也不要写纪录片式的冷门手艺、深夜修老物件、讲故事换酒——没人拿这个当直播看。

**房间标题照真实直播间那样写**：主播开播时随手打的一行，不是栏目名，也不是广告语。
· 中文直播：4 到 16 字。报进度、自嘲、报人数、钓人进来都行（「100 人就下播」「新人第亿次直播」「睡不着就进来坐会儿」）。
· 日语直播：可以拿【】括起来分块，可以拖音，可以放颜文字，报进度很常见（「52日目」「#3」「ep.50」），也可以极简到只写两个词。
· 英语直播：短句，可以用竖线分栏，大写也行。
· 一律不许写「XX 教程」「XX 合集」「十分钟看懂 XX」这种视频标题。
· 就算是带货分区，标题也不是叫卖广告：报价、促销、清仓这种话放进人设和台词里说，标题还是主播开播前随手打的那行。
· 手工、绘画、作业、学习这些分区也要是「人在画面里做这件事」，不是讲解这门手艺的来历。

**分区从下面选一个，照原样写，不许自己造**：
游戏实况、杂谈、聊天、歌回、虚拟主播、绘画、手工、作业、学习、ASMR、料理、吃播、探店、旅拍、户外、健身、比赛、带货

**主播人设要写成一个具体的人**，90 到 140 字，用「；」隔开下面六样，一样都不许省：
1. 是谁：多大、哪国人、说什么语言、白天干什么营生；
2. 说话什么调：快慢、口癖、爱不爱笑、会不会冷场；
3. 什么体量：播了多久、平时多少人、新人还是老手；
4. 这一场图什么：涨粉、挣钱、卖货、找个人说话、把这件事做完、想赢；
5. 自己立的规矩：输了做什么、播到几点、不接什么；
6. 怕什么，什么会让 ta 卡住。

必须守住：
1. **风格要拉开**：这一批里年纪、营生、脾气、说话习惯都不一样，不要全是元气少女，也不要全是技术宅。
2. **要有外语主播**：日本人说日语、或者英语主播，标题和语气按那个语言的习惯来，不要全刷中文房间。
3. **每个房间都要有观众能插进去的地方**：能连麦、能点歌、能砍价、能扣数字、能递话题让他接——不要干聊。
4. **主播名像真的网名**：英文加数字、叠字、小动物、假名，都行；不要「XX 官方」「XX 工作室」。
5. **不要重复**：名字、分区、玩法互不重复，也别和刷过的重复。
6. **没有现实感知**：不写具体日期、热搜、新闻事件、真实地名或真人。
7. **不出现任何平台名，也不用某个平台独有的叫法**：会员、礼物、打赏、SC 这种通用说法可以用。
8. **默认是年轻人在播、年轻人在看**：房间的画风、说话、玩法都是当下年轻人深夜会点进去的那种；除非口味里点名要，不要养生讲堂、鉴宝、中老年服装摊这类爸妈那辈才停留的房间。

怎么回：一个房间一行，用竖线隔开八样，一行都别多写，别写 JSON：

主播名 | @handle | 分区 | 房间标题 | 人设（90 到 140 字，六样用「；」隔开） | 在看人数 | 风格两字 | #起始色 #结束色

两行例（只示范八样怎么排，里面这两个人一个都别用）：
あさひ | @asahi_game | 游戏实况 | 【ホラー初見】叫ぶので音量注意 | 23 岁日本人，说日语，白天在便利店打工，晚上播两小时；说话快，爱给自己配音，一慌就碎碎念；播了一年多，平时两百来人，算半个新人；这一场想把这款恐怖游戏打通；说过叫出声就罚自己少喝一罐咖啡；最怕突然安静的段落 | 240 | 慌张 | #1a2028 #2b2438
moth | @mothnight | 聊天 | 3am again, tell me something weird | 27 岁，说英语，白天写代码；说话慢，会长时间不开口再突然冒一句；播了三年，平时不到一百人；这一场就是不想一个人待着，想有人陪着熬到困；说过四点一定关；被问到私事会卡住 | 96 | 慢热 | #16181f #232a33

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
      : `【这人的口味】没特别说，那就按年轻人现在深夜爱逛的来：游戏实况、歌回、杂谈聊天、虚拟主播、整活联动这些里挑四个反差开的；不要养生讲堂、鉴宝、中老年带货这种摊子`,
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
