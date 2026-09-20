import { describe, expect, it } from 'vitest';
import { appendHtmlUserCustomPrompt, buildHtmlCardRepairPromptBlock, buildHtmlPrompt } from './htmlPrompt';

describe('htmlPrompt custom', () => {
    it('buildHtmlPrompt 与修格式块共用「用户自定义补充」段', () => {
        const custom = '卡片偏粉、圆角 16px';
        expect(buildHtmlPrompt(custom)).toContain(`## 用户自定义补充\n\n${custom}`);
        expect(buildHtmlCardRepairPromptBlock(custom)).toContain(`## 用户自定义补充\n\n${custom}`);
    });

    it('appendHtmlUserCustomPrompt 空自定义不追加', () => {
        expect(appendHtmlUserCustomPrompt('base', '  ')).toBe('base');
    });
});
