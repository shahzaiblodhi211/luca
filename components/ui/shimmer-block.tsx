"use client";

import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/ai-elements/shimmer";

/** Animated block placeholder — use while content or previews load. */
export function ShimmerBlock({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        tone === "light" ? "bg-zinc-200/80" : "bg-zinc-900/90",
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "absolute inset-0",
          tone === "light" ? "luca-shimmer-sweep-light" : "luca-shimmer-sweep",
        )}
      />
    </div>
  );
}

/** Centered loading state with shimmer blocks + optional label. */
export function ShimmerLoader({
  label,
  className,
  compact,
}: {
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full max-w-xs flex-col gap-2",
          compact && "max-w-[10rem] gap-1.5",
        )}
      >
        <ShimmerBlock className={cn("h-2.5 rounded-full", compact && "h-2")} />
        <ShimmerBlock
          className={cn("h-2.5 w-4/5 rounded-full", compact && "h-2")}
        />
        {!compact ? (
          <ShimmerBlock className="h-2.5 w-3/5 rounded-full" />
        ) : null}
      </div>
      {label ? (
        <Shimmer className="text-xs text-zinc-500" duration={1.2}>
          {label}
        </Shimmer>
      ) : null}
    </div>
  );
}

/** Skeleton grid for project cards while the list loads. */
export function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-900/40">
      <ShimmerBlock className="aspect-[16/10] w-full" />
      <div className="flex items-center gap-2.5 border-t border-zinc-800/80 px-3 py-2.5">
        <ShimmerBlock className="h-5 w-5 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <ShimmerBlock className="h-3 w-2/3 rounded-full" />
          <ShimmerBlock className="h-2.5 w-1/2 rounded-full" />
        </div>
      </div>
    </div>
  );
}
