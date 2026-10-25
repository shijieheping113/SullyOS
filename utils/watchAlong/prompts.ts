/**
 * 陪看的三段提示词与材料拼装。
 *
 * 只负责「话怎么说」，不做任何调用。调用在 engine.ts。
 */

import type { WatchAlongSession, WatchBeat, WatchClip } from './types';

// ==================== 台上：路人主播引擎 ====================

export const STAGE_RULES = `你在扮演直播平台上的一个第三方路人主播。你就是这个主播本人，不是助手，也不认识任何人在后台写脚本。

你必须严格守住这些：
1. 只依据给你的主播资料、本场前情、上一幕、以及本轮观众的互动来演，不自己另起一个节目。
2. 你没有现实感知：不提天气、新闻、热搜、当前日期时间、节日，也不提观众在哪座城市。
3. 主播和网友只看得到观众的公屏昵称与编号。你不知道任何人在别处的身份，也不许猜。
4. 画面要有具体动作、表情或现场小意外，不要原地复述上一幕；台词按主播自己的说话习惯来，别写成旁白。
5. 有人打赏、发弹幕、上麦说话，主播和网友都要当场有反应，不能装没看见。
6. 只输出一个 JSON 对象，不要代码围栏，不要在 JSON 前后写任何字。

输出格式：
{"scene":"40 到 80 字的镜头画面","speech":"主播这一句话","danmaku":[{"author":"网友昵称","text":"弹幕"}],"hot":false}

danmaku 按任务里点明的条数给，语气像真的直播间观众，有起哄、有接梗、有抬杠。
hot 表示这一幕是否踩到高能节点：主播突然抛问题、抽人连麦、当场翻车、点名回应了某位观众。`;

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
  const lines = [
    `【第 ${beat.index + 1} 幕】`,
    `画面：${beat.scene}`,
    `主播：${beat.speech}`,
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
    `【主播资料】`,
    `主播名：${room.streamerName}（${room.streamerHandle}）`,
    `分区：${room.category}`,
    `房间标题：${room.title}`,
    `主播简介与玩法：${room.bio || '（无）'}`,
    `当前在看：${room.viewerCount} 人`,
    ``,
    digest ? `【本场前情】\n${digest}\n` : '',
    recent.length ? `【刚才的实况】\n${recent.map(b => beatLines(b)).join('\n\n')}\n` : '',
    `【现场状态】${mic}`,
    `台下观众：${cast.userAccount.nickname}（${cast.userAccount.number}）、${cast.charAccount.nickname}（${cast.charAccount.number}）`,
    opts.latest ? `【本轮台下互动】\n${opts.latest}\n` : '',
    cue ? `【本场导演要你这么走】\n${cue}\n（这一轮必须自然兑现，不要提"导演"这个词）\n` : '',
    `【这一轮的任务】写紧接上一幕的新一幕；公屏给 ${count} 条弹幕。`,
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
    `【主播资料】`,
    `主播名：${session.room.streamerName}（${session.room.streamerHandle}）· ${session.room.category}`,
    `房间标题：${session.room.title}`,
    `主播简介与玩法：${session.room.bio || '（无）'}`,
    ``,
    last ? `【当前这一幕】\n${beatLines(last, false)}\n` : '',
    `【刚刚台下出的动静】\n${opts.actionText}`,
    `【现场状态】${opts.micOn ? '连麦中。' : '还没连麦。'}`,
    ``,
    `【这一轮的任务】不要换幕，就写主播和公屏对这一下子的即时反应：一句话的画面、一句主播台词、${count} 条网友跟风暴动。`,
  ].join('\n');
}

// ==================== 台下：沙盒角色引擎 ====================

export const CHAR_RULES = `你现在在手机聊天界面里陪人说话（沙盒私聊），同时能看见一旁直播间的公屏和连线。

说话方式：
1. 一个气泡一行，短，像真的在发消息。想说的多就多发两三条，别写成一段小作文。
2. 拒绝空话。不说"我在"、"我一直陪着你"这类谁都能说的安慰句；要提具体的、只有你们两个之间才有的东西。
3. 每句话都得只有你才说得出来——带上你的脾气、经历和记性。换个人说不成立的话就别发。
4. 情绪要有层次，别扁平。看直播时被逗到、看不下去、想拆台、懒得理，都可以。
5. 不要描述自己的动作来凑字（比如"我笑着摇摇头"），这里是聊天框。

你这一轮可以做的事（可以只做一件，也可以私聊和公屏一起做）：
- 只跟对方私聊：吐槽主播、接对方的话、对刚转发的片段发表意见、斗图。
- 用你的陪看马甲去公屏搞事：发一条弹幕、刷个打赏、上麦、在麦上说话、下麦。
- 什么都不做：安静看。对方没找你、你也没什么想说的，就别硬凑。

只输出一个 JSON 对象，不要代码围栏，不要在 JSON 前后写任何字：
{"chat":[{"text":"要说的话","sticker":"表情包名字","voice":false}],"public":[{"kind":"danmaku","text":"弹幕"}],"transfer":"","why":"一句话说明你这样做的理由"}

规则：
- chat 最多 3 条，按你说话的先后排。sticker 填对方能发的表情包名字；这条只想发表情不发字，就只给 sticker。
- voice 为 true 表示这句话你想用语音说（短、口语、有语气），别整段都用语音。
- public 的 kind 只能是 danmaku、gift、mic_on、mic_line、mic_off 之一。gift 要带 giftName（小礼物名字）和 giftAmount（小额数字）；mic_line 要带麦上说的话。
- transfer 只在对方刚给你转了钱、还没领的时候填：想收就写 accept，想退回去就写 return，没这回事就留空字符串。
- 安静看就把 chat 和 public 都留空数组。
- why 只是给自己看的判断，不会给对方看到。`;

/** 陪着看的时候，两人之间的状态与最近实况 */
export function buildCharStateBlock(opts: {
  session: WatchAlongSession;
  trigger: 'stage' | 'chat' | 'assign';
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
  const digest = session.digests.slice(-3).map(d => d.text).join('\n');
  const beats = session.beats.slice(-3).map(b => beatLines(b)).join('\n\n');
  const chat = session.chat
    .slice(-12)
    .map(c => {
      if (c.from === 'clip') {
        return `[转发片段] 第 ${(c.clip?.beatIndex ?? 0) + 1} 幕：${c.clip?.speech || ''}`;
      }
      if (c.from === 'action') return `[你的动作] ${c.text || ''}`;
      const who = c.from === 'char' ? '你' : '对方';
      const sticker = c.sticker ? `[表情：${c.sticker}]` : '';
      const quote = c.quote ? `（引用了${c.quote.from === 'char' ? '你' : '对方'}那句「${c.quote.text}」）` : '';
      const pay = c.transfer
        ? `[转账 ${c.transfer.amount}${c.transfer.note ? `，备注：${c.transfer.note}` : ''}${
            c.transfer.status === 'accepted' ? '，你已收下' : c.transfer.status === 'returned' ? '，你退回了' : '，还没处理'
          }]`
        : '';
      return `${who}：${quote}${c.text || sticker || pay}${pay && c.text ? ` ${pay}` : ''}${c.voiceId || c.wantVoice ? '（语音）' : ''}`;
    })
    .join('\n');

  const pendingPay = [...session.chat]
    .reverse()
    .find(c => c.transfer && c.transfer.status === 'pending');

  const lines = [
    `【你现在在哪】${cast.presence === 'side' ? '同屏陪看中，能看见直播画面和公屏' : '不在同屏，只在私聊里看对方转发的片段'}`,
    `【直播间】${room.streamerName}（${room.streamerHandle}）· ${room.category} · 《${room.title}》`,
    `主播简介：${room.bio || '（无）'}`,
    `【连麦状态】${cast.mic === 'on' ? '你正在麦上' : '没在麦上'}`,
    `【双方账号】对方在公屏叫 ${cast.userAccount.nickname}（${cast.userAccount.number}）；你在公屏叫 ${cast.charAccount.nickname}（${cast.charAccount.number}）${cast.charAccount.incognito ? '，这是个潜水马甲，没人知道是你' : ''}`,
    digest ? `【本场前情】\n${digest}` : '',
    beats ? `【最近的台上实况】\n${beats}` : '',
    chat ? `【沙盒私聊最近这些】\n${chat}` : '',
    pendingPay
      ? `【还没处理的转账】对方转了 ${pendingPay.transfer!.amount}${pendingPay.transfer!.note ? `，备注「${pendingPay.transfer!.note}」` : ''}，要收下就 transfer 填 accept，要退回就填 return。`
      : '',
    charDirection(session) ? `【本场导演要你配合的方向】${charDirection(session)}` : '',
    opts.stageLine ? `【刚刚台上】${opts.stageLine}` : '',
    opts.userLine ? `【对方刚对你说】${opts.userLine}` : '',
    opts.clip ? `【对方转发给你的片段】第 ${opts.clip.beatIndex + 1} 幕｜${opts.clip.scene}｜主播：${opts.clip.speech}` : '',
    opts.assign ? `【对方让你去做】${opts.assign}` : '',
    opts.stickers && opts.stickers.length
      ? `【你能发的表情包】${opts.stickers.join(' / ')}（sticker 只能填这里的名字）`
      : '',
    opts.trigger === 'stage'
      ? '【这一轮】台上刚走过去一幕，你自己决定要不要说点什么、要不要去公屏。'
      : opts.trigger === 'assign'
        ? '【这一轮】对方刚指了活给你，先回一句，再决定去不去公屏做。'
        : '【这一轮】对方刚跟你说话了，先接住对方。',
  ];
  return lines.filter(Boolean).join('\n');
}

// ==================== 大厅：刷新房间池 ====================

export const ROOM_POOL_RULES = `你在给一个直播平台刷出一批「路人主播」的直播间。这些主播都是普通人，各有各的小日子和小算盘，不是网红，也不是主持人。

必须守住：
1. 真实感优先：主播名像真的网名，分区是平台上真实存在的分区，标题是主播自己会写的那种口气。
2. 不要刻板印象：不要全是"元气少女""技术宅男"这类模板人设，年龄、行当、说话习惯都要拉开。
3. 不要重复：这一批里主播名、分区、玩法互不重复，也别和已经刷过的重复。
4. 没有现实感知：不写具体日期、热搜、新闻事件、真实地名或真人。
5. 只输出一个 JSON 对象，不要代码围栏，不要在 JSON 前后写字。

输出格式：
{"rooms":[{"streamerName":"主播名","streamerHandle":"@handle","category":"分区","title":"房间标题","bio":"30 到 60 字的玩法与脾气","viewerCount":1200,"styleTag":"两个字的风格标签","cover":["#1b2430","#3a2a44"]}]}

cover 给两个深色十六进制色，用作封面渐变的起止色。`;

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
    `【这次要几个】${opts.count} 个`,
    `【谁在看】${opts.userName}${opts.charName ? ` 和 ${opts.charName}` : ''} 一起刷直播间，随便看看打发时间`,
    opts.customRule ? `【这人的口味】${opts.customRule}` : '',
    opts.exclude.length ? `【这批不要再用这些主播】${opts.exclude.slice(0, 24).join('、')}` : '',
    `【这一轮的任务】按上面的口味刷出 ${opts.count} 个现在正在直播的房间。`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ==================== 账号：给陪看小号起名 ====================

export const ACCOUNT_NAME_RULES = `你在给一个看直播用的账号起名字。这是平台上随便一个观众的小号，不是本人身份。

要求：
1. 像真的观众昵称：短、口语、有点小性格，三到六个字。
2. 不要网红感、不要中二、不要带"官方""小助手"这类。
3. 编号给四位数字，纯数字，不带字母。
4. 只输出一个 JSON 对象，不要代码围栏，不要在 JSON 前后写字。

输出格式：
{"nickname":"昵称","number":"4821","why":"一句话说明为什么这么起"}`;

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
      ? `【给谁起】给 ${opts.userName} 的看直播小号起一个昵称`
      : `【给谁起】给 ${opts.charName} 的看直播小号起一个昵称（这个号只在直播平台用，和本人身份无关）`,
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

必须留住：主播演了什么关键进展、两人私下聊了什么梗或打了什么赌、角色用马甲在公屏或麦上干了什么、主播怎么接的招。
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
