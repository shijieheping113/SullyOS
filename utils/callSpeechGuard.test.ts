import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  CALL_SPEECH_BLOCK_MESSAGE,
  callSpeechBlockReason,
  hasUnclosedVoiceTag,
  isCallSpeechBlocked,
  makeCallSpeechBlockedError,
} from './callSpeechGuard';

describe('hasUnclosedVoiceTag（在自愈之前判断）', () => {
  it('写了开标签、没写闭标签 ⇒ 坏', () => {
    expect(hasUnclosedVoiceTag('<语音>只有开标签')).toBe(true);
    expect(hasUnclosedVoiceTag('（小声）<语音 emotion="calm">喂')).toBe(true);
  });

  it('成对（含繁体、属性、简写、闭合带空格）⇒ 好', () => {
    expect(hasUnclosedVoiceTag('<语音>你听得到吗</语音>')).toBe(false);
    expect(hasUnclosedVoiceTag('<語音>もしもし</語音>')).toBe(false);
    expect(hasUnclosedVoiceTag('<语音 emotion="calm">台词</ 语音 >')).toBe(false);
    expect(hasUnclosedVoiceTag('<语音=calm>台词</语音>')).toBe(false);
  });

  it('孤儿闭标签 / 多段标签里有一段没闭合 ⇒ 坏', () => {
    expect(hasUnclosedVoiceTag('没有开标签</语音>')).toBe(true);
    expect(hasUnclosedVoiceTag('<语音>a</语音> 然后 <语音>b')).toBe(true);
  });

  it('完全没写标签（正常单语）⇒ 不归这条管', () => {
    expect(hasUnclosedVoiceTag('今天天气不错啊。')).toBe(false);
    expect(hasUnclosedVoiceTag('<字幕>中文</字幕>')).toBe(false);
    expect(hasUnclosedVoiceTag('')).toBe(false);
  });
});

describe('callSpeechBlockReason（送 TTS 之前的总闸门）', () => {
  it('没给来源信息 = 不拦（单语照旧）', () => {
    expect(callSpeechBlockReason(undefined)).toBeNull();
    expect(callSpeechBlockReason({})).toBeNull();
    expect(callSpeechBlockReason({ source: '<语音>a</语音>' })).toBeNull();
  });

  it('标签不成对 ⇒ 拦，文案就是 Ann 要的那句', () => {
    expect(callSpeechBlockReason({ source: '<语音>a' })).toBe('unclosed-voice-tag');
    expect(CALL_SPEECH_BLOCK_MESSAGE['unclosed-voice-tag']).toBe('本次回复格式不对，已经拦截');
  });

  it('只有思考顶上来 ⇒ 拦（文字仍然会显示）', () => {
    expect(callSpeechBlockReason({ thinkingOnly: true, source: '乱糟糟的思考' })).toBe('thinking-only');
    expect(CALL_SPEECH_BLOCK_MESSAGE['thinking-only']).toContain('只有思考内容');
  });
  it('手动放行：人自己点播放/重读时不拦（想听就给）', () => {
    expect(callSpeechBlockReason({ manual: true, source: '<语音>没闭合' })).toBeNull();
    expect(callSpeechBlockReason({ manual: true, thinkingOnly: true })).toBeNull();
  });
});

describe('拦下时抛的东西可以被认出来', () => {
  it('名字是 CallSpeechBlocked，普通合成失败不会误判', () => {
    const blocked = makeCallSpeechBlockedError('unclosed-voice-tag');
    expect(isCallSpeechBlocked(blocked)).toBe(true);
    expect(isCallSpeechBlocked(new Error('真·合成失败'))).toBe(false);
    expect(isCallSpeechBlocked(undefined)).toBe(false);
    expect((blocked as Error & { reason?: string }).reason).toBe('unclosed-voice-tag');
  });
});

// 这几条是"接线钉死"：有人把闸门从唯一入口挪走、或把编号/停全部音频删掉，测试立刻红。
describe('钉住：CallApp 里的接线（读源码）', () => {
  const call = readFileSync(path.join(process.cwd(), 'apps/CallApp.tsx'), 'utf8');

  it('闸门装在唯一入口 synthesizeCallAudioUrl 上', () => {
    expect(call).toMatch(/synthesizeCallAudioUrl = async \([\s\S]{0,400}?callSpeechBlockReason\(guard\)/);
    expect(call).toContain('makeCallSpeechBlockedError(blockedReason)');
  });

  it('预取与手动重读也过闸门（判据来自气泡原文，手动则放行）', () => {
    expect(call).toContain('prefetchCallAudio(callSpeechSource(preparedForAudio.text), preparedForAudio.speechEmotion, {');
    expect(call).toContain('{ source: bubble.text, manual: true }');
  });

  it('长得离谱时不再自动换路重试（同一段别付两次钱）', () => {
    expect(call).toContain("makeCallSpeechBlockedError('too-long-no-retry')");
    expect((call.match(/too-long-no-retry/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('迟到音频按编号丢弃：播放前、存货取出前各一次', () => {
    expect(call).toContain('if (seq !== undefined && seq !== audioSeqRef.current)');
    expect(call).toContain('if (pending.seq !== undefined && pending.seq !== audioSeqRef.current)');
  });

  it('静音/挂断都作废：关外放停全部、挂断换号', () => {
    expect((call.match(/if \(!next\) stopAllCallAudio\(\);/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(call).toMatch(/const handleHangup = \(\) => \{[\s\S]{0,300}?nextAudioSeq\(\)/);
  });

  it('Bug 1：暂停时自己归位状态、记账失败不拖死整轮、发送有 .catch', () => {
    expect(call).toMatch(/const pauseAudio = \(\) => \{[\s\S]{0,300}?setIsAudioPlaying\(false\)/);
    expect(call).toContain('这条消息没存上（还能继续聊）');
    expect((call.match(/handleTurn\(\)\.catch\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
