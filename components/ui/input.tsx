import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-zinc-700/80 bg-zinc-950 px-3.5 text-sm text-zinc-100 shadow-sm outline-none transition",
          "placeholder:text-zinc-500",
          "focus-visible:border-zinc-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
