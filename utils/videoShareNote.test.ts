import { describe, expect, it } from 'vitest';
import { parseVideoShareNote, fillVideoTitleFromPaste } from './videoShareNote';

const XHS_SAMPLE = `小猫我呀！全身都是美味佳肴！ https://xhslink.cn/o/U8LzMmmICq
复制这段文字，打开【小红书】一键直达笔记。`;

const DOUYIN_SAMPLE = `8.79 复制打开抖音，看看【Gardenia的作品】咪要打人！ # 猫统治世界需要多久 # 猫咪的迷惑... https://v.douyin.com/DUCMdy_1aTg/ xSl:/ :8pm 01/14 p@D.us`;

const XHS_SAMPLE2 = `小红书又菜又爱玩的小可爱，被都吓拱起来了 https://xhslink.cn/o/D1PVfbEyL4
去【小红书】逛逛，这篇笔记超有料！`;

describe('videoShareNote', () => {
  it('parses Ann xhs paste', () => {
    expect(parseVideoShareNote(XHS_SAMPLE).title).toBe('小猫我呀！全身都是美味佳肴！');
    expect(parseVideoShareNote(XHS_SAMPLE).source).toBe('xhs');
  });

  it('parses xhs paste without promo second line or 小红书 prefix', () => {
    expect(parseVideoShareNote(XHS_SAMPLE2).title).toBe('又菜又爱玩的小可爱，被都吓拱起来了');
    expect(parseVideoShareNote(XHS_SAMPLE2).source).toBe('xhs');
  });

  it('parses Ann douyin paste with tags', () => {
    expect(parseVideoShareNote(DOUYIN_SAMPLE).title).toBe('咪要打人！ # 猫统治世界需要多久 # 猫咪的迷惑...');
    expect(parseVideoShareNote(DOUYIN_SAMPLE).source).toBe('douyin');
  });

  it('fillVideoTitleFromPaste matches parse title', () => {
    expect(fillVideoTitleFromPaste(DOUYIN_SAMPLE)).toBe('咪要打人！ # 猫统治世界需要多久 # 猫咪的迷惑...');
  });

  it('uses filename when note empty', () => {
    expect(parseVideoShareNote('', 'clip.mp4').title).toBe('clip');
  });

  it('keeps plain text with tags', () => {
    const t = '我的猫 #日常';
    expect(parseVideoShareNote(t).title).toBe(t);
  });
});
