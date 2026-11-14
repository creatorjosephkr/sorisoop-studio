import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import {
  AspectRatio,
  BackgroundMedia,
  LyricSegment,
  SubtitleStylePreset,
  TextLayer,
  VideoClip,
  VisualEffectsConfig,
} from '../types';
import { renderMusicVideoFrame } from '../utils/subtitleRenderer';

interface PreviewStageProps {
  aspectRatio: AspectRatio;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  segments: LyricSegment[];
  preset: SubtitleStylePreset;
  background: BackgroundMedia | null;
  videoClips: VideoClip[];
  textLayers: TextLayer[];
  selectedTextLayerId: string | null;
  onSelectTextLayer: (id: string) => void;
  onMoveTextLayer: (id: string, x: number, y: number) => void;
  visualEffects: VisualEffectsConfig;
  spectrumBins: Uint8Array | null;
  waveformSamples: Float32Array | null;
  previewHeight: number;
  onChangePreviewHeight: (height: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}

function formatTimecode(sec: number, fps = 30): string {
  const safe = Math.max(0, sec);
  const totalFrames = Math.floor(safe * fps);
  const frames = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

const ASPECT_DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 900, h: 900 },
};

export const PreviewStage: React.FC<PreviewStageProps> = ({
  aspectRatio,
  currentTime,
  duration,
  isPlaying,
  segments,
  preset,
  background,
  videoClips,
  textLayers,
  selectedTextLayerId,
  onSelectTextLayer,
  onMoveTextLayer,
  visualEffects,
  spectrumBins,
  waveformSamples,
  previewHeight,
  onChangePreviewHeight,
  onSeek,
  onTogglePlay,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clipMediaMapRef = useRef<Record<string, HTMLImageElement | HTMLVideoElement>>({});
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const textDragRef = useRef<{ id: string } | null>(null);
  const [mediaVersion, setMediaVersion] = useState(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current) return;
      const delta = e.clientY - dragStateRef.current.startY;
      const next = Math.max(200, Math.min(720, dragStateRef.current.startHeight + delta));
      onChangePreviewHeight(next);
    };
    const onMouseUp = () => {
      dragStateRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onChangePreviewHeight]);

  useEffect(() => {
    if (!background) {
      imgRef.current = null;
      return;
    }
    if (background.mediaType === 'image') {
      const img = new Image();
      img.src = background.url;
      imgRef.current = img;
    } else if (background.mediaType === 'video' && videoRef.current) {
      videoRef.current.src = background.url;
      videoRef.current.loop = true;
      videoRef.current.muted = true;
      videoRef.current.load();
    }
  }, [background]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || background?.mediaType !== 'video') return;
    if (isPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
      if (vid.duration && Number.isFinite(vid.duration)) {
        vid.currentTime = currentTime % vid.duration;
      }
    }
  }, [isPlaying, background, currentTime]);

  // 비디오 트랙 클립들의 미디어 엘리먼트 프리로드 및 관리 (클립 ID별 독립 관리)
  useEffect(() => {
    const map = clipMediaMapRef.current;
    const bump = () => setMediaVersion((v) => v + 1);
    for (const clip of videoClips) {
      if (map[clip.id]) continue;
      if (clip.mediaType === 'image') {
        const img = new Image();
        img.onload = bump;
        img.src = clip.url;
        map[clip.id] = img;
      } else {
        const vid = document.createElement('video');
        vid.src = clip.url;
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.onloadeddata = bump;
        vid.onseeked = bump;
        vid.load();
        map[clip.id] = vid;
      }
    }
  }, [videoClips]);

  // 재생/탐색 시 활성 비디오 클립(및 트랜지션 직전 클립) 시간 동기화
  useEffect(() => {
    const map = clipMediaMapRef.current;
    const sorted = [...videoClips].sort((a, b) => a.timelineStart - b.timelineStart);
    const activeIdx = sorted.findIndex(
      (c) => currentTime >= c.timelineStart && currentTime < c.timelineEnd
    );
    const activeClip = activeIdx !== -1 ? sorted[activeIdx] : null;
    const prevClip = activeIdx > 0 ? sorted[activeIdx - 1] : null;
    const inTransition =
      activeClip?.transitionIn &&
      activeClip.transitionIn.type !== 'none' &&
      currentTime - activeClip.timelineStart < Math.max(0.05, activeClip.transitionIn.durationSec);

    for (const [id, el] of Object.entries(map)) {
      if (!(el instanceof HTMLVideoElement)) continue;
      const isCur = activeClip && activeClip.mediaType === 'video' && activeClip.id === id;
      const isPrevInTrans =
        inTransition && prevClip && prevClip.mediaType === 'video' && prevClip.id === id;

      if (isCur && activeClip) {
        const targetTime = Math.max(
          0,
          activeClip.sourceIn + (currentTime - activeClip.timelineStart)
        );
        if (isPlaying) {
          if (Math.abs(el.currentTime - targetTime) > 0.35 && Number.isFinite(el.duration)) {
            el.currentTime = targetTime % Math.max(0.1, el.duration);
          }
          if (el.paused) el.play().catch(() => {});
        } else {
          if (!el.paused) el.pause();
          if (Number.isFinite(el.duration) && el.duration > 0) {
            el.currentTime = targetTime % el.duration;
          }
        }
      } else if (isPrevInTrans && prevClip) {
        const targetTime = Math.max(
          0,
          prevClip.sourceIn + (prevClip.timelineEnd - prevClip.timelineStart) - 0.04
        );
        if (!el.paused) el.pause();
        if (
          Number.isFinite(el.duration) &&
          el.duration > 0 &&
          Math.abs(el.currentTime - (targetTime % el.duration)) > 0.08
        ) {
          el.currentTime = targetTime % el.duration;
        }
      } else if (!el.paused) {
        el.pause();
      }
    }
  }, [videoClips, currentTime, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dims = ASPECT_DIMENSIONS[aspectRatio];
    if (canvas.width !== dims.w || canvas.height !== dims.h) {
      canvas.width = dims.w;
      canvas.height = dims.h;
    }

    renderMusicVideoFrame({
      ctx,
      width: dims.w,
      height: dims.h,
      currentTime,
      duration,
      segments,
      preset,
      background,
      bgImageEl: imgRef.current,
      bgVideoEl: videoRef.current,
      videoClips,
      clipMediaMap: clipMediaMapRef.current,
      textLayers,
      visualEffects,
      spectrumBins,
      waveformSamples,
    });
  }, [aspectRatio, currentTime, duration, segments, preset, background, videoClips, textLayers, visualEffects, spectrumBins, waveformSamples, mediaVersion]);

  const totalDuration = Math.max(duration, ...videoClips.map((c) => c.timelineEnd), 0);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/90 shadow-inner">
      <video ref={videoRef} className="hidden" playsInline muted loop />

      <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-slate-950">
        <canvas
          ref={canvasRef}
          onMouseDown={(e) => {
            if (textLayers.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
            const py = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
            const visible = textLayers.filter(
              (l) =>
                l.visible &&
                l.text.trim() &&
                (l.alwaysVisible || (currentTime >= l.startTime && currentTime <= l.endTime))
            );
            let best: TextLayer | null = null;
            let bestDist = 18;
            for (const l of visible) {
              const d = Math.hypot(px - l.x, py - l.y);
              if (d < bestDist || (l.id === selectedTextLayerId && d < 24)) {
                bestDist = d;
                best = l;
              }
            }
            if (best) {
              onSelectTextLayer(best.id);
              textDragRef.current = { id: best.id };
            }
          }}
          onMouseMove={(e) => {
            if (!textDragRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
            const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100));
            onMoveTextLayer(textDragRef.current.id, Number(xPct.toFixed(1)), Number(yPct.toFixed(1)));
          }}
          onMouseUp={() => {
            textDragRef.current = null;
          }}
          onMouseLeave={() => {
            textDragRef.current = null;
          }}
          className={`block max-h-full max-w-full object-contain ${
            textLayers.some((l) => l.visible && l.text.trim()) ? 'cursor-move ' : ''
          }${
            aspectRatio === '16:9'
              ? 'h-full w-full'
              : aspectRatio === '9:16'
                ? 'aspect-[9/16] h-full w-auto'
                : 'aspect-square h-full w-auto'
          }`}
        />
      </div>

      {/* 프리뷰 하단 제어 바 (좌측 미리보기 비율 / 가운데 제어 버튼 / 우측 시:분:초:프레임) */}
      <div className="grid shrink-0 grid-cols-3 items-center border-t border-slate-800/80 bg-slate-900/70 px-3 py-1.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <span>미리보기 {aspectRatio}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onSeek(0)}
            disabled={totalDuration <= 0}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            title="처음으로"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={duration <= 0}
            className="flex items-center justify-center rounded-md bg-cyan-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
            title={isPlaying ? '중지' : '재생'}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onSeek(totalDuration)}
            disabled={totalDuration <= 0}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            title="끝으로"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="text-right font-mono text-xs font-semibold tracking-wider text-cyan-300">
          {formatTimecode(currentTime)} <span className="text-slate-500">/</span>{' '}
          <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
        </div>
      </div>

      {/* 하단 크기 조절 드래그 핸들 */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          dragStateRef.current = { startY: e.clientY, startHeight: previewHeight };
        }}
        className="group flex h-3.5 w-full cursor-ns-resize items-center justify-center border-t border-slate-800/80 bg-slate-900/70 hover:bg-slate-800"
        title="아래로 드래그하여 프리뷰 창 크기 조절"
      >
        <div className="h-1 w-12 rounded-full bg-slate-600 transition-colors group-hover:bg-cyan-400" />
      </div>
    </div>
  );
};
