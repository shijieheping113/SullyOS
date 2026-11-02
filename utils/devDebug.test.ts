import { describe, expect, it } from 'vitest';
import { redactDevDebugSecrets, shouldShowNotifyDebugHint } from './devDebug';

describe('dev debug privacy redaction', () => {
  it('never persists camera image data URLs in request detail logs', () => {
    expect(redactDevDebugSecrets({
      messages: [{
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,PRIVATEPIXELS' } }],
      }],
    })).toEqual({
      messages: [{
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: '<image data omitted · 36 chars>' } }],
      }],
    });
  });
});

describe('消息通知调试开关', () => {
  it('默认两个都关：正常聊天绝不弹那个说明框', () => {
    expect(shouldShowNotifyDebugHint({ available: false, notifyDebug: false })).toBe(false);
  });

  it('光解锁面板还不够，开关没打开也不弹', () => {
    expect(shouldShowNotifyDebugHint({ available: true, notifyDebug: false })).toBe(false);
  });

  it('开关还留在存档里、但面板被关掉，同样不弹（否则等于背着人弹窗）', () => {
    expect(shouldShowNotifyDebugHint({ available: false, notifyDebug: true })).toBe(false);
  });

  it('面板解锁 + 开关打开才弹', () => {
    expect(shouldShowNotifyDebugHint({ available: true, notifyDebug: true })).toBe(true);
  });
});
