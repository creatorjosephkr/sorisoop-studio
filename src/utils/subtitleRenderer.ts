import { getBundledFontById } from '../fonts/fonts';
import {
  BackgroundMedia,
  HologramPalette,
  LyricSegment,
  SubtitleStylePreset,
  TextLayer,
  VideoClip,
  VisualEffectsConfig,
} from '../types';

interface HologramPaletteSpec {
  hues: [number, number, number, number];
  sat: number;
  light: number;
  bgHues: [number, number];
}

function getHologramPaletteSpec(palette?: HologramPalette): HologramPaletteSpec {
  switch (palette) {
    case 'ocean':
      return { hues: [192, 210, 228, 172], sat: 88, light: 56, bgHues: [215, 198] };
    case 'sunset':
      return { hues: [342, 14, 34, 286], sat: 90, light: 60, bgHues: [275, 345] };
    case 'cosmic':
      return { hues: [262, 294, 328, 224], sat: 90, light: 60, bgHues: [255, 290] };
    case 'emerald':
      return { hues: [144, 168, 92, 50], sat: 84, light: 54, bgHues: [168, 138] };
    case 'moonlight':
      return { hues: [206, 224, 250, 190], sat: 76, light: 68, bgHues: [224, 240] };
    case 'aurora':
    default:
      return { hues: [176, 198, 268, 315], sat: 86, light: 58, bgHues: [212, 272] };
  }
}

function fillBackdropGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: HologramPaletteSpec,
  topLight: number,
  botLight: number,
  alpha: number
) {
  const grad = ctx.createLinearGradient(0, 0, width * 0.25, height);
  grad.addColorStop(0, `hsla(${spec.bgHues[0]}, ${Math.round(spec.sat * 0.65)}%, ${topLight}%, ${alpha})`);
  grad.addColorStop(
    0.55,
    `hsla(${(spec.bgHues[0] + spec.bgHues[1]) * 0.5}, ${Math.round(spec.sat * 0.7)}%, ${Math.round(
      (topLight + botLight) * 0.5
    )}%, ${alpha})`
  );
  grad.addColorStop(1, `hsla(${spec.bgHues[1]}, ${Math.round(spec.sat * 0.6)}%, ${botLight}%, ${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function fillSoftOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hue: number,
  sat: number,
  light: number,
  centerAlpha: number,
  midHueOffset = 35
) {
  if (r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `hsla(${hue}, ${sat}%, ${Math.min(92, light + 18)}%, ${centerAlpha})`);
  g.addColorStop(0.45, `hsla(${(hue + midHueOffset) % 360}, ${sat}%, ${light}%, ${centerAlpha * 0.42})`);
  g.addColorStop(1, `hsla(${(hue + midHueOffset) % 360}, ${sat}%, ${Math.max(18, light - 14)}%, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function fillBlurredSurface(
  ctx: CanvasRenderingContext2D,
  topPts: Array<{ x: number; y: number }>,
  botPts: Array<{ x: number; y: number }>,
  fillStyle: CanvasGradient | string,
  blurPx: number
) {
  if (topPts.length < 2 || botPts.length < 2) return;
  ctx.save();
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.beginPath();
  ctx.moveTo(topPts[0].x, topPts[0].y);
  for (let i = 1; i < topPts.length; i++) {
    const prev = topPts[i - 1];
    const cur = topPts[i];
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
  }
  ctx.lineTo(topPts[topPts.length - 1].x, topPts[topPts.length - 1].y);
  ctx.lineTo(botPts[botPts.length - 1].x, botPts[botPts.length - 1].y);
  for (let i = botPts.length - 2; i >= 0; i--) {
    const prev = botPts[i + 1];
    const cur = botPts[i];
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

const spectrumSmoothMap = new WeakMap<
  CanvasRenderingContext2D,
  { bins: Float32Array; samples: Float32Array; ledLevels: Float32Array; hologramBins: Float32Array }
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
        // 기본 검은색 배경
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  const baseScale = Math.min(width, height) / 1080;

  // 음악 반응형 비주얼 효과(홀로그램 3종)용 스무딩 오디오 빈 계산
  const rawHologramBins = spectrumBins && spectrumBins.length > 0 ? spectrumBins : new Uint8Array(48);
  const holoSmooth = Math.max(0, Math.min(0.94, visualEffects?.hologramSmoothing ?? 0.9));
  let holoEntry = spectrumSmoothMap.get(ctx);
  if (!holoEntry || holoEntry.hologramBins.length !== rawHologramBins.length) {
    holoEntry = {
      bins: holoEntry?.bins.length === rawHologramBins.length ? holoEntry.bins : new Float32Array(rawHologramBins.length),
      samples: holoEntry?.samples ?? new Float32Array(160),
      ledLevels: holoEntry?.ledLevels ?? new Float32Array(24),
      hologramBins: new Float32Array(rawHologramBins.length),
    };
    spectrumSmoothMap.set(ctx, holoEntry);
  }
  const holoKeep = holoSmooth;
  const holoTake = 1 - holoKeep;
  for (let i = 0; i < rawHologramBins.length; i++) {
    holoEntry.hologramBins[i] = holoEntry.hologramBins[i] * holoKeep + rawHologramBins[i] * holoTake;
  }
  const hologramBins = holoEntry.hologramBins;

  // 평균 오디오 에너지(0~1) 계산
  let avgEnergy = 0;
  let bassEnergy = 0;
  if (hologramBins.length > 0) {
    let sum = 0;
    let bassSum = 0;
    const bassCount = Math.max(1, Math.floor(hologramBins.length * 0.25));
    for (let i = 0; i < hologramBins.length; i++) {
      const v = hologramBins[i] / 255;
      sum += v;
      if (i < bassCount) bassSum += v;
    }
    avgEnergy = sum / hologramBins.length;
    bassEnergy = bassSum / bassCount;
  }

  // 1-A1. 오로라 구름 띠 (유기적 면 채우기 오로라 홀로그램)
  if (!transparentBackground && visualEffects?.hologramEnabled) {
    ctx.save();
    const minDim = Math.min(width, height);
    const vol = Math.min(1, avgEnergy * 1.5);
    const bass = Math.min(1, bassEnergy * 1.6);
    const t = currentTime;
    const spec = getHologramPaletteSpec(visualEffects.hologramPalette ?? 'aurora');

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.hologramOpacity ?? 0.38));

    fillBackdropGradient(ctx, width, height, spec, 10 + vol * 6, 16 + bass * 8, 0.55);

    const cloudBands = [
      { yRatio: 0.32, thickness: 0.24, speed: 0.42, freq: 2.3, hueIdxA: 0, hueIdxB: 2, binOffset: 0 },
      { yRatio: 0.50, thickness: 0.28, speed: -0.35, freq: 1.9, hueIdxA: 2, hueIdxB: 3, binOffset: 8 },
      { yRatio: 0.66, thickness: 0.22, speed: 0.28, freq: 2.7, hueIdxA: 1, hueIdxB: 0, binOffset: 16 },
      { yRatio: 0.43, thickness: 0.20, speed: -0.48, freq: 3.1, hueIdxA: 3, hueIdxB: 1, binOffset: 24 },
      { yRatio: 0.54, thickness: 0.26, speed: 0.31, freq: 1.6, hueIdxA: 1, hueIdxB: 2, binOffset: 32 },
    ];

    const steps = 28;
    const blurPx = Math.max(14, Math.round(30 * baseScale));

    for (let b = 0; b < cloudBands.length; b++) {
      const band = cloudBands[b];
      const baseCenterY = height * band.yRatio;
      const baseHalfThick = minDim * band.thickness * (0.58 + bass * 0.65);
      const hueShift = (t * 8 + b * 12) % 360;
      const hue1 = (spec.hues[band.hueIdxA] + hueShift) % 360;
      const hue2 = (spec.hues[band.hueIdxB] + hueShift) % 360;

      const topPts: Array<{ x: number; y: number }> = [];
      const botPts: Array<{ x: number; y: number }> = [];

      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -width * 0.06 + u * width * 1.12;
        const binIdx = (band.binOffset + i) % hologramBins.length;
        const binVal =
          spectrumBins && spectrumBins.length > 0 ? hologramBins[binIdx] / 255 : 0.12;

        const centerWave =
          Math.sin(u * Math.PI * band.freq + t * band.speed + b) *
            minDim *
            (0.08 + vol * 0.16) +
          Math.cos(u * Math.PI * (band.freq * 1.7) - t * band.speed * 1.4) *
            minDim *
            (0.04 + binVal * 0.11);

        const puff =
          0.55 +
          0.45 * Math.sin(u * Math.PI * 3.2 - t * (0.6 + b * 0.1) + b * 2) +
          binVal * 0.95;

        const localHalf = baseHalfThick * puff;
        const cy = baseCenterY + centerWave;
        topPts.push({ x, y: cy - localHalf });
        botPts.push({ x, y: cy + localHalf });
      }

      const alphaCenter = Math.min(0.32, 0.11 + vol * 0.15 + bass * 0.06);
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, `hsla(${hue1}, ${spec.sat}%, ${spec.light}%, ${alphaCenter * 0.5})`);
      grad.addColorStop(0.5, `hsla(${(hue1 + hue2) * 0.5}, ${spec.sat}%, ${spec.light + 4}%, ${alphaCenter})`);
      grad.addColorStop(1, `hsla(${hue2}, ${spec.sat}%, ${spec.light - 2}%, ${alphaCenter * 0.5})`);

      fillBlurredSurface(ctx, topPts, botPts, grad, blurPx);
    }

    // 구름 사이를 떠다니는 부드러운 몽환적 빛망울(보케 면)
    const moteCount = 24;
    for (let m = 0; m < moteCount; m++) {
      const s1 = Math.sin(m * 19.31) * 43758.5453;
      const s2 = Math.cos(m * 47.17) * 23421.631;
      const fx = s1 - Math.floor(s1);
      const fy = s2 - Math.floor(s2);
      const bin =
        spectrumBins && spectrumBins.length > 0
          ? hologramBins[m % hologramBins.length] / 255
          : 0.1;

      const mx = ((fx + Math.sin(t * 0.18 + m) * 0.08 + 1) % 1) * width;
      const my = ((fy + Math.cos(t * 0.15 + m * 1.4) * 0.08 + 1) % 1) * height;
      const mr = (18 + (m % 4) * 10 + bin * 36) * baseScale;
      const mHue = (spec.hues[m % spec.hues.length] + t * 10 + m * 6) % 360;

      fillSoftOrb(ctx, mx, my, mr, mHue, spec.sat, spec.light + 12, 0.08 + bin * 0.16, 20);
    }

    ctx.restore();
  }

  // 1-A2. 물 속 심해 빛결 (수중 배경 + 볼류메트릭 빛기둥 + 유영하는 물결 면 + 물방울 보케)
  if (!transparentBackground && visualEffects?.underwaterEnabled) {
    const rawBins = hologramBins;
    const minDim = Math.min(width, height);
    const t = currentTime;
    const vol = Math.min(1, avgEnergy * 1.5);
    const bass = Math.min(1, bassEnergy * 1.65);
    const spec = getHologramPaletteSpec(visualEffects.underwaterPalette ?? 'ocean');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.underwaterOpacity ?? 0.55));

    // 수중 심해 깊이감 배경 면
    fillBackdropGradient(ctx, width, height, spec, 18 + vol * 9, 5 + bass * 4, 0.85);

    // 수면 위에서 비스듬히 쏟아지는 볼류메트릭 빛기둥(God Rays) 면
    const rayCount = 6;
    ctx.save();
    ctx.filter = `blur(${Math.max(12, Math.round(24 * baseScale))}px)`;
    for (let r = 0; r < rayCount; r++) {
      const binVal = rawBins.length > 0 ? rawBins[(r * 6) % rawBins.length] / 255 : 0.15;
      const topX = width * (0.08 + r * 0.165) + Math.sin(t * 0.24 + r * 1.4) * width * 0.045;
      const topW = minDim * (0.055 + (r % 2) * 0.025 + binVal * 0.045);
      const botX = topX + width * 0.14 + Math.cos(t * 0.19 + r) * width * 0.035;
      const botW = topW * 2.7;
      const rayHue = (spec.hues[r % 2] + t * 5 + r * 7) % 360;
      const rayAlpha = Math.min(0.28, 0.09 + binVal * 0.14 + bass * 0.06);

      const rayGrad = ctx.createLinearGradient(topX, 0, botX, height * 0.88);
      rayGrad.addColorStop(0, `hsla(${rayHue}, ${spec.sat}%, ${Math.min(88, spec.light + 20)}%, ${rayAlpha})`);
      rayGrad.addColorStop(0.55, `hsla(${spec.hues[(r + 1) % 4]}, ${spec.sat}%, ${spec.light + 6}%, ${rayAlpha * 0.45})`);
      rayGrad.addColorStop(1, `hsla(${spec.hues[2]}, ${spec.sat}%, ${spec.light}%, 0)`);

      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(topX - topW, -height * 0.04);
      ctx.lineTo(topX + topW, -height * 0.04);
      ctx.lineTo(botX + botW, height * 0.92);
      ctx.lineTo(botX - botW, height * 0.92);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 수중 물결 커튼 면 (4겹 부드러운 수압/광택 파동 면)
    const waterLayers = [
      { yRatio: 0.22, thick: 0.22, speed: 0.36, freq: 2.1, hIdx: 0, binOff: 0 },
      { yRatio: 0.45, thick: 0.27, speed: -0.28, freq: 1.7, hIdx: 1, binOff: 10 },
      { yRatio: 0.68, thick: 0.24, speed: 0.22, freq: 2.5, hIdx: 3, binOff: 20 },
      { yRatio: 0.84, thick: 0.22, speed: -0.19, freq: 1.9, hIdx: 2, binOff: 30 },
    ];
    const steps = 28;
    const waterBlur = Math.max(14, Math.round(28 * baseScale));
    for (let l = 0; l < waterLayers.length; l++) {
      const wl = waterLayers[l];
      const topPts: Array<{ x: number; y: number }> = [];
      const botPts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -width * 0.05 + u * width * 1.1;
        const binVal = rawBins.length > 0 ? rawBins[(wl.binOff + i) % rawBins.length] / 255 : 0.14;
        const swell =
          Math.sin(u * Math.PI * wl.freq + t * wl.speed + l * 1.3) * minDim * (0.045 + vol * 0.085) +
          Math.cos(u * Math.PI * (wl.freq * 1.6) - t * wl.speed * 1.2) * minDim * (0.025 + binVal * 0.055);
        const cy = height * wl.yRatio + swell;
        const half = minDim * wl.thick * (0.55 + binVal * 0.65 + bass * 0.3);
        topPts.push({ x, y: cy - half });
        botPts.push({ x, y: cy + half });
      }
      const wHueA = (spec.hues[wl.hIdx] + t * 6) % 360;
      const wHueB = (spec.hues[(wl.hIdx + 1) % 4] + t * 6) % 360;
      const wAlpha = Math.min(0.24, 0.08 + vol * 0.11 + bass * 0.05);
      const wGrad = ctx.createLinearGradient(0, height * wl.yRatio - minDim * 0.2, width, height * wl.yRatio + minDim * 0.2);
      wGrad.addColorStop(0, `hsla(${wHueA}, ${spec.sat}%, ${spec.light}%, ${wAlpha * 0.5})`);
      wGrad.addColorStop(0.5, `hsla(${wHueB}, ${spec.sat}%, ${spec.light + 6}%, ${wAlpha})`);
      wGrad.addColorStop(1, `hsla(${wHueA}, ${spec.sat}%, ${spec.light - 4}%, ${wAlpha * 0.5})`);
      fillBlurredSurface(ctx, topPts, botPts, wGrad, waterBlur);
    }

    // 수중 물방울 보케 면 (선 없이 부드럽게 떠오르는 빛방울)
    const bubbleCount = 24;
    for (let i = 0; i < bubbleCount; i++) {
      const s1 = Math.sin(i * 29.71) * 43758.5453;
      const s2 = Math.cos(i * 53.19) * 24634.6345;
      const fx = s1 - Math.floor(s1);
      const fy = s2 - Math.floor(s2);
      const binVal = rawBins.length > 0 ? rawBins[i % rawBins.length] / 255 : 0.12;
      const riseSpeed = 0.028 + (i % 5) * 0.008;
      const bx = ((fx + Math.sin(t * 0.45 + i * 1.3) * 0.035 + 1) % 1) * width;
      const by = ((fy - t * riseSpeed + 100) % 1) * height;
      const br = (10 + (i % 4) * 7 + binVal * 26) * baseScale;
      const bHue = (spec.hues[i % spec.hues.length] + t * 8) % 360;
      fillSoftOrb(ctx, bx, by, br, bHue, spec.sat, spec.light + 16, 0.12 + binVal * 0.24, 18);
    }

    ctx.restore();
  }

  // 1-A3. 우주 성운 네뷸라 (성운 구름 면 + 은하 코어 광채 + 성단 보케)
  if (!transparentBackground && visualEffects?.nebulaEnabled) {
    const rawBins = hologramBins;
    const minDim = Math.min(width, height);
    const t = currentTime;
    const vol = Math.min(1, avgEnergy * 1.55);
    const bass = Math.min(1, bassEnergy * 1.7);
    const spec = getHologramPaletteSpec(visualEffects.nebulaPalette ?? 'cosmic');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.nebulaOpacity ?? 0.6));

    // 깊은 우주 공간 그라데이션 면
    fillBackdropGradient(ctx, width, height, spec, 7 + bass * 4, 12 + vol * 6, 0.9);

    // 6개의 대형 성운 가스 구름 면 (회전 & 음악 반응형 팽창)
    const nebulaClouds = [
      { cx: 0.28, cy: 0.36, rx: 0.46, ry: 0.26, rot: 0.35, hIdx: 0, binOff: 0 },
      { cx: 0.68, cy: 0.58, rx: 0.48, ry: 0.28, rot: -0.42, hIdx: 1, binOff: 8 },
      { cx: 0.50, cy: 0.48, rx: 0.52, ry: 0.24, rot: 0.18, hIdx: 2, binOff: 16 },
      { cx: 0.22, cy: 0.72, rx: 0.38, ry: 0.24, rot: -0.25, hIdx: 3, binOff: 24 },
      { cx: 0.76, cy: 0.26, rx: 0.40, ry: 0.22, rot: 0.52, hIdx: 0, binOff: 32 },
      { cx: 0.52, cy: 0.50, rx: 0.34, ry: 0.30, rot: -0.15, hIdx: 1, binOff: 40 },
    ];

    ctx.save();
    ctx.filter = `blur(${Math.max(18, Math.round(36 * baseScale))}px)`;
    for (let c = 0; c < nebulaClouds.length; c++) {
      const nc = nebulaClouds[c];
      const binVal = rawBins.length > 0 ? rawBins[nc.binOff % rawBins.length] / 255 : 0.15;
      const cx = width * (nc.cx + Math.sin(t * 0.11 + c * 1.4) * 0.045);
      const cy = height * (nc.cy + Math.cos(t * 0.09 + c * 1.9) * 0.045);
      const rx = minDim * nc.rx * (0.88 + bass * 0.28 + binVal * 0.24);
      const ry = minDim * nc.ry * (0.86 + vol * 0.26 + binVal * 0.22);
      const angle = nc.rot + Math.sin(t * 0.08 + c) * 0.14;
      const hue = (spec.hues[nc.hIdx] + t * 7 + c * 8) % 360;
      const hue2 = (spec.hues[(nc.hIdx + 1) % 4] + t * 7) % 360;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.scale(1, ry / Math.max(1, rx));
      const g = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
      g.addColorStop(0, `hsla(${hue2}, ${spec.sat}%, ${Math.min(82, spec.light + 14)}%, ${0.22 + binVal * 0.24})`);
      g.addColorStop(0.45, `hsla(${hue}, ${spec.sat}%, ${spec.light}%, ${0.14 + vol * 0.15})`);
      g.addColorStop(1, `hsla(${hue}, ${spec.sat}%, ${Math.max(20, spec.light - 16)}%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // 은하 중심 코어 성운 발광 면
    const coreX = width * (0.5 + Math.sin(t * 0.14) * 0.04);
    const coreY = height * (0.48 + Math.cos(t * 0.12) * 0.04);
    fillSoftOrb(
      ctx,
      coreX,
      coreY,
      minDim * (0.34 + bass * 0.14),
      (spec.hues[2] + t * 9) % 360,
      spec.sat,
      spec.light + 12,
      0.24 + bass * 0.26,
      45
    );

    // 성운 속 은은한 성단 보케 빛무리 (면 전용)
    const starClusterCount = 34;
    for (let s = 0; s < starClusterCount; s++) {
      const s1 = Math.sin(s * 37.13) * 43758.5453;
      const s2 = Math.cos(s * 83.41) * 24634.6345;
      const fx = s1 - Math.floor(s1);
      const fy = s2 - Math.floor(s2);
      const binVal = rawBins.length > 0 ? rawBins[s % rawBins.length] / 255 : 0.12;
      const sx = ((fx + Math.sin(t * 0.06 + s) * 0.018 + 1) % 1) * width;
      const sy = ((fy + Math.cos(t * 0.05 + s * 1.2) * 0.018 + 1) % 1) * height;
      const sr = (4 + (s % 5) * 3.5 + binVal * 15) * baseScale;
      const sHue = (spec.hues[s % 4] + s * 9 + t * 12) % 360;
      fillSoftOrb(ctx, sx, sy, sr, sHue, spec.sat, spec.light + 22, 0.25 + binVal * 0.45, 25);
    }

    ctx.restore();
  }

  // 1-A4. 하늘 구름 스카이 클라우드 (대기 그라데이션 + 태양/달 후광 + 입체 뭉게구름 볼륨 면)
  if (!transparentBackground && visualEffects?.skyCloudEnabled) {
    const rawBins = hologramBins;
    const minDim = Math.min(width, height);
    const t = currentTime;
    const vol = Math.min(1, avgEnergy * 1.5);
    const bass = Math.min(1, bassEnergy * 1.65);
    const spec = getHologramPaletteSpec(visualEffects.skyCloudPalette ?? 'sunset');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.skyCloudOpacity ?? 0.6));

    // 대기 하늘 그라데이션 면
    fillBackdropGradient(ctx, width, height, spec, 16 + vol * 8, 22 + bass * 8, 0.82);

    // 태양 / 달빛 대기 산란 후광 면
    const haloX = width * (0.5 + Math.sin(t * 0.08) * 0.06);
    const haloY = height * (0.34 + Math.cos(t * 0.07) * 0.04);
    fillSoftOrb(
      ctx,
      haloX,
      haloY,
      minDim * (0.38 + bass * 0.14),
      spec.hues[2],
      spec.sat,
      spec.light + 16,
      0.24 + bass * 0.22,
      -28
    );

    // 4개 고도 층의 흘러가는 입체 구름 띠 면
    const strata = [
      { yRatio: 0.22, thick: 0.18, speed: 0.18, hIdx: 0, binOff: 0 },
      { yRatio: 0.44, thick: 0.24, speed: -0.14, hIdx: 1, binOff: 12 },
      { yRatio: 0.66, thick: 0.26, speed: 0.12, hIdx: 2, binOff: 24 },
      { yRatio: 0.84, thick: 0.22, speed: -0.10, hIdx: 3, binOff: 36 },
    ];
    const steps = 28;
    const cloudBlur = Math.max(16, Math.round(30 * baseScale));
    for (let s = 0; s < strata.length; s++) {
      const st = strata[s];
      const topPts: Array<{ x: number; y: number }> = [];
      const botPts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -width * 0.06 + u * width * 1.12;
        const binVal = rawBins.length > 0 ? rawBins[(st.binOff + i) % rawBins.length] / 255 : 0.14;
        const billow =
          Math.sin(u * Math.PI * 2.8 + t * st.speed + s * 1.7) * minDim * (0.045 + vol * 0.065) +
          Math.cos(u * Math.PI * 5.2 - t * st.speed * 1.4 + s) * minDim * (0.02 + binVal * 0.045);
        const cy = height * st.yRatio + billow;
        const puffTop =
          minDim * st.thick * (0.48 + 0.42 * Math.abs(Math.sin(u * Math.PI * 3.4 + t * st.speed * 1.6)) + binVal * 0.55);
        const puffBot = minDim * st.thick * (0.35 + bass * 0.3);
        topPts.push({ x, y: cy - puffTop });
        botPts.push({ x, y: cy + puffBot });
      }
      const cHueA = (spec.hues[st.hIdx] + t * 5) % 360;
      const cHueB = (spec.hues[(st.hIdx + 1) % 4] + t * 5) % 360;
      const cAlpha = Math.min(0.32, 0.12 + vol * 0.12 + bass * 0.08);
      const grad = ctx.createLinearGradient(0, height * st.yRatio - minDim * 0.18, 0, height * st.yRatio + minDim * 0.18);
      grad.addColorStop(0, `hsla(${cHueB}, ${spec.sat}%, ${Math.min(88, spec.light + 18)}%, ${cAlpha})`);
      grad.addColorStop(0.55, `hsla(${cHueA}, ${spec.sat}%, ${spec.light + 4}%, ${cAlpha * 0.82})`);
      grad.addColorStop(1, `hsla(${cHueA}, ${spec.sat}%, ${Math.max(24, spec.light - 12)}%, ${cAlpha * 0.25})`);
      fillBlurredSurface(ctx, topPts, botPts, grad, cloudBlur);
    }

    // 구름 속 내부 산란광(음악에 맞춰 구름 덩어리가 안에서 환하게 호흡)
    const puffCount = 16;
    for (let p = 0; p < puffCount; p++) {
      const s1 = Math.sin(p * 41.27) * 43758.5453;
      const fx = s1 - Math.floor(s1);
      const binVal = rawBins.length > 0 ? rawBins[(p * 3) % rawBins.length] / 255 : 0.15;
      const drift = (p % 2 === 0 ? 1 : -1) * t * (0.012 + (p % 3) * 0.004);
      const px = ((fx + drift + 100) % 1) * width;
      const py = height * (0.18 + (p % 4) * 0.21 + Math.sin(t * 0.25 + p) * 0.03);
      const pr = minDim * (0.13 + (p % 3) * 0.045 + binVal * 0.09 + bass * 0.05);
      const pHue = (spec.hues[p % 4] + t * 6) % 360;
      fillSoftOrb(ctx, px, py, pr, pHue, Math.max(45, spec.sat - 10), Math.min(88, spec.light + 18), 0.12 + binVal * 0.22, 22);
    }

    ctx.restore();
  }

  // 1-A5. 몽환 벨벳 플라즈마 (화면 전체를 유체처럼 채우는 유기적 그라데이션 면)
  if (!transparentBackground && visualEffects?.plasmaEnabled) {
    const rawBins = hologramBins;
    const minDim = Math.min(width, height);
    const t = currentTime;
    const vol = Math.min(1, avgEnergy * 1.5);
    const bass = Math.min(1, bassEnergy * 1.7);
    const spec = getHologramPaletteSpec(visualEffects.plasmaPalette ?? 'aurora');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, visualEffects.plasmaOpacity ?? 0.55));

    // 벨벳 플라즈마 바탕 면
    fillBackdropGradient(ctx, width, height, spec, 10 + vol * 6, 14 + bass * 8, 0.78);

    // 화면 전체를 부드럽게 교차하며 채우는 7개의 대형 유체 플라즈마 블롭 면
    const blobCount = 7;
    for (let b = 0; b < blobCount; b++) {
      const binVal = rawBins.length > 0 ? rawBins[(b * 7) % rawBins.length] / 255 : 0.16;
      const bx =
        width *
        (0.5 +
          Math.sin(t * (0.21 + (b % 3) * 0.06) + b * 1.35) * 0.34 +
          Math.cos(t * 0.13 + b * 2.1) * 0.12);
      const by =
        height *
        (0.5 +
          Math.cos(t * (0.18 + (b % 4) * 0.05) + b * 1.65) * 0.34 +
          Math.sin(t * 0.11 + b * 1.9) * 0.12);
      const br = minDim * (0.36 + (b % 3) * 0.09 + bass * 0.16 + binVal * 0.18);
      const hue = (spec.hues[b % 4] + t * 14 + b * 18) % 360;
      fillSoftOrb(ctx, bx, by, br, hue, spec.sat, spec.light + 6, 0.22 + binVal * 0.24, 42);
    }

    // 2겹의 넓은 블러 벨벳 베일 면으로 색상 융합 강화
    const veilBlur = Math.max(20, Math.round(40 * baseScale));
    for (let v = 0; v < 2; v++) {
      const steps = 20;
      const topPts: Array<{ x: number; y: number }> = [];
      const botPts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -width * 0.05 + u * width * 1.1;
        const binVal = rawBins.length > 0 ? rawBins[(i * 2 + v * 15) % rawBins.length] / 255 : 0.14;
        const wave = Math.sin(u * Math.PI * (1.8 + v * 0.7) + t * (v === 0 ? 0.32 : -0.26) + v) * height * (0.14 + vol * 0.16);
        const cy = height * (0.38 + v * 0.24) + wave;
        const half = minDim * (0.24 + binVal * 0.18 + bass * 0.12);
        topPts.push({ x, y: cy - half });
        botPts.push({ x, y: cy + half });
      }
      const vh1 = (spec.hues[v * 2] + t * 12) % 360;
      const vh2 = (spec.hues[(v * 2 + 1) % 4] + t * 12) % 360;
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, `hsla(${vh1}, ${spec.sat}%, ${spec.light}%, ${0.12 + vol * 0.12})`);
      grad.addColorStop(1, `hsla(${vh2}, ${spec.sat}%, ${spec.light + 6}%, ${0.14 + bass * 0.12})`);
      fillBlurredSurface(ctx, topPts, botPts, grad, veilBlur);
    }

    ctx.restore();
  }

  // 1-A6. 스타더스트 보케 입자 (선 없이 부드러운 원형 빛망울 면)
  if (!transparentBackground && visualEffects?.prismParticlesEnabled) {
    const rawBins = hologramBins;
    const t = currentTime;
    const spec = getHologramPaletteSpec(visualEffects.prismParticlesPalette ?? 'aurora');
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

      const driftX =
        Math.sin(t * (0.22 + (i % 5) * 0.05) + i * 1.7) * 0.045 +
        Math.cos(t * (0.13 + (i % 3) * 0.04) + i * 0.9) * 0.025;
      const driftY =
        Math.cos(t * (0.19 + (i % 4) * 0.045) + i * 2.3) * 0.045 +
        Math.sin(t * (0.11 + (i % 6) * 0.03) + i * 1.1) * 0.025;
      const px = ((fx + driftX + 1) % 1) * width;
      const py = ((fy + driftY + 1) % 1) * height;

      const size = (2.6 + (i % 4) * 1.6 + binVal * 7.5) * baseScale;
      const hue = (spec.hues[i % spec.hues.length] + t * 16 + i * 7) % 360;
      fillSoftOrb(ctx, px, py, size * 3.6, hue, spec.sat, spec.light + 20, 0.38 + binVal * 0.48, 30);
    }

    ctx.restore();
  }

  // 1-B. 화면 가운데 오디오 스펙트럼 (음역대 / 높이 / 너비 / 색상 / 굵기 / 모양 / 움직임 둔화)
  if (!transparentBackground && visualEffects?.spectrumEnabled) {
    const rawBins = spectrumBins && spectrumBins.length > 0 ? spectrumBins : new Uint8Array(48);
    const band = visualEffects.spectrumBand ?? 'all';
    const heightRatio = Math.max(0.06, Math.min(0.85, visualEffects.spectrumHeight ?? 0.18));
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
        hologramBins: new Float32Array(rawBins.length),
      };
      spectrumSmoothMap.set(ctx, smoothEntry);
    }
    // 비대칭 스무딩: 상승(Attack)은 빠르게 반응해 최대 피크 높이를 유지하고, 하강(Release)만 부드럽게 감쇠
    const releaseKeep = smoothing;
    const attackKeep = smoothing * 0.25;
    for (let i = 0; i < rawBins.length; i++) {
      const prev = smoothEntry.bins[i];
      const target = rawBins[i];
      const keep = target > prev ? attackKeep : releaseKeep;
      smoothEntry.bins[i] = prev * keep + target * (1 - keep);
    }

    const bins = smoothEntry.bins.subarray(bandStart, bandStart + bandLen);
    const binCount = bins.length;
    const specWidth = width * widthRatio;
    const startX = (width - specWidth) / 2;
    const specPosYRatio = Math.max(0.08, Math.min(0.92, visualEffects.spectrumPosY ?? 0.5));
    const centerY = height * specPosYRatio;
    const maxAmp = height * heightRatio;
    // 높이 배율을 키워도 낮은 음량(최저값) 구간의 높이는 거의 커지지 않고 최대 피크 높이만 확장되도록 비선형 매핑
    const baseRefAmp = Math.min(maxAmp, height * 0.14);
    const extraAmp = Math.max(0, maxAmp - baseRefAmp);
    const scaleSpectrumAmp = (norm: number, scale = 1): number => {
      const clamped = Math.max(0, Math.min(1, norm));
      const peakRatio = Math.pow(Math.max(0, (clamped - 0.18) / 0.82), 1.25);
      return (clamped * baseRefAmp + peakRatio * extraAmp) * scale;
    };

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
          const y = centerY - Math.max(2 * baseScale, scaleSpectrumAmp(norm));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < binCount; i++) {
          const norm = bins[i] / 255;
          const x = startX + i * lineStep;
          const y = centerY + Math.max(2 * baseScale, scaleSpectrumAmp(norm));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        for (let i = 0; i < binCount; i++) {
          const norm = bins[i] / 255;
          const h = Math.max(4 * baseScale, scaleSpectrumAmp(norm));
          const x = startX + i * slotW + (slotW - barW) / 2;
          if (shape === 'dots') {
            const r = Math.max(2 * baseScale, barW * 0.48);
            ctx.beginPath();
            ctx.arc(x + barW / 2, centerY - h, r, 0, Math.PI * 2);
            ctx.arc(x + barW / 2, centerY + h, r, 0, Math.PI * 2);
            ctx.fill();
          } else if (shape === 'bottom') {
            const baseY = centerY + baseRefAmp * 0.75;
            const barH = Math.max(4 * baseScale, scaleSpectrumAmp(norm, 1.45));
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

      const sampleReleaseKeep = Math.min(0.85, smoothing * 0.85);
      const sampleAttackKeep = sampleReleaseKeep * 0.25;
      if (rawSamples) {
        for (let i = 0; i < pointCount; i++) {
          const prev = smoothEntry.samples[i];
          const target = rawSamples[i] * bandGain;
          const keep = Math.abs(target) > Math.abs(prev) ? sampleAttackKeep : sampleReleaseKeep;
          smoothEntry.samples[i] = prev * keep + target * (1 - keep);
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
          const sign = val >= 0 ? 1 : -1;
          return centerY + sign * scaleSpectrumAmp(Math.abs(val), 1.65);
        }
        const norm = bins[idx % binCount] / 255;
        return centerY + (idx % 2 === 0 ? 1 : -1) * scaleSpectrumAmp(norm, 1.65 * 0.75);
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
        hologramBins: new Float32Array(bins.length),
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

  const anchorX = width / 2 + (preset.offsetX ?? 0) * baseScale;
  let anchorY = height / 2;
  if (preset.position === 'top') anchorY = height * 0.18;
  else if (preset.position === 'bottom') anchorY = height * 0.82;
  anchorY += preset.offsetY * baseScale;

  ctx.save();
  ctx.translate(anchorX, anchorY);
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

    const borderW = preset.boxBorderWidth ?? 0;
    if (borderW > 0) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineWidth = borderW * baseScale;
      ctx.strokeStyle = preset.boxBorderColor ?? '#ffffff';
      ctx.stroke();
      ctx.restore();
    }
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
