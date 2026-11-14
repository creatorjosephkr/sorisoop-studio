import { LyricSegment } from '../types';

/**
 * 오디오 PCM 파형에서 5ms Hop 단위로 에너지 기울기(Transient Attack)를 분석하여
 * 각 가사 구간의 시작 시간을 실제 보컬 첫 음절 발화 피크에 자석처럼 스냅합니다.
 */
export function snapSegmentsToAcousticPeaks(
  segments: LyricSegment[],
  audioBuffer: AudioBuffer,
  searchWindowSec = 0.35
): LyricSegment[] {
  const sampleRate = audioBuffer.sampleRate;
  const channel = audioBuffer.getChannelData(0);
  const hopSamples = Math.max(1, Math.floor(sampleRate * 0.005)); // 5ms hop
  const frameSamples = Math.max(hopSamples, Math.floor(sampleRate * 0.02)); // 20ms window

  const computeEnergyAt = (sampleIdx: number): number => {
    const start = Math.max(0, sampleIdx);
    const end = Math.min(channel.length, start + frameSamples);
    if (end <= start) return 0;
    let sum = 0;
    for (let i = start; i < end; i++) {
      const s = channel[i];
      sum += s * s;
    }
    return Math.sqrt(sum / (end - start));
  };

  return segments.map((seg, idx) => {
    // [전주], [간주], [후주] 같은 비보컬 메모 구간은 스냅하지 않음
    if (seg.notes && /전주|간주|후주|intro|interlude|outro/i.test(seg.notes)) {
      return seg;
    }

    const minTime = idx === 0 ? 0 : Math.max(0, segments[idx - 1].startTime + 0.15);
    const searchStartSec = Math.max(minTime, seg.startTime - searchWindowSec);
    const searchEndSec = Math.min(audioBuffer.duration - 0.1, seg.startTime + searchWindowSec);

    const startSample = Math.floor(searchStartSec * sampleRate);
    const endSample = Math.floor(searchEndSec * sampleRate);

    let bestSample = Math.floor(seg.startTime * sampleRate);
    let bestOnsetScore = -Infinity;
    let prevEnergy = computeEnergyAt(Math.max(0, startSample - hopSamples));

    for (let s = startSample; s <= endSample; s += hopSamples) {
      const energy = computeEnergyAt(s);
      const delta = energy - prevEnergy;
      // 에너지 상승 기울기 + 일정 수준 이상의 음량
      const score = delta * 2.5 + energy * 0.35;
      if (delta > 0.008 && score > bestOnsetScore) {
        bestOnsetScore = score;
        bestSample = s;
      }
      prevEnergy = energy;
    }

    if (bestOnsetScore <= -Infinity) {
      return seg;
    }

    const snappedStart = Math.max(0, Number((bestSample / sampleRate).toFixed(2)));
    const ensuredEnd = Math.max(snappedStart + 0.3, seg.endTime);

    return {
      ...seg,
      startTime: snappedStart,
      endTime: Number(ensuredEnd.toFixed(2)),
    };
  });
}

/**
 * 가사 구간 사이의 빈틈(최대 5초 이하)을 다음 가사 시작점에 맞춰 자연스럽게 연결하고 겹침을 제거합니다.
 */
export function normalizeSegmentGaps(
  segments: LyricSegment[],
  maxGapToBridgeSec = 5.0
): LyricSegment[] {
  const sorted = [...segments]
    .map((s) => ({ ...s }))
    .sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (cur.endTime > next.startTime) {
      cur.endTime = Number(Math.max(cur.startTime + 0.2, next.startTime).toFixed(2));
    } else {
      const gap = next.startTime - cur.endTime;
      if (gap > 0 && gap <= maxGapToBridgeSec) {
        cur.endTime = next.startTime;
      }
    }
  }
  return sorted;
}

/**
 * 2차 정밀 검토 및 최적화:
 * 보컬 대역(250Hz~3500Hz) 에너지 변화량을 기준으로 각 가사 시작점을 ±0.6초 범위 내의
 * 가장 뚜렷한 보컬 어택 피크로 보정하고, 인접 구간과 겹치지 않게 정리합니다.
 */
export async function refineSegmentsWithVocalEnvelope(
  segments: LyricSegment[],
  audioBuffer: AudioBuffer
): Promise<LyricSegment[]> {
  if (segments.length === 0) return segments;

  // 보컬 대역(250Hz~3500Hz) 필터링 버퍼 생성 (드럼 킥/심벌 영향 최소화)
  const targetRate = 16000;
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(audioBuffer.duration * targetRate),
    targetRate
  );
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 250;
  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3500;
  src.connect(hp);
  hp.connect(lp);
  lp.connect(offline.destination);
  src.start(0);

  const vocalBuffer = await offline.startRendering();
  const snapped = snapSegmentsToAcousticPeaks(segments, vocalBuffer, 0.6);

  // 보정 후 구간 간 겹침이 생기지 않도록 정리
  for (let i = 0; i < snapped.length - 1; i++) {
    if (snapped[i].endTime > snapped[i + 1].startTime) {
      snapped[i].endTime = Number(
        Math.max(snapped[i].startTime + 0.25, snapped[i + 1].startTime).toFixed(2)
      );
    }
  }
  return snapped;
}

/**
 * 전체 가사 구간의 싱크를 일괄적으로 앞/뒤로 이동합니다.
 */
export function shiftAllSegments(
  segments: LyricSegment[],
  deltaSec: number,
  maxDuration: number
): LyricSegment[] {
  return segments.map((seg) => {
    const dur = Math.max(0.25, seg.endTime - seg.startTime);
    const nextStart = Math.max(
      0,
      Math.min(Math.max(0, maxDuration - dur), Number((seg.startTime + deltaSec).toFixed(2)))
    );
    const nextEnd = Math.min(maxDuration || nextStart + dur, Number((nextStart + dur).toFixed(2)));
    return {
      ...seg,
      startTime: nextStart,
      endTime: nextEnd,
    };
  });
}

const LINK_THRESHOLD_SEC = 0.06;
const MIN_SEGMENT_DURATION_SEC = 0.2;

/**
 * 가사 구간의 시작/끝 시간을 조절할 때:
 * 1) 인접한 가사 구간과 맞닿아 있던 경우(<= 0.06s) 맞닿은 경계를 함께 이동시키고,
 * 2) 다른 가사 구간과 시간이 겹치지 않도록 경계를 자동 조정합니다.
 */
export function updateSegmentWithLinkedBounds(
  segments: LyricSegment[],
  id: string,
  patch: Partial<LyricSegment>,
  maxDuration: number
): LyricSegment[] {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const idx = sorted.findIndex((s) => s.id === id);
  if (idx === -1) return segments;

  const target = { ...sorted[idx] };
  const oldStart = target.startTime;
  const oldEnd = target.endTime;

  const prev = idx > 0 ? { ...sorted[idx - 1] } : null;
  const next = idx < sorted.length - 1 ? { ...sorted[idx + 1] } : null;

  const wasLinkedPrev = prev !== null && Math.abs(oldStart - prev.endTime) <= LINK_THRESHOLD_SEC;
  const wasLinkedNext = next !== null && Math.abs(next.startTime - oldEnd) <= LINK_THRESHOLD_SEC;

  if (patch.text !== undefined) target.text = patch.text;
  if (patch.notes !== undefined) target.notes = patch.notes;

  if (patch.startTime !== undefined) {
    const minAllowed = prev ? prev.startTime + MIN_SEGMENT_DURATION_SEC : 0;
    const maxAllowed = target.endTime - MIN_SEGMENT_DURATION_SEC;
    const clampedStart = Number(
      Math.max(minAllowed, Math.min(maxAllowed, patch.startTime)).toFixed(2)
    );
    target.startTime = clampedStart;

    if (prev && (wasLinkedPrev || clampedStart < prev.endTime)) {
      prev.endTime = clampedStart;
      sorted[idx - 1] = prev;
    }
  }

  if (patch.endTime !== undefined) {
    const minAllowed = target.startTime + MIN_SEGMENT_DURATION_SEC;
    const maxAllowed = next
      ? next.endTime - MIN_SEGMENT_DURATION_SEC
      : maxDuration > 0
        ? maxDuration
        : 9999;
    const clampedEnd = Number(
      Math.max(minAllowed, Math.min(maxAllowed, patch.endTime)).toFixed(2)
    );
    target.endTime = clampedEnd;

    if (next && (wasLinkedNext || clampedEnd > next.startTime)) {
      next.startTime = clampedEnd;
      sorted[idx + 1] = next;
    }
  }

  sorted[idx] = target;
  return sorted;
}

/**
 * 가사 구간의 길이(duration)를 유지한 채 전체 위치를 앞/뒤로 이동합니다.
 * 인접한 가사 구간과 겹치지 않도록 이동 범위를 제한합니다.
 */
export function moveSegmentWithBounds(
  segments: LyricSegment[],
  id: string,
  desiredStartTime: number,
  maxDuration: number
): LyricSegment[] {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const idx = sorted.findIndex((s) => s.id === id);
  if (idx === -1) return segments;

  const target = { ...sorted[idx] };
  const segDur = Math.max(MIN_SEGMENT_DURATION_SEC, target.endTime - target.startTime);
  const prevEnd = idx > 0 ? sorted[idx - 1].endTime : 0;
  const nextStart =
    idx < sorted.length - 1
      ? sorted[idx + 1].startTime
      : maxDuration > 0
        ? maxDuration
        : 9999;

  const maxAllowedStart = Math.max(prevEnd, nextStart - segDur);
  const clampedStart = Number(
    Math.max(prevEnd, Math.min(maxAllowedStart, desiredStartTime)).toFixed(2)
  );
  const clampedEnd = Number(Math.min(nextStart, clampedStart + segDur).toFixed(2));

  target.startTime = clampedStart;
  target.endTime = clampedEnd;
  sorted[idx] = target;
  return sorted;
}
