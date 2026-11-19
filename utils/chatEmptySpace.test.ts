// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import Chat from '../apps/Chat';
import { AppID } from '../types';
import { DB } from './db';
import { AppNavigationActive } from '../hooks/useLocalBackHandler';
import { CHAT_MESSAGES_COMMITTED } from './chatMessageEvents';

const state = vi.hoisted(() => ({ characters: [] as any[], activeCharacterId: 'missing', read: vi.fn(), close: vi.fn(), open: vi.fn() }));
vi.mock('../context/OSContext', () => { const context = {
    activeApp: 'chat', activeCharacterId: 'missing',
    theme: {}, userProfile: { name: '测试用户', avatar: '', bio: '' },
    apiConfig: {}, apiPresets: [], availableModels: [], customThemes: [], groups: [], characterGroups: [],
    unreadMessages: {}, realtimeConfig: {}, memoryPalaceConfig: {}, remoteVectorConfig: {},
    closeApp: state.close, openApp: state.open, clearUnread: state.read, setActiveCharacterId: vi.fn(),
    addToast: vi.fn(), updateCharacter: vi.fn(), updateUserProfile: vi.fn(),
}; return { useOS: () => ({ ...context, characters: state.characters, activeCharacterId: state.activeCharacterId }) }; });
vi.mock('../hooks/useChatAI', () => ({ useChatAI: () => ({
    isTyping: false, streamingBubbles: [], streamingThinking: '', streamingHandoverIds: [], triggerAI: vi.fn(),
    setLastTokenUsage: vi.fn(), setLastDigestResult: vi.fn(), setMemoryPalaceResult: vi.fn(),
}) }));
vi.mock('../context/MiaomiaoBoxContext', async importOriginal => ({
    ...await importOriginal<typeof import('../context/MiaomiaoBoxContext')>(),
    useMiaomiaoBox: () => ({ openForChar: vi.fn() }),
}));
// Keep this UI regression independent of a real IndexedDB favorite read finishing after jsdom teardown.
vi.mock('./contentFavorites', async importOriginal => ({
    ...await importOriginal<typeof import('./contentFavorites')>(),
    listContentFavorites: async () => [],
}));
vi.mock('../hooks/useStreamingVoice', () => ({ useStreamingVoice: () => ({ state: null, stop: vi.fn() }) }));
vi.mock('../components/chat/MemoryContextSelfCheck', () => ({ default: () => null }));
vi.mock('../components/chat/ChatHeaderShell', () => ({ default: () => React.createElement('header', null, '聊天标题') }));
vi.mock('../components/chat/ChatInputArea', () => ({ default: () => React.createElement('footer', null, '聊天输入') }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { state.characters = []; state.activeCharacterId = 'missing'; vi.restoreAllMocks(); vi.clearAllMocks(); });

it('renders an empty space and remains stable when characters appear and disappear', async () => {
    vi.spyOn(DB, 'initializeEmojiData').mockResolvedValue(undefined);
    vi.spyOn(DB, 'getEmojis').mockResolvedValue([]);
    vi.spyOn(DB, 'getEmojiCategories').mockResolvedValue([]);
    const host = document.createElement('div'), root = createRoot(host);
    try {
        await act(async () => root.render(React.createElement(Chat)));
        expect(host.textContent).toContain('暂时没有可用的角色');
        const entry = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '前往神经链接');
        expect(entry).toBeDefined();
        await act(async () => entry!.click());
        expect(state.open).toHaveBeenCalledWith(AppID.Character);

        state.characters = [{ id: 'new', name: '新角色', avatar: '', memories: [], description: '', systemPrompt: '' }];
        await act(async () => root.render(React.createElement(Chat)));
        expect(host.querySelector('.sully-chat-root')).not.toBeNull();

        state.characters = [];
        await act(async () => root.render(React.createElement(Chat)));
        expect(host.textContent).toContain('暂时没有可用的角色');
        await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === '返回桌面')!.click());
        expect(state.close).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); }
});

it('only confirms incoming messages actually displayed in an active foreground Chat', async () => {
    const charId = 'read-surface-regression';
    state.activeCharacterId = charId;
    state.characters = [{ id: charId, name: '测试角色', avatar: '', memories: [], description: '', systemPrompt: '' }];
    let visible = true;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
    vi.spyOn(DB, 'initializeEmojiData').mockResolvedValue(undefined);
    vi.spyOn(DB, 'getEmojis').mockResolvedValue([]);
    vi.spyOn(DB, 'getEmojiCategories').mockResolvedValue([]);
    let rows: any[] = [{ id: 400, charId, role: 'assistant', type: 'text', content: '前台显示的消息', timestamp: Date.now() }];
    vi.spyOn(DB, 'getRecentMessagesWithCount').mockImplementation(async () => ({ messages: rows.slice(), totalCount: rows.length }));
    const host = document.createElement('div'), root = createRoot(host);
    document.body.appendChild(host);
    const settle = async () => { for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
    const render = (active: boolean) => act(async () => root.render(React.createElement(AppNavigationActive.Provider, { value: active }, React.createElement(Chat))));
    try {
        await render(true); await settle();
        expect(state.read).toHaveBeenCalledWith(charId, 400);
        state.read.mockClear();
        visible = false;
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        rows = [...rows, { ...rows[0], id: 401, content: '后台收到的消息' }];
        await act(async () => { window.dispatchEvent(new CustomEvent(CHAT_MESSAGES_COMMITTED, { detail: { charId } })); });
        await settle();
        expect(state.read).not.toHaveBeenCalled();
        await render(false);
        visible = true;
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        await settle();
        expect(state.read).not.toHaveBeenCalled();
        await render(true); await settle();
        expect(state.read).toHaveBeenCalledWith(charId, 401);
        state.read.mockClear();
        rows = [...rows, { ...rows[0], id: 402, role: 'user', content: '自己刚发出的消息' }];
        await act(async () => { window.dispatchEvent(new CustomEvent(CHAT_MESSAGES_COMMITTED, { detail: { charId } })); });
        await settle();
        expect(state.read).not.toHaveBeenCalledWith(charId, 402);
    } finally { await act(async () => root.unmount()); host.remove(); }
});
