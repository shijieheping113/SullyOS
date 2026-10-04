import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import { messageToEditSource } from './sullyMessageSource';

describe('messageToEditSource', () => {
    it('双语气泡交回编辑时改成翻译标签，不露出内部记号', () => {
        const msg = {
            id: 1,
            charId: 'c1',
            role: 'assistant',
            type: 'text',
            content: '能看到，就是每次消息前面系统塞的那一坨\n%%BILINGUAL%%\n見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ',
            timestamp: 1,
        } as Message;
        expect(messageToEditSource(msg, [])).toBe(
            '<翻译><原文>能看到，就是每次消息前面系统塞的那一坨</原文><译文>見えるよ、メッセージの前に毎回システムが詰め込んでるあれのことだよ</译文></翻译>',
        );
    });
});
