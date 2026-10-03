// 聊天语音消息：点麦克风说话 → 再点一下停止 → 整段识别文字（逐句带情绪标注）
// 直接送进聊天成为一条语音消息，不经过输入框草稿。
// 原声录音由 volcStt 缓存，stop 后通过 onVoiceMessage 一起交给调用方（存 IndexedDB 回放）。
import { useCallback, useRef, useState } from 'react';
import { startVoiceInput, isSttSupported, createSttAbort, SttCancelled, type SttAbort, type SttSession } from '../utils/volcStt';
import type { SttApiConfig } from '../types';

export type VoiceInputState = 'idle' | 'connecting' | 'recording' | 'muted' | 'stopping';

export interface VoiceRecording { wav: Blob; durationMs: number }

export interface UseVoiceInputArgs {
  getConfig: () => SttApiConfig | undefined;
  /** 点停止后整段回调：text 为逐句拼接的识别结果（每句可带情绪前缀），recording 为原声（可能为 null） */
  onVoiceMessage: (text: string, recording: VoiceRecording | null) => void;
  onError: (msg: string) => void;
  /** 为 true 时这一帧不送去识别。聊天用来挡住正在播放的语音。 */
  isFeedPaused?: () => boolean;
}

export function useVoiceInput({ getConfig, onVoiceMessage, onError, isFeedPaused }: UseVoiceInputArgs) {
  const [state, setState] = useState<VoiceInputState>('idle');
  const sessionRef = useRef<SttSession | null>(null);
  const committedRef = useRef('');
  const abortRef = useRef<SttAbort | null>(null);
  const runRef = useRef(0);
  const stateRef = useRef<VoiceInputState>('idle');
  stateRef.current = state;

  const live = (run: number) => runRef.current === run && !abortRef.current?.aborted;

  /** 关掉还没连上的那一次。连上之后的会话不在这里收尾。 */
  const abortStart = () => {
    const abort = abortRef.current;
    abortRef.current = null;
    abort?.cancel();
  };

  const toggle = useCallback(async () => {
    // 已经在连、或已经在录：这一下是结束，绝不能再开第二路（第二路会继续按时间计费）。
    if (sessionRef.current || abortRef.current || stateRef.current !== 'idle') {
      const s = sessionRef.current;
      if (!s) {
        runRef.current += 1;
        abortStart();
        committedRef.current = '';
        setState('idle');
        return;
      }
      // 尾句是停下来之后才吐回来的。这里不能先作废这一轮，否则字会被丢掉，界面就说没听到。
      abortRef.current = null;
      sessionRef.current = null;
      setState('stopping');
      try { await s.stop(); } catch { /* 收尾失败不阻塞 */ }
      const text = committedRef.current.trim();
      committedRef.current = '';
      runRef.current += 1;
      const rec = s.takeRecording();
      setState('idle');
      if (text) onVoiceMessage(text, rec);
      else onError('没听到内容，再试一次呀');
      return;
    }

    // ---- 开始 ----
    if (!isSttSupported()) { onError('当前浏览器不支持录音（需要 HTTPS + 麦克风权限）'); return; }
    const cfg = getConfig();
    if (!cfg || !cfg.engine || !((cfg.engine === 'doubao' ? cfg.volcApiKey : cfg.sfApiKey) || '').trim()) {
      onError('语音识别还没配置：到 设置 → 语音识别 选引擎、填 Key');
      return;
    }
    const run = ++runRef.current;
    const abort = createSttAbort();
    abortRef.current = abort;
    committedRef.current = '';
    setState('connecting');
    try {
      const session = await startVoiceInput(cfg, {
        onPartial: () => { /* 语音消息直达，不上屏 */ },
        onFinal: (t, emo) => {
          if (!live(run)) return;
          const line = (emo || '') + t;
          committedRef.current += (committedRef.current ? '\n' : '') + line;
        },
        onStatus: (st) => {
          if (!live(run)) return;
          if (st !== 'done' && st !== 'stopping') setState(st as VoiceInputState);
        },
        onError: (msg) => { if (live(run)) onError(msg); },
      }, abort, isFeedPaused);
      if (!live(run)) {
        try { await session.stop(); } catch { /* ignore */ }
        session.takeRecording();
        return;
      }
      abortRef.current = null;
      sessionRef.current = session;
    } catch (e: any) {
      if (abortRef.current === abort) abortRef.current = null;
      if (runRef.current !== run) return;
      sessionRef.current = null;
      setState('idle');
      if (e instanceof SttCancelled || e?.name === 'SttCancelled') return;
      onError(e?.message || '语音识别启动失败');
    }
  }, [getConfig, onVoiceMessage, onError, isFeedPaused]);

  /** 丢弃本次录音：停麦克风、不发送任何内容（LINE 式录音面板的 × 按钮） */
  const cancel = useCallback(async () => {
    runRef.current += 1;
    abortStart();
    const s = sessionRef.current;
    sessionRef.current = null;
    committedRef.current = '';
    setState('idle');
    if (s) {
      try { await s.stop(); } catch { /* ignore */ }
      s.takeRecording();
    }
  }, []);

  /** 外放语音时停喂豆包，避免把播放声当成人话按时间计费。麦克风可以还开着。 */
  const setPaused = useCallback((paused: boolean) => {
    sessionRef.current?.setPaused(paused);
  }, []);

  /** 组件卸载兜底：停录音释放麦克风（丢弃未发送的识别内容） */
  const dispose = useCallback(() => {
    runRef.current += 1;
    abortStart();
    const s = sessionRef.current;
    sessionRef.current = null;
    committedRef.current = '';
    setState('idle');
    s?.stop().catch(() => { /* ignore */ });
  }, []);

  return { state, isBusy: state !== 'idle', toggle, cancel, dispose, setPaused };
}
