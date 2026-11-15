import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Film,
  Link2,
  Magnet,
  Maximize2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  SkipBack,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AppTheme, LyricSegment, TextLayer, TextTransitionType, TransitionType, VideoClip } from '../types';
import {
  DEFAULT_TEXT_TRANSITION_DURATION,
  DEFAULT_TRANSITION_DURATION,
  TEXT_TRANSITION_LABELS,
  TRANSITION_LABELS,
} from '../utils/videoClipUtils';
import { VuMeter } from './VuMeter';
import { NumberInput } from './NumberInput';

interface WaveformTimelineProps {
  trackName: string;
  peaks: Float32Array | null;
  duration: number;
  audioSourceDuration?: number;
  onChangeAudioDuration?: (newDuration: number) => void;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  leftDb: number;
  rightDb: number;
  segments: LyricSegment[];
  selectedSegmentId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onBeginDrag: () => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onAddSegmentAtCurrent: () => void;
  onResizeSegmentEdge: (id: string, edge: 'start' | 'end', newTime: number) => void;
  onMoveSegment: (id: string, newStartTime: number) => void;
  onSelectSegment: (seg: LyricSegment) => void;
  videoClips: VideoClip[];
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onSplitClip: () => void;
  onSplitClipAt?: (id: string, splitTime: number) => void;
  onDeleteClip: (id: string) => void;
  onJoinClipGaps: () => void;
  onInsertMediaAtCurrent: () => void;
  onAppendMedia: () => void;
  onTrimClipEdge: (id: string, edge: 'start' | 'end', newTime: number) => void;
  onMoveClip: (id: string, newStartTime: number) => void;
  onUpdateClip: (id: string, patch: Partial<VideoClip>, recordHistory?: boolean) => void;
  textLayers: TextLayer[];
  selectedTextLayerId: string | null;
  onSelectTextLayer: (id: string | null) => void;
  onUpdateTextLayer: (id: string, patch: Partial<TextLayer>, recordHistory?: boolean) => void;
  onDeleteTextLayer: (id: string) => void;
  onSplitTextLayer?: (id: string, splitTime: number) => void;
  appTheme?: AppTheme;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

export const WaveformTimeline: React.FC<WaveformTimelineProps> = ({
  trackName,
  peaks,
  duration,
  audioSourceDuration,
  onChangeAudioDuration,
  currentTime,
  isPlaying,
  volume,
  isMuted,
  leftDb,
  rightDb,
  segments,
  selectedSegmentId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onBeginDrag,
  onSeek,
  onTogglePlay,
  onVolumeChange,
  onToggleMute,
  onAddSegmentAtCurrent,
  onResizeSegmentEdge,
  onMoveSegment,
  onSelectSegment,
  videoClips,
  selectedClipId,
  onSelectClip,
  onSplitClip,
  onSplitClipAt,
  onDeleteClip,
  onJoinClipGaps,
  onInsertMediaAtCurrent,
  onAppendMedia,
  onTrimClipEdge,
  onMoveClip,
  onUpdateClip,
  textLayers,
  selectedTextLayerId,
  onSelectTextLayer,
  onUpdateTextLayer,
  onDeleteTextLayer,
  onSplitTextLayer,
  appTheme = 'default',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textTrackRef = useRef<HTMLDivElement | null>(null);
  const videoTrackRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const isRulerDraggingRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pendingScrollAnchorRef = useRef<{ time: number; screenX: number } | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
  const [hoverCursor, setHoverCursor] = useState<'pointer' | 'ew-resize' | 'grab' | 'grabbing'>('pointer');
  const [editingTransClipId, setEditingTransClipId] = useState<string | null>(null);
  const [sourceContextMenu, setSourceContextMenu] = useState<{
    kind: 'clip' | 'text';
    id: string;
    x: number;
    y: number;
    clickTime: number;
    side: 'in' | 'out';
  } | null>(null);

  useEffect(() => {
    if (!sourceContextMenu) return;
    const close = () => setSourceContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSourceContextMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [sourceContextMenu]);
  const [transitionModal, setTransitionModal] = useState<{
    clipId: string;
    side: 'in' | 'out';
    titleLabel: string;
    type: TransitionType;
    durationSec: number;
  } | null>(null);
  const [textTransitionModal, setTextTransitionModal] = useState<{
    layerId: string;
    side: 'in' | 'out';
    titleLabel: string;
    type: TextTransitionType;
    durationSec: number;
  } | null>(null);

  const rangedTextLayers = textLayers.filter((l) => !l.alwaysVisible);

  const timelineDuration = Math.max(
    duration,
    ...videoClips.map((c) => c.timelineEnd),
    0
  );
  // 1배 미만(예: 전체보기 0.85x)일 때도 타임라인 영역 100%를 채우고 눈금자가 끝까지 이어지도록 표시 시간축 확장
  const displayDuration =
    timelineDuration > 0 && zoom < 1 ? timelineDuration / zoom : timelineDuration;
  const displayDurationRef = useRef(displayDuration);
  displayDurationRef.current = displayDuration;

  const textDragRef = useRef<
    | {
        mode: 'move' | 'trim-start' | 'trim-end';
        id: string;
        startX: number;
        origStart: number;
        origEnd: number;
      }
    | null
  >(null);

  const clipDragRef = useRef<
    | { mode: 'trim-start' | 'trim-end'; id: string; startX: number; origStart: number; origEnd: number }
    | { mode: 'move'; id: string; startX: number; origStart: number; origEnd: number }
    | { mode: 'trans' | 'trans-out'; id: string; startX: number; origDur: number }
    | null
  >(null);

  const dragRef = useRef<
    | { mode: 'resize'; id: string; edge: 'start' | 'end'; moved: boolean }
    | { mode: 'move'; id: string; offsetSec: number; moved: boolean }
    | null
  >(null);

  const audioEndDragRef = useRef<{ startX: number; origDur: number } | null>(null);

  useEffect(() => {
    const onWinMouseMove = (e: MouseEvent) => {
      const drag = audioEndDragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas || displayDuration <= 0 || !onChangeAudioDuration) return;
      const canvasW = canvas.getBoundingClientRect().width;
      if (canvasW <= 0) return;
      const deltaSec = ((e.clientX - drag.startX) / canvasW) * displayDuration;
      let rawEnd = drag.origDur + deltaSec;
      const useSnap = snapEnabled && !e.altKey;
      if (useSnap) {
        const thresholdSec = (8 / canvasW) * displayDuration;
        const pts = collectSnapPoints();
        const res = snapEdgeTime(rawEnd, pts, thresholdSec);
        rawEnd = res.time;
        setSnapGuideTime(res.snappedTo);
      } else {
        setSnapGuideTime(null);
      }
      const maxDur =
        audioSourceDuration && audioSourceDuration > 0 ? audioSourceDuration : drag.origDur;
      const clamped = Number(Math.max(1, Math.min(maxDur, rawEnd)).toFixed(2));
      onChangeAudioDuration(clamped);
    };
    const onWinMouseUp = () => {
      if (audioEndDragRef.current) {
        audioEndDragRef.current = null;
        setSnapGuideTime(null);
      }
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  });

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 16;
  const FIT_ALL_ZOOM = 0.85;

  const applyZoomWithAnchor = useCallback(
    (nextZoom: number, anchorTime: number, anchorScreenX: number) => {
      const clamped = Number(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)).toFixed(2));
      pendingScrollAnchorRef.current = {
        time: Math.max(0, anchorTime),
        screenX: anchorScreenX,
      };
      setZoom(clamped);
    },
    []
  );

  const zoomAroundPlayhead = useCallback(
    (factor: number) => {
      const container = scrollContainerRef.current;
      const effDur = displayDurationRef.current;
      if (!container || effDur <= 0) {
        setZoom((z) =>
          Number(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)).toFixed(2))
        );
        return;
      }
      const viewW = container.clientWidth;
      const totalW = Math.max(1, container.scrollWidth);
      const playX = (currentTime / effDur) * totalW;
      const currentScreenX = playX - container.scrollLeft;
      const targetScreenX =
        currentScreenX >= 0 && currentScreenX <= viewW ? currentScreenX : viewW * 0.5;
      applyZoomWithAnchor(zoomRef.current * factor, currentTime, targetScreenX);
    },
    [applyZoomWithAnchor, currentTime]
  );

  const fitAllTimeline = useCallback(() => {
    pendingScrollAnchorRef.current = { time: 0, screenX: 0 };
    setZoom(FIT_ALL_ZOOM);
  }, []);

  useLayoutEffect(() => {
    const anchor = pendingScrollAnchorRef.current;
    if (!anchor) return;
    pendingScrollAnchorRef.current = null;
    const container = scrollContainerRef.current;
    const effDur = displayDurationRef.current;
    if (!container || effDur <= 0) return;
    const totalW = container.scrollWidth;
    const targetX = (anchor.time / effDur) * totalW;
    container.scrollLeft = Math.max(0, targetX - anchor.screenX);
  }, [zoom]);

  // Alt(Option) + 마우스 휠: 마우스 포인터 위치 중심으로 확대/축소
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      const effDur = displayDurationRef.current;
      const rect = container.getBoundingClientRect();
      const mouseXInView = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const totalW = Math.max(1, container.scrollWidth);
      const contentX = container.scrollLeft + mouseXInView;
      const anchorTime = effDur > 0 ? (contentX / totalW) * effDur : 0;
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      const clampedDelta = Math.max(-120, Math.min(120, delta));
      const factor = Math.exp(-clampedDelta * 0.0028);
      applyZoomWithAnchor(zoomRef.current * factor, anchorTime, mouseXInView);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [applyZoomWithAnchor]);

  // 배율 단축키: = (재생헤드 중심 확대), - (재생헤드 중심 축소), \ (전체 길이 85% 맞춤)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === 'Equal' || e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomAroundPlayhead(1.25);
      } else if (e.code === 'Minus' || e.key === '-') {
        e.preventDefault();
        zoomAroundPlayhead(1 / 1.25);
      } else if (e.code === 'Backslash' || e.key === '\\') {
        e.preventDefault();
        fitAllTimeline();
      } else if (e.code === 'Home' || e.key === 'Home') {
        e.preventDefault();
        onSeek(0);
      } else if (e.code === 'End' || e.key === 'End') {
        e.preventDefault();
        onSeek(timelineDuration);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fitAllTimeline, onSeek, timelineDuration, zoomAroundPlayhead]);

  // 확대 상태에서 재생/탐색 시 현재 재생 위치가 항상 보이도록 타임라인 자동 스크롤
  const prevZoomForAutoScrollRef = useRef(zoom);
  useEffect(() => {
    const zoomChanged = prevZoomForAutoScrollRef.current !== zoom;
    prevZoomForAutoScrollRef.current = zoom;
    if (zoomChanged) return;
    const container = scrollContainerRef.current;
    if (!container || timelineDuration <= 0 || zoom <= 1) return;
    if (dragRef.current || clipDragRef.current || textDragRef.current || isRulerDraggingRef.current) return;

    const totalW = container.scrollWidth;
    const viewW = container.clientWidth;
    const playX = (currentTime / timelineDuration) * totalW;

    if (playX < container.scrollLeft + 24 || playX > container.scrollLeft + viewW - 40) {
      container.scrollLeft = Math.max(0, playX - viewW * 0.25);
    }
  }, [currentTime, timelineDuration, zoom]);

  // 타임라인 자석 스냅 대상 지점 수집 (가사 경계 + 영상/이미지 경계 + 특정 구간 텍스트 경계 + 재생헤드)
  const collectSnapPoints = (exclude?: {
    clipId?: string;
    textId?: string;
    segmentId?: string;
  }): number[] => {
    const pts: number[] = [0, currentTime];
    if (duration > 0) pts.push(duration);
    for (const s of segments) {
      if (s.id === exclude?.segmentId) continue;
      pts.push(s.startTime, s.endTime);
    }
    for (const c of videoClips) {
      if (c.id === exclude?.clipId) continue;
      pts.push(c.timelineStart, c.timelineEnd);
    }
    for (const l of rangedTextLayers) {
      if (l.id === exclude?.textId) continue;
      pts.push(l.startTime, l.endTime);
    }
    return pts;
  };

  const snapEdgeTime = (
    rawSec: number,
    candidates: number[],
    thresholdSec: number
  ): { time: number; snappedTo: number | null } => {
    let best: number | null = null;
    let bestDist = thresholdSec;
    for (const pt of candidates) {
      const dist = Math.abs(pt - rawSec);
      if (dist <= bestDist) {
        bestDist = dist;
        best = pt;
      }
    }
    return best !== null ? { time: best, snappedTo: best } : { time: rawSec, snappedTo: null };
  };

  const snapMoveStart = (
    rawStart: number,
    len: number,
    candidates: number[],
    thresholdSec: number
  ): { startTime: number; snappedTo: number | null } => {
    let bestStart = rawStart;
    let bestSnap: number | null = null;
    let bestDist = thresholdSec;
    const rawEnd = rawStart + len;

    for (const pt of candidates) {
      const startDist = Math.abs(pt - rawStart);
      if (startDist <= bestDist) {
        bestDist = startDist;
        bestStart = pt;
        bestSnap = pt;
      }
      const endDist = Math.abs(pt - rawEnd);
      if (endDist <= bestDist) {
        bestDist = endDist;
        bestStart = pt - len;
        bestSnap = pt;
      }
    }
    return { startTime: bestStart, snappedTo: bestSnap };
  };

  // 영상 클립 트림 / 이동 / 트랜지션 길이 드래그 처리
  useEffect(() => {
    const onWinMouseMove = (e: MouseEvent) => {
      const drag = clipDragRef.current;
      const trackEl = videoTrackRef.current;
      if (!drag || !trackEl || timelineDuration <= 0) return;

      const trackWidth = trackEl.getBoundingClientRect().width;
      if (trackWidth <= 0) return;
      const deltaSec = ((e.clientX - drag.startX) / trackWidth) * displayDuration;
      const useSnap = snapEnabled && !e.altKey;
      const thresholdSec = (8 / trackWidth) * displayDuration;

      if (drag.mode === 'trim-start') {
        const raw = drag.origStart + deltaSec;
        if (useSnap) {
          const pts = collectSnapPoints({ clipId: drag.id });
          const res = snapEdgeTime(raw, pts, thresholdSec);
          setSnapGuideTime(res.snappedTo);
          onTrimClipEdge(drag.id, 'start', res.time);
        } else {
          setSnapGuideTime(null);
          onTrimClipEdge(drag.id, 'start', raw);
        }
      } else if (drag.mode === 'trim-end') {
        const raw = drag.origEnd + deltaSec;
        if (useSnap) {
          const pts = collectSnapPoints({ clipId: drag.id });
          const res = snapEdgeTime(raw, pts, thresholdSec);
          setSnapGuideTime(res.snappedTo);
          onTrimClipEdge(drag.id, 'end', res.time);
        } else {
          setSnapGuideTime(null);
          onTrimClipEdge(drag.id, 'end', raw);
        }
      } else if (drag.mode === 'move') {
        const rawStart = drag.origStart + deltaSec;
        const len = Math.max(0.25, drag.origEnd - drag.origStart);
        if (useSnap) {
          const pts = collectSnapPoints({ clipId: drag.id });
          const res = snapMoveStart(rawStart, len, pts, thresholdSec);
          setSnapGuideTime(res.snappedTo);
          onMoveClip(drag.id, res.startTime);
        } else {
          setSnapGuideTime(null);
          onMoveClip(drag.id, rawStart);
        }
      } else if (drag.mode === 'trans') {
        const clip = videoClips.find((c) => c.id === drag.id);
        if (!clip) return;
        const maxTrans = Math.max(0.2, Math.min(5.0, (clip.timelineEnd - clip.timelineStart) * 0.8));
        const nextDur = Number(
          Math.max(0.1, Math.min(maxTrans, drag.origDur + deltaSec)).toFixed(2)
        );
        onUpdateClip(
          drag.id,
          {
            transitionIn: {
              type: clip.transitionIn?.type ?? 'x-dissolve',
              durationSec: nextDur,
            },
          },
          false
        );
      } else if (drag.mode === 'trans-out') {
        const clip = videoClips.find((c) => c.id === drag.id);
        if (!clip) return;
        const maxTrans = Math.max(0.2, Math.min(5.0, (clip.timelineEnd - clip.timelineStart) * 0.8));
        const nextDur = Number(
          Math.max(0.1, Math.min(maxTrans, drag.origDur - deltaSec)).toFixed(2)
        );
        onUpdateClip(
          drag.id,
          {
            transitionOut: {
              type: clip.transitionOut?.type ?? 'x-dissolve',
              durationSec: nextDur,
            },
          },
          false
        );
      }
    };
    const onWinMouseUp = () => {
      if (clipDragRef.current) setSnapGuideTime(null);
      clipDragRef.current = null;
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [
    timelineDuration,
    duration,
    currentTime,
    snapEnabled,
    segments,
    videoClips,
    rangedTextLayers,
    onTrimClipEdge,
    onMoveClip,
    onUpdateClip,
  ]);

  // 특정 구간 텍스트 트랙 길이 조절 / 이동 드래그 처리 (자석 스냅 지원)
  useEffect(() => {
    const onWinMouseMove = (e: MouseEvent) => {
      const drag = textDragRef.current;
      const trackEl = textTrackRef.current;
      if (!drag || !trackEl || timelineDuration <= 0) return;

      const trackWidth = trackEl.getBoundingClientRect().width;
      if (trackWidth <= 0) return;
      const deltaSec = ((e.clientX - drag.startX) / trackWidth) * displayDuration;
      const minDur = 0.2;
      const useSnap = snapEnabled && !e.altKey;
      const thresholdSec = (8 / trackWidth) * displayDuration;
      const pts = useSnap ? collectSnapPoints({ textId: drag.id }) : [];

      if (drag.mode === 'move') {
        const len = Math.max(minDur, drag.origEnd - drag.origStart);
        let rawStart = drag.origStart + deltaSec;
        if (useSnap) {
          const res = snapMoveStart(rawStart, len, pts, thresholdSec);
          rawStart = res.startTime;
          setSnapGuideTime(res.snappedTo);
        } else {
          setSnapGuideTime(null);
        }
        const nextStart = Math.max(0, Math.min(timelineDuration - len, rawStart));
        onUpdateTextLayer(
          drag.id,
          {
            startTime: Number(nextStart.toFixed(2)),
            endTime: Number((nextStart + len).toFixed(2)),
          },
          false
        );
      } else if (drag.mode === 'trim-start') {
        let rawStart = drag.origStart + deltaSec;
        if (useSnap) {
          const res = snapEdgeTime(rawStart, pts, thresholdSec);
          rawStart = res.time;
          setSnapGuideTime(res.snappedTo);
        } else {
          setSnapGuideTime(null);
        }
        const nextStart = Math.max(0, Math.min(drag.origEnd - minDur, rawStart));
        onUpdateTextLayer(
          drag.id,
          {
            startTime: Number(nextStart.toFixed(2)),
          },
          false
        );
      } else if (drag.mode === 'trim-end') {
        let rawEnd = drag.origEnd + deltaSec;
        if (useSnap) {
          const res = snapEdgeTime(rawEnd, pts, thresholdSec);
          rawEnd = res.time;
          setSnapGuideTime(res.snappedTo);
        } else {
          setSnapGuideTime(null);
        }
        const nextEnd = Math.min(
          timelineDuration,
          Math.max(drag.origStart + minDur, rawEnd)
        );
        onUpdateTextLayer(
          drag.id,
          {
            endTime: Number(nextEnd.toFixed(2)),
          },
          false
        );
      }
    };
    const onWinMouseUp = () => {
      if (textDragRef.current) setSnapGuideTime(null);
      textDragRef.current = null;
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [
    timelineDuration,
    duration,
    currentTime,
    snapEnabled,
    segments,
    videoClips,
    rangedTextLayers,
    onUpdateTextLayer,
  ]);

  // 시간 눈금자 / 재생헤드 드래그 스크러빙
  useEffect(() => {
    const seekFromClientX = (clientX: number) => {
      const rulerEl = rulerRef.current;
      if (!rulerEl || displayDuration <= 0) return;
      const rect = rulerEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(Math.min(timelineDuration, ratio * displayDuration));
    };
    const onWinMouseMove = (e: MouseEvent) => {
      if (!isRulerDraggingRef.current) return;
      seekFromClientX(e.clientX);
    };
    const onWinMouseUp = () => {
      isRulerDraggingRef.current = false;
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [timelineDuration, displayDuration, onSeek]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const isLight = appTheme === 'light-gray' || appTheme === 'white';
    const canvasBg =
      appTheme === 'white'
        ? '#f8fafc'
        : appTheme === 'light-gray'
          ? '#e2e8f0'
          : appTheme === 'dark-gray'
            ? '#141417'
            : '#070b19';
    const emptyTextColor = isLight ? '#334155' : '#94a3b8';

    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, width, height);

    if (timelineDuration <= 0) {
      ctx.fillStyle = emptyTextColor;
      ctx.font = '13px "Sorisoop-Pretendard"';
      ctx.textAlign = 'center';
      ctx.fillText('노래 음원 파일을 업로드하면 파형이 표시됩니다.', width / 2, height / 2);
      return;
    }

    // 세그먼트 블록 하이라이트 (모든 트랙 공통 시간축 displayDuration 기준)
    for (const seg of segments) {
      const x1 = (seg.startTime / displayDuration) * width;
      const x2 = (seg.endTime / displayDuration) * width;
      const isSelected = seg.id === selectedSegmentId;
      const isActive = currentTime >= seg.startTime && currentTime <= seg.endTime;

      ctx.fillStyle = isLight
        ? isSelected
          ? 'rgba(14, 165, 233, 0.22)'
          : isActive
            ? 'rgba(14, 165, 233, 0.14)'
            : 'rgba(99, 102, 241, 0.10)'
        : isSelected
          ? 'rgba(56, 189, 248, 0.30)'
          : isActive
            ? 'rgba(56, 189, 248, 0.18)'
            : 'rgba(99, 102, 241, 0.13)';
      ctx.fillRect(x1, 0, Math.max(2, x2 - x1), height);

      // 시작/끝 경계 드래그 핸들 라인
      ctx.fillStyle = isSelected
        ? isLight
          ? '#0284c7'
          : '#22d3ee'
        : 'rgba(129, 140, 248, 0.7)';
      ctx.fillRect(x1, 0, isSelected ? 2.5 : 1.5, height);
      ctx.fillRect(x2 - (isSelected ? 2.5 : 1.5), 0, isSelected ? 2.5 : 1.5, height);
    }

    // 파형 렌더링 (음원 길이 duration만큼만 displayDuration 비율에 맞춰 배치)
    if (peaks && peaks.length > 0 && duration > 0) {
      const midY = height / 2;
      const audioWidth = (duration / displayDuration) * width;
      const sourceDur =
        audioSourceDuration && audioSourceDuration > 0 ? audioSourceDuration : duration;
      const visibleCount = Math.max(
        1,
        Math.min(peaks.length, Math.round((duration / sourceDur) * peaks.length))
      );

      // 오디오 실제 구간 배경 강조 & 오디오 이후 빈 구간 구분
      ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.05)' : 'rgba(56, 189, 248, 0.05)';
      ctx.fillRect(0, 0, audioWidth, height);
      if (audioWidth < width) {
        ctx.fillStyle = isLight ? 'rgba(148, 163, 184, 0.16)' : 'rgba(2, 6, 23, 0.5)';
        ctx.fillRect(audioWidth, 0, width - audioWidth, height);
      }

      const barWidth = audioWidth / visibleCount;
      for (let i = 0; i < visibleCount; i++) {
        const amp = peaks[i];
        const barH = Math.max(2, amp * (height * 0.78));
        const x = i * barWidth;
        const t = (i / visibleCount) * duration;
        ctx.fillStyle = t <= currentTime ? (isLight ? '#0284c7' : '#38bdf8') : '#4f46e5';
        ctx.fillRect(x, midY - barH / 2, Math.max(1, barWidth - 0.5), barH);
      }

      // 오디오 처음(0s) / 끝(duration) 경계선
      ctx.fillStyle = isLight ? 'rgba(2, 132, 199, 0.85)' : 'rgba(56, 189, 248, 0.85)';
      ctx.fillRect(0, 0, 2, height);
      ctx.fillRect(Math.max(0, audioWidth - 2), 0, 2, height);
    } else if (duration <= 0) {
      ctx.fillStyle = emptyTextColor;
      ctx.font = '12px "Sorisoop-Pretendard"';
      ctx.textAlign = 'center';
      ctx.fillText('노래 음원 파일을 업로드하면 파형이 표시됩니다.', width / 2, height / 2);
    }

    // 재생 헤드
    const playX = (currentTime / displayDuration) * width;
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(playX - 1, 0, 2, height);
  }, [peaks, duration, audioSourceDuration, timelineDuration, displayDuration, currentTime, segments, selectedSegmentId, zoom, appTheme]);

  const getTimeFromClientX = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || displayDuration <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.min(timelineDuration, ratio * displayDuration);
  };

  const hitTestEdge = (clientX: number): { id: string; edge: 'start' | 'end' } | null => {
    const canvas = canvasRef.current;
    if (!canvas || displayDuration <= 0) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const hitTolerancePx = 7;

    // 선택된 세그먼트 우선 검사 후 나머지 세그먼트 검사
    const ordered = [...segments].sort((a, b) =>
      a.id === selectedSegmentId ? -1 : b.id === selectedSegmentId ? 1 : 0
    );

    for (const seg of ordered) {
      const startX = (seg.startTime / displayDuration) * rect.width;
      const endX = (seg.endTime / displayDuration) * rect.width;
      if (Math.abs(clickX - startX) <= hitTolerancePx) {
        return { id: seg.id, edge: 'start' };
      }
      if (Math.abs(clickX - endX) <= hitTolerancePx) {
        return { id: seg.id, edge: 'end' };
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const edgeHit = hitTestEdge(e.clientX);
    if (edgeHit) {
      dragRef.current = { mode: 'resize', ...edgeHit, moved: false };
      const seg = segments.find((s) => s.id === edgeHit.id);
      if (seg) onSelectSegment(seg);
      return;
    }

    const t = getTimeFromClientX(e.clientX);
    const clickedSeg = segments.find((s) => t >= s.startTime && t <= s.endTime);
    if (clickedSeg) {
      dragRef.current = {
        mode: 'move',
        id: clickedSeg.id,
        offsetSec: t - clickedSeg.startTime,
        moved: false,
      };
      setHoverCursor('grabbing');
      onSelectSegment(clickedSeg);
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    if (dragRef.current) {
      if (!dragRef.current.moved) {
        dragRef.current.moved = true;
        onBeginDrag();
      }
      const newTime = getTimeFromClientX(e.clientX);
      const canvasW = canvasRef.current?.getBoundingClientRect().width || 920;
      const thresholdSec = (8 / canvasW) * displayDuration;
      const useSnap = snapEnabled && !e.altKey;

      if (dragRef.current.mode === 'resize') {
        if (useSnap) {
          const pts = collectSnapPoints({ segmentId: dragRef.current.id });
          const res = snapEdgeTime(newTime, pts, thresholdSec);
          setSnapGuideTime(res.snappedTo);
          onResizeSegmentEdge(dragRef.current.id, dragRef.current.edge, res.time);
        } else {
          setSnapGuideTime(null);
          onResizeSegmentEdge(dragRef.current.id, dragRef.current.edge, newTime);
        }
      } else {
        const rawStart = newTime - dragRef.current.offsetSec;
        const seg = segments.find((s) => s.id === dragRef.current?.id);
        const len = seg ? Math.max(0.1, seg.endTime - seg.startTime) : 0;
        if (useSnap && len > 0) {
          const pts = collectSnapPoints({ segmentId: dragRef.current.id });
          const res = snapMoveStart(rawStart, len, pts, thresholdSec);
          setSnapGuideTime(res.snappedTo);
          onMoveSegment(dragRef.current.id, res.startTime);
        } else {
          setSnapGuideTime(null);
          onMoveSegment(dragRef.current.id, rawStart);
        }
      }
      return;
    }

    if (hitTestEdge(e.clientX) !== null) {
      setHoverCursor('ew-resize');
    } else {
      const t = getTimeFromClientX(e.clientX);
      const inside = segments.some((s) => t >= s.startTime && t <= s.endTime);
      setHoverCursor(inside ? 'grab' : 'pointer');
    }
  };

  const handleMouseUpOrLeave = () => {
    dragRef.current = null;
    setSnapGuideTime(null);
    setHoverCursor('pointer');
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-cyan-300">
            {formatTime(currentTime)}
          </span>
          <span className="text-slate-500">/</span>
          <span className="font-mono text-slate-400">{formatTime(duration)}</span>
          <span className="hidden text-[10px] text-slate-500 sm:inline">
            (가사 경계선 드래그로 길이 조절 · Space 재생/정지 · ↑↓ 구간 이동)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-35"
            title="실행 취소 (Ctrl/Cmd+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="mr-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-35"
            title="다시 실행 (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomAroundPlayhead(1 / 1.25)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700"
            title="축소 (- / Alt+휠)"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[46px] text-center font-mono text-[11px] text-slate-300">
            {Number(zoom.toFixed(2))}x
          </span>
          <button
            type="button"
            onClick={() => zoomAroundPlayhead(1.25)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700"
            title="확대 (= / Alt+휠)"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={fitAllTimeline}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
            title="전체보기 (\ · 타임라인 85% 맞춤)"
          >
            전체보기
          </button>
          <button
            type="button"
            onClick={() => setSnapEnabled((v) => !v)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              snapEnabled
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title="자석 스냅 켜기/끄기 (드래그 중 Alt 키를 누르면 일시 해제)"
          >
            <Magnet className="h-3 w-3" />
            자석 {snapEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={onAddSegmentAtCurrent}
            disabled={duration <= 0}
            className="ml-2 flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            가사 구간 추가
          </button>
        </div>
      </div>

      {/* 영상 트랙 편집 툴바 (오디오 트랙 위) */}
      {(duration > 0 || videoClips.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/70 px-2.5 py-1.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 font-semibold text-emerald-300">
              <Film className="h-3.5 w-3.5" /> 영상 트랙 ({videoClips.length})
            </span>
            <button
              type="button"
              onClick={onAppendMedia}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
              title="끝에 영상/사진 추가"
            >
              <Plus className="h-3 w-3 text-emerald-400" /> 추가
            </button>
            <button
              type="button"
              onClick={onInsertMediaAtCurrent}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
              title="현재 재생헤드 위치에 삽입(Insert)"
            >
              <ArrowDownToLine className="h-3 w-3 text-cyan-400" /> Insert
            </button>
            <button
              type="button"
              onClick={onSplitClip}
              disabled={videoClips.length === 0}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-35"
              title="현재 재생헤드 위치에서 선택/활성 클립 분할"
            >
              <Scissors className="h-3 w-3 text-amber-300" /> 분할
            </button>
            <button
              type="button"
              onClick={onJoinClipGaps}
              disabled={videoClips.length < 2}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-35"
              title="클립 사이 빈틈 이어 붙이기"
            >
              <Link2 className="h-3 w-3 text-indigo-300" /> 이어 붙이기
            </button>
            <button
              type="button"
              onClick={() => selectedClipId && onDeleteClip(selectedClipId)}
              disabled={!selectedClipId}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-rose-300 hover:bg-rose-500/20 disabled:opacity-35"
              title="선택한 영상/사진 클립 삭제"
            >
              <Trash2 className="h-3 w-3" /> 삭제
            </button>
          </div>

          {(() => {
            const selClip = videoClips.find((c) => c.id === selectedClipId);
            if (!selClip) return null;
            const trans = selClip.transitionIn ?? {
              type: 'none' as TransitionType,
              durationSec: DEFAULT_TRANSITION_DURATION,
            };
            return (
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-300">
                <label className="flex items-center gap-1">
                  <span className="text-slate-400">투명도</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selClip.opacity}
                    onChange={(e) =>
                      onUpdateClip(selClip.id, { opacity: Number(e.target.value) })
                    }
                    className="w-16 accent-emerald-400"
                  />
                  <span className="w-7 font-mono">{Math.round(selClip.opacity * 100)}%</span>
                </label>

                <label className="flex items-center gap-1">
                  <span className="text-slate-400">블러</span>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={selClip.blur ?? 0}
                    onChange={(e) =>
                      onUpdateClip(selClip.id, { blur: Number(e.target.value) })
                    }
                    className="w-16 accent-cyan-400"
                  />
                  <span className="w-8 font-mono">{selClip.blur ?? 0}px</span>
                </label>

                {selClip.mediaType === 'video' && (
                  <label className="flex items-center gap-1.5 text-[10px] text-emerald-200/80">
                    <span>속도</span>
                    <select
                      value={String(selClip.playbackRate ?? 1)}
                      onChange={(e) =>
                        onUpdateClip(selClip.id, {
                          playbackRate: Number(e.target.value),
                        })
                      }
                      className="rounded border border-emerald-700/70 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200 focus:border-emerald-400 focus:outline-none"
                      title="선택한 영상 클립의 재생 속도"
                    >
                      {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((r) => (
                        <option key={r} value={String(r)}>
                          {r}x
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => onUpdateClip(selClip.id, { fitToFrame: !selClip.fitToFrame })}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
                    selClip.fitToFrame
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  title="프레임에 맞추기 (꽉 채우기 / 원본 비율)"
                >
                  <Maximize2 className="h-3 w-3" />
                  {selClip.fitToFrame ? '프레임 맞춤' : '원본 비율'}
                </button>

                <div className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-cyan-400" />
                  <select
                    value={trans.type}
                    onChange={(e) =>
                      onUpdateClip(selClip.id, {
                        transitionIn: {
                          type: e.target.value as TransitionType,
                          durationSec: trans.durationSec || DEFAULT_TRANSITION_DURATION,
                        },
                      })
                    }
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300"
                  >
                    {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((tKey) => (
                      <option key={tKey} value={tKey}>
                        {TRANSITION_LABELS[tKey]}
                      </option>
                    ))}
                  </select>
                  {trans.type !== 'none' && (
                    <div className="flex items-center gap-0.5">
                      <NumberInput
                        min={0.1}
                        max={5}
                        step={0.1}
                        value={trans.durationSec}
                        onChange={(val) =>
                          onUpdateClip(selClip.id, {
                            transitionIn: {
                              ...trans,
                              durationSec: val,
                            },
                          })
                        }
                        className="w-12 rounded bg-slate-800 px-1 py-0.5 text-center font-mono text-cyan-200"
                        title="트랜지션 시간(초) - 기본 1.0초(30프레임)"
                      />
                      <span className="text-slate-400">
                        s ({Math.round(trans.durationSec * 30)}f)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div
          ref={scrollContainerRef}
          className="max-h-60 min-w-0 flex-1 overflow-x-scroll overflow-y-auto rounded-lg border border-slate-800 bg-slate-950"
        >
          <div className="relative" style={{ width: `${Math.max(100, 100 * zoom)}%` }}>
            {/* 통합 시간 눈금자 (Time Ruler) */}
            <div
              ref={rulerRef}
              onMouseDown={(e) => {
                if (e.button !== 0 || displayDuration <= 0) return;
                e.preventDefault();
                isRulerDraggingRef.current = true;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onSeek(Math.min(timelineDuration, ratio * displayDuration));
              }}
              className="sticky top-0 z-20 h-5 cursor-ew-resize border-b border-slate-800 bg-slate-900/95 select-none"
              title="클릭 또는 드래그하여 재생헤드 이동"
            >
              {displayDuration > 0 &&
                (() => {
                  const stepSec = zoom >= 4 ? 5 : zoom >= 2 ? 10 : 15;
                  const ticks: number[] = [];
                  for (let t = 0; t <= displayDuration; t += stepSec) ticks.push(t);
                  return ticks.map((t) => {
                    const leftPct = (t / displayDuration) * 100;
                    const mm = Math.floor(t / 60);
                    const ss = Math.floor(t % 60);
                    return (
                      <div
                        key={t}
                        style={{ left: `${leftPct}%` }}
                        className="absolute top-0 bottom-0 flex flex-col justify-between border-l border-slate-700/80 pl-1"
                      >
                        <span className="font-mono text-[9px] leading-none text-slate-400 pt-0.5">
                          {mm}:{String(ss).padStart(2, '0')}
                        </span>
                      </div>
                    );
                  });
                })()}
            </div>

            {/* 텍스트 트랙 (특정 구간 텍스트가 1개 이상일 때 각 텍스트마다 개별 트랙으로 표시) */}
            {rangedTextLayers.length > 0 && (
              <div ref={textTrackRef}>
                {rangedTextLayers.map((layer, idx) => {
                  const leftPct =
                    displayDuration > 0 ? (layer.startTime / displayDuration) * 100 : 0;
                  const widthPct =
                    displayDuration > 0
                      ? Math.max(
                          1.2,
                          ((layer.endTime - layer.startTime) / displayDuration) * 100
                        )
                      : 0;
                  const isSelected = layer.id === selectedTextLayerId;
                  const inTrans = layer.transitionIn;
                  const hasIn = inTrans && inTrans.type !== 'none';
                  const outTrans = layer.transitionOut;
                  const hasOut = outTrans && outTrans.type !== 'none';

                  return (
                    <div
                      key={layer.id}
                      onClick={() => onSelectTextLayer(null)}
                      className="relative h-8 border-b border-slate-800 bg-slate-950/90"
                    >
                      <div className="pointer-events-none absolute top-0.5 left-1.5 z-10 flex items-center gap-1 text-[9px] font-semibold text-violet-300/65">
                        <Type className="h-2.5 w-2.5" />
                        <span>T{idx + 1}</span>
                      </div>
                      {timelineDuration > 0 && (
                        <div
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            onSelectTextLayer(layer.id);
                            onBeginDrag();
                            textDragRef.current = {
                              mode: 'move',
                              id: layer.id,
                              startX: e.clientX,
                              origStart: layer.startTime,
                              origEnd: layer.endTime,
                            };
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectTextLayer(layer.id);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
                            const side: 'in' | 'out' = relX <= 0.5 ? 'in' : 'out';
                            const clickTime =
                              layer.startTime + relX * (layer.endTime - layer.startTime);
                            setSourceContextMenu({
                              kind: 'text',
                              id: layer.id,
                              x: e.clientX,
                              y: e.clientY,
                              clickTime,
                              side,
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title="드래그: 이동 · 양쪽 끝 드래그: 길이 조절 · 우클릭: 메뉴"
                          className={`group absolute top-0.5 bottom-0.5 flex cursor-grab items-center overflow-hidden rounded-md border px-2 transition active:cursor-grabbing ${
                            isSelected
                              ? 'border-violet-400 bg-violet-950/85 ring-1 ring-violet-400/50'
                              : 'border-violet-700/70 bg-violet-950/55 hover:border-violet-500/80'
                          }`}
                        >
                          {/* 시작 트랜지션 표시 */}
                          {hasIn && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTextLayer(layer.id);
                                setTextTransitionModal({
                                  layerId: layer.id,
                                  side: 'in',
                                  titleLabel: `${layer.text.trim() || `#${idx + 1} 텍스트`} · 시작 트랜지션 (In)`,
                                  type: inTrans.type,
                                  durationSec: inTrans.durationSec,
                                });
                              }}
                              className="mr-1 shrink-0 rounded bg-cyan-500/25 px-1 py-0.5 text-[8px] font-bold text-cyan-200 hover:bg-cyan-500/40"
                              title={`시작 트랜지션: ${TEXT_TRANSITION_LABELS[inTrans.type]} (${inTrans.durationSec}s)`}
                            >
                              In {inTrans.durationSec}s
                            </button>
                          )}

                          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-violet-100 pointer-events-none">
                            {layer.text.trim() || `#${idx + 1} (빈 텍스트)`}{' '}
                            <span className="font-mono text-[9px] text-violet-300/80">
                              ({(layer.endTime - layer.startTime).toFixed(1)}s)
                            </span>
                          </span>

                          {/* 끝 트랜지션 표시 */}
                          {hasOut && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTextLayer(layer.id);
                                setTextTransitionModal({
                                  layerId: layer.id,
                                  side: 'out',
                                  titleLabel: `${layer.text.trim() || `#${idx + 1} 텍스트`} · 끝 트랜지션 (Out)`,
                                  type: outTrans.type,
                                  durationSec: outTrans.durationSec,
                                });
                              }}
                              className="ml-1 shrink-0 rounded bg-amber-500/25 px-1 py-0.5 text-[8px] font-bold text-amber-200 hover:bg-amber-500/40"
                              title={`끝 트랜지션: ${TEXT_TRANSITION_LABELS[outTrans.type]} (${outTrans.durationSec}s)`}
                            >
                              Out {outTrans.durationSec}s
                            </button>
                          )}

                          {/* 왼쪽 길이 조절 핸들 */}
                          <div
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              onSelectTextLayer(layer.id);
                              onBeginDrag();
                              textDragRef.current = {
                                mode: 'trim-start',
                                id: layer.id,
                                startX: e.clientX,
                                origStart: layer.startTime,
                                origEnd: layer.endTime,
                              };
                            }}
                            className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize bg-violet-300/20 opacity-0 transition group-hover:opacity-100 hover:bg-violet-300/60"
                            title="드래그하여 시작 시간 조절"
                          />

                          {/* 오른쪽 길이 조절 핸들 */}
                          <div
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              onSelectTextLayer(layer.id);
                              onBeginDrag();
                              textDragRef.current = {
                                mode: 'trim-end',
                                id: layer.id,
                                startX: e.clientX,
                                origStart: layer.startTime,
                                origEnd: layer.endTime,
                              };
                            }}
                            className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize bg-violet-300/20 opacity-0 transition group-hover:opacity-100 hover:bg-violet-300/60"
                            title="드래그하여 끝 시간 조절"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 영상 트랙 (오디오 트랙 위) */}
            <div
              ref={videoTrackRef}
              onClick={() => {
                onSelectClip(null);
                setEditingTransClipId(null);
              }}
              className="relative h-14 border-b border-slate-800 bg-slate-950/90"
            >
              {videoClips.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[11px] text-slate-400">
                  배경 영상 또는 사진(기본 5초 · 150프레임)을 추가하면 영상 트랙이 표시됩니다
                </div>
              ) : (
                displayDuration > 0 &&
                videoClips.map((clip) => {
                  const leftPct = (clip.timelineStart / displayDuration) * 100;
                  const widthPct = Math.max(
                    0.5,
                    ((clip.timelineEnd - clip.timelineStart) / displayDuration) * 100
                  );
                  const isSelected = clip.id === selectedClipId;
                  const trans = clip.transitionIn;
                  const hasTrans = trans && trans.type !== 'none';
                  const transWidthPct = hasTrans
                    ? Math.min(
                        widthPct,
                        (trans.durationSec / Math.max(0.1, displayDuration)) * 100
                      )
                    : 0;
                  const transOut = clip.transitionOut;
                  const hasTransOut = transOut && transOut.type !== 'none';
                  const transOutWidthPct = hasTransOut
                    ? Math.min(
                        widthPct,
                        (transOut.durationSec / Math.max(0.1, displayDuration)) * 100
                      )
                    : 0;

                  return (
                    <div
                      key={clip.id}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        onSelectClip(clip.id);
                        onBeginDrag();
                        clipDragRef.current = {
                          mode: 'move',
                          id: clip.id,
                          startX: e.clientX,
                          origStart: clip.timelineStart,
                          origEnd: clip.timelineEnd,
                        };
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectClip(clip.id);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
                        const side: 'in' | 'out' = relX <= 0.5 ? 'in' : 'out';
                        const clickTime =
                          clip.timelineStart + relX * (clip.timelineEnd - clip.timelineStart);
                        setSourceContextMenu({
                          kind: 'clip',
                          id: clip.id,
                          x: e.clientX,
                          y: e.clientY,
                          clickTime,
                          side,
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="드래그: 이동 · 우클릭: 메뉴 (삭제/잘라내기/전구간/트랜지션)"
                      className={`group absolute top-1 bottom-1 flex cursor-grab items-center overflow-hidden rounded-md border transition active:cursor-grabbing ${
                        isSelected
                          ? 'border-emerald-400 bg-emerald-950/70 ring-1 ring-emerald-400/50'
                          : 'border-emerald-700/60 bg-emerald-950/40 hover:border-emerald-500/80'
                      }`}
                    >
                      {/* 첫 번째 섬네일 프레임 */}
                      {clip.thumbnailUrl && (
                        <img
                          src={clip.thumbnailUrl}
                          alt={clip.name}
                          className="h-full w-12 shrink-0 object-cover opacity-90 pointer-events-none"
                        />
                      )}

                      <div className="min-w-0 flex-1 px-1.5 py-0.5 pointer-events-none">
                        <p className="truncate text-[10px] font-semibold text-emerald-100">
                          {clip.name}
                        </p>
                        <p className="font-mono text-[9px] text-emerald-300/80">
                          {(clip.timelineEnd - clip.timelineStart).toFixed(1)}s ·{' '}
                          {Math.round(clip.opacity * 100)}%
                          {clip.mediaType === 'video' && (clip.playbackRate ?? 1) !== 1 && (
                            <span className="ml-1 rounded bg-emerald-400/20 px-1 text-[8px] font-bold text-emerald-200">
                              {Number((clip.playbackRate ?? 1).toFixed(2))}x
                            </span>
                          )}
                        </p>
                      </div>

                      {/* 트랜지션 영역 표시 (드래그/클릭 시간 조절) */}
                      {hasTrans && (
                        <div
                          style={{ width: `${(transWidthPct / widthPct) * 100}%` }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectClip(clip.id);
                            setEditingTransClipId(
                              editingTransClipId === clip.id ? null : clip.id
                            );
                          }}
                          className="absolute top-0 bottom-0 left-0 z-10 flex items-end bg-gradient-to-r from-cyan-500/45 to-cyan-500/10 border-r border-cyan-300/80 cursor-pointer"
                          title={`트랜지션: ${TRANSITION_LABELS[trans.type]} (${trans.durationSec}s / ${Math.round(
                            trans.durationSec * 30
                          )}f) — 클릭 또는 우측 경계 드래그로 조절`}
                        >
                          <span className="truncate px-1 pb-0.5 text-[8px] font-bold text-cyan-100">
                            {TRANSITION_LABELS[trans.type]} {trans.durationSec}s
                          </span>
                          {/* 트랜지션 길이 드래그 핸들 */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              onSelectClip(clip.id);
                              onBeginDrag();
                              clipDragRef.current = {
                                mode: 'trans',
                                id: clip.id,
                                startX: e.clientX,
                                origDur: trans.durationSec,
                              };
                            }}
                            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize bg-cyan-300/60 hover:bg-cyan-200"
                          />
                        </div>
                      )}

                      {/* 끝(Out) 트랜지션 영역 표시 */}
                      {hasTransOut && (
                        <div
                          style={{ width: `${(transOutWidthPct / widthPct) * 100}%` }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectClip(clip.id);
                            setTransitionModal({
                              clipId: clip.id,
                              side: 'out',
                              titleLabel: `${clip.name} · 끝 트랜지션 (Out)`,
                              type: transOut.type,
                              durationSec: transOut.durationSec,
                            });
                          }}
                          className="absolute top-0 right-0 bottom-0 z-10 flex items-end justify-end bg-gradient-to-l from-amber-500/45 to-amber-500/10 border-l border-amber-300/80 cursor-pointer"
                          title={`끝 트랜지션: ${TRANSITION_LABELS[transOut.type]} (${transOut.durationSec}s / ${Math.round(
                            transOut.durationSec * 30
                          )}f) — 클릭 또는 좌측 경계 드래그로 조절`}
                        >
                          <span className="truncate px-1 pb-0.5 text-[8px] font-bold text-amber-100">
                            {TRANSITION_LABELS[transOut.type]} {transOut.durationSec}s
                          </span>
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              onSelectClip(clip.id);
                              onBeginDrag();
                              clipDragRef.current = {
                                mode: 'trans-out',
                                id: clip.id,
                                startX: e.clientX,
                                origDur: transOut.durationSec,
                              };
                            }}
                            className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize bg-amber-300/60 hover:bg-amber-200"
                          />
                        </div>
                      )}

                      {/* 인라인 트랜지션 시간 입력 팝오버 */}
                      {editingTransClipId === clip.id && hasTrans && (
                        <div
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-1 left-2 z-30 flex items-center gap-1 rounded border border-cyan-400 bg-slate-900 px-1.5 py-0.5 text-[10px] shadow-xl"
                        >
                          <NumberInput
                            min={0.1}
                            max={5}
                            step={0.1}
                            value={trans.durationSec}
                            onChange={(val) =>
                              onUpdateClip(clip.id, {
                                transitionIn: {
                                  ...trans,
                                  durationSec: val,
                                },
                              })
                            }
                            className="w-11 rounded bg-slate-950 px-1 py-0.5 font-mono text-cyan-200"
                          />
                          <span className="text-slate-400">초</span>
                          <button
                            type="button"
                            onClick={() => setEditingTransClipId(null)}
                            className="rounded bg-cyan-500 px-1 text-slate-950 font-bold"
                          >
                            확인
                          </button>
                        </div>
                      )}

                      {/* 앞(좌) 트림 핸들 */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onSelectClip(clip.id);
                          onBeginDrag();
                          clipDragRef.current = {
                            mode: 'trim-start',
                            id: clip.id,
                            startX: e.clientX,
                            origStart: clip.timelineStart,
                            origEnd: clip.timelineEnd,
                          };
                        }}
                        className="absolute top-0 bottom-0 left-0 z-20 w-1.5 cursor-ew-resize bg-emerald-300/40 opacity-0 group-hover:opacity-100 hover:bg-emerald-300"
                        title="앞 길이 조절 (트림)"
                      />

                      {/* 뒤(우) 트림 핸들 */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onSelectClip(clip.id);
                          onBeginDrag();
                          clipDragRef.current = {
                            mode: 'trim-end',
                            id: clip.id,
                            startX: e.clientX,
                            origStart: clip.timelineStart,
                            origEnd: clip.timelineEnd,
                          };
                        }}
                        className="absolute top-0 right-0 bottom-0 z-20 w-1.5 cursor-ew-resize bg-emerald-300/40 opacity-0 group-hover:opacity-100 hover:bg-emerald-300"
                        title="뒤 길이 조절 (트림)"
                      />
                    </div>
                  );
                })
              )}

              {/* 클립 이어진 경계(접합부) 클릭 버튼 → 트랜지션 적용 창 열기 */}
              {displayDuration > 0 &&
                (() => {
                  const sorted = [...videoClips].sort(
                    (a, b) => a.timelineStart - b.timelineStart
                  );
                  return sorted.slice(0, -1).map((prevClip, i) => {
                    const nextClip = sorted[i + 1];
                    if (Math.abs(nextClip.timelineStart - prevClip.timelineEnd) > 0.15) {
                      return null;
                    }
                    const leftPct = (nextClip.timelineStart / displayDuration) * 100;
                    const activeTrans = nextClip.transitionIn;
                    const isActive = activeTrans && activeTrans.type !== 'none';
                    return (
                      <button
                        key={`junc-${prevClip.id}-${nextClip.id}`}
                        type="button"
                        style={{ left: `${leftPct}%` }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectClip(nextClip.id);
                          setTransitionModal({
                            clipId: nextClip.id,
                            side: 'in',
                            titleLabel: `${prevClip.name} → ${nextClip.name}`,
                            type: activeTrans?.type ?? 'x-dissolve',
                            durationSec: activeTrans?.durationSec ?? DEFAULT_TRANSITION_DURATION,
                          });
                        }}
                        className={`absolute top-1/2 z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border text-[10px] shadow-md transition hover:scale-110 ${
                          isActive
                            ? 'border-cyan-300 bg-cyan-500 text-slate-950'
                            : 'border-slate-500 bg-slate-900/95 text-slate-200 hover:border-cyan-400 hover:text-cyan-300'
                        }`}
                        title={
                          isActive
                            ? `트랜지션 편집: ${TRANSITION_LABELS[activeTrans.type]} (${activeTrans.durationSec}s)`
                            : '클릭하여 트랜지션 적용'
                        }
                      >
                        <Sparkles className="h-3 w-3" />
                      </button>
                    );
                  });
                })()}
            </div>

            {/* 오디오 트랙 캔버스 + 처음/끝 경계 및 길이 조절 핸들 */}
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={Math.round(920 * Math.max(1, zoom))}
                height={96}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                className={`block h-24 w-full ${
                  hoverCursor === 'ew-resize'
                    ? 'cursor-ew-resize'
                    : hoverCursor === 'grabbing'
                      ? 'cursor-grabbing'
                      : hoverCursor === 'grab'
                        ? 'cursor-grab'
                        : 'cursor-pointer'
                }`}
              />

              {duration > 0 && displayDuration > 0 && (
                <>
                  {/* 오디오 시작/끝 경계 배지 */}
                  <div className="pointer-events-none absolute top-1 left-1.5 z-10 rounded bg-sky-950/80 px-1 py-0.5 font-mono text-[9px] font-semibold text-sky-300 border border-sky-500/40">
                    0:00
                  </div>
                  <div
                    style={{
                      left: `${Math.min(100, (duration / displayDuration) * 100)}%`,
                    }}
                    className="pointer-events-none absolute top-1 z-10 -translate-x-full pr-2"
                  >
                    <span className="rounded bg-sky-950/85 px-1 py-0.5 font-mono text-[9px] font-semibold text-sky-300 border border-sky-500/40">
                      {Math.floor(duration / 60)}:
                      {String(Math.floor(duration % 60)).padStart(2, '0')}
                    </span>
                  </div>

                  {/* 오디오 오른쪽 끝 길이 조절(트림) 드래그 핸들 */}
                  {onChangeAudioDuration && (
                    <div
                      style={{
                        left: `${Math.min(100, (duration / displayDuration) * 100)}%`,
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        e.preventDefault();
                        audioEndDragRef.current = { startX: e.clientX, origDur: duration };
                      }}
                      className="group absolute top-0 bottom-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize flex items-center justify-center"
                      title={`드래그하여 오디오 길이 조절 (현재 ${duration.toFixed(1)}s / 원본 ${(audioSourceDuration || duration).toFixed(1)}s)`}
                    >
                      <div className="h-full w-0.5 bg-sky-400/90 transition group-hover:w-1 group-hover:bg-sky-300" />
                      <div className="absolute h-6 w-2 rounded-sm border border-sky-300/80 bg-sky-500/90 shadow opacity-85 transition group-hover:opacity-100" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 자석 스냅 가이드라인 */}
            {displayDuration > 0 && snapGuideTime !== null && (
              <div
                style={{
                  left: `${Math.min(100, Math.max(0, (snapGuideTime / displayDuration) * 100))}%`,
                }}
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-[2px] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.95)]"
              />
            )}

            {/* 눈금자 + 영상 트랙 + 오디오 트랙 관통 재생헤드 */}
            {displayDuration > 0 && (
              <div
                style={{
                  left: `${Math.min(100, Math.max(0, (currentTime / displayDuration) * 100))}%`,
                }}
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-[2px] bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.9)]"
              >
                <div
                  onMouseDown={(e) => {
                    if (e.button !== 0 || timelineDuration <= 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    isRulerDraggingRef.current = true;
                  }}
                  className="pointer-events-auto absolute -top-0.5 -left-[6px] h-3 w-3.5 cursor-ew-resize rounded-b-sm bg-rose-500 shadow"
                  title="드래그하여 재생헤드 이동"
                />
              </div>
            )}
          </div>
        </div>
        <VuMeter leftDb={leftDb} rightDb={rightDb} />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSeek(0)}
            disabled={duration <= 0}
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            title="처음으로 이동"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 10))}
            disabled={duration <= 0}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            title="10초 되감기"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            10s
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={duration <= 0}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-cyan-400 disabled:opacity-40"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? '일시정지' : '재생'}
          </button>

          {duration > 0 && (
            <span
              className="ml-2 max-w-[280px] truncate text-xs font-medium text-slate-300"
              title={trackName}
            >
              {trackName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            className="rounded-md p-1 text-slate-300 hover:bg-slate-800"
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-24 accent-cyan-400"
          />
        </div>
      </div>

      {/* 트랜지션 적용 모달 (클립 경계 클릭 시) */}
      {transitionModal && (
        <div
          onClick={() => setTransitionModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">트랜지션 적용</h3>
              </div>
              <button
                type="button"
                onClick={() => setTransitionModal(null)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                닫기
              </button>
            </div>

            <p className="mb-3 truncate rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-[11px] text-slate-300">
              {transitionModal.titleLabel}
            </p>

            <div className="mb-3">
              <label className="mb-1.5 block text-[11px] text-slate-400">트랜지션 종류</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((tKey) => (
                  <button
                    key={tKey}
                    type="button"
                    onClick={() => setTransitionModal({ ...transitionModal, type: tKey })}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition ${
                      transitionModal.type === tKey
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {TRANSITION_LABELS[tKey]}
                  </button>
                ))}
              </div>
            </div>

            {transitionModal.type !== 'none' && (
              <div className="mb-4">
                <label className="mb-1.5 block text-[11px] text-slate-400">
                  트랜지션 시간 (기본 1.0초 / 30프레임)
                </label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={transitionModal.durationSec}
                    onChange={(val) =>
                      setTransitionModal({
                        ...transitionModal,
                        durationSec: val,
                      })
                    }
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-cyan-200"
                  />
                  <span className="text-xs text-slate-400">
                    초 ({Math.round(transitionModal.durationSec * 30)}프레임)
                  </span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {[0.5, 1.0, 1.5, 2.0].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setTransitionModal({ ...transitionModal, durationSec: sec })}
                      className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                    >
                      {sec}s ({Math.round(sec * 30)}f)
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransitionModal(null)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextTrans = {
                    type: transitionModal.type,
                    durationSec: transitionModal.durationSec,
                  };
                  onUpdateClip(
                    transitionModal.clipId,
                    transitionModal.side === 'in'
                      ? { transitionIn: nextTrans }
                      : { transitionOut: nextTrans }
                  );
                  setTransitionModal(null);
                }}
                className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 트랜지션 적용 모달 (텍스트 트랙 우클릭/클릭 시) */}
      {textTransitionModal && (
        <div
          onClick={() => setTextTransitionModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-bold text-slate-100">텍스트 트랜지션 적용</h3>
              </div>
              <button
                type="button"
                onClick={() => setTextTransitionModal(null)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                닫기
              </button>
            </div>

            <p className="mb-3 truncate rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-[11px] text-slate-300">
              {textTransitionModal.titleLabel}
            </p>

            <div className="mb-3">
              <label className="mb-1.5 block text-[11px] text-slate-400">트랜지션 종류</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(TEXT_TRANSITION_LABELS) as TextTransitionType[]).map((tKey) => (
                  <button
                    key={tKey}
                    type="button"
                    onClick={() => setTextTransitionModal({ ...textTransitionModal, type: tKey })}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition ${
                      textTransitionModal.type === tKey
                        ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                        : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {TEXT_TRANSITION_LABELS[tKey]}
                  </button>
                ))}
              </div>
            </div>

            {textTransitionModal.type !== 'none' && (
              <div className="mb-4">
                <label className="mb-1.5 block text-[11px] text-slate-400">
                  트랜지션 시간 (초)
                </label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={textTransitionModal.durationSec}
                    onChange={(val) =>
                      setTextTransitionModal({
                        ...textTransitionModal,
                        durationSec: val,
                      })
                    }
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-violet-200"
                  />
                  <span className="text-xs text-slate-400">
                    초 ({Math.round(textTransitionModal.durationSec * 30)}프레임)
                  </span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {[0.3, 0.5, 1.0, 1.5].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() =>
                        setTextTransitionModal({ ...textTransitionModal, durationSec: sec })
                      }
                      className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                    >
                      {sec}s ({Math.round(sec * 30)}f)
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTextTransitionModal(null)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextTrans = {
                    type: textTransitionModal.type,
                    durationSec: textTransitionModal.durationSec,
                  };
                  onUpdateTextLayer(
                    textTransitionModal.layerId,
                    textTransitionModal.side === 'in'
                      ? { transitionIn: nextTrans }
                      : { transitionOut: nextTrans }
                  );
                  setTextTransitionModal(null);
                }}
                className="rounded-lg bg-violet-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-400"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 타임라인 소스 우클릭 컨텍스트 메뉴 */}
      {sourceContextMenu && (() => {
        const menuW = 196;
        const menuH = sourceContextMenu.kind === 'clip' ? 330 : 220;
        const left = Math.min(sourceContextMenu.x, Math.max(8, window.innerWidth - menuW - 8));
        const top = Math.min(sourceContextMenu.y, Math.max(8, window.innerHeight - menuH - 8));

        if (sourceContextMenu.kind === 'clip') {
          const clip = videoClips.find((c) => c.id === sourceContextMenu.id);
          if (!clip) return null;
          const isFullRange =
            timelineDuration > 0 &&
            clip.timelineStart <= 0.05 &&
            clip.timelineEnd >= timelineDuration - 0.05;
          const splitPoint =
            currentTime > clip.timelineStart + 0.1 && currentTime < clip.timelineEnd - 0.1
              ? currentTime
              : sourceContextMenu.clickTime;
          const canSplit =
            splitPoint > clip.timelineStart + 0.1 && splitPoint < clip.timelineEnd - 0.1;

          return (
            <div
              style={{ left, top }}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
              className="fixed z-50 max-h-[calc(100vh-16px)] w-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 p-1.5 text-xs text-slate-200 shadow-2xl backdrop-blur"
            >
              <button
                type="button"
                disabled={!canSplit}
                onClick={() => {
                  if (onSplitClipAt) {
                    onSplitClipAt(clip.id, splitPoint);
                  } else {
                    onSplitClip();
                  }
                  setSourceContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 disabled:opacity-40"
              >
                <Scissors className="h-3.5 w-3.5 text-amber-300" />
                잘라내기 (분할)
              </button>
              <button
                type="button"
                disabled={timelineDuration <= 0 || isFullRange}
                onClick={() => {
                  onUpdateClip(clip.id, {
                    timelineStart: 0,
                    timelineEnd: timelineDuration,
                  });
                  setSourceContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 disabled:opacity-40"
              >
                <Maximize2 className="h-3.5 w-3.5 text-emerald-400" />
                전구간 설정
              </button>
              <button
                type="button"
                disabled={timelineDuration <= 0 || !isFullRange}
                onClick={() => {
                  const baseDur =
                    clip.sourceDuration > 0 && clip.sourceDuration < timelineDuration - 0.5
                      ? clip.sourceDuration
                      : Math.min(5, Math.max(1, timelineDuration * 0.5));
                  onUpdateClip(clip.id, {
                    timelineStart: 0,
                    timelineEnd: Math.min(timelineDuration, Math.max(1, baseDur)),
                  });
                  setSourceContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 disabled:opacity-40"
              >
                <Maximize2 className="h-3.5 w-3.5 text-slate-400" />
                전구간 설정 해제
              </button>
              <div className="my-1 border-t border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  const side = sourceContextMenu.side;
                  const existing = side === 'in' ? clip.transitionIn : clip.transitionOut;
                  setTransitionModal({
                    clipId: clip.id,
                    side,
                    titleLabel: `${clip.name} · ${
                      side === 'in' ? '시작 트랜지션 (In)' : '끝 트랜지션 (Out)'
                    }`,
                    type: existing?.type ?? 'x-dissolve',
                    durationSec: existing?.durationSec ?? DEFAULT_TRANSITION_DURATION,
                  });
                  setSourceContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800"
              >
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                {sourceContextMenu.side === 'in' ? '시작 트랜지션 설정' : '끝 트랜지션 설정'}
              </button>
              {clip.mediaType === 'video' && (
                <>
                  <div className="my-1 border-t border-slate-800" />
                  <div className="px-2 py-1">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                      <span>재생 속도</span>
                      <span className="font-mono text-emerald-300">
                        {Number((clip.playbackRate ?? 1).toFixed(2))}x
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[0.5, 0.75, 1, 1.5, 2].map((rate) => {
                        const active = Math.abs((clip.playbackRate ?? 1) - rate) < 0.01;
                        return (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              onUpdateClip(clip.id, { playbackRate: rate });
                              setSourceContextMenu(null);
                            }}
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition ${
                              active
                                ? 'bg-emerald-500 font-bold text-slate-950'
                                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                            }`}
                          >
                            {rate}x
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={4}
                      step={0.05}
                      value={clip.playbackRate ?? 1}
                      onChange={(e) =>
                        onUpdateClip(clip.id, { playbackRate: Number(e.target.value) })
                      }
                      className="mt-1.5 w-full accent-emerald-400"
                    />
                  </div>
                </>
              )}

              <div className="my-1 border-t border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  onDeleteClip(clip.id);
                  setSourceContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-300 hover:bg-rose-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </button>
            </div>
          );
        }

        const layer = textLayers.find((l) => l.id === sourceContextMenu.id);
        if (!layer) return null;
        const isFullRange =
          timelineDuration > 0 &&
          layer.startTime <= 0.05 &&
          layer.endTime >= timelineDuration - 0.05;
        const splitPoint =
          currentTime > layer.startTime + 0.1 && currentTime < layer.endTime - 0.1
            ? currentTime
            : sourceContextMenu.clickTime;
        const canSplit =
          Boolean(onSplitTextLayer) &&
          splitPoint > layer.startTime + 0.1 &&
          splitPoint < layer.endTime - 0.1;

        return (
          <div
            style={{ left, top }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className="fixed z-50 w-48 rounded-xl border border-slate-700 bg-slate-900/95 p-1.5 text-xs text-slate-200 shadow-2xl backdrop-blur"
          >
            <button
              type="button"
              disabled={!canSplit}
              onClick={() => {
                onSplitTextLayer?.(layer.id, splitPoint);
                setSourceContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 disabled:opacity-40"
            >
              <Scissors className="h-3.5 w-3.5 text-amber-300" />
              잘라내기 (분할)
            </button>
            <button
              type="button"
              disabled={timelineDuration <= 0 || isFullRange}
              onClick={() => {
                onUpdateTextLayer(layer.id, {
                  startTime: 0,
                  endTime: timelineDuration,
                });
                setSourceContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 disabled:opacity-40"
            >
              <Maximize2 className="h-3.5 w-3.5 text-violet-400" />
              전구간 설정
            </button>
            <button
              type="button"
              disabled={timelineDuration <= 0 || !isFullRange}
              onClick={() => {
                onUpdateTextLayer(layer.id, {
                  startTime: 0,
                  endTime: Math.min(timelineDuration, Math.max(1, Math.min(5, timelineDuration * 0.5))),
                });
                setSourceContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 disabled:opacity-40"
            >
              <Maximize2 className="h-3.5 w-3.5 text-slate-400" />
              전구간 설정 해제
            </button>
            <div className="my-1 border-t border-slate-800" />
            <button
              type="button"
              onClick={() => {
                const side = sourceContextMenu.side;
                const existing = side === 'in' ? layer.transitionIn : layer.transitionOut;
                setTextTransitionModal({
                  layerId: layer.id,
                  side,
                  titleLabel: `${layer.text.trim() || '텍스트'} · ${
                    side === 'in' ? '시작 트랜지션 (In)' : '끝 트랜지션 (Out)'
                  }`,
                  type: existing?.type ?? 'fade',
                  durationSec: existing?.durationSec ?? DEFAULT_TEXT_TRANSITION_DURATION,
                });
                setSourceContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              {sourceContextMenu.side === 'in' ? '시작 트랜지션 설정' : '끝 트랜지션 설정'}
            </button>
            <div className="my-1 border-t border-slate-800" />
            <button
              type="button"
              onClick={() => {
                onDeleteTextLayer(layer.id);
                setSourceContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-300 hover:bg-rose-500/15"
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
          </div>
        );
      })()}
    </div>
  );
};
