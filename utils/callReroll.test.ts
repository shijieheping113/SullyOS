import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CALL_IDLE_NUDGE_SEED, applyKeptCallTurnExtras, callTurnTimeGapHint, decorateKeptCallUserMessage, filterMessagesForCallReroll, keptCallTurnExtras, planCallReroll, storedCallTouchContext, type CallRerollBubble } from './callReroll';

const openingSeed = '（电话刚接通。开场。）';
const spokenAt = new Date(2026, 9, 4, 12, 0, 0, 0).getTime();

const userBubble = (overrides: Partial<CallRerollBubble> = {}): CallRerollBubble => ({
  id: 'user-1',
  role: 'user',
  text: '在吗',
  dbId: 11,
  timestamp: spokenAt,
  ...overrides,
});

const assistantBubble = (overrides: Partial<CallRerollBubble> = {}): CallRerollBubble => ({
  id: 'assistant-1',
  role: 'assistant',
  text: '在的',
  dbId: 12,
  timestamp: spokenAt + 1000,
  ...overrides,
});

describe('planCallReroll', () => {
  it('用户那句已经存上时不再追加，只拿掉角色这句', () => {
    const plan = planCallReroll({
      bubbles: [userBubble(), assistantBubble()],
      targetId: 'assistant-1',
      openingSeed,
      nudgeSeed: CALL_IDLE_NUDGE_SEED,
    });
    expect(plan).toMatchObject({
      ok: true,
      kind: 'kept-user',
      appendInput: false,
      appendText: null,
      keptUserDbId: 11,
      keptUserText: '在吗',
      skipDbIds: [12],
    });
  });

  it('用户那句没存上时只追加一次', () => {
    const plan = planCallReroll({
      bubbles: [userBubble({ dbId: undefined }), assistantBubble()],
      targetId: 'assistant-1',
      openingSeed,
      nudgeSeed: CALL_IDLE_NUDGE_SEED,
    });
    expect(plan).toMatchObject({
      ok: true,
      kind: 'unsaved-user',
      appendInput: true,
      appendText: '在吗',
      keptUserDbId: null,
    });
  });

  it('开场白没有用户句，追加开场种子一次', () => {
    const plan = planCallReroll({
      bubbles: [assistantBubble({ id: 'greeting' })],
      targetId: 'greeting',
      openingSeed,
      nudgeSeed: CALL_IDLE_NUDGE_SEED,
    });
    expect(plan).toMatchObject({
      ok: true,
      kind: 'opening',
      appendInput: true,
      appendText: openingSeed,
      keptUserText: '',
    });
  });

  it('冷场接话追加原来的冷场提示，不把更早的用户原话再发一遍', () => {
    const plan = planCallReroll({
      bubbles: [
        userBubble(),
        assistantBubble(),
        assistantBubble({ id: 'nudge', dbId: 13, text: '还在吗', timestamp: spokenAt + 2000 }),
      ],
      targetId: 'nudge',
      openingSeed,
      nudgeSeed: CALL_IDLE_NUDGE_SEED,
    });
    expect(plan).toMatchObject({
      ok: true,
      kind: 'nudge',
      appendInput: true,
      appendText: CALL_IDLE_NUDGE_SEED,
      skipDbIds: [13],
      keptUserText: '',
    });
  });

  it('不是最后一句就拒绝', () => {
    const plan = planCallReroll({
      bubbles: [assistantBubble(), userBubble({ id: 'later' })],
      targetId: 'assistant-1',
      openingSeed,
      nudgeSeed: CALL_IDLE_NUDGE_SEED,
    });
    expect(plan).toEqual({ ok: false, reason: 'not-latest' });
  });

  it('找不到这条就拒绝', () => {
    expect(planCallReroll({
      bubbles: [assistantBubble()],
      targetId: 'gone',
      openingSeed,
      nudgeSeed: CALL_IDLE_NUDGE_SEED,
    })).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('换个说法留下的那一句', () => {
  it('隔了多久按开口前的间隔，点换个说法的时刻不参与', () => {
    const previousAt = spokenAt - 15 * 60 * 1000;
    const hint = callTurnTimeGapHint(previousAt, spokenAt);
    const rerollAt = spokenAt + 2 * 60 * 60 * 1000;
    expect(rerollAt).toBeGreaterThan(spokenAt);
    expect(hint).toBe('[系统提示: 距离上一条消息: 15 分钟。短暂的停顿。]');
    expect(callTurnTimeGapHint(spokenAt - 60 * 1000, spokenAt)).toBe('');
  });

  it('开口不到十分钟时，两小时后才点也不会写成离开', () => {
    const hint = callTurnTimeGapHint(spokenAt - 60 * 1000, spokenAt);
    const decorated = applyKeptCallTurnExtras(
      '[2026-10-04 12:00] [通话] 在吗\n\n[系统提示: 距离上一条消息: 2 小时。用户离开了一会儿。]',
      { touchContext: '', timeGapHint: hint },
    );
    expect(decorated).toBe('[2026-10-04 12:00] [通话] 在吗');
    expect(decorated).not.toContain('离开');
    expect(decorated.match(/在吗/g)).toEqual(['在吗']);
  });

  it('真实的开口前间隔只贴一次，已经贴过的不再叠第二段', () => {
    const hint = callTurnTimeGapHint(spokenAt - 2 * 60 * 60 * 1000, spokenAt);
    expect(hint).toContain('2 小时');
    expect(hint).toContain('用户离开了一会儿');
    const once = applyKeptCallTurnExtras(`[2026-10-04 12:00] [通话] 在吗\n\n${hint}`, {
      touchContext: '',
      timeGapHint: hint,
    });
    expect(once.split('距离上一条消息').length - 1).toBe(1);
  });

  it('存档里的摸头贴在这一句前面，而且这句话只出现一次', () => {
    const touch = storedCallTouchContext({
      avatarTouches: [{ zone: 'head', part: 'head', rawAreas: [], timestamp: 1 }],
    }, 'Sully', '条条');
    const history = decorateKeptCallUserMessage(
      [
        { role: 'assistant', content: '[2026-10-04 10:00] [聊天] 早' },
        { role: 'user', content: '[2026-10-04 12:00] [通话] 在吗' },
      ],
      '在吗',
      { touchContext: touch, timeGapHint: callTurnTimeGapHint(spokenAt - 2 * 60 * 60 * 1000, spokenAt) },
    );
    expect(history).toHaveLength(2);
    const tail = String(history[1].content);
    expect(tail.match(/在吗/g)).toEqual(['在吗']);
    expect(tail.match(/本轮尚未回应的触碰互动/g)).toHaveLength(1);
    expect(tail).toContain('头顶');
    expect(tail.indexOf('头顶')).toBeLessThan(tail.indexOf('在吗'));
    expect(tail.split('距离上一条消息').length - 1).toBe(1);
  });

  it('没有摸头记录时不出现触碰段', () => {
    expect(storedCallTouchContext({}, 'Sully', '条条')).toBe('');
    expect(storedCallTouchContext({ avatarTouches: [] }, 'Sully', '条条')).toBe('');
    const plain = applyKeptCallTurnExtras('[2026-10-04 12:00] [通话] 在吗', {
      touchContext: '',
      timeGapHint: '',
    });
    expect(plain).not.toContain('触碰');
  });

  it('只读这句存档上的摸头，后来新摸的不在这份记录里', () => {
    const pendingAfterReply = [{ id: 'new-face', zone: 'face' as const, part: 'face' as const, rawAreas: [], timestamp: 9 }];
    const extras = keptCallTurnExtras(
      [{
        id: 11,
        timestamp: spokenAt,
        content: '在吗',
        metadata: { source: 'call', avatarTouches: [{ zone: 'head', part: 'head', rawAreas: [], timestamp: 1 }] },
      }],
      11,
      'Sully',
      '条条',
    );
    expect(pendingAfterReply[0].zone).toBe('face');
    expect(extras?.touchContext).toContain('头顶');
    expect(extras?.touchContext).not.toContain('脸颊');
    expect(extras?.touchContext).not.toContain('new-face');
  });

  it('拿掉角色这句和这通里更晚的通话，聊天与别的通话留下', () => {
    const kept = filterMessagesForCallReroll([
      { id: 1, timestamp: 10, metadata: { source: 'chat' } },
      { id: 2, timestamp: 20, content: '在吗', metadata: { source: 'call', callSessionId: 's1' } },
      { id: 3, timestamp: 30, metadata: { source: 'call', callSessionId: 's1' } },
      { id: 4, timestamp: 40, metadata: { source: 'call', callSessionId: 's1' } },
      { id: 5, timestamp: 50, metadata: { source: 'chat' } },
      { id: 6, timestamp: 60, metadata: { source: 'call', callSessionId: 'other' } },
    ], { skipDbIds: [3], dropCallSessionId: 's1', dropCallAfter: 30 });
    expect(kept.map(message => message.id)).toEqual([1, 2, 5, 6]);
  });
});

describe('CallApp 换个说法接线', () => {
  const source = readFileSync(path.resolve(__dirname, '../apps/CallApp.tsx'), 'utf8');
  const handlerStart = source.indexOf('const handleRerollAssistant');
  const handlerEnd = source.indexOf('const idleNudgeBusyRef');
  const handler = source.slice(handlerStart, handlerEnd);

  it('重说不提醒模型换一种说法，也不带走后来新摸的', () => {
    expect(handler).toContain('planCallReroll');
    expect(handler).toContain('CALL_IDLE_NUDGE_SEED');
    expect(handler).not.toContain('请换一种说法');
    expect(handler).not.toContain('pendingAvatarTouches');
    expect(handler).not.toContain('pendingTouches');
    expect(source).toContain('await requestAssistantReply(input, userDbId, pendingTouchesForTurn, true, userCameraSnapshotForTurn)');
    expect(source).toContain('CALL_IDLE_NUDGE_SEED');
    const phone = readFileSync(path.resolve(__dirname, '../components/call/VoicePhoneB.tsx'), 'utf8');
    expect(phone).toContain('props.bubbles[props.bubbles.length - 1]?.id === action.id');
  });
});
