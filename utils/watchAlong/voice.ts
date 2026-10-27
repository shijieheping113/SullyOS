/**
 * 陪看的语音。
 *
 * 语言、演出标记、合成，走主聊天同一套：
 * `chatVoiceLang` → `translateVoiceLangText` + `languageBoost`，
 * 显示用 `stripTtsMarkupForDisplay` / `stripFishCuesForDisplay` 把标记从字上拿掉，
 * 交给合成的仍是清洗后、带演出标记的那一版。
 *
 * 没开角色上的「收到就自动播放」时，只留语音条，点一下才合成。
 * 开了就自己合成并念出来。录音存在本机，刷新还在；换设备会丢。
 */

import { inferChatVoiceEmotionFromSpoken } from '../chatVoiceTagFormat';
import { stripFishCuesForDisplay } from '../fishAudioTts';
import { parseVoiceOutput } from '../minimaxTts';
import {
  cleanTextForTtsProvider,
  providerUsesRawVoiceMarkup,
  stripTtsMarkupForDisplay,
  synthesizeSpeechDetailed,
} from '../ttsRouter';
import {
  applyLongpressTranslateResult,
  buildVoiceLangTranslateSystemPrompt,
  translateVoiceLangText,
} from '../voiceLangTranslate';
import {
  downloadVoiceAudioUrl,
  forgetLiveBeatVoices,
  loadLiveBeatVoiceAsset,
  saveLiveBeatVoiceAsset,
} from '../liveStreamStorage';
import type { APIConfig, CharacterProfile } from '../../types';

/** 这条是不是语音条：加号里开了语音、已经合成过，或正文里带着主聊天的 <语音> */
export function watchLineIsVoice(text: string | undefined, flags: { wantVoice?: boolean; voiceId?: string }): boolean {
  if (flags.wantVoice || flags.voiceId) return true;
  return parseVoiceOutput(text || '').hasVoiceTag;
}

/** 给界面看的字：演出标记拿掉，跟主聊天气泡 / 转文字同一套清洗 */
export function shownWatchText(text: string | undefined, apiConfig: APIConfig): string {
  const raw = text || '';
  const parsed = parseVoiceOutput(raw);
  const base = parsed.hasVoiceTag
    ? [parsed.display, parsed.subtitle].filter(Boolean).join('\n') || parsed.speech
    : raw;
  return stripFishCuesForDisplay(stripTtsMarkupForDisplay(base, apiConfig))
    .replace(/<\s*\/?\s*[^<>\s]{1,12}\s*>/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

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

/**
 * 现合成一条。语种跟主聊天一样读角色的 `chatVoiceLang`：
 * 有语种就先用主聊天那条翻译路把要念的字翻过去，再交给 `synthesizeSpeechDetailed`，
 * `languageBoost` 用同一个值。
 */
export async function synthesizeWatchVoice(opts: {
  key: string;
  text: string;
  char: CharacterProfile;
  apiConfig: APIConfig;
  emotion?: string;
}): Promise<string> {
  const voiceLang = (opts.char.chatVoiceLang || '').trim();
  const preserveRawMarkup = providerUsesRawVoiceMarkup(opts.apiConfig);
  const parsed = parseVoiceOutput(opts.text || '');
  let spokenText = '';
  let emotion = opts.emotion;

  if (parsed.hasVoiceTag) {
    spokenText = preserveRawMarkup ? parsed.rawSpeech : parsed.speech;
    if (!emotion && parsed.emotion) emotion = parsed.emotion;
  } else {
    spokenText = cleanTextForTtsProvider(opts.text || '', opts.apiConfig);
    if (voiceLang && spokenText.trim()) {
      const originalText = stripTtsMarkupForDisplay(spokenText, opts.apiConfig) || spokenText;
      try {
        const translated = await translateVoiceLangText({
          apiConfig: opts.apiConfig,
          systemPrompt: buildVoiceLangTranslateSystemPrompt(voiceLang, { apiConfig: opts.apiConfig }),
          text: originalText,
          purpose: 'chat-manual-voice-translate',
          charId: opts.char.id,
          retryMainOnce: true,
        });
        if (translated) {
          const applied = applyLongpressTranslateResult(translated, { preserveRawMarkup });
          if (applied.spokenText) {
            spokenText = applied.spokenText;
            const tagEmotion = applied.voiceEmotion || inferChatVoiceEmotionFromSpoken(spokenText);
            if (tagEmotion) emotion = tagEmotion;
          }
        }
      } catch {
        /* 翻译没成就按原文念，语种提示仍走 languageBoost */
      }
    }
  }

  spokenText = spokenText.trim();
  if (!spokenText) throw new Error('这条没内容可念');
  const { url, blob } = await synthesizeSpeechDetailed(spokenText, opts.char, opts.apiConfig, {
    emotion,
    languageBoost: voiceLang || undefined,
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
