import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
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

const QUICK_START_STEPS = [
  {
    step: 1,
    title: '노래 파일 가져오기',
    desc: 'MP3 · WAV 음원 불러오기',
    Icon: Music,
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30',
    iconClass: 'text-indigo-400',
  },
  {
    step: 2,
    title: '전체 가사 입력',
    optional: true,
    desc: 'AI 자동 싱크용 가사 입력',
    Icon: FileText,
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
    iconClass: 'text-cyan-400',
  },
  {
    step: 3,
    title: '가사 빈틈 연결/정리',
    desc: '무음 · 간주 구간 다듬기',
    Icon: Link2,
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-400/30',
    iconClass: 'text-violet-400',
  },
  {
    step: 4,
    title: '가사 싱크 세부 조절',
    desc: '타임라인에서 타이밍 조정',
    Icon: Sliders,
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
    iconClass: 'text-emerald-400',
  },
  {
    step: 5,
    title: '배경 설정',
    desc: '영상 · 이미지 · 비주얼 효과',
    Icon: ImageIcon,
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
    iconClass: 'text-amber-400',
  },
  {
    step: 6,
    title: '내보내기',
    desc: '고화질 MP4 · 자막 저장',
    Icon: Film,
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
    iconClass: 'text-rose-400',
  },
] as const;

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
  const [exportModal, setExportModal] = useState<{
    pngDataUrl: string;
    jpegDataUrl: string;
  } | null>(null);
  const [exportFolder, setExportFolder] = useState('');
  const [exportFileName, setExportFileName] = useState('');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg'>('png');
  const [isExportingFrame, setIsExportingFrame] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreenPreview = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (previewContainerRef.current?.requestFullscreen) {
        await previewContainerRef.current.requestFullscreen();
      } else {
        setIsFullscreenPreview((v) => !v);
      }
    } catch {
      setIsFullscreenPreview((v) => !v);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreenPreview(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

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
      if (e.key === '~' || e.code === 'Backquote') {
        e.preventDefault();
        void toggleFullscreenPreview();
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        } else {
          setIsFullscreenPreview(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreenPreview]);

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
  const hasAnySource =
    duration > 0 ||
    segments.length > 0 ||
    background !== null ||
    videoClips.length > 0 ||
    textLayers.length > 0;

  return (
    <div
      ref={previewContainerRef}
      className={
        isFullscreenPreview
          ? 'fixed inset-0 z-50 flex flex-col overflow-hidden bg-black'
          : 'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/90 shadow-inner'
      }
    >
      <video ref={videoRef} className="hidden" playsInline muted loop />

      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-[#222226]">
        {isFullscreenPreview && (
          <div className="pointer-events-none absolute top-2 left-2.5 z-10 select-none rounded bg-black/45 px-2 py-0.5 text-[10px] text-slate-300/80">
            전체화면 종료: ~ / ESC
          </div>
        )}
        {!hasAnySource && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-950/90 via-[#151824]/90 to-slate-950/90 p-3">
            <div className="w-full max-w-[600px] space-y-2.5">
              <div className="flex flex-col items-center text-center">
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-300">
                  <Sparkles className="h-3 w-3" />
                  기본 사용 과정
                </span>
                <p className="mt-1 text-[11px] text-slate-400">
                  노래 파일이나 배경 소스를 추가하면 실시간 미리보기 화면으로 전환됩니다
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {QUICK_START_STEPS.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <div
                      key={item.step}
                      className="relative flex flex-col justify-between rounded-xl border border-slate-700/60 bg-slate-900/75 p-2.5 shadow-sm backdrop-blur-sm"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-bold ${item.badgeClass}`}
                        >
                          {item.step}
                        </span>
                        <div className="flex items-center gap-1">
                          {'optional' in item && item.optional && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                              선택사항
                            </span>
                          )}
                          <Icon className={`h-3.5 w-3.5 ${item.iconClass}`} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-[11px] font-semibold leading-tight text-slate-100">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-tight text-slate-400">
                          {item.desc}
                        </p>
                      </div>
                      {item.step < 6 && (
                        <ArrowRight className="pointer-events-none absolute -right-1.5 top-1/2 hidden h-3 w-3 -translate-y-1/2 text-slate-600 sm:block" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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
          <div className="mx-0.5 h-4 w-px bg-slate-700" />
          <button
            type="button"
            onClick={async () => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const pngDataUrl = canvas.toDataURL('image/png');
              const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.94);
              const baseName = `frame_${formatTimecode(currentTime).replace(/:/g, '-')}`;
              if (!exportFolder && window.electronAPI?.getPicturesDir) {
                try {
                  const dir = await window.electronAPI.getPicturesDir();
                  setExportFolder(dir);
                } catch {
                  // 기본 경로 조회 실패 시 빈 값 유지
                }
              }
              setExportFileName(baseName);
              setExportModal({ pngDataUrl, jpegDataUrl });
            }}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
            title="현재 화면 이미지로 저장"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreenPreview()}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
              isFullscreenPreview
                ? 'border-cyan-400 bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
            title={isFullscreenPreview ? '전체 화면 종료 (~ / ESC)' : '전체 화면 최대화 (~)'}
          >
            {isFullscreenPreview ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="text-right font-mono text-xs font-semibold tracking-wider text-cyan-300">
          {formatTimecode(currentTime)} <span className="text-slate-500">/</span>{' '}
          <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
        </div>
      </div>

      {/* 하단 크기 조절 드래그 핸들 */}
      {!isFullscreenPreview && (
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
      )}

      {/* Export Frame 저장 모달 (태그 없이 폴더 / 파일 이름 / 형식 JPG·PNG 선택) */}
      {exportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-xs text-slate-200 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">현재 화면 이미지로 저장</h3>
              </div>
              <button
                type="button"
                onClick={() => setExportModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {window.electronAPI?.pickFolder && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">
                    저장 폴더
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={exportFolder || '기본 사진 폴더'}
                      className="flex-1 truncate rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const picked = await window.electronAPI?.pickFolder?.(exportFolder);
                        if (picked) setExportFolder(picked);
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-cyan-400" />
                      폴더 선택
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  파일 이름
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    placeholder="frame"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="font-mono text-xs text-slate-400">.{exportFormat}</span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  이미지 형식
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['png', 'jpg'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setExportFormat(fmt)}
                      className={`rounded-lg border py-1.5 text-xs font-semibold uppercase transition ${
                        exportFormat === fmt
                          ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">※ 유튜브 섬네일은 JPG 권장</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExportModal(null)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={isExportingFrame}
                  onClick={async () => {
                    const dataUrl =
                      exportFormat === 'jpg' ? exportModal.jpegDataUrl : exportModal.pngDataUrl;
                    const cleanBase =
                      exportFileName.trim().replace(/\.(png|jpe?g)$/i, '') || 'frame';
                    setIsExportingFrame(true);
                    try {
                      if (window.electronAPI?.saveImageToPath) {
                        const savedPath = await window.electronAPI.saveImageToPath({
                          folderPath: exportFolder,
                          fileName: cleanBase,
                          format: exportFormat,
                          dataUrl,
                        });
                        if (savedPath) {
                          window.electronAPI.showItemInFolder?.(savedPath);
                        }
                      } else {
                        const a = document.createElement('a');
                        a.href = dataUrl;
                        a.download = `${cleanBase}.${exportFormat}`;
                        a.click();
                      }
                      setExportModal(null);
                    } finally {
                      setIsExportingFrame(false);
                    }
                  }}
                  className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  {isExportingFrame ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
