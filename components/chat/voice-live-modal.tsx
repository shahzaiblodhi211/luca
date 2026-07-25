"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Mic, X } from "lucide-react";
import {
  LIVE_VOICE_MODELS,
  type LiveVoiceModel,
} from "@/lib/live-voice-models";
import { cn } from "@/lib/utils";

export type { LiveVoiceModel };

function QuotaCell({ label }: { label: string }) {
  return (
    <div className="flex min-w-[7.5rem] items-center gap-2.5">
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full w-0 rounded-full bg-zinc-600" />
      </div>
      <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-zinc-400">
        {label}
      </span>
    </div>
  );
}

type Props = {
  open: boolean;
  selectedId: string;
  onClose: () => void;
  onSelect: (model: LiveVoiceModel) => void;
};

export function VoiceLiveModal({
  open,
  selectedId,
  onClose,
  onSelect,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c0c0c]",
          "shadow-2xl animate-in fade-in zoom-in-95 duration-200",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-200">
              <Mic className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div>
              <h2
                id={titleId}
                className="text-base font-semibold tracking-tight text-zinc-50"
              >
                Voice · Live
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                Choose a Luca Live model for mic input.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-zinc-800/70 px-2 py-1 sm:px-3">
          {LIVE_VOICE_MODELS.map((model) => {
            const selected = model.id === selectedId;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onSelect(model)}
                className={cn(
                  "flex w-full flex-col gap-3 rounded-xl px-3 py-3.5 text-left transition-colors sm:flex-row sm:items-center sm:gap-6",
                  "hover:bg-zinc-900/80",
                  selected && "bg-zinc-900/60",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="truncate text-sm font-medium text-zinc-100">
                        {model.name}
                      </span>
                      <span className="shrink-0 text-[12px] text-zinc-500">
                        {model.kind}
                      </span>
                    </div>
                  </div>
                  {selected ? (
                    <Check className="hidden h-4 w-4 shrink-0 text-sky-400 sm:block" />
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:justify-end">
                  {model.quotas.map((q) => (
                    <QuotaCell key={`${model.id}-${q}`} label={q} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-zinc-800/80 px-5 py-3 sm:px-6">
          <p className="text-[12px] text-zinc-600">
            Default is Luca Live Dialog. Hold the mic button to change model.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
