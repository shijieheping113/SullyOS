/**
 * 陪看私聊要作为真正的对话轮次送给模型。
 *
 * 只塞进状态块的一段文字里，模型不知道自己上一句什么语气，回着回着就漂成另一个人。
 * 这几条锁住三件事：交替、合并、只取最近一段。
 */
import { describe, expect, it } from 'vitest';
import { buildSessionTurns } from './prompts';
import type { WatchAlongSession, WatchChatMessage } from './types';

function session(chat: WatchChatMessage[]): WatchAlongSession {
  return { chat } as WatchAlongSession;
}

const said = (id: string, from: 'user' | 'char', text: string, extra: Partial<WatchChatMessage> = {}) =>
  ({ id, from, text, at: 1, ...extra }) as WatchChatMessage;

describe('私聊转对话轮次', () => {
  it('我说的算 user，角色说的算 assistant，一来一回对得上', () => {
    const turns = buildSessionTurns(
      session([said('1', 'user', '你看她'), said('2', 'char', '在唬人'), said('3', 'user', '哪看出来的')]),
    );
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(turns[1].content).toBe('在唬人');
  });

  it('角色连发三条并成一条 assistant，不拆成三个回合', () => {
    const turns = buildSessionTurns(
      session([said('1', 'user', '嗯'), said('2', 'char', '一'), said('3', 'char', '二'), said('4', 'char', '三')]),
    );
    expect(turns).toHaveLength(2);
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].content.split('\n')).toEqual(['一', '二', '三']);
  });

  it('转发片段、转账、纯表情都留得下痕迹', () => {
    const turns = buildSessionTurns(
      session([
        { id: '1', from: 'clip', at: 1, clip: { beatIndex: 2, scene: '', speech: '这管子比我还老' } } as WatchChatMessage,
        { id: '2', from: 'user', at: 2, transfer: { amount: 200, status: 'pending' } } as WatchChatMessage,
        { id: '3', from: 'char', at: 3, sticker: '翻白眼' } as WatchChatMessage,
      ]),
    );
    expect(turns[0].content).toContain('第 3 幕');
    expect(turns[0].content).toContain('200');
    expect(turns[1].content).toContain('发送了表情包: 翻白眼');
  });

  it('只带最近 10 条，老账不往里堆', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      said(String(i), i % 2 ? 'char' : 'user', `第${i}句`),
    );
    const turns = buildSessionTurns(session(many));
    const all = turns.map(t => t.content).join('\n');
    expect(all).not.toContain('第0句');
    expect(all).toContain('第29句');
  });

  it('空记录就是空数组，不硬凑一条', () => {
    expect(buildSessionTurns(session([]))).toEqual([]);
  });
});
