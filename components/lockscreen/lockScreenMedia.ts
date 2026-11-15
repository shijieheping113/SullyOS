export interface LockSong {
  id: number;
  title: string;
  artist: string;
  art: string;
  lyric: string;
  playing: boolean;
  progress: number;
  duration: number;
  seekable: boolean;
  canSkip?: boolean;
}

export interface LockNotice {
  key: string;
  charId: string;
  name: string;
  avatar: string;
  text: string;
  timestamp: number;
  count: number;
}

export interface LockPlayerControls {
  toggle(): void;
  prev(): void;
  next(): void;
  seek(fraction: number): void;
}

interface MediaOptions {
  player?: LockPlayerControls;
  canUsePlayer?(): boolean;
  atRest(): boolean;
  reducedMotion(): boolean;
  openNotice(charId: string): void;
  updateMusicRing(): void;
}

function timeText(value: number) {
  const seconds = Math.floor(Math.max(0, value));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function setText(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

export function bindLockScreenMedia(root: HTMLElement, options: MediaOptions) {
  const byId = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const controls = byId('lockControls');
  const player = byId('player');
  const previousTrack = byId<HTMLButtonElement>('playerPrev');
  const nextTrack = byId<HTMLButtonElement>('playerNext');
  const toggle = byId('playerToggle');
  const seek = byId<HTMLInputElement>('playerSeek');
  const cover = byId('cover');
  const titleWindow = byId('trackTitle');
  const title = byId('trackTitleText');
  const lyric = byId('playerLyric');
  const elapsed = byId('elapsed');
  const remaining = byId('remaining');
  const played = byId('played');
  const shape = root.querySelector('#playShape')!;
  const playPath = shape.getAttribute('d')!;
  const pausePath = 'M5 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1m10 0h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1';
  const canUsePlayer = options.canUsePlayer ?? options.atRest;
  let song: LockSong | null = null;
  let moving = false;
  let deferredSong: LockSong | null | undefined;
  let scrubbing = false;
  let displayedSeconds = 0;
  let seekTarget: number | null = null;
  let titleFrame = 0;

  const measureTitle = () => {
    const overflow = title.scrollWidth - titleWindow.clientWidth;
    if (overflow < 2 || !titleWindow.clientWidth) {
      title.classList.remove('track-overflow');
      return;
    }
    title.style.setProperty('--title-travel', -overflow + 'px');
    title.style.setProperty('--title-time', Math.max(4, overflow / 24 + 2) + 's');
    title.classList.add('track-overflow');
  };
  const titleObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureTitle) : undefined;
  titleObserver?.observe(titleWindow);
  titleObserver?.observe(title);

  function musicFraction() {
    return song?.duration ? Math.max(0, Math.min(1, displayedSeconds / song.duration)) : 0;
  }

  function paintProgress(seconds: number, updateInput = true) {
    displayedSeconds = seconds;
    const duration = song?.duration || 0;
    const fraction = musicFraction();
    played.style.width = fraction * 100 + '%';
    setText(elapsed, timeText(seconds));
    setText(remaining, '−' + timeText(duration - seconds));
    if (updateInput) seek.value = String(Math.round(fraction * 1000));
    seek.setAttribute('aria-valuetext', timeText(seconds) + ' / ' + timeText(duration));
    options.updateMusicRing();
  }

  function setPlayer(next: LockSong | null) {
    if (moving) { deferredSong = next; return; }
    const previous = song;
    song = next;
    if (previous?.id !== next?.id) { scrubbing = false; seekTarget = null; }
    player.hidden = !next;
    controls.classList.toggle('has-player', !!next);
    if (!next) {
      if (previous) paintProgress(0);
      return;
    }
    if (previous?.art !== next.art) cover.style.backgroundImage = next.art;
    const titleText = next.artist ? next.title + ' — ' + next.artist : next.title;
    if (title.textContent !== titleText) {
      title.classList.remove('track-overflow');
      title.textContent = titleText;
      cancelAnimationFrame(titleFrame);
      titleFrame = requestAnimationFrame(measureTitle);
    }
    setText(lyric, next.lyric);
    previousTrack.disabled = next.canSkip === false;
    nextTrack.disabled = next.canSkip === false;
    if (previous?.playing !== next.playing) {
      toggle.setAttribute('aria-label', next.playing ? '暂停' : '播放');
      shape.setAttribute('d', next.playing ? pausePath : playPath);
      player.classList.toggle('playing', next.playing);
    }
    seek.disabled = !next.seekable;
    if (previous?.progress !== next.progress) seekTarget = null;
    if (!scrubbing) paintProgress(seekTarget ?? next.progress);
  }

  seek.onpointerdown = () => { scrubbing = true; };
  seek.onpointerup = () => { scrubbing = false; };
  seek.onpointercancel = () => { scrubbing = false; paintProgress(song?.progress || 0); };
  seek.oninput = () => {
    if (song) paintProgress(song.duration * Number(seek.value) / 1000, false);
  };
  seek.onchange = () => {
    if (!canUsePlayer() || !song?.seekable) return;
    const fraction = Number(seek.value) / 1000;
    seekTarget = song.duration * fraction;
    paintProgress(seekTarget);
    options.player?.seek(fraction);
  };
  toggle.onclick = () => { if (canUsePlayer()) options.player?.toggle(); };
  previousTrack.onclick = () => { if (canUsePlayer()) options.player?.prev(); };
  nextTrack.onclick = () => { if (canUsePlayer()) options.player?.next(); };

  const notice = byId('notice');
  const stack = byId('noticeStack');
  const avatar = byId<HTMLImageElement>('noticeAvatar');
  const initial = byId('noticeInitial');
  const name = byId('noticeName');
  const text = byId('noticeText');
  const stamp = byId('noticeStamp');
  const count = byId('noticeCount');
  const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  let pending: LockNotice | null = null;
  let visible: LockNotice | null = null;
  let animation: Animation | undefined;

  function flushNotice() {
    if (!options.atRest()) return;
    if (pending === visible) return;
    const previous = visible;
    const next = pending;
    visible = next;
    if (!next) {
      stack.hidden = true;
      const opacity = getComputedStyle(notice).opacity;
      notice.tabIndex = -1;
      notice.setAttribute('aria-hidden', 'true');
      notice.style.pointerEvents = 'none';
      animation?.cancel();
      if (typeof notice.animate !== 'function') {
        notice.hidden = true;
        return;
      }
      animation = notice.animate([{ opacity }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      animation.onfinish = () => { if (!visible) notice.hidden = true; };
      return;
    }
    setText(name, next.name);
    setText(text, next.text);
    setText(stamp, clock.format(next.timestamp));
    setText(initial, Array.from(next.name)[0] || '•');
    count.hidden = next.count < 2;
    stack.hidden = next.count < 2;
    stack.dataset.layers = String(Math.min(2, next.count - 1));
    setText(count, next.count + ' 条未读');
    if (avatar.getAttribute('src') !== next.avatar) {
      avatar.hidden = true;
      if (next.avatar) avatar.src = next.avatar;
      else avatar.removeAttribute('src');
    }
    notice.tabIndex = 0;
    notice.removeAttribute('aria-hidden');
    notice.style.pointerEvents = '';
    notice.hidden = false;
    if (previous?.key === next.key || typeof notice.animate !== 'function') return;
    animation?.cancel();
    const fadeOnly = options.reducedMotion();
    const opacity = 'var(--glass-alpha, 1)';
    const frames = fadeOnly ? [{ opacity: 0 }, { opacity }] : [
      { opacity: 0, transform: 'translateY(14px) scale(.96)' },
      { opacity, transform: 'translateY(-1px) scale(1)', offset: .76 },
      { opacity, transform: 'translateY(0) scale(1)' },
    ];
    animation = notice.animate(frames, { duration: fadeOnly ? 140 : 300, easing: 'cubic-bezier(.2,.75,.25,1)' });
  }

  avatar.onload = () => { avatar.hidden = false; };
  avatar.onerror = () => { avatar.hidden = true; };
  notice.onclick = event => {
    if (event.detail === 0 && options.atRest() && visible) options.openNotice(visible.charId);
  };

  return {
    setPlayer,
    setMoving(value: boolean) {
      if (moving === value) return;
      moving = value;
      controls.classList.toggle('lock-moving', value);
      if (!value && deferredSong !== undefined) {
        const next = deferredSong;
        deferredSong = undefined;
        setPlayer(next);
      }
    },
    musicFraction,
    setNotice(next: LockNotice | null) { pending = next; flushNotice(); },
    flushNotice,
    noticeTarget: () => visible?.charId,
    dispose() {
      animation?.cancel();
      titleObserver?.disconnect();
      cancelAnimationFrame(titleFrame);
    },
  };
}
