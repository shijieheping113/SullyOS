import { beforeEach, describe, expect, it, vi } from 'vitest';

// 引擎全被打桩：这里只验调度器的规矩，不验模型怎么说话。
const stageSpy = vi.fn();
const counterSpy = vi.fn();
const charSpy = vi.fn();

vi.mock('./engine', () => ({
  generateStageBeat: (...args: unknown[]) => stageSpy(...args),
  generateStageCounter: (...args: unknown[]) => counterSpy(...args),
  runCharTurn: (...args: unknown[]) => charSpy(...args),
  digestSessionBeats: vi.fn(async () => '压好的摘要'),
  buildSessionRecap: vi.fn(async () => '本场回顾'),
}));

const { advanceRound, chatRound, maybeDigest, finishSession } = await import('./round');

const stage = (speech = '主播开口', hot = false) => ({
  scene: '画面动了一下',
  speech,
  danmaku: [{ id: 'd', author: '路人', text: '哈哈' }],
  hot,
});

const charOut = (opts: { text?: string; publicKinds?: Array<'danmaku' | 'gift' | 'mic_on'> } = {}) => ({
  chat: opts.text ? [{ text: opts.text, sticker: '', voice: false }] : [],
  public: (opts.publicKinds ?? []).map((kind, i) => ({
    id: `a${i}`,
    kind,
    text: kind === 'danmaku' ? '拆台' : undefined,
    giftName: kind === 'gift' ? '小鱼干' : undefined,
    giftAmount: kind === 'gift' ? 6 : undefined,
  })),
  why: '',
  wentPublic: (opts.publicKinds ?? []).length > 0,
});

function makeSession(presence: 'solo' | 'side' | 'backstage' = 'side') {
  return {
    id: 'w1',
    charId: 'c1',
    status: 'watching' as const,
    createdAt: 1,
    updatedAt: 1,
    room: {
      streamerName: '阿茶',
      streamerHandle: '@acha',
      category: '塔罗',
      title: '抽一张',
      bio: '',
      viewerCount: 10,
      customRule: '',
      coverGradient: '#000',
    },
    cast: {
      userAccount: { nickname: '我', number: 'N-1' },
      charAccount: { nickname: '阿猫', number: 'N-2' },
      presence,
      autoReact: true,
      petVisible: true,
      mic: 'off' as const,
    },
    beats: [
      {
        id: 'b0',
        index: 0,
        scene: '开播',
        speech: '大家好',
        danmaku: [],
        hot: false,
        userActions: [],
        charActions: [],
        at: 1,
      },
    ],
    chat: [],
    digests: [],
    director: '',
  };
}

const ctx = {
  apiConfig: {} as any,
  char: { id: 'c1', name: '阿猫', contextLimit: 100 } as any,
  userProfile: {} as any,
  historyMessages: [],
  emojis: [],
  categories: [],
};

beforeEach(() => {
  stageSpy.mockReset();
  counterSpy.mockReset();
  charSpy.mockReset();
  stageSpy.mockResolvedValue(stage());
  counterSpy.mockResolvedValue(stage('接招了', true));
});

describe('角色不下场，画面不跳幕', () => {
  it('只私下回一句，台上停在原地', async () => {
    charSpy.mockResolvedValue(charOut({ text: '这主播在唬人' }));
    const r = await chatRound({ ...ctx, session: makeSession(), text: '你看她' });

    expect(r.advanced).toBe(false);
    expect(r.session.beats.length).toBe(1);
    expect(r.bubble).toBe('这主播在唬人');
    expect(r.session.chat.map(c => c.from)).toEqual(['user', 'char']);
    expect(stageSpy).not.toHaveBeenCalled();
  });

  it('角色真去公屏了，同轮才出新一幕', async () => {
    charSpy.mockResolvedValue(charOut({ text: '我去了', publicKinds: ['danmaku'] }));
    const r = await chatRound({ ...ctx, session: makeSession(), text: '去拆她的台' });

    expect(r.advanced).toBe(true);
    expect(r.session.beats.length).toBe(2);
    expect(stageSpy).toHaveBeenCalledTimes(1);
    // 角色的动作记在上一幕，行动记录也进了私聊
    expect(r.session.beats[0].charActions[0].kind).toBe('danmaku');
    expect(r.session.chat.some(c => c.from === 'action')).toBe(true);
  });

  it('我发的话在等回复前就先交出去存（模型挂了也不会凭空消失）', async () => {
    const logged: string[][] = [];
    charSpy.mockResolvedValue(charOut({ text: '嗯' }));
    await chatRound({
      ...ctx,
      session: makeSession(),
      text: '这主播有点意思',
      onLogged: s => {
        logged.push(s.chat.map(c => c.text || ''));
      },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('这主播有点意思');
  });

  it('模型这一轮没接上：我的话留着，只标一个失败', async () => {
    charSpy.mockRejectedValue(new Error('格式又歪了'));
    const r = await chatRound({ ...ctx, session: makeSession(), text: '在吗' });

    expect(r.failed).toBe(true);
    expect(r.session.chat.map(c => c.from)).toEqual(['user']);
    expect(r.session.chat[0].text).toBe('在吗');
  });
});

describe('路线 A：推进台上', () => {
  it('单看模式不惊动角色', async () => {
    const r = await advanceRound({ ...ctx, session: makeSession('solo') });
    expect(r.session.beats.length).toBe(2);
    expect(charSpy).not.toHaveBeenCalled();
  });

  it('同屏 + 自主反应关 + 本幕不高能 → 角色安静看', async () => {
    const s = makeSession('side');
    s.cast.autoReact = false;
    const r = await advanceRound({ ...ctx, session: s });
    expect(charSpy).not.toHaveBeenCalled();
    expect(r.session.beats.length).toBe(2);
  });

  it('本幕命中高能，即使关了自主反应也会叫角色', async () => {
    stageSpy.mockResolvedValue(stage('主播点名了', true));
    charSpy.mockResolvedValue(charOut({ text: '叫我干嘛' }));
    const s = makeSession('side');
    s.cast.autoReact = false;
    await advanceRound({ ...ctx, session: s });
    expect(charSpy).toHaveBeenCalledTimes(1);
  });

  it('角色去公屏搞事，接招写进同一幕，不多跳一幕', async () => {
    charSpy.mockResolvedValue(charOut({ publicKinds: ['gift'] }));
    const r = await advanceRound({ ...ctx, session: makeSession('side') });

    expect(r.session.beats.length).toBe(2);
    const last = r.session.beats[1];
    expect(last.charActions[0].kind).toBe('gift');
    expect(last.followUp?.speech).toBe('接招了');
    expect(counterSpy).toHaveBeenCalledTimes(1);
  });

  it('导演引导这一轮兑现后就清空', async () => {
    const s = makeSession('solo');
    s.director = '让主播当场翻车';
    const r = await advanceRound({ ...ctx, session: s });
    expect(r.session.director).toBe('');
    expect(stageSpy).toHaveBeenCalledTimes(1);
  });
});

describe('后台总结与退房', () => {
  it('没到水位不压摘要', async () => {
    const r = await maybeDigest({ ...ctx, session: makeSession() });
    expect(r.digests.length).toBe(0);
  });

  it('退房把场次标成已结束，并留下回顾', async () => {
    const r = await finishSession({ ...ctx, session: makeSession() });
    expect(r.session.status).toBe('ended');
    expect(r.recap).toBe('本场回顾');
  });
});
