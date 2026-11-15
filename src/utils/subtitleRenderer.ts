import { getBundledFontById } from '../fonts/fonts';
import {
  BackgroundMedia,
  LyricSegment,
  SubtitleStylePreset,
  TextLayer,
  VideoClip,
  VisualEffectsConfig,
} from '../types';

const spectrumSmoothMap = new WeakMap<
  CanvasRenderingContext2D,
  { bins: Float32Array; samples: Float32Array; ledLevels: Float32Array }
>();

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  currentTime: number;
  duration: number;
  segments: LyricSegment[];
  preset: SubtitleStylePreset;
  background: BackgroundMedia | null;
  bgImageEl: HTMLImageElement | null;
  bgVideoEl: HTMLVideoElement | null;
  videoClips?: VideoClip[];
  clipMediaMap?: Record<string, HTMLImageElement | HTMLVideoElement>;
  textLayers?: TextLayer[];
  visualEffects?: VisualEffectsConfig;
  spectrumBins?: Uint8Array | null;
  waveformSamples?: Float32Array | null;
  transparentBackground?: boolean;
}

function drawCoverMedia(
  ctx: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  mediaW: number,
  mediaH: number,
  canvasW: number,
  canvasH: number,
  zoomScale = 1
) {
  if (mediaW <= 0 || mediaH <= 0) return;
  const canvasRatio = canvasW / canvasH;
  const mediaRatio = mediaW / mediaH;

  let drawW = canvasW;
  let drawH = canvasH;
  if (mediaRatio > canvasRatio) {
    drawH = canvasH;
    drawW = canvasH * mediaRatio;
  } else {
    drawW = canvasW;
    drawH = canvasW / mediaRatio;
  }

  drawW *= zoomScale;
  drawH *= zoomScale;
  const offsetX = (canvasW - drawW) / 2;
  const offsetY = (canvasH - drawH) / 2;

  ctx.drawImage(media, offsetX, offsetY, drawW, drawH);
}

function drawClipMedia(
  ctx: CanvasRenderingContext2D,
  clip: VideoClip,
  el: HTMLImageElement | HTMLVideoElement | undefined,
  canvasW: number,
  canvasH: number,
  shiftX = 0,
  extraAlpha = 1
) {
  if (!el) return;
  const mediaW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const mediaH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (mediaW <= 0 || mediaH <= 0) return;

  const isReady = el instanceof HTMLVideoElement ? el.readyState >= 2 : el.complete;
  if (!isReady) return;

  const canvasRatio = canvasW / canvasH;
  const mediaRatio = mediaW / mediaH;
  let drawW = canvasW;
  let drawH = canvasH;

  if (clip.fitToFrame) {
    // 프레임에 꽉 채우기 (Cover)
    if (mediaRatio > canvasRatio) {
      drawH = canvasH;
      drawW = canvasH * mediaRatio;
    } else {
      drawW = canvasW;
      drawH = canvasW / mediaRatio;
    }
  } else {
    // 원본 비율 유지하며 프레임 안에 맞추기 (Contain)
    if (mediaRatio > canvasRatio) {
      drawW = canvasW;
      drawH = canvasW / mediaRatio;
    } else {
      drawH = canvasH;
      drawW = canvasH * mediaRatio;
    }
  }

  const offsetX = (canvasW - drawW) / 2 + shiftX;
  const offsetY = (canvasH - drawH) / 2;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, clip.opacity * extraAlpha));
  if ((clip.blur ?? 0) > 0) {
    const scaledBlur = (clip.blur ?? 0) * (canvasW / 1280);
    // 블러 적용 시 외곽 투명 영역이 섞여 가장자리가 어두워지는 현상을 막기 위해 클리핑 + 여백 확장(overscan) 처리
    const pad = scaledBlur * 2;
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, drawW, drawH);
    ctx.clip();
    ctx.filter = `blur(${scaledBlur.toFixed(1)}px)`;
    ctx.drawImage(el, offsetX - pad, offsetY - pad, drawW + pad * 2, drawH + pad * 2);
  } else {
    ctx.drawImage(el, offsetX, offsetY, drawW, drawH);
  }
  ctx.restore();
}

function drawTvStaticOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  timeSec: number
) {
  const intensity = Math.sin(progress * Math.PI);
  if (intensity <= 0.02) return;

  ctx.save();
  let seed = Math.floor(timeSec * 1000) + 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // 수평 글리치 바
  const barCount = Math.round(14 * intensity);
  for (let i = 0; i < barCount; i++) {
    const y = rand() * height;
    const h = 2 + rand() * (height * 0.035);
    const alpha = (0.2 + rand() * 0.5) * intensity;
    ctx.fillStyle = rand() > 0.35 ? `rgba(255,255,255,${alpha})` : `rgba(56,189,248,${alpha})`;
    ctx.fillRect(0, y, width, h);
  }

  // 지직거리는 스태틱 노이즈 점
  const speckCount = Math.round(280 * intensity);
  for (let i = 0; i < speckCount; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const w = 4 + rand() * 28;
    const h = 1.5 + rand() * 3;
    const v = Math.floor(180 + rand() * 75);
    ctx.fillStyle = `rgba(${v},${v},${v},${(0.35 + rand() * 0.45) * intensity})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

function drawTextLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseScale: number,
  currentTime: number,
  textLayers?: TextLayer[]
): void {
  if (!textLayers || textLayers.length === 0) return;

  for (const layer of textLayers) {
    if (!layer.visible || !layer.text.trim()) continue;
    if (!layer.alwaysVisible && (currentTime < layer.startTime || currentTime > layer.endTime)) {
      continue;
    }

    const fontMeta = getBundledFontById(layer.fontId);
    const fontSizePx = Math.max(12, layer.fontSize * baseScale);
    const lines = layer.text.split(/\r?\n/);
    const lineHeightPx = fontSizePx * 1.25;
    const totalH = lines.length * lineHeightPx;

    // 특정 구간 텍스트 트랜지션(In/Out) 계산
    let alphaMul = 1;
    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;

    if (!layer.alwaysVisible) {
      const layerDur = Math.max(0.2, layer.endTime - layer.startTime);
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const inTrans = layer.transitionIn;
      if (inTrans && inTrans.type !== 'none' && inTrans.durationSec > 0) {
        const inDur = Math.min(inTrans.durationSec, layerDur * 0.5);
        if (inDur > 0 && currentTime < layer.startTime + inDur) {
          const rawT = Math.max(0, Math.min(1, (currentTime - layer.startTime) / inDur));
          const p = easeOutCubic(rawT);
          const inv = 1 - p;
          alphaMul *= p;
          if (inTrans.type === 'slide-up') offsetY += inv * 48 * baseScale;
          else if (inTrans.type === 'slide-down') offsetY -= inv * 48 * baseScale;
          else if (inTrans.type === 'slide-left') offsetX += inv * 72 * baseScale;
          else if (inTrans.type === 'slide-right') offsetX -= inv * 72 * baseScale;
          else if (inTrans.type === 'zoom') scale *= 0.65 + 0.35 * p;
        }
      }

      const outTrans = layer.transitionOut;
      if (outTrans && outTrans.type !== 'none' && outTrans.durationSec > 0) {
        const outDur = Math.min(outTrans.durationSec, layerDur * 0.5);
        if (outDur > 0 && currentTime > layer.endTime - outDur) {
          const rawT = Math.max(0, Math.min(1, (layer.endTime - currentTime) / outDur));
          const p = easeOutCubic(rawT);
          const inv = 1 - p;
          alphaMul *= p;
          if (outTrans.type === 'slide-up') offsetY -= inv * 48 * baseScale;
          else if (outTrans.type === 'slide-down') offsetY += inv * 48 * baseScale;
          else if (outTrans.type === 'slide-left') offsetX -= inv * 72 * baseScale;
          else if (outTrans.type === 'slide-right') offsetX += inv * 72 * baseScale;
          else if (outTrans.type === 'zoom') scale *= 0.65 + 0.35 * p;
        }
      }
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity * alphaMul));
    ctx.font = `${layer.fontWeight} ${fontSizePx}px "${fontMeta.family}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const widest = Math.max(10, ...lines.map((l) => ctx.measureText(l).width));
    const cx = (layer.x / 100) * width;
    const cy = (layer.y / 100) * height;
    ctx.translate(cx + offsetX, cy + offsetY);
    if (scale !== 1) {
      ctx.scale(scale, scale);
    }

    // 1) 배경 박스
    if (layer.boxEnabled) {
      const padX = layer.boxPaddingX * baseScale;
      const padY = layer.boxPaddingY * baseScale;
      const boxW = widest + padX * 2;
      const boxH = totalH + padY * 2;
      const radius = Math.min(layer.boxRadius * baseScale, boxW / 2, boxH / 2);

      ctx.save();
      ctx.fillStyle = hexToRgba(layer.boxColor, layer.boxOpacity);
      ctx.beginPath();
      ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, Math.max(0, radius));
      ctx.fill();
      ctx.restore();
    }

    // 2) 그림자 + 테두리 + 글자
    const rad = (layer.shadowAngle * Math.PI) / 180;
    const shadowX = layer.shadowEnabled ? Math.cos(rad) * layer.shadowDistance * baseScale : 0;
    const shadowY = layer.shadowEnabled ? Math.sin(rad) * layer.shadowDistance * baseScale : 0;

    lines.forEach((line, idx) => {
      const ly = -totalH / 2 + lineHeightPx * (idx + 0.5);
      ctx.save();
      if (layer.shadowEnabled) {
        ctx.shadowColor = layer.shadowColor;
        ctx.shadowBlur = layer.shadowBlur * baseScale;
        ctx.shadowOffsetX = shadowX;
        ctx.shadowOffsetY = shadowY;
      }
      if (layer.strokeEnabled && layer.strokeWidth > 0) {
        ctx.strokeStyle = layer.strokeColor;
        ctx.lineWidth = layer.strokeWidth * baseScale;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, 0, ly);
      }
      ctx.fillStyle = layer.textColor;
      ctx.fillText(line, 0, ly);
      ctx.restore();
    });

    ctx.restore();
  }
}

export function renderMusicVideoFrame({
  ctx,
  width,
  height,
  currentTime,
  duration,
  segments,
  preset,
  background,
  bgImageEl,
  bgVideoEl,
  videoClips,
  clipMediaMap,
  textLayers,
  visualEffects,
  spectrumBins,
  waveformSamples,
  transparentBackground = false,
}: RenderFrameParams): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // 1. 배경/영상 트랙 렌더링 (투명 배경 모드에서는 건너뜀)
  if (!transparentBackground) {
    if (videoClips && videoClips.length > 0 && clipMediaMap) {
      // 기본 다크 캔버스 바닥
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      const sorted = [...videoClips].sort((a, b) => a.timelineStart - b.timelineStart);
      const activeIdx = sorted.findIndex(
        (c) => currentTime >= c.timelineStart && currentTime < c.timelineEnd
      );

      if (activeIdx !== -1) {
        const curClip = sorted[activeIdx];
        const prevClip = activeIdx > 0 ? sorted[activeIdx - 1] : null;
        const nextClip = activeIdx < sorted.length - 1 ? sorted[activeIdx + 1] : null;
        const curEl = clipMediaMap[curClip.id] ?? clipMediaMap[curClip.url];
        const prevEl = prevClip
          ? (clipMediaMap[prevClip.id] ?? clipMediaMap[prevClip.url])
          : undefined;
        const isNextAdjacent =
          nextClip !== null && Math.abs(nextClip.timelineStart - curClip.timelineEnd) <= 0.15;
        const nextEl =
          isNextAdjacent && nextClip
            ? (clipMediaMap[nextClip.id] ?? clipMediaMap[nextClip.url])
            : undefined;
        const trans = curClip.transitionIn;
        const transDur = trans && trans.type !== 'none' ? Math.max(0.05, trans.durationSec) : 0;
        const elapsedInClip = currentTime - curClip.timelineStart;

        const transOut = curClip.transitionOut;
        const transOutDur =
          transOut && transOut.type !== 'none' ? Math.max(0.05, transOut.durationSec) : 0;
        const remainingInClip = curClip.timelineEnd - currentTime;

        if (trans && trans.type !== 'none' && elapsedInClip < transDur) {
          const p = Math.max(0, Math.min(1, elapsedInClip / transDur));
          if (trans.type === 'x-dissolve') {
            if (prevClip && prevEl) drawClipMedia(ctx, prevClip, prevEl, width, height, 0, 1);
            drawClipMedia(ctx, curClip, curEl, width, height, 0, p);
          } else if (trans.type === 'push') {
            if (prevClip && prevEl) {
              drawClipMedia(ctx, prevClip, prevEl, width, height, -width * p, 1);
            }
            drawClipMedia(ctx, curClip, curEl, width, height, width * (1 - p), 1);
          } else if (trans.type === 'slide') {
            if (prevClip && prevEl) drawClipMedia(ctx, prevClip, prevEl, width, height, 0, 1);
            drawClipMedia(ctx, curClip, curEl, width, height, width * (1 - p), 1);
          } else if (trans.type === 'dip-to-black' || trans.type === 'dip-to-white') {
            const dipColor = trans.type === 'dip-to-white' ? '#ffffff' : '#000000';
            if (p < 0.5) {
              if (prevClip && prevEl) drawClipMedia(ctx, prevClip, prevEl, width, height, 0, 1);
              ctx.save();
              ctx.globalAlpha = p * 2;
              ctx.fillStyle = dipColor;
              ctx.fillRect(0, 0, width, height);
              ctx.restore();
            } else {
              drawClipMedia(ctx, curClip, curEl, width, height, 0, 1);
              ctx.save();
              ctx.globalAlpha = (1 - p) * 2;
              ctx.fillStyle = dipColor;
              ctx.fillRect(0, 0, width, height);
              ctx.restore();
            }
          } else if (trans.type === 'tv-static') {
            const jitterX = (Math.sin(currentTime * 190) * 14) * Math.sin(p * Math.PI);
            if (p < 0.5 && prevClip && prevEl) {
              drawClipMedia(ctx, prevClip, prevEl, width, height, jitterX, 1);
            } else {
              drawClipMedia(ctx, curClip, curEl, width, height, jitterX, 1);
            }
            drawTvStaticOverlay(ctx, width, height, p, currentTime);
          }
        } else if (transOut && transOut.type !== 'none' && remainingInClip < transOutDur) {
          const p = Math.max(0, Math.min(1, 1 - remainingInClip / transOutDur));
          if (transOut.type === 'x-dissolve') {
            if (isNextAdjacent && nextClip && nextEl) {
              drawClipMedia(ctx, nextClip, nextEl, width, height, 0, 1);
            }
            drawClipMedia(ctx, curClip, curEl, width, height, 0, 1 - p);
          } else if (transOut.type === 'push') {
            drawClipMedia(ctx, curClip, curEl, width, height, -width * p, 1);
            if (isNextAdjacent && nextClip && nextEl) {
              drawClipMedia(ctx, nextClip, nextEl, width, height, width * (1 - p), 1);
            }
          } else if (transOut.type === 'slide') {
            if (isNextAdjacent && nextClip && nextEl) {
              drawClipMedia(ctx, nextClip, nextEl, width, height, 0, 1);
            }
            drawClipMedia(ctx, curClip, curEl, width, height, -width * p, 1);
          } else if (transOut.type === 'dip-to-black' || transOut.type === 'dip-to-white') {
            const dipColor = transOut.type === 'dip-to-white' ? '#ffffff' : '#000000';
            if (isNextAdjacent && nextClip && nextEl) {
              if (p < 0.5) {
                drawClipMedia(ctx, curClip, curEl, width, height, 0, 1);
                ctx.save();
                ctx.globalAlpha = p * 2;
                ctx.fillStyle = dipColor;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
              } else {
                drawClipMedia(ctx, nextClip, nextEl, width, height, 0, 1);
                ctx.save();
                ctx.globalAlpha = (1 - p) * 2;
                ctx.fillStyle = dipColor;
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
              }
            } else {
              drawClipMedia(ctx, curClip, curEl, width, height, 0, 1);
              ctx.save();
              ctx.globalAlpha = p;
              ctx.fillStyle = dipColor;
              ctx.fillRect(0, 0, width, height);
              ctx.restore();
            }
          } else if (transOut.type === 'tv-static') {
            const jitterX = (Math.sin(currentTime * 190) * 14) * Math.sin(p * Math.PI);
            if (p >= 0.5 && isNextAdjacent && nextClip && nextEl) {
              drawClipMedia(ctx, nextClip, nextEl, width, height, jitterX, 1);
            } else {
              drawClipMedia(ctx, curClip, curEl, width, height, jitterX, 1);
            }
            drawTvStaticOverlay(ctx, width, height, p, currentTime);
          }
        } else {
          drawClipMedia(ctx, curClip, curEl, width, height, 0, 1);
        }
      }

      if (background && background.dimOpacity > 0) {
        ctx.fillStyle = `rgba(2, 6, 23, ${background.dimOpacity})`;
        ctx.fillRect(0, 0, width, height);
      }
    } else {
      const hasImage = background?.mediaType === 'image' && bgImageEl && bgImageEl.complete;
      const hasVideo =
        background?.mediaType === 'video' &&
        bgVideoEl &&
        bgVideoEl.readyState >= 2;

      if (hasImage || hasVideo) {
        ctx.save();
        if (background && background.blurAmount > 0) {
          ctx.filter = `blur(${background.blurAmount}px)`;
        }
        const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
        const zoom =
          hasImage && background?.kenBurns ? 1.0 + progress * 0.1 : 1.0;

        if (hasImage && bgImageEl) {
          drawCoverMedia(
            ctx,
            bgImageEl,
            bgImageEl.naturalWidth,
            bgImageEl.naturalHeight,
            width,
            height,
            zoom
          );
        } else if (hasVideo && bgVideoEl) {
          drawCoverMedia(
            ctx,
            bgVideoEl,
            bgVideoEl.videoWidth,
            bgVideoEl.videoHeight,
            width,
            height,
            1.0
          );
        }
        ctx.restore();

        if (background && background.dimOpacity > 0) {
          ctx.fillStyle = `rgba(2, 6, 23, ${background.dimOpacity})`;
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        // 기본 다크 앰비언트 배경
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#020617');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  const baseScale = Math.min(width, height) / 1080;

  // 평균 오디오 에너지(0~1) 계산
  let avgEnergy = 0;
  let bassEnergy = 0;
  if (spectrumBins && spectrumBins.length > 0) {
    let sum = 0;
    let bassSum = 0;
    const bassCount = Math.max(1, Math.floor(spectrumBins.length * 0.25));
    for (let i = 0; i < spectrumBins.length; i++) {
      const v = spectrumBins[i] / 255;
      sum += v;
      if (i < bassCount) bassSum += v;
    }
    avgEnergy = sum / spectrumBins.length;
    bassEnergy = bassSum / bassCount;
  }

  // 1-A. 여러 색상의 구름 같은 유기적 띠가 음악에 반응하며 변형되는 오로라 홀로그램 (은은한 배경용)
  if (!transparentBackground && visualEffects?.hologramEnabled) {
    ctx.save();
    const minDim = Math.min(width, height);
    const vol = Math.min(1, avgEnergy * 1.5);
    const bass = Math.min(1, bassEnergy * 1.6);
    const t = currentTime;

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.hologramOpacity ?? 0.38));

    // 다채로운 오로라/구름 띠 팔레트
    const cloudBands = [
      { yRatio: 0.34, thickness: 0.22, speed: 0.42, freq: 2.3, hueA: 185, hueB: 265, binOffset: 0 },
      { yRatio: 0.52, thickness: 0.26, speed: -0.35, freq: 1.9, hueA: 280, hueB: 330, binOffset: 8 },
      { yRatio: 0.64, thickness: 0.20, speed: 0.28, freq: 2.7, hueA: 155, hueB: 205, binOffset: 16 },
      { yRatio: 0.44, thickness: 0.18, speed: -0.48, freq: 3.1, hueA: 315, hueB: 40, binOffset: 24 },
      { yRatio: 0.50, thickness: 0.24, speed: 0.31, freq: 1.6, hueA: 215, hueB: 175, binOffset: 32 },
    ];

    const steps = 28;

    for (let b = 0; b < cloudBands.length; b++) {
      const band = cloudBands[b];
      const baseCenterY = height * band.yRatio;
      const baseHalfThick = minDim * band.thickness * (0.55 + bass * 0.65);
      const hueShift = (t * 14 + b * 24) % 360;
      const hue1 = (band.hueA + hueShift) % 360;
      const hue2 = (band.hueB + hueShift) % 360;

      const topPts: Array<{ x: number; y: number }> = [];
      const botPts: Array<{ x: number; y: number }> = [];

      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -width * 0.06 + u * width * 1.12;

        const binIdx = (band.binOffset + i) % (spectrumBins?.length || 48);
        const binVal =
          spectrumBins && spectrumBins.length > 0 ? spectrumBins[binIdx] / 255 : 0.12;

        // 3개의 위상이 다른 파동으로 구름이 뭉게뭉게 형태를 바꾸는 느낌 생성
        const centerWave =
          Math.sin(u * Math.PI * band.freq + t * band.speed + b) *
            minDim *
            (0.08 + vol * 0.16) +
          Math.cos(u * Math.PI * (band.freq * 1.7) - t * band.speed * 1.4) *
            minDim *
            (0.04 + binVal * 0.11);

        // 구름 띠의 두께가 위치와 음악 에너지에 따라 부풀고 좁아짐
        const puff =
          0.55 +
          0.45 * Math.sin(u * Math.PI * 3.2 - t * (0.6 + b * 0.1) + b * 2) +
          binVal * 0.95;

        const localHalf = baseHalfThick * puff;
        const cy = baseCenterY + centerWave;

        topPts.push({ x, y: cy - localHalf });
        botPts.push({ x, y: cy + localHalf });
      }

      ctx.save();
      ctx.filter = `blur(${Math.max(12, Math.round(28 * baseScale))}px)`;
      ctx.beginPath();
      ctx.moveTo(topPts[0].x, topPts[0].y);
      for (let i = 1; i < topPts.length; i++) {
        const prev = topPts[i - 1];
        const cur = topPts[i];
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
      }
      const lastTop = topPts[topPts.length - 1];
      ctx.lineTo(lastTop.x, lastTop.y);

      const lastBot = botPts[botPts.length - 1];
      ctx.lineTo(lastBot.x, lastBot.y);
      for (let i = botPts.length - 2; i >= 0; i--) {
        const prev = botPts[i + 1];
        const cur = botPts[i];
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
      }
      ctx.closePath();

      const alphaCenter = Math.min(0.28, 0.09 + vol * 0.14 + bass * 0.06);
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, `hsla(${hue1}, 82%, 56%, ${alphaCenter * 0.45})`);
      grad.addColorStop(0.5, `hsla(${(hue1 + hue2) / 2}, 86%, 58%, ${alphaCenter})`);
      grad.addColorStop(1, `hsla(${hue2}, 82%, 54%, ${alphaCenter * 0.45})`);

      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    // 구름 사이를 떠다니는 부드러운 몽환적 빛망울(보케)
    const moteCount = 24;
    for (let m = 0; m < moteCount; m++) {
      const s1 = Math.sin(m * 19.31) * 43758.5453;
      const s2 = Math.cos(m * 47.17) * 23421.631;
      const fx = s1 - Math.floor(s1);
      const fy = s2 - Math.floor(s2);
      const bin =
        spectrumBins && spectrumBins.length > 0
          ? spectrumBins[m % spectrumBins.length] / 255
          : 0.1;

      const mx = ((fx + Math.sin(t * 0.18 + m) * 0.08 + 1) % 1) * width;
      const my = ((fy + Math.cos(t * 0.15 + m * 1.4) * 0.08 + 1) % 1) * height;
      const mr = (18 + (m % 4) * 10 + bin * 36) * baseScale;
      const mHue = (170 + m * 17 + t * 18) % 360;

      const mGrad = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      mGrad.addColorStop(0, `hsla(${mHue}, 88%, 72%, ${0.06 + bin * 0.14})`);
      mGrad.addColorStop(1, `hsla(${mHue}, 88%, 55%, 0)`);
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // 1-A2. 칼라 홀로그램 프리즘 링 (음악 반응형)
  if (!transparentBackground && visualEffects?.prismRingEnabled) {
    const rawBins = spectrumBins && spectrumBins.length > 0 ? spectrumBins : new Uint8Array(48);
    let bass = 0;
    let mid = 0;
    let treble = 0;
    const third = Math.max(1, Math.floor(rawBins.length / 3));
    for (let i = 0; i < rawBins.length; i++) {
      const v = rawBins[i] / 255;
      if (i < third) bass += v;
      else if (i < third * 2) mid += v;
      else treble += v;
    }
    bass /= third;
    mid /= third;
    treble /= Math.max(1, rawBins.length - third * 2);

    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);
    const t = currentTime;

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.prismRingOpacity ?? 0.55));
    ctx.globalCompositeOperation = 'screen';

    const ringCount = 3;
    for (let ring = 0; ring < ringCount; ring++) {
      const baseR = minDim * (0.2 + ring * 0.095) + bass * minDim * 0.055;
      const points = 72;
      const rot = t * (0.22 + ring * 0.14) * (ring % 2 === 0 ? 1 : -1);

      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const binIdx = Math.floor(((i % points) / points) * rawBins.length);
        const binVal = rawBins[binIdx] / 255;
        const wave =
          Math.sin(angle * (3 + ring) + rot * 2.2) * (8 + mid * 22) * baseScale +
          binVal * (14 + treble * 26) * baseScale;
        const r = baseR + wave;
        const px = cx + Math.cos(angle + rot) * r;
        const py = cy + Math.sin(angle + rot) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const hueA = (t * 28 + ring * 95) % 360;
      const hueB = (hueA + 140) % 360;
      const grad = ctx.createLinearGradient(cx - baseR, cy - baseR, cx + baseR, cy + baseR);
      grad.addColorStop(0, `hsla(${hueA}, 92%, 68%, 0.85)`);
      grad.addColorStop(0.5, `hsla(${(hueA + 70) % 360}, 95%, 74%, 0.95)`);
      grad.addColorStop(1, `hsla(${hueB}, 92%, 66%, 0.85)`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = (2.6 - ring * 0.5 + bass * 2.4) * baseScale;
      ctx.shadowColor = `hsla(${hueA}, 95%, 65%, 0.65)`;
      ctx.shadowBlur = (14 + treble * 18) * baseScale;
      ctx.stroke();
    }

    ctx.restore();
  }

  // 1-A3. 칼라 홀로그램 스타더스트 입자 (음악 반응형)
  if (!transparentBackground && visualEffects?.prismParticlesEnabled) {
    const rawBins = spectrumBins && spectrumBins.length > 0 ? spectrumBins : new Uint8Array(48);
    let energy = 0;
    for (let i = 0; i < rawBins.length; i++) energy += rawBins[i] / 255;
    energy /= rawBins.length;

    const t = currentTime;
    const particleCount = 42;
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.prismParticlesOpacity ?? 0.6));
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < particleCount; i++) {
      const s1 = Math.sin(i * 12.9898) * 43758.5453;
      const s2 = Math.cos(i * 78.233) * 24634.6345;
      const fx = s1 - Math.floor(s1);
      const fy = s2 - Math.floor(s2);
      const binVal = rawBins[i % rawBins.length] / 255;

      const driftX = Math.sin(t * (0.35 + (i % 5) * 0.08) + i) * (0.04 + energy * 0.04);
      const driftY = ((t * (0.03 + (i % 4) * 0.012) * (1 + energy * 0.9)) % 1.2);
      const px = ((fx + driftX + 1) % 1) * width;
      const py = ((fy - driftY + 2) % 1) * height;

      const size = (2.2 + (i % 4) * 1.4 + binVal * 6.5) * baseScale;
      const hue = (t * 40 + i * 23) % 360;

      const glowR = size * 3.4;
      const pGrad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      pGrad.addColorStop(0, `hsla(${hue}, 96%, 82%, ${0.45 + binVal * 0.5})`);
      pGrad.addColorStop(0.4, `hsla(${(hue + 45) % 360}, 92%, 68%, ${0.22 + binVal * 0.35})`);
      pGrad.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`);

      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(px, py, glowR, 0, Math.PI * 2);
      ctx.fill();

      // 다이아몬드 형태의 홀로그램 플레어 코어
      if (binVal > 0.32 || i % 3 === 0) {
        const starLen = size * (1.8 + binVal * 1.6);
        ctx.strokeStyle = `hsla(${(hue + 25) % 360}, 100%, 88%, ${0.35 + binVal * 0.55})`;
        ctx.lineWidth = 1.1 * baseScale;
        ctx.beginPath();
        ctx.moveTo(px - starLen, py);
        ctx.lineTo(px + starLen, py);
        ctx.moveTo(px, py - starLen);
        ctx.lineTo(px, py + starLen);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // 1-B. 화면 가운데 오디오 스펙트럼 (음역대 / 높이 / 너비 / 색상 / 굵기 / 모양 / 움직임 둔화)
  if (!transparentBackground && visualEffects?.spectrumEnabled) {
    const rawBins = spectrumBins && spectrumBins.length > 0 ? spectrumBins : new Uint8Array(48);
    const band = visualEffects.spectrumBand ?? 'all';
    const heightRatio = Math.max(0.06, Math.min(0.45, visualEffects.spectrumHeight ?? 0.18));
    const widthRatio = Math.max(0.25, Math.min(1, visualEffects.spectrumWidth ?? 0.72));
    const customColor = visualEffects.spectrumColor ?? 'auto';
    const thickness = Math.max(0.4, Math.min(2.4, visualEffects.spectrumThickness ?? 1.0));
    const shape = visualEffects.spectrumShape ?? 'mirror';
    const smoothing = Math.max(0, Math.min(0.92, visualEffects.spectrumSmoothing ?? 0.72));

    // 선택 음역대 슬라이싱
    let bandStart = 0;
    let bandEnd = rawBins.length;
    if (band === 'bass') {
      bandStart = 0;
      bandEnd = Math.max(8, Math.floor(rawBins.length * 0.34));
    } else if (band === 'mid') {
      bandStart = Math.floor(rawBins.length * 0.16);
      bandEnd = Math.max(bandStart + 8, Math.floor(rawBins.length * 0.68));
    } else if (band === 'treble') {
      bandStart = Math.floor(rawBins.length * 0.5);
      bandEnd = rawBins.length;
    }
    const bandLen = Math.max(4, bandEnd - bandStart);

    // 시간축 스무딩(움직임 둔화)
    let smoothEntry = spectrumSmoothMap.get(ctx);
    if (!smoothEntry || smoothEntry.bins.length !== rawBins.length) {
      smoothEntry = {
        bins: new Float32Array(rawBins.length),
        samples: new Float32Array(160),
        ledLevels: new Float32Array(24),
      };
      spectrumSmoothMap.set(ctx, smoothEntry);
    }
    const keep = smoothing;
    const take = 1 - keep;
    for (let i = 0; i < rawBins.length; i++) {
      smoothEntry.bins[i] = smoothEntry.bins[i] * keep + rawBins[i] * take;
    }

    const bins = smoothEntry.bins.subarray(bandStart, bandStart + bandLen);
    const binCount = bins.length;
    const specWidth = width * widthRatio;
    const startX = (width - specWidth) / 2;
    const centerY = height / 2;
    const maxAmp = height * heightRatio;

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.spectrumOpacity));

    if (visualEffects.spectrumMode === 'digital') {
      const slotW = specWidth / binCount;
      const barW = Math.max(2 * baseScale, Math.min(slotW * 0.92, slotW * 0.62 * thickness));

      if (customColor !== 'auto') {
        ctx.fillStyle = customColor;
        ctx.strokeStyle = customColor;
        ctx.shadowColor = customColor;
      } else {
        const grad = ctx.createLinearGradient(startX, centerY - maxAmp, startX, centerY + maxAmp);
        grad.addColorStop(0, '#67e8f9');
        grad.addColorStop(0.5, '#818cf8');
        grad.addColorStop(1, '#67e8f9');
        ctx.fillStyle = grad;
        ctx.strokeStyle = grad;
        ctx.shadowColor = '#38bdf8';
      }
      ctx.shadowBlur = 12 * baseScale;

      if (shape === 'line') {
        const lineStep = specWidth / Math.max(1, binCount - 1);
        ctx.lineWidth = Math.max(1.5, 3 * baseScale * thickness);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < binCount; i++) {
          const norm = bins[i] / 255;
          const x = startX + i * lineStep;
          const y = centerY - Math.max(2 * baseScale, norm * maxAmp);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < binCount; i++) {
          const norm = bins[i] / 255;
          const x = startX + i * lineStep;
          const y = centerY + Math.max(2 * baseScale, norm * maxAmp);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        for (let i = 0; i < binCount; i++) {
          const norm = bins[i] / 255;
          const h = Math.max(4 * baseScale, norm * maxAmp);
          const x = startX + i * slotW + (slotW - barW) / 2;
          if (shape === 'dots') {
            const r = Math.max(2 * baseScale, barW * 0.48);
            ctx.beginPath();
            ctx.arc(x + barW / 2, centerY - h, r, 0, Math.PI * 2);
            ctx.arc(x + barW / 2, centerY + h, r, 0, Math.PI * 2);
            ctx.fill();
          } else if (shape === 'bottom') {
            const baseY = centerY + maxAmp * 0.65;
            const barH = Math.max(4 * baseScale, norm * maxAmp * 1.45);
            ctx.beginPath();
            ctx.roundRect(x, baseY - barH, barW, barH, barW / 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.roundRect(x, centerY - h, barW, h * 2, barW / 2);
            ctx.fill();
          }
        }
      }
    } else {
      // 아날로그 (웨이브): 선택 음역대 에너지 + 시간축 스무딩 반영
      const rawSamples =
        waveformSamples && waveformSamples.length > 0 ? waveformSamples : null;
      const pointCount = rawSamples ? rawSamples.length : Math.max(32, binCount);
      if (smoothEntry.samples.length !== pointCount) {
        smoothEntry.samples = new Float32Array(pointCount);
      }

      let bandEnergy = 0;
      for (let i = 0; i < binCount; i++) bandEnergy += bins[i] / 255;
      bandEnergy /= Math.max(1, binCount);
      const bandGain = band === 'all' ? 1 : Math.min(1.6, 0.35 + bandEnergy * 2.2);

      const sampleKeep = Math.min(0.85, smoothing * 0.85);
      const sampleTake = 1 - sampleKeep;
      if (rawSamples) {
        for (let i = 0; i < pointCount; i++) {
          smoothEntry.samples[i] =
            smoothEntry.samples[i] * sampleKeep + rawSamples[i] * bandGain * sampleTake;
        }
      }

      const stepX = specWidth / Math.max(1, pointCount - 1);

      let weightedSum = 0;
      let totalMag = 0;
      for (let i = 0; i < binCount; i++) {
        const mag = bins[i] / 255;
        weightedSum += (i / Math.max(1, binCount - 1)) * mag;
        totalMag += mag;
      }
      const centroid = totalMag > 0.01 ? Math.min(1, (weightedSum / totalMag) * 1.8) : 0;
      const peakHue = Math.round(Math.max(0, 120 - centroid * 120));

      const analogMaxAmp = maxAmp * 1.65;
      if (customColor !== 'auto') {
        ctx.strokeStyle = customColor;
        ctx.fillStyle = customColor;
        ctx.shadowColor = customColor;
      } else {
        const waveGrad = ctx.createLinearGradient(
          0,
          centerY - analogMaxAmp,
          0,
          centerY + analogMaxAmp
        );
        waveGrad.addColorStop(0.0, '#ef4444');
        waveGrad.addColorStop(0.25, '#f97316');
        waveGrad.addColorStop(0.5, `hsl(${peakHue}, 85%, 52%)`);
        waveGrad.addColorStop(0.75, '#f97316');
        waveGrad.addColorStop(1.0, '#ef4444');
        ctx.strokeStyle = waveGrad;
        ctx.fillStyle = waveGrad;
        ctx.shadowColor = centroid > 0.55 ? '#ef4444' : '#22c55e';
      }

      ctx.lineWidth = 3.4 * baseScale * thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 13 * baseScale;

      const getSampleY = (idx: number): number => {
        if (rawSamples) {
          const val = Math.max(-1, Math.min(1, smoothEntry!.samples[idx] * 2.6));
          return centerY + val * analogMaxAmp;
        }
        const norm = bins[idx % binCount] / 255;
        return centerY + (idx % 2 === 0 ? 1 : -1) * norm * analogMaxAmp * 0.75;
      };

      if (shape === 'dots') {
        const dotR = Math.max(2 * baseScale, 3.2 * baseScale * thickness);
        for (let i = 0; i < pointCount; i += 2) {
          ctx.beginPath();
          ctx.arc(startX + i * stepX, getSampleY(i), dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        let prevX = startX;
        let prevY = getSampleY(0);
        ctx.moveTo(prevX, prevY);

        for (let i = 1; i < pointCount; i++) {
          const x = startX + i * stepX;
          const y = getSampleY(i);
          const midX = (prevX + x) / 2;
          const midY = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
          prevX = x;
          prevY = y;
        }
        const lastX = startX + (pointCount - 1) * stepX;
        ctx.lineTo(lastX, getSampleY(pointCount - 1));
        ctx.stroke();

        if (shape === 'bottom') {
          ctx.lineTo(lastX, centerY + analogMaxAmp * 0.7);
          ctx.lineTo(startX, centerY + analogMaxAmp * 0.7);
          ctx.closePath();
          ctx.globalAlpha = Math.max(0.03, Math.min(0.45, visualEffects.spectrumOpacity * 0.4));
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // 1-C. LED 오디오 레벨메터 (세로 위치 / 기둥 개수 / 기둥 높이 / 기둥 두께 / 투명도 / 부드러운 움직임)
  if (visualEffects?.lyricLedMeterEnabled) {
    const bins = spectrumBins && spectrumBins.length > 0 ? spectrumBins : new Uint8Array(48);
    const cols = Math.max(4, Math.min(16, Math.round(visualEffects.ledMeterColumns ?? 6)));
    const heightScale = Math.max(0.5, Math.min(2.4, visualEffects.ledMeterHeight ?? 1.0));
    const thicknessScale = Math.max(0.5, Math.min(2.2, visualEffects.ledMeterThickness ?? 1.0));
    const posYRatio = Math.max(0.08, Math.min(0.92, visualEffects.ledMeterPosY ?? 0.85));
    const opacity = Math.max(0.05, Math.min(1.0, visualEffects.ledMeterOpacity ?? 0.95));
    const ledSmooth = Math.max(0, Math.min(0.92, visualEffects.ledMeterSmoothing ?? 0.68));

    let smoothEntry = spectrumSmoothMap.get(ctx);
    if (!smoothEntry) {
      smoothEntry = {
        bins: new Float32Array(bins.length),
        samples: new Float32Array(160),
        ledLevels: new Float32Array(24),
      };
      spectrumSmoothMap.set(ctx, smoothEntry);
    }

    const ledRows = 8;
    const ledW = 14 * baseScale * thicknessScale;
    const ledH = 4 * baseScale * heightScale;
    const ledGapY = 2.5 * baseScale * Math.min(1.5, 0.7 + heightScale * 0.3);
    const colGapX = Math.max(4 * baseScale, 8 * baseScale * (0.7 + thicknessScale * 0.3));
    const padX = 12 * baseScale;
    const padY = 8 * baseScale;
    const meterW = cols * ledW + (cols - 1) * colGapX + padX * 2;
    const meterH = ledRows * ledH + (ledRows - 1) * ledGapY + padY * 2;

    const meterX = (width - meterW) / 2;
    const meterY = Math.max(
      8 * baseScale,
      Math.min(height - meterH - 8 * baseScale, height * posYRatio - meterH / 2)
    );

    ctx.save();
    ctx.globalAlpha = opacity;

    for (let b = 0; b < cols; b++) {
      // 로그 스케일 근사로 저음~고음을 cols개 기둥에 균등 배분
      const t0 = b / cols;
      const t1 = (b + 1) / cols;
      const sBin = Math.min(bins.length - 1, Math.floor(Math.pow(t0, 1.35) * bins.length));
      const eBin = Math.max(sBin + 1, Math.min(bins.length, Math.ceil(Math.pow(t1, 1.35) * bins.length)));
      const cnt = Math.max(1, eBin - sBin);
      let sum = 0;
      let peak = 0;
      for (let i = sBin; i < eBin; i++) {
        const v = bins[i] / 255;
        sum += v;
        if (v > peak) peak = v;
      }
      const rawLevel = Math.min(1, (sum / cnt) * 0.65 + peak * 0.45);
      const prevLevel = smoothEntry.ledLevels[b] ?? 0;
      const level = prevLevel * ledSmooth + rawLevel * (1 - ledSmooth);
      smoothEntry.ledLevels[b] = level;

      const litCount = Math.round(level * ledRows);
      const colX = meterX + padX + b * (ledW + colGapX);

      for (let r = 0; r < ledRows; r++) {
        if (r >= litCount) continue; // 꺼진 칸은 그리지 않고 완전 투명 처리
        const rowY = meterY + meterH - padY - (r + 1) * ledH - r * ledGapY;
        if (r === ledRows - 1) {
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = 'rgba(239, 68, 68, 0.85)';
          ctx.shadowBlur = 6 * baseScale;
        } else if (r >= ledRows - 2) {
          ctx.fillStyle = '#fb923c';
          ctx.shadowBlur = 0;
        } else if (r >= ledRows - 4) {
          ctx.fillStyle = '#facc15';
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = '#34d399';
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.roundRect(colX, rowY, ledW, ledH, 1.5 * baseScale);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 2. 현재 활성 가사 구간 찾기
  const activeIdx = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime
  );
  if (activeIdx === -1) {
    drawTextLayers(ctx, width, height, baseScale, currentTime, textLayers);
    ctx.restore();
    return;
  }

  const active = segments[activeIdx];
  if (!active.text.trim()) {
    drawTextLayers(ctx, width, height, baseScale, currentTime, textLayers);
    ctx.restore();
    return;
  }

  const prevSeg = activeIdx > 0 ? segments[activeIdx - 1] : null;
  const nextSeg = activeIdx < segments.length - 1 ? segments[activeIdx + 1] : null;

  // 3. 스케일 및 애니메이션 계산
  const segDur = Math.max(0.1, active.endTime - active.startTime);
  const segProgress = Math.min(1, Math.max(0, (currentTime - active.startTime) / segDur));

  let animAlpha = 1;
  let animScale = 1;
  if (preset.animation === 'fade') {
    const fadeWindow = Math.min(0.25, segDur * 0.25);
    const elapsed = currentTime - active.startTime;
    const remaining = active.endTime - currentTime;
    if (elapsed < fadeWindow) animAlpha = elapsed / fadeWindow;
    else if (remaining < fadeWindow) animAlpha = remaining / fadeWindow;
  } else if (preset.animation === 'pop') {
    const popWindow = Math.min(0.18, segDur * 0.25);
    const elapsed = currentTime - active.startTime;
    if (elapsed < popWindow) {
      const t = elapsed / popWindow;
      animScale = 0.86 + 0.14 * Math.sin((t * Math.PI) / 2);
      animAlpha = t;
    }
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, animAlpha));

  // 4. 내장 무료 한글 폰트 적용 (시스템 폰트 폴백 없음)
  const fontMeta = getBundledFontById(preset.fontId);
  const fontSizePx = Math.max(14, preset.fontSize * baseScale);
  ctx.font = `${fontMeta.weight} ${fontSizePx}px "${fontMeta.family}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxTextWidth = width * 0.84;
  const lines = wrapTextLines(ctx, active.text, maxTextWidth);
  const lineHeightPx = fontSizePx * preset.lineHeight;
  const totalTextHeight = lines.length * lineHeightPx;

  let anchorY = height / 2;
  if (preset.position === 'top') anchorY = height * 0.18;
  else if (preset.position === 'bottom') anchorY = height * 0.82;
  anchorY += preset.offsetY * baseScale;

  ctx.save();
  ctx.translate(width / 2, anchorY);
  ctx.scale(animScale, animScale);

  const widestLine = Math.max(...lines.map((l) => ctx.measureText(l).width));

  // 5. 배경 박스 렌더링
  if (preset.boxEnabled) {
    const padX = preset.boxPaddingX * baseScale;
    const padY = preset.boxPaddingY * baseScale;
    const boxW = widestLine + padX * 2;
    const boxH = totalTextHeight + padY * 2;
    const radius = Math.min(preset.boxRadius * baseScale, boxH / 2);

    ctx.fillStyle = hexToRgba(preset.boxColor, preset.boxOpacity);
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, radius);
    ctx.fill();
  }

  // 6. 이전/다음 구절 힌트
  if (preset.showPrevNext) {
    const hintSize = Math.max(12, fontSizePx * 0.44);
    ctx.font = `400 ${hintSize}px "${fontMeta.family}"`;
    ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
    ctx.shadowBlur = 0;

    if (prevSeg && prevSeg.text.trim()) {
      ctx.fillText(prevSeg.text, 0, -totalTextHeight / 2 - hintSize * 1.4);
    }
    if (nextSeg && nextSeg.text.trim()) {
      const barExtra = preset.animation === 'karaoke-bar' ? 22 * baseScale : 0;
      ctx.fillText(nextSeg.text, 0, totalTextHeight / 2 + hintSize * 1.4 + barExtra);
    }
  }

  // 7. 본문 가사 렌더링
  ctx.font = `${fontMeta.weight} ${fontSizePx}px "${fontMeta.family}"`;
  const startY = -((lines.length - 1) * lineHeightPx) / 2;

  lines.forEach((line, idx) => {
    const y = startY + idx * lineHeightPx;

    if (preset.strokeWidth > 0) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineWidth = preset.strokeWidth * baseScale;
      ctx.strokeStyle = preset.strokeColor;
      ctx.strokeText(line, 0, y);
      ctx.restore();
    }

    ctx.save();
    if (preset.shadowBlur > 0) {
      ctx.shadowColor = preset.shadowColor;
      ctx.shadowBlur = preset.shadowBlur * baseScale;
    }

    if (preset.useGradient) {
      const grad = ctx.createLinearGradient(-widestLine / 2, y, widestLine / 2, y);
      grad.addColorStop(0, preset.gradientStart);
      grad.addColorStop(1, preset.gradientEnd);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = preset.textColor;
    }

    ctx.fillText(line, 0, y);
    ctx.restore();
  });

  // 8. 가라오케 진행 바
  if (preset.animation === 'karaoke-bar') {
    const barW = Math.min(width * 0.45, Math.max(220 * baseScale, widestLine * 0.75));
    const barH = Math.max(4, 6 * baseScale);
    const barY = totalTextHeight / 2 + 16 * baseScale;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.roundRect(-barW / 2, barY, barW, barH, barH / 2);
    ctx.fill();

    ctx.save();
    ctx.shadowColor = preset.karaokeBarColor;
    ctx.shadowBlur = 12 * baseScale;
    ctx.fillStyle = preset.karaokeBarColor;
    ctx.beginPath();
    ctx.roundRect(-barW / 2, barY, Math.max(barH, barW * segProgress), barH, barH / 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  drawTextLayers(ctx, width, height, baseScale, currentTime, textLayers);
  ctx.restore();
}
