/**
 * 拉黑期间：来电被拒接 / 接听后挂断 → 角色回一句。
 * 走聊天同一套组包和落库，不进主动消息管道（不看那个开关，也不因「正在通话」跳过）。
 */
import type { APIConfig, CharacterProfile, GroupProfile, RealtimeConfig, UserProfile } from '../types';
import { DB } from './db';
import { getBlockStateForChar, saveBlockNotice } from './block';
import { loadCharacterContextRange } from './chatContextRange';
import { buildChatRequestPayload } from './chatRequestPayload';
import { ChatPrompts } from './chatPrompts';
import { applyAssistantPostProcessing, type XhsCaches } from './applyAssistantPostProcessing';
import { safeFetchJson } from './safeApi';
import { loadMusicPlaybackSnapshot, loadMusicHooks } from '../context/MusicContext';
import { CHAT_GEN_EVENTS } from './chatGenEvents';

export const BLOCK_CALL_HANGUP_SOURCE = 'block-call-hangup';

export async function runBlockedCallHangupReply(opts: {
    charId: string;
    userName: string;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    groups: GroupProfile[];
    apiConfig: APIConfig;
    realtimeConfig?: RealtimeConfig;
    addToast: (msg: string, type: 'info' | 'success' | 'error') => void;
}): Promise<void> {
    const { charId, userName, userProfile, groups, apiConfig, realtimeConfig, addToast } = opts;
    const char = opts.characters.find(item => item.id === charId);
    if (!char) return;

    const blocked = await getBlockStateForChar(charId);
    if (!blocked.blocked) return;

    await saveBlockNotice(charId, 'call-hangup');
    window.dispatchEvent(new CustomEvent(CHAT_GEN_EVENTS.replyEnd));

    await DB.saveMessage({
        charId,
        role: 'user',
        type: 'text',
        content: `[系统提示（非${userName}发言）: 你打给${userName}的电话被挂断了。${userName}仍然看不见你的普通消息。这不是${userName}在找你。请只说一两句你自己的反应，不要装作消息能送到，不要再输出打电话暗号。]`,
        metadata: { hidden: true, source: BLOCK_CALL_HANGUP_SOURCE },
    });

    const range = await loadCharacterContextRange(char);
    const allMsgs = range.messages;
    const { emojis, categories } = ChatPrompts.filterVisibleEmojis(
        await DB.getEmojis(),
        await DB.getEmojiCategories(),
        charId,
    );
    const payload = await buildChatRequestPayload({
        char,
        userProfile,
        groups,
        emojis,
        categories,
        historyMsgs: allMsgs,
        contextLimit: Math.max(1, allMsgs.length),
        realtimeConfig,
        musicSnapshot: loadMusicPlaybackSnapshot(),
        htmlMode: { enabled: !!(char as any).htmlModeEnabled, customPrompt: (char as any).htmlModeCustomPrompt },
        thinkingChain: { enabled: !!(char as any).showThinkingChain, customPrompt: (char as any).thinkingChainCustomPrompt },
        visionApiConfig: apiConfig.visionApi,
    });

    const api = apiConfig;
    if (!api.baseUrl) return;
    const baseUrl = api.baseUrl.replace(/\/+$/, '');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey || 'sk-none'}` };
    const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: api.model,
            messages: payload.fullMessages,
            temperature: 0.85,
            stream: false,
        }),
    }, 2, 0, { appName: '消息', charId, charName: char.name, purpose: '来电挂断反应' });

    const raw = data?.choices?.[0]?.message?.content || '';
    const xhsCaches: XhsCaches = {
        xsecTokenCache: new Map(),
        noteTitleCache: new Map(),
        commentUserIdCache: new Map(),
        commentAuthorNameCache: new Map(),
        commentParentIdCache: new Map(),
    };
    await applyAssistantPostProcessing(raw, {
        char,
        userProfile,
        emojis,
        categories,
        realtimeConfig,
        groups,
        contextMsgs: allMsgs,
        fullMessages: payload.fullMessages,
        initialData: data,
        historyMsgCount: allMsgs.length,
        xhsCaches,
        api: { baseUrl, headers, effectiveApi: { baseUrl: api.baseUrl, apiKey: api.apiKey, model: api.model } },
        hooks: {
            setMessages: () => {
                /* Chat 靠 replyArrived 刷新 */
            },
            addToast,
            musicHooks: loadMusicHooks() ?? undefined,
        },
        instantRender: true,
        skipSecondPassLLM: false,
    });

    window.dispatchEvent(new CustomEvent(CHAT_GEN_EVENTS.replyArrived, {
        detail: { charId, charName: char.name },
    }));
}
