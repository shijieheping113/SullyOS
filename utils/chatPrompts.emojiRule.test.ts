import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// 表情提示词的两条管线（聊天主路径 / 主动消息拼接版）共用同一段规则：
// 上下文里出现过的表情不等于现在能用（权限会变）、只能用清单里的名字、
// 清单外的别学、不能自创、不能乱抄、不许编造。
// 这里做源码级检查，防止以后改提示词时只改了一条或把规则删掉。

const source = readFileSync(resolve(__dirname, 'chatPrompts.ts'), 'utf8');
const groupSource = readFileSync(resolve(__dirname, 'groupChat/prompts.ts'), 'utf8');
const collaborationSource = readFileSync(resolve(__dirname, '../features/collaboration/context.ts'), 'utf8');

describe('表情提示词规则（源码检查）', () => {
    it('有一条「权限会变、只认清单」的短规则', () => {
        expect(source).toContain('表情权限会变');
        expect(source).toContain('上下文记录里出现过的表情，不等于你现在能用');
        expect(source).toContain('「可用表情库 (按分类)」');
        expect(source).toContain('清单外的别学，不能自创，不能乱抄');
        expect(source).toContain('不许编造不存在的表情名');
    });

    it('群聊与协同写了同一条规则，措辞对齐', () => {
        expect(groupSource).toContain('上下文里出现的表情不等于你能用，权限一直在更新');
        expect(groupSource).toContain('清单外的别学，不能自创，不能乱抄');
        expect(collaborationSource).toContain('上下文里出现的表情不等于你能用，权限一直在更新');
        expect(collaborationSource).toContain('清单外的别学，不能自创，不能乱抄');
    });

    it('过滤逻辑收口到 emojiPermissions（分组开关 + 单表情屏蔽）', () => {
        expect(source).toContain("from './emojiPermissions'");
        expect(source).toContain('visibleEmojisForCharacter(emojis, categories, charId)');
        expect(source).toContain('visibleCategoriesForCharacter(categories, charId)');
    });

    it('提示词清单只管权限，不掺折叠（折叠是用户自己面板的收纳习惯）', () => {
        expect(source).not.toContain('promptEmojisForCharacter');
        expect(source).not.toContain('foldedCategoriesFor');
        // filterVisibleEmojis 的签名里不能有 foldKey 这种「窗口」参数
        expect(source).toContain(
            'filterVisibleEmojis: (\n        emojis: Emoji[],\n        categories: EmojiCategory[],\n        charId: string,\n    )',
        );
    });

    it('拼接版直接复用分块版，两条管线共享同一段表情规则', () => {
        expect(source).toContain('ChatPrompts.buildSystemPromptParts(');
    });
});
