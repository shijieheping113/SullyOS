import { describe, it, expect } from 'vitest';
import { buildAtelierAvatarTuneCss } from './atelierAvatarTuneCss';

describe('buildAtelierAvatarTuneCss', () => {
    it('默认底部且无偏移 → 空', () => {
        expect(buildAtelierAvatarTuneCss({})).toBe('');
        expect(buildAtelierAvatarTuneCss({ chatAvatarAlign: 'bottom', chatAvatarOffsetY: 0 })).toBe('');
    });

    it('底部对齐 + 偏移生成 translateY，并压在气泡旁头像槽上', () => {
        const css = buildAtelierAvatarTuneCss({ chatAvatarOffsetY: 12 });
        expect(css).toContain('.sully-chat-message-avatar-slot');
        expect(css).toContain('translateY(12px)');
        expect(css).toContain('!important');
    });

    it('每轮上方时不生成（那条布局另有规则）', () => {
        expect(buildAtelierAvatarTuneCss({ chatAvatarPlacement: 'above_group', chatAvatarOffsetY: 8 })).toBe('');
    });

    it('顶部对齐带偏移', () => {
        const css = buildAtelierAvatarTuneCss({ chatAvatarAlign: 'top', chatAvatarOffsetY: -6 });
        expect(css).toContain('top: -0.5rem');
        expect(css).toContain('translateY(-6px)');
    });
});
