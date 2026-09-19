import { describe, expect, it } from 'vitest';
import { ChatPrompts } from './chatPrompts';

const userProfile = { name: '小明' } as any;

describe('角色来电提示词', () => {
    it('开关关着 / 打包主动消息时不教打电话', async () => {
        const off = await ChatPrompts.buildSystemPromptParts(
            { id: 'c1', name: '阿一' } as any, userProfile, [], [], [], [],
        );
        expect(off.stable).not.toContain('[[ACTION:CALL');
        const pack = await ChatPrompts.buildSystemPromptParts(
            { id: 'c1', name: '阿一', allowProactiveCall: true } as any, userProfile, [], [], [], [],
            undefined, undefined, undefined, undefined, undefined, undefined,
            { forFirePack: true },
        );
        expect(pack.stable).not.toContain('[[ACTION:CALL');
    });

    it('开关开着才教，可用自定义提示词', async () => {
        const on = await ChatPrompts.buildSystemPromptParts(
            { id: 'c1', name: '阿一', allowProactiveCall: true } as any, userProfile, [], [], [], [],
        );
        expect(on.stable).toContain('[[ACTION:CALL');
        expect(on.stable).toContain('打电话给对方');
        const custom = await ChatPrompts.buildSystemPromptParts(
            { id: 'c1', name: '阿一', allowProactiveCall: true, incomingCallPrompt: '只在想听声音时打 [[ACTION:CALL]]' } as any,
            userProfile, [], [], [], [],
        );
        expect(custom.stable).toContain('只在想听声音时打');
    });
});
