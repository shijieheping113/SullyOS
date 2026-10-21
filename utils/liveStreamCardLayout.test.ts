import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const messageItemSource = readFileSync(
  new URL('../components/chat/MessageItem.tsx', import.meta.url),
  'utf8',
);
const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
const liveRoomSource = readFileSync(new URL('../components/live/LiveRoomView.tsx', import.meta.url), 'utf8');
const liveWatchSource = readFileSync(new URL('../components/live/LiveWatchScreen.tsx', import.meta.url), 'utf8');
const liveAppSource = readFileSync(new URL('../apps/LiveStreamApp.tsx', import.meta.url), 'utf8');
const liveWidgetsSource = readFileSync(new URL('../components/live/LiveSharedWidgets.tsx', import.meta.url), 'utf8');

describe('直播轮次卡布局', () => {
  it('轮次卡作为全宽居中独立行渲染，不走带角色头像的普通消息布局', () => {
    const start = messageItemSource.indexOf("if (scoreData?.type === 'livestream_card')");
    const end = messageItemSource.indexOf("if (scoreData?.type === 'diary_card')", start);
    const branch = messageItemSource.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(branch).not.toContain('commonLayout(');
    expect(branch).toContain('justify-center');
    expect(branch).toContain('max-w-[340px]');
    expect(messageItemSource).toContain('block w-full max-w-full min-w-0 text-left');
    expect(messageItemSource).not.toContain('return commonLayout(<LivestreamChatCardView');
  });

  it('从直播界面保留的逐轮摘要选卡并发送，不依赖私聊原卡或触发回复', () => {
    expect(messageItemSource).not.toContain('手动发到私聊');
    expect(chatSource).not.toContain('live_card_forward');
    expect(liveWatchSource).toContain('props.onForwardRoundToPrivate(chunk.id)');
    expect(liveWatchSource).toContain('发这轮卡片到私聊');
    expect(liveRoomSource).toContain('onForwardRoundToPrivate={onForwardRoundToPrivate}');
    const start = liveAppSource.indexOf('const handleForwardRoundToPrivate');
    const end = liveAppSource.indexOf('// ==================== 2.', start);
    const handler = liveAppSource.slice(start, end);
    expect(handler).toContain('activeLiveSession.chunks.find(item => item.id === chunkId)');
    expect(handler).toContain('buildLiveRoundCard');
    expect(handler).toContain("role: 'user'");
    expect(handler).toContain("type: 'score_card'");
    expect(handler).toContain('DB.saveMessage');
    expect(handler).not.toContain('triggerAI(');
  });

  it('舞台滚动弹幕只滚当前拍并循环，实时聊天仍按播放进度展开', () => {
    expect(liveWidgetsSource).not.toContain('danmakuList.slice(-trackCount)');
    expect(liveWidgetsSource).toContain('danmakuList');
    expect(liveWidgetsSource).toContain('rowFreeAt[row] = start + duration');
    expect(liveWidgetsSource).toContain('infinite');
    expect(liveWidgetsSource).toContain('onair-dm--sc');
    expect(liveRoomSource).toContain('const scrollingDanmakuFeed = useMemo');
    expect(liveRoomSource).toContain('getCurrentBeatDanmakuFeed');
    expect(liveRoomSource).toContain('getVisibleLiveDanmakuFeed');
  });

  it('即时接话动态截断到选中拍，后续内容作废并作为新轮新卡生成', () => {
    const start = liveAppSource.indexOf('const handleSendUserDanmaku');
    const end = liveAppSource.indexOf('const mutateUserDanmaku', start);
    const handler = liveAppSource.slice(start, end);
    expect(handler).toContain('truncateLiveChunkAfterBeat(targetChunk, targetBeat.beatId)');
    expect(handler).toContain('DB.deleteMessages(dropIds)');
    expect(handler).toContain('runGenerateLiveChunk(baseSession, activeChannel, nextQueue)');
    expect(handler).not.toContain('continueChunkId');
    expect(liveAppSource).toContain(': [...session.chunks, newChunk]');
  });
});
