/**
 * 陪看的语音。
 *
 * 照喵喵盒那套：默认**只留一条语音，点一下才去合成、合成完直接响**，
 * 不是收到就自动念。合成出来的录音本体存进本机资料库（钥匙就是这条消息 id /
 * 这一拍 id），所以刷新、关浏览器回来还点得响；换设备会丢，这是正常的。
 *
 * 两条会出声的地方：
 * 1. 私聊里角色发的语音条 / 长按「转语音」把一条文字变成语音；
 * 2. 连麦席上角色在麦上说的那句——**只有角色出声**，我在麦上说的是纯文字。
 */

import { cleanTextForTtsProvider, synthesizeSpeechDetailed } from '../ttsRouter';
import {
  downloadVoiceAudioUrl,
  forgetLiveBeatVoices,
  loadLiveBeatVoiceAsset,
  saveLiveBeatVoiceAsset,
} from '../liveStreamStorage';
import type { APIConfig, CharacterProfile } from '../../types';

/** 这条语音现在能不能播：本机存过就直接播，没存过才去合成 */
export async function loadWatchVoiceUrl(key: string): Promise<string | null> {
  const asset = await loadLiveBeatVoiceAsset(key);
  if (!asset) return null;
  try {
    return URL.createObjectURL(asset.blob);
  } catch {
    return null;
  }
}

/** 现合成一条，并把录音本体存起来（同一条重合成会覆盖旧的那版） */
export async function synthesizeWatchVoice(opts: {
  key: string;
  text: string;
  char: CharacterProfile;
  apiConfig: APIConfig;
  emotion?: string;
}): Promise<string> {
  const spoken =
    cleanTextForTtsProvider(opts.text, opts.apiConfig).trim() || opts.text.trim();
  if (!spoken) throw new Error('这条没内容可念');
  const { url, blob } = await synthesizeSpeechDetailed(spoken, opts.char, opts.apiConfig, {
    emotion: opts.emotion,
    languageBoost: opts.char.chatVoiceLang || undefined,
    groupId: opts.apiConfig.minimaxGroupId || undefined,
    skipCache: true,
  });
  if (blob) await saveLiveBeatVoiceAsset(opts.key, blob);
  return url;
}

/** 这条语音有没有存过录音 */
export async function hasWatchVoice(key: string): Promise<boolean> {
  return Boolean(await loadLiveBeatVoiceAsset(key));
}

/** 删场次时把该场的录音一起清掉 */
export async function forgetWatchVoices(keys: string[]): Promise<void> {
  await forgetLiveBeatVoices(keys.filter(Boolean));
}

/** 长按菜单里的「语音下载」：存下来的优先，没存过就先合一次 */
export async function downloadWatchVoice(opts: {
  key: string;
  text: string;
  char: CharacterProfile;
  apiConfig: APIConfig;
  name: string;
}): Promise<void> {
  const asset = await loadLiveBeatVoiceAsset(opts.key);
  if (asset) {
    const url = URL.createObjectURL(asset.blob);
    await downloadVoiceAudioUrl(url, opts.name);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const url = await synthesizeWatchVoice({
    key: opts.key,
    text: opts.text,
    char: opts.char,
    apiConfig: opts.apiConfig,
  });
  await downloadVoiceAudioUrl(url, opts.name);
}
