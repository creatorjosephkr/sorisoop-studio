export interface LyricSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  notes?: string;
}

export type SubtitleAnimation =
  | 'karaoke-bar'
  | 'fade'
  | 'pop'
  | 'none';

export type SubtitlePosition = 'top' | 'center' | 'bottom';

export type AspectRatio = '16:9' | '9:16' | '1:1';

export interface SubtitleStylePreset {
  id: string;
  name: string;
  isBuiltIn: boolean;
  fontId: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  textColor: string;
  useGradient: boolean;
  gradientStart: string;
  gradientEnd: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  boxEnabled: boolean;
  boxColor: string;
  boxOpacity: number;
  boxRadius: number;
  boxPaddingX: number;
  boxPaddingY: number;
  position: SubtitlePosition;
  offsetY: number; // -200 ~ +200 px (기준 1080p)
  showPrevNext: boolean;
  animation: SubtitleAnimation;
  karaokeBarColor: string;
}

export interface BackgroundMedia {
  filePath: string;
  name: string;
  mediaType: 'image' | 'video';
  url: string;
  kenBurns: boolean;
  dimOpacity: number; // 0 ~ 0.85
  blurAmount: number; // 0 ~ 24 px
}

export type TransitionType =
  | 'none'
  | 'x-dissolve'
  | 'push'
  | 'slide'
  | 'dip-to-black'
  | 'dip-to-white'
  | 'tv-static';

export interface VideoClipTransition {
  type: TransitionType;
  durationSec: number; // 기본 1.0초 (30프레임)
}

export interface VideoClip {
  id: string;
  name: string;
  mediaType: 'video' | 'image';
  url: string;
  filePath: string;
  timelineStart: number;
  timelineEnd: number;
  sourceIn: number;
  sourceDuration: number; // 이미지는 기본 5초, 영상은 원본 길이
  opacity: number; // 0 ~ 1
  fitToFrame: boolean; // true: 프레임에 맞추기(cover), false: 원본 비율 유지(contain)
  thumbnailUrl?: string;
  transitionIn?: VideoClipTransition;
  transitionOut?: VideoClipTransition;
}

export type SpectrumMode = 'digital' | 'analog';

export interface VisualEffectsConfig {
  hologramEnabled: boolean;
  hologramOpacity: number; // 0.05 ~ 1.0
  spectrumEnabled: boolean;
  spectrumMode: SpectrumMode;
  spectrumOpacity: number; // 0.05 ~ 1.0
  lyricLedMeterEnabled?: boolean;
}

export type TextTransitionType =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom';

export interface TextLayerTransition {
  type: TextTransitionType;
  durationSec: number; // 기본 0.5초
}

export interface TextLayer {
  id: string;
  text: string;
  visible: boolean;
  x: number; // 0 ~ 100 (%)
  y: number; // 0 ~ 100 (%)
  alwaysVisible: boolean;
  startTime: number;
  endTime: number;
  transitionIn?: TextLayerTransition;
  transitionOut?: TextLayerTransition;
  fontId: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  opacity: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowAngle: number; // 0 ~ 360 deg
  shadowDistance: number;
  shadowBlur: number;
  boxEnabled: boolean;
  boxColor: string;
  boxOpacity: number;
  boxRadius: number;
  boxPaddingX: number;
  boxPaddingY: number;
}

export interface BundledFont {
  id: string;
  family: string;
  displayName: string;
  category: '고딕' | '명조' | '포인트/손글씨';
  license: string;
  url: string;
  weight: string;
}

export interface UpdateCheckResult {
  status: 'update-available' | 'up-to-date' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseUrl: string;
  downloadUrl?: string;
  publishedAt?: string;
  errorMessage?: string;
}

export interface ElectronAPI {
  getAppInfo: () => Promise<{
    platform: string;
    version: string;
    ffmpegPath: string;
    modelsDir: string;
  }>;
  openAudioFile: () => Promise<{
    filePath: string;
    name: string;
    data: Uint8Array;
  } | null>;
  readAudioFileByPath: (filePath: string) => Promise<{
    filePath: string;
    name: string;
    data: Uint8Array;
  } | null>;
  openBackgroundFile: () => Promise<{
    filePath: string;
    name: string;
    mediaType: 'image' | 'video';
    fileUrl: string;
  } | null>;
  saveTextFile: (
    defaultName: string,
    content: string,
    extName: string,
    ext: string
  ) => Promise<string | null>;
  transcribeWhisper: (
    pcm16k: Float32Array,
    modelId: string,
    language: string
  ) => Promise<{
    text: string;
    chunks: Array<{ text: string; timestamp: [number, number | null] }>;
  }>;
  onWhisperProgress: (
    cb: (payload: { status: string; progress?: number; message: string }) => void
  ) => () => void;
  getVideoEncoderInfo?: () => Promise<{
    codec: string;
    label: string;
    isHardware: boolean;
  }>;
  startVideoExport: (options: {
    width: number;
    height: number;
    fps: number;
    audioPath: string;
    defaultFileName: string;
    format?: 'mp4' | 'mov_alpha';
  }) => Promise<{ outputPath: string } | null>;
  writeVideoFrame: (rgbaBytes: Uint8Array) => Promise<void>;
  finishVideoExport: () => Promise<{ outputPath: string }>;
  cancelVideoExport: () => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;
  openExternalUrl?: (url: string) => Promise<void>;
  checkAppUpdate?: () => Promise<UpdateCheckResult>;
  onOpenPrivacyPolicy?: (cb: () => void) => () => void;
  onOpenUserGuide?: (cb: () => void) => () => void;
  onOpenUpdateModal?: (cb: (prefetched?: UpdateCheckResult) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
