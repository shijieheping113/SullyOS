import { describe, it, expect } from 'vitest';
import { normalizeMessageContent } from './messageFormat';
import type { Message } from '../types';

const base: Omit<Message, 'type' | 'content' | 'metadata'> = {
  id: 1, charId: 'c1', role: 'user', timestamp: 0,
};
const mk = (type: string, content: string, metadata?: any): Message =>
  ({ ...base, type, content, metadata } as Message);

describe('normalizeMessageContent · xhs_card', () => {
  it('有 MCP 正文时把标题+正文+作者喂给角色', () => {
    const out = normalizeMessageContent(
      mk('xhs_card', '睡不够', { xhsNote: { title: '睡不够', desc: '今天画了花岗岩版', author: '某人' } }),
      'Char', '我',
    );
    expect(out).toContain('《睡不够》');
    expect(out).toContain('作者：某人');
    expect(out).toContain('今天画了花岗岩版');
  });

  it('有评论时把评论区也喂给角色（user 分享的笔记也能看到评论）', () => {
    const out = normalizeMessageContent(
      mk('xhs_card', '睡不够', { xhsNote: {
        title: '睡不够', desc: '今天画了花岗岩版', author: '某人',
        comments: [
          { author: '路人甲', content: '太好笑了', likes: 12 },
          { author: '路人乙', content: '同款', likes: 3 },
        ],
      } }),
      'Char', '我',
    );
    expect(out).toContain('评论区');
    expect(out).toContain('路人甲');
    expect(out).toContain('太好笑了');
    expect(out).toContain('路人乙');
  });

  it('只有文案标题(无 MCP/没抓到正文)时给标题并明示别瞎编', () => {
    const out = normalizeMessageContent(
      mk('xhs_card', '睡不够', { xhsNote: { title: '睡不够', desc: '', author: '' } }),
      'Char', '我',
    );
    expect(out).toContain('《睡不够》');
    expect(out).toContain('别假装读过');
    expect(out).not.toContain('笔记正文');
  });

  it('标题也没有时不崩，给出"没能获取到"', () => {
    const out = normalizeMessageContent(mk('xhs_card', '', { xhsNote: {} }), 'Char', '我');
    expect(out).toContain('小红书笔记');
    expect(out).toContain('没能获取到');
  });
});

describe('normalizeMessageContent · x_card / threads_card', () => {
  it('用户贴的 X / Threads 卡带分享头与附言，不当成用户本人说的话', () => {
    const card = {
      provider: 'fxtwitter',
      authorName: '小灯',
      authorHandle: 'akari',
      text: '今晚的月色很好',
      replies: [],
    };
    const x = normalizeMessageContent(mk('x_card', 'https://x.com/akari/status/1', { xSocial: card, originalShareText: '你看这条 https://x.com/akari/status/1' }), 'Char', 'Ann');
    const threads = normalizeMessageContent(mk('threads_card', 'https://www.threads.com/@akari/post/1', { xSocial: { ...card, provider: 'threads-ssr' } }), 'Char', 'Ann');
    expect(x.startsWith('[X帖子] Ann分享了一条 X 帖（发帖作者：小灯（@akari）；这是Ann在 X 上刷到后转给你一起看、找你聊的帖子卡片，不是Ann本人说的话）')).toBe(true);
    expect(x).toContain('Ann分享时附言：你看这条');
    expect(x).toContain('帖子正文：\n今晚的月色很好');
    expect(x).not.toContain('http');
    expect(threads.startsWith('[Threads帖子] Ann分享了一条 Threads 帖（发帖作者：小灯（@akari）；这是Ann在 Threads 上刷到后转给你一起看、找你聊的帖子卡片，不是Ann本人说的话）')).toBe(true);
  });
});

describe('normalizeMessageContent · webpage_card', () => {
  it('有正文时注入网页正文', () => {
    const out = normalizeMessageContent(
      mk('webpage_card', '某文章', { webpage: { title: '某文章', siteName: 'blog.com', content: '正文内容若干', finalUrl: 'https://blog.com/a' } }),
      'Char', '我',
    );
    expect(out).toContain('《某文章》');
    expect(out).toContain('网页正文');
    expect(out).toContain('正文内容若干');
  });

  it('正文抓空时明示没抓到，别假装读过', () => {
    const out = normalizeMessageContent(
      mk('webpage_card', 'MSN', { webpage: { title: 'MSN', siteName: 'msn.com', content: '', excerpt: '' } }),
      'Char', '我',
    );
    expect(out).toContain('《MSN》');
    expect(out).toContain('没能抓取到');
    expect(out).not.toContain('网页正文');
  });
});

describe('normalizeMessageContent · 电波卡片读给模型前的身份清洗', () => {
  const roundCard = (body: string) => ({
    type: 'livestream_card',
    cardKind: 'live_round',
    channelName: '夜半三点的猫',
    title: '标题',
    body,
    roundLabel: '第 3 轮',
    isCompressed: false,
  });

  it('小号的身份标记摘掉只留名字；本尊的标记保留', () => {
    const out = normalizeMessageContent(
      mk('score_card', '{}', { scoreCard: roundCard('弹幕 Ann（熟人本尊）：加油；弹幕 momo_8921（熟人小号）：录像准备www') }),
      'Sully', 'Ann',
    );
    expect(out).toContain('Ann（熟人本尊）');
    expect(out).toContain('momo_8921：录像准备www');
    expect(out).not.toContain('熟人小号');
  });

  it('半角括号写的也摘；马甲两个字摘掉；同号不动', () => {
    const out = normalizeMessageContent(
      mk('score_card', '{}', { scoreCard: roundCard('【匿名马甲频道「夜半三点的猫」】momo_8921(熟人小号)留言；SC ¥20（同号）') }),
      'Sully', 'Ann',
    );
    expect(out).not.toContain('熟人小号');
    expect(out).not.toContain('马甲');
    expect(out).toContain('匿名频道');
    expect(out).toContain('momo_8921留言');
    expect(out).toContain('SC ¥20（同号）');
  });

  it('旧开播卡里的你开始了直播换成角色名', () => {
    const body = '你开始了直播《夜间直播》（频道：Sully Official）。直播还没有结束，仍在进行中。';
    const out = normalizeMessageContent(
      mk('score_card', '{}', {
        scoreCard: { type: 'livestream_card', cardKind: 'live_session_marker', sessionStatus: 'live', body, summary: body },
      }),
      'Sully', 'Ann',
    );
    expect(out).toContain('Sully开始了直播《夜间直播》');
    expect(out).not.toContain('你开始了直播');
    expect(out).toContain('直播还没有结束');
  });
});
