import { describe, expect, it } from 'vitest';
import { repairPreviewNeedsRawSource } from './sullyRepairPreview';

describe('repairPreviewNeedsRawSource', () => {
    it('语音与翻译块走源码预览', () => {
        expect(repairPreviewNeedsRawSource('<语音>嗯<#0.5#>好</语音>')).toBe(true);
        expect(repairPreviewNeedsRawSource('<翻译><原文>a</原文><译文>b</译文></翻译>')).toBe(true);
    });

    it('纯文字仍走 MessageItem', () => {
        expect(repairPreviewNeedsRawSource('你好呀')).toBe(false);
    });
});
