import { env, pipeline } from '@huggingface/transformers';

// 브라우저/Electron 렌더러 Web Worker 환경에서는 WASM 백엔드를 사용하여
// Electron 메인 프로세스의 onnxruntime-node V8 샌드박스 충돌(SIGTRAP) 및
// WebGPU Whisper 동적 텐서 멈춤 현상을 회피합니다.
env.allowLocalModels = false;
env.useBrowserCache = true;

let cachedPipeline: { dispose?: () => Promise<void> } | null = null;
let cachedModelId: string | null = null;

interface WorkerRequest {
  type: 'transcribe';
  pcm16k: Float32Array;
  modelId: string;
  language: string;
}

async function hasWebGPU(): Promise<boolean> {
  try {
    const nav = self.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    };
    if (!nav?.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

const WORKER_HALLUCINATION_REGEX =
  /^(?:감사합니다\.?|시청해\s*주셔서\s*감사합니다\.?|구독\s*(?:과|와|및|\/|,)?\s*좋아요.*|좋아요\s*(?:과|와|및|\/|,)?\s*구독.*|mbc\s*뉴스.*|kbs\s*뉴스.*|sbs\s*뉴스.*|이\s*시각.*|자막.*|번역.*|음악|노래|박수|환호|간주|전주|thank\s*you\.?|thanks\s*for\s*watching\.?|[♪♫♩♬\s.]+)$/i;

function isWorkerHallucination(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // [끝까지, [둘의 요리가, [두 번째 요리], (음악) 등 괄호로 시작하는 유튜브 자막 태그 환각 차단
  if (/^[\[\(]/.test(t)) return true;
  const unwrapped = t.replace(/^[\[\(\<]+|[\]\)\>]+$/g, '').trim();
  return WORKER_HALLUCINATION_REGEX.test(t) || WORKER_HALLUCINATION_REGEX.test(unwrapped);
}

function formatMinSec(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function formatWorkerError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/^\d+$/.test(raw.trim())) {
    return `WebAssembly 메모리 한도 초과 (코드: ${raw}). 더 가벼운 모델(whisper-base 또는 whisper-small)을 선택해 주세요.`;
  }
  return raw;
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { type, pcm16k, modelId, language } = event.data;
  if (type !== 'transcribe') return;

  const postProgress = (status: string, message: string, progress?: number) => {
    self.postMessage({ type: 'progress', status, message, progress });
  };

  try {
    if (!cachedPipeline || cachedModelId !== modelId) {
      if (cachedPipeline?.dispose) {
        await cachedPipeline.dispose().catch(() => {});
        cachedPipeline = null;
        cachedModelId = null;
      }

      const isHeavyModel = /medium|large/i.test(modelId);
      const preferredDtype = isHeavyModel ? 'q4' : 'q8';
      const canUseWebGpu = isHeavyModel && (await hasWebGPU());
      const preferredDevice = canUseWebGpu ? 'webgpu' : 'wasm';

      postProgress(
        'downloading',
        `로컬 Whisper 모델(${modelId} · ${preferredDtype.toUpperCase()} · ${preferredDevice.toUpperCase()}) 준비 중...`,
        0
      );

      const createPipeline = pipeline as unknown as (
        task: string,
        model: string,
        opts: Record<string, unknown>
      ) => Promise<{ dispose?: () => Promise<void> }>;

      const loadOpts = (device: 'webgpu' | 'wasm') => ({
        dtype: preferredDtype,
        device,
        progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
          if (info.status === 'progress' && typeof info.progress === 'number') {
            postProgress(
              'downloading',
              `모델 다운로드 중: ${info.file ?? ''} (${Math.round(info.progress)}%)`,
              info.progress
            );
          }
        },
      });

      if (canUseWebGpu) {
        try {
          cachedPipeline = await createPipeline('automatic-speech-recognition', modelId, loadOpts('webgpu'));
        } catch {
          cachedPipeline = await createPipeline('automatic-speech-recognition', modelId, loadOpts('wasm'));
        }
      } else {
        cachedPipeline = await createPipeline('automatic-speech-recognition', modelId, loadOpts('wasm'));
      }

      cachedModelId = modelId;
    }

    const transcriber = cachedPipeline as unknown as (
      audio: Float32Array,
      options: Record<string, unknown>
    ) => Promise<{
      text: string;
      chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
    }>;

    // 적응형 슬라이딩 윈도우:
    // - 반주/환각 구간에서는 1초씩 전진해 정확한 보컬 진입점(예: 17초)을 놓치지 않음
    // - 유효 가사가 인식되면 마지막 인식 종료 지점(-1.5초)으로 바로 점프해 빠르게 진행
    const SAMPLE_RATE = 16000;
    const WINDOW_SEC = 28;
    const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SEC;
    const totalDurationSec = pcm16k.length / SAMPLE_RATE;

    const allChunks: Array<{ text: string; timestamp: [number, number | null] }> = [];
    const allTexts: string[] = [];

    let cursorSec = 0;
    while (cursorSec < totalDurationSec - 0.8) {
      const startSample = Math.floor(cursorSec * SAMPLE_RATE);
      const endSample = Math.min(pcm16k.length, startSample + WINDOW_SAMPLES);
      const slice = pcm16k.subarray(startSample, endSample);
      const offsetSec = startSample / SAMPLE_RATE;
      const windowEndSec = endSample / SAMPLE_RATE;
      const pct = Math.min(99, Math.round((cursorSec / Math.max(1, totalDurationSec)) * 100));

      postProgress(
        'transcribing',
        `가사 음성 분석 중: ${formatMinSec(cursorSec)} / ${formatMinSec(totalDurationSec)} (${pct}%)`,
        pct
      );

      // 디지털 무음(피크 < 0.002) 구간만 건너뜀
      let slicePeak = 0;
      for (let i = 0; i < slice.length; i += 64) {
        const v = Math.abs(slice[i]);
        if (v > slicePeak) slicePeak = v;
      }
      if (slicePeak < 0.002) {
        cursorSec += 2;
        continue;
      }

      const output = await transcriber(slice, {
        return_timestamps: true,
        language,
        task: 'transcribe',
        condition_on_prev_text: false,
        no_repeat_ngram_size: 3,
      });

      const rawChunks =
        output.chunks && output.chunks.length > 0
          ? output.chunks
          : output.text?.trim()
            ? [{ text: output.text.trim(), timestamp: [0, windowEndSec - offsetSec] as [number, number] }]
            : [];

      const validInWindow = rawChunks.filter((c) => !isWorkerHallucination(c.text));

      // 유효 가사가 없고 환각/무음만 나왔으면 1초 전진해 다음 보컬 시작점을 정밀 탐색
      if (validInWindow.length === 0) {
        cursorSec += 1;
        continue;
      }

      let maxValidEnd = offsetSec;
      for (const c of validInWindow) {
        const s = (c.timestamp?.[0] ?? 0) + offsetSec;
        const rawE = c.timestamp?.[1];
        const e =
          rawE !== null && rawE !== undefined && rawE > (c.timestamp?.[0] ?? 0)
            ? rawE + offsetSec
            : null;
        const sRounded = Number(s.toFixed(2));
        const eRounded = e !== null ? Number(e.toFixed(2)) : null;
        const effEnd = eRounded ?? sRounded + 0.8;

        if (effEnd > maxValidEnd) maxValidEnd = effEnd;

        const isDuplicate = allChunks.some((prev) => {
          const prevEnd = prev.timestamp[1] ?? prev.timestamp[0] + 0.8;
          const overlap = Math.min(effEnd, prevEnd) - Math.max(sRounded, prev.timestamp[0]);
          if (overlap <= 0) return false;
          const minDur = Math.max(0.2, Math.min(effEnd - sRounded, prevEnd - prev.timestamp[0]));
          return overlap / minDur > 0.5;
        });
        if (!isDuplicate) {
          allChunks.push({
            text: c.text.trim(),
            timestamp: [sRounded, eRounded],
          });
          allTexts.push(c.text.trim());
        }
      }

      cursorSec = Math.max(cursorSec + 1.5, maxValidEnd - 1.5);
    }

    postProgress('done', '로컬 Whisper 분석 완료 (100%)', 100);
    self.postMessage({
      type: 'result',
      text: allTexts.join(' '),
      chunks: allChunks,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: formatWorkerError(err) });
  }
});
