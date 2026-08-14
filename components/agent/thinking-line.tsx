"use client";

import { Brain, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { formatThinkingText } from "@/lib/agent/format-thinking-text";
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
  const body = formatThinkingText(text.trim());
  const turnLive = Boolean(isStreaming);
  const thinkLive =
    thinkingActive ?? (turnLive && durationSec == null);
  const sec =
    durationSec != null ? Math.max(1, durationSec) : thinkLive ? null : 1;

  const [open, setOpen] = useState(thinkLive);
  const wasThinkLiveRef = useRef(thinkLive);

  // Open while reasoning streams; never re-open for the rest of the turn.
  useEffect(() => {
    if (thinkLive) setOpen(true);
  }, [thinkLive]);

  // Auto-collapse when thinking finishes (thinking_done / durationSec set).
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

  const showBody = open && (Boolean(body) || thinkLive || turnLive);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !showBody) {
      setFade({ top: false, bottom: false });
      return;
    }

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const overflow = scrollHeight > clientHeight + 2;
      setFade({
        top: overflow && scrollTop > 4,
        bottom: overflow && scrollTop + clientHeight < scrollHeight - 4,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [showBody, body, thinkLive]);

  const scrollClass = cn(
    "max-h-[250px] overflow-x-hidden overflow-y-auto overscroll-contain pl-1",
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
        <div className="relative max-h-[250px] py-3">
          {fade.top ? <div className={fadeTop} aria-hidden /> : null}
          {fade.bottom ? <div className={fadeBottom} aria-hidden /> : null}
          <div ref={scrollRef} className={cn("luca-thinking-scroll", scrollClass)}>
            <div className="border-l border-zinc-600/70 py-2 pl-3 pr-2 text-[13px] leading-[1.55] text-zinc-500">
              {body ? (
                <div className="whitespace-pre-wrap break-words">{body}</div>
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
