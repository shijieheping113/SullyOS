import { describe, expect, it } from 'vitest';
import { splitBoxThinking } from './boxLlm';

describe('splitBoxThinking 只认标签，不猜内容', () => {
  it('配对的 <think> 切进思考，正文留在外面', () => {
    const r = splitBoxThinking('<think>她应该先愣一下</think>\n她推开门，屋里黑着。', '');
    expect(r.content).toBe('她推开门，屋里黑着。');
    expect(r.thinking).toBe('她应该先愣一下');
  });

  it('thinking / thought / 大小写混写都认', () => {
    expect(splitBoxThinking('<thinking>甲</thinking>乙', '').content).toBe('乙');
    expect(splitBoxThinking('<THOUGHT>甲</Thought>乙', '').content).toBe('乙');
  });

  it('开标签带属性也认（<think type="x">）', () => {
    const r = splitBoxThinking('<think type="x">甲</think>乙', '');
    expect(r.content).toBe('乙');
    expect(r.thinking).toBe('甲');
  });

  it('只有结尾 </think> 没开头：它之前的内容全算思考', () => {
    const r = splitBoxThinking('先把她的反应想一遍\n</think>\n她推开门，屋里黑着。', '');
    expect(r.content).toBe('她推开门，屋里黑着。');
    expect(r.thinking).toBe('先把她的反应想一遍');
  });

  it('只有开标签没收尾：标签之后的都算思考', () => {
    const r = splitBoxThinking('她推开门。\n<think>还没想完', '');
    expect(r.content).toBe('她推开门。');
    expect(r.thinking).toBe('还没想完');
  });

  it('没有标签就一个字都不切：清单、小标题、分析味都留在正文里', () => {
    const src = '1. 她的反应\n2. 场景\n她推开门，屋里黑着。';
    const r = splitBoxThinking(src, '');
    expect(r.content).toBe(src);
    expect(r.thinking).toBe('');
  });

  it('接口另给的思维链跟标签里的合并，正文不受影响', () => {
    const r = splitBoxThinking('<think>标签里的</think>正文', '接口给的思考');
    expect(r.content).toBe('正文');
    expect(r.thinking).toBe('接口给的思考\n\n标签里的');
  });

  it('空值、非字符串都给得回来', () => {
    expect(splitBoxThinking('', '')).toEqual({ content: '', thinking: '' });
    expect(splitBoxThinking(undefined, undefined)).toEqual({ content: '', thinking: '' });
    expect(splitBoxThinking(['一段', '话'], '')).toEqual({ content: '一段话', thinking: '' });
  });
});
