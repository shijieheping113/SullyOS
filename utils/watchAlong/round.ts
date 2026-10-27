/**
 * 陪看一轮的调度器。
 *
 * 所有互动只从两个口进来：点继续看 / 我在公屏动了手（advanceRound），
 * 我在私聊说话 / 转发片段 / 指派角色（chatRound）。
 *
 * 「角色不下场，画面不跳幕」这条规矩只在这里判一次。别处不许再推进画面。
 */

import type {
  APIConfig,
  CharacterProfile,
  Emoji,
  EmojiCategory,
  Message,
  UserProfile,
} from '../../types';
import {
  buildSessionRecap,
  digestSessionBeats,
  generateStageBeat,
  generateStageCounter,
  runCharTurn,
} from './engine';
import type { CharOutput, StageOutput } from './engine';
import type {
  WatchAlongSession,
  WatchBeat,
  WatchChatMessage,
  WatchClip,
  WatchDanmaku,
  WatchPublicAction,
  WatchSettings,
} from './types';
import {
  WATCH_DIGEST_CHAT_WATERLINE,
  defaultWatchSettings,
  watchId,
} from './types';

/**
 * 设计单禁令：台上的网友弹幕只能来自台下围观的陌生人。
 *
 * 主播那一路偶尔会顺手拿「我」或角色的号替他们发弹幕（等于冒充），
 * 这里直接丢掉这类弹幕——不靠模型自觉，也不为这个再问一遍（每一次调用都花用户的钱）。
 */
function stripImpersonated(list: WatchDanmaku[], session: WatchAlongSession): WatchDanmaku[] {
  const taken = new Set(
    [session.cast.userAccount.nickname, session.cast.charAccount.nickname]
      .map(n => (n || '').trim())
      .filter(Boolean),
  );
  if (!taken.size) return list;
  return list.filter(d => !taken.has((d.author || '').trim()));
}

/** 一轮跑起来需要的外部材料（界面层给，引擎层不知道它们从哪来） */export interface RoundContext {
  apiConfig: APIConfig;
  char: CharacterProfile;
  userProfile: UserProfile;
  /** 主聊天可见范围里的原文 */
  historyMessages: Message[];
  emojis: Emoji[];
  categories: EmojiCategory[];
  /** 陪看全局设置；不传按出厂值走（主模型 + 自动总结开） */
  settings?: WatchSettings;
}

/** 把可选设置补成完整设置 */
const settingsOf = (ctx: RoundContext): WatchSettings => ctx.settings ?? defaultWatchSettings();

export interface RoundResult {
  session: WatchAlongSession;
  /** 台上画面有没有往前走 */
  advanced: boolean;
  /** 桌宠要冒的一句气泡 */
  bubble?: string;
  /** 模型这一轮没接上：我的消息照常留着，只是没回音 */
  failed?: boolean;
}

const clone = (session: WatchAlongSession): WatchAlongSession =>
  JSON.parse(JSON.stringify(session)) as WatchAlongSession;

/**
 * 用户在公屏发文字：立刻写进当前这一幕，不另开一幕，也不叫模型。
 * 还没有任何一幕时，先搁在 pendingPublic，等第一幕真正生成后再排在新弹幕前面。
 */
export function appendLivePublic(session: WatchAlongSession, action: WatchPublicAction): WatchAlongSession {
  const next = clone(session);
  next.updatedAt = Date.now();
  if (!next.beats.length) {
    next.pendingPublic = [...(next.pendingPublic ?? []), action];
    return next;
  }
  const last = next.beats[next.beats.length - 1];
  last.userActions = [...(last.userActions ?? []), action];
  if (action.kind === 'mic_line' && action.text) last.userMicLine = action.text;
  return next;
}

// ==================== 动作转成人话（给模型看）====================

function describeAction(a: WatchPublicAction): string {
  switch (a.kind) {
    case 'gift':
      return `打赏了 ${a.giftName || '一个小礼物'}${a.giftAmount ? ` ${a.giftAmount}` : ''}`;
    case 'mic_on':
      return '申请上麦并接通了';
    case 'mic_off':
      return '下麦了';
    case 'mic_line':
      return `在麦上说「${a.text || ''}」`;
    default:
      return `发了条弹幕「${a.text || ''}」`;
  }
}

const describeActions = (who: string, actions: WatchPublicAction[]): string =>
  actions.map(a => `${who}${describeAction(a)}`).join('；');

/** 导演有没有点名角色，点名了就必须让角色动 */
function directorMentionsChar(session: WatchAlongSession, director: string): boolean {
  if (!director) return false;
  const name = session.cast.charAccount.nickname;
  return director.includes('角色') || director.includes('马甲') || (!!name && director.includes(name));
}

/** 我的连麦动作要把本场连麦状态一起改掉 */
function applyMicChanges(session: WatchAlongSession, actions: WatchPublicAction[]): void {
  actions.forEach(a => {
    if (a.kind === 'mic_on') session.cast.mic = 'on';
    if (a.kind === 'mic_off') session.cast.mic = 'off';
  });
}

/** 把角色的回复与动作落进本场记录，返回该冒的泡 */
function applyCharOutput(
  session: WatchAlongSession,
  out: CharOutput,
  beat: WatchBeat | undefined,
): string | undefined {
  const now = Date.now();
  const charName = session.cast.charAccount.nickname;

  out.chat.forEach((line, i) => {
    const msg: WatchChatMessage = {
      id: watchId('msg'),
      from: 'char',
      text: line.text || undefined,
      sticker: line.sticker || undefined,
      wantVoice: line.voice || undefined,
      beatIndex: beat?.index,
      at: now + i,
    };
    session.chat.push(msg);
  });

  if (out.public.length) {
    if (beat) {
      beat.charActions.push(...out.public);
      // 角色在麦上说的最后一句，就是这一拍的麦上语音（连麦只有角色出声）
      const micLine = [...out.public].reverse().find(a => a.kind === 'mic_line' && a.text);
      if (micLine) {
        beat.charMicLine = micLine.text;
        // 台词换了，上一版录音作废，界面会按新的文字重新合成
        beat.charMicVoiceId = undefined;
      }
    }
    applyMicChanges(session, out.public);
    session.chat.push({
      id: watchId('act'),
      from: 'action',
      text: describeActions(charName, out.public),
      beatIndex: beat?.index,
      at: now + 50,
    });
  }

  // 转账：角色这一轮决定收下还是退回，改的永远是最新那条还没处理的
  if (out.transfer) {
    for (let i = session.chat.length - 1; i >= 0; i--) {
      const m = session.chat[i];
      if (!m.transfer || m.transfer.status !== 'pending' || m.from !== 'user') continue;
      m.transfer = {
        ...m.transfer,
        status: out.transfer === 'accept' ? 'accepted' : 'returned',
      };
      session.chat.push({
        id: watchId('act'),
        from: 'action',
        text:
          out.transfer === 'accept'
            ? `收下了 ${m.transfer.amount}`
            : `把 ${m.transfer.amount} 退了回来`,
        beatIndex: beat?.index,
        at: now + 60,
      });
      break;
    }
  }

  const first = out.chat[0];
  if (first) return first.text || first.sticker || undefined;
  if (out.public.length) return describeActions(charName, out.public);
  return undefined;
}

/** 角色去公屏搞事之后，主播要当场接招的那句话 */
const charPublicText = (session: WatchAlongSession, out: CharOutput): string =>
  describeActions(session.cast.charAccount.nickname, out.public);

/** 角色要不要对台上这一幕起反应 */
function charShouldReact(
  session: WatchAlongSession,
  stage: StageOutput,
  director: string,
): boolean {
  // 只有同屏才看得见台上；单看和仅后台私聊都不对画面起反应
  if (session.cast.presence !== 'side') return false;
  return (
    session.cast.mic === 'on' ||
    session.cast.autoReact ||
    stage.hot ||
    directorMentionsChar(session, director)
  );
}

// ==================== 路线 A：推进台上 ====================

/**
 * 点继续看，或者我在公屏发弹幕/打赏/连麦。
 * 台上先走一幕；角色只有在同屏、且（连麦中 / 开了自主反应 / 本幕高能 / 导演点名）时才动。
 * 角色真去公屏了，主播在同一幕里当场接招——画面不再多跳一幕。
 */
export async function advanceRound(
  opts: RoundContext & {
    session: WatchAlongSession;
    /** 我这一轮在公屏做的事 */
    myActions?: WatchPublicAction[];
  },
): Promise<RoundResult> {
  const session = clone(opts.session);
  const cfg = settingsOf(opts);
  // 导演给台上的方向这一轮就用掉；给角色的方向留着，等角色那一轮再用
  const stageCue = (session.stageCue || '').trim();
  session.stageCue = '';
  const legacyCue = session.director || '';
  session.director = '';
  // 导演点到角色（不管写在台上那栏还是角色那栏）就必须让角色动
  const directorHint = [stageCue, session.charCue || '', legacyCue].join(' ').trim();

  const myActions = opts.myActions ?? [];
  applyMicChanges(session, myActions);

  let stage: StageOutput;
  try {
    stage = await generateStageBeat({
      apiConfig: opts.apiConfig,
      char: opts.char,
      session,
      // 这里必须用真实昵称，不能写「观众」：
      // 「观众」会被模型当成一个网名照抄进弹幕栏，变成替人发言。
      latest: myActions.length ? describeActions(session.cast.userAccount.nickname, myActions) : '',
      model: cfg.stageModel,
      danmakuPerBeat: cfg.danmakuPerBeat,
    });
  } catch (e) {
    // 台上没接上：我在公屏说的话照样留在这一幕里，只是主播没反应
    if (!myActions.length) throw e;
    session.beats.push({
      id: watchId('beat'),
      index: session.beats.length,
      scene: '这一幕没接通，主播那边静了一下。',
      speech: '',
      seq: [{ kind: 'scene', text: '这一幕没接通，主播那边静了一下。' }],
      danmaku: [],
      hot: false,
      userActions: [...myActions],
      charActions: [],
      userMicLine: [...myActions].reverse().find(a => a.kind === 'mic_line' && a.text)?.text,
      at: Date.now(),
    });
    return { session, advanced: true, failed: true };
  }

  const beat: WatchBeat = {
    id: watchId('beat'),
    index: session.beats.length,
    scene: stage.scene,
    speech: stage.speech,
    seq: stage.seq,
    danmaku: stripImpersonated(stage.danmaku, session),
    hot: stage.hot,
    userActions: [...myActions],
    charActions: [],
    // 我在麦上说的话是文字，不出声；出声的只有角色（Ann 2026-10-26）
    userMicLine: [...myActions].reverse().find(a => a.kind === 'mic_line' && a.text)?.text,
    at: Date.now(),
  };
  session.beats.push(beat);

  if (!charShouldReact(session, stage, directorHint)) {
    return { session, advanced: true };
  }

  const out = await runCharTurn({
    ...opts,
    session,
    trigger: 'stage',
    stageLine: `${stage.scene}｜主播：${stage.speech}`,
    model: cfg.charModel,
  });
  const bubble = applyCharOutput(session, out, beat);
  if (!out.wentPublic) return { session, advanced: true, bubble };

  const counter = await generateStageCounter({
    apiConfig: opts.apiConfig,
    char: opts.char,
    session,
    actionText: charPublicText(session, out),
    micOn: session.cast.mic === 'on',
    model: cfg.stageModel,
    danmakuPerBeat: cfg.danmakuPerBeat,
  });
  beat.followUp = { scene: counter.scene, speech: counter.speech, danmaku: counter.danmaku, seq: counter.seq };
  if (counter.hot) beat.hot = true;

  return { session, advanced: true, bubble };
}

// ==================== 路线 B：私聊 ====================

/**
 * 我在私聊说话、转发片段、或指派角色做事。
 * 角色只私下回 → 台上停在原地；角色真去公屏了 → 同轮生成接招后的新一幕。
 */
export async function chatRound(
  opts: RoundContext & {
    session: WatchAlongSession;
    /** 我说的那句话 */
    text?: string;
    /** 我转发的片段 */
    clip?: WatchClip;
    /** 我指给角色的活 */
    assign?: string;
    /** 我引用的是哪一句 */
    quote?: WatchChatMessage['quote'];
    /** 我发的表情包 */
    sticker?: string;
    /** 我转的钱 */
    transfer?: WatchChatMessage['transfer'];
    /** 只把这条消息落进记录，不去叫角色：私聊要手动触发（跟主聊天一样的节奏） */
    logOnly?: boolean;
    /** 我按了「触发」：不新加消息，就让角色接着往下说 */
    manual?: boolean;
    /** 我的消息刚落好、还没等回复，先叫界面存一次（模型挂了字也不会消失） */
    onLogged?: (session: WatchAlongSession) => void | Promise<void>;
  },
): Promise<RoundResult> {
  const session = clone(opts.session);
  const cfg = settingsOf(opts);
  const now = Date.now();
  const beat = session.beats[session.beats.length - 1];

  if (opts.clip) {
    session.chat.push({
      id: watchId('clip'),
      from: 'clip',
      clip: opts.clip,
      beatIndex: beat?.index,
      at: now,
    });
  }
  if (opts.transfer) {
    session.chat.push({
      id: watchId('pay'),
      from: 'user',
      transfer: opts.transfer,
      beatIndex: beat?.index,
      at: now + 1,
    });
  }
  if (opts.sticker) {
    session.chat.push({
      id: watchId('msg'),
      from: 'user',
      sticker: opts.sticker,
      quote: opts.quote,
      beatIndex: beat?.index,
      at: now + 2,
    });
  }
  if (opts.text || (opts.quote && !opts.sticker)) {
    session.chat.push({
      id: watchId('msg'),
      from: 'user',
      text: opts.text || undefined,
      quote: opts.quote,
      beatIndex: beat?.index,
      at: now + 3,
    });
  }

  // 先把我说的话落库再等回复：模型那边失手也不会把我这句吃掉
  if (opts.onLogged) {
    try {
      await opts.onLogged(clone(session));
    } catch {
      /* 存不下也不拦这一轮 */
    }
  }

  // 只落消息不叫人：私聊是手动触发的（Ann 2026-10-26 拍板，跟主聊天一个节奏）
  if (opts.logOnly) return { session, advanced: false };

  let out: CharOutput;
  try {
    out = await runCharTurn({
      ...opts,
      session,
      trigger: opts.assign ? 'assign' : opts.manual ? 'manual' : 'chat',
      userLine: opts.text,
      clip: opts.clip,
      assign: opts.assign,
      model: cfg.charModel,
    });
  } catch {
    // 这一轮没接上：我的消息留在记录里，界面上提示一下就行
    return { session, advanced: false, failed: true };
  }
  // 「语音回你」只在这一轮的提示里告诉主模型用语音标签写。这里不再把第一条改成语音条。
  const bubble = applyCharOutput(session, out, beat);

  // 这一轮不管台上跳不跳幕，导演给两边的话都已经交给模型了，用完即清
  session.charCue = '';
  session.stageCue = '';
  session.director = '';

  // 只私下回：画面不跳
  if (!out.wentPublic) return { session, advanced: false, bubble };

  // 真去公屏了：主播当场接招，生成新的一幕
  const stage = await generateStageBeat({
    apiConfig: opts.apiConfig,
    char: opts.char,
    session,
    latest: charPublicText(session, out),
    model: cfg.stageModel,
    danmakuPerBeat: cfg.danmakuPerBeat,
  });
  session.beats.push({
    id: watchId('beat'),
    index: session.beats.length,
    scene: stage.scene,
    speech: stage.speech,
    seq: stage.seq,
    danmaku: stripImpersonated(stage.danmaku, session),
    hot: stage.hot,
    userActions: [],
    charActions: [],
    at: Date.now(),
  });

  return { session, advanced: true, bubble };
}

// ==================== 后台：滚动总结 ====================

/** 还没被任何一段摘要覆盖的幕 */
const pendingBeatsOf = (session: WatchAlongSession): WatchBeat[] => {
  const digestedTo = session.digests.length ? Math.max(...session.digests.map(d => d.toBeat)) : -1;
  return session.beats.filter(b => b.index > digestedTo);
};

/**
 * 把 pending 里最老的一批压成一段摘要；keepRecent 幕留原文。
 * 压不动（幕太少、模型没回）就原样返回，调用方照常保存。
 */
async function digestOldest(
  ctx: RoundContext,
  session: WatchAlongSession,
  keepRecent: number,
): Promise<WatchAlongSession> {
  const pending = pendingBeatsOf(session);
  const cut = pending.slice(0, Math.max(0, pending.length - keepRecent));
  if (!cut.length) return session;

  const text = await digestSessionBeats({
    apiConfig: ctx.apiConfig,
    char: ctx.char,
    session,
    beats: cut,
  });
  if (!text) return session;

  session.digests.push({
    id: watchId('dg'),
    fromBeat: cut[0].index,
    toBeat: cut[cut.length - 1].index,
    text,
    at: Date.now(),
  });
  return session;
}

/**
 * 攒够水位就压一段摘要，保留最近几幕原文。
 * 设置里关掉自动总结就原样返回。
 */
export async function maybeDigest(
  opts: RoundContext & { session: WatchAlongSession },
): Promise<WatchAlongSession> {
  const cfg = settingsOf(opts);
  if (!cfg.summaryAuto) return opts.session;

  const session = clone(opts.session);
  const digestedTo = session.digests.length
    ? Math.max(...session.digests.map(d => d.toBeat))
    : -1;
  const pendingBeats = session.beats.filter(b => b.index > digestedTo);
  const pendingChat = session.chat.filter(
    c => c.from !== 'action' && (c.beatIndex ?? 0) > digestedTo,
  );

  if (
    pendingBeats.length < cfg.summaryBeatWaterline &&
    pendingChat.length < WATCH_DIGEST_CHAT_WATERLINE
  ) {
    return session;
  }

  return digestOldest(opts, session, cfg.summaryKeepRecent);
}

/** 总结页的「再压一段」：不看水位，只要除保留的几幕之外还有得压就压 */
export async function forceDigest(
  opts: RoundContext & { session: WatchAlongSession },
): Promise<WatchAlongSession> {
  const cfg = settingsOf(opts);
  return digestOldest(opts, clone(opts.session), cfg.summaryKeepRecent);
}

/** 总结页的「重写这一段」：只把那一段覆盖的幕重新压一遍 */
export async function rewriteDigest(
  opts: RoundContext & { session: WatchAlongSession; digestId: string },
): Promise<WatchAlongSession> {
  const session = clone(opts.session);
  const target = session.digests.find(d => d.id === opts.digestId);
  if (!target) return session;

  const beats = session.beats.filter(
    b => b.index >= target.fromBeat && b.index <= target.toBeat,
  );
  if (!beats.length) return session;

  const text = await digestSessionBeats({
    apiConfig: opts.apiConfig,
    char: opts.char,
    session,
    beats,
  });
  if (!text) return session;

  session.digests = session.digests.map(d =>
    d.id === target.id ? { ...d, text, edited: undefined, at: Date.now() } : d,
  );
  return session;
}

// ==================== 退房 ====================

/** 重写整场回顾（总结页或退房页的 ↻）。不改场次状态，还在房间里也能用 */
export async function rewriteRecap(
  opts: RoundContext & { session: WatchAlongSession },
): Promise<{ session: WatchAlongSession; recap: string }> {
  const session = clone(opts.session);
  const recap = await buildSessionRecap({
    apiConfig: opts.apiConfig,
    char: opts.char,
    session,
  });
  if (recap) {
    session.recap = recap;
    session.recapEdited = undefined;
  }
  return { session, recap: recap || session.recap || '' };
}

/** 结束这一场，写一段回顾正文交给界面；写不写进主聊天由界面决定 */
export async function finishSession(
  opts: RoundContext & { session: WatchAlongSession },
): Promise<{ session: WatchAlongSession; recap: string }> {
  const cfg = settingsOf(opts);
  const session = clone(opts.session);
  session.status = 'ended';
  session.endedAt = Date.now();

  let recap = session.recap || '';
  // 设置里关掉自动回顾，或者上一版是手写的（别覆盖人家的字），都不再自动生成
  if (cfg.recapAuto && !session.recapEdited) {
    try {
      recap = await buildSessionRecap({
        apiConfig: opts.apiConfig,
        char: opts.char,
        session,
      });
    } catch {
      /* 回顾写不出来就让这场照常结束，记录本身还在 */
    }
  }
  session.recap = recap || undefined;
  return { session, recap };
}
