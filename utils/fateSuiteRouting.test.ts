import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('命运整套界面与原版来源隔离', () => {
    const source = (file: string) => readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    it('命运整套页面单独渲染，原版仍保留ScheduleCard和EmotionSettingsPanel', () => {
        const modals = source('components/chat/ChatModals.tsx');
        expect(modals).toContain("appearance={activeCharacter?.scheduleMode === 'fate' ? 'fate' : undefined}");
        expect(modals).toContain('<FateScheduleSuite');
        expect(modals).toContain('<ScheduleCard');
        expect(modals).toContain('<EmotionSettingsPanel');
        expect(modals).not.toContain('<FateScheduleSettings');
        expect(modals).toContain('aria-label="日程模式"');
    });
    it('私聊卡片按发送时来源选择样式，不依赖当前角色模式', () => {
        const chat = source('apps/Chat.tsx');
        expect(chat).toContain("scheduleMode: 'fate'");
        expect(chat).toContain('fateFactors: slot.fate?.factors');
        const message = source('components/chat/MessageItem.tsx');
        expect(message).toContain("if (tMeta.scheduleMode === 'fate')");
        expect(message).toContain('<FateTheaterCard');
    });
    it('播放器根据被查看日程的模式选择而非当前角色设置', () => {
        expect(source('apps/Chat.tsx')).toContain("scheduleData.mode === 'fate' ? FateTheaterPlayer : TheaterPlayer");
    });
});
