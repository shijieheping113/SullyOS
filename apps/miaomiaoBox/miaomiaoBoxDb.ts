import { openDB } from '../../utils/db';
import {
  MIAOMIAO_FOLD_N_DEFAULT,
  type MiaomiaoMessage,
  type MiaomiaoSession,
  type MiaomiaoSettings,
  type MiaomiaoWorldRule,
} from './types';

export const STORE_MIAOMIAO_SESSIONS = 'miaomiao_sessions';
export const STORE_MIAOMIAO_MESSAGES = 'miaomiao_messages';
export const STORE_MIAOMIAO_SETTINGS = 'miaomiao_settings';

const waitTx = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('miaomiao tx aborted'));
  });

const defaultSettings = (charId: string): MiaomiaoSettings => ({
  charId,
  foldN: MIAOMIAO_FOLD_N_DEFAULT,
  ttsAutoPlay: true,
  ttsEnabled: true,
  voiceQuoteStyle: 'corner',
  worldRules: [],
});

export const MiaomiaoBoxDB = {
  async getSettings(charId: string): Promise<MiaomiaoSettings> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_SETTINGS, 'readonly');
    const req = tx.objectStore(STORE_MIAOMIAO_SETTINGS).get(charId);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as MiaomiaoSettings) || defaultSettings(charId));
      req.onerror = () => reject(req.error);
    });
  },

  async saveSettings(settings: MiaomiaoSettings): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_SETTINGS, 'readwrite');
    tx.objectStore(STORE_MIAOMIAO_SETTINGS).put(settings);
    return waitTx(tx);
  },

  async saveSession(session: MiaomiaoSession): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_SESSIONS, 'readwrite');
    tx.objectStore(STORE_MIAOMIAO_SESSIONS).put(session);
    return waitTx(tx);
  },

  async getSession(id: string): Promise<MiaomiaoSession | undefined> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_SESSIONS, 'readonly');
    const req = tx.objectStore(STORE_MIAOMIAO_SESSIONS).get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as MiaomiaoSession | undefined);
      req.onerror = () => reject(req.error);
    });
  },

  async listSessionsByChar(charId: string): Promise<MiaomiaoSession[]> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_MIAOMIAO_SESSIONS);
    const index = store.indexNames.contains('charId') ? store.index('charId') : null;
    const req = index ? index.getAll(IDBKeyRange.only(charId)) : store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const rows = ((req.result as MiaomiaoSession[]) || []).filter(s => s.charId === charId);
        rows.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async saveMessage(msg: MiaomiaoMessage): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_MESSAGES, 'readwrite');
    tx.objectStore(STORE_MIAOMIAO_MESSAGES).put(msg);
    return waitTx(tx);
  },

  async listMessages(sessionId: string): Promise<MiaomiaoMessage[]> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_MESSAGES, 'readonly');
    const store = tx.objectStore(STORE_MIAOMIAO_MESSAGES);
    const index = store.indexNames.contains('sessionId') ? store.index('sessionId') : null;
    const req = index ? index.getAll(IDBKeyRange.only(sessionId)) : store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const rows = ((req.result as MiaomiaoMessage[]) || []).filter(m => m.sessionId === sessionId);
        rows.sort((a, b) => a.timestamp - b.timestamp);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async deleteMessage(id: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_MIAOMIAO_MESSAGES, 'readwrite');
    tx.objectStore(STORE_MIAOMIAO_MESSAGES).delete(id);
    return waitTx(tx);
  },

  newRule(partial?: Partial<MiaomiaoWorldRule>): MiaomiaoWorldRule {
    return {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: partial?.title || '新规则',
      body: partial?.body || '',
      enabled: partial?.enabled !== false,
    };
  },

  newId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  },
};
