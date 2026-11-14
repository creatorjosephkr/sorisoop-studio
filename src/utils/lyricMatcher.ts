import { LyricSegment } from '../types';

const SECTION_HEADER_REGEX =
  /^\[.*\]$|^<(?:intro|verse|chorus|bridge|outro|pre-chorus|interlude|hook|전주|간주|후주|1절|2절|후렴).*>$/i;
const PAREN_SECTION_HEADER_REGEX =
  /^\(\s*(?:intro|verse\s*\d*|chorus|bridge|outro|pre-chorus|interlude|hook|전주|간주|후주|1절|2절|후렴)\s*\)$/i;

export function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (SECTION_HEADER_REGEX.test(trimmed)) return true;
  if (PAREN_SECTION_HEADER_REGEX.test(trimmed)) return true;
  if (/^(intro|verse\s*\d*|chorus|bridge|outro|pre-chorus|interlude|hook)\s*:?$/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function extractPureLyricLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isSectionHeader(l));
}

interface ParsedLyricEntry {
  text: string;
  sectionName?: string;
  /** 이 구절 바로 앞에 [Intro], [Interlude], [간주] 등 반주/공백 섹션이 있었는지 여부 */
  afterInstrumentalBreak: boolean;
}

const INSTRUMENTAL_SECTION_REGEX =
  /intro|전주|interlude|간주|instrumental|solo|break|outro|후주/i;

function cleanSectionLabel(header: string): string {
  return header.replace(/^[\[\(<]+|[\]\)>:]+$/g, '').trim();
}

/**
 * 전체 가사에서 [Intro], [Verse 1], [간주], [Chorus] 등의 섹션 정보를 파싱해
 * 각 가사 줄의 소속 섹션명과 선행 반주(전주/간주) 유무를 함께 반환합니다.
 */
export function parseStructuredLyrics(rawText: string): ParsedLyricEntry[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());
  const entries: ParsedLyricEntry[] = [];

  let currentSection: string | undefined;
  let pendingInstrumentalBreak = false;
  let isFirstLineInSection = true;

  for (const line of lines) {
    if (!line) continue;
    if (isSectionHeader(line)) {
      const label = cleanSectionLabel(line);
      if (INSTRUMENTAL_SECTION_REGEX.test(label)) {
        pendingInstrumentalBreak = true;
      }
      currentSection = label || currentSection;
      isFirstLineInSection = true;
      continue;
    }

    entries.push({
      text: line,
      sectionName: isFirstLineInSection ? currentSection : undefined,
      afterInstrumentalBreak: pendingInstrumentalBreak,
    });
    pendingInstrumentalBreak = false;
    isFirstLineInSection = false;
  }

  return entries;
}

export interface WhisperChunkInput {
  text: string;
  timestamp: [number, number | null];
}

const CHOSEONG = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];
const JUNGSEONG = [
  'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ',
];
const JONGSEONG = [
  '','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

/**
 * 한글을 자모(초성/중성/종성) 단위로 분해하여 발음 유사도 비교에 사용합니다.
 */
function toJamo(text: string): string {
  const normalized = text.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const cho = Math.floor(offset / 588);
      const jung = Math.floor((offset % 588) / 28);
      const jong = offset % 28;
      out += CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong];
    } else {
      out += normalized[i];
    }
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[b.length];
}

function phoneticSimilarity(lineA: string, lineB: string): number {
  const ja = toJamo(lineA);
  const jb = toJamo(lineB);
  const maxLen = Math.max(ja.length, jb.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(ja, jb);
  return Math.max(0, 1 - dist / maxLen);
}

const HALLUCINATION_REGEX =
  /^(?:감사합니다\.?|시청해\s*주셔서\s*감사합니다\.?|구독\s*(?:과|와|및|\/|,)?\s*좋아요.*|좋아요\s*(?:과|와|및|\/|,)?\s*구독.*|mbc\s*뉴스.*|kbs\s*뉴스.*|sbs\s*뉴스.*|이\s*시각.*|자막.*|번역.*|음악|노래|박수|환호|간주|전주|thank\s*you\.?|thanks\s*for\s*watching\.?|[♪♫♩♬\s.]+)$/i;

function isHallucinationChunk(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // [끝까지, [구독/좋아요], (음악) 등 괄호로 시작하는 자막 태그 환각 차단
  if (/^[\[\(]/.test(t)) return true;
  const unwrapped = t.replace(/^[\[\(\<]+|[\]\)\>]+$/g, '').trim();
  return HALLUCINATION_REGEX.test(t) || HALLUCINATION_REGEX.test(unwrapped);
}

/**
 * 16kHz 보컬 대역 필터링된 PCM에서 0.2초 단위 음성 활성 구간(Vocal Active Intervals)을 추출합니다.
 * 긴 전주/간주(반주만 있는 구간)를 가사 배치에서 제외하는 데 사용합니다.
 */
function detectVocalActiveIntervals(
  pcm16k: Float32Array,
  totalDuration: number
): Array<{ start: number; end: number }> {
  const sampleRate = 16000;
  const frameSamples = Math.floor(sampleRate * 0.2); // 200ms
  const frameCount = Math.floor(pcm16k.length / frameSamples);
  if (frameCount === 0) return [{ start: 0, end: totalDuration }];

  const rmsList = new Float32Array(frameCount);
  let sumAll = 0;
  for (let f = 0; f < frameCount; f++) {
    let sq = 0;
    const base = f * frameSamples;
    for (let i = 0; i < frameSamples; i++) {
      const v = pcm16k[base + i];
      sq += v * v;
    }
    const rms = Math.sqrt(sq / frameSamples);
    rmsList[f] = rms;
    sumAll += rms;
  }

  const avgRms = sumAll / frameCount;
  const threshold = Math.max(0.006, avgRms * 0.45);

  const raw: Array<{ start: number; end: number }> = [];
  let inActive = false;
  let segStart = 0;

  for (let f = 0; f < frameCount; f++) {
    const active = rmsList[f] >= threshold;
    if (active && !inActive) {
      inActive = true;
      segStart = f * 0.2;
    } else if (!active && inActive) {
      inActive = false;
      raw.push({ start: segStart, end: f * 0.2 });
    }
  }
  if (inActive) {
    raw.push({ start: segStart, end: totalDuration });
  }

  // 1.2초 이내의 짧은 숨고르기 공백은 하나의 발화 구간으로 병합
  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of raw) {
    if (merged.length > 0 && iv.start - merged[merged.length - 1].end <= 1.2) {
      merged[merged.length - 1].end = iv.end;
    } else if (iv.end - iv.start >= 0.35) {
      merged.push({ ...iv });
    }
  }

  return merged.length > 0 ? merged : [{ start: 0, end: totalDuration }];
}

/**
 * [spanStart, spanEnd] 범위 내에서 실제 발화(Whisper 청크 또는 보컬 활성 구간)만 모아
 * 긴 간주 구간을 건너뛰며 가사 줄들을 배치합니다.
 */
function distributeLinesOverActiveSpans(
  lines: string[],
  spanStart: number,
  spanEnd: number,
  chunks: Array<{ startTime: number; endTime: number }>,
  vocalIntervals: Array<{ start: number; end: number }>,
  totalDuration: number,
  idOffset: number
): LyricSegment[] {
  // 1) 범위 내 Whisper 청크 구간 수집 (2초 이상 공백은 간주로 분리)
  const subSpans: Array<{ start: number; end: number }> = [];
  const inRangeChunks = chunks.filter(
    (c) => c.endTime > spanStart + 0.1 && c.startTime < spanEnd - 0.1
  );

  for (const c of inRangeChunks) {
    const cs = Math.max(spanStart, c.startTime);
    const ce = Math.min(spanEnd, c.endTime);
    if (ce <= cs) continue;
    if (subSpans.length > 0 && cs - subSpans[subSpans.length - 1].end <= 2.0) {
      subSpans[subSpans.length - 1].end = Math.max(subSpans[subSpans.length - 1].end, ce);
    } else {
      subSpans.push({ start: cs, end: ce });
    }
  }

  // 2) Whisper 청크가 없으면 보컬 활성 구간(PCM 에너지) 사용
  if (subSpans.length === 0) {
    for (const iv of vocalIntervals) {
      const cs = Math.max(spanStart, iv.start);
      const ce = Math.min(spanEnd, iv.end);
      if (ce - cs >= 0.4) {
        subSpans.push({ start: cs, end: ce });
      }
    }
  }

  if (subSpans.length === 0) {
    subSpans.push({ start: spanStart, end: Math.max(spanStart + lines.length * 0.5, spanEnd) });
  }

  // 활성 구간들의 총 길이 계산
  const totalActiveDur = subSpans.reduce((acc, s) => acc + Math.max(0.2, s.end - s.start), 0);
  const weights = lines.map((l) => Math.max(4, l.replace(/\s+/g, '').length));
  const totalW = weights.reduce((acc, w) => acc + w, 0);

  // 활성 시간축(0 ~ totalActiveDur)을 실제 타임라인 시간으로 변환하는 매퍼
  const mapActiveOffsetToTime = (offset: number): number => {
    let rem = Math.max(0, Math.min(totalActiveDur, offset));
    for (const s of subSpans) {
      const len = Math.max(0.2, s.end - s.start);
      if (rem <= len) {
        return s.start + rem;
      }
      rem -= len;
    }
    return subSpans[subSpans.length - 1].end;
  };

  let accW = 0;
  return lines.map((line, k) => {
    const r0 = accW / totalW;
    accW += weights[k];
    const r1 = accW / totalW;
    const st = Number(mapActiveOffsetToTime(r0 * totalActiveDur).toFixed(2));
    const en = Number(
      Math.min(totalDuration, Math.max(st + 0.35, mapActiveOffsetToTime(r1 * totalActiveDur))).toFixed(2)
    );
    return {
      id: `seg-${Date.now()}-${idOffset + k}`,
      startTime: st,
      endTime: en,
      text: line,
    };
  });
}

/**
 * 로컬 Whisper가 추출한 청크(타임스탬프 포함)와 사용자 입력 가사를
 * 한글 자모 발음 유사도 + 단조 동적 계획법(DP)으로 정밀 정렬합니다.
 * - Whisper 환각 제거 + 전주/간주(비음성 구간)를 건너뛰며 유사도 앵커를 기준으로 배치합니다.
 */
export function buildSegmentsFromWhisper(
  chunks: WhisperChunkInput[],
  rawLyricsText: string,
  totalDuration: number,
  pcm16k?: Float32Array
): LyricSegment[] {
  const validChunks = chunks
    .map((c, idx) => {
      const start = Math.max(0, c.timestamp?.[0] ?? 0);
      const nextStart = chunks[idx + 1]?.timestamp?.[0] ?? totalDuration;
      const rawEnd = c.timestamp?.[1];
      const end = Math.min(
        totalDuration,
        Math.max(start + 0.35, rawEnd !== null && rawEnd !== undefined ? rawEnd : nextStart)
      );
      return {
        text: c.text.trim(),
        startTime: Number(start.toFixed(2)),
        endTime: Number(end.toFixed(2)),
      };
    })
    .filter((c) => !isHallucinationChunk(c.text));

  const vocalIntervals = pcm16k
    ? detectVocalActiveIntervals(pcm16k, totalDuration)
    : [{ start: 0, end: totalDuration }];

  const lyricEntries = parseStructuredLyrics(rawLyricsText);
  const lyricLines = lyricEntries.map((e) => e.text);

  if (lyricLines.length === 0) {
    return validChunks.map((c, idx) => ({
      id: `seg-${Date.now()}-${idx}`,
      startTime: c.startTime,
      endTime: c.endTime,
      text: c.text,
    }));
  }

  if (validChunks.length === 0) {
    const fallbackSegs = distributeLinesOverActiveSpans(
      lyricLines,
      vocalIntervals[0]?.start ?? 0,
      vocalIntervals[vocalIntervals.length - 1]?.end ?? totalDuration,
      [],
      vocalIntervals,
      totalDuration,
      0
    );
    return fallbackSegs.map((s, idx) => ({
      ...s,
      notes: lyricEntries[idx]?.sectionName,
    }));
  }

  // [Intro]/[전주]가 명시된 경우, 초반(8초 이내)의 가사와 무관한 잡음/반주 환각 청크를 앞쪽에서 제거
  let effectiveChunks = validChunks;
  if (lyricEntries[0]?.afterInstrumentalBreak) {
    while (
      effectiveChunks.length > 2 &&
      effectiveChunks[0].startTime < 8.0 &&
      phoneticSimilarity(lyricLines[0], effectiveChunks[0].text) < 0.25 &&
      phoneticSimilarity(lyricLines[1] ?? '', effectiveChunks[0].text) < 0.25
    ) {
      effectiveChunks = effectiveChunks.slice(1);
    }
  }

  // 1단계: 각 가사 줄(i)과 Whisper 청크(j) 간의 발음 유사도 행렬 계산
  const M = lyricLines.length;
  const N = effectiveChunks.length;
  const simMatrix: number[][] = Array.from({ length: M }, (_, i) =>
    Array.from({ length: N }, (_, j) => phoneticSimilarity(lyricLines[i], effectiveChunks[j].text))
  );

  // 2단계: 단조 앵커 매칭 (DP로 총 유사도가 최대가 되는 단조 증가 매핑 탐색)
  const dp: number[][] = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));
  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      const matchScore = dp[i - 1][j - 1] + simMatrix[i - 1][j - 1];
      dp[i][j] = Math.max(matchScore, dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // 역추적하여 신뢰도 있는 앵커 쌍(유사도 >= 0.28) 추출
  const anchorMap = new Map<number, number>(); // lyricIdx -> chunkIdx
  let i = M;
  let j = N;
  while (i > 0 && j > 0) {
    const diag = dp[i - 1][j - 1] + simMatrix[i - 1][j - 1];
    if (Math.abs(dp[i][j] - diag) < 1e-6 && simMatrix[i - 1][j - 1] >= 0.28) {
      anchorMap.set(i - 1, j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // 3단계: 앵커가 잡힌 줄은 해당 Whisper 청크 시간을 직접 사용하고,
  // 앵커 사이의 미매칭 줄들은 실제 발화 청크/보컬 활성 구간에만 배치 (간주 건너뛰기)
  const anchors: Array<{ lyricIdx: number; start: number; end: number }> = [];
  for (const [lIdx, cIdx] of Array.from(anchorMap.entries()).sort((a, b) => a[0] - b[0])) {
    anchors.push({
      lyricIdx: lIdx,
      start: effectiveChunks[cIdx].startTime,
      end: effectiveChunks[cIdx].endTime,
    });
  }

  const segments: LyricSegment[] = new Array(M);

  for (const a of anchors) {
    segments[a.lyricIdx] = {
      id: `seg-${Date.now()}-${a.lyricIdx}`,
      startTime: a.start,
      endTime: a.end,
      text: lyricLines[a.lyricIdx],
      notes: lyricEntries[a.lyricIdx]?.sectionName,
    };
  }

  const boundaries: Array<{ lyricIdx: number; time: number }> = [
    { lyricIdx: -1, time: effectiveChunks[0].startTime },
    ...anchors.map((a) => ({ lyricIdx: a.lyricIdx, time: a.start })),
    { lyricIdx: M, time: effectiveChunks[effectiveChunks.length - 1].endTime },
  ];

  for (let b = 0; b < boundaries.length - 1; b++) {
    const leftIdx = boundaries[b].lyricIdx;
    const rightIdx = boundaries[b + 1].lyricIdx;
    const gapCount = rightIdx - leftIdx - 1;
    if (gapCount <= 0) continue;

    let spanStart =
      leftIdx >= 0 ? segments[leftIdx].endTime : effectiveChunks[0].startTime;
    const spanEnd =
      rightIdx < M
        ? segments[rightIdx].startTime
        : effectiveChunks[effectiveChunks.length - 1].endTime;

    // [Intro]/[전주]가 있는 첫 구간에서 첫 앵커 앞쪽 가사가 0초까지 과도하게 늘어나지 않도록 역산 제한
    if (leftIdx === -1 && lyricEntries[0]?.afterInstrumentalBreak && rightIdx < M) {
      spanStart = Math.max(spanStart, Number((spanEnd - gapCount * 3.8).toFixed(2)));
    }

    const sliceEntries = lyricEntries.slice(leftIdx + 1, rightIdx);
    const sliceLines = sliceEntries.map((e) => e.text);

    // [간주]/[Interlude] 태그가 있는 지점에서 가장 큰 비음성 갭(>= 2.0s)을 찾아 앞/뒤 섹션 분리
    const breakIdx = sliceEntries.findIndex((e, idx) => idx > 0 && e.afterInstrumentalBreak);
    if (breakIdx > 0) {
      const inSpanChunks = effectiveChunks.filter(
        (c) => c.endTime > spanStart && c.startTime < spanEnd
      );
      let bestGapStart = -1;
      let bestGapEnd = -1;
      let bestGapLen = 2.0;

      for (let c = 0; c < inSpanChunks.length - 1; c++) {
        const gLen = inSpanChunks[c + 1].startTime - inSpanChunks[c].endTime;
        if (gLen > bestGapLen) {
          bestGapLen = gLen;
          bestGapStart = inSpanChunks[c].endTime;
          bestGapEnd = inSpanChunks[c + 1].startTime;
        }
      }

      if (bestGapStart > spanStart && bestGapEnd < spanEnd) {
        const beforePlaced = distributeLinesOverActiveSpans(
          sliceLines.slice(0, breakIdx),
          spanStart,
          bestGapStart,
          effectiveChunks,
          vocalIntervals,
          totalDuration,
          leftIdx + 1
        );
        const afterPlaced = distributeLinesOverActiveSpans(
          sliceLines.slice(breakIdx),
          bestGapEnd,
          spanEnd,
          effectiveChunks,
          vocalIntervals,
          totalDuration,
          leftIdx + 1 + breakIdx
        );
        const combined = [...beforePlaced, ...afterPlaced];
        for (let k = 0; k < gapCount; k++) {
          segments[leftIdx + 1 + k] = {
            ...combined[k],
            notes: sliceEntries[k]?.sectionName,
          };
        }
        continue;
      }
    }

    const placed = distributeLinesOverActiveSpans(
      sliceLines,
      spanStart,
      spanEnd,
      effectiveChunks,
      vocalIntervals,
      totalDuration,
      leftIdx + 1
    );
    for (let k = 0; k < gapCount; k++) {
      segments[leftIdx + 1 + k] = {
        ...placed[k],
        notes: sliceEntries[k]?.sectionName,
      };
    }
  }

  // 단조 순서 보장 및 겹침 제거 (누락 없이 모든 줄의 최소 길이 0.3초 보장)
  for (let idx = 0; idx < segments.length; idx++) {
    if (idx > 0 && segments[idx].startTime < segments[idx - 1].endTime) {
      segments[idx].startTime = segments[idx - 1].endTime;
    }
    if (segments[idx].endTime <= segments[idx].startTime + 0.3) {
      segments[idx].endTime = Number(
        Math.min(totalDuration, segments[idx].startTime + 0.35).toFixed(2)
      );
    }
  }
  for (let idx = 0; idx < segments.length - 1; idx++) {
    if (segments[idx].endTime > segments[idx + 1].startTime) {
      segments[idx].endTime = segments[idx + 1].startTime;
    }
  }

  return segments;
}
