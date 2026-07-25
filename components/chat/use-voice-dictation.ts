"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LIVE_VOICE_MODEL_ID } from "@/lib/live-voice-models";

const MAX_RECORD_MS = 2 * 60 * 1000;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type Options = {
  modelId?: string;
  getBaseText: () => string;
  onText: (text: string) => void;
  onError?: (message: string) => void;
};

export function useVoiceDictation({
  modelId = DEFAULT_LIVE_VOICE_MODEL_ID,
  getBaseText,
  onText,
  onError,
}: Options) {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waveAnalyser, setWaveAnalyser] = useState<AnalyserNode | null>(null);
  const listeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<{
    stream: MediaStream;
    recorder: MediaRecorder;
    chunks: Blob[];
  } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalsRef = useRef("");
  const baseRef = useRef("");
  const modelRef = useRef(modelId);
  modelRef.current = modelId;

  const cleanupAudio = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setWaveAnalyser(null);
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setElapsedMs(0);
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const finishMedia = useCallback(async () => {
    const active = mediaRef.current;
    mediaRef.current = null;
    if (!active) return null;
    const { stream, recorder, chunks } = active;
    await new Promise<void>((resolve) => {
      if (recorder.state === "inactive") {
        resolve();
        return;
      }
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
    for (const track of stream.getTracks()) track.stop();
    return new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < 256) return;
      setBusy(true);
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await fetch("/api/voice/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            mimeType: blob.type || "audio/webm",
            modelId: modelRef.current || DEFAULT_LIVE_VOICE_MODEL_ID,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          text?: string;
          error?: string;
        } | null;
        if (!res.ok) {
          onError?.(data?.error || "Transcription failed");
          return;
        }
        const transcript = data?.text?.trim();
        if (!transcript) return;
        const base = baseRef.current.trimEnd();
        onText(base ? `${base} ${transcript}` : transcript);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setBusy(false);
      }
    },
    [onError, onText],
  );

  const cancel = useCallback(async () => {
    listeningRef.current = false;
    setListening(false);
    stopRecognition();
    cleanupAudio();
    await finishMedia();
    onText(baseRef.current);
    finalsRef.current = "";
  }, [cleanupAudio, finishMedia, onText, stopRecognition]);

  const confirm = useCallback(async () => {
    if (!listeningRef.current && !busy) return;
    listeningRef.current = false;
    setListening(false);
    stopRecognition();
    cleanupAudio();
    const blob = await finishMedia();
    const spoken = finalsRef.current.trim();
    finalsRef.current = "";
    if (spoken) {
      const base = baseRef.current.trimEnd();
      onText(base ? `${base}${base.endsWith(" ") ? "" : " "}${spoken}` : spoken);
      return;
    }
    if (blob) await transcribeBlob(blob);
  }, [busy, cleanupAudio, finishMedia, onText, stopRecognition, transcribeBlob]);

  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const startRecorder = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    mediaRef.current = { stream, recorder, chunks };
    recorder.start(250);

    const ctx = new AudioContext();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.55;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    setWaveAnalyser(analyser);
  }, []);

  const start = useCallback(async () => {
    if (listeningRef.current || busy) return;
    baseRef.current = getBaseText();
    finalsRef.current = "";
    listeningRef.current = true;
    setListening(true);
    setElapsedMs(0);

    const started = Date.now();
    timerRef.current = setInterval(() => {
      const ms = Date.now() - started;
      setElapsedMs(ms);
      if (ms >= MAX_RECORD_MS) {
        void confirmRef.current();
      }
    }, 200);

    try {
      await startRecorder();
    } catch (err) {
      listeningRef.current = false;
      setListening(false);
      cleanupAudio();
      onError?.(
        err instanceof Error
          ? err.message
          : "Microphone permission denied",
      );
      return;
    }

    const SR = getSpeechRecognition();
    if (!SR) return;

    try {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang =
        typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
      rec.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const piece = ev.results[i]![0]!.transcript;
          if (ev.results[i]!.isFinal) {
            finalsRef.current = `${finalsRef.current}${piece}`.replace(
              /\s+/g,
              " ",
            );
          } else {
            interim += piece;
          }
        }
        const spoken = `${finalsRef.current}${interim}`.trim();
        const base = baseRef.current.trimEnd();
        onText(
          base ? `${base}${base.endsWith(" ") ? "" : " "}${spoken}` : spoken,
        );
      };
      rec.onerror = (ev) => {
        if (ev.error === "aborted" || ev.error === "no-speech") return;
        onError?.(ev.error || "Microphone error");
      };
      rec.onend = () => {
        if (listeningRef.current && recognitionRef.current === rec) {
          try {
            rec.start();
          } catch {
            /* ignore */
          }
        }
      };
      rec.start();
    } catch {
      /* Gemini transcribe on confirm */
    }
  }, [busy, cleanupAudio, getBaseText, onError, onText, startRecorder]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      stopRecognition();
      cleanupAudio();
      const active = mediaRef.current;
      mediaRef.current = null;
      if (active) {
        try {
          if (active.recorder.state !== "inactive") active.recorder.stop();
        } catch {
          /* ignore */
        }
        for (const track of active.stream.getTracks()) track.stop();
      }
    };
  }, [cleanupAudio, stopRecognition]);

  const recording = listening || busy;

  return {
    listening,
    busy,
    recording,
    elapsedMs,
    maxMs: MAX_RECORD_MS,
    waveAnalyser,
    start,
    cancel,
    confirm,
  };
}

export function formatVoiceTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
