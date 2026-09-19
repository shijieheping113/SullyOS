import { describe, expect, it } from 'vitest';
import type { CharacterProfile, Message, UserProfile } from '../types';
import { ChatPrompts } from './chatPrompts';

const char = { id: 'c1', name: 'TestChar' } as CharacterProfile;
const user = { name: 'Ann' } as UserProfile;

describe('video message prompt', () => {
  it('injects Ann定稿句 without video_url', () => {
    const msgs: Message[] = [{
      id: 1,
      charId: 'c1',
      role: 'user',
      type: 'video',
      content: 'blobref:cover',
      timestamp: Date.now(),
      metadata: {
        videoTitle: '测试',
        videoDescription: '一只猫在跑',
      },
    }];
    const { apiMessages } = ChatPrompts.buildMessageHistory(
      msgs,
      50,
      char,
      user,
      [],
      undefined,
      { useVisionDescriptions: false },
    );
    const text = JSON.stringify(apiMessages);
    expect(text).toContain('用户分享了一段短视频');
    expect(text).toContain('也不一定是你本人出现在画面里');
    expect(text).toContain('融入视频的讨论');
    expect(text).toContain('（供你理解视频画面内容，勿照读）一只猫在跑');
    expect(text).not.toContain('video_url');
    expect(text).not.toContain('image_url');
  });

  it('omits desc line when videoDescription empty', () => {
    const msgs: Message[] = [{
      id: 1,
      charId: 'c1',
      role: 'user',
      type: 'video',
      content: 'blobref:cover',
      timestamp: Date.now(),
      metadata: { videoTitle: '测试' },
    }];
    const { apiMessages } = ChatPrompts.buildMessageHistory(
      msgs,
      50,
      char,
      user,
      [],
      undefined,
      { useVisionDescriptions: false },
    );
    const text = JSON.stringify(apiMessages);
    expect(text).not.toContain('勿照读');
    expect(text).toContain('按照实际的视频内容来理解');
  });
});
