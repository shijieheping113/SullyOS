// 聊天语音消息：点麦克风说话 → 再点一下停止 → 整段识别文字（逐句带情绪标注）
// 直接送进聊天成为一条语音消息，不经过输入框草稿。
// 原声录音由 volcStt 缓存，stop 后通过 onVoiceMessage 一起交给调用方（存 IndexedDB 回放）。
import { useCallback, useRef, useState } from 'react';
import { startVoiceInput, isSttSupported, type SttSession } from '../utils/volcStt';
import type { SttApiConfig } from '../types';

export type VoiceInputState = 'idle' | 'connecting' | 'recording' | 'muted' | 'stopping';

export interface VoiceRecording { wav: Blob; durationMs: number }

export interface UseVoiceInputArgs {
  getConfig: () => SttApiConfig | undefined;
  /** 点停止后整段回调：text 为逐句拼接的识别结果（每句可带情绪前缀），recording 为原声（可能为 null） */
  onVoiceMessage: (text: string, recording: VoiceRecording | null) => void;
  onError: (msg: string) => void;
}

export function useVoiceInput({ getConfig, onVoiceMessage, onError }: UseVoiceInputArgs) {
  const [state, setState] = useState<VoiceInputState>('idle');
  const sessionRef = useRef<SttSession | null>(null);
  const committedRef = useRef('');

  const toggle = useCallback(async () => {
    // ---- 停止：等服务端把尾句吐完 → 汇总整段 → 直接发语音消息 ----
    const s = sessionRef.current;
    if (s) {
      setState('stopping');
      try { await s.stop(); } catch { /* 收尾失败不阻塞 */ }
      sessionRef.current = null;
      const text = committedRef.current.trim();
      committedRef.current = '';
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
    committedRef.current = '';
    try {
      sessionRef.current = await startVoiceInput(cfg, {
        // 语音消息直达聊天：不做输入框实时上屏（按钮红点+跳动即反馈）
        onPartial: () => { /* 语音消息直达，不上屏 */ },
        onFinal: (t, emo) => {
          const line = (emo || '') + t;
          committedRef.current += (committedRef.current ? '\n' : '') + line;
        },
        onStatus: (st) => { if (st !== 'done' && st !== 'stopping') setState(st as VoiceInputState); },
        onError: (msg) => { onError(msg); },
      });
    } catch (e: any) {
      sessionRef.current = null;
      setState('idle');
      onError(e?.message || '语音识别启动失败');
    }
  }, [getConfig, onVoiceMessage, onError]);

  /** 丢弃本次录音：停麦克风、不发送任何内容（LINE 式录音面板的 × 按钮） */
  const cancel = useCallback(async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    committedRef.current = '';
    setState('idle');
    if (s) {
      try { await s.stop(); } catch { /* ignore */ }
      s.takeRecording(); // 取走丢弃，清缓存
    }
  }, []);

  /** 组件卸载兜底：停录音释放麦克风（丢弃未发送的识别内容） */
  const dispose = useCallback(() => {
    const s = sessionRef.current;
    sessionRef.current = null;
    committedRef.current = '';
    setState('idle');
    s?.stop().catch(() => { /* ignore */ });
  }, []);

  return { state, isBusy: state !== 'idle', toggle, cancel, dispose };
}
