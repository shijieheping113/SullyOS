import { describe, expect, it } from 'vitest';
import {
  findLatestUnfinishedCall,
  unfinishedCallEndCard,
  unfinishedKeepsakeLine,
  type UnfinishedCallInput,
} from './unfinishedCall';

const call = (
  id: number,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  timestamp: number,
  extra: Record<string, unknown> = {},
  charId = 'sully',
): UnfinishedCallInput => ({
  id,
  charId,
  role,
  content,
  timestamp,
  metadata: { source: 'call', callSessionId: sessionId, ...extra },
});

const ended = (id: number, sessionId: string, charId = 'sully'): UnfinishedCallInput => ({
  id,
  charId,
  role: 'system',
  content: '通话结束',
  timestamp: 9_000,
  metadata: { source: 'call-end-popup', callSessionId: sessionId },
});

describe('没挂完的电话', () => {
  it('有挂断卡片的不算，没卡片的算', () => {
    const messages = [
      call(1, 'old', 'user', '在吗', 1_000),
      call(2, 'old', 'assistant', '在。', 2_000),
      ended(3, 'old'),
      call(4, 'open', 'assistant', '喂？', 5_000),
      call(5, 'open', 'user', '刚回来', 8_000, { callMode: 'voice' }),
    ];
    const session = findLatestUnfinishedCall(messages, 'sully');
    expect(session?.sessionId).toBe('open');
    expect(session?.lines.map(line => line.text)).toEqual(['喂？', '刚回来']);
    expect(session?.turnCount).toBe(1);
    expect(session?.durationSec).toBe(3);
    expect(session?.callMode).toBe('voice');
  });

  it('两通都没挂时只认最近一通', () => {
    const messages = [
      call(1, 'earlier', 'user', '第一通', 1_000),
      call(2, 'later', 'user', '第二通', 4_000),
      call(3, 'earlier', 'assistant', '还在', 2_000),
    ];
    expect(findLatestUnfinishedCall(messages, 'sully')?.sessionId).toBe('later');
  });

  it('别的角色不算，一句都没有也不算', () => {
    const messages = [
      call(1, 'other', 'user', '别人的', 5_000, {}, 'other'),
      ended(2, 'mine'),
    ];
    expect(findLatestUnfinishedCall(messages, 'sully')).toBeNull();
    expect(findLatestUnfinishedCall([], 'sully')).toBeNull();
  });

  it('新开用的卡片带着原来的通话编号', () => {
    const session = findLatestUnfinishedCall([
      call(1, 'call-9', 'assistant', '今天也想见你。晚点再打来。', 1_000),
      call(2, 'call-9', 'user', '好', 61_000, { callMode: 'video' }),
    ], 'sully');
    expect(session).not.toBeNull();
    const card = unfinishedCallEndCard({
      charId: 'sully',
      charName: '苏利',
      charAvatar: 'avatar',
      session: session!,
      keepsakeLine: unfinishedKeepsakeLine(session!.lines, '苏利'),
      callMode: session!.callMode || 'voice',
      endedAt: 90_000,
    });
    expect(card.content).toBe('通话结束 · 苏利｜01:00｜1轮对话');
    expect(card.metadata).toMatchObject({
      source: 'call-end-popup',
      callSessionId: 'call-9',
      incomingFromChat: false,
      characterId: 'sully',
      durationSec: 60,
      turnCount: 1,
      callMode: 'video',
      endedAt: 90_000,
      keepsakeLine: '“今天也想见你。” —— 苏利',
    });
  });
});
