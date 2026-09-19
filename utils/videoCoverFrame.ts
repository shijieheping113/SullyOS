/** 从本地视频 File 抽一帧 JPEG data URL（仅封面，不做视频理解）。 */
function frameBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const sampleW = Math.min(32, w);
  const sampleH = Math.min(32, h);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return pixels > 0 ? sum / pixels : 0;
}

function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('视频封面定位失败'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      video.currentTime = time;
    } catch {
      onError();
    }
  });
}

function waitVideoEvent(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
      reject(new Error('视频封面读取失败'));
    };
    video.addEventListener(event, onOk);
    video.addEventListener('error', onErr);
  });
}

function buildSeekCandidates(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const raw = [0.08, duration * 0.25, duration * 0.5, duration - 0.15, 0];
  const uniq = new Set<number>();
  for (const t of raw) {
    const clamped = Math.max(0, Math.min(duration > 0.05 ? duration - 0.01 : 0, t));
    uniq.add(Number(clamped.toFixed(3)));
  }
  return [...uniq];
}

export async function extractVideoCoverDataUrl(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    await waitVideoEvent(video, 'loadeddata');

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;

    try {
      await video.play();
      video.pause();
    } catch {
      /* 部分环境禁止 play，仍尝试 seek */
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const candidates = buildSeekCandidates(duration);
    let bestUrl: string | null = null;
    let bestBrightness = -1;

    for (const seekTo of candidates) {
      try {
        await seekVideoTo(video, seekTo);
      } catch {
        continue;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const brightness = frameBrightness(ctx, w, h);
      const url = canvas.toDataURL('image/jpeg', 0.85);
      if (brightness > bestBrightness) {
        bestBrightness = brightness;
        bestUrl = url;
      }
      if (brightness >= 18) return url;
    }

    return bestUrl;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function readVideoDurationSec(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = objectUrl;
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(d) ? d : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('无法读取视频时长'));
    };
  });
}
