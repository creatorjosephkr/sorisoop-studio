import { TextTransitionType, TransitionType, VideoClip } from '../types';

export const DEFAULT_IMAGE_CLIP_DURATION = 5.0; // 5초 (150프레임 @ 30fps)
export const DEFAULT_TRANSITION_DURATION = 1.0; // 1초 (30프레임 @ 30fps)
export const DEFAULT_TEXT_TRANSITION_DURATION = 0.5; // 0.5초 (15프레임 @ 30fps)
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

export const TEXT_TRANSITION_LABELS: Record<TextTransitionType, string> = {
  none: '없음',
  fade: '페이드 (Fade)',
  'slide-up': '위로 슬라이드',
  'slide-down': '아래로 슬라이드',
  'slide-left': '왼쪽 슬라이드',
  'slide-right': '오른쪽 슬라이드',
  zoom: '확대/축소 (Zoom)',
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
  const rightOffset = (cut - target.timelineStart) * (target.playbackRate ?? 1);
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
  const rate =
    cur.mediaType === 'video' ? Math.max(0.25, Math.min(4, cur.playbackRate ?? 1)) : 1;
  const prevEnd = idx > 0 ? sorted[idx - 1].timelineEnd : 0;
  const nextStart = idx < sorted.length - 1 ? sorted[idx + 1].timelineStart : Infinity;

  if (edge === 'start') {
    const minStartBySource =
      cur.mediaType === 'video' ? cur.timelineStart - cur.sourceIn / rate : 0;
    const minAllowed = Math.max(0, prevEnd, minStartBySource);
    const maxAllowed = cur.timelineEnd - MIN_CLIP_DURATION;
    const clamped = Number(Math.max(minAllowed, Math.min(maxAllowed, newTime)).toFixed(2));
    const delta = clamped - cur.timelineStart;
    cur.timelineStart = clamped;
    if (cur.mediaType === 'video') {
      cur.sourceIn = Math.max(0, Number((cur.sourceIn + delta * rate).toFixed(2)));
    }
  } else {
    const maxEndBySource =
      cur.mediaType === 'video'
        ? cur.timelineStart + Math.max(MIN_CLIP_DURATION, (cur.sourceDuration - cur.sourceIn) / rate)
        : Infinity;
    const minAllowed = cur.timelineStart + MIN_CLIP_DURATION;
    const maxAllowed = Math.min(nextStart, maxEndBySource);
    cur.timelineEnd = Number(Math.max(minAllowed, Math.min(maxAllowed, newTime)).toFixed(2));
  }

  sorted[idx] = cur;
  return sorted;
}

/**
 * 영상 클립의 재생 속도를 변경하고, 속도에 맞춰 타임라인 길이를 조절합니다.
 * 길이가 늘어나 뒤쪽 클립과 겹칠 경우 뒤쪽 클립들을 함께 뒤로 밀어냅니다.
 */
export function setVideoClipPlaybackRate(
  clips: VideoClip[],
  clipId: string,
  rawRate: number
): VideoClip[] {
  const newRate = Number(Math.max(0.25, Math.min(4, rawRate)).toFixed(2));
  const sorted = sortClips(clips);
  const idx = sorted.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;

  const cur = sorted[idx];
  if (cur.mediaType !== 'video') {
    sorted[idx] = { ...cur, playbackRate: newRate };
    return sorted;
  }

  const oldRate = Math.max(0.25, Math.min(4, cur.playbackRate ?? 1));
  const oldDur = Math.max(MIN_CLIP_DURATION, cur.timelineEnd - cur.timelineStart);
  const sourceSpan = oldDur * oldRate;
  const newDur = Math.max(MIN_CLIP_DURATION, sourceSpan / newRate);
  const newEnd = Number((cur.timelineStart + newDur).toFixed(2));

  const updated = sorted.map((c, i) =>
    i === idx ? { ...c, playbackRate: newRate, timelineEnd: newEnd } : c
  );

  if (idx < updated.length - 1 && newEnd > updated[idx + 1].timelineStart) {
    const shift = Number((newEnd - updated[idx + 1].timelineStart).toFixed(2));
    for (let i = idx + 1; i < updated.length; i++) {
      updated[i] = {
        ...updated[i],
        timelineStart: Number((updated[i].timelineStart + shift).toFixed(2)),
        timelineEnd: Number((updated[i].timelineEnd + shift).toFixed(2)),
      };
    }
  }

  return updated;
}

/**
 * 클립을 타임라인 상에서 좌우로 이동시킵니다.
 * 기존 클립을 건너뛰어 왼쪽/오른쪽의 다른 빈 공간으로도 이동할 수 있습니다.
 */
export function moveVideoClip(
  clips: VideoClip[],
  clipId: string,
  newStartTime: number
): VideoClip[] {
  const cur = clips.find((c) => c.id === clipId);
  if (!cur) return clips;

  const dur = Math.max(MIN_CLIP_DURATION, cur.timelineEnd - cur.timelineStart);
  const others = sortClips(clips.filter((c) => c.id !== clipId));
  const desired = Math.max(0, newStartTime);

  // 다른 클립들과 겹치지 않고 현재 클립(dur)이 들어갈 수 있는 모든 유효 구간 [minStart, maxStart] 계산
  const slots: Array<{ min: number; max: number }> = [];
  if (others.length === 0) {
    slots.push({ min: 0, max: Infinity });
  } else {
    if (others[0].timelineStart >= dur - 0.01) {
      slots.push({ min: 0, max: Math.max(0, others[0].timelineStart - dur) });
    }
    for (let i = 0; i < others.length - 1; i++) {
      const gapStart = others[i].timelineEnd;
      const gapEnd = others[i + 1].timelineStart;
      if (gapEnd - gapStart >= dur - 0.01) {
        slots.push({ min: gapStart, max: Math.max(gapStart, gapEnd - dur) });
      }
    }
    slots.push({ min: others[others.length - 1].timelineEnd, max: Infinity });
  }

  let bestStart = desired;
  let bestDist = Infinity;
  for (const slot of slots) {
    let candidate = Math.max(slot.min, Math.min(slot.max, desired));
    if (Math.abs(candidate - slot.min) < 0.15) candidate = slot.min;
    if (Number.isFinite(slot.max) && Math.abs(candidate - slot.max) < 0.15) {
      candidate = slot.max;
    }
    const dist = Math.abs(candidate - desired);
    if (dist < bestDist) {
      bestDist = dist;
      bestStart = candidate;
    }
  }

  const moved: VideoClip = {
    ...cur,
    timelineStart: Number(bestStart.toFixed(2)),
    timelineEnd: Number((bestStart + dur).toFixed(2)),
  };
  return sortClips([...others, moved]);
}

/**
 * 클립을 지정된 자막 구간 [segStart, segEnd]에 맞춥니다.
 * - 영상: 구간보다 짧으면 속도를 느리게(0.25x~1x) 조절해 맞추고, 길면 1x 속도로 뒷부분을 트림합니다.
 * - 이미지: 길이만 자막 구간에 맞춥니다.
 */
export function fitVideoClipToSegment(
  clips: VideoClip[],
  clipId: string,
  segStart: number,
  segEnd: number
): VideoClip[] {
  const cur = clips.find((c) => c.id === clipId);
  if (!cur) return clips;

  const targetStart = Math.max(0, Number(segStart.toFixed(2)));
  const targetEnd = Math.max(targetStart + MIN_CLIP_DURATION, Number(segEnd.toFixed(2)));
  const targetDur = targetEnd - targetStart;

  let nextClip: VideoClip;
  if (cur.mediaType === 'video') {
    const availableSourceDur = Math.max(MIN_CLIP_DURATION, cur.sourceDuration - cur.sourceIn);
    if (availableSourceDur < targetDur) {
      const rate = Math.max(
        0.25,
        Math.min(4, Number((availableSourceDur / targetDur).toFixed(2)))
      );
      nextClip = {
        ...cur,
        timelineStart: targetStart,
        timelineEnd: targetEnd,
        playbackRate: rate,
      };
    } else {
      nextClip = {
        ...cur,
        timelineStart: targetStart,
        timelineEnd: targetEnd,
        playbackRate: 1,
      };
    }
  } else {
    nextClip = {
      ...cur,
      timelineStart: targetStart,
      timelineEnd: targetEnd,
    };
  }

  const others = sortClips(clips.filter((c) => c.id !== clipId));
  const adjustedOthers: VideoClip[] = [];
  let pushCursor = targetEnd;
  for (const c of others) {
    if (c.timelineEnd <= targetStart + 0.01) {
      adjustedOthers.push(c);
    } else if (c.timelineStart < targetStart && c.timelineEnd > targetStart) {
      adjustedOthers.push({
        ...c,
        timelineEnd: Math.max(c.timelineStart + MIN_CLIP_DURATION, targetStart),
      });
    } else {
      const len = Math.max(MIN_CLIP_DURATION, c.timelineEnd - c.timelineStart);
      if (c.timelineStart < pushCursor) {
        const nextStart = Number(pushCursor.toFixed(2));
        const nextEnd = Number((nextStart + len).toFixed(2));
        adjustedOthers.push({ ...c, timelineStart: nextStart, timelineEnd: nextEnd });
        pushCursor = nextEnd;
      } else {
        adjustedOthers.push(c);
        pushCursor = Math.max(pushCursor, c.timelineEnd);
      }
    }
  }

  return sortClips([...adjustedOthers, nextClip]);
}

/**
 * 영상 클립의 뒤(우) 경계를 드래그하여 길이를 늘이거나 줄이면서 재생 속도를 함께 조절합니다.
 */
export function stretchVideoClipEnd(
  clips: VideoClip[],
  clipId: string,
  newEnd: number,
  origEnd: number,
  origRate: number
): VideoClip[] {
  const sorted = sortClips(clips);
  const idx = sorted.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;

  const cur = { ...sorted[idx] };
  if (cur.mediaType !== 'video') {
    return trimVideoClipEdge(clips, clipId, 'end', newEnd);
  }

  const safeOrigRate = Math.max(0.25, Math.min(4, origRate || 1));
  const origDur = Math.max(MIN_CLIP_DURATION, origEnd - cur.timelineStart);
  const sourceSpan = origDur * safeOrigRate;

  const nextStart = idx < sorted.length - 1 ? sorted[idx + 1].timelineStart : Infinity;
  const minDur = Math.max(MIN_CLIP_DURATION, sourceSpan / 4);
  const maxDur = sourceSpan / 0.25;
  const minAllowed = cur.timelineStart + minDur;
  const maxAllowed = Math.max(minAllowed, Math.min(nextStart, cur.timelineStart + maxDur));

  const clampedEnd = Number(Math.max(minAllowed, Math.min(maxAllowed, newEnd)).toFixed(2));
  const newDur = Math.max(MIN_CLIP_DURATION, clampedEnd - cur.timelineStart);
  const newRate = Number(Math.max(0.25, Math.min(4, sourceSpan / newDur)).toFixed(2));

  cur.timelineEnd = clampedEnd;
  cur.playbackRate = newRate;
  sorted[idx] = cur;
  return sorted;
}
