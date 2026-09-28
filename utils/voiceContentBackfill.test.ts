import { describe, it, expect } from 'vitest';
import {
    stripVoiceShells,
    needsVoiceBackfill,
    voiceShellInnerText,
    computeBackfillContent,
    hasVoiceShell,
    wrapVoiceShell,
    computeBackfillTaggedContent,
} from './voiceContentBackfill';

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

describe('hasVoiceShell', () => {
    it('认出简体 / 繁体 / 带属性的标签', () => {
        expect(hasVoiceShell('<语音>hi</语音>')).toBe(true);
        expect(hasVoiceShell('<語音>hi</語音>')).toBe(true);
        expect(hasVoiceShell('<语音 emotion="calm">hi</语音>')).toBe(true);
    });
    it('普通文字没有标签', () => {
        expect(hasVoiceShell('今天好热')).toBe(false);
        expect(hasVoiceShell('')).toBe(false);
        expect(hasVoiceShell(undefined)).toBe(false);
    });
});

describe('wrapVoiceShell', () => {
    it('纯文本包成裸标签（用户语音没有情绪属性）', () => {
        expect(wrapVoiceShell('今天好热')).toBe('<语音>今天好热</语音>');
    });
    it('首尾空白先去掉', () => {
        expect(wrapVoiceShell('  hi  ')).toBe('<语音>hi</语音>');
    });
    it('已经有标签的原样返回，不套第二层', () => {
        expect(wrapVoiceShell('<语音>hi</语音>')).toBe('<语音>hi</语音>');
        expect(wrapVoiceShell('<语音 emotion="calm">hi</语音>')).toBe('<语音 emotion="calm">hi</语音>');
    });
    it('空字返回空串', () => {
        expect(wrapVoiceShell('')).toBe('');
        expect(wrapVoiceShell('   ')).toBe('');
    });
});

describe('computeBackfillTaggedContent', () => {
    it('资产里的识别字包成标签', () => {
        expect(computeBackfillTaggedContent({ content: '', assetText: '资产里的' }))
            .toBe('<语音>资产里的</语音>');
    });
    it('壳里兜底的字也包成标签（老数据）', () => {
        expect(computeBackfillTaggedContent({ content: '<语音>壳里的</语音>', assetText: '' }))
            .toBe('<语音>壳里的</语音>');
    });
    it('没有可写的字返回 null（不动这条消息）', () => {
        expect(computeBackfillTaggedContent({ content: '', assetText: null })).toBe(null);
        expect(computeBackfillTaggedContent({ content: '已经有字的纯文本', assetText: null })).toBe(null);
    });
    it('剥壳后只剩壳（资产没了）也能救回来并包标签', () => {
        expect(computeBackfillTaggedContent({ content: '<语音 lang="zh">半句', assetText: null }))
            .toBe('<语音>半句</语音>');
    });
});
