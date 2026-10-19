import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 结构守卫：这几条是「删除动作」的结果，没有运行时入口可以断言，
// 只能盯住源码别再长回来。它们是施工单里写死不许回退的边界。

const ROOT = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('下播流程', () => {
  const app = read('apps/LiveStreamApp.tsx');

  it('不再调用整场总结模型，也不再弹下播总结卡', () => {
    expect(app).not.toContain('generateLiveFinalSummary');
    expect(app).not.toContain('EndStreamSummaryModal');
    expect(app).not.toContain('supersedeLiveMessagesWithSummary');
    expect(app).not.toContain('showEndSummaryModal');
  });

  it('结束只改 status 与 endedAt，不动历史内容', () => {
    expect(app).toContain("status: 'ended'");
    expect(app).toContain('endedAt: Date.now()');

    const start = app.indexOf('const handleEndStream');
    expect(start).toBeGreaterThan(-1);
    const body = app.slice(start, start + 1200);
    expect(body).not.toContain('finalSummary');
    expect(body).not.toContain('generateLive');
  });
});

describe('小窗不带场景说明', () => {
  it('四个入口都不再往悬浮小窗里塞说明文案', () => {
    const files = [
      'components/live/LiveWatchScreen.tsx',
      'components/live/WatchScreens.tsx',
      'components/live/VodAndNpcViews.tsx',
      'apps/LiveStreamApp.tsx',
    ];
    files.forEach(rel => {
      const src = read(rel);
      expect(src, rel).not.toContain('contextDescription={');
      // 旧的大厅平台私聊说明也不要再出现
      expect(src, rel).not.toContain('电波OnAir平台私聊');
    });
  });

  it('小窗自己的 contextDescription 是可选参数', () => {
    const src = read('components/live/LiveSharedWidgets.tsx');
    expect(src).toContain('contextDescription?: string');
  });
});

describe('直播上下文取数', () => {
  const app = read('apps/LiveStreamApp.tsx');

  it('直播轮次与陪看都走正常聊天范围', () => {
    expect(app).toContain('loadCharacterContextMessages(currentChar)');
  });

  it('旧的「最近 6 条 / 30 分钟 / 160 字」私聊截断已删净', () => {
    const prompts = read('utils/liveStreamPrompts.ts');
    expect(prompts).not.toContain('extractRecentPrivateChatInterruptions');
    expect(prompts).not.toContain('场外私聊互动');
    expect(prompts).not.toContain('slice(-16)');
  });
});
