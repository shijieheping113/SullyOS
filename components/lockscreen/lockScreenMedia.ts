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

export const LOCK_NOTICE_PREVIEW_LIMIT = 8;
const NOTICE_MOTION = {
  enter: 580, hold: 420, retire: 220, fade: 140, exit: 160,
  distance: 20, startScale: .96, overshoot: 1.5,
  ease: 'cubic-bezier(.32,.72,0,1)',
};

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
  let pending: LockNotice[] = [];
  let unreadCount = 0;
  let queue: LockNotice[] = [];
  let seen = new Set<string>();
  let sequenceTimer = 0;
  let disposed = false;
  let visible: LockNotice | null = null;
  let animation: Animation | undefined;
  let departing: HTMLElement | undefined;
  let departureAnimation: Animation | undefined;

  function stopSequence() {
    window.clearTimeout(sequenceTimer);
    sequenceTimer = 0;
  }

  function removeDeparting() {
    departureAnimation?.cancel();
    departureAnimation = undefined;
    departing?.remove();
    departing = undefined;
  }

  function pauseNotice() {
    stopSequence();
    animation?.cancel();
    animation = undefined;
    removeDeparting();
    if (!visible) { notice.hidden = true; stack.hidden = true; }
  }

  function retireVisible() {
    removeDeparting();
    if (!visible || notice.hidden || typeof notice.animate !== 'function') return;
    const current = getComputedStyle(notice);
    const opacity = current.opacity;
    const transform = current.transform;
    const clone = notice.cloneNode(true) as HTMLElement;
    if (typeof clone.animate !== 'function') return;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    clone.dataset.noticeDeparting = '';
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    clone.tabIndex = -1;
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '2';
    notice.before(clone);
    departing = clone;
    departureAnimation = clone.animate([
      { opacity, transform },
      { opacity: 0, transform: 'translateY(6px) scale(.96)' },
    ], { duration: NOTICE_MOTION.retire, easing: NOTICE_MOTION.ease });
    departureAnimation.onfinish = () => { if (departing === clone) removeDeparting(); };
  }

  function paintNotice(next: LockNotice, animate = false) {
    const changed = visible?.key !== next.key;
    if (changed && animate && !options.reducedMotion()) retireVisible();
    visible = next;
    notice.dataset.noticeKey = next.key;
    setText(name, next.name);
    setText(text, next.text);
    setText(stamp, clock.format(next.timestamp));
    setText(initial, Array.from(next.name)[0] || '•');
    count.hidden = unreadCount < 2;
    // The badge always reports the real unread total. Only the decorative stack
    // grows as the incoming cards land; playing an animation never marks a read.
    const stacked = queue.length ? unreadCount - pending.length + seen.size : unreadCount;
    stack.hidden = stacked < 2;
    stack.dataset.layers = String(Math.min(2, Math.max(0, stacked - 1)));
    setText(count, unreadCount + ' 条未读');
    if (avatar.getAttribute('src') !== next.avatar) {
      avatar.hidden = true;
      if (next.avatar) avatar.src = next.avatar;
      else avatar.removeAttribute('src');
    }
    notice.tabIndex = 0;
    notice.removeAttribute('aria-hidden');
    notice.style.pointerEvents = '';
    notice.hidden = false;
    if (!changed || !animate || typeof notice.animate !== 'function') return;
    animation?.cancel();
    const fadeOnly = options.reducedMotion();
    const opacity = 'var(--glass-alpha, 1)';
    const frames = fadeOnly ? [{ opacity: 0 }, { opacity }] : [
      { opacity: 0, transform: 'translateY(' + NOTICE_MOTION.distance + 'px) scale(' + NOTICE_MOTION.startScale + ')' },
      { opacity, transform: 'translateY(-' + NOTICE_MOTION.overshoot + 'px) scale(1)', offset: .76 },
      { opacity, transform: 'translateY(0) scale(1)' },
    ];
    animation = notice.animate(frames, {
      duration: fadeOnly ? NOTICE_MOTION.fade : NOTICE_MOTION.enter, easing: NOTICE_MOTION.ease,
    });
  }

  function flushNotice() {
    if (disposed || moving || !options.atRest() || document.visibilityState === 'hidden') return;
    if (!pending.length) {
      stopSequence();
      removeDeparting();
      if (!visible) return;
      visible = null;
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
      animation = notice.animate([{ opacity }, { opacity: 0 }], { duration: NOTICE_MOTION.exit, easing: 'ease-out', fill: 'forwards' });
      animation.onfinish = () => { if (!visible) notice.hidden = true; };
      return;
    }
    if (options.reducedMotion() || typeof notice.animate !== 'function') {
      stopSequence();
      removeDeparting();
      pending.forEach(item => seen.add(item.key));
      queue = [];
      paintNotice(pending[pending.length - 1], true);
      return;
    }
    const updated = pending.find(item => item.key === visible?.key);
    if (updated) paintNotice(updated);
    if (sequenceTimer) return;
    const next = queue.shift();
    if (!next) {
      if (!updated) paintNotice(pending[pending.length - 1]);
      return;
    }
    seen.add(next.key);
    paintNotice(next, true);
    // Let each card settle and remain readable before the next arrival, including
    // messages appended mid-animation. Backlogs use the same pace throughout.
    const gap = NOTICE_MOTION.enter + NOTICE_MOTION.hold;
    sequenceTimer = window.setTimeout(() => { sequenceTimer = 0; flushNotice(); }, gap);
  }

  function setNotices(notices: LockNotice[], total: number) {
    if (disposed) return;
    const unique = new Map(notices.map(item => [item.key, item]));
    pending = Array.from(unique.values()).slice(-LOCK_NOTICE_PREVIEW_LIMIT);
    unreadCount = Math.max(0, total);
    seen = new Set(Array.from(seen).filter(key => unique.has(key)));
    queue = pending.filter(item => !seen.has(item.key));
    if (!pending.length) { seen.clear(); stopSequence(); }
    if (moving || !options.atRest() || document.visibilityState === 'hidden') pauseNotice();
    flushNotice();
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') pauseNotice();
    else flushNotice();
  };
  document.addEventListener('visibilitychange', onVisibility);

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
      if (value) pauseNotice();
      controls.classList.toggle('lock-moving', value);
      if (!value && deferredSong !== undefined) {
        const next = deferredSong;
        deferredSong = undefined;
        setPlayer(next);
      }
      if (!value) flushNotice();
    },
    musicFraction,
    setNotice(next: LockNotice | null) { setNotices(next ? [next] : [], next?.count || 0); },
    setNotices,
    flushNotice,
    noticeTarget: () => visible?.charId,
    dispose() {
      disposed = true;
      pauseNotice();
      queue = [];
      document.removeEventListener('visibilitychange', onVisibility);
      titleObserver?.disconnect();
      cancelAnimationFrame(titleFrame);
    },
  };
}
