import React, { useEffect, useRef, useState } from 'react';
import { Film, FolderOpen, X } from 'lucide-react';
import {
  AspectRatio,
  BackgroundMedia,
  LyricSegment,
  SubtitleStylePreset,
  TextLayer,
  VideoClip,
  VisualEffectsConfig,
} from '../types';
import {
  computeSpectrumFromBuffer,
  extractTimeDomainSlice,
} from '../utils/audioEncoder';
import { renderMusicVideoFrame } from '../utils/subtitleRenderer';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackName: string;
  audioPath: string;
  audioBuffer: AudioBuffer | null;
  duration: number;
  aspectRatio: AspectRatio;
  segments: LyricSegment[];
  preset: SubtitleStylePreset;
  background: BackgroundMedia | null;
  videoClips: VideoClip[];
  textLayers: TextLayer[];
  visualEffects: VisualEffectsConfig;
}

const EXPORT_DIMS: Record<AspectRatio, { '720p': [number, number]; '1080p': [number, number] }> = {
  '16:9': { '720p': [1280, 720], '1080p': [1920, 1080] },
  '9:16': { '720p': [720, 1280], '1080p': [1080, 1920] },
  '1:1': { '720p': [720, 720], '1080p': [1080, 1080] },
};

function formatMinSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  trackName,
  audioPath,
  audioBuffer,
  duration,
  aspectRatio,
  segments,
  preset,
  background,
  videoClips,
  textLayers,
  visualEffects,
}) => {
  const [exportFormat, setExportFormat] = useState<'mp4' | 'mov_alpha'>('mp4');
  const [includeLedInMov, setIncludeLedInMov] = useState<boolean>(
    visualEffects.lyricLedMeterEnabled ?? true
  );
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [fps, setFps] = useState<29.97 | 30 | 60>(29.97);
  const [isRendering, setIsRendering] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [encoderInfo, setEncoderInfo] = useState<{
    codec: string;
    label: string;
    isHardware: boolean;
  } | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.getVideoEncoderInfo) return;
    let active = true;
    window.electronAPI
      .getVideoEncoderInfo()
      .then((info) => {
        if (active) setEncoderInfo(info);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isMovAlpha = exportFormat === 'mov_alpha';

  const handleStartExport = async () => {
    if (!window.electronAPI) {
      setStatusMsg('Electron 데스크톱 환경에서만 영상 내보내기가 가능합니다.');
      return;
    }
    if (duration <= 0) {
      setStatusMsg('먼저 노래 음원을 업로드해 주세요.');
      return;
    }

    const [width, height] = EXPORT_DIMS[aspectRatio][resolution];
    const baseName = trackName.replace(/\.[^/.]+$/, '') || 'music-video';

    try {
      cancelledRef.current = false;
      setIsRendering(true);
      setExportedPath(null);
      setProgressPct(0);
      setStatusMsg('저장 위치를 선택하고 FFmpeg 인코더를 준비 중...');

      const startRes = await window.electronAPI.startVideoExport({
        width,
        height,
        fps,
        audioPath,
        defaultFileName: isMovAlpha ? `${baseName}_lyrics_alpha.mov` : `${baseName}_mv.mp4`,
        format: exportFormat,
      });

      if (!startRes) {
        setIsRendering(false);
        setStatusMsg('');
        return;
      }

      // 배경 미디어 준비 (투명 배경 MOV 모드에서는 건너뜀)
      let bgImageEl: HTMLImageElement | null = null;
      let bgVideoEl: HTMLVideoElement | null = null;
      const clipMediaMap: Record<string, HTMLImageElement | HTMLVideoElement> = {};

      if (!isMovAlpha) {
        if (videoClips.length > 0) {
          for (const clip of videoClips) {
            if (clipMediaMap[clip.id]) continue;
            if (clip.mediaType === 'image') {
              const img = new Image();
              img.src = clip.url;
              await new Promise<void>((res) => {
                if (img.complete) res();
                else img.onload = () => res();
              });
              clipMediaMap[clip.id] = img;
            } else {
              const vid = document.createElement('video');
              vid.src = clip.url;
              vid.muted = true;
              vid.playsInline = true;
              await new Promise<void>((res) => {
                vid.onloadeddata = () => res();
              });
              clipMediaMap[clip.id] = vid;
            }
          }
        } else if (background?.mediaType === 'image') {
          bgImageEl = new Image();
          bgImageEl.src = background.url;
          await new Promise<void>((res) => {
            if (bgImageEl!.complete) res();
            else bgImageEl!.onload = () => res();
          });
        } else if (background?.mediaType === 'video') {
          bgVideoEl = document.createElement('video');
          bgVideoEl.src = background.url;
          bgVideoEl.muted = true;
          bgVideoEl.playsInline = true;
          await new Promise<void>((res) => {
            bgVideoEl!.onloadeddata = () => res();
          });
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      const effectiveVisualEffects: VisualEffectsConfig = isMovAlpha
        ? {
            ...visualEffects,
            hologramEnabled: false,
            spectrumEnabled: false,
            lyricLedMeterEnabled: includeLedInMov,
          }
        : visualEffects;

      const totalFrames = Math.max(1, Math.ceil(duration * fps));
      setStatusMsg(`총 ${totalFrames} 프레임 렌더링 중...`);

      for (let f = 0; f < totalFrames; f++) {
        if (cancelledRef.current) {
          setStatusMsg('내보내기가 취소되었습니다.');
          return;
        }
        const t = f / fps;

        if (!isMovAlpha) {
          if (videoClips.length > 0) {
            const sortedClips = [...videoClips].sort((a, b) => a.timelineStart - b.timelineStart);
            const activeIdx = sortedClips.findIndex(
              (c) => t >= c.timelineStart && t < c.timelineEnd
            );
            const seekClip = async (clip: VideoClip, clipTime: number) => {
              if (clip.mediaType !== 'video') return;
              const vid = clipMediaMap[clip.id];
              if (vid instanceof HTMLVideoElement && vid.duration > 0) {
                const targetTime = Math.max(0, clipTime) % vid.duration;
                if (Math.abs(vid.currentTime - targetTime) < 0.01) return;
                vid.currentTime = targetTime;
                await new Promise<void>((res) => {
                  const onSeeked = () => {
                    vid.removeEventListener('seeked', onSeeked);
                    res();
                  };
                  vid.addEventListener('seeked', onSeeked);
                });
              }
            };
            if (activeIdx !== -1) {
              const activeClip = sortedClips[activeIdx];
              await seekClip(activeClip, activeClip.sourceIn + (t - activeClip.timelineStart));
              const trans = activeClip.transitionIn;
              if (
                activeIdx > 0 &&
                trans &&
                trans.type !== 'none' &&
                t - activeClip.timelineStart < Math.max(0.05, trans.durationSec)
              ) {
                const prevClip = sortedClips[activeIdx - 1];
                await seekClip(
                  prevClip,
                  prevClip.sourceIn + (prevClip.timelineEnd - prevClip.timelineStart) - 0.04
                );
              }
            }
          } else if (bgVideoEl && bgVideoEl.duration > 0) {
            bgVideoEl.currentTime = t % bgVideoEl.duration;
            await new Promise<void>((res) => {
              const onSeeked = () => {
                bgVideoEl!.removeEventListener('seeked', onSeeked);
                res();
              };
              bgVideoEl!.addEventListener('seeked', onSeeked);
            });
          }
        }

        const spectrumBins = computeSpectrumFromBuffer(audioBuffer, t, 48);
        const waveformSamples = extractTimeDomainSlice(audioBuffer, t, 160);

        renderMusicVideoFrame({
          ctx,
          width,
          height,
          currentTime: t,
          duration,
          segments,
          preset,
          background: isMovAlpha ? null : background,
          bgImageEl: isMovAlpha ? null : bgImageEl,
          bgVideoEl: isMovAlpha ? null : bgVideoEl,
          videoClips: isMovAlpha ? undefined : videoClips,
          clipMediaMap: isMovAlpha ? undefined : clipMediaMap,
          textLayers,
          visualEffects: effectiveVisualEffects,
          spectrumBins,
          waveformSamples,
          transparentBackground: isMovAlpha,
        });

        const imgData = ctx.getImageData(0, 0, width, height);
        await window.electronAPI.writeVideoFrame(
          new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength)
        );

        if (f % 5 === 0 || f === totalFrames - 1) {
          setProgressPct(Math.round(((f + 1) / totalFrames) * 100));
        }
      }

      setStatusMsg(isMovAlpha ? '투명 배경 MOV 마무리 중...' : '오디오 믹싱 및 MP4 마무리 중...');
      if (cancelledRef.current) {
        setStatusMsg('내보내기가 취소되었습니다.');
        return;
      }
      const finalRes = await window.electronAPI.finishVideoExport();
      setExportedPath(finalRes.outputPath);
      setStatusMsg(
        isMovAlpha
          ? '투명 배경 자막 MOV 생성이 완료되었습니다!'
          : '뮤직비디오 MP4 생성이 완료되었습니다!'
      );
    } catch (err) {
      if (cancelledRef.current) {
        setStatusMsg('내보내기가 취소되었습니다.');
      } else {
        setStatusMsg(`내보내기 오류: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setIsRendering(false);
    }
  };

  const handleCancel = async () => {
    if (window.electronAPI && isRendering) {
      cancelledRef.current = true;
      await window.electronAPI.cancelVideoExport();
      setIsRendering(false);
      setStatusMsg('내보내기가 취소되었습니다.');
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">뮤직비디오 MP4 내보내기</h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-slate-300">
            <p>화면 비율: <span className="font-semibold text-cyan-300">{aspectRatio}</span></p>
            <p className="mt-1">적용 프리셋: <span className="font-semibold text-indigo-300">{preset.name}</span></p>
            <p className="mt-1">예상 길이: <span className="font-mono">{formatMinSec(duration)}</span></p>
            <p className="mt-1">
              코덱:{' '}
              <span className="font-semibold text-emerald-300">
                {isMovAlpha ? 'Apple ProRes 4444 (알파 투명)' : 'H.264 (MP4)'}
              </span>
            </p>
            {!isMovAlpha && encoderInfo && (
              <p className="mt-1">
                인코딩 가속:{' '}
                <span
                  className={`font-semibold ${
                    encoderInfo.isHardware ? 'text-amber-300' : 'text-slate-300'
                  }`}
                >
                  {encoderInfo.label}
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-slate-400">내보내기 형식</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={isRendering}
                onClick={() => setExportFormat('mp4')}
                className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition ${
                  exportFormat === 'mp4'
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                일반 영상 (MP4 · H.264)
              </button>
              <button
                type="button"
                disabled={isRendering}
                onClick={() => setExportFormat('mov_alpha')}
                className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition ${
                  exportFormat === 'mov_alpha'
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                투명배경 자막 (MOV)
              </button>
            </div>
          </div>

          {isMovAlpha && (
            <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-200">
              <span>가사 아래 6기둥 LED 레벨메터 포함</span>
              <input
                type="checkbox"
                disabled={isRendering}
                checked={includeLedInMov}
                onChange={(e) => setIncludeLedInMov(e.target.checked)}
                className="accent-cyan-400"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-slate-400">해상도</label>
              <select
                value={resolution}
                disabled={isRendering}
                onChange={(e) => setResolution(e.target.value as '720p' | '1080p')}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100"
              >
                <option value="1080p">Full HD (1080p · 기본)</option>
                <option value="720p">HD (720p · 빠른 렌더링)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">프레임레이트</label>
              <select
                value={fps}
                disabled={isRendering}
                onChange={(e) => setFps(Number(e.target.value) as 29.97 | 30 | 60)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100"
              >
                <option value={29.97}>29.97 fps (기본 · 방송 표준)</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps (부드러움)</option>
              </select>
            </div>
          </div>

          {isRendering && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] text-cyan-300">
                <span>진행률</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {statusMsg && (
            <p className="rounded-lg bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
              {statusMsg}
            </p>
          )}

          {exportedPath && (
            <button
              type="button"
              onClick={() => window.electronAPI?.showItemInFolder(exportedPath)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 py-2 font-semibold text-emerald-300 hover:bg-emerald-500/25"
            >
              <FolderOpen className="h-4 w-4" />
              저장된 폴더에서 파일 보기
            </button>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-200 hover:bg-slate-700"
          >
            {isRendering ? '렌더링 취소' : '닫기'}
          </button>
          {!isRendering && (
            <button
              type="button"
              onClick={handleStartExport}
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:from-indigo-500 hover:to-cyan-400"
            >
              MP4 렌더링 시작
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
