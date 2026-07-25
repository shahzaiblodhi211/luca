/** Full-width scrolling waveform (v0-style traveling bump). */
export const SCROLL_WAVE_BARS = 96;

const MIN = 0.07;
const MIN_PX = 3;
const MAX_PX = 22;

export function createScrollBuffer(): number[] {
  return Array.from({ length: SCROLL_WAVE_BARS }, () => MIN);
}

export function levelToBarHeight(level: number): number {
  return Math.round(MIN_PX + level * (MAX_PX - MIN_PX));
}

/** Shift buffer left; append one sample from live mic amplitude. */
export function scrollWaveStep(
  analyser: AnalyserNode,
  buffer: number[],
  smoothAmp: { value: number },
): number[] {
  const time = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(time);

  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < time.length; i++) {
    const n = Math.abs((time[i]! - 128) / 128);
    if (n > peak) peak = n;
    sumSq += n * n;
  }
  const rms = Math.sqrt(sumSq / time.length);

  let amp = Math.max(rms * 2.1, peak * 1.05);
  amp = Math.min(1, amp * 1.35);
  if (amp < 0.028) {
    amp = MIN;
  } else {
    amp = Math.min(1, Math.max(MIN, Math.pow(amp, 0.82)));
  }

  const follow = amp > smoothAmp.value ? 0.62 : 0.28;
  smoothAmp.value += (amp - smoothAmp.value) * follow;
  const sample = smoothAmp.value;

  const next = buffer.slice(1);
  next.push(sample);
  return next;
}

/** Idle scroll: keeps the line moving with tiny dots when silent. */
export function scrollWaveIdle(buffer: number[]): number[] {
  const next = buffer.slice(1);
  next.push(MIN);
  return next;
}

export const SCROLL_WAVE_MIN = MIN;

/** Same as submit: emerald-600. Silent bars stay grey — no blended in-between. */
export const WAVE_COLOR_IDLE = "#52525b";
export const WAVE_COLOR_ACTIVE = "#059669";

export function barFillColor(level: number): string {
  if (level <= MIN + 0.02) return WAVE_COLOR_IDLE;
  return WAVE_COLOR_ACTIVE;
}
