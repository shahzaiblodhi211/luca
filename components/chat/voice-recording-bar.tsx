"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatVoiceTimer } from "./use-voice-dictation";
import {
  barFillColor,
  createScrollBuffer,
  levelToBarHeight,
  SCROLL_WAVE_BARS,
  SCROLL_WAVE_MIN,
  scrollWaveIdle,
  scrollWaveStep,
} from "./voice-wave";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  analyser: AnalyserNode | null;
  elapsedMs: number;
  maxMs: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** ~28 bars per second travel along the strip */
const SCROLL_BARS_PER_SEC = 28;

export function VoiceRecordingBar({
  active,
  analyser,
  elapsedMs,
  maxMs,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bufferRef = useRef(createScrollBuffer());
  const smoothAmpRef = useRef({ value: SCROLL_WAVE_MIN });
  const lastTsRef = useRef(0);
  const scrollDebtRef = useRef(0);

  const paintBars = (levels: number[]) => {
    for (let i = 0; i < SCROLL_WAVE_BARS; i++) {
      const el = barRefs.current[i];
      const level = levels[i] ?? SCROLL_WAVE_MIN;
      if (el) {
        el.style.height = `${levelToBarHeight(level)}px`;
        el.style.backgroundColor = barFillColor(level);
      }
    }
  };

  useEffect(() => {
    if (!active || busy) return;

    let raf = 0;
    const tick = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      scrollDebtRef.current += dt * SCROLL_BARS_PER_SEC;
      const steps = Math.floor(scrollDebtRef.current);
      scrollDebtRef.current -= steps;

      const node = analyser;
      if (steps >= 1) {
        for (let s = 0; s < steps; s++) {
          bufferRef.current = node
            ? scrollWaveStep(node, bufferRef.current, smoothAmpRef.current)
            : scrollWaveIdle(bufferRef.current);
        }
      }

      paintBars(bufferRef.current);
      raf = requestAnimationFrame(tick);
    };

    lastTsRef.current = 0;
    scrollDebtRef.current = 0;
    bufferRef.current = createScrollBuffer();
    smoothAmpRef.current = { value: SCROLL_WAVE_MIN };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [active, analyser, busy]);

  useEffect(() => {
    if (!active && !busy) {
      bufferRef.current = createScrollBuffer();
      smoothAmpRef.current = { value: SCROLL_WAVE_MIN };
      paintBars(bufferRef.current);
    }
  }, [active, busy]);

  return (
    <div className="mt-1.5 flex h-9 min-h-9 w-full items-center gap-2">
      <span className="shrink-0 font-mono text-[13px] tabular-nums text-composer-muted">
        {formatVoiceTimer(elapsedMs)}{" "}
        <span className="text-zinc-600">/ {formatVoiceTimer(maxMs)}</span>
      </span>

      <div
        className="flex h-full min-w-0 flex-1 items-center gap-[2px]"
        aria-hidden
      >
        {Array.from({ length: SCROLL_WAVE_BARS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className={cn(
              "min-w-0 flex-1 basis-0 rounded-full will-change-[height]",
              busy && "opacity-50",
            )}
            style={{
              height: `${levelToBarHeight(SCROLL_WAVE_MIN)}px`,
              backgroundColor: barFillColor(SCROLL_WAVE_MIN),
            }}
          />
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-composer-icon transition-colors hover:bg-composer-icon-hover-bg hover:text-composer-icon-hover disabled:opacity-40"
          aria-label="Cancel recording"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
          aria-label="Use recording"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" strokeWidth={2.25} />
          )}
        </button>
      </div>
    </div>
  );
}
