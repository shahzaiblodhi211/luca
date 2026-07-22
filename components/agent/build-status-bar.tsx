"use client";

import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Terse v0-style footer: action + file count + line delta + retry. */
export function BuildStatusBar({
  action,
  filesChanged,
  linesDelta,
  onRetry,
  className,
}: {
  action: string;
  filesChanged: number;
  linesDelta: number;
  onRetry?: () => void;
  className?: string;
}) {
  if (filesChanged <= 0) return null;
  const deltaLabel =
    linesDelta === 0
      ? null
      : linesDelta > 0
        ? `+${linesDelta}`
        : `${linesDelta}`;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5 text-xs text-zinc-300",
        className,
      )}
    >
      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span className="font-medium text-zinc-200">{action}</span>
      <span className="text-zinc-500">
        {filesChanged} file{filesChanged === 1 ? "" : "s"}
      </span>
      {deltaLabel ? (
        <span
          className={cn(
            "tabular-nums",
            linesDelta >= 0 ? "text-emerald-600" : "text-rose-500",
          )}
        >
          {deltaLabel}
        </span>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          title="Retry"
          className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="ml-auto" />
      )}
    </div>
  );
}
