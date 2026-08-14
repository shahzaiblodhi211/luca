"use client";

import { LucaMark } from "@/components/brand/logo";
import { ShimmerLoader } from "@/components/ui/shimmer-block";

/** Shown in the preview slot while Luca builds — server warms in the background. */
export function PreviewBuildingPlaceholder() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
      <LucaMark size="lg" />
      <ShimmerLoader
        label="Luca is building…"
        className="gap-2"
        compact
      />
      <p className="max-w-xs text-xs text-zinc-500">
        Preview prepares in the background. It will appear here as soon as Luca
        finishes.
      </p>
    </div>
  );
}
