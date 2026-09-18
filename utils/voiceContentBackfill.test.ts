import { describe, it, expect } from 'vitest';
import { stripVoiceShells, needsVoiceBackfill, voiceShellInnerText, computeBackfillContent } from './voiceContentBackfill';

describe('voiceContentBackfill', () => {
    it('空正文需要回写', () => {
        expect(needsVoiceBackfill('')).toBe(true);
        expect(needsVoiceBackfill('   ')).toBe(true);
        expect(needsVoiceBackfill(undefined)).toBe(true);
    });

    it('只有语音壳（壳里有字或没字、闭合或未闭合）都需要回写', () => {
        expect(needsVoiceBackfill('<语音>今天好热</语音>')).toBe(true);
        expect(needsVoiceBackfill('<语音></语音>')).toBe(true);
        expect(needsVoiceBackfill('<语音 lang="zh">今天好热')).toBe(true);
    });

    it('纯文本正文不需要回写', () => {
        expect(needsVoiceBackfill('今天好热')).toBe(false);
        expect(needsVoiceBackfill('今天好热\n换行也有字')).toBe(false);
    });

    it('壳外夹着正文的消息不碰（防止误吃真文字）', () => {
        expect(needsVoiceBackfill('先说句话 <语音>哼</语音>')).toBe(false);
    });

    it('取壳里的字：配对 / 未闭合 / 无壳', () => {
        expect(voiceShellInnerText('<语音>今天好热</语音>')).toBe('今天好热');
        expect(voiceShellInnerText('<语音 lang="zh">今天好热')).toBe('今天好热');
        expect(voiceShellInnerText('<语音></语音>')).toBe('');
        expect(voiceShellInnerText('今天好热')).toBe('');
    });

    it('回写字：资产优先，壳里兜底，都没有返回 null', () => {
        expect(computeBackfillContent({ content: '<语音>壳里的</语音>', assetText: '资产里的' })).toBe('资产里的');
        expect(computeBackfillContent({ content: '<语音>壳里的</语音>', assetText: '' })).toBe('壳里的');
        expect(computeBackfillContent({ content: '', assetText: null })).toBe(null);
        expect(computeBackfillContent({ content: '已经有字的纯文本', assetText: null })).toBe(null);
    });

    it('剥壳不吞壳外文字（与展示侧同款口径）', () => {
        expect(stripVoiceShells('a<语音>x</语音>b')).toBe('ab');
        expect(stripVoiceShells('<语音>x')).toBe('');
    });
});
