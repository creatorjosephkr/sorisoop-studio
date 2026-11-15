import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FilePlus,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Palette,
  RotateCcw,
  Save,
  SaveAll,
  Sliders,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { ExportModal } from './components/ExportModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { SponsorIcon, SponsorModal } from './components/SponsorModal';
import { UpdateModal } from './components/UpdateModal';
import { UserGuideModal } from './components/UserGuideModal';
import appIconUrl from '../app-icon.png';
import { PreviewStage } from './components/PreviewStage';
import { SegmentListEditor } from './components/SegmentListEditor';
import {
  SettingRow,
  SettingSection,
  SliderControl,
  ToggleControl,
} from './components/SettingLayout';
import { StylePresetEditor } from './components/StylePresetEditor';
import { TextLayerEditor } from './components/TextLayerEditor';
import { WaveformTimeline } from './components/WaveformTimeline';
import { ensureBundledFontsLoaded } from './fonts/fonts';
import {
  AspectRatio,
  BackgroundMedia,
  DEFAULT_LED_METER_SETTINGS,
  DEFAULT_PRISM_RING_SETTINGS,
  DEFAULT_SPECTRUM_SETTINGS,
  LyricSegment,
  SpectrumBand,
  SpectrumMode,
  SpectrumShape,
  SubtitleStylePreset,
  TextLayer,
  UpdateCheckResult,
  VideoClip,
  VisualEffectsConfig,
} from './types';
import {
  DEFAULT_TRANSITION_DURATION,
  joinVideoClipsGaps,
  moveVideoClip,
  probeMediaClipInfo,
  setVideoClipPlaybackRate,
  sortClips,
  splitVideoClipAt,
  trimVideoClipEdge,
} from './utils/videoClipUtils';
import {
  moveSegmentWithBounds,
  normalizeSegmentGaps,
  refineSegmentsWithVocalEnvelope,
  shiftAllSegments,
  snapSegmentsToAcousticPeaks,
  updateSegmentWithLinkedBounds,
} from './utils/acousticSnapper';
import {
  audioBufferTo16kMono,
  computeSpectrumFromBuffer,
  extractTimeDomainSlice,
  extractWaveformPeaks,
} from './utils/audioEncoder';
import {
  buildSegmentsFromWhisper,
  extractPureLyricLines,
} from './utils/lyricMatcher';
import {
  DEFAULT_PRESETS,
  loadPresets,
  mergeWithDefaultPresets,
  savePresets,
} from './utils/presets';
import {
  toJsonContent,
  toLrcContent,
  toSrtContent,
} from './utils/subtitleExport';

type RightTab = 'lyrics' | 'style' | 'background' | 'text';
type AppTheme = 'default' | 'white' | 'light-gray' | 'dark-gray';

const APP_THEMES: Array<{ id: AppTheme; label: string; swatch: string }> = [
  { id: 'default', label: '기본 테마', swatch: '#0f172a' },
  { id: 'white', label: '흰색 테마', swatch: '#ffffff' },
  { id: 'light-gray', label: '연한 회색 테마', swatch: '#d4d8df' },
  { id: 'dark-gray', label: '진한 회색 테마', swatch: '#2a2a2f' },
];

const SETTINGS_STORAGE_KEY = 'sorisoop_app_settings_v1';

interface PersistedSettings {
  activePresetId?: string;
  aspectRatio?: AspectRatio;
  visualEffects?: VisualEffectsConfig;
  whisperModelId?: string;
  autoTrack?: boolean;
  volume?: number;
  isMuted?: boolean;
  previewHeight?: number;
  background?: BackgroundMedia | null;
  appTheme?: AppTheme;
}

function loadPersistedSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedSettings;
  } catch {
    return {};
  }
}

export function App() {
  const initialSettings = useRef<PersistedSettings>(loadPersistedSettings()).current;

  const [fontsReady, setFontsReady] = useState(false);
  const [trackName, setTrackName] = useState('업로드 대기 중');
  const [audioPath, setAudioPath] = useState('');
  const [duration, setDuration] = useState(0);
  const [audioSourceDuration, setAudioSourceDuration] = useState(0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(initialSettings.volume ?? 0.9);
  const [isMuted, setIsMuted] = useState(initialSettings.isMuted ?? false);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  const [leftDb, setLeftDb] = useState(-Infinity);
  const [rightDb, setRightDb] = useState(-Infinity);

  const [rawLyrics, setRawLyrics] = useState('');
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [segments, setSegmentsState] = useState<LyricSegment[]>([]);
  const segmentsRef = useRef<LyricSegment[]>([]);
  segmentsRef.current = segments;
  const [videoClips, setVideoClipsState] = useState<VideoClip[]>([]);
  const videoClipsRef = useRef<VideoClip[]>([]);
  videoClipsRef.current = videoClips;
  const [textLayers, setTextLayersState] = useState<TextLayer[]>([]);
  const textLayersRef = useRef<TextLayer[]>([]);
  textLayersRef.current = textLayers;

  type EditorHistorySnapshot = {
    segments: LyricSegment[];
    videoClips: VideoClip[];
    textLayers: TextLayer[];
  };
  const cloneHistorySnapshot = (snap: EditorHistorySnapshot): EditorHistorySnapshot => ({
    segments: snap.segments.map((s) => ({ ...s })),
    videoClips: snap.videoClips.map((c) => ({ ...c })),
    textLayers: snap.textLayers.map((l) => ({ ...l })),
  });
  const undoStackRef = useRef<EditorHistorySnapshot[]>([]);
  const redoStackRef = useRef<EditorHistorySnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const pushUndoSnapshot = useCallback(
    (snapshot?: Partial<EditorHistorySnapshot>) => {
      const full = cloneHistorySnapshot({
        segments: snapshot?.segments ?? segmentsRef.current,
        videoClips: snapshot?.videoClips ?? videoClipsRef.current,
        textLayers: snapshot?.textLayers ?? textLayersRef.current,
      });
      undoStackRef.current = [...undoStackRef.current.slice(-59), full];
      redoStackRef.current = [];
      syncHistoryFlags();
    },
    [syncHistoryFlags]
  );

  const setSegments = useCallback(
    (
      updater: LyricSegment[] | ((prev: LyricSegment[]) => LyricSegment[]),
      recordHistory = true
    ) => {
      setSegmentsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (recordHistory && next !== prev) {
          undoStackRef.current = [
            ...undoStackRef.current.slice(-59),
            cloneHistorySnapshot({
              segments: prev,
              videoClips: videoClipsRef.current,
              textLayers: textLayersRef.current,
            }),
          ];
          redoStackRef.current = [];
          queueMicrotask(syncHistoryFlags);
        }
        segmentsRef.current = next;
        return next;
      });
    },
    [syncHistoryFlags]
  );

  const setVideoClips = useCallback(
    (
      updater: VideoClip[] | ((prev: VideoClip[]) => VideoClip[]),
      recordHistory = true
    ) => {
      setVideoClipsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (recordHistory && next !== prev) {
          undoStackRef.current = [
            ...undoStackRef.current.slice(-59),
            cloneHistorySnapshot({
              segments: segmentsRef.current,
              videoClips: prev,
              textLayers: textLayersRef.current,
            }),
          ];
          redoStackRef.current = [];
          queueMicrotask(syncHistoryFlags);
        }
        videoClipsRef.current = next;
        return next;
      });
    },
    [syncHistoryFlags]
  );

  const setTextLayers = useCallback(
    (
      updater: TextLayer[] | ((prev: TextLayer[]) => TextLayer[]),
      recordHistory = true
    ) => {
      setTextLayersState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (recordHistory && next !== prev) {
          undoStackRef.current = [
            ...undoStackRef.current.slice(-59),
            cloneHistorySnapshot({
              segments: segmentsRef.current,
              videoClips: videoClipsRef.current,
              textLayers: prev,
            }),
          ];
          redoStackRef.current = [];
          queueMicrotask(syncHistoryFlags);
        }
        textLayersRef.current = next;
        return next;
      });
    },
    [syncHistoryFlags]
  );

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      cloneHistorySnapshot({
        segments: segmentsRef.current,
        videoClips: videoClipsRef.current,
        textLayers: textLayersRef.current,
      }),
    ];
    segmentsRef.current = prev.segments;
    videoClipsRef.current = prev.videoClips;
    textLayersRef.current = prev.textLayers;
    setSegmentsState(prev.segments);
    setVideoClipsState(prev.videoClips);
    setTextLayersState(prev.textLayers);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      cloneHistorySnapshot({
        segments: segmentsRef.current,
        videoClips: videoClipsRef.current,
        textLayers: textLayersRef.current,
      }),
    ];
    segmentsRef.current = next.segments;
    videoClipsRef.current = next.videoClips;
    textLayersRef.current = next.textLayers;
    setSegmentsState(next.segments);
    setVideoClipsState(next.videoClips);
    setTextLayersState(next.textLayers);
    syncHistoryFlags();
  }, [syncHistoryFlags]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [autoTrack, setAutoTrack] = useState(initialSettings.autoTrack ?? true);

  const [isWhisperRunning, setIsWhisperRunning] = useState(false);
  const [whisperStatusText, setWhisperStatusText] = useState('');
  const [whisperProgress, setWhisperProgress] = useState<number | null>(null);
  const [whisperModelId, setWhisperModelId] = useState(
    initialSettings.whisperModelId ?? 'Xenova/whisper-small'
  );

  const [presets, setPresets] = useState<SubtitleStylePreset[]>(() => loadPresets());
  const [activePresetId, setActivePresetId] = useState<string>(() => {
    const list = loadPresets();
    if (
      initialSettings.activePresetId &&
      list.some((p) => p.id === initialSettings.activePresetId)
    ) {
      return initialSettings.activePresetId;
    }
    return list[0].id;
  });

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    initialSettings.aspectRatio ?? '16:9'
  );
  const [previewHeight, setPreviewHeight] = useState<number>(
    initialSettings.previewHeight && initialSettings.previewHeight !== 380
      ? initialSettings.previewHeight
      : 500
  );
  const [background, setBackground] = useState<BackgroundMedia | null>(() => {
    const bg = initialSettings.background;
    if (bg && bg.filePath && bg.url.startsWith('file://')) {
      return bg;
    }
    return null;
  });
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTextLayerId, setSelectedTextLayerId] = useState<string | null>(null);
  const pendingMediaModeRef = useRef<'append' | 'insert'>('append');
  const [visualEffects, setVisualEffects] = useState<VisualEffectsConfig>(() => {
    const initVe = initialSettings.visualEffects;
    return {
      hologramEnabled: initVe?.hologramEnabled ?? false,
      hologramOpacity: initVe?.hologramOpacity ?? 0.38,
      prismRingEnabled: initVe?.prismRingEnabled ?? false,
      prismRingOpacity: initVe?.prismRingOpacity ?? DEFAULT_PRISM_RING_SETTINGS.prismRingOpacity,
      prismRingScale: initVe?.prismRingScale ?? DEFAULT_PRISM_RING_SETTINGS.prismRingScale,
      prismRingThickness:
        initVe?.prismRingThickness !== undefined && initVe.prismRingThickness >= 1
          ? Math.min(300, Math.round(initVe.prismRingThickness))
          : DEFAULT_PRISM_RING_SETTINGS.prismRingThickness,
      prismRingColor: initVe?.prismRingColor ?? DEFAULT_PRISM_RING_SETTINGS.prismRingColor,
      prismParticlesEnabled: initVe?.prismParticlesEnabled ?? false,
      prismParticlesOpacity: initVe?.prismParticlesOpacity ?? 0.6,
      hologramSmoothing: initVe?.hologramSmoothing ?? 0.72,
      spectrumEnabled: initVe?.spectrumEnabled ?? true,
      spectrumMode: initVe?.spectrumMode ?? DEFAULT_SPECTRUM_SETTINGS.spectrumMode,
      spectrumOpacity: initVe?.spectrumOpacity ?? DEFAULT_SPECTRUM_SETTINGS.spectrumOpacity,
      spectrumBand: initVe?.spectrumBand ?? DEFAULT_SPECTRUM_SETTINGS.spectrumBand,
      spectrumHeight: initVe?.spectrumHeight ?? DEFAULT_SPECTRUM_SETTINGS.spectrumHeight,
      spectrumWidth: initVe?.spectrumWidth ?? DEFAULT_SPECTRUM_SETTINGS.spectrumWidth,
      spectrumColor: initVe?.spectrumColor ?? DEFAULT_SPECTRUM_SETTINGS.spectrumColor,
      spectrumThickness: initVe?.spectrumThickness ?? DEFAULT_SPECTRUM_SETTINGS.spectrumThickness,
      spectrumShape: initVe?.spectrumShape ?? DEFAULT_SPECTRUM_SETTINGS.spectrumShape,
      spectrumSmoothing: initVe?.spectrumSmoothing ?? DEFAULT_SPECTRUM_SETTINGS.spectrumSmoothing,
      spectrumPosY: initVe?.spectrumPosY ?? DEFAULT_SPECTRUM_SETTINGS.spectrumPosY,
      lyricLedMeterEnabled: initVe?.lyricLedMeterEnabled ?? false,
      ledMeterPosY: initVe?.ledMeterPosY ?? DEFAULT_LED_METER_SETTINGS.ledMeterPosY,
      ledMeterColumns: initVe?.ledMeterColumns ?? DEFAULT_LED_METER_SETTINGS.ledMeterColumns,
      ledMeterHeight: initVe?.ledMeterHeight ?? DEFAULT_LED_METER_SETTINGS.ledMeterHeight,
      ledMeterThickness:
        initVe?.ledMeterThickness ?? DEFAULT_LED_METER_SETTINGS.ledMeterThickness,
      ledMeterOpacity: initVe?.ledMeterOpacity ?? DEFAULT_LED_METER_SETTINGS.ledMeterOpacity,
      ledMeterSmoothing:
        initVe?.ledMeterSmoothing ?? DEFAULT_LED_METER_SETTINGS.ledMeterSmoothing,
    };
  });
  const [spectrumBins, setSpectrumBins] = useState<Uint8Array | null>(null);
  const [waveformSamples, setWaveformSamples] = useState<Float32Array | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('lyrics');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const saveNoticeTimerRef = useRef<number | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [appTheme, setAppTheme] = useState<AppTheme>(initialSettings.appTheme ?? 'default');

  const runUpdateCheck = useCallback(async () => {
    if (!window.electronAPI?.checkAppUpdate) return;
    setIsCheckingUpdate(true);
    try {
      const res = await window.electronAPI.checkAppUpdate();
      setUpdateResult(res);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    if (appTheme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', appTheme);
    }
    void window.electronAPI?.setAppTheme?.(appTheme);
  }, [appTheme]);

  useEffect(() => {
    const offPrivacy = window.electronAPI?.onOpenPrivacyPolicy?.(() => {
      setShowPrivacyModal(true);
    });
    const offGuide = window.electronAPI?.onOpenUserGuide?.(() => {
      setShowGuideModal(true);
    });
    const offUpdate = window.electronAPI?.onOpenUpdateModal?.((prefetched) => {
      setShowUpdateModal(true);
      if (prefetched) {
        setUpdateResult(prefetched);
        setIsCheckingUpdate(false);
      } else {
        void runUpdateCheck();
      }
    });
    return () => {
      offPrivacy?.();
      offGuide?.();
      offUpdate?.();
    };
  }, [runUpdateCheck]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const leftAnalyserRef = useRef<AnalyserNode | null>(null);
  const rightAnalyserRef = useRef<AnalyserNode | null>(null);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const playbackRequestIdRef = useRef(0);
  const playStartCtxTimeRef = useRef(0);
  const playOffsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const fileAudioInputRef = useRef<HTMLInputElement | null>(null);
  const fileBgInputRef = useRef<HTMLInputElement | null>(null);
  const fileProjectInputRef = useRef<HTMLInputElement | null>(null);
  const whisperWorkerRef = useRef<Worker | null>(null);
  const whisperWorkerModelRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const markCleanOnNextSnapshotRef = useRef(true);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [isSavingBeforeClose, setIsSavingBeforeClose] = useState(false);

  const projectContentSnapshot = useMemo(
    () =>
      JSON.stringify({
        trackName,
        audioPath,
        aspectRatio,
        rawLyrics,
        segments,
        videoClips,
        textLayers,
        activePresetId,
        presets,
        visualEffects,
        whisperModelId,
      }),
    [
      trackName,
      audioPath,
      aspectRatio,
      rawLyrics,
      segments,
      videoClips,
      textLayers,
      activePresetId,
      presets,
      visualEffects,
      whisperModelId,
    ]
  );

  useEffect(() => {
    if (markCleanOnNextSnapshotRef.current) {
      lastSavedSnapshotRef.current = projectContentSnapshot;
      markCleanOnNextSnapshotRef.current = false;
      window.electronAPI?.setUnsavedChanges?.(false);
      return;
    }
    const dirty =
      lastSavedSnapshotRef.current !== null &&
      projectContentSnapshot !== lastSavedSnapshotRef.current;
    window.electronAPI?.setUnsavedChanges?.(dirty);
  }, [projectContentSnapshot]);

  useEffect(() => {
    const unsub = window.electronAPI?.onRequestClose?.(() => {
      setShowCloseConfirmModal(true);
    });
    return () => {
      unsub?.();
    };
  }, []);

  const activePreset =
    presets.find((p) => p.id === activePresetId) ?? presets[0];

  useEffect(() => {
    ensureBundledFontsLoaded().then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    return () => {
      whisperWorkerRef.current?.terminate();
      whisperWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  useEffect(() => {
    const payload: PersistedSettings = {
      activePresetId,
      aspectRatio,
      visualEffects,
      whisperModelId,
      autoTrack,
      volume,
      isMuted,
      previewHeight,
      background:
        background && background.filePath && background.url.startsWith('file://')
          ? background
          : null,
      appTheme,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    activePresetId,
    aspectRatio,
    visualEffects,
    whisperModelId,
    autoTrack,
    volume,
    isMuted,
    previewHeight,
    background,
    appTheme,
  ]);

  const stopAudioSource = useCallback(() => {
    playbackRequestIdRef.current += 1;
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
      } catch {
        // ignore
      }
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const guessAudioMimeType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      webm: 'audio/webm',
    };
    return map[ext] ?? '';
  };

  const computeBufferChannelDb = (
    buffer: AudioBuffer,
    channelIndex: number,
    timeSec: number,
    gainScale: number
  ): number => {
    if (gainScale <= 0) return -Infinity;
    const ch = Math.min(channelIndex, buffer.numberOfChannels - 1);
    const data = buffer.getChannelData(ch);
    const startSample = Math.max(0, Math.floor(timeSec * buffer.sampleRate));
    const windowSize = 1024;
    const endSample = Math.min(data.length, startSample + windowSize);
    if (endSample <= startSample) return -Infinity;
    let sum = 0;
    for (let i = startSample; i < endSample; i++) {
      const s = data[i] * gainScale;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / (endSample - startSample));
    if (rms <= 1e-6) return -Infinity;
    return 20 * Math.log10(rms);
  };

  const computeChannelDb = (analyser: AnalyserNode | null): number => {
    if (!analyser) return -Infinity;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    if (rms <= 1e-6) return -Infinity;
    return 20 * Math.log10(rms);
  };

  const startPlaybackAt = useCallback(
    async (offsetSec: number) => {
      const buffer = audioBufferRef.current;
      if (!buffer) return;

      stopAudioSource();
      const reqId = playbackRequestIdRef.current;
      const maxPlayDur =
        durationRef.current > 0 ? Math.min(buffer.duration, durationRef.current) : buffer.duration;
      const clampedOffset = Math.max(0, Math.min(maxPlayDur, offsetSec));

      // 1차 재생 경로: HTMLAudioElement (macOS Intel CoreAudio/WebAudio 무음 이슈 우회)
      const audioEl = audioElRef.current;
      if (audioEl) {
        try {
          audioEl.currentTime = clampedOffset;
          audioEl.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
          audioEl.muted = isMuted;
          await audioEl.play();
          if (playbackRequestIdRef.current !== reqId) {
            try {
              audioEl.pause();
            } catch {
              // ignore
            }
            return;
          }
          playOffsetRef.current = clampedOffset;
          setIsPlaying(true);

          const tickEl = () => {
            if (playbackRequestIdRef.current !== reqId) return;
            const el = audioElRef.current;
            const buf = audioBufferRef.current;
            if (!el || !buf || el.paused) return;
            const nextTime = el.currentTime;

            const maxDur =
              durationRef.current > 0 ? Math.min(buf.duration, durationRef.current) : buf.duration;
            if (el.ended || nextTime >= maxDur) {
              stopAudioSource();
              setIsPlaying(false);
              setCurrentTime(0);
              playOffsetRef.current = 0;
              setLeftDb(-Infinity);
              setRightDb(-Infinity);
              return;
            }

            setCurrentTime(nextTime);
            const gainScale = isMutedRef.current ? 0 : Math.max(0, Math.min(1, volumeRef.current));
            setLeftDb(computeBufferChannelDb(buf, 0, nextTime, gainScale));
            setRightDb(computeBufferChannelDb(buf, 1, nextTime, gainScale));
            setSpectrumBins(computeSpectrumFromBuffer(buf, nextTime, 48));
            setWaveformSamples(extractTimeDomainSlice(buf, nextTime, 160));

            rafRef.current = requestAnimationFrame(tickEl);
          };

          rafRef.current = requestAnimationFrame(tickEl);
          return;
        } catch {
          // HTMLAudioElement 재생 실패 시 Web Audio API 폴백으로 진행
        }
      }

      if (
        !audioCtxRef.current ||
        audioCtxRef.current.state === 'closed' ||
        (audioCtxRef.current.state as string) === 'interrupted'
      ) {
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          try {
            await audioCtxRef.current.close();
          } catch {
            // ignore
          }
        }
        audioCtxRef.current = new AudioContext();
      }

      let ctx = audioCtxRef.current;
      const resumeWithTimeout = (targetCtx: AudioContext) =>
        Promise.race([
          targetCtx.resume().catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 300)),
        ]);

      if (ctx.state !== 'running') {
        await resumeWithTimeout(ctx);
        if (playbackRequestIdRef.current !== reqId) return;
      }
      if ((ctx.state as string) !== 'running') {
        try {
          await ctx.close();
        } catch {
          // ignore
        }
        if (playbackRequestIdRef.current !== reqId) return;
        ctx = new AudioContext();
        audioCtxRef.current = ctx;
        await resumeWithTimeout(ctx);
        if (playbackRequestIdRef.current !== reqId) return;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : Math.max(0, Math.min(1, volume));
      gainNodeRef.current = gain;

      const splitter = ctx.createChannelSplitter(2);
      const analyserL = ctx.createAnalyser();
      const analyserR = ctx.createAnalyser();
      analyserL.fftSize = 512;
      analyserR.fftSize = 512;
      analyserL.smoothingTimeConstant = 0.6;
      analyserR.smoothingTimeConstant = 0.6;
      leftAnalyserRef.current = analyserL;
      rightAnalyserRef.current = analyserR;

      // Chromium Web Audio 그래프가 데드엔드 AnalyserNode를 건너뛰지 않도록 무음 Gain을 통해 destination에 연결
      const silentSink = ctx.createGain();
      silentSink.gain.value = 0;

      src.connect(gain);
      gain.connect(ctx.destination);
      gain.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, buffer.numberOfChannels > 1 ? 1 : 0);
      analyserL.connect(silentSink);
      analyserR.connect(silentSink);
      silentSink.connect(ctx.destination);

      src.start(0, clampedOffset);
      sourceNodeRef.current = src;
      playStartCtxTimeRef.current = ctx.currentTime;
      playOffsetRef.current = clampedOffset;
      setIsPlaying(true);

      const tick = () => {
        if (playbackRequestIdRef.current !== reqId) return;
        if (!audioCtxRef.current || !audioBufferRef.current) return;
        const elapsed = audioCtxRef.current.currentTime - playStartCtxTimeRef.current;
        const nextTime = playOffsetRef.current + elapsed;

        const maxDur =
          durationRef.current > 0
            ? Math.min(audioBufferRef.current.duration, durationRef.current)
            : audioBufferRef.current.duration;
        if (nextTime >= maxDur) {
          stopAudioSource();
          setIsPlaying(false);
          setCurrentTime(0);
          playOffsetRef.current = 0;
          setLeftDb(-Infinity);
          setRightDb(-Infinity);
          return;
        }

        setCurrentTime(nextTime);
        setLeftDb(computeChannelDb(leftAnalyserRef.current));
        setRightDb(computeChannelDb(rightAnalyserRef.current));

        if (leftAnalyserRef.current) {
          const freqData = new Uint8Array(leftAnalyserRef.current.frequencyBinCount);
          leftAnalyserRef.current.getByteFrequencyData(freqData);
          const downsampled = new Uint8Array(48);
          const step = Math.max(1, Math.floor(freqData.length / 48));
          for (let i = 0; i < 48; i++) {
            downsampled[i] = freqData[Math.min(freqData.length - 1, i * step)];
          }
          setSpectrumBins(downsampled);

          const timeData = new Float32Array(leftAnalyserRef.current.fftSize);
          leftAnalyserRef.current.getFloatTimeDomainData(timeData);
          const waveOut = new Float32Array(160);
          const waveStep = Math.max(1, Math.floor(timeData.length / 160));
          for (let i = 0; i < 160; i++) {
            waveOut[i] = timeData[Math.min(timeData.length - 1, i * waveStep)];
          }
          setWaveformSamples(waveOut);
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [isMuted, stopAudioSource, volume]
  );

  const handleTogglePlay = useCallback(() => {
    if (!audioBufferRef.current) return;
    if (isPlaying) {
      stopAudioSource();
      setIsPlaying(false);
      setLeftDb(-Infinity);
      setRightDb(-Infinity);
    } else {
      startPlaybackAt(currentTime);
    }
  }, [currentTime, isPlaying, startPlaybackAt, stopAudioSource]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(duration, time));
      setCurrentTime(clamped);
      playOffsetRef.current = clamped;
      if (!isPlaying && audioBufferRef.current) {
        setSpectrumBins(computeSpectrumFromBuffer(audioBufferRef.current, clamped, 48));
        setWaveformSamples(extractTimeDomainSlice(audioBufferRef.current, clamped, 160));
      }
      if (isPlaying) {
        startPlaybackAt(clamped);
      }
    },
    [duration, isPlaying, startPlaybackAt]
  );

  // 키보드 단축키: Space (재생/정지), ArrowUp / ArrowDown (가사 구간 시작/끝 이동)
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

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          setVideoClips((prev) => prev.filter((c) => c.id !== selectedClipId));
          setSelectedClipId(null);
          return;
        }
        if (selectedTextLayerId) {
          e.preventDefault();
          handleDeleteTextLayer(selectedTextLayerId);
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
        return;
      }

      if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && segments.length > 0) {
        e.preventDefault();
        const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
        const curIdx = sorted.findIndex((s) => s.id === selectedSegmentId);
        const activeIdx =
          curIdx !== -1
            ? curIdx
            : sorted.findIndex((s) => currentTime >= s.startTime && currentTime <= s.endTime);

        if (e.code === 'ArrowDown') {
          if (activeIdx === -1) {
            setSelectedSegmentId(sorted[0].id);
            handleSeek(sorted[0].startTime);
          } else {
            const seg = sorted[activeIdx];
            if (currentTime < seg.endTime - 0.05) {
              setSelectedSegmentId(seg.id);
              handleSeek(seg.endTime);
            } else if (activeIdx + 1 < sorted.length) {
              const nextSeg = sorted[activeIdx + 1];
              setSelectedSegmentId(nextSeg.id);
              handleSeek(nextSeg.startTime);
            }
          }
        } else {
          if (activeIdx === -1) {
            const last = sorted[sorted.length - 1];
            setSelectedSegmentId(last.id);
            handleSeek(last.startTime);
          } else {
            const seg = sorted[activeIdx];
            if (currentTime > seg.startTime + 0.05) {
              setSelectedSegmentId(seg.id);
              handleSeek(seg.startTime);
            } else if (activeIdx - 1 >= 0) {
              const prevSeg = sorted[activeIdx - 1];
              setSelectedSegmentId(prevSeg.id);
              handleSeek(prevSeg.startTime);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentTime,
    handleSeek,
    handleTogglePlay,
    segments,
    selectedClipId,
    selectedSegmentId,
    selectedTextLayerId,
  ]);

  useEffect(() => {
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
    const targetGain = isMuted ? 0 : Math.max(0, Math.min(1, volume));
    if (audioElRef.current) {
      audioElRef.current.volume = targetGain;
      audioElRef.current.muted = isMuted;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = targetGain;
    }
  }, [volume, isMuted]);

  const decodeAndLoadAudio = async (arrayBuffer: ArrayBuffer, name: string, filePath: string) => {
    stopAudioSource();
    setIsPlaying(false);
    setCurrentTime(0);
    playOffsetRef.current = 0;

    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    const blob = new Blob([arrayBuffer], { type: guessAudioMimeType(name) });
    const blobUrl = URL.createObjectURL(blob);
    audioBlobUrlRef.current = blobUrl;
    const audioEl = new Audio(blobUrl);
    audioEl.preload = 'auto';
    audioEl.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
    audioEl.muted = isMuted;
    audioElRef.current = audioEl;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const decoded = await audioCtxRef.current.decodeAudioData(arrayBuffer.slice(0));
    audioBufferRef.current = decoded;
    setTrackName(name);
    setAudioPath(filePath);
    setAudioSourceDuration(decoded.duration);
    setDuration(decoded.duration);
    setPeaks(extractWaveformPeaks(decoded, 1200));
  };

  const handleNewProject = () => {
    const hasWork =
      duration > 0 || rawLyrics.trim().length > 0 || segments.length > 0;
    if (
      hasWork &&
      !window.confirm('현재 작업 중인 음원과 가사 싱크를 초기화하고 새로 만드시겠습니까?')
    ) {
      return;
    }
    stopAudioSource();
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    audioElRef.current = null;
    audioBufferRef.current = null;
    setIsPlaying(false);
    setTrackName('업로드 대기 중');
    setAudioPath('');
    setAudioSourceDuration(0);
    setDuration(0);
    setCurrentTime(0);
    playOffsetRef.current = 0;
    setPeaks(null);
    setLeftDb(-Infinity);
    setRightDb(-Infinity);
    setSpectrumBins(null);
    setWaveformSamples(null);
    setRawLyrics('');
    setSegments([], false);
    setSelectedSegmentId(null);
    setWhisperStatusText('');
    setWhisperProgress(null);
    setVideoClips([], false);
    setSelectedClipId(null);
    setTextLayers([], false);
    setCurrentProjectPath(null);
    setSelectedTextLayerId(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryFlags();
  };

  const handleAddTextLayer = () => {
    const id = `tlayer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newLayer: TextLayer = {
      id,
      text: '새 텍스트',
      visible: true,
      x: 50,
      y: 20,
      alwaysVisible: true,
      startTime: Math.max(0, currentTime),
      endTime: duration > 0 ? Math.min(duration, currentTime + 5) : currentTime + 5,
      fontId: activePreset.fontId,
      fontSize: 48,
      fontWeight: 700,
      textColor: '#ffffff',
      opacity: 1,
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.75)',
      shadowAngle: 135,
      shadowDistance: 6,
      shadowBlur: 12,
      boxEnabled: false,
      boxColor: '#0f172a',
      boxOpacity: 0.72,
      boxRadius: 14,
      boxPaddingX: 24,
      boxPaddingY: 14,
    };
    setTextLayers((prev) => [...prev, newLayer]);
    setSelectedTextLayerId(id);
  };

  const handleUpdateTextLayer = (
    id: string,
    patch: Partial<TextLayer>,
    recordHistory = true
  ) => {
    setTextLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)), recordHistory);
  };

  const handleDeleteTextLayer = (id: string) => {
    setTextLayers((prev) => {
      const next = prev.filter((l) => l.id !== id);
      if (selectedTextLayerId === id) {
        setSelectedTextLayerId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleMoveTextLayer = useCallback(
    (id: string, x: number, y: number) => {
      setTextLayers((prev) => prev.map((l) => (l.id === id ? { ...l, x, y } : l)), false);
    },
    [setTextLayers]
  );

  const handleOpenAudio = async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.openAudioFile();
      if (!res) return;
      const copy = new Uint8Array(res.data).buffer;
      await decodeAndLoadAudio(copy, res.name, res.filePath);
    } else {
      fileAudioInputRef.current?.click();
    }
  };

  const addMediaListToVideoTrack = async (
    items: Array<{
      url: string;
      name: string;
      mediaType: 'video' | 'image';
      filePath: string;
    }>,
    mode: 'append' | 'insert'
  ) => {
    if (items.length === 0) return;
    const baseTime = Date.now();
    const probed = await Promise.all(
      items.map(async (item, index) => {
        const { sourceDuration, thumbnailUrl } = await probeMediaClipInfo(
          item.url,
          item.mediaType
        );
        return {
          ...item,
          id: `vclip-${baseTime}-${index}`,
          sourceDuration,
          thumbnailUrl,
        };
      })
    );

    setVideoClips((prev) => {
      const sorted = sortClips(prev);
      let cursor =
        mode === 'insert'
          ? Math.max(0, Number(currentTime.toFixed(2)))
          : sorted.length > 0
            ? sorted[sorted.length - 1].timelineEnd
            : 0;

      const newClips: VideoClip[] = probed.map((item) => {
        const timelineStart = Number(cursor.toFixed(2));
        const timelineEnd = Number((cursor + item.sourceDuration).toFixed(2));
        cursor = timelineEnd;
        return {
          id: item.id,
          name: item.name,
          mediaType: item.mediaType,
          url: item.url,
          filePath: item.filePath,
          timelineStart,
          timelineEnd,
          sourceIn: 0,
          sourceDuration: item.sourceDuration,
          opacity: 1,
          fitToFrame: true,
          thumbnailUrl: item.thumbnailUrl,
          transitionIn: { type: 'none', durationSec: DEFAULT_TRANSITION_DURATION },
        };
      });

      if (mode === 'insert') {
        const insertStart = Math.max(0, Number(currentTime.toFixed(2)));
        const totalDur = Number((cursor - insertStart).toFixed(2));
        const shifted = sorted.map((c) => {
          if (c.timelineStart >= insertStart - 0.05) {
            return {
              ...c,
              timelineStart: Number((c.timelineStart + totalDur).toFixed(2)),
              timelineEnd: Number((c.timelineEnd + totalDur).toFixed(2)),
            };
          }
          return c;
        });
        return sortClips([...shifted, ...newClips]);
      }

      return [...sorted, ...newClips];
    });
    setSelectedClipId(probed[probed.length - 1].id);
  };

  const handleOpenBackground = async (mode: 'append' | 'insert' = 'append') => {
    pendingMediaModeRef.current = mode;
    if (window.electronAPI) {
      if (window.electronAPI.openBackgroundFiles) {
        const list = await window.electronAPI.openBackgroundFiles();
        if (!list || list.length === 0) return;
        await addMediaListToVideoTrack(
          list.map((res) => ({
            url: res.fileUrl,
            name: res.name,
            mediaType: res.mediaType,
            filePath: res.filePath,
          })),
          mode
        );
      } else {
        const res = await window.electronAPI.openBackgroundFile();
        if (!res) return;
        await addMediaListToVideoTrack(
          [
            {
              url: res.fileUrl,
              name: res.name,
              mediaType: res.mediaType,
              filePath: res.filePath,
            },
          ],
          mode
        );
      }
    } else {
      fileBgInputRef.current?.click();
    }
  };

  const handleCancelWhisperSync = () => {
    if (whisperWorkerRef.current) {
      whisperWorkerRef.current.terminate();
      whisperWorkerRef.current = null;
    }
    setIsWhisperRunning(false);
    setWhisperProgress(null);
    setWhisperStatusText('분석이 사용자에 의해 중지되었습니다.');
  };

  const handleRunWhisperSync = async () => {
    if (!audioBufferRef.current) return;

    try {
      setIsWhisperRunning(true);
      setWhisperProgress(0);
      setWhisperStatusText('16kHz 모노 오디오 변환 중...');
      const pcm16k = await audioBufferTo16kMono(audioBufferRef.current);

      if (whisperWorkerRef.current && whisperWorkerModelRef.current !== whisperModelId) {
        whisperWorkerRef.current.terminate();
        whisperWorkerRef.current = null;
        whisperWorkerModelRef.current = null;
      }

      if (!whisperWorkerRef.current) {
        whisperWorkerRef.current = new Worker(
          new URL('./workers/whisperWorker.ts', import.meta.url),
          { type: 'module' }
        );
        whisperWorkerModelRef.current = whisperModelId;
      }
      const worker = whisperWorkerRef.current;

      const result = await new Promise<{
        text: string;
        chunks: Array<{ text: string; timestamp: [number, number | null] }>;
      }>((resolve, reject) => {
        const onMessage = (e: MessageEvent) => {
          const data = e.data;
          if (data.type === 'progress') {
            setWhisperStatusText(data.message);
            if (typeof data.progress === 'number') {
              setWhisperProgress(data.progress);
            }
          } else if (data.type === 'result') {
            cleanup();
            resolve({ text: data.text, chunks: data.chunks });
          } else if (data.type === 'error') {
            cleanup();
            reject(new Error(data.message));
          }
        };
        const onError = (err: ErrorEvent) => {
          cleanup();
          reject(new Error(err.message || 'Whisper Worker 오류'));
        };
        const cleanup = () => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({
          type: 'transcribe',
          pcm16k,
          modelId: whisperModelId,
          language: 'korean',
        });
      });

      let nextSegments = buildSegmentsFromWhisper(
        result.chunks,
        rawLyrics,
        audioBufferRef.current.duration,
        pcm16k
      );
      nextSegments = snapSegmentsToAcousticPeaks(nextSegments, audioBufferRef.current);
      setSegments(nextSegments);
      if (result.chunks.length === 0) {
        setWhisperStatusText(
          nextSegments.length > 0
            ? `Whisper가 음성을 인식하지 못해 오디오 에너지 기준으로 ${nextSegments.length}개 구간을 임시 배치했습니다. (보컬 분리 음원 권장)`
            : 'Whisper가 음성을 인식하지 못했습니다. 반주가 큰 곡은 보컬 분리 음원 사용을 권장합니다.'
        );
      } else {
        setWhisperStatusText(
          `완료! ${nextSegments.length}개 가사 구간 생성 (인식 청크 ${result.chunks.length}개 · 보컬 어택 스냅 적용)`
        );
      }
    } catch (err) {
      if (whisperWorkerRef.current) {
        whisperWorkerRef.current.terminate();
        whisperWorkerRef.current = null;
        whisperWorkerModelRef.current = null;
      }
      setWhisperStatusText(
        `실패: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsWhisperRunning(false);
      setWhisperProgress(null);
    }
  };

  const handleSnapVocalAttacks = () => {
    if (!audioBufferRef.current || segments.length === 0) return;
    setSegments((prev) => snapSegmentsToAcousticPeaks(prev, audioBufferRef.current!));
  };

  const handleNormalizeGaps = () => {
    setSegments((prev) => {
      const next = normalizeSegmentGaps(prev, 5.0);
      const changed = next.filter((s, i) => s.endTime !== prev[i]?.endTime).length;
      setWhisperStatusText(`가사 빈틈 연결 완료 (${changed}개 구간 경계 연결됨)`);
      return next;
    });
  };

  const handleRefineSync = async () => {
    if (!audioBufferRef.current || segments.length === 0) return;
    setWhisperStatusText('2차 정밀 최적화 중 (보컬 대역 필터링 & 어택 스냅)...');
    const snapshot = segments;
    const refined = await refineSegmentsWithVocalEnvelope(snapshot, audioBufferRef.current);
    const changed = refined.filter(
      (s, i) => s.startTime !== snapshot[i]?.startTime || s.endTime !== snapshot[i]?.endTime
    ).length;
    setSegments(refined);
    setWhisperStatusText(
      `2차 정밀 최적화 완료! (${refined.length}개 중 ${changed}개 구간 보정됨)`
    );
  };

  const handleShiftAll = (deltaSec: number) => {
    setSegments((prev) => shiftAllSegments(prev, deltaSec, duration));
  };

  const handleSaveTextExport = async (type: 'lrc' | 'srt' | 'json') => {
    const base = trackName.replace(/\.[^/.]+$/, '') || 'lyrics';
    let content = '';
    let ext = 'txt';
    let extName = 'Text File';

    if (type === 'lrc') {
      content = toLrcContent(segments);
      ext = 'lrc';
      extName = 'LRC Lyrics';
    } else if (type === 'srt') {
      content = toSrtContent(segments);
      ext = 'srt';
      extName = 'SRT Subtitle';
    } else {
      content = toJsonContent(trackName, duration, segments);
      ext = 'json';
      extName = 'JSON File';
    }

    if (window.electronAPI) {
      await window.electronAPI.saveTextFile(`${base}.${ext}`, content, extName, ext);
    } else {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleChangeActiveStyle = (patch: Partial<SubtitleStylePreset>) => {
    setPresets((prev) =>
      prev.map((p) => (p.id === activePreset.id ? { ...p, ...patch } : p))
    );
  };

  const handleCreatePreset = (newName: string) => {
    const created: SubtitleStylePreset = {
      ...activePreset,
      id: `custom-${Date.now()}`,
      name: newName,
      isBuiltIn: false,
    };
    setPresets((prev) => [...prev, created]);
    setActivePresetId(created.id);
  };

  const handleDeletePreset = (id: string) => {
    setPresets((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (activePresetId === id && filtered.length > 0) {
        setActivePresetId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleResetBuiltInPreset = (id: string) => {
    const def = DEFAULT_PRESETS.find((p) => p.id === id);
    if (!def) return;
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...def } : p)));
  };

  // 가사 카드 위/아래 테두리 호버 추가 버튼: 기본 3초 길이 빈 가사 삽입 + 앞/뒤 구간 자동 조절
  const handleInsertEmptyLyricAt = (insertIndex: number) => {
    const TARGET_LEN = 3.0;
    const MIN_NEIGHBOR = 0.5;

    setSegments((prev) => {
      const nextList = prev.map((s) => ({ ...s }));
      const newId = `seg-${Date.now()}`;

      if (nextList.length === 0) {
        const end = Number(Math.min(duration || TARGET_LEN, TARGET_LEN).toFixed(2));
        setSelectedSegmentId(newId);
        return [{ id: newId, startTime: 0, endTime: end, text: '' }];
      }

      if (insertIndex <= 0) {
        const first = nextList[0];
        const gap = first.startTime;
        if (gap >= TARGET_LEN) {
          const st = Number((first.startTime - TARGET_LEN).toFixed(2));
          const inserted: LyricSegment = { id: newId, startTime: st, endTime: first.startTime, text: '' };
          setSelectedSegmentId(newId);
          return [inserted, ...nextList];
        }
        const need = TARGET_LEN - gap;
        const firstAvail = Math.max(0, first.endTime - MIN_NEIGHBOR - first.startTime);
        const shift = Math.min(firstAvail, need);
        first.startTime = Number((first.startTime + shift).toFixed(2));
        const inserted: LyricSegment = {
          id: newId,
          startTime: 0,
          endTime: first.startTime,
          text: '',
        };
        setSelectedSegmentId(newId);
        return [inserted, ...nextList];
      }

      if (insertIndex >= nextList.length) {
        const last = nextList[nextList.length - 1];
        const maxEnd = duration > 0 ? duration : last.endTime + TARGET_LEN;
        const gap = Math.max(0, maxEnd - last.endTime);
        if (gap >= TARGET_LEN) {
          const en = Number(Math.min(maxEnd, last.endTime + TARGET_LEN).toFixed(2));
          const inserted: LyricSegment = { id: newId, startTime: last.endTime, endTime: en, text: '' };
          setSelectedSegmentId(newId);
          return [...nextList, inserted];
        }
        const need = TARGET_LEN - gap;
        const lastAvail = Math.max(0, last.endTime - (last.startTime + MIN_NEIGHBOR));
        const shrink = Math.min(lastAvail, need);
        last.endTime = Number((last.endTime - shrink).toFixed(2));
        const inserted: LyricSegment = {
          id: newId,
          startTime: last.endTime,
          endTime: Number(maxEnd.toFixed(2)),
          text: '',
        };
        setSelectedSegmentId(newId);
        return [...nextList, inserted];
      }

      const prevSeg = nextList[insertIndex - 1];
      const nextSeg = nextList[insertIndex];
      const gap = Math.max(0, nextSeg.startTime - prevSeg.endTime);

      if (gap >= TARGET_LEN) {
        const inserted: LyricSegment = {
          id: newId,
          startTime: prevSeg.endTime,
          endTime: Number((prevSeg.endTime + TARGET_LEN).toFixed(2)),
          text: '',
        };
        setSelectedSegmentId(newId);
        return [...nextList.slice(0, insertIndex), inserted, ...nextList.slice(insertIndex)];
      }

      // 서로 붙어 있거나 간격이 3초 미만이면 앞/뒤 가사 끝/시작 시간을 나눠서 줄여 3초 공간 확보
      const need = TARGET_LEN - gap;
      const prevAvail = Math.max(0, prevSeg.endTime - (prevSeg.startTime + MIN_NEIGHBOR));
      const nextAvail = Math.max(0, nextSeg.endTime - MIN_NEIGHBOR - nextSeg.startTime);

      let takePrev = Math.min(prevAvail, need / 2);
      let takeNext = Math.min(nextAvail, need - takePrev);
      if (takePrev + takeNext < need) {
        takePrev = Math.min(prevAvail, need - takeNext);
      }

      prevSeg.endTime = Number((prevSeg.endTime - takePrev).toFixed(2));
      nextSeg.startTime = Number((nextSeg.startTime + takeNext).toFixed(2));

      const inserted: LyricSegment = {
        id: newId,
        startTime: prevSeg.endTime,
        endTime: nextSeg.startTime,
        text: '',
      };
      setSelectedSegmentId(newId);
      return [...nextList.slice(0, insertIndex), inserted, ...nextList.slice(insertIndex)];
    });
  };

  // 가사 맨 앞에서 Backspace 시 윗 줄 가사와 병합 (표시 시간 유동 통합)
  const handleMergeSegmentWithPrevious = (id: string) => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx <= 0) return prev;

      const prevSeg = prev[idx - 1];
      const currSeg = prev[idx];
      let mergedText = prevSeg.text;
      if (prevSeg.text.length === 0) {
        mergedText = currSeg.text;
      } else if (currSeg.text.length > 0) {
        mergedText =
          /\s$/.test(prevSeg.text) || /^\s/.test(currSeg.text)
            ? `${prevSeg.text}${currSeg.text}`
            : `${prevSeg.text} ${currSeg.text}`;
      }

      const merged: LyricSegment = {
        ...prevSeg,
        startTime: Number(Math.min(prevSeg.startTime, currSeg.startTime).toFixed(2)),
        endTime: Number(Math.max(prevSeg.endTime, currSeg.endTime).toFixed(2)),
        text: mergedText,
      };
      setSelectedSegmentId(prevSeg.id);
      return [...prev.slice(0, idx - 1), merged, ...prev.slice(idx + 1)];
    });
  };

  // 가사 글자 사이에서 Cmd/Ctrl+Enter 시 두 구간으로 분리 (글자 수 비율로 표시 시간 분배)
  const handleSplitSegment = (
    id: string,
    selStart: number,
    selEnd: number,
    newId: string
  ) => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;

      const seg = prev[idx];
      const leftText = seg.text.slice(0, selStart).trimEnd();
      const rightText = seg.text.slice(selEnd).trimStart();
      if (!leftText || !rightText) return prev;

      const totalDur = Math.max(0.2, seg.endTime - seg.startTime);
      const leftWeight = leftText.replace(/\s+/g, '').length || leftText.length;
      const rightWeight = rightText.replace(/\s+/g, '').length || rightText.length;
      const minDur = Math.min(0.2, totalDur / 2);
      const rawSplit = seg.startTime + totalDur * (leftWeight / (leftWeight + rightWeight));
      const splitTime = Number(
        Math.min(seg.endTime - minDur, Math.max(seg.startTime + minDur, rawSplit)).toFixed(2)
      );

      const firstSeg: LyricSegment = {
        ...seg,
        endTime: splitTime,
        text: leftText,
      };
      const secondSeg: LyricSegment = {
        id: newId,
        startTime: splitTime,
        endTime: seg.endTime,
        text: rightText,
      };
      setSelectedSegmentId(newId);
      return [...prev.slice(0, idx), firstSeg, secondSeg, ...prev.slice(idx + 1)];
    });
  };

  const showSaveNotice = (msg: string) => {
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
    }
    setSaveNotice(msg);
    saveNoticeTimerRef.current = window.setTimeout(() => {
      setSaveNotice(null);
      saveNoticeTimerRef.current = null;
    }, 2400);
  };

  // 프로젝트(.ssproj) 저장 및 불러오기
  const handleSaveProject = async (saveAs = false): Promise<boolean> => {
    const projectPayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      trackName,
      audioPath,
      aspectRatio,
      rawLyrics,
      segments,
      videoClips,
      textLayers,
      activePresetId,
      presets,
      visualEffects,
      whisperModelId,
    };
    const json = JSON.stringify(projectPayload, null, 2);
    const baseName = (trackName || 'sorisoop-project').replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.ssproj`;

    // 이미 저장된 경로가 있고 '다른 이름으로 저장'이 아닌 경우 덮어쓰기 경고창 없이 바로 저장
    if (!saveAs && currentProjectPath && window.electronAPI?.saveTextFileToPath) {
      const savedPath = await window.electronAPI.saveTextFileToPath(currentProjectPath, json);
      if (savedPath) {
        const savedName = savedPath.split(/[\\/]/).pop() ?? fileName;
        lastSavedSnapshotRef.current = projectContentSnapshot;
        window.electronAPI?.setUnsavedChanges?.(false);
        setWhisperStatusText(`프로젝트 저장 완료: ${savedName}`);
        showSaveNotice(`저장되었습니다 (${savedName})`);
        return true;
      }
      return false;
    }

    if (window.electronAPI?.saveTextFile) {
      const savedPath = await window.electronAPI.saveTextFile(
        currentProjectPath || fileName,
        json,
        'SoriSoop Project',
        'ssproj'
      );
      if (savedPath) {
        setCurrentProjectPath(savedPath);
        const savedName = savedPath.split(/[\\/]/).pop() ?? fileName;
        lastSavedSnapshotRef.current = projectContentSnapshot;
        window.electronAPI?.setUnsavedChanges?.(false);
        setWhisperStatusText(`프로젝트 저장 완료: ${savedName}`);
        showSaveNotice(`저장되었습니다 (${savedName})`);
        return true;
      }
      return false;
    }

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    lastSavedSnapshotRef.current = projectContentSnapshot;
    setWhisperStatusText(`프로젝트 저장 완료: ${fileName}`);
    showSaveNotice(`저장되었습니다 (${fileName})`);
    return true;
  };

  const loadProjectFromContent = async (
    text: string,
    fileName: string,
    filePath?: string | null
  ) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.segments)) {
        throw new Error('올바른 .ssproj 프로젝트 파일이 아닙니다.');
      }
      if (typeof parsed.rawLyrics === 'string') setRawLyrics(parsed.rawLyrics);
      if (parsed.aspectRatio === '16:9' || parsed.aspectRatio === '9:16' || parsed.aspectRatio === '1:1') {
        setAspectRatio(parsed.aspectRatio);
      }
      if (Array.isArray(parsed.presets) && parsed.presets.length > 0) {
        const { merged } = mergeWithDefaultPresets(parsed.presets);
        setPresets(merged);
      }
      if (typeof parsed.activePresetId === 'string') {
        setActivePresetId(parsed.activePresetId);
      }
      if (parsed.visualEffects) {
        setVisualEffects((prev) => ({ ...prev, ...parsed.visualEffects }));
      }
      if (typeof parsed.whisperModelId === 'string') {
        setWhisperModelId(parsed.whisperModelId);
      }
      if (typeof parsed.trackName === 'string' && !trackName) {
        setTrackName(parsed.trackName);
      }

      let audioRestored = false;
      if (
        typeof parsed.audioPath === 'string' &&
        parsed.audioPath.trim().length > 0 &&
        window.electronAPI?.readAudioFileByPath
      ) {
        const audioRes = await window.electronAPI.readAudioFileByPath(parsed.audioPath);
        if (audioRes) {
          const copy = new Uint8Array(audioRes.data).buffer;
          await decodeAndLoadAudio(copy, audioRes.name, audioRes.filePath);
          audioRestored = true;
        }
      }

      if (Array.isArray(parsed.videoClips)) {
        setVideoClips(parsed.videoClips, false);
        setSelectedClipId(parsed.videoClips[0]?.id ?? null);
      }
      if (Array.isArray(parsed.textLayers)) {
        setTextLayers(parsed.textLayers, false);
        setSelectedTextLayerId(parsed.textLayers[0]?.id ?? null);
      } else {
        setTextLayers([], false);
        setSelectedTextLayerId(null);
      }
      undoStackRef.current = [];
      markCleanOnNextSnapshotRef.current = true;
      redoStackRef.current = [];
      syncHistoryFlags();
      setSegmentsState(parsed.segments);
      segmentsRef.current = parsed.segments;
      setSelectedSegmentId(parsed.segments[0]?.id ?? null);
      setCurrentProjectPath(filePath ?? null);
      setWhisperStatusText(
        audioRestored
          ? `프로젝트 불러오기 완료: ${fileName} (음원 및 ${parsed.segments.length}개 가사 구간 복원)`
          : parsed.audioPath
            ? `프로젝트 불러오기 완료: ${fileName} (저장된 경로에서 음원을 찾지 못해 노래 파일을 다시 올려주세요)`
            : `프로젝트 불러오기 완료: ${fileName} (${parsed.segments.length}개 가사 구간)`
      );
    } catch (err) {
      setWhisperStatusText(
        `프로젝트 불러오기 실패: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleLoadProjectFile = async (file: File) => {
    const text = await file.text();
    await loadProjectFromContent(text, file.name, null);
  };

  const handleOpenProject = async () => {
    if (window.electronAPI?.openProjectFile) {
      const res = await window.electronAPI.openProjectFile();
      if (res) {
        await loadProjectFromContent(res.content, res.name, res.filePath);
      }
      return;
    }
    fileProjectInputRef.current?.click();
  };

  const pureLineCount = extractPureLyricLines(rawLyrics).length;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* 숨김 파일 입력 (브라우저 폴백용) */}
      <input
        ref={fileAudioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const buf = await f.arrayBuffer();
          await decodeAndLoadAudio(buf, f.name, '');
        }}
      />
      <input
        ref={fileProjectInputRef}
        type="file"
        accept=".ssproj,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          await handleLoadProjectFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={fileBgInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length === 0) return;
          const items = files.map((f) => ({
            url: URL.createObjectURL(f),
            name: f.name,
            mediaType: (f.type.startsWith('video') ? 'video' : 'image') as 'video' | 'image',
            filePath: '',
          }));
          await addMediaListToVideoTrack(items, pendingMediaModeRef.current);
          e.target.value = '';
        }}
      />

      {/* 상단 스튜디오 헤더 (빈 공간 드래그로 창 이동) */}
      <header
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-4 py-2.5 pl-20 select-none xl:flex-nowrap"
      >
        <div className="flex shrink-0 items-center gap-3">
          <img
            src={appIconUrl}
            alt="소리숲 뮤직비디오 스튜디오 아이콘"
            className="h-10 w-10 rounded-xl object-contain shadow-md"
          />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-100">
              소리숲 뮤직비디오 스튜디오
            </h1>
            <p className="text-[11px] text-slate-400">
              {duration > 0 ? `${duration.toFixed(1)}s` : '0.0s'} ·{' '}
              {fontsReady ? '내장 무료 한글 폰트 활성화' : '폰트 로딩 중...'}
            </p>
          </div>
        </div>

        <div
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex flex-wrap items-center gap-1.5 whitespace-nowrap text-xs xl:flex-nowrap"
        >
          <button
            type="button"
            onClick={handleNewProject}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
          >
            <FilePlus className="h-3.5 w-3.5 text-amber-300" />
            새로 만들기
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => void handleSaveProject(false)}
              className="flex items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
              title={
                currentProjectPath
                  ? `저장 (${currentProjectPath.split(/[\\/]/).pop()})`
                  : '프로젝트 저장 (.ssproj)'
              }
            >
              <Save className="h-3.5 w-3.5 text-emerald-400" />
              저장
            </button>
            {saveNotice && (
              <div className="pointer-events-none absolute top-full left-0 z-50 mt-1.5 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-500/50 bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 shadow-xl backdrop-blur">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>{saveNotice}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleSaveProject(true)}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
            title="다른 이름으로 프로젝트 저장 (.ssproj)"
          >
            <SaveAll className="h-3.5 w-3.5 text-teal-400" />
            다른 이름으로 저장
          </button>

          <button
            type="button"
            onClick={() => void handleOpenProject()}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
            title="프로젝트 불러오기 (.ssproj)"
          >
            <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
            열기
          </button>

          <button
            type="button"
            onClick={handleOpenAudio}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500"
          >
            <Music className="h-3.5 w-3.5" />
            노래 파일 가져오기
          </button>

          <button
            type="button"
            onClick={() => setShowLyricsModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
          >
            <FileText className="h-3.5 w-3.5 text-cyan-400" />
            전체 가사 입력 {pureLineCount > 0 && `(${pureLineCount}줄)`}
          </button>

          <button
            type="button"
            onClick={() => handleOpenBackground('append')}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
          >
            <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
            배경 이미지/영상
          </button>

          <div className="mx-1 flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
            {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`px-2 py-1 text-[11px] font-medium ${
                  aspectRatio === ratio
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleSaveTextExport('lrc')}
            disabled={segments.length === 0}
            className="flex items-center gap-1 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> LRC
          </button>
          <button
            type="button"
            onClick={() => handleSaveTextExport('srt')}
            disabled={segments.length === 0}
            className="flex items-center gap-1 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> SRT
          </button>
          <button
            type="button"
            onClick={() => handleSaveTextExport('json')}
            disabled={segments.length === 0}
            className="flex items-center gap-1 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </button>

          {/* 색상 테마 선택 (내보내기 버튼 왼쪽) */}
          <div
            className="ml-1 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-1.5 py-1"
            title="앱 색상 테마"
          >
            {APP_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAppTheme(t.id)}
                title={t.label}
                aria-label={t.label}
                style={{ backgroundColor: t.swatch }}
                className={`h-3.5 w-3.5 rounded-full border transition ${
                  appTheme === t.id
                    ? 'scale-110 border-cyan-400 ring-2 ring-cyan-400/50'
                    : 'border-slate-500/80 opacity-80 hover:opacity-100'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowSponsorModal(true)}
            title="개발자 후원"
            aria-label="개발자 후원"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-transparent text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100"
          >
            <SponsorIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="ml-1 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 px-3.5 py-1.5 font-bold text-slate-950 shadow hover:from-cyan-400 hover:to-emerald-400"
          >
            <Film className="h-4 w-4" />
            내보내기
          </button>
        </div>
      </header>

      {/* 메인 스튜디오 영역 */}
      <main className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-12">
        {/* 좌측: 프리뷰 + VU 미터 + 파형 타임라인 */}
        <section className="flex min-h-0 flex-col gap-2.5 overflow-hidden lg:col-span-7 xl:col-span-8">
          <PreviewStage
            aspectRatio={aspectRatio}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            segments={segments}
            preset={activePreset}
            background={background}
            videoClips={videoClips}
            textLayers={textLayers}
            selectedTextLayerId={selectedTextLayerId}
            onSelectTextLayer={(id) => {
              setSelectedTextLayerId(id);
              setRightTab('text');
            }}
            onBeginTextDrag={() => pushUndoSnapshot()}
            onMoveTextLayer={handleMoveTextLayer}
            visualEffects={visualEffects}
            spectrumBins={spectrumBins}
            waveformSamples={waveformSamples}
            previewHeight={previewHeight}
            onChangePreviewHeight={setPreviewHeight}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
          />

          <WaveformTimeline
            trackName={trackName}
            peaks={peaks}
            duration={duration}
            audioSourceDuration={audioSourceDuration}
            onChangeAudioDuration={(nextDur) => {
              const maxDur = audioSourceDuration > 0 ? audioSourceDuration : duration;
              const clamped = Number(Math.max(1, Math.min(maxDur, nextDur)).toFixed(2));
              setDuration(clamped);
              if (currentTime > clamped) {
                handleSeek(clamped);
              }
            }}
            currentTime={currentTime}
            isPlaying={isPlaying}
            volume={volume}
            isMuted={isMuted}
            leftDb={leftDb}
            rightDb={rightDb}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onBeginDrag={() => pushUndoSnapshot()}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            onVolumeChange={setVolume}
            onToggleMute={() => setIsMuted((m) => !m)}
            onSelectSegment={(seg) => {
              setSelectedSegmentId(seg.id);
              handleSeek(seg.startTime);
            }}
            onResizeSegmentEdge={(id, edge, newTime) =>
              setSegments(
                (prev) =>
                  updateSegmentWithLinkedBounds(
                    prev,
                    id,
                    edge === 'start' ? { startTime: newTime } : { endTime: newTime },
                    duration
                  ),
                false
              )
            }
            onMoveSegment={(id, newStartTime) =>
              setSegments(
                (prev) => moveSegmentWithBounds(prev, id, newStartTime, duration),
                false
              )
            }
            onAddSegmentAtCurrent={() => {
              const start = Number(currentTime.toFixed(2));
              const end = Number(Math.min(duration || start + 3, start + 3).toFixed(2));
              const newId = `seg-${Date.now()}`;
              setSegments((prev) =>
                [
                  ...prev,
                  { id: newId, startTime: start, endTime: end, text: '새 가사' },
                ].sort((a, b) => a.startTime - b.startTime)
              );
              setSelectedSegmentId(newId);
            }}
            videoClips={videoClips}
            appTheme={appTheme}
            selectedClipId={selectedClipId}
            onSelectClip={(id) => {
              setSelectedClipId(id);
              if (id) setSelectedTextLayerId(null);
            }}
            onSplitClip={() => {
              const target =
                videoClips.find((c) => c.id === selectedClipId) ??
                videoClips.find((c) => currentTime > c.timelineStart && currentTime < c.timelineEnd);
              if (!target) return;
              setVideoClips((prev) => splitVideoClipAt(prev, target.id, currentTime));
            }}
            onSplitClipAt={(id, splitTime) =>
              setVideoClips((prev) => splitVideoClipAt(prev, id, splitTime))
            }
            onDeleteClip={(id) => {
              setVideoClips((prev) => prev.filter((c) => c.id !== id));
              if (selectedClipId === id) setSelectedClipId(null);
            }}
            onJoinClipGaps={() => setVideoClips((prev) => joinVideoClipsGaps(prev))}
            onInsertMediaAtCurrent={() => handleOpenBackground('insert')}
            onAppendMedia={() => handleOpenBackground('append')}
            onTrimClipEdge={(id, edge, newTime) =>
              setVideoClips((prev) => trimVideoClipEdge(prev, id, edge, newTime), false)
            }
            onMoveClip={(id, newStartTime) =>
              setVideoClips((prev) => moveVideoClip(prev, id, newStartTime), false)
            }
            onUpdateClip={(id, patch, recordHistory = true) =>
              setVideoClips((prev) => {
                if (patch.playbackRate !== undefined) {
                  const next = setVideoClipPlaybackRate(prev, id, patch.playbackRate);
                  const { playbackRate: _r, ...rest } = patch;
                  if (Object.keys(rest).length === 0) return next;
                  return next.map((c) => (c.id === id ? { ...c, ...rest } : c));
                }
                return prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
              }, recordHistory)
            }
            textLayers={textLayers}
            selectedTextLayerId={selectedTextLayerId}
            onSelectTextLayer={(id) => {
              setSelectedTextLayerId(id);
              if (id) {
                setSelectedClipId(null);
                setRightTab('text');
              }
            }}
            onUpdateTextLayer={handleUpdateTextLayer}
            onDeleteTextLayer={handleDeleteTextLayer}
            onSplitTextLayer={(id, splitTime) => {
              const target = textLayers.find((l) => l.id === id);
              if (!target) return;
              if (splitTime <= target.startTime + 0.1 || splitTime >= target.endTime - 0.1) return;
              const newId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const firstPart: TextLayer = { ...target, endTime: splitTime };
              const secondPart: TextLayer = { ...target, id: newId, startTime: splitTime };
              setTextLayers((prev) =>
                prev.flatMap((l) => (l.id === id ? [firstPart, secondPart] : [l]))
              );
              setSelectedTextLayerId(newId);
            }}
          />
        </section>

        {/* 우측: 가사 싱크 / 자막 스타일 프리셋 / 배경 설정 탭 */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-3 lg:col-span-5 xl:col-span-4">
          <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-950 p-1 text-xs">
            <button
              type="button"
              onClick={() => setRightTab('lyrics')}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 font-medium transition ${
                rightTab === 'lyrics'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" /> 가사 싱크
            </button>
            <button
              type="button"
              onClick={() => setRightTab('style')}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 font-medium transition ${
                rightTab === 'style'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="h-3.5 w-3.5" /> 자막 스타일
            </button>
            <button
              type="button"
              onClick={() => setRightTab('text')}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 font-medium transition ${
                rightTab === 'text'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Type className="h-3.5 w-3.5" /> 텍스트
            </button>
            <button
              type="button"
              onClick={() => setRightTab('background')}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 font-medium transition ${
                rightTab === 'background'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" /> 비주얼 효과 설정
            </button>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {rightTab === 'lyrics' && (
              <div className="flex h-full flex-col gap-2">
                <div className="flex items-center justify-between pb-1 text-[11px]">
                  <span className="text-slate-400">로컬 음성분석 모델</span>
                  <select
                    value={whisperModelId}
                    onChange={(e) => setWhisperModelId(e.target.value)}
                    disabled={isWhisperRunning}
                    className="rounded bg-slate-900 px-2 py-0.5 text-cyan-300"
                  >
                    <option value="Xenova/whisper-small">whisper-small (권장 · 가사 인식 최적)</option>
                    <option value="Xenova/whisper-base">whisper-base (초고속 · 경량)</option>
                    <option value="Xenova/whisper-medium">whisper-medium (WebGPU · q4 · 환각 주의)</option>
                  </select>
                </div>

                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  <SegmentListEditor
                    segments={segments}
                    selectedSegmentId={selectedSegmentId}
                    currentTime={currentTime}
                    duration={duration}
                    autoTrack={autoTrack}
                    isWhisperRunning={isWhisperRunning}
                    whisperStatusText={whisperStatusText}
                    whisperProgress={whisperProgress}
                    hasRawLyrics={pureLineCount > 0}
                    hasAudio={duration > 0}
                    onToggleAutoTrack={() => setAutoTrack((v) => !v)}
                    onRunWhisperSync={handleRunWhisperSync}
                    onCancelWhisperSync={handleCancelWhisperSync}
                    onRefineSync={handleRefineSync}
                    onShiftAll={handleShiftAll}
                    onSnapVocalAttacks={handleSnapVocalAttacks}
                    onNormalizeGaps={handleNormalizeGaps}
                    onSelectSegment={(seg) => {
                      setSelectedSegmentId(seg.id);
                      handleSeek(seg.startTime);
                    }}
                    onUpdateSegment={(id, patch) =>
                      setSegments((prev) =>
                        updateSegmentWithLinkedBounds(prev, id, patch, duration)
                      )
                    }
                    onDeleteSegment={(id) =>
                      setSegments((prev) => prev.filter((s) => s.id !== id))
                    }
                    onInsertSegmentAt={(index, type) => {
                      const prevEnd = index === 0 ? 0 : segments[index - 1].endTime;
                      const nextStart =
                        index < segments.length ? segments[index].startTime : duration;
                      const newSeg: LyricSegment = {
                        id: `seg-${Date.now()}`,
                        startTime: Number(prevEnd.toFixed(2)),
                        endTime: Number(Math.max(prevEnd + 0.5, nextStart).toFixed(2)),
                        text: '',
                        notes: type === 'intro' ? '전주' : type === 'outro' ? '후주' : '간주',
                      };
                      setSegments((prev) => [
                        ...prev.slice(0, index),
                        newSeg,
                        ...prev.slice(index),
                      ]);
                    }}
                    onInsertEmptyLyricAt={handleInsertEmptyLyricAt}
                    onMergeWithPrevious={handleMergeSegmentWithPrevious}
                    onSplitSegment={handleSplitSegment}
                    onAddSegment={() => {
                      const start = Number(currentTime.toFixed(2));
                      const end = Number(Math.min(duration || start + 3, start + 3).toFixed(2));
                      setSegments((prev) =>
                        [
                          ...prev,
                          {
                            id: `seg-${Date.now()}`,
                            startTime: start,
                            endTime: end,
                            text: '새 가사',
                          },
                        ].sort((a, b) => a.startTime - b.startTime)
                      );
                    }}
                  />
                </div>
              </div>
            )}

            {rightTab === 'style' && (
              <StylePresetEditor
                presets={presets}
                activePreset={activePreset}
                onSelectPreset={setActivePresetId}
                onChangeActiveStyle={handleChangeActiveStyle}
                onSaveOverwritePreset={() => savePresets(presets)}
                onCreatePreset={handleCreatePreset}
                onDeletePreset={handleDeletePreset}
                onResetBuiltInPreset={handleResetBuiltInPreset}
              />
            )}

            {rightTab === 'background' && (
              <div className="h-full min-h-0 min-w-0 space-y-2.5 overflow-y-auto overflow-x-hidden pr-3 [scrollbar-gutter:stable] text-xs">
                {/* 음악 반응형 홀로그램 */}
                <SettingSection
                  title="홀로그램"
                  action={
                    visualEffects.prismRingEnabled && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisualEffects((v) => ({
                            ...v,
                            ...DEFAULT_PRISM_RING_SETTINGS,
                          }))
                        }
                        className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                        title="프리즘 링 설정을 기본값으로 되돌립니다"
                      >
                        <RotateCcw className="h-3 w-3" />
                        기본값
                      </button>
                    )
                  }
                >
                  <SettingRow label="구름 띠 표시">
                    <ToggleControl
                      checked={visualEffects.hologramEnabled}
                      onChange={(hologramEnabled) =>
                        setVisualEffects((v) => ({ ...v, hologramEnabled }))
                      }
                    />
                  </SettingRow>

                  {visualEffects.hologramEnabled && (
                    <SettingRow label="구름 띠 투명도">
                      <SliderControl
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={visualEffects.hologramOpacity}
                        valueLabel={`${Math.round(visualEffects.hologramOpacity * 100)}%`}
                        onChange={(hologramOpacity) =>
                          setVisualEffects((v) => ({ ...v, hologramOpacity }))
                        }
                      />
                    </SettingRow>
                  )}

                  <SettingRow label="프리즘 링">
                    <ToggleControl
                      checked={visualEffects.prismRingEnabled ?? false}
                      onChange={(prismRingEnabled) =>
                        setVisualEffects((v) => ({ ...v, prismRingEnabled }))
                      }
                    />
                  </SettingRow>

                  {visualEffects.prismRingEnabled && (
                    <>
                      <SettingRow label="링 크기">
                        <SliderControl
                          min={0.5}
                          max={1.8}
                          step={0.05}
                          value={
                            visualEffects.prismRingScale ??
                            DEFAULT_PRISM_RING_SETTINGS.prismRingScale
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.prismRingScale ??
                              DEFAULT_PRISM_RING_SETTINGS.prismRingScale) * 100
                          )}%`}
                          onChange={(prismRingScale) =>
                            setVisualEffects((v) => ({ ...v, prismRingScale }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="최대 선 두께">
                        <SliderControl
                          min={1}
                          max={300}
                          step={1}
                          value={Math.max(
                            1,
                            Math.min(
                              300,
                              Math.round(
                                visualEffects.prismRingThickness ??
                                  DEFAULT_PRISM_RING_SETTINGS.prismRingThickness
                              )
                            )
                          )}
                          valueLabel={`${Math.max(
                            1,
                            Math.min(
                              300,
                              Math.round(
                                visualEffects.prismRingThickness ??
                                  DEFAULT_PRISM_RING_SETTINGS.prismRingThickness
                              )
                            )
                          )}px`}
                          onChange={(prismRingThickness) =>
                            setVisualEffects((v) => ({ ...v, prismRingThickness }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="링 투명도">
                        <SliderControl
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={
                            visualEffects.prismRingOpacity ??
                            DEFAULT_PRISM_RING_SETTINGS.prismRingOpacity
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.prismRingOpacity ??
                              DEFAULT_PRISM_RING_SETTINGS.prismRingOpacity) * 100
                          )}%`}
                          onChange={(prismRingOpacity) =>
                            setVisualEffects((v) => ({ ...v, prismRingOpacity }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="링 색상">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setVisualEffects((v) => ({ ...v, prismRingColor: 'auto' }))
                            }
                            className={`rounded px-2 py-1 text-[10px] font-medium ${
                              (visualEffects.prismRingColor ?? 'auto') === 'auto'
                                ? 'bg-cyan-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            자동 홀로그램
                          </button>
                          <input
                            type="color"
                            value={
                              (visualEffects.prismRingColor ?? 'auto') === 'auto'
                                ? '#38bdf8'
                                : visualEffects.prismRingColor
                            }
                            onChange={(e) =>
                              setVisualEffects((v) => ({
                                ...v,
                                prismRingColor: e.target.value,
                              }))
                            }
                            title="프리즘 링 단색 지정"
                            className="h-6 w-8 cursor-pointer rounded border border-slate-700 bg-transparent p-0"
                          />
                        </div>
                      </SettingRow>
                    </>
                  )}

                  <SettingRow label="스타더스트 입자">
                    <ToggleControl
                      checked={visualEffects.prismParticlesEnabled ?? false}
                      onChange={(prismParticlesEnabled) =>
                        setVisualEffects((v) => ({ ...v, prismParticlesEnabled }))
                      }
                    />
                  </SettingRow>

                  {visualEffects.prismParticlesEnabled && (
                    <SettingRow label="입자 투명도">
                      <SliderControl
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={visualEffects.prismParticlesOpacity ?? 0.6}
                        valueLabel={`${Math.round(
                          (visualEffects.prismParticlesOpacity ?? 0.6) * 100
                        )}%`}
                        onChange={(prismParticlesOpacity) =>
                          setVisualEffects((v) => ({ ...v, prismParticlesOpacity }))
                        }
                      />
                    </SettingRow>
                  )}

                  {(visualEffects.hologramEnabled ||
                    visualEffects.prismRingEnabled ||
                    visualEffects.prismParticlesEnabled) && (
                    <SettingRow label="부드러운 움직임">
                      <SliderControl
                        min={0}
                        max={0.94}
                        step={0.02}
                        value={visualEffects.hologramSmoothing ?? 0.72}
                        valueLabel={`${Math.round(
                          (visualEffects.hologramSmoothing ?? 0.72) * 100
                        )}%`}
                        onChange={(hologramSmoothing) =>
                          setVisualEffects((v) => ({ ...v, hologramSmoothing }))
                        }
                      />
                    </SettingRow>
                  )}
                </SettingSection>

                {/* 스펙트럼 */}
                <SettingSection
                  title="스펙트럼"
                  action={
                    visualEffects.spectrumEnabled && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisualEffects((v) => ({
                            ...v,
                            ...DEFAULT_SPECTRUM_SETTINGS,
                          }))
                        }
                        className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                        title="오디오 스펙트럼 설정을 기본값으로 되돌립니다"
                      >
                        <RotateCcw className="h-3 w-3" />
                        기본값
                      </button>
                    )
                  }
                >
                  <SettingRow label="오디오 스펙트럼">
                    <ToggleControl
                      checked={visualEffects.spectrumEnabled}
                      onChange={(spectrumEnabled) =>
                        setVisualEffects((v) => ({ ...v, spectrumEnabled }))
                      }
                    />
                  </SettingRow>

                  {visualEffects.spectrumEnabled && (
                    <>
                      <SettingRow label="모드">
                        <div className="grid grid-cols-2 gap-1.5">
                          {(['digital', 'analog'] as SpectrumMode[]).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() =>
                                setVisualEffects((v) => ({ ...v, spectrumMode: mode }))
                              }
                              className={`rounded-lg py-1.5 text-[11px] font-medium transition ${
                                visualEffects.spectrumMode === mode
                                  ? 'bg-cyan-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {mode === 'digital' ? '디지털 (LED)' : '아날로그 (웨이브)'}
                            </button>
                          ))}
                        </div>
                      </SettingRow>

                      <SettingRow label="음역대">
                        <div className="grid grid-cols-4 gap-1">
                          {(
                            [
                              { id: 'all', label: '전체' },
                              { id: 'bass', label: '저음' },
                              { id: 'mid', label: '중음' },
                              { id: 'treble', label: '고음' },
                            ] as Array<{ id: SpectrumBand; label: string }>
                          ).map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() =>
                                setVisualEffects((v) => ({ ...v, spectrumBand: b.id }))
                              }
                              className={`rounded-md py-1 text-[11px] font-medium transition ${
                                (visualEffects.spectrumBand ?? 'all') === b.id
                                  ? 'bg-cyan-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>
                      </SettingRow>

                      <SettingRow label="모양">
                        <div className="grid grid-cols-4 gap-1">
                          {(
                            [
                              { id: 'mirror', label: '대칭' },
                              { id: 'bottom', label: '하단' },
                              { id: 'dots', label: '도트' },
                              { id: 'line', label: '라인' },
                            ] as Array<{ id: SpectrumShape; label: string }>
                          ).map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                setVisualEffects((v) => ({ ...v, spectrumShape: s.id }))
                              }
                              className={`rounded-md py-1 text-[11px] font-medium transition ${
                                (visualEffects.spectrumShape ?? 'mirror') === s.id
                                  ? 'bg-cyan-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </SettingRow>

                      <SettingRow label="부드러움">
                        <SliderControl
                          min={0}
                          max={0.92}
                          step={0.04}
                          value={visualEffects.spectrumSmoothing ?? 0.72}
                          valueLabel={`${Math.round(
                            (visualEffects.spectrumSmoothing ?? 0.72) * 100
                          )}%`}
                          onChange={(spectrumSmoothing) =>
                            setVisualEffects((v) => ({ ...v, spectrumSmoothing }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="세로 위치">
                        <SliderControl
                          min={0.08}
                          max={0.92}
                          step={0.01}
                          value={
                            visualEffects.spectrumPosY ?? DEFAULT_SPECTRUM_SETTINGS.spectrumPosY
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.spectrumPosY ??
                              DEFAULT_SPECTRUM_SETTINGS.spectrumPosY) * 100
                          )}%`}
                          onChange={(spectrumPosY) =>
                            setVisualEffects((v) => ({ ...v, spectrumPosY }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="높이">
                        <SliderControl
                          min={0.06}
                          max={0.45}
                          step={0.01}
                          value={visualEffects.spectrumHeight ?? 0.18}
                          valueLabel={`${Math.round((visualEffects.spectrumHeight ?? 0.18) * 100)}%`}
                          onChange={(spectrumHeight) =>
                            setVisualEffects((v) => ({ ...v, spectrumHeight }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="너비">
                        <SliderControl
                          min={0.25}
                          max={1}
                          step={0.01}
                          value={visualEffects.spectrumWidth ?? 0.72}
                          valueLabel={`${Math.round((visualEffects.spectrumWidth ?? 0.72) * 100)}%`}
                          onChange={(spectrumWidth) =>
                            setVisualEffects((v) => ({ ...v, spectrumWidth }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="굵기">
                        <SliderControl
                          min={0.4}
                          max={2.4}
                          step={0.1}
                          value={visualEffects.spectrumThickness ?? 1}
                          valueLabel={`${Math.round((visualEffects.spectrumThickness ?? 1) * 100)}%`}
                          onChange={(spectrumThickness) =>
                            setVisualEffects((v) => ({ ...v, spectrumThickness }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="투명도">
                        <SliderControl
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={visualEffects.spectrumOpacity}
                          valueLabel={`${Math.round(visualEffects.spectrumOpacity * 100)}%`}
                          onChange={(spectrumOpacity) =>
                            setVisualEffects((v) => ({ ...v, spectrumOpacity }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="색상">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setVisualEffects((v) => ({ ...v, spectrumColor: 'auto' }))
                            }
                            className={`rounded px-2 py-1 text-[10px] font-medium ${
                              (visualEffects.spectrumColor ?? 'auto') === 'auto'
                                ? 'bg-cyan-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            자동 그라데이션
                          </button>
                          <input
                            type="color"
                            value={
                              (visualEffects.spectrumColor ?? 'auto') === 'auto'
                                ? '#38bdf8'
                                : visualEffects.spectrumColor
                            }
                            onChange={(e) =>
                              setVisualEffects((v) => ({
                                ...v,
                                spectrumColor: e.target.value,
                              }))
                            }
                            title="스펙트럼 단색 지정"
                            className="h-6 w-8 cursor-pointer rounded border border-slate-700 bg-transparent p-0"
                          />
                        </div>
                      </SettingRow>
                    </>
                  )}
                </SettingSection>

                {/* 레벨메터 */}
                <SettingSection
                  title="레벨메터"
                  action={
                    (visualEffects.lyricLedMeterEnabled ?? false) && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisualEffects((v) => ({
                            ...v,
                            ...DEFAULT_LED_METER_SETTINGS,
                          }))
                        }
                        className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                        title="LED 레벨메터 설정을 기본값으로 되돌립니다"
                      >
                        <RotateCcw className="h-3 w-3" />
                        기본값
                      </button>
                    )
                  }
                >
                  <SettingRow label="LED 레벨메터">
                    <ToggleControl
                      checked={visualEffects.lyricLedMeterEnabled ?? false}
                      onChange={(lyricLedMeterEnabled) =>
                        setVisualEffects((v) => ({ ...v, lyricLedMeterEnabled }))
                      }
                    />
                  </SettingRow>

                  {(visualEffects.lyricLedMeterEnabled ?? false) && (
                    <>
                      <SettingRow label="세로 위치">
                        <SliderControl
                          min={0.08}
                          max={0.92}
                          step={0.01}
                          value={
                            visualEffects.ledMeterPosY ??
                            DEFAULT_LED_METER_SETTINGS.ledMeterPosY
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.ledMeterPosY ??
                              DEFAULT_LED_METER_SETTINGS.ledMeterPosY) * 100
                          )}%`}
                          onChange={(ledMeterPosY) =>
                            setVisualEffects((v) => ({ ...v, ledMeterPosY }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="기둥 개수">
                        <SliderControl
                          min={4}
                          max={16}
                          step={1}
                          value={
                            visualEffects.ledMeterColumns ??
                            DEFAULT_LED_METER_SETTINGS.ledMeterColumns
                          }
                          valueLabel={`${
                            visualEffects.ledMeterColumns ??
                            DEFAULT_LED_METER_SETTINGS.ledMeterColumns
                          }개`}
                          onChange={(ledMeterColumns) =>
                            setVisualEffects((v) => ({ ...v, ledMeterColumns }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="기둥 높이">
                        <SliderControl
                          min={0.5}
                          max={2.4}
                          step={0.05}
                          value={
                            visualEffects.ledMeterHeight ??
                            DEFAULT_LED_METER_SETTINGS.ledMeterHeight
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.ledMeterHeight ??
                              DEFAULT_LED_METER_SETTINGS.ledMeterHeight) * 100
                          )}%`}
                          onChange={(ledMeterHeight) =>
                            setVisualEffects((v) => ({ ...v, ledMeterHeight }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="기둥 두께">
                        <SliderControl
                          min={0.5}
                          max={2.2}
                          step={0.05}
                          value={
                            visualEffects.ledMeterThickness ??
                            DEFAULT_LED_METER_SETTINGS.ledMeterThickness
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.ledMeterThickness ??
                              DEFAULT_LED_METER_SETTINGS.ledMeterThickness) * 100
                          )}%`}
                          onChange={(ledMeterThickness) =>
                            setVisualEffects((v) => ({ ...v, ledMeterThickness }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="부드러운 움직임">
                        <SliderControl
                          min={0}
                          max={0.92}
                          step={0.02}
                          value={
                            visualEffects.ledMeterSmoothing ??
                            DEFAULT_LED_METER_SETTINGS.ledMeterSmoothing
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.ledMeterSmoothing ??
                              DEFAULT_LED_METER_SETTINGS.ledMeterSmoothing) * 100
                          )}%`}
                          onChange={(ledMeterSmoothing) =>
                            setVisualEffects((v) => ({ ...v, ledMeterSmoothing }))
                          }
                        />
                      </SettingRow>

                      <SettingRow label="투명도">
                        <SliderControl
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={
                            visualEffects.ledMeterOpacity ??
                            DEFAULT_LED_METER_SETTINGS.ledMeterOpacity
                          }
                          valueLabel={`${Math.round(
                            (visualEffects.ledMeterOpacity ??
                              DEFAULT_LED_METER_SETTINGS.ledMeterOpacity) * 100
                          )}%`}
                          onChange={(ledMeterOpacity) =>
                            setVisualEffects((v) => ({ ...v, ledMeterOpacity }))
                          }
                        />
                      </SettingRow>
                    </>
                  )}
                </SettingSection>

                {background && (
                  <SettingSection
                    title="배경 미디어"
                    action={
                      <button
                        type="button"
                        onClick={() => setBackground(null)}
                        className="rounded-md bg-rose-500/15 p-1 text-rose-400 hover:bg-rose-500/25"
                        title="배경 제거"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    }
                  >
                    <SettingRow label="파일 정보" align="start">
                      <div>
                        <p className="truncate font-semibold text-slate-200">{background.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {background.mediaType === 'image' ? '이미지' : '동영상 (자동 반복)'}
                        </p>
                      </div>
                    </SettingRow>

                    {background.mediaType === 'image' && (
                      <SettingRow label="Ken Burns">
                        <ToggleControl
                          checked={background.kenBurns}
                          onLabel="천천히 줌인"
                          offLabel="사용 안 함"
                          onChange={(kenBurns) =>
                            setBackground((b) => (b ? { ...b, kenBurns } : b))
                          }
                        />
                      </SettingRow>
                    )}

                    <SettingRow label="배경 어둡기">
                      <SliderControl
                        min={0}
                        max={0.85}
                        step={0.05}
                        value={background.dimOpacity}
                        valueLabel={`${Math.round(background.dimOpacity * 100)}%`}
                        onChange={(dimOpacity) =>
                          setBackground((b) => (b ? { ...b, dimOpacity } : b))
                        }
                      />
                    </SettingRow>

                    <SettingRow label="배경 블러">
                      <SliderControl
                        min={0}
                        max={24}
                        step={1}
                        value={background.blurAmount}
                        valueLabel={`${background.blurAmount}px`}
                        onChange={(blurAmount) =>
                          setBackground((b) => (b ? { ...b, blurAmount } : b))
                        }
                      />
                    </SettingRow>
                  </SettingSection>
                )}
              </div>
            )}

            {rightTab === 'text' && (
              <TextLayerEditor
                layers={textLayers}
                selectedLayerId={selectedTextLayerId}
                duration={duration}
                onSelectLayer={setSelectedTextLayerId}
                onAddLayer={handleAddTextLayer}
                onUpdateLayer={handleUpdateTextLayer}
                onDeleteLayer={handleDeleteTextLayer}
              />
            )}
          </div>
        </aside>
      </main>

      {/* 전체 가사 입력 모달 */}
      {showLyricsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-100">전체 가사 입력</h2>
                <p className="text-[11px] text-slate-400">
                  [Intro], [Verse 1], [Chorus], [간주] 등의 단락 태그는 자동으로 제외됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLyricsModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={rawLyrics}
              onChange={(e) => setRawLyrics(e.target.value)}
              rows={12}
              placeholder="노래 가사를 한 줄에 한 구절씩 붙여넣으세요..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 focus:border-cyan-500 focus:outline-none"
            />

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-cyan-300">인식 대상 순수 가사: {pureLineCount}줄</span>
              <button
                type="button"
                onClick={() => setShowLyricsModal(false)}
                className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                저장 후 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MP4 내보내기 모달 */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        trackName={trackName}
        audioPath={audioPath}
        audioBuffer={audioBufferRef.current}
        duration={duration}
        aspectRatio={aspectRatio}
        segments={segments}
        preset={activePreset}
        background={background}
        videoClips={videoClips}
        textLayers={textLayers}
        visualEffects={visualEffects}
      />

      {/* 개인정보처리방침 모달 */}
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {/* 사용방법 가이드 모달 */}
      <UserGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
      />

      {/* GitHub Releases 업데이트 알림 모달 */}
      <UpdateModal
        isOpen={showUpdateModal}
        isChecking={isCheckingUpdate}
        result={updateResult}
        onClose={() => setShowUpdateModal(false)}
        onRecheck={() => void runUpdateCheck()}
      />

      {/* 개발자 후원 모달 */}
      <SponsorModal
        isOpen={showSponsorModal}
        onClose={() => setShowSponsorModal(false)}
      />

      {/* 종료 전 저장 여부 확인 모달 */}
      {showCloseConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-xs text-slate-200 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100">프로젝트 저장</h3>
            <p className="mt-2 leading-relaxed text-slate-300">
              저장하지 않은 변경 사항이 있습니다. 앱을 종료하기 전에 현재 프로젝트를 저장하시겠습니까?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSavingBeforeClose}
                onClick={() => setShowCloseConfirmModal(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSavingBeforeClose}
                onClick={() => {
                  setShowCloseConfirmModal(false);
                  void window.electronAPI?.confirmWindowClose?.();
                }}
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
              >
                저장 안 함
              </button>
              <button
                type="button"
                disabled={isSavingBeforeClose}
                onClick={async () => {
                  setIsSavingBeforeClose(true);
                  try {
                    const saved = await handleSaveProject(false);
                    if (saved) {
                      setShowCloseConfirmModal(false);
                      await window.electronAPI?.confirmWindowClose?.();
                    }
                  } finally {
                    setIsSavingBeforeClose(false);
                  }
                }}
                className="rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {isSavingBeforeClose ? '저장 중...' : '저장 후 종료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
