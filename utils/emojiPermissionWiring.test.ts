import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// 表情权限的契约（docs/emoji-permission.md）：
//   认图/显示已发消息 → 全本，不看权限
//   提示词「能发清单」 → 只按权限过滤
//   发送落库按名反查 → 也只按权限
//   折叠 = 用户自己面板的收纳习惯，不进任何发给角色的清单
// 这类错很难被行为测试逮住（要整套聊天记录 + 权限组合），
// 所以对调用点做源码级守卫：谁把过滤后的清单递给了认图、谁把折叠掺进清单，这里直接红。

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const payload = read('chatRequestPayload.ts');
const useChatAI = read('../hooks/useChatAI.ts');
const chatPage = read('../apps/Chat.tsx');
const hangup = read('blockCallHangupReply.ts');
const awayMessage = read('awayMessage.ts');
const activeMsgClient = read('activeMsgClient.ts');
const watchAlong = read('../apps/watchAlong/WatchAlongApp.tsx');
const watchChat = read('../components/watchAlong/WatchChat.tsx');
const collaboration = read('../features/collaboration/CollaborationWindow.tsx');
const collaborationContext = read('../features/collaboration/context.ts');
const groupPrompts = read('groupChat/prompts.ts');
const reprocess = read('reprocessChatMessage.ts');

describe('认图走全本（historyEmojis / 全量库）', () => {
    it('载荷层把 historyEmojis 单独喂给 buildMessageHistory，清单仍用过滤版', () => {
        expect(payload).toContain('const historyEmojis = input.historyEmojis ?? input.emojis;');
        // 两处历史拼装都用 historyEmojis
        const historyCalls = payload.split('historyEmojis,');
        expect(historyCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('useChatAI 收 historyEmojis 并原样送进载荷', () => {
        expect(useChatAI).toContain('historyEmojis?: Emoji[];');
        expect(useChatAI).toContain('emojis, categories, historyEmojis,');
    });

    it('私聊把全量表情库作为 historyEmojis 传给 useChatAI', () => {
        expect(chatPage).toContain('historyEmojis: emojis,');
    });

    it('挂断补句与离开后消息各自留一份全量', () => {
        expect(hangup).toContain('historyEmojis: allEmojis,');
        // 1.0 本地主动消息已删；本地离开后消息接过这条认图契约。
        expect(awayMessage).toContain('historyEmojis: allEmojis,');
    });

    it('云端主动消息的历史认图改用 library.all', () => {
        expect(activeMsgClient).toContain('library.all,\n  ).apiMessages');
    });
});

describe('折叠不掺进任何发给角色的清单', () => {
    // 折叠是用户自己面板里的收纳习惯（这里收起、暂时不点），跟「角色能不能发」是两回事。
    // 所以凡是角色会看到的东西（提示词清单、群聊清单、协同清单、主动消息清单），
    // 都不许出现折叠的痕迹。

    it('载荷层不再有折叠窗口参数', () => {
        expect(payload).not.toContain('emojiFoldKey');
        expect(payload).toContain('ChatPrompts.filterVisibleEmojis(\n        input.emojis,\n        input.categories,\n        char.id,\n    );');
    });

    it('聊天清单的过滤入口只收权限三参', () => {
        const chatPrompts = read('chatPrompts.ts');
        expect(chatPrompts).not.toContain('promptEmojisForCharacter');
        expect(chatPrompts).not.toContain('foldedCategoriesFor');
        expect(chatPrompts).not.toContain('foldKey');
    });

    it('群聊清单不按折叠收（只按成员权限 + 「仅某某」标注）', () => {
        expect(groupPrompts).not.toContain('foldedCategoriesFor');
        expect(groupPrompts).not.toContain('foldKey');
        expect(groupPrompts).toContain('（仅');
    });

    it('协同：提示词清单只按权限，折叠只留在她自己的面板', () => {
        expect(collaborationContext).toContain(
            'ChatPrompts.filterVisibleEmojis(emojis, categories, char.id)',
        );
        expect(collaborationContext).not.toContain('char.id, char.id');
    });

    it('挂断补句与离开后消息：清单与落库都只按权限', () => {
        expect(hangup).toContain(
            'const { emojis, categories } = ChatPrompts.filterVisibleEmojis(allEmojis, allCategories, charId);',
        );
        expect(hangup).not.toContain('charId,\n        charId,');
        expect(awayMessage).toContain(
            'ChatPrompts.filterVisibleEmojis(allEmojis, allCategories, char.id)',
        );
        expect(awayMessage).not.toContain('char.id,\n    char.id,');
        expect(activeMsgClient).not.toContain('char.id,\n    char.id,');
    });

    it('折叠仍然只作用于她自己的面板（这些入口必须还在）', () => {
        expect(chatPage).toContain('userVisibleEmojis(emojis, categories, emojiFoldKey)');
        expect(chatPage).toContain('withCategoryFold(cat, emojiFoldKey, folded)');
        expect(watchChat).toContain('userVisibleEmojis(emojis, categories, charId)');
    });
});

describe('陪看与协同的显示层跟私聊一致', () => {
    it('陪看读全本，面板用用户视图，认 URL 用全本', () => {
        expect(watchAlong).not.toContain('filterVisibleEmojis');
        expect(watchChat).toContain('userVisibleEmojis(emojis, categories, charId)');
        expect(watchChat).toContain('name ? emojis.find(e => e.name === name)?.url : undefined');
    });

    it('协同显示层传全本，旧的 allowedCharacterIds 换算已删除', () => {
        expect(collaboration).not.toContain('visibleEmojiLibrary');
        expect(collaboration).not.toContain('allowedCharacterIds?.length');
        expect(collaboration).toContain('emojis={emojis}\n                emojiCategories={emojiCategories}');
    });
});

describe('重建已有消息不再按旧名单二次收口', () => {
    it('reprocessChatMessage 里旧的 filterEmojisForChar 已删除', () => {
        expect(reprocess).not.toContain('filterEmojisForChar');
        expect(reprocess).toContain('const scopedEmojis = emojis;');
    });

    it('猫儿助手（加泡 / 修格式）拿全量表情库，不受权限过滤', () => {
        // 它是修格式的工具：屏幕上显示得出来的格式，它都要认得、修得了。
        expect(chatPage).not.toContain('emojis={aiVisibleEmojis}');
        expect(chatPage).not.toContain('categories={visibleCategories}');
    });
});
