import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveSpeechPair } from '../components/live/LiveSpeechPair';
import { BeatLongPressSheet } from '../components/live/LiveSharedWidgets';

const style = { fontSize: 15 };

describe('LiveSpeechPair markup', () => {
  it('shows one pair and the two buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(LiveSpeechPair, {
        spokenLine: 'Wait, really?',
        translatedLine: '你说真的？',
        showTranslation: true,
        spokenStyle: style,
        translatedStyle: style,
        showButtons: true,
        canPrev: false,
        canNext: true,
        onPrev: () => {},
        onNext: () => {},
      }),
    );
    expect(html).toContain('Wait, really?');
    expect(html).toContain('你说真的？');
    expect(html).not.toContain("That's insane.");
    expect(html).toContain('前一对');
    expect(html).toContain('后一对');
    expect(html).toContain('disabled=""');
  });

  it('hides the buttons when the speech is a single line', () => {
    const html = renderToStaticMarkup(
      React.createElement(LiveSpeechPair, {
        spokenLine: 'Wait, really?',
        translatedLine: '你说真的？',
        showTranslation: true,
        spokenStyle: style,
        translatedStyle: style,
        showButtons: false,
        canPrev: false,
        canNext: false,
        onPrev: () => {},
        onNext: () => {},
      }),
    );
    expect(html).not.toContain('前一对');
  });
});

describe('BeatLongPressSheet voice nudge', () => {
  const target = {
    title: '第 1 拍 · 分镜操作',
    beatId: 'beat_1',
    screen: '镜头',
    speechOriginal: "Wait, really? That's insane.",
    onPlayVoice: () => {},
  };

  it('omits the row when the screen does not pass a nudge callback', () => {
    const html = renderToStaticMarkup(
      React.createElement(BeatLongPressSheet, { target, onClose: () => {} }),
    );
    expect(html).not.toContain('微调这一次播放');
    expect(html).toContain('Wait, really?');
    expect(html).toContain('That&#x27;s insane.');
  });

  it('shows a disabled step control until this recording is playing', () => {
    const html = renderToStaticMarkup(
      React.createElement(BeatLongPressSheet, {
        target,
        onClose: () => {},
        onNudgeVoice: () => {},
        voiceSeekEnabled: false,
      }),
    );
    expect(html).toContain('微调这一次播放');
    expect(html).toContain('value="0.5"');
    expect(html).toContain('后退');
    expect(html).toContain('前进');
    expect(html).toContain('disabled=""');
  });
});
