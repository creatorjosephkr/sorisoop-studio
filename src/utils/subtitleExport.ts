import { LyricSegment } from '../types';

export function formatLrcTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function toLrcContent(segments: LyricSegment[]): string {
  return segments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => `[${formatLrcTime(s.startTime)}] ${s.text}`)
    .join('\n');
}

export function toSrtContent(segments: LyricSegment[]): string {
  return segments
    .filter((s) => s.text.trim().length > 0)
    .map(
      (s, idx) =>
        `${idx + 1}\n${formatSrtTime(s.startTime)} --> ${formatSrtTime(s.endTime)}\n${s.text}\n`
    )
    .join('\n');
}

export function toJsonContent(
  trackName: string,
  duration: number,
  segments: LyricSegment[]
): string {
  return JSON.stringify(
    {
      trackName,
      duration: Number(duration.toFixed(2)),
      segments,
    },
    null,
    2
  );
}
