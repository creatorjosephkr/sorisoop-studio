/**
 * Web Audio AudioBuffer를 로컬 Whisper 입력 규격(16kHz Mono Float32Array)으로 변환합니다.
 * 과도한 컴프레서나 대역 절단 없이 초저역(100Hz 이하 킥/베이스 럼블)만 가볍게 정리해
 * Whisper 멜 스펙트로그램(0~8kHz)이 보컬 자음/모음을 자연스럽게 인식하도록 유지합니다.
 */
export async function audioBufferTo16kMono(
  audioBuffer: AudioBuffer,
  emphasizeVocals = true
): Promise<Float32Array> {
  const targetSampleRate = 16000;
  const length = Math.ceil(audioBuffer.duration * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(1, length, targetSampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  if (emphasizeVocals) {
    const highpass = offlineCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 100;

    source.connect(highpass);
    highpass.connect(offlineCtx.destination);
  } else {
    source.connect(offlineCtx.destination);
  }

  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

/**
 * 파형 캔버스 렌더링을 위한 채널 피크 배열을 추출합니다.
 */
export function extractWaveformPeaks(audioBuffer: AudioBuffer, bucketCount = 1200): Float32Array {
  const channelData = audioBuffer.getChannelData(0);
  const peaks = new Float32Array(bucketCount);
  const step = Math.max(1, Math.floor(channelData.length / bucketCount));

  for (let i = 0; i < bucketCount; i++) {
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    let maxAbs = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j]);
      if (val > maxAbs) maxAbs = val;
    }
    peaks[i] = maxAbs;
  }
  return peaks;
}

/**
 * MP4 오프라인 렌더링 및 정지 상태 프리뷰를 위해 특정 시점의 오디오 스펙트럼 빈(0~1)을 추출합니다.
 */
export function computeSpectrumFromBuffer(
  audioBuffer: AudioBuffer | null,
  timeSec: number,
  binCount = 48
): Uint8Array {
  const bins = new Uint8Array(binCount);
  if (!audioBuffer) return bins;

  const sampleRate = audioBuffer.sampleRate;
  const channel = audioBuffer.getChannelData(0);
  const windowSize = 1024;
  const centerSample = Math.floor(timeSec * sampleRate);
  const start = Math.max(0, Math.min(channel.length - windowSize, centerSample - windowSize / 2));
  if (start < 0 || start + windowSize > channel.length) return bins;

  const samplesPerBin = Math.max(1, Math.floor(windowSize / binCount));
  for (let b = 0; b < binCount; b++) {
    let peak = 0;
    let rmsSum = 0;
    const bStart = start + b * samplesPerBin;
    for (let i = 0; i < samplesPerBin; i++) {
      const v = Math.abs(channel[bStart + i]);
      if (v > peak) peak = v;
      rmsSum += v * v;
    }
    const rms = Math.sqrt(rmsSum / samplesPerBin);
    const val = Math.min(255, Math.round((rms * 1.8 + peak * 0.4) * 255));
    bins[b] = val;
  }
  return bins;
}

/**
 * 아날로그 오실로스코프 파형 렌더링을 위해 특정 시점의 실제 시간 영역 PCM 샘플(-1 ~ 1)을 추출합니다.
 */
export function extractTimeDomainSlice(
  audioBuffer: AudioBuffer | null,
  timeSec: number,
  sampleCount = 160
): Float32Array {
  const out = new Float32Array(sampleCount);
  if (!audioBuffer) return out;

  const channel = audioBuffer.getChannelData(0);
  const centerSample = Math.floor(timeSec * audioBuffer.sampleRate);
  const span = 1024;
  const start = Math.max(0, Math.min(channel.length - span, centerSample - span / 2));
  if (start < 0 || start + span > channel.length) return out;

  const step = Math.max(1, Math.floor(span / sampleCount));
  for (let i = 0; i < sampleCount; i++) {
    out[i] = channel[start + i * step] ?? 0;
  }
  return out;
}
