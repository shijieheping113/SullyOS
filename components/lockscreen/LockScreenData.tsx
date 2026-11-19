import { useEffect, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { useMusic } from '../../context/MusicContext';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { getBlobForRef, isBlobRef } from '../../utils/blobRef';
import { loadBlobRefUrl } from '../../utils/blobRefSessionCache';
import { chatCharacterDisplayName } from '../../utils/characterRemark';
import { chatPreviewText } from '../../utils/chatMessageVisibility';
import { readChatUnread } from '../../utils/chatUnread';
import { compareChatMessages } from '../../utils/chatMessageOrder';
import { RealtimeContextManager } from '../../utils/realtimeContext';
import type { RealtimeConfig } from '../../utils/realtimeContext';
import type { WeatherData } from '../../utils/realtimeWorldCore';
import type { CharacterProfile } from '../../types';
import { LOCK_SCREEN_FOREGROUND } from './lockScreenSettings';
import type { LockScreenMotion } from './lockScreenMotion';
import type { LockNotice, LockPlayerControls } from './lockScreenMedia';
import { LOCK_NOTICE_PREVIEW_LIMIT } from './lockScreenMedia';

export function useLockForeground(enabled: boolean) {
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let objectUrl = '';
    void DB.getAsset(LOCK_SCREEN_FOREGROUND)
      .then(ref => ref ? getBlobForRef(ref) : null)
      .then(blob => {
        if (!active || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled]);
  return { url, ready: !enabled || loaded };
}

type MotionRef = RefObject<LockScreenMotion | null>;
type LockWeatherSnapshot = Pick<WeatherData, 'temp' | 'description' | 'icon'>;
const LOCK_WEATHER_CACHE = 'sully-lock-weather-v1';
const MAX_LOCK_WEATHER_AGE = 3 * 60 * 60000;

export function paintCachedLockWeather(motion: LockScreenMotion, config: RealtimeConfig) {
  let weather: LockWeatherSnapshot | undefined;
  if (config.weatherEnabled && config.weatherCity?.trim()) {
    try {
      const cache = JSON.parse(localStorage.getItem(LOCK_WEATHER_CACHE) || 'null');
      const age = Date.now() - cache?.at;
      if (cache?.city === config.weatherCity.trim() && age >= 0 && age < MAX_LOCK_WEATHER_AGE
          && Number.isFinite(cache.weather?.temp) && typeof cache.weather.description === 'string'
          && typeof cache.weather.icon === 'string') weather = cache.weather;
    } catch {}
  }
  paintLockWeather(motion, weather);
}

function paintLockWeather(motion: LockScreenMotion, weather?: LockWeatherSnapshot) {
  if (!weather) { motion.setWeather(''); return; }
  motion.setWeather(Math.round(weather.temp) + '°' + (weather.description ? ' · ' + weather.description : ''),
    weather.description === '未知' ? undefined : weather.icon);
}

function LockMusic({ motion, controls, sample }: { motion: MotionRef; controls: MutableRefObject<LockPlayerControls | null>; sample: boolean }) {
  const { current, queue, playing, progress, duration, togglePlay, prevSong, nextSong, seek, lyric, activeLyricIdx } = useMusic();
  const [loadedArt, setLoadedArt] = useState<{ ref: string; url: string }>();
  const cover = current?.albumPic || '';
  const canSkip = queue.length > 1;
  useEffect(() => {
    if (!isBlobRef(cover)) return;
    let active = true;
    void loadBlobRefUrl(cover).then(url => { if (active && url) setLoadedArt({ ref: cover, url }); });
    return () => { active = false; };
  }, [cover]);
  const line = lyric[activeLyricIdx]?.text.trim() || '';
  useEffect(() => {
    controls.current = { toggle: togglePlay, prev: prevSong, next: nextSong, seek };
    return () => { controls.current = null; };
  }, [controls, togglePlay, prevSong, nextSong, seek]);
  useEffect(() => {
    const source = isBlobRef(cover) ? loadedArt?.ref === cover ? loadedArt.url : '' : cover;
    const art = source
      ? 'url(' + JSON.stringify(source.replace(/^http:\/\//i, 'https://')) + ')'
      : current?.localCoverStyle || '';
    const seekable = Number.isFinite(duration) && duration > 0;
    motion.current?.setPlayer(current ? {
      id: current.id,
      title: current.name,
      artist: current.artists,
      art,
      lyric: line,
      playing,
      progress: Number.isFinite(progress) && progress > 0 ? progress : 0,
      duration: seekable ? duration : current.duration || 0,
      seekable,
      canSkip,
    } : sample ? {
      id: 0, title: '音乐卡片预览', artist: '', art: '', lyric: '', playing: false,
      progress: 36, duration: 126, seekable: false, canSkip: false,
    } : null);
  }, [motion, current, playing, progress, duration, line, canSkip, cover, loadedArt, sample]);
  return null;
}

async function readLockNotices(char: CharacterProfile) {
  const { previews } = await readChatUnread(char.id, LOCK_NOTICE_PREVIEW_LIMIT);
  return previews.filter(message => Number.isFinite(new Date(message.timestamp).getTime())
    && !message.metadata?.activeMsg2 && message.metadata?.source !== 'active_msg_2')
    .map(message => ({ char, message }));
}

function lockNoticeAvatar(avatar: string) {
  return isBlobRef(avatar) ? loadBlobRefUrl(avatar).then(url => url || '')
    : Promise.resolve(/^(https?:|blob:|data:image\/|\.?\/)/i.test(avatar) ? avatar : '');
}

function LockUnread({ motion }: { motion: MotionRef }) {
  const { characters, unreadMessages } = useOS();
  useEffect(() => {
    let active = true;
    const unreadCharacters = characters.filter(char => unreadMessages[char.id] > 0);
    if (!unreadCharacters.length) {
      motion.current?.setNotice(null);
      return;
    }

    void Promise.all(unreadCharacters.map(readLockNotices)).then(groups => {
      if (!active) return;
      const candidates = groups.flat().sort((a, b) => compareChatMessages(a.message, b.message))
        .slice(-LOCK_NOTICE_PREVIEW_LIMIT);
      if (!candidates.length) {
        motion.current?.setNotice(null);
        return;
      }
      const count = groups.reduce((total, group, index) => total + (group.length ? unreadMessages[unreadCharacters[index].id] : 0), 0);
      const notices: LockNotice[] = candidates.map(({ char, message }) => ({
        key: char.id + ':' + message.id, charId: char.id,
        name: chatCharacterDisplayName(char) || char.name, avatar: '',
        text: String(message.metadata?.peekText || message.metadata?.requestText || chatPreviewText(message)).replace(/\s+/g, ' ').slice(0, 160),
        timestamp: message.timestamp, count,
      }));
      motion.current?.setNotices(notices, count);
      const avatars = new Map<string, Promise<string>>();
      candidates.forEach(({ char }) => {
        if (!avatars.has(char.id)) avatars.set(char.id, lockNoticeAvatar(char.avatar || ''));
      });
      void Promise.all(notices.map(async notice => ({ ...notice, avatar: await avatars.get(notice.charId)! })))
        .then(resolved => { if (active) motion.current?.setNotices(resolved, count); }).catch(() => {});
    }).catch(() => {});

    return () => { active = false; };
  }, [characters, unreadMessages, motion]);
  return null;
}

function LockWeather({ motion }: { motion: MotionRef }) {
  const { realtimeConfig } = useOS();
  useEffect(() => {
    let active = true;
    let pending = false;
    if (motion.current) paintCachedLockWeather(motion.current, realtimeConfig);
    if (!realtimeConfig.weatherEnabled || !realtimeConfig.weatherCity?.trim()) return;
    const refresh = () => {
      if (document.hidden || pending) return;
      pending = true;
      void RealtimeContextManager.fetchWeather(realtimeConfig).then(weather => {
        if (active && weather && Number.isFinite(weather.temp)) {
          const { temp, description, icon } = weather;
          const snapshot = { temp, description, icon };
          try {
            localStorage.setItem(LOCK_WEATHER_CACHE, JSON.stringify({ city: realtimeConfig.weatherCity.trim(), at: Date.now(), weather: snapshot }));
          } catch {}
          if (motion.current) paintLockWeather(motion.current, snapshot);
        }
      }).catch(() => {}).finally(() => { pending = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, Math.max(5, realtimeConfig.cacheMinutes || 30) * 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [motion, realtimeConfig]);
  return null;
}

export function LockScreenData({ motion, controls, preview, glassRegion }: {
  motion: MotionRef;
  controls: MutableRefObject<LockPlayerControls | null>;
  preview: boolean;
  glassRegion?: string;
}) {
  useEffect(() => {
    if (!preview) return;
    motion.current?.setNotice(glassRegion === 'notice' ? {
      key: 'glass-preview', charId: '', name: '消息卡片预览', text: '拖动拉杆查看玻璃效果',
      avatar: '', timestamp: Date.now(), count: 1,
    } : null);
  }, [motion, preview, glassRegion]);
  return (
    <>
      <LockMusic motion={motion} controls={controls} sample={glassRegion === 'player'} />
      <LockWeather motion={motion} />
      {!preview && <LockUnread motion={motion} />}
    </>
  );
}
