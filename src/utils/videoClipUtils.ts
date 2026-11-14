import { TransitionType, VideoClip } from '../types';

export const DEFAULT_IMAGE_CLIP_DURATION = 5.0; // 5초 (150프레임 @ 30fps)
export const DEFAULT_TRANSITION_DURATION = 1.0; // 1초 (30프레임 @ 30fps)
export const MIN_CLIP_DURATION = 0.25;

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  none: '없음',
  'x-dissolve': 'X-Dissolve',
  push: 'Push (밀기)',
  slide: 'Slide (슬라이드)',
  'dip-to-black': 'Dip to Black',
  'dip-to-white': 'Dip to White',
  'tv-static': 'TV 지지직거림',
};

/**
 * 업로드된 영상 또는 이미지에서 실제 재생 길이와 첫 번째 프레임 섬네일을 추출합니다.
 */
export async function probeMediaClipInfo(
  url: string,
  mediaType: 'video' | 'image'
): Promise<{ sourceDuration: number; thumbnailUrl: string }> {
  if (mediaType === 'image') {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => {
      if (img.complete && img.naturalWidth > 0) resolve();
      else {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      }
    });
    const thumb = captureElementThumbnail(img, img.naturalWidth || 160, img.naturalHeight || 90);
    return { sourceDuration: DEFAULT_IMAGE_CLIP_DURATION, thumbnailUrl: thumb };
  }

  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    video.onloadeddata = () => {
      if (video.currentTime === 0) done();
      else {
        video.onseeked = done;
        video.currentTime = 0;
      }
    };
    video.onerror = done;
    setTimeout(done, 4000);
  });

  const dur =
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : DEFAULT_IMAGE_CLIP_DURATION;
  const thumb = captureElementThumbnail(
    video,
    video.videoWidth || 160,
    video.videoHeight || 90
  );
  return { sourceDuration: Number(dur.toFixed(2)), thumbnailUrl: thumb };
}

function captureElementThumbnail(
  el: CanvasImageSource,
  srcW: number,
  srcH: number
): string {
  try {
    const targetW = 128;
    const targetH = Math.max(48, Math.round((targetW * srcH) / Math.max(1, srcW)));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(el, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}

export function sortClips(clips: VideoClip[]): VideoClip[] {
  return [...clips].sort((a, b) => a.timelineStart - b.timelineStart);
}

/**
 * 특정 시점(splitTime)에서 클립을 두 개로 분할합니다.
 */
export function splitVideoClipAt(
  clips: VideoClip[],
  clipId: string,
  splitTime: number
): VideoClip[] {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;
  const target = clips[idx];
  if (
    splitTime <= target.timelineStart + MIN_CLIP_DURATION ||
    splitTime >= target.timelineEnd - MIN_CLIP_DURATION
  ) {
    return clips;
  }

  const cut = Number(splitTime.toFixed(2));
  const leftClip: VideoClip = {
    ...target,
    timelineEnd: cut,
  };
  const rightOffset = cut - target.timelineStart;
  const rightClip: VideoClip = {
    ...target,
    id: `vclip-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timelineStart: cut,
    sourceIn: target.mediaType === 'video' ? Number((target.sourceIn + rightOffset).toFixed(2)) : 0,
    transitionIn: { type: 'none', durationSec: DEFAULT_TRANSITION_DURATION },
  };

  return sortClips([...clips.slice(0, idx), leftClip, rightClip, ...clips.slice(idx + 1)]);
}

/**
 * 클립 사이의 빈 공간을 제거하고 0초부터 빈틈없이 이어 붙입니다.
 */
export function joinVideoClipsGaps(clips: VideoClip[]): VideoClip[] {
  const sorted = sortClips(clips);
  let cursor = 0;
  return sorted.map((c) => {
    const dur = Math.max(MIN_CLIP_DURATION, c.timelineEnd - c.timelineStart);
    const next: VideoClip = {
      ...c,
      timelineStart: Number(cursor.toFixed(2)),
      timelineEnd: Number((cursor + dur).toFixed(2)),
    };
    cursor += dur;
    return next;
  });
}

/**
 * 현재 재생헤드 위치에 클립을 삽입(Insert)하고 뒤쪽 클립들을 밀어냅니다.
 */
export function insertVideoClipAt(
  clips: VideoClip[],
  newClip: VideoClip,
  insertTime: number
): VideoClip[] {
  const t = Math.max(0, Number(insertTime.toFixed(2)));
  const dur = Math.max(MIN_CLIP_DURATION, newClip.timelineEnd - newClip.timelineStart);
  const placed: VideoClip = {
    ...newClip,
    timelineStart: t,
    timelineEnd: Number((t + dur).toFixed(2)),
  };

  const shifted = clips.map((c) => {
    if (c.timelineStart >= t - 0.05) {
      return {
        ...c,
        timelineStart: Number((c.timelineStart + dur).toFixed(2)),
        timelineEnd: Number((c.timelineEnd + dur).toFixed(2)),
      };
    }
    return c;
  });

  return sortClips([...shifted, placed]);
}

/**
 * 클립의 앞/뒤 경계를 드래그하여 길이를 조절(트림)합니다.
 */
export function trimVideoClipEdge(
  clips: VideoClip[],
  clipId: string,
  edge: 'start' | 'end',
  newTime: number
): VideoClip[] {
  const sorted = sortClips(clips);
  const idx = sorted.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;

  const cur = { ...sorted[idx] };
  const prevEnd = idx > 0 ? sorted[idx - 1].timelineEnd : 0;
  const nextStart = idx < sorted.length - 1 ? sorted[idx + 1].timelineStart : Infinity;

  if (edge === 'start') {
    const minStartBySource =
      cur.mediaType === 'video' ? cur.timelineStart - cur.sourceIn : 0;
    const minAllowed = Math.max(0, prevEnd, minStartBySource);
    const maxAllowed = cur.timelineEnd - MIN_CLIP_DURATION;
    const clamped = Number(Math.max(minAllowed, Math.min(maxAllowed, newTime)).toFixed(2));
    const delta = clamped - cur.timelineStart;
    cur.timelineStart = clamped;
    if (cur.mediaType === 'video') {
      cur.sourceIn = Math.max(0, Number((cur.sourceIn + delta).toFixed(2)));
    }
  } else {
    const maxEndBySource =
      cur.mediaType === 'video'
        ? cur.timelineStart + Math.max(MIN_CLIP_DURATION, cur.sourceDuration - cur.sourceIn)
        : Infinity;
    const minAllowed = cur.timelineStart + MIN_CLIP_DURATION;
    const maxAllowed = Math.min(nextStart, maxEndBySource);
    cur.timelineEnd = Number(Math.max(minAllowed, Math.min(maxAllowed, newTime)).toFixed(2));
  }

  sorted[idx] = cur;
  return sorted;
}

/**
 * 클립을 타임라인 상에서 좌우로 이동시킵니다.
 */
export function moveVideoClip(
  clips: VideoClip[],
  clipId: string,
  newStartTime: number
): VideoClip[] {
  const sorted = sortClips(clips);
  const idx = sorted.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;

  const cur = { ...sorted[idx] };
  const dur = cur.timelineEnd - cur.timelineStart;
  const minStart = idx > 0 ? sorted[idx - 1].timelineEnd : 0;
  const maxEnd = idx < sorted.length - 1 ? sorted[idx + 1].timelineStart : Infinity;
  const maxStart = Number.isFinite(maxEnd) ? maxEnd - dur : Infinity;

  let clampedStart = Math.max(minStart, Math.min(maxStart, newStartTime));
  // 인접 클립 경계(0.15초 이내) 자석 스냅
  if (Math.abs(clampedStart - minStart) < 0.15) clampedStart = minStart;
  if (Number.isFinite(maxStart) && Math.abs(clampedStart - maxStart) < 0.15) {
    clampedStart = maxStart;
  }

  cur.timelineStart = Number(clampedStart.toFixed(2));
  cur.timelineEnd = Number((clampedStart + dur).toFixed(2));
  sorted[idx] = cur;
  return sorted;
}
