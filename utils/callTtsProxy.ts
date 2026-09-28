// 电话语音「字幕精确对位」用的中转地址（**只给电话用，别的都不看它**）。
//
// 背景：鱼声的「带时间戳」接口在 /v1/tts/stream/with-timestamp，**作者的公共 worker
// ��没有开这扇门**（worker/index.js 的 /fishaudio/tts 硬编码打到老的 /v1/tts）。
// 所以想让电话用上真时间轴，得由用户指定一台**自己**的中转。
//
// 设计照抄 utils/proxyWorker.ts 里网易云音乐那套做法：**留空 = 完全不启用**，
// 行为与没这个功能时一模一样；填了也只有电话这一处会走它 ——
// 搜索 / 小红书 / 备份 / 聊天语音 / 约会语音全部照旧走作者的公共 worker。

const CALL_TS_PROXY_KEY = 'sully-call-tts-timestamp-proxy-v1';

export const normalizeCallTtsProxy = (raw: unknown): string => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
};

export const loadCallTtsTimestampProxy = (): string => {
  try {
    return normalizeCallTtsProxy(localStorage.getItem(CALL_TS_PROXY_KEY));
  } catch {
    return '';
  }
};

export const saveCallTtsTimestampProxy = (raw: string): string => {
  const value = normalizeCallTtsProxy(raw);
  try {
    if (value) localStorage.setItem(CALL_TS_PROXY_KEY, value);
    else localStorage.removeItem(CALL_TS_PROXY_KEY);
  } catch {
    // Safari 隐私模式 / 内嵌 WebView 可能拒绝写入：忽略，视为未配置。
  }
  return value;
};

/** 当前是否配了中转。CallApp 决定「走时间轴」还是「走原估算」时读它。 */
export const getCallTtsTimestampProxy = (): string => loadCallTtsTimestampProxy();
