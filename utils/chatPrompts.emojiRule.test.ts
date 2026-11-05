import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// 表情提示词的两条管线（聊天主路径 / 主动消息拼接版）共用同一段规则：
// 只能从清单里挑名字、清单外的不能发、编造的不能发、上文出现过但现在不能用的也不能发。
// 这里做源码级检查，防止以后改提示词时只改了一条或把规则删掉。

const source = readFileSync(resolve(__dirname, 'chatPrompts.ts'), 'utf8');

describe('表情提示词规则（源码检查）', () => {
    it('有一条「只能从清单里挑」的短规则', () => {
        expect(source).toContain('只能从下面清单里挑表情');
        expect(source).toContain('清单里没有的名字绝对不要发');
        expect(source).toContain('不许编造不存在的表情名');
    });

    it('过滤逻辑收口到 emojiPermissions（分组开关 + 单表情屏蔽）', () => {
        expect(source).toContain("from './emojiPermissions'");
        expect(source).toContain('visibleEmojisForCharacter(emojis, categories, charId)');
        expect(source).toContain('visibleCategoriesForCharacter(categories, charId)');
    });

    it('拼接版直接复用分块版，两条管线共享同一段表情规则', () => {
        expect(source).toContain('ChatPrompts.buildSystemPromptParts(');
    });
});
