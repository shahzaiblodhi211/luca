"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  onResize: (nextWidth: number) => void;
  getWidth: () => number;
  min: number;
  max: number;
  className?: string;
};

export function PanelResizer({
  onResize,
  getWidth,
  min,
  max,
  className,
}: Props) {
  const dragging = useRef(false);
  const [active, setActive] = useState(false);

  const clamp = useCallback(
    (w: number) => Math.min(max, Math.max(min, w)),
    [min, max],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      setActive(true);
      const startX = e.clientX;
      const startW = getWidth();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        onResize(clamp(startW + (ev.clientX - startX)));
      };

      const onUp = (ev: PointerEvent) => {
        dragging.current = false;
        setActive(false);
        target.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clamp, getWidth, onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
      className={cn(
        "group/resizer relative hidden w-2 shrink-0 lg:flex lg:items-center lg:justify-center",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-800 transition-colors",
          "group-hover/resizer:bg-zinc-600",
          active && "bg-zinc-500",
        )}
      />
      <div
        onPointerDown={onPointerDown}
        className="absolute inset-y-0 -left-2 z-10 w-5 cursor-col-resize touch-none"
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none relative z-20 h-9 w-1.5 rounded-full bg-zinc-500/90 opacity-0 shadow-sm transition-opacity",
          "group-hover/resizer:opacity-100",
          active && "opacity-100 bg-zinc-400",
        )}
      />
    </div>
  );
}
