"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { value?: number }
>(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.min(100, Math.max(0, value))}
    className={cn(
      "relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800",
      className,
    )}
    {...props}
  >
    <div
      className="h-full rounded-full bg-emerald-500/90 transition-all duration-300"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
