"use client";

import { Brain, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

/** Collapsible reasoning row — brain when closed, chevron when open (v0-style). */
const AUTO_CLOSE_MS = 1000;

export function ThinkingLine({
  text = "",
  durationSec,
  isStreaming,
  /** When false while `isStreaming`, show “Thought for Ns” (thinking segment done). */
  thinkingActive,
}: {
  text?: string;
  durationSec?: number;
  isStreaming?: boolean;
  thinkingActive?: boolean;
}) {
  const body = text.trim();
  const turnLive = Boolean(isStreaming);
  const thinkLive =
    thinkingActive ?? (turnLive && durationSec == null);
  const sec =
    durationSec != null ? Math.max(1, durationSec) : thinkLive ? null : 1;

  const [open, setOpen] = useState(thinkLive || turnLive || Boolean(body));
  const wasTurnLiveRef = useRef(false);
  const wasThinkLiveRef = useRef(false);

  useEffect(() => {
    if (thinkLive || turnLive) setOpen(true);
  }, [thinkLive, turnLive]);

  useEffect(() => {
    if (thinkLive) {
      wasThinkLiveRef.current = true;
      return;
    }
    if (!wasThinkLiveRef.current) return;
    wasThinkLiveRef.current = false;
    const timer = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [thinkLive]);

  useEffect(() => {
    if (turnLive) {
      wasTurnLiveRef.current = true;
      return;
    }
    if (!wasTurnLiveRef.current) return;
    wasTurnLiveRef.current = false;
    const timer = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [turnLive]);

  const showBody = open && (Boolean(body) || thinkLive || turnLive);

  const scrollClass = cn(
    "h-full overflow-x-hidden overflow-y-auto overscroll-contain pl-1",
  );

  const fadeTop = cn(
    "pointer-events-none absolute inset-x-0 top-0 z-10 h-12",
    "bg-gradient-to-b from-background via-background/70 to-transparent",
  );

  const fadeBottom = cn(
    "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12",
    "bg-gradient-to-t from-background via-background/70 to-transparent",
  );

  return (
    <div className="not-prose text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-0.5 text-left text-zinc-500 transition-colors hover:text-zinc-400"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        ) : (
          <Brain className="h-4 w-4 shrink-0 opacity-70" />
        )}
        {thinkLive ? (
          <Shimmer className="text-sm" duration={1}>
            Thinking…
          </Shimmer>
        ) : (
          <span className="text-sm tabular-nums">Thought for {sec}s</span>
        )}
      </button>

      {showBody ? (
        <div
          className={cn(
            "relative h-[250px] min-h-[250px] max-h-[250px] overflow-hidden py-3",
          )}
        >
          <div className={fadeTop} aria-hidden />
          <div className={fadeBottom} aria-hidden />
          <div className={cn("luca-thinking-scroll", scrollClass)}>
            <div className="border-l border-zinc-600/70 py-3 pl-3 pr-2 text-[13px] leading-[1.55] text-zinc-500">
              {body ? (
                <div className="whitespace-pre-wrap break-words">{text}</div>
              ) : (
                <span className="text-zinc-600/70">…</span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
