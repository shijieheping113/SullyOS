import { describe, expect, it } from 'vitest';
import {
  isVideoDescriptionLikelyTruncated,
  isVideoCompletionNearMaxTokens,
  bumpVideoDescriptionMaxTokens,
} from './videoDescribeQuality';

const ANN_BAD_EXAMPLE = `【视频类型】生活记录 / 搞笑梗串

【主线概括】一只戴着红白围巾的黑猫被主人“骗”以为自己很美，结果它打开相册后发现全是自己丑的照片，瞬间崩溃，情绪反转制造笑点。

【画面过程】
片段1：一只黑猫戴着红白条纹围巾，坐在灰色地砖上，眼神无辜，字幕显示“小猫以为自己没有丑照，直到打开麻麻的相册…咬洗你😤”。
片段2：黑猫趴在印有苹果图案的粉色垫子上，头微微低垂，字幕出现“这个我很生气！！”，表现出被“欺骗”后的愤怒情绪。
片段3：黑猫站在厨房水槽边，张嘴对着水龙头，水从龙头流出，它似乎在“漱口”或“抗议”，画面充满滑稽感，延续其“生气”的情绪。
（画面即为相册内容，通过字幕和猫的表情动作，暗示它以为自己好看，结果发现全是丑照，情绪从“委屈”转为“崩溃”）`;

describe('isVideoDescriptionLikelyTruncated', () => {
  it('flags Ann bad example with parenthetical meta ending', () => {
    expect(isVideoDescriptionLikelyTruncated(ANN_BAD_EXAMPLE, 25)).toBe(true);
  });

  it('accepts process ending on last visible shot', () => {
    const good = `【画面过程】
片段1：猫在地砖上。
片段2：猫翻相册看到丑照。
片段3：猫崩溃趴倒，字幕“天塌了”。`;
    expect(isVideoDescriptionLikelyTruncated(good, 25)).toBe(false);
  });
});

describe('completion near max', () => {
  it('detects 92% threshold', () => {
    expect(isVideoCompletionNearMaxTokens(2300, 2500)).toBe(true);
    expect(isVideoCompletionNearMaxTokens(1000, 2500)).toBe(false);
  });

  it('bumps max tokens tiers', () => {
    expect(bumpVideoDescriptionMaxTokens(4000)).toBe(8000);
    expect(bumpVideoDescriptionMaxTokens(8000)).toBe(12_000);
  });
});
