import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// 表情权限的「三份清单」契约（docs/emoji-permission.md）：
//   认图/显示已发消息 → 全本，不看权限，不减折叠
//   提示词「能发清单」 → 权限过滤 + 减折叠
//   发送落库按名反查 → 权限过滤，不减折叠
// 这类错很难被行为测试逮住（要整套聊天记录 + 权限 + 折叠组合），
// 所以对调用点做源码级守卫：谁把过滤后的清单递给了认图，这里直接红。

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const payload = read('chatRequestPayload.ts');
const useChatAI = read('../hooks/useChatAI.ts');
const chatPage = read('../apps/Chat.tsx');
const hangup = read('blockCallHangupReply.ts');
const osContext = read('../context/OSContext.tsx');
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

    it('挂断补句与本地主动消息各自留一份全量', () => {
        expect(hangup).toContain('historyEmojis: allEmojis,');
        expect(osContext).toContain('historyEmojis: allEmojis,');
    });

    it('云端主动消息的历史认图改用 library.all', () => {
        expect(activeMsgClient).toContain('library.all,\n  ).apiMessages');
    });
});

describe('提示词清单按权限并减折叠', () => {
    it('载荷层默认按 char.id 当折叠窗口', () => {
        expect(payload).toContain('input.emojiFoldKey ?? char.id');
    });

    it('私聊 / 挂断 / 本地主动消息都传了 foldKey（权限 + 折叠）', () => {
        expect(hangup).toContain('charId,\n        charId,\n    );');
        expect(osContext).toContain('charId,\n                  charId,\n              );');
        expect(collaborationContext).toContain('ChatPrompts.filterVisibleEmojis(emojis, categories, char.id, char.id)');
    });

    it('落库反查不传 foldKey（折叠不是禁令）', () => {
        expect(hangup).toContain('const { emojis } = ChatPrompts.filterVisibleEmojis(allEmojis, allCategories, charId);');
        expect(osContext).toContain('const { emojis } = ChatPrompts.filterVisibleEmojis(allEmojis, allCategories, charId);');
    });

    it('群聊清单在内部减折叠，并带「仅某某」标注', () => {
        expect(groupPrompts).toContain('foldedCategoriesFor(categories, foldKey)');
        expect(groupPrompts).toContain('（仅');
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
